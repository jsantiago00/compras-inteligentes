// Arranque de la PWA: sesión (Firebase o local), router por hash y service worker.

import './estilos.css';
import { estado, cargarConfig } from './estado.js';
import { storeFirestore, storeLocal } from './datos.js';
import { entrarConGoogle, escucharSesion, firebaseConfigurado } from './firebase.js';
import { h, montar } from './ui.js';
import { vistaAjustes } from './vistas/ajustes.js';
import { vistaHistorial } from './vistas/historial.js';
import { vistaLista } from './vistas/lista.js';
import { vistaListas } from './vistas/listas.js';
import { vistaPromos } from './vistas/promos.js';
import { vistaRecomendacion } from './vistas/recomendacion.js';

const app = document.getElementById('app');

const RUTAS = [
  [/^#\/lista\/([^/]+)$/, (m) => vistaLista(app, m[1]), 'listas'],
  [/^#\/reco\/([^/]+)$/, (m) => vistaRecomendacion(app, m[1]), 'listas'],
  [/^#\/historial$/, () => vistaHistorial(app), 'historial'],
  [/^#\/promos$/, () => vistaPromos(app), 'promos'],
  [/^#\/ajustes$/, () => vistaAjustes(app), 'ajustes'],
  [/^.*$/, () => vistaListas(app), 'listas'],
];

async function navegar() {
  if (!estado.store) return;
  const hash = location.hash || '#/';
  for (const [re, vista, tab] of RUTAS) {
    const m = hash.match(re);
    if (!m) continue;
    document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('activa', a.dataset.tab === tab));
    app.className = '';
    try {
      await vista(m);
    } catch (e) {
      console.error(e);
      montar(app, h('div', { class: 'banner alerta' }, `Algo falló: ${e.message}`));
    }
    window.scrollTo(0, 0);
    return;
  }
}

async function iniciar(store, usuario = null) {
  estado.store = store;
  estado.usuario = usuario;
  await cargarConfig();
  document.getElementById('estado-cuenta').textContent = usuario ? (usuario.displayName ?? usuario.email) : '';
  navegar();
}

window.addEventListener('hashchange', navegar);

if (firebaseConfigurado) {
  escucharSesion(async (usuario) => {
    if (usuario) return iniciar(await storeFirestore(usuario.uid), usuario);
    estado.store = null;
    montar(
      app,
      h('div', { class: 'tarjeta pantalla-entrada' },
        h('img', { src: '/iconos/icono-192.png', alt: '' }),
        h('h1', null, 'Compras Inteligentes'),
        h('p', null, 'Armá tu lista y te digo en qué súper, qué día y con qué tarjeta te conviene comprar.'),
        h('button', { class: 'primario grande ancho', onclick: () => entrarConGoogle().catch((e) => alert(e.message)) }, 'Entrar con Google'),
      ),
    );
  });
} else {
  iniciar(storeLocal());
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('SW no registrado', e));
}
