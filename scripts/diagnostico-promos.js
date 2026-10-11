#!/usr/bin/env node
// Diagnóstico de fuentes de promos bancarias (APIs públicas de Macro, MODO y
// Semana Nación del BNA). Imprime estructura y ejemplos.

import { USER_AGENT } from '../lib/scrapers/http.js';

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
async function ver(url, { max = 3000, headers = {} } = {}) {
  await espera(1200);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json, text/html', ...headers } });
    const t = await res.text();
    console.log(`\n### ${res.status} ${res.headers.get('content-type')} ${url} (${t.length} bytes)`);
    console.log(t.replace(/\s+/g, ' ').slice(0, max));
    return t;
  } catch (e) {
    console.log(`\n### ERROR ${url}: ${e.message} ${e.cause?.code ?? ''}`);
    return '';
  }
}

// Macro
await ver('https://apipublic.macro.com.ar/v1/card-benefits/categories', { max: 2500 });
for (const k of ['coto', 'carrefour', 'jumbo', 'vea']) await ver(`https://apipublic.macro.com.ar/v1/card-benefits/predictive?keyword=${k}`, { max: 2500 });
await ver('https://apipublic.macro.com.ar/v1/card-benefits/?keyword=coto', { max: 4000 });
await ver('https://apipublic.macro.com.ar/v1/card-benefits/?page=1', { max: 2500 });

// MODO: buscar en el HTML cómo llama a promoshub
const html = await ver('https://www.modo.com.ar/promos', { max: 0 });
for (const m of html.matchAll(/.{0,200}promoshub.{0,300}/g)) console.log('  [modo]', m[0].replace(/\s+/g, ' '));
const chunks = [...new Set([...html.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g)].map((m) => m[0]))];
console.log('  chunks:', chunks.length);
for (const c of chunks.slice(0, 40)) {
  await espera(300);
  try {
    const js = await (await fetch('https://www.modo.com.ar' + c, { headers: { 'User-Agent': USER_AGENT } })).text();
    for (const m of js.matchAll(/.{0,160}promoshub.{0,260}/g)) console.log('  [chunk]', c.split('/').pop(), m[0]);
  } catch {}
}
await ver('https://promoshub.modo.com.ar/', { max: 800 });
await ver('https://promoshub.modo.com.ar/api/promos?category=supermercados', { max: 1500 });

// BNA Semana Nación
await ver('https://semananacion.com.ar/semananacion/coto', { max: 2500 });
await ver('https://semananacion.com.ar/', { max: 2500 });
