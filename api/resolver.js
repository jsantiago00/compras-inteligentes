// POST /api/resolver  { texto: "2 yerba playadito\nleche\narroz 1kg", zona?, demo? }
// Lista libre: busca cada renglón en los súper de la zona y elige un producto por súper.

import { claveLibre, elegirProductos, parsearLinea, refProducto, separarLineas } from '../lib/motor/listaLibre.js';
import { crearAdaptadores } from '../lib/scrapers/index.js';
import { almacenDeZona, almacenMemoria, obtenerAlmacen } from '../lib/servidor/almacen.js';
import { cuerpo, errorCliente, handler, responder } from '../lib/servidor/api.js';
import { buscarEnSupers } from '../lib/servidor/busqueda.js';
import { sufijoZona, zonaDePedido } from '../lib/zona.js';

export const MAXIMO_RENGLONES = 30;

export default handler(async (req, res) => {
  if (req.method !== 'POST') throw errorCliente('Usar POST');
  const { texto, demo, zona: z } = await cuerpo(req);
  const zona = zonaDePedido(z);
  const lineas = separarLineas(texto);
  if (!lineas.length) throw errorCliente('La lista está vacía');
  if (lineas.length > MAXIMO_RENGLONES) throw errorCliente(`Máximo ${MAXIMO_RENGLONES} renglones por vez`);

  const almacen = demo ? almacenMemoria() : almacenDeZona(await obtenerAlmacen(), sufijoZona(zona));
  const adaptadores = await crearAdaptadores({ demo: Boolean(demo), zona });
  // Los renglones van en paralelo; el rate limiting por host del cliente HTTP
  // hace que a cada súper le lleguen de a uno.
  const renglones = await Promise.all(
    lineas.map(async (linea) => {
      const { texto: t, cantidad } = parsearLinea(linea);
      const { porSuper, errores } = await buscarEnSupers({ texto: t, supers: zona.supers, adaptadores, almacen, limite: 24 });
      const r = elegirProductos(t, porSuper);
      return {
        linea,
        texto: t,
        cantidad,
        clave: claveLibre(t),
        ean: r.ean,
        elegidos: Object.fromEntries(Object.entries(r.elegidos).map(([s, p]) => [s, refProducto(p)])),
        alternativas: Object.fromEntries(Object.entries(r.alternativas).map(([s, ps]) => [s, ps.map(refProducto)])),
        rubro: Object.values(r.elegidos)[0]?.rubro ?? null,
        imagen: Object.values(r.elegidos)[0]?.imagen ?? null,
        errores,
      };
    }),
  );
  responder(res, 200, { renglones });
});
