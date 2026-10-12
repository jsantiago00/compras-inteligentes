// Estado global de la app: store activo y configuración del usuario.

import { MEDIOS_INICIALES } from '../lib/medios.js';

// Último resultado de precios por lista, para no volver a pedirlos al ir y
// volver entre la lista y la recomendación. Se guarda en el navegador (30 min)
// porque al abrir el sitio del súper el celular suele recargar la app.
function cachePrecios({ minutos = 30, maximo = 6, clave = 'ci:cache-precios' } = {}) {
  const leer = () => {
    try {
      return JSON.parse(localStorage.getItem(clave) ?? '{}');
    } catch {
      return {};
    }
  };
  const escribir = (datos) => {
    try {
      localStorage.setItem(clave, JSON.stringify(datos));
    } catch {
      // Sin lugar o sin localStorage: queda solo hasta la próxima recarga.
    }
  };
  const vigente = (e) => e && Date.now() - (e.cuando ?? 0) < minutos * 60_000;
  return {
    get(k) {
      const e = leer()[k];
      return vigente(e) ? e : undefined;
    },
    set(k, datos) {
      const todo = Object.fromEntries(Object.entries(leer()).filter(([, e]) => vigente(e)));
      todo[k] = datos;
      // Solo las más recientes.
      const ordenadas = Object.entries(todo).sort((a, b) => b[1].cuando - a[1].cuando).slice(0, maximo);
      escribir(Object.fromEntries(ordenadas));
    },
    delete(k) {
      const todo = leer();
      delete todo[k];
      escribir(todo);
    },
    keys() {
      return Object.keys(leer());
    },
    clear() {
      escribir({});
    },
  };
}

export const estado = {
  store: null,
  usuario: null,
  config: null,
  precios: cachePrecios(),
};

const CONFIG_INICIAL = { id: 'general', demo: false };

export async function cargarConfig() {
  const guardada = (await estado.store.obtener('config', 'general')) ?? {};
  if (!guardada.medios) guardada.medios = Object.keys(guardada).length ? [...MEDIOS_INICIALES] : [];
  estado.config = { ...CONFIG_INICIAL, ...guardada };
  return estado.config;
}

export async function guardarConfig(cambios) {
  estado.config = await estado.store.guardar('config', { ...estado.config, ...cambios, id: 'general' });
  return estado.config;
}

// Direcciones de entrega: cada cuenta tiene las suyas (config.direcciones),
// cada una con sus súper, sucursales y costos de envío. Una cuenta nueva no
// tiene ninguna y la app se la pide al entrar (vistas/bienvenida.js).
export function direcciones() {
  return estado.config?.direcciones ?? [];
}

/** La dirección para la que se compra (la elegida o la primera), o null. */
export function direccionActiva() {
  const ds = direcciones();
  return ds.find((d) => d.id === estado.config?.direccionActiva) ?? ds[0] ?? null;
}

/** Súper y sucursales de la dirección activa (lo que se manda a /api). */
export function zonaActiva() {
  const d = direccionActiva();
  return d ? { supers: d.supers ?? [], sucursales: d.sucursales ?? {} } : { supers: [], sucursales: {} };
}

export function enviosActivos() {
  return direccionActiva()?.envios ?? {};
}

/**
 * Medios de pago del usuario (ids de lib/medios.js). Las cuentas que ya
 * usaban la app antes de poder elegir arrancan con BNA y Macro; las nuevas, vacías.
 */
export function misMedios() {
  return estado.config?.medios ?? [];
}
