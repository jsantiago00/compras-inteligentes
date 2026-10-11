#!/usr/bin/env node
// npm run promos:relevar — lee las páginas oficiales de promos del BNA
// (bna.com.ar y semananacion.com.ar) para los súper de la zona, interpreta lo que
// dicen y lo compara con lib/promosSugeridas.json.
// Escribe relevamiento-promos.json y relevamiento-promos.md (cuerpo del issue)
// y deja la huella en $GITHUB_OUTPUT para que el workflow sepa si cambió algo.
// Bajo volumen: ~6 requests, 1,5 s entre cada una.

import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { DIAS, MEDIOS, SUPERS } from '../lib/constantes.js';
import { extraerBna, extraerSemanaNacion, huella, interpretarPromo, interpretarSemanaNacion } from '../lib/promosRelevamiento.js';
import { crearCliente } from '../lib/scrapers/http.js';
import { ZONA } from '../lib/zona.js';

const cliente = crearCliente({ intervaloMs: 1500 });
const texto = async (url) => (await cliente.pedir(url, { headers: { Accept: 'text/html' } })).text();
const BNA = 'https://www.bna.com.ar';
// Solo los súper que entregan en la zona (lib/zona.js).
const NOMBRES = Object.fromEntries(ZONA.supers.map((s) => [s, s]));

const fuentes = [];

// 1) bna.com.ar: descubrir las páginas de los súper desde el listado de promos.
try {
  const listado = await texto(`${BNA}/Personas/DescuentosYPromociones`);
  const links = [...new Set([...listado.matchAll(/href="(\/Personas\/DescuentosYPromociones\/\d+\/([a-z0-9-]+)\/?)"/gi)].map((m) => m[1]))];
  for (const [sup, nombre] of Object.entries(NOMBRES)) {
    const link = links.find((l) => new RegExp(`/${nombre}/?$`, 'i').test(l));
    if (!link) continue;
    const url = BNA + link;
    try {
      const t = extraerBna(await texto(url), nombre);
      fuentes.push({ id: `bna-${sup}`, super: sup, url, texto: t, interpretacion: t ? interpretarPromo(t) : null });
    } catch (e) {
      fuentes.push({ id: `bna-${sup}`, super: sup, url, error: e.message });
    }
  }
} catch (e) {
  fuentes.push({ id: 'bna-listado', url: `${BNA}/Personas/DescuentosYPromociones`, error: e.message });
}

// 2) Semana Nación: una landing por súper.
for (const [sup, nombre] of Object.entries(NOMBRES)) {
  const url = `https://semananacion.com.ar/semananacion/${nombre}`;
  try {
    const d = extraerSemanaNacion(await texto(url));
    if (!d) {
      fuentes.push({ id: `semananacion-${sup}`, super: sup, url, error: 'sin __NEXT_DATA__' });
      continue;
    }
    const t = [d.descripcion, ...d.textos, d.condiciones].filter(Boolean).join(' · ');
    fuentes.push({ id: `semananacion-${sup}`, super: sup, url, promociones: d.promociones, texto: t, interpretacion: interpretarSemanaNacion(d) });
  } catch (e) {
    fuentes.push({ id: `semananacion-${sup}`, super: sup, url, error: e.message });
  }
}

// 3) Comparación con las sugeridas actuales.
const sugeridas = JSON.parse(readFileSync(new URL('../lib/promosSugeridas.json', import.meta.url), 'utf8')).promos;
function diferencias(f) {
  if (!f.interpretacion) return [];
  // Con MODO se compara con la sugerida de MODO BNA; sin MODO, con la de tarjeta BNA.
  const medios = f.interpretacion.modo ? ['modo_bna'] : ['visa_bna', 'master_bna'];
  const s = sugeridas.find((p) => p.super === f.super && medios.includes(p.medio));
  if (!s) return [`no hay promo sugerida de BNA para ${SUPERS[f.super]}`];
  const i = f.interpretacion;
  const out = [];
  if (i.porcentaje != null && i.porcentaje !== s.porcentaje) out.push(`porcentaje: fuente ${i.porcentaje}% vs sugerida ${s.porcentaje}%`);
  if (i.dias && JSON.stringify(i.dias) !== JSON.stringify(s.dias)) out.push(`días: fuente ${i.dias.map((d) => DIAS[d]).join(', ')} vs sugerida ${s.dias.map((d) => DIAS[d]).join(', ')}`);
  if (i.tope != null && i.tope !== s.tope) out.push(`tope: fuente $${i.tope} vs sugerida ${s.tope == null ? 'sin tope' : `$${s.tope}`}`);
  if (i.sinTope && s.tope != null) out.push(`tope: la fuente dice "sin tope" y la sugerida tiene $${s.tope}`);
  if (i.vigenciaHasta && i.vigenciaHasta !== s.vigenciaHasta) out.push(`vigencia hasta: fuente ${i.vigenciaHasta} vs sugerida ${s.vigenciaHasta}`);
  if (i.soloPresencial && !s.soloPresencial) out.push('la fuente dice que es solo presencial (no aplica online) y la sugerida no lo indica');
  return out;
}

const relevamiento = fuentes.map((f) => ({ ...f, diferencias: diferencias(f) }));
const h = huella(relevamiento.map(({ id, texto: t, promociones, error }) => ({ id, t, promociones, error: Boolean(error) })));
const hoy = new Date().toISOString().slice(0, 10);

writeFileSync('relevamiento-promos.json', JSON.stringify({ fecha: hoy, huella: h, fuentes: relevamiento }, null, 2));

const fmtI = (i) =>
  i
    ? [i.porcentaje != null && `${i.porcentaje}%`, i.dias && i.dias.map((d) => DIAS[d]).join(', '), i.sinTope ? 'sin tope' : i.tope != null && `tope $${i.tope} ${i.tipoTope ?? ''}`, i.minimoCompra && `mínimo $${i.minimoCompra}`, i.vigenciaHasta && `hasta ${i.vigenciaHasta}`, i.modo && 'MODO', i.soloPresencial && '⚠️ solo presencial (no online)']
        .filter(Boolean)
        .join(' · ')
    : '—';
const md = [
  `Relevamiento automático de promos del BNA del ${hoy} (huella \`${h}\`).`,
  '',
  'El texto o los datos de alguna fuente cambiaron desde el último relevamiento. Revisá y, si corresponde, actualizá `lib/promosSugeridas.json` (o pedile a Claude que lo haga). Las promos nunca se aplican solas: en la app hay que confirmarlas.',
  '',
  ...relevamiento.flatMap((f) => [
    `### ${f.super ? SUPERS[f.super] : f.id} — [${f.id}](${f.url})`,
    f.error ? `⚠️ Error: ${f.error}` : `**Interpretación:** ${fmtI(f.interpretacion)}${f.promociones?.length ? `  \n**Promos asociadas:** ${f.promociones.join(', ')}` : ''}`,
    f.diferencias?.length ? `**Diferencias con las sugeridas:**\n${f.diferencias.map((d) => `- ${d}`).join('\n')}` : '',
    f.texto ? `<details><summary>Texto de la fuente</summary>\n\n> ${f.texto.slice(0, 1500)}\n</details>` : '',
    '',
  ]),
  `Medios del usuario: ${Object.values(MEDIOS).join(', ')}. Macro no publica sus promos en una fuente abierta: revisarlas en la app de Macro / MODO.`,
].join('\n');
writeFileSync('relevamiento-promos.md', md);

console.log(md);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `huella=${h}\n`);
