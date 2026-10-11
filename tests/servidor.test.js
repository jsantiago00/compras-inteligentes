import assert from 'node:assert/strict';
import { test } from 'node:test';
import { armarCarrito } from '../lib/carrito.js';
import { crearAdaptadores } from '../lib/scrapers/index.js';
import { fetchFixtures } from '../lib/scrapers/fixtures.js';
import { crearCliente } from '../lib/scrapers/http.js';
import { almacenMemoria } from '../lib/servidor/almacen.js';
import { obtenerPrecio, preciosDeItems } from '../lib/servidor/precios.js';

test('obtenerPrecio: cachea por X horas y guarda historial', async () => {
  let llamadas = 0;
  const adaptador = { porEan: async () => (llamadas++, { ean: '1', precioLista: 100 + llamadas, precioOferta: null }) };
  const almacen = almacenMemoria();
  const ahora = Date.parse('2026-10-10T12:00:00Z');
  await obtenerPrecio({ adaptador, almacen, super: 'jumbo', ref: { ean: '1' }, ahora });
  const r2 = await obtenerPrecio({ adaptador, almacen, super: 'jumbo', ref: { ean: '1' }, ahora: ahora + 3600_000 });
  assert.equal(llamadas, 1);
  assert.equal(r2.desdeCache, true);
  const r3 = await obtenerPrecio({ adaptador, almacen, super: 'jumbo', ref: { ean: '1' }, ahora: ahora + 13 * 3600_000 });
  assert.equal(llamadas, 2);
  assert.equal(r3.producto.precioLista, 102);
  const hist = await almacen.get('historialPrecios', 'jumbo_ean_1');
  assert.equal(hist.puntos.length, 2);
});

test('preciosDeItems contra fixtures: por EAN y por SKU confirmado', async () => {
  const adaptadores = await crearAdaptadores({ fetch: fetchFixtures, intervaloMs: 0, env: {} });
  const r = await preciosDeItems({
    items: [
      { clave: '7790742656001', ean: '7790742656001' },
      { clave: '7790070411846', ean: '7790070411846', refs: { coto: { sku: 'sku0003203' } } },
    ],
    adaptadores,
    almacen: almacenMemoria(),
    supers: ['jumbo', 'vea', 'carrefour', 'coto'],
  });
  assert.deepEqual(r.errores, []);
  assert.equal(r.precios['7790742656001'].vea.disponible, false);
  assert.ok(r.precios['7790070411846'].coto, 'Coto sin EAN se resuelve por SKU');
  assert.ok(r.precios['7790070411846'].carrefour.precioOferta);
});

test('cliente HTTP: User-Agent propio y rate limiting por host', async () => {
  const tiempos = [];
  const fetchFalso = async (url, opts) => {
    tiempos.push(Date.now());
    assert.match(opts.headers['User-Agent'], /ComprasInteligentes/);
    return new Response('[]', { status: 200 });
  };
  const c = crearCliente({ fetch: fetchFalso, intervaloMs: 80 });
  await Promise.all([c.json('https://a.com/1'), c.json('https://a.com/2'), c.json('https://a.com/3')]);
  assert.ok(tiempos[1] - tiempos[0] >= 75 && tiempos[2] - tiempos[1] >= 75, `${tiempos}`);
  await assert.rejects(crearCliente({ fetch: async () => new Response('x', { status: 503 }), intervaloMs: 0 }).json('https://a.com'), /HTTP 503/);
});

test('armarCarrito: link VTEX y lista para Coto', () => {
  const v = armarCarrito('carrefour', [{ sku: '1201', cantidad: 2 }]);
  assert.equal(v.tipo, 'link');
  assert.equal(v.url, 'https://www.carrefour.com.ar/checkout/cart/add?sku=1201&qty=2&seller=1&sc=1');
  const c = armarCarrito('coto', [{ sku: 'x', cantidad: 1, nombre: 'Yerba', url: 'https://www.cotodigital.com.ar/p' }]);
  assert.equal(c.tipo, 'lista');
  assert.equal(c.items[0].url, 'https://www.cotodigital.com.ar/p');
});
