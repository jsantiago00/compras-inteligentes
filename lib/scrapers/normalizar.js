// Normalización: contenido de la presentación, precio por unidad de medida y
// promos de góndola a partir de texto.

export function sinAcentos(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function aNumero(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[^\d.,-]/g, '');
  // "1.234,56" → 1234.56 ; "1234.56" → 1234.56 ; "1,5" → 1.5
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const UNIDADES = [
  // [regex de unidad, unidad base, factor]
  [/^(kg|kgs|kilo|kilos|kilogramos?)$/, 'kg', 1],
  [/^(g|gr|grs|gramos?)$/, 'kg', 0.001],
  [/^(l|lt|lts|litros?)$/, 'l', 1],
  [/^(ml|cc|cm3|mililitros?)$/, 'l', 0.001],
  [/^(cl)$/, 'l', 0.01],
  [/^(u|un|uni|unid|unidades?|uds?)$/, 'un', 1],
];

function unidadBase(texto) {
  for (const [re, base, factor] of UNIDADES) if (re.test(texto)) return { base, factor };
  return null;
}

/**
 * Extrae el contenido de un nombre de producto.
 * "Yerba Mate Playadito 1 Kg" → { contenido: 1, unidad: 'kg' }
 * "Gaseosa Coca-Cola 2,25 L" → { contenido: 2.25, unidad: 'l' }
 * "Agua Villavicencio Pack 6 x 1,5 L" → { contenido: 9, unidad: 'l' }
 * "Galletitas 3 x 100 g" → { contenido: 0.3, unidad: 'kg' }
 * Si no encuentra nada → { contenido: 1, unidad: 'un' }.
 */
export function parsearContenido(nombre) {
  const t = sinAcentos(nombre).toLowerCase().replace(/(\d),(\d)/g, '$1.$2');
  const re = /(?:(\d+)\s*x\s*)?(\d+(?:\.\d+)?)\s*([a-z]+\d?)\b/g;
  let m;
  let encontrado = null;
  while ((m = re.exec(t))) {
    const u = unidadBase(m[3]);
    if (!u) continue;
    const multiplo = m[1] ? Number(m[1]) : 1;
    encontrado = { contenido: round(multiplo * Number(m[2]) * u.factor), unidad: u.base };
    if (u.base !== 'un') break; // preferimos peso/volumen sobre "unidades"
  }
  return encontrado ?? { contenido: 1, unidad: 'un' };
}

function round(n) {
  return Math.round(n * 10000) / 10000;
}

/** Precio por unidad de medida ($/kg, $/l, $/un). */
export function precioPorUnidad(precio, contenido, unidad) {
  if (precio == null || !contenido) return null;
  return { valor: Math.round((precio / contenido) * 100) / 100, unidad: `$/${unidad}` };
}

/**
 * Interpreta el texto de una promo de góndola.
 * "2x1", "3x2", "Llevá 3 pagá 2"         → { tipo: 'nxm', lleva, paga }
 * "2do al 70%", "70% en la 2da unidad"  → { tipo: 'segunda_unidad', porcentaje }
 * "25% off", "Llevando 3, 20% dto"      → { tipo: 'porcentaje', porcentaje, minimoUnidades }
 */
export function parsearPromoTexto(texto) {
  if (!texto) return null;
  const t = sinAcentos(texto).toLowerCase();
  let m = t.match(/\b(\d)\s*x\s*(\d)\b/) ?? t.match(/lleva\w*\s*(\d)\s*,?\s*paga\w*\s*(\d)/);
  if (m && Number(m[1]) > Number(m[2]) && Number(m[2]) > 0) {
    return { tipo: 'nxm', lleva: Number(m[1]), paga: Number(m[2]), texto };
  }
  const segunda = /(2da|2do|2°|2º|segunda|segundo)/;
  m = t.match(/(?:2da|2do|2°|2º|segunda|segundo)\s*(?:unidad|u\.?)?\s*(?:al|a|con)?\s*(?:el\s*)?(\d{1,3})\s*%/);
  if (m) return { tipo: 'segunda_unidad', porcentaje: Number(m[1]), texto };
  m = t.match(/(\d{1,3})\s*%/);
  if (m && segunda.test(t)) return { tipo: 'segunda_unidad', porcentaje: Number(m[1]), texto };
  m = t.match(/(\d{1,3})\s*%\s*(?:off|dto|desc|de descuento|descuento)?/);
  if (m) {
    const minimo = t.match(/llevando\s*(\d+)/);
    return { tipo: 'porcentaje', porcentaje: Number(m[1]), minimoUnidades: minimo ? Number(minimo[1]) : 1, texto };
  }
  return null;
}
