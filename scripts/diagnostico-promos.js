#!/usr/bin/env node
// Diagnóstico: ¿se pueden leer las promos de supermercados desde las páginas
// oficiales de los bancos / MODO? Imprime texto relevante y pistas de APIs.

import { USER_AGENT } from '../lib/scrapers/http.js';

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const plano = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');

async function ver(url, { patron = /coto|jumbo|\bvea\b|carrefour|disco/gi, max = 12, ancho = 500, pistas = false } = {}) {
  await espera(1500);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/json' } });
    const html = await res.text();
    console.log(`\n### ${res.status} ${url} (${html.length} bytes)`);
    const t = plano(html);
    const vistos = new Set();
    let n = 0;
    for (const m of t.matchAll(new RegExp(`.{0,120}(?:${patron.source}).{0,${ancho}}`, 'gi'))) {
      const k = m[0].slice(100, 220);
      if (vistos.has(k)) continue;
      vistos.add(k);
      console.log('  …', m[0]);
      if (++n >= max) break;
    }
    if (pistas) {
      const apis = [...new Set([...html.matchAll(/https?:\/\/[a-z0-9.-]*(?:api|graphql|cms|contentful|strapi|promo)[a-z0-9.-]*\.[a-z]{2,}[^"'\s<>)]*/gi)].map((x) => x[0]))].slice(0, 30);
      console.log('  apis:', apis.join('\n        '));
      const next = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (next) console.log('  __NEXT_DATA__:', next[1].slice(0, 1500));
      const sup = [...html.matchAll(/.{0,200}supermercad.{0,300}/gi)].slice(0, 5).map((x) => x[0].replace(/\s+/g, ' '));
      for (const s of sup) console.log('  [raw]', s);
    }
    return html;
  } catch (e) {
    console.log(`\n### ERROR ${url}: ${e.message}`);
    return '';
  }
}

await ver('https://www.bna.com.ar/Personas/DescuentosYPromociones/4551/supermercados/', { max: 30, ancho: 700 });
await ver('https://www.bna.com.ar/Personas/DescuentosYPromociones/Categoria/1/supermercados', { max: 30, ancho: 300, pistas: true });
await ver('https://www.macro.com.ar/beneficios', { patron: /supermerc/gi, max: 10, pistas: true });
await ver('https://www.modo.com.ar/promos', { pistas: true });
await ver('https://www.carrefour.com.ar/descuentos-bancarios', { patron: /macro|naci[oó]n|bna|modo/gi, max: 15, pistas: true });
