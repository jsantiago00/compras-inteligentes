// Inicio: sugerencias según el historial + listas de compras.

import { isoLocal } from '../../lib/motor/fechas.js';
import { sugerencias } from '../../lib/motor/sugerencias.js';
import { estado } from '../estado.js';
import { aviso, h, montar } from '../ui.js';

export async function vistaListas(app) {
  const [listas, pedidos] = await Promise.all([estado.store.listar('listas'), estado.store.listar('pedidos')]);
  listas.sort((a, b) => (b.actualizada ?? 0) - (a.actualizada ?? 0));
  const sug = sugerencias(pedidos, isoLocal());

  const nombre = h('input', { placeholder: 'Ej.: Compra mensual', 'aria-label': 'Nombre de la lista nueva' });
  async function crear(e) {
    e.preventDefault();
    const n = nombre.value.trim() || 'Lista nueva';
    const l = await estado.store.guardar('listas', { nombre: n, items: [], actualizada: Date.now() });
    location.hash = `#/lista/${l.id}`;
  }

  async function duplicar(l) {
    const { id, ...resto } = l;
    await estado.store.guardar('listas', { ...structuredClone(resto), nombre: `${l.nombre} (copia)`, actualizada: Date.now() });
    aviso('Lista duplicada');
    vistaListas(app);
  }

  async function borrar(l) {
    if (!confirm(`¿Borrar la lista "${l.nombre}"?`)) return;
    await estado.store.borrar('listas', l.id);
    vistaListas(app);
  }

  async function agregarSugerencias() {
    let lista = listas[0];
    if (!lista) lista = await estado.store.guardar('listas', { nombre: 'Reposición', items: [], actualizada: Date.now() });
    const ultimos = new Map();
    for (const p of pedidos) for (const it of p.items ?? []) ultimos.set(it.clave, it);
    for (const s of sug) {
      if (lista.items.some((i) => i.clave === s.clave)) continue;
      const it = ultimos.get(s.clave);
      if (it) lista.items.push({ ...it, cantidad: it.cantidad ?? 1 });
    }
    lista.actualizada = Date.now();
    await estado.store.guardar('listas', lista);
    location.hash = `#/lista/${lista.id}`;
  }

  montar(
    app,
    h('h1', null, 'Mis listas'),
    sug.length
      ? h(
          'section',
          { class: 'tarjeta' },
          h('h2', { style: { marginTop: 0 } }, '💡 Te toca comprar'),
          h('ul', null, sug.slice(0, 8).map((s) => h('li', null, s.texto))),
          h('button', { onclick: agregarSugerencias }, `Agregar a ${listas[0] ? `"${listas[0].nombre}"` : 'una lista nueva'}`),
        )
      : null,
    h('form', { class: 'fila tarjeta', onsubmit: crear }, h('div', { class: 'crece' }, nombre), h('button', { class: 'primario', type: 'submit' }, '+ Crear lista')),
    listas.length
      ? listas.map((l) =>
          h(
            'div',
            { class: 'tarjeta fila' },
            h('a', { href: `#/lista/${l.id}`, class: 'crece', style: { textDecoration: 'none', color: 'inherit' } }, h('b', null, l.nombre), h('div', { class: 'suave' }, `${l.items.length} producto(s)`)),
            h('a', { class: 'boton primario', href: `#/reco/${l.id}` }, '¿Dónde compro?'),
            h('button', { onclick: () => duplicar(l), title: 'Duplicar' }, '⧉'),
            h('button', { class: 'peligro', onclick: () => borrar(l), title: 'Borrar' }, '🗑'),
          ),
        )
      : h('p', { class: 'vacio' }, 'Todavía no tenés listas. Creá una, por ejemplo "Compra mensual".'),
  );
}
