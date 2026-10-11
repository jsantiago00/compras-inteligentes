// Direcciones de entrega: validación de la zona que manda el navegador,
// separación de la caché por zona y costo de envío de una simulación. Sin red.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { almacenDeZona, almacenMemoria } from '../lib/servidor/almacen.js';
import { costoEnvio, resolverZona } from '../lib/servidor/zonas.js';
import { sufijoZona, ZONA, zonaDePedido } from '../lib/zona.js';

test('zonaDePedido: valida súper y sucursales; sin zona usa la principal', () => {
  assert.equal(zonaDePedido(undefined), ZONA);
  assert.equal(zonaDePedido('no es json'), ZONA);
  const z = zonaDePedido(JSON.stringify({ supers: ['jumbo', 'vea', 'dia'], sucursales: { jumbo: ['jumboargentinaj5259tronador'], vea: ['x;y'] } }));
  // Vea sin sucursal válida se descarta: daría precios de otra zona.
  assert.deepEqual(z, { supers: ['jumbo'], sucursales: { jumbo: ['jumboargentinaj5259tronador'] } });
  assert.deepEqual(zonaDePedido({ supers: ['coto'], sucursales: {} }).supers, ['coto']);
});

test('sufijoZona y almacenDeZona: cada zona tiene sus precios; la principal no cambia de clave', async () => {
  assert.equal(sufijoZona(ZONA), '');
  const otra = zonaDePedido({ supers: ['jumbo'], sucursales: { jumbo: ['jumboargentinaj5259tronador'] } });
  const sufijo = sufijoZona(otra);
  assert.match(sufijo, /^~[a-z0-9]+$/);
  const base = almacenMemoria();
  await almacenDeZona(base, sufijo).set('precios', 'jumbo_ean_1', { precio: 2 });
  await almacenDeZona(base, sufijo).set('zonas', '5501', { ok: true });
  await base.set('precios', 'jumbo_ean_1', { precio: 1 });
  assert.deepEqual(await almacenDeZona(base, sufijo).get('precios', 'jumbo_ean_1'), { precio: 2 });
  assert.deepEqual(await almacenDeZona(base, '').get('precios', 'jumbo_ean_1'), { precio: 1 });
  // Las colecciones que no dependen de la sucursal no llevan sufijo.
  assert.deepEqual(await base.get('zonas', '5501'), { ok: true });
});

test('costoEnvio: franja más barata del "Envío a Domicilio"; null si solo hay retiro', () => {
  const sim = {
    logisticsInfo: [{ slas: [
      { id: 'Retiro en Tienda - Vea Godoy Cruz', price: 0 },
      { id: 'Envío a Domicilio', price: 0, availableDeliveryWindows: [{ price: 449900, tax: 0 }, { price: 349900, tax: 0 }] },
    ] }],
  };
  assert.equal(costoEnvio(sim), 3499);
  assert.equal(costoEnvio({ logisticsInfo: [{ slas: [{ id: 'Retiro en Tienda', price: 0 }] }] }), null);
  assert.equal(costoEnvio({}), null);
});

test('resolverZona: rechaza códigos postales inválidos sin consultar nada', async () => {
  const cliente = { json: async () => assert.fail('no debería consultar') };
  await assert.rejects(resolverZona({ codigoPostal: '55', cliente }), (e) => e.status === 400);
});
