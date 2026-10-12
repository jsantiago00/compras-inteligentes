// Constantes compartidas entre el server, el motor y la PWA.

export const SUPERS = {
  jumbo: 'Jumbo',
  vea: 'Vea',
  carrefour: 'Carrefour',
  coto: 'Coto',
};

// Medios de pago: catálogo en lib/medios.js (cada usuario elige los suyos).
export { IDS_MEDIOS, MEDIOS, nombreMedio } from './medios.js';

export const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export const IDS_SUPERS = Object.keys(SUPERS);
