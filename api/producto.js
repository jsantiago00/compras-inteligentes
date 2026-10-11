// GET /api/producto?ean=<ean>   o   ?super=jumbo&sku=<sku>
// Un producto en cada súper (o en uno), con caché.

import { IDS_SUPERS } from '../lib/constantes.js';
import { crearAdaptadores } from '../lib/scrapers/index.js';
import { almacenDeZona, almacenMemoria, obtenerAlmacen } from '../lib/servidor/almacen.js';
import { errorCliente, handler, query, responder } from '../lib/servidor/api.js';
import { obtenerPrecio } from '../lib/servidor/precios.js';
import { sufijoZona, zonaDePedido } from '../lib/zona.js';

export default handler(async (req, res) => {
  const { ean, sku, super: sup, demo, zona: z } = query(req);
  const zona = zonaDePedido(z);
  if (!ean && !(sku && sup)) throw errorCliente('Pasá ?ean=... o ?super=...&sku=...');
  const supers = sup ? [sup].filter((s) => IDS_SUPERS.includes(s)) : zona.supers;
  const adaptadores = await crearAdaptadores({ demo: demo === '1', zona });
  const almacen = demo === '1' ? almacenMemoria() : almacenDeZona(await obtenerAlmacen(), sufijoZona(zona));
  const resultado = {};
  const errores = {};
  await Promise.all(
    supers.map(async (s) => {
      try {
        const r = await obtenerPrecio({ adaptador: adaptadores[s], almacen, super: s, ref: ean ? { ean } : { sku } });
        resultado[s] = r.producto;
      } catch (e) {
        errores[s] = e.message;
      }
    }),
  );
  responder(res, 200, { productos: resultado, errores });
});
