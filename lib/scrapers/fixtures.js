// `fetch` de mentira que responde con los fixtures guardados en
// tests/fixtures/, filtrando como lo harían los sitios reales. Se usa en los
// tests y en el modo demo (SCRAPERS_FIXTURES=1), nunca en producción.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sinAcentos } from './normalizar.js';

const DIR = fileURLToPath(new URL('../../tests/fixtures/', import.meta.url));
const cache = new Map();

export function leerFixture(nombre) {
  if (!cache.has(nombre)) cache.set(nombre, JSON.parse(readFileSync(DIR + nombre, 'utf8')));
  return structuredClone(cache.get(nombre));
}

const norm = (s) => sinAcentos(s).toLowerCase();
const coincideTexto = (texto, ...campos) => {
  const palabras = norm(texto).split(/\s+/).filter(Boolean);
  const hay = norm(campos.filter(Boolean).join(' '));
  return palabras.every((p) => hay.includes(p));
};

const respuesta = (cuerpo, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } });

function vtex(url, sup) {
  const productos = leerFixture(`vtex-${sup}-busqueda.json`);
  if (url.pathname.endsWith('/regions')) return respuesta([{ id: 'v2.FIXTURE', sellers: [{ id: '1', name: sup }] }]);
  const fq = url.searchParams.get('fq');
  const ft = url.searchParams.get('ft');
  let r = productos;
  if (fq?.startsWith('alternateIds_Ean:')) {
    const ean = fq.split(':')[1];
    r = productos.filter((p) => p.items.some((i) => i.ean === ean));
  } else if (fq?.startsWith('skuId:')) {
    const sku = fq.split(':')[1];
    r = productos.filter((p) => p.items.some((i) => i.itemId === sku));
  } else if (ft) {
    r = productos.filter((p) => coincideTexto(ft, p.productName, p.brand));
  }
  const desde = Number(url.searchParams.get('_from') ?? 0);
  const hasta = Number(url.searchParams.get('_to') ?? 9);
  return respuesta(r.slice(desde, hasta + 1));
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

// Imita Endeca: Ntt busca texto (no EAN); Nr=AND(atributo:valor) filtra por atributo.
function coto(url) {
  const json = leerFixture('coto-busqueda.json');
  const ntt = url.searchParams.get('Ntt');
  const nr = url.searchParams.get('Nr')?.match(/^AND\(([^:]+):(.+)\)$/);
  const lista = listaResultados(json);
  const attrs = (r) => ({ ...r.attributes, ...(r.records?.[0]?.attributes ?? {}) });
  lista.records = lista.records.filter((r) => {
    const a = attrs(r);
    if (nr) return a[nr[1]]?.[0] === nr[2];
    return ntt != null && coincideTexto(ntt, a['product.displayName']?.[0], a['product.brand']?.[0]);
  });
  lista.totalNumRecs = lista.records.length;
  return respuesta(json);
}

export async function fetchFixtures(input) {
  const url = new URL(typeof input === 'string' ? input : input.url);
  const host = url.host.replace(/^www\./, '');
  if (host === 'jumbo.com.ar') return vtex(url, 'jumbo');
  if (host === 'vea.com.ar') return vtex(url, 'vea');
  if (host === 'carrefour.com.ar') return vtex(url, 'carrefour');
  if (host === 'cotodigital.com.ar') return coto(url);
  return respuesta({ error: 'sin fixture' }, 404);
}
