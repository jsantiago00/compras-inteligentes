// Cliente de las funciones /api del server.

async function pedir(url, opciones) {
  const res = await fetch(url, opciones);
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(datos.error ?? `Error ${res.status}`);
  return datos;
}

export function buscar(texto, { demo } = {}) {
  return pedir(`/api/buscar?q=${encodeURIComponent(texto)}${demo ? '&demo=1' : ''}`);
}

export function precios(items, { demo } = {}) {
  const cuerpo = items.map((i) => ({ clave: i.clave, ean: i.ean ?? null, refs: i.refs ?? {} }));
  return pedir('/api/precios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: cuerpo, demo }) });
}

export function carrito(sup, items) {
  return pedir('/api/carrito', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ super: sup, items }) });
}

export function resolver(texto, { demo } = {}) {
  return pedir('/api/resolver', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto, demo }) });
}
