// Mini helper para armar DOM sin framework.

export function h(tag, props, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  agregar(el, hijos);
  return el;
}

function agregar(el, hijos) {
  for (const c of hijos.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function montar(contenedor, ...hijos) {
  contenedor.replaceChildren();
  agregar(contenedor, hijos);
}

let timer;
export function aviso(texto) {
  const el = document.getElementById('aviso');
  el.textContent = texto;
  el.classList.add('visible');
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove('visible'), 3000);
}

export function cargando(texto = 'Cargando…') {
  return h('p', { class: 'cargando', role: 'status' }, texto);
}

/** Mensaje de pantalla vacía, con un emoji grande arriba. */
export function vacio(emoji, ...texto) {
  return h('div', { class: 'vacio' }, h('span', { class: 'emoji', 'aria-hidden': 'true' }, emoji), ...texto);
}

const LETRA_SUPER = { jumbo: 'J', vea: 'V', carrefour: 'C', coto: 'COTO' };

/** Logo de un súper con sus colores (ver .logo-super en estilos.css). */
export function logoSuper(sup, { grande = false } = {}) {
  return h('span', { class: `logo-super ${sup}${grande ? ' grande' : ''}`, 'aria-hidden': 'true' }, LETRA_SUPER[sup] ?? sup.slice(0, 1).toUpperCase());
}

/**
 * Link al sitio de un súper que se abre en el navegador. En Android, la app de
 * Carrefour (y otras) toma los links de su sitio (assetlinks "handle_all_urls")
 * pero no sabe cargar el carrito desde un link y lleva a otra pantalla; con un
 * intent a Chrome se abre en el navegador (con fallback a la URL normal).
 */
export function enNavegador(url) {
  if (typeof navigator === 'undefined' || !/Android/i.test(navigator.userAgent) || !/^https:\/\//.test(url)) return url;
  const sinEsquema = url.replace(/^https:\/\//, '');
  return `intent://${sinEsquema}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
}
