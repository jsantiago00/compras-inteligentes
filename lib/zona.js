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
// - Coto: no tiene sucursales en Mendoza y su sitio no permite elegir zona
//   (siempre devuelve los precios de su sucursal por defecto en Buenos Aires),
//   así que queda fuera de las comparaciones.
//
// No sirve resolver la región por código postal: en Vea
// `/api/checkout/pub/regions?postalCode=..` devuelve las mismas regiones
// (todas sus sucursales del país) para cualquier CP.
//
// Para otra dirección: en el sitio del súper, elegir la dirección de entrega y
// mirar en DevTools el `selectedSeller` que se manda a `/api/sessions`.

export const ZONA = {
  nombre: 'Godoy Cruz, Mendoza',
  codigoPostal: '5501',
  // [latitud, longitud] aproximadas (centro de Godoy Cruz).
  coordenadas: [-32.926, -68.845],
  sucursales: {
    jumbo: ['jumboargentinaj5222mendoza'],
    vea: ['jumboargentinav171sarmientoyalen'],
    carrefour: ['carrefourar0029', 'carrefourar0899'],
  },
  // Súper que entregan en la zona (en el orden en que se muestran).
  supers: ['jumbo', 'vea', 'carrefour'],
  // Costo de envío a domicilio (la franja más barata) y mínimo para envío gratis,
  // simulando carritos el 11/10/2026. Jumbo: gratis entre $147.255 y $153.690
  // (se toma $150.000). Vea y Carrefour: sin envío gratis con $134.754 y $167.148.
  // Editables en Ajustes.
  envios: {
    jumbo: { costo: 3999, minimoGratis: 150000 },
    vea: { costo: 3499, minimoGratis: null },
    carrefour: { costo: 3990, minimoGratis: null },
  },
};

/** regionId de VTEX para un conjunto de sucursales (sellers). */
export function regionIdDeSucursales(sucursales) {
  return btoa(`SW#${sucursales.join(';')}`);
}
