// Estado global de la app: store activo y configuración del usuario.

import { ZONA } from '../lib/zona.js';

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

const CONFIG_INICIAL = { id: 'general', envios: ZONA.envios, enviosFicticios: false, demo: false };

export async function cargarConfig() {
  const guardada = (await estado.store.obtener('config', 'general')) ?? {};
  // Configs viejas con los costos de envío de ejemplo: pasan a los reales de la zona.
  if (guardada.enviosFicticios) Object.assign(guardada, { envios: ZONA.envios, enviosFicticios: false });
  estado.config = { ...CONFIG_INICIAL, ...guardada };
  return estado.config;
}

export async function guardarConfig(cambios) {
  estado.config = await estado.store.guardar('config', { ...estado.config, ...cambios, id: 'general' });
  return estado.config;
}

// Direcciones de entrega. La principal es la de lib/zona.js (sus envíos están en
// config.envios); las demás se agregan en Ajustes con su código postal y guardan
// sus sucursales y envíos (config.direcciones).
export const DIRECCION_PRINCIPAL = {
  id: 'principal',
  nombre: 'Casa',
  direccion: 'Arizu 127, Godoy Cruz',
  codigoPostal: ZONA.codigoPostal,
  localidad: 'Godoy Cruz',
  provincia: 'Mendoza',
  supers: ZONA.supers,
  sucursales: ZONA.sucursales,
  nombresSucursales: { jumbo: 'Jumbo Godoy Cruz', vea: 'Vea Godoy Cruz (Sarmiento 998)', carrefour: 'Hiper Mendoza Azul', coto: 'Coto Mendoza (Perú y Pellegrini)' },
};

export function direcciones() {
  return [DIRECCION_PRINCIPAL, ...(estado.config?.direcciones ?? [])];
}

export function direccionActiva() {
  return direcciones().find((d) => d.id === estado.config?.direccionActiva) ?? DIRECCION_PRINCIPAL;
}

/** Súper y sucursales de la dirección activa (lo que se manda a /api). */
export function zonaActiva() {
  const { supers, sucursales } = direccionActiva();
  return { supers, sucursales };
}

export function enviosActivos() {
  const d = direccionActiva();
  // La principal completa con los valores de la zona los súper que no estén guardados (ej. Coto).
  if (d.id === DIRECCION_PRINCIPAL.id) return { ...ZONA.envios, ...(estado.config?.envios ?? {}) };
  return d.envios ?? {};
}
