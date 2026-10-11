#!/usr/bin/env node
// Diagnóstico de los endpoints reales (para ajustar adaptadores). Imprime
// status, un pedazo del cuerpo y la forma de los datos. Bajo volumen.

import { USER_AGENT } from '../lib/scrapers/http.js';

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
async function probar(url, headers = {}) {
  await espera(1200);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers } });
    const texto = await res.text();
    console.log(`\n### ${res.status} ${url}\n${texto.slice(0, 700).replace(/\s+/g, ' ')}`);
    return { status: res.status, texto };
  } catch (e) {
    console.log(`\n### ERROR ${url}: ${e.message}`);
    return {};
  }
}

for (const host of ['https://www.jumbo.com.ar', 'https://www.vea.com.ar']) {
  await probar(`${host}/api/catalog_system/pub/products/search?ft=coca&_from=0&_to=0`);
  await probar(`${host}/api/catalog_system/pub/products/search?fq=alternateIds_Ean:7790895000997`);
  await probar(`${host}/api/catalog_system/pub/products/search?ft=coca&_from=0&_to=0&sc=1`, { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36' });
  await probar(`${host}/api/catalog_system/pub/products/search/coca?_from=0&_to=0`);
  await probar(`${host}/api/io/_v/api/intelligent-search/product_search/?query=coca&count=1`);
  await probar(`${host}/api/catalog_system/pub/saleschannel/default`);
}

const coto = 'https://www.cotodigital.com.ar/sitios/cdigi/categoria?Dy=1&Nrpp=3&format=json&Ntt=';
for (const q of ['coca cola 2.25', '7790895000997']) {
  const r = await probar(coto + encodeURIComponent(q));
  if (!r.texto) continue;
  const json = JSON.parse(r.texto);
  const vistos = [];
  (function buscar(n, ruta) {
    if (vistos.length >= 2 || !n || typeof n !== 'object') return;
    if (n.attributes && Object.keys(n.attributes).some((k) => /displayName/.test(k))) {
      vistos.push(ruta);
      console.log(`\n--- registro en ${ruta}`);
      for (const [k, v] of Object.entries(n.attributes)) console.log(`  ${k}: ${JSON.stringify(v).slice(0, 160)}`);
      if (n.records?.[0]?.attributes) {
        console.log('  [sub-registro]');
        for (const [k, v] of Object.entries(n.records[0].attributes)) console.log(`    ${k}: ${JSON.stringify(v).slice(0, 160)}`);
      }
      console.log(`  detailsAction: ${JSON.stringify(n.detailsAction ?? n.records?.[0]?.detailsAction).slice(0, 300)}`);
      return;
    }
    for (const [k, v] of Object.entries(n)) buscar(v, `${ruta}.${k}`);
  })(json, '$');
}
