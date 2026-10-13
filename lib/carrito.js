// Armado del carrito: link "agregar al carrito" para VTEX y lista de links
// para Coto. Nunca se guarda nada del usuario ni se paga: el usuario abre el
// link en su navegador (donde ya está logueado), revisa y paga en el súper.

import { BASE_COTO } from './scrapers/coto.js';
import { cantidadCarrito, TIENDAS_VTEX, urlCarritoVtex } from './scrapers/vtex.js';

// Carrefour reparte mal las cantidades de un link con varios productos: ordena
// los productos por código (como texto) y les asigna las cantidades ordenadas
// de menor a mayor (verificado el 13/10/2026: pedir jamón ×2 y Colgate ×1 cargaba
// jamón ×1 y Colgate ×2). Con la misma cantidad en todo el link no pasa, así que
// se arma un link por cantidad; cada link suma al mismo carrito.
const CANTIDADES_MEZCLADAS_FALLAN = new Set(['carrefour']);

/**
 * @param {string} sup
 * @param {{ sku: string, cantidad: number, seller?: string, multiplicador?: number|null, nombre?: string, url?: string }[]} items
 * @param {{ sc?: Record<string, string>, sucursales?: Record<string, string[]> }} [opts]
 *   sucursales: las de la zona de entrega (lib/zona.js). El carrito se arma
 *   con la sucursal como vendedor, así el sitio usa sus precios y su stock
 *   aunque el usuario no haya elegido la dirección.
 */
export function armarCarrito(sup, items, { sc = {}, sucursales = {} } = {}) {
  const sucursal = sucursales[sup]?.[0];
  const conSku = items.filter((i) => i.sku).map((i) => (sucursal ? { ...i, seller: sucursal } : i));
  if (TIENDAS_VTEX[sup]) {
    const t = TIENDAS_VTEX[sup];
    const canal = sc[sup] ?? t.sc;
    const porCantidad = new Map();
    for (const it of conSku) porCantidad.set(cantidadCarrito(it), [...(porCantidad.get(cantidadCarrito(it)) ?? []), it]);
    if (CANTIDADES_MEZCLADAS_FALLAN.has(sup) && porCantidad.size > 1) {
      // Primero el grupo más grande (normalmente los de 1 unidad).
      const grupos = [...porCantidad.values()].sort((a, b) => b.length - a.length);
      const pasos = grupos.map((g) => ({ url: urlCarritoVtex(t.base, g, { sc: canal }), items: g }));
      return { super: sup, tipo: 'pasos', url: pasos[0].url, pasos, items: conSku };
    }
    return { super: sup, tipo: 'link', url: urlCarritoVtex(t.base, conSku, { sc: canal }), items: conSku };
  }
  if (sup === 'coto') {
    return {
      super: sup,
      tipo: 'lista',
      url: `${BASE_COTO}/sitios/cdigi/`,
      items: items.map((i) => ({ nombre: i.nombre, cantidad: i.cantidad, url: i.url })),
    };
  }
  throw new Error(`Súper desconocido: ${sup}`);
}
