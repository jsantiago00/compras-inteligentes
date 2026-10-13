// Scrapers contra fixtures guardados (respuestas reales capturadas el
// 11/10/2026, ver tests/fixtures/README.md). Sin red.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsearProductosCoto } from '../lib/scrapers/coto.js';
import { leerFixture, fetchFixtures } from '../lib/scrapers/fixtures.js';
import { crearAdaptadores } from '../lib/scrapers/index.js';
import { parsearProductosVtex, promoDesdeTeasers, urlCarritoVtex } from '../lib/scrapers/vtex.js';
import { armarCarrito } from '../lib/carrito.js';
import { unificar } from '../lib/scrapers/matching.js';
import { ZONA } from '../lib/zona.js';

const CAMPOS = ['ean', 'nombre', 'marca', 'precioLista', 'precioOferta', 'promoGondola', 'unidad', 'contenido', 'url', 'imagen', 'sku', 'disponible'];
const vtex = (sup) => parsearProductosVtex(leerFixture(`vtex-${sup}-busqueda.json`), { super: sup, base: `https://www.${sup}.com.ar` });
const COCA = '7790895000997';

for (const sup of ['jumbo', 'vea', 'carrefour']) {
  test(`VTEX ${sup}: parsea la respuesta real de products/search con la forma común`, () => {
    const productos = vtex(sup);
    assert.ok(productos.length >= 10);
    for (const p of productos) {
      for (const c of CAMPOS) assert.ok(c in p, `falta ${c}`);
      assert.match(p.ean, /^\d{13}$/);
      assert.ok(p.precioLista > 0 && p.precioLista < 100000, `${p.nombre}: precio de lista ${p.precioLista}`);
      assert.ok(p.precioOferta == null || p.precioOferta < p.precioLista);
      assert.ok(p.url.startsWith(`https://www.${sup}.com.ar/`));
      assert.match(p.imagen, /^https:\/\//);
      assert.ok(['kg', 'l', 'un'].includes(p.unidad));
    }
  });
}

test('VTEX Jumbo/Vea: ignora el ListPrice inflado y no repite el nombre', () => {
  for (const sup of ['jumbo', 'vea']) {
    const coca = vtex(sup).find((p) => p.ean === COCA);
    assert.equal(coca.precioOferta, null);
    assert.ok(coca.precioLista > 1000 && coca.precioLista < 20000);
    assert.equal(coca.contenido, 2.25);
    assert.equal(coca.unidad, 'l');
    const yerba = vtex(sup).find((p) => p.ean === '7793704000928');
    assert.equal(yerba.nombre, 'Yerba Mate Suave 1 Kg Playadito');
  }
});

test('VTEX Carrefour: 2da unidad de góndola sí, "Tarjeta Carrefour" (BINs) no; oferta por Price < precio sin descuento', () => {
  const productos = vtex('carrefour');
  const coca = productos.find((p) => p.ean === COCA);
  assert.equal(coca.promoGondola.tipo, 'segunda_unidad');
  assert.equal(coca.promoGondola.porcentaje, 50);
  assert.ok(productos.every((p) => !/tarjeta/i.test(p.promoGondola?.texto ?? '')));
  const menta = productos.find((p) => p.ean === '7790290101473');
  assert.ok(menta.precioOferta < menta.precioLista);
});

test('VTEX: teasers .NET y planos, efecto PercentualDiscount y exclusión por BINs (sintético)', () => {
  const teaser = (nombre, minimo, params = []) => ({
    '<Name>k__BackingField': nombre,
    '<Conditions>k__BackingField': { '<MinimumQuantity>k__BackingField': minimo, '<Parameters>k__BackingField': params },
    '<Effects>k__BackingField': { '<Parameters>k__BackingField': [{ '<Name>k__BackingField': 'PercentualDiscount', '<Value>k__BackingField': '15' }] },
  });
  assert.deepEqual(promoDesdeTeasers({ Teasers: [teaser('Promo almacén', 3)] }), { tipo: 'porcentaje', porcentaje: 15, minimoUnidades: 3, texto: 'Promo almacén' });
  assert.equal(promoDesdeTeasers({ Teasers: [teaser('Promo X', 0, [{ '<Name>k__BackingField': 'RestrictionsBins', '<Value>k__BackingField': '123456' }])] }), null);
  assert.equal(promoDesdeTeasers({ PromotionTeasers: [{ Name: '3x2 Lácteos', Conditions: { MinimumQuantity: 3 } }] }).tipo, 'nxm');
});

test('VTEX: pesables se manejan por kg y guardan la porción del carrito (sintético)', () => {
  const [p] = parsearProductosVtex(
    [{ productName: 'Queso Cremoso', brand: 'X', linkText: 'queso', items: [{ itemId: '9', ean: '1', name: 'Queso Cremoso', measurementUnit: 'kg', unitMultiplier: 0.5, sellers: [{ sellerId: '1', commertialOffer: { Price: 4000, ListPrice: 4000, AvailableQuantity: 5, IsAvailable: true } }] }] }],
    { super: 'jumbo', base: 'https://www.jumbo.com.ar' },
  );
  // Price es por kg; el carrito vende porciones de 0.5 kg.
  assert.equal(p.contenido, 1);
  assert.equal(p.unidad, 'kg');
  assert.equal(p.precioLista, 4000);
  assert.equal(p.precioPorUnidad.valor, 4000);
  assert.equal(p.multiplicador, 0.5);
  // 1 kg = 2 porciones; 1,5 kg = 3; nunca menos de 1.
  const url = urlCarritoVtex('https://www.jumbo.com.ar', [{ sku: '9', cantidad: 1, multiplicador: 0.5 }, { sku: '8', cantidad: 1.5, multiplicador: 0.5 }, { sku: '7', cantidad: 0.02, multiplicador: 0.1 }], { sc: '32' });
  assert.equal(url, 'https://www.jumbo.com.ar/checkout/cart/add?sku=9&qty=2&seller=1&sku=8&qty=3&seller=1&sku=7&qty=1&seller=1&sc=32');
});

test('VTEX: link de carrito con el mismo formato que addToCartLink de la API', () => {
  const real = leerFixture('vtex-jumbo-busqueda.json')[0].items[0].sellers[0].addToCartLink;
  const item = leerFixture('vtex-jumbo-busqueda.json')[0].items[0];
  const nuestro = urlCarritoVtex('https://www.jumbo.com.ar', [{ sku: item.itemId, cantidad: 1 }], { sc: '32' });
  assert.ok(real.startsWith(nuestro), `${real} vs ${nuestro}`);
  assert.equal(
    urlCarritoVtex('https://www.jumbo.com.ar', [{ sku: '10', cantidad: 2 }, { sku: '20', cantidad: 1, seller: '1' }], { sc: '32' }),
    'https://www.jumbo.com.ar/checkout/cart/add?sku=10&qty=2&seller=1&sku=20&qty=1&seller=1&sc=32',
  );
});

test('Coto: parsea el JSON real de Endeca', () => {
  const productos = parsearProductosCoto(leerFixture('coto-busqueda.json'));
  assert.ok(productos.length >= 10);
  for (const p of productos) {
    for (const c of CAMPOS) assert.ok(c in p, `falta ${c}`);
    assert.ok(p.precioLista > 0);
    assert.match(p.url, /^https:\/\/www\.coto\.com\.ar\/sitios\/cdigi\/productos\/.+\/_\/R-\d+-\d+-\d+$/);
  }
  const coca = productos.find((p) => p.ean === COCA);
  assert.equal(coca.marca, 'COCA COLA');
  assert.equal(coca.contenido, 2.25);
  // "35%Dto" en dtoDescuentos → precio de oferta.
  const arroz = productos.find((p) => p.ean === '7790070431417');
  assert.equal(arroz.precioOferta, 1937);
  assert.equal(arroz.precioLista, 2980);
});

test('Coto: ignora descuentos atados a medios ajenos (sintético)', () => {
  const reg = (dto) => ({
    attributes: { 'product.displayName': ['Yerba 1 Kg'], 'product.eanPrincipal': ['1'] },
    records: [{ attributes: { 'sku.repositoryId': ['sku1'], 'sku.activePrice': ['1000.00'], 'product.dtoDescuentos': [JSON.stringify(dto)] } }],
  });
  const [ajeno] = parsearProductosCoto({ records: [reg([{ textoDescuento: '20% Dto Tarjeta Coto', precioDescuento: '$800,00' }])] });
  assert.equal(ajeno.precioOferta, null);
  const [segunda] = parsearProductosCoto({ records: [reg([{ textoDescuento: '2do al 70%', textoLlevando: 'Llevando 2' }])] });
  assert.deepEqual({ ...segunda.promoGondola, texto: undefined }, { tipo: 'segunda_unidad', porcentaje: 70, texto: undefined });
});

test('adaptadores contra fixtures: buscar, porEan, porSku y unificación por EAN', async () => {
  const a = await crearAdaptadores({ fetch: fetchFixtures, intervaloMs: 0, env: {} });
  for (const sup of ['jumbo', 'vea', 'carrefour', 'coto']) {
    const r = await a[sup].buscar('coca cola');
    assert.ok(r.length >= 1, sup);
    const e = await a[sup].porEan(COCA);
    assert.equal(e.ean, COCA, sup);
    const s = await a[sup].porSku(e.sku);
    assert.equal(s.sku, e.sku, sup);
  }
  assert.equal(await a.vea.porEan('0000000000000'), null);

  const porSuper = {};
  for (const sup of ['jumbo', 'vea', 'carrefour', 'coto']) porSuper[sup] = await a[sup].buscar('arroz gallo');
  const { grupos } = unificar(porSuper);
  const parboil = grupos.find((g) => g.ean === '7790070431417');
  assert.deepEqual(Object.keys(parboil.porSuper).sort(), ['carrefour', 'coto', 'jumbo', 'vea']);
});

test('zona de entrega: los adaptadores VTEX piden los precios de la sucursal de la zona', async () => {
  const cookies = {};
  const fetchEspia = (url, opts) => {
    cookies[new URL(url).hostname] = opts.headers.Cookie;
    return fetchFixtures(url, opts);
  };
  const a = await crearAdaptadores({ fetch: fetchEspia, intervaloMs: 0, env: {} });
  for (const sup of ZONA.supers) await a[sup].porEan(COCA);
  const regionDe = (host) => {
    const seg = JSON.parse(Buffer.from(cookies[host].replace('vtex_segment=', ''), 'base64').toString());
    return { channel: seg.channel, sucursales: Buffer.from(seg.regionId, 'base64').toString() };
  };
  assert.deepEqual(regionDe('www.jumbo.com.ar'), { channel: '32', sucursales: 'SW#jumboargentinaj5222mendoza' });
  assert.deepEqual(regionDe('www.vea.com.ar'), { channel: '34', sucursales: 'SW#jumboargentinav171sarmientoyalen' });
  assert.deepEqual(regionDe('www.carrefour.com.ar'), { channel: '1', sucursales: 'SW#carrefourar0029;carrefourar0899' });
  // Coto: sucursal de Mendoza.
  assert.deepEqual(ZONA.sucursales.coto, ['209']);
});

test('armarCarrito: con la sucursal de la zona como vendedor y porciones de los pesables', () => {
  const c = armarCarrito('jumbo', [{ sku: '20218', cantidad: 1, multiplicador: 0.5, seller: '1' }, { sku: '315800', cantidad: 2 }], { sucursales: { jumbo: ['jumboargentinaj5222mendoza'] } });
  assert.equal(c.url, 'https://www.jumbo.com.ar/checkout/cart/add?sku=20218&qty=2&seller=jumboargentinaj5222mendoza&sku=315800&qty=2&seller=jumboargentinaj5222mendoza&sc=32');
  // Sin zona, queda el vendedor que vino del catálogo.
  assert.match(armarCarrito('vea', [{ sku: '1', cantidad: 1, seller: '1' }]).url, /seller=1&sc=34$/);
});

test('Coto: stock y lista de precios de la sucursal de la zona (sintético)', () => {
  const reg = (extra) => ({
    attributes: { 'product.displayName': ['Leche Entera 1 L'], 'sku.repositoryId': ['sku1'], 'sku.activePrice': ['1899.0'], 'product.sDisp_200': ['1004'], ...extra },
  });
  const [hay] = parsearProductosCoto([reg({ 'product.sDisp_209': ['1004'] })], { sucursal: '209' });
  assert.equal(hay.disponible, true);
  const [noHay] = parsearProductosCoto([reg({ 'product.sDisp_209': ['1001'] })], { sucursal: '209' });
  assert.equal(noHay.disponible, false);
  // Sin sucursal (o sin dato de esa sucursal) vale el stock general.
  assert.equal(parsearProductosCoto([reg({ 'product.sDisp_209': ['1001'] })])[0].disponible, true);
  // Sucursal con lista de precios propia.
  const [propia] = parsearProductosCoto([reg({ 'sku.dtoPrice078': [JSON.stringify({ precioLista: 2100.0 })] })], { sucursal: '078' });
  assert.equal(propia.precioLista, 2100);
});

test('armarCarrito Carrefour: un link por cantidad (Carrefour reparte mal las cantidades mezcladas)', () => {
  const items = [
    { sku: '25341', cantidad: 1, nombre: 'Yerba' },
    { sku: '205787', cantidad: 1, multiplicador: 0.5, nombre: 'Jamón' }, // 1 kg = 2 porciones
    { sku: '268348', cantidad: 1, nombre: 'Colgate' },
  ];
  const c = armarCarrito('carrefour', items, { sucursales: { carrefour: ['carrefourar0029'] } });
  assert.equal(c.tipo, 'pasos');
  assert.equal(c.pasos.length, 2);
  assert.deepEqual(c.pasos[0].items.map((i) => i.sku), ['25341', '268348']);
  assert.match(c.pasos[1].url, /sku=205787&qty=2&seller=carrefourar0029&sc=1$/);
  // Todo con la misma cantidad: un solo link.
  assert.equal(armarCarrito('carrefour', [items[0], items[2]]).tipo, 'link');
  // Jumbo y Vea arman bien las cantidades mezcladas: un solo link.
  assert.equal(armarCarrito('jumbo', items).tipo, 'link');
});
