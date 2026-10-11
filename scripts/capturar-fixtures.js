#!/usr/bin/env node
// npm run fixtures:capturar — captura UNA vez respuestas reales de los súper y
// las guarda en tests/fixtures/ (bajo volumen: ~6 requests por súper).
// Las respuestas se guardan tal cual vienen, solo recortando campos que los
// adaptadores no usan (descripciones largas, clusters, especificaciones) para
// que los fixtures no pesen megas.

import { writeFileSync } from 'node:fs';
import { crearCliente } from '../lib/scrapers/http.js';
import { TIENDAS_VTEX } from '../lib/scrapers/vtex.js';
import { BASE_COTO } from '../lib/scrapers/coto.js';

const DIR = new URL('../tests/fixtures/', import.meta.url);
const TEXTOS = ['coca cola 2.25', 'yerba playadito', 'leche la serenisima entera', 'arroz gallo oro', 'aceite natura', 'fernet branca'];
const cliente = crearCliente({ intervaloMs: 1500 });

const CAMPOS_PRODUCTO = ['productId', 'productName', 'brand', 'brandId', 'linkText', 'productReference', 'categoryId', 'categories', 'categoriesIds', 'link', 'items'];
const CAMPOS_ITEM = ['itemId', 'name', 'nameComplete', 'complementName', 'ean', 'referenceId', 'measurementUnit', 'unitMultiplier', 'images', 'sellers'];
const CAMPOS_OFERTA = ['Price', 'ListPrice', 'PriceWithoutDiscount', 'PriceValidUntil', 'AvailableQuantity', 'IsAvailable', 'Teasers', 'PromotionTeasers', 'DiscountHighLight'];
const elegir = (o, campos) => Object.fromEntries(campos.filter((c) => c in o).map((c) => [c, o[c]]));

function recortarVtex(p) {
  return {
    ...elegir(p, CAMPOS_PRODUCTO),
    items: p.items.map((i) => ({
      ...elegir(i, CAMPOS_ITEM),
      images: (i.images ?? []).slice(0, 1).map((im) => elegir(im, ['imageId', 'imageUrl'])),
      sellers: (i.sellers ?? []).map((s) => ({ ...elegir(s, ['sellerId', 'sellerName', 'addToCartLink', 'sellerDefault']), commertialOffer: elegir(s.commertialOffer ?? {}, CAMPOS_OFERTA) })),
    })),
  };
}

for (const [sup, t] of Object.entries(TIENDAS_VTEX)) {
  const productos = new Map();
  for (const texto of TEXTOS) {
    try {
      const r = await cliente.json(`${t.base}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(texto)}&_from=0&_to=1&sc=${t.sc}`);
      for (const p of r) productos.set(p.productId, recortarVtex(p));
    } catch (e) {
      console.error(`${sup} "${texto}": ${e.message}`);
    }
  }
  if (productos.size) {
    writeFileSync(new URL(`vtex-${sup}-busqueda.json`, DIR), JSON.stringify([...productos.values()], null, 1) + '\n');
    console.log(`${sup}: ${productos.size} productos guardados`);
  }
}

// Coto: guardamos la estructura Endeca de la primera respuesta y juntamos los
// registros de todas las búsquedas en su ResultsList.
const IGNORAR_COTO = /^product\.(sDisp_\d+|ldescr|longDescription|keywords|dtoCaracteristicas|auxiliaryMedia)$|^DGraph\./;
function recortarRegistro(r) {
  const limpio = { ...r };
  if (r.attributes) limpio.attributes = Object.fromEntries(Object.entries(r.attributes).filter(([k]) => !IGNORAR_COTO.test(k)));
  if (r.records) limpio.records = r.records.map(recortarRegistro);
  if (r.detailsAction) limpio.detailsAction = { recordState: r.detailsAction.recordState };
  return limpio;
}
function listaResultados(nodo) {
  if (!nodo || typeof nodo !== 'object') return null;
  if (Array.isArray(nodo.records) && 'totalNumRecs' in nodo) return nodo;
  for (const v of Object.values(nodo)) {
    const r = listaResultados(v);
    if (r) return r;
  }
  return null;
}
let base = null;
const registros = new Map();
for (const texto of TEXTOS) {
  try {
    const r = await cliente.json(`${BASE_COTO}/sitios/cdigi/categoria?Dy=1&Ntt=${encodeURIComponent(texto)}&Nrpp=2&format=json`);
    base ??= r;
    for (const reg of listaResultados(r)?.records ?? []) registros.set(JSON.stringify(reg.attributes?.['product.repositoryId'] ?? reg.records?.[0]?.attributes?.['product.repositoryId']), recortarRegistro(reg));
  } catch (e) {
    console.error(`coto "${texto}": ${e.message}`);
  }
}
if (base) {
  const lista = listaResultados(base);
  // Solo dejamos el contenedor principal con la lista de resultados.
  const main = base.contents?.[0]?.Main?.find((m) => listaResultados(m) === lista || JSON.stringify(m).includes('"totalNumRecs"'));
  const salida = { '@type': base['@type'], contents: [{ '@type': base.contents?.[0]?.['@type'], Main: [{ '@type': main?.['@type'], contents: [{ '@type': lista['@type'] ?? 'ResultsList', totalNumRecs: registros.size, records: [...registros.values()] }] }] }] };
  writeFileSync(new URL('coto-busqueda.json', DIR), JSON.stringify(salida, null, 1) + '\n');
  console.log(`coto: ${registros.size} registros guardados`);
}
