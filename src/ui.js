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
  return h('p', { class: 'vacio' }, texto);
}
