// Promos publicadas por los súper (respuestas reales del 11/10/2026 en
// tests/fixtures/promos-*.json). Sin red.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { promoAplica } from '../lib/motor/promos.js';
import { condicionesDeTexto, mediosAplicables, promosCarrefour, promosCencosud } from '../lib/promosSuper.js';

const leer = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));
const HOY = '2026-10-11';

test('Cencosud: solo MODO para BNA y Macro en Jumbo y Vea, con tope, mínimo y canal online', () => {
  const ps = promosCencosud(leer('promos-cencosud.json'), { hoy: HOY });
  const resumen = ps.map((p) => `${p.super}|${p.medio}|${p.porcentaje}|${p.dias.join(',')}`).sort();
  assert.deepEqual(resumen, ['jumbo|modo_bna|20|2,4', 'jumbo|modo_macro|20|2,4', 'vea|modo_bna|20|5', 'vea|modo_macro|20|5']);
  for (const p of ps) {
    assert.equal(p.tope, 25000);
    assert.equal(p.tipoTope, 'mensual');
    assert.equal(p.minimoCompra, 100000);
    assert.equal(p.tipo, 'reintegro');
    assert.equal(p.soloPresencial, false, 'vale "tanto en modalidad presencial como online"');
    assert.equal(p.vigenciaHasta, '2026-10-31');
    assert.match(p.fuente, /descuentos-del-dia/);
  }
  // Las de cuotas sin interés (Macro), jubilados y otros bancos quedan afuera.
  assert.ok(!ps.some((p) => /macro/.test(p.medio) && !/modo/.test(p.medio)));
});

test('Carrefour: 10% con cualquier medio los jueves, online, tope semanal; la de jubilados BNA queda afuera', () => {
  const ps = promosCarrefour(leer('promos-carrefour.json'), leer('promos-carrefour-bancos.json'), { hoy: HOY });
  assert.equal(ps.length, 1);
  const [p] = ps;
  assert.equal(p.medio, 'todos');
  assert.equal(p.porcentaje, 10);
  assert.deepEqual(p.dias, [4]);
  assert.equal(p.tope, 8000);
  assert.equal(p.tipoTope, 'semanal');
  assert.equal(p.tipo, 'descuento_caja');
  assert.equal(p.soloPresencial, false);
  assert.deepEqual([p.vigenciaDesde, p.vigenciaHasta], ['2026-10-01', '2026-10-31']);
  assert.deepEqual(p.rubrosExcluidos, ['Carne', 'Electro']);
  // "todos" aplica a cualquier medio del usuario.
  assert.equal(promoAplica(p, { super: 'carrefour', medio: 'visa_macro', fecha: '2026-10-15' }), true); // jueves
  assert.equal(promoAplica(p, { super: 'carrefour', medio: 'modo_bna', fecha: '2026-10-14' }), false); // miércoles
});

test('mediosAplicables y condicionesDeTexto', () => {
  assert.deepEqual(mediosAplicables('MODO', 'Bancos que aplicaran para MODO: BNA, Galicia, Macro.'), ['modo_bna', 'modo_macro']);
  assert.deepEqual(mediosAplicables('MODO', 'Bancos que aplicaran para MODO: Galicia, Santander.'), []);
  assert.deepEqual(mediosAplicables('Banco Nación', 'con tarjetas Visa del BNA'), ['visa_bna']);
  assert.deepEqual(mediosAplicables('Banco Macro', 'pagando con MODO'), ['modo_macro']);
  assert.deepEqual(mediosAplicables('Banco Patagonia', 'Visa'), []);
  const c = condicionesDeTexto('Tope de reintegro $15.000 por mes. Para compras a partir de $50.000. Exclusivo para compras presenciales.');
  assert.deepEqual([c.tope, c.tipoTope, c.minimoCompra, c.tipo, c.soloPresencial], [15000, 'mensual', 50000, 'reintegro', true]);
  // Redacción del 12/10/2026 (MODO 30% por un día).
  const d = condicionesDeTexto('Tope de reintegro $30.000 por usuario por promoción para compras mayor o iguales a $100.000.');
  assert.deepEqual([d.tope, d.minimoCompra, d.tipo], [30000, 100000, 'reintegro']);
});
