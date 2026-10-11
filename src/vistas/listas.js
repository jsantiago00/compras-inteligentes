// Inicio: saludo, sugerencias según el historial y las listas de compras.

import { isoLocal } from '../../lib/motor/fechas.js';
import { sugerencias } from '../../lib/motor/sugerencias.js';
import { direccionActiva, estado } from '../estado.js';
import { aviso, h, montar, vacio } from '../ui.js';

function saludo() {
  const hora = new Date().getHours();
  const momento = hora < 13 ? 'Buen día' : hora < 20 ? 'Buenas tardes' : 'Buenas noches';
  const nombre = estado.usuario?.displayName?.split(' ')[0];
  return nombre ? `${momento}, ${nombre}` : momento;
}

export async function vistaListas(app) {
  const [listas, pedidos] = await Promise.all([estado.store.listar('listas'), estado.store.listar('pedidos')]);
  listas.sort((a, b) => (b.actualizada ?? 0) - (a.actualizada ?? 0));
  const sug = sugerencias(pedidos, isoLocal());

  async function crear() {
    const n = prompt('¿Cómo se llama la lista?', 'Compra del mes');
    if (n === null) return;
    const l = await estado.store.guardar('listas', { nombre: n.trim() || 'Lista nueva', items: [], actualizada: Date.now() });
    location.hash = `#/lista/${l.id}`;
  }

  async function duplicar(l) {
    const { id, ...resto } = l;
    await estado.store.guardar('listas', { ...structuredClone(resto), nombre: `${l.nombre} (copia)`, actualizada: Date.now() });
    aviso('Lista copiada');
    vistaListas(app);
  }

  async function borrar(l) {
    if (!confirm(`¿Borrar la lista "${l.nombre}"?`)) return;
    await estado.store.borrar('listas', l.id);
    aviso('Lista borrada');
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

  const productos = (n) => (n === 1 ? '1 producto' : `${n} productos`);

  montar(
    app,
    h('div', { class: 'saludo' }, h('h1', null, saludo()), h('p', null, `¿Qué hay que comprar? Entrega en ${direccionActiva().nombre}.`)),
    sug.length
      ? h(
          'section',
          { class: 'tarjeta destacada' },
          h('h3', null, '💡 Se te está por terminar'),
          h('ul', { style: { margin: '6px 0 12px', paddingLeft: '22px' } }, sug.slice(0, 6).map((s) => h('li', null, s.texto))),
          h('button', { class: 'primario ancho', onclick: agregarSugerencias }, `Agregar a ${listas[0] ? `"${listas[0].nombre}"` : 'una lista nueva'}`),
        )
      : null,
    listas.length
      ? listas.map((l) =>
          h(
            'article',
            { class: 'tarjeta lista-card' },
            h(
              'a',
              { class: 'cuerpo', href: `#/lista/${l.id}`, 'aria-label': `Abrir la lista ${l.nombre}` },
              h('span', { class: 'icono', 'aria-hidden': 'true' }, '🛒'),
              h('div', { class: 'crece' }, h('div', { class: 'nombre' }, l.nombre), h('div', { class: 'suave' }, l.items.length ? `${productos(l.items.length)} · tocá para editar` : 'Vacía · tocá para agregar productos')),
            ),
            h(
              'div',
              { class: 'acciones' },
              l.items.length ? h('a', { class: 'boton primario', href: `#/reco/${l.id}` }, '¿Dónde compro?') : h('a', { class: 'boton primario', href: `#/lista/${l.id}` }, 'Agregar productos'),
              h('button', { class: 'texto', onclick: () => duplicar(l) }, 'Copiar'),
              h('button', { class: 'texto peligro', onclick: () => borrar(l) }, 'Borrar'),
            ),
          ),
        )
      : vacio('📝', 'Todavía no tenés listas.', h('br'), 'Creá la primera, por ejemplo "Compra del mes".'),
    h('button', { class: `ancho grande${listas.length ? ' nueva-lista' : ' primario'}`, onclick: crear }, '+ Nueva lista'),
  );
}
