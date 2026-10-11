# Compras Inteligentes

Asistente personal de compras de supermercado. Arma listas, compara precios en
**Jumbo, Vea, Carrefour y Coto** y recomienda **cuándo, dónde y con qué medio de
pago** comprar (MODO BNA, MODO Macro, Visa/Mastercard BNA y Macro).

- PWA mobile-first instalable (Vite + JS vanilla, ~14 kB gzip sin Firebase).
- Funciones serverless en Vercel (`/api/*`) para el scraping (CORS lo bloquea desde el navegador).
- Firebase Auth (Google) + Firestore. Sin Firebase, la app funciona en **modo local** (localStorage).
- Vercel Cron diario para refrescar precios.

## Estructura

```
api/            buscar.js, precios.js, producto.js, carrito.js, refrescar.js (cron)
lib/motor/      promos.js, recomendacion.js, sugerencias.js, historialPrecios.js, fechas.js  ← lógica pura
lib/scrapers/   vtex.js, coto.js, normalizar.js, matching.js, http.js, fixtures.js, index.js
lib/servidor/   almacen.js (Firestore o memoria), precios.js (caché + historial), api.js
lib/            carrito.js, constantes.js, ejemplos.js (seeds FICTICIOS), formato.js
src/            PWA (main.js, vistas/, datos.js, firebase.js)
public/         manifest, service worker, íconos
scripts/        smoke.js, capturar-fixtures.js, generar-iconos.js
tests/          tests unitarios (node:test) + fixtures/
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm install` | Instala dependencias (Node ≥ 20). |
| `npm run dev` | Vite en `localhost:5173`, con `/api` montado en el mismo server (no hace falta `vercel dev`). |
| `npm test` | Tests del motor (topes, días, envío, compra dividida, rubros), promos, normalización, matching, scrapers contra fixtures, caché y carrito. |
| `npm run smoke` | Pega a los sitios reales con 3 productos conocidos y reporta qué funciona (`smoke-reporte.json`). `npm run smoke -- --fixtures` prueba el script sin red. |
| `npm run build` | Build de producción en `dist/`. |
| `npm run preview` | Sirve `dist/` + `/api` en `localhost:4173`. |
| `npm run fixtures:capturar` | Captura respuestas reales una vez y reemplaza los fixtures. |
| `npm run iconos` | Regenera los íconos PNG de la PWA. |

## Setup

### 1. Firebase

1. Crear un proyecto en <https://console.firebase.google.com>.
2. **Authentication → Sign-in method →** habilitar **Google**. En *Authorized domains* agregar el dominio de Vercel (`tu-app.vercel.app`).
3. **Firestore Database →** crear la base (modo producción) y publicar las reglas de `firestore.rules`
   (`npx firebase-tools deploy --only firestore:rules`, o pegarlas en la consola).
4. **Configuración del proyecto → Tus apps →** agregar una app web y copiar `apiKey`, `authDomain`, `projectId`, `appId` a las variables `VITE_FIREBASE_*`.
5. **Configuración del proyecto → Cuentas de servicio →** "Generar nueva clave privada". Ese JSON (en una línea) va en `FIREBASE_SERVICE_ACCOUNT` (solo server).

Datos en Firestore:

| Ruta | Quién escribe | Contenido |
|---|---|---|
| `usuarios/{uid}/listas` | PWA | `{ nombre, items: [{ clave, ean, nombre, cantidad, rubro, refs: { jumbo: { sku, url, seller } } }] }` |
| `usuarios/{uid}/pedidos` | PWA ("Ya compré") | `{ fecha, super, medio, items, subtotal, descuentoBancario, promoId, envio, total }` |
| `usuarios/{uid}/promos` | PWA | esquema de promos bancarias de `CLAUDE.md` |
| `usuarios/{uid}/matches` | PWA | matches difusos confirmados/rechazados |
| `usuarios/{uid}/config/general` | PWA | costos de envío, modo demo |
| `precios/{super}_ean_{ean}` | server | último precio + fecha (caché) |
| `historialPrecios/{super}_ean_{ean}` | server | `{ puntos: [{ fecha, precioLista, precioOferta }] }` (solo cambios) |
| `busquedas/{super}_{texto}` | server | caché de búsquedas (2 h) |

### 2. Variables de entorno

Copiar `.env.example` a `.env.local` para desarrollo; en Vercel cargarlas en *Settings → Environment Variables*.
Sin `VITE_FIREBASE_*` la PWA usa modo local; sin credenciales de server la caché vive en memoria.

### 3. Deploy en Vercel

1. Importar el repo en <https://vercel.com/new> (framework: *Vite*; `vercel.json` ya define build, salida `dist`, funciones y cron).
2. Cargar las variables de entorno (incluido `CRON_SECRET`, que Vercel manda en el header `Authorization` al cron).
3. Deploy. El cron `/api/refrescar` corre todos los días a las 9:00 UTC (6:00 en Argentina) y refresca los productos que aparecen en listas o pedidos de cualquier usuario (máx. `REFRESCAR_MAXIMO` por corrida).
4. Abrir la URL en el celular → "Agregar a la pantalla de inicio" / "Instalar app".

## Cómo funciona

### Scraping (`lib/scrapers`)

Interfaz común por súper: `buscar(texto)`, `porEan(ean)`, `porSku(sku)`, `carrito(items)`. Producto:
`{ ean, nombre, marca, precioLista, precioOferta, promoGondola, unidad, contenido, url, imagen, sku, disponible }`
(+ `precioPorUnidad`, `rubro`, `seller`).

- **VTEX (Jumbo, Vea, Carrefour):** API pública de catálogo
  `/api/catalog_system/pub/products/search?ft=<texto>`, `?fq=alternateIds_Ean:<ean>` y `?fq=skuId:<sku>`, con `&sc=<sales channel>`.
  `Price < ListPrice` → `precioOferta`. Las promos de góndola salen de `Teasers`/`PromotionTeasers` (soporta las claves `<Name>k__BackingField` y `name`).
- **Coto:** no es VTEX; el sitio (Oracle Commerce / Endeca) devuelve JSON agregando `format=json`:
  `/sitios/cdigi/categoria?Dy=1&Ntt=<texto>&Nrpp=<n>&format=json`. La búsqueda por texto matchea el EAN.
  El parser busca los registros recursivamente (no depende de índices fijos). Se ignoran descuentos atados a medios que el usuario no tiene (Tarjeta Coto, Comunidad Coto).
- **Normalización:** contenido desde el nombre (`1 Kg`, `2,25 L`, `6 x 1,5 L`, `750 ml`) y precio por $/kg, $/l o $/un. Pesables de VTEX usan `unitMultiplier`.
- **Matching:** por EAN; si no hay EAN, difuso por nombre + marca + contenido. La app pregunta "¿Es el mismo producto?" y guarda la respuesta.
- **Caché y cortesía:** `HORAS_CACHE` (12 h) por producto y súper, búsquedas 2 h, 1,2 s entre requests al mismo host, timeout 15 s, User-Agent identificable.

### Zona de entrega

Precio y stock pueden variar según la zona:

- **VTEX:** `sc` (sales channel) configurable por súper con `VTEX_SC_*` (default `1`). Si se define `CODIGO_POSTAL`, el adaptador resuelve la región con `/api/checkout/pub/regions?country=ARG&postalCode=<cp>&sc=<sc>` y la manda en la cookie `vtex_segment`.
- **Coto:** el sitio usa la sucursal por defecto; los links de producto terminan en `-200` (sucursal).
- ⚠️ **A verificar con acceso real:** qué `sc` usa cada súper para tu zona (mirar el `sc=` del link "agregar al carrito" o de las requests del sitio en DevTools después de elegir la dirección de entrega).

### Motor de promociones y recomendación (`lib/motor`, puro y testeado)

- **Góndola:** NxM (2x1, 3x2), 2da unidad al X%, X% off (opcionalmente "llevando N").
- **Bancarias:** colección `promos` editable en la pestaña *Promos*. Aplica por súper + medio + día + vigencia; respeta `minimoCompra`, `rubrosExcluidos` y el **tope ya consumido** en el período (`por_compra`, `semanal` lunes–domingo, `mensual` calendario) según el historial de pedidos. No se acumulan entre sí: se toma la mejor.
- **Recomendación:** para cada uno de los próximos 7 días × 4 súper × 6 medios calcula subtotal con góndola, descuento bancario con tope, envío (configurable por súper con mínimo para envío gratis) y faltantes. Ordena por menos faltantes, menor total y fecha más próxima. Muestra la mejor opción ("Comprá el *jueves* en *Carrefour* con *MODO Macro*: $X (ahorrás $Y frente a la opción más cara y $Z frente a comprar hoy)"), un ranking, el calendario semanal y la **compra dividida** entre 2 súper cuando el ahorro supera el envío extra.
- **Sugerencias:** frecuencia de compra por producto ("la comprás cada ~21 días, hace 23 que no").
- **Historial de precios:** alerta si el precio de lista subió antes de una oferta.

Supuesto: el cálculo usa los precios de hoy para toda la semana (no predice precios); lo que cambia por día son las promos bancarias.

### Carrito

- **VTEX:** `/checkout/cart/add?sku=..&qty=..&seller=1[&sku=..&qty=..&seller=..]&sc=..` — se abre en el navegador del usuario, que ya está logueado en el súper.
- **Coto:** no hay un link público para cargar varios productos; la app muestra la lista con links a cada producto.
- La app **nunca** guarda credenciales del súper ni datos de tarjeta y **nunca** paga: el usuario revisa y paga en el sitio. Después, "Ya compré" registra el pedido (y con eso el tope consumido).

### Datos de ejemplo

- *Promos → Cargar ejemplos (ficticios)* carga 4 promos **FICTICIAS**, marcadas como tales en la UI. No son promos reales: hay que cargar o confirmar las reales.
- Los costos de envío iniciales también son de ejemplo (aviso en la UI hasta que se guardan en *Ajustes*).
- *Ajustes → Modo demo* usa los precios de los fixtures (ficticios) sin consultar los súper.

## Estado del smoke (MVP)

`npm run smoke` se escribió y se probó contra los fixtures (`npm run smoke -- --fixtures` → 4/4 súper encuentran productos por EAN), pero **no se pudo correr contra los sitios reales** desde el entorno donde se desarrolló el MVP:
la política de red de ese sandbox bloquea `jumbo.com.ar`, `vea.com.ar`, `carrefour.com.ar` y `cotodigital.com.ar` (el proxy responde `403` al `CONNECT`, y sin proxy no resuelve DNS). Resultado registrado:

```
❌ Jumbo / Vea / Carrefour / Coto — sin acceso de red al sitio (getaddrinfo ENOTFOUND / CONNECT 403)
0/4 súper encontraron al menos un producto por EAN.
```

Por eso, además:

- los fixtures de `tests/fixtures/` están **reconstruidos** siguiendo el formato conocido de cada API, no capturados (ver `tests/fixtures/README.md`);
- los endpoints de VTEX y de Coto, el `sc` por súper y el formato del link de carrito están implementados según la documentación/uso conocido de esas plataformas, pero **falta confirmarlos en vivo**.

**Pendiente** (desde una máquina con acceso a los sitios):

1. `npm run smoke` y revisar `smoke-reporte.json`.
2. `npm run fixtures:capturar && npm test`; si algún parser falla, ajustar el adaptador.
3. Confirmar el `sc` de cada súper para tu zona y probar un link de carrito con la sesión iniciada.
4. Si algún sitio bloquea requests de servidor (Cloudflare/WAF), documentarlo acá; para Coto, si `format=json` dejara de funcionar, el plan B es parsear el HTML de la búsqueda.
