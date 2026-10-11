// Recomendación de 7 días para una lista: mejor opción, calendario semanal,
// ranking, compra dividida, armado del carrito y "Ya compré".

import { armarCarrito } from '../../lib/carrito.js';
import { DIAS, MEDIOS, SUPERS } from '../../lib/constantes.js';
import { nombreDia, pesos } from '../../lib/formato.js';
import { detectarSubaPrevia } from '../../lib/motor/historialPrecios.js';
import { isoLocal } from '../../lib/motor/fechas.js';
import { recomendar, textoOpcion } from '../../lib/motor/recomendacion.js';
import * as api from '../api.js';
import { estado } from '../estado.js';
import { aviso, cargando, h, montar } from '../ui.js';

const fechaCorta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export async function vistaRecomendacion(app, id, { refrescar = false } = {}) {
  montar(app, cargando('Consultando precios…'));
  const [lista, promos, pedidos] = await Promise.all([estado.store.obtener('listas', id), estado.store.listar('promos'), estado.store.listar('pedidos')]);
  if (!lista) return montar(app, h('p', { class: 'vacio' }, 'No encontré esa lista. ', h('a', { href: '#/' }, 'Volver')));
  if (!lista.items.length) return montar(app, h('p', { class: 'vacio' }, 'La lista está vacía. ', h('a', { href: `#/lista/${id}` }, 'Agregá productos')));

  const claveCache = `${id}|${estado.config.demo ? 'demo' : 'real'}`;
  let datos = refrescar ? null : estado.precios.get(claveCache);
  if (!datos) {
    try {
      datos = await api.precios(lista.items, { demo: estado.config.demo });
      datos.cuando = Date.now();
      estado.precios.set(claveCache, datos);
    } catch (e) {
      return montar(app, h('div', { class: 'banner alerta' }, `No pude obtener precios: ${e.message}`), h('button', { onclick: () => vistaRecomendacion(app, id, { refrescar: true }) }, 'Reintentar'));
    }
  }

  const hoy = isoLocal();
  const items = lista.items.map((i) => ({ clave: i.clave, nombre: i.nombre, cantidad: i.cantidad, rubro: i.rubro }));
  const r = recomendar({ items, precios: datos.precios, promos, pedidos, envios: estado.config.envios, hoy });
  const nombreItem = (clave) => lista.items.find((i) => i.clave === clave)?.nombre ?? clave;
  // La mejor opción prioriza tener toda la lista; mostramos también la más barata
  // a la que le falta 1 producto, si existe.
  const masBarataIncompleta = r.mejor
    ? r.ranking.find((o) => o.faltantes.length === r.mejor.faltantes.length + 1 && o.total < r.mejor.total) ?? null
    : null;

  if (!r.mejor) {
    return montar(app, h('a', { href: `#/lista/${id}` }, '← Lista'), h('p', { class: 'vacio' }, r.texto), datos.errores?.length ? h('div', { class: 'banner alerta chico' }, `Errores: ${datos.errores.map((e) => `${SUPERS[e.super]}: ${e.error}`).join('; ')}`) : null);
  }

  const detalle = h('div');
  const contCarrito = h('div');

  function itemsCarrito(op) {
    return op.lineas.map((l) => {
      const p = datos.precios[l.clave]?.[op.super] ?? {};
      const ref = lista.items.find((i) => i.clave === l.clave)?.refs?.[op.super] ?? {};
      return { sku: p.sku ?? ref.sku, seller: p.seller ?? ref.seller ?? '1', cantidad: l.cantidad, nombre: nombreItem(l.clave), url: p.url ?? ref.url };
    });
  }

  async function armar(op) {
    const its = itemsCarrito(op);
    let c;
    try {
      c = await api.carrito(op.super, its);
    } catch {
      c = armarCarrito(op.super, its); // sin server: se arma igual en el navegador
    }
    if (c.tipo === 'link') {
      montar(
        contCarrito,
        h(
          'div',
          { class: 'tarjeta' },
          h('b', null, `Carrito de ${SUPERS[op.super]}`),
          h('p', { class: 'suave chico' }, 'Se abre en el sitio del súper, donde ya estás logueado. Revisá el carrito y pagá ahí con ', h('b', null, MEDIOS[op.medio]), '. La app nunca paga ni guarda datos de tarjeta.'),
          h('a', { class: 'boton primario', href: c.url, target: '_blank', rel: 'noopener', 'data-carrito': op.super }, `Abrir carrito en ${SUPERS[op.super]} ↗`),
          h('p', { class: 'chico', style: { wordBreak: 'break-all' } }, h('code', null, c.url)),
        ),
      );
    } else {
      montar(
        contCarrito,
        h(
          'div',
          { class: 'tarjeta' },
          h('b', null, `${SUPERS[op.super]}: agregá estos productos`),
          h('p', { class: 'suave chico' }, `${SUPERS[op.super]} no tiene un link público para cargar el carrito de una vez. Abrí cada producto (ya logueado) y agregalo.`),
          h('ul', null, c.items.map((i) => h('li', null, h('a', { href: i.url, target: '_blank', rel: 'noopener' }, i.nombre), ` × ${i.cantidad}`))),
        ),
      );
    }
    contCarrito.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function yaCompre(ops) {
    const resumen = ops.map((o) => `${SUPERS[o.super]} con ${MEDIOS[o.medio]}: ${pesos(o.total)}`).join('\n');
    if (!confirm(`¿Registrar la compra de hoy?\n${resumen}`)) return;
    for (const op of ops) {
      await estado.store.guardar('pedidos', {
        fecha: hoy,
        listaId: id,
        listaNombre: lista.nombre,
        super: op.super,
        medio: op.medio,
        items: op.lineas.map((l) => {
          const it = lista.items.find((i) => i.clave === l.clave) ?? {};
          return { clave: l.clave, ean: it.ean ?? null, nombre: it.nombre, cantidad: l.cantidad, costo: l.costo, refs: it.refs ?? {} };
        }),
        subtotal: op.subtotal,
        descuentoBancario: op.descuentoBancario,
        promoId: op.promo?.id ?? null,
        envio: op.envio,
        total: op.total,
        registrado: Date.now(),
      });
    }
    aviso('Compra registrada en el historial');
    location.hash = '#/historial';
  }

  function alertasSuba(op) {
    const out = [];
    for (const l of op.lineas) {
      const s = detectarSubaPrevia(datos.historial?.[l.clave]?.[op.super], { hoy });
      if (s) out.push(`${nombreItem(l.clave)}: el precio de lista subió ${s.subaPct}% antes de la oferta (descuento real ${s.ofertaReal}%).`);
    }
    return out;
  }

  function tarjetaOpcion(op, { destacada = false, titulo } = {}) {
    const alertas = alertasSuba(op);
    return h(
      'section',
      { class: `tarjeta${destacada ? ' destacada' : ''}`, id: destacada ? 'mejor-opcion' : null },
      titulo ? h('div', { class: 'suave chico' }, titulo) : null,
      h('div', { style: { fontSize: '18px', fontWeight: 600 } }, destacada ? r.texto : `${op.fecha === hoy ? 'Hoy' : nombreDia(op.fecha)} ${fechaCorta(op.fecha)} — ${textoOpcion(op)}: ${pesos(op.total)}`),
      h(
        'table',
        { style: { marginTop: '8px' } },
        h('tbody', null,
          h('tr', null, h('td', null, 'Subtotal (con promos de góndola)'), h('td', { class: 'num' }, pesos(op.subtotal))),
          op.ahorroGondola > 0 ? h('tr', null, h('td', { class: 'suave' }, '  incluye ahorro de góndola'), h('td', { class: 'num ok' }, `−${pesos(op.ahorroGondola)}`)) : null,
          h('tr', null, h('td', null, op.promo ? `${op.promo.tipo === 'reintegro' ? 'Reintegro' : 'Descuento en caja'} ${op.promo.porcentaje}% ${MEDIOS[op.medio]}` : `Sin promo bancaria con ${MEDIOS[op.medio]}`, op.motivoBanco ? h('div', { class: 'alerta chico' }, op.motivoBanco) : null), h('td', { class: 'num ok' }, op.descuentoBancario ? `−${pesos(op.descuentoBancario)}` : '—')),
          h('tr', null, h('td', null, 'Envío'), h('td', { class: 'num' }, op.envio ? pesos(op.envio) : 'gratis')),
          h('tr', null, h('th', null, 'Total'), h('th', { class: 'num' }, pesos(op.total))),
        ),
      ),
      op.faltantes.length ? h('p', { class: 'alerta chico' }, `Faltan o sin stock en ${SUPERS[op.super]}: ${op.faltantes.map(nombreItem).join(', ')}`) : null,
      h(
        'details',
        { class: 'chico' },
        h('summary', null, `Qué comprar en ${SUPERS[op.super]} (${op.lineas.length} producto/s)`),
        h('table', null, h('tbody', null, op.lineas.map((l) => {
          const prod = datos.precios[l.clave]?.[op.super];
          return h('tr', null, h('td', null, prod?.nombre ?? nombreItem(l.clave), h('div', { class: 'suave' }, `${l.cantidad} × ${pesos(prod?.precioOferta ?? prod?.precioLista)}${l.ahorro > 0 ? ` · promo góndola −${pesos(l.ahorro)}` : ''}`)), h('td', { class: 'num' }, pesos(l.costo)));
        }))),
      ),
      alertas.length ? h('div', { class: 'banner alerta chico' }, h('b', null, '⚠ Posibles promos infladas'), h('ul', null, alertas.map((a) => h('li', null, a)))) : null,
      h('div', { class: 'fila', style: { marginTop: '8px' } }, h('button', { class: 'primario', onclick: () => armar(op) }, `🛒 Armar carrito en ${SUPERS[op.super]}`), h('button', { onclick: () => yaCompre([op]) }, '✅ Ya compré')),
    );
  }

  function elegir(op) {
    montar(detalle, tarjetaOpcion(op, { titulo: 'Opción elegida' }));
    detalle.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  const calendario = h(
    'div',
    { class: 'calendario', role: 'list' },
    r.calendario.map((d) =>
      h(
        'button',
        { class: `dia${r.mejor.fecha === d.fecha ? ' mejor' : ''}`, role: 'listitem', disabled: !d.mejor, onclick: () => d.mejor && elegir(d.mejor), title: d.mejor ? textoOpcion(d.mejor) : 'sin datos', style: { flexDirection: 'column', minHeight: 0 } },
        h('b', null, d.fecha === hoy ? 'Hoy' : DIAS[new Date(d.fecha + 'T12:00').getDay()].slice(0, 3)),
        h('span', null, fechaCorta(d.fecha)),
        h('span', null, d.mejor ? pesos(d.mejor.total) : '—'),
        h('span', { class: 'suave' }, d.mejor ? SUPERS[d.mejor.super] : ''),
      ),
    ),
  );

  const div = r.compraDividida;
  const actualizado = new Date(datos.cuando).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  const fict = promos.filter((p) => p.ficticia).length;

  montar(
    app,
    h('div', { class: 'fila' }, h('a', { href: `#/lista/${id}`, class: 'crece' }, `← ${lista.nombre}`), h('button', { onclick: () => vistaRecomendacion(app, id, { refrescar: true }) }, '↻ Precios')),
    h('h1', null, '¿Dónde y cuándo compro?'),
    estado.config.demo ? h('div', { class: 'banner alerta chico' }, 'Modo demo: precios guardados (captura real del 11/10/2026, no se actualizan).') : null,
    fict ? h('div', { class: 'banner alerta chico' }, `Hay ${fict} promo(s) de ejemplo FICTICIAS cargadas. `, h('a', { href: '#/promos' }, 'Revisalas')) : null,
    !promos.length ? h('div', { class: 'banner chico' }, 'No tenés promos bancarias cargadas. ', h('a', { href: '#/promos' }, 'Cargalas'), ' para que la recomendación las tenga en cuenta.') : null,
    estado.config.enviosFicticios ? h('div', { class: 'banner alerta chico' }, 'Los costos de envío son de ejemplo. ', h('a', { href: '#/ajustes' }, 'Configurá los reales')) : null,
    tarjetaOpcion(r.mejor, { destacada: true }),
    masBarataIncompleta ? h('div', { class: 'banner chico' }, `💡 Si no te importa que falte ${masBarataIncompleta.faltantes.map(nombreItem).join(', ')}, el ${masBarataIncompleta.fecha === hoy ? 'hoy' : nombreDia(masBarataIncompleta.fecha)} en ${textoOpcion(masBarataIncompleta)} sale ${pesos(masBarataIncompleta.total)} (${pesos(r.mejor.total - masBarataIncompleta.total)} menos, pero comprás menos cosas).`) : null,
    contCarrito,
    div
      ? h(
          'section',
          { class: 'tarjeta' },
          h('h2', { style: { marginTop: 0 } }, `✂️ Compra dividida: ${pesos(div.total)} (ahorrás ${pesos(div.ahorro)} más)`),
          h('p', { class: 'suave chico' }, `El ${nombreDia(div.fecha)} ${fechaCorta(div.fecha)}, ya contando los dos envíos (${pesos(div.envio)}).`),
          div.partes.map((p) =>
            h(
              'div',
              { class: 'tarjeta' },
              h('b', null, `${textoOpcion(p)}: ${pesos(p.total)}`),
              h('div', { class: 'chico' }, p.lineas.map((l) => `${nombreItem(l.clave)} ×${l.cantidad}`).join(', ')),
              h('div', { class: 'suave chico' }, `Desc. bancario ${pesos(p.descuentoBancario)} · envío ${p.envio ? pesos(p.envio) : 'gratis'}`),
              h('button', { onclick: () => armar(p), style: { marginTop: '6px' } }, `🛒 Carrito ${SUPERS[p.super]}`),
            ),
          ),
          h('button', { onclick: () => yaCompre(div.partes) }, '✅ Ya compré (las dos)'),
        )
      : null,
    h('h2', null, 'Semana'),
    calendario,
    detalle,
    h('h2', null, 'Ranking de alternativas'),
    h(
      'div',
      { class: 'tabla-scroll tarjeta' },
      h(
        'table',
        null,
        h('thead', null, h('tr', null, h('th', null, 'Día'), h('th', null, 'Dónde y cómo'), h('th', { class: 'num' }, 'Total'), h('th', null, ''))),
        h(
          'tbody',
          null,
          r.ranking.slice(0, 15).map((o) =>
            h(
              'tr',
              null,
              h('td', null, `${o.fecha === hoy ? 'Hoy' : nombreDia(o.fecha)} ${fechaCorta(o.fecha)}`),
              h('td', null, textoOpcion(o), o.faltantes.length ? h('div', { class: 'alerta chico' }, `faltan ${o.faltantes.length}`) : null),
              h('td', { class: 'num' }, pesos(o.total)),
              h('td', null, h('button', { onclick: () => elegir(o) }, 'Ver')),
            ),
          ),
        ),
      ),
    ),
    h('p', { class: 'suave chico' }, `Precios actualizados a las ${actualizado}. El cálculo asume los precios de hoy para toda la semana; las promos bancarias cambian por día.`),
    datos.errores?.length ? h('details', { class: 'tarjeta chico' }, h('summary', null, `${datos.errores.length} consulta(s) fallaron`), h('ul', null, datos.errores.slice(0, 20).map((e) => h('li', null, `${SUPERS[e.super]} · ${nombreItem(e.clave)}: ${e.error}`)))) : null,
  );
}
