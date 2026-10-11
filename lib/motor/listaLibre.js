// Lista libre: el usuario escribe su lista ("2 yerba playadito", "leche",
// "arroz 1kg"…) y para cada renglón elegimos un producto en cada súper a
// partir de los resultados de búsqueda. Funciones puras (sin I/O).

import { parsearContenido, sinAcentos } from '../scrapers/normalizar.js';
import { tokens } from '../scrapers/matching.js';

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

/** ¿El producto es relevante para el texto buscado? Todas las palabras tienen que aparecer. */
export function esRelevante(texto, producto) {
  const q = tokens(texto);
  if (!q.length) return false;
  const t = tokens(`${producto.nombre} ${producto.marca ?? ''}`);
  return q.every((qt) => t.some((x) => coincide(qt, x)));
}

const precio = (p) => p.precioOferta ?? p.precioLista;
const porUnidad = (p) => (p.contenido ? precio(p) / p.contenido : precio(p));
const mismoContenido = (a, b) => a.unidad === b.unidad && Math.abs(a.contenido - b.contenido) <= 0.011 * Math.max(a.contenido, b.contenido);

/**
 * Elige un producto por súper para un renglón.
 * @param {string} texto
 * @param {Record<string, object[]>} resultadosPorSuper  resultados de búsqueda (en orden del sitio)
 * @returns {{ elegidos: Record<string, object>, alternativas: Record<string, object[]>, ean: string|null, contenido: object|null }}
 *
 * Criterio, en orden:
 * 1. Solo productos disponibles cuyo nombre/marca contenga todas las palabras.
 * 2. Si el texto pide un contenido ("1kg"), solo esa presentación.
 * 3. Si un mismo EAN aparece en varios súper, ese (compara peras con peras).
 * 4. Si no, la presentación más común entre los súper y, dentro de ella, la más barata.
 */
export function elegirProductos(texto, resultadosPorSuper) {
  const pedido = contenidoPedido(texto);
  const relevantes = {};
  for (const [sup, productos] of Object.entries(resultadosPorSuper)) {
    relevantes[sup] = (productos ?? []).filter(
      (p) => p.disponible !== false && precio(p) > 0 && esRelevante(texto, p) && (!pedido || mismoContenido(p, pedido)),
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

  // Presentación objetivo: la pedida, la del EAN compartido o la más común.
  let objetivo = pedido ?? (compartido ? { contenido: compartido.muestra.contenido, unidad: compartido.muestra.unidad } : null);
  if (!objetivo) {
    const conteo = new Map();
    for (const lista of Object.values(relevantes)) {
      const vistos = new Set();
      for (const p of lista) {
        const k = `${p.contenido}|${p.unidad}`;
        if (vistos.has(k)) continue;
        vistos.add(k);
        conteo.set(k, (conteo.get(k) ?? 0) + 1);
      }
    }
    const [k] = [...conteo.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
    if (k) {
      const [c, u] = k.split('|');
      objetivo = { contenido: Number(c), unidad: u };
    }
  }

  const elegidos = {};
  const alternativas = {};
  for (const [sup, lista] of Object.entries(relevantes)) {
    if (!lista.length) continue;
    const orden = [...lista].sort((a, b) => porUnidad(a) - porUnidad(b));
    alternativas[sup] = orden.slice(0, 6);
    const conEan = compartido && lista.find((p) => p.ean === compartido.ean);
    const misma = objetivo ? orden.filter((p) => mismoContenido(p, objetivo)).sort((a, b) => precio(a) - precio(b)) : [];
    elegidos[sup] = conEan ?? misma[0] ?? orden[0];
  }
  const eans = new Set(Object.values(elegidos).map((p) => p.ean));
  return { elegidos, alternativas, ean: eans.size === 1 ? [...eans][0] ?? null : null, contenido: objetivo };
}

/** Clave estable de un renglón libre. */
export function claveLibre(texto) {
  return 'libre:' + sinAcentos(texto).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Referencia compacta de un producto de un súper (lo que se guarda en la lista). */
export function refProducto(p) {
  return { sku: p.sku, ean: p.ean ?? null, seller: p.seller ?? '1', url: p.url, nombre: p.nombre, contenido: p.contenido, unidad: p.unidad, precio: precio(p) };
}
