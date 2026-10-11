import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// En desarrollo (`npm run dev`) y en `npm run preview` montamos las funciones
// de /api acá mismo, para no depender de `vercel dev`.
function apiLocal() {
  const montar = (middlewares, cargar) => {
    middlewares.use(async (req, res, next) => {
      const m = req.url.match(/^\/api\/([a-z-]+)(?:\?|$)/);
      if (!m) return next();
      const archivo = fileURLToPath(new URL(`./api/${m[1]}.js`, import.meta.url));
      if (!existsSync(archivo)) return next();
      try {
        const mod = await cargar(archivo);
        await mod.default(req, res);
      } catch (e) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  };
  return {
    name: 'api-local',
    configureServer(server) {
      montar(server.middlewares, (f) => server.ssrLoadModule(f));
    },
    configurePreviewServer(server) {
      montar(server.middlewares, (f) => import(f));
    },
  };
}

export default defineConfig({
  plugins: [apiLocal()],
  // El chunk grande es Firestore, que se carga lazy solo si hay Firebase configurado.
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 700 },
});
