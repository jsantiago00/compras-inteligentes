#!/usr/bin/env node
// Diagnóstico: ¿se pueden leer las promos de supermercados desde las páginas
// oficiales de los bancos / MODO? Imprime status, links relevantes y texto.

import { USER_AGENT } from '../lib/scrapers/http.js';

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const SUPERS = /coto|jumbo|vea|carrefour|disco|supermercad/i;

async function ver(url, { json = false } = {}) {
  await espera(1500);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: json ? 'application/json' : 'text/html,application/json' } });
    const texto = await res.text();
    console.log(`\n### ${res.status} ${res.headers.get('content-type')} ${url} (${texto.length} bytes)`);
    const links = [...new Set([...texto.matchAll(/(?:href|"url"|"link")\s*[=:]\s*"([^"]+)"/g)].map((m) => m[1]).filter((l) => SUPERS.test(l)))];
    if (links.length) console.log('links:', links.slice(0, 40).join('\n  '));
    const plano = texto.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const trozos = [...plano.matchAll(/.{0,250}(?:coto|jumbo|vea|carrefour)\b.{0,350}/gi)].map((m) => m[0]);
    for (const t of trozos.slice(0, 8)) console.log('  …', t);
    if (!trozos.length) console.log('  inicio:', plano.slice(0, 600));
    return texto;
  } catch (e) {
    console.log(`\n### ERROR ${url}: ${e.message}`);
    return '';
  }
}

await ver('https://www.bna.com.ar/Personas/DescuentosYPromociones/4491/coto/');
await ver('https://www.bna.com.ar/Personas/DescuentosYPromociones');
await ver('https://semananacion.bna.com.ar/');
await ver('https://www.macro.com.ar/beneficios');
await ver('https://www.macro.com.ar/personas/beneficios');
await ver('https://www.modo.com.ar/promos');
await ver('https://www.modo.com.ar/promos?category=supermercados');
await ver('https://www.carrefour.com.ar/descuentos-bancarios');
await ver('https://www.jumbo.com.ar/descuentos-del-dia');
await ver('https://www.cotodigital.com.ar/sitios/cdigi/nuevositio');
