// Ajustes: direcciones de entrega, costos de envío por súper, modo demo y cuenta.

import { SUPERS } from '../../lib/constantes.js';
import { pesos } from '../../lib/formato.js';
import * as api from '../api.js';
import { DIRECCION_PRINCIPAL, direccionActiva, direcciones, enviosActivos, estado, guardarConfig } from '../estado.js';
import { firebaseConfigurado, salir } from '../firebase.js';
import { aviso, h, montar } from '../ui.js';

export async function vistaAjustes(app) {
  const cfg = estado.config;
  const activa = direccionActiva();
  const envios = enviosActivos();
  const filas = activa.supers.map((s) => {
    const e = envios[s] ?? { costo: null, minimoGratis: null };
    const costo = h('input', { type: 'number', min: 0, step: 'any', value: e.costo ?? '', placeholder: '¿?', 'aria-label': `Costo de envío ${SUPERS[s]}` });
    const minimo = h('input', { type: 'number', min: 0, step: 'any', value: e.minimoGratis ?? '', placeholder: 'nunca', 'aria-label': `Mínimo para envío gratis ${SUPERS[s]}` });
    return { s, costo, minimo };
  });

  async function guardarEnvios(ev) {
    ev.preventDefault();
    const nuevos = Object.fromEntries(filas.map(({ s, costo, minimo }) => [s, { costo: costo.value === '' ? null : Number(costo.value), minimoGratis: minimo.value === '' ? null : Number(minimo.value) }]));
    if (activa.id === DIRECCION_PRINCIPAL.id) await guardarConfig({ envios: nuevos, enviosFicticios: false });
    else await guardarConfig({ direcciones: (cfg.direcciones ?? []).map((d) => (d.id === activa.id ? { ...d, envios: nuevos } : d)) });
    estado.precios.clear();
    aviso('Envíos guardados');
    vistaAjustes(app);
  }

  async function usar(d) {
    await guardarConfig({ direccionActiva: d.id });
    estado.precios.clear();
    aviso(`Ahora comprás para ${d.nombre}`);
    vistaAjustes(app);
  }

  async function borrar(d) {
    if (!confirm(`¿Borrar la dirección "${d.nombre}"?`)) return;
    await guardarConfig({
      direcciones: (cfg.direcciones ?? []).filter((x) => x.id !== d.id),
      direccionActiva: cfg.direccionActiva === d.id ? DIRECCION_PRINCIPAL.id : cfg.direccionActiva,
    });
    estado.precios.clear();
    vistaAjustes(app);
  }

  // Alta de dirección: con el código postal, el server averigua qué sucursal
  // de cada súper entrega ahí y cuánto sale el envío.
  const nombre = h('input', { required: true, maxLength: 40, placeholder: 'Ej.: Casa de mamá' });
  const direccion = h('input', { maxLength: 80, placeholder: 'Ej.: San Martín 1200 (opcional)' });
  const cp = h('input', { required: true, inputMode: 'numeric', pattern: '\\d{4}', maxLength: 4, placeholder: '5501' });
  const estadoAlta = h('div');
  async function agregar(ev) {
    ev.preventDefault();
    const boton = ev.submitter;
    if (boton) boton.disabled = true;
    montar(estadoAlta, h('p', { class: 'suave chico' }, 'Buscando qué súper entregan en ese código postal… (unos segundos)'));
    try {
      const z = await api.zonaDeCodigoPostal(cp.value.trim());
      if (!z.supers.length) {
        montar(estadoAlta, h('div', { class: 'banner alerta chico' }, `Ningún súper hace envío a domicilio al CP ${z.codigoPostal}.`, h('ul', null, z.avisos.map((a) => h('li', null, a)))));
        return;
      }
      const nueva = {
        id: `dir-${Date.now().toString(36)}`,
        nombre: nombre.value.trim(),
        direccion: direccion.value.trim() || null,
        codigoPostal: z.codigoPostal,
        localidad: z.localidad,
        provincia: z.provincia,
        supers: z.supers,
        sucursales: z.sucursales,
        nombresSucursales: z.nombresSucursales,
        envios: z.envios,
        avisos: z.avisos,
      };
      await guardarConfig({ direcciones: [...(cfg.direcciones ?? []), nueva] });
      aviso(`Dirección "${nueva.nombre}" agregada`);
      vistaAjustes(app);
    } catch (e) {
      montar(estadoAlta, h('div', { class: 'banner alerta chico' }, `No pude agregarla: ${e.message}`));
    } finally {
      if (boton) boton.disabled = false;
    }
  }

  function tarjetaDireccion(d) {
    const enUso = d.id === activa.id;
    return h(
      'div',
      { class: `tarjeta${enUso ? ' destacada' : ''}`, style: { margin: '0 0 8px' } },
      h('div', { class: 'fila' },
        h('div', { class: 'crece' }, h('b', null, d.nombre), h('div', { class: 'suave chico' }, [d.direccion, `CP ${d.codigoPostal}`, d.localidad].filter(Boolean).join(' · '))),
        enUso ? h('span', { class: 'chip mejor' }, 'En uso') : h('button', { class: 'secundario', onclick: () => usar(d) }, 'Usar esta'),
        d.id !== DIRECCION_PRINCIPAL.id ? h('button', { class: 'texto peligro', onclick: () => borrar(d), 'aria-label': `Borrar ${d.nombre}` }, 'Borrar') : null,
      ),
      h('ul', { class: 'chico', style: { margin: '6px 0 0', paddingLeft: '18px' } },
        d.supers.map((s) => h('li', null, `${SUPERS[s]}: ${d.nombresSucursales?.[s] ?? 'sucursal por defecto'}${d.envios?.[s]?.costo ? ` · envío ${pesos(d.envios[s].costo)}` : ''}`)),
      ),
      d.avisos?.length ? h('div', { class: 'suave chico', style: { marginTop: '4px' } }, d.avisos.join(' ')) : null,
    );
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
      'section',
      { class: 'tarjeta' },
      h('h2', { style: { marginTop: 0 } }, '¿A dónde te lo traen?'),
      h('p', { class: 'suave' }, 'Los precios y el envío dependen de la dirección. Elegí para qué casa comprás.'),
      direcciones().map(tarjetaDireccion),
      h(
        'form',
        { onsubmit: agregar, style: { marginTop: '10px' } },
        h('h3', { style: { marginTop: '18px' } }, 'Agregar otra casa'),
        h('div', { class: 'grilla2' },
          h('label', null, 'Nombre', nombre),
          h('label', null, 'Código postal', cp),
          h('label', null, 'Calle y número', direccion),
        ),
        h('button', { class: 'primario ancho', type: 'submit', style: { marginTop: '12px' } }, 'Agregar dirección'),
        estadoAlta,
      ),
    ),
    h(
      'form',
      { class: 'tarjeta', onsubmit: guardarEnvios },
      h('h2', { style: { marginTop: 0 } }, `Costo de envío a ${activa.nombre}`),
      cfg.enviosFicticios && activa.id === DIRECCION_PRINCIPAL.id ? h('div', { class: 'banner alerta chico' }, 'Estos valores son de ejemplo (ficticios). Cargá los reales de tu zona.') : null,
      h('table', null,
        h('thead', null, h('tr', null, h('th', null, 'Súper'), h('th', null, 'Costo ($)'), h('th', null, 'Gratis desde ($)'))),
        h('tbody', null, filas.map((f) => h('tr', null, h('td', null, SUPERS[f.s]), h('td', null, f.costo), h('td', null, f.minimo)))),
      ),
      h('button', { class: 'primario ancho', type: 'submit', style: { marginTop: '12px' } }, 'Guardar'),
    ),
    h(
      'div',
      { class: 'tarjeta' },
      h('h2', { style: { marginTop: 0 } }, 'Modo prueba'),
      h('label', { class: 'interruptor', for: 'demo' }, demo, 'Usar precios de ejemplo en vez de los reales'),
      h('p', { class: 'suave chico' }, 'Sirve para probar la app sin consultar a los súper. Dejalo apagado para comprar de verdad.'),
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
