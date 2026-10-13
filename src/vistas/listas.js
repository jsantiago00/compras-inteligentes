// Inicio: saludo, a dónde te traen las compras, la promo del día, las listas
// y lo que se está por terminar (según el historial).

import { DIAS, nombreMedio, SUPERS } from '../../lib/constantes.js';
import { pesos } from '../../lib/formato.js';
import { isoLocal } from '../../lib/motor/fechas.js';
import { promoAplica } from '../../lib/motor/promos.js';
import { sugerencias } from '../../lib/motor/sugerencias.js';
import { direccionActiva, estado, misMedios, zonaActiva } from '../estado.js';
import { aviso, h, montar, vacio } from '../ui.js';

function saludo() {
  const hora = new Date().getHours();
  return hora < 13 ? 'Buen día' : hora < 20 ? 'Buenas tardes' : 'Buenas noches';
}

/** La mejor promo confirmada que vale hoy con los medios del usuario, o null. */
function promoDeHoy(promos, hoy) {
  let mejor = null;
  for (const p of promos) {
    if (p.ficticia || !zonaActiva().supers.includes(p.super)) continue;
    const medio = misMedios().find((m) => promoAplica(p, { super: p.super, medio: m, fecha: hoy }));
    if (medio && (!mejor || p.porcentaje > mejor.promo.porcentaje)) mejor = { promo: p, medio };
  }
  return mejor;
}

export async function vistaListas(app) {
  const [listas, pedidos, promos] = await Promise.all([estado.store.listar('listas'), estado.store.listar('pedidos'), estado.store.listar('promos')]);
  listas.sort((a, b) => (b.actualizada ?? 0) - (a.actualizada ?? 0));
  const hoy = isoLocal();
  const sug = sugerencias(pedidos, hoy);
  const deHoy = promoDeHoy(promos, hoy);

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
  const usuario = estado.usuario;
  const nombre = usuario?.displayName?.split(' ')[0];
  const dir = direccionActiva();

  function miniaturas(l) {
    const conFoto = l.items.slice(0, 5);
    if (!conFoto.length) return null;
    return h(
      'div',
      { class: 'miniaturas', 'aria-hidden': 'true' },
      conFoto.map((it) => h('span', null, it.imagen ? h('img', { src: it.imagen, alt: '', loading: 'lazy' }) : '🛍️')),
      l.items.length > 5 ? h('em', null, `+${l.items.length - 5} más`) : null,
    );
  }

  montar(
    app,
    h(
      'div',
      { class: 'inicio-top' },
      h('div', null, h('small', null, saludo()), h('h1', null, nombre ? `Hola, ${nombre} 👋` : 'Hola 👋')),
      h('a', { class: 'avatar', href: '#/ajustes', 'aria-label': 'Ajustes de tu cuenta' }, usuario?.photoURL ? h('img', { src: usuario.photoURL, alt: '', referrerpolicy: 'no-referrer' }) : (nombre ?? 'Yo').slice(0, 1).toUpperCase()),
    ),
    h('a', { class: 'pildora-entrega', href: '#/ajustes' }, h('i'), h('span', null, `Entrega en ${dir.nombre}${dir.direccion ? ` · ${dir.direccion}` : ''}`)),
    deHoy
      ? h(
          'a',
          { class: 'promo-dia', href: '#/promos' },
          h('span', { class: 'pct' }, `${deHoy.promo.porcentaje}%`),
          h(
            'div',
            null,
            h('b', null, `Hoy ${DIAS[new Date(`${hoy}T12:00`).getDay()]}: ${SUPERS[deHoy.promo.super]} con ${nombreMedio(deHoy.promo.medio === 'todos' ? 'todos' : deHoy.medio)}`),
            h('span', null, deHoy.promo.tope ? `Tope ${pesos(deHoy.promo.tope)}${deHoy.promo.tipoTope === 'mensual' ? ' por mes' : deHoy.promo.tipoTope === 'semanal' ? ' por semana' : ''}` : 'Sin tope'),
          ),
        )
      : !promos.some((p) => !p.ficticia)
        ? h('a', { class: 'tarjeta fila', href: '#/promos', style: { textDecoration: 'none', color: 'inherit' } }, h('span', { style: { fontSize: '28px' } }, '💳'), h('div', { class: 'crece' }, h('b', null, 'Confirmá tus promos del banco'), h('div', { class: 'suave chico' }, 'Así te aviso acá cuál conviene cada día.')))
        : null,
    h('div', { class: 'encabezado-seccion' }, h('h2', null, 'Tus listas'), h('button', { class: 'texto', onclick: crear }, '+ Nueva')),
    listas.length
      ? listas.map((l) =>
          h(
            'article',
            { class: 'tarjeta lista-card' },
            h(
              'a',
              { class: 'cuerpo', href: `#/lista/${l.id}`, 'aria-label': `Abrir la lista ${l.nombre}` },
              h('span', { class: 'icono', 'aria-hidden': 'true' }, '🛒'),
              h('div', { class: 'crece' }, h('div', { class: 'nombre' }, l.nombre), h('div', { class: 'suave' }, l.items.length ? productos(l.items.length) : 'Vacía · tocá para agregar productos')),
            ),
            miniaturas(l),
            h(
              'div',
              { class: 'acciones' },
              l.items.length ? h('a', { class: 'boton primario', href: `#/reco/${l.id}` }, '¿Dónde compro? →') : h('a', { class: 'boton primario', href: `#/lista/${l.id}` }, 'Agregar productos'),
              h('a', { class: 'boton texto', href: `#/lista/${l.id}` }, 'Editar'),
              h('button', { class: 'texto', onclick: () => duplicar(l) }, 'Copiar'),
              h('button', { class: 'texto peligro', onclick: () => borrar(l) }, 'Borrar'),
            ),
          ),
        )
      : vacio('📝', 'Todavía no tenés listas.', h('br'), 'Creá la primera, por ejemplo "Compra del mes".'),
    h('button', { class: `ancho grande${listas.length ? ' nueva-lista' : ' primario'}`, onclick: crear }, '+ Nueva lista'),
    sug.length
      ? [
          h('div', { class: 'encabezado-seccion', style: { marginTop: '24px' } }, h('h2', null, 'Se te está por terminar')),
          h('div', { class: 'chips-sugerencias' }, sug.slice(0, 8).map((s) => h('span', { class: 'chip' }, s.nombre ?? s.texto))),
          h('button', { class: 'secundario ancho', onclick: agregarSugerencias, style: { marginTop: '12px' } }, `Agregar a ${listas[0] ? `"${listas[0].nombre}"` : 'una lista nueva'}`),
        ]
      : null,
  );
}
