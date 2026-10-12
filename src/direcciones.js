// Alta de direcciones de entrega (la usan Ajustes y la bienvenida): con el
// código postal, el server averigua qué sucursal de cada súper entrega ahí y
// cuánto sale el envío (ver lib/servidor/zonas.js).

import * as api from './api.js';
import { estado, guardarConfig } from './estado.js';

/**
 * Agrega una dirección a la cuenta y la deja como activa.
 * @returns {Promise<{ direccion?: object, zona: object }>} sin `direccion` si ningún súper entrega ahí
 */
export async function crearDireccion({ nombre, direccion, codigoPostal }) {
  const z = await api.zonaDeCodigoPostal(String(codigoPostal).trim());
  if (!z.supers.length) return { zona: z };
  const nueva = {
    id: `dir-${Date.now().toString(36)}`,
    nombre: (nombre ?? '').trim() || 'Casa',
    direccion: (direccion ?? '').trim() || null,
    codigoPostal: z.codigoPostal,
    localidad: z.localidad,
    provincia: z.provincia,
    supers: z.supers,
    sucursales: z.sucursales,
    nombresSucursales: z.nombresSucursales,
    envios: z.envios,
    avisos: z.avisos,
  };
  await guardarConfig({ direcciones: [...(estado.config.direcciones ?? []), nueva], direccionActiva: nueva.id });
  estado.precios.clear();
  return { direccion: nueva, zona: z };
}
