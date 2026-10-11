# Fixtures de los scrapers

| Archivo | Endpoint que imita |
|---|---|
| `vtex-jumbo-busqueda.json` | `https://www.jumbo.com.ar/api/catalog_system/pub/products/search` |
| `vtex-vea-busqueda.json` | `https://www.vea.com.ar/api/catalog_system/pub/products/search` |
| `vtex-carrefour-busqueda.json` | `https://www.carrefour.com.ar/api/catalog_system/pub/products/search` |
| `coto-busqueda.json` | `https://www.cotodigital.com.ar/sitios/cdigi/categoria?...&format=json` |

> ⚠️ **Estos fixtures están reconstruidos a mano, no son capturas reales.**
> El entorno donde se escribió el MVP no tenía acceso de red a los sitios de
> los súper, así que se armaron siguiendo el formato conocido de cada API
> (VTEX legacy catalog y Oracle Commerce/Endeca de Coto). Los EAN, SKU y
> **precios son ficticios**.
>
> Para reemplazarlos por respuestas reales, desde una máquina con acceso:
>
> ```bash
> npm run fixtures:capturar && npm test
> ```
>
> Si algún test falla después de capturar, el formato real difiere en algo:
> ajustar el adaptador (`lib/scrapers/vtex.js` o `coto.js`) y, si hace falta,
> los asserts que dependen de datos puntuales (EAN o promos de ejemplo).

Los fixtures también alimentan el **modo demo** de la app (`SCRAPERS_FIXTURES=1`
o la opción "Modo demo" en Ajustes), con `lib/scrapers/fixtures.js`, que filtra
los resultados como lo haría el sitio (por texto, `fq=alternateIds_Ean:` o `fq=skuId:`).
