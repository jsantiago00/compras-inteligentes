// Registro de adaptadores: uno por súper, con la interfaz común
// `buscar(texto)`, `porEan(ean)`, `porSku(sku)` y `carrito(items)`.

import { IDS_SUPERS } from '../constantes.js';
import { ZONA } from '../zona.js';
import { crearAdaptadorCoto } from './coto.js';
import { crearCliente } from './http.js';
import { crearAdaptadorVtex } from './vtex.js';

/**
 * @param {object} [opts]
 * @param {typeof fetch} [opts.fetch]
 * @param {Record<string, string|undefined>} [opts.env]
 * @param {boolean} [opts.demo]
 */
export async function crearAdaptadores({ fetch, env = process.env, intervaloMs, demo = false } = {}) {
  // Modo demo: precios de los fixtures guardados, sin tocar los sitios.
  if (!fetch && (demo || env.SCRAPERS_FIXTURES === '1')) {
    ({ fetchFixtures: fetch } = await import('./fixtures.js'));
    intervaloMs ??= 0;
  }
  const cliente = crearCliente({ fetch, intervaloMs: intervaloMs ?? Number(env.SCRAPERS_INTERVALO_MS ?? 1200) });
  const { sucursales } = ZONA;
  return {
    jumbo: crearAdaptadorVtex('jumbo', { cliente, sc: env.VTEX_SC_JUMBO, sucursales: sucursales.jumbo }),
    vea: crearAdaptadorVtex('vea', { cliente, sc: env.VTEX_SC_VEA, sucursales: sucursales.vea }),
    carrefour: crearAdaptadorVtex('carrefour', { cliente, sc: env.VTEX_SC_CARREFOUR, sucursales: sucursales.carrefour }),
    coto: crearAdaptadorCoto({ cliente }),
  };
}

/** Corre `fn` en los 4 súper en paralelo; los errores no frenan al resto. */
export async function enTodos(adaptadores, fn, supers = IDS_SUPERS) {
  const res = await Promise.allSettled(supers.map((s) => fn(adaptadores[s], s)));
  const datos = {};
  const errores = {};
  res.forEach((r, i) => {
    if (r.status === 'fulfilled') datos[supers[i]] = r.value;
    else errores[supers[i]] = r.reason?.message ?? String(r.reason);
  });
  return { datos, errores };
}
