// Cliente HTTP para los scrapers: User-Agent identificable, timeout y rate
// limiting por host (uso personal y de bajo volumen: no martillar los sitios).

export const USER_AGENT =
  'Mozilla/5.0 (compatible; ComprasInteligentes/0.1; asistente personal de compras, bajo volumen)';

export class ErrorHttp extends Error {
  constructor(mensaje, { status, url } = {}) {
    super(mensaje);
    this.status = status;
    this.url = url;
  }
}

/**
 * @param {object} [opts]
 * @param {typeof fetch} [opts.fetch]   inyectable para tests
 * @param {number} [opts.intervaloMs]   espera mínima entre requests al mismo host
 * @param {number} [opts.timeoutMs]
 */
export function crearCliente({ fetch: fetchImpl = globalThis.fetch, intervaloMs = 1200, timeoutMs = 15000 } = {}) {
  const colas = new Map(); // host → promesa del último turno

  async function turno(host) {
    const anterior = colas.get(host) ?? Promise.resolve(0);
    let liberar;
    const actual = new Promise((r) => (liberar = r));
    colas.set(host, actual);
    const ultimo = await anterior;
    const espera = ultimo + intervaloMs - Date.now();
    if (espera > 0) await new Promise((r) => setTimeout(r, espera));
    return () => liberar(Date.now());
  }

  async function pedir(url, { headers = {}, ...resto } = {}) {
    const host = new URL(url).host;
    const fin = await turno(host);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        ...resto,
        signal: ctrl.signal,
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json, text/plain, */*', 'Accept-Language': 'es-AR,es;q=0.9', ...headers },
      });
      if (!res.ok && res.status !== 206) throw new ErrorHttp(`HTTP ${res.status} en ${url}`, { status: res.status, url });
      return res;
    } catch (e) {
      if (e.name === 'AbortError') throw new ErrorHttp(`Timeout (${timeoutMs} ms) en ${url}`, { url });
      throw e;
    } finally {
      clearTimeout(timer);
      fin();
    }
  }

  return {
    pedir,
    async json(url, opts) {
      const res = await pedir(url, opts);
      const texto = await res.text();
      try {
        return JSON.parse(texto);
      } catch {
        throw new ErrorHttp(`Respuesta no JSON en ${url}: ${texto.slice(0, 120)}`, { url, status: res.status });
      }
    },
  };
}
