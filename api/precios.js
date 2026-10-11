// POST /api/precios  { items: [{ clave, ean?, refs?: { jumbo: { sku } } }], supers?, demo? }
// Precios actuales (con caché) de cada ítem en cada súper + historial.

import { IDS_SUPERS } from '../lib/constantes.js';
import { crearAdaptadores } from '../lib/scrapers/index.js';
import { almacenMemoria, obtenerAlmacen } from '../lib/servidor/almacen.js';
import { cuerpo, errorCliente, handler, responder } from '../lib/servidor/api.js';
import { preciosDeItems } from '../lib/servidor/precios.js';
import { ZONA } from '../lib/zona.js';

export default handler(async (req, res) => {
  if (req.method !== 'POST') throw errorCliente('Usar POST');
  const { items, supers, demo } = await cuerpo(req);
  if (!Array.isArray(items) || !items.length) throw errorCliente('Faltan los items');
  if (items.length > 80) throw errorCliente('Máximo 80 items por pedido');
  const r = await preciosDeItems({
    items,
    supers: (supers ?? ZONA.supers).filter((s) => IDS_SUPERS.includes(s)),
    adaptadores: await crearAdaptadores({ demo: Boolean(demo) }),
    almacen: demo ? almacenMemoria() : await obtenerAlmacen(),
    maxHoras: Number(process.env.HORAS_CACHE ?? 12),
  });
  responder(res, 200, r);
});
