// Compras registradas ("Ya compré") + cada cuánto se compra cada producto.

import { nombreMedio, SUPERS } from '../../lib/constantes.js';
import { nombreDia, pesos } from '../../lib/formato.js';
import { aIso, isoLocal } from '../../lib/motor/fechas.js';
import { frecuencias } from '../../lib/motor/sugerencias.js';
import { estado } from '../estado.js';
import { h, montar, vacio } from '../ui.js';

export async function vistaHistorial(app) {
  const pedidos = (await estado.store.listar('pedidos')).sort((a, b) => (aIso(b.fecha) > aIso(a.fecha) ? 1 : -1));
  const frec = frecuencias(pedidos, isoLocal());
  const ahorroTotal = pedidos.reduce((s, p) => s + (p.descuentoBancario ?? 0), 0);

  async function borrar(p) {
    if (!confirm('¿Borrar esta compra del historial?')) return;
    await estado.store.borrar('pedidos', p.id);
    vistaHistorial(app);
  }

  const fecha = (iso) => `${nombreDia(iso).replace(/^./, (c) => c.toUpperCase())} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

  montar(
    app,
    h('h1', null, 'Tus compras'),
    ahorroTotal > 0 ? h('div', { class: 'tarjeta destacada', style: { textAlign: 'center' } }, h('div', { class: 'suave' }, 'Ahorraste con promos del banco'), h('div', { class: 'promo-titulo' }, pesos(ahorroTotal))) : null,
    pedidos.length
      ? pedidos.map((p) =>
          h(
            'details',
            { class: 'desplegable' },
            h('summary', null, h('span', null, h('span', null, `${SUPERS[p.super]} · ${pesos(p.total)}`), h('div', { class: 'suave chico', style: { fontWeight: 400 } }, `${fecha(aIso(p.fecha))}${p.listaNombre ? ` · ${p.listaNombre}` : ''}`))),
            h(
              'div',
              { class: 'contenido' },
              h('div', { class: 'suave chico' }, `${nombreMedio(p.medio)}${p.descuentoBancario ? ` · ahorro del banco ${pesos(p.descuentoBancario)}` : ''}`),
              h('ul', { style: { paddingLeft: '20px' } }, (p.items ?? []).map((i) => h('li', null, `${i.nombre} ×${i.cantidad}${i.costo ? ` — ${pesos(i.costo)}` : ''}`))),
              h('button', { class: 'texto peligro', onclick: () => borrar(p) }, 'Borrar esta compra'),
            ),
          ),
        )
      : vacio('🧾', 'Todavía no guardaste compras.', h('br'), 'Cuando compres, tocá "Ya compré" y queda acá.'),
    frec.length
      ? h(
          'details',
          { class: 'desplegable' },
          h('summary', null, '🔁 Cada cuánto comprás cada cosa'),
          h('div', { class: 'contenido' }, h('table', null, h('tbody', null, frec.map((f) => h('tr', null, h('td', null, f.nombre, h('div', { class: 'suave chico' }, `cada ~${f.cadaDias} días`)), h('td', { class: `num ${f.toca ? 'alerta' : 'suave'}` }, f.toca ? `¡hace ${f.hace} días!` : `hace ${f.hace} días`)))))),
        )
      : null,
  );
}
