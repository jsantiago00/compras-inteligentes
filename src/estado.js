// Estado global de la app: store activo y configuración del usuario.

import { ZONA } from '../lib/zona.js';

export const estado = {
  store: null,
  usuario: null,
  config: null,
  // Último resultado de precios por lista (para no volver a pedirlos al navegar).
  precios: new Map(),
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
  nombresSucursales: { jumbo: 'Jumbo Godoy Cruz', vea: 'Vea Godoy Cruz (Sarmiento 998)', carrefour: 'Hiper Mendoza Azul' },
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
  return (d.id === DIRECCION_PRINCIPAL.id ? estado.config?.envios : d.envios) ?? {};
}
