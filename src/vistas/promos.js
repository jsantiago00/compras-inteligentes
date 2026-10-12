// Promos bancarias: alta, edición y baja. Colección `promos` con el esquema
// de CLAUDE.md. El seed de ejemplo es FICTICIO y está marcado como tal.

import { DIAS, MEDIOS, nombreMedio, SUPERS } from '../../lib/constantes.js';
import { pesos } from '../../lib/formato.js';
import { promosEjemplo } from '../../lib/ejemplos.js';
import sugeridas from '../../lib/promosSugeridas.json';
import { confirmarSugerencia, sugerenciasPendientes } from '../../lib/motor/promosSugeridas.js';
import { aIso, isoLocal } from '../../lib/motor/fechas.js';
import * as api from '../api.js';
import { estado, zonaActiva } from '../estado.js';
import { aviso, cargando, h, montar } from '../ui.js';

const opciones = (obj, actual) => Object.entries(obj).map(([v, t]) => h('option', { value: v, selected: v === actual }, t));

function formulario(promo, alGuardar, alCancelar) {
  const p = {
    super: 'jumbo', medio: 'modo_bna', dias: [], porcentaje: 20, tope: null, tipoTope: 'mensual', tipo: 'reintegro',
    minimoCompra: null, vigenciaDesde: isoLocal(), vigenciaHasta: null, rubrosExcluidos: [], notas: '', ...promo,
  };
  const campos = {
    super: h('select', { name: 'super' }, opciones(Object.fromEntries(zonaActiva().supers.map((s) => [s, SUPERS[s]])), p.super)),
    medio: h('select', { name: 'medio' }, opciones({ ...MEDIOS, todos: 'Cualquier medio de pago' }, p.medio)),
    porcentaje: h('input', { name: 'porcentaje', type: 'number', min: 1, max: 100, step: 'any', required: true, value: p.porcentaje }),
    tipo: h('select', { name: 'tipo' }, opciones({ reintegro: 'Reintegro', descuento_caja: 'Descuento en caja' }, p.tipo)),
    tope: h('input', { name: 'tope', type: 'number', min: 0, step: 'any', placeholder: 'sin tope', value: p.tope ?? '' }),
    tipoTope: h('select', { name: 'tipoTope' }, opciones({ por_compra: 'Por compra', semanal: 'Semanal', mensual: 'Mensual' }, p.tipoTope)),
    minimoCompra: h('input', { name: 'minimoCompra', type: 'number', min: 0, step: 'any', placeholder: 'sin mínimo', value: p.minimoCompra ?? '' }),
    vigenciaDesde: h('input', { name: 'vigenciaDesde', type: 'date', value: aIso(p.vigenciaDesde) ?? '' }),
    vigenciaHasta: h('input', { name: 'vigenciaHasta', type: 'date', value: aIso(p.vigenciaHasta) ?? '' }),
    rubrosExcluidos: h('input', { name: 'rubrosExcluidos', placeholder: 'ej.: Bebidas alcohólicas, Electro', value: (p.rubrosExcluidos ?? []).join(', ') }),
    notas: h('textarea', { name: 'notas', rows: 2 }, p.notas ?? ''),
  };
  const dias = DIAS.map((d, i) => h('label', null, h('input', { type: 'checkbox', value: i, checked: p.dias.includes(i) }), d.slice(0, 3)));

  async function enviar(e) {
    e.preventDefault();
    const num = (el) => (el.value === '' ? null : Number(el.value));
    const elegidos = dias.map((l) => l.querySelector('input')).filter((c) => c.checked).map((c) => Number(c.value));
    const nueva = {
      ...promo,
      super: campos.super.value,
      medio: campos.medio.value,
      dias: elegidos.length ? elegidos : [0, 1, 2, 3, 4, 5, 6],
      porcentaje: num(campos.porcentaje),
      tipo: campos.tipo.value,
      tope: num(campos.tope),
      tipoTope: campos.tipoTope.value,
      minimoCompra: num(campos.minimoCompra),
      vigenciaDesde: campos.vigenciaDesde.value || null,
      vigenciaHasta: campos.vigenciaHasta.value || null,
      rubrosExcluidos: campos.rubrosExcluidos.value.split(',').map((s) => s.trim()).filter(Boolean),
      notas: campos.notas.value,
    };
    // Si el usuario la editó, deja de ser un ejemplo ficticio.
    if (promo?.ficticia) nueva.ficticia = !confirm('¿Confirmás que esta promo es real (la verificaste)?');
    await alGuardar(nueva);
  }

  const campo = (texto, el) => h('div', null, h('label', null, texto), el);
  return h(
    'form',
    { class: 'tarjeta', onsubmit: enviar },
    h('div', { class: 'grilla2' }, campo('Súper', campos.super), campo('Medio de pago', campos.medio), campo('Porcentaje', campos.porcentaje), campo('Tipo', campos.tipo), campo('Tope ($)', campos.tope), campo('Tipo de tope', campos.tipoTope), campo('Mínimo de compra ($)', campos.minimoCompra), h('div'), campo('Vigente desde', campos.vigenciaDesde), campo('Hasta', campos.vigenciaHasta)),
    h('label', null, 'Días (si no marcás ninguno, todos)'),
    h('div', { class: 'dias-semana' }, dias),
    campo('Rubros excluidos (separados por coma)', campos.rubrosExcluidos),
    campo('Notas', campos.notas),
    h('div', { class: 'fila', style: { marginTop: '10px' } }, h('button', { class: 'primario', type: 'submit' }, 'Guardar'), h('button', { type: 'button', onclick: alCancelar }, 'Cancelar')),
  );
}

export async function vistaPromos(app) {
  montar(app, cargando('Buscando promos…'));
  const promos = await estado.store.listar('promos');
  promos.sort((a, b) => a.super.localeCompare(b.super) || a.medio.localeCompare(b.medio));
  const hoy = isoLocal();
  const editor = h('div');

  const guardar = async (p) => {
    await estado.store.guardar('promos', p);
    aviso('Promo guardada');
    vistaPromos(app);
  };
  const editar = (p) => {
    montar(editor, h('h2', null, p ? 'Editar promo' : 'Nueva promo'), formulario(p, guardar, () => montar(editor)));
    editor.scrollIntoView({ behavior: 'smooth' });
  };
  const borrar = async (p) => {
    if (!confirm('¿Borrar la promo?')) return;
    await estado.store.borrar('promos', p.id);
    vistaPromos(app);
  };
  const descartadas = (await estado.store.listar('promosDescartadas')).map((d) => d.id);
  // Solo las de súper que entregan en la zona (ver lib/zona.js).
  // Las que publican los súper (al día) y, para lo que no cubren, las relevadas
  // de las páginas del BNA. Solo de súper que entregan en la zona.
  let deSuper = [];
  try {
    deSuper = (await api.promosSuper()).promos ?? [];
  } catch {
    // Sin server: quedan solo las relevadas.
  }
  const delBanco = sugeridas.promos.filter((s) => !deSuper.some((p) => p.super === s.super && p.medio === s.medio));
  const pendientes = sugerenciasPendientes([...deSuper, ...delBanco].filter((p) => zonaActiva().supers.includes(p.super)), promos, descartadas, hoy);

  const fecha = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '…');
  const textoDias = (p) => (p.dias?.length === 7 ? 'Todos los días' : (p.dias ?? []).map((d) => DIAS[d]).join(', ').replace(/^./, (c) => c.toUpperCase()).replace(/, ([^,]+)$/, ' y $1'));
  const detalles = (p) =>
    h(
      'div',
      { class: 'promo-detalle' },
      h('span', { class: 'chip' }, `📅 ${textoDias(p)}`),
      h('span', { class: 'chip' }, p.tope != null ? `Tope ${pesos(p.tope)}${p.tipoTope === 'mensual' ? ' por mes' : p.tipoTope === 'semanal' ? ' por semana' : ' por compra'}` : 'Sin tope'),
      p.minimoCompra ? h('span', { class: 'chip' }, `Compra mínima ${pesos(p.minimoCompra)}`) : null,
      h('span', { class: 'chip' }, `Hasta el ${fecha(aIso(p.vigenciaHasta))}`),
    );
  const titulo = (p) => [
    h('div', { class: 'promo-titulo' }, `${p.porcentaje}% en ${SUPERS[p.super]}`),
    h('div', { class: 'suave' }, `con ${nombreMedio(p.medio)} · ${p.tipo === 'reintegro' ? 'te lo devuelven después' : 'descuento en la caja'}`),
  ];

  // La misma promo para varios medios (ej. MODO con BNA y con Macro) va en una sola tarjeta.
  const grupos = [];
  for (const p of pendientes) {
    const k = [p.super, p.porcentaje, (p.dias ?? []).join(), p.vigenciaDesde, p.vigenciaHasta, p.tope, p.tipoTope, p.minimoCompra, p.tipo].join('|');
    const g = grupos.find((x) => x.k === k);
    if (g) g.promos.push(p);
    else grupos.push({ k, promos: [p] });
  }
  const medios = (ps) => {
    const n = ps.map((p) => nombreMedio(p.medio));
    return n.length > 1 ? `${n.slice(0, -1).join(', ')} o ${n.at(-1)}` : n[0];
  };
  const confirmarGrupo = async (ps) => {
    for (const p of ps) await estado.store.guardar('promos', confirmarSugerencia(p));
    aviso('Listo: la promo ya cuenta');
    vistaPromos(app);
  };
  const descartarGrupo = async (ps) => {
    for (const p of ps) await estado.store.guardar('promosDescartadas', { id: p.id });
    vistaPromos(app);
  };

  const tarjetaSugerida = ({ promos: ps }) => {
    const p = ps[0];
    return h(
      'div',
      { class: 'tarjeta promo-sugerida' },
      h('div', { class: 'promo-titulo' }, `${p.porcentaje}% en ${SUPERS[p.super]}`),
      h('div', { class: 'suave' }, `con ${medios(ps)} · ${p.tipo === 'reintegro' ? 'te lo devuelven después' : 'descuento en la caja'}`),
      detalles(p),
      p.soloPresencial ? h('div', { class: 'falta' }, 'Solo comprando en el local: no sirve para comprar por internet.') : null,
      h(
        'details',
        { class: 'cambiar-producto' },
        h('summary', null, 'Ver condiciones'),
        p.notas ? h('p', { class: 'chico' }, p.notas) : null,
        p.textoFuente ? h('p', { class: 'suave chico' }, p.textoFuente) : null,
        h('a', { class: 'chico', href: p.fuente, target: '_blank', rel: 'noopener' }, p.origenSuper ? `Ver en la página de ${SUPERS[p.super]} ↗` : 'Ver en la página del banco ↗'),
      ),
      h('div', { class: 'fila', style: { marginTop: '12px' } }, h('button', { class: 'primario crece', onclick: () => confirmarGrupo(ps) }, '✓ Sí, la uso'), h('button', { onclick: () => descartarGrupo(ps) }, 'No me sirve')),
    );
  };

  const cargarEjemplo = async () => {
    for (const p of promosEjemplo(hoy)) await estado.store.guardar('promos', p);
    aviso('Se cargaron promos de ejemplo (no son reales)');
    vistaPromos(app);
  };

  montar(
    app,
    h('h1', null, 'Promos del banco'),
    h('p', { class: 'suave', style: { marginTop: '-6px' } }, 'Las promos que confirmes se usan para calcular dónde y qué día te conviene comprar.'),
    pendientes.length
      ? h(
          'section',
          null,
          h('h2', null, `Encontré ${grupos.length === 1 ? '1 promo' : `${grupos.length} promos`} para vos`),
          h('p', { class: 'suave', style: { marginTop: '-4px' } }, '¿Las usás? Confirmá las que te sirvan.'),
          grupos.map(tarjetaSugerida),
        )
      : null,
    h('h2', null, 'Tus promos'),
    promos.length
      ? promos.map((p) => {
          const vencida = aIso(p.vigenciaHasta) && aIso(p.vigenciaHasta) < hoy;
          return h(
            'div',
            { class: 'tarjeta' },
            p.ficticia ? h('div', { class: 'falta', style: { marginTop: 0, marginBottom: '8px' } }, 'Ejemplo: no es una promo real') : null,
            titulo(p),
            detalles(p),
            vencida ? h('div', { class: 'falta' }, 'Ya venció') : null,
            // Se sugería hasta el 12/10/2026; según Carrefour es solo para jubilados y en el local.
            /^bna-carrefour-lunesaviernes-5/.test(p.origen ?? '') ? h('div', { class: 'falta' }, 'Según Carrefour, esta promo es solo para jubilados y solo en el local. Conviene borrarla.') : null,
            p.soloPresencial ? h('div', { class: 'falta' }, 'Solo comprando en el local') : null,
            p.rubrosExcluidos?.length ? h('div', { class: 'suave chico' }, `No incluye: ${p.rubrosExcluidos.join(', ')}`) : null,
            h('div', { class: 'fila', style: { marginTop: '8px' } }, h('button', { class: 'texto', onclick: () => editar(p) }, 'Editar'), h('button', { class: 'texto peligro', onclick: () => borrar(p) }, 'Borrar')),
          );
        })
      : h('p', { class: 'suave' }, 'Todavía no tenés promos confirmadas.'),
    editor,
    h('button', { class: 'ancho nueva-lista', onclick: () => editar(null) }, '+ Cargar una promo a mano'),
    !promos.length ? h('button', { class: 'texto ancho', onclick: cargarEjemplo, style: { marginTop: '6px' } }, 'Probar con promos de ejemplo') : null,
  );
}
