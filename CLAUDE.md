# Compras Inteligentes — asistente de compras de supermercado

App personal de Santi para armar listas de compras, comparar precios entre supermercados con entrega a domicilio y recomendar **cuándo, dónde y con qué medio de pago** comprar para ahorrar lo máximo posible.

Idioma de la UI y del código (comentarios, nombres visibles): español rioplatense.

## Supermercados

| Súper     | Sitio                       | Plataforma               |
|-----------|-----------------------------|--------------------------|
| Jumbo     | https://www.jumbo.com.ar    | VTEX (Cencosud)          |
| Vea       | https://www.vea.com.ar      | VTEX (Cencosud)          |
| Carrefour | https://www.carrefour.com.ar| VTEX                     |
| Coto      | https://www.coto.com.ar     | Plataforma propia (investigar) |

## Medios de pago del usuario

Solo estos, y ningún otro:

- MODO BNA
- MODO Macro
- Visa BNA
- Mastercard BNA
- Visa Macro
- Mastercard Macro

## Stack

- **Frontend:** PWA mobile-first (instalable desde el navegador). Vite + vanilla JS o Preact, lo más liviano posible.
- **Backend:** funciones serverless en Vercel (`/api/*`). El scraping se hace en el server, porque desde el navegador CORS lo bloquea.
- **Datos:** Firebase (Auth con Google + Firestore).
- **Cron:** Vercel Cron, una vez por día, para refrescar los precios de los productos que el usuario tiene en listas o en el historial.

## Funcionalidades

### 1. Listas e historial

- Crear, editar y duplicar listas (por ejemplo "Compra mensual" o "Reposición semanal").
- Buscar productos por nombre. La búsqueda consulta los 4 súper y unifica resultados por **EAN**.
- Guardar cada pedido realizado (fecha, súper, medio de pago, ítems, total).
- **Sugerencias inteligentes:** calcular la frecuencia de compra de cada producto a partir del historial y sugerirlo cuando "toca" (por ejemplo: "la yerba la comprás cada ~21 días, hace 23 que no").

### 2. Scraping de precios

- Un adaptador por súper con una interfaz común:
  - `buscar(texto)` → productos
  - `porEan(ean)` → producto
  - el producto tiene esta forma: `{ ean, nombre, marca, precioLista, precioOferta, promoGondola, unidad, contenido, url, imagen, sku, disponible }`
- **VTEX (Jumbo, Vea, Carrefour):** usar la API pública de catálogo, por ejemplo `/api/catalog_system/pub/products/search?ft=<texto>` y búsqueda por EAN. Antes de implementar, verificar los endpoints reales y cómo se fija la zona o sucursal de entrega (sales channel / region / código postal), porque el precio y el stock pueden variar según la zona.
- **Coto:** investigar cómo expone los datos (buscar un endpoint JSON antes de parsear HTML).
- Normalizar el precio por unidad de medida ($/kg, $/l, $/unidad) para comparar presentaciones distintas.
- Matching entre súper por EAN. Si un producto no tiene EAN, usar matching difuso por nombre + marca + contenido y pedirle confirmación al usuario la primera vez (guardar el match confirmado).
- Cachear en Firestore con fecha. No pedir dos veces el mismo producto en menos de X horas. Agregar rate limiting y un User-Agent razonable. Es uso personal y de bajo volumen: no martillar los sitios.
- Guardar el **historial de precios** por producto y súper, para detectar subas previas a una promo.

### 3. Motor de promociones

- **Promos de góndola** (2x1, 2da unidad al X%, X% off): salen del scraping del producto.
- **Promos bancarias:** colección `promos` en Firestore, editable desde la UI, con este esquema:
  ```
  {
    super: "jumbo" | "vea" | "carrefour" | "coto",
    medio: "modo_bna" | "modo_macro" | "visa_bna" | "master_bna" | "visa_macro" | "master_macro",
    dias: [0-6],                 // días de la semana
    porcentaje: number,
    tope: number | null,         // tope de reintegro/descuento en $
    tipoTope: "por_compra" | "semanal" | "mensual",
    tipo: "descuento_caja" | "reintegro",
    minimoCompra: number | null,
    vigenciaDesde, vigenciaHasta,
    rubrosExcluidos: [string],
    notas: string
  }
  ```
- Cargar un seed de ejemplo con datos **ficticios**, claramente marcados como tales. No inventar promos reales: el usuario las carga o confirma.
- Tener en cuenta el tope ya consumido en el período (a partir del historial de pedidos).

### 4. Recomendación (la parte central)

Dada una lista, calcular para **cada uno de los próximos 7 días**, cada súper y cada medio de pago:

- el subtotal con promos de góndola,
- el descuento bancario aplicado, respetando el tope,
- el costo de envío (configurable por súper, con monto mínimo para envío gratis),
- los productos faltantes o sin stock.

Mostrar:

- **La mejor opción** con el texto: "Comprá el *jueves* en *Carrefour* con *MODO Macro*: $X (ahorrás $Y frente a la opción más cara / frente a hoy)".
- Un ranking de alternativas.
- Una opción de **compra dividida** entre 2 súper, cuando el ahorro supere el envío extra.
- Una vista calendario semanal con el total óptimo de cada día.

La lógica tiene que ser **pura y testeable** (`/lib/motor`), sin dependencias del scraping.

### 5. Armado del carrito

- Para los súper VTEX, generar el link para agregar al carrito en el sitio del súper, por ejemplo `/checkout/cart/add?sku=..&qty=..&seller=1&sc=..` (verificar el formato real), y abrirlo en el navegador del usuario, que ya está logueado ahí.
- Para Coto, investigar si existe algo equivalente. Si no, mostrar la lista con links a cada producto.
- **Nunca** guardar credenciales del súper ni datos de tarjeta. **Nunca** pagar automáticamente. El usuario confirma y paga en el sitio del súper.
- Después de comprar, botón "Ya compré": registra el pedido en el historial.

## Estructura sugerida

```
/api            serverless (buscar, producto, refrescar, carrito)
/lib/scrapers   vtex.js, coto.js, normalizar.js, matching.js
/lib/motor      promos.js, recomendacion.js
/src            PWA
/tests          unit tests + fixtures JSON de respuestas reales guardadas
```

## Calidad

- Tests unitarios del motor de recomendación con casos que incluyan topes, días, envío y compra dividida.
- Tests de los scrapers contra **fixtures guardados** (respuestas reales capturadas una vez), para no depender de la red.
- Un script `npm run smoke` que pegue a los sitios reales con 2 o 3 productos conocidos y reporte qué funciona.
- Un README con el setup: Firebase, variables de entorno, deploy en Vercel.

## Definición de terminado (MVP)

1. `npm test` pasa.
2. `npm run smoke` encuentra al menos un producto por EAN en cada uno de los 4 súper, o documenta en el README por qué no en alguno.
3. Se puede crear una lista, ver la recomendación de 7 días con las promos cargadas y generar el link de carrito para al menos un súper VTEX.
4. `npm run build` compila sin errores y la PWA es instalable.
