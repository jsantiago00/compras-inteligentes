// Adaptador para súper sobre VTEX (Jumbo, Vea, Carrefour).
//
// Usa la API pública de catálogo (no requiere credenciales):
//   GET /api/catalog_system/pub/products/search?ft=<texto>&_from=0&_to=19&sc=<n>
//   GET /api/catalog_system/pub/products/search?fq=alternateIds_Ean:<ean>&sc=<n>
//   GET /api/catalog_system/pub/products/search?fq=skuId:<sku>&sc=<n>
// Zona de entrega: el precio y el stock dependen del "sales channel" (`sc`) y
// de la sucursal que entrega en la dirección, que viaja en la cookie
// `vtex_segment` como regionId. Ver lib/zona.js y README → "Zona de entrega".
//
// Carrito: /checkout/cart/add?sku=<id>&qty=<n>&seller=<id>[&sku=..&qty=..&seller=..]&sc=<n>
// (mismo formato que el `addToCartLink` que devuelve la propia API).

import { regionIdDeSucursales } from '../zona.js';
import { aNumero, parsearContenido, parsearPromoTexto, precioPorUnidad } from './normalizar.js';

// Sales channel por defecto de cada tienda (verificado con
// /api/catalog_system/pub/saleschannel/default el 11/10/2026: Jumbo 32, Vea 34;
// en Jumbo y Vea `sc=1` responde 400 "sc is inactive"; Carrefour acepta 1).
export const TIENDAS_VTEX = {
  jumbo: { base: 'https://www.jumbo.com.ar', sc: '32' },
  vea: { base: 'https://www.vea.com.ar', sc: '34' },
  carrefour: { base: 'https://www.carrefour.com.ar', sc: '1' },
};

// Las promos de VTEX vienen serializadas desde .NET; según la tienda las
// claves son "<Name>k__BackingField" o "name". Las normalizamos.
function limpiarClaves(v) {
  if (Array.isArray(v)) return v.map(limpiarClaves);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      const limpia = k.replace(/^</, '').replace(/>k__BackingField$/, '');
      out[limpia.charAt(0).toLowerCase() + limpia.slice(1)] = limpiarClaves(val);
    }
    return out;
  }
  return v;
}

/** Promo de góndola a partir de los Teasers / PromotionTeasers / DiscountHighLight de VTEX. */
// Promos atadas a un medio de pago (BINs de tarjeta, "Tarjeta Carrefour", etc.)
// no son de góndola: las bancarias del usuario se cargan aparte en `promos`.
const MEDIO_DE_PAGO = /tarjeta|cuenta dni|\bmodo\b|visa|master|banco|bancari|cr[eé]dito|d[eé]bito/i;
function atadaAMedioDePago(t) {
  const params = t.conditions?.parameters ?? [];
  return MEDIO_DE_PAGO.test(t.name ?? '') || params.some((p) => /bin|paymentmethod|cardissuer|installment/i.test(p.name ?? ''));
}

export function promoDesdeTeasers(oferta) {
  const teasers = limpiarClaves([...(oferta?.PromotionTeasers ?? []), ...(oferta?.Teasers ?? [])]).filter((t) => !atadaAMedioDePago(t));
  for (const t of teasers) {
    const porTexto = parsearPromoTexto(t.name);
    if (porTexto) return porTexto;
    const efectos = t.effects?.parameters ?? [];
    const minimo = Number(t.conditions?.minimumQuantity ?? 1) || 1;
    const pct = efectos.find((p) => /percentual/i.test(p.name));
    if (pct) {
      const porcentaje = aNumero(pct.value);
      if (porcentaje) return { tipo: 'porcentaje', porcentaje, minimoUnidades: minimo, texto: t.name };
    }
  }
  for (const d of limpiarClaves(oferta?.DiscountHighLight ?? [])) {
    const p = parsearPromoTexto(d.name);
    // Un "% off" unitario de DiscountHighLight ya está reflejado en Price.
    if (p && p.tipo !== 'porcentaje') return p;
  }
  return null;
}

/** Convierte la respuesta de products/search en productos con la forma común. */
export function parsearProductosVtex(json, { super: sup, base }) {
  const productos = [];
  for (const prod of Array.isArray(json) ? json : []) {
    for (const item of prod.items ?? []) {
      const seller = item.sellers?.find((s) => s.sellerDefault) ?? item.sellers?.[0];
      const oferta = seller?.commertialOffer ?? {};
      const precio = aNumero(oferta.Price);
      // En Jumbo/Vea `ListPrice` viene inflado (~precio sin IVA en centavos), así
      // que el precio "sin descuento" confiable es PriceWithoutDiscount.
      let lista = aNumero(oferta.PriceWithoutDiscount) || aNumero(oferta.ListPrice) || precio;
      if (precio && lista > precio * 5) lista = precio;
      const disponible = Boolean((oferta.IsAvailable ?? oferta.AvailableQuantity > 0) && precio > 0);
      // Con un solo SKU, `nameComplete` repite el nombre (producto + ítem).
      const nombre = (prod.items.length > 1 ? item.nameComplete : prod.productName) || item.nameComplete || item.name;
      let { contenido, unidad } = parsearContenido(nombre);
      // Pesables: VTEX vende por "unitMultiplier" kg (ej. 0.5 kg por unidad).
      if (/^kg$/i.test(item.measurementUnit ?? '') && unidad === 'un') {
        contenido = Number(item.unitMultiplier) || 1;
        unidad = 'kg';
      }
      const precioOferta = precio && lista && precio < lista ? precio : null;
      const link = prod.link?.startsWith('http') ? prod.link : `${base}/${prod.linkText}/p`;
      productos.push({
        super: sup,
        ean: item.ean || null,
        nombre,
        marca: prod.brand ?? null,
        precioLista: lista || null,
        precioOferta,
        promoGondola: disponible ? promoDesdeTeasers(oferta) : null,
        unidad,
        contenido,
        precioPorUnidad: precioPorUnidad(precioOferta ?? lista, contenido, unidad),
        url: link,
        imagen: item.images?.[0]?.imageUrl ?? null,
        sku: String(item.itemId),
        seller: seller?.sellerId ?? '1',
        disponible,
        rubro: prod.categories?.[0] ?? null,
      });
    }
  }
  return productos;
}

/** Link "agregar al carrito" de VTEX con todos los ítems. */
export function urlCarritoVtex(base, items, { sc } = {}) {
  const q = new URLSearchParams();
  for (const it of items) {
    q.append('sku', it.sku);
    q.append('qty', String(Math.max(1, Math.round(it.cantidad ?? it.qty ?? 1))));
    q.append('seller', it.seller ?? '1');
  }
  if (sc) q.append('sc', sc);
  return `${base}/checkout/cart/add?${q.toString()}`;
}

function cookieSegmento({ sc, regionId }) {
  const seg = { channel: sc, countryCode: 'ARG', cultureInfo: 'es-AR', currencyCode: 'ARS', currencySymbol: '$', regionId };
  return `vtex_segment=${Buffer.from(JSON.stringify(seg)).toString('base64')}`;
}

/**
 * @param {'jumbo'|'vea'|'carrefour'} sup
 * @param {object} opts
 * @param {ReturnType<import('./http.js').crearCliente>} opts.cliente
 * @param {string} [opts.sc]           sales channel (default de la tienda)
 * @param {string[]} [opts.sucursales] sellers que entregan en la zona (ver lib/zona.js)
 */
export function crearAdaptadorVtex(sup, { cliente, sc, sucursales, base } = {}) {
  const tienda = TIENDAS_VTEX[sup];
  base = base ?? tienda.base;
  sc = sc ?? tienda.sc;
  const headers = sucursales?.length ? { Cookie: cookieSegmento({ sc, regionId: regionIdDeSucursales(sucursales) }) } : {};

  async function buscarCon(params) {
    const url = `${base}/api/catalog_system/pub/products/search?${params}${sc ? `&sc=${sc}` : ''}`;
    const json = await cliente.json(url, { headers });
    return parsearProductosVtex(json, { super: sup, base });
  }

  return {
    id: sup,
    async buscar(texto, { limite = 20 } = {}) {
      return buscarCon(`ft=${encodeURIComponent(texto)}&_from=0&_to=${limite - 1}`);
    },
    async porEan(ean) {
      const r = await buscarCon(`fq=alternateIds_Ean:${encodeURIComponent(ean)}`);
      return r.find((p) => p.ean === String(ean)) ?? null;
    },
    async porSku(sku) {
      const r = await buscarCon(`fq=skuId:${encodeURIComponent(sku)}`);
      return r.find((p) => p.sku === String(sku)) ?? null;
    },
    carrito(items) {
      return { tipo: 'link', url: urlCarritoVtex(base, items, { sc }) };
    },
  };
}
