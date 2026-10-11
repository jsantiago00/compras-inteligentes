// Editar una lista: nombre, ítems, cantidades y buscador de productos en los
// 4 súper (unificados por EAN, con confirmación de matches difusos).

import { SUPERS } from '../../lib/constantes.js';
import { pesos } from '../../lib/formato.js';
import * as api from '../api.js';
import { estado } from '../estado.js';
import { aviso, cargando, h, montar } from '../ui.js';

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

export async function vistaLista(app, id) {
  montar(app, cargando());
  const lista = await estado.store.obtener('listas', id);
  if (!lista) return montar(app, h('p', { class: 'vacio' }, 'No encontré esa lista. ', h('a', { href: '#/' }, 'Volver')));

  const guardar = async () => {
    lista.actualizada = Date.now();
    await estado.store.guardar('listas', lista);
    // La caché de la recomendación se guarda por lista y modo (demo/real).
    for (const k of [...estado.precios.keys()]) if (k.startsWith(`${lista.id}|`)) estado.precios.delete(k);
  };

  const contItems = h('div');
  const contResultados = h('div');

  function dibujarItems() {
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
                it.imagen ? h('img', { class: 'miniatura', src: it.imagen, alt: '', loading: 'lazy' }) : null,
                h(
                  'div',
                  { class: 'crece', style: { flex: 1, minWidth: 0 } },
                  h('div', null, it.nombre),
                  it.generico
                    ? detalleGenerico(it)
                    : h('div', { class: 'suave chico' }, [it.marca, Object.keys(it.refs ?? {}).map((s) => SUPERS[s]).join(' · ')].filter(Boolean).join(' — ')),
                ),
                h(
                  'span',
                  { class: 'cantidad' },
                  h('button', { 'aria-label': 'Menos', onclick: () => cambiar(it, -1) }, '−'),
                  h('b', null, it.cantidad),
                  h('button', { 'aria-label': 'Más', onclick: () => cambiar(it, 1) }, '+'),
                ),
              ),
            ),
          )
        : h('p', { class: 'vacio' }, 'La lista está vacía. Buscá productos abajo.'),
    );
  }

  // Ítem de lista libre: qué producto se eligió en cada súper, con opción de cambiarlo.
  function detalleGenerico(it) {
    return h(
      'details',
      { class: 'chico' },
      h('summary', { class: 'suave' }, Object.entries(it.refs ?? {}).length ? `En ${Object.keys(it.refs).map((s) => SUPERS[s]).join(', ')} — ver qué producto` : 'No lo encontré en ningún súper'),
      Object.keys(SUPERS).map((sup) => {
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

  const textoLista = h('textarea', { rows: 6, placeholder: '2 yerba playadito\nleche entera\narroz 1kg\nfideos tirabuzón\ncoca cola 2.25', 'aria-label': 'Lista escrita, un producto por renglón' });
  const contLibre = h('div');
  async function armarDesdeTexto(e) {
    e.preventDefault();
    if (!textoLista.value.trim()) return;
    montar(contLibre, cargando('Buscando cada renglón en los 4 súper… (puede tardar unos segundos)'));
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
      dibujarItems();
      textoLista.value = noEncontrados.join('\n');
      montar(
        contLibre,
        noEncontrados.length
          ? h('div', { class: 'banner alerta chico' }, `No encontré: ${noEncontrados.join(', ')}. Te los dejé en el cuadro: probá escribirlos distinto (por ejemplo con la marca).`)
          : h('div', { class: 'banner chico' }, `Listo: ${renglones.length} producto(s) agregados. Tocá "¿Dónde compro?" para ver qué súper te conviene.`),
      );
    } catch (err) {
      montar(contLibre, h('div', { class: 'banner alerta' }, `Error: ${err.message}`));
    }
  }

  async function cambiar(it, delta) {
    it.cantidad += delta;
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

  const campo = h('input', { type: 'search', placeholder: 'Buscar producto (ej.: yerba playadito)', 'aria-label': 'Buscar producto' });
  async function buscar(e) {
    e.preventDefault();
    const texto = campo.value.trim();
    if (texto.length < 2) return;
    montar(contResultados, cargando('Buscando en Jumbo, Vea, Carrefour y Coto…'));
    try {
      const [r, matches] = await Promise.all([api.buscar(texto, { demo: estado.config.demo }), estado.store.listar('matches')]);
      dibujarResultados(aplicarMatches(r, matches));
    } catch (err) {
      montar(contResultados, h('div', { class: 'banner alerta' }, `Error al buscar: ${err.message}`));
    }
  }

  const nombre = h('input', { value: lista.nombre, 'aria-label': 'Nombre de la lista', onchange: async () => { lista.nombre = nombre.value.trim() || lista.nombre; await guardar(); aviso('Nombre guardado'); } });

  dibujarItems();
  montar(
    app,
    h('div', { class: 'fila' }, h('a', { href: '#/' }, '← Listas')),
    h('div', { class: 'fila', style: { margin: '8px 0 12px' } }, h('div', { class: 'crece' }, nombre), h('a', { class: 'boton primario', href: `#/reco/${lista.id}` }, '¿Dónde compro?')),
    contItems,
    estado.config.demo ? h('div', { class: 'banner alerta chico' }, 'Modo demo: precios guardados (captura real del 11/10/2026, no se actualizan). Desactivalo en Ajustes.') : null,
    h('h2', null, 'Escribí tu lista'),
    h(
      'form',
      { class: 'tarjeta', onsubmit: armarDesdeTexto },
      h('p', { class: 'suave chico', style: { marginTop: 0 } }, 'Un producto por renglón, con la cantidad adelante si querés. Busco cada uno en los 4 súper y elijo el producto más conveniente de cada uno (lo podés cambiar después).'),
      textoLista,
      h('button', { class: 'primario', type: 'submit', style: { marginTop: '8px' } }, 'Armar lista'),
    ),
    contLibre,
    h('h2', null, 'O buscá un producto puntual'),
    h('form', { class: 'fila', onsubmit: buscar, role: 'search' }, h('div', { class: 'crece' }, campo), h('button', { type: 'submit' }, '🔎 Buscar')),
    contResultados,
  );
}
