// Promos publicadas por los súper (respuestas reales del 11 y 12/10/2026 en
// tests/fixtures/promos-*.json). Sin red.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { MEDIOS_INICIALES, medioCoincide, tieneMedio } from '../lib/medios.js';
import { promoAplica } from '../lib/motor/promos.js';
import { condicionesDeTexto, mediosAplicables, promosCarrefour, promosCencosud, promosCoto } from '../lib/promosSuper.js';

const leer = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));
const HOY = '2026-10-11';
// Las que vería alguien con BNA y Macro (los medios iniciales).
const paraBnaMacro = (ps) => ps.filter((p) => tieneMedio(MEDIOS_INICIALES, p.medio));

test('Cencosud: MODO en Jumbo (bancos listados) y Vea (cualquier banco), con tope, mínimo y canal online', () => {
  const ps = paraBnaMacro(promosCencosud(leer('promos-cencosud.json'), { hoy: HOY }));
  const resumen = [...new Set(ps.map((p) => `${p.super}|${p.medio}|${p.porcentaje}|${p.dias.join(',')}`))].sort();
  assert.deepEqual(resumen, ['jumbo|modo_bna|20|2,4', 'jumbo|modo_macro|20|2,4', 'vea|modo_*|20|5']);
  for (const p of ps) {
    assert.equal(p.tope, 25000);
    assert.equal(p.tipoTope, 'mensual');
    assert.equal(p.minimoCompra, 100000);
    assert.equal(p.tipo, 'reintegro');
    assert.equal(p.soloPresencial, false, 'vale "tanto en modalidad presencial como online"');
    assert.equal(p.vigenciaHasta, '2026-10-31');
    assert.match(p.fuente, /descuentos-del-dia/);
  }
  // Las de cuotas sin interés (Macro) no son descuentos.
  assert.ok(!ps.some((p) => /^(visa|master)_macro$/.test(p.medio)));
  // Con otros bancos aparecen las suyas (ej. Patagonia, Naranja X).
  const todas = promosCencosud(leer('promos-cencosud.json'), { hoy: HOY });
  assert.ok(todas.some((p) => p.medio.endsWith('_patagonia')));
  assert.ok(todas.some((p) => p.medio === 'naranjax'));
});

test('Carrefour: 10% con cualquier medio los jueves; Cuenta Digital aparte; la de jubilados BNA afuera', () => {
  const todas = promosCarrefour(leer('promos-carrefour.json'), leer('promos-carrefour-bancos.json'), { hoy: HOY });
  const cuenta = todas.filter((x) => x.medio === 'cuenta_carrefour');
  assert.ok(cuenta.length >= 4 && cuenta.every((x) => /Cuenta Digital/.test(x.condicion)));
  assert.ok(cuenta.some((x) => x.porcentaje === 15 && x.dias.join() === '5' && !x.soloPresencial));
  const ps = paraBnaMacro(todas);
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
  assert.equal(promoAplica(p, { super: 'carrefour', medio: 'visa_macro', fecha: '2026-10-15' }), true); // jueves
  assert.equal(promoAplica(p, { super: 'carrefour', medio: 'modo_bna', fecha: '2026-10-14' }), false); // miércoles
  // Patagonia y Tarjeta Carrefour, para quien los tenga.
  assert.ok(todas.some((x) => x.medio.endsWith('_patagonia')));
  assert.ok(todas.some((x) => x.medio === 'tarjeta_carrefour'));
});

test('mediosAplicables, comodines y condicionesDeTexto', () => {
  assert.deepEqual(mediosAplicables('MODO', 'Bancos que aplicaran para MODO: BNA, Galicia, Macro.').sort(), ['modo_bna', 'modo_galicia', 'modo_macro']);
  assert.deepEqual(mediosAplicables('MODO', 'Pagando con MODO con tarjetas de bancos adheridos.'), ['modo_*']);
  assert.deepEqual(mediosAplicables('Banco Nación', 'con tarjetas Visa del BNA'), ['visa_bna']);
  assert.deepEqual(mediosAplicables('Banco Macro', 'pagando con MODO'), ['modo_macro']);
  assert.deepEqual(mediosAplicables('Banco Patagonia', 'Visa'), ['visa_patagonia']);
  assert.deepEqual(mediosAplicables('Credicoop', 'con tarjetas Cabal, Visa y Mastercard'), ['visa_credicoop', 'master_credicoop']);
  assert.deepEqual(mediosAplicables('Mercado Pago', 'pagando con QR'), ['mercadopago']);
  assert.deepEqual(mediosAplicables('Club X', 'descuento'), []);
  assert.equal(medioCoincide('modo_*', 'modo_galicia'), true);
  assert.equal(medioCoincide('modo_*', 'visa_galicia'), false);
  assert.equal(tieneMedio(['visa_santander'], 'todos'), true);
  const c = condicionesDeTexto('Tope de reintegro $15.000 por mes. Para compras a partir de $50.000. Exclusivo para compras presenciales.');
  assert.deepEqual([c.tope, c.tipoTope, c.minimoCompra, c.tipo, c.soloPresencial], [15000, 'mensual', 50000, 'reintegro', true]);
  // Redacción del 12/10/2026 (MODO 30% por un día).
  const d = condicionesDeTexto('Tope de reintegro $30.000 por usuario por promoción para compras mayor o iguales a $100.000.');
  assert.deepEqual([d.tope, d.minimoCompra, d.tipo], [30000, 100000, 'reintegro']);
});

test('Coto: Comunidad Coto los miércoles (con aviso), MODO solo en el local y bancos por su código', () => {
  const todas = promosCoto(leer('promos-coto.json'), { hoy: '2026-10-12' });
  const ps = paraBnaMacro(todas);
  const online = ps.filter((p) => !p.soloPresencial);
  assert.equal(online.length, 1);
  assert.deepEqual([online[0].medio, online[0].porcentaje, online[0].dias], ['todos', 15, [3]]);
  assert.match(online[0].condicion, /Comunidad Coto/);
  // MODO 25% los martes (cualquier banco) y 10% adicional con BNA+: solo presenciales.
  const modo = ps.filter((p) => p.medio.startsWith('modo_'));
  assert.ok(modo.length >= 2 && modo.every((p) => p.soloPresencial && p.dias.join() === '2'));
  assert.ok(!ps.some((p) => /cuotas/i.test(p.notas)));
  // Otros bancos (Ciudad por MODO) y Mercado Pago, para quien los tenga.
  assert.ok(todas.some((p) => p.medio === 'modo_ciudad'));
  assert.ok(todas.some((p) => p.medio === 'mercadopago'));
});
