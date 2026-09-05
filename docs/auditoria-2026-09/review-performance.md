# Auditoría de PERFORMANCE Y ESCALA — NitroSales

**Commit auditado:** `9ad4616d` (= `origin/main` = producción, `app.nitrosales.ai`)
**Fecha:** 2026-09-02 · **Alcance:** solo lectura. No se ejecutó una sola query contra prod, no se tocó ningún archivo del repo.
**Vara usada:** `CLAUDE.md` REGLA #3b (checklist anti-página-en-blanco) + los incidentes registrados en `CLAUDE_STATE.md` y `BACKLOG_PENDIENTES.md`.

**Escala de referencia (de `CLAUDE_STATE.md`):** Arredo `cmohl80fx…` = 24M `pixel_events` / 43 GB, 1,3M eventos/semana, 1,2M visitantes, 252.701 órdenes. El Mundo del Juguete `cmmmga1uq…` = "la org grande" en atribuciones. Neon Max 4 CU (16 GB RAM), autosuspend 5 min. Working set medido ~28 GB contra cache de 16 GB.

> **Nota metodológica sobre los costos.** No pude correr `EXPLAIN`. Toda estimación de costo se apoya en: (a) el tamaño de tabla documentado, (b) el inventario de índices reales que reconstruí cruzando `prisma/schema.prisma` + `ensure-indexes` + `ensure-coherence-indexes` + `create-attribution-iphash-index`, y (c) los tiempos ya medidos y anotados en el propio repo. Donde no tengo ninguna de las tres, lo marco **ESTIMADO**.

---

## Resumen de hallazgos

| Sev | # | Título corto |
|---|---|---|
| 🔴 CRITICAL | C1 | Tormenta permanente de rollups: GitHub Actions ×6 + Vercel cron, cada 15 min |
| 🔴 CRITICAL | C2 | `warm-cache` aborta a los 20s pero el compute sigue vivo → herd de computes huérfanos |
| 🔴 CRITICAL | C3 | El `warm-cache` calienta una cache key que `/pixel/analytics` nunca lee |
| 🔴 CRITICAL | C4 | 28 queries en un solo `Promise.all` sin aislamiento: una falla = dashboard en CERO |
| 🔴 CRITICAL | C5 | Ingesta: `LIKE '%…%'` sobre JSONB de 24M filas en cada evento PURCHASE |
| 🔴 CRITICAL | C6 | `/api/metrics/products`: dos queries de historia COMPLETA, `maxDuration=60`, medido ~58s |
| 🟠 HIGH | H1 | `statement_timeout=150000` >> `maxDuration` de casi todas las rutas → queries zombie |
| 🟠 HIGH | H2 | `/api/metrics/orders`: cache fresh-only sin lock + retry ×3 del frontend = stampede |
| 🟠 HIGH | H3 | Un click en el tab VTEX/MELI desactiva TODA la capa Gold de `/pedidos` |
| 🟠 HIGH | H4 | Funnel por canal: cobertura mal chequeada + fallback en vivo 18s [YA CONOCIDO] |
| 🟠 HIGH | H5 | 13 de los ~17 índices reales NO están en `schema.prisma` → `db:push` los borra |
| 🟠 HIGH | H6 | `/api/metrics/pnl`: 14 queries paralelas, sin `maxDuration`, sin cache, sin aislamiento |
| 🟠 HIGH | H7 | `api_cache` nunca se purga y su key crece por día → basura permanente en Neon |
| 🟠 HIGH | H8 | El dashboard dispara 5-8 endpoints en paralelo desde el browser, sin cota |
| 🟠 HIGH | H9 | `/discrepancy`: 4 queries que desanidan JSONB, sin Gold, sin cache, sin `maxDuration` |
| 🟠 HIGH | H10 | `ensureColumns()` corre DDL con lock exclusivo sobre `orders` en cada cold start |
| 🟡 MEDIUM | M1-M13 | Ver sección |
| 🟢 LOW | L1-L4 | Ver sección |

**Lo que NO encontré (y buscué):** no hay fuga de datos entre orgs por cache key. Las 7 keys de cache del repo (`pixel`, `orders`, `products`, `metrics`, `trends`, `seo`, `journeys`) incluyen `orgId` como primer componente, y `api_cache.cache_key` es el string completo. Es correcto y está testeado (`cache-key.ts` + `pixel-cache-key.test.ts`).

---

# 🔴 CRITICAL

## C1 — Tormenta permanente de rollups: el pipeline de `pixel_events` se dispara ~7 veces cada 15 minutos

**Severidad:** CRITICAL
**Archivos:** `.github/workflows/keep-pixel-rollups-fresh.yml:18-44` · `vercel.json:126-129` · `src/app/api/cron/refresh-pixel-rollups/route.ts:141` (`INVOCATION_BUDGET_MS = 250_000`) · `src/lib/pixel/rollup-backfill.ts:36-49` (cliente dedicado con `statement_timeout=500000`)

**Qué está mal.** El mismo endpoint pesado se dispara desde dos schedulers independientes que no se conocen entre sí:

- **GitHub Actions**, cada 15 min (`cron: "*/15 * * * *"`), y dentro de cada corrida un `for i in 1 2 3 4 5 6` que pega **6 veces seguidas** a `/api/cron/refresh-pixel-rollups`, con `-m 290` cada una. Después, un hit extra a `warm-cache`.
- **Vercel cron**, también cada 15 min (`3,18,33,48 * * * *`), 1 hit.
- **`warm-cache` self-heal** (`src/app/api/cron/warm-cache/route.ts:118-146`), que puede disparar un hit más cuando ve una tabla ≥2,5h atrasada.

Cada hit consume hasta 250s reconstruyendo **una tabla de rollup para TODAS las orgs** con agregación HLL sobre `pixel_events` (`rollup-backfill.ts:186-347`). Las dos más caras (`source` y `funnel`) además hacen `LEFT JOIN pixel_visitor_first_source` (3,9M filas según el comentario de `rollup-backfill.ts:31`).

**Costo estimado y sobre qué volumen.** 7 invocaciones × hasta 250s = **hasta 1.750 segundos de scan pesado sobre una tabla de 43 GB, dentro de una ventana de 900 segundos**. Es decir: en régimen permanente hay ≥2 escaneos concurrentes de `pixel_events`, 24/7. Con el `concurrency` de GitHub Actions los *workflows* se serializan, pero nada impide que el hit de GH y el de Vercel caigan en el mismo minuto — y como ambos eligen "la tabla más atrasada" (`refresh-pixel-rollups/route.ts:238-260`), **eligen la misma tabla y ejecutan el mismo statement HLL de 250s dos veces**. Para `channel` es peor: hay un `DELETE` seguido de `INSERT` (`rollup-backfill.ts:363-372`) sin lock, o sea una carrera real.

**Por qué es CRITICAL y no HIGH.** Esto es, mecánicamente, la causa de que el working set del dashboard nunca quede caliente. El diagnóstico de `BP-NEON-CAPACITY` fue correcto ("el cuello es memoria/cache, hit rate 44%") pero se atacó del lado de la oferta (2 CU → 4 CU) sin tocar la demanda: hay un proceso que barre 43 GB de forma continua y desaloja de la cache local justo las páginas que la pantalla del cliente necesita. Subir a 8 CU compraría tiempo; esto lo compra de nuevo cada vez que el cliente crece.

**Pantalla afectada:** todas, por contención de DB. Se manifiesta primero en `/pixel/analytics` (la que más depende de páginas calientes) y en los mails de frescura al cliente que ya se documentaron en `PROJECT-HANDOFF.local.md:37`.

**Reparación de menor riesgo (no implementada):** dejar UN solo scheduler. El workflow de GH se agregó como red porque Vercel dejó de disparar; con la red puesta, el cron de `vercel.json` es redundante. Y el `for 1..6` debería ser `for 1..2`: la rotación ya elige la tabla más atrasada, seis hits seguidos solo garantizan que siempre haya trabajo pesado en vuelo.

---

## C2 — `warm-cache` aborta el fetch a los 20s pero el compute del servidor sigue vivo: herd de computes huérfanos

**Severidad:** CRITICAL
**Archivos:** `src/app/api/cron/warm-cache/route.ts:244` (`PER_FETCH_TIMEOUT_MS = 20_000`), `:247` (`TIME_BUDGET_MS = 220_000`), `:268` (`signal: AbortSignal.timeout(...)`) · `src/app/api/metrics/pixel/route.ts:141-155` (rama `isWarm`, **sin race**) · `:1975-1979` (`waitUntil(missCompute)`)

**Qué está mal.** Los comentarios de las dos puntas se contradicen y el código sigue al peor de los dos.

`metrics/pixel/route.ts:135-140` dice, literalmente, que el warm corre **sin race** para que "el warm ESPERE cada compute (~120s), lo escriba en el cache y recién ahí siga → secuencial, sin solaparse". Pero `warm-cache/route.ts:268` **aborta cada fetch a los 20 segundos**. El warm no espera nada: aborta, lo anota como fallo y pasa al siguiente rango de inmediato.

Del lado del servidor, abortar el fetch no cancela nada:
1. Vercel no mata una función porque el cliente se desconecte.
2. Peor: `route.ts:1975` mete el compute en `waitUntil(...)`, que **explícitamente** mantiene viva la función después de responder.

**Costo estimado y sobre qué volumen.** Con presupuesto de 220s y abortos de 20s, una sola corrida de `warm-cache` puede lanzar **hasta 11 computes de `/api/metrics/pixel` que siguen corriendo en paralelo**, cada uno con 28 queries en un `Promise.all` (ver C4). Eso son **hasta ~300 queries concurrentes contra un pool de 24 conexiones** (`lib/db/client.ts:59`), con `pool_timeout=160`. Y `warm-cache` corre 4 veces cada 15 minutos (Vercel `*/5` = 3 + GitHub Actions = 1). El diseño "estrictamente secuencial, anti-thundering-herd" que describe el comentario de `warm-cache/route.ts:16-21` **no existe en el código**: es exactamente el herd que ese comentario dice haber eliminado.

**Pantalla afectada:** `/pixel/analytics` y `/products` (los dos endpoints que warmea), pero el daño es global — es el mismo pool y la misma DB.

---

## C3 — El `warm-cache` calienta una cache key que `/pixel/analytics` nunca lee

**Severidad:** CRITICAL
**Archivos:** `src/app/api/cron/warm-cache/route.ts:255-258` (arma `&model=${warmModelFor(...)}`) · `src/app/(app)/pixel/analytics/page.tsx:519` (`fetch('/api/metrics/pixel?from=…&to=…')`, **sin `model`**) · `src/lib/pixel/cache-key.ts:52` (`(params.model || "").toUpperCase() || "orgdefault"`)

**Qué está mal.** `buildPixelCacheKey` mete `model` en la key. El warm manda `&model=NITRO` → key `…:NITRO:…`. `/pixel/analytics` **no manda `model`** → key `…:orgdefault:…`. **Son dos entradas distintas de `api_cache`, y el cron solo llena una.**

El comentario del warm (`warm-cache/route.ts:203-207`) afirma "la UI SIEMPRE manda `&model=` (pixel/page.tsx:466)". Es cierto para `/pixel` (`app/(app)/pixel/page.tsx:368` sí lo manda) y **falso para `/pixel/analytics`**, que es justo la página que se caía y la que motivó todo el trabajo de rollups.

**Consecuencia en cadena.** Sin warm efectivo, cada usuario que abre `/pixel/analytics` después de 30 min de inactividad (fresh 5 min + stale 25 min, `api-cache.ts:31-35`) cae en cache-miss y paga el compute completo. Y el compute completo de las orgs grandes tarda >85s (el propio código lo dice en `route.ts:79-85`), así que la race de `GLOBAL_TIMEOUT_MS = 85000` (`route.ts:86`) gana y **devuelve `buildEmptyMockResponse()`: la página entera en CERO, con HTTP 200**.

**Costo estimado y sobre qué volumen.** El warm gasta hoy 32 fetches por corrida × 4 corridas / 15 min para llenar entradas `NITRO` que solo consume `/pixel`; el 100% del trabajo dirigido a `/pixel/analytics` se tira. Y el cliente ve ceros. **ESTIMADO** (no puedo medir la tasa real de miss), pero el mecanismo es determinista y verificable leyendo las dos líneas.

**Pantalla afectada:** `/pixel/analytics` — KPIs, funnel, atribución, todo en $0 / 0 visitantes.

**Fix de una línea:** agregar `&model=${apiModel}` en `analytics/page.tsx:519`, o sacar `model` del warm. Cualquiera de las dos alinea las keys.

---

## C4 — 28 queries en un solo `Promise.all` sin aislamiento: una sola falla deja el dashboard en CERO

**Severidad:** CRITICAL
**Archivos:** `src/app/api/metrics/pixel/route.ts:325-365` (destructuring de 28 resultados) y `:365` (`] = await Promise.all([`) · catch final en `:1989-1996`
**Contraste:** `src/app/api/metrics/orders/route.ts:28-35` (`safeQuery`) — la ruta hermana **sí** tiene degradación parcial.

**Qué está mal.** Dos cosas a la vez:

1. **Viola REGLA #3b de forma frontal.** El checklist dice "Pool de conexiones = 8. Nunca más de 3 queries en paralelo por batch". Acá hay 28 en un solo batch (más 3 antes: `organization.findUnique` en `:233`, el `MIN(timestamp)` de `pixel_events` en `:271`, y las channel rules en `:296`; más 3 después: `loadProductSkuMap` en `:1290`, product purchases en `:1293`, category labels en `:1323`). **34 queries por compute.** `lib/db/client.ts:30-33` subió el pool a 24 para acomodar esto y dejó constancia de que el "8 histórico" quedó viejo — pero 28 > 24 igual, así que 4+ queries **esperan conexión** mientras las otras corren.

2. **`Promise.all`, no `Promise.allSettled`.** Una sola query que rechace (statement_timeout, error de plan, `hll` no disponible, tabla ausente) rechaza el batch entero, cae al catch de `:1989`, y devuelve `buildEmptyMockResponse()` con HTTP 200 → **todo el dashboard en cero**. Es exactamente el síntoma "Dashboard miente en cero" ya anotado en `BACKLOG_PENDIENTES.md` como parte de **[YA CONOCIDO: BP-PIXEL-AUDIT]**, pero ahí está catalogado como problema de honestidad; la causa mecánica es este `Promise.all`.

**Costo estimado y sobre qué volumen.** Con Gold ON (`PIXEL_USE_GOLD`) las 4 queries caras de atribución leen rollup. Con `PIXEL_USE_CHANNELS` ON —que es el estado que describe `PROJECT-HANDOFF.local.md:29` para el feature de Canales ya en prod— `useGoldSource = usePixelGold && !usePixelChannels` (`route.ts:311`) se vuelve **false**, y las queries #9/#20/#22/#29 vuelven a la rama Bronze que desanida `pa.touchpoints` con `jsonb_array_elements` (`route.ts:531`, `:770`, `:940`, `:1000`). La #29 es la peor: filtra `pa."organizationId" = X AND pa.model IN (4 modelos)` **sin acotar por fecha del lado de `pa`**, así que el planner puede arrancar por `pixel_attributions` y desanidar ~4× las atribuciones de toda la historia de la org antes de filtrar por `o."orderDate"`. Para Arredo (252k órdenes → del orden de 10⁵-10⁶ atribuciones × 4 modelos × ~2-4 touchpoints cada una) son **millones de filas de JSONB desanidadas para devolver ~40 filas**. El trade-off está documentado y aceptado en `route.ts:305-310` ("esas 4 queries pierden la perf del rollup Gold mientras los canales estén ON"), con `gold_attribution_channel` como fix — pero ese fix está detrás de `PIXEL_USE_GOLD_CHANNEL`, que por default está OFF.

**Pantalla afectada:** `/pixel/analytics` completa. Es el camino directo al timeout de 85s → mock en cero (ver C3).

---

## C5 — Ingesta del pixel: `LIKE '%…%'` sobre JSONB de 24M filas, en cada evento PURCHASE

**Severidad:** CRITICAL
**Archivos:** `src/app/api/pixel/event/route.ts:238-245` (`props: { path: ['orderId'], string_contains: orderIdBase }`) · `:283` y `:313` (`externalId: { contains: orderIdBase }` sobre `orders`)

```ts
const existing = await prisma.pixelEvent.findFirst({
  where: {
    organizationId: orgId,
    type: 'PURCHASE',
    props: { path: ['orderId'], string_contains: orderIdBase }   // ← LIKE '%…%'
  }
});
```

**Qué está mal.** Prisma traduce `string_contains` a `(props #>> '{orderId}') LIKE '%…%'`. No hay ningún índice sobre `props` (`prisma/schema.prisma:767-800`: los 4 índices declarados son sobre `type/timestamp`, `sessionId`, `visitorId`, `capiSent`; los 6 creados a mano en `ensure-coherence-indexes` tampoco tocan `props`). El único índice que ayuda es el prefijo `(organizationId, type)` de `pixel_events_organizationId_type_timestamp_idx` — que **no filtra nada**: acota a "todos los PURCHASE de esta org", y después hay que ir al heap fila por fila para evaluar el JSONB.

Lo mismo, un escalón más abajo, en `:283` y `:313`: `orders.externalId LIKE '%…%'` con comodín inicial, que inutiliza el índice `@@unique([organizationId, externalId])`.

**Costo estimado y sobre qué volumen.** Para Arredo hay ~252k órdenes → del orden de 10⁵ eventos PURCHASE históricos. Cada compra dispara **un heap-fetch por cada uno de ellos** (los tuples de `pixel_events` son anchos: `props`, `clickIds`, `utmParams`, `userAgent` de 500 chars → varios cientos de bytes por fila, muchas TOASTeadas). Y ocurre **dos veces** por compra (dedup en `:238` + búsqueda de orden en `:283`/`:313`). A ~1.000 compras/día eso son ~10⁸ heap-fetches diarios sobre la tabla de 43 GB. **Este es el segundo gran envenenador de la cache de Neon después de C1**, y a diferencia de los rollups no aparece en ningún cron ni en ningún log de perf.

**Pantalla afectada:** ninguna directamente — y por eso es peligroso. El daño es (a) contención de DB que se ve en TODAS las pantallas, y (b) en picos (Hot Sale) el receptor de eventos se pone lento, el `sendBeacon` del navegador se pierde, y **se pierden eventos de compra en silencio** (el endpoint devuelve 204 pase lo que pase, `route.ts:10-11`).

---

## C6 — `/api/metrics/products`: dos queries de historia COMPLETA con `maxDuration=60` y ~58s medidos

**Severidad:** CRITICAL
**Archivos:** `src/app/api/metrics/products/route.ts:305-322` (Query 6) y `:395-417` (Query 9) · `:13` (`maxDuration = 60`) · `:155` (`Promise.all` de 8 queries) · comentario `:134` ("~58s en el branch throttleado para EMDJ")

```sql
-- Query 6: sin NINGÚN filtro de fecha
SELECT p.sku, MAX(o."orderDate")
FROM order_items oi JOIN orders o ON oi."orderId" = o.id JOIN products p ON oi."productId" = p.id
WHERE o."organizationId" = $1 AND <valid> AND p.sku IS NOT NULL AND p.sku != ''
GROUP BY p.sku
```

```sql
-- Query 9: sin filtro de fecha Y con un sort que ningún índice soporta
SELECT DISTINCT ON (p.sku) p.sku, (oi."totalPrice" / NULLIF(oi.quantity,0))
FROM order_items oi JOIN orders o … JOIN products p …
WHERE o."organizationId" = $1 AND <valid> AND …
ORDER BY p.sku, o."orderDate" DESC
```

**Qué está mal.** Las dos escanean **toda la historia de órdenes de la org**, no el rango pedido. La Query 9 además exige un `ORDER BY p.sku, o."orderDate" DESC` que no está cubierto por ningún índice existente → sort completo del join en memoria/disco.

Y hay un agravante de sistema: **el resultado de ambas es independiente del rango `from`/`to`**, pero `warm-cache` las hace recalcular **4 veces por org cada 5 minutos** (los 4 rangos de `warm-cache/route.ts:162-171` × `/api/metrics/products`).

**Costo estimado y sobre qué volumen.** Arredo: 252.701 órdenes → del orden de 0,7-1,2M `order_items` (**ESTIMADO**, no pude contar). Ambas queries hacen el join completo `order_items × orders × products` de la org y la #9 lo ordena entero. `maxDuration=60` con ~58s ya medidos en una org **más chica** que Arredo: el margen es de dos segundos. Además, el trabajo repetido por el warm es de **~192 scans de historia completa por hora** (4 orgs × 4 rangos × 12 corridas/h) para calcular dos resultados que no cambian con el rango.

**Pantalla afectada:** `/products` (504 en frío, "Centro de Control" trabado según el propio comentario de `:135`).

---

# 🟠 HIGH

## H1 — `statement_timeout=150000` es 2-10× el `maxDuration` de casi todas las rutas: queries zombie

**Severidad:** HIGH
**Archivo:** `src/lib/db/client.ts:59`

```ts
const dsUrl = `${rawUrl}${sep}connection_limit=24&pool_timeout=160&statement_timeout=150000${pgbouncer}`;
```

**Qué está mal.** Postgres mata una query a los **150 segundos**. Vercel mata la función mucho antes: `discrepancy`, `pnl`, `conversion`, `customers`, `seo`, `top`, `distribution` **no exportan `maxDuration`** (ver tabla abajo) → se quedan con el default del plan. Cuando Vercel corta, la conexión queda en el pooler y **Postgres sigue ejecutando la query hasta 150s**, quemando CPU de un compute de 4 CU y reteniendo una de las 24 conexiones para un resultado que nadie va a leer.

**Deriva documental grave.** Los comentarios del propio archivo (`client.ts:39-43`) dicen `statement_timeout=50000`; `orders/route.ts:87` dice `statement_timeout=25000`; `metrics/pixel/route.ts:84` dice "REQUIERE statement_timeout=50000 en client.ts (si no, PG mata la query a los 25s igual)". **Ninguno coincide con el valor real de 150000.** Quien lea los comentarios para razonar sobre timeouts va a razonar mal.

**Costo estimado.** Cada request abortada por Vercel puede dejar hasta 150s de trabajo zombie. En una tormenta de retries (ver H2) esto se multiplica: 3 intentos × 45s de cliente = 3 queries zombie de hasta 150s cada una, por usuario.

**Pantalla afectada:** todas las que timeoutean. Es el amplificador que convierte un pico en una caída sostenida.

---

## H2 — `/api/metrics/orders`: cache fresh-only sin lock + retry ×3 del frontend = stampede garantizado

**Severidad:** HIGH
**Archivos:** `src/app/api/metrics/orders/route.ts:168-172` · `:1726` · `src/app/(app)/orders/page.tsx:228-241`, `:267`

```ts
const cached = await getSharedCachedSWR("orders", ...cacheKey);
if (cached?.data && !cached.isStale) {          // ← solo sirve FRESH
  return NextResponse.json(cached.data);
}
// …y acá abajo: recompute BLOQUEANTE, sin tryAcquireRefreshLock
```

**Qué está mal.** Tres fallas que se componen:

1. **No sirve stale.** A diferencia de `/api/metrics/pixel` y `/api/metrics/products`, la ruta de orders descarta el hit stale y recomputa bloqueante. Fresh window = 5 min (`api-cache.ts:31`).
2. **No hay lock anti-herd.** `tryAcquireRefreshLock` existe (`api-cache.ts:105`) y las otras dos rutas lo usan; esta no. En el minuto 5:01, N usuarios concurrentes disparan N recomputes completos de **~28 queries en 17 batches secuenciales**.
3. **El frontend reintenta 3 veces.** `orders/page.tsx:228` (`MAX_RETRIES = 2`, "up to 3 total attempts") con timeout de 45s y `continue` tanto en 5xx (`:241`) como en `AbortError` (`:267`). Cuando la DB está lenta, cada usuario multiplica su carga por 3 — **exactamente cuando menos hay que hacerlo**. Es un bucle de realimentación positiva clásico.

**Costo estimado.** 3 usuarios en `/pedidos` al mismo tiempo, cache recién vencida, DB lenta → 3 usuarios × 3 intentos × 28 queries = **252 queries** contra un pool de 24, sobre 252k órdenes. Y con H1, cada intento abandonado deja queries corriendo hasta 150s.

**Pantalla afectada:** `/pedidos` (error "La carga tardó demasiado" de `page.tsx:271`), y por contención el resto.

---

## H3 — Un click en el tab VTEX/MELI desactiva TODA la capa Gold de `/pedidos`

**Severidad:** HIGH
**Archivos:** `src/app/api/metrics/orders/route.ts:206` (`const useGold = process.env.ORDERS_USE_GOLD === "true" && !sourceFilter;`) · `src/app/(app)/orders/page.tsx:216-218`

**Qué está mal.** `useGold` se apaga entero si hay filtro de source. Todo el trabajo de las tandas 2-5 de Medallion (`docs/MEDALLION_STATUS.md:66-80`: header, gráficos, segmentaciones, top products, profitability, cohorts, payment, top customers, device, traffic) revierte a Bronze **de golpe** en cuanto el usuario toca el tab. Lo peor que vuelve a activarse:

- **El `LATERAL` correlacionado de cohorts** (`route.ts:1024-1031`): `SELECT MIN("orderDate") FROM orders WHERE org AND customerId = o."customerId"` **por cada fila de orden del rango**. Con `orders_orgId_customerId_date_idx` cada lookup es barato, pero son ~25k lookups para un rango de 30 días de Arredo.
- **El anti-join `NOT IN (SELECT COALESCE("packId","externalId") …)`** repetido en cada una de las ~10 queries Bronze (el propio `ensure-coherence-indexes.ts:96-99` dice "se ejecuta 22 veces en /api/metrics/orders").
- **El top-products Bronze** (`route.ts:619-655`): `order_items JOIN orders JOIN products LEFT JOIN ml_listings` + `GROUP BY 6 columnas` + `ORDER BY SUM(...)` sobre todo el rango.

**Costo estimado.** El header pasa de un `SUM` sobre `gold_daily_revenue` (≈ 30 filas para 30 días) a dos scans de `orders` en el rango (el principal + el anti-join). Es entre uno y dos órdenes de magnitud, en ~10 queries a la vez. **ESTIMADO** por la relación de cardinalidad (filas de rollup vs filas de orders), no medido.

**Pantalla afectada:** `/pedidos`, tab VTEX y tab MELI. El tab "Todos" vuela; los otros dos no.

---

## H4 — Funnel por canal: la cobertura del rollup se chequea mal, y el fallback en vivo devuelve "no disponible"

**Severidad:** HIGH · **[YA CONOCIDO: BP-PIXEL-CHANNEL-ROLLUP]**
**Archivos:** `src/app/api/metrics/pixel/funnel/route.ts:52-59` (chequeo de cobertura), `:85-125` (fallback en vivo con `SET LOCAL statement_timeout = 18000`), `:167-190` (query de purchase sin protección)

```sql
SELECT (MIN(day) <= ($2 AT TIME ZONE 'AR')::date) AS covered
FROM pixel_daily_funnel_by_source WHERE "organizationId" = $1
```

**Qué está mal.** Tres cosas:

1. **La cobertura solo mira el borde inferior.** Si el rollup arranca antes que `dateFrom` se declara "cubierto", aunque `MAX(day)` esté días atrás. En ese caso el funnel se sirve **incompleto y en silencio** — no hay merge en vivo del tramo faltante, a diferencia de `getFunnelStages` (`lib/metrics/pixel-funnel.ts:68`) que sí lo hace para el funnel sin canal. Con la rotación de tablas del cron (una tabla cada 15 min, ciclo ~1,75h) `funnel` está desactualizada la mayor parte del tiempo.
2. **El rango que hoy cae al camino lento** es cualquiera que empiece antes de lo que cubre el rollup. El backlog lo dice: "Hoy solo tiene los últimos ~7-8 días de Arredo/ElMundo". Traducido: **cualquier filtro por canal en 30 o 90 días de Arredo cae al fallback**, que escanea `pixel_events` crudo dos veces (CTE `event_sources` + `INNER JOIN` de vuelta a `pixel_events`) con `DISTINCT ON ("visitorId")`. Con 18s de `statement_timeout` y ~5,5M eventos en 30 días, **eso no termina**: devuelve `null` y la UI muestra `channelUnavailable: true`.
3. **La query de `purchase` no tiene ninguna red.** `:167-190` usa `EXISTS (SELECT 1 FROM jsonb_array_elements(pa.touchpoints::jsonb) …)` con `LOWER(...)`, un desanidado correlacionado por atribución. No está dentro de la transacción con timeout de 18s, no tiene cache, y la ruta tiene `maxDuration=60` (`:33`). Si esa query tarda, **la ruta entera 500ea** (catch en `:236`) y el usuario ve el funnel roto, no "no disponible".
4. **La ruta no cachea nada.** Cada cambio de canal en el dropdown (`analytics/page.tsx:562`) es un fetch completo, sin debounce.

**Pantalla afectada:** `/pixel/analytics` → tarjeta de funnel con filtro de canal.

---

## H5 — 13 de los ~17 índices que sostienen la performance NO están en `schema.prisma`

**Severidad:** HIGH
**Archivos:** `prisma/schema.prisma:796-799` y `:826-830` (lo declarado) · `src/app/api/admin/ensure-coherence-indexes/route.ts:23-121` (14 índices creados a mano) · `src/app/api/admin/ensure-indexes/route.ts:18-39` (6 más) · `src/app/api/admin/create-attribution-iphash-index/route.ts:41-45` (1 más) · `package.json` (`"db:push": "prisma db push"`)

**Qué está mal.** El repo no tiene historial de migraciones Prisma (`prisma/migrations/` son 9 SQL sueltos, ninguno de índices). Todo el trabajo de índices —los "9 índices nuevos" que arreglaron `/pixel/analytics`— vive en endpoints admin imperativos que hay que acordarse de correr.

`prisma db push` **borra los índices que no están en el schema**. Un `npm run db:push` en el entorno equivocado deja `pixel_events` con 4 índices en vez de 10 y `pixel_attributions` con 4 en vez de 7 — y todas las pantallas del pixel se caen de golpe, sin cambio de código que lo explique. `docs/MEDALLION_STATUS.md:42` ya lo advierte al pasar ("creado a mano, NO está en schema.prisma → ojo al hacer db pull"), pero está enterrado en un doc de diagnóstico, no en el proceso.

**Inventario real que reconstruí de `pixel_events` (24M filas, 43 GB):**

| Índice | Declarado en schema | Origen |
|---|---|---|
| `(organizationId, type, timestamp)` | ✅ | schema |
| `(organizationId, sessionId)` | ✅ | schema |
| `(visitorId, timestamp)` | ✅ | schema |
| `(organizationId, capiSent)` | ✅ | schema |
| `(organizationId, visitorId, timestamp DESC)` | ❌ | ensure-coherence |
| `(visitorId, timestamp DESC) WHERE deviceType IS NOT NULL` | ❌ | ensure-coherence |
| `(organizationId, type, visitorId)` | ❌ | ensure-coherence |
| `(organizationId, timestamp)` | ❌ | ensure-coherence |
| `(organizationId, timestamp) INCLUDE (visitorId, sessionId, type)` | ❌ | ensure-coherence |
| `(organizationId, ipHash, timestamp) WHERE ipHash IS NOT NULL` | ❌ | create-attribution-iphash-index |

**Pantalla afectada:** todas, si alguien corre `db:push`. Es riesgo operativo, no degradación actual.

---

## H6 — `/api/metrics/pnl`: 14 queries paralelas, sin `maxDuration`, sin cache, sin aislamiento

**Severidad:** HIGH
**Archivos:** `src/app/api/metrics/pnl/route.ts:60-75` (el `Promise.all` de 14) · sin `export const maxDuration` en todo el archivo · sin `getCached`/`setCache`
**Consumidores:** `src/app/(app)/finanzas/estado/page.tsx:1199` · `src/app/(app)/dashboard/page.tsx:280` · `src/app/(app)/campaigns/page.tsx:1195`

**Qué está mal.** 14 queries de una, de las cuales al menos 6 hacen `order_items JOIN orders LEFT JOIN products` sobre el rango (`:98-104`, `:152-158`, `:183-189`, `:202-208`, `:243-249`, `:325-331`), incluida una (`:238-256`) que hace **dos agregaciones completas de `order_items` y las une por `source`**. Nada de `safeQuery`, nada de cache, y sin `maxDuration` explícito la ruta se queda con el default del plan.

Además hereda el problema de C4: `Promise.all` → una falla mata las 14 → catch en `:637` devuelve 500 → el widget de P&L del dashboard queda vacío.

**Costo estimado.** 6 joins independientes sobre el mismo conjunto `order_items × orders` del rango. Para 30 días de Arredo eso es leer el mismo conjunto de ~75-100k items **seis veces** en paralelo (**ESTIMADO**: 25k órdenes × ~3 items). Se podría hacer en una sola pasada con `FILTER`.

**Pantalla afectada:** `/finanzas/estado`, widget P&L de `/dashboard`, `/campaigns`.

---

## H7 — `api_cache` nunca se purga y su espacio de keys crece todos los días

**Severidad:** HIGH
**Archivos:** `src/lib/api-cache-shared.ts:115-121` (`purgeExpiredSharedCache`, **sin ningún caller en todo el repo**) · `:90-110` (`setSharedCache`, upsert de JSONB) · `src/lib/pixel/cache-key.ts:59-68` (la key incluye `from` y `to`)

**Qué está mal.** Dos problemas que se suman:

1. **La función de purga es código muerto.** `grep -rn "purgeExpiredSharedCache"` devuelve una sola línea: su propia declaración. El comentario dice "Lo llama el cron de warm-cache" — no lo llama.
2. **La key incluye el rango de fechas.** Cada día genera keys nuevas (`…:2026-09-01:2026-09-02:…`) que nunca vuelven a consultarse y nunca se borran. Las de la UI, además, se combinan con cada rango custom que elija un usuario.

**Costo estimado.** El payload de `/api/metrics/pixel` pesa **~878 KB en 30 días** (el dato es del propio repo, `metrics/pixel/route.ts:48-50`). Piso conservador: 4 orgs × 4 rangos × 2 endpoints = 32 filas nuevas por día que quedan para siempre → **~28 MB/día, ~10 GB/año** de basura en la misma base cuyo working set (28 GB) ya no entra en la cache de 16 GB. Y el churn de UPDATEs (128 escrituras de hasta 1 MB cada 15 minutos, solo del warm) genera tuples muertos y TOAST que autovacuum tiene que perseguir.

Corolario de diseño: cada "cache hit" de nivel 2 **lee ~1 MB de JSONB de Neon** (`api-cache-shared.ts:63-70`). Es mucho más barato que 28 queries, pero no es gratis, y escala con el ancho de la respuesta.

**Pantalla afectada:** ninguna directamente; erosiona a todas vía capacidad de Neon. Se relaciona directo con **[YA CONOCIDO: BP-NEON-CAPACITY]**.

---

## H8 — El dashboard dispara 5-8 endpoints en paralelo desde el browser, cada uno con 5-28 queries adentro

**Severidad:** HIGH
**Archivo:** `src/app/(app)/dashboard/page.tsx:559-593` (`sectionNeeded` fuerza `metrics`, `trends`, `products`, `customers`, `pnl` + los del layout, que pueden incluir `pixel`) y `:591` (un fetch adicional **por widget** `top:*` / `dist:*`)

**Qué está mal.** El render progresivo está bien resuelto (`:597-618`, `Promise.allSettled`, cada sección pinta apenas llega — buena decisión y está bien comentada). El problema es la **cota de concurrencia**: no hay ninguna. Una carga de `/dashboard` dispara como mínimo 5 endpoints simultáneos, y cada uno adentro abre su propio `Promise.all`:

| Endpoint | Queries internas | Aislamiento |
|---|---|---|
| `/api/metrics` | 2 × `getPeriodMetrics` | ninguno |
| `/api/metrics/trends` | varias | ninguno |
| `/api/metrics/products` | 8 (incluidas las 2 de historia completa, C6) | ninguno |
| `/api/metrics/customers` | 10 | ninguno |
| `/api/metrics/pnl` | 14 | ninguno |
| `/api/metrics/pixel` (si está en el layout) | 34 | ninguno |

**Costo estimado.** Una sola carga de `/dashboard` en frío puede lanzar **60-80 queries concurrentes** contra un pool de 24. Con dos usuarios, se supera el pool y `pool_timeout=160` empieza a hacer esperar requests hasta 160 segundos.

**Pantalla afectada:** `/dashboard`, y por el pool compartido cualquier otra pantalla abierta al mismo tiempo.

---

## H9 — `/api/metrics/pixel/discrepancy` corre en paralelo con `/api/metrics/pixel` desde la misma página

**Severidad:** HIGH
**Archivos:** `src/app/api/metrics/pixel/discrepancy/route.ts:71` (`Promise.all` de 7) · `:74-190`, `:225-241`, `:255-270` (4 queries que desanidan `pa.touchpoints`) · sin `maxDuration`, sin cache, sin `safeQuery` · disparado desde `src/app/(app)/pixel/analytics/page.tsx:518-521`

**Qué está mal.** La página de analytics hace:

```ts
const [pixelRes, discRes] = await Promise.all([
  fetch(`/api/metrics/pixel?from=${dateFrom}&to=${dateTo}`),
  fetch(`/api/metrics/pixel/discrepancy?from=${dateFrom}&to=${dateTo}`),
]);
```

O sea: **34 queries (pixel) + 7 queries (discrepancy) = 41 queries concurrentes** por una sola carga de página, contra un pool de 24. Y `discrepancy` no tiene ninguna de las protecciones que sí tiene `pixel`: no lee Gold (sus 4 queries de touchpoints son siempre Bronze, `:74`, `:170`, `:225`, `:255`), no cachea, no declara `maxDuration`.

Un detalle extra: `:271-280` usa `LEFT JOIN (SELECT DISTINCT "orderId" FROM pixel_attributions WHERE org AND model)` **sin filtro de fecha** — materializa el `DISTINCT` de todas las atribuciones históricas de la org para cruzarlo contra 30 días de órdenes. El mismo patrón está en `metrics/pixel/route.ts:817-823`.

**Mitigación existente:** la página tolera el fallo (`discRes.ok ? discRes.json() : null`, `analytics/page.tsx:526-527`). O sea que degrada bien — pero paga el costo igual, porque abortar el fetch no cancela la query (H1).

**Pantalla afectada:** `/pixel/analytics`, tarjeta de discrepancia (queda vacía) + contención para el resto de la página.

---

## H10 — `ensureColumns()` corre DDL con lock exclusivo sobre `orders` en cada cold start

**Severidad:** HIGH
**Archivos:** `src/app/api/metrics/orders/route.ts:37-61` y `:106-113`

```ts
if (!migrated) {
  await ensureColumns().catch(() => {});   // ALTER TABLE orders ADD COLUMN IF NOT EXISTS ×3
  migrated = true;                          // + CREATE INDEX IF NOT EXISTS ×5
}
```

**Qué está mal.** `migrated` es una variable de módulo → **una vez por instancia de lambda, no una vez por deploy**. Vercel crea instancias nuevas continuamente. Cada cold start de `/api/metrics/orders` ejecuta 3 `ALTER TABLE orders ADD COLUMN IF NOT EXISTS` y 5 `CREATE INDEX IF NOT EXISTS`.

Aunque sean no-ops, **`ALTER TABLE` pide `ACCESS EXCLUSIVE` sobre `orders`**. Si en ese momento hay un `SELECT` largo en vuelo (y con 150s de `statement_timeout` los hay), el `ALTER` **se encola detrás**, y —esto es lo grave— **todo lo que llegue después se encola detrás del `ALTER`**, incluidos los `SELECT` que normalmente no se bloquean entre sí. Es el patrón clásico de lock-queue-pileup de Postgres: una query lenta + un DDL trivial = tabla congelada.

**Costo estimado.** En operación normal, milisegundos. En un pico (que es cuando hay cold starts *y* queries lentas a la vez) es un stall de toda la tabla `orders` por la duración de la query lenta. **ESTIMADO** — el mecanismo es conocido de Postgres, no lo medí acá.

**Pantalla afectada:** `/pedidos` y cualquier cosa que lea `orders` (dashboard, P&L, pixel) durante el stall.

**Además:** esto es DDL en el camino caliente de un endpoint de lectura. El mismo repo ya tiene `/api/admin/ensure-indexes` para esto, y `CLAUDE.md` (sección "REGLA: Orden de migraciones") prohíbe explícitamente mezclar schema con deploy.

---

# 🟡 MEDIUM

**M1 — Dos queries de geografía byte-idénticas, ejecutadas en paralelo.**
`src/app/api/metrics/orders/route.ts:1388-1413` (`geo-provinces`) y `:1415-1440` (`geo-postal`). El SQL es el mismo carácter por carácter; el comentario admite "same data, kept separate for type clarity". Es 2× el costo (dos scans de `orders` en el rango + dos anti-joins) para el mismo resultado. Fix: una query, dos referencias al array.

**M2 — El anti-join `NOT IN (SELECT COALESCE("packId","externalId") …)` se repite ~22 veces por request.**
Aparece en `orders/route.ts:236`, `:264`, `:643`, `:985`, `:1035`, `:1101`, `:1402`, `:1428` y más. El `orders_invalid_packs_partial_idx` (`ensure-coherence-indexes.ts:96`) lo hace barato individualmente, pero son 22 evaluaciones del mismo predicado por request. Un CTE materializado una vez, o mejor, la columna `is_valid` que **ya existe precomputada en `silver_orders`** (`docs/MEDALLION_STATUS.md:62`), lo resuelve. Riesgo secundario: `NOT IN` con subquery es semánticamente frágil si `COALESCE(packId, externalId)` alguna vez devuelve NULL (devolvería cero filas, en silencio).

**M3 — Subquery de atribuciones sin filtro de fecha.**
`src/app/api/metrics/pixel/route.ts:817-823` y `src/app/api/metrics/pixel/discrepancy/route.ts:271-280`. `LEFT JOIN (SELECT DISTINCT "orderId" FROM pixel_attributions WHERE "organizationId"=X AND model=Y)` lee **toda la historia** para cruzar contra un rango de 30 días. Con el índice covering es index-only, pero crece linealmente con la antigüedad de la cuenta: hoy ~250k filas, a 3 años ~750k.

**M4 — `recentOrders`: LATERAL con 3 subqueries correlacionadas por item + `ORDER BY` sin desempate + `OFFSET`.**
`src/app/api/metrics/orders/route.ts:783-833`. Cada item hace hasta 3 lookups a `products p2` por SKU hermano (imagen, marca, costo). Con `LIMIT 50` el planner *puede* resolverlo incrementalmente, pero los `LEFT JOIN customers` y `LEFT JOIN ml_commissions` que van antes pueden forzarlo a materializar el rango completo primero (**ESTIMADO**, requiere `EXPLAIN`). Además `ORDER BY o."orderDate" DESC` sin tiebreaker hace la paginación inestable (filas repetidas o salteadas entre páginas) y el `OFFSET` crece con el número de página.

**M5 — `= ANY(array de hasta 20.000)` sobre una expresión, no sobre una columna.**
`src/app/api/metrics/pixel/route.ts:1315` y `src/app/api/metrics/conversion/route.ts:157`:
`AND COALESCE(p."externalId", oi."productId") = ANY(${purchasableSkuIds})`.
`COALESCE(...)` de dos columnas de tablas distintas no es indexable → el filtro se evalúa después del join, sobre todas las filas de `order_items × orders` del rango. `PRODUCT_UNIVERSE_CAP = 20000` es el techo del array.

**M6 — `/api/metrics/conversion` sin cache y sin `maxDuration`.** **[YA CONOCIDO: BP-PERF-CONVERSION]**
`src/app/api/metrics/conversion/route.ts` — no importa `api-cache` en ningún lado, no exporta `maxDuration`. Ya no escanea `pixel_events` crudo (eso se arregló, `:91-104` lee el rollup), pero sigue pagando M5 en cada carga de las tablas de CR.

**M7 — Los locks y rate-limits en memoria son inútiles en serverless multi-instancia.**
`src/lib/api-cache.ts:48` (`inflightRefresh`), `src/app/api/pixel/event/route.ts:36-52` (`rateLimitMap`, 100 ev/s **por instancia**), `:57-77` (dedup de PAGE_VIEW por instancia), `warm-cache/route.ts:59` (`lastRollupAlertSent`). El anti-thundering-herd de `metrics/pixel` protege **dentro** de una instancia; con N instancias calientes hay N computes simultáneos de la misma key. Y el rate limit del pixel es, efectivamente, `100 × N` eventos/segundo.

**M8 — `getFunnelStages`: si el rollup se atrasa, el tramo "en vivo" crece sin techo.**
`src/lib/metrics/pixel-funnel.ts:68`: `liveFromDay = !maxRoll || maxRoll < fromDay ? fromDay : maxRoll`. El comentario de `:70-73` promete "el tramo vivo solo escanea los días recientes (típicamente ≤3)". Eso vale **solo si el cron está al día**. Cuando el cron se corta —y ya se cortó 5 días en junio (`BP-ROLLUP-CRON`)— el tramo vivo pasa a ser el rango entero de `pixel_events` con `hll_add_agg` sobre millones de filas. Es un fallo que se agrava solo: el rollup se atrasa → las queries se ponen caras → la DB se satura → el rollup se atrasa más.

**M9 — `/api/metrics/products` devuelve el catálogo completo sin `LIMIT` ni paginación.**
`src/app/api/metrics/products/route.ts:179-260` (Query 3: `FROM master_products m LEFT JOIN sales_by_sku s`, sin `LIMIT`). El consumidor es `app/(app)/products/page.tsx` (2.478 líneas, client component) sin virtualización — el repo no tiene `react-window`/`react-virtual`/`virtuoso` en `package.json`. Para un catálogo de decenas de miles de SKUs es un payload grande + un DOM grande.

**M10 — 17 batches secuenciales en `/api/metrics/orders`.**
`orders/route.ts:218` a `:1443`. Respeta REGLA #3b (≤3 por batch, bien hecho), pero 17 round-trips secuenciales imponen un piso de latencia. Con Neon caliente (~10-30 ms RTT) son ~0,5s de puro ida-y-vuelta; con Neon frío (cold start ~3s según `CLAUDE_STATE.md:26`) el primer batch se lleva todo el arranque. Hay batches de 1 sola query (`1b`, `1c`, `3b`, `5b`, `7b`, `8b`) que podrían agruparse hasta 3 sin violar la regla.

**M11 — `next.config.js` sin `optimizePackageImports` ni configuración de imágenes.**
`next.config.js` (14 líneas) solo tiene `eslint.ignoreDuringBuilds` y redirects. Hay **110 archivos** con barrel import de `lucide-react`. Next 14 tree-shakea razonablemente, pero `experimental.optimizePackageImports: ['lucide-react', 'recharts', 'date-fns']` es la mejora de bundle/compile más barata disponible. Tampoco hay `images` configurado (`imageUrl` de VTEX/MELI se sirve directo desde el origen del cliente, sin optimizar ni redimensionar) — `orders/page.tsx:245-252` incluso reescribe `http://` → `https://` en el cliente para evitar mixed-content, señal de que las imágenes vienen crudas de terceros.

**M12 — `pixel_visitors`: un UPDATE por evento sobre 1,2M filas.**
`src/lib/pixel/identity.ts:166-202`: cada evento hace `upsert` con `totalPageViews: { increment: 1 }`, `lastSeenAt`, y `deviceTypes: { push }`. Son **1,3M UPDATEs por semana sobre una tabla de 1,2M filas** → cada fila se reescribe entera ~1×/semana, con 4 índices que mantener (`schema.prisma:746-749`). Genera tuples muertos, presión de autovacuum y write amplification. `totalPageViews` no se usa en ninguna query de las pantallas que auditamos.

**M13 — `backfill-runner` corre cada minuto con `maxDuration=300`.**
`vercel.json:120-123` (`* * * * *`) + `src/app/api/cron/backfill-runner/route.ts:36` (`maxDuration = 300`) y `:41` (`LOOP_BUDGET_MS = 240_000`). Una invocación puede durar 4 minutos mientras arrancan 4 nuevas. El cooldown de 2 min de `pickNextJob` evita que dos workers tomen el mismo job, pero no evita 4 lambdas vivas a la vez. Cuando no hay jobs es barato; cuando hay un onboarding en curso, son 4 procesadores de chunks concurrentes compitiendo con el dashboard por las mismas 24 conexiones.

---

# 🟢 LOW

**L1 — Deriva documental sistemática en los números de perf.** Los comentarios del código contradicen al código en al menos cinco lugares: `statement_timeout` (25s / 50s en comentarios vs **150s** real en `client.ts:59`); pool (8 en `CLAUDE.md` REGLA #3b vs **24** en `client.ts:59`); cadencia del cron de rollups ("cada 2h" en `refresh-pixel-rollups/route.ts:25` vs **cada 15 min** en `vercel.json:127`); cadencia de first-source ("CADA HORA" en `refresh-pixel-first-source/route.ts:43` vs **cada 30 min** en `vercel.json:131`); "el warm ESPERA cada compute" (`metrics/pixel/route.ts:137`) vs abort a 20s. En un sistema donde los timeouts se ajustan a mano incidente tras incidente, esta deriva **es** un riesgo de perf: la próxima persona va a razonar con los números equivocados.

**L2 — Un `console.log` por batch de eventos del pixel.** `src/app/api/pixel/event/route.ts:150`. Son ~1,3M líneas de log por semana en Vercel, más los de PURCHASE (`:342`, `:262`, `:277`). Cuesta plata y entierra las señales reales.

**L3 — Los `maxDuration` no describen la realidad de Vercel.** `metrics/pixel/route.ts:52` declara `maxDuration = 200`, pero `refresh-pixel-rollups/route.ts:132-138` documenta que Vercel **no honra** overrides >300s en este proyecto ("la función SIEMPRE muere a ~340s"). Conviene verificar cuál es el cap real y alinear todos los presupuestos a él en un solo lugar.

**L4 — `pixel_daily_channel` está vacía por un no-op silencioso.** **[YA CONOCIDO]** `src/lib/pixel/rollup-backfill.ts:374-377`: el `catch {}` se traga el error del rollup de canal. Ya causó el incidente de "tabla veneno" (`PROJECT-HANDOFF.local.md:60`). Riesgo latente de perf: si alguien prende `PIXEL_USE_GOLD_CHANNEL=true` viendo que existe el flag, las 4 queries de atribución van a leer una tabla vacía y el dashboard va a mostrar **cero con toda confianza**.

---

# (a) Tabla de índices propuestos

## a.1 — Índices FALTANTES

| # | Tabla | Columnas / expresión | Query que lo justifica | Impacto |
|---|---|---|---|---|
| **F1** | `pixel_events` | `(("organizationId"), (props->>'orderId')) WHERE type = 'PURCHASE'` (btree sobre expresión, parcial) | `app/api/pixel/event/route.ts:238-245` — dedup de PURCHASE | 🔴 De scan de ~10⁵ PURCHASE con heap-fetch por fila, a un seek. **Ver C5.** Requiere además cambiar `string_contains` por igualdad sobre el id normalizado; con `LIKE '%…%'` ningún índice btree sirve. |
| **F2** | `orders` | `("organizationId", "externalId" text_pattern_ops)` — **y** cambiar `contains` por `startsWith` | `app/api/pixel/event/route.ts:283`, `:313` | 🔴 `LIKE '%x%'` no usa índice. Como `orderIdBase` es el prefijo del `externalId` de VTEX (`"1619951503020"` vs `"1619951503020-01"`), `startsWith` es semánticamente correcto **y** indexable. Sin cambiar la query, el índice no sirve. |
| **F3** | `order_items` | `("orderId") INCLUDE ("productId", quantity, "totalPrice", "costPrice")` | `metrics/products` Q3/Q5/Q6/Q9, `metrics/pnl` ×6, `metrics/orders` top-products y profitability | 🟠 Convierte el join `order_items → orders` en index-only en las ~15 queries más pesadas del repo. `order_items` no tiene `organizationId`, así que el `orderId` es la única puerta. |
| **F4** | `orders` | `("organizationId", "orderDate" DESC) INCLUDE (status, "totalValue", source, "packId", "externalId")` | Los ~22 anti-joins de `metrics/orders` + KPIs Bronze + `metrics/pnl` | 🟠 Hace index-only el predicado que hoy obliga a ir al heap 22 veces por request. **Ver M2.** |
| **F5** | `products` | `("organizationId", sku) INCLUDE ("costPrice", brand, "imageUrl") WHERE sku IS NOT NULL AND sku != ''` | Las 3 subqueries correlacionadas de "SKU hermano" en `metrics/orders:794-822` y `:1094-1100` | 🟡 Extiende el `products_org_sku_idx` existente con las 3 columnas que las subqueries leen → evita el heap-fetch por item. |
| **F6** | `pixel_attributions` | — **no hace falta índice; hace falta filtro de fecha** | `metrics/pixel/route.ts:817-823`, `discrepancy/route.ts:271-280` | 🟡 El problema de M3 no se arregla con un índice: la subquery no acota por fecha. Acotarla con un `EXISTS` correlacionado contra `orders` del rango cambia el orden de magnitud. |

> ⚠️ Todos deben crearse con `CREATE INDEX CONCURRENTLY` y por la conexión **no pooled** (`DATABASE_URL_UNPOOLED`), como ya hace bien `create-attribution-iphash-index/route.ts:20-27`. Un `CREATE INDEX` normal sobre `pixel_events` toma `ACCESS EXCLUSIVE` y **se pierden eventos** durante el build (minutos, sobre 24M filas).

## a.2 — Índices REDUNDANTES o NO USADOS (candidatos a DROP)

Cada uno de estos se mantiene en cada uno de los **1,3M INSERT/semana** en `pixel_events`, y ocupa espacio en el working set de 28 GB que ya no entra en los 16 GB de cache. Borrarlos ataca `BP-NEON-CAPACITY` **por el lado de la demanda**.

| Índice | Tabla | Por qué sobra | Evidencia |
|---|---|---|---|
| `pixel_events_orgId_ts_idx` `(organizationId, timestamp)` | `pixel_events` | **Prefijo estricto** de `pixel_events_org_ts_cover_idx (organizationId, timestamp) INCLUDE (visitorId, sessionId, type)`. Cualquier plan que use uno puede usar el otro. Es 100% duplicado. | `ensure-coherence-indexes.ts:58` vs `:118` |
| `pixel_events_visitor_device_ts_idx` `(visitorId, timestamp DESC) WHERE deviceType IS NOT NULL` | `pixel_events` | Se creó para el `LATERAL` de la query #24. **Ese LATERAL se eliminó el 2026-07-02** (`metrics/pixel/route.ts:1044-1050`: "Ahora usa `pv."deviceTypes"[1]` → simple JOIN"). Ninguna query lo usa hoy. | `ensure-coherence-indexes.ts:48` vs `metrics/pixel/route.ts:1044-1050` |
| `pixel_events_organizationId_sessionId_idx` | `pixel_events` | **Ninguna query filtra por `sessionId` con igualdad.** El único uso de `sessionId` en WHERE es `NOT LIKE 'webhook-%'` (`first-source-sql.ts`, rollups), que un btree de igualdad no soporta. | `schema.prisma:797`; grep de `"sessionId" =` en `src/` → 0 hits en WHERE |
| `pixel_events_organizationId_capiSent_idx` | `pixel_events` | `capiSent` **solo se escribe**, nunca se filtra. Los dos usos (`capi.ts:151`, `:327`) son `UPDATE … WHERE id = …`. Peor: es un índice booleano de baja cardinalidad que se actualiza en cada PURCHASE. | `schema.prisma:799`; grep `capiSent` → solo escrituras |
| `pixel_attributions_organizationId_isAssisted_idx` | `pixel_attributions` | `isAssisted` nunca aparece en un WHERE SQL. El único uso es un `.filter()` en JS (`lib/intelligence/handlers.ts:846`) y un `UPDATE … WHERE orderId = …` (`attribution.ts:809`). | `schema.prisma:830` |
| `pixel_attributions_orgId_model_idx` | `pixel_attributions` | Prefijo estricto de `pixel_attributions_orgId_model_covering_idx (organizationId, model) INCLUDE (attributedValue, touchpointCount, orderId)`. | `ensure-coherence-indexes.ts:27` vs `:104` |

**Ganancia estimada:** 6 índices menos sobre las dos tablas más escritas. Sobre `pixel_events` son 4 entradas de índice menos por cada uno de los 1,3M INSERT semanales (**−4 index writes/evento**), más el espacio liberado: a ~30-45 bytes por entrada × 24M filas × 4 índices ≈ **3-4 GB menos de working set** (**ESTIMADO** a partir del ancho de clave; el número real depende del fillfactor y del bloat).

> Antes de dropear: confirmar con `pg_stat_user_indexes.idx_scan` en Neon. Mi análisis es estático (grep sobre el código); un índice puede estar siendo usado por una query que no leí, o por el planner para un `ORDER BY` que no anticipé.

---

# (b) Ranking de las queries más caras del repo

Ordenadas por costo esperado a la escala actual de Arredo. "Volumen" = las filas que la query toca, no las que devuelve.

| # | Query | Archivo:línea | Volumen tocado | Camino rápido | ¿Aislada? | Nota |
|---|---|---|---|---|---|---|
| 1 | Dedup de PURCHASE por `props->>'orderId'` | `app/api/pixel/event/route.ts:238` | ~10⁵ PURCHASE × heap-fetch, **por cada compra** | ❌ ninguno | n/a | **C5.** Corre en el camino de ingesta, invisible en las métricas de página |
| 2 | Rollup HLL `funnel` / `source` de un día × todas las orgs | `lib/pixel/rollup-backfill.ts:326-347` y `:301-321` | ~1M eventos/día + `LEFT JOIN` a 3,9M filas de la dim | n/a (es el productor) | sí (cliente propio) | **C1.** ~170-500s por corrida, y se dispara hasta 7×/15 min |
| 3 | `lastSaleDateByProduct` (Query 6, sin filtro de fecha) | `app/api/metrics/products/route.ts:305` | `order_items × orders × products` de **toda la historia** (~1M items) | ❌ | ❌ | **C6.** ~58s medidos en una org más chica que Arredo |
| 4 | `historicalPriceBySku` (Query 9, sin fecha + `DISTINCT ON` con sort no indexado) | `app/api/metrics/products/route.ts:395` | idem #3 + sort completo por `(sku, orderDate DESC)` | ❌ | ❌ | **C6** |
| 5 | Atribución por (modelo, canal) — query #29 Bronze | `app/api/metrics/pixel/route.ts:1000-1063` | ~4× las atribuciones históricas de la org, con `jsonb_array_elements` | ✅ `gold_attribution_channel`, pero detrás de `PIXEL_USE_GOLD_CHANNEL` (OFF) | ❌ | **C4.** Con `PIXEL_USE_CHANNELS` ON cae a Bronze |
| 6 | Funnel por canal, fallback en vivo | `app/api/metrics/pixel/funnel/route.ts:90-118` | 2 pasadas sobre `pixel_events` del rango (~5,5M en 30d) + `DISTINCT ON` | ✅ rollup, pero solo cubre ~7-8 días | sí (18s) | **H4.** >75s medido antes del rollup; hoy da "no disponible" |
| 7 | `purchase` del funnel con canal (`EXISTS` + `jsonb_array_elements`) | `app/api/metrics/pixel/funnel/route.ts:168-190` | desanidado correlacionado por atribución del rango | ❌ | ❌ **sin timeout** | **H4.** Si tarda, 500ea la ruta entera |
| 8 | Atribución por source / roles / daily-by-source (#9, #20, #22) Bronze | `metrics/pixel/route.ts:531`, `:770`, `:940` | atribuciones del rango × touchpoints, JSONB | ✅ Gold (si `!PIXEL_USE_CHANNELS`) | ❌ | ~3s c/u según `MEDALLION_STATUS.md:20` |
| 9 | `discrepancy` — 4 queries de touchpoints | `metrics/pixel/discrepancy/route.ts:74,170,225,255` | idem #8, **sin rama Gold** | ❌ nunca | ❌ | **H9.** Corre en paralelo con las 34 de `metrics/pixel` |
| 10 | Cohorts Bronze con `LATERAL MIN(orderDate)` | `metrics/orders/route.ts:1024-1031` | ~25k lookups (uno por orden del rango) | ✅ `silver_customer_firsts` — **desactivado si hay filtro de source** | ✅ `safeQuery` | **H3** |
| 11 | Top products Bronze (`order_items × orders × products × ml_listings`) | `metrics/orders/route.ts:619-655` | items del rango + `GROUP BY` 6 columnas | ✅ `gold_product_sales` — idem #10 | ✅ | **H3** |
| 12 | Profitability Bronze (subquery de SKU hermano por item) | `metrics/orders/route.ts:1091-1120` | items del rango × 1 lookup a `products` cada uno | ✅ Gold — idem | ✅ | REGLA #3b lo nombra explícitamente ("ya tiene un subquery por SKU, no agregar más") |
| 13 | `recentOrders` con `LATERAL` + 3 subqueries por item | `metrics/orders/route.ts:783-833` | 50 órdenes × ~3 items × 3 lookups (si el plan es incremental) | n/a | ✅ | **M4.** Depende del plan; `OFFSET` empeora con la página |
| 14 | Compras por producto con `= ANY(array 20k)` sobre `COALESCE(...)` | `metrics/pixel/route.ts:1293`, `conversion/route.ts:136` | `order_items × orders` del rango, filtro no indexable | n/a | ❌ | **M5** |
| 15 | Geografía ×2 (idénticas) | `metrics/orders/route.ts:1388` y `:1415` | 2× (scan de `orders` del rango + anti-join) | n/a | ✅ | **M1.** La mitad del costo es literalmente tirado |
| 16 | `COUNT(*)` all-time de `pixel_events` | `metrics/pixel/route.ts:1231-1233` | 24M filas | ✅ cacheado 1h + `waitUntil` + guard anti-duplicado | ✅ | **Bien resuelto.** Lo dejo en la lista para dar la escala: era ~60s/request y era el root cause original |

---

# (c) Orden de caída proyectado a 3× de escala

Dos escenarios distintos. Los separo porque **rompen cosas distintas**.

## Escenario A — Arredo crece 3× (72M eventos / ~130 GB, 750k órdenes, misma cantidad de orgs)

**1º en caer — `/api/metrics/products` (504 duro).**
Ya está a 2 segundos del límite (`~58s` medidos vs `maxDuration=60`). Las Queries 6 y 9 escanean historia completa, así que crecen **linealmente con el 3×**: ~58s → **~174s**. `maxDuration=60` no da. La página muere y no vuelve sin tocar código. Es el único hallazgo donde el margen actual está medido y es de segundos.

**2º — La ingesta del pixel (pérdida silenciosa de eventos de compra).**
C5 es cuadrático en el peor sentido: el costo por compra crece con el histórico de compras (3×) **y** la cantidad de compras crece (3×). El scan de dedup pasa de ~10⁵ a ~3×10⁵ heap-fetches, tres veces más seguido → **~9× el trabajo**. Cuando el receptor se pone lento, `sendBeacon` no reintenta y el endpoint devuelve 204 igual (`event/route.ts:10-11`): **se pierden compras sin ningún error visible**, y la cobertura de atribución cae. Este es el que más miedo me da porque no rompe una pantalla — corrompe los datos.

**3º — El pipeline de rollups deja de cerrar su ciclo.**
Hoy una tabla-día de la org grande tarda ~170-500s y el presupuesto por invocación es 250s (`refresh-pixel-rollups/route.ts:141`) contra un cap real de Vercel de ~300s. A 3× **una sola tabla-día ya no entra en una invocación**. El cursor deja de avanzar (es exactamente el incidente del 18-ago que motivó la rotación por tabla, `route.ts:132-140`), los rollups se atrasan, y ahí se dispara el efecto dominó de M8: `getFunnelStages` empieza a computar en vivo rangos cada vez más grandes, lo que satura más la DB, lo que atrasa más el rollup. **Es el único fallo de la lista que se auto-alimenta.**

**4º — `/pixel/analytics` en cero de forma permanente.**
Con los rollups atrasados y el camino Bronze activo (C4), el compute pasa de ">85s en la org grande" a bastante más. La race de `GLOBAL_TIMEOUT_MS` gana siempre → mock en cero. Y como el warm no calienta la key correcta (C3), no hay nada en cache que amortigüe. El cliente ve $0 con HTTP 200.

**5º — `/pedidos` con filtro de source.**
Bronze crece 3× en todas sus queries. El header aguanta (el índice `(organizationId, orderDate)` responde en 51-155ms sobre 277k órdenes según `orders/route.ts:132-135`; a 3× sigue siendo un index-range scan). Lo que revienta es cohorts + top products + profitability, todos con `safeQuery` → **degradan parcialmente en vez de tumbar la página**. Cae 5º justamente porque el aislamiento existe: la página se ve, con tarjetas vacías. Es el mejor comportamiento de todo el sistema bajo estrés, y es el modelo a copiar en `metrics/pixel`.

**Lo que NO se rompe (y conviene saberlo):** todo lo que ya lee rollups HLL. `pixel_daily_*` tiene una fila por (org, día, dimensión): a 3× de eventos, el rollup **no crece** — crece solo con los días y la cardinalidad de las dimensiones. Los KPIs, el trend diario, dispositivos, top páginas y el funnel sin canal van a seguir siendo sub-segundo. La arquitectura Medallion está bien elegida; el problema es qué queda **afuera** de ella.

## Escenario B — 5 clientes del tamaño de Arredo (mismo tamaño por org, 5× las orgs)

El orden cambia por completo, porque acá lo que se multiplica es la **carga de fondo**, no el tamaño de las queries.

**1º — El pipeline de crons, por multiplicación directa.**
`backfillDay` itera **org por org** (`rollup-backfill.ts:380-389`). 5 orgs grandes = 5× el tiempo por tabla-día. Con 250s de presupuesto y ~170-500s por org-tabla-día, **el cron completa menos de una org por invocación**. El ciclo de 7 tablas pasa de ~1,75h a >12h, muy por encima del umbral de frescura de 8h (`lib/pipeline/freshness.ts:76`) → mails de frescura permanentes al cliente, y rollups crónicamente stale. Todo lo demás cae detrás de esto.

**2º — El pool de conexiones y el compute de Neon.**
`warm-cache` es O(orgs × rangos × endpoints): hoy 32 fetches por corrida, a 5 orgs son **40, con 4 corridas cada 15 minutos**, y cada fetch abortado a los 20s deja un compute vivo (C2). Sumado a C1 (rollups) y al tráfico real de dashboards, las 24 conexiones por instancia y los 4 CU no alcanzan. `pool_timeout=160` hace que las requests **esperen** en vez de fallar rápido → todo se siente colgado en vez de roto, que es la peor forma de fallar.

**3º — La cache local de Neon deja de servir para algo.**
Working set actual: ~28 GB para 4 orgs, contra 16 GB de cache. Con 5 orgs grandes son **>100 GB de working set contra 16 GB**. El hit rate se desploma muy por debajo del 44% que se midió con 2 CU, y **ninguna cantidad de CU razonable lo arregla** (harían falta ~8 CU solo para volver al empate de hoy). En este escenario la solución deja de ser "más compute" y pasa a ser particionado por org/tiempo, o retención (¿realmente hacen falta 2 años de `pixel_events` crudos en la tabla caliente, cuando los rollups ya tienen la historia agregada?).

**4º — El cache compartido se vuelve un pasivo.**
H7 escala con las orgs: 5× las keys nuevas por día, con payloads de ~878 KB, en una tabla que **nunca se purga**. Pasa de ~10 GB/año a ~50 GB/año de basura acumulada, dentro de la misma base que ya no entra en cache.

**5º — Las pantallas, en el mismo orden del escenario A.**
Pero llegando ahí **por contención**, no por tamaño de query: cada org individual sigue siendo del tamaño de hoy, así que las queries en sí no empeoran. Lo que empeora es que nunca hay una conexión libre ni una página caliente.

---

## Cierre: dónde está el apalancamiento

Si tuviera que ordenar por (impacto ÷ riesgo del cambio), y sabiendo que nada de esto se implementa sin OK:

1. **C3** — una línea (`&model=` en `analytics/page.tsx:519`). Riesgo ~cero. Devuelve el warm-cache a la página que más lo necesita.
2. **C1** — borrar el cron duplicado de `vercel.json` y bajar el `for 1..6` a `1..2` en el workflow. Riesgo bajo (la red de GH queda intacta). Es la mayor reducción de carga de fondo disponible.
3. **C2** — subir `PER_FETCH_TIMEOUT_MS` a algo mayor que el compute real, o hacer que el warm respete de verdad su secuencialidad. Alinea el código con lo que su propio comentario dice que hace.
4. **C6** — acotar por fecha las Queries 6 y 9 de `products`, o sacarlas del `Promise.all` y cachearlas aparte (su resultado no depende del rango).
5. **C4** — `Promise.all` → `Promise.allSettled` con fallbacks por query, copiando el `safeQuery` que ya existe y funciona bien en `metrics/orders`. Convierte "dashboard en cero" en "una tarjeta vacía".
6. **a.2** — dropear los 6 índices no usados. Ataca `BP-NEON-CAPACITY` por el lado de la demanda, que es el que nadie tocó todavía.

Los items 1, 2, 3 y 6 son **config y borrado**, no lógica de negocio: no tocan el CORE de atribución ni el contrato de `DATA_COHERENCE.md`.
