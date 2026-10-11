// Utilidades para los handlers de /api (compatibles con Vercel y con el
// middleware de desarrollo de vite.config.js).

export function query(req) {
  if (req.query) return req.query;
  return Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);
}

export async function cuerpo(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  const partes = [];
  for await (const p of req) partes.push(p);
  const texto = Buffer.concat(partes).toString('utf8');
  return texto ? JSON.parse(texto) : {};
}

export function responder(res, status, datos, { cacheSegundos = 0 } = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cacheSegundos ? `s-maxage=${cacheSegundos}, stale-while-revalidate` : 'no-store');
  res.end(JSON.stringify(datos));
}

/** Envuelve un handler y convierte excepciones en JSON. */
export function handler(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      responder(res, e.status ?? 500, { error: e.message });
    }
  };
}

export function errorCliente(mensaje) {
  const e = new Error(mensaje);
  e.status = 400;
  return e;
}
