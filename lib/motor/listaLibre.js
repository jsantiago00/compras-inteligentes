// Lista libre: el usuario escribe su lista ("2 yerba playadito", "leche",
// "arroz 1kg"…) y para cada renglón elegimos un producto en cada súper a
// partir de los resultados de búsqueda. Funciones puras (sin I/O).

import { parsearContenido, sinAcentos } from '../scrapers/normalizar.js';
import { tokens } from '../scrapers/matching.js';
import { costoItem } from './promos.js';

/** Separa el texto en renglones (enter, ";" o "," que no sea decimal). */
export function separarLineas(texto) {
  return String(texto ?? '')
    .split(/\n|;|,(?!\d)/)
    .map((l) => l.replace(/^\s*[-*•·]\s*/, '').trim())
    .filter((l) => l.length >= 2);
}

/**
 * "2 coca cola" / "2x coca" / "coca cola x2" / "coca cola (2)" → { texto, cantidad }.
 * No confunde "x 1kg" ni "2,25 L" con cantidades.
 */
export function parsearLinea(linea) {
  let texto = linea.trim();
  let cantidad = 1;
  let m = texto.match(/^(\d{1,2})\s*(?:x|u|un|unid|unidades)?\s+(?![\d.,]*\s*(?:kg|g|gr|grs|l|lt|lts|ml|cc)\b)(.+)$/i);
  if (m) {
    cantidad = Number(m[1]);
    texto = m[2];
  } else if ((m = texto.match(/^(.+?)\s*(?:\bx\s*(\d{1,2})|\((\d{1,2})\))$/i))) {
    cantidad = Number(m[2] ?? m[3]);
    texto = m[1];
  }
  return { texto: texto.trim(), cantidad: Math.max(1, cantidad) };
}

/** Contenido pedido explícitamente en el texto ("arroz 1kg" → 1 kg), o null. */
export function contenidoPedido(texto) {
  if (!/\d\s*(kg|kgs|g|gr|grs|gramos?|l|lt|lts|litros?|ml|cc)\b/i.test(sinAcentos(texto))) return null;
  return parsearContenido(texto);
}

// "fideos" ~ "fideo", "galletitas" ~ "galletita": comparamos por prefijo.
function coincide(qt, t) {
  if (qt === t) return true;
  const corto = Math.min(qt.length, t.length);
  return corto >= 4 && (t.startsWith(qt) || qt.startsWith(t)) && Math.abs(qt.length - t.length) <= 2;
}

// Cada súper nombra algunas cosas distinto (Coto dice "picada" a la carne molida).
// Frases equivalentes (verificado en Coto el 12/10/2026: "Picada Especial X KG",
// "Pata Muslo Con Piel X Kg"). "picada" sola no, porque también es "Picada De Cerdo".
const SINONIMOS = [
  ['carne molida', 'carne picada', 'picada especial'],
  ['patamuslo', 'pata muslo'],
];

/** El texto y sus variantes con sinónimos ("carne molida" → [..., "carne picada", "picada especial"]). */
export function variantes(texto) {
  const base = sinAcentos(texto).toLowerCase();
  const out = new Set([texto]);
  for (const grupo of SINONIMOS) {
    for (const frase of grupo) {
      const re = new RegExp(`\\b${frase}\\b`);
      if (!re.test(base)) continue;
      for (const otra of grupo) if (otra !== frase) out.add(base.replace(re, otra));
    }
  }
  return [...out];
}

/** ¿El producto es relevante para el texto buscado? Todas las palabras (o sus sinónimos) tienen que aparecer. */
/** El texto sin la cantidad ("lavandina 2l" → "lavandina"): la cantidad elige la presentación. */
export function textoSinCantidad(texto) {
  return sinAcentos(texto).replace(/\d+(?:[.,]\d+)?\s*(?:kgs?|g|grs?|gramos?|l|lts?|litros?|ml|cc)\b/gi, ' ').replace(/\s+/g, ' ').trim() || texto;
}

// Productos especiales que solo entran si se piden (ej. "pan sin tacc").
const ESPECIALES = /sin t\.?a\.?c\.?c|sin gluten|cel[ií]ac|apto cel/i;

export function esRelevante(texto, producto) {
  const t = tokens(`${producto.nombre} ${producto.marca ?? ''}`);
  if (ESPECIALES.test(producto.nombre ?? '') && !ESPECIALES.test(texto)) return false;
  return variantes(textoSinCantidad(texto)).some((v) => {
    const q = tokens(v);
    return q.length > 0 && q.every((qt) => t.some((x) => coincide(qt, x)));
  });
}

const precio = (p) => p.precioOferta ?? p.precioLista;
const porUnidad = (p) => (p.contenido ? precio(p) / p.contenido : precio(p));
const mismoContenido = (a, b) => a.unidad === b.unidad && Math.abs(a.contenido - b.contenido) <= 0.011 * Math.max(a.contenido, b.contenido);

/** Cuántos envases de `p` cubren `necesidad` (en su unidad). Pesables: lo justo. */
export function envasesPara(p, necesidad) {
  if (!p?.contenido || !(necesidad > 0)) return null;
  return p.multiplicador ? necesidad / p.contenido : Math.ceil(necesidad / p.contenido - 1e-9);
}

// Hasta cuánto puede sobrar al redondear envases (ej. pedir 2 L y llevar 2,25 L).
const SOBRANTE_MAXIMO = 0.25;

/**
 * Elige un producto por súper para un renglón.
 * @param {string} texto
 * @param {Record<string, object[]>} resultadosPorSuper  resultados de búsqueda (en orden del sitio)
 * @param {{ cantidad?: number }} [opts]  cantidad del renglón ("2 lavandina" → 2)
 * @returns {{ elegidos, alternativas, ean, contenido, necesidad, mejorPorUnidad }}
 *
 * Criterio, en orden:
 * 1. Solo productos disponibles cuyo nombre/marca contenga todas las palabras.
 * 2. Presentación de referencia: la pedida ("lavandina 2l") o la más común
 *    (la más chica si empatan). Lo necesario = cantidad × esa presentación.
 * 3. En cada súper, la forma más barata de cubrir lo necesario con envases de
 *    la misma unidad (2 × 1 L, 1 × 2 L, 4 × 500 ml…), con las promos de góndola,
 *    sin que sobre más del 25 %. Si empatan (±2 %), el EAN compartido y lo que
 *    menos sobra.
 */
export function elegirProductos(texto, resultadosPorSuper, { cantidad = 1 } = {}) {
  const pedido = contenidoPedido(texto);
  const relevantes = {};
  for (const [sup, productos] of Object.entries(resultadosPorSuper)) {
    relevantes[sup] = (productos ?? []).filter(
      (p) => p.disponible !== false && precio(p) > 0 && esRelevante(texto, p) && (!pedido || p.unidad === pedido.unidad),
    );
  }

  // EAN compartido por más súper (desempata el más barato por unidad).
  const porEan = new Map();
  for (const [sup, lista] of Object.entries(relevantes)) {
    for (const p of lista) {
      if (!p.ean) continue;
      const e = porEan.get(p.ean) ?? { ean: p.ean, supers: new Set(), precios: [], muestra: p };
      e.supers.add(sup);
      e.precios.push(porUnidad(p));
      porEan.set(p.ean, e);
    }
  }
  const promedio = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const compartido = [...porEan.values()]
    .filter((e) => e.supers.size >= 2)
    .sort((a, b) => b.supers.size - a.supers.size || promedio(a.precios) - promedio(b.precios))[0];

  // Presentación de referencia: la pedida o la más común entre los súper (si
  // empatan, la más chica: "2 lavandinas" son 2 de la botella común, no 2 bidones).
  let objetivo = pedido;
  if (!objetivo) {
    // Cuenta productos (no súper): una presentación rara que está en todos (ej.
    // lavandina en gel 700 ml) no le gana a la común (lavandina 1 L de varias marcas).
    const conteo = new Map();
    for (const lista of Object.values(relevantes)) {
      for (const p of lista) {
        const k = `${p.contenido}|${p.unidad}`;
        conteo.set(k, (conteo.get(k) ?? 0) + 1);
      }
    }
    const [k] = [...conteo.entries()].sort((a, b) => b[1] - a[1] || Number(a[0].split('|')[0]) - Number(b[0].split('|')[0]))[0] ?? [];
    if (k) {
      const [c, u] = k.split('|');
      objetivo = { contenido: Number(c), unidad: u };
    }
  }
  const necesidad = objetivo?.contenido ? objetivo.contenido * cantidad : null;

  const elegidos = {};
  const alternativas = {};
  let mejorPorUnidad = null;
  // Precio por unidad "normal" (mediana), para ignorar datos mal cargados en los
  // sitios (ej. un aceite de 1,5 L publicado como "15 lts").
  const unitarios = Object.values(relevantes)
    .flat()
    .filter((p) => objetivo && p.unidad === objetivo.unidad && p.contenido)
    .map(porUnidad)
    .sort((a, b) => a - b);
  const mediana = unitarios.length ? unitarios[Math.floor(unitarios.length / 2)] : null;
  const creible = (p) => mediana == null || porUnidad(p) >= mediana * 0.5;
  for (const [sup, lista] of Object.entries(relevantes)) {
    if (!lista.length) continue;
    const orden = [...lista].sort((a, b) => porUnidad(a) - porUnidad(b));
    alternativas[sup] = orden.slice(0, 6);
    for (const p of lista) {
      if (objetivo && p.unidad === objetivo.unidad && p.contenido && creible(p) && (!mejorPorUnidad || porUnidad(p) < porUnidad(mejorPorUnidad))) mejorPorUnidad = p;
    }
    const opciones = necesidad
      ? lista
          .filter((p) => p.unidad === objetivo.unidad && p.contenido > 0 && creible(p))
          .map((p) => {
            const envases = envasesPara(p, necesidad);
            return { p, envases, costo: costoItem(p, envases).costo, sobra: (envases * p.contenido) / necesidad - 1 };
          })
          .filter((o) => o.sobra <= SOBRANTE_MAXIMO + 1e-9)
      : [];
    if (opciones.length) {
      const minimo = Math.min(...opciones.map((o) => o.costo));
      const empatadas = opciones.filter((o) => o.costo <= minimo * 1.02);
      empatadas.sort((a, b) => (b.p.ean === compartido?.ean) - (a.p.ean === compartido?.ean) || a.sobra - b.sobra || a.costo - b.costo);
      elegidos[sup] = empatadas[0].p;
    } else {
      elegidos[sup] = (compartido && lista.find((p) => p.ean === compartido.ean)) ?? orden[0];
    }
  }
  const eans = new Set(Object.values(elegidos).map((p) => p.ean));
  return { elegidos, alternativas, ean: eans.size === 1 ? [...eans][0] ?? null : null, contenido: objetivo, necesidad: objetivo, mejorPorUnidad };
}

/** Clave estable de un renglón libre. */
export function claveLibre(texto) {
  return 'libre:' + sinAcentos(texto).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Referencia compacta de un producto de un súper (lo que se guarda en la lista). */
export function refProducto(p) {
  return { sku: p.sku, ean: p.ean ?? null, seller: p.seller ?? '1', multiplicador: p.multiplicador ?? null, url: p.url, nombre: p.nombre, contenido: p.contenido, unidad: p.unidad, precio: precio(p) };
}
