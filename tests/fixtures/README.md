# Fixtures de los scrapers

Respuestas **reales** capturadas el 11/10/2026 por `npm run fixtures:capturar`
(desde GitHub Actions; ver `.github/workflows/ci.yml`). Se guardan tal cual
llegaron, solo recortando campos que los adaptadores no usan (descripciones
largas, clusters, especificaciones, `sDisp_*` de Coto) para que no pesen megas.

| Archivo | Endpoint | Búsquedas |
|---|---|---|
| `vtex-jumbo-busqueda.json` | `https://www.jumbo.com.ar/api/catalog_system/pub/products/search?ft=..&sc=32` | coca cola 2.25, yerba playadito, leche la serenisima entera, arroz gallo oro, aceite natura, fernet branca (2 resultados c/u) |
| `vtex-vea-busqueda.json` | `https://www.vea.com.ar/...&sc=34` | ídem |
| `vtex-carrefour-busqueda.json` | `https://www.carrefour.com.ar/...&sc=1` | ídem |
| `coto-busqueda.json` | `https://www.cotodigital.com.ar/sitios/cdigi/categoria?Dy=1&Ntt=..&Nrpp=2&format=json` | ídem (registros juntados en una sola `ResultsList`) |

Para volver a capturarlos (por ejemplo si un súper cambia el formato):

```bash
npm run fixtures:capturar && npm test
```

o, en CI, hacer un commit con `[capturar]` en el mensaje: el job `smoke` los
captura y los commitea en la rama.

Los fixtures también alimentan el **modo demo** de la app (`SCRAPERS_FIXTURES=1`
o "Modo demo" en Ajustes) a través de `lib/scrapers/fixtures.js`, que filtra
como lo haría el sitio (VTEX: `ft`, `fq=alternateIds_Ean:`, `fq=skuId:`;
Coto: `Ntt` por texto y `Nr=AND(atributo:valor)`).

Los casos borde que no aparecen en la captura (pesables, teasers con BINs,
descuentos "Tarjeta Coto") se prueban con datos sintéticos explícitos dentro
de los tests.
