// Relevamiento de promos bancarias desde páginas oficiales: extracción del
// texto relevante e interpretación heurística (%, días, tope, vigencia).
// Puro: recibe HTML/texto, no hace requests. Lo usa scripts/relevar-promos.js.

import { sinAcentos } from './scrapers/normalizar.js';

const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

export function textoPlano(html) {
  return String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** bna.com.ar: el bloque de la promo ("COTO 20% de descuento … emitidas por el BNA."). */
export function extraerBna(html, nombreComercio) {
  const t = textoPlano(html);
  const re = new RegExp(`${nombreComercio}\\s+(\\d{1,2}% de (?:descuento|ahorro).{0,700}?)(?:\\(1\\)|Consult[aá] ac[aá]|$)`, 'i');
  const m = t.match(re);
  return m ? `${nombreComercio.toUpperCase()} ${m[1].trim()}` : null;
}

/** semananacion.com.ar: datos útiles del __NEXT_DATA__ de la landing del súper. */
export function extraerSemanaNacion(html) {
  const m = String(html ?? '').match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  const pagina = JSON.parse(m[1])?.props?.pageProps?.data ?? {};
  const textos = new Set();
  (function rec(v) {
    if (typeof v === 'string') {
      const t = textoPlano(v);
      if (t.length < 400 && /tope|^-?\d{1,2}%$|^(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bados?|domingos?)( y \w+)*$/i.test(t)) textos.add(t);
    } else if (v && typeof v === 'object') Object.values(v).forEach(rec);
  })(pagina.pages);
  return {
    descripcion: pagina.metadata?.description ?? null,
    promociones: (pagina.associatedPromotions ?? []).map((p) => p.name).sort(),
    condiciones: pagina.termsAndConditions ? textoPlano(pagina.termsAndConditions) : null,
    textos: [...textos].sort(),
  };
}

const num = (s) => Number(String(s).replace(/\./g, '').replace(',', '.'));

function fecha(d, m, a) {
  const anio = a.length === 2 ? `20${a}` : a;
  return `${anio}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/**
 * Interpretación heurística de un texto de promo. Devuelve lo que pudo leer;
 * los campos que no encuentra quedan en null. Es una ayuda para revisar, no
 * una fuente de verdad: las promos siempre las confirma el usuario.
 */
export function interpretarPromo(texto) {
  const t = sinAcentos(texto ?? '').toLowerCase();
  const pct = t.match(/-?(\d{1,2})\s*%\s*(?:de\s*)?(?:descuento|ahorro|reintegro|off)?/);
  // Días: rangos "lunes a viernes" y listas "martes y jueves".
  let dias = [];
  const rango = t.match(/(lunes|martes|miercoles|jueves|viernes|sabado|domingo)s?\s+a\s+(lunes|martes|miercoles|jueves|viernes|sabado|domingo)s?/);
  if (rango) {
    const a = DIAS.indexOf(rango[1]);
    const b = DIAS.indexOf(rango[2]);
    for (let i = a; ; i = (i + 1) % 7) {
      dias.push(i);
      if (i === b) break;
    }
  } else {
    dias = DIAS.map((d, i) => (new RegExp(`\\b${d}s?\\b`).test(t) ? i : -1)).filter((i) => i >= 0);
  }
  const sinTope = /sin tope/.test(t);
  const tope = t.match(/tope[^$\d]{0,40}\$\s?([\d.,]+)(?:[^.]{0,30}?\b(mes|mensual|semana|semanal|compra|transaccion)\b)?/);
  const minimo = t.match(/(?:compra|consumo)\s+minim[oa][^$\d]{0,20}\$\s?([\d.,]+)/);
  const vig =
    t.match(/del?\s+(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\s+al?\s+(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/) ??
    t.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\s+(?:al|hasta(?: el)?)\s+(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  const periodo = tope?.[2];
  return {
    porcentaje: pct ? Number(pct[1]) : null,
    dias: dias.length ? dias : null,
    tope: sinTope ? null : tope ? num(tope[1]) : null,
    sinTope,
    tipoTope: sinTope || !tope ? null : /mes|mensual/.test(periodo ?? '') ? 'mensual' : /semana/.test(periodo ?? '') ? 'semanal' : periodo ? 'por_compra' : null,
    minimoCompra: minimo ? num(minimo[1]) : null,
    vigenciaDesde: vig ? fecha(vig[1], vig[2], vig[3]) : null,
    vigenciaHasta: vig ? fecha(vig[4], vig[5], vig[6]) : null,
    modo: /modo/.test(t),
  };
}

/** Huella estable de un relevamiento, para saber si algo cambió. */
export function huella(relevamiento) {
  const s = JSON.stringify(relevamiento);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
