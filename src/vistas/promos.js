// Promos bancarias: alta, edición y baja. Colección `promos` con el esquema
// de CLAUDE.md. El seed de ejemplo es FICTICIO y está marcado como tal.

import { DIAS, MEDIOS, SUPERS } from '../../lib/constantes.js';
import { pesos } from '../../lib/formato.js';
import { promosEjemplo } from '../../lib/ejemplos.js';
import sugeridas from '../../lib/promosSugeridas.json';
import { confirmarSugerencia, sugerenciasPendientes } from '../../lib/motor/promosSugeridas.js';
import { aIso, isoLocal } from '../../lib/motor/fechas.js';
import { estado, zonaActiva } from '../estado.js';
import { aviso, h, montar } from '../ui.js';

const opciones = (obj, actual) => Object.entries(obj).map(([v, t]) => h('option', { value: v, selected: v === actual }, t));

function formulario(promo, alGuardar, alCancelar) {
  const p = {
    super: 'jumbo', medio: 'modo_bna', dias: [], porcentaje: 20, tope: null, tipoTope: 'mensual', tipo: 'reintegro',
    minimoCompra: null, vigenciaDesde: isoLocal(), vigenciaHasta: null, rubrosExcluidos: [], notas: '', ...promo,
  };
  const campos = {
    super: h('select', { name: 'super' }, opciones(Object.fromEntries(zonaActiva().supers.map((s) => [s, SUPERS[s]])), p.super)),
    medio: h('select', { name: 'medio' }, opciones(MEDIOS, p.medio)),
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
  const dias = DIAS.map((d, i) => h('label', { class: 'fila', style: { display: 'inline-flex', marginRight: '10px' } }, h('input', { type: 'checkbox', value: i, checked: p.dias.includes(i) }), d.slice(0, 3)));

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
    h('label', null, 'Días'),
    h('div', null, dias),
    campo('Rubros excluidos (separados por coma)', campos.rubrosExcluidos),
    campo('Notas', campos.notas),
    h('div', { class: 'fila', style: { marginTop: '10px' } }, h('button', { class: 'primario', type: 'submit' }, 'Guardar'), h('button', { type: 'button', onclick: alCancelar }, 'Cancelar')),
  );
}

export async function vistaPromos(app) {
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
    montar(editor, formulario(p, guardar, () => montar(editor)));
    editor.scrollIntoView({ behavior: 'smooth' });
  };
  const borrar = async (p) => {
    if (!confirm('¿Borrar la promo?')) return;
    await estado.store.borrar('promos', p.id);
    vistaPromos(app);
  };
  const descartadas = (await estado.store.listar('promosDescartadas')).map((d) => d.id);
  // Solo las de súper que entregan en la zona (ver lib/zona.js).
  const pendientes = sugerenciasPendientes(sugeridas.promos.filter((p) => zonaActiva().supers.includes(p.super)), promos, descartadas, hoy);
  const confirmar = async (sug) => {
    await estado.store.guardar('promos', confirmarSugerencia(sug));
    aviso('Promo confirmada: ya cuenta en la recomendación');
    vistaPromos(app);
  };
  const descartar = async (sug) => {
    await estado.store.guardar('promosDescartadas', { id: sug.id });
    vistaPromos(app);
  };
  const tarjetaSugerida = (p) =>
    h(
      'div',
      { class: 'tarjeta banner' },
      h('b', null, `${SUPERS[p.super]} · ${MEDIOS[p.medio]} · ${p.porcentaje}% ${p.tipo === 'reintegro' ? 'reintegro' : 'en caja'}`),
      h('div', { class: 'suave chico' }, [
        p.dias?.length === 7 ? 'todos los días' : (p.dias ?? []).map((d) => DIAS[d]).join(', '),
        p.tope != null ? `tope ${pesos(p.tope)} ${p.tipoTope.replace('_', ' ')}` : 'sin tope',
        p.minimoCompra ? `mínimo ${pesos(p.minimoCompra)}` : null,
        `vigencia ${aIso(p.vigenciaDesde) ?? '…'} a ${aIso(p.vigenciaHasta) ?? '…'}`,
      ].filter(Boolean).join(' · ')),
      p.soloPresencial ? h('div', { class: 'alerta chico' }, '⚠ Solo para compras en el local: no aplica a compras online, así que no cuenta en la recomendación.') : null,
      p.textoFuente ? h('blockquote', { class: 'chico', style: { margin: '6px 0', paddingLeft: '8px', borderLeft: '3px solid var(--borde)' } }, p.textoFuente) : null,
      h('div', { class: 'chico' }, h('a', { href: p.fuente, target: '_blank', rel: 'noopener' }, 'Ver fuente oficial ↗')),
      h('div', { class: 'fila', style: { marginTop: '6px' } }, h('button', { class: 'primario', onclick: () => confirmar(p) }, 'Confirmar'), h('button', { onclick: () => descartar(p) }, 'Descartar')),
    );

  const cargarEjemplo = async () => {
    for (const p of promosEjemplo(hoy)) await estado.store.guardar('promos', p);
    aviso('Se cargaron promos de ejemplo FICTICIAS');
    vistaPromos(app);
  };

  montar(
    app,
    h('h1', null, 'Promos bancarias'),
    h('p', { class: 'suave chico' }, 'Cargá las promos vigentes de tus medios de pago (MODO, Visa y Mastercard de BNA y Macro). La app no inventa promos: los ejemplos son ficticios.'),
    h('div', { class: 'fila' }, h('button', { class: 'primario', onclick: () => editar(null) }, '+ Nueva promo'), !promos.length ? h('button', { onclick: cargarEjemplo }, 'Cargar ejemplos (ficticios)') : null),
    pendientes.length
      ? h(
          'section',
          null,
          h('h2', null, `🔎 Promos encontradas (${pendientes.length}) — confirmalas`),
          h('p', { class: 'suave chico' }, `Relevadas de las páginas oficiales de los bancos el ${sugeridas.relevado}. No cuentan en la recomendación hasta que las confirmes.`),
          pendientes.map(tarjetaSugerida),
          h('h2', null, 'Tus promos'),
        )
      : null,
    editor,
    promos.length
      ? promos.map((p) => {
          const vencida = aIso(p.vigenciaHasta) && aIso(p.vigenciaHasta) < hoy;
          return h(
            'div',
            { class: 'tarjeta' },
            p.ficticia ? h('div', { class: 'alerta chico' }, '⚠ EJEMPLO FICTICIO') : null,
            p.soloPresencial ? h('div', { class: 'alerta chico' }, '⚠ Solo en el local: no cuenta para compras online') : null,
            h('b', null, `${SUPERS[p.super]} · ${MEDIOS[p.medio]} · ${p.porcentaje}% ${p.tipo === 'reintegro' ? 'reintegro' : 'en caja'}`),
            h('div', { class: 'suave chico' }, [
              (p.dias?.length === 7 ? 'todos los días' : (p.dias ?? []).map((d) => DIAS[d]).join(', ')),
              p.tope != null ? `tope ${pesos(p.tope)} ${p.tipoTope.replace('_', ' ')}` : 'sin tope',
              p.minimoCompra ? `mínimo ${pesos(p.minimoCompra)}` : null,
              p.rubrosExcluidos?.length ? `excluye ${p.rubrosExcluidos.join(', ')}` : null,
              `vigencia ${aIso(p.vigenciaDesde) ?? '…'} a ${aIso(p.vigenciaHasta) ?? '…'}`,
            ].filter(Boolean).join(' · ')),
            vencida ? h('div', { class: 'peligro chico' }, 'Vencida') : null,
            p.notas ? h('div', { class: 'chico' }, p.notas) : null,
            h('div', { class: 'fila', style: { marginTop: '6px' } }, h('button', { onclick: () => editar(p) }, 'Editar'), h('button', { class: 'peligro', onclick: () => borrar(p) }, 'Borrar')),
          );
        })
      : h('p', { class: 'vacio' }, 'No hay promos cargadas.'),
  );
}
