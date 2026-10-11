// Service worker: la app (HTML/JS/CSS/íconos) funciona offline; /api siempre
// va a la red (los precios no se cachean acá, eso lo hace el server).

const CACHE = 'compras-v1';
const BASICOS = ['/', '/index.html', '/manifest.webmanifest', '/iconos/icono-192.png', '/iconos/icono-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASICOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // Navegación: red primero, y si no hay conexión, la app cacheada.
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('/index.html')));
    return;
  }
  // Recursos estáticos (con hash en el nombre): caché primero.
  e.respondWith(
    caches.match(e.request).then(
      (r) =>
        r ??
        fetch(e.request).then((res) => {
          if (res.ok) {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copia));
          }
          return res;
        }),
    ),
  );
});
