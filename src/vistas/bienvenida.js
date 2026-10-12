// Primera vez: la cuenta no tiene dirección de entrega. Se pide antes de usar
// la app, porque precios, stock y envío dependen de la sucursal que entrega ahí.

import { SUPERS } from '../../lib/constantes.js';
import { crearDireccion } from '../direcciones.js';
import { estado, misMedios } from '../estado.js';
import { aviso, h, montar } from '../ui.js';

/** @param {() => void} alTerminar  sigue a donde iba el usuario */
export function vistaBienvenida(app, alTerminar) {
  const nombre = h('input', { maxLength: 40, value: 'Casa', 'aria-label': 'Nombre de la dirección' });
  const direccion = h('input', { maxLength: 80, placeholder: 'Ej.: San Martín 1200 (opcional)', 'aria-label': 'Calle y número' });
  const cp = h('input', { required: true, inputMode: 'numeric', pattern: '\\d{4}', maxLength: 4, placeholder: 'Ej.: 5501', 'aria-label': 'Código postal', style: { fontSize: '24px', letterSpacing: '2px' } });
  const estadoAlta = h('div');
  const boton = h('button', { class: 'primario grande ancho', type: 'submit', style: { marginTop: '16px' } }, 'Listo');

  async function enviar(ev) {
    ev.preventDefault();
    boton.disabled = true;
    montar(estadoAlta, h('p', { class: 'cargando' }, 'Buscando qué súper te llevan las compras…'));
    try {
      const r = await crearDireccion({ nombre: nombre.value, direccion: direccion.value, codigoPostal: cp.value });
      if (!r.direccion) {
        montar(estadoAlta, h('div', { class: 'banner alerta' }, `Ningún súper hace envío a domicilio al código postal ${r.zona.codigoPostal}. Probá con otro.`));
        return;
      }
      aviso(`Listo: te traen ${r.direccion.supers.map((s) => SUPERS[s]).join(', ')}`);
      // Sin medios de pago, el paso siguiente es elegirlos.
      if (!misMedios().length) location.hash = '#/ajustes';
      alTerminar();
    } catch (e) {
      montar(estadoAlta, h('div', { class: 'banner alerta' }, `No pude buscar ese código postal: ${e.message}`));
    } finally {
      boton.disabled = false;
    }
  }

  const nombreUsuario = estado.usuario?.displayName?.split(' ')[0];
  montar(
    app,
    h(
      'form',
      { class: 'tarjeta pantalla-entrada', onsubmit: enviar, style: { textAlign: 'left' } },
      h('h1', { style: { textAlign: 'center' } }, nombreUsuario ? `¡Hola, ${nombreUsuario}!` : '¡Hola!'),
      h('p', { style: { textAlign: 'center' } }, '¿A dónde te traen las compras? Con tu código postal busco qué súper te entregan y cuánto sale el envío.'),
      h('label', null, 'Código postal', cp),
      h('label', null, 'Calle y número', direccion),
      h('label', null, 'Nombre de la dirección', nombre),
      boton,
      estadoAlta,
      h('p', { class: 'suave chico', style: { marginBottom: 0 } }, 'Después podés agregar otras direcciones en Ajustes.'),
    ),
  );
  cp.focus();
}
