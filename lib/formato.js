import { DIAS } from './constantes.js';
import { diaSemana } from './motor/fechas.js';

export function pesos(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return '$' + Math.round(n).toLocaleString('es-AR');
}

export function nombreDia(iso) {
  return DIAS[diaSemana(iso)];
}

const numero = (n) => String(Math.round(n * 100) / 100).replace('.', ',');

/** Presentación de un producto: "2 L", "500 ml", "1 kg", "300 g", "6 u". */
export function presentacion(p) {
  const c = p?.contenido;
  if (!c) return '';
  if (p.unidad === 'kg') return c < 1 ? `${Math.round(c * 1000)} g` : `${numero(c)} kg`;
  if (p.unidad === 'l') return c < 1 ? `${Math.round(c * 1000)} ml` : `${numero(c)} L`;
  return `${numero(c)} u`;
}

/** Precio por litro, kilo o unidad: "$850/L". */
export function porUnidadTexto(p) {
  const precio = p?.precioOferta ?? p?.precioLista ?? p?.precio;
  if (!precio || !p?.contenido) return '';
  const u = p.unidad === 'l' ? 'L' : p.unidad === 'kg' ? 'kg' : 'u';
  return `${pesos(precio / p.contenido)}/${u}`;
}

const unitario = (p) => {
  const precio = p?.precioOferta ?? p?.precioLista ?? p?.precio;
  return precio && p?.contenido ? precio / p.contenido : null;
};

/** ¿`mejor` sale al menos un 10 % menos por litro/kilo/unidad que lo elegido? */
export function convieneOtraPresentacion(mejor, elegidos) {
  const m = unitario(mejor);
  const us = (elegidos ?? []).filter((e) => e?.unidad === mejor?.unidad).map(unitario).filter(Boolean);
  return m != null && us.length > 0 && m < Math.min(...us) * 0.9;
}
