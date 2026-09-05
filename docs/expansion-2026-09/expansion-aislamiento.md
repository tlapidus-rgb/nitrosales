# Aislamiento entre clientes — Estudio de preparación para expansión

**Repo:** `C:/Users/axelf/github/nitrosales` · **Commit:** `9ad4616d` (= `origin/main` = producción)
**Fecha:** 2026-09-05 · **Alcance:** vecino ruidoso, radio de explosión, ciclo de vida de org. Solo lectura.
**No repite:** `docs/auditoria-2026-09/review-seguridad.md` (bugs de permisos) ni `review-performance.md` (bugs de perf). Los cito cuando la cadena causal pasa por ahí.

---

## 1. Veredicto (5 líneas)

1. **No existe ni una sola cuota por organización en todo el sistema.** Ni conexiones, ni caché, ni tiempo de cron, ni eventos, ni usuarios, ni retención, ni tokens de Aurum. El campo `plan` del schema (`prisma/schema.prisma:26`) es decorativo: se lee para pintarlo en pantalla y **nunca** gatea nada.
2. **El cliente 12 no "consume su parte": consume el todo.** Todos los recursos son first-come-first-served sobre una única base Neon de 4 CU, un único pool lógico de 24 conexiones por instancia y presupuestos de cron fijos (220s / 250s) que no crecen con la cantidad de orgs.
3. **Hay al menos cuatro crons donde el fallo de una org corta el lote entero** (`digest`, `anomalies`, `ads-utm-audit`, y el más grave: `refresh-pixel-rollups` vía `backfillDay`). "Un cliente roto rompe a todos" no es hipótesis: es la estructura del código.
4. **El momento de máximo riesgo para los 11 clientes existentes es la entrada del cliente 12.** El backfill es una cola FIFO global sin cuota, sin throttle, sin ventana horaria, disparada inmediatamente al aprobar, con 4-5 lambdas concurrentes cada minuto contra la misma DB que sirve los dashboards en vivo.
5. **No se puede suspender ni exportar una org.** Solo se puede borrar (`wipe-account`), y el borrado deja residuos en las tablas Silver/Gold/rollup/caché que no están en su lista. Vender un contrato con SLA, con cláusula de portabilidad de datos o con cobranza por mora hoy no tiene soporte técnico.

---

## 2. Inventario: recursos compartidos sin cuota

| # | Recurso | Dónde vive | Cómo se reparte hoy | ¿Qué impide que un cliente lo consuma todo? |
|---|---|---|---|---|
| R1 | **Pool de conexiones Postgres** | `src/lib/db/client.ts:59` — `connection_limit=24&pool_timeout=160&statement_timeout=150000` | Global por instancia de lambda. Ninguna reserva por org. | **Nada.** Un solo `/api/metrics/pixel` de una org grande dispara ~34 queries (review-performance C4) → 10 sobran y esperan. Con `pool_timeout=160` **esperan hasta 160s** en vez de fallar rápido: la org que llega segunda se cuelga, no se rompe. |
| R2 | **Segundo pool oculto** | `src/lib/pixel/rollup-backfill.ts:37-49` — `PrismaClient` dedicado con `connection_limit=4&statement_timeout=500000` | Se suma al de R1 en la misma instancia (28 conexiones lógicas). | **Nada.** Y su `statement_timeout` de **500 s** existe explícitamente porque el rollup de la org grande tarda 150-500s. Ese statement retiene compute de Neon por 8 minutos mientras el resto de los clientes compite por la misma cache. |
| R3 | **Cómputo de Neon** | 4 CU / 16 GB RAM, autosuspend 5 min (`BACKLOG_PENDIENTES.md:41-53`) | Un solo compute para las 4 orgs. Working set medido ~28 GB contra 16 GB de cache → hit rate degradado. | **Nada.** `review-performance.md:543` ya lo dice: con 5 orgs grandes son **>100 GB de working set contra 16 GB de cache**, y "ninguna cantidad de CU razonable lo arregla". La cache de Neon es el recurso más escaso y el más compartido. |
| R4 | **Caché en memoria (nivel 1)** | `src/lib/api-cache.ts:44-48` — `Map` global, `MAX_ENTRIES = 500` | Compartido por todas las orgs. El comentario dice "500 cubre ~10 orgs × 50 combinaciones". | **Nada.** Al llegar a 500, `setCache` (`api-cache.ts:159-173`) purga vencidas y si sigue lleno **borra la mitad más vieja sin mirar de qué org es**. Un cliente con muchos rangos/filtros abiertos desaloja las entradas de los demás. Con 12 orgs el supuesto de diseño ya no se cumple. |
| R5 | **Tabla `api_cache` (nivel 2)** | `src/lib/api-cache-shared.ts:57-111` | Una fila por `cache_key`; la key lleva orgId (`metrics/orders/route.ts:167`, `metrics/products/route.ts:130`, `metrics/pixel/route.ts:195`) → **no hay fuga de contenido**, pero sí competencia por espacio y por I/O. | **Nada.** Cada hit de nivel 2 lee ~1 MB de JSONB (`review-performance.md:317`). Sin tope de filas por org y con purga sólo por vencimiento (`purgeExpiredSharedCache`, `api-cache-shared.ts:115`). |
| R6 | **Presupuesto de `warm-cache`** | `src/app/api/cron/warm-cache/route.ts:247` — `TIME_BUDGET_MS = 220_000` | Bucle **secuencial** org → rango → endpoint (`:249-300`), presupuesto FIJO que no escala con la cantidad de orgs. | **Nada, y es peor: hay orden implícito.** La query de orgs (`:201-211`) **no tiene `ORDER BY`**. Quien queda al final de un orden arbitrario nunca se calienta cuando el presupuesto se agota (`budgetHit`, `:252`). |
| R7 | **Presupuesto de `refresh-pixel-rollups`** | `route.ts:141` — `INVOCATION_BUDGET_MS = 250_000`; reserva por día `rollup-backfill.ts:87` `DAY_RESERVE_FLOOR_MS = 180_000` | Una tabla por invocación, **para todas las orgs juntas** (`rollup-backfill.ts:379-390`, `backfillDay`). | **Nada.** El presupuesto es por *día calendario × todas las orgs*. Cuando el día completo deja de entrar en 250s, `canStartAnotherDay` (`rollup-backfill.ts:103`) devuelve `false` en el primer día → **cero días procesados, cursor clavado, para todos**. Ver escenario E5. |
| R8 | **Cola de backfill** | `src/lib/backfill/job-manager.ts:71-84` — `pickNextJob()` | `ORDER BY status, createdAt ASC LIMIT 1`: **FIFO global, un job a la vez, sin noción de org**. | **Nada.** El backfill de 252.701 órdenes de un cliente bloquea la cola completa. No hay round-robin, ni prioridad, ni cuota de chunks por org. |
| R9 | **Invocaciones concurrentes del runner** | `vercel.json` cron `* * * * *` + `backfill-runner/route.ts:37` (`maxDuration=300`) y `:43` (`LOOP_BUDGET_MS=240_000`) | Una invocación dura 4 min mientras arrancan 4 nuevas → **4-5 lambdas vivas** (ya señalado en `review-performance.md:434`). | **Nada.** El único freno es el cooldown de 2 min de `pickNextJob` (`job-manager.ts:72`), que es un `SELECT` seguido de `UPDATE` sin `FOR UPDATE SKIP LOCKED` → no es un lock, es una carrera. Con N jobs de N orgs, las N lambdas toman N jobs distintos y corren en paralelo. |
| R10 | **Rate limit del pixel** | `src/app/api/pixel/event/route.ts:38-52` — `RATE_LIMIT = 100` ev/s "por org" | `Map` **en memoria del proceso**. Con N instancias calientes el límite real es `100 × N` ev/s por org (confirmado en `review-performance.md:416`). | **Nada efectivo.** Es un límite de cortesía, no una cuota. Y no protege el recurso que importa: cada evento aceptado es un `INSERT` en `pixel_events` (43 GB) contra la misma Neon que sirve los dashboards de todos. |
| R11 | **Dedup de PAGE_VIEW** | `pixel/event/route.ts:57-77` — `recentPageViews` Map, tope 500 | Compartido entre orgs en el mismo proceso. | **Nada.** Un cliente con mucho tráfico llena los 500 slots y **degrada el dedup de los demás** → inflación de page_views ajena. |
| R12 | **Cuota de tokens de Aurum** | Una sola `ANTHROPIC_API_KEY` (`src/app/api/chat/route.ts:14`, `insights/route.ts:9`, `aurum/section-insight/route.ts:11`, `cron/digest/route.ts:185-187`, `lib/anomaly/detector.ts:197`, `lib/ai/vision-analyzer.ts:67`) | Una key para todo el producto. `aurum_usage_logs` **mide** el consumo (`api/admin/usage/route.ts`) pero nadie lo limita. | **Nada.** No hay cuota por org, ni corte por umbral. Un cliente que usa el chat intensivamente consume el rate limit de la cuenta Anthropic → los demás reciben 429 (`lib/ai/vision-analyzer.ts:215` sólo lo detecta, no lo evita). |
| R13 | **Casilla de alertas operativas** | `warm-cache/route.ts:52` y `refresh-pixel-rollups/route.ts:67`: `"tlapidus@99media.com.ar"` hardcodeado; también `cron/control-alerts/route.ts:31` | Todas las alertas de pipeline de todos los clientes van a **una misma casilla personal**. | Además el mail de incoherencia (`refresh-pixel-rollups/route.ts:80-82`) lista `org <id>: rollup X vs crudo Y` de **todas** las orgs en un mismo cuerpo. Y el cooldown es una variable de módulo (`:69`, `warm-cache:58`) → en serverless se pierde al rotar instancias. Con 12 clientes esto no escala como canal de operación. |
| R14 | **Tiempo de `/api/sync` y `/api/sync/chain`** | `sync/route.ts:106-113`, `sync/chain/route.ts:158-162` | Bucle secuencial sobre todas las conexiones VTEX activas, `maxDuration=800` (`vercel.json`). | Hay try/catch por org (bien), pero **no hay presupuesto de tiempo**: las orgs al final de la lista simplemente no se sincronizan cuando la función llega al wall de 800s. Nadie se entera: el JSON de respuesta no lo lee nadie. |
| R15 | **Concurrencia de `vtex-sync-recent`** | `cron/vtex-sync-recent/route.ts:51-58` — `concurrencyLimit = 5` | 5 syncs completos de VTEX en paralelo cada 30 min. | **Nada por org.** Con 12 orgs son 3 tandas de 5 syncs concurrentes, cada uno escribiendo órdenes, cada 30 minutos, contra las mismas 24 conexiones que usan los dashboards. |
| R16 | **Retención de datos** | — | No existe. `pixel_events` guarda historia cruda indefinida (24M filas / 43 GB para una org). | **Nada.** No hay TTL, ni particionado, ni archivado. Cada cliente nuevo agranda permanentemente la tabla caliente de todos. |

---

## 3. Escenarios de vecino ruidoso (cadena causal trazable)

### E1 — Hot Sale del cliente nuevo: el pico de ingesta apaga los dashboards de los otros once

1. El cliente X lanza Hot Sale. Su pixel dispara, digamos, 800 ev/s.
2. El rate limit es `100 ev/s por org` — pero vive en `rateLimitMap`, un `Map` **en la memoria del proceso** (`src/app/api/pixel/event/route.ts:38-52`). Vercel escala a N instancias con el tráfico → el techo efectivo es `100 × N`. Confirmado en `review-performance.md:416`.
3. Cada evento aceptado escribe en `pixel_events` (tabla de 43 GB) desde el mismo `prisma` singleton con `connection_limit=24` (`src/lib/db/client.ts:59,75`).
4. Los `INSERT` masivos ensucian la local file cache de Neon (16 GB contra un working set ya de ~28 GB, `BACKLOG_PENDIENTES.md:50-51`). Es el mismo mecanismo que `review-performance.md:57` describe para los rollups: se ataca la oferta (CU) y nunca la demanda.
5. Los clientes Y y Z abren su dashboard. `/api/metrics/pixel` corre sus ~34 queries (`review-performance.md:111`) contra un pool donde las conexiones están ocupadas y una cache que ya no tiene sus páginas.
6. El compute se pasa de `GLOBAL_TIMEOUT_MS` y el endpoint devuelve `buildEmptyMockResponse()` — **HTTP 200 con todo en cero** (`review-performance.md:93`, `:525`).
7. **Resultado:** el cliente Y no ve "el sistema está lento". Ve **que no vendió nada**. Y no hay ninguna señal en la UI que distinga "cero real" de "cero por saturación del vecino".

> Nota de diseño: el rate limit del pixel protege al *proceso*, no a la *base*. La cuota que falta no es de requests: es de escrituras por org por minuto contra `pixel_events`.

### E2 — Entra el cliente 12 y su backfill congela la cola de los otros

1. Admin aprueba: `POST /api/admin/onboardings/[id]/approve-backfill` crea los jobs (`route.ts:120-148`) y **dispara el runner inmediatamente** vía `waitUntil(fetch(runnerUrl))` (`:181-188`). No hay ventana horaria, no hay diferimiento, no hay confirmación de capacidad.
2. `pickNextJob()` (`src/lib/backfill/job-manager.ts:71-84`) es **FIFO global**: `ORDER BY CASE status..., createdAt ASC LIMIT 1`. No tiene `organizationId` en el `WHERE` ni en el `ORDER BY`. **No existe la noción de "un turno por cliente".**
3. El cron corre `* * * * *` (`vercel.json`) con `maxDuration=300` y `LOOP_BUDGET_MS=240_000` (`backfill-runner/route.ts:37,43`) → hasta 5 lambdas simultáneas (`review-performance.md:434`). Con jobs de varias orgs en cola, cada lambda toma uno distinto (el cooldown de 2 min de `job-manager.ts:72` los separa) → **N backfills en paralelo**.
4. Cada chunk son 500 órdenes (`vtex-processor.ts:43`, `ml-processor.ts:35`) con enriquecimiento concurrente (`ml-processor.ts:36`, `ENRICH_CONCURRENCY = 5`), y el loop hace hasta 50 iteraciones por invocación (`backfill-runner/route.ts:47`) = **hasta 25.000 órdenes por invocación, cada minuto**.
5. Esto es exactamente lo que tumbó Neon con Arredo: *"durante el onboarding de Arredo (~24M eventos / 43GB), Neon se degradó/cayó repetidas veces bajo la carga de los backfills ('Can't reach database server', statements colgados)"* — `BACKLOG_PENDIENTES.md:43-45`. El resultado fueron 252.701 órdenes (`CLAUDE_STATE.md:46`).
6. **Resultado:** los otros once clientes ven lo de E1 (dashboards en cero o colgados) durante horas o días, sin ninguna notificación, y sin que el sistema sepa que el causante es el backfill. Y si un cliente existente necesita un re-backfill esa semana, queda **detrás en la misma cola global**.

### E3 — Dos clientes nuevos la misma semana

1. Dos onboardings aprobados → 4 jobs (VTEX + ML de cada uno) en la misma tabla `backfill_jobs`.
2. `pickNextJob` no reparte: ordena por `createdAt`. El segundo cliente espera a que el primero termine **completo**, salvo que las lambdas concurrentes de R9 los tomen simultáneamente — que es el escenario *peor*, no el mejor: dos backfills masivos concurrentes contra 4 CU.
3. No hay ningún guard que diga "ya hay un backfill activo de otra org, encolá". El único guard existente es *por org y plataforma*: `approve-backfill/route.ts:113-118` sólo chequea `WHERE organizationId = $1 AND platform = 'VTEX' AND status IN ('QUEUED','RUNNING')`.
4. **Resultado:** ambos clientes nuevos tardan el doble, los once existentes sufren el doble de degradación, y no hay panel que muestre "la capacidad de ingesta está comprometida".

### E4 — 50 usuarios internos de un cliente mirando el dashboard

1. El caché de nivel 1 es por instancia (`api-cache.ts:44`). 50 usuarios se reparten en varias instancias; cada instancia fría es un miss.
2. `/api/metrics/orders` no toma el lock anti-herd: `tryAcquireRefreshLock` existe (`api-cache.ts:111`) y otras rutas lo usan, **esta no** (`review-performance.md:214`). N usuarios concurrentes = N recomputes completos.
3. Cada recompute son 28-34 queries (`review-performance.md:111`) contra `connection_limit=24` (`db/client.ts:59`).
4. `pool_timeout=160`: las requests que exceden el pool **esperan hasta 160 segundos** en vez de fallar. El síntoma para los otros clientes no es un error: es que todo se cuelga.
5. Mientras tanto, cada respuesta de ese cliente entra al `Map` de 500 entradas (`api-cache.ts:48`). Al llenarse, `setCache` **borra la mitad más vieja sin distinguir org** (`api-cache.ts:165-172`) → las entradas calientes de los otros clientes se evaporan → sus próximas cargas también son miss → se realimenta.
6. **Resultado:** un cliente con muchos usuarios internos degrada a todos sin violar ninguna regla, porque no hay ninguna regla. No hay límite de usuarios por org en el schema.

### E5 — Una org con datos corruptos congela las analíticas de las doce (el peor)

Ésta es la cadena más corta y la más destructiva.

1. `refresh-pixel-rollups` corre cada 15 min (`vercel.json`: `3,18,33,48 * * * *`) y procesa **una tabla por invocación para TODAS las orgs** (`route.ts:232-235` y el comentario de `rollup-backfill.ts:441-447`).
2. Llama a `runRollupBackfill`, que enumera las orgs con `SELECT DISTINCT "organizationId" ... ORDER BY 1` (`rollup-backfill.ts:494-497`) y por cada día llama a `backfillDay`.
3. **`backfillDay` (`rollup-backfill.ts:379-390`) es un `for (const org of orgs) { touched += await backfillDayOrg(...) }` SIN try/catch por org.**
4. Dentro de `backfillDayOrg`, los `INSERT ... hll_add_agg` se hacen con `await rollupDb().$executeRawUnsafe(...)` **sin protección** (`rollup-backfill.ts:187`, `:221`, `:233`, `:244`, `:277`, `:303`, `:327`). El único `try/catch` está en el bloque de `pixel_daily_channel` (`:355-373`).
5. Si el statement de **una** org falla — dato corrupto, `statement_timeout` de 500s superado, tabla con una fila envenenada — la excepción sube por `backfillDay` → `runRollupBackfill` → el cron devuelve 500 (`route.ts:338-341`) y **el cursor del día no avanza**.
6. La próxima invocación reintenta el mismo día, falla igual. La tabla queda clavada. El bug de "tabla clavada" ya pasó y está documentado (`route.ts:277-283`, BP-ROLLUP-STUCK).
7. Con los rollups atrasados, `/api/metrics/pixel` cae al camino Bronze en vivo (24M filas), se pasa de `GLOBAL_TIMEOUT_MS` y devuelve el mock en cero (`review-performance.md:525`).
8. **Resultado: los datos malos de un solo cliente ponen la pantalla de analytics de LOS DOCE en cero.** Y el aviso llega por mail a una casilla personal hardcodeada (`warm-cache/route.ts:52`), con cooldown en memoria de proceso.

**Variante de capacidad, sin ningún dato corrupto.** El presupuesto del día es `INVOCATION_BUDGET_MS = 250_000` (`route.ts:141`) y la reserva arranca en `DAY_RESERVE_FLOOR_MS = 180_000` (`rollup-backfill.ts:87`) y **se auto-calibra al día más lento visto** (`:534`). Ese "día" incluye **todas las orgs**. El comentario de `route.ts` ya admite que la tabla `funnel` tarda ~190s con las orgs actuales. Al agregar orgs, el día total cruza los 250s, `canStartAnotherDay` (`rollup-backfill.ts:103,522`) devuelve `false` **antes de procesar el primer día**, y el cursor deja de avanzar para siempre. Sin un solo error en los logs.

### E6 — El catálogo enorme del cliente nuevo deja al resto sin caché caliente

1. `warm-cache` corre cada 5 min y hace `orgs × 4 rangos × 2 endpoints` fetches **secuenciales** (`route.ts:249-300`), con `PER_FETCH_TIMEOUT_MS = 20_000` y `TIME_BUDGET_MS = 220_000` (`:244,247`).
2. Hoy: 4 orgs × 4 × 2 = 32 fetches. Con 12 orgs: **96 fetches**. El presupuesto **no cambió**: sigue siendo 220s.
3. Si los fetches de una org grande llegan al timeout de 20s (`/api/metrics/products` sobre un catálogo enorme es exactamente eso), esa sola org consume `4 × 2 × 20s = 160s` de los 220s disponibles.
4. Se dispara `budgetHit` (`:252`) y el `break outer` corta el bucle. Las orgs restantes **nunca se calientan**.
5. La lista de orgs sale de un `SELECT ... FROM organizations o WHERE EXISTS (...)` **sin `ORDER BY`** (`route.ts:201-211`): quién queda adentro y quién afuera del presupuesto lo decide el orden físico de las filas en Postgres. Nadie eligió eso.
6. Un cliente sin warm paga el compute completo en cada carga fría (>85s según el propio código, `review-performance.md:93`) → mock en cero.
7. **Resultado:** con 12 clientes, el warm-cache deja de ser un servicio y pasa a ser una lotería que favorece a quien esté primero en el heap.

---

## 4. "Un cliente roto rompe a todos": lista de fallas compartidas

| Cron | Archivo:línea | Patrón | Radio de explosión |
|---|---|---|---|
| **`refresh-pixel-rollups`** | `src/lib/pixel/rollup-backfill.ts:379-390` (`backfillDay`) + `:187,221,233,244,277,303,327` (awaits sin protección) | `for (const org of orgs)` **sin try/catch por org**. La excepción sube y aborta el día completo. | 🔴 **Máximo.** Cursor clavado → rollups del pixel stale para TODAS las orgs → `/pixel/analytics` en cero para todos. Ver E5. |
| **`digest`** (semanal, mails a clientes) | `src/app/api/cron/digest/route.ts:38` (`for (const org of orgs)`), `:52` (`Promise.all` de 5 queries), `:~215` (`await sendEmail(...)`) | El `try` está **fuera** del bucle (`:27`), el `catch` en `:221`. El único `try` interno (`:184-205`) cubre sólo la llamada a Claude. Un timeout de query o un fallo de Resend de UNA org **aborta el bucle**. | 🔴 Los clientes que van después en la lista **no reciben su digest semanal**. Silencioso: el 500 lo ve Vercel, no un humano. |
| **`anomalies`** (diario, mails a clientes) | `src/app/api/cron/anomalies/route.ts:39` (`for (const org of orgs)`), `:53`, `:70`, `:110` (`Promise.all` de queries pesadas) | Idéntico: `try` global en `:31`, `catch` en `:274`, **nada por org**. | 🔴 Las orgs posteriores no reciben alertas de anomalía. Es una funcionalidad de detección que falla en silencio justo cuando el sistema está bajo estrés. |
| **`ads-utm-audit`** (diario) | `src/app/api/cron/ads-utm-audit/route.ts:52` (`for (const org of orgs)`), `:55` (`pixelEvent.findMany` con `take: 5000` sobre 24M filas) | El `try/catch` de `:116-134` cubre sólo el `insight.create`. **El `findMany` de `:55` no está protegido**: un timeout aborta el lote. | 🟠 Las orgs posteriores no reciben insights de UTMs faltantes. |
| **`/api/sync` (GET, 3am)** | `src/app/api/sync/route.ts:106-113` | Tiene try/catch por org (**bien**), pero **no tiene presupuesto de tiempo** y es secuencial. `maxDuration=800` (`vercel.json`). | 🟠 Falla por *starvation*, no por excepción: las últimas orgs no se sincronizan cuando la función llega al wall. Y nadie lee la respuesta. |
| **`/api/sync/chain` (cada 2h)** | `src/app/api/sync/chain/route.ts:158-162` | `runChainForOrg` sí captura (`:41,111`) y libera el lock en `finally` (`:114`). **Bien.** Pero mismo problema de starvation secuencial sin budget. | 🟡 Igual que arriba. |
| **`refresh-gold-daily-revenue`** | `src/app/api/cron/refresh-gold-daily-revenue/route.ts:80-137` | **No itera orgs**: los 4 upserts Gold son globales (`buildGoldDailyRevenueUpsert()` recibe sólo `since`). Cada uno en su propio try/catch (bien aislados entre sí). | 🟠 Pero el volumen es de todas las orgs juntas en una transacción. Cuando el upsert global se vuelva demasiado pesado por el dato de una org, **falla para todas a la vez** — y no hay forma de excluir una org del lote. |
| **`refresh-silver-orders`** | `src/app/api/cron/refresh-silver-orders/route.ts:70-82` | ✅ try/catch por org + `INVOCATION_BUDGET_MS = 250_000` con `break`. **Es el patrón correcto.** | 🟡 Residual: el `break` por presupuesto corta sobre `SELECT id FROM organizations` **sin `ORDER BY`** (`:58-60`) → las mismas orgs quedan siempre al final. Sin rotación, un cliente puede no refrescarse nunca. |
| **`refresh-pixel-name-dict`** | `route.ts:61-85` | ✅ try/catch por org + deadline. Buen patrón. | 🟡 Mismo residual de orden fijo. |
| **`alerts-scheduler`** (cada 15 min) | `route.ts:47-66` | ✅ try/catch por regla. | 🟡 Sin presupuesto ni cuota de reglas por org: una org con muchas reglas retrasa las alertas de las demás más allá de su ventana de 15 min. |
| **`vtex-sync-recent`** | `route.ts:56-88` | ✅ `Promise.all` con try/catch **dentro** del map → no rechaza entero. | 🟡 Pero 5 syncs completos concurrentes sin cuota por org, cada 30 min, contra las mismas 24 conexiones. |

> **Patrón a normalizar:** `refresh-silver-orders:70-82` ya tiene la forma correcta (try/catch por org + budget + `break`). Los cuatro crons rojos deberían copiarla textualmente. Es un cambio mecánico de bajo riesgo.

---

## 5. Datos de un cliente visibles para otro (lo estructural)

Lo bueno primero, para no alarmar de más:

- ✅ **Las claves de caché llevan orgId** en las tres rutas pesadas: `metrics/orders/route.ts:167`, `metrics/products/route.ts:130`, `metrics/pixel/route.ts:195-199` (`buildPixelCacheKey`), `metrics/seo/route.ts:524`. **No hay fuga de contenido entre orgs por caché.** Lo que se comparte es el *espacio*, no el *dato* (R4/R5).
- ✅ **El lock de sync es por org** (`src/lib/sync-lock.ts:20-27`, rechaza sin `orgId`).
- ✅ `/control` está gateado por `isInternalUser()` (`src/app/control/layout.tsx:21-23`).

Lo que sí es estructural:

1. **Logs mezclados en un único stream.** `src/lib/logger.ts:17` acepta `orgId` como **opcional** y todo sale por `console.log` al log compartido de Vercel. No hay separación por tenant ni forma de darle a un cliente sus propios logs. Cualquiera con acceso al proyecto Vercel ve la actividad de los doce.
2. **Alertas operativas a una casilla personal hardcodeada.** `warm-cache/route.ts:52`, `refresh-pixel-rollups/route.ts:67`, `cron/control-alerts/route.ts:31`, `me/google-auth-request/route.ts:21`, `me/meta-auth-request/route.ts:29`, `me/onboarding/submit-wizard/route.ts:231` → todos `tlapidus@99media.com.ar`. Y el mail de incoherencia (`refresh-pixel-rollups/route.ts:80-82`) enumera org por org en el mismo cuerpo. Con 12 clientes esto no es un canal: es ruido con datos de todos.
3. **`/api/admin/usage` expone "Top orgs by volume"** con una key con **fallback hardcodeado** en el código: `key !== process.env.ADMIN_SECRET && key !== "usage-2026"` (`src/app/api/admin/usage/route.ts:30`). Es un ranking cross-tenant de consumo detrás de una string que está en el repo.
4. **76 endpoints aceptan `orgId`/`org` por query string** (`grep` sobre `src/app/api`). El review de seguridad ya cubrió los IDOR concretos (`review-seguridad.md:94`, `:151-160`, `:496`). Lo relevante acá para expansión: **el orgId es un parámetro de entrada de primera clase en todo el sistema**, no un dato derivado de la sesión. Cada endpoint nuevo es una oportunidad de repetir el bug, y no hay un helper único que lo impida.
5. **`view-as-org` no expira** (`review-seguridad.md:413-417`) y **permite escrituras** (a diferencia de impersonate). Con 4 clientes es un riesgo de auditoría; con 12 es un riesgo de contrato.
6. **Cuatro rutas destructivas tienen `@ts-nocheck`** (`review-seguridad.md:508`), incluida `wipe-account` — la que borra una org entera.

---

## 6. Ciclo de vida de una organización: qué existe y qué falta

| Operación | ¿Existe? | Evidencia |
|---|---|---|
| **Crear** | ✅ Completo | Flujo de onboarding: `public/onboarding/start` → `admin/onboardings/[id]/activate` → `approve-backfill` → `activate-client`. Estados `PENDING/NEEDS_INFO/BACKFILLING/READY_FOR_REVIEW/ACTIVE` (`backfill-runner/route.ts:198-205`). Es la parte más madura. |
| **Suspender / pausar por falta de pago** | ❌ **No existe** | No hay `status`, `suspendedAt`, `isActive` ni nada en `model Organization` (`prisma/schema.prisma:22-30`). El enum `OnboardingStatus` no tiene estado suspendido. Los crons enumeran orgs con `findMany({})` sin filtro (`digest:28`, `anomalies:33`, `ads-utm-audit:43`, `refresh-pixel-name-dict:43`) y `refresh-silver-orders:59` hace `SELECT id FROM organizations` pelado. **Un cliente que deja de pagar sigue consumiendo recursos igual que uno que paga.** La única forma de cortarlo es borrarlo. |
| **Borrar** | ⚠️ Parcial y con residuos | `POST /api/admin/orgs/[orgId]/wipe-account` (`route.ts:32-53`, con confirmación `WIPE-{orgId}`). **Lo que NO borra** — no está en `optionalTables` (`:124-146`) ni en el cuerpo: `silver_orders`, `silver_customer_firsts`, `gold_daily_revenue`, `gold_segments`, `gold_product_sales`, `gold_customer_daily`, las 7 tablas `pixel_daily_*`, `pixel_visitor_first_source`, `pixel_product_name`, `api_cache`, `aurum_usage_logs`. Además declara explícitamente que **conserva `email_log` y `leads`** (`:16-17`, `:196`). El borrado además es **best-effort sin transacción** (`:92-101`, `:147-155` con `catch {}` silencioso): puede quedar a medias sin que nadie se entere. |
| **Exportar los datos del cliente** | ❌ **No existe** | Los únicos exports del repo son `api/influencers/export` y las plantillas de `finance/shipping-rates`. No hay endpoint de exportación integral por org. **Implicancia legal directa:** un pedido de portabilidad o de acceso a datos (Ley 25.326 / GDPR si el cliente tiene tráfico europeo) hoy se resuelve a mano con SQL contra producción. |
| **Migrar / renombrar** | ⚠️ Sólo cosmético | `PUT /api/settings/organization` (`route.ts:199-213`) actualiza `name`/`slug`/`settings`. **No hay reasignación de datos entre orgs**, ni fusión, ni split (el caso "el cliente se divide en dos marcas"). |
| **Plan / facturación** | ❌ Decorativo | `plan Plan @default(STARTER)` (`prisma/schema.prisma:26`), enum `STARTER/GROWTH/PRO` (`:97-101`). **Todos sus usos son `select: { plan: true }` seguido de render**: `admin/clientes/route.ts:66,105`, `admin/clientes/[orgId]/route.ts:36,78`, `control/client/[id]/route.ts:32,114`, `control/clients-health/route.ts:84,157`, `settings/organization/route.ts:58,74,199,213`, y en UI `admin/clientes/page.tsx:165`, `settings/organizacion/page.tsx:324`, `control/clientes/page.tsx:232`. **Cero llamadas de gating.** No hay tabla de suscripción, ni de facturación, ni de uso facturable. |

### Límites por cliente que hoy no existen (condicionan el pricing)

Búsqueda exhaustiva en `prisma/schema.prisma` y `src/`:

- ❌ Límite de eventos de pixel por mes/día
- ❌ Límite de usuarios por org (no hay `maxUsers` ni conteo)
- ❌ Límite de retención de datos (no hay TTL ni particionado ni archivado)
- ❌ Cuota de tokens de Aurum por org (se **mide** en `aurum_usage_logs`, se lee en `admin/usage`, **no se limita**)
- ❌ Límite de órdenes / conexiones / campañas
- ❌ Cuota de tiempo de cron o de invocaciones

**Consecuencia comercial concreta:** hoy no se puede diferenciar STARTER de PRO por nada más que el precio, porque no hay ninguna palanca técnica que distinga a uno de otro. Y el costo marginal real de un cliente (compute de Neon + invocaciones de Vercel + tokens de Anthropic) **no se mide por org**, así que tampoco se puede fijar un precio con margen conocido.

---

## 7. Cambios mínimos para que un cliente nuevo no ponga en riesgo a los que ya están

Ordenados por relación (riesgo evitado) / (esfuerzo). Ninguno requiere rediseñar el producto.

### Bloque A — Contener el radio de explosión (el más barato y el más urgente)

**A1. try/catch por org en los cuatro crons rojos.** Copiar el patrón que ya existe en `refresh-silver-orders/route.ts:70-82` a:
- `src/lib/pixel/rollup-backfill.ts:379-390` (`backfillDay`) — **el más importante**: envolver `backfillDayOrg` y acumular errores en el resultado en vez de propagarlos. Una org corrupta deja de congelar a las doce.
- `src/app/api/cron/digest/route.ts:38`
- `src/app/api/cron/anomalies/route.ts:39`
- `src/app/api/cron/ads-utm-audit/route.ts:52`

**A2. Rotación en los bucles con presupuesto.** Agregar `ORDER BY` estable + cursor persistido (o rotación por hora) a los `SELECT` de orgs que hoy no tienen orden: `warm-cache/route.ts:201-211`, `refresh-silver-orders/route.ts:58-60`, `refresh-pixel-name-dict/route.ts:43`. Hoy, cuando el presupuesto se agota, **siempre pierden los mismos**.

**A3. Presupuesto de tiempo en `/api/sync` y `/api/sync/chain`.** Ambos son bucles secuenciales sin budget contra `maxDuration=800` (`sync/route.ts:106`, `chain/route.ts:158`). Agregar el mismo `break` por presupuesto + reportar `budgetHit`.

**A4. Alertas por org, no a una casilla.** Reemplazar los hardcodes de `warm-cache:52`, `refresh-pixel-rollups:67`, `control-alerts:31` por una lista configurable, y **separar** el mail de incoherencia por org en vez de enumerar todas en un cuerpo (`refresh-pixel-rollups:80-82`).

### Bloque B — Convertir el backfill en un evento controlado

**B1. Fairness en la cola.** `pickNextJob()` (`job-manager.ts:71-84`) debe elegir round-robin por org, no FIFO global: `ORDER BY` sobre "org con menos chunks procesados en la última hora". Cambio de una query.

**B2. Tope de backfills concurrentes.** Un guard en `backfill-runner` que rechace si ya hay N jobs `RUNNING` con `lastChunkAt` fresco de otras orgs. Hoy no hay ninguno: el guard de `approve-backfill/route.ts:113-118` es por org+plataforma, no global.

**B3. Lock real en vez de carrera.** `pickNextJob` hace `SELECT ... LIMIT 1` y después `markJobRunning` en otra query (`job-manager.ts:73-95`). Con 5 lambdas concurrentes eso es una carrera. Un `FOR UPDATE SKIP LOCKED` lo resuelve y de paso hace innecesario el cooldown de 2 minutos.

**B4. Ventana horaria y aprobación con capacidad.** `approve-backfill/route.ts:181-188` dispara el runner **inmediatamente**. Agregar un campo `scheduledFor` en `backfill_jobs` y que `pickNextJob` lo respete permite correr los backfills grandes de madrugada. Es el cambio que más protege a los clientes existentes por menos código.

### Bloque C — Poner cuotas donde hoy no hay ninguna

**C1. Rate limit del pixel en la base, no en memoria.** El `Map` de `pixel/event/route.ts:38-52` es `100 × N instancias`. Un contador por org en Postgres o Redis (ventana deslizante) lo convierte en una cuota real. Es también el primer paso hacia el pricing por eventos.

**C2. Cuota de Aurum por org.** `aurum_usage_logs` ya tiene los datos (`admin/usage/route.ts`). Falta el chequeo antes de llamar a Anthropic en `chat/route.ts:14`, `insights/route.ts:9`, `aurum/section-insight/route.ts:11`.

**C3. Presupuestos de cron proporcionales a la cantidad de orgs.** `TIME_BUDGET_MS = 220_000` (`warm-cache:247`) e `INVOCATION_BUDGET_MS = 250_000` (`refresh-pixel-rollups:141`) son constantes fijas. Como mínimo, dividir el presupuesto entre las orgs para garantizar un piso por cliente, y **alertar cuando `budgetHit` sea true dos corridas seguidas** (hoy se reporta en el JSON y nadie lo lee).

**C4. Partir el rollup del pixel por org.** `backfillDay` procesa "un día × todas las orgs" contra un presupuesto fijo (`rollup-backfill.ts:379-390` + `:103`). Cambiar la unidad de trabajo a "(org, día, tabla)" con cursor propio por org elimina de raíz E5 y su variante de capacidad. Es el cambio estructural más valioso del informe.

### Bloque D — Ciclo de vida vendible

**D1. Estado de la org.** Agregar `status` (`ACTIVE`/`SUSPENDED`/`ARCHIVED`) a `model Organization` (`prisma/schema.prisma:22-30`) y filtrarlo en los ~6 lugares que enumeran orgs (`digest:28`, `anomalies:33`, `ads-utm-audit:43`, `refresh-pixel-name-dict:43`, `refresh-silver-orders:59`, `warm-cache:201`). Sin esto no se puede cortar el servicio a un moroso salvo borrándolo.

**D2. Completar `wipe-account`.** Agregar a `optionalTables` (`wipe-account/route.ts:124-146`) las tablas Silver/Gold/`pixel_daily_*`/`pixel_visitor_first_source`/`pixel_product_name`/`api_cache`/`aurum_usage_logs`, y envolver en una transacción. Hoy borrar una org deja su dato agregado vivo en el sistema.

**D3. Endpoint de exportación integral por org.** No existe. Es requisito de cualquier contrato con cláusula de portabilidad, y hoy se resolvería con SQL a mano contra producción.

**D4. Convertir `plan` en algo real.** Una tabla de límites por plan (eventos/mes, usuarios, retención, tokens de Aurum) leída por los guards de C1/C2. Hasta que exista, el `plan` del schema es una etiqueta y el pricing no tiene base técnica.

---

## Nota de método

- Todo lo afirmado está verificado por lectura de código en el commit `9ad4616d`. Cuando cito `review-performance.md` o `review-seguridad.md` es porque el eslabón de la cadena ya estaba documentado ahí y no tenía sentido re-derivarlo.
- **No verificado (requiere infra, no repo):** el tope de conexiones del pooler de Neon, el plan real de Vercel (concurrencia de lambdas, límite de invocaciones), el rate limit de la cuenta de Anthropic, y el rate limit real de las APIs de VTEX/MELI por cliente. Los cuatro son variables que definen dónde exactamente se rompe cada escenario; el hecho de que ninguno esté acotado *desde el código* no depende de sus valores.
- **No verificado:** los tiempos concretos que cito para el rollup (~190s de `funnel`, >85s de compute de la org grande) salen de comentarios del propio código (`refresh-pixel-rollups/route.ts:236`, `metrics/pixel/route.ts:79-85`) y del review de performance, no de una medición mía. `review-performance.md:440` (L1) advierte que en este repo los comentarios de perf tienen deriva sistemática respecto del código.
