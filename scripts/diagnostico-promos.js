#!/usr/bin/env node
// Diagnóstico de Semana Nación (BNA): estructura de __NEXT_DATA__ por súper.

import { USER_AGENT } from '../lib/scrapers/http.js';

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function resumir(v, prof = 0, max = 4) {
  if (prof > max) return '…';
  if (Array.isArray(v)) return v.length ? [`[${v.length}]`, resumir(v[0], prof + 1, max)] : [];
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).slice(0, 40).map(([k, x]) => [k, resumir(x, prof + 1, max)]));
  return typeof v === 'string' ? v.slice(0, 120) : v;
}

for (const slug of ['coto', 'jumbo', 'vea', 'carrefour']) {
  await espera(1500);
  const url = `https://semananacion.com.ar/semananacion/${slug}`;
  try {
    const html = await (await fetch(url, { headers: { 'User-Agent': USER_AGENT } })).text();
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    console.log(`\n### ${url} next_data=${Boolean(m)} (${html.length} bytes)`);
    const desc = html.match(/<meta name="description" content="([^"]*)"/);
    console.log('description:', desc?.[1]);
    if (!m) continue;
    const data = JSON.parse(m[1]);
    console.log('estructura:', JSON.stringify(resumir(data.props?.pageProps ?? data, 0, 5)).slice(0, 5000));
    // Todo string que mencione %, días, tope o vigencia.
    const textos = new Set();
    (function rec(v) {
      if (typeof v === 'string') {
        if (/%|tope|vigencia|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|reintegro|MODO/i.test(v) && v.length < 1500) textos.add(v.replace(/\s+/g, ' '));
      } else if (v && typeof v === 'object') Object.values(v).forEach(rec);
    })(data);
    for (const t of [...textos].slice(0, 40)) console.log('  ·', t);
  } catch (e) {
    console.log(`### ERROR ${url}: ${e.message}`);
  }
}
