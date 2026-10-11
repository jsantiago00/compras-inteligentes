// Promos sugeridas: relevadas automáticamente de fuentes oficiales, pero que
// solo cuentan cuando el usuario las confirma (pasan a su colección `promos`).

import { aIso } from './fechas.js';

const CAMPOS = ['super', 'medio', 'dias', 'porcentaje', 'tope', 'tipoTope', 'tipo', 'minimoCompra', 'vigenciaDesde', 'vigenciaHasta', 'rubrosExcluidos', 'notas'];

/** Sugerencias vigentes que el usuario todavía no confirmó ni descartó. */
export function sugerenciasPendientes(sugeridas, promosUsuario, descartadas, hoy) {
  const usadas = new Set((promosUsuario ?? []).map((p) => p.origen).filter(Boolean));
  const fuera = new Set(descartadas ?? []);
  return (sugeridas ?? []).filter((s) => !usadas.has(s.id) && !fuera.has(s.id) && !(aIso(s.vigenciaHasta) && aIso(s.vigenciaHasta) < hoy));
}

/** Promo del usuario a partir de una sugerencia confirmada. */
export function confirmarSugerencia(s) {
  const promo = Object.fromEntries(CAMPOS.map((k) => [k, s[k] ?? null]));
  return { ...promo, rubrosExcluidos: s.rubrosExcluidos ?? [], notas: `${s.notas ?? ''} (Fuente: ${s.fuente})`.trim(), origen: s.id, fuente: s.fuente };
}
