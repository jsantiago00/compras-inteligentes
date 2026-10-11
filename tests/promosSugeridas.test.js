import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { IDS_MEDIOS, IDS_SUPERS } from '../lib/constantes.js';
import { confirmarSugerencia, sugerenciasPendientes } from '../lib/motor/promosSugeridas.js';
import { promoAplica } from '../lib/motor/promos.js';

const datos = JSON.parse(readFileSync(new URL('../lib/promosSugeridas.json', import.meta.url), 'utf8'));

test('promosSugeridas.json: esquema válido y con fuente', () => {
  const ids = new Set();
  for (const p of datos.promos) {
    assert.ok(!ids.has(p.id), `id repetido ${p.id}`);
    ids.add(p.id);
    assert.ok(IDS_SUPERS.includes(p.super), p.id);
    assert.ok(IDS_MEDIOS.includes(p.medio), p.id);
    assert.ok(p.dias.every((d) => d >= 0 && d <= 6));
    assert.ok(p.porcentaje > 0 && p.porcentaje <= 100);
    assert.ok(['por_compra', 'semanal', 'mensual'].includes(p.tipoTope));
    assert.ok(['descuento_caja', 'reintegro'].includes(p.tipo));
    assert.match(p.fuente, /^https:\/\//);
  }
});

test('sugerenciasPendientes: oculta confirmadas, descartadas y vencidas', () => {
  const s = [
    { id: 'a', vigenciaHasta: '2026-10-31' },
    { id: 'b', vigenciaHasta: '2026-10-31' },
    { id: 'c', vigenciaHasta: '2026-10-01' },
    { id: 'd', vigenciaHasta: null },
  ];
  assert.deepEqual(sugerenciasPendientes(s, [{ origen: 'a' }], ['d'], '2026-10-11').map((x) => x.id), ['b']);
});

test('confirmarSugerencia: queda como promo del usuario y aplica en el motor', () => {
  const coto = datos.promos.find((p) => p.id === 'bna-coto-martes-20');
  const promo = confirmarSugerencia(coto);
  assert.equal(promo.origen, 'bna-coto-martes-20');
  assert.equal(promo.textoFuente, undefined);
  assert.equal(promoAplica(promo, { super: 'coto', medio: 'modo_bna', fecha: '2026-10-13' }), true); // martes
  assert.equal(promoAplica(promo, { super: 'coto', medio: 'modo_bna', fecha: '2026-10-14' }), false);
});
