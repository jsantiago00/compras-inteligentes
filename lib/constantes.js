// Constantes compartidas entre el server, el motor y la PWA.

export const SUPERS = {
  jumbo: 'Jumbo',
  vea: 'Vea',
  carrefour: 'Carrefour',
  coto: 'Coto',
};

// Los únicos medios de pago del usuario.
export const MEDIOS = {
  modo_bna: 'MODO BNA',
  modo_macro: 'MODO Macro',
  visa_bna: 'Visa BNA',
  master_bna: 'Mastercard BNA',
  visa_macro: 'Visa Macro',
  master_macro: 'Mastercard Macro',
};

/** Nombre de un medio de una promo ("todos" = cualquier medio de pago). */
export const nombreMedio = (m) => (m === 'todos' ? 'cualquier medio de pago' : MEDIOS[m] ?? m);

export const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export const IDS_SUPERS = Object.keys(SUPERS);
export const IDS_MEDIOS = Object.keys(MEDIOS);
