// Capa de datos de la PWA: Firestore (usuarios/{uid}/{colección}) si hay
// sesión de Firebase, o localStorage en modo local. Misma interfaz para ambos.
//
// Colecciones: listas, pedidos, promos, matches, config (doc "general").

import { iniciarFirebase } from './firebase.js';

const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function storeLocal(prefijo = 'ci') {
  const leer = (col) => {
    try {
      return JSON.parse(localStorage.getItem(`${prefijo}:${col}`) ?? '[]');
    } catch {
      return [];
    }
  };
  const escribir = (col, datos) => localStorage.setItem(`${prefijo}:${col}`, JSON.stringify(datos));
  return {
    tipo: 'local',
    async listar(col) {
      return leer(col);
    },
    async obtener(col, id) {
      return leer(col).find((x) => x.id === id) ?? null;
    },
    async guardar(col, obj) {
      const datos = leer(col);
      const o = { ...obj, id: obj.id ?? nuevoId() };
      const i = datos.findIndex((x) => x.id === o.id);
      if (i >= 0) datos[i] = o;
      else datos.push(o);
      escribir(col, datos);
      return o;
    },
    async borrar(col, id) {
      escribir(col, leer(col).filter((x) => x.id !== id));
    },
  };
}

// Firestore no acepta `undefined`.
const limpiar = (o) => JSON.parse(JSON.stringify(o));

export async function storeFirestore(uid) {
  const { db, fs } = await iniciarFirebase();
  const ref = (col) => fs.collection(db, 'usuarios', uid, col);
  return {
    tipo: 'firestore',
    async listar(col) {
      const snap = await fs.getDocs(ref(col));
      return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    },
    async obtener(col, id) {
      const d = await fs.getDoc(fs.doc(ref(col), id));
      return d.exists() ? { ...d.data(), id: d.id } : null;
    },
    async guardar(col, obj) {
      const o = { ...obj, id: obj.id ?? nuevoId() };
      await fs.setDoc(fs.doc(ref(col), o.id), limpiar(o));
      return o;
    },
    async borrar(col, id) {
      await fs.deleteDoc(fs.doc(ref(col), id));
    },
  };
}
