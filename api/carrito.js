// POST /api/carrito  { super, items: [{ sku, cantidad, seller?, nombre?, url? }] }
// Devuelve el link para agregar todo al carrito en el sitio del súper.

import { IDS_SUPERS } from '../lib/constantes.js';
import { armarCarrito } from '../lib/carrito.js';
import { cuerpo, errorCliente, handler, responder } from '../lib/servidor/api.js';

export default handler(async (req, res) => {
  if (req.method !== 'POST') throw errorCliente('Usar POST');
  const { super: sup, items } = await cuerpo(req);
  if (!IDS_SUPERS.includes(sup)) throw errorCliente('Súper inválido');
  if (!Array.isArray(items) || !items.length) throw errorCliente('Faltan los items');
  const sc = { jumbo: process.env.VTEX_SC_JUMBO, vea: process.env.VTEX_SC_VEA, carrefour: process.env.VTEX_SC_CARREFOUR };
  for (const k of Object.keys(sc)) if (!sc[k]) delete sc[k];
  responder(res, 200, armarCarrito(sup, items, { sc }));
});
