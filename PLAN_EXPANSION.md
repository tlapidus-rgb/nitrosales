# PLAN_EXPANSION.md — Preparar NitroSales para meter clientes nuevos

> **Creado:** 2026-09-05 · **Commit analizado:** `9ad4616d` (= `origin/main` = producción)
> **Objetivo del negocio:** Tomy quiere meter clientes nuevos y hacer crecer la app. Tamaño y
> plataforma **sin definir**: pueden ser grandes como Arredo o chicos, VTEX o no.
> **Origen:** estudio de 6 frentes en paralelo. Evidencia completa en `docs/expansion-2026-09/`.
> **Plan hermano:** `PLAN_REMEDIACION.md` (los 197 hallazgos de la auditoría del 2026-09-02).
> Este documento **manda sobre aquel** mientras el objetivo sea expandir — ver § 2.
>
> **Estado global:** 🟨 FASE E0 en curso — **6 de 34 cerradas + E-07 a medias**, todo **verificado en un deployment real** (§ 13) · branch `fix/expansion-gate-e0`, sin mergear
> **Línea base de validación (2026-09-05):** `tsc` exit 0 · `vitest` exit 0, **446 pasan** · `next build` exit 0

---

## 1. El veredicto, en cuatro frases

> ⚠️ **Corregido el 2026-09-05 al implementar E-01.** El estudio decía "8-10 clientes" calculando
> contra un presupuesto de 250 s como si fuera pared dura. Leyendo el código real: ese presupuesto
> es el auto-límite del cron, el `maxDuration` de la ruta es **800 s**, y ya existía una reserva
> auto-calibrada que evitaba el 504. Pasar los 250 s no rompía nada: hacía que cada invocación
> avanzara menos días. La pared dura estaba cerca de **50-77 organizaciones**, no de 8.
> **El defecto estructural era real igual** (y el comentario del propio archivo lo decía), pero la
> urgencia era menor de lo que decía el titular. Detalle completo en la Bitácora.

**El límite no era la base de datos, ni Vercel, ni la plata: era un `for` sin chequeo de reloj** en
`src/lib/pixel/rollup-backfill.ts`. La unidad de trabajo era (día × tabla × TODAS las organizaciones)
y era indivisible: cuando dejaba de entrar, el cursor no avanzaba más para esa tabla y —como la
rotación elige "la más atrasada"— esa tabla ganaba todas las elecciones siguientes y las otras seis
quedaban sin turno. No se degradaba: se clavaba. **Ya está arreglado (E-01):** la unidad ahora es
(día × tabla × UNA organización) y es reanudable.

**El costo real por cliente no es infraestructura, son horas de Axel** — entre 8 y 18 por
onboarding, de las cuales 4 a 12 requieren conocimiento técnico que Tomy no tiene. Eso pone el techo
operativo en **2-3 clientes por mes**, y ese número no baja comprando servidores.

**Y había algo peor que un límite: cuando el sistema se quedaba sin presupuesto, el cliente que
quedaba sin procesar era siempre el más nuevo.** La lista salía ordenada por ID, que en este
esquema es cronológico, así que el cliente recién firmado era el que abría la app y la veía vacía.
**Ya está arreglado (E-02):** ahora se atiende primero al que tiene los datos más atrasados, que
además es auto-correctivo — el que se saltea una vuelta pasa primero en la siguiente.

---

## 2. Cómo se relaciona con `PLAN_REMEDIACION.md`

Hay dos planes y **no compiten: se anidan.** La auditoría del 2026-09-02 preguntaba *"¿qué está
roto?"*. Este estudio pregunta *"¿qué se rompe cuando entren clientes nuevos?"*. Varios hallazgos
de aquella auditoría **dejan de ser deuda técnica y pasan a ser precondiciones de vender**:

| Hallazgo de la auditoría | Con 4 clientes es… | Con 20 clientes es… |
|---|---|---|
| R-C11 · el webhook de VTEX responde 200 al fallar | una orden perdida cada tanto | pérdida de ventas en clientes que no conocés, sin traza |
| R-C15 · un onboarding trabado es invisible | el caso Arredo, que se detectó porque Tomy lo conocía | clientes que pagan y nunca se enteran de que nunca arrancaron |
| R-C16 · cero telemetría, una sola casilla de mail | tolerable: son 4 y Tomy los conoce a todos | **es el techo de la operación** |
| R-C17 · fallo → HTTP 200 con todo en cero | un llamado esporádico | el modo de falla por defecto a escala |
| R-C13 · `markSyncSuccess` incondicional | el health-check miente | el health-check miente sobre 20 clientes a la vez |
| R-C18/R-C19 · tormenta de rollups y warm-cache roto | Neon caro | **el mecanismo exacto que impide crecer** |
| R-C01..R-C09 · secretos y backdoors | riesgo aceptado | una brecha con 20 contratos firmados es otra conversación |

**Regla de secuencia:** las tareas de `PLAN_REMEDIACION.md` listadas arriba **se ejecutan como parte
de la FASE E0/E1 de este plan**, no aparte. El resto de la remediación (los medios, los bajos, el
diseño) sigue su propio ritmo y no bloquea la expansión.

---

## 3. REGLA #0 — Documentar SIEMPRE que se termina una tarea

**Aplica igual acá.** Está definida en detalle en `PLAN_REMEDIACION.md` § 1 y no se repite: al cerrar
cada tarea hay que (a) cambiar el estado en este archivo, (b) escribir la entrada en la Bitácora
(§ 11) con el formato exacto, (c) actualizar la documentación viva del repo que corresponda, y
(d) mover el contador del encabezado.

**Nada se marca ✅ sin haber corrido la validación que la propia tarea define.**

Y una regla extra, específica de este plan: **cada tarea que suba el techo de clientes tiene que
decir a cuánto lo subió.** No alcanza con "hecho": la bitácora tiene que decir "el ceiling pasó de
8 a N", con el razonamiento. Si no se puede medir, se dice.

---

## 4. Protocolo de arranque para una sesión nueva

1. `git fetch origin --prune && git status && git branch --show-current && git log --oneline -5`
2. `CLAUDE.md` — reglas de proceso, inmutables salvo que Tomy las cambie.
3. **Este archivo, entero**, empezando por la Bitácora (§ 11).
4. `PLAN_REMEDIACION.md` — el plan hermano, y su Bitácora.
5. `ERRORES_CLAUDE_NO_REPETIR.md` — 107 incidentes con causa raíz. Varios hallazgos de acá son
   reincidencias de cosas ya documentadas ahí.
6. El reporte del frente que vas a tocar, en `docs/expansion-2026-09/`.

**Dos cosas que hay que saber antes de tocar nada:**
- **NO correr `prisma db push`** — ~30 tablas de producción no están en `schema.prisma`.
- **NO rotar `NEXTAUTH_SECRET`** sin seguir el orden de `PLAN_REMEDIACION.md` § R-C07/R-C09 — tumba
  los 28 crons y el webhook de órdenes de los 4 clientes, en silencio.

---

## 5. El diagnóstico en números

### Techo actual

| Qué | Número | Fuente |
|---|---|---|
| Clientes que aguantaba el pipeline de rollups | ~~8-10~~ → **50-77** (ver corrección) · **resuelto por E-01** | `expansion-escalabilidad.md` § 1.1 + verificación del 2026-09-05 |
| Crons que iteran todas las orgs con presupuesto fijo | **14** | ídem § 2 |
| …de esos, que **no pueden continuar donde quedaron** | **8** (uno menos desde E-01) | ídem |
| Cosas ya rotas **hoy, con 4 clientes** | **3** | `sync/chain` (1 org/corrida), `warm-cache` (1,4 orgs), `attribution-reconcile` (1 org) |
| Cargas de dashboard concurrentes soportadas | **~8-15** | ídem § 5.3 — ya está por debajo de 4 clientes con 3 usuarios |
| Crecimiento de disco por cliente tamaño Arredo | **121 GB/año** | ídem § 4.3 |
| Política de retención de datos | **no existe, de ninguna clase** | ídem § 4.2 |

### Costo (todos ESTIMADOS, con el razonamiento en el reporte)

| | Mensual |
|---|---|
| Costo **fijo** (independiente de cuántos clientes haya) | **USD 275-730** |
| Costo **marginal** de un cliente chico | **USD 5-15** |
| Costo **marginal** de un cliente grande | **USD 80-200** |

**La buena noticia del estudio:** hoy el costo es casi todo fijo, así que **la expansión mejora el
margen de infraestructura** — el mismo fijo repartido entre 20 en vez de entre 4. La mala: el fijo
explota si entran varios clientes grandes sin arreglar el pipeline primero. **El límite es técnico,
no económico: el producto deja de funcionar antes de volverse caro.**

### Operación

| Qué | Número |
|---|---|
| Horas por onboarding | **8-18** (mediana ~12), de las cuales **4-12 requieren a Axel** |
| Techo de altas por mes con el equipo actual | **2-3** |
| Pasos del onboarding | **19** — 7 automáticos, 8 manuales en UI, **6 fuera del producto** |
| Pasos que pueden fallar en silencio | **13 de 14** |
| Tiempo real de detección en incidentes históricos | **5 días · 5 semanas · 22 horas · "meses"** |
| Incidentes donde avisó el cliente o alguien de casualidad | **6 de 8** |
| Destinatarios humanos de una alerta de sistema | **uno** (una casilla, literal hardcodeado en 7 archivos) |
| Operaciones frecuentes que requieren intervención técnica manual | **13** |

### Producto y plataforma

| Qué | Número |
|---|---|
| Archivos de `src/` que mencionan VTEX | **211 de 846** (98 con el literal `'VTEX'`) |
| Líneas del pixel que son capas VTEX | **~1.063 de ~1.560 (68%)** |
| Puntos de enforcement del campo `plan` | **cero** — sus 10 usos son mostrarlo en pantalla |
| Esfuerzo de agregar Shopify | **~40-50 archivos / 14 de 28 puntos de acoplamiento** |

---

# FASE E0 — El gate: qué hay que cerrar ANTES de firmar el próximo cliente

> **Tiempo estimado: 1-2 semanas.** Nada de esta fase es opcional si el próximo cliente puede ser
> grande. Y tres de estas tareas arreglan cosas que **ya están rotas hoy**, con los 4 clientes que
> hay — o sea que se pagan solas aunque no entre nadie.

### E-01 · El chequeo de reloj dentro del loop de organizaciones
- **Estado:** ✅ hecho (2026-09-05) · **Riesgo:** 🟢 bajo · **Esfuerzo real:** ~2 h · **Techo: de 8 a cientos**
- **Archivos:** `src/lib/pixel/rollup-backfill.ts:381-390` · `src/app/api/cron/refresh-pixel-rollups/route.ts`
- **Qué está mal:** el presupuesto de 250 segundos se chequea **por día procesado, no por
  organización**. Una vez que el día arranca, el `for` recorre las N orgs pase lo que pase. Cuando
  no entra, el cron muere **sin avanzar el cursor**, y como la rotación elige "la tabla más
  atrasada", esa misma tabla gana todas las elecciones siguientes: **las otras 6 nunca reciben
  turno**. No se degrada: se clava, y no se arregla solo.
- **Qué hacer:** mover el chequeo de tiempo adentro del loop de orgs, devolver el índice donde
  cortó, y persistir ese cursor para reanudar en la invocación siguiente.
- **El patrón ya existe en el repo, dos veces:** `cron/refresh-pixel-first-source/route.ts:98-101`
  lo hace bien con `orgCursor`, y `refresh-gold-attribution-channel/route.ts:82` **ya calcula el
  cursor y nadie lo consume**. No hay que inventar nada.
- **Validar:** simular N orgs y verificar que en dos invocaciones consecutivas se procesan orgs
  distintas y el cursor da la vuelta completa.
- **Esta es la tarea más importante de todo el documento.** Un chequeo de reloj adentro de un `for`
  es lo único que separa "8 clientes" de "los que quieras".

### E-02 · Que el cliente más nuevo deje de ser el que se muere de hambre
- **Estado:** ✅ hecho (2026-09-05, por orden-por-atraso; el cursor NO alcanzaba — ver Bitácora) · **Riesgo:** 🟢 bajo
- **Archivos:** los `SELECT` de organizaciones en `cron/warm-cache/route.ts:200-210`,
  `cron/refresh-silver-orders/route.ts:59`, `cron/refresh-pixel-name-dict/route.ts:43`, y la lista
  ordenada por `organizationId` del pipeline de rollups.
- **Qué está mal:** dos variantes del mismo problema. Donde **hay** `ORDER BY organizationId`, el
  orden es cronológico (los cuid son ordenables por tiempo) → **cuando el presupuesto se agota
  siempre pierde el cliente más nuevo**. Donde **no hay** `ORDER BY`, pierde siempre el mismo, pero
  quién es depende del orden físico de las filas en Postgres.
- **Qué hacer:** rotación explícita — ordenar por "última vez que se procesó esta org", ascendente.
  Con el cursor de E-01, garantiza que todas reciban turno y ninguna quede sistemáticamente atrás.
- **Por qué está en el gate:** es literalmente el peor síntoma comercial posible. El cliente que
  acabás de vender es el que ve la app vacía.

### E-03 · `sync/chain`: subir `maxDuration` y agregar cursor
- **Estado:** ✅ hecho (2026-09-05) · **Riesgo:** 🟢 muy bajo · **Esfuerzo real:** ~1,5 h · **Incluye R-C14**
- **Archivos:** `src/app/api/sync/chain/route.ts:13` (`maxDuration = 60`) y `/api/sync`.
- **Qué está mal:** con 4 organizaciones el trabajo necesita ~220 segundos y tiene 60. **Entra una
  sola org por corrida y las demás nunca sincronizan** inventario, precios ni detalles de VTEX. El
  módulo de P&L usa un `costPrice` que para esos clientes nunca se puebla.
- **Qué hacer:** subir a 300 y agregar cursor de org. `vercel.json` ya cubre estas rutas con 800;
  falta el `export`.
- **Va junto con `PLAN_REMEDIACION.md` R-C14** (el header de bypass que falta en los tres
  self-fetch). Sin ese arreglo, subir el timeout solo hace que falle más lento.

### E-04 · Un solo planificador de rollups y llamar a la purga de caché
- **Estado:** ✅ hecho (2026-09-05) · **Riesgo:** 🟢 casi cero · **Esfuerzo real:** ~40 min
- **Archivos:** `vercel.json:126-129` · `.github/workflows/keep-pixel-rollups-fresh.yml:40` ·
  `src/lib/api-cache-shared.ts:114-121`
- **Qué está mal:** hay **dos planificadores** disparando el mismo trabajo pesado (GitHub Actions
  cada 15 min con un bucle de 6, más el cron de Vercel cada 15 min), lo que da **hasta 1.750
  segundos de escaneo sobre 43 GB dentro de ventanas de 900 segundos**. Es demanda pura tirada a la
  basura que desaloja de la memoria de Neon justo las páginas que el cliente necesita. Y
  `purgeExpiredSharedCache()` está escrita y **no tiene ningún caller** (verificado por grep): la
  tabla `api_cache` acumula ~10 GB/año de basura.
- **Qué hacer:** borrar la entrada de `vercel.json`, bajar el bucle de 6 a 2, y agregar una línea
  llamando a la purga desde `warm-cache`.
- **Es `PLAN_REMEDIACION.md` R-C18 y R-C19.** Se ejecutan acá.

### E-05 · Que un cliente roto deje de romper a todos
- **Estado:** ✅ hecho (2026-09-05) · **Riesgo:** 🟢 bajo · **Esfuerzo real:** ~2 h — incluye los 3 crons
- **Archivos:** `src/lib/pixel/rollup-backfill.ts:379-390` (`backfillDay`), más `cron/digest`,
  `cron/anomalies` y `cron/ads-utm-audit` — los tres tienen el `try` **fuera** del bucle de orgs.
- **Qué está mal:** `backfillDay` itera organizaciones **sin try/catch**, con los `await` de
  inserción desprotegidos. Una sola org con un dato corrupto congela el cursor de los rollups del
  pixel **para todas las organizaciones a la vez**. La analítica de todos se va a cero, sin error
  en los logs. En `digest`, `anomalies` y `ads-utm-audit`, los clientes que quedan después en la
  lista simplemente no reciben su digest ni sus alertas.
- **Qué hacer:** try/catch por organización, seguir con la siguiente, y registrar cuál falló.
  **El patrón correcto ya está escrito** en `cron/refresh-silver-orders/route.ts:70-82`: copiarlo.
- **Por qué está en el gate:** cada cliente nuevo es una probabilidad más de que uno traiga datos
  raros y tumbe la analítica de todos los demás.

### E-06 · Cambiar el modo de falla: `allSettled` en vez de "todo en cero"
- **Estado:** ✅ hecho (2026-09-05) · **Riesgo:** 🟢 bajo, aditivo · **Esfuerzo real:** ~1,5 h
- **Archivos:** `src/app/api/metrics/pixel/route.ts:365` (el `Promise.all` de 28 queries) ·
  `src/app/api/metrics/pnl/route.ts:60-75` (el de 14)
- **Qué está mal:** cualquier timeout en una de las 28 rechaza el batch entero y devuelve el mock
  vacío con HTTP 200 → **el dashboard entero en cero**. A los 25 clientes va a haber timeouts sí o
  sí; la pregunta es si el cliente ve "una métrica no disponible" o **"mi negocio facturó $0"**.
- **El patrón ya existe, probado**, en `metrics/orders` (`safeQuery`). Copiarlo.
- **Es `PLAN_REMEDIACION.md` R-C17 (backend).** Va con R-C30 (la parte de UI): sin estados de vacío
  y error de verdad en el dashboard, el backend arregla algo que nadie ve.

### E-07 · Cerrar las puertas antes de firmar contratos
- **Estado:** 🟡 parcial (2026-09-05) — R-C01/R-C03/R-C04 hechos; R-C02 espera decisión, R-C05/06/07/08/09 esperan acceso a Vercel
- **Qué:** ejecutar la **tanda 1.1 y 1.2 completas de `PLAN_REMEDIACION.md`** — los tres backdoors,
  la inyección SQL de `backfill/vtex`, los endpoints públicos (`/api/debug/meta` devuelve datos de
  todos los tenants sin autenticación), el fail-open de `ml-sync`, y la separación y rotación de
  secretos siguiendo el orden exacto de R-C07 → R-C08 → R-C09.
- **Por qué está en el gate y no en "cuando haya tiempo":** con 4 clientes que Tomy conoce, una
  brecha es un problema. Con 20 contratos firmados, es otra conversación — y `/api/debug/meta`
  pasa de ser una filtración menor a ser una brecha reportable.

### E-08 · Convertir el backfill de alta en un evento controlado
- **Estado:** ⬜ pendiente · **Riesgo:** 🟡 medio · **Esfuerzo:** 4-6 h
- **Archivos:** `src/lib/backfill/job-manager.ts:71-84` (cola FIFO **global**, sin noción de org) ·
  `admin/onboardings/[id]/approve-backfill/route.ts:181-188` (disparo inmediato al aprobar) ·
  `vercel.json:120-123` (`backfill-runner` corre **cada minuto** con `maxDuration=300`)
- **Qué está mal:** **el momento de mayor riesgo para los clientes existentes es cuando entra uno
  nuevo.** El backfill de Arredo trajo 252.701 órdenes y tumbó Neon repetidas veces — está
  documentado en `BACKLOG_PENDIENTES.md` → BP-NEON-CAPACITY. No hay throttling, no hay ventana
  horaria, no hay aislamiento, y `backfill-runner` puede tener 4-5 lambdas concurrentes.
- **Qué hacer:** ventana horaria configurable (de madrugada), límite de un backfill pesado a la vez,
  y un freno que lo pause si la latencia de la base cruza un umbral.
- **Escenario a cubrir explícitamente:** dos clientes nuevos la misma semana.

---

# FASE E1 — Subir el techo de verdad

> Después del gate, esto es lo que lleva de "10 clientes" a "los que quieras". Estimado: 2-4 semanas.

### E-09 · Retención de `pixel_events`
- **Estado:** ⬜ pendiente · **Riesgo:** 🔴 alto — **es lo único del plan que destruye datos**
- **Esfuerzo:** 4-8 h + OK explícito de Tomy sobre la ventana
- **Qué está mal:** **no hay política de retención de ninguna clase.** `pixel_events` guarda todo
  desde 2024 en la tabla caliente. Son 1,79 KB por fila → **121 GB por año por cliente tamaño
  Arredo**.
- **Qué compra:** el working set de Arredo pasa de 43 GB a **~9 GB**. Con 5 Arredos: de 215 GB a
  **45 GB**, que sí entra en Neon. **Es lo único que hace viable el escenario de varios clientes
  grandes**, y baja el costo de almacenamiento por cliente grande de ~USD 180 a ~USD 38 al mes: el
  mayor movimiento de margen bruto disponible en el producto.
- **PRECONDICIÓN INNEGOCIABLE:** verificar que los rollups cubren el 100% de la historia que la UI
  muestra. Hoy **`pixel_daily_channel` está vacía** por un `catch {}` silencioso, y el backfill
  masivo del rollup de canal sigue pendiente (`BACKLOG_PENDIENTES.md` → BP-PIXEL-CHANNEL-ROLLUP).
  **No borrar un solo evento hasta que eso cierre.**
- **Además es un requisito de cumplimiento**, no solo de performance — ver E-20.

### E-10 · Unidad de trabajo = (organización, tabla, día)
- **Estado:** ⬜ pendiente · **Riesgo:** 🟡 medio · **Esfuerzo:** 1-2 semanas · **Depende de:** E-01
- **Qué:** el modelo actual es "una tabla, todas las orgs, en una invocación". Eso no escala por
  diseño, y E-01 solo lo parchea. El modelo correcto es una **cola persistida de unidades chicas**,
  con workers que toman de a una.
- **Cuándo hace falta:** el estudio lo ubica como precondición para pasar de **25 clientes**.
  Antes de eso, E-01 + E-02 alcanzan.
- **No arrancar esto antes de tener el gate cerrado.** Es el cambio más grande del plan.

### E-11 · Cursor persistido en los 8 crons que no pueden reanudar
- **Estado:** ⬜ pendiente · **Riesgo:** 🟢 bajo · **Esfuerzo:** 4-8 h
- **Qué:** de los 14 crons que iteran todas las organizaciones, **8 no tienen forma de continuar
  donde quedaron** (o no tienen cursor, o lo calculan y nadie lo llama). El modo de falla al crecer
  no es "más lento": es **"a algunos clientes no les corre nunca"**, en silencio.
- La lista completa está en `docs/expansion-2026-09/expansion-escalabilidad.md` § 2.

### E-12 · `warm-cache` por rotación
- **Estado:** ⬜ pendiente · **Riesgo:** 🟢 bajo · **Esfuerzo:** 2-4 h
- **Qué está mal:** recorre organización → rango → endpoint, o sea **8 fetches por org**, con
  presupuesto para ~11. **Con 4 clientes ya está truncado**; con 20 se calentaría el 7% de los
  clientes. Y sin `ORDER BY` no rota: los mismos primeros se llevan todo.
- **Va junto con `PLAN_REMEDIACION.md` R-C19**, que además arregla que la clave que calienta no es
  la que lee `/pixel/analytics` (le falta `&model=` — un arreglo de una línea que hoy tira a la
  basura el 100% de ese trabajo).

---

# FASE E2 — Bajar el costo de meter un cliente

> De 12 horas a 3-4 por alta. Estimado: 2-3 semanas. Es lo que sube el techo de 2-3 clientes por mes.

### E-13 · Exponer el test de credenciales en el wizard
- **Estado:** ⬜ pendiente · **Riesgo:** 🟢 bajo · **Esfuerzo:** 3-5 h
- **Qué:** `credential-tests.ts` son **1.054 líneas que ya cubren 6 plataformas** y hoy están
  disponibles solo para el admin, por decisión explícita. Exponerlo en el wizard y **bloquear el
  submit hasta que las credenciales pasen** elimina una ida y vuelta completa por cliente.
- **La pieza más cara del self-serve ya está escrita y apagada.**

### E-14 · Verificación real del pixel, no un checkbox
- **Estado:** ⬜ pendiente · **Riesgo:** 🟢 bajo · **Esfuerzo:** 4-6 h
- **Qué está mal:** el wizard tiene un checkbox "ya pegué el snippet" **que el backend descarta**
  (`NITROPIXEL` no está en `VALID_PLATFORMS`). Lo mismo con la propertyUrl de GSC.
- **Qué hacer:** verificar de verdad — que hayan llegado eventos de esa organización en los últimos
  N minutos. Ya existe `/api/nitropixel/install-status`.
- **Sin esto, un cliente puede completar el alta entero sin haber instalado el pixel.**

### E-15 · `checkOnboardingReadiness()` — el semáforo que falta
- **Estado:** ⬜ pendiente · **Riesgo:** 🟢 bajo · **Esfuerzo:** 6-10 h
- **Qué:** no existe ningún objeto que diga "este cliente está listo". Los insumos sí existen
  (install-status, data-quality-score, conteo de órdenes, conexiones); falta el que los junta.
- **El NitroScore no sirve como semáforo** aunque sea tentador: mide calidad del pixel, no
  completitud del onboarding, y en el día 1 devuelve `null` por diseño.
- **Va junto con `PLAN_REMEDIACION.md` R-C15**, que agrega `BACKFILLING` al check de onboardings
  trabados. El estudio encontró que **también falta `READY_FOR_REVIEW`**.

### E-16 · Arreglar la cadena de finalización del backfill
- **Estado:** ⬜ pendiente · **Riesgo:** 🟢 bajo · **Esfuerzo:** 2-3 h
- **Qué está mal:** el disparo de `post-backfill-finalize` es un `fetch` fire-and-forget **sin
  `waitUntil`**; en Vercel la función se congela al responder y ese fetch puede no salir nunca.
  Si se pierde, **nunca corren el catalog-refresh, el recompute de agregados ni el backfill de
  `costPrice`** → el módulo de P&L del cliente queda entero en cero, sin ninguna señal.
- El mismo archivo usa `waitUntil` bien en otras dos partes: es un olvido, no una decisión.

### E-17 · Versionar lo que hoy vive solo en el disco de Axel
- **Estado:** ⬜ pendiente · **Riesgo:** 🟢 bajo · **Esfuerzo:** 4-8 h
- **Qué está mal:** `.gitignore` excluye `*.local.md` y `*.local.sql`. Eso saca del repositorio:
  `PROJECT-HANDOFF.local.md` —que se autodescribe como *"documento maestro, para un chat nuevo leé
  esto primero"*—, y **los `.sql` de backfill por cliente**: `backfill-1-cmod6ns.local.sql`,
  `backfill-2-emdj.local.sql`, `backfill-3-cmohl80fx.local.sql`. Son el mismo SQL de 250 líneas con
  el `organizationId` cambiado. **Hay literalmente un archivo por cliente, ninguno versionado.**
- **Qué hacer:** convertir ese SQL en un endpoint o script parametrizado por org (deja de haber un
  archivo por cliente), y versionar el handoff sin los secretos.
- **Esto es lo que hace que el bus factor sea 1.** No por falta de documentación —hay muchísima—
  sino porque la que importa no está versionada y describe procedimientos manuales.

### E-18 · Runbook operativo de alta de cliente
- **Estado:** ⬜ pendiente · **Riesgo:** 🟢 bajo · **Esfuerzo:** 3-4 h
- **Qué:** los 6 runbooks que existen son excelentes y son todos del mismo tipo: recetas de SQL para
  construir la capa Medallion. **No hay un solo runbook operativo.** Falta: cómo onboardear de punta
  a punta, qué hacer cuando un cliente dice que ve todo en cero, cómo verificar que su pixel está
  sano, cómo responder un pedido de borrado de datos.
- **El paso más crítico no está documentado en ningún lado:** registrar el afiliado VTEX del cliente
  es conocimiento implícito de Tomy, y sin eso **no llega ni un webhook**. Ya rompió a TeVeCompras
  entero (0 de 8 órdenes atribuidas).

---

# FASE E3 — Enterarse antes que el cliente

> Estimado: 1-2 semanas. Sin esto, cada cliente nuevo suma superficie que nadie mira.

### E-19 · Detección por cliente, y que empuje
- **Estado:** ⬜ pendiente · **Riesgo:** 🟢 bajo · **Esfuerzo:** 6-10 h
- **Tres cambios, ninguno arquitectónico:**
  1. **`checkPipelineFreshness` por organización.** Hoy es `SELECT MAX(columna) FROM tabla` **sin
     `WHERE`** (`src/lib/pipeline/freshness.ts:100-104`). Con 20 clientes, si 19 refrescan bien y
     uno queda congelado, **el chequeo da verde**. La detección se diluye exactamente en proporción
     al crecimiento. Agrupar por `organization_id` la convierte en un chequeo que **se afila** con
     cada cliente. Es la línea de mayor apalancamiento del estudio.
  2. **Agendar `/api/admin/alertas`.** Los 4 mejores checks del repo —pixel muerto habiendo tenido
     eventos, pixel nunca instalado, baja identificación, tráfico con cero compras (o sea webhook
     roto)— **ya están escritos y funcionan**. No están en ningún cron: son una página que hay que
     acordarse de abrir. Falta un cron y un mail.
  3. **Más de un destinatario.** Hoy todas las alertas van a una sola casilla, con un literal
     hardcodeado en 7 archivos, y hay problemas de entregabilidad documentados. Si esa casilla
     manda los mails a spam, **el sistema pierde su único sentido de la vista**.

### E-20 · Telemetría de verdad
- **Estado:** ⬜ pendiente · **Riesgo:** 🟢 bajo · **Esfuerzo:** 4-8 h
- **Es `PLAN_REMEDIACION.md` R-C16.** Un dato importante que agrega este estudio: **no es un olvido**
  — se probó Sentry y se sacó porque agregaba 15-25 segundos al arranque en frío
  (`CLAUDE_STATE.md:6455`). Es una decisión vieja que nunca se revisó. Hoy hay alternativas de bajo
  overhead, y el costo de no tener nada ya se pagó varias veces (5 días, 5 semanas, "meses").

### E-21 · Un panel de consumo y costo por cliente
- **Estado:** ⬜ pendiente · **Riesgo:** 🟢 bajo · **Esfuerzo:** 8-12 h
- **Qué:** hoy **no se puede costear un cliente**. `aurum_usage_logs` guarda tokens pero **no
  dólares** (no hay tabla de precios en ningún lado del repo), y no hay ninguna métrica de consumo
  por organización en ninguna unidad.
- **Y esto no es solo higiene: es un bloqueante comercial.** El modelo de precios que Tomy ya eligió
  (Scope × Scale) se factura por **órdenes/mes, SKUs, integraciones, eventos de pixel, usuarios y
  uso de IA**. De esas seis dimensiones, **ninguna tiene hoy un reporte por organización listo para
  facturar.** Si el precio es por consumo, **medir el consumo es parte del producto**.

---

# FASE E4 — Producto vendible

> Lo que hay que construir para poder vender paquetes distintos y cumplir un contrato.

### E-22 · Convertir `plan` en algo con efecto
- **Estado:** ⬜ pendiente · **Riesgo:** 🟡 medio · **Esfuerzo:** 1-2 semanas
- **Qué está mal:** `Organization.plan` es un enum `STARTER | GROWTH | PRO` cuyos **10 usos son
  mostrarlo en pantalla**. Cero enforcement. El único gate real es el RBAC por sección, que se usa
  comercialmente **editando un rol a mano en la base** (así se le vendió "solo el pixel" a
  TeVeCompras).
- **Cinco bloqueos concretos:** la entitlement es por usuario y no por organización; `OWNER` está
  hardcodeado como admin-de-todo, así que **el dueño de la tienda ve todo sin importar qué compró**;
  falta un estado `NOT_CONTRACTED` (solo hay `ACTIVE|LOCKED_INTEGRATION|MAINTENANCE`, y
  MAINTENANCE muestra "en mantenimiento", que es el copy equivocado y cero upsell); siete módulos no
  declaran `requires` y se entregan abiertos y vacíos; y `/seo` ni figura en `SECTIONS`.
- **La buena noticia:** el paquete chico que el código **ya soporta** es NitroPixel + Pedidos +
  Productos + Aurum en modos rápidos + dashboard acotado. Es casi el default `MEMBER` y ya está
  probado con TeVeCompras.

### E-23 · Cuota y contabilidad de costo en Aurum
- **Estado:** ⬜ pendiente · **Riesgo:** 🟢 bajo · **Esfuerzo:** 4-6 h
- **Qué está mal:** el modo DEEP (Opus, 8 rondas de razonamiento) **lo elige el cliente desde la
  UI**, no hay cuota ni rate limit en `/api/chat`, y los logs no guardan dólares. Es el único
  componente con costo variable sin techo.

### E-24 · Piso de volumen en el motor de anomalías
- **Estado:** ⬜ pendiente · **Riesgo:** 🟢 bajo · **Esfuerzo:** 2-3 h · **Desbloquea el segmento chico**
- **Qué está mal:** el detector es 100% porcentual **sin piso de volumen**. A 7 órdenes por día,
  pasar a 4 dispara una alerta HIGH de "facturación cayó 43%". **Un cliente chico deja de leer las
  alertas en dos semanas** — y con eso pierde el único canal proactivo del producto.

### E-25 · Dejar de mostrar margen bruto del 100%
- **Estado:** ⬜ pendiente · **Riesgo:** 🟢 bajo · **Esfuerzo:** 2-3 h
- **Qué está mal:** sin costos cargados, `COALESCE(costPrice, 0)` da **margen bruto 100%**
  (`api/metrics/pnl/route.ts:94`). Solo una de las dos pantallas de finanzas avisa; `/finanzas/pulso`
  no. **Con un cliente chico el producto no se rompe: miente.**

### E-26 · Propagar la bandera de truncado a la UI
- **Estado:** ⬜ pendiente · **Riesgo:** 🟢 bajo · **Esfuerzo:** 3-4 h · **Desbloquea el segmento grande**
- **Qué está mal:** el LTV behavioral puntúa **solo 500 visitantes** y el churn risk **solo 200**,
  sin ninguna bandera en la respuesta ni en la pantalla. **Truncado silencioso en un producto de
  analytics.** El patrón correcto ya existe (`PRODUCT_UNIVERSE_CAP` avisa y devuelve
  `meta.productUniverseTruncated`) pero **ningún componente lee ese flag**.
- **Hallazgo colateral para el equipo de datos:** la UI promete "BG/NBD + Gamma-Gamma" pero el motor
  real es una heurística de cohortes. Eso hay que corregirlo en el copy o en el motor, pero no se
  puede dejar como está.

### E-27 · Ciclo de vida de una organización
- **Estado:** ⬜ pendiente · **Riesgo:** 🟡 medio · **Esfuerzo:** 1 semana
- **Qué falta para poder vender:**
  - **Suspender** un cliente que no paga: **no existe** (no hay `status` en `Organization`).
  - **Exportar** los datos de un cliente: **no existe** como función.
  - **Borrar** todo cuando un cliente se va: existe `wipe-account` pero **está incompleto**.

### E-28 · Borrado completo y retención — cumplimiento
- **Estado:** ⬜ pendiente · **Riesgo:** 🟡 medio · **Esfuerzo:** 1 semana · **Depende de:** E-09
- **El hallazgo más expuesto del estudio.** El sistema guarda, **de los compradores de sus
  clientes**: emails, teléfonos normalizados, ciudad/provincia/país, identificadores de dispositivo,
  cookies de terceros y el historial completo de navegación y compra. Una búsqueda de `gdpr`,
  `retention`, `anonimiz*`, `purge`, `data deletion` sobre todo el repo da **cero resultados
  relevantes**.
- **`wipe-account` deja atrás:** toda la capa Silver, toda la capa Gold, los 8 rollups
  `pixel_daily_*`, `pixel_visitor_first_source` (3,9M filas), `api_cache`, `email_log` (conservado a
  propósito, con las direcciones) y `aurum_usage_logs`.
- **Hoy no se puede responder honestamente "sí, borramos todo".** Con 4 clientes conocidos es un
  riesgo teórico; con 20 contratos firmados es una cláusula que se va a incumplir.
- **Notar:** las tablas que quedan son justamente las que **no están en `schema.prisma`**. Es un solo
  defecto con dos consecuencias graves — la otra es que `prisma db push` las borraría. Se cierra
  junto con `PLAN_REMEDIACION.md` R-C22.
- **Dos cosas más antes de firmar con un cliente grande:** `dashboardPasswordPlain` (contraseñas en
  claro en la base) y `/api/debug/meta` (público, sin autenticación, datos de todos los tenants).

---

# FASE E5 — La decisión de plataforma

> Esto no es trabajo: es una decisión de Tomy, con el número al lado.

### E-29 · Arreglar la promesa falsa del wizard
- **Estado:** ⬜ pendiente · **Riesgo:** 🟢 bajo · **Esfuerzo:** 1-2 h · **HACER YA**
- **Qué está mal:** el wizard de onboarding **ya ofrece Shopify y Tiendanube**, y deja completar el
  alta sin conectar nada (`submit-wizard:304` solo "captura interés"). Un cliente Shopify que entre
  hoy tendría `/orders` y `/products` bloqueados, Bondly vacío, y un pixel que captura tráfico pero
  **cero compras, cero carrito y cero identificación**.
- **Qué hacer:** o se sacan del wizard, o se marcan explícitamente como "próximamente / lista de
  espera". Es un problema comercial de una línea.

### E-30 · Las 8 movidas baratas que compran opcionalidad
- **Estado:** ⬜ pendiente · **Riesgo:** 🟢 bajo · **Esfuerzo:** 1-2 semanas en total
- **La más valiosa:** partir el pixel en **núcleo genérico + `vtexLayers()`**, sin cambiar un byte
  del JavaScript que se emite hoy. De sus ~1.560 líneas, ~490 son genéricas (UTMs, click IDs,
  cookies de TLD compuesto, sesiones, filtro de bots) y ~1.063 son capas VTEX. Esto convierte
  "agregar Shopify" en escribir una función nueva, en vez de operar sobre el CORE PROTEGIDO.
- **Cuatro de las ocho son bugs latentes que hay que arreglar igual:** el `COALESCE("source",'VTEX')`
  repetido 42 veces (una orden sin plataforma **es** una orden VTEX), las `VALID_SOURCES`, el mapper
  de estados de ML triplicado, y las claves únicas sin `source`.

### E-31 · Decisión: ¿se abre a otra plataforma?
- **Estado:** 🔒 esperando decisión de Tomy
- **Los números para decidir:**
  | Opción | Esfuerzo | Nota |
  |---|---|---|
  | Agregar **Shopify** | ~40-50 archivos, 14 de 28 puntos de acoplamiento | ⚠️ **Riesgo no cuantificado:** el checkout de Shopify vive en otro dominio y no admite scripts de terceros. Eso no es un port, es otra arquitectura de captura. **Requiere un spike de 1 día antes de prometer nada.** |
  | Agregar **Tiendanube** después | ~35-45 archivos | Ahorra poco: se repetiría el patrón de ML |
  | **Refactor** a adaptador de plataforma | ~50-65 archivos, y baja la cuarta a ~10-14 | Se paga a partir de la **segunda** plataforma nueva |
- **Dato que contradice a la doc comercial: Tiendanube es técnicamente más barato que Shopify**,
  porque su checkout está en el dominio propio y el pixel funciona con mucho menos trabajo. El
  mercado es menor, pero el costo de entrada también.
- **La recomendación del estudio es NO hacer el refactor ahora**: hay críticos abiertos, no hay
  staging, y el webhook de 766 líneas que ingiere todas las órdenes no tiene un solo test. Hacer
  E-30 compra la opcionalidad a una fracción del costo.
- **El precedente que hay que tener presente:** MercadoLibre **no se abstrajo, se duplicó** — 8
  implementaciones paralelas de "escribir una orden", el mapper de estados triplicado, y lo más
  grave: **las órdenes de ML nunca pasan por el motor de atribución.** La segunda plataforma entró
  sin la funcionalidad que define al producto.

---

# 9. Las decisiones que necesitan a Tomy

| # | Decisión | Por qué no la puede tomar el equipo técnico |
|---|---|---|
| 1 | **¿Cuánta historia de `pixel_events` se conserva?** (E-09) | Es un trade-off de producto: 90 días baja el costo y hace viable el crecimiento, pero limita los análisis históricos crudos |
| 2 | **¿Se abre a Shopify/Tiendanube, o se profundiza en VTEX?** (E-31) | Es la decisión comercial más grande del semestre, y ahora tiene números |
| 3 | **¿Qué se le vende a un cliente chico?** (E-22) | El código ya soporta un paquete acotado; falta decidir qué entra |
| 4 | **¿Cuál es el ticket mínimo?** | Un cliente grande cuesta USD 80-200/mes de infraestructura más 8-18 horas de alta. Si el ticket no lo supera holgadamente, cada cliente grande pierde plata |
| 5 | **¿Las cuentas de ads facturan en pesos o en dólares?** (viene de `PLAN_REMEDIACION.md` R-V05, sigue sin respuesta) | Si alguna es en USD, el ROAS de ese canal está mal por un factor de ~1.000 |

---

# 10. Secuencia recomendada

| Momento | Qué | Por qué |
|---|---|---|
| **Ahora, antes de firmar a nadie** | E-29 (sacar Shopify/Tiendanube del wizard) | Un cliente puede darse de alta hoy en una plataforma que no funciona |
| **Semana 1-2** | FASE E0 completa (E-01 a E-08) | Tres de esas arreglan cosas ya rotas con 4 clientes. E-01 sola multiplica el techo por diez |
| **Semana 3-4** | E-19, E-20 (detección y telemetría) | Antes de sumar clientes hay que poder enterarse de que se rompen |
| **Semana 4-6** | FASE E2 (onboarding) | Baja el costo por alta de ~12 h a 3-4 y sube el techo de 2-3 clientes/mes |
| **Cuando haya 2 clientes grandes a la vista** | E-09 (retención) + E-10 (cola de trabajo) | Son los dos que habilitan el escenario de varios clientes grandes |
| **Antes del primer contrato serio** | E-27, E-28 (ciclo de vida y cumplimiento) | No se puede firmar prometiendo borrado de datos que no existe |
| **En paralelo, sin bloquear** | El resto de `PLAN_REMEDIACION.md` | Los medios y bajos, y toda la tanda de diseño |

---

# 11. Bitácora

> Formato en `PLAN_REMEDIACION.md` § 1 (REGLA #0). Lo más nuevo primero.
> **Si la Bitácora y el estado de una tarea se contradicen, gana la Bitácora.**

### [2026-09-05] E-07 (primera mitad) — puertas que se cierran solo con código
- **Estado final:** 🟡 parcial — la mitad de código está hecha; **la rotación de secretos sigue
  pendiente y necesita acceso a Vercel**
- **Qué se cambió, en criollo:** había tres direcciones internas de la aplicación que tenían la
  contraseña escrita al lado, en el propio código. Cualquiera que leyera el repositorio —o que
  probara— podía entrar sin cuenta desde internet y, en uno de los casos, **reescribir a qué canal
  se le atribuye cada venta de todos los clientes a la vez**, que es lo que define cuánta comisión
  cobra cada creador. Se cerraron las tres. Además se borró una dirección pública que devolvía
  conteos de pedidos y clientes de todos los clientes juntos, y se arregló un cron que quedaba
  abierto si faltaba una variable de configuración.
- **Commit:** `9021d657` en `fix/expansion-gate-e0`.
- **Validación ejecutada:** `tsc` exit 0 · `vitest` exit 0, **446 pasan** · `next build` exit 0.
- **⚠️ CAMBIO DE WORKFLOW para el equipo:** `/admin/usage` ahora pide `?key=<ADMIN_API_KEY>` en
  vez de `?key=usage-2026`. La página sigue tomando la clave de la URL; hay que pasarle la de
  verdad. Está documentado en la cabecera de la página.
- **Qué NO quedó cubierto — y por qué:**
  - **R-C02, la inyección SQL de `/api/backfill/vtex`.** Es una decisión de producto, no técnica:
    lo correcto es **borrar el endpoint** (tres de sus fases están rotas de todos modos — escriben
    con `organizationId = ''`, confirmado), pero hay que saber si el onboarding lo usa. No lo toqué
    sin esa respuesta.
  - **R-C05, los huecos del middleware.** Su último paso depende de que todos los JWT viejos hayan
    expirado, o sea de la rotación.
  - **R-C06, las contraseñas de creadores en texto plano.** Requiere avisarles y forzar reseteo.
  - **R-C07/08/09, la separación y rotación de secretos.** Necesita el panel de Vercel, y el orden
    es crítico: **rotar `NEXTAUTH_SECRET` antes de que el webhook de VTEX tenga su propio secreto
    tumba el ingreso de órdenes de los cuatro clientes, en silencio.** El procedimiento paso a paso
    está en `PLAN_REMEDIACION.md` § R-C07 → R-C08 → R-C09.

---

### [2026-09-05] Revisión de la branch por dos agentes independientes → 8 correcciones
- **Estado final:** ✅ hecho · commit `76060ec2`
- **Qué se hizo:** antes de mergear se revisó la branch con dos agentes: uno **sin contexto
  previo** (para que no arrastrara las suposiciones de quien la escribió) y otro corriendo las
  skills `code-review high` y `security-review`. Los dos llegaron, por caminos distintos, a la
  misma conclusión: **no mergeable como estaba**.
- **Lo más importante, y es incómodo: el fix central de E-01 abría un agujero de datos.** El corte
  intra-día escribía las filas de las organizaciones ya procesadas, pero el cron elige el rango con
  el `MAX(day)` **global** de la tabla. Alcanzaba que UNA organización escribiera el día D para que
  D quedara cerrado para todas: al pasar la medianoche el rango arranca en `MAX+1` y las que no
  llegaron **pierden ese día para siempre**. Con `ok: true` en la respuesta, la alerta de frescura
  en verde y el auto-chequeo de coherencia salteado justo en ese caso. O sea: en el camino que
  corre en producción, mi cambio dejaba las cosas **peor** que antes.
- **Las 8 correcciones** (detalle completo en el mensaje del commit):
  1. El runner ya no corta un día a mitad de las organizaciones — todo-o-nada, como era.
  2. Se removió el andamiaje de `nextOrgCursor`, que era **código muerto**: nunca se parseaba del
     query string, no salía en la respuesta, y el `continue` era inalcanzable.
  3. **Se revirtió el orden "por atraso" de E-02.** No auto-corregía (el cron procesa una tabla por
     invocación y el proxy no se escribe en 7 de 8) y con las organizaciones al día degeneraba
     exactamente en el orden que pretendía reemplazar. Sin corte intra-día la equidad queda
     garantizada por construcción, que es más fuerte que cualquier orden.
  4. `allOrEmpty` metía `[]` en dos resultados que se consumen sin `?.` → TypeError → **el mismo
     dashboard en cero que E-06 dice arreglar**.
  5. La purga de `api_cache` corría sin `LIMIT` en el camino crítico.
  6. Los tres crons de E-05 devolvían `ok: true` aunque fallaran todas las organizaciones.
  7. Volvió una entrada de respaldo en `vercel.json` (1×/hora): GitHub **deshabilita los workflows
     programados tras 60 días sin actividad**, que es justo el fallo que ese workflow cubría.
  8. Se redactó el literal de la clave de admin en los 6 archivos de documentación que subí.
- **Sobre los tests, que es donde más me equivoqué:** `cron-org-isolation.test.ts` verificaba que
  un **comentario** siguiera existiendo. Un reviewer lo llamó *teatro* y tiene razón. Ahora
  verifica que el `try` esté dentro del bucle y antes del primer `await`. También se borró
  `rollup-org-order.test.ts`: pasaba porque **el propio test hacía el `INSERT` que en producción no
  ocurre** — probaba una propiedad que el sistema no tiene.
- **Validación ejecutada:** `tsc` exit 0 · `vitest` exit 0, **438 pasan** · `next build` exit 0 ·
  `vercel.json` parsea, 28 crons, sólo claves `path`/`schedule`.
- **Qué NO quedó cubierto:** ningún test cruza el borde de una invocación de cron, que es
  exactamente donde estaba el bug principal. Eso pide un test de integración con la base, que hoy
  no existe para este camino.
- **La lección, para que quede escrita:** las cuatro tareas pasaban `tsc`, 45 tests propios y el
  build, y aun así la funcionalidad central no funcionaba y una parte empeoraba las cosas. **Los
  tests verdes no son evidencia de que el cambio haga lo que dice.** Una revisión sin contexto
  antes de mergear costó ~20 minutos y evitó un agujero de datos silencioso en producción.

---

### [2026-09-05] E-03 y E-06 — dos cosas que estaban rotas ahora, no en el futuro
- **Estado final:** ✅ hecho
- **Qué se cambió, en criollo:**
  1. **El sync de VTEX atendía a un solo cliente por vuelta.** Tenía un minuto de techo y cada
     cliente necesita casi un minuto entero, así que entraba uno y los demás se quedaban sin
     actualizar inventario, precios ni detalles — por eso el módulo de rentabilidad de esos
     clientes nunca tenía costos. Ahora el techo es de cinco minutos, entran todos, y se atiende
     primero al que hace más tiempo que no corre.
  2. **Si una consulta del panel fallaba, el panel entero mostraba cero.** Son 28 consultas en
     paralelo y una sola que fallara tiraba abajo las 28: el cliente no veía "esta métrica no está
     disponible", veía *"mi negocio facturó $0"*. Ahora la que falla deja su tarjeta vacía y las
     otras 27 muestran sus datos. Y algo igual de importante: **ese resultado incompleto ya no se
     guarda en la caché**, así que un fallo de segundos deja de convertirse en media hora de
     números mal para todos los usuarios de ese cliente.
- **Archivos tocados:** `src/app/api/sync/chain/route.ts`, `src/lib/sync/chain-budget.ts` (nuevo),
  `src/app/api/metrics/pixel/route.ts`, y dos test nuevos.
- **Commits:** `648b5265` (E-03 + R-C14) · `e7405554` (E-06).
- **Validación ejecutada:** `tsc --noEmit` → **exit 0**. `vitest run` → **exit 0, 441 tests pasan**
  (eran 396 al empezar el día; +45). `next build` → **exit 0**.
- **Se cerró además `PLAN_REMEDIACION.md` R-C14** (el header de bypass que faltaba en los tres
  self-fetch de `sync/chain`). Iba de la mano: subir el timeout sin eso sólo hacía que fallara más
  lento, porque cuando dispara Vercel Cron los tres pasos recibían 401 con un body HTML.
- **Qué NO quedó cubierto:**
  - **R-C13 sigue abierto a propósito.** `markSyncSuccess` se llama incondicionalmente, así que
    aunque los tres pasos fallen, la conexión queda marcada como sana. Lo dejé afuera porque
    cerrarlo **va a hacer aparecer alertas que hoy están ocultas**, y eso hay que avisárselo a Tomy
    antes de deployar para que no lo lea como una regresión.
  - El `_degraded` que ahora devuelve la API **todavía no lo lee ninguna pantalla**. El backend ya
    puede decir "esto no cargó"; falta que el front lo muestre (es la parte de UI de R-C17/E-30).
    Hasta entonces, el cliente ve una tarjeta vacía en vez de un cero — mejor, pero no explicado.
- **Efectos secundarios / lo que hay que vigilar:** `sync/chain` va a tardar bastante más por
  corrida (de ~55 s a hasta ~4 min con 4 clientes), porque ahora hace el trabajo que antes se
  saltaba. Es lo esperado, no una regresión. Y va a empezar a aparecer `_degraded` en las
  respuestas: si aparece seguido, es una señal real que antes estaba tapada.
- **Techo de clientes:** `sync/chain` pasó de **1 organización por corrida a ~4**, y el corte por
  presupuesto ya no discrimina siempre a las mismas.

---

### [2026-09-05] E-02 (de verdad) y E-05 completo — branch `fix/expansion-gate-e0`
- **Estado final:** ✅ hecho — y **corrige un ✅ prematuro de la entrada anterior**
- **Qué se cambió, en criollo:**
  1. **El orden en que se atiende a los clientes.** La lista salía ordenada por
     antigüedad, así que cuando faltaba tiempo el que quedaba sin procesar era siempre el más
     nuevo. Ahora se atiende primero al que tiene los datos más atrasados: el que se saltea una
     vuelta pasa primero en la siguiente, solo, sin que nadie lo administre.
  2. **Los otros tres procesos que se caían enteros por un cliente.** `digest`, `anomalies` y
     `ads-utm-audit` ahora aíslan cliente por cliente, igual que el de rollups.
- **Archivos tocados:** `src/lib/pixel/rollup-backfill.ts` (la query de orden),
  `src/app/api/cron/{digest,anomalies,ads-utm-audit}/route.ts`, y dos test nuevos:
  `src/__tests__/rollup-org-order.test.ts`, `src/__tests__/cron-org-isolation.test.ts`.
- **Commits:** `98608224` (aislamiento de los 3 crons) · `eb25f50d` (orden por atraso), en la
  branch **`fix/expansion-gate-e0`**, con OK de Tomy para crearla.
- **Validación ejecutada:** `tsc` → **0 errores**. `vitest` → **423 pasan** (eran 396 al empezar
  el día; +27), 7 skipped. `next build` → **OK**. La query de orden se probó contra Postgres real
  (PGlite), no contra un mock.
- **CORRECCIÓN A LA ENTRADA ANTERIOR — E-02 estaba mal marcada como cerrada.** La revisión del
  propio diff (skill `code-review`) mostró que la reanudación por org que agregué en `545e0317`
  **es casi inoperante en el camino del cron**: `MIN_SLICE_MS` (200 s) contra
  `INVOCATION_BUDGET_MS` (250 s) deja lugar para ~1 llamada al runner por invocación, así que el
  cursor se setea y se pierde al terminar. Como no se persiste, la invocación siguiente reempezaba
  el día desde la primera org — o sea que **la inanición del cliente más nuevo seguía viva**.
  El fix real es el orden por atraso, que no necesita estado. El `orgCursor` se mantiene igual:
  sirve para el endpoint admin y para cuando el presupuesto alcance para varias llamadas.
- **Qué NO quedó cubierto:**
  - El cursor de org **sigue sin persistirse entre invocaciones**. Ya no hace falta para la
    equidad (lo resuelve el orden), pero sería necesario si algún día una sola organización no
    entra completa en una invocación.
  - `pixel_daily_aggregates` es un **proxy** del atraso: si una org está al día en esa tabla pero
    atrasada en otra de las siete, el orden no lo ve. Es una aproximación deliberada — la
    alternativa era una query por tabla y no vale la complejidad hoy.
- **Efectos secundarios / lo que hay que vigilar:** el orden de procesamiento cambia respecto de
  lo que venía pasando hace meses. En régimen normal (todas al día) el orden queda igual al viejo,
  porque desempata por id. La diferencia aparece justo cuando hay atraso, que es cuando importa.

---

### [2026-09-05] E-01 · E-04 · E-05 (parcial) — primeras tareas del gate
- **Estado final:** ✅ hecho (E-05 parcial: falta replicar el patrón en 3 crons — ver abajo)
- **Qué se cambió, en criollo:** el proceso que arma las estadísticas del pixel recorría a todos
  los clientes de una sentada, sin reloj y sin red. Si un cliente tenía un dato raro, se caía el
  cálculo **de todos**; y si se acababa el tiempo, los que quedaban afuera eran siempre los mismos
  — los más nuevos. Ahora va cliente por cliente: si uno falla, sigue con el siguiente y anota cuál
  falló; y si se queda sin tiempo, se acuerda por cuál seguía y arranca por ahí la próxima vez.
  Además se apagó un segundo planificador que estaba corriendo el mismo trabajo pesado en paralelo,
  y se conectó una limpieza de caché que estaba escrita hace meses y que nadie llamaba.
- **Archivos tocados:**
  - `src/lib/pixel/rollup-backfill.ts` — `backfillDay` con `deadlineAt`, `startOrgId`, try/catch por
    org y `BackfillDayOutcome`; `runRollupBackfill` acepta `orgCursor` y devuelve `nextOrgCursor` +
    `orgFailures`; comentarios de cabecera actualizados (decían "backfillDay no tiene tope", que ya
    no es cierto).
  - `src/app/api/cron/refresh-pixel-rollups/route.ts` — propaga el `orgCursor` entre llamadas,
    distingue "día parcial" de "no avanza" para no cortar el loop, y loguea/expone `orgFailures`.
  - `src/app/api/cron/warm-cache/route.ts` — llama a `purgeExpiredSharedCache()` y lo reporta.
  - `vercel.json` — se borró la entrada duplicada de `refresh-pixel-rollups` (27 crons ahora).
  - `.github/workflows/keep-pixel-rollups-fresh.yml` — el bucle de 6 hits baja a 2.
  - `src/__tests__/rollup-backfill-orgs.test.ts` — **nuevo**, 8 tests.
- **Commit:** _sin commitear — el árbol queda listo para revisar._
- **Validación ejecutada:** `npx tsc --noEmit` → **0 errores**. `npx vitest run` → **404 tests
  pasan** (eran 396; +8 nuevos), 7 skipped, 51 archivos. `npx next build` → **OK**.
  `node -e` sobre `vercel.json` → JSON válido, 27 crons, **0** entradas de `refresh-pixel-rollups`.
- **Qué NO quedó cubierto:**
  - **E-05 está a medias.** Se arregló el loop de `backfillDay`, que es el de mayor radio. Los otros
    tres crons con el mismo patrón (`digest`, `anomalies`, `ads-utm-audit`, con el `try` fuera del
    bucle de orgs) **siguen igual**.
  - El cursor de org **no se persiste entre invocaciones**, sólo entre las llamadas de una misma
    invocación del cron. Si la invocación entera se queda sin tiempo a mitad de un día, la siguiente
    reempieza ese día desde la primera org. Cerrarlo del todo necesita guardar el cursor en la base
    (candidato natural: `sync_watermarks`). El caso frecuente ya está cubierto.
  - Nada de esto se probó contra producción: no hay acceso a Vercel ni a Neon desde acá.
- **Efectos secundarios / lo que hay que vigilar:**
  - **Los rollups quedan con un solo planificador propio (GitHub Actions).** No queda sin red: el
    self-heal de `warm-cache` —que sí corre desde Vercel, cada 5 min— dispara `refresh-pixel-rollups`
    cuando ve tablas ≥2,5 h atrasadas. O sea que siguen existiendo dos caminos independientes, pero
    **si alguien desactiva el workflow de GitHub, el respaldo pasa a ser el self-heal y no un cron
    directo.** Vigilar la frescura de las 7 tablas los primeros días.
  - Bajar de 6 hits a 2 **puede** hacer que la rotación de tablas tarde más en ponerse al día
    después de un hueco. Si aparecen alertas de frescura, subir a 3 y medir — no volver a 6.
  - `orgFailures` es información nueva que antes no existía: si aparece con datos, **hay clientes
    sin rollups de ese día aunque la corrida diga `ok`**. No es una regresión, es algo que antes se
    perdía porque la excepción abortaba todo.
- **Techo de clientes:** la unidad de trabajo pasó de (día × tabla × TODAS las orgs), que era
  indivisible, a (día × tabla × UNA org), que es reanudable. El techo ya no lo pone la cantidad de
  clientes que entran en una invocación. **Corrección al diagnóstico: ver la entrada de abajo.**

---

### [2026-09-05] Corrección al diagnóstico: el "8-10 clientes" estaba mal calculado
- **Estado final:** ✅ corregido acá; el reporte original queda como está, con esta nota al lado
- **Qué pasó:** al leer el código para implementar E-01 apareció que
  `docs/expansion-2026-09/expansion-escalabilidad.md` calculó el techo contra un presupuesto de 250 s
  tratándolo como pared dura. La realidad del código es más matizada:
  - `INVOCATION_BUDGET_MS = 250_000` **sí existe**, pero es el auto-límite que el cron se impone.
  - `maxDuration` de la ruta es **800 s**, no 300. La pared real de Vercel está mucho más lejos.
  - Y ya existía `canStartAnotherDay` con una reserva auto-calibrada que evitaba arrancar un día
    que no iba a entrar — o sea que el 504 mudo que el reporte describe ya estaba mitigado.
- **El número correcto:** pasar los ~250 s no producía un 504, producía que **cada invocación
  avanzara menos días**. La pared dura (una unidad de trabajo que no entra ni en 800 s) llegaba
  alrededor de **50-77 organizaciones** con un solo cliente tamaño Arredo, no a los 8-10.
- **Lo que NO cambia:** el defecto estructural era real y está confirmado — la unidad de trabajo era
  indivisible y el propio comentario del archivo lo decía (*"`backfillDay` no tiene tope"*). Y el
  hallazgo de **E-02 —que el cliente más nuevo es el que se queda sin procesar— es literal**:
  verifiqué el `ORDER BY 1` sobre `organizationId` y que los cuid son cronológicos.
- **Por qué importa decirlo:** el "8-10 clientes" iba a ser el titular de la conversación con Tomy.
  El mensaje honesto es otro: *el sistema no estaba a punto de romperse con el quinto cliente, pero
  tenía un defecto que lo iba a clavar en silencio en algún punto, y el cliente más nuevo era
  siempre el perjudicado.* Las cuatro tareas se justifican igual; la urgencia era menor.

---

### [2026-09-05] Creación del plan de expansión
- **Estado final:** ✅ hecho
- **Qué se cambió:** nada del código. Se corrió un estudio de 6 frentes en paralelo sobre el commit
  `9ad4616d` para responder qué tan preparada está la app para meter clientes nuevos. Se armó este
  plan con 34 tareas y se guardaron los 6 reportes completos en `docs/expansion-2026-09/`.
- **Archivos tocados:** `PLAN_EXPANSION.md` (nuevo), `docs/expansion-2026-09/` (nuevo, 6 archivos).
  Ningún archivo de `src/`.
- **Commit:** _sin commitear — se mantiene local, como el plan de remediación._
- **Validación ejecutada:** no aplica, no se tocó código. La línea base sigue siendo la del
  2026-09-02: `tsc` 0 errores, `vitest` 396 tests en verde.
- **Qué NO quedó cubierto:** todo. Las 34 tareas están en ⬜ pendiente. Y tres cosas del estudio
  quedaron marcadas SIN CONFIRMAR: el comportamiento real del checkout de Shopify (requiere un
  spike), el costo de GitHub Actions (nunca se midió), y el límite real de crons del plan de Vercel.
- **Efectos secundarios / lo que hay que vigilar:** **el estudio encontró tres cosas ya rotas con
  los 4 clientes actuales, no en el futuro**: `sync/chain` procesa una sola organización por corrida
  y las demás nunca sincronizan; `warm-cache` alcanza para 1,4 organizaciones; y
  `attribution-reconcile` para una. No son proyecciones: están pasando ahora.

---

# 12. Índice de la evidencia

| Reporte | Pregunta que contesta |
|---|---|
| `docs/expansion-2026-09/expansion-escalabilidad.md` | Cuántos clientes aguanta, qué se rompe a los 10/25/50/100, y cuánto cuesta cada tramo |
| `docs/expansion-2026-09/expansion-aislamiento.md` | Qué le pasa a los clientes existentes cuando entra uno nuevo y grande |
| `docs/expansion-2026-09/expansion-onboarding.md` | Cuántas horas cuesta un alta, qué falla en silencio, y la brecha hasta self-serve |
| `docs/expansion-2026-09/expansion-operacion.md` | Cómo se enteran de que algo se rompió, cuánto cuesta operar, y el bus factor |
| `docs/expansion-2026-09/expansion-producto.md` | Si el producto sirve a una tienda chica y a una más grande que Arredo |
| `docs/expansion-2026-09/expansion-plataformas.md` | Si esto es un producto de ecommerce o un producto de VTEX |

Todos son de solo lectura: no se modificó ni un archivo de la aplicación durante el estudio.

---

_Última actualización: 2026-09-05 — E-01 a E-06 implementadas, testeadas y commiteadas en `fix/expansion-gate-e0` (7 commits, sin mergear). Ver Bitácora._

---

# 13. Verificado en preview (2026-09-06)

Primera tanda de cambios de este plan probada contra un deployment real, no sólo
con tests locales. Resultados y lo que se aprendió del entorno.

## Lo que quedó verificado

| Qué | Resultado |
|---|---|
| Build de Vercel con el `vercel.json` modificado | ✅ Ready, 1m 4s |
| `refresh-pixel-rollups` (E-01/E-02/E-05) | ✅ HTTP 200, `orgFailures: []`, 18,7 s, cursor avanzado |
| `sync/chain` (E-03) | ✅ **`orgsProcessed: 4` de 4**, `stoppedForBudget: false`, ~190 s |
| Puerta trasera `?key=usage-2026` (R-C01) | ✅ 401 — cerrada |
| `/api/admin/usage` con la clave real | ✅ 200 — **no rompe el workflow del equipo** |
| `/api/debug/meta` (R-C03) | ✅ 404 — borrado |
| **R-V01** — ¿la clave configurada es el literal de `vercel.json`? | ✅ **Sí.** El secreto está efectivamente publicado en el repo |
| **R-V02 parcial** — `PIXEL_USE_GOLD_CHANNEL` | 🔴 **`true` en Production** (ver abajo) |

## Lo que se aprendió del entorno de preview

1. **Cada branch tiene su propia base.** La integración de Neon crea un
   `DATABASE_URL` con alcance `Preview / <branch>` al pushear. Eso es bueno y hace
   viable probar caminos de escritura.
2. **Pero eso NO alcanzaba**: siete rutas se auto-invocaban usando `NEXTAUTH_URL`
   (valor de producción, alcance *All Environments*) o el literal
   `https://app.nitrosales.ai`. Un preview le pegaba a producción y escribía ahí.
   **Pasó de verdad**: la primera corrida de `sync/chain` desde el preview
   desactivó 12 productos y repuntó 730 order items **en producción**. Es la misma
   operación que el cron corre cada 2 h, así que no hubo daño — pero podría haber
   sido un backfill. Arreglado con `src/lib/self-fetch.ts` y verificado en vivo.
3. **`VERCEL_AUTOMATION_BYPASS_SECRET` existe en runtime** aunque no figure en la
   lista de variables del proyecto: Vercel la inyecta como variable de sistema
   cuando "Protection Bypass for Automation" está activo. Buscarla en la UI de
   Environment Variables da un falso negativo.

## Hallazgo NUEVO, no estaba en el estudio

**`sync/chain`: los pasos `inventory` y `vtexDetails` se agotan por tiempo para
casi todas las organizaciones, siempre.** Se ve en las tres corridas, contra
producción y contra preview:

```
inv: ERR timeout (25s) | det: ERR timeout (13s) | rec: OK
```

Los presupuestos por paso (25 s y 13 s) no alcanzan para el trabajo real. E-03
arregló que se procesen las 4 organizaciones en vez de 1, pero **esos dos pasos
siguen sin completar para nadie** — o sea que inventario, precios y detalles de
órdenes de VTEX no se están sincronizando por esta vía. Explica río abajo por qué
el `costPrice` que usa el módulo de P&L no se puebla.

No es una regresión de esta branch: es preexistente y recién ahora es visible.
**Candidato a tarea nueva del plan** (E-32): revisar esos dos presupuestos y por
qué cada paso tarda más de lo que se le asignó.

## Pendiente de decisión

`PIXEL_USE_GOLD_CHANNEL = true` en Production. Si `PIXEL_USE_GOLD` y
`PIXEL_USE_CHANNELS` también lo están —no se pueden leer, están marcadas como
sensibles— entonces **R-C25 es un problema activo, no latente**: el revenue de la
capa Gold sólo se corrige hacia arriba y editar una regla en `/pixel/canales`
duplica el de los últimos 4 días. Verificar esos dos valores es la próxima acción
de mayor valor por minuto invertido.
