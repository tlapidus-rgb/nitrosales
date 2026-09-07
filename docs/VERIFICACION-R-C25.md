# R-C25 — Verificación en preview: el revenue de Gold sólo se corregía hacia arriba

> Branch `hotfix/gold-attribution-huerfanas` · commit `aaf41b81` · 2026-09-06
> Preview: `nitrosales-6ypq56szu` (base Neon **aislada** de la branch, creada por la
> integración de Vercel — se verificó en Settings → Environment Variables que hay un
> `DATABASE_URL` scopeado a `hotfix/gold-attribution-…`. Producción NO se tocó.)

## Qué se arregló

`gold_attribution_source` y `gold_attribution_channel` eran los únicos dos de los seis
rollups Gold que hacían `INSERT … ON CONFLICT DO UPDATE` **puro**, sin borrar las filas
que el upsert ya no emite. Los otros cuatro usan `buildDeleteOrphans` (`affected-days.ts`).

Consecuencia: el revenue **sólo podía subir**. Dos casos reales:

- Una venta se **cancela**. Si era la única de su bucket (día, canal), el upsert deja de
  emitir esa fila y la vieja sobrevive con la plata vieja, para siempre.
- Se **edita una regla** en `/pixel/canales`. El bucket pasa de "TikTok Ads" a
  "TikTok Paid": nace la fila nueva y la vieja queda. Ese revenue se **duplica** y la
  serie histórica se parte en dos canales que son el mismo.

Y no era teórico: al 2026-09-06 `PIXEL_USE_GOLD`, `PIXEL_USE_CHANNELS` y
`PIXEL_USE_GOLD_CHANNEL` estaban los tres en `true` en Production — el panel **leía**
estas tablas.

## Lo que hizo que no fuera copiar y pegar

La ventana incremental filtraba por `o."orderDate" >= $2` con el instante **crudo**
(el cron pasa `ahora − 4 días`, o sea con hora). Pero el rollup agrupa por día en zona
AR. Con la hora cruda el día del borde se recomputaba **parcialmente**.

Eso ya era un bug con el upsert solo (bucket subvaluado), y volvía **imposible** agregar
el DELETE: un canal cuyas órdenes de ese día fueran todas anteriores a la hora de corte
no se re-emitía, y el borrado se lo habría llevado — perdiendo plata **real**. Por eso la
ventana ahora se trunca al inicio del día argentino, y recién ahí "no re-emitido"
significa "ya no existe".

## Evidencia en el preview (base aislada = copia de prod)

### 1. Idempotencia y no-destrucción — 3 pasadas incrementales

| Pasada | `gold_attribution_source` | `gold_attribution_channel` (EMDJ / TVC / Arredo) | Huérfanas |
|---|---|---|---|
| 1 | 272 filas | 71 / 44 / 160 | 0 |
| 2 | 272 filas | 71 / 44 / 160 | 0 |
| 3 | 272 filas | 71 / 44 / 160 | 0 |

El conteo no se mueve y el DELETE nunca se come lo que el upsert acaba de escribir.
Es la propiedad crítica: `$3` sale de `SELECT now()` de la **base**, no de `new Date()`
de la app, y corre en la **misma transacción** que el upsert.

### 2. Cuánta basura hay en producción hoy — `?full=1` (recomputa toda la historia)

| Tabla | Filas totales | **Huérfanas borradas** | % de la tabla |
|---|---|---|---|
| `gold_attribution_source` | 12.502 | **672** | **5,4 %** |
| `gold_attribution_channel` | 12.183 | **26** (todas de TeVe Compras) | 0,2 % |

**Esto es el hallazgo, no el test.** Producción tiene ~698 filas fantasma sumando
revenue que ya no existe, y el panel las venía leyendo. La segunda pasada de `full=1`
da 0 en las dos tablas: converge y se queda quieto.

### 3. Costo del backfill de limpieza

`full=1` tarda 21 s (channel, 3 orgs) y 10-21 s (source) — muy por debajo del cap de
300 s. La limpieza post-merge es **una sola invocación de cada endpoint**, sin cursor.

## Tests

`src/data/gold/gold-attribution-huerfanas.test.ts` — 5 casos con PGlite (Postgres real
en proceso), no assertions sobre strings de SQL:

- venta cancelada → la fila del bucket que ya no existe se borra;
- cancelación parcial → el monto baja (camino que ya andaba, para que el DELETE no lo rompa);
- regla de canal renombrada → no quedan las dos filas conviviendo;
- **venta anterior a la hora de corte → NO se borra** (el que impide el arreglo ingenuo);
- días fuera de la ventana → ni se recomputan ni se borran.

Verificado que fallan sin el fix: neutralizar el DELETE rompe los 2 casos de bug;
revertir el truncado al día AR rompe el de "no borra revenue real".

`tsc` exit 0 · `vitest` 401 passed · `next build` exit 0.

## Mergeado y ejecutado en producción — 2026-09-06

Mergeado a `main` con fast-forward (`9ad4616d` → `8b8063db`) y deployado. Antes de tocar nada se
confirmó que el código nuevo estuviera vivo con un discriminador confiable: el campo
`huerfanasBorradas` no existe en la respuesta del código viejo. La primera consulta post-push
todavía servía el build anterior — vale la pena esperar el "Ready" en vez de asumir.

### La limpieza (`?full=1`, una sola invocación por endpoint)

| Tabla | Filas | **Huérfanas borradas** |
|---|---|---|
| `gold_attribution_source` | 12.507 | **673** |
| `gold_attribution_channel` | 12.189 | **27** (26 TeVe Compras · 1 Arredo) |

**700 filas fantasma salieron de producción.** Eran revenue que ya no existía y que el panel venía
sumando desde que se prendió `PIXEL_USE_GOLD`.

### Convergencia verificada

La segunda pasada de `?full=1` da **0 huérfanas en las dos tablas**, y el incremental (lo que corre
el cron cada 30 min) también. O sea que la limpieza es de una sola vez: de acá en más el cron
mantiene las tablas correctas solo.

### Consecuencia visible

**Los totales de atribución del panel bajaron** para las tres orgs con datos. No es una regresión:
es la plata que sobraba. Si alguien lo reporta como bug, es esto.
