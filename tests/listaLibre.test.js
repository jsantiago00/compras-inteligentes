import assert from 'node:assert/strict';
import { test } from 'node:test';
import { claveLibre, contenidoPedido, elegirProductos, envasesPara, esRelevante, parsearLinea, separarLineas } from '../lib/motor/listaLibre.js';
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

test('elegirProductos: a igual costo prefiere el EAN de más súper; si otro sale más barato, ese', () => {
  const r = elegirProductos('yerba', {
    jumbo: [p('jumbo', 'A', 'Yerba Marca A 1 Kg', 4000, 1), p('jumbo', 'B', 'Yerba Marca B 500 g', 2000, 0.5)],
    vea: [p('vea', 'A', 'Yerba Marca A 1 Kg', 4900, 1), p('vea', 'D', 'Yerba Marca D 500 g', 2000, 0.5)],
    coto: [p('coto', 'C', 'Yerba Marca C 1 Kg', 4000, 1)],
  });
  // Jumbo: 1 kg de A ($4000) = 2 × 500 g de B ($4000): empate, gana el EAN compartido.
  assert.equal(r.elegidos.jumbo.ean, 'A');
  // Vea: 2 × 500 g de D ($4000) es más barato que 1 kg de A ($4900).
  assert.equal(r.elegidos.vea.ean, 'D');
  assert.equal(r.elegidos.coto.ean, 'C');
  assert.deepEqual(r.necesidad, { contenido: 1, unidad: 'kg' });
});

test('elegirProductos: lavandina — 1 × 2 L o 2 × 1 L, lo que salga más barato en total', () => {
  const lav = (sup, ean, nombre, precio, litros, extra) => p(sup, ean, nombre, precio, litros, 'l', extra);
  const res = {
    jumbo: [lav('jumbo', 'L1', 'Lavandina Ayudin 1 L', 1000, 1), lav('jumbo', 'L2', 'Lavandina Ayudin 2 L', 1700, 2)],
    vea: [lav('vea', 'L1', 'Lavandina Ayudin 1 L', 800, 1), lav('vea', 'L2', 'Lavandina Ayudin 2 L', 1900, 2)],
    coto: [lav('coto', 'L1', 'Lavandina Ayudin 1 L', 1000, 1, { promoGondola: { tipo: 'segunda_unidad', porcentaje: 50 } }), lav('coto', 'L2', 'Lavandina Ayudin 2 L', 1800, 2)],
  };
  const r = elegirProductos('lavandina 2l', res);
  assert.equal(r.elegidos.jumbo.ean, 'L2'); // $1700 < 2 × $1000
  assert.equal(r.elegidos.vea.ean, 'L1'); // 2 × $800 = $1600 < $1900
  assert.equal(r.elegidos.coto.ean, 'L1'); // 2 × $1000 con 2da al 50 % = $1500 < $1800
  // "2 lavandina" sin litros: la presentación de referencia es 1 L → hacen falta 2 L.
  const r2 = elegirProductos('lavandina', res, { cantidad: 2 });
  assert.equal(r2.elegidos.jumbo.ean, 'L2');
  assert.deepEqual(r2.necesidad, { contenido: 1, unidad: 'l' });
  // El más barato por litro de todos: Vea 1 L ($800/l).
  assert.equal(r2.mejorPorUnidad.super, 'vea');
  assert.equal(envasesPara(res.jumbo[0], 2), 2);
  assert.equal(envasesPara(res.jumbo[1], 2), 1);
});

test('elegirProductos: respeta la unidad pedida, descarta sin stock y no relevantes', () => {
  const r = elegirProductos('arroz 1kg', {
    jumbo: [p('jumbo', 'X', 'Arroz Largo 500 g', 1000, 0.5), p('jumbo', 'Y', 'Arroz Largo 1 Kg', 1900, 1), p('jumbo', 'Z', 'Arroz Doble 1 Kg', 1500, 1, 'kg', { disponible: false })],
    vea: [p('vea', 'Q', 'Fideos 1 Kg', 1000, 1)],
  });
  // 1 kg: 2 × 500 g ($2000) vs 1 × 1 kg ($1900) → el de 1 kg. El sin stock no cuenta.
  assert.equal(r.elegidos.jumbo.ean, 'Y');
  assert.equal(r.elegidos.vea, undefined, 'fideos no es arroz');
  assert.equal(r.alternativas.jumbo.length, 2);
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

test('sinónimos: "carne molida" y "patamuslo" como los nombra Coto', async () => {
  const { variantes } = await import('../lib/motor/listaLibre.js');
  assert.deepEqual(variantes('carne molida'), ['carne molida', 'carne picada', 'picada especial']);
  assert.deepEqual(variantes('patamuslo'), ['patamuslo', 'pata muslo']);
  assert.deepEqual(variantes('yerba'), ['yerba']);
  const r = elegirProductos('carne molida', {
    coto: [p('coto', null, 'Picada De Cerdo X KG', 8500, 1), p('coto', null, 'Picada Especial X KG', 12999, 1)],
  });
  // La de cerdo es más barata pero no es carne molida.
  assert.equal(r.elegidos.coto.nombre, 'Picada Especial X KG');
  assert.ok(elegirProductos('patamuslo', { coto: [p('coto', null, 'Pata Muslo Con Piel X Kg Congelados', 3999, 1)] }).elegidos.coto);
});

test('recomendar: cada súper cobra los envases de su presentación (2 L = 1 bidón o 2 botellas)', async () => {
  const { envasesItem } = await import('../lib/motor/recomendacion.js');
  const lav = (sup, ean, litros, precio) => p(sup, ean, `Lavandina ${litros} L`, precio, litros, 'l');
  const item = { clave: 'lav', cantidad: 2, necesidad: { contenido: 1, unidad: 'l' } };
  assert.equal(envasesItem(item, lav('jumbo', 'L2', 2, 1700)), 1);
  assert.equal(envasesItem(item, lav('vea', 'L1', 1, 800)), 2);
  // Sin necesidad (ítems buscados a mano): la cantidad tal cual.
  assert.equal(envasesItem({ cantidad: 3 }, lav('vea', 'L1', 1, 800)), 3);
  const reco = recomendar({
    items: [{ ...item, nombre: 'lavandina' }],
    precios: { lav: { jumbo: lav('jumbo', 'L2', 2, 1700), vea: lav('vea', 'L1', 1, 800) } },
    hoy: '2026-10-12',
    dias: 1,
    supers: ['jumbo', 'vea'],
    medios: ['cualquiera'],
  });
  const porSuper = Object.fromEntries(reco.ranking.map((o) => [o.super, o.lineas[0]]));
  assert.deepEqual([porSuper.jumbo.cantidad, porSuper.jumbo.costo], [1, 1700]);
  assert.deepEqual([porSuper.vea.cantidad, porSuper.vea.costo], [2, 1600]);
});

test('la cantidad del texto no se busca en el nombre ("lavandina 2l" encuentra "Lavandina 2 Lts")', async () => {
  const { textoSinCantidad } = await import('../lib/motor/listaLibre.js');
  assert.equal(textoSinCantidad('lavandina 2l'), 'lavandina');
  assert.equal(textoSinCantidad('aceite girasol 1,5 lts'), 'aceite girasol');
  assert.equal(esRelevante('lavandina 2l', { nombre: 'Lavandina Ayudín 2 Lts' }), true);
});

test('los productos sin TACC solo entran si se piden', () => {
  assert.equal(esRelevante('pan frances', { nombre: 'Pan frances Schar sin tacc 100 grs' }), false);
  assert.equal(esRelevante('pan frances sin tacc', { nombre: 'Pan frances Schar sin tacc 100 grs' }), true);
  assert.equal(esRelevante('pan frances', { nombre: 'Pan Francés x Kg' }), true);
});
