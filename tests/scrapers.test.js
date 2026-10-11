// Scrapers contra fixtures guardados (sin red).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsearProductosCoto } from '../lib/scrapers/coto.js';
import { leerFixture, fetchFixtures } from '../lib/scrapers/fixtures.js';
import { crearAdaptadores } from '../lib/scrapers/index.js';
import { parsearProductosVtex, promoDesdeTeasers, urlCarritoVtex } from '../lib/scrapers/vtex.js';
import { unificar } from '../lib/scrapers/matching.js';

const CAMPOS = ['ean', 'nombre', 'marca', 'precioLista', 'precioOferta', 'promoGondola', 'unidad', 'contenido', 'url', 'imagen', 'sku', 'disponible'];

for (const sup of ['jumbo', 'vea', 'carrefour']) {
  test(`VTEX ${sup}: parsea products/search con la forma común`, () => {
    const productos = parsearProductosVtex(leerFixture(`vtex-${sup}-busqueda.json`), { super: sup, base: `https://www.${sup}.com.ar` });
    assert.ok(productos.length >= 5);
    for (const p of productos) {
      for (const c of CAMPOS) assert.ok(c in p, `falta ${c}`);
      assert.match(p.ean, /^\d{13}$/);
      assert.ok(p.precioLista > 0);
      assert.ok(p.url.startsWith(`https://www.${sup}.com.ar/`));
    }
  });
}

test('VTEX: oferta, sin stock, teasers .NET y teasers planos', () => {
  const jumbo = parsearProductosVtex(leerFixture('vtex-jumbo-busqueda.json'), { super: 'jumbo', base: 'https://www.jumbo.com.ar' });
  const coca = jumbo.find((p) => p.ean === '7790895000997');
  assert.deepEqual({ ...coca.promoGondola, texto: undefined }, { tipo: 'nxm', lleva: 2, paga: 1, texto: undefined });
  const aceite = jumbo.find((p) => p.ean === '7790060233731');
  assert.ok(aceite.precioOferta < aceite.precioLista);
  assert.deepEqual(aceite.precioPorUnidad, { valor: Math.round((aceite.precioOferta / 1.5) * 100) / 100, unidad: '$/l' });

  const vea = parsearProductosVtex(leerFixture('vtex-vea-busqueda.json'), { super: 'vea', base: 'https://www.vea.com.ar' });
  assert.equal(vea.find((p) => p.ean === '7790742656001').disponible, false);

  const carrefour = parsearProductosVtex(leerFixture('vtex-carrefour-busqueda.json'), { super: 'carrefour', base: 'https://www.carrefour.com.ar' });
  assert.equal(carrefour.find((p) => p.ean === '7793704000010').promoGondola.tipo, 'segunda_unidad');
});

test('VTEX: teaser sin texto reconocible usa el efecto PercentualDiscount', () => {
  const p = promoDesdeTeasers({
    Teasers: [{ '<Name>k__BackingField': 'Promo almacén', '<Conditions>k__BackingField': { '<MinimumQuantity>k__BackingField': 3 }, '<Effects>k__BackingField': { '<Parameters>k__BackingField': [{ '<Name>k__BackingField': 'PercentualDiscount', '<Value>k__BackingField': '15' }] } }],
  });
  assert.deepEqual(p, { tipo: 'porcentaje', porcentaje: 15, minimoUnidades: 3, texto: 'Promo almacén' });
});

test('VTEX: pesables usan unitMultiplier como contenido', () => {
  const [p] = parsearProductosVtex(
    [{ productName: 'Queso Cremoso', brand: 'X', linkText: 'queso', items: [{ itemId: '9', ean: '1', name: 'Queso Cremoso', measurementUnit: 'kg', unitMultiplier: 0.5, sellers: [{ sellerId: '1', commertialOffer: { Price: 4000, ListPrice: 4000, AvailableQuantity: 5, IsAvailable: true } }] }] }],
    { super: 'jumbo', base: 'https://www.jumbo.com.ar' },
  );
  assert.equal(p.contenido, 0.5);
  assert.equal(p.unidad, 'kg');
  assert.equal(p.precioPorUnidad.valor, 8000);
});

test('VTEX: link de carrito con varios ítems y sales channel', () => {
  const url = urlCarritoVtex('https://www.jumbo.com.ar', [{ sku: '10', cantidad: 2 }, { sku: '20', cantidad: 1, seller: '1' }], { sc: '1' });
  assert.equal(url, 'https://www.jumbo.com.ar/checkout/cart/add?sku=10&qty=2&seller=1&sku=20&qty=1&seller=1&sc=1');
});

test('Coto: parsea el JSON de Endeca, ignora descuentos con medios ajenos', () => {
  const productos = parsearProductosCoto(leerFixture('coto-busqueda.json'));
  assert.equal(productos.length, 5);
  for (const p of productos) for (const c of CAMPOS) assert.ok(c in p, `falta ${c}`);
  const leche = productos.find((p) => p.ean === '7790742656001');
  assert.ok(leche.precioOferta < leche.precioLista, '25% Dto → precio de oferta');
  const coca = productos.find((p) => p.ean === '7790895000997');
  assert.equal(coca.promoGondola.tipo, 'segunda_unidad');
  const yerba = productos.find((p) => p.ean === '7793704000010');
  assert.equal(yerba.precioOferta, null, 'el descuento con Tarjeta Coto no aplica');
  assert.equal(productos.filter((p) => !p.ean).length, 1);
  assert.ok(yerba.url.startsWith('https://www.cotodigital.com.ar/sitios/cdigi/productos/'));
  assert.ok(!yerba.url.includes('format=json'));
});

test('adaptadores contra fixtures: buscar, porEan, porSku y unificación', async () => {
  const a = await crearAdaptadores({ fetch: fetchFixtures, intervaloMs: 0, env: {} });
  for (const sup of ['jumbo', 'vea', 'carrefour', 'coto']) {
    const r = await a[sup].buscar('coca cola');
    assert.equal(r.length, 1, sup);
    const e = await a[sup].porEan('7790895000997');
    assert.equal(e.ean, '7790895000997', sup);
    const s = await a[sup].porSku(e.sku);
    assert.equal(s.sku, e.sku, sup);
  }
  assert.equal(await a.vea.porEan('0000000000000'), null);

  const porSuper = {};
  for (const sup of ['jumbo', 'vea', 'carrefour', 'coto']) porSuper[sup] = await a[sup].buscar('arroz');
  const u = unificar(porSuper);
  assert.equal(u.pendientes.length, 1, 'el arroz de Coto no tiene EAN y se propone el match');
});
