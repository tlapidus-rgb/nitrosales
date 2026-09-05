# Revisión de `fix/expansion-gate-e0` → `origin/main` (9ad4616d)

Repo: `C:/Users/axelf/github/nitrosales` · 8 commits · 32 archivos
(8 fuentes + `vercel.json` + 1 workflow + 5 tests nuevos; el resto es documentación).
Working tree limpio, no se editó ni commiteó nada. `npx vitest run` sobre los 5 tests
nuevos: **45/45 en verde**.

---

## 1. Skills invocadas

### 1.1 `code-review high` — corrió

Corrió en fork, sobre `origin/main...HEAD`. No pudo usar su tool `ReportFindings`
(no existe en este entorno), así que devolvió los hallazgos en texto; los incorporo
abajo verificados uno por uno contra el código.

Resumen de lo que dijo:

- **HIGH** — la reanudación intra-día de E-01 nunca sobrevive a una invocación (código muerto).
- **HIGH** — el `ORDER BY` por atraso de E-02 mira la tabla equivocada para 7 de las 8 tablas.
- **MEDIUM** — un día parcial se lee como día completo por el detector de huecos.
- **MEDIUM** — el string `resume` que se le imprime al operador pierde el `orgCursor`.
- **MEDIUM** — los tres crons aislados ahora devuelven `200 ok:true` aunque falle todo.
- **MEDIUM** — no cachear la respuesta degradada hace que la mayoría de los usuarios
  siga viendo ceros.
- **MEDIUM** — GitHub Actions queda como único scheduler de los rollups.

Y validó como correcto: el aislamiento por org de los tres crons, el fallback `[]`
de `allOrEmpty`, la aritmética de presupuestos de `sync/chain`, el `orderBy` por
`lastSuccessfulSyncAt`, y la purga de `api_cache`.

**Verifiqué y confirmo los 7 hallazgos.** Los reescribo abajo con evidencia propia y
corrijo/matizo dos de ellos (ver H-2 y M-5).

### 1.2 `security-review` — NO pudo correr

Rechazó arrancar: exige cwd = raíz de un repo git, y la sesión está en
`C:\Users\axelf\github` (no es repo). Reintenté pasándole la ruta como argumento;
la skill ya estaba cargada y no acepta un target. No cambié el cwd de la sesión
porque eso sólo toma efecto al terminar el turno.

**Hice la revisión de seguridad a mano** sobre el mismo diff, cubriendo los ángulos
pedidos (auth de self-fetch, env vars, secretos en logs/URLs/respuestas, aislamiento
multi-tenant, errores tragados). Resultados en S-1 … S-5.

---

## 2. Hallazgos por severidad

### CRÍTICO

#### S-1 · La branch commitea 20 ocurrencias nuevas de la clave de admin de producción

`CLAUDE_STATE.md` (5), `PLAN_REMEDIACION.md` (3),
`docs/auditoria-2026-09/review-flujos.md` (4), `review-seguridad.md` (4),
`review-arquitectura.md` (2), `review-datos.md` (1), `radiografia.html` (1).

Todas contienen el literal `<CLAVE-EN-vercel.json-VER-R-C09>`.

Contexto que lo agrava: `src/lib/admin-key.ts:11` afirma textualmente que "NO queda
ningún literal del secreto en el código", y `vercel.json` ya lo tiene 27 veces
(pre-existente, no lo introduce esta branch — pero la branch **edita ese archivo**
y no lo arregla). El literal ya está en el packfile de `.git`, o sea que borrarlo
ahora no sirve de nada sin rotación.

Escenario: cualquiera con acceso de lectura al repo (contractor, integración de CI,
un fork accidental, una fuga del token de GitHub) obtiene la key de bypass de
admin/cron de producción. Con ella puede pegarle a `/api/admin/*` y a todos los crons
de las cuatro organizaciones. Y ahora, en el mismo commit, se lleva además
`docs/auditoria-2026-09/review-seguridad.md` — 598 líneas que enumeran
vulnerabilidades **sin corregir**, incluido otro secreto hardcodeado
(`BACKFILL_SECRET = "nitrosales-backfill-2024"` en `src/app/api/backfill/vtex/route.ts:29`).
Es un mapa del ataque con la llave adentro.

No pude confirmar si el repo es público (`gh` no está instalado). Si lo es, esto es
un incidente, no un hallazgo de review.

**Acción:** rotar `ADMIN_API_KEY` (y `SYNC_KEY`, y el `BACKFILL_SECRET`) antes del
merge; sacar el literal de `vercel.json` y de los 7 docs; decidir explícitamente si
los reviews de seguridad van al repo o a un lugar con control de acceso.

---

### ALTO

#### H-1 · La reanudación intra-día de E-01 es código muerto: no sobrevive a ninguna invocación

`src/app/api/cron/refresh-pixel-rollups/route.ts:333`, `:342`, `:391`, `:500`
`src/lib/pixel/rollup-backfill.ts:722`

Tres eslabones rotos, cualquiera alcanza:

1. `orgCursor` es un `let` local a la request inicializado en `null` (:333). La ruta
   **nunca parsea** un query param `orgCursor` — sólo parsea `cursor` (día, :309).
2. La respuesta (:494-501) devuelve `orgFailures` pero **no** `nextOrgCursor`. El
   valor existe en el body del backfill (`rollup-backfill.ts:722`) y se descarta.
3. La única vía que quedaba —el `continue` de :391, dentro de la misma invocación—
   es inalcanzable: al backfill se le pasa `budgetMs: remainingMs` y él arma
   `deadlineAt = startedAt + budget`, así que sólo devuelve `nextOrgId` después de
   consumir **todo** el presupuesto restante. Al volver al loop, :341 recalcula
   `remainingMs ≈ 0`, y :342 corta contra `MIN_SLICE_MS = 200_000`.

Escenario concreto: 20 organizaciones, la tabla `pixel_daily_source` de un día no
entra en los 250s de presupuesto. Cada corrida de 15 minutos vuelve a procesar las
mismas primeras N orgs y las de la cola no reciben esa tabla **nunca**. Es
exactamente la inanición que E-01 dice arreglar.

El test `rollup-backfill-orgs.test.ts:99` ("reanuda EXACTAMENTE donde cortó") prueba
que la *unidad* funciona. Nada prueba que el cursor sobreviva a una invocación —
que es la única parte que importa y la única que está rota.

#### H-2 · El orden "por atraso" de E-02 mira `pixel_daily_aggregates` para las 8 tablas, pero sólo una la escribe

`src/lib/pixel/rollup-backfill.ts:610-614` · `:184-186`

El `ORDER BY MAX(a.day) ASC NULLS FIRST` hace `LEFT JOIN pixel_daily_aggregates`
hardcodeado. Pero `backfillDayOrg` corre **sólo la tabla seleccionada**
(`const toRun = new Set(tablesToRun(table))`, `:184`), y el cron siempre pasa una
tabla (rotación "la más atrasada"). Cuando la rotación elige `source`, `funnel`,
`device`, `type`, `page` o `channel`, la corrida **no escribe** `pixel_daily_aggregates`
y el orden no cambia mientras el trabajo avanza.

Matizo el hallazgo de la skill, que decía que el fix no sirve para nada:

- **Sí sirve** para el caso que la branch describe como motivador: una org nueva sin
  ninguna fila en `pixel_daily_aggregates` → `NULLS FIRST` la pone primera. El
  cliente recién firmado deja de ser el último. Eso es real y es una mejora.
- **No sirve** en régimen: una vez que todas las orgs tienen `aggregates` del mismo
  día (que es lo que pasa a diario), `MAX(a.day)` empata para todas y el `ORDER BY`
  degenera al desempate `f."organizationId" ASC` — **el mismo orden por cuid que la
  branch vino a eliminar**. Y para las otras 7 tablas no hay ninguna señal de atraso.

El test `rollup-org-order.test.ts:75` ("ES AUTO-CORRECTIVO") pasa porque inserta a
mano en `pixel_daily_aggregates` entre corridas. En producción, con `table='source'`,
esa inserción no ocurre. El test prueba el SQL, no la propiedad que afirma su nombre.

Combinado con H-1: no queda ningún mecanismo que rescate a las orgs de la cola.

#### H-3 · Reanudar por ID sobre una lista que se reordena puede saltear una organización entera

`src/lib/pixel/rollup-backfill.ts:448-450`

```ts
const startIdx = opts?.startOrgId ? Math.max(0, orgs.indexOf(opts.startOrgId)) : 0;
```

El `orgCursor` es un ID (decisión correcta y bien documentada), pero la lista se
reordena en cada invocación por `MAX(a.day)`. Si entre dos invocaciones la posición
relativa del cursor sube, las orgs que estaban entre el punto de corte y el cursor
se saltean para ese día — y el cursor de día avanza igual.

Escenario: orden `[A,B,C,D]`, se corta en C. En la siguiente invocación A y B ya
tienen el día → se van al fondo → orden `[C,D,A,B]` (ok, reprocesa A y B, idempotente).
Pero si el reordenamiento deja `[A,B,D,C]`, `indexOf(C)=3` y **D no recibe ese día**.
En un producto de analítica eso es un agujero en la serie del cliente D que nadie
detecta: no hay error, no hay `failure`, el día figura como hecho.

Latente hoy porque H-1 lo desactiva. Se activa el día que alguien arregle H-1 sin
mirar esto. El `Math.max(0, -1)` cubre "org borrada" (y hay test para eso,
`:161`) pero no cubre "org que se movió de lugar".

#### H-4 · `NEXTAUTH_SECRET` viaja como query param al dominio público

`src/app/api/sync/chain/route.ts:167`, `:179`, `:83`, `:99`, `:115`

La ruta autentica con `key !== process.env.NEXTAUTH_SECRET` (:167) y después
reenvía ese mismo `key` **en el query string** a los tres self-fetch
(`?key=${encodeURIComponent(key)}`). La branch cambia el destino:

```ts
const baseUrl = process.env.NEXTAUTH_URL || req.nextUrl.origin;  // :179
```

Antes iba a la URL interna del deployment; ahora sale por `https://app.nitrosales.ai`.
`NEXTAUTH_SECRET` es el secreto de firma de sesiones de **toda la app**. En un query
param queda registrado en los access logs de Vercel, en cualquier log drain
(Datadog/Axiom/S3), en el WAF y en cualquier proxy o analytics que esté delante del
dominio. Quien lo lea puede firmar un JWT de sesión de cualquier usuario de cualquier
organización → compromiso multi-tenant total.

La exposición base es pre-existente (28 rutas de `src/app/api/sync/*` usan el mismo
patrón), pero **esta branch amplía la superficie**: mueve el tráfico del origen
interno al edge público. No es razón para bloquear sola, pero sí para no ampliarla
en el mismo commit.

Mínimo: mandar el key por header `Authorization: Bearer` en vez de query param
(varias rutas ya lo aceptan — `digest/route.ts:22`, `anomalies/route.ts:26`,
`ads-utm-audit/route.ts:34`), y usar una clave de servicio distinta de
`NEXTAUTH_SECRET`.

---

### MEDIO

#### M-1 · Un día parcial se contabiliza como día completo

`src/app/api/cron/refresh-pixel-rollups/route.ts:244-279` · `rollup-backfill.ts:655`

`lastRollupDay` sale de un `SELECT MAX(day)` **global** sobre la tabla, y
`from = lastRollupDay + 1`. Como `backfillDayOrg` commitea por org, un día cortado a
mitad de la lista ya movió ese `MAX(day)` global. En el camino de catch-up de huecos
(hasta `MAX_GAP_DAYS = 14`), la corrida siguiente arranca en día+1 y las orgs que
quedaron afuera **nunca reciben el día D**.

Antes esto pasaba sólo por accidente (un 504). La branch convierte el corte parcial
en un resultado **de diseño** (`stoppedForBudget = true; break;`) sin enseñarle nada
al detector de huecos. Con H-1 activo (la reanudación muerta), el corte parcial es el
caso normal, no la excepción.

#### M-2 · El `resume` impreso al operador pierde el cursor de org, y `orgCursor` significa dos cosas distintas

`src/lib/pixel/rollup-backfill.ts:703`, `:732` · `src/app/api/admin/setup-pixel-rollups/route.ts:331`, `:458`

`next` ahora emite `POST ?phase=backfill&…&orgCursor=<orgId>`. El único handler de
`phase=backfill` (`setup-pixel-rollups/route.ts:458`) **no lee** `orgCursor` y no se
lo pasa a `runRollupBackfill`. Peor: el mismo archivo, en `:331`, parsea `orgCursor`
como **índice entero** para `phase=first-source`
(`parseInt(url.searchParams.get("orgCursor") || "0", 10)`).

Escenario: el operador copia el link que le imprimió el sistema, lo pega, y el backfill
reempieza el día desde la org 0 — silenciosamente, sin decir que ignoró el parámetro.
El mismo nombre de parámetro es un cuid en una fase y un entero en la otra.

#### M-3 · Los tres crons aislados devuelven `200 ok:true` aunque fallen todas las organizaciones

`src/app/api/cron/digest/route.ts:234` · `anomalies/route.ts:285` · `ads-utm-audit/route.ts:161`

El aislamiento por org está bien hecho (verificado: los `try` envuelven el cuerpo del
loop, el `catch` no tiene `break`/`return`/`throw`, el `continue` de
`digest/route.ts:41` queda fuera del `try`). El problema es el contrato de salida:
`failures` se reporta dentro de un `200 { ok: true }` sin importar su tamaño.

Este repo depende explícitamente del status no-2xx como señal de alerta —
`refresh-pixel-rollups/route.ts:464` calcula
`const httpStatus = error || !madeProgress ? 500 : 200;` justamente para disparar los
mails de fallo de Vercel Cron. Los tres crons nuevos no hacen eso.

Escenario: el proveedor de mail se cae un lunes 10:00. Las cuatro orgs tiran en
`sendEmail`, `failures.length === orgs.length`, `results` queda vacío, la respuesta es
`200 {ok:true}` y **nadie se entera**. Antes del cambio salía un 500. El fix de E-05
convirtió un fallo ruidoso en uno silencioso para el caso "falla todo".

Arreglo de una línea por ruta: `status: results.length === 0 && failures.length > 0 ? 500 : 200`.

#### M-4 · Ninguno de los errores nuevos llega a algún lado donde alguien mire

Transversal: `refresh-pixel-rollups/route.ts:372-379`, `metrics/pixel/route.ts:1997`,
`warm-cache/route.ts:347`, y los tres `catch` por org.

Todos los caminos nuevos terminan en `console.error` + un campo en un body JSON que
sólo ve quien invoque el endpoint a mano. Los propios comentarios del código lo
admiten ("ese 500 no lo mira nadie", "no hay telemetría"). No es un error tragado —
la información existe — pero el efecto práctico es el mismo: un cliente puede quedar
sin rollups o sin digest durante semanas sin que nada lo anuncie.

Respondiendo a la pregunta del brief: **ninguno de los `try/catch` nuevos traga un
error que antes se viera**, salvo el caso de M-3 (el 500 que desaparece).

#### M-5 · No cachear la respuesta degradada deja a la mayoría de los usuarios en cero igual, y multiplica la carga sobre Neon

`src/app/api/metrics/pixel/route.ts:1673`, `:1992`, `:2045`

El razonamiento de E-06 es correcto (no propagar un fallo transitorio a toda la org
por media hora), pero el efecto en un fallo **persistente** —justo los que el propio
comentario nombra: "`hll` no disponible", "una tabla que todavía no existe"— es malo:

1. `setSharedCache` escribe los dos niveles (memoria + Postgres), así que saltearlo
   no deja nada cacheado en ningún lado.
2. El caché compartido nunca se siembra: `warm-cache` tampoco lo puebla.
3. Cada request es un cache-miss. El que gana `tryAcquireRefreshLock` paga el compute
   completo de 28 queries; **todos los demás caen en `buildEmptyMockResponse()`
   (:2045)** — el dashboard entero en cero, que es el síntoma que E-06 vino a matar.
4. Sobre la org de 43 GB, eso es un recompute de 28 queries por cada request que
   agarre el lock, en loop, mientras dure el fallo.

Matizo respecto de la skill: la salida para el usuario no es *peor* que antes (antes
también veía el mock vacío, con `_error`); lo que empeora es la carga sobre la base,
justo cuando la base ya está en problemas.

Además: **`_degraded` no tiene ningún consumidor.** Grep en todo `src/` fuera de la
propia ruta y de los tests: cero resultados. El comentario dice "el front tiene que
poder decir 'no se pudo cargar' en vez de mostrar $0 con cara de verdad" — pero el
front no lee el campo, así que hoy sigue mostrando $0 con cara de verdad en las
secciones caídas. La mitad del fix está sin conectar.

Alternativa: cachear la respuesta degradada con TTL corto (30-60s) preservando
`_degraded`, y consumir `_degraded` en el front.

#### M-6 · GitHub Actions queda como único scheduler de los rollups

`.github/workflows/keep-pixel-rollups-fresh.yml:52` + entrada eliminada de `vercel.json`

El problema que resuelve es real y está bien medido (dos schedulers eligiendo "la
tabla más atrasada" → el mismo statement HLL de ~190s en paralelo sobre 43 GB). Pero
la solución elegida deja al cron de GitHub Actions solo. Los `schedule` de GH Actions
son best-effort y **se auto-deshabilitan tras 60 días sin actividad en el repo** — que
reproduce exactamente el incidente que este workflow existe para cubrir (2026-08-23:
Vercel dejó de disparar, 7 tablas stale ~22h, mails de frescura al cliente), ahora sin
red de respaldo.

Además el header del propio workflow (líneas 13-15) sigue diciendo que los dos corren
"en conjunto", contradicho por el comentario nuevo 25 líneas más abajo.

Alternativa que resuelve la duplicación sin crear el punto único: quedarse con el cron
de Vercel y sacar el `schedule` de GH (dejando `workflow_dispatch`), o desfasarlos.

---

### BAJO / NOTA

- **`rollup-backfill.ts:703`** — `` `&orgCursor=${orgCursor}` `` sin `encodeURIComponent`.
  El valor sale de la base (cuid), así que hoy no es explotable; es inconsistente con
  el resto de la ruta, que sí encodea.
- **`.github/workflows/keep-pixel-rollups-fresh.yml:57`** — `head -c 400 /tmp/out.json`
  imprime el body de la respuesta en el log de Actions. Ese body ahora incluye
  `orgFailures` con IDs de organización y mensajes crudos de Postgres. En un repo
  público eso son IDs de clientes e internals de la DB en un log accesible.
- **`sync/chain/route.ts:56-59`** — el comportamiento con `VERCEL_AUTOMATION_BYPASS_SECRET`
  **sin setear** es correcto: devuelve `undefined`, no manda header, y el
  comportamiento es el previo. **Fail-closed, sin fallback inseguro. Bien.**
  El secreto no aparece en ningún log, URL ni body: sólo se usa como valor de header.
  Único matiz: se manda a `process.env.NEXTAUTH_URL`, así que una `NEXTAUTH_URL` mal
  configurada lo entregaría a un tercero. Riesgo bajo (env controlada).

---

## 3. Sobre los tests (respuesta directa a la pregunta del brief)

Los 5 archivos, 45 tests, todos verdes. Pero no todos protegen lo mismo:

**Tests reales, con valor:**
- `rollup-backfill-orgs.test.ts` — ejercita `backfillDay` de verdad, con worker y
  reloj inyectados. Prueba aislamiento, corte por deadline, reanudación y org borrada.
  Es buen trabajo. Su límite es que prueba una unidad que **no está cableada** (H-1).
- `sync-chain-budget.test.ts` (primeros 5 casos) — ejercita `canStartAnotherOrg` real.
- `metrics-pixel-degradacion.test.ts` (primeros 5 casos) — prueba el algoritmo… sobre
  una **réplica** del helper, copiada a mano en el test. Si alguien cambia
  `allOrEmpty` en la ruta y no la réplica, el test sigue verde probando código muerto.
  El propio comentario lo admite. Es un compromiso defendible pero es más débil de lo
  que parece.
- `rollup-org-order.test.ts` — corre el SQL contra PGlite real. Prueba el SQL bien.
  Lo que **no** prueba, pese al nombre del caso, es la propiedad auto-correctiva:
  la logra insertando a mano en `pixel_daily_aggregates`, cosa que en producción no
  ocurre para 7 de las 8 tablas (H-2). El nombre del test miente.

**Teatro:**
- `cron-org-isolation.test.ts` — los 4 tests son `grep` sobre el fuente. El más débil
  es `expect(src).toContain("E-05: aislamiento por organización")`: verifica que un
  **comentario** siga existiendo. Se pasa poniendo el comentario y borrando el
  `try/catch`. Los otros tres (`failures.push(`, `\n\s*failures,`, el `console.error`)
  son igual de sintácticos. Un `catch` que hace `failures.push()` y después no vuelve
  a entrar al loop pasaría los cuatro.
- Los guards de `sync-chain-budget.test.ts:78-115` y de
  `metrics-pixel-degradacion.test.ts:104-153` — misma categoría.

**Veredicto honesto sobre esto:** los guards de patrón tienen algún valor como
documentación ejecutable y como freno a un revert distraído, y el repo ya usa ese
estilo (`check-order-contract.mjs`), así que no es una desviación. Pero **no protegen
comportamiento**, y en esta branch ese hueco es exactamente donde vive el problema
principal: la reanudación de E-01 está muerta y **ningún test lo detecta**, porque no
hay un solo test que cruce el borde de una invocación. Cinco archivos de tests, 45
casos verdes, y la funcionalidad central del PR no funciona.

---

## 4. Veredicto

**No mergear como está.**

No es una branch mala — al contrario. El diagnóstico es bueno, los comentarios son
excepcionales (explican el incidente, la medición y el porqué de cada número), y hay
tres arreglos que son netamente positivos y los merecería tener producción hoy:

- El aislamiento por org de los tres crons (E-05) está bien implementado.
- `sync/chain` con `maxDuration = 300` es un bug real, medido, con 4 clientes, y el
  arreglo es correcto y bien acotado.
- Conectar `purgeExpiredSharedCache` (E-04) es correcto y barato.

Lo que bloquea:

| # | Bloqueante | Por qué |
|---|-----------|---------|
| S-1 | Secreto de producción en 20 líneas nuevas | Es un secreto vivo; el merge lo propaga |
| H-1 | E-01 no funciona | La branch dice arreglar la inanición y no la arregla |
| H-2 | E-02 sólo funciona en onboarding | En régimen vuelve al orden por cuid |
| M-6 | Punto único de fallo en el scheduler | Reintroduce el incidente de 2026-08-23 |

H-1 + H-2 juntos importan más que por separado: la branch se vende como "ningún
cliente se queda sin turno", y con los dos rotos **ningún cliente de la cola recibe
su turno**. En un producto de analítica eso es un dashboard con datos incompletos
presentados como completos — que es el modo de falla que el propio brief pone al mismo
nivel que caerse.

---

## 5. Qué cambiaría antes de mergear

**Bloqueantes (hacer sí o sí):**

1. **Rotar `ADMIN_API_KEY`, `SYNC_KEY` y `BACKFILL_SECRET`** en Vercel, y sacar el
   literal de `vercel.json` y de los 7 docs nuevos. Está en el packfile de git, así
   que sin rotación no alcanza con borrarlo. Decidir si los reviews de seguridad van
   al repo.
2. **Cablear E-01 de punta a punta**: parsear `orgCursor` del query en
   `refresh-pixel-rollups/route.ts`, devolver `nextOrgCursor` en el body (:494), y
   hacer que el `budgetMs` que se le pasa al backfill deje aire para al menos otra
   vuelta (hoy consume todo y el `continue` de :391 nunca corre). Con un test que
   cruce el borde de la invocación: corrida 1 → corrida 2 con lo que devolvió la 1.
3. **Antes de (2), arreglar H-3**: reanudar por ID sobre una lista reordenada puede
   saltear orgs. O se congela el orden dentro del rango de un día, o el cursor se
   convierte en "conjunto de orgs ya hechas para este día".
4. **H-2**: que el `LEFT JOIN` de la query de orden apunte a la tabla que se está
   procesando (`table`, validada contra `ROLLUP_TABLES` — el nombre no viene de input
   de usuario, ya está saneado), no a `pixel_daily_aggregates` fija. Y renombrar el
   test "ES AUTO-CORRECTIVO", que hoy afirma algo que el código no hace.
5. **M-6**: no dejar un solo scheduler. Mi preferencia: quedarse con el cron de
   Vercel (que no se auto-deshabilita) y sacar el `schedule` del workflow dejando
   `workflow_dispatch`. Alternativamente mantener los dos desfasados. Y corregir el
   header del workflow, que contradice al comentario nuevo.

**Debería (rápidos y de alto retorno):**

6. **M-3, una línea por ruta**: `status: results.length === 0 && failures.length > 0 ? 500 : 200`
   en `digest`, `anomalies` y `ads-utm-audit`. Sin esto, E-05 cambió un fallo ruidoso
   por uno mudo.
7. **M-1**: que el detector de huecos entienda los días parciales — el `MAX(day)`
   global no puede seguir siendo la fuente de verdad ahora que el corte parcial es
   de diseño.
8. **M-2**: que `setup-pixel-rollups` lea `orgCursor` en `phase=backfill`, o que el
   `next` deje de imprimirlo. Y renombrar uno de los dos `orgCursor` (cuid vs. índice).
9. **M-5**: cachear la respuesta degradada con TTL corto preservando `_degraded`, y
   **consumir `_degraded` en el front** (hoy no lo lee nadie: la mitad de E-06 está
   sin conectar).

**Consideraría:**

10. **H-4**: mover el `key` de los self-fetch de query param a header
    `Authorization: Bearer`, y dejar de usar `NEXTAUTH_SECRET` como clave de servicio.
    Es un refactor más grande y pre-existente — está bien que sea otro PR, pero no
    ampliaría la superficie en este.
11. Bajar el `head -c 400 /tmp/out.json` del workflow, que ahora imprime IDs de
    organización y errores de Postgres al log de CI.
12. Reemplazar `cron-org-isolation.test.ts` por un test de comportamiento con Prisma
    mockeado. Verificar que un comentario sigue existiendo no es un test.

**Camino alternativo si urge:** partir la branch. Los commits `98608224` (E-05, con el
arreglo de M-3 encima), `648b5265` (E-03) y la mitad de `78090597` (la purga de
`api_cache`) son mergeables casi como están y aportan valor real hoy. Los commits de
E-01/E-02 (`545e0317`, `eb25f50d`) y el borrado del cron de `vercel.json` necesitan
otra vuelta. Y S-1 se arregla en cualquiera de los dos caminos, antes de todo.
