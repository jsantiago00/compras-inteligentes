// Ajustes → "Tus medios de pago": cada cuenta marca sus bancos (con qué paga en
// cada uno: MODO, Visa, Mastercard, Amex) y sus billeteras. La app sugiere y
// aplica solo promos de esos medios.

import { BANCOS, BILLETERAS, TIPOS } from '../../lib/medios.js';
import { estado, guardarConfig, misMedios } from '../estado.js';
import { aviso, h } from '../ui.js';

/** @param {() => void} alGuardar  para redibujar la pantalla */
export function seccionMedios(alGuardar) {
  const elegidos = new Set(misMedios());
  let cambios = false;
  const guardar = h('button', { class: 'primario ancho', type: 'button', disabled: true, style: { marginTop: '14px' } }, 'Guardar mis medios de pago');
  const marcar = () => {
    cambios = true;
    guardar.disabled = false;
  };

  function chip(id, texto) {
    const b = h('button', { type: 'button', class: `chip-medio${elegidos.has(id) ? ' activo' : ''}`, 'aria-pressed': String(elegidos.has(id)) }, texto);
    b.addEventListener('click', () => {
      if (elegidos.has(id)) elegidos.delete(id);
      else elegidos.add(id);
      b.classList.toggle('activo', elegidos.has(id));
      b.setAttribute('aria-pressed', String(elegidos.has(id)));
      marcar();
    });
    return b;
  }

  // Primero los bancos que ya usa; el resto, plegado.
  const usaBanco = (k) => Object.keys(TIPOS).some((t) => elegidos.has(`${t}_${k}`));
  const filaBanco = ([k, banco]) =>
    h('div', { class: 'fila-banco' }, h('div', { class: 'nombre-banco' }, banco.nombre), h('div', { class: 'chips' }, Object.entries(TIPOS).map(([t, nombre]) => chip(`${t}_${k}`, nombre))));
  const bancos = Object.entries(BANCOS);
  const mios = bancos.filter(([k]) => usaBanco(k));
  const otros = bancos.filter(([k]) => !usaBanco(k));

  guardar.addEventListener('click', async () => {
    await guardarConfig({ medios: [...elegidos] });
    estado.precios.clear();
    cambios = false;
    aviso('Medios de pago guardados');
    alGuardar();
  });

  return h(
    'section',
    { class: 'tarjeta', id: 'medios' },
    h('h2', { style: { marginTop: 0 } }, 'Tus medios de pago'),
    h('p', { class: 'suave' }, 'Tocá con qué pagás en cada banco. La app te va a mostrar solo las promos que podés usar.'),
    !elegidos.size ? h('div', { class: 'banner alerta' }, 'Todavía no elegiste ninguno: sin esto no te puedo mostrar promos de tus bancos.') : null,
    mios.length ? h('div', { class: 'lista-bancos' }, mios.map(filaBanco)) : null,
    h(
      'details',
      { class: 'cambiar-producto', open: !mios.length },
      h('summary', null, mios.length ? 'Agregar otro banco' : 'Elegí tus bancos'),
      h('div', { class: 'lista-bancos' }, otros.map(filaBanco)),
    ),
    h('h3', { style: { marginTop: '16px' } }, 'Billeteras y cuentas'),
    h('div', { class: 'chips' }, Object.entries(BILLETERAS).map(([id, w]) => chip(id, w.nombre))),
    guardar,
    h('p', { class: 'suave chico', style: { marginBottom: 0 } }, 'Cada cuenta tiene sus propios medios: lo que elijas acá no cambia lo de otra persona.'),
  );
}
