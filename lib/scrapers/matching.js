// Matching de productos entre súper: por EAN, y si no hay EAN, difuso por
// nombre + marca + contenido (el usuario confirma el match la primera vez).

import { parsearContenido, sinAcentos } from './normalizar.js';

const VACIAS = new Set(['de', 'del', 'la', 'el', 'en', 'con', 'sin', 'x', 'y', 'para', 'por', 'a', 'pack', 'botella', 'paquete', 'sachet']);

export function tokens(texto) {
  return sinAcentos(texto)
    .toLowerCase()
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[^a-z0-9. ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !VACIAS.has(t) && !/^\d+(\.\d+)?(kg|g|gr|grs|l|lt|lts|ml|cc|cm3|un|u)?$/.test(t) && !/^(kg|g|gr|grs|l|lt|lts|ml|cc|un|unid)$/.test(t));
}

function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size && !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

const normMarca = (m) => sinAcentos(m).toLowerCase().replace(/[^a-z0-9]/g, '');

/** Puntaje 0..1 de que dos productos sean el mismo. */
export function similitud(a, b) {
  if (a.ean && b.ean) return a.ean === b.ean ? 1 : 0;
  const ca = a.contenido != null ? { contenido: a.contenido, unidad: a.unidad } : parsearContenido(a.nombre);
  const cb = b.contenido != null ? { contenido: b.contenido, unidad: b.unidad } : parsearContenido(b.nombre);
  // Distinta presentación → no es el mismo producto.
  if (ca.unidad !== cb.unidad || Math.abs(ca.contenido - cb.contenido) > 0.001 * Math.max(ca.contenido, cb.contenido)) return 0;
  const ma = normMarca(a.marca);
  const mb = normMarca(b.marca);
  if (ma && mb && ma !== mb) return 0;
  const nombre = jaccard(tokens(a.nombre), tokens(b.nombre));
  return Math.round((0.7 * nombre + (ma && mb ? 0.3 : 0.15)) * 1000) / 1000;
}

export const UMBRAL_MATCH = 0.55;

/** Clave estable de un producto de un súper (para guardar matches confirmados). */
export function claveSuper(p) {
  return `${p.super}:${p.sku}`;
}

/**
 * Unifica resultados de búsqueda de los 4 súper.
 * @param {Record<string, object[]>} porSuper  { jumbo: [producto], ... }
 * @param {object} [opts]
 * @param {Record<string, string>} [opts.confirmados]  claveSuper → clave de grupo
 * @param {Set<string>|string[]} [opts.rechazados]     "claveSuper|claveGrupo" rechazados
 * @returns {{ grupos: object[], pendientes: object[] }}
 *   grupos: [{ clave, ean, nombre, marca, contenido, unidad, imagen, porSuper: { jumbo: producto } }]
 *   pendientes: matches difusos para que el usuario confirme
 */
export function unificar(porSuper, { confirmados = {}, rechazados = [] } = {}) {
  const rech = new Set(rechazados);
  const grupos = new Map();
  const sinEan = [];

  const nuevoGrupo = (clave, p) => {
    const g = { clave, ean: p.ean ?? null, nombre: p.nombre, marca: p.marca, contenido: p.contenido, unidad: p.unidad, imagen: p.imagen, porSuper: {} };
    grupos.set(clave, g);
    return g;
  };

  for (const [sup, productos] of Object.entries(porSuper)) {
    for (const p of productos ?? []) {
      const prod = { ...p, super: p.super ?? sup };
      if (prod.ean) {
        const g = grupos.get(prod.ean) ?? nuevoGrupo(prod.ean, prod);
        if (!g.porSuper[prod.super]) g.porSuper[prod.super] = prod;
        if (!g.imagen) g.imagen = prod.imagen;
      } else {
        sinEan.push(prod);
      }
    }
  }

  const pendientes = [];
  for (const p of sinEan) {
    const conf = confirmados[claveSuper(p)];
    if (conf && grupos.has(conf) && !grupos.get(conf).porSuper[p.super]) {
      grupos.get(conf).porSuper[p.super] = p;
      continue;
    }
    let mejor = null;
    for (const g of grupos.values()) {
      if (g.porSuper[p.super] || rech.has(`${claveSuper(p)}|${g.clave}`)) continue;
      const s = similitud(p, g);
      if (s >= UMBRAL_MATCH && (!mejor || s > mejor.score)) mejor = { grupo: g, score: s };
    }
    if (mejor) pendientes.push({ clave: claveSuper(p), grupo: mejor.grupo.clave, score: mejor.score, producto: p });
    const g = nuevoGrupo(claveSuper(p), p);
    g.porSuper[p.super] = p;
  }

  return { grupos: [...grupos.values()], pendientes };
}
