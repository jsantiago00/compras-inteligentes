import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agregarPunto, detectarSubaPrevia } from '../lib/motor/historialPrecios.js';
import { frecuencias, sugerencias } from '../lib/motor/sugerencias.js';

const pedido = (fecha, ...claves) => ({ fecha, items: claves.map((c) => ({ clave: c, nombre: c === 'y' ? 'Yerba' : 'Arroz', cantidad: 1 })) });

test('sugerencias: frecuencia promedio y "toca"', () => {
  const pedidos = [pedido('2026-07-01', 'y', 'a'), pedido('2026-07-22', 'y'), pedido('2026-08-12', 'y', 'a'), pedido('2026-09-15', 'a')];
  const f = frecuencias(pedidos, '2026-09-04');
  const y = f.find((x) => x.clave === 'y');
  assert.equal(y.cadaDias, 21);
  assert.equal(y.hace, 23);
  assert.equal(y.toca, true);
  const s = sugerencias(pedidos, '2026-09-04');
  assert.equal(s.length, 1, 'el pedido futuro no cuenta y el arroz (cada 42 días) no toca');
  assert.equal(s[0].texto, 'Yerba: la comprás cada ~21 días, hace 23 que no.');
});

test('historial de precios: solo guarda cambios', () => {
  let h = agregarPunto([], { fecha: '2026-09-01', precioLista: 100 });
  h = agregarPunto(h, { fecha: '2026-09-02', precioLista: 100 });
  assert.equal(h.length, 1);
  h = agregarPunto(h, { fecha: '2026-09-03', precioLista: 120 });
  assert.equal(h.length, 2);
});

test('detectarSubaPrevia: oferta después de una suba del precio de lista', () => {
  const h = [
    { fecha: '2026-09-01', precioLista: 1000, precioOferta: null },
    { fecha: '2026-09-20', precioLista: 1300, precioOferta: null },
    { fecha: '2026-10-05', precioLista: 1300, precioOferta: 975 },
  ];
  assert.deepEqual(detectarSubaPrevia(h, { hoy: '2026-10-05' }), { subaPct: 30, precioAntes: 1000, ofertaReal: 2.5 });
  assert.equal(detectarSubaPrevia(h.slice(0, 2)), null, 'sin oferta no hay alerta');
  assert.equal(detectarSubaPrevia([{ fecha: '2026-10-05', precioLista: 1000, precioOferta: 800 }]), null);
});
