// Recomendación de 7 días para una lista: un carrito por súper (con su total y
// el link que lo carga en el sitio), mejor opción, calendario semanal, ranking,
// compra dividida y "Ya compré".

import { armarCarrito } from '../../lib/carrito.js';
import { DIAS, nombreMedio, SUPERS } from '../../lib/constantes.js';
import { convieneOtraPresentacion, nombreDia, pesos, porUnidadTexto, presentacion } from '../../lib/formato.js';
import { costoItem } from '../../lib/motor/promos.js';
import { detectarSubaPrevia } from '../../lib/motor/historialPrecios.js';
import { isoLocal } from '../../lib/motor/fechas.js';
import { envasesItem, recomendar, textoOpcion } from '../../lib/motor/recomendacion.js';
import * as api from '../api.js';
import { direccionActiva, enviosActivos, estado, misMedios, zonaActiva } from '../estado.js';
import { aviso, cargando, enNavegador, h, logoSuper, montar } from '../ui.js';

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
  const items = lista.items.map((i) => ({ clave: i.clave, nombre: i.nombre, cantidad: i.cantidad, rubro: i.rubro, necesidad: i.necesidad ?? null }));
  const r = recomendar({ items, precios: datos.precios, promos, pedidos, envios: enviosActivos(), hoy, supers: zonaActiva().supers, medios: misMedios().length ? misMedios() : ['cualquiera'] });
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
    if (c.tipo === 'pasos') {
      montar(
        contCarrito,
        h(
          'div',
          { class: 'tarjeta destacada' },
          h('b', null, `Carrito de ${SUPERS[op.super]} en ${c.pasos.length} pasos`),
          h('p', { class: 'suave chico' }, `${SUPERS[op.super]} mezcla las cantidades si se cargan todas juntas, así que va en partes. Tocá los botones en orden: cada uno suma al mismo carrito. Después revisá y pagá ahí.`),
          h(
            'div',
            { class: 'columna' },
            c.pasos.map((p, i) =>
              h(
                'a',
                { class: `boton ${i === 0 ? 'primario' : 'secundario'}`, href: enNavegador(p.url), target: '_blank', rel: 'noopener', 'data-carrito': op.super },
                `${i + 1}. ${i === 0 ? 'Abrir el carrito' : 'Sumar'}: ${p.items.length === 1 ? (p.items[0].nombre ?? '1 producto') : `${p.items.length} productos`} ↗`,
              ),
            ),
          ),
        ),
      );
    } else if (c.tipo === 'link') {
      montar(
        contCarrito,
        h(
          'div',
          { class: 'tarjeta' },
          h('b', null, `Carrito de ${SUPERS[op.super]}`),
          h('p', { class: 'suave chico' }, 'Se abre en el sitio del súper, donde ya estás logueado. Revisá el carrito y pagá ahí', op.promo ? [' con ', h('b', null, medioDe(op))] : null, '. La app nunca paga ni guarda datos de tarjeta.'),
          h('a', { class: 'boton primario', href: enNavegador(c.url), target: '_blank', rel: 'noopener', 'data-carrito': op.super }, `Abrir carrito en ${SUPERS[op.super]} ↗`),
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
          h('ul', null, c.items.map((i) => h('li', null, h('a', { href: enNavegador(i.url), target: '_blank', rel: 'noopener' }, i.nombre), ` × ${i.cantidad}`))),
        ),
      );
    }
    contCarrito.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // El medio con el que conviene pagar ("cualquier medio" si la promo es para todos).
  const medioDe = (op) => nombreMedio(op.promo?.medio === 'todos' ? 'todos' : op.medio);
  const cuando = (op) => `${op.fecha === hoy ? 'hoy' : `el ${nombreDia(op.fecha)} ${fechaCorta(op.fecha)}`}${op.promo ? `, pagando con ${medioDe(op)}` : ''}`;
  const envioTexto = (op) => (enviosActivos()[op.super]?.costo == null ? 'envío (no sé cuánto)' : `envío ${op.envio ? pesos(op.envio) : 'gratis'}`);
  const desglose = (op) => `Productos ${pesos(op.subtotal)}${op.descuentoBancario ? ` − promo ${pesos(op.descuentoBancario)}` : ''} + ${envioTexto(op)}`;
  const noTiene = (op) => (op.faltantes.length ? h('div', { class: 'falta' }, `No tiene: ${op.faltantes.map(nombreItem).join(', ')}`) : null);
  // El carrito del súper muestra los productos con sus ofertas; el envío y el
  // reintegro del banco aparecen recién al pagar.
  const enCarrito = (op) => h('div', { class: 'chico', style: { marginTop: '4px' } }, `En el carrito de ${SUPERS[op.super]} vas a ver `, h('b', null, pesos(op.subtotal)), op.envio ? ' (el envío se suma al pagar)' : '');

  // La lista que escribió el usuario, con el precio de cada producto en cada súper.
  const porKg = (it) => Object.values(it.refs ?? {}).some((x) => x?.multiplicador) || Object.values(datos.precios[it.clave] ?? {}).some((p) => p?.multiplicador);
  const cantidadTexto = (it) => (porKg(it) ? `${String(it.cantidad).replace('.', ',')} kg` : `× ${it.cantidad}`);
  function filaLista(it) {
    const porSuper = datos.precios[it.clave] ?? {};
    const costos = zonaActiva().supers.map((s) => {
      const p = porSuper[s];
      const precio = p && p.disponible !== false ? (p.precioOferta ?? p.precioLista) : null;
      if (precio == null) return [s, null, p, 0];
      // Envases de la presentación de ese súper (ej. 2 L = 1 bidón o 2 botellas).
      const envases = envasesItem({ cantidad: it.cantidad, necesidad: it.necesidad }, p);
      return [s, Math.round(costoItem(p, envases).costo), p, envases];
    });
    const minimo = Math.min(...costos.filter(([, c]) => c != null).map(([, c]) => c));
    return h(
      'li',
      null,
      it.imagen ? h('img', { class: 'miniatura', src: it.imagen, alt: '', loading: 'lazy' }) : h('span', { class: 'miniatura vacia', 'aria-hidden': 'true' }, '🛍️'),
      h(
        'div',
        { class: 'crece', style: { flex: 1, minWidth: 0 } },
        h('div', { class: 'nombre-item' }, it.nombre, ' ', h('span', { class: 'suave', style: { fontWeight: 500 } }, cantidadTexto(it))),
        h(
          'div',
          { class: 'precios-super' },
          costos.map(([s, c, p, envases]) =>
            c == null
              ? h('span', { class: 'chip', style: { opacity: 0.6 } }, `${SUPERS[s]}: no hay`)
              : h(
                  'span',
                  { class: `chip${c === minimo ? ' mejor' : ''}`, title: `${p?.nombre ?? ''}${porUnidadTexto(p) ? ` · ${porUnidadTexto(p)}` : ''}` },
                  `${SUPERS[s]} ${pesos(c)}${presentacion(p) && !p.multiplicador && (!it.necesidad || p.unidad === it.necesidad.unidad) ? ` · ${envases}×${presentacion(p)}` : ''}`,
                ),
          ),
        ),
        it.mejorPorUnidad && convieneOtraPresentacion(it.mejorPorUnidad, costos.map((c) => c[2]).filter(Boolean)) ? h('div', { class: 'suave chico', style: { marginTop: '4px' } }, `💲 Más barato por ${it.mejorPorUnidad.unidad === 'l' ? 'litro' : it.mejorPorUnidad.unidad === 'kg' ? 'kilo' : 'unidad'}: ${porUnidadTexto(it.mejorPorUnidad)} en ${SUPERS[it.mejorPorUnidad.super]} (${presentacion(it.mejorPorUnidad)})`) : null,
      ),
    );
  }
  // Abierta o cerrada según la dejó el usuario la última vez.
  let abierta = false;
  try {
    abierta = localStorage.getItem('ci:tu-lista-abierta') === '1';
  } catch {
    // sin localStorage
  }
  const seccionLista = h(
    'details',
    {
      class: 'desplegable',
      id: 'tu-lista',
      open: abierta,
      ontoggle: (e) => {
        try {
          localStorage.setItem('ci:tu-lista-abierta', e.target.open ? '1' : '0');
        } catch {
          // sin localStorage
        }
      },
    },
    h('summary', null, `📝 Tu lista (${lista.items.length} ${lista.items.length === 1 ? 'producto' : 'productos'})`),
    h(
      'div',
      { class: 'contenido' },
      h('p', { class: 'suave chico', style: { marginTop: 0 } }, 'Lo que cuesta cada cosa en cada súper (en verde, el más barato).'),
      h('ul', { class: 'lista-items' }, lista.items.map(filaLista)),
      h('a', { class: 'boton secundario ancho', href: `#/lista/${id}`, style: { marginTop: '12px' } }, '✏️ Cambiar la lista'),
    ),
  );
  function botonCarrito(op, { grande = false, blanco = false } = {}) {
    const c = armarCarrito(op.super, itemsCarrito(op), { sucursales: zonaActiva().sucursales });
    const clase = `${blanco ? 'blanco' : 'primario'}${grande ? ' grande' : ''}`;
    if (c.tipo === 'pasos') return h('button', { class: clase, onclick: () => armar(op) }, `🛒 Armar el carrito en ${SUPERS[op.super]} (${c.pasos.length} pasos)`);
    return c.tipo === 'link'
      ? h('a', { class: `boton ${clase}`, href: enNavegador(c.url), target: '_blank', rel: 'noopener', 'data-carrito': op.super }, `🛒 Abrir el carrito en ${SUPERS[op.super]}`)
      : h('button', { class: clase, onclick: () => armar(op) }, `🛒 Ver qué comprar en ${SUPERS[op.super]}`);
  }

  // Un carrito por súper: su mejor opción de la semana (menos faltantes, menor
  // total), con el link que carga todo en el sitio del súper.
  function tarjetaCarrito(op) {
    const total = lista.items.length;
    const dif = op.total - r.mejor.total;
    return h(
      'div',
      { class: 'tarjeta carrito' },
      h(
        'div',
        { class: 'fila-super' },
        logoSuper(op.super),
        h('div', { class: 'info' }, h('b', null, SUPERS[op.super]), h('p', null, op.faltantes.length ? `Tiene ${op.lineas.length} de ${total}` : `Tiene los ${total}`)),
        h('div', { class: 'total' }, h('b', null, pesos(op.total)), h('span', null, op.faltantes.length && dif < 0 ? 'le faltan cosas' : dif > 0 ? `+${pesos(dif)}` : 'igual')),
      ),
      h('div', { class: 'barra-cobertura', 'aria-hidden': 'true' }, h('i', { style: { width: `${Math.round((op.lineas.length / total) * 100)}%` } })),
      h('div', { class: 'suave chico' }, `${desglose(op)} · ${cuando(op)}`),
      noTiene(op),
      enCarrito(op),
      botonCarrito(op),
    );
  }
  const porSuper = zonaActiva().supers.map((s) => r.ranking.find((o) => o.super === s)).filter(Boolean);
  const otros = porSuper.filter((o) => o.super !== r.mejor.super);

  async function yaCompre(ops) {
    const resumen = ops.map((o) => `${SUPERS[o.super]} con ${nombreMedio(o.medio)}: ${pesos(o.total)}`).join('\n');
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
          h('tr', null, h('td', null, op.promo ? `${op.promo.tipo === 'reintegro' ? 'Reintegro' : 'Descuento en caja'} ${op.promo.porcentaje}% ${medioDe(op)}` : 'Sin promo bancaria ese día', op.motivoBanco ? h('div', { class: 'alerta chico' }, op.motivoBanco) : null), h('td', { class: 'num ok' }, op.descuentoBancario ? `−${pesos(op.descuentoBancario)}` : '—')),
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
  const envioDesconocido = zonaActiva().supers.filter((s) => enviosActivos()[s]?.costo == null);
  montar(
    app,
    h('div', { class: 'fila' }, h('a', { href: `#/lista/${id}`, class: 'boton texto crece', style: { marginLeft: '-10px', justifyContent: 'flex-start' } }, `← ${lista.nombre}`), h('button', { class: 'texto', onclick: () => vistaRecomendacion(app, id, { refrescar: true }) }, '↻ Actualizar')),
    h('h1', null, '¿Dónde conviene comprar?'),
    seccionLista,
    estado.config.demo ? h('div', { class: 'banner alerta' }, 'Modo prueba: los precios son de ejemplo (del 11/10/2026).') : null,
    fict ? h('div', { class: 'banner alerta' }, `Hay ${fict === 1 ? '1 promo de ejemplo' : `${fict} promos de ejemplo`} (no son reales). `, h('a', { href: '#/promos' }, 'Revisalas')) : null,
    estado.config.enviosFicticios ? h('div', { class: 'banner alerta' }, 'Los costos de envío son de ejemplo. ', h('a', { href: '#/ajustes' }, 'Cargá los reales')) : null,
    envioDesconocido.length ? h('div', { class: 'banner alerta' }, `No sé cuánto cobra ${envioDesconocido.map((s) => SUPERS[s]).join(' y ')} el envío, así que no lo estoy sumando. `, h('a', { href: '#/ajustes' }, 'Cargalo en Ajustes')) : null,

    // La respuesta, bien grande.
    h(
      'section',
      { class: 'hero-reco', id: 'mejor-opcion' },
      h('div', { class: 'etiqueta' }, 'Te conviene'),
      h('div', { class: 'cabeza' }, logoSuper(m.super, { grande: true }), h('div', null, h('b', null, SUPERS[m.super]), h('small', null, cuando(m)))),
      h('div', { class: 'monto' }, pesos(m.total)),
      r.ahorroVsCara > 0 ? h('span', { class: 'ahorro' }, `Ahorrás ${pesos(r.ahorroVsCara)} 🎉`) : null,
      h(
        'div',
        { class: 'desglose' },
        h('span', null, 'Productos'), h('span', null, pesos(m.subtotal)),
        m.descuentoBancario ? [h('span', null, `Promo ${medioDe(m)}`), h('span', null, `−${pesos(m.descuentoBancario)}`)] : null,
        h('span', null, 'Envío'), h('span', null, enviosActivos()[m.super]?.costo == null ? 'no sé cuánto' : m.envio ? pesos(m.envio) : 'gratis'),
      ),
      noTiene(m),
      botonCarrito(m, { grande: true, blanco: true }),
      h(
        'p',
        { class: 'nota-hero' },
        m.super === 'coto'
          ? `Coto no deja cargar el carrito de una vez: te muestro cada producto con su link para agregarlo en coto.com.ar (con tu dirección elegida). La app nunca paga ni guarda datos de tarjeta.`
          : `Se abre la página de ${SUPERS[m.super]} con todo cargado. Elegí ahí tu dirección (${direccionActiva().nombre}), revisá y pagá. La app nunca paga ni guarda datos de tarjeta.`,
      ),
      h('button', { class: 'texto', onclick: () => yaCompre([m]), style: { marginTop: '6px' } }, '✓ Ya compré: guardarlo en Compras'),
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
                h('td', null, h('b', null, SUPERS[o.super]), h('div', { class: 'suave chico' }, `${o.fecha === hoy ? 'Hoy' : `${nombreDia(o.fecha)} ${fechaCorta(o.fecha)}`}${o.promo ? ` · ${medioDe(o)}` : ''}`), o.faltantes.length ? h('div', { class: 'alerta chico' }, `le ${o.faltantes.length === 1 ? 'falta 1' : `faltan ${o.faltantes.length}`}`) : null),
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
