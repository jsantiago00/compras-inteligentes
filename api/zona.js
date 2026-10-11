// POST /api/zona  { codigoPostal }
// Qué sucursal de cada súper entrega en ese código postal y cuánto sale el
// envío (ver lib/servidor/zonas.js). Se cachea una semana por CP.

import { crearCliente } from '../lib/scrapers/http.js';
import { obtenerAlmacen } from '../lib/servidor/almacen.js';
import { cuerpo, errorCliente, handler, responder } from '../lib/servidor/api.js';
import { DIAS_CACHE_ZONA, resolverZona } from '../lib/servidor/zonas.js';

export default handler(async (req, res) => {
  if (req.method !== 'POST') throw errorCliente('Usar POST');
  const { codigoPostal } = await cuerpo(req);
  const cp = String(codigoPostal ?? '').trim();
  const almacen = await obtenerAlmacen();
  const guardada = /^\d{4}$/.test(cp) ? await almacen.get('zonas', cp) : null;
  if (guardada && Date.now() - guardada.fecha < DIAS_CACHE_ZONA * 86400_000) {
    return responder(res, 200, guardada.zona);
  }
  const cliente = crearCliente({ intervaloMs: Number(process.env.SCRAPERS_INTERVALO_MS ?? 1200) });
  const zona = await resolverZona({ codigoPostal: cp, cliente, env: process.env });
  if (zona.supers.length) await almacen.set('zonas', cp, { fecha: Date.now(), zona });
  responder(res, 200, zona);
});
