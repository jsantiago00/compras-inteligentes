// Almacenamiento del server: Firestore (firebase-admin) si hay credenciales,
// y si no, memoria (sirve para desarrollo y tests; se pierde entre invocaciones).

export function almacenMemoria() {
  const datos = new Map();
  return {
    tipo: 'memoria',
    async get(col, id) {
      return structuredClone(datos.get(`${col}/${id}`) ?? null);
    },
    async set(col, id, valor) {
      datos.set(`${col}/${id}`, structuredClone(valor));
    },
    // Para el cron: en memoria no hay listas de usuarios.
    async clavesEnUso() {
      return [];
    },
  };
}

function credenciales(env) {
  if (env.FIREBASE_SERVICE_ACCOUNT) return JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  if (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    return {
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };
  }
  return null;
}

export async function almacenFirestore(cred) {
  const { initializeApp, getApps, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps()[0] ?? initializeApp({ credential: cert(cred) });
  const db = getFirestore(app);
  return {
    tipo: 'firestore',
    db,
    async get(col, id) {
      const snap = await db.collection(col).doc(id).get();
      return snap.exists ? snap.data() : null;
    },
    async set(col, id, valor) {
      await db.collection(col).doc(id).set(valor);
    },
    /** Productos que algún usuario tiene en listas o en el historial de pedidos. */
    async clavesEnUso() {
      const claves = new Map();
      const agregar = (it) => {
        if (!it?.clave) return;
        claves.set(it.clave, { clave: it.clave, ean: it.ean ?? null, refs: it.refs ?? {} });
      };
      for (const grupo of ['listas', 'pedidos']) {
        const snap = await db.collectionGroup(grupo).get();
        snap.forEach((d) => (d.data().items ?? []).forEach(agregar));
      }
      return [...claves.values()];
    },
  };
}

let almacen = null;
export async function obtenerAlmacen(env = process.env) {
  if (almacen) return almacen;
  const cred = credenciales(env);
  almacen = cred ? await almacenFirestore(cred) : almacenMemoria();
  return almacen;
}

// Colecciones cuyo contenido depende de la sucursal (precios, stock, resultados).
const COLECCIONES_POR_ZONA = new Set(['precios', 'historialPrecios', 'busquedas']);

/**
 * Vista del almacén para una zona de entrega: los precios de cada zona se
 * guardan con un sufijo en la clave (la zona principal no lleva sufijo).
 */
export function almacenDeZona(almacen, sufijo) {
  if (!sufijo) return almacen;
  const id = (col, clave) => (COLECCIONES_POR_ZONA.has(col) ? `${clave}${sufijo}` : clave);
  return {
    ...almacen,
    get: (col, clave) => almacen.get(col, id(col, clave)),
    set: (col, clave, valor) => almacen.set(col, id(col, clave), valor),
  };
}
