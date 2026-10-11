import assert from 'node:assert/strict';
import { test } from 'node:test';
import { costoEnvio, evaluarOpcion, recomendar } from '../lib/motor/recomendacion.js';

// Sábado 10/10/2026 → la semana es sáb, dom, lun, mar, mié, jue (15), vie.
const HOY = '2026-10-10';
const items = [
  { clave: 'yerba', nombre: 'Yerba', cantidad: 2 },
  { clave: 'coca', nombre: 'Coca', cantidad: 2 },
  { clave: 'fernet', nombre: 'Fernet', cantidad: 1, rubro: '/Bebidas/Bebidas alcohólicas/' },
];
const precios = {
  yerba: { jumbo: { precioLista: 5000 }, carrefour: { precioLista: 5200, promoGondola: { tipo: 'segunda_unidad', porcentaje: 70 } }, coto: { precioLista: 4900 } },
  coca: { jumbo: { precioLista: 4000, promoGondola: { tipo: 'nxm', lleva: 2, paga: 1 } }, carrefour: { precioLista: 3900 }, coto: { precioLista: 3800 } },
  fernet: { jumbo: { precioLista: 12000 }, carrefour: { precioLista: 11500 }, coto: { precioLista: 11000, disponible: false } },
};
const envios = { jumbo: { costo: 2000, minimoGratis: 30000 }, carrefour: { costo: 2500, minimoGratis: 40000 }, coto: { costo: 1500, minimoGratis: null } };
const promoCarrefourJueves = {
  id: 'cf-jue', super: 'carrefour', medio: 'modo_macro', dias: [4], porcentaje: 30, tope: 5000, tipoTope: 'semanal',
  tipo: 'descuento_caja', minimoCompra: null, vigenciaDesde: '2026-10-01', vigenciaHasta: '2026-10-31', rubrosExcluidos: [],
};
const base = { items, precios, envios, hoy: HOY, supers: ['jumbo', 'carrefour', 'coto'] };

test('costoEnvio: gratis desde el mínimo, cero si no hay compra', () => {
  assert.equal(costoEnvio({ costo: 2000, minimoGratis: 30000 }, 29999), 2000);
  assert.equal(costoEnvio({ costo: 2000, minimoGratis: 30000 }, 30000), 0);
  assert.equal(costoEnvio({ costo: 2000, minimoGratis: null }, 99999), 2000);
  assert.equal(costoEnvio({ costo: 2000 }, 0), 0);
  assert.equal(costoEnvio(undefined, 100), 0);
});

test('evaluarOpcion: subtotal con góndola, envío y faltantes', () => {
  const jumbo = evaluarOpcion({ ...base, super: 'jumbo', medio: 'visa_bna', fecha: HOY });
  // yerba 10000 + coca 2x1 4000 + fernet 12000 = 26000 (< 30000 → envío 2000)
  assert.equal(jumbo.subtotal, 26000);
  assert.equal(jumbo.ahorroGondola, 4000);
  assert.equal(jumbo.envio, 2000);
  assert.equal(jumbo.total, 28000);
  const coto = evaluarOpcion({ ...base, super: 'coto', medio: 'visa_bna', fecha: HOY });
  assert.deepEqual(coto.faltantes, ['fernet']);
  assert.equal(coto.subtotal, 9800 + 7600);
});

test('recomendar: elige el día con promo bancaria y respeta el tope', () => {
  const r = recomendar({ ...base, promos: [promoCarrefourJueves] });
  // Carrefour: yerba 5200+1560=6760, coca 7800, fernet 11500 → 26060; +2500 envío.
  // Jueves con MODO Macro: 30% = 7818 → tope 5000 → 26060 - 5000 + 2500 = 23560.
  assert.equal(r.mejor.super, 'carrefour');
  assert.equal(r.mejor.medio, 'modo_macro');
  assert.equal(r.mejor.fecha, '2026-10-15');
  assert.equal(r.mejor.descuentoBancario, 5000);
  assert.equal(r.mejor.total, 23560);
  // Hoy lo mejor es Jumbo (28000) → ahorro 4440 frente a hoy.
  assert.equal(r.mejorHoy.super, 'jumbo');
  assert.equal(r.mejorHoy.total, 28000);
  assert.equal(r.ahorroVsHoy, 4440);
  assert.ok(r.ahorroVsCara > 0);
  assert.match(r.texto, /^Comprá el jueves en Carrefour con MODO Macro: \$23\.560 \(ahorrás \$\d.* frente a la opción más cara y \$4\.440 frente a comprar hoy\)$/);
  assert.equal(r.calendario.length, 7);
  assert.equal(r.calendario[5].fecha, '2026-10-15');
  assert.equal(r.calendario[5].mejor.total, 23560);
});

test('recomendar: el tope ya consumido en la semana cambia la recomendación', () => {
  const pedidos = [{ fecha: '2026-10-12', super: 'carrefour', medio: 'modo_macro', promoId: 'cf-jue', descuentoBancario: 5000, items: [] }];
  const r = recomendar({ ...base, promos: [promoCarrefourJueves], pedidos });
  // Sin tope disponible el jueves no tiene ventaja: gana la opción más barata sin promo (Jumbo 28000) y hoy.
  assert.equal(r.mejor.descuentoBancario, 0);
  assert.equal(r.mejor.super, 'jumbo');
  assert.equal(r.mejor.fecha, HOY);
  assert.match(r.texto, /^Comprá hoy \(sábado\) en Jumbo/);
});

test('recomendar: penaliza faltantes antes que precio', () => {
  const r = recomendar({ ...base, supers: ['jumbo', 'coto'] });
  // Coto es más barato pero no tiene fernet.
  assert.equal(r.mejor.super, 'jumbo');
  assert.equal(r.mejor.faltantes.length, 0);
});

test('recomendar: compra dividida solo cuando el ahorro supera el envío extra', () => {
  // Con envíos caros, dividir no conviene.
  const caros = { jumbo: { costo: 9000, minimoGratis: null }, carrefour: { costo: 9000, minimoGratis: null }, coto: { costo: 9000, minimoGratis: null } };
  assert.equal(recomendar({ ...base, envios: caros }).compraDividida, null);

  // Con envío gratis, conviene llevar cada cosa de donde es más barata.
  const gratis = { jumbo: { costo: 0 }, carrefour: { costo: 0 }, coto: { costo: 0 } };
  const r = recomendar({ ...base, envios: gratis });
  assert.ok(r.compraDividida, 'debería sugerir compra dividida');
  assert.ok(r.compraDividida.total < r.mejor.total);
  assert.equal(r.compraDividida.ahorro, Math.round((r.mejor.total - r.compraDividida.total) * 100) / 100);
  assert.equal(r.compraDividida.faltantes.length, 0);
  const supers = r.compraDividida.partes.map((p) => p.super).sort();
  // coca 2x1 en Jumbo (4000) y yerba en Coto (9800) + fernet en Carrefour… el óptimo de a pares:
  assert.equal(supers.length, 2);
  const clavesPorParte = r.compraDividida.partes.map((p) => p.lineas.map((l) => l.clave));
  assert.equal(clavesPorParte.flat().length, 3);
});

test('recomendar: sin precios devuelve un texto claro', () => {
  const r = recomendar({ items, precios: {}, hoy: HOY });
  assert.equal(r.mejor, null);
  assert.equal(r.compraDividida, null);
  assert.match(r.texto, /No hay precios/);
});

test('recomendar: el mínimo de compra de la promo se evalúa sobre el subtotal', () => {
  const r = recomendar({ ...base, promos: [{ ...promoCarrefourJueves, minimoCompra: 50000 }] });
  assert.equal(r.mejor.descuentoBancario, 0);
});

test('recomendar: rubros excluidos reducen la base del descuento', () => {
  const p = { ...promoCarrefourJueves, tope: null, rubrosExcluidos: ['Bebidas alcohólicas'] };
  const r = recomendar({ ...base, promos: [p] });
  // base sin fernet: 6760 + 7800 = 14560 → 30% = 4368
  assert.equal(r.mejor.descuentoBancario, 4368);
});
