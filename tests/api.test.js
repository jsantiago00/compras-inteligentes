// Handlers de /api con req/res falsos, en modo demo (fixtures, sin red).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import buscar from '../api/buscar.js';
import carrito from '../api/carrito.js';
import precios from '../api/precios.js';

function llamar(handler, { url = '/', method = 'GET', body } = {}) {
  return new Promise((resolve) => {
    const headers = {};
    const res = {
      statusCode: 200,
      setHeader: (k, v) => (headers[k.toLowerCase()] = v),
      end: (texto) => resolve({ status: res.statusCode, headers, json: JSON.parse(texto) }),
    };
    handler({ url, method, body, headers: {} }, res);
  });
}

test('GET /api/buscar unifica por EAN y propone matches', async () => {
  const r = await llamar(buscar, { url: '/api/buscar?q=arroz&demo=1' });
  assert.equal(r.status, 200);
  const g = r.json.grupos.find((x) => x.ean === '7790070411846');
  assert.deepEqual(Object.keys(g.porSuper).sort(), ['carrefour', 'jumbo', 'vea']);
  assert.equal(r.json.pendientes.length, 1);
  assert.equal((await llamar(buscar, { url: '/api/buscar?q=a' })).status, 400);
});

test('POST /api/precios devuelve precios por ítem y súper', async () => {
  const r = await llamar(precios, { method: 'POST', body: { demo: true, items: [{ clave: 'coca', ean: '7790895000997' }] } });
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.json.precios.coca).sort(), ['carrefour', 'coto', 'jumbo', 'vea']);
  assert.equal((await llamar(precios, { method: 'GET' })).status, 400);
});

test('POST /api/carrito arma el link VTEX', async () => {
  const r = await llamar(carrito, { method: 'POST', body: { super: 'vea', items: [{ sku: '1101', cantidad: 3 }] } });
  assert.equal(r.json.url, 'https://www.vea.com.ar/checkout/cart/add?sku=1101&qty=3&seller=1&sc=34');
  assert.equal((await llamar(carrito, { method: 'POST', body: { super: 'dia', items: [{}] } })).status, 400);
});
