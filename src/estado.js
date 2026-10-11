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
