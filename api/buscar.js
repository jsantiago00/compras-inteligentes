// GET /api/buscar?q=<texto>[&supers=jumbo,coto][&demo=1]
// Busca en los 4 súper y unifica los resultados por EAN.

import { IDS_SUPERS } from '../lib/constantes.js';
import { crearAdaptadores } from '../lib/scrapers/index.js';
import { unificar } from '../lib/scrapers/matching.js';
import { almacenMemoria, obtenerAlmacen } from '../lib/servidor/almacen.js';
import { errorCliente, handler, query, responder } from '../lib/servidor/api.js';
import { buscarEnSupers } from '../lib/servidor/busqueda.js';

export default handler(async (req, res) => {
  const { q, supers, demo } = query(req);
  const texto = (q ?? '').trim();
  if (texto.length < 2) throw errorCliente('Falta el texto a buscar (?q=...)');
  const lista = supers ? supers.split(',').filter((s) => IDS_SUPERS.includes(s)) : IDS_SUPERS;
  // En modo demo (precios de los fixtures guardados) no se toca la caché real.
  const almacen = demo === '1' ? almacenMemoria() : await obtenerAlmacen();
  const adaptadores = await crearAdaptadores({ demo: demo === '1' });
  const { porSuper, errores } = await buscarEnSupers({ texto, supers: lista, adaptadores, almacen });
  const { grupos, pendientes } = unificar(porSuper);
  // Primero los que aparecen en más súper.
  grupos.sort((a, b) => Object.keys(b.porSuper).length - Object.keys(a.porSuper).length);
  responder(res, 200, { q: texto, grupos, pendientes, errores });
});
