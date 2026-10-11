// Ajustes: costos de envío por súper, modo demo y cuenta.

import { SUPERS } from '../../lib/constantes.js';
import { estado, guardarConfig } from '../estado.js';
import { firebaseConfigurado, salir } from '../firebase.js';
import { aviso, h, montar } from '../ui.js';

export async function vistaAjustes(app) {
  const cfg = estado.config;
  const filas = Object.keys(SUPERS).map((s) => {
    const e = cfg.envios?.[s] ?? { costo: 0, minimoGratis: null };
    const costo = h('input', { type: 'number', min: 0, step: 'any', value: e.costo ?? 0, 'aria-label': `Costo de envío ${SUPERS[s]}` });
    const minimo = h('input', { type: 'number', min: 0, step: 'any', value: e.minimoGratis ?? '', placeholder: 'nunca gratis', 'aria-label': `Mínimo para envío gratis ${SUPERS[s]}` });
    return { s, costo, minimo };
  });

  async function guardarEnvios(ev) {
    ev.preventDefault();
    const envios = Object.fromEntries(filas.map(({ s, costo, minimo }) => [s, { costo: Number(costo.value || 0), minimoGratis: minimo.value === '' ? null : Number(minimo.value) }]));
    await guardarConfig({ envios, enviosFicticios: false });
    estado.precios.clear();
    aviso('Envíos guardados');
    vistaAjustes(app);
  }

  const demo = h('input', { type: 'checkbox', checked: Boolean(cfg.demo), id: 'demo' });
  demo.addEventListener('change', async () => {
    await guardarConfig({ demo: demo.checked });
    estado.precios.clear();
    aviso(demo.checked ? 'Modo demo activado' : 'Modo demo desactivado');
  });

  montar(
    app,
    h('h1', null, 'Ajustes'),
    h(
      'form',
      { class: 'tarjeta', onsubmit: guardarEnvios },
      h('h2', { style: { marginTop: 0 } }, 'Envío a domicilio'),
      cfg.enviosFicticios ? h('div', { class: 'banner alerta chico' }, 'Estos valores son de ejemplo (ficticios). Cargá los reales de tu zona.') : null,
      h('table', null,
        h('thead', null, h('tr', null, h('th', null, 'Súper'), h('th', null, 'Costo ($)'), h('th', null, 'Gratis desde ($)'))),
        h('tbody', null, filas.map((f) => h('tr', null, h('td', null, SUPERS[f.s]), h('td', null, f.costo), h('td', null, f.minimo)))),
      ),
      h('button', { class: 'primario', type: 'submit', style: { marginTop: '10px' } }, 'Guardar envíos'),
    ),
    h(
      'div',
      { class: 'tarjeta' },
      h('h2', { style: { marginTop: 0 } }, 'Precios'),
      h('label', { class: 'fila', for: 'demo', style: { color: 'inherit' } }, demo, 'Modo demo: usar precios de ejemplo (ficticios) en vez de consultar los súper'),
      h('p', { class: 'suave chico' }, 'Sirve para probar la app sin conexión a los sitios. Los precios reales se refrescan una vez por día y se cachean.'),
    ),
    h(
      'div',
      { class: 'tarjeta' },
      h('h2', { style: { marginTop: 0 } }, 'Cuenta'),
      firebaseConfigurado && estado.usuario
        ? [h('p', null, `Conectado como ${estado.usuario.email}`), h('button', { onclick: async () => { await salir(); location.reload(); } }, 'Salir')]
        : h('p', { class: 'suave chico' }, 'Modo local: los datos quedan guardados solo en este navegador. Configurá Firebase (ver README) para sincronizarlos con tu cuenta de Google.'),
    ),
  );
}
