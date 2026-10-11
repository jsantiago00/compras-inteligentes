// Fechas como strings 'YYYY-MM-DD' (fecha local del usuario), para que el
// motor no dependa de la zona horaria del server.

function partes(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return [a, m, d];
}

function aUtc(iso) {
  const [a, m, d] = partes(iso);
  return Date.UTC(a, m - 1, d);
}

function desdeUtc(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Fecha local de un Date como 'YYYY-MM-DD'. */
export function isoLocal(fecha = new Date()) {
  const a = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${a}-${m}-${d}`;
}

export function sumarDias(iso, n) {
  return desdeUtc(aUtc(iso) + n * 86400000);
}

/** 0 = domingo … 6 = sábado. */
export function diaSemana(iso) {
  return new Date(aUtc(iso)).getUTCDay();
}

export function diasEntre(desde, hasta) {
  return Math.round((aUtc(hasta) - aUtc(desde)) / 86400000);
}

/** Lunes de la semana de la fecha (las semanas van de lunes a domingo). */
export function inicioSemana(iso) {
  const dia = diaSemana(iso);
  return sumarDias(iso, dia === 0 ? -6 : 1 - dia);
}

export function mismoMes(a, b) {
  return a.slice(0, 7) === b.slice(0, 7);
}

/** Acepta 'YYYY-MM-DD', Date, Timestamp de Firestore o null. */
export function aIso(valor) {
  if (valor == null || valor === '') return null;
  if (typeof valor === 'string') return valor.slice(0, 10);
  if (valor instanceof Date) return isoLocal(valor);
  if (typeof valor.toDate === 'function') return isoLocal(valor.toDate());
  if (typeof valor.seconds === 'number') return isoLocal(new Date(valor.seconds * 1000));
  return null;
}
