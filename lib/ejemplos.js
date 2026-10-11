// Datos de ejemplo FICTICIOS para arrancar. No son promos ni costos reales:
// el usuario carga o confirma los reales desde la UI.

import { isoLocal, sumarDias } from './motor/fechas.js';

const AVISO = 'EJEMPLO FICTICIO — no es una promo real. Editala o borrala.';

export function promosEjemplo(hoy = isoLocal()) {
  const desde = hoy;
  const hasta = sumarDias(hoy, 60);
  const base = { vigenciaDesde: desde, vigenciaHasta: hasta, rubrosExcluidos: [], minimoCompra: null, ficticia: true, notas: AVISO };
  return [
    { ...base, id: 'ejemplo-1', super: 'carrefour', medio: 'modo_macro', dias: [4], porcentaje: 25, tope: 12000, tipoTope: 'semanal', tipo: 'descuento_caja' },
    { ...base, id: 'ejemplo-2', super: 'jumbo', medio: 'visa_bna', dias: [3], porcentaje: 20, tope: 10000, tipoTope: 'mensual', tipo: 'reintegro', rubrosExcluidos: ['Bebidas alcohólicas'] },
    { ...base, id: 'ejemplo-3', super: 'coto', medio: 'modo_bna', dias: [5, 6], porcentaje: 30, tope: 8000, tipoTope: 'mensual', tipo: 'reintegro', minimoCompra: 20000 },
    { ...base, id: 'ejemplo-4', super: 'vea', medio: 'master_macro', dias: [2], porcentaje: 15, tope: null, tipoTope: 'por_compra', tipo: 'descuento_caja' },
  ];
}

// Costos de envío de ejemplo (ficticios): configurar los reales en Ajustes.
export const ENVIOS_EJEMPLO = {
  jumbo: { costo: 3500, minimoGratis: 60000 },
  vea: { costo: 3000, minimoGratis: 50000 },
  carrefour: { costo: 3200, minimoGratis: 55000 },
  coto: { costo: 2900, minimoGratis: null },
};
