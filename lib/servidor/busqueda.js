// Búsqueda en varios súper con caché por texto (compartida por /api/buscar y
// /api/resolver).

import { enTodos } from '../scrapers/index.js';
import { cachearProductos } from './precios.js';

export const HORAS_BUSQUEDA = 2;

const idBusqueda = (sup, texto) => `${sup}_${texto.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/g, '-')}`.slice(0, 200);

/** @returns {Promise<{ porSuper: Record<string, object[]>, errores: Record<string, string> }>} */
export async function buscarEnSupers({ texto, supers, adaptadores, almacen, limite = 20 }) {
  const porSuper = {};
  const errores = {};
  const faltan = [];
  for (const sup of supers) {
    const c = await almacen.get('busquedas', idBusqueda(sup, texto));
    if (c && Date.now() - c.fecha < HORAS_BUSQUEDA * 3600_000) porSuper[sup] = c.productos;
    else faltan.push(sup);
  }
  const r = await enTodos(adaptadores, (a) => a.buscar(texto, { limite }), faltan);
  for (const sup of faltan) {
    if (r.datos[sup]) {
      porSuper[sup] = r.datos[sup];
      await almacen.set('busquedas', idBusqueda(sup, texto), { fecha: Date.now(), productos: r.datos[sup] });
      // De paso, sus precios quedan cacheados para la recomendación.
      await cachearProductos(almacen, sup, r.datos[sup]);
    } else errores[sup] = r.errores[sup];
  }
  return { porSuper, errores };
}
