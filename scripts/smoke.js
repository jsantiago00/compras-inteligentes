#!/usr/bin/env node
// npm run smoke — pega a los sitios reales con 2 o 3 productos conocidos y
// reporta qué funciona en cada súper. Es de bajo volumen (≈ 6 requests por
// súper, con 1,5 s entre requests al mismo host).
//
//   npm run smoke                 contra los sitios reales
//   npm run smoke -- --fixtures   contra los fixtures (prueba el script sin red)

import { writeFileSync } from 'node:fs';
import { IDS_SUPERS, SUPERS } from '../lib/constantes.js';
import { fetchFixtures } from '../lib/scrapers/fixtures.js';
import { crearAdaptadores } from '../lib/scrapers/index.js';

const CONOCIDOS = [
  { texto: 'coca cola 2.25', ean: '7790895000997' },
  { texto: 'yerba playadito 1 kg', ean: null },
  { texto: 'leche la serenisima entera', ean: null },
];

const conFixtures = process.argv.includes('--fixtures');
const adaptadores = await crearAdaptadores({
  fetch: conFixtures ? fetchFixtures : undefined,
  intervaloMs: conFixtures ? 0 : 1500,
});

function explicar(e) {
  const m = e?.cause?.message ?? e?.message ?? String(e);
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/.test(m)) return `sin DNS para el sitio (${m})`;
  if (/CONNECT|tunnel|ECONNREFUSED|ECONNRESET|fetch failed/i.test(m)) return `sin acceso de red al sitio (${m})`;
  return m;
}

const reporte = { fecha: new Date().toISOString(), modo: conFixtures ? 'fixtures' : 'real', supers: {} };

for (const sup of IDS_SUPERS) {
  const a = adaptadores[sup];
  const r = { ok: false, pruebas: [] };
  for (const p of CONOCIDOS) {
    const prueba = { texto: p.texto };
    try {
      let ean = p.ean;
      if (!ean) {
        const resultados = await a.buscar(p.texto, { limite: 5 });
        prueba.resultadosBusqueda = resultados.length;
        ean = resultados.find((x) => x.ean)?.ean;
      }
      if (ean) {
        const prod = await a.porEan(ean);
        prueba.ean = ean;
        prueba.encontradoPorEan = Boolean(prod);
        if (prod) {
          prueba.producto = { nombre: prod.nombre, precioLista: prod.precioLista, precioOferta: prod.precioOferta, disponible: prod.disponible, sku: prod.sku };
          r.ok = true;
        }
      } else {
        prueba.encontradoPorEan = false;
        prueba.nota = 'la búsqueda no devolvió productos con EAN';
      }
    } catch (e) {
      prueba.error = explicar(e);
    }
    r.pruebas.push(prueba);
  }
  reporte.supers[sup] = r;

  console.log(`\n${r.ok ? '✅' : '❌'} ${SUPERS[sup]}`);
  for (const p of r.pruebas) {
    if (p.error) console.log(`   · "${p.texto}": ERROR ${p.error}`);
    else if (p.encontradoPorEan) console.log(`   · "${p.texto}": EAN ${p.ean} → ${p.producto.nombre} — $${p.producto.precioOferta ?? p.producto.precioLista}${p.producto.disponible ? '' : ' (sin stock)'}`);
    else console.log(`   · "${p.texto}": no encontrado ${p.nota ?? `por EAN ${p.ean}`}`);
  }
}

writeFileSync(new URL('../smoke-reporte.json', import.meta.url), JSON.stringify(reporte, null, 2));
const fallan = IDS_SUPERS.filter((s) => !reporte.supers[s].ok);
console.log(`\n${IDS_SUPERS.length - fallan.length}/${IDS_SUPERS.length} súper encontraron al menos un producto por EAN. Reporte en smoke-reporte.json`);
if (fallan.length) {
  console.log(`Fallan: ${fallan.map((s) => SUPERS[s]).join(', ')}. Ver README → "Estado del smoke".`);
  process.exitCode = 1;
}
