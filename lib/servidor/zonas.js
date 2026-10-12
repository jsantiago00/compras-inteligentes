// Resolver la zona de entrega de un código postal: qué sucursal de cada súper
// hace envío a domicilio ahí y cuánto cuesta. Replica lo que hacen los sitios
// cuando el usuario elige su dirección (ver lib/zona.js):
//
// 1. Coordenadas del CP: GET /api/checkout/pub/postal-code/ARG/<cp> (VTEX).
// 2. Jumbo y Vea: sucursales con envío (/api/dataentities/NT/search, traen
//    coordenadas) → se simula el checkout en las más cercanas con un producto
//    de prueba (el mismo que usa el sitio de Vea) y gana la primera que ofrece
//    "Envío a Domicilio". El costo es la franja horaria más barata.
// 3. Carrefour: /api/checkout/pub/regions?geoCoordinates=.. da las sucursales;
//    se confirma el envío simulando un producto con stock en esa región.
// 4. Coto: su sitio no permite elegir zona; se incluye solo en CABA y
//    provincia de Buenos Aires, con aviso.

import { SUPERS } from '../constantes.js';
import { TIENDAS_VTEX } from '../scrapers/vtex.js';
import { regionIdDeSucursales } from '../zona.js';

// Producto que usa el sitio de Vea para probar si una sucursal entrega en una
// dirección (sirve también en Jumbo: comparten catálogo).
const PRODUCTO_PRUEBA = 253158;
const MAX_KM = 60;
const CANDIDATAS = 4;
export const DIAS_CACHE_ZONA = 7;

function distanciaKm([lat1, lng1], [lat2, lng2]) {
  const rad = (g) => (g * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

/** Costo del "Envío a Domicilio" de una simulación de checkout, o null si no hay envío. */
export function costoEnvio(simulacion) {
  const sla = (simulacion?.logisticsInfo ?? []).flatMap((l) => l.slas ?? []).find((s) => /env[ií]o/i.test(s.id ?? s.name ?? ''));
  if (!sla) return null;
  const franjas = sla.availableDeliveryWindows ?? [];
  const centavos = franjas.length ? Math.min(...franjas.map((f) => (f.price ?? 0) + (f.tax ?? 0))) : (sla.price ?? 0);
  return centavos / 100;
}

function simular(cliente, sup, sc, item, coordenadas) {
  const [lat, lng] = coordenadas;
  return cliente.json(`${TIENDAS_VTEX[sup].base}/api/checkout/pub/orderForms/simulation?sc=${sc}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [item], geoCoordinates: [lng, lat], country: 'ARG' }),
  });
}

async function sucursalCencosud(cliente, sup, sc, coordenadas) {
  const filtro = encodeURIComponent('hasDelivery=true AND isActive=true');
  const tiendas = await cliente.json(`${TIENDAS_VTEX[sup].base}/api/dataentities/NT/search?_fields=SellerName,name,geocoordinates&_where=${filtro}`, {
    headers: { 'REST-Range': 'resources=0-99' },
  });
  const cercanas = new Map();
  for (const t of tiendas ?? []) {
    const [lat, lng] = String(t.geocoordinates ?? '').split(',').map(Number);
    if (!t.SellerName || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const km = distanciaKm(coordenadas, [lat, lng]);
    if (km > MAX_KM) continue;
    if (!cercanas.has(t.SellerName) || cercanas.get(t.SellerName).km > km) cercanas.set(t.SellerName, { seller: t.SellerName, nombre: t.name, km });
  }
  for (const t of [...cercanas.values()].sort((a, b) => a.km - b.km).slice(0, CANDIDATAS)) {
    const sim = await simular(cliente, sup, sc, { id: PRODUCTO_PRUEBA, quantity: 1, seller: t.seller }, coordenadas);
    const costo = costoEnvio(sim);
    if (costo != null) return { sucursales: [t.seller], nombre: t.nombre, costo };
  }
  return null;
}

async function sucursalCarrefour(cliente, sc, coordenadas) {
  const [lat, lng] = coordenadas;
  const base = TIENDAS_VTEX.carrefour.base;
  const regiones = await cliente.json(`${base}/api/checkout/pub/regions?country=ARG&geoCoordinates=${lng};${lat}&sc=${sc}`);
  const sellers = (regiones?.[0]?.sellers ?? []).filter((s) => /^[a-z0-9]+$/.test(s.id));
  if (!sellers.length) return null;
  const sucursales = sellers.map((s) => s.id);
  // Un producto con stock en esa región para confirmar el envío.
  const seg = Buffer.from(JSON.stringify({ channel: String(sc), countryCode: 'ARG', cultureInfo: 'es-AR', currencyCode: 'ARS', currencySymbol: '$', regionId: regionIdDeSucursales(sucursales) })).toString('base64');
  const productos = await cliente.json(`${base}/api/catalog_system/pub/products/search?ft=agua&_from=0&_to=9&sc=${sc}`, { headers: { Cookie: `vtex_segment=${seg}` } });
  const item = (productos ?? []).map((p) => p.items?.[0]).find((i) => i?.sellers?.[0]?.commertialOffer?.AvailableQuantity > 0);
  if (!item) return null;
  const sim = await simular(cliente, 'carrefour', sc, { id: item.itemId, quantity: 1, seller: item.sellers[0].sellerId }, coordenadas);
  const costo = costoEnvio(sim);
  if (costo == null) return null;
  const nombre = sellers.map((s) => s.name).filter((n) => n && !/^carrefourar\d+$/.test(n)).join(' / ') || sucursales.join(', ');
  return { sucursales, nombre, costo };
}

/**
 * @param {object} p
 * @param {string} p.codigoPostal  4 dígitos
 * @param {ReturnType<import('../scrapers/http.js').crearCliente>} p.cliente
 * @param {Record<string, string|undefined>} [p.env]
 */
export async function resolverZona({ codigoPostal, cliente, env = {} }) {
  const cp = String(codigoPostal ?? '').trim();
  if (!/^\d{4}$/.test(cp)) {
    const e = new Error('El código postal tiene que tener 4 números (por ejemplo 5501)');
    e.status = 400;
    throw e;
  }
  const geo = await cliente.json(`${TIENDAS_VTEX.vea.base}/api/checkout/pub/postal-code/ARG/${cp}`);
  const [lng, lat] = geo?.geoCoordinates ?? [];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    const e = new Error(`No encontré el código postal ${cp}`);
    e.status = 400;
    throw e;
  }
  const coordenadas = [lat, lng];
  const zona = {
    codigoPostal: cp,
    localidad: String(geo.city ?? '').split('::')[0],
    provincia: geo.state ?? '',
    coordenadas,
    supers: [],
    sucursales: {},
    nombresSucursales: {},
    envios: {},
    avisos: [],
  };
  const sc = { jumbo: env.VTEX_SC_JUMBO ?? TIENDAS_VTEX.jumbo.sc, vea: env.VTEX_SC_VEA ?? TIENDAS_VTEX.vea.sc, carrefour: env.VTEX_SC_CARREFOUR ?? TIENDAS_VTEX.carrefour.sc };
  const buscar = {
    jumbo: () => sucursalCencosud(cliente, 'jumbo', sc.jumbo, coordenadas),
    vea: () => sucursalCencosud(cliente, 'vea', sc.vea, coordenadas),
    carrefour: () => sucursalCarrefour(cliente, sc.carrefour, coordenadas),
  };
  const resultados = await Promise.all(
    Object.entries(buscar).map(async ([sup, fn]) => {
      try {
        return [sup, await fn()];
      } catch (e) {
        zona.avisos.push(`${SUPERS[sup]}: no pude averiguar si entrega (${e.message})`);
        return [sup, null];
      }
    }),
  );
  for (const [sup, r] of resultados) {
    if (!r) {
      if (!zona.avisos.some((a) => a.startsWith(SUPERS[sup]))) zona.avisos.push(`${SUPERS[sup]} no hace envío a domicilio a esa zona`);
      continue;
    }
    zona.supers.push(sup);
    zona.sucursales[sup] = r.sucursales;
    zona.nombresSucursales[sup] = r.nombre;
    zona.envios[sup] = { costo: r.costo, minimoGratis: null };
  }
  if (/mendoza/i.test(zona.provincia)) {
    // Hipermercado de Mendoza (Perú y Pellegrini), con stock propio en el sitio.
    zona.supers.push('coto');
    zona.sucursales.coto = ['209'];
    zona.nombresSucursales.coto = 'Coto Mendoza (Perú y Pellegrini)';
    zona.envios.coto = { costo: null, minimoGratis: null };
    zona.avisos.push('Coto: sucursal de Mendoza. Verificá en coto.com.ar que entregue en tu dirección y cargá su costo de envío.');
  } else if (/buenos aires/i.test(zona.provincia)) {
    zona.supers.push('coto');
    zona.envios.coto = { costo: null, minimoGratis: null };
    zona.avisos.push('Coto: su sitio no permite elegir zona, así que muestra los precios de su sucursal por defecto. Verificá que entregue en tu dirección y cargá su costo de envío.');
  }
  return zona;
}
