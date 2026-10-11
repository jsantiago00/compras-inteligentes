// GET /api/refrescar — lo llama Vercel Cron una vez por día.
// Refresca los precios de los productos que el usuario tiene en listas o en
// el historial (respetando la caché y el rate limiting de los scrapers).

import { IDS_SUPERS } from '../lib/constantes.js';
import { crearAdaptadores } from '../lib/scrapers/index.js';
import { obtenerAlmacen } from '../lib/servidor/almacen.js';
import { handler, responder } from '../lib/servidor/api.js';
import { preciosDeItems } from '../lib/servidor/precios.js';

const MAXIMO_POR_CORRIDA = Number(process.env.REFRESCAR_MAXIMO ?? 150);

export default handler(async (req, res) => {
  const secreto = process.env.CRON_SECRET;
  if (secreto && req.headers.authorization !== `Bearer ${secreto}`) {
    return responder(res, 401, { error: 'No autorizado' });
  }
  const almacen = await obtenerAlmacen();
  const items = (await almacen.clavesEnUso()).slice(0, MAXIMO_POR_CORRIDA);
  const inicio = Date.now();
  const r = await preciosDeItems({
    items,
    supers: IDS_SUPERS,
    adaptadores: await crearAdaptadores(),
    almacen,
    // Un poco menos de 24 h para que la corrida diaria siempre refresque.
    maxHoras: 20,
  });
  responder(res, 200, {
    almacen: almacen.tipo,
    productos: items.length,
    errores: r.errores.length,
    detalleErrores: r.errores.slice(0, 20),
    segundos: Math.round((Date.now() - inicio) / 1000),
  });
});
