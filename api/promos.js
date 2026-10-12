// GET /api/promos
// Promos bancarias publicadas por Jumbo, Vea, Carrefour y Coto, ya filtradas a los
// medios del usuario (ver lib/promosSuper.js). Se cachean 12 h.

import { promosCarrefour, promosCencosud, promosCoto } from '../lib/promosSuper.js';
import { crearCliente } from '../lib/scrapers/http.js';
import { obtenerAlmacen } from '../lib/servidor/almacen.js';
import { handler, responder } from '../lib/servidor/api.js';

const HORAS = 12;
// Cambiar al sumar fuentes, así no queda la caché vieja (v2: suma Coto; v3: Cuenta Digital Carrefour; v4: todos los bancos).
const CLAVE = 'actual-v4';
const CAMPOS_CARREFOUR = [
  'id', 'title', 'sub_title', 'discount_percentage', 'active_from', 'active_to', 'active', 'legal', 'ecommerce', 'idBank',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
].join(',');

export default handler(async (req, res) => {
  const almacen = await obtenerAlmacen();
  const guardado = await almacen.get('promosSuper', CLAVE);
  if (guardado && Date.now() - guardado.fecha < HORAS * 3600_000) return responder(res, 200, guardado.datos);

  const cliente = crearCliente({ intervaloMs: 1200 });
  const errores = {};
  const promos = [];
  try {
    const r = await cliente.json('https://www.jumbo.com.ar/api/dataentities/JN/documents/bankDiscount?_fields=value,id&an=jumboargentina');
    promos.push(...promosCencosud(JSON.parse(r.value)));
  } catch (e) {
    errores.cencosud = e.message;
  }
  try {
    const base = 'https://www.carrefour.com.ar/api/dataentities';
    const rango = { headers: { 'REST-Range': 'resources=0-299' } };
    const where = encodeURIComponent('active=true');
    const [bp, bancos] = [await cliente.json(`${base}/BP/search?_fields=${CAMPOS_CARREFOUR}&_where=${where}`, rango), await cliente.json(`${base}/FB/search?_fields=id,name`, rango)];
    promos.push(...promosCarrefour(bp, bancos));
  } catch (e) {
    errores.carrefour = e.message;
  }

  try {
    promos.push(...promosCoto(await cliente.json('https://www.coto.com.ar/rest/model/atg/actors/cProfileActor/getPromocionesMulticanal?enviroment=ag')));
  } catch (e) {
    errores.coto = e.message;
  }

  const datos = { relevado: new Date().toISOString().slice(0, 10), promos, errores };
  if (!Object.keys(errores).length) await almacen.set('promosSuper', CLAVE, { fecha: Date.now(), datos });
  responder(res, 200, datos);
});
