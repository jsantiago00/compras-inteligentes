// Estado global de la app: store activo y configuración del usuario.

import { ENVIOS_EJEMPLO } from '../lib/ejemplos.js';

export const estado = {
  store: null,
  usuario: null,
  config: null,
  // Último resultado de precios por lista (para no volver a pedirlos al navegar).
  precios: new Map(),
};

const CONFIG_INICIAL = { id: 'general', envios: ENVIOS_EJEMPLO, enviosFicticios: true, demo: false };

export async function cargarConfig() {
  estado.config = { ...CONFIG_INICIAL, ...((await estado.store.obtener('config', 'general')) ?? {}) };
  return estado.config;
}

export async function guardarConfig(cambios) {
  estado.config = await estado.store.guardar('config', { ...estado.config, ...cambios, id: 'general' });
  return estado.config;
}
