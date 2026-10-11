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
scripts/        smoke.js, capturar-fixtures.js, diagnostico-sitios.js, generar-iconos.js
tests/          tests unitarios (node:test) + fixtures/ (respuestas reales capturadas)
.github/        CI: tests, build, smoke real y captura de fixtures
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm install` | Instala dependencias (Node ≥ 20). |
| `npm run dev` | Vite en `localhost:5173`, con `/api` montado en el mismo server (no hace falta `vercel dev`). |
| `npm test` | Tests del motor (topes, días, envío, compra dividida, rubros), promos, normalización, matching, scrapers contra fixtures, caché y carrito. |
| `npm run smoke` | Pega a los sitios reales con 3 productos conocidos y reporta qué funciona (`smoke-reporte.json`). `npm run smoke -- --fixtures` prueba el script sin red. También corre en CI. |
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

La zona está fija en `lib/zona.js`: **Arizu 127, Godoy Cruz, Mendoza (CP 5501)**. Precio y stock dependen de la sucursal
que entrega en la dirección, así que cada súper VTEX consulta solo esa sucursal: el adaptador manda la cookie
`vtex_segment` con `regionId = base64("SW#<seller>;<seller>…")`, lo mismo que hace el sitio al elegir la dirección.

| Súper | Sucursal que hace envío a domicilio (verificado el 11/10/2026) |
|---|---|
| Jumbo | `jumboargentinaj5222mendoza`: Jumbo Godoy Cruz, Balcarce 897 |
| Vea | `jumboargentinav171sarmientoyalen`: Vea Godoy Cruz, Sarmiento 998 |
| Carrefour | `carrefourar0029` (Hiper Mendoza Azul) y `carrefourar0899` (Hogar & Electro) |
| Coto | **No entrega en Mendoza.** Queda fuera de las comparaciones; el adaptador sigue disponible con `?supers=coto` |

- Cómo se verificó: simulando el checkout con las coordenadas de Godoy Cruz
  (`POST /api/checkout/pub/orderForms/simulation` con `geoCoordinates` y `seller`). Solo esas sucursales ofrecen
  "Envío a Domicilio"; las demás de Mendoza son solo retiro. Las diferencias de precio con Buenos Aires son reales
  (p. ej., yerba Playadito suave 1 kg en Jumbo: $5.208 en Palermo y $4.925 en Godoy Cruz).
- **El código postal no alcanza:** en Vea `/api/checkout/pub/regions?postalCode=..` devuelve las mismas regiones
  (todas sus sucursales) para cualquier CP. Por eso se fijan las sucursales en vez de resolverlas.
- `sc` (sales channel) por súper, configurable con `VTEX_SC_*`: **Jumbo 32, Vea 34, Carrefour 1** (en Jumbo y Vea
  `sc=1` responde `400 "sc is inactive"`).
- La API y la app usan `ZONA.supers` (Jumbo, Vea, Carrefour): búsquedas, precios, lista libre, recomendación,
  costos de envío y promos sugeridas.
- **Para cambiar de dirección:** en el sitio del súper, elegir la dirección de entrega y mirar en DevTools el
  `selectedSeller` que se manda a `/api/sessions`; actualizar `lib/zona.js`.
- El link de carrito abre el sitio del súper: ahí hay que tener elegida la misma dirección para que el carrito
  quede en la sucursal correcta.

### Motor de promociones y recomendación (`lib/motor`, puro y testeado)

- **Góndola:** NxM (2x1, 3x2), 2da unidad al X%, X% off (opcionalmente "llevando N").
- **Bancarias:** colección `promos` editable en la pestaña *Promos*. Aplica por súper + medio + día + vigencia; respeta `minimoCompra`, `rubrosExcluidos` y el **tope ya consumido** en el período (`por_compra`, `semanal` lunes–domingo, `mensual` calendario) según el historial de pedidos. No se acumulan entre sí: se toma la mejor.
- **Recomendación:** para cada uno de los próximos 7 días × súper de la zona × 6 medios calcula subtotal con góndola, descuento bancario con tope, envío (configurable por súper con mínimo para envío gratis) y faltantes. Ordena por menos faltantes, menor total y fecha más próxima. Muestra la mejor opción ("Comprá el *jueves* en *Carrefour* con *MODO Macro*: $X (ahorrás $Y frente a la opción más cara y $Z frente a comprar hoy)"), un ranking, el calendario semanal y la **compra dividida** entre 2 súper cuando el ahorro supera el envío extra.
- **Sugerencias:** frecuencia de compra por producto ("la comprás cada ~21 días, hace 23 que no").
- **Historial de precios:** alerta si el precio de lista subió antes de una oferta.

Supuesto: el cálculo usa los precios de hoy para toda la semana (no predice precios); lo que cambia por día son las promos bancarias.

### Lista escrita (lista libre)

En una lista, "Escribí tu lista" acepta un producto por renglón ("2 yerba playadito", "leche entera", "arroz 1kg", "coca cola x2").
`POST /api/resolver` busca cada renglón en los súper de la zona y `lib/motor/listaLibre.js` elige un producto por súper:

1. solo productos disponibles cuyo nombre/marca tenga todas las palabras (tolera plurales);
2. si el renglón pide presentación ("1kg", "2.25"), solo esa;
3. si un mismo EAN está en varios súper, ese (compara lo mismo);
4. si no, la presentación más común y, dentro de ella, la más barata.

Cada ítem queda con el producto elegido en cada súper (se puede cambiar o excluir un súper). La recomendación prioriza
el súper que tiene **toda** la lista y, si hay uno más barato al que le falta un producto, lo avisa aparte.

### Promos sugeridas

`lib/promosSugeridas.json` tiene promos relevadas de fuentes oficiales (bna.com.ar y semananacion.com.ar del BNA), con el
texto y el link de la fuente. Aparecen en *Promos* como "Promos encontradas": **no cuentan hasta que el usuario las confirma**
(los datos que no salen de la fuente oficial están aclarados en las notas). Macro no publica sus promos en una fuente abierta
(su API pide API key), así que esas se cargan a mano.

Las promos marcadas como **solo presenciales** (por ejemplo, Coto + MODO BNA+: "no aplica para comprar online") se muestran
pero el motor no las aplica, porque la app calcula compras con envío a domicilio.

**Aviso semanal:** `.github/workflows/promos.yml` corre los lunes a las 8:00 (ART) y `npm run promos:relevar` lee
bna.com.ar y semananacion.com.ar para los 4 súper, interpreta % / días / tope / mínimo / vigencia / "solo presencial"
(días y vigencia de los términos y condiciones) y lo compara con `lib/promosSugeridas.json`. Si el texto de alguna fuente
cambió desde el último relevamiento, abre un **issue** en el repo con el detalle y las diferencias; si no, no hace nada.
El cron de GitHub solo corre desde la rama por defecto: empieza a funcionar cuando esto esté en `main`
(también se puede correr a mano desde *Actions → Promos → Run workflow*).

### Carrito

- **VTEX:** `/checkout/cart/add?sku=..&qty=..&seller=1[&sku=..&qty=..&seller=..]&sc=..` — se abre en el navegador del usuario, que ya está logueado en el súper.
- **Coto:** no hay un link público para cargar varios productos; la app muestra la lista con links a cada producto.
- La app **nunca** guarda credenciales del súper ni datos de tarjeta y **nunca** paga: el usuario revisa y paga en el sitio. Después, "Ya compré" registra el pedido (y con eso el tope consumido).

### Datos de ejemplo

- *Promos → Cargar ejemplos (ficticios)* carga 4 promos **FICTICIAS**, marcadas como tales en la UI. No son promos reales: hay que cargar o confirmar las reales.
- Los costos de envío iniciales también son de ejemplo (aviso en la UI hasta que se guardan en *Ajustes*).
- *Ajustes → Modo demo* usa los precios de los fixtures (captura real del 11/10/2026, no se actualizan) sin consultar los súper.

## Estado del smoke (MVP)

`npm run smoke` corre en CI (job `smoke` de GitHub Actions, que sí tiene acceso a los sitios) en cada push.
Resultado contra los sitios reales el 11/10/2026:

```
✅ Jumbo      coca cola 2.25 → EAN 7790895000997 Gaseosa Cola Sabor Original 2.25 Lts Coca Cola — $5930
✅ Vea        coca cola 2.25 → EAN 7790895000997 Gaseosa Cola Sabor Original 2.25 Lts Coca Cola — $5990
✅ Carrefour  coca cola 2.25 → EAN 7790895000997 Gaseosa cola Coca Cola sabor original 2,25 lts — $6000
✅ Coto       coca cola 2.25 → EAN 7790895000997 Gaseosa Coca-Cola Sabor Original 2,25 Lt — $5100
4/4 súper encontraron al menos un producto por EAN.
```

(Los 3 productos de prueba —Coca-Cola 2,25 L, yerba Playadito 1 kg y leche La Serenísima— se encontraron por EAN en los súper de la zona;
el reporte completo queda como artefacto del job.)

Lo que se ajustó gracias al smoke real:

- Jumbo y Vea rechazan `sc=1`: su sales channel es 32 y 34.
- Jumbo y Vea devuelven un `ListPrice` inflado (≈ precio sin IVA × 100); el precio "sin descuento" confiable es `PriceWithoutDiscount`.
- Carrefour publica teasers atados a tarjetas ("Tarjeta Carrefour 15%", con `RestrictionsBins`): no se toman como promo de góndola.
- Coto no encuentra EAN buscando el código como texto: `porEan` filtra `product.eanPrincipal` con `Nr=AND(...)` de Endeca.

Notas:

- Desde el sandbox donde se desarrolló el MVP no hay acceso de red a esos dominios (proxy `403`), por eso el smoke se corre en CI.
- El formato del link de carrito se verificó contra el `addToCartLink` que devuelve la propia API de VTEX (`/checkout/cart/add?sku=..&qty=1&seller=1&sc=32`).
  Falta probarlo con una sesión iniciada en cada súper.
- Coto no tiene un link público para cargar varios productos al carrito: la app muestra la lista con links a cada producto.
