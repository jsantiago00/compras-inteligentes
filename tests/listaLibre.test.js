import assert from 'node:assert/strict';
import { test } from 'node:test';
import { claveLibre, contenidoPedido, elegirProductos, esRelevante, parsearLinea, separarLineas } from '../lib/motor/listaLibre.js';
import { recomendar } from '../lib/motor/recomendacion.js';
import { fetchFixtures } from '../lib/scrapers/fixtures.js';
import { crearAdaptadores } from '../lib/scrapers/index.js';

test('separarLineas: enter, punto y coma y comas que no son decimales', () => {
  assert.deepEqual(separarLineas('- yerba\n2 leche, arroz 1kg; coca cola 2,25 L\n\n• fideos'), ['yerba', '2 leche', 'arroz 1kg', 'coca cola 2,25 L', 'fideos']);
});

test('parsearLinea: cantidades sin confundirlas con contenidos', () => {
  assert.deepEqual(parsearLinea('2 coca cola'), { texto: 'coca cola', cantidad: 2 });
  assert.deepEqual(parsearLinea('3x fideos'), { texto: 'fideos', cantidad: 3 });
  assert.deepEqual(parsearLinea('yerba playadito x2'), { texto: 'yerba playadito', cantidad: 2 });
  assert.deepEqual(parsearLinea('leche (4)'), { texto: 'leche', cantidad: 4 });
  assert.deepEqual(parsearLinea('1 kg arroz'), { texto: '1 kg arroz', cantidad: 1 });
  assert.deepEqual(parsearLinea('2,25 coca'), { texto: '2,25 coca', cantidad: 1 });
  assert.deepEqual(parsearLinea('fideos x 500g'), { texto: 'fideos x 500g', cantidad: 1 });
});

test('contenidoPedido y esRelevante', () => {
  assert.deepEqual(contenidoPedido('arroz 1kg'), { contenido: 1, unidad: 'kg' });
  assert.equal(contenidoPedido('yerba playadito'), null);
  assert.equal(esRelevante('fideos tirabuzon', { nombre: 'Fideo Tirabuzón Matarazzo 500 g', marca: 'Matarazzo' }), true);
  assert.equal(esRelevante('yerba playadito', { nombre: 'Yerba Mate Taragüí 1 Kg', marca: 'Taragüí' }), false);
});

const p = (sup, ean, nombre, precio, contenido, unidad = 'kg', extra = {}) => ({ super: sup, ean, sku: `${sup}-${ean}`, nombre, marca: null, precioLista: precio, precioOferta: null, contenido, unidad, disponible: true, ...extra });

test('elegirProductos: prefiere el EAN que está en más súper', () => {
  const r = elegirProductos('yerba', {
    jumbo: [p('jumbo', 'A', 'Yerba Marca A 1 Kg', 5000, 1), p('jumbo', 'B', 'Yerba Marca B 500 g', 2000, 0.5)],
    vea: [p('vea', 'A', 'Yerba Marca A 1 Kg', 4900, 1)],
    coto: [p('coto', 'C', 'Yerba Marca C 1 Kg', 4000, 1)],
  });
  assert.equal(r.elegidos.jumbo.ean, 'A');
  assert.equal(r.elegidos.vea.ean, 'A');
  // Coto no tiene A: misma presentación (1 kg), la más barata.
  assert.equal(r.elegidos.coto.ean, 'C');
  assert.equal(r.ean, null);
  assert.deepEqual(r.contenido, { contenido: 1, unidad: 'kg' });
});

test('elegirProductos: respeta el contenido pedido, descarta sin stock y no relevantes', () => {
  const r = elegirProductos('arroz 1kg', {
    jumbo: [p('jumbo', 'X', 'Arroz Largo 500 g', 900, 0.5), p('jumbo', 'Y', 'Arroz Largo 1 Kg', 1900, 1), p('jumbo', 'Z', 'Arroz Doble 1 Kg', 1500, 1, 'kg', { disponible: false })],
    vea: [p('vea', 'Q', 'Fideos 1 Kg', 1000, 1)],
  });
  assert.equal(r.elegidos.jumbo.ean, 'Y');
  assert.equal(r.elegidos.vea, undefined, 'fideos no es arroz');
  assert.equal(r.alternativas.jumbo.length, 1);
});

test('claveLibre es estable y sin acentos', () => {
  assert.equal(claveLibre('Azúcar Ledesma 1 kg'), 'libre:azucar-ledesma-1-kg');
});

test('lista libre contra respuestas reales: elige y la recomendación cubre la lista', async () => {
  const a = await crearAdaptadores({ fetch: fetchFixtures, intervaloMs: 0, env: {} });
  const textos = ['coca cola 2.25', 'yerba playadito', 'fernet branca'];
  const items = [];
  const precios = {};
  for (const t of textos) {
    const porSuper = {};
    for (const sup of ['jumbo', 'vea', 'carrefour', 'coto']) porSuper[sup] = await a[sup].buscar(t);
    const r = elegirProductos(t, porSuper);
    const clave = claveLibre(t);
    items.push({ clave, cantidad: 1 });
    precios[clave] = r.elegidos;
    if (t === 'coca cola 2.25') {
      // Coca-Cola Sabor Original 2,25 L está en los 4 con el mismo EAN.
      assert.equal(r.ean, '7790895000997');
    }
    if (t === 'fernet branca') {
      // Sin presentación pedida: la más común (750 cc) en todos.
      for (const prod of Object.values(r.elegidos)) assert.equal(prod.contenido, 0.75, prod.nombre);
    }
  }
  const reco = recomendar({ items, precios, hoy: '2026-10-11' });
  assert.equal(reco.mejor.faltantes.length, 0);
  assert.equal(reco.mejor.lineas.length, 3);
});
