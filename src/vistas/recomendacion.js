// Recomendación de 7 días para una lista: un carrito por súper (con su total y
// el link que lo carga en el sitio), mejor opción, calendario semanal, ranking,
// compra dividida y "Ya compré".

import { armarCarrito } from '../../lib/carrito.js';
import { DIAS, MEDIOS, SUPERS } from '../../lib/constantes.js';
import { nombreDia, pesos } from '../../lib/formato.js';
import { detectarSubaPrevia } from '../../lib/motor/historialPrecios.js';
import { isoLocal } from '../../lib/motor/fechas.js';
import { recomendar, textoOpcion } from '../../lib/motor/recomendacion.js';
import * as api from '../api.js';
import { direccionActiva, enviosActivos, estado, zonaActiva } from '../estado.js';
import { aviso, cargando, h, montar } from '../ui.js';

const fechaCorta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export async function vistaRecomendacion(app, id, { refrescar = false } = {}) {
  montar(app, cargando('Consultando precios…'));
  const [lista, promos, pedidos] = await Promise.all([estado.store.obtener('listas', id), estado.store.listar('promos'), estado.store.listar('pedidos')]);
  if (!lista) return montar(app, h('p', { class: 'vacio' }, 'No encontré esa lista. ', h('a', { href: '#/' }, 'Volver')));
  if (!lista.items.length) return montar(app, h('p', { class: 'vacio' }, 'La lista está vacía. ', h('a', { href: `#/lista/${id}` }, 'Agregá productos')));

  const claveCache = `${id}|${estado.config.demo ? 'demo' : 'real'}|${direccionActiva().id}`;
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
  const r = recomendar({ items, precios: datos.precios, promos, pedidos, envios: enviosActivos(), hoy, supers: zonaActiva().supers });
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
      return { sku: p.sku ?? ref.sku, seller: p.seller ?? ref.seller ?? '1', multiplicador: p.multiplicador ?? ref.multiplicador ?? null, cantidad: l.cantidad, nombre: nombreItem(l.clave), url: p.url ?? ref.url };
    });
  }

  async function armar(op) {
    // Con la sucursal de la dirección activa como vendedor (precios y stock de esa sucursal).
    const c = armarCarrito(op.super, itemsCarrito(op), { sucursales: zonaActiva().sucursales });
    if (c.tipo === 'link') {
      montar(
        contCarrito,
        h(
          'div',
          { class: 'tarjeta' },
          h('b', null, `Carrito de ${SUPERS[op.super]}`),
          h('p', { class: 'suave chico' }, 'Se abre en el sitio del súper, donde ya estás logueado. Revisá el carrito y pagá ahí', op.promo ? [' con ', h('b', null, MEDIOS[op.medio])] : null, '. La app nunca paga ni guarda datos de tarjeta.'),
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

  const cuando = (op) => `${op.fecha === hoy ? 'hoy' : `el ${nombreDia(op.fecha)} ${fechaCorta(op.fecha)}`}${op.promo ? `, pagando con ${MEDIOS[op.medio]}` : ''}`;
  const desglose = (op) => `Productos ${pesos(op.subtotal)}${op.descuentoBancario ? ` − promo ${pesos(op.descuentoBancario)}` : ''} + envío ${op.envio ? pesos(op.envio) : 'gratis'}`;
  const noTiene = (op) => (op.faltantes.length ? h('div', { class: 'falta' }, `No tiene: ${op.faltantes.map(nombreItem).join(', ')}`) : null);
  function botonCarrito(op, { grande = false } = {}) {
    const c = armarCarrito(op.super, itemsCarrito(op), { sucursales: zonaActiva().sucursales });
    return c.tipo === 'link'
      ? h('a', { class: `boton primario${grande ? ' grande' : ''}`, href: c.url, target: '_blank', rel: 'noopener', 'data-carrito': op.super }, `🛒 Abrir el carrito en ${SUPERS[op.super]}`)
      : h('button', { class: `primario${grande ? ' grande' : ''}`, onclick: () => armar(op) }, `🛒 Ver qué comprar en ${SUPERS[op.super]}`);
  }

  // Un carrito por súper: su mejor opción de la semana (menos faltantes, menor
  // total), con el link que carga todo en el sitio del súper.
  function tarjetaCarrito(op) {
    return h(
      'div',
      { class: 'tarjeta carrito' },
      h('div', { class: 'encabezado' }, h('span', { class: 'super' }, SUPERS[op.super]), h('span', { class: 'monto' }, pesos(op.total))),
      h('div', { class: 'suave' }, `${op.lineas.length} de ${lista.items.length} productos · ${cuando(op)}`),
      h('div', { class: 'suave chico' }, desglose(op)),
      noTiene(op),
      botonCarrito(op),
    );
  }
  const porSuper = zonaActiva().supers.map((s) => r.ranking.find((o) => o.super === s)).filter(Boolean);
  const otros = porSuper.filter((o) => o.super !== r.mejor.super);

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
          h('tr', null, h('td', null, op.promo ? `${op.promo.tipo === 'reintegro' ? 'Reintegro' : 'Descuento en caja'} ${op.promo.porcentaje}% ${MEDIOS[op.medio]}` : 'Sin promo bancaria ese día', op.motivoBanco ? h('div', { class: 'alerta chico' }, op.motivoBanco) : null), h('td', { class: 'num ok' }, op.descuentoBancario ? `−${pesos(op.descuentoBancario)}` : '—')),
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
    const contenedor = detalle.closest('details');
    if (contenedor) contenedor.open = true;
    detalle.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  const calendario = h(
    'div',
    { class: 'semana', role: 'list' },
    r.calendario.map((d) =>
      h(
        'button',
        { class: `dia${r.mejor.fecha === d.fecha ? ' mejor' : ''}`, role: 'listitem', disabled: !d.mejor, onclick: () => d.mejor && elegir(d.mejor), 'aria-label': d.mejor ? `${nombreDia(d.fecha)}: ${textoOpcion(d.mejor)}, ${pesos(d.mejor.total)}` : 'sin datos' },
        h('b', null, d.fecha === hoy ? 'Hoy' : DIAS[new Date(d.fecha + 'T12:00').getDay()].slice(0, 3)),
        h('span', { class: 'suave chico' }, fechaCorta(d.fecha)),
        h('span', { class: 'precio' }, d.mejor ? pesos(d.mejor.total) : '—'),
        h('span', { class: 'suave chico' }, d.mejor ? SUPERS[d.mejor.super] : ''),
      ),
    ),
  );
  // Opciones distintas (mismo súper y mismo total en otro día no suma nada).
  const vistas = new Set();
  const alternativas = r.ranking.filter((o) => {
    const k = `${o.super}|${o.medio}|${o.total}`;
    if (vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
  const desplegable = (titulo, ...contenido) => h('details', { class: 'desplegable' }, h('summary', null, titulo), h('div', { class: 'contenido' }, ...contenido));

  const div = r.compraDividida;
  const actualizado = new Date(datos.cuando).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  const fict = promos.filter((p) => p.ficticia).length;

  const m = r.mejor;
  montar(
    app,
    h('div', { class: 'fila' }, h('a', { href: `#/lista/${id}`, class: 'boton texto crece', style: { marginLeft: '-10px', justifyContent: 'flex-start' } }, `← ${lista.nombre}`), h('button', { class: 'texto', onclick: () => vistaRecomendacion(app, id, { refrescar: true }) }, '↻ Actualizar')),
    h('h1', null, '¿Dónde conviene comprar?'),
    estado.config.demo ? h('div', { class: 'banner alerta' }, 'Modo prueba: los precios son de ejemplo (del 11/10/2026).') : null,
    fict ? h('div', { class: 'banner alerta' }, `Hay ${fict === 1 ? '1 promo de ejemplo' : `${fict} promos de ejemplo`} (no son reales). `, h('a', { href: '#/promos' }, 'Revisalas')) : null,
    estado.config.enviosFicticios ? h('div', { class: 'banner alerta' }, 'Los costos de envío son de ejemplo. ', h('a', { href: '#/ajustes' }, 'Cargá los reales')) : null,

    // La respuesta, bien grande.
    h(
      'section',
      { class: 'tarjeta destacada hero', id: 'mejor-opcion' },
      h('div', { class: 'etiqueta' }, 'Te conviene'),
      h('div', { class: 'donde' }, SUPERS[m.super]),
      h('div', { class: 'suave' }, cuando(m)),
      h('div', { class: 'monto' }, pesos(m.total)),
      r.ahorroVsCara > 0 ? h('div', { class: 'ahorro' }, `Ahorrás ${pesos(r.ahorroVsCara)}`) : null,
      h('div', { class: 'suave chico' }, desglose(m)),
      noTiene(m),
      botonCarrito(m, { grande: true }),
      h('p', { class: 'suave chico', style: { margin: '10px 0 0' } }, `Se abre la página de ${SUPERS[m.super]} con todo cargado. Elegí ahí tu dirección (${direccionActiva().nombre}), revisá y pagá. La app nunca paga ni guarda datos de tarjeta.`),
      h('button', { class: 'texto', onclick: () => yaCompre([m]), style: { marginTop: '4px' } }, '✅ Ya compré: guardarlo en Compras'),
    ),
    contCarrito,
    !promos.length ? h('div', { class: 'banner' }, '💳 Todavía no cargaste promos del banco. ', h('a', { href: '#/promos' }, 'Cargalas'), ' y vas a ahorrar más.') : null,

    otros.length ? h('h2', null, 'Los otros súper') : null,
    otros.length ? h('div', { class: 'grilla-carritos' }, otros.map(tarjetaCarrito)) : null,
    masBarataIncompleta ? h('div', { class: 'banner' }, `💡 Si no te hace falta ${masBarataIncompleta.faltantes.map(nombreItem).join(', ')}, en ${SUPERS[masBarataIncompleta.super]} sale ${pesos(masBarataIncompleta.total)} (${pesos(m.total - masBarataIncompleta.total)} menos).`) : null,

    h('h2', null, 'Más opciones'),
    div
      ? desplegable(
          `✂️ Comprar en dos súper: ${pesos(div.total)}`,
          h('p', { class: 'suave', style: { marginTop: 0 } }, `Ahorrás ${pesos(div.ahorro)} más, ${div.fecha === hoy ? 'hoy' : `el ${nombreDia(div.fecha)} ${fechaCorta(div.fecha)}`}, ya contando los dos envíos (${pesos(div.envio)}).`),
          div.partes.map((p) =>
            h(
              'div',
              { class: 'tarjeta carrito', style: { marginBottom: '12px' } },
              h('div', { class: 'encabezado' }, h('span', { class: 'super' }, SUPERS[p.super]), h('span', { class: 'monto' }, pesos(p.total))),
              h('div', { class: 'chico' }, p.lineas.map((l) => `${nombreItem(l.clave)} ×${l.cantidad}`).join(', ')),
              h('div', { class: 'suave chico' }, desglose(p)),
              botonCarrito(p),
            ),
          ),
          h('button', { class: 'texto', onclick: () => yaCompre(div.partes) }, '✅ Ya compré en los dos'),
        )
      : null,
    desplegable('📅 ¿Y otros días?', h('p', { class: 'suave', style: { marginTop: 0 } }, 'Lo más barato de cada día de la semana (cambian las promos del banco). Tocá un día para ver el detalle.'), calendario, detalle),
    desplegable('🧮 Ver las cuentas', tarjetaOpcion(m)),
    desplegable(
      '📋 Todas las opciones',
      h(
        'div',
        { class: 'tabla-scroll' },
        h(
          'table',
          null,
          h('tbody', null,
            alternativas.slice(0, 12).map((o) =>
              h(
                'tr',
                null,
                h('td', null, h('b', null, SUPERS[o.super]), h('div', { class: 'suave chico' }, `${o.fecha === hoy ? 'Hoy' : `${nombreDia(o.fecha)} ${fechaCorta(o.fecha)}`}${o.promo ? ` · ${MEDIOS[o.medio]}` : ''}`), o.faltantes.length ? h('div', { class: 'alerta chico' }, `le ${o.faltantes.length === 1 ? 'falta 1' : `faltan ${o.faltantes.length}`}`) : null),
                h('td', { class: 'num' }, h('b', null, pesos(o.total))),
                h('td', { class: 'num' }, h('button', { class: 'texto', onclick: () => elegir(o) }, 'Ver')),
              ),
            ),
          ),
        ),
      ),
    ),
    h('p', { class: 'suave chico' }, `Precios de las ${actualizado}. Para toda la semana se usan los precios de hoy; lo que cambia por día son las promos del banco.`),
    datos.errores?.length ? h('details', { class: 'desplegable' }, h('summary', null, `⚠️ ${datos.errores.length} consulta(s) fallaron`), h('ul', { class: 'contenido chico' }, datos.errores.slice(0, 20).map((e) => h('li', null, `${SUPERS[e.super]} · ${nombreItem(e.clave)}: ${e.error}`)))) : null,
  );
}
