// Armado del carrito: link "agregar al carrito" para VTEX y lista de links
// para Coto. Nunca se guarda nada del usuario ni se paga: el usuario abre el
// link en su navegador (donde ya está logueado), revisa y paga en el súper.

import { BASE_COTO } from './scrapers/coto.js';
import { TIENDAS_VTEX, urlCarritoVtex } from './scrapers/vtex.js';

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
    return { super: sup, tipo: 'link', url: urlCarritoVtex(t.base, conSku, { sc: sc[sup] ?? t.sc }), items: conSku };
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
