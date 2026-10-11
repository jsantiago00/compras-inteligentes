import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aNumero, parsearContenido, parsearPromoTexto, precioPorUnidad } from '../lib/scrapers/normalizar.js';

test('parsearContenido: peso, volumen, packs y unidades', () => {
  assert.deepEqual(parsearContenido('Yerba Mate Playadito 1 Kg'), { contenido: 1, unidad: 'kg' });
  assert.deepEqual(parsearContenido('Gaseosa Coca-Cola 2,25 L'), { contenido: 2.25, unidad: 'l' });
  assert.deepEqual(parsearContenido('Fernet Branca 750 ml'), { contenido: 0.75, unidad: 'l' });
  assert.deepEqual(parsearContenido('Galletitas Oreo 3 x 118 g'), { contenido: 0.354, unidad: 'kg' });
  assert.deepEqual(parsearContenido('Agua Villavicencio Pack 6 x 1,5 L'), { contenido: 9, unidad: 'l' });
  assert.deepEqual(parsearContenido('Arroz Gallo Oro Largo Fino 1kg'), { contenido: 1, unidad: 'kg' });
  assert.deepEqual(parsearContenido('Leche Entera La Serenísima 3% 1 L'), { contenido: 1, unidad: 'l' });
  assert.deepEqual(parsearContenido('Huevos Blancos 12 Un'), { contenido: 12, unidad: 'un' });
  assert.deepEqual(parsearContenido('Palta Hass'), { contenido: 1, unidad: 'un' });
});

test('precioPorUnidad', () => {
  assert.deepEqual(precioPorUnidad(3000, 0.75, 'l'), { valor: 4000, unidad: '$/l' });
  assert.equal(precioPorUnidad(null, 1, 'kg'), null);
});

test('aNumero: formatos argentinos y de API', () => {
  assert.equal(aNumero('$3.999,50'), 3999.5);
  assert.equal(aNumero('3999.5000'), 3999.5);
  assert.equal(aNumero('1.234'), 1234);
  assert.equal(aNumero(12), 12);
  assert.equal(aNumero(''), null);
});

test('parsearPromoTexto: 2x1, 3x2, 2da unidad y % off', () => {
  assert.deepEqual(parsearPromoTexto('2x1 en Gaseosas'), { tipo: 'nxm', lleva: 2, paga: 1, texto: '2x1 en Gaseosas' });
  assert.equal(parsearPromoTexto('3 x 2 Lácteos').lleva, 3);
  assert.equal(parsearPromoTexto('Llevá 4 pagá 3').paga, 3);
  assert.deepEqual(parsearPromoTexto('2do al 70%'), { tipo: 'segunda_unidad', porcentaje: 70, texto: '2do al 70%' });
  assert.equal(parsearPromoTexto('70% en la 2da unidad').porcentaje, 70);
  assert.equal(parsearPromoTexto('Segunda unidad al 50%').tipo, 'segunda_unidad');
  assert.deepEqual(parsearPromoTexto('25% Dto'), { tipo: 'porcentaje', porcentaje: 25, minimoUnidades: 1, texto: '25% Dto' });
  assert.equal(parsearPromoTexto('Llevando 3, 20% off').minimoUnidades, 3);
  assert.equal(parsearPromoTexto('Precio especial'), null);
  assert.equal(parsearPromoTexto(''), null);
});
