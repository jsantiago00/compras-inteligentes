// Promos bancarias publicadas por los propios súper, normalizadas al esquema
// de promo de la app (ver CLAUDE.md) y filtradas a los medios del usuario.
//
// Fuentes (verificadas el 11/10/2026; son las que usan las páginas de
// "descuentos por banco" de cada sitio):
// - Jumbo y Vea (Cencosud, un solo JSON para los dos y Disco):
//   GET https://www.jumbo.com.ar/api/dataentities/JN/documents/bankDiscount?_fields=value,id&an=jumboargentina
//   `value` es un JSON con [{ banks, days (0=domingo), discount, discountText,
//   installmentsText, dateStart, dateEnd (epoch), info, legals, websites }].
//   `discount` es el % o, si el texto dice "cuotas sin interés", la cantidad de cuotas.
// - Carrefour: GET https://www.carrefour.com.ar/api/dataentities/BP/search (promos)
//   y /api/dataentities/FB/search (bancos: idBank → nombre). Cada promo trae
//   discount_percentage, monday..sunday, active_from/active_to, ecommerce
//   (vale online), title, sub_title y legal.
//
// Pure: sin I/O. El server baja los datos (api/promos.js) y llama a estas funciones.

import { bancosEnTexto, BILLETERAS } from './medios.js';
import { isoLocal } from './motor/fechas.js';

export const FUENTES_SUPER = {
  jumbo: 'https://www.jumbo.com.ar/descuentos-del-dia?type=por-banco',
  vea: 'https://www.vea.com.ar/descuentos-del-dia?type=por-banco',
  carrefour: 'https://www.carrefour.com.ar/descuentos-bancarios',
};
const CUENTAS_CENCOSUD = { jumboargentina: 'jumbo', veaargentina: 'vea' };
const DIAS_CARREFOUR = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const plano = (s) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const sinAcentos = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const pesos = (s) => Number(String(s).replace(/\./g, '').replace(',', '.'));

// Beneficios que dependen de algo que la app no sabe del usuario.
const CONDICION_PERSONAL = /jubilad|pensionad|mayores de 60|empleado|club |anses|cencopay|mi carrefour|ciudadania/;

function hash(s) {
  let h = 5381;
  for (const c of s) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  return h.toString(36);
}

/** Lo que se puede leer del texto de las bases: tope, mínimo, tipo y canal. */
export function condicionesDeTexto(texto) {
  const t = sinAcentos(texto.toLowerCase());
  const tope = t.match(/tope[^$\d]{0,60}\$\s?([\d.,]+)([^.$]{0,80})/);
  const minimo =
    t.match(/(?:iguales? o superior(?:es)? a|mayor(?:es)? (?:o iguales? )?a|a partir de|minimo de compra(?: de)?|compra minima(?: de)?)\s*\$\s?([\d.,]+)/) ?? null;
  const periodo = tope?.[2] ?? '';
  return {
    tope: /sin tope/.test(t) || !tope ? null : pesos(tope[1]),
    tipoTope: !tope || /sin tope/.test(t) ? 'por_compra' : /\bmes\b|mensual/.test(periodo) ? 'mensual' : /semana/.test(periodo) ? 'semanal' : 'por_compra',
    minimoCompra: minimo ? pesos(minimo[1]) : null,
    // "En el acto" = descuento en caja; si no, el banco lo devuelve después.
    tipo: /en el acto|en caja|en la linea de caja/.test(t) ? 'descuento_caja' : /reintegro|devolucion|devuelve/.test(t) ? 'reintegro' : 'descuento_caja',
    soloPresencial:
      /exclusiv[oa] (?:para )?compras? presencial|no aplica (?:para )?(?:comprar|compras) online|no valido para compras en www|solo (?:en )?(?:local|sucursal)/.test(t) &&
      !/presencial como online|compras online en/.test(t),
    excluyeCarne: /carniceria|carnes?\b/.test(t) && /(?:excluye|no incluye|quedan excluidos)/.test(t),
    excluyeElectro: /electro/.test(t) && /(?:excluye|no incluye|quedan excluidos)/.test(t),
  };
}

/**
 * A qué medios aplica (ids de lib/medios.js), según el banco y el texto.
 * MODO: los bancos que listan las bases ("Bancos que aplicaran para MODO: …")
 * o, si no listan, cualquier banco ("modo_*").
 */
export function mediosAplicables(banco, texto) {
  const b = sinAcentos(String(banco ?? '').toLowerCase());
  const t = sinAcentos(texto.toLowerCase());
  // Tarjetas del banco nombradas en el texto (si no nombra ninguna: Visa y Mastercard).
  const tarjetas = (k) => {
    const ts = [/\bvisa\b/.test(t) && 'visa', /master/.test(t) && 'master', /american express|\bamex\b/.test(t) && 'amex'].filter(Boolean);
    return (ts.length ? ts : ['visa', 'master']).map((x) => `${x}_${k}`);
  };
  if (/todos los medios de pago|cualquier medio de pago/.test(t) && !b) return ['todos'];
  if (/\bmodo\b/.test(b)) {
    const lista = t.match(/bancos que aplica\w*[^:]*:([^.]*)/)?.[1];
    return lista ? bancosEnTexto(lista).map((k) => `modo_${k}`) : ['modo_*'];
  }
  const [k] = bancosEnTexto(b);
  if (k) return /\bmodo\b|bna\+/.test(t) ? [`modo_${k}`] : tarjetas(k);
  for (const [id, w] of Object.entries(BILLETERAS)) if (w.alias.test(b)) return [id];
  return [];
}

function armar({ sup, origen, idFuente, medio, porcentaje, dias, desde, hasta, texto, titulo, online }) {
  const c = condicionesDeTexto(texto);
  const rubrosExcluidos = [c.excluyeCarne && 'Carne', c.excluyeElectro && 'Electro'].filter(Boolean);
  return {
    id: `${sup}-${origen}-${idFuente}-${medio}`,
    super: sup,
    medio,
    dias: dias.length ? dias : [0, 1, 2, 3, 4, 5, 6],
    porcentaje,
    tope: c.tope,
    tipoTope: c.tipoTope,
    tipo: c.tipo,
    minimoCompra: c.minimoCompra,
    vigenciaDesde: desde,
    vigenciaHasta: hasta,
    rubrosExcluidos,
    soloPresencial: online === false || c.soloPresencial,
    notas: titulo,
    fuente: FUENTES_SUPER[sup],
    textoFuente: texto.slice(0, 900),
    confianza: 'oficial (sitio del súper)',
    origenSuper: true,
  };
}

/** Fecha local (Argentina) de un epoch en segundos; `fin` = el día anterior a un tope exclusivo. */
function isoDeEpoch(seg, { fin = false } = {}) {
  const ms = Number(seg) * 1000 - (fin ? 1000 : 0) - 3 * 3600_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Promos de Jumbo y Vea desde el JSON de Cencosud. */
export function promosCencosud(feed, { hoy = isoLocal() } = {}) {
  const out = [];
  for (const p of Array.isArray(feed) ? feed : []) {
    const desde = isoDeEpoch(p.dateStart);
    const hasta = isoDeEpoch(p.dateEnd, { fin: true });
    if (hasta < hoy) continue;
    if (/cuotas? sin inter/i.test(`${p.discountText ?? ''} ${p.installmentsText ?? ''}`)) continue;
    const porcentaje = Number(p.discount);
    if (!(porcentaje > 0 && porcentaje < 100)) continue;
    const texto = plano(`${p.info ?? ''} ${p.legals ?? ''}`);
    if (CONDICION_PERSONAL.test(sinAcentos(texto.toLowerCase()))) continue;
    const banco = (p.banks ?? []).map((b) => b.name).join(' ');
    const medios = mediosAplicables(banco, texto);
    if (!medios.length) continue;
    const supers = [...new Set((p.websites ?? []).map((w) => CUENTAS_CENCOSUD[w]).filter(Boolean))];
    const dias = [...new Set((p.days ?? []).map(Number).filter((d) => d >= 0 && d <= 6))].sort();
    const idFuente = hash(`${banco}|${p.discount}|${p.days}|${p.dateStart}`);
    const titulo = `${porcentaje}% ${banco.trim()}: ${plano(p.info).slice(0, 160)}`;
    for (const sup of supers) for (const medio of medios) out.push(armar({ sup, origen: 'cencosud', idFuente, medio, porcentaje, dias, desde, hasta, texto, titulo }));
  }
  return out;
}

/** Promos de Carrefour desde su Master Data (BP + bancos FB). */
export function promosCarrefour(promos, bancos, { hoy = isoLocal() } = {}) {
  const nombre = Object.fromEntries((bancos ?? []).map((b) => [b.id, b.name]));
  const out = [];
  for (const p of Array.isArray(promos) ? promos : []) {
    if (!p.active || !p.discount_percentage) continue;
    const desde = String(p.active_from ?? '').slice(0, 10) || null;
    // active_to es el primer día sin promo (ej. 2026-11-01 para "octubre").
    const finExclusivo = String(p.active_to ?? '').slice(0, 10);
    const hasta = finExclusivo ? new Date(Date.parse(finExclusivo) - 86400_000).toISOString().slice(0, 10) : null;
    if (hasta && hasta < hoy) continue;
    const texto = plano(`${p.title ?? ''}. ${p.sub_title ?? ''}. ${p.legal ?? ''}`);
    // Cuenta Digital de Carrefour Banco: medio opcional del usuario (ver lib/constantes.js).
    if (CONDICION_PERSONAL.test(sinAcentos(texto.toLowerCase())) && !/todos los medios de pago/i.test(p.title ?? '')) continue;
    const banco = nombre[p.idBank] ?? '';
    // Medios de Carrefour Banco (los nombra el título).
    const propios = [/cuenta digital de carrefour banco/i.test(p.title ?? '') && 'cuenta_carrefour', /tarjeta de cr[eé]dito (?:de )?carrefour banco/i.test(p.title ?? '') && 'tarjeta_carrefour'].filter(Boolean);
    const medios = propios.length ? propios : mediosAplicables(banco.replace(/_/g, ' '), texto);
    if (!medios.length) continue;
    const dias = DIAS_CARREFOUR.map((d, i) => (p[d] ? i : -1)).filter((i) => i >= 0);
    for (const medio of medios) {
      const promo = armar({ sup: 'carrefour', origen: 'bp', idFuente: p.id.slice(0, 8), medio, porcentaje: Number(p.discount_percentage), dias, desde, hasta, texto, titulo: plano(`${p.title}. ${p.sub_title ?? ''}`), online: p.ecommerce !== false });
      if (medio === 'cuenta_carrefour') promo.condicion = 'Solo si tenés la Cuenta Digital de Carrefour Banco (es una cuenta del banco, no el usuario de carrefour.com.ar). Pagás con esa cuenta.';
      out.push(promo);
    }
  }
  return out;
}

// Coto: GET https://www.coto.com.ar/rest/model/atg/actors/cProfileActor/getPromocionesMulticanal?enviroment=ag
// (lo que usa www.coto.com.ar/descuentos). Trae `promocionesDigitales` (online)
// y `promocionesSucursalesFisicas` (solo en el local), cada una con banco
// (código: 25 Nación, 47 Macro, 0 sin banco), textoDescuento ("15% DE DESCUENTO"
// o "6 CUOTAS SIN INTERÉS"), dias (id 1 = domingo … 7 = sábado), descripcion
// y observacion. Verificado el 12/10/2026.
FUENTES_SUPER.coto = 'https://www.coto.com.ar/descuentos';
// Códigos de banco de Coto (según el ícono de cada uno; 8 Tarjeta Coto y 58 Amex quedan afuera).
const BANCOS_COTO = { 0: '', 5: 'ICBC', 6: 'BBVA', 11: 'Galicia', 16: 'Banco Ciudad', 17: 'Comafi', 20: 'Patagonia', 25: 'Banco Nación', 35: 'Credicoop', 47: 'Banco Macro', 49: 'Columbia', 62: 'Supervielle', 74: 'Mercado Pago', 76: 'Naranja X' };

/** Programas del súper que el usuario puede tener (la promo se muestra aclarándolo). */
const PROGRAMAS = [[/comunidad/i, 'Solo si sos miembro de Comunidad Coto (es gratis, se hace en coto.com.ar).']];

export function promosCoto(respuesta, { hoy = isoLocal() } = {}) {
  const r = respuesta?.result ?? respuesta ?? {};
  const out = [];
  const listas = [
    [r.promocionesDigitales ?? [], true],
    [r.promocionesSucursalesFisicas ?? [], false],
  ];
  for (const [lista, online] of listas) {
    for (const p of lista) {
      const porcentaje = Number(String(p.textoDescuento ?? '').match(/(\d{1,2})\s*%/)?.[1]);
      if (!porcentaje) continue; // cuotas sin interés
      if (!(p.banco in BANCOS_COTO)) continue; // otros bancos
      if (/anses|jubilad|ciudadania/i.test(p.icono ?? '')) continue;
      const texto = plano(`${p.textoDescuento}. ${p.descripcion ?? ''}. ${p.observacion ?? ''}`);
      const programa = PROGRAMAS.find(([re]) => re.test(`${p.icono} ${texto}`));
      if (!programa && CONDICION_PERSONAL.test(sinAcentos(texto.toLowerCase()))) continue;
      const banco = BANCOS_COTO[p.banco] || (/mercadopago/i.test(p.icono ?? '') ? 'Mercado Pago' : /\bmodo\b/i.test(texto) ? 'MODO' : '');
      const medios = mediosAplicables(banco, texto);
      if (!medios.length) continue;
      const dias = [...new Set((p.dias ?? []).map((d) => Number(d.id) - 1).filter((d) => d >= 0 && d <= 6))].sort();
      const vig = texto.match(/del (\d{2})\/(\d{2})(?:\/(\d{4}))? al (\d{2})\/(\d{2})\/(\d{4})/i);
      const desde = vig ? `${vig[3] ?? vig[6]}-${vig[2]}-${vig[1]}` : null;
      const hasta = vig ? `${vig[6]}-${vig[5]}-${vig[4]}` : null;
      if (hasta && hasta < hoy) continue;
      for (const medio of medios) {
        const promo = armar({ sup: 'coto', origen: online ? 'dig' : 'suc', idFuente: String(p.id), medio, porcentaje, dias, desde, hasta, texto, titulo: plano(`${p.textoDescuento} ${p.descripcion ?? ''}`), online });
        if (programa) promo.condicion = programa[1];
        out.push(promo);
      }
    }
  }
  return out;
}
