import { DIAS } from './constantes.js';
import { diaSemana } from './motor/fechas.js';

export function pesos(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return '$' + Math.round(n).toLocaleString('es-AR');
}

export function nombreDia(iso) {
  return DIAS[diaSemana(iso)];
}
