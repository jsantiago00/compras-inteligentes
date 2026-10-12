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
const CONDICION_PERSONAL = /jubilad|pensionad|mayores de 60|empleado|club |anses|cuenta dni|carrefour banco|cencopay|mi carrefour|tarjeta carrefour/;

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
 * A qué medios del usuario aplica, según el banco y el texto.
 * MODO: todos los bancos adheridos (BNA y Macro incluidos), salvo que las
 * bases listen bancos y no estén.
 */
export function mediosAplicables(banco, texto) {
  const b = sinAcentos(String(banco ?? '').toLowerCase());
  const t = sinAcentos(texto.toLowerCase());
  const visaMaster = (pref) => {
    const v = /\bvisa\b/.test(t);
    const m = /master/.test(t);
    return v || m ? [v && `visa_${pref}`, m && `master_${pref}`].filter(Boolean) : [`visa_${pref}`, `master_${pref}`];
  };
  if (/todos los medios de pago|cualquier medio de pago/.test(t) && !b) return ['todos'];
  if (/\bmodo\b/.test(b)) {
    const lista = t.match(/bancos que aplica\w*[^:]*:([^.]*)/)?.[1];
    if (!lista) return ['modo_bna', 'modo_macro'];
    return [/\bbna\b|nacion/.test(lista) && 'modo_bna', /macro/.test(lista) && 'modo_macro'].filter(Boolean);
  }
  if (/nacion|\bbna\b/.test(b)) return /\bmodo\b|bna\+/.test(t) ? ['modo_bna'] : visaMaster('bna');
  if (/macro/.test(b)) return /\bmodo\b/.test(t) ? ['modo_macro'] : visaMaster('macro');
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
    if (CONDICION_PERSONAL.test(sinAcentos(texto.toLowerCase())) && !/todos los medios de pago/i.test(p.title ?? '')) continue;
    const banco = nombre[p.idBank] ?? '';
    const medios = mediosAplicables(banco.replace(/_/g, ' '), texto);
    if (!medios.length) continue;
    const dias = DIAS_CARREFOUR.map((d, i) => (p[d] ? i : -1)).filter((i) => i >= 0);
    for (const medio of medios) {
      out.push(armar({ sup: 'carrefour', origen: 'bp', idFuente: p.id.slice(0, 8), medio, porcentaje: Number(p.discount_percentage), dias, desde, hasta, texto, titulo: plano(`${p.title}. ${p.sub_title ?? ''}`), online: p.ecommerce !== false }));
    }
  }
  return out;
}
