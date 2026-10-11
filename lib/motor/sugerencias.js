// Sugerencias inteligentes: frecuencia de compra de cada producto según el
// historial de pedidos, para avisar cuando "toca" volver a comprarlo.

import { aIso, diasEntre } from './fechas.js';

/**
 * @param {object[]} pedidos  [{ fecha, items: [{ clave, nombre, cantidad }] }]
 * @param {string} hoy        'YYYY-MM-DD'
 * @param {object} [opts]
 * @param {number} [opts.margen=0.9]  sugerir a partir del 90% del intervalo promedio
 * @param {number} [opts.minimoCompras=2]
 */
export function frecuencias(pedidos, hoy, { margen = 0.9, minimoCompras = 2 } = {}) {
  const porProducto = new Map();
  for (const pedido of pedidos ?? []) {
    const fecha = aIso(pedido.fecha);
    if (!fecha || fecha > hoy) continue;
    for (const item of pedido.items ?? []) {
      if (!item.clave) continue;
      const p = porProducto.get(item.clave) ?? { clave: item.clave, nombre: item.nombre, fechas: new Set() };
      p.nombre = item.nombre ?? p.nombre;
      p.fechas.add(fecha);
      porProducto.set(item.clave, p);
    }
  }
  const resultado = [];
  for (const p of porProducto.values()) {
    const fechas = [...p.fechas].sort();
    if (fechas.length < minimoCompras) continue;
    const intervalos = fechas.slice(1).map((f, i) => diasEntre(fechas[i], f));
    const cadaDias = Math.round(intervalos.reduce((s, n) => s + n, 0) / intervalos.length);
    const ultima = fechas[fechas.length - 1];
    const hace = diasEntre(ultima, hoy);
    resultado.push({
      clave: p.clave,
      nombre: p.nombre,
      compras: fechas.length,
      cadaDias,
      ultima,
      hace,
      toca: cadaDias > 0 && hace >= cadaDias * margen,
    });
  }
  return resultado.sort((a, b) => b.hace / (b.cadaDias || 1) - a.hace / (a.cadaDias || 1));
}

/** Solo los productos que "tocan", con el texto para mostrar. */
export function sugerencias(pedidos, hoy, opts) {
  return frecuencias(pedidos, hoy, opts)
    .filter((f) => f.toca)
    .map((f) => ({ ...f, texto: `${f.nombre ?? f.clave}: la comprás cada ~${f.cadaDias} días, hace ${f.hace} que no.` }));
}
