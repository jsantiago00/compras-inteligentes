// Textos reales de las páginas del BNA (relevados el 11/10/2026).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extraerBna, extraerSemanaNacion, huella, interpretarPromo, interpretarSemanaNacion } from '../lib/promosRelevamiento.js';

const HTML_BNA = `<div>Home Personas Beneficios Naci&#243;n Descuentos y Promociones</div><h1>COTO</h1>
<p>20% de descuento los d&#237;as martes.</p><p>Del 18-8-2026 al 31-10-2026</p>
<p>20% de ahorro los días martes sin tope de reintegro. . Abonando tus compras exclusivamente con MODO BNA+ con tarjetas de débito Mastercard o tarjetas de crédito Visa y Mastercard emitidas por el BNA. Consultá acá condiciones y comercios adheridos.</p><p>(1) CFT (Costo Financiero Total)</p>`;

test('extraerBna + interpretarPromo: Coto martes 20% sin tope con vigencia', () => {
  const texto = extraerBna(HTML_BNA, 'coto');
  assert.match(texto, /^COTO 20% de descuento los días martes\. Del 18-8-2026 al 31-10-2026/);
  assert.ok(!texto.includes('CFT'));
  assert.deepEqual(interpretarPromo(texto), {
    porcentaje: 20, dias: [2], tope: null, sinTope: true, tipoTope: null, minimoCompra: null,
    vigenciaDesde: '2026-08-18', vigenciaHasta: '2026-10-31', modo: true, soloPresencial: false,
  });
});

test('interpretarPromo: textos de Semana Nación', () => {
  const vea = interpretarPromo('¡Ahorrá con BNA-SEMANANACION en Supermercados con 20% de descuento los Viernes en Vea · Tope: $25.000 por mes por cliente');
  assert.equal(vea.porcentaje, 20);
  assert.deepEqual(vea.dias, [5]);
  assert.equal(vea.tope, 25000);
  assert.equal(vea.tipoTope, 'mensual');
  const jumbo = interpretarPromo('disfrutá de -20% en Martes y Jueves los días Martes y Jueves en Supermercados');
  assert.deepEqual(jumbo.dias, [2, 4]);
  assert.equal(jumbo.porcentaje, 20);
  const carrefour = interpretarPromo('5% de descuento los Lunes, Martes, Miércoles, Jueves y Viernes en Carrefour');
  assert.deepEqual(carrefour.dias, [1, 2, 3, 4, 5]);
  assert.deepEqual(interpretarPromo('10% de lunes a viernes').dias, [1, 2, 3, 4, 5]);
  assert.equal(interpretarPromo('compra mínima de $100.000 y tope de $25.000 por mes').minimoCompra, 100000);
  assert.deepEqual(interpretarPromo('TODOS LOS MARTES DEL 01/10/26 AL 31/10/26').vigenciaHasta, '2026-10-31');
});

test('extraerSemanaNacion: lee __NEXT_DATA__', () => {
  const data = {
    props: { pageProps: { data: {
      metadata: { description: '¡Ahorrá ... 20% de descuento los Viernes en Vea' },
      associatedPromotions: [{ name: 'bna-vea-landing' }],
      termsAndConditions: 'PROMOCIÓN VÁLIDA ... BNA+ MODO',
      pages: [{ components: [{ extraData: { a: '-20%', b: 'Tope: $25.000 por mes por cliente', c: 'Viernes', d: '<div>otra cosa larga</div>' } }] }],
    } } },
  };
  const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></html>`;
  const r = extraerSemanaNacion(html);
  assert.equal(r.promociones[0], 'bna-vea-landing');
  assert.deepEqual(r.textos, ['-20%', 'Tope: $25.000 por mes por cliente', 'Viernes']);
  assert.equal(extraerSemanaNacion('<html></html>'), null);
});

test('huella: igual para el mismo contenido, distinta si cambia', () => {
  assert.equal(huella({ a: 1 }), huella({ a: 1 }));
  assert.notEqual(huella({ a: 1 }), huella({ a: 2 }));
});

test('interpretarSemanaNacion: días y condiciones de los T&C, no de la descripción vieja (Coto, texto real)', () => {
  const r = interpretarSemanaNacion({
    descripcion: '¡Ahorrá con BNA-SEMANANACION en Coto y disfrutá de -30% en Coto los días Lunes, Martes, Miércoles, Jueves, Viernes, Sábados y Domingos en Supermercados',
    textos: [],
    condiciones: 'PROMOCIÓN VÁLIDA EN LA REPÚBLICA ARGENTINA TODOS LOS MARTES DEL 01/10/26 AL 31/10/26 EN COMERCIOS DE LA REPUBLICA ARGENTINA ADHERIDOS. PARA COMPRAS PRESENCIALES ABONADAS CON TARJETAS ... APLICA PAGANDO A TRAVÉS DE MODO BNA+ ... SIN TOPE DE DESCUENTO POR CLIENTE. ... LA PROMOCIÓN NO APLICA PARA COMPRAR ONLINE.',
  });
  assert.deepEqual(r.dias, [2]);
  assert.equal(r.vigenciaHasta, '2026-10-31');
  assert.equal(r.sinTope, true);
  assert.equal(r.soloPresencial, true);
  // El % sale de la descripción (desactualizada): el relevamiento lo marca como diferencia contra bna.com.ar.
  assert.equal(r.porcentaje, 30);
  const vea = interpretarSemanaNacion({ descripcion: '20% de descuento los Viernes en Vea', textos: ['-20%', 'Tope: $25.000 por mes por cliente', 'Viernes'], condiciones: 'PAGANDO EXCLUSIVAMENTE CON BNA+ MODO' });
  assert.deepEqual([vea.porcentaje, vea.dias, vea.tope, vea.tipoTope, vea.soloPresencial], [20, [5], 25000, 'mensual', false]);
});
