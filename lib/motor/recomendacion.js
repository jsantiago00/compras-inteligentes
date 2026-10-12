// Recomendación: para cada uno de los próximos días, cada súper y cada medio
// de pago, calcula el costo total de una lista y elige la mejor opción.
// Lógica pura: recibe los precios ya obtenidos, no sabe nada del scraping.

import { IDS_SUPERS, nombreMedio, SUPERS } from '../constantes.js';
import { MEDIOS_INICIALES } from '../medios.js';
import { pesos, nombreDia } from '../formato.js';
import { sumarDias } from './fechas.js';
import { envasesPara } from './listaLibre.js';
import { costoItem, mejorDescuentoBancario } from './promos.js';

const redondear = (n) => Math.round(n * 100) / 100;

/**
 * @typedef {{ clave: string, nombre?: string, cantidad: number, rubro?: string }} ItemLista
 * @typedef {{ precioLista: number, precioOferta?: number|null, promoGondola?: object|null,
 *             disponible?: boolean, sku?: string, url?: string, rubro?: string }} PrecioSuper
 * @typedef {Record<string, Record<string, PrecioSuper>>} Precios  precios[clave][super]
 * @typedef {Record<string, { costo: number, minimoGratis?: number|null }>} Envios
 */

/**
 * Cuántos envases de `p` lleva el ítem en ese súper. Con `item.necesidad`
 * (presentación de referencia de la lista libre, ej. 1 L), se cubre
 * cantidad × referencia con la presentación de ese súper (2 L → 1 envase).
 */
export function envasesItem(item, p) {
  const n = item.necesidad;
  if (n?.contenido && p?.contenido && p.unidad === n.unidad) return envasesPara(p, item.cantidad * n.contenido);
  return item.cantidad;
}

/** Líneas (costo por ítem con promos de góndola) de una lista en un súper. */
export function lineasEnSuper(items, precios, sup) {
  const lineas = [];
  const faltantes = [];
  for (const item of items) {
    const p = precios?.[item.clave]?.[sup];
    if (!p || p.disponible === false || (p.precioOferta ?? p.precioLista) == null) {
      faltantes.push(item.clave);
      continue;
    }
    const cantidad = envasesItem(item, p);
    const c = costoItem(p, cantidad);
    lineas.push({ clave: item.clave, cantidad, rubro: item.rubro ?? p.rubro, ...c });
  }
  return { lineas, faltantes };
}

export function costoEnvio(envio, subtotal) {
  if (!envio || subtotal <= 0) return 0;
  if (envio.minimoGratis != null && subtotal >= envio.minimoGratis) return 0;
  return envio.costo ?? 0;
}

/** Evalúa una opción concreta (fecha + súper + medio). */
export function evaluarOpcion({ items, precios, super: sup, medio, fecha, promos, pedidos, envios }) {
  const { lineas, faltantes } = lineasEnSuper(items, precios, sup);
  const subtotal = redondear(lineas.reduce((s, l) => s + l.costo, 0));
  const ahorroGondola = redondear(lineas.reduce((s, l) => s + l.ahorro, 0));
  const banco = mejorDescuentoBancario({ promos, super: sup, medio, fecha, lineas, pedidos });
  const envio = costoEnvio(envios?.[sup], subtotal);
  return {
    fecha,
    super: sup,
    medio,
    subtotal,
    ahorroGondola,
    descuentoBancario: banco.descuento,
    promo: banco.promo ? { id: banco.promo.id ?? null, tipo: banco.promo.tipo, porcentaje: banco.promo.porcentaje } : null,
    motivoBanco: banco.motivo,
    envio,
    total: redondear(subtotal - banco.descuento + envio),
    faltantes,
    lineas,
  };
}

/** Orden: primero las que tienen menos faltantes, después la más barata, después la más próxima. */
export function compararOpciones(a, b) {
  return (
    a.faltantes.length - b.faltantes.length ||
    a.total - b.total ||
    (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0)
  );
}

/** Mejor medio de pago para un súper en una fecha, con un subconjunto de ítems. */
function mejorMedio(ctx, sup, fecha, items) {
  let mejor = null;
  for (const medio of ctx.medios) {
    const op = evaluarOpcion({ ...ctx, items, super: sup, medio, fecha });
    if (!mejor || compararOpciones(op, mejor) < 0) mejor = op;
  }
  return mejor;
}

function totalDividida(ctx, a, b, fecha, asignacion) {
  const itemsA = ctx.items.filter((i) => asignacion[i.clave] === a);
  const itemsB = ctx.items.filter((i) => asignacion[i.clave] === b);
  if (!itemsA.length || !itemsB.length) return null;
  const partes = [mejorMedio(ctx, a, fecha, itemsA), mejorMedio(ctx, b, fecha, itemsB)];
  const faltantes = ctx.items.filter((i) => asignacion[i.clave] == null).map((i) => i.clave);
  const faltantesPartes = partes.flatMap((p) => p.faltantes);
  return {
    fecha,
    partes,
    total: redondear(partes[0].total + partes[1].total),
    envio: redondear(partes[0].envio + partes[1].envio),
    faltantes: [...faltantes, ...faltantesPartes],
  };
}

/**
 * Compra dividida entre dos súper en una fecha: asigna cada ítem al súper
 * donde sale más barato y después mejora la asignación moviendo ítems de a
 * uno (así entran en juego topes, mínimos de envío gratis y rubros excluidos).
 */
export function mejorDivision(ctx, a, b, fecha) {
  const costo = (item, sup) => {
    const p = ctx.precios?.[item.clave]?.[sup];
    if (!p || p.disponible === false || (p.precioOferta ?? p.precioLista) == null) return null;
    return costoItem(p, envasesItem(item, p)).costo;
  };
  const asignacion = {};
  for (const item of ctx.items) {
    const ca = costo(item, a);
    const cb = costo(item, b);
    asignacion[item.clave] = ca == null && cb == null ? null : cb == null || (ca != null && ca <= cb) ? a : b;
  }
  let mejor = totalDividida(ctx, a, b, fecha, asignacion);
  let mejoro = true;
  for (let vuelta = 0; mejoro && vuelta < 3; vuelta++) {
    mejoro = false;
    for (const item of ctx.items) {
      const actual = asignacion[item.clave];
      if (actual == null) continue;
      const otro = actual === a ? b : a;
      if (costo(item, otro) == null) continue;
      const prueba = { ...asignacion, [item.clave]: otro };
      const r = totalDividida(ctx, a, b, fecha, prueba);
      if (r && (!mejor || compararOpciones(r, mejor) < 0)) {
        asignacion[item.clave] = otro;
        mejor = r;
        mejoro = true;
      }
    }
  }
  return mejor;
}

export function textoOpcion(op) {
  // Sin promo bancaria ese día, el medio de pago da igual.
  return op.promo && op.promo.medio !== 'todos' && op.medio !== 'cualquiera' ? `${SUPERS[op.super]} con ${nombreMedio(op.medio)}` : `${SUPERS[op.super]} (cualquier medio de pago)`;
}

/**
 * Recomendación completa para una lista.
 * @param {object} p
 * @param {ItemLista[]} p.items
 * @param {Precios} p.precios
 * @param {object[]} [p.promos]   promos bancarias (esquema de CLAUDE.md, con `id`)
 * @param {object[]} [p.pedidos]  historial, para descontar topes ya consumidos
 * @param {Envios} [p.envios]
 * @param {string} p.hoy          'YYYY-MM-DD'
 * @param {number} [p.dias=7]
 */
export function recomendar({
  items,
  precios,
  promos = [],
  pedidos = [],
  envios = {},
  hoy,
  dias = 7,
  supers = IDS_SUPERS,
  // Los medios del usuario; "cualquiera" si no eligió ninguno (sin promos bancarias).
  medios = MEDIOS_INICIALES,
  dividida = true,
}) {
  const ctx = { items, precios, promos, pedidos, envios, medios };
  const fechas = Array.from({ length: dias }, (_, i) => sumarDias(hoy, i));
  const opciones = [];
  for (const fecha of fechas) {
    for (const sup of supers) {
      for (const medio of medios) {
        opciones.push(evaluarOpcion({ ...ctx, super: sup, medio, fecha }));
      }
    }
  }
  // Un súper sin ningún producto de la lista no es una opción real.
  const validas = opciones.filter((o) => o.lineas.length > 0);
  validas.sort(compararOpciones);
  const mejor = validas[0] ?? null;

  const calendario = fechas.map((fecha) => {
    const delDia = validas.filter((o) => o.fecha === fecha);
    return { fecha, mejor: delDia[0] ?? null };
  });

  let ahorroVsCara = 0;
  let ahorroVsHoy = 0;
  let masCara = null;
  let mejorHoy = null;
  if (mejor) {
    const comparables = validas.filter((o) => o.faltantes.length === mejor.faltantes.length);
    masCara = comparables[comparables.length - 1];
    ahorroVsCara = redondear(masCara.total - mejor.total);
    mejorHoy = validas.find((o) => o.fecha === hoy && o.faltantes.length === mejor.faltantes.length) ?? null;
    ahorroVsHoy = mejorHoy ? redondear(mejorHoy.total - mejor.total) : 0;
  }

  // Ranking: la mejor opción por súper y día (sin repetir medios peores).
  const vistos = new Set();
  const ranking = [];
  for (const o of validas) {
    const k = `${o.fecha}|${o.super}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    ranking.push(o);
  }

  let compraDividida = null;
  if (dividida && mejor && items.length > 1) {
    for (const fecha of fechas) {
      for (let i = 0; i < supers.length; i++) {
        for (let j = i + 1; j < supers.length; j++) {
          const d = mejorDivision(ctx, supers[i], supers[j], fecha);
          if (!d) continue;
          if (!compraDividida || compararOpciones(d, compraDividida) < 0) compraDividida = d;
        }
      }
    }
    // Solo vale la pena si el ahorro supera el envío extra (el total ya lo incluye)
    // y no deja más productos afuera que la mejor opción simple.
    if (
      !compraDividida ||
      compraDividida.faltantes.length > mejor.faltantes.length ||
      compraDividida.total >= mejor.total
    ) {
      compraDividida = null;
    } else {
      compraDividida.ahorro = redondear(mejor.total - compraDividida.total);
    }
  }

  return {
    hoy,
    mejor,
    masCara,
    mejorHoy,
    ahorroVsCara,
    ahorroVsHoy,
    ranking,
    calendario,
    compraDividida,
    texto: mejor ? textoMejor(mejor, { hoy, ahorroVsCara, ahorroVsHoy }) : 'No hay precios para esta lista todavía.',
  };
}

export function textoMejor(mejor, { hoy, ahorroVsCara, ahorroVsHoy }) {
  const cuando = mejor.fecha === hoy ? `hoy (${nombreDia(mejor.fecha)})` : `el ${nombreDia(mejor.fecha)}`;
  const comparaciones = [];
  if (ahorroVsCara > 0) comparaciones.push(`${pesos(ahorroVsCara)} frente a la opción más cara`);
  if (mejor.fecha !== hoy && ahorroVsHoy > 0) comparaciones.push(`${pesos(ahorroVsHoy)} frente a comprar hoy`);
  const ahorro = comparaciones.length ? ` (ahorrás ${comparaciones.join(' y ')})` : '';
  const faltan = mejor.faltantes.length ? ` — ojo: faltan ${mejor.faltantes.length} producto(s)` : '';
  return `Comprá ${cuando} en ${textoOpcion(mejor)}: ${pesos(mejor.total)}${ahorro}${faltan}`;
}
