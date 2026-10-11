// Firebase (Auth con Google + Firestore). Si no hay variables VITE_FIREBASE_*
// la app funciona en "modo local" (datos en este navegador).

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigurado = Boolean(config.apiKey && config.projectId);

let modulos = null;

export async function iniciarFirebase() {
  if (modulos) return modulos;
  const [{ initializeApp }, auth, fs] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
  const app = initializeApp(config);
  modulos = { app, auth: auth.getAuth(app), authMod: auth, db: fs.getFirestore(app), fs };
  return modulos;
}

/** Llama a `cb(usuario|null)` cada vez que cambia la sesión. */
export async function escucharSesion(cb) {
  const { auth, authMod } = await iniciarFirebase();
  return authMod.onAuthStateChanged(auth, cb);
}

export async function entrarConGoogle() {
  const { auth, authMod } = await iniciarFirebase();
  await authMod.signInWithPopup(auth, new authMod.GoogleAuthProvider());
}

export async function salir() {
  const { auth, authMod } = await iniciarFirebase();
  await authMod.signOut(auth);
}
