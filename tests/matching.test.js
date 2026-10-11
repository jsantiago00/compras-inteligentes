import assert from 'node:assert/strict';
import { test } from 'node:test';
import { similitud, tokens, unificar, UMBRAL_MATCH } from '../lib/scrapers/matching.js';

test('tokens: sin acentos, sin palabras vacías ni medidas', () => {
  assert.deepEqual(tokens('Arroz Largo Fino Gallo Oro 1 Kg'), ['arroz', 'largo', 'fino', 'gallo', 'oro']);
});

test('similitud: EAN manda; sin EAN compara nombre, marca y contenido', () => {
  assert.equal(similitud({ ean: '1' }, { ean: '1' }), 1);
  assert.equal(similitud({ ean: '1' }, { ean: '2' }), 0);
  const a = { nombre: 'Arroz Largo Fino Gallo Oro 1 Kg', marca: 'Gallo' };
  const b = { nombre: 'Arroz Gallo Oro Largo Fino 1kg', marca: 'GALLO' };
  assert.ok(similitud(a, b) >= UMBRAL_MATCH);
  // Distinto contenido → no matchea.
  assert.equal(similitud(a, { ...b, nombre: 'Arroz Gallo Oro Largo Fino 500 g' }), 0);
  // Distinta marca → no matchea.
  assert.equal(similitud(a, { ...b, marca: 'Molinos Ala' }), 0);
});

test('unificar: agrupa por EAN y propone matches difusos para confirmar', () => {
  const porSuper = {
    jumbo: [{ super: 'jumbo', ean: '779', sku: 'j1', nombre: 'Arroz Largo Fino Gallo Oro 1 Kg', marca: 'Gallo' }],
    vea: [{ super: 'vea', ean: '779', sku: 'v1', nombre: 'Arroz Largo Fino Gallo Oro 1 Kg', marca: 'Gallo' }],
    coto: [{ super: 'coto', ean: null, sku: 'c1', nombre: 'Arroz Gallo Oro Largo Fino 1kg', marca: 'GALLO' }],
  };
  const r = unificar(porSuper);
  const g = r.grupos.find((x) => x.clave === '779');
  assert.deepEqual(Object.keys(g.porSuper).sort(), ['jumbo', 'vea']);
  assert.equal(r.pendientes.length, 1);
  assert.equal(r.pendientes[0].clave, 'coto:c1');
  assert.equal(r.pendientes[0].grupo, '779');

  // Con el match confirmado, Coto entra en el grupo y no queda pendiente.
  const c = unificar(porSuper, { confirmados: { 'coto:c1': '779' } });
  assert.deepEqual(Object.keys(c.grupos.find((x) => x.clave === '779').porSuper).sort(), ['coto', 'jumbo', 'vea']);
  assert.equal(c.pendientes.length, 0);
  assert.equal(c.grupos.length, 1);

  // Rechazado → no se vuelve a proponer.
  assert.equal(unificar(porSuper, { rechazados: ['coto:c1|779'] }).pendientes.length, 0);
});
