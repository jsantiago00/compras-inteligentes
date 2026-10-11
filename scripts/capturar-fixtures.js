#!/usr/bin/env node
// npm run fixtures:capturar — captura UNA vez respuestas reales de los súper y
// las guarda en tests/fixtures/ (reemplaza los fixtures reconstruidos).
// Después correr `npm test`: si algún parser falla, es que el formato real
// difiere y hay que ajustar el adaptador (y los asserts que dependan de datos).

import { writeFileSync } from 'node:fs';
import { crearCliente } from '../lib/scrapers/http.js';
import { TIENDAS_VTEX } from '../lib/scrapers/vtex.js';
import { BASE_COTO } from '../lib/scrapers/coto.js';

const DIR = new URL('../tests/fixtures/', import.meta.url);
const TEXTOS = ['coca cola 2.25', 'yerba playadito', 'leche la serenisima', 'arroz gallo oro', 'aceite natura', 'fernet branca'];
const cliente = crearCliente({ intervaloMs: 1500 });

for (const [sup, t] of Object.entries(TIENDAS_VTEX)) {
  const productos = [];
  for (const texto of TEXTOS) {
    try {
      const r = await cliente.json(`${t.base}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(texto)}&_from=0&_to=0&sc=${t.sc}`);
      productos.push(...r);
    } catch (e) {
      console.error(`${sup} "${texto}": ${e.message}`);
    }
  }
  if (productos.length) {
    writeFileSync(new URL(`vtex-${sup}-busqueda.json`, DIR), JSON.stringify(productos, null, 1));
    console.log(`${sup}: ${productos.length} productos guardados`);
  }
}

try {
  const r = await cliente.json(`${BASE_COTO}/sitios/cdigi/categoria?Dy=1&Ntt=${encodeURIComponent('coca cola')}&Nrpp=6&format=json`);
  writeFileSync(new URL('coto-busqueda.json', DIR), JSON.stringify(r, null, 1));
  console.log('coto: respuesta guardada');
} catch (e) {
  console.error(`coto: ${e.message}`);
}
