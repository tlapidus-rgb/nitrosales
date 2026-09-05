# Review de `fix/expansion-gate-e0` vs `origin/main` (9ad4616d)

Revisión en frío, sin contexto previo del trabajo. 8 commits, ~10.300 líneas (casi todo
documentación). Código real revisado: `src/lib/pixel/rollup-backfill.ts`,
`src/lib/sync/chain-budget.ts`, 6 rutas de `src/app/api/`, `vercel.json`,
`.github/workflows/keep-pixel-rollups-fresh.yml` y 5 archivos de test nuevos.

**Verificaciones ejecutadas** (solo lectura):
- `npx tsc --noEmit` → limpio.
- `npx vitest run` sobre los 5 tests nuevos → 45/45 verdes.
- Se buscaron todos los callers de las funciones que cambiaron de firma
  (`backfillDay`, `runRollupBackfill`, `purgeExpiredSharedCache`) — no quedó ninguno roto
  a nivel de tipos.

El resumen honesto: **la mayoría de los cambios apuntan a problemas reales y están bien
identificados. Pero el fix central (E-01/E-02, corte y reanudación por org en el backfill
de rollups) no entrega la garantía que dice entregar en el camino que realmente corre en
producción, y en el proceso abre un agujero de datos nuevo.** No lo mergearía así.

---

## CRITICAL

### C1. El corte intra-día escribe días PARCIALES y el selector de rango los da por completos → agujero de datos permanente y silencioso por organización

- `src/lib/pixel/rollup-backfill.ts:658-670` (el día parcial se anota en `days`, el cursor
  de día no avanza, pero las filas de las orgs ya procesadas **ya se escribieron**)
- `src/app/api/cron/refresh-pixel-rollups/route.ts:279`
  (`if (lastRollupDay && lastRollupDay < defaultFrom) from = addDays(lastRollupDay, 1)`)

El cron arranca el rango en `MAX(day) + 1` de la tabla elegida. `MAX(day)` es **global, no
por org**. Con el corte nuevo, alcanza con que **una sola** org escriba el día D para que
`MAX(day)` pase a D y el día D se dé por cerrado para todas.

Escenario concreto (con los valores reales del repo: `DAYS_BACK = 1`,
`INVOCATION_BUDGET_MS = 250_000`, 4 orgs, rotación de tabla por invocación):

1. La rotación elige `funnel` (`pixel_daily_funnel_by_source`). Ventana = `[hoy, hoy]`.
2. `backfillDay` procesa org1 y org2, vence el deadline, devuelve `nextOrgId = org3`.
   org1 y org2 tienen filas de `funnel` del día de hoy; org3 y org4 no.
3. `nextOrgCursor` viaja hasta el body de `runRollupBackfill`… y **muere ahí**: la ruta no
   lo devuelve en su respuesta (`route.ts:490-502`) ni lo acepta por query string
   (`route.ts:309`, y además `?cursor=` se ignora cuando `isVercelCron`). Ver C3.
4. Resto del día: cada invocación de `funnel` recalcula desde la primera org, corta en el
   mismo lugar (el orden de orgs es determinista, ver C2) y org3/org4 nunca entran.
5. Pasa la medianoche. Nueva invocación: `lastRollupDay = ayer < defaultFrom = hoy` →
   `from = ayer + 1 = hoy`. **El día de ayer nunca se vuelve a construir para org3 y org4.**

Lo que ve el cliente: el embudo por canal de ese día en cero para su organización, para
siempre, conviviendo con los días vecinos correctos. Nada lo detecta:
- la alerta de frescura mira `MAX(day)` / `refreshed_at` globales — están al día;
- el auto-chequeo de coherencia (`route.ts:430`) se saltea **justo en este caso**, porque
  exige `Date.now() - startedAt <= INVOCATION_BUDGET_MS - COHERENCE_RESERVE_MS` (250s−90s)
  y un corte por presupuesto significa que ya pasaron ~250s;
- la respuesta dice `ok: true`.

El mismo mecanismo aplica al aislamiento de E-05 dentro de `backfillDay`
(`rollup-backfill.ts:463-471`): una org cuyo statement falla se anota en `failures`, el día
sigue, `nextOrgId` queda en `null`, el cursor de día avanza y `MAX(day)` avanza. Esa org
pierde ese día para siempre, con `ok: true` en el body.

Para arreglarlo hace falta que "día completo" se decida por org, no por `MAX(day)` global
(un `MIN(MAX(day))` por org, o no escribir nada del día hasta terminarlo, o persistir el
cursor de org).

---

## HIGH

### H2. El orden nuevo "por atraso" no auto-corrige para 7 de las 8 tablas, y en régimen normal degenera exactamente en el orden viejo

- `src/lib/pixel/rollup-backfill.ts:609-615` (el proxy de atraso es `pixel_daily_aggregates`)
- `src/lib/pixel/rollup-backfill.ts:181-186` + `183` (`tablesToRun`: con `table` seteada,
  `backfillDayOrg` escribe **sólo esa tabla**)
- `src/app/api/cron/refresh-pixel-rollups/route.ts:198` (`ROTATION_TABLES`: el cron procesa
  **una tabla por invocación**)

Dos problemas encadenados:

1. **El proxy no se mueve.** Cuando la rotación elige `device`, `type`, `page`, `product`,
   `source`, `funnel` o `channel`, `backfillDayOrg` no inserta nada en
   `pixel_daily_aggregates`. Procesar la org A para `funnel` no cambia el `MAX(a.day)` de A,
   así que A **no baja de posición**. El orden es idéntico invocación tras invocación → el
   mismo prefijo de orgs se procesa siempre y la cola nunca recibe turno. Es el bug E-02
   otra vez, en 7 de las 8 tablas.

2. **El desempate es el orden viejo.** En régimen normal las 4 orgs tienen su
   `pixel_daily_aggregates` al mismo día (es lo que el cron mantiene), así que
   `MAX(a.day)` empata para todas y decide `f."organizationId" ASC` — que es literalmente
   el `ORDER BY 1` que el commit describe como "el peor orden posible" (cuid = orden
   cronológico → el cliente más nuevo, último).

Escenario: 4 orgs, todas con `aggregates` al día de ayer. La rotación elige `source`. El
día no entra en 250s y corta después de 2 orgs. Las orgs 3 y 4 —las más nuevas por cuid—
no reciben `pixel_daily_source` ese día, y la corrida siguiente vuelve a elegirlas últimas.

Nota sobre el test: `src/__tests__/rollup-org-order.test.ts:79-96` ("ES AUTO-CORRECTIVO")
pasa porque el propio test hace el `INSERT INTO pixel_daily_aggregates` después de la
corrida. En el camino real del cron ese INSERT no ocurre. El test prueba una propiedad que
la producción no tiene.

### H3. `nextOrgCursor` no sobrevive a la invocación: la reanudación intra-día es código muerto en el cron

- `src/app/api/cron/refresh-pixel-rollups/route.ts:333` (`let orgCursor = null` local)
- `src/app/api/cron/refresh-pixel-rollups/route.ts:391-396` (`if (body?.nextOrgCursor) { … continue; }`)
- `src/app/api/cron/refresh-pixel-rollups/route.ts:490-502` (el body de respuesta no lo incluye)
- `src/lib/pixel/rollup-backfill.ts:659-663` (comentario: "la próxima invocación retoma
  este mismo día desde `orgCursor`" — **es falso** en el camino del cron)

Además la aritmética del loop lo hace inalcanzable incluso dentro de la misma invocación:
`INVOCATION_BUDGET_MS = 250_000` y `MIN_SLICE_MS = 200_000` (`route.ts:141,145`), así que
una segunda iteración exige `elapsed <= 50s`. Pero `nextOrgCursor` sólo se setea cuando se
agotó el presupuesto de 250s. El `continue` de la línea 395 nunca corre en el caso para el
que fue escrito.

Escenario: cualquier corte por presupuesto. El cursor de org se calcula, se propaga hasta
el body de `runRollupBackfill`, la ruta lo lee, hace `continue`, el `for` corta por
`remainingMs < MIN_SLICE_MS`, la función responde sin el dato, y la invocación siguiente
arranca en `orgCursor = null`. Todo el andamiaje de E-01 (interfaz `BackfillDayOutcome`,
`startOrgId`, `orgCursorQs`, el `resume`) no cambia nada en producción.

### H4. `allOrEmpty` devuelve `[]` para tres queries que se consumen como `result[0].campo` → TypeError → el dashboard entero en cero (el bug que E-06 dice arreglar)

- `src/app/api/metrics/pixel/route.ts:1371-1373`
  (`ls = liveStatusResult[0]`, `kpisCurr = visitorKpisResult[0]`, `kpisPrev = prevVisitorKpisResult[0]`)
- uso **sin** `?.`: `route.ts:1438-1439`, `1682-1687`, `1691-1693`
- `src/app/api/metrics/pixel/route.ts:36` (el fallback `[]` del helper)

`liveStatus` usa `ls?.` (safe). `kpisCurr` y `kpisPrev` no. Estas dos son agregados sin
`GROUP BY`: cuando la query anda, devuelven exactamente 1 fila, así que `[0]` es correcto;
cuando falla, `allOrEmpty` mete `[]` y `kpisCurr` queda `undefined`.

Escenario concreto: la query de KPIs de visitantes se lleva un `statement_timeout` en la
org de 24M filas (que es la razón de ser de toda la maquinaria de caché de este archivo).
- Antes: `Promise.all` rechaza → catch final → `buildEmptyMockResponse()` + HTTP 200.
- Ahora: `visitorKpisResult = []` → línea 1438 `kpisCurr.totalSessions` tira
  `TypeError: Cannot read properties of undefined` → cae en el `.catch` de la línea 2035
  (o en el catch final, 2044) → **`buildEmptyMockResponse()` + HTTP 200**.

Resultado idéntico al bug original, más un `_error` que dice "Cannot read properties of
undefined" en lugar del error de Postgres real, lo que hace más difícil diagnosticar. Y en
ese camino `_degraded` no existe, porque la respuesta es el mock.

El "guard" del test (`src/__tests__/metrics-pixel-degradacion.test.ts:100-112`) sólo
verifica que no haya `prisma.x.count|aggregate|groupBy` dentro del batch. No mira cómo se
consumen los resultados, que es exactamente donde está el problema — da falsa confianza
sobre este punto.

### H5. `_degraded` no tiene ningún consumidor: la degradación parcial muestra ceros falsos mezclados con números reales

- `src/app/api/metrics/pixel/route.ts:1673` (único lugar donde se escribe)
- grep en todo `src/`: sólo aparece en la ruta y en su propio test. Ningún componente lo lee.

Para las ~25 queries que sí se consumen como array, la degradación funciona: la que falla
devuelve `[]` y la sección correspondiente se renderiza vacía / en cero. Pero el front no
tiene forma de distinguirlo, porque nadie lee `_degraded`.

Escenario: falla la query de revenue por canal (`attributionByModelChannelResult`). El
cliente ve visitantes y sesiones correctos, y la tabla de atribución por canal en $0. Antes
veía **todo** en cero — obviamente roto, y así se reportaba. Ahora ve un tablero que
parece sano con una sección mintiendo. Para un producto de analítica esto es un cambio de
riesgo, no una mejora, hasta que el front consuma `_degraded`. El comentario del código lo
admite ("el front tiene que poder decirlo") pero esa mitad no está en la branch.

Nota secundaria (menor): al no cachear la respuesta degradada (`route.ts:1992`), mientras
la query siga fallando ninguna corrida siembra el caché compartido; cuando venza el
`stale_until` de la entrada anterior, cada miss paga el compute completo (~85-120s según
los comentarios del propio archivo). El `tryAcquireRefreshLock` acota la estampida, pero
el resto de los requests recibe el mock vacío.

### H6. La purga de `api_cache` corre en el camino crítico de `warm-cache`, sin `LIMIT` y sin chequeo de presupuesto

- `src/app/api/cron/warm-cache/route.ts:340-348`
- `src/lib/api-cache-shared.ts:115-121` (`DELETE FROM api_cache WHERE stale_until < now()`)

Tres cosas:

1. **Sin tope.** Un solo `DELETE` sin `LIMIT`, en una transacción, sobre una tabla que
   —según el propio comentario del commit— nunca se purgó y "sólo crecía". Hay índice
   (`src/data/dim/api-cache.schema.sql:33-34`), así que el *scan* está acotado; el volumen
   de borrado no. *SIN CONFIRMAR*: no puedo medir cuántas filas tiene `api_cache` en prod
   (no toco la base); haría falta un `SELECT count(*) FROM api_cache WHERE stale_until < now()`
   y el tamaño de la tabla antes de mergear.
2. **Sin chequeo de presupuesto**, a diferencia del bloque inmediatamente anterior
   (`route.ts:325`: `if (Date.now() - startedAt < 260_000)` antes de mandar el mail, con el
   comentario "no puede empujar la función sobre el maxDuration"). La purga se agregó
   después de ese bloque y no repite el chequeo.
3. **Escenario de atasco permanente**: `warm-cache` corre cada 5 min con `maxDuration = 300`
   (`route.ts:41`) y ya puede llegar a ~260s de trabajo. Si el primer `DELETE` no entra en
   los ~40s restantes, Vercel mata la función → la transacción hace rollback → no se borra
   nada → la corrida siguiente repite exactamente el mismo `DELETE` y vuelve a morir. Y
   `warm-cache` es el que dispara el watchdog de auto-recuperación de rollups
   (`maybeSelfHealRollups`, `route.ts:317`), que después de este PR es el único respaldo
   del scheduler (ver M9).

Además, el error se traga dos veces: `purgeExpiredSharedCache` ya tiene su propio
`try { … } catch { return 0 }` (`api-cache-shared.ts:116-120`), y `warm-cache` sólo loguea
cuando `cachePurged > 0`. Una purga que falla siempre es indistinguible de "no había nada
que purgar". Es el patrón de "error real que pasa desapercibido" que el resto del PR dice
combatir.

---

## MEDIUM

### M7. `backfillDay` corta por deadline sin reservar el costo de UNA org — el mismo error que `canStartAnotherDay` existe para evitar

- `src/lib/pixel/rollup-backfill.ts:456` (`if (opts?.deadlineAt !== undefined && now() >= opts.deadlineAt)`)
- comparar con `src/lib/pixel/rollup-backfill.ts:99-114` (`canStartAnotherDay`: `elapsed + reserve <= budget`)

El docstring de `canStartAnotherDay` dice textualmente que `elapsed > budget` "autoriza
arrancar un día en el segundo 699 de 700". El chequeo nuevo comete exactamente ese error un
nivel más abajo: autoriza arrancar **una org** en el milisegundo 249.999 de 250.000.

Escenario: presupuesto 250s. El día arranca en t=60s (la reserva de día lo permite). org1 y
org2 son chicas (10s cada una). org3 es la org de 43 GB y su statement de `funnel` tarda
~190s (número del propio repo, `route.ts:130-140`). Arranca en t=249s → la función termina
a ~440s, muy por encima del cap real de ~300s documentado en ese mismo comentario → 504,
body vacío, sin cursor, sin respuesta. Es el 504 que E-01 dice haber eliminado.

El arreglo es simétrico al que ya existe: `now() + slowestOrgMs >= deadlineAt`, calibrando
`slowestOrgMs` con la org más lenta vista, igual que `dayReserveMs`.

### M8. Los crons de E-05 cambian un 500 visible por un 200 con `failures` que nadie lee

- `src/app/api/cron/digest/route.ts:234`
- `src/app/api/cron/anomalies/route.ts:285`
- `src/app/api/cron/ads-utm-audit/route.ts:161`
- grep en `src/`: **ningún consumidor** de `failures` (sólo se escribe y se serializa)

El aislamiento por org es correcto y necesario. Pero la mitad de "que se entere alguien" no
está: los tres devuelven `ok: true` con HTTP 200. Antes, un 500 aparecía como cron fallido
en el dashboard de Vercel; ahora no aparece nada en ningún lado.

Escenario: el digest de la org X falla todos los lunes (una métrica rota). Antes: el cron
figura en rojo y además las orgs siguientes tampoco reciben su digest — ruidoso y malo, pero
alguien lo termina viendo. Ahora: HTTP 200, la org X nunca recibe su digest, y no hay
señal. La falla pasa de "todos se enteran tarde" a "nadie se entera nunca". Las tres rutas
ya importan `sendEmail` (digest y anomalies) o tienen `console.error`; falta cerrar el
lazo con una alerta o al menos un status distinto de 200 cuando `failures.length > 0`.

Detalle menor asociado: en `anomalies`, los `prisma.insight.create` (`route.ts:230-244`)
corren **antes** del `sendEmail` dentro del mismo `try`. Si el mail falla, los insights ya
quedaron escritos y la org se anota como fallida — estado inconsistente, aunque sin
duplicados porque la corrida es diaria.

### M9. `vercel.json` deja a GitHub Actions como único scheduler proactivo, con 3,5× menos throughput

- `vercel.json` (entrada `/api/cron/refresh-pixel-rollups` eliminada)
- `.github/workflows/keep-pixel-rollups-fresh.yml:39-52` (de 6 hits a 2)

Antes: 4 corridas GH/h × 6 hits + 4 hits de Vercel = **28 hits/h**. Ahora: 4 × 2 = **8 hits/h**
para 7 tablas en rotación → ~1 turno por tabla por hora, contra un umbral de frescura de 5h.
En el papel alcanza, pero sin margen.

Lo que me preocupa no es el número sino la topología: el header del propio workflow
(líneas 3-9) dice que este workflow existe **porque Vercel dejó de disparar ese cron** y que
GitHub Actions es "red de seguridad real… en conjunto con los crons de Vercel". Al borrar la
entrada de `vercel.json`, la red de seguridad pasa a ser el único hilo, y ese header quedó
contradiciendo al código. Riesgos concretos: GitHub deshabilita los workflows programados
tras 60 días sin actividad en el repo; los cron de GH son best-effort (lo dice el propio
header); y el único respaldo restante es **reactivo**, `maybeSelfHealRollups`
(`warm-cache/route.ts:117-146`), que sólo dispara después de N horas de atraso y depende del
scheduler de Vercel que es el que falló.

La justificación de bajar 6→2 sí tiene sustento medible (con `-m 290`, 6 hits = 1.740s no
entran en la ventana de 900s; 2 hits = 580s sí). Lo que no compraría es eliminar la entrada
de Vercel: alcanzaba con bajarle la frecuencia o desfasarla para que no compitan por la
misma "tabla más atrasada".

### M10. `baseUrl = NEXTAUTH_URL || origin` sin normalizar, y `markSyncSuccess` tapa el fallo

- `src/app/api/sync/chain/route.ts:179`
- `src/app/api/sync/chain/route.ts:129` (`await markSyncSuccess(orgId, "VTEX")` incondicional)

Escenario: `NEXTAUTH_URL` con barra final (`https://app.nitrosales.ai/`). Las tres URLs
quedan `https://app.nitrosales.ai//api/sync/inventory?…` → 404 con body HTML →
`res.json()` explota → los tres pasos se anotan con error, pero
`markSyncSuccess` corre igual y avanza `lastSuccessfulSyncAt`. La respuesta dice `ok: true`,
`orgsProcessed: 4`, y **ninguna org sincronizó**. Encima el nuevo `orderBy` por
`lastSuccessfulSyncAt` queda satisfecho, así que rota prolijamente entre las 4 orgs sin
hacer nada.

*SIN CONFIRMAR*: no puedo ver el valor real de `NEXTAUTH_URL` en Vercel. Para confirmarlo
alcanza con mirarlo en el panel de env vars. En cualquier caso, el resto del repo usa el
patrón `process.env.NEXTAUTH_URL || "https://app.nitrosales.ai"` (14 ocurrencias) y sería
consistente normalizar con `.replace(/\/$/, "")`.

Aparte: `markSyncSuccess` incondicional está reconocido en los comentarios como R-C13 y no
se arregla acá. Pero al convertirlo en la **clave de ordenamiento**, el PR le da un rol
nuevo a un campo que se sabe mentiroso. Funciona como proxy de "a quién le tocó último"
(que es lo que el comentario argumenta) sólo mientras nadie lo arregle; el día que R-C13 se
corrija, una org que falla siempre pasará a ser eternamente la primera y monopolizará todas
las corridas — el mismo patrón de "tabla veneno" que ya pasó con `pixel_daily_channel`
(`refresh-pixel-rollups/route.ts:190-197`). Vale dejarlo anotado en el código.

### M11. Un día parcial se reporta como día procesado

- `src/lib/pixel/rollup-backfill.ts:663` (el `days.push` del camino parcial)
- `src/lib/pixel/rollup-backfill.ts:710` (`daysProcessedThisCall: days.length`)
- `src/app/api/cron/refresh-pixel-rollups/route.ts:402` y `:104-113` (`lastDayReconstructed`)

Una corrida que completó **cero** días informa `daysProcessed: 1`. Peor: `lastDayReconstructed`
usa "hay días procesados" para elegir qué día audita el chequeo de coherencia, así que puede
apuntar el auditor a un día que esta invocación no reconstruyó. El impacto práctico es bajo
porque en el caso del corte la coherencia se saltea igual por presupuesto (ver C1), pero el
número operativo que se mira para decidir si el pipeline avanza está mal.

---

## LOW

### L12. Los tests: uno bueno, uno decente, tres que protegen literales y no comportamiento

- **`rollup-backfill-orgs.test.ts` — el bueno.** Importa la función real, inyecta worker y
  reloj, y cubre aislamiento, deadline, reanudación y cursor inexistente. Es un test de
  verdad. Hueco: no cubre `deadlineAt` ya vencido al entrar, que devuelve
  `nextOrgId === startOrgId` con `orgsSeen: 0` (cero progreso) — el caso sobre el que el
  `continue` de `route.ts:395` giraría.
- **`rollup-org-order.test.ts` — decente.** Corre SQL real contra PGlite, que es lo correcto
  para verificar `NULLS FIRST` / `LEFT JOIN` / `GROUP BY`. Pero el caso "ES AUTO-CORRECTIVO"
  (`:79-96`) simula el efecto escribiendo a mano en `pixel_daily_aggregates`, cosa que el
  cron real no hace para 7 de sus 8 tablas (ver H2): valida una propiedad que producción
  no tiene.
- **`cron-org-isolation.test.ts` — es 100% `readFileSync` + regex.** Afirma que existe el
  comentario `"E-05: aislamiento por organización"` y que hay un `failures.push`. Falso
  verde concreto: mover el `try {` para que envuelva sólo el `sendEmail` y deje afuera las
  queries pesadas — las cuatro aserciones siguen pasando y el bug vuelve. No detecta dónde
  está el `catch`, sólo que hay uno.
- **`metrics-pixel-degradacion.test.ts` — testea una COPIA.** El helper se re-declara en el
  test (`:29-40`) en vez de importarse. Si alguien cambia el fallback real de `[]` a `null`,
  las 5 pruebas de comportamiento siguen verdes; sólo lo agarrarían los guards de texto, y
  sólo con las cadenas exactas. Además el guard de forma del batch (`:100-112`) hace
  `src.slice(indexOf(A), indexOf(B))`: si cualquiera de las dos cadenas cambia, el slice da
  `""` y `expect("").not.toMatch(...)` pasa vacío — un guard que deja de guardar sin avisar.
- **`sync-chain-budget.test.ts`** — la parte de `canStartAnotherOrg` es aritmética real y
  está bien. El bloque "guards sobre el archivo" (`toContain("export const maxDuration = 300;")`,
  contar 3 `headers: selfFetchHeaders()`) es de la misma clase: protege el literal, no el
  comportamiento.

Ninguno de estos tests habría atrapado C1, H2, H3 ni H4.

### L13. Comentarios que ya no describen el código

- `.github/workflows/keep-pixel-rollups-fresh.yml:14-15`: "En conjunto con los crons de
  Vercel (cuando andan) mantienen los rollups frescos" — ya no hay cron de Vercel para esto.
- `src/lib/pixel/rollup-backfill.ts:659-663`: "la próxima invocación retoma este mismo día
  desde `orgCursor`" — no ocurre en el camino del cron (H3).
- `src/lib/pixel/rollup-backfill.ts:82-86`: "la unidad de trabajo pasó a ser (día × tabla ×
  UNA org)" — cierto para el corte, pero la *contabilidad* de completitud sigue siendo por
  día global (C1).

### L14. `sync/chain`: más sub-invocaciones por corrida

`chain` pasa de procesar 1 org a ~4 por corrida, o sea de 3 a 12 self-fetch. Son
**secuenciales**, así que no agregan presión sobre el pool de 24 conexiones ni concurrencia
nueva. Sí implica que 3 orgs que (según el commit) nunca sincronizaron van a empezar a pegarle
a la API de VTEX cada 2h; los pasos están acotados por `batch=50`, así que el backlog se
drena de a poco en vez de golpe. No veo riesgo, lo dejo anotado por visibilidad.

No encontré, en cambio: `await` faltantes, condiciones invertidas, off-by-one en el
`startIdx`/`indexOf` (el `Math.max(0, …)` está bien y tiene test), ni callers rotos por el
cambio de firma de `backfillDay` (era privada; `runRollupBackfill` es el único consumidor y
`setup-pixel-rollups/route.ts:458` sigue compilando y usa su propio `orgCursor` numérico,
que es otra cosa y no colisiona).

---

## Veredicto

**No lo mergearía tal como está.** No por la dirección —los 6 problemas que ataca son reales
y están bien diagnosticados— sino porque el fix central no cumple lo que dice en el camino
que efectivamente corre en producción, y C1 introduce una forma nueva de perder datos por
organización sin ninguna señal. En un producto de analítica eso pesa más que el 504 que se
vino a evitar.

### Qué cambiaría antes de mergear

**Bloqueantes:**

1. **C1** — que "día completo" no dependa de un `MAX(day)` global. Mínimo viable: que el
   selector de rango de `refresh-pixel-rollups` use `MIN` sobre el `MAX(day)` **por org** de
   la tabla elegida, en vez del `MAX(day)` de la tabla. Alternativa más limpia: no dar el día
   por cerrado hasta que todas las orgs lo terminen (persistir el cursor de org, punto 3).
2. **H2** — el proxy de atraso tiene que ser la tabla que se está procesando, no siempre
   `pixel_daily_aggregates`: `ROLLUP_DB_TABLE[table]` ya existe en la ruta y da el nombre.
   Y agregar un desempate que no sea el cuid (por ejemplo `MAX(refreshed_at)` por org, igual
   que ya hace la rotación de tablas), porque con empate el orden nuevo **es** el viejo.
3. **H3** — o se persiste el cursor de org entre invocaciones (devolverlo en el body +
   aceptarlo por query string, o guardarlo en una fila de estado), o se saca todo el
   andamiaje y se admite que la reanudación es sólo intra-invocación. Lo que no puede quedar
   es el estado actual: código y comentarios que afirman una garantía que no existe.
4. **H4** — dar fallbacks por query en vez de un `[]` universal, o poner `?.` y defaults en
   `kpisCurr` / `kpisPrev` (`route.ts:1438,1682-1693`). Y convertir el guard del test en algo
   que mire el consumo, no la ausencia de `prisma.count`.
5. **M7** — reserva por org en el deadline de `backfillDay`, simétrica a `canStartAnotherDay`.

**Fuertemente recomendado antes de mergear:**

6. **H6** — mover la purga a `waitUntil` (o darle `LIMIT` y hacerla iterativa), y repetir el
   chequeo `Date.now() - startedAt < 260_000` que sí tiene el bloque de arriba. Antes de
   activarla, medir `count(*) … WHERE stale_until < now()` en prod.
7. **H5 / M8** — decidir explícitamente si `_degraded`, `failures` y `orgFailures` van a
   tener consumidor. Si no lo van a tener en este ciclo, al menos que la respuesta no diga
   `ok: true` cuando hay fallas, para que el dashboard de crons de Vercel siga sirviendo de
   señal.
8. **M9** — no dejar un solo scheduler. Devolver la entrada de `vercel.json` con una
   frecuencia menor y desfasada (por ejemplo `10,40 * * * *`) en vez de eliminarla.

**Puede ir después:** M10 (normalizar `baseUrl`), M11 (contabilidad del día parcial), L12
(reforzar los tests de grep), L13 (comentarios desactualizados).
