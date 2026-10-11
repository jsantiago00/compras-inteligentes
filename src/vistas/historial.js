// Historial de pedidos + frecuencia de compra por producto.

import { MEDIOS, SUPERS } from '../../lib/constantes.js';
import { pesos } from '../../lib/formato.js';
import { aIso, isoLocal } from '../../lib/motor/fechas.js';
import { frecuencias } from '../../lib/motor/sugerencias.js';
import { estado } from '../estado.js';
import { h, montar } from '../ui.js';

export async function vistaHistorial(app) {
  const pedidos = (await estado.store.listar('pedidos')).sort((a, b) => (aIso(b.fecha) > aIso(a.fecha) ? 1 : -1));
  const frec = frecuencias(pedidos, isoLocal());

  async function borrar(p) {
    if (!confirm('¿Borrar este pedido del historial?')) return;
    await estado.store.borrar('pedidos', p.id);
    vistaHistorial(app);
  }

  montar(
    app,
    h('h1', null, 'Historial'),
    frec.length
      ? h(
          'details',
          { class: 'tarjeta' },
          h('summary', null, h('b', null, 'Frecuencia de compra')),
          h('table', null, h('tbody', null, frec.map((f) => h('tr', null, h('td', null, f.nombre), h('td', { class: 'num' }, `cada ~${f.cadaDias} d`), h('td', { class: `num ${f.toca ? 'alerta' : 'suave'}` }, `hace ${f.hace} d`))))),
        )
      : null,
    pedidos.length
      ? pedidos.map((p) =>
          h(
            'details',
            { class: 'tarjeta' },
            h('summary', null, h('b', null, `${aIso(p.fecha)} · ${SUPERS[p.super]} · ${pesos(p.total)}`), h('div', { class: 'suave chico' }, `${MEDIOS[p.medio]}${p.descuentoBancario ? ` · ahorro bancario ${pesos(p.descuentoBancario)}` : ''}${p.listaNombre ? ` · ${p.listaNombre}` : ''}`)),
            h('ul', null, (p.items ?? []).map((i) => h('li', null, `${i.nombre} ×${i.cantidad}${i.costo ? ` — ${pesos(i.costo)}` : ''}`))),
            h('button', { class: 'peligro', onclick: () => borrar(p) }, 'Borrar'),
          ),
        )
      : h('p', { class: 'vacio' }, 'Todavía no registraste compras. Después de comprar, tocá "Ya compré" en la recomendación.'),
  );
}
