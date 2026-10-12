// Zona de entrega del usuario: Arizu 127, Godoy Cruz, Mendoza (CP 5501).
//
// Precio y stock dependen de la sucursal que entrega en la dirección. En los
// súper VTEX la sucursal viaja en la cookie `vtex_segment` como
// `regionId = base64("SW#<seller>;<seller>…")`; es lo mismo que hace el sitio
// cuando el usuario elige su dirección.
//
// Verificado el 11/10/2026 simulando el checkout con coordenadas de Godoy Cruz
// (POST /api/checkout/pub/orderForms/simulation con geoCoordinates):
// - Jumbo: `jumboargentinaj5222mendoza` (Jumbo Godoy Cruz, Balcarce 897) → "Envío a Domicilio".
// - Vea: `jumboargentinav171sarmientoyalen` (Vea Godoy Cruz, Sarmiento 998) → "Envío a Domicilio".
//   Las otras sucursales de Mendoza solo ofrecen retiro.
// - Carrefour: `/api/checkout/pub/regions?geoCoordinates=..` devuelve
//   `carrefourar0029` (Hiper Mendoza Azul) y `carrefourar0899` (Hogar & Electro) → "Envío a Domicilio".
// - Coto: sucursal 209, el hipermercado de Mendoza (Perú y Pellegrini, Ciudad
//   de Mendoza), que está en el catálogo online con stock propio
//   (`product.sDisp_209`). Los precios son los de la lista nacional, salvo que la
//   sucursal tenga lista propia (ver lib/scrapers/coto.js). Verificado el 12/10/2026;
//   entrega en Arizu 127 con envío de $3.990 (lo confirmó el usuario en coto.com.ar).
//
// No sirve resolver la región por código postal: en Vea
// `/api/checkout/pub/regions?postalCode=..` devuelve las mismas regiones
// (todas sus sucursales del país) para cualquier CP.
//
// Para otra dirección: en el sitio del súper, elegir la dirección de entrega y
// mirar en DevTools el `selectedSeller` que se manda a `/api/sessions`.

// Zona ya verificada a mano (Godoy Cruz, CP 5501). Es la que usa el server
// cuando el pedido no trae zona, y la que se devuelve para ese código postal.
export const ZONA = {
  nombre: 'Godoy Cruz, Mendoza',
  codigoPostal: '5501',
  // [latitud, longitud] aproximadas (centro de Godoy Cruz).
  coordenadas: [-32.926, -68.845],
  sucursales: {
    jumbo: ['jumboargentinaj5222mendoza'],
    vea: ['jumboargentinav171sarmientoyalen'],
    carrefour: ['carrefourar0029', 'carrefourar0899'],
    coto: ['209'],
  },
  nombresSucursales: { jumbo: 'Jumbo Godoy Cruz', vea: 'Vea Godoy Cruz (Sarmiento 998)', carrefour: 'Hiper Mendoza Azul', coto: 'Coto Mendoza (Perú y Pellegrini)' },
  // Súper que entregan en la zona (en el orden en que se muestran).
  supers: ['jumbo', 'vea', 'carrefour', 'coto'],
  // Costo de envío a domicilio (la franja más barata) y mínimo para envío gratis,
  // simulando carritos el 11/10/2026. Jumbo: gratis entre $147.255 y $153.690
  // (se toma $150.000). Vea y Carrefour: sin envío gratis con $134.754 y $167.148.
  // Editables en Ajustes.
  envios: {
    jumbo: { costo: 3999, minimoGratis: 150000 },
    vea: { costo: 3499, minimoGratis: null },
    carrefour: { costo: 3990, minimoGratis: null },
    // Coto: lo informó el usuario el 12/10/2026 desde coto.com.ar con su dirección.
    coto: { costo: 3990, minimoGratis: null },
  },
};

/** regionId de VTEX para un conjunto de sucursales (sellers). */
export function regionIdDeSucursales(sucursales) {
  return btoa(`SW#${sucursales.join(';')}`);
}

const SUPERS_VALIDOS = ['jumbo', 'vea', 'carrefour', 'coto'];
const SUCURSAL_VALIDA = /^[a-z0-9]{1,60}$/;

/**
 * Zona que manda el navegador (dirección activa del usuario), validada:
 * `{ supers, sucursales }`. Acepta el objeto o su JSON; sin zona, la de arriba.
 */
export function zonaDePedido(valor) {
  let z = valor;
  if (typeof z === 'string') {
    try {
      z = JSON.parse(z);
    } catch {
      z = null;
    }
  }
  if (!z || typeof z !== 'object') return ZONA;
  const supers = Array.isArray(z.supers) ? SUPERS_VALIDOS.filter((s) => z.supers.includes(s)) : [];
  const sucursales = {};
  for (const s of ['jumbo', 'vea', 'carrefour', 'coto']) {
    const lista = z.sucursales?.[s];
    if (Array.isArray(lista) && lista.length && lista.length <= 10 && lista.every((x) => SUCURSAL_VALIDA.test(x))) sucursales[s] = lista;
  }
  // Un súper VTEX sin sucursal daría precios de otra zona: se descarta.
  const validos = supers.filter((s) => s === 'coto' || sucursales[s]);
  return validos.length ? { supers: validos, sucursales } : ZONA;
}

/**
 * Sufijo para separar en la caché los precios de cada zona ('' para la zona
 * principal, así sus datos no cambian de clave).
 */
export function sufijoZona(zona) {
  const firma = JSON.stringify(['jumbo', 'vea', 'carrefour', 'coto'].map((s) => zona.sucursales?.[s] ?? []));
  const principal = JSON.stringify(['jumbo', 'vea', 'carrefour', 'coto'].map((s) => ZONA.sucursales[s] ?? []));
  if (firma === principal) return '';
  let h = 5381;
  for (const c of firma) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  return `~${h.toString(36)}`;
}
