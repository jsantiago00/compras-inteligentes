// Editar una lista: nombre, ítems, cantidades y buscador de productos en los
// súper de la zona (unificados por EAN, con confirmación de matches difusos).

import { SUPERS } from '../../lib/constantes.js';
import { pesos } from '../../lib/formato.js';
import * as api from '../api.js';
import { estado, zonaActiva } from '../estado.js';
import { aviso, cargando, h, montar, vacio } from '../ui.js';

const precioDe = (p) => p.precioOferta ?? p.precioLista;

function textoPromo(p) {
  if (!p.promoGondola) return null;
  const g = p.promoGondola;
  if (g.tipo === 'nxm') return `${g.lleva}x${g.paga}`;
  if (g.tipo === 'segunda_unidad') return `2da al ${g.porcentaje}%`;
  if (g.tipo === 'porcentaje') return `${g.porcentaje}% off${g.minimoUnidades > 1 ? ` x${g.minimoUnidades}` : ''}`;
  return null;
}

export function chipsPrecios(porSuper) {
  const entradas = Object.entries(porSuper).filter(([, p]) => p && p.disponible !== false && precioDe(p) != null);
  const minimo = Math.min(...entradas.map(([, p]) => precioDe(p)));
  return h(
    'div',
    { class: 'precios-super' },
    Object.entries(porSuper).map(([sup, p]) => {
      if (!p) return null;
      if (p.disponible === false) return h('span', { class: 'chip' }, `${SUPERS[sup]}: sin stock`);
      const promo = textoPromo(p);
      return [
        h('span', { class: `chip${precioDe(p) === minimo ? ' mejor' : ''}`, title: p.precioPorUnidad ? `${pesos(p.precioPorUnidad.valor)} ${p.precioPorUnidad.unidad}` : '' }, `${SUPERS[sup]}: ${pesos(precioDe(p))}${p.precioOferta ? ' (oferta)' : ''}`),
        promo ? h('span', { class: 'chip promo' }, `${SUPERS[sup]} ${promo}`) : null,
      ];
    }),
  );
}

/** Aplica los matches que el usuario ya confirmó o rechazó. */
function aplicarMatches(resultado, matches) {
  const grupos = new Map(resultado.grupos.map((g) => [g.clave, g]));
  for (const m of matches.filter((x) => x.confirmado)) {
    const suelto = grupos.get(m.id);
    const destino = grupos.get(m.grupo);
    if (!suelto || !destino) continue;
    Object.assign(destino.porSuper, suelto.porSuper);
    grupos.delete(m.id);
  }
  // Confirmados: id = claveSuper; rechazados: id = 'claveSuper|grupo'.
  const decididos = new Set(matches.map((m) => m.id));
  const pendientes = resultado.pendientes.filter((p) => grupos.has(p.clave) && !decididos.has(p.clave) && !decididos.has(`${p.clave}|${p.grupo}`));
  return { ...resultado, grupos: [...grupos.values()], pendientes };
}

export async function vistaLista(app, id, { pendientes = [] } = {}) {
  montar(app, cargando());
  const lista = await estado.store.obtener('listas', id);
  if (!lista) return montar(app, h('p', { class: 'vacio' }, 'No encontré esa lista. ', h('a', { href: '#/' }, 'Volver')));

  const guardar = async () => {
    lista.actualizada = Date.now();
    await estado.store.guardar('listas', lista);
    // La caché de la recomendación se guarda por lista y modo (demo/real).
    for (const k of [...estado.precios.keys()]) if (k.startsWith(`${lista.id}|`)) estado.precios.delete(k);
  };

  const vacia = !lista.items.length;
  const contItems = h('div');
  const contResultados = h('div');
  const contAccion = h('div');

  function dibujarItems() {
    montar(
      contAccion,
      lista.items.length
        ? h('div', { class: 'accion-fija' }, h('a', { class: 'boton primario grande', href: `#/reco/${lista.id}` }, 'Ver dónde conviene comprar →'))
        : null,
    );
    montar(
      contItems,
      lista.items.length
        ? h(
            'ul',
            { class: 'lista-items tarjeta' },
            lista.items.map((it) =>
              h(
                'li',
                null,
                it.imagen ? h('img', { class: 'miniatura', src: it.imagen, alt: '', loading: 'lazy' }) : h('span', { class: 'miniatura vacia', 'aria-hidden': 'true' }, '🛍️'),
                h(
                  'div',
                  { class: 'crece', style: { flex: 1, minWidth: 0 } },
                  h('div', { class: 'nombre-item' }, it.nombre),
                  it.generico
                    ? detalleGenerico(it)
                    : h('div', { class: 'suave chico' }, [it.marca, Object.keys(it.refs ?? {}).map((s) => SUPERS[s]).join(' · ')].filter(Boolean).join(' — ')),
                ),
                h(
                  'span',
                  { class: 'cantidad' },
                  h('button', { 'aria-label': it.cantidad <= paso(it) ? `Sacar ${it.nombre}` : `Menos ${it.nombre}`, onclick: () => cambiar(it, -1) }, it.cantidad <= paso(it) ? '🗑' : '−'),
                  h('b', { 'aria-label': `Cantidad: ${textoCantidad(it)}` }, textoCantidad(it)),
                  h('button', { 'aria-label': `Más ${it.nombre}`, onclick: () => cambiar(it, 1) }, '+'),
                ),
              ),
            ),
          )
        : null,
    );
  }

  // En qué súper está: corto, para que el nombre del producto tenga lugar.
  function resumenSupers(supers) {
    if (!supers.length) return 'No lo encontré';
    if (supers.length === zonaActiva().supers.length) return 'Cambiar producto';
    const nombres = supers.map((s) => SUPERS[s]);
    return `Solo en ${nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}` : nombres[0]}`;
  }

  // Ítem de lista libre: qué producto se eligió en cada súper, con opción de cambiarlo.
  function detalleGenerico(it) {
    return h(
      'details',
      { class: 'cambiar-producto' },
      h('summary', null, resumenSupers(Object.keys(it.refs ?? {}))),
      zonaActiva().supers.map((sup) => {
        const opciones = it.alternativas?.[sup] ?? [];
        if (!opciones.length) return h('div', { class: 'suave' }, `${SUPERS[sup]}: no encontrado`);
        const actual = it.refs?.[sup]?.sku ?? '';
        const select = h(
          'select',
          { 'aria-label': `Producto en ${SUPERS[sup]}`, onchange: () => elegirAlternativa(it, sup, select.value) },
          opciones.map((o) => h('option', { value: o.sku, selected: o.sku === actual }, `${o.nombre} — ${pesos(o.precio)}`)),
          h('option', { value: '', selected: !actual }, `No comprarlo en ${SUPERS[sup]}`),
        );
        return h('label', { style: { margin: '6px 0 0' } }, SUPERS[sup], select);
      }),
    );
  }

  async function elegirAlternativa(it, sup, sku) {
    it.refs = { ...(it.refs ?? {}) };
    if (!sku) delete it.refs[sup];
    else it.refs[sup] = it.alternativas[sup].find((o) => o.sku === sku);
    // Ya no es necesariamente el mismo EAN en todos los súper.
    const eans = new Set(Object.values(it.refs).map((r) => r.ean));
    it.ean = eans.size === 1 && Object.keys(it.refs).length > 1 ? [...eans][0] : null;
    await guardar();
    dibujarItems();
  }

  const textoLista = h('textarea', { rows: 5, placeholder: '2 yerba playadito\nleche entera\narroz 1kg\nfideos tirabuzón\ncoca cola 2.25', 'aria-label': 'Productos que necesitás, uno por renglón' });
  const contLibre = h('div');
  async function armarDesdeTexto(e) {
    e.preventDefault();
    if (!textoLista.value.trim()) return;
    montar(contLibre, cargando('Buscando en los súper… puede tardar unos segundos'));
    try {
      const { renglones } = await api.resolver(textoLista.value, { demo: estado.config.demo });
      const noEncontrados = [];
      for (const r of renglones) {
        if (!Object.keys(r.elegidos).length) {
          noEncontrados.push(r.linea);
          continue;
        }
        const existente = lista.items.find((i) => i.clave === r.clave);
        const datos = { clave: r.clave, generico: true, nombre: r.texto, ean: r.ean, refs: r.elegidos, alternativas: r.alternativas, imagen: r.imagen, rubro: r.rubro };
        if (existente) Object.assign(existente, datos, { cantidad: existente.cantidad + r.cantidad });
        else lista.items.push({ ...datos, cantidad: r.cantidad });
      }
      await guardar();
      // La primera carga cambia el armado de la pantalla (lista arriba, "agregar más" abajo).
      if (vacia && lista.items.length) {
        await vistaLista(app, id, { pendientes: noEncontrados });
        if (!noEncontrados.length) aviso(`Listo, agregué ${lista.items.length === 1 ? '1 producto' : `${lista.items.length} productos`}`);
        return;
      }
      dibujarItems();
      textoLista.value = noEncontrados.join('\n');
      montar(
        contLibre,
        noEncontrados.length
          ? h('div', { class: 'banner alerta' }, `No encontré: ${noEncontrados.join(', ')}. Te los dejé en el cuadro: probá escribirlos de otra forma (por ejemplo con la marca).`)
          : h('div', { class: 'banner' }, `✅ Listo, agregué ${renglones.length === 1 ? '1 producto' : `${renglones.length} productos`}.`),
      );
    } catch (err) {
      montar(contLibre, h('div', { class: 'banner alerta' }, `Error: ${err.message}`));
    }
  }

  // Los productos por peso (carne, pollo, queso al corte) van en kg, de a medio kilo.
  const porKg = (it) => Object.values(it.refs ?? {}).some((r) => r?.multiplicador || /por k(g|ilo)/i.test(r?.nombre ?? '')) || /por k(g|ilo)/i.test(it.nombre ?? '');
  const paso = (it) => (porKg(it) ? 0.5 : 1);
  const textoCantidad = (it) => (porKg(it) ? `${String(it.cantidad).replace('.', ',')} kg` : it.cantidad);

  async function cambiar(it, sentido) {
    it.cantidad = Math.round((it.cantidad + sentido * paso(it)) * 10) / 10;
    if (it.cantidad <= 0) lista.items = lista.items.filter((x) => x !== it);
    await guardar();
    dibujarItems();
  }

  async function agregar(g) {
    const existente = lista.items.find((i) => i.clave === g.clave);
    if (existente) existente.cantidad += 1;
    else {
      const algun = Object.values(g.porSuper)[0] ?? {};
      lista.items.push({
        clave: g.clave,
        ean: g.ean ?? null,
        nombre: g.nombre,
        marca: g.marca ?? null,
        imagen: g.imagen ?? null,
        contenido: g.contenido ?? null,
        unidad: g.unidad ?? null,
        rubro: algun.rubro ?? null,
        cantidad: 1,
        refs: Object.fromEntries(Object.entries(g.porSuper).map(([s, p]) => [s, { sku: p.sku, url: p.url, seller: p.seller ?? '1' }])),
      });
    }
    await guardar();
    dibujarItems();
    aviso(`Agregado: ${g.nombre}`);
  }

  async function decidirMatch(p, confirmado, resultado) {
    const registro = confirmado ? { id: p.clave, grupo: p.grupo, confirmado: true } : { id: `${p.clave}|${p.grupo}`, grupo: p.grupo, confirmado: false };
    await estado.store.guardar('matches', registro);
    dibujarResultados(aplicarMatches(resultado, await estado.store.listar('matches')));
  }

  function dibujarResultados(r) {
    const errores = Object.entries(r.errores ?? {});
    const nombres = new Map(r.grupos.map((g) => [g.clave, g]));
    montar(
      contResultados,
      errores.length ? h('div', { class: 'banner alerta' }, `No pude consultar: ${errores.map(([s, e]) => `${SUPERS[s]} (${e})`).join('; ')}`) : null,
      r.pendientes.map((p) =>
        h(
          'div',
          { class: 'tarjeta banner' },
          h('div', null, '¿Es el mismo producto?'),
          h('div', { class: 'chico' }, h('b', null, `${SUPERS[p.producto.super]}: `), p.producto.nombre),
          h('div', { class: 'chico' }, h('b', null, '≈ '), nombres.get(p.grupo)?.nombre ?? p.grupo),
          h('div', { class: 'fila', style: { marginTop: '6px' } }, h('button', { onclick: () => decidirMatch(p, true, r) }, 'Sí, es el mismo'), h('button', { onclick: () => decidirMatch(p, false, r) }, 'No')),
        ),
      ),
      r.grupos.length
        ? h(
            'ul',
            { class: 'lista-items tarjeta' },
            r.grupos.map((g) =>
              h(
                'li',
                null,
                g.imagen ? h('img', { class: 'miniatura', src: g.imagen, alt: '', loading: 'lazy' }) : null,
                h('div', { style: { flex: 1, minWidth: 0 } }, h('div', null, g.nombre), h('div', { class: 'suave chico' }, [g.marca, g.ean ? `EAN ${g.ean}` : 'sin EAN'].filter(Boolean).join(' · ')), chipsPrecios(g.porSuper)),
                h('button', { class: 'primario', onclick: () => agregar(g), 'aria-label': `Agregar ${g.nombre}` }, '+'),
              ),
            ),
          )
        : h('p', { class: 'vacio' }, 'Sin resultados.'),
    );
  }

  const campo = h('input', { type: 'search', placeholder: 'Ej.: yerba playadito', 'aria-label': 'Buscar un producto' });
  async function buscar(e) {
    e.preventDefault();
    const texto = campo.value.trim();
    if (texto.length < 2) return;
    montar(contResultados, cargando('Buscando…'));
    try {
      const [r, matches] = await Promise.all([api.buscar(texto, { demo: estado.config.demo }), estado.store.listar('matches')]);
      dibujarResultados(aplicarMatches(r, matches));
    } catch (err) {
      montar(contResultados, h('div', { class: 'banner alerta' }, `Error al buscar: ${err.message}`));
    }
  }

  const nombre = h('input', { class: 'titulo-editable', value: lista.nombre, 'aria-label': 'Nombre de la lista (tocá para cambiarlo)', onchange: async () => { lista.nombre = nombre.value.trim() || lista.nombre; await guardar(); aviso('Nombre guardado'); } });

  if (pendientes.length) {
    textoLista.value = pendientes.join('\n');
    montar(contLibre, h('div', { class: 'banner alerta' }, `No encontré: ${pendientes.join(', ')}. Te los dejé en el cuadro: probá escribirlos de otra forma (por ejemplo con la marca).`));
  }
  const escribir = h(
    'form',
    { class: 'tarjeta', onsubmit: armarDesdeTexto },
    h('p', { class: 'suave', style: { marginTop: 0 } }, 'Uno por renglón. Si querés más de uno, poné la cantidad adelante (por ejemplo "2 leche").'),
    textoLista,
    h('button', { class: 'primario ancho', type: 'submit', style: { marginTop: '12px' } }, 'Agregar a la lista'),
    contLibre,
  );

  dibujarItems();
  montar(
    app,
    h('a', { href: '#/', class: 'boton texto', style: { marginLeft: '-10px' } }, '← Mis listas'),
    nombre,
    estado.config.demo ? h('div', { class: 'banner alerta' }, 'Modo prueba: los precios son de ejemplo (del 11/10/2026). Se desactiva en Ajustes.') : null,
    vacia ? h('div', { class: 'paso' }, h('span', { class: 'num' }, '1'), '¿Qué necesitás comprar?') : h('h2', null, 'Tu lista'),
    vacia ? escribir : contItems,
    vacia ? contItems : h('div', { class: 'paso' }, h('span', { class: 'num' }, '+'), 'Agregar más productos'),
    vacia ? null : escribir,
    h(
      'details',
      { class: 'desplegable' },
      h('summary', null, '🔎 Buscar un producto específico'),
      h(
        'div',
        { class: 'contenido' },
        h('p', { class: 'suave', style: { marginTop: 0 } }, 'Para elegir una marca o un tamaño exacto y ver el precio en cada súper.'),
        h('form', { class: 'fila', onsubmit: buscar, role: 'search' }, h('div', { class: 'crece' }, campo), h('button', { class: 'primario', type: 'submit' }, 'Buscar')),
        contResultados,
      ),
    ),
    contAccion,
  );
  if (lista.items.length) app.classList.add('con-accion-fija');
}
