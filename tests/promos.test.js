import assert from 'node:assert/strict';
import { test } from 'node:test';
import { costoItem, descuentoPromo, mejorDescuentoBancario, periodoTope, promoAplica, rubroExcluido, topeConsumido } from '../lib/motor/promos.js';

const promo = (extra = {}) => ({
  id: 'p1',
  super: 'carrefour',
  medio: 'modo_macro',
  dias: [4], // jueves
  porcentaje: 25,
  tope: 10000,
  tipoTope: 'semanal',
  tipo: 'reintegro',
  minimoCompra: null,
  vigenciaDesde: '2026-10-01',
  vigenciaHasta: '2026-10-31',
  rubrosExcluidos: [],
  ...extra,
});

test('costoItem: precio de lista, oferta y promos de góndola', () => {
  assert.equal(costoItem({ precioLista: 100 }, 3).costo, 300);
  assert.deepEqual(costoItem({ precioLista: 100, precioOferta: 80 }, 2), { costo: 160, sinPromo: 200, ahorro: 40 });
  // 2x1: 3 unidades → paga 2
  assert.equal(costoItem({ precioLista: 100, promoGondola: { tipo: 'nxm', lleva: 2, paga: 1 } }, 3).costo, 200);
  // 3x2 con 6 unidades → paga 4
  assert.equal(costoItem({ precioLista: 100, promoGondola: { tipo: 'nxm', lleva: 3, paga: 2 } }, 6).costo, 400);
  // 2da al 70%: 2 unidades → 100 + 30
  assert.equal(costoItem({ precioLista: 100, promoGondola: { tipo: 'segunda_unidad', porcentaje: 70 } }, 2).costo, 130);
  // con 1 unidad no aplica
  assert.equal(costoItem({ precioLista: 100, promoGondola: { tipo: 'segunda_unidad', porcentaje: 70 } }, 1).costo, 100);
  // % off llevando 3
  const p = { precioLista: 100, promoGondola: { tipo: 'porcentaje', porcentaje: 20, minimoUnidades: 3 } };
  assert.equal(costoItem(p, 2).costo, 200);
  assert.equal(costoItem(p, 3).costo, 240);
});

test('promoAplica: súper, medio, día de la semana y vigencia', () => {
  assert.equal(promoAplica(promo(), { super: 'carrefour', medio: 'modo_macro', fecha: '2026-10-15' }), true); // jueves
  assert.equal(promoAplica(promo(), { super: 'carrefour', medio: 'modo_macro', fecha: '2026-10-14' }), false); // miércoles
  assert.equal(promoAplica(promo(), { super: 'jumbo', medio: 'modo_macro', fecha: '2026-10-15' }), false);
  assert.equal(promoAplica(promo(), { super: 'carrefour', medio: 'visa_macro', fecha: '2026-10-15' }), false);
  assert.equal(promoAplica(promo(), { super: 'carrefour', medio: 'modo_macro', fecha: '2026-11-05' }), false); // vencida
  assert.equal(promoAplica(promo({ activa: false }), { super: 'carrefour', medio: 'modo_macro', fecha: '2026-10-15' }), false);
});

test('periodoTope: semanas de lunes a domingo y meses calendario', () => {
  assert.deepEqual(periodoTope('semanal', '2026-10-15'), { desde: '2026-10-12', hasta: '2026-10-18' });
  assert.deepEqual(periodoTope('semanal', '2026-10-18'), { desde: '2026-10-12', hasta: '2026-10-18' }); // domingo
  assert.deepEqual(periodoTope('mensual', '2026-02-10'), { desde: '2026-02-01', hasta: '2026-02-28' });
  assert.equal(periodoTope('por_compra', '2026-10-15'), null);
});

test('topeConsumido: suma los descuentos del período con la misma promo', () => {
  const pedidos = [
    { fecha: '2026-10-08', super: 'carrefour', medio: 'modo_macro', promoId: 'p1', descuentoBancario: 3000 }, // otra semana
    { fecha: '2026-10-12', super: 'carrefour', medio: 'modo_macro', promoId: 'p1', descuentoBancario: 4000 },
    { fecha: '2026-10-13', super: 'carrefour', medio: 'modo_macro', promoId: 'otra', descuentoBancario: 999 },
    // sin promoId: se infiere por súper + medio + día en que la promo aplicaba (jueves 15)
    { fecha: '2026-10-15', super: 'carrefour', medio: 'modo_macro', descuentoBancario: 1500 },
  ];
  assert.equal(topeConsumido(promo(), pedidos, '2026-10-16'), 5500);
  assert.equal(topeConsumido(promo({ tipoTope: 'mensual' }), pedidos, '2026-10-16'), 8500);
  assert.equal(topeConsumido(promo({ tipoTope: 'por_compra' }), pedidos, '2026-10-16'), 0);
});

test('descuentoPromo: tope, tope agotado, mínimo de compra y rubros excluidos', () => {
  const lineas = [{ costo: 30000, rubro: '/Almacén/' }, { costo: 20000, rubro: '/Bebidas/Bebidas alcohólicas/' }];
  const ctx = { fecha: '2026-10-15', pedidos: [] };
  // 25% de 50000 = 12500 → tope 10000
  assert.equal(descuentoPromo(promo(), lineas, ctx).descuento, 10000);
  assert.equal(descuentoPromo(promo({ tope: null }), lineas, ctx).descuento, 12500);
  // excluye bebidas alcohólicas → 25% de 30000
  assert.equal(descuentoPromo(promo({ tope: null, rubrosExcluidos: ['bebidas alcoholicas'] }), lineas, ctx).descuento, 7500);
  // mínimo de compra no alcanzado
  assert.equal(descuentoPromo(promo({ minimoCompra: 60000 }), lineas, ctx).descuento, 0);
  // tope ya consumido en parte
  const pedidos = [{ fecha: '2026-10-13', super: 'carrefour', medio: 'modo_macro', promoId: 'p1', descuentoBancario: 7000 }];
  const r = descuentoPromo(promo(), lineas, { fecha: '2026-10-15', pedidos });
  assert.equal(r.descuento, 3000);
  assert.equal(r.motivo, 'limitado por el tope');
  const agotado = descuentoPromo(promo(), lineas, { fecha: '2026-10-15', pedidos: [{ ...pedidos[0], descuentoBancario: 10000 }] });
  assert.equal(agotado.descuento, 0);
  assert.equal(agotado.motivo, 'tope agotado en el período');
});

test('rubroExcluido ignora mayúsculas y acentos', () => {
  assert.equal(rubroExcluido('/Bebidas/Bebidas Alcohólicas/Vinos/', ['bebidas alcoholicas']), true);
  assert.equal(rubroExcluido('/Almacén/', ['bebidas alcoholicas']), false);
  assert.equal(rubroExcluido(null, ['x']), false);
});

test('mejorDescuentoBancario: elige la mejor promo, no las acumula', () => {
  const promos = [promo({ id: 'a', porcentaje: 10, tope: null }), promo({ id: 'b', porcentaje: 20, tope: 1000 }), promo({ id: 'c', porcentaje: 15, tope: null })];
  const r = mejorDescuentoBancario({ promos, super: 'carrefour', medio: 'modo_macro', fecha: '2026-10-15', lineas: [{ costo: 20000 }], pedidos: [] });
  assert.equal(r.promo.id, 'c');
  assert.equal(r.descuento, 3000);
  const nada = mejorDescuentoBancario({ promos, super: 'carrefour', medio: 'modo_macro', fecha: '2026-10-16', lineas: [{ costo: 20000 }] });
  assert.equal(nada.promo, null);
  assert.equal(nada.descuento, 0);
});
