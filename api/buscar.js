// GET /api/buscar?q=<texto>[&supers=jumbo,coto][&demo=1]
// Busca en los 4 súper y unifica los resultados por EAN.

import { IDS_SUPERS } from '../lib/constantes.js';
import { crearAdaptadores, enTodos } from '../lib/scrapers/index.js';
import { unificar } from '../lib/scrapers/matching.js';
import { almacenMemoria, obtenerAlmacen } from '../lib/servidor/almacen.js';
import { errorCliente, handler, query, responder } from '../lib/servidor/api.js';

const HORAS_BUSQUEDA = 2;

export default handler(async (req, res) => {
  const { q, supers, demo } = query(req);
  const texto = (q ?? '').trim();
  if (texto.length < 2) throw errorCliente('Falta el texto a buscar (?q=...)');
  const lista = supers ? supers.split(',').filter((s) => IDS_SUPERS.includes(s)) : IDS_SUPERS;

  // En modo demo (precios de los fixtures guardados) no se toca la caché real.
  const almacen = demo === '1' ? almacenMemoria() : await obtenerAlmacen();
  const adaptadores = await crearAdaptadores({ demo: demo === '1' });
  const porSuper = {};
  const errores = {};
  const faltan = [];
  for (const sup of lista) {
    const id = `${sup}_${texto.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/g, '-')}`.slice(0, 200);
    const c = await almacen.get('busquedas', id);
    if (c && Date.now() - c.fecha < HORAS_BUSQUEDA * 3600_000) porSuper[sup] = c.productos;
    else faltan.push({ sup, id });
  }
  const r = await enTodos(adaptadores, (a) => a.buscar(texto), faltan.map((f) => f.sup));
  for (const f of faltan) {
    if (r.datos[f.sup]) {
      porSuper[f.sup] = r.datos[f.sup];
      await almacen.set('busquedas', f.id, { fecha: Date.now(), productos: r.datos[f.sup] });
    } else errores[f.sup] = r.errores[f.sup];
  }
  const { grupos, pendientes } = unificar(porSuper);
  // Primero los que aparecen en más súper.
  grupos.sort((a, b) => Object.keys(b.porSuper).length - Object.keys(a.porSuper).length);
  responder(res, 200, { q: texto, grupos, pendientes, errores });
});
