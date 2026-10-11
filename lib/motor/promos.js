// Motor de promociones: promos de góndola (por producto) y promos bancarias
// (por súper + medio de pago + día). Funciones puras, sin I/O.

import { aIso, diaSemana, inicioSemana, mismoMes, sumarDias } from './fechas.js';

const redondear = (n) => Math.round(n * 100) / 100;

/**
 * Costo de `cantidad` unidades de un producto aplicando la promo de góndola.
 * `precio` = { precioLista, precioOferta, promoGondola }.
 * La promo de góndola se aplica sobre el precio de oferta si existe (así es
 * como lo cobran los súper: el 2x1 sobre el precio vigente).
 */
export function costoItem(precio, cantidad) {
  const lista = precio.precioLista ?? precio.precioOferta;
  const base = precio.precioOferta ?? precio.precioLista;
  if (base == null || cantidad <= 0) return { costo: 0, sinPromo: 0, ahorro: 0 };
  const sinPromo = (lista ?? base) * cantidad;
  const promo = precio.promoGondola;
  let costo = base * cantidad;

  if (promo) {
    if (promo.tipo === 'nxm' && promo.lleva > promo.paga && promo.paga > 0) {
      const grupos = Math.floor(cantidad / promo.lleva);
      const resto = cantidad % promo.lleva;
      costo = (grupos * promo.paga + resto) * base;
    } else if (promo.tipo === 'segunda_unidad' && promo.porcentaje > 0) {
      const pares = Math.floor(cantidad / 2);
      costo = base * cantidad - pares * base * (promo.porcentaje / 100);
    } else if (promo.tipo === 'porcentaje' && promo.porcentaje > 0) {
      if (cantidad >= (promo.minimoUnidades ?? 1)) costo = base * cantidad * (1 - promo.porcentaje / 100);
    }
  }
  costo = redondear(costo);
  return { costo, sinPromo: redondear(sinPromo), ahorro: redondear(sinPromo - costo) };
}

/** ¿La promo bancaria está vigente y aplica a ese súper, medio y fecha? */
export function promoAplica(promo, { super: sup, medio, fecha }) {
  if (promo.activa === false) return false;
  if (promo.super !== sup || promo.medio !== medio) return false;
  if (Array.isArray(promo.dias) && promo.dias.length && !promo.dias.includes(diaSemana(fecha))) return false;
  const desde = aIso(promo.vigenciaDesde);
  const hasta = aIso(promo.vigenciaHasta);
  if (desde && fecha < desde) return false;
  if (hasta && fecha > hasta) return false;
  return true;
}

/** Rango [desde, hasta] del período del tope que contiene `fecha`. */
export function periodoTope(tipoTope, fecha) {
  if (tipoTope === 'semanal') {
    const desde = inicioSemana(fecha);
    return { desde, hasta: sumarDias(desde, 6) };
  }
  if (tipoTope === 'mensual') {
    const desde = fecha.slice(0, 8) + '01';
    let hasta = desde;
    while (mismoMes(sumarDias(hasta, 1), desde)) hasta = sumarDias(hasta, 1);
    return { desde, hasta };
  }
  return null; // por_compra: no acumula
}

/**
 * Cuánto del tope ya se consumió en el período, a partir del historial de
 * pedidos. Un pedido consume tope si se pagó con la misma promo
 * (`promoId`) o, si no quedó registrada, con el mismo súper + medio en un día
 * en que la promo aplicaba.
 */
export function topeConsumido(promo, pedidos, fecha) {
  const periodo = periodoTope(promo.tipoTope, fecha);
  if (!periodo) return 0;
  let total = 0;
  for (const p of pedidos ?? []) {
    const f = aIso(p.fecha);
    if (!f || f < periodo.desde || f > periodo.hasta || f > fecha) continue;
    const mismaPromo = p.promoId
      ? p.promoId === promo.id
      : promoAplica(promo, { super: p.super, medio: p.medio, fecha: f });
    if (mismaPromo) total += p.descuentoBancario ?? 0;
  }
  return total;
}

const normalizar = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

/** ¿El rubro del ítem (ej. "/Bebidas/Vinos/") cae en algún rubro excluido? */
export function rubroExcluido(rubro, excluidos) {
  if (!rubro || !excluidos?.length) return false;
  const r = normalizar(rubro);
  return excluidos.some((e) => e && r.includes(normalizar(e)));
}

/**
 * Descuento de una promo bancaria puntual sobre un conjunto de líneas
 * `[{ costo, rubro }]`. Devuelve `{ descuento, base, topeRestante, motivo }`.
 */
export function descuentoPromo(promo, lineas, { fecha, pedidos }) {
  const subtotal = lineas.reduce((s, l) => s + l.costo, 0);
  if (promo.minimoCompra && subtotal < promo.minimoCompra) {
    return { descuento: 0, base: 0, topeRestante: null, motivo: 'no llega al mínimo de compra' };
  }
  const base = lineas.filter((l) => !rubroExcluido(l.rubro, promo.rubrosExcluidos)).reduce((s, l) => s + l.costo, 0);
  let descuento = base * (promo.porcentaje / 100);
  let topeRestante = null;
  let motivo = null;
  if (promo.tope != null) {
    topeRestante = Math.max(0, promo.tope - topeConsumido(promo, pedidos, fecha));
    if (descuento > topeRestante) {
      descuento = topeRestante;
      motivo = topeRestante === 0 ? 'tope agotado en el período' : 'limitado por el tope';
    }
  }
  return { descuento: redondear(descuento), base: redondear(base), topeRestante, motivo };
}

/**
 * La mejor promo bancaria aplicable (no se acumulan entre sí).
 * Devuelve `{ descuento, promo, motivo, topeRestante }`; `promo` es null si no hay.
 */
export function mejorDescuentoBancario({ promos, super: sup, medio, fecha, lineas, pedidos }) {
  let mejor = { descuento: 0, promo: null, motivo: null, topeRestante: null };
  for (const promo of promos ?? []) {
    if (!promoAplica(promo, { super: sup, medio, fecha })) continue;
    const r = descuentoPromo(promo, lineas, { fecha, pedidos });
    if (!mejor.promo || r.descuento > mejor.descuento) mejor = { ...r, promo };
  }
  return mejor;
}
