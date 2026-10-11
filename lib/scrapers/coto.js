// Adaptador para Coto Digital.
//
// Coto no está en VTEX: el sitio (www.cotodigital.com.ar/sitios/cdigi/) usa
// Oracle Commerce / Endeca, que devuelve JSON agregando `format=json` a las
// URLs de búsqueda y de producto:
//   GET /sitios/cdigi/categoria?Dy=1&Ntt=<texto>&Nrpp=<n>&format=json
// La búsqueda por texto también matchea el EAN, así que `porEan` busca el
// código y filtra por `product.eanPrincipal`.
// La estructura es anidada (contents → Main → contents → records → records),
// así que el parser busca los registros recursivamente en vez de depender de
// índices fijos.
//
// Carrito: no hay un link público para agregar varios productos al carrito,
// así que devolvemos la lista con links a cada producto.

import { aNumero, parsearContenido, parsearPromoTexto, precioPorUnidad } from './normalizar.js';

export const BASE_COTO = 'https://www.cotodigital.com.ar';
const RUTA = '/sitios/cdigi';

const attr = (a, k) => {
  const v = a?.[k];
  return Array.isArray(v) ? v[0] : v ?? null;
};

function* registros(nodo) {
  if (Array.isArray(nodo)) {
    for (const n of nodo) yield* registros(n);
    return;
  }
  if (!nodo || typeof nodo !== 'object') return;
  if (nodo.attributes && (nodo.attributes['product.displayName'] || nodo.attributes['sku.displayName'])) {
    yield nodo;
    return;
  }
  for (const v of Object.values(nodo)) if (v && typeof v === 'object') yield* registros(v);
}

// Descuentos que dependen de medios que el usuario no tiene.
const DESCUENTO_AJENO = /tarjeta coto|comunidad coto|\btco\b|cuenta dni|socios?/i;

function leerDescuentos(raw) {
  if (!raw) return [];
  try {
    const lista = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

export function parsearProductosCoto(json) {
  const productos = [];
  const vistos = new Set();
  for (const reg of registros(json)) {
    // El registro de producto trae los datos del SKU en un sub-registro.
    const sku = reg.records?.[0] ?? reg;
    const a = { ...(reg.attributes ?? {}), ...(sku.attributes ?? {}) };
    const nombre = attr(a, 'product.displayName') ?? attr(a, 'sku.displayName');
    const skuId = attr(a, 'sku.repositoryId') ?? attr(a, 'product.repositoryId') ?? attr(a, 'record.id');
    if (!nombre || !skuId || vistos.has(skuId)) continue;
    vistos.add(skuId);

    const activo = aNumero(attr(a, 'sku.activePrice'));
    const lista = aNumero(attr(a, 'sku.listPrice')) || activo;
    let precioOferta = activo && lista && activo < lista ? activo : null;
    let promoGondola = null;
    for (const d of leerDescuentos(attr(a, 'product.dtoDescuentos'))) {
      const texto = [d.textoDescuento, d.textoLlevando].filter(Boolean).join(' ');
      if (!texto || DESCUENTO_AJENO.test(`${texto} ${d.textoPrecioRegular ?? ''}`)) continue;
      const promo = parsearPromoTexto(texto);
      if (!promo) continue;
      if (promo.tipo === 'porcentaje' && promo.minimoUnidades <= 1) {
        const p = aNumero(d.precioDescuento);
        if (p && (!precioOferta || p < precioOferta)) precioOferta = p;
      } else if (!promoGondola) {
        promoGondola = promo;
      }
    }

    const { contenido, unidad } = parsearContenido(nombre);
    const estado = (sku.detailsAction ?? reg.detailsAction)?.recordState?.split('?')[0];
    const imagen = attr(a, 'product.largeImage.url') ?? attr(a, 'product.mediumImage.url') ?? attr(a, 'sku.mediumImage.url');
    const disponible = Boolean(activo) && attr(a, 'sku.availability') !== 'OUTOFSTOCK';
    productos.push({
      super: 'coto',
      ean: attr(a, 'product.eanPrincipal') ?? attr(a, 'sku.eanPrincipal') ?? null,
      nombre,
      marca: attr(a, 'product.brand') ?? attr(a, 'product.marca') ?? null,
      precioLista: lista || null,
      precioOferta,
      promoGondola,
      unidad,
      contenido,
      precioPorUnidad: precioPorUnidad(precioOferta ?? lista, contenido, unidad),
      url: estado ? `${BASE_COTO}${RUTA}/productos${estado}` : `${BASE_COTO}${RUTA}/categoria?Ntt=${encodeURIComponent(nombre)}`,
      imagen: imagen ? (imagen.startsWith('http') ? imagen : `https://static.cotodigital3.com.ar${imagen}`) : null,
      sku: String(skuId),
      disponible,
      rubro: attr(a, 'product.LDEPAR') ?? attr(a, 'product.category') ?? null,
    });
  }
  return productos;
}

export function crearAdaptadorCoto({ cliente, base = BASE_COTO } = {}) {
  async function buscar(texto, { limite = 20 } = {}) {
    const url = `${base}${RUTA}/categoria?Dy=1&Ntt=${encodeURIComponent(texto)}&Nrpp=${limite}&format=json`;
    return parsearProductosCoto(await cliente.json(url));
  }
  return {
    id: 'coto',
    buscar,
    async porEan(ean) {
      const r = await buscar(String(ean), { limite: 5 });
      return r.find((p) => p.ean === String(ean)) ?? null;
    },
    async porSku(sku) {
      const r = await buscar(String(sku), { limite: 5 });
      return r.find((p) => p.sku === String(sku)) ?? null;
    },
    carrito(items) {
      return { tipo: 'lista', items: items.map((it) => ({ nombre: it.nombre, cantidad: it.cantidad, url: it.url })) };
    },
  };
}
