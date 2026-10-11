// Historial de precios por producto y súper: agregar puntos y detectar
// "promos infladas" (el precio de lista subió poco antes de la oferta).

import { diasEntre } from './fechas.js';

/**
 * Agrega un punto `{ fecha, precioLista, precioOferta }` solo si cambió algo
 * respecto del último (así el historial no crece con cada refresco).
 * Devuelve un array nuevo.
 */
export function agregarPunto(historial, punto) {
  const lista = [...(historial ?? [])].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  const ultimo = lista[lista.length - 1];
  if (ultimo && ultimo.precioLista === punto.precioLista && (ultimo.precioOferta ?? null) === (punto.precioOferta ?? null)) {
    return lista;
  }
  if (ultimo && ultimo.fecha === punto.fecha) lista.pop();
  lista.push({ fecha: punto.fecha, precioLista: punto.precioLista, precioOferta: punto.precioOferta ?? null });
  return lista;
}

/**
 * Si hoy hay oferta y el precio de lista actual es bastante mayor que el
 * mínimo de lista de los últimos `dias`, la "oferta" puede ser una suba
 * disfrazada. Devuelve `{ subaPct, precioAntes, ofertaReal }` o null.
 */
export function detectarSubaPrevia(historial, { hoy, dias = 45, umbral = 0.05 } = {}) {
  if (!historial?.length) return null;
  const orden = [...historial].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  const actual = orden[orden.length - 1];
  if (actual.precioOferta == null || actual.precioOferta >= actual.precioLista) return null;
  const ref = hoy ?? actual.fecha;
  const previos = orden.slice(0, -1).filter((p) => diasEntre(p.fecha, ref) <= dias);
  if (!previos.length) return null;
  const precioAntes = Math.min(...previos.map((p) => p.precioLista));
  const subaPct = (actual.precioLista - precioAntes) / precioAntes;
  if (subaPct < umbral) return null;
  return {
    subaPct: Math.round(subaPct * 1000) / 10,
    precioAntes,
    // Descuento real contra el precio de lista previo a la suba.
    ofertaReal: Math.round(((precioAntes - actual.precioOferta) / precioAntes) * 1000) / 10,
  };
}
