// Precios con caché: no se le pide dos veces el mismo producto a un súper en
// menos de `maxHoras`. Cada precio nuevo se agrega al historial de precios.

import { agregarPunto } from '../motor/historialPrecios.js';
import { isoLocal } from '../motor/fechas.js';

export const HORAS_CACHE = 12;

export function claveCache(sup, { ean, sku }) {
  return ean ? `${sup}_ean_${ean}` : `${sup}_sku_${sku}`;
}

/**
 * @param {object} p
 * @param {object} p.adaptador  adaptador del súper
 * @param {object} p.almacen    { get, set }
 * @param {string} p.super
 * @param {{ ean?: string, sku?: string }} p.ref
 * @returns {Promise<{ producto: object|null, fecha: number, desdeCache: boolean }>}
 */
export async function obtenerPrecio({ adaptador, almacen, super: sup, ref, maxHoras = HORAS_CACHE, ahora = Date.now() }) {
  const clave = claveCache(sup, ref);
  const guardado = await almacen.get('precios', clave);
  if (guardado && ahora - guardado.fecha < maxHoras * 3600_000) {
    return { producto: guardado.producto, fecha: guardado.fecha, desdeCache: true };
  }
  const producto = ref.ean ? await adaptador.porEan(ref.ean) : ref.sku ? await adaptador.porSku(ref.sku) : null;
  await almacen.set('precios', clave, { super: sup, ref, producto, fecha: ahora });
  if (producto?.precioLista) {
    const hist = (await almacen.get('historialPrecios', clave)) ?? { super: sup, ref, puntos: [] };
    const puntos = agregarPunto(hist.puntos, { fecha: isoLocal(new Date(ahora)), precioLista: producto.precioLista, precioOferta: producto.precioOferta });
    if (puntos.length !== hist.puntos.length || puntos.at(-1)?.fecha !== hist.puntos.at(-1)?.fecha) {
      await almacen.set('historialPrecios', clave, { ...hist, puntos });
    }
  }
  return { producto, fecha: ahora, desdeCache: false };
}

/**
 * Precios de varios ítems en todos los súper.
 * items: [{ clave, ean?, refs?: { [super]: { sku, ean? } } }]
 * Devuelve { precios: { [clave]: { [super]: producto } }, errores, historial }.
 */
export async function preciosDeItems({ items, adaptadores, almacen, supers, maxHoras }) {
  const precios = {};
  const errores = [];
  const historial = {};
  for (const item of items) {
    precios[item.clave] = {};
    await Promise.all(
      supers.map(async (sup) => {
        // Ítems de lista libre: cada súper tiene su propio producto (refs[súper]),
        // que se busca por su EAN si lo tiene (más confiable) o por SKU.
        const sku = item.refs?.[sup]?.sku;
        const ean = item.ean ?? item.refs?.[sup]?.ean;
        const ref = ean ? { ean } : sku ? { sku } : null;
        if (!ref) return;
        try {
          const r = await obtenerPrecio({ adaptador: adaptadores[sup], almacen, super: sup, ref, maxHoras });
          // Si el EAN no aparece pero tenemos el SKU (match confirmado), probamos por SKU.
          if (!r.producto && ean && sku) {
            const r2 = await obtenerPrecio({ adaptador: adaptadores[sup], almacen, super: sup, ref: { sku }, maxHoras });
            if (r2.producto) precios[item.clave][sup] = { ...r2.producto, actualizado: r2.fecha };
          } else if (r.producto) {
            precios[item.clave][sup] = { ...r.producto, actualizado: r.fecha };
          }
          const h = await almacen.get('historialPrecios', claveCache(sup, ref));
          if (h?.puntos?.length) (historial[item.clave] ??= {})[sup] = h.puntos;
        } catch (e) {
          errores.push({ clave: item.clave, super: sup, error: e.message });
        }
      }),
    );
  }
  return { precios, errores, historial };
}

/** Guarda en la caché de precios productos que ya vinieron de una búsqueda. */
export async function cachearProductos(almacen, sup, productos, ahora = Date.now()) {
  for (const p of productos) {
    if (p.ean) await almacen.set('precios', claveCache(sup, { ean: p.ean }), { super: sup, ref: { ean: p.ean }, producto: p, fecha: ahora });
  }
}
