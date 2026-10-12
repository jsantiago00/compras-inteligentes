// Catálogo de medios de pago de Argentina. Cada usuario elige los suyos en
// Ajustes (config.medios); la app sugiere y aplica solo promos de esos medios.
//
// Ids: "<tipo>_<banco>" para los bancos (modo_bna, visa_galicia, master_bbva,
// amex_santander…) y un id propio para billeteras y cuentas (mercadopago,
// cuentadni…). Los ids de antes (modo_bna, visa_macro…) se mantienen.
//
// Comodines que solo usan las promos (nunca son medios del usuario):
// - "todos": cualquier medio de pago.
// - "modo_*": MODO con cualquier banco adherido.

export const BANCOS = {
  bna: { nombre: 'Banco Nación', corto: 'BNA', alias: /naci[oó]n|\bbna\b/i },
  provincia: { nombre: 'Banco Provincia', corto: 'Provincia', alias: /provincia(?! de)|\bbapro\b/i },
  ciudad: { nombre: 'Banco Ciudad', corto: 'Ciudad', alias: /banco ciudad|\bciudad\b/i },
  macro: { nombre: 'Banco Macro', corto: 'Macro', alias: /macro/i },
  galicia: { nombre: 'Galicia', corto: 'Galicia', alias: /galicia(?! m[aá]s)/i },
  galicia_mas: { nombre: 'Galicia Más (ex HSBC)', corto: 'Galicia Más', alias: /galicia m[aá]s|\bhsbc\b/i },
  santander: { nombre: 'Santander', corto: 'Santander', alias: /santander/i },
  bbva: { nombre: 'BBVA', corto: 'BBVA', alias: /\bbbva\b|franc[eé]s/i },
  icbc: { nombre: 'ICBC', corto: 'ICBC', alias: /\bicbc\b/i },
  credicoop: { nombre: 'Credicoop', corto: 'Credicoop', alias: /credicoop/i },
  supervielle: { nombre: 'Supervielle', corto: 'Supervielle', alias: /supervielle/i },
  patagonia: { nombre: 'Banco Patagonia', corto: 'Patagonia', alias: /patagonia/i },
  comafi: { nombre: 'Comafi', corto: 'Comafi', alias: /comafi/i },
  hipotecario: { nombre: 'Banco Hipotecario', corto: 'Hipotecario', alias: /hipotecario/i },
  columbia: { nombre: 'Banco Columbia', corto: 'Columbia', alias: /columbia/i },
  bancor: { nombre: 'Bancor (Córdoba)', corto: 'Bancor', alias: /bancor|banco (?:de )?c[oó]rdoba|cordobesa/i },
  santafe: { nombre: 'Banco Santa Fe', corto: 'Santa Fe', alias: /santa fe/i },
  entrerios: { nombre: 'Banco Entre Ríos', corto: 'Entre Ríos', alias: /entre r[ií]os/i },
  sanjuan: { nombre: 'Banco San Juan', corto: 'San Juan', alias: /san juan/i },
  brubank: { nombre: 'Brubank', corto: 'Brubank', alias: /brubank/i },
};

// Cómo se paga con un banco.
export const TIPOS = {
  modo: 'MODO',
  visa: 'Visa',
  master: 'Mastercard',
  amex: 'American Express',
};

// Billeteras, tarjetas y cuentas que no son "tipo + banco".
export const BILLETERAS = {
  mercadopago: { nombre: 'Mercado Pago', alias: /mercado ?pago/i },
  cuentadni: { nombre: 'Cuenta DNI', alias: /cuenta dni/i },
  naranjax: { nombre: 'Naranja X', alias: /naranja/i },
  uala: { nombre: 'Ualá', alias: /ual[aá]/i },
  cuenta_carrefour: { nombre: 'Cuenta Digital Carrefour Banco', alias: /cuenta digital de carrefour/i },
  tarjeta_carrefour: { nombre: 'Tarjeta de crédito Carrefour Banco', alias: /tarjeta de cr[eé]dito (?:de )?carrefour/i },
};

/** Todos los medios: { id: nombre }. */
export const MEDIOS = {};
for (const [b, banco] of Object.entries(BANCOS)) for (const [t, tipo] of Object.entries(TIPOS)) MEDIOS[`${t}_${b}`] = `${tipo} ${banco.corto}`;
for (const [id, m] of Object.entries(BILLETERAS)) MEDIOS[id] = m.nombre;
export const IDS_MEDIOS = Object.keys(MEDIOS);

// Los del usuario original (antes de poder elegir): BNA y Macro.
export const MEDIOS_INICIALES = ['modo_bna', 'modo_macro', 'visa_bna', 'master_bna', 'visa_macro', 'master_macro'];

/** Nombre para mostrar de un medio o comodín. */
export function nombreMedio(m) {
  if (m === 'todos' || m === 'cualquiera') return 'cualquier medio de pago';
  if (m === 'modo_*') return 'MODO (cualquier banco)';
  return MEDIOS[m] ?? m;
}

/** ¿Una promo para `medioPromo` aplica pagando con `medio`? */
export function medioCoincide(medioPromo, medio) {
  if (medioPromo === 'todos' || medioPromo === medio) return true;
  return medioPromo === 'modo_*' && String(medio).startsWith('modo_');
}

/** ¿El usuario (con estos medios) puede usar una promo para `medioPromo`? */
export function tieneMedio(medios, medioPromo) {
  return (medios ?? []).some((m) => medioCoincide(medioPromo, m));
}

/** Bancos nombrados en un texto (ej. "Bancos que aplicaran: BNA, Galicia, Macro"). */
export function bancosEnTexto(texto) {
  return Object.entries(BANCOS)
    .filter(([, b]) => b.alias.test(texto ?? ''))
    .map(([k]) => k);
}
