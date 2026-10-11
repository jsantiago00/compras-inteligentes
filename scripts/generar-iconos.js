#!/usr/bin/env node
// Genera los íconos PNG de la PWA (192, 512 y maskable 512) sin dependencias:
// un carrito blanco sobre fondo verde azulado.

import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const FONDO = [15, 118, 110];
const BLANCO = [255, 255, 255];

function crc32(buf) {
  let c;
  const tabla = crc32.tabla ??= Array.from({ length: 256 }, (_, n) => {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  let crc = 0xffffffff;
  for (const b of buf) crc = tabla[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const td = Buffer.concat([Buffer.from(tipo), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([largo, td, crc]);
}

function png(tam, pixel) {
  const filas = [];
  for (let y = 0; y < tam; y++) {
    const fila = Buffer.alloc(1 + tam * 4);
    for (let x = 0; x < tam; x++) {
      const [r, g, b, a] = pixel(x / tam, y / tam);
      fila.set([r, g, b, a], 1 + x * 4);
    }
    filas.push(fila);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tam, 0);
  ihdr.writeUInt32BE(tam, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(filas))), chunk('IEND', Buffer.alloc(0))]);
}

// Carrito en coordenadas 0..1 (escalado alrededor del centro).
function esCarrito(x, y) {
  const dentro = (x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const circulo = (cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  // canasta trapezoidal
  const t = (y - 0.33) / (0.6 - 0.33);
  const canasta = y >= 0.33 && y <= 0.6 && x >= 0.3 + t * 0.06 && x <= 0.78 - t * 0.04;
  const manija = dentro(0.18, 0.27, 0.32, 0.31) || (dentro(0.28, 0.27, 0.32, 0.6) && x - 0.28 <= (y - 0.27) * 0.3 + 0.04);
  const base = dentro(0.34, 0.63, 0.74, 0.67);
  return canasta || manija || base || circulo(0.42, 0.75, 0.05) || circulo(0.68, 0.75, 0.05);
}

function icono(tam, { maskable = false } = {}) {
  const escala = maskable ? 0.7 : 0.9;
  return png(tam, (u, v) => {
    const x = 0.5 + (u - 0.5) / escala;
    const y = 0.5 + (v - 0.5) / escala;
    if (!maskable) {
      // esquinas redondeadas
      const r = 0.2;
      const cx = Math.min(Math.max(u, r), 1 - r);
      const cy = Math.min(Math.max(v, r), 1 - r);
      if ((u - cx) ** 2 + (v - cy) ** 2 > r * r) return [0, 0, 0, 0];
    }
    return [...(esCarrito(x, y) ? BLANCO : FONDO), 255];
  });
}

const dir = new URL('../public/iconos/', import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL('icono-192.png', dir), icono(192));
writeFileSync(new URL('icono-512.png', dir), icono(512));
writeFileSync(new URL('icono-maskable-512.png', dir), icono(512, { maskable: true }));
console.log('Íconos generados en public/iconos/');
