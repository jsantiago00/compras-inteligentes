// Cliente de las funciones /api del server.

import { DIRECCION_PRINCIPAL, direccionActiva, zonaActiva } from './estado.js';

async function pedir(url, opciones) {
  const res = await fetch(url, opciones);
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(datos.error ?? `Error ${res.status}`);
  return datos;
}

// La zona de la dirección activa (la principal es la default del server).
const zona = () => (direccionActiva().id === DIRECCION_PRINCIPAL.id ? undefined : zonaActiva());

const post = (url, cuerpo) => pedir(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });

export function buscar(texto, { demo } = {}) {
  const z = zona();
  return pedir(`/api/buscar?q=${encodeURIComponent(texto)}${demo ? '&demo=1' : ''}${z ? `&zona=${encodeURIComponent(JSON.stringify(z))}` : ''}`);
}

export function precios(items, { demo } = {}) {
  const cuerpo = items.map((i) => ({ clave: i.clave, ean: i.ean ?? null, refs: i.refs ?? {} }));
  return post('/api/precios', { items: cuerpo, demo, zona: zona() });
}

export function carrito(sup, items) {
  return post('/api/carrito', { super: sup, items });
}

export function resolver(texto, { demo } = {}) {
  return post('/api/resolver', { texto, demo, zona: zona() });
}

/** Sucursales que entregan en un código postal (ver lib/servidor/zonas.js). */
export function zonaDeCodigoPostal(codigoPostal) {
  return post('/api/zona', { codigoPostal });
}

/** Promos bancarias publicadas por los súper (ver lib/promosSuper.js). */
export function promosSuper() {
  return pedir('/api/promos');
}
