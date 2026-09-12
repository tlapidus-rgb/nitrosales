# PLAN_EXPANSION.md — Preparar NitroSales para meter clientes nuevos

> **Creado:** 2026-09-05 · **Commit analizado:** `9ad4616d` (= `origin/main` = producción)
> **Objetivo del negocio:** Tomy quiere meter clientes nuevos y hacer crecer la app. Tamaño y
> plataforma **sin definir**: pueden ser grandes como Arredo o chicos, VTEX o no.
> **Origen:** estudio de 6 frentes en paralelo. Evidencia completa en `docs/expansion-2026-09/`.
> **Plan hermano:** `PLAN_REMEDIACION.md` (los 197 hallazgos de la auditoría del 2026-09-02).
> Este documento **manda sobre aquel** mientras el objetivo sea expandir — ver § 2.
>
> **Estado global (revisado el 2026-09-12):** **20 de 33 hechas, y E-33 con 4 de sus 6 items.** Los tres que se hicieron resultaron NO ser lo que decia la ficha: en los tres la cadena ya estaba construida y lo que faltaba era que alguien mirara el resultado.
>
> **Estado previo (2026-09-11):** **19 de 33 hechas.** E-24 y E-25 cerradas el 11-09, que eran las que protegian lo que E-19 construyo.
>
> **Estado previo (2026-09-08):** 🟨 **E0 cerrada salvo E-07, y E-07 es la que decide
> si el gate está cerrado** (ver el recuadro rojo en E-07 y § 9 punto 6) · E1 arrancada ·
> **E2 cerrada** · **E3 arrancada** — **17 de 31 hechas** (E-01…E-06, E-08, E-11…E-13, E-15…E-19)
> **+ E-07 a medias**. E-11 y E-13 figuraban como parciales o pendientes y ya estaban
> cerradas; corregido.
>
> **⚠️ LO QUE APRENDIMOS, Y CAMBIA CÓMO SE EJECUTA LO QUE FALTA — § 14.** Tres rondas de revisión
> sobre la branch encontraron **once defectos, casi todos en el código escrito para cerrar tareas de
> este plan**. E-08 se dio por cerrada tres veces sin estarlo. El patrón es uno solo: **una variable
> que servía para dos propósitos y se cambió pensando en uno solo.** Y lo que destapó los peores no
> fue revisar más, sino cambiar la pregunta de "¿hay un bug acá?" a **"¿qué rompió este arreglo?"**.
>
> **⚠️ REGLA DE MERGE (Axel, 2026-09-06): el plan ENTERO vive en `fix/expansion-gate-e0` y NO se
> mergea nada a `main` hasta terminarlo, probarlo y revisarlo completo.** Se acabaron las branches
> sueltas: `feat/backfill-alta-controlada` ya se consolidó acá y cualquier tarea nueva sale de esta
> branch y vuelve a esta branch. Única excepción ya ejecutada: **R-C25**, que se mergeó a `main` el
> 2026-09-06 con autorización explícita porque producción estaba mostrando revenue inflado.
>
> **Corrección de conteo (2026-09-06):** este encabezado decía "34 tareas". Son **31** (E-01 a
> E-31). Era un error del texto, no trabajo faltante. **Desde el 2026-09-08 son 33**: se agregaron
> E-32 y E-33 en una FASE E6 nueva.
>
> **⚠️ EL TECHO QUE ATA YA NO ES EL TÉCNICO (revisión de premisa, 2026-09-08).** E-01 movió el techo
> técnico de ~8 a 50-77 organizaciones. El operativo sigue en **2-3 altas por mes**, y a ese ritmo
> las 50 orgs no llegan hasta 2028. O sea que **E-10 son 1-2 semanas para levantar un techo que no
> aprieta**, mientras el que sí aprieta —las horas de Axel, que el plan identifica desde el día 1 y
> dice que "no baja comprando servidores"— sigue donde estaba. La FASE E2 existía para bajarlo de
> ~12 h a 3-4 h, está marcada como cerrada, y **nadie midió a cuánto lo bajó.** De ahí salen E-32
> (medir el próximo alta) y E-33 (convertir en producto los 6 pasos que hoy son fuera del producto,
> empezando por el que cuesta un botón). Ver FASE E6 y § 10.
> **Línea base de validación (2026-09-11):** `tsc` exit 0 · `vitest` exit 0, **915 pasan**, 7 skipped · `npm run build` exit 0 (incluye los guards de contrato y `depcruise`). **Cualquier cambio tiene que mantener esto en verde.**
>
> **Estado de la branch:** 63 commits por delante de `origin/main`, pusheada, sin mergear. El
> resumen para leer antes de mergear —incluidas las **4 acciones manuales**— está en
> `docs/ESTADO-BRANCH-INTEGRACION.md`.

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
  los 29 crons y el webhook de órdenes de los 4 clientes, en silencio.

---

## 5. El diagnóstico en números

### Techo actual

| Qué | Número | Fuente |
|---|---|---|
| Clientes que aguantaba el pipeline de rollups | ~~8-10~~ → **50-77** (ver corrección) · **resuelto por E-01** | `expansion-escalabilidad.md` § 1.1 + verificación del 2026-09-05 |
| Crons que iteran todas las orgs con presupuesto fijo | **14** | ídem § 2 |
| …de esos, que **no pueden continuar donde quedaron** | ~~8~~ → **0 de los 8 originales** (E-11, cerrada) · **pero aparecieron 3 más** | ídem · los 3 nuevos (`digest`, `anomalies`, `ads-utm-audit`) los encontró el revisor del 2026-09-08 y ya están arreglados: no estaban en la lista del estudio |
| Cosas ya rotas **hoy, con 4 clientes** | ~~3~~ → **0** · resueltas (E-03, E-12, E-11) | `sync/chain` (1 org/corrida), `warm-cache` (1,4 orgs), `attribution-reconcile` (1 org) |
| Cargas de dashboard concurrentes soportadas | **~8-15** | ídem § 5.3 — ya está por debajo de 4 clientes con 3 usuarios |
| ⚠️ **La fila de arriba NO TIENE TAREA ASIGNADA** en ninguna fase, E0 a E5 | — | **Detectado el 2026-09-08.** Es el único número del diagnóstico que dice "esto ya está roto hoy" y no tiene dueño. El techo lo pone el compute de Neon; Prisma no tiene `connection_limit` seteado **a propósito** (ponerlo ya causó un incidente, ver `CLAUDE_STATE.md`). E-04 y E-12 bajaron carga de fondo que el estudio descontaba, así que probablemente mejoró — **pero nadie lo remidió.** Si el objetivo es meter clientes, ésta es la fila que dice que no se puede |
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
| Horas por onboarding | **8-18** (mediana ~12), de las cuales **4-12 requieren a Axel** · ⚠️ **NO SE REMIDIÓ** |
| Techo de altas por mes con el equipo actual | **2-3** · ⚠️ **NO SE REMIDIÓ.** El encabezado dice "E2 cerrada" y el propósito declarado de E2 era bajar las horas de ~12 a 3-4. Ninguna ficha de E2 dice a cuánto las bajó, que es lo que la REGLA #0 exige. **E2 está cerrada en código; el techo operativo no se volvió a medir**, y E-18 es un runbook: documenta pasos manuales, no los elimina |
| Pasos del onboarding | **19** — 7 automáticos, 8 manuales en UI, **6 fuera del producto** |
| Pasos que pueden fallar en silencio | ~~13 de 14~~ → **menos, sin recontar.** El alta tiene ahora semáforo (E-15), runbook (E-18) y tres alertas nuevas; pero **el número no se volvió a medir** y no conviene darlo por bajado sin hacerlo |
| Tiempo real de detección en incidentes históricos | **5 días · 5 semanas · 22 horas · "meses"** |
| Incidentes donde avisó el cliente o alguien de casualidad | **6 de 8** |
| Destinatarios humanos de una alerta de sistema | ~~uno~~ → **configurables** por `ALERTAS_EMAILS` (E-19.3) · **falta setear la variable** |
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
- **⚠️ CORRECCIÓN (2026-09-08): la entrada de `vercel.json` VOLVIÓ, y está bien que haya vuelto.**
  Se sacó por la razón correcta —dos planificadores eligiendo "la tabla más atrasada" elegían la
  MISMA y corrían el mismo escaneo HLL en paralelo— pero dejarla en cero convertía a GitHub Actions
  en el único disparador, y **GitHub deshabilita los workflows programados tras 60 días sin
  actividad en el repo**, que es justo el modo de falla que ese workflow vino a cubrir. Hoy son
  `11,41 * * * *` (2 hits/hora, offset de los de GitHub para no colisionar) contra los 8 de GitHub:
  el respaldo solo da un ciclo de 4 h contra un umbral de 8, en vez de 8 contra 8. **Sí hay dos
  planificadores otra vez; la diferencia es la proporción** (8+2 en vez de 24+4). Pinneado en
  `src/__tests__/rollups-cadencia.test.ts`, que ata los tres números que viven en tres archivos
  distintos. Ver N-01: **sigue sin haber nada que avise si el workflow de GitHub se apaga.**
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

> ## 🔴 ESTA ES LA TAREA QUE DECIDE SI EL GATE ESTÁ ABIERTO O CERRADO
>
> **Revisado el 2026-09-08.** Todo lo demás de la FASE E0 está hecho y verificado. Ésta no, y no
> alcanza con contarla como "parcial": **mientras siga congelada, el gate E0 no está cerrado, por
> más que las otras siete tengan tilde.**
>
> El motivo es uno solo y está verificado contra producción: **`NEXTAUTH_SECRET` y `ADMIN_API_KEY`
> son el mismo literal, y ese literal está escrito en `vercel.json`, que está versionado en el
> repo.** Se comprobó el 2026-09-07 con una llamada de sólo lectura (`dryRun=1`): con una clave
> inventada devuelve 401, con el literal publicado devuelve 200.
>
> La consecuencia no es "hay un secreto expuesto". Es que **cualquiera que lea el repositorio puede
> firmarse una sesión de staff**, y con eso **todos los controles que se construyeron en esta branch
> son evitables**: el gate por sección del middleware, el gate staff-only de `/control`, el
> read-only durante impersonate, los barridos de rutas admin. Ninguno es una frontera de seguridad
> hasta que se rote — son controles para el usuario logueado, que es el caso real y por eso valen,
> pero no resisten a alguien que quiera pasarlos.
>
> **Por qué está congelado, y está bien que lo esté:** rotar tiene un orden estricto
> (R-C07 → R-C08 → R-C09) y hacerlo antes de que el webhook de órdenes de VTEX tenga su propio
> secreto **corta la ingesta de los cuatro clientes, en silencio**. El mapa de dependencias ya está
> hecho: 53 rutas, 29 crons, el webhook de VTEX y todas las sesiones activas.
>
> **La decisión que hay que tomar** está en § 9, punto 6. No es "¿rotamos?" sino "¿se firma el
> próximo cliente antes de rotar?". Las dos respuestas son defendibles —hoy los cuatro clientes son
> conocidos y el repo es privado— pero tiene que ser una decisión tomada, no una que se toma sola
> por seguir avanzando con lo que sí se puede hacer.

- **Estado:** 🟡 parcial (2026-09-06) — R-C01/R-C03/R-C04 hechos; **R-C05 y R-C06 hechos en su
  parte de código** (`1e8b65c4`, `62ed2b5a`, más el hallazgo nuevo `83d13d1a`). Lo que falta ya no
  es acceso a Vercel: **R-C02** espera una decisión de producto (borrar `/api/backfill/vtex` o
  parametrizarlo), el paso 3 de **R-C05** va después de R-C09, el paso 3 de **R-C06** invalida las
  contraseñas de creadores reales y hay que avisarles, y **R-C07 → R-C08 → R-C09** son la rotación
  de secretos: riesgo alto, orden estricto, y necesitan el OK explícito de Tomy más los 7 pasos de
  `CLAUDE.md` § "Cambios en config de sistemas externos en prod". **Rotar `NEXTAUTH_SECRET` antes
  de que el webhook de VTEX tenga su propio secreto mata la ingesta de órdenes de los 4 clientes,
  en silencio.**
- **Qué:** ejecutar la **tanda 1.1 y 1.2 completas de `PLAN_REMEDIACION.md`** — los tres backdoors,
  la inyección SQL de `backfill/vtex`, los endpoints públicos (`/api/debug/meta` devuelve datos de
  todos los tenants sin autenticación), el fail-open de `ml-sync`, y la separación y rotación de
  secretos siguiendo el orden exacto de R-C07 → R-C08 → R-C09.
- **Por qué está en el gate y no en "cuando haya tiempo":** con 4 clientes que Tomy conoce, una
  brecha es un problema. Con 20 contratos firmados, es otra conversación — y `/api/debug/meta`
  pasa de ser una filtración menor a ser una brecha reportable.

### E-08 · Convertir el backfill de alta en un evento controlado
- **Estado:** ✅ hecho — pero **estuvo marcado como cerrado tres veces sin estarlo.** Ver el recuadro.
  Commits `6e502614`, `0389d7fb`, `93362908`, `40832ec7`, `62efba36`. Runbook en
  `docs/E-08-BACKFILL-ADMISION.md`.

> **⚠️ LO QUE ESTA FICHA ENSEÑA (revisión del 2026-09-08).**
>
> E-08 se dio por cerrada el 2026-09-06. Después, en tres rondas sucesivas de revisión, aparecieron
> **cuatro defectos que hacían que no lo estuviera** — y los cuatro estaban en el código que se
> había escrito *para* cerrarla:
>
> 1. **El reaper de jobs zombie no podía dispararse nunca.** El claim escribía
>    `lastChunkAt = NOW()`, el cron corre cada minuto y el cooldown es de 2: un job roto se
>    re-reclamaba cada dos minutos y se refrescaba el latido solo, sin llegar jamás a los 30 minutos
>    que el reaper exige. El commit que lo daba por cerrado no cerraba nada.
> 2. **Un backfill fallado se daba por alta completa.** `areAllJobsComplete` contaba `FAILED` como
>    terminado, así que una caída de VTEX de media hora terminaba con el cliente activado y la data
>    a medias.
> 3. **El arreglo de (1) rompió el límite de concurrencia.** Sacar `lastChunkAt` del claim dejó a
>    `contarJobsActivos` sin su fuente: un job recién tomado figuraba en cero y el tick siguiente
>    admitía otro. **Dos backfills en paralelo contra Neon** — exactamente lo que E-08 vino a
>    impedir.
> 4. **El check de jobs atascados no miraba los `FAILED`**, que desde (2) son justo los que retienen
>    un alta.
>
> Los cuatro tienen la misma forma: **una variable que servía para dos propósitos y se cambió
> pensando en uno solo.** `lastChunkAt` era el latido *y* el lock *y* el contador de concurrencia.
> Está desarrollado en § 14.
>
> **Lo que hay que sacar de acá para el resto del plan:** que una tarea de este plan tenga tilde
> significa "se escribió el código", no "el modo de falla está cerrado". Los ocho de la FASE E0
> pasaron por una revisión que buscaba bugs; sólo E-08 pasó además por una que buscaba **qué rompió
> el arreglo**. Ver § 14.
- **Lo que se encontró de más:** además de la falta de límites, **el claim del job no era atómico**.
  `pickNextJob()` (SELECT) y `markJobRunning()` (UPDATE) eran dos queries; entre una y otra otra
  invocación salía con el **mismo job** y el chunk se procesaba dos veces en paralelo. El "lock" por
  frescura de `lastChunkAt` no servía para un job en `QUEUED` — todavía no tenía ninguno. Y hay dos
  disparadores que pueden coincidir en el mismo segundo: el cron de cada minuto y el trigger de
  `approve-backfill`. Reproducido contra Postgres antes de arreglarlo.
- **Lo hecho:** claim atómico (`UPDATE … FOR UPDATE SKIP LOCKED`) + control de admisión en
  `src/lib/backfill/admision.ts`: ventana horaria (`BACKFILL_VENTANA`, opt-in), tope de
  concurrencia (`BACKFILL_MAX_CONCURRENTES`, default **1**) y freno por latencia
  (`BACKFILL_LATENCIA_MAX_MS`, default **2000**), re-evaluado entre chunks.
- **⚠️ ACCIÓN PENDIENTE DE TOMY/AXEL:** para que la ventana de madrugada tenga efecto hay que
  poner `BACKFILL_VENTANA=1-7` en Vercel. Sin esa variable el backfill corre a cualquier hora
  (los otros dos frenos sí están activos solos).
- **Lo que se sumó después (2026-09-07/08):** un reaper que saca de la cola los jobs sin progreso a
  los 30 min; la separación explícita de los dos relojes (`updatedAt` = "está tomado" para el lock y
  la concurrencia, `lastChunkAt` = "avanza" para el reaper); y **la alerta que faltaba** —
  `checkJobsDeBackfillAtascados` ahora avisa a las 3 h, con el `lastError` al lado, e incluye los
  `FAILED` que estén reteniendo un alta en curso.
- **Lo que NO cubre:** el bootstrap de MercadoLibre lo dispara `approve-backfill` en paralelo y no
  pasa por el control de admisión; y la cola sigue FIFO global (eso es E-10).
- **El precio que se aceptó, explícito:** un job que falla en loop mantiene `updatedAt` fresco y
  sigue ocupando el cupo de concurrencia hasta que el reaper lo mate. O sea que **puede tapar la cola
  hasta 30 minutos**. Se eligió a propósito: entre bloquear media hora y correr dos backfills en
  paralelo contra Neon, se bloquea. El segundo no tiene tope y le pega a todos los clientes a la vez.
- **Y el otro precio:** desde que un `FAILED` no cuenta como alta completa, el cliente puede quedar
  viendo "preparando tu data" **hasta 12 h** (que es cuando `checkStuckOnboardings` lo levanta), o
  3 h si el job ya estaba fallado. Es peor experiencia y mejor resultado que activarlo con la data a
  medias — pero es un caso que conviene mirar cuando se rediseñe el overlay del alta.
- **Estado original:** ⬜ pendiente · **Riesgo:** 🟡 medio · **Esfuerzo:** 4-6 h
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
- **Estado:** ✅ **CERRADA (2026-09-07)** — `dc8af35a`, `e4b2a80e`, `9215476c`, más el arreglo
  del cursor y el de `?full=1` (abajo). El encabezado decía "parcial" cuando la Bitácora ya la daba
  por cerrada; corregido el 2026-09-08.

- **⚠️ DOS CORRECCIONES POSTERIORES, las dos sobre código de esta misma tarea:**
    · **El cursor guardaba una POSICIÓN y tenía que guardar un ID.** Un índice sólo sirve si la
      lista es la misma entre corridas, y en tres de los cuatro crons NO lo es: uno lista una
      ventana deslizante de orgs con atribuciones recientes, y dos listan conexiones filtradas por
      `status = ACTIVE`. Cuando una organización sale del conjunto, los índices posteriores se
      corren uno y **se saltea un cliente que nunca se procesó** — el mismo bug que el cursor venía
      a arreglar, pero intermitente y más difícil de ver. Lo detecté como "fragilidad de orden" y lo
      "arreglé" con un `ORDER BY`, que no era el problema: el problema era el CONJUNTO, no el orden.
    · **El cursor se aplicaba y se pisaba también en `?full=1`.** Un `?full=1` —el "rehacé toda la
      historia", que se corre justamente cuando algo ya salió mal— arrancaba desde donde había
      quedado el cron automático y se salteaba en silencio las orgs anteriores: devolvía `ok` sin
      haber rehecho lo que se le pidió. La regla vive ahora en `arranqueDeLaVuelta`, compartida por
      los dos crons que tienen modo manual.
- **Lo hecho:** `src/lib/cron/cursor-store.ts`, un key-value donde cada cron deja por dónde iba, más
  la migración `POST /api/admin/migrate-cron-cursors`. Cableado en
  **`refresh-gold-attribution-channel`** (que devolvía `resume: "?orgCursor=N"` para nadie) y
  **`refresh-silver-orders`** (al que además le faltaba el `ORDER BY`: un cursor por índice no
  significa nada si el orden puede cambiar).
- **⚠️ ACCIÓN PENDIENTE AL MERGEAR:** correr `POST /api/admin/migrate-cron-cursors` para crear la
  tabla. Hasta que se corra, el store degrada solo y el comportamiento es **idéntico al actual** —
  por eso el código se puede mergear antes, como manda el orden de migraciones de `CLAUDE.md`.
- **CORRECCIÓN AL ESTUDIO:** de los 8 que la tabla del § 2 lista como no-resumibles, **dos no hay
  que tocar**: `refresh-product-dimensions` y `refresh-pixel-name-dict` ya saltean las
  organizaciones refrescadas hace poco, así que arrancar de cero **ya es correcto y
  autocorrectivo**. Meterles un cursor de índice los **empeora**: puede saltear orgs que sí
  necesitan trabajo. Lo empecé a hacer y lo reverti al darme cuenta.
- **Cerrada el 2026-09-07** (`9215476c`). Los cuatro que faltaban, y **cada uno necesitaba algo
  distinto**:
    · **`attribution-reconcile`** → cursor + `orderBy`. Gasta hasta 240s en UNA org con 250s de
      presupuesto, o sea que atiende una por corrida; sin cursor las orgs 2..N no se reconciliaban
      nunca.
    · **`vtex-sync-recent`** → reloj + cursor. No tenía presupuesto: tandas de 5 en paralelo × 50s,
      con 30 orgs son 300s justos, el `maxDuration`. El corte va **entre** tandas: una tanda en
      vuelo no se puede cortar.
    · **`alerts-scheduler`** → **sólo reloj, sin cursor**. La cola ya se ordena por
      `nextFireAt ASC NULLS FIRST` y una regla que dispara sale de la lista: el orden ES el cursor.
    · **`control-alerts`** → **ni cursor ni reloj: se hizo barato.** `checkInactiveClients` era un
      N+1 (2 queries secuenciales por org, con `maxDuration = 60`), y a ~30 clientes moría en el
      muro sin mandar el mail. Ahora son dos agregaciones con `GROUP BY`. Un cursor acá **sería un
      error**: no es trabajo incremental, es un reporte que se manda por mail, y medio reporte diría
      "todo bien" sobre clientes que ni miró.

### ⚠️ Hallazgo abierto en `alerts-scheduler` — necesita decisión de producto

`evaluateRule` hace `if (!result.triggered) return null` **antes** de actualizar `nextFireAt`
(`src/lib/alerts/engine.ts:118` vs `:155`). O sea que **una regla de schedule que no dispara nunca
avanza su próxima fecha**: queda `dueNow` para siempre, se re-evalúa en cada corrida (~5s cada una)
y, por el `ORDER BY nextFireAt ASC`, se queda **permanentemente a la cabeza de la cola**.

Con varios clientes, un puñado de reglas que nunca disparan alcanza para que las de atrás **no se
evalúen nunca** — que es exactamente el modo de falla que E-11 ataca, por otro camino.

**La decisión:** una regla diaria que no dispara a las 09:00, ¿se re-chequea a las 09:15 (lo que pasa
hoy) o recién al día siguiente (lo que significa "schedule")?

> ### ✅ RESUELTO (2026-09-07), y la decisión fue "ninguna de las dos"
>
> Saltar al próximo período habría cambiado el comportamiento visible: una regla diaria que no
> dispara a las 09:00 dejaría de poder disparar hasta mañana. Y dejarlo como estaba mantenía la
> inanición.
>
> La salida fue separar las dos cosas, que en realidad no eran la misma: **la regla se manda al
> fondo de la cola con un reintento corto** (`REINTENTO_SIN_DISPARO_MS`, 15 min). Se sigue
> chequeando casi igual de seguido —a las 09:15 puede disparar, como hoy— pero deja de tapar a las
> demás. La semántica de producto no cambia; lo que cambia es que evaluar una regla ahora la saca de
> la cabeza de la cola, que era la premisa que `alerts-scheduler` daba por cierta y no lo era.
>
> **Cubierto con tests el 2026-09-07** (`src/lib/alerts/engine-cola.test.ts`): dos reglas en una
> cola de verdad contra Postgres, se evalúa la primera sin disparo y se verifica que la segunda
> llegue a evaluarse. Antes la única cobertura eran tres `expect(fuente).toContain("nextFireAt")`,
> que pasan igual con un `const _ = "nextFireAt"`.
- **Qué:** de los 14 crons que iteran todas las organizaciones, **8 no tienen forma de continuar
  donde quedaron** (o no tienen cursor, o lo calculan y nadie lo llama). El modo de falla al crecer
  no es "más lento": es **"a algunos clientes no les corre nunca"**, en silencio.
- La lista completa está en `docs/expansion-2026-09/expansion-escalabilidad.md` § 2.

### E-12 · `warm-cache` por rotación
- **Estado:** ✅ **HECHO (2026-09-06)** — commit `21aad18a`. Con 4 clientes, **dos no se calentaban
  nunca**: 8 fetches por org con presupuesto para ~11 y sin `ORDER BY`, así que siempre quedaban
  afuera las mismas. Ahora manda el rango (primero "hoy" para todas) y la org rota entre corridas.
  Lógica pura y testeable en `src/lib/cache/warm-plan.ts`.
- **⚠️ NO incluye la otra mitad de R-C19 (la cache key desalineada), y es a propósito:** las **dos**
  opciones que propone esa ficha rompen algo. Sacar `model` del warm rompe `/pixel`, que tiene
  selector de modelo y siempre lo manda; agregarlo en `/pixel/analytics` revierte un fix anterior
  que existe para que el modelo configurado tenga efecto ahí. Y `cache-key.ts` documenta a propósito
  por qué el `model` va crudo. El arreglo correcto es hacer la key **canónica** (resolver el modelo
  antes de armarla), lo que cuesta un round-trip en el camino rápido. **Necesita decisión.**
- **Riesgo:** 🟢 bajo · **Esfuerzo:** 2-4 h
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
- **Estado:** ✅ **HECHO por el punto medio (2026-09-07)** — `01fe1182`, más los arreglos `40832ec7`.
  Se implementó la tercera opción que la propia ficha proponía: **no hay botón de "probar" y no se
  muestra nunca un error crudo**; se valida una vez, al enviar, y si algo no anda se corta con la
  instrucción concreta para corregirlo. Lo que hace viable el punto medio es que los `hint` de
  `credential-tests.ts` ya están escritos para un humano no técnico. La decisión de UX original
  —"el cliente no debe ver fallas"— quería evitar el error crudo, no la ayuda.
- **Lo inconcluso NO bloquea:** si un test se pasa del presupuesto o explota, se deja pasar. Un
  cliente no puede quedar trabado en el alta porque nuestra verificación estuvo lenta.

> **⚠️ ESTA TAREA ROMPIÓ EL ALTA DOS VECES ANTES DE ARREGLARLA.** Las dos las encontró la revisión
> del 2026-09-07, y las dos tenían el mismo síntoma: **un 400 en cada intento, sin ninguna forma de
> salir desde la interfaz.**
>
> · **Validaba las cuatro plataformas, y en tres de ellas las credenciales no viajan en el wizard.**
>   En Meta Ads, Google Ads y MercadoLibre el `accessToken` y el `refreshToken` los pone el callback
>   de OAuth del lado del servidor; el submit los recupera y los mergea **después** de este punto
>   (`grep -c refreshToken OnboardingOverlay.tsx` → 0). Se validaban vacías y el tester devolvía una
>   falla CONFIRMADA —"OAuth pendiente, falta autorizar Google Ads"— sobre un cliente que ya había
>   hecho OAuth. **El alta quedaba imposible de completar para 3 de las 4 plataformas.** Ahora sólo
>   se valida VTEX, que es la única que el cliente tipea.
>
> · **Un timeout se convertía en un "no".** `credential-tests.ts` tiene su propio tope de 10 s y
>   devuelve `ok:false`, así que el "no sé" se volvía "no" **antes** de que el presupuesto de 20 s
>   de acá se enterara. Una Graph API de Meta lenta bloqueaba a un cliente con las credenciales
>   perfectas — o sea, exactamente lo que el punto medio decía evitar.
>
> **Lo que esto enseña para el resto de la FASE E2:** las tareas que tocan el alta se prueban contra
> el flujo real, no contra la forma del código. Los dos bugs pasaban `tsc`, pasaban los 13 tests
> nuevos de la tarea, y rompían el alta de todos los clientes que no fueran VTEX puro.

- **Estado original:** 🔒 **ESPERABA DECISIÓN DE PRODUCTO.** La ficha lo describe como "la pieza
  más cara del self-serve ya está escrita y apagada", pero el endpoint
  (`/api/onboarding/test-credentials`) **no está apagado por olvido**: su propio comentario dice que
  se sacó del wizard *"por decisión de UX — el cliente no debe ver fallas, las valida el admin antes
  de aprobar el backfill"*. Encenderlo es **revertir una decisión de producto documentada**, no
  destapar un descuido.
- **La pregunta para Tomy:** ¿preferimos que el cliente vea "estas credenciales no andan" y lo
  resuelva solo (ahorra una ida y vuelta por alta), o que no vea fallas nunca y lo valide el admin
  (cuesta esa ida y vuelta)? Hay un punto medio: validar al enviar y bloquear el submit con un
  mensaje accionable, sin botón de "probar" ni errores crudos.
- **Riesgo:** 🟢 bajo · **Esfuerzo:** 3-5 h · **Riesgo:** 🟢 bajo · **Esfuerzo:** 3-5 h
- **Qué:** `credential-tests.ts` son **1.054 líneas que ya cubren 6 plataformas** y hoy están
  disponibles solo para el admin, por decisión explícita. Exponerlo en el wizard y **bloquear el
  submit hasta que las credenciales pasen** elimina una ida y vuelta completa por cliente.
- **La pieza más cara del self-serve ya está escrita y apagada.**

### E-14 · Verificación real del pixel, no un checkbox
- **Estado:** ✅ **HECHO (2026-09-12)** — `5e3f8490` cierra la mitad de UI que faltaba. Nuevo botón
  **Verificar ahora** que pregunta si llegaron eventos y, cuando confirma, tilda el checkbox solo:
  el tilde pasa a estar respaldado por un dato en vez de por una afirmación del cliente.
  **Lo viable:** el usuario del wizard ya pertenece a una organización, así que el snippet que copia
  es real y los eventos llegan mientras completa el alta.
  **Lo que el mensaje NO dice:** cero eventos no prueba que esté mal — una tienda recién abierta
  puede no tener una visita. Ofrece las dos explicaciones y no bloquea (lección de E-13).
  **Y el guard del repo atajó la primera versión:** `check-serve-gold-first` marcó la ruta por tocar
  `pixel_events`. Sirvió: el `COUNT` era innecesario y quedó en dos `findFirst` con `LIMIT 1`. La
  excepción al allowlist está escrita — es el único caso donde Gold **no puede** contestar, porque
  los rollups son diarios y la pregunta es de los últimos 30 minutos.
- **Estado previo:** 🟡 **PARCIAL (2026-09-07)** — `deca13a2`. Lo que el backend no reconoce ya no se
  descarta en silencio (vuelve en `platformsIgnoradas`), y la verificación real —que hayan llegado
  eventos— la hace el semáforo de E-15 consultando `pixel_events`, en vez del checkbox.
  **Falta la mitad de UI:** el wizard sigue mostrando un checkbox que no verifica nada. · **Riesgo:** 🟢 bajo · **Esfuerzo:** 4-6 h
- **Qué está mal:** el wizard tiene un checkbox "ya pegué el snippet" **que el backend descarta**
  (`NITROPIXEL` no está en `VALID_PLATFORMS`). Lo mismo con la propertyUrl de GSC.
- **Qué hacer:** verificar de verdad — que hayan llegado eventos de esa organización en los últimos
  N minutos. Ya existe `/api/nitropixel/install-status`.
- **Sin esto, un cliente puede completar el alta entero sin haber instalado el pixel.**

### E-15 · `checkOnboardingReadiness()` — el semáforo que falta
- **Estado:** ✅ **HECHO (2026-09-07)** — `deca13a2`. Criterio puro en
  `src/lib/onboarding/readiness.ts` (16 tests), recolección en
  `GET /api/admin/onboardings/[id]/readiness`. Bloquean: credenciales que fallan, ningún job, un
  job fallado y **cero órdenes** (el que separa un backfill exitoso de uno que "completó" sin traer
  nada). No bloquean pero se ven: pixel sin eventos, conexiones sin probar, backfill en curso. El
  webhook de VTEX sale siempre con la instrucción exacta al lado. "No se pudo consultar" nunca se
  traduce a verde.
- **Lo de R-C15 ya está**: `BACKFILLING` y `READY_FOR_REVIEW` entraron al check de trabados en
  `08c4696a`. · **Riesgo:** 🟢 bajo · **Esfuerzo:** 6-10 h
- **Qué:** no existe ningún objeto que diga "este cliente está listo". Los insumos sí existen
  (install-status, data-quality-score, conteo de órdenes, conexiones); falta el que los junta.
- **El NitroScore no sirve como semáforo** aunque sea tentador: mide calidad del pixel, no
  completitud del onboarding, y en el día 1 devuelve `null` por diseño.
- **Va junto con `PLAN_REMEDIACION.md` R-C15**, que agrega `BACKFILLING` al check de onboardings
  trabados. El estudio encontró que **también falta `READY_FOR_REVIEW`**.

### E-16 · Arreglar la cadena de finalización del backfill
- **Estado:** ✅ **HECHO (2026-09-07)** — `abfe65ea`. Era exactamente lo que decía la ficha: un
  olvido de `waitUntil`, no una decisión. Con él se perdían `catalog-refresh`,
  `recompute-customer-aggregates` y `backfill-orderitem-costs`, así que el cliente entraba con
  `costPrice` en null y el P&L en cero. · **Riesgo:** 🟢 bajo · **Esfuerzo:** 2-3 h
- **Qué está mal:** el disparo de `post-backfill-finalize` es un `fetch` fire-and-forget **sin
  `waitUntil`**; en Vercel la función se congela al responder y ese fetch puede no salir nunca.
  Si se pierde, **nunca corren el catalog-refresh, el recompute de agregados ni el backfill de
  `costPrice`** → el módulo de P&L del cliente queda entero en cero, sin ninguna señal.
- El mismo archivo usa `waitUntil` bien en otras dos partes: es un olvido, no una decisión.

### E-17 · Versionar lo que hoy vive solo en el disco de Axel
- **Estado:** ✅ **HECHO (2026-09-07)** — `0d17b172`.
- **El SQL por cliente:** los tres `.local.sql` pesaban exactamente 9.827 bytes cada uno — el mismo
  SQL con el cuid cambiado a mano. Ahora es `src/lib/pixel/first-source-repair.ts` parametrizado y
  `POST /api/admin/pixel/repair-first-source?org=<id>`, con 11 tests contra Postgres.
- **Lo que hacía falta arreglar no era la repetición:** cada archivo llevaba pegado un **snapshot**
  del CASE de clasificación de origen, que en el código cambia. Un backfill corrido con un archivo
  viejo clasifica distinto que el cron, y eso aparece como visitantes en `sin_clasificar` que nadie
  entiende. Ahora el CASE se importa de la misma fuente que usa el cron y un test lo verifica.
- **El handoff:** `docs/HANDOFF.md`, con el secreto redactado. Se autodescribía como *"documento
  maestro, para un chat nuevo leé esto primero"* y estaba excluido del repo.
- **De paso salieron dos cosas del harness de tests**, las dos anotadas en el commit: el helper que
  lee código fuente se comía bloques enteros cuando un `//` contenía `/*` (7 archivos afectados), y
  la suite agotaba la memoria con el paralelismo por defecto — más de veinte Postgres en WASM a la
  vez. Tope de 2 workers en `vitest.config.ts`, con el síntoma explicado ahí mismo porque no se
  parece a un problema de memoria. · **Riesgo:** 🟢 bajo · **Esfuerzo:** 4-8 h
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
- **Estado:** ✅ **HECHO (2026-09-07)** — `docs/RUNBOOK-ALTA-DE-CLIENTE.md`. Arranca con el paso
  que más se olvida (el Orders Broadcaster de VTEX, API-only, que ya rompió a TeVe Compras), el
  flujo completo, qué hacer cuando el cliente dice que ve todo en cero, cómo verificar el pixel, el
  pedido de borrado, y las tres acciones manuales del merge. Todo verificado contra el código. · **Riesgo:** 🟢 bajo · **Esfuerzo:** 3-4 h
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
- **Estado:** ✅ **HECHO (2026-09-07)** — `cb376cdc` y `5d6d5e15`. Los tres cambios.
- **1. Frescura por organización.** Era `SELECT MAX(columna) FROM tabla`, sin `WHERE` ni `GROUP BY`:
  medía la tabla entera. Con veinte clientes, si diecinueve refrescan bien y uno queda congelado, el
  `MAX` global sigue siendo de hace diez minutos y **el chequeo da verde**. La vigilancia se diluía
  en proporción al crecimiento. Ahora se afila con cada cliente, el atraso reportado es el de la org
  **peor** (con el `MAX` global era literalmente al revés), y el mail dice **qué cliente**. La
  columna de organización se **detecta** —hay dos convenciones, `organizationId` en los rollups del
  pixel y `organization_id` en Silver/Gold— porque una lista a mano se desincroniza en silencio y su
  modo de falla sería volver al chequeo global sin que nadie lo note.
- **2. Los cuatro checks ahora empujan.** `cron/alertas-clientes`, una vez por día. La lógica de
  detección no se tocó. Sólo avisa por `critical` y `warning`: un `info` es "todavía no instaló el
  pixel", que en un alta reciente es lo normal.
- **3. Varios destinatarios.** `src/lib/alertas/destinatarios.ts`, con `ALERTAS_EMAILS`. Nunca
  devuelve lista vacía: un typo en una variable no puede dejar al sistema sin avisarle a nadie.
- **⚠️ ACCIÓN PENDIENTE AL MERGEAR:** poner `ALERTAS_EMAILS` en Vercel para que las alertas lleguen
  a más de una persona. Sin eso todo sigue yendo a la misma casilla de siempre. · **Riesgo:** 🟢 bajo · **Esfuerzo:** 6-10 h

> **⚠️ EL CAMBIO (1) HABRÍA HECHO INSERVIBLE AL SISTEMA DE ALERTAS. Corregido el 2026-09-07/08.**
>
> Agrupar por organización era lo correcto, pero destapó algo que el `MAX` global tapaba, y el
> resultado neto habría sido peor que no tener el chequeo:
>
> · **Cada cliente tranquilo generaba una alerta permanente.** Todos los upserts del pipeline
>   filtran por ventana. Si un cliente no vendió en tres días, el upsert afecta cero filas y
>   `silver_updated_at` no se mueve: el cron corrió, hizo exactamente lo que tenía que hacer, y el
>   chequeo lo reportaba atrasado. **Todas las corridas, para siempre.** Con clientes chicos
>   entrando, la casilla se llena de ruido el primer día y a la semana nadie mira más los mails — que
>   es peor que no tener el chequeo, porque encima da sensación de cobertura. Ahora cada tabla
>   derivada declara su fuente y el criterio es relativo: está atrasada si su fuente tiene algo **más
>   nuevo** que ella.
>
> · **El chequeo se rompía y reportaba silencio.** Había un `catch {}` que marcaba todo como "la
>   tabla no existe, no es una alerta". Cualquier `statement_timeout` de la query agrupada nueva
>   —bastante más cara que el `MAX` de antes— salía por esa puerta. El módulo que existe para avisar
>   que algo dejó de correr se rompía y decía que todo estaba bien.
>
> · **Y podía matar al cron que lo hospeda.** Corre dentro de `warm-cache`, que ya consumió hasta
>   220 s de sus 300 antes de llegar ahí. Si se pasa, Vercel mata la función y warm-cache no
>   devuelve nada — y ahí vive `maybeSelfHealRollups`, o sea que el monitoreo habría tumbado al cron
>   que recupera los rollups atrasados. Ahora tiene presupuesto propio y lo que no llega a medir no
>   se reporta como atrasado.
>
> **La lección, que aplica a E-20 y E-21:** un cambio de observabilidad tiene dos modos de falla
> —ruido y silencio— y los dos la vuelven inútil. Ninguno se nota en una revisión de código: se
> notan pensando en qué va a hacer el sistema con veinte clientes durante un mes.
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
- **Estado:** ✅ **HECHO (2026-09-11)** — `8e1ed2ad`. El umbral ahora se ajusta al ruido de Poisson del volumen (`1/√n`, a 2 sigmas), así que **a un cliente grande no le cambia nada** y a uno chico le sube la vara hasta donde el dato deja de ser azar. No se eligió un piso fijo a propósito: elegir N es arbitrario y tiene los dos errores. El cero tiene criterio propio. 21 tests, verificado por mutación. Detalle en `src/lib/anomaly/piso-de-volumen.ts`.
- **Estado original:** ⬜ pendiente · **Riesgo:** 🟢 bajo · **Esfuerzo:** 2-3 h · **Desbloquea el segmento chico**
- **Qué está mal:** el detector es 100% porcentual **sin piso de volumen**. A 7 órdenes por día,
  pasar a 4 dispara una alerta HIGH de "facturación cayó 43%". **Un cliente chico deja de leer las
  alertas en dos semanas** — y con eso pierde el único canal proactivo del producto.

### E-25 · Dejar de mostrar margen bruto del 100%
- **Estado:** ✅ **HECHO (2026-09-11)** — `5d47cc4d`. `/finanzas/pulso` no calculaba la cobertura en absoluto; ahora sí. Y por debajo del 20 % el margen **ya no se muestra**: un cartel al lado de un "100 %" gigante sigue siendo una mentira en pantalla. El criterio vive en `src/lib/finanzas/confianza-del-margen.ts`, alineado con el umbral que ya usaba el detector de anomalías. Aparecieron dos bugs del mismo patrón: el componente hacía `?? 0` (habría mostrado 0 % "Crítico") y `narrative.ts` escondía que un margen legítimo de 0 % no alertaba. 16 tests, verificado por mutación.
- **Estado original:** ⬜ pendiente · **Riesgo:** 🟢 bajo · **Esfuerzo:** 2-3 h
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
- **Estado:** ⬜ pendiente, pero **REDEFINIDA el 2026-09-08: la ficha apuntaba a algo que ya está
  hecho y dejaba pasar lo que sí está roto.**
- **Riesgo:** 🟢 bajo · **Esfuerzo:** 1-2 h · **Necesita una decisión chica de producto** (abajo)

> **Lo que la ficha pedía YA ESTÁ:** Tiendanube, Shopify, WooCommerce y Magento están en
> `ECOMMERCE_PROVIDERS` con `active: false` (`src/components/OnboardingOverlay.tsx:489-492`), se
> renderizan con un candado y el badge **"En desarrollo"** contra el "Disponible" de VTEX
> (`:1100-1115`), y el copy ya ofrece la lista de espera que la ficha pedía: *"Las que están 'en
> desarrollo' podés marcarlas para que te prioricemos cuando las integremos"* (`:1038-1040`).

- **Lo que SÍ sigue roto, y es otra cosa:** `globalCompletion` cuenta `skip` como decidido
  (`OnboardingOverlay.tsx:620-629`). O sea que un prospecto puede **saltear las cuatro plataformas y
  ver el alta al 100 %**, y `submit` (`:631-645`) no lo impide. El backend confirma que del otro lado
  no pasa nada: *"Para providers no-vtex (tiendanube/shopify/etc), solo capturamos interes"*
  (`submit-wizard/route.ts:378`).
- **La decisión chica:** bloquear el submit **rompería la captura de leads**, que es deliberada — un
  prospecto de Shopify que deja sus datos es un lead, no un error. Así que la pregunta es más
  acotada: **¿qué le muestra el wizard a alguien que no conectó ninguna plataforma?** Hoy le dice
  "100 %", que es la promesa falsa de verdad. Un "listo, te avisamos cuando esté" con la barra en
  otro estado dice lo mismo sin mentir.
- **Cómo se encontró:** el revisor sin contexto del 2026-09-08. La ficha original describía un
  problema real que se arregló en algún momento sin actualizarla, y la descripción vieja habría hecho
  que alguien "arreglara" algo que ya estaba bien y no mirara lo que faltaba.

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

# FASE E6 — Lo que de verdad mueve el techo

> **Agregada el 2026-09-08, después de una revisión de premisa.** Las dos tareas de acá salen de
> mirar los números del propio plan y notar que **la restricción que ata dejó de ser la técnica.**
>
> | | Antes del plan | Hoy |
> |---|---|---|
> | Techo **técnico** (orgs que aguanta el pipeline) | ~~8-10~~ → 50-77 | resuelto por E-01 |
> | Techo **operativo** (altas por mes) | 2-3 | **2-3, y no se remidió** |
>
> A 2-3 altas por mes, llegar a 50 organizaciones lleva **más de un año y medio**. O sea que
> **E-10 son 1-2 semanas para levantar un techo que no aprieta hasta 2028**, mientras el que sí
> aprieta sigue donde estaba.
>
> El plan lo dice desde el día 1 y en su propia voz: *"el costo real por cliente no es
> infraestructura, son horas de Axel… y ese número no baja comprando servidores"*. La FASE E2
> existía para bajarlo de ~12 h a 3-4 h, está marcada como cerrada, y **nadie midió a cuánto lo
> bajó** — que es exactamente lo que la REGLA #0 de este plan exige.

### E-32 · Medir el próximo alta, de punta a punta
- **Estado:** ⬜ pendiente · **Riesgo:** 🟢 ninguno · **Esfuerzo:** casi cero — se hace **durante**
  un alta que igual va a pasar
- **Qué:** cronometrar el próximo onboarding paso por paso y anotar dónde se van las horas. No es
  telemetría de sistema (eso es E-20): es una planilla con los 19 pasos y cuánto tardó cada uno,
  quién lo hizo, y cuáles necesitaron a Axel.
- **Por qué va primero:** es la única forma de saber si la FASE E2 movió el techo operativo o no.
  Hoy el plan afirma que E2 está cerrada y sigue reportando "8-18 h, 2-3 altas/mes" en § 5 — las dos
  cosas no pueden ser ciertas a la vez. Y sin ese número, **E-33 se prioriza a ciegas**: no sabemos
  cuál de los seis pasos fuera del producto pesa.
- **Lo que la REGLA #0 pide y no se cumplió:** cada tarea que sube el techo tiene que decir a cuánto
  lo subió. E-13, E-15 y E-18 se cerraron sin ese número.
- **Criterio de terminado:** § 5 tiene números medidos, con fecha, y § 5 y el encabezado dejan de
  contradecirse.

### E-33 · Convertir en producto los pasos que hoy son fuera del producto
- **Estado:** ⬜ pendiente · **Riesgo:** 🟡 medio — toca el flujo de alta, que es lo que se rompió
  dos veces en E-13 · **Depende de:** E-32 para priorizar
- **Qué está mal:** de los **19 pasos** del alta, **6 se hacen fuera de NitroSales**. Son los que
  exigen a Axel y los que hacen que el bus factor sea 1. E-18 los **documentó**; documentar un paso
  manual no lo elimina.

> **⚠️ NO ES UNA TAREA DE 1-2 SEMANAS: ES UNA LISTA, Y LA PRIMERA ES UN BOTÓN.**
>
> **El Orders Broadcaster de VTEX** (`POST /api/orders/hook/config`) es **API-only, no tiene UI**, y
> es el paso que más se olvida. Sin él **no llega un solo webhook**: el cliente queda con las órdenes
> históricas del backfill y nada nuevo, que es indistinguible de un alta exitosa hasta que alguien
> mira los números. **Ya rompió a TeVe Compras entero** (0 de 8 órdenes atribuidas).
>
> Y ya está medio resuelto sin que nadie lo note: el semáforo de E-15 **detecta** que falta y dice
> el comando exacto. O sea que el sistema sabe que está mal y le pide a un humano que abra una
> terminal. **Falta el botón que corra ese POST desde el panel**, al lado del item en rojo. Es la
> mejor relación esfuerzo/daño-evitado que queda en todo el plan.

> ### ⚠️ LA FICHA SE EQUIVOCABA, Y VALE LA PENA ANOTAR EN QUÉ (2026-09-12)
>
> Decía *"falta el botón para configurarlo"*. **Configurar ya estaba resuelto**: existe
> `/api/admin/vtex-configure-broadcaster` y `activate-client` lo dispara solo al activar un cliente.
> La ficha se escribió leyendo el runbook —que describe el paso manual— y no el código.
>
> Lo que faltaba era **verificar**. El sistema disparaba el POST, **no miraba el resultado**
> (`activate-client` no bloquea si falla, sólo deja un flag en un JSON) y después el semáforo
> preguntaba. La única verificación real era un endpoint de *debug* con `orgSlug=teve` hardcodeado
> como valor por defecto.
>
> **Y apareció un caso que nadie estaba mirando.** El endpoint de debug chequeaba que la URL tuviera
> un `?org=` pero **no que fuera el correcto**. VTEX guarda un solo hook por cuenta: si lleva el
> `org` de OTRO cliente, las órdenes de éste se cuentan como del otro. Es silencioso, afecta a **dos
> clientes a la vez**, y se vuelve probable justo cuando empiezan a entrar — alcanza con copiar el
> curl del alta anterior y olvidarse de cambiar el id.
>
> **Hecho el 2026-09-12** (`fcad7ff7`): `analizarHook` distingue los cuatro problemas (sin hook,
> sin `org`, `org` ajena, dominio ajeno) y cada uno sale con su propio "qué hacer". El semáforo
> verifica con `?verificarWebhook=1` — opt-in, porque llamar a VTEX es lento y lo abre un humano
> esperando respuesta. 18 tests, verificado por mutación.
>
> **La lección para el resto de E-33:** los otros cinco pasos de la lista también salieron de leer
> el runbook. Antes de construir cada uno, **mirar si ya existe y lo que falta es verificarlo.**

- **La lista, en orden de daño:**
    1. ~~Orders Broadcaster de VTEX~~ ✅ **HECHO (2026-09-12).** No era un botón: era verificar. Ver el recuadro. Sin él no llega ninguna
       orden nueva. **Es el que más duele y el más barato.**
    2. ~~Afiliados de VTEX~~ ✅ **HECHO (2026-09-12)** — el único de los tres donde la ficha tenía
       razón: **no se puede automatizar**, se carga a mano en el admin de VTEX y no hay API para
       escribirlo. Lo que sí se podía es verificarlo, que es donde estaba el agujero — igual que en
       los otros dos. **Por qué importa tener los dos:** son complementarios, y TeVe Compras tenía
       sólo el afiliado con el Orders Broadcaster faltando, lo que dejó la cobertura de órdenes en
       41 % (bitácora de la sesión 60). El criterio se **reusa**: el modo de falla es idéntico al
       del broadcaster, así que los dos pasan por `analizarHook`. Lo único nuevo es elegir cuál
       mirar, porque una cuenta puede tener varios afiliados y los de otros proveedores no son
       problema nuestro.
    3. ~~Carga de costos (`Product.costPrice`)~~ ✅ **HECHO (2026-09-12)** — y **otra vez no era lo
       que decía la ficha**. La cadena ya estaba enchufada: `post-backfill-finalize` corre
       `catalog-refresh`, que le pide los costos a la Pricing API de VTEX, y después
       `backfill-orderitem-costs` los copia a las órdenes. Los dos pasos corren.
       `catalog-refresh` incluso devuelve un `withCost` con cuántos trajeron costo — **y no lo lee
       nadie**. El semáforo no tenía item de costos, así que cargaban o no cargaban y nada decía
       cuál de las dos. Ahora lo mira, con cuatro estados y, sobre todo, con **la causa que no se
       adivina**: la API key de VTEX necesita el rol de **Pricing**, que es aparte del de Catalog —
       sin él el costo no viaja, el resto del catálogo sí, y parece que anduvo.
       Va junto con E-25, que desde el 11-09 esconde el margen cuando no hay costos: el admin ve
       "Sin datos" y esto le dice por qué.
       **Hallazgo menor:** `/api/sync/cost-prices` es un endpoint redundante que no llama nadie ni
       está en `vercel.json`; hace lo que `catalog-refresh` ya hace adentro. No se tocó.
    4. ~~Las 4 acciones manuales post-merge~~ ✅ **HECHO (2026-09-12)** —
       `GET /api/admin/checklist-merge`. **Verifica, no ejecuta, y la razón importa:** la ficha
       pedía "un endpoint que las corra y las verifique", y correrlas no se puede — **dos de las
       cuatro son variables de entorno de Vercel**, y el código que corre adentro de Vercel no
       puede escribirlas. Las otras dos sí se podrían, y a propósito no se corren desde un botón:
       `CLAUDE.md` tiene una regla entera sobre cambios en producción que pide dry-run, backup y
       rollback preparado. Lo que sí resuelve el problema es que **no se puede olvidar lo que una
       pantalla te dice**, y sigue contestando después del merge.
       De paso salió `estadoDeLaVentana`: `parseVentana` devolvía `null` para "sin configurar" y
       para "mal escrita", que para el backfill son lo mismo y para quien revisa el sistema son
       opuestas.
    5. **Ida y vuelta por credenciales** — E-13 la redujo para VTEX. Falta medir cuánto queda.
    6. **Borrado de datos** — hoy es "verificar a mano que no queden filas en ocho tablas". Es E-28.
- **Por qué esto y no E-10:** E-10 levanta un techo que no aprieta hasta 2028. Esto baja el número
  que el propio plan identifica como la restricción real, y el primer ítem cuesta un botón.

---
# 9. Las decisiones que necesitan a Tomy

| # | Decisión | Por qué no la puede tomar el equipo técnico |
|---|---|---|
| 1 | **¿Cuánta historia de `pixel_events` se conserva?** (E-09) | Es un trade-off de producto: 90 días baja el costo y hace viable el crecimiento, pero limita los análisis históricos crudos |
| 2 | **¿Se abre a Shopify/Tiendanube, o se profundiza en VTEX?** (E-31) | Es la decisión comercial más grande del semestre, y ahora tiene números |
| 3 | **¿Qué se le vende a un cliente chico?** (E-22) | El código ya soporta un paquete acotado; falta decidir qué entra |
| 4 | **¿Cuál es el ticket mínimo?** | Un cliente grande cuesta USD 80-200/mes de infraestructura más 8-18 horas de alta. Si el ticket no lo supera holgadamente, cada cliente grande pierde plata |
| 5 | **¿Las cuentas de ads facturan en pesos o en dólares?** (viene de `PLAN_REMEDIACION.md` R-V05, sigue sin respuesta) | Si alguna es en USD, el ROAS de ese canal está mal por un factor de ~1.000 |
| **6** | 🔴 **¿Se firma el próximo cliente ANTES de rotar los secretos?** (E-07) | **Es la decisión que define si el gate está cerrado.** `NEXTAUTH_SECRET` y `ADMIN_API_KEY` son el mismo literal y está en `vercel.json`, versionado: cualquiera que lea el repo puede firmarse una sesión de staff, y con eso todos los gates de esta branch son evitables. Rotar tiene riesgo alto y orden estricto (rotar antes de que el webhook de VTEX tenga su propio secreto **corta la ingesta de los 4 clientes en silencio**). Las dos respuestas son defendibles; lo que no se puede es que la decisión se tome sola por seguir avanzando |
| **7** | **¿El overlay del alta puede mostrar "algo salió mal, lo estamos viendo"?** | Desde que un backfill fallado no cuenta como alta completa (E-08), el cliente puede quedar hasta 12 h viendo "preparando tu data". Es la alternativa correcta a activarlo con la data a medias, pero la pantalla no lo dice. Es decisión de producto porque implica admitirle al cliente que algo falló |

---

# 10. Secuencia recomendada

> **Reescrita el 2026-09-08.** La original se cumplió casi entera y en menos tiempo del estimado:
> E0 está hecha (salvo E-07), E-19 hecha, y la FASE E2 —que estaba planificada para las semanas 4 a
> 6— está hecha salvo E-14 (parcial). Lo que sigue es la secuencia **desde acá**, no la original.

| Momento | Qué | Por qué |
|---|---|---|
| **Antes de mergear** | Las 4 acciones manuales de `docs/ESTADO-BRANCH-INTEGRACION.md` | La migración de cursores va **antes** que el código que la usa (orden de `CLAUDE.md`). Sin `ALERTAS_EMAILS` y `BACKFILL_VENTANA`, dos tareas quedan escritas pero inertes |
| **La decisión, antes que cualquier código** | § 9 punto 6 — **¿se firma antes de rotar?** | Define si el gate E0 está cerrado. Todo lo demás de E0 ya está |
| **Ahora, y es barato** | E-29 (sacar Shopify/Tiendanube del wizard) | Sigue pendiente desde el día 1 y sigue siendo cierto: un cliente puede darse de alta hoy en una plataforma que no funciona. 1-2 h |
| **Antes del próximo cliente** | E-14 (la mitad que falta) + E-20 | E-14 hoy sólo devuelve lo ignorado; falta la verificación real del pixel. E-20 es la telemetría que convierte "creo que anda" en "sé que anda" |
| 🔺 **Antes del próximo cliente, SI puede ser chico** | **E-24 + E-25** (2-3 h cada una) | **Subieron el 2026-09-08: E-19 las volvió urgentes.** E-19 acaba de convertir cuatro checks en un mail diario. Al mismo tiempo, el detector de anomalías **sigue sin piso de volumen** (verificado: no existe `minOrders` ni equivalente) y el P&L sigue con `COALESCE(oi."costPrice", p."costPrice", 0)` (`metrics/pnl/route.ts:94`). O sea que **el primer cliente chico que entre recibe, desde la semana uno, alertas diarias falsas y un margen bruto del 100 %**. La § 14 dice que un cambio de observabilidad falla por ruido o por silencio; éstas dos son las que evitan que el ruido queme lo que E-19 acaba de construir |
| 🔺 **Durante el próximo alta, sin frenar nada** | **E-32 — medirla** | **Cambio del 2026-09-08.** Cuesta casi nada y contesta la pregunta que hoy nadie puede contestar: ¿E2 bajó las 12 h a 3-4, o no las movió? Sin ese número, todo lo de abajo se prioriza a ciegas |
| 🔺 **Inmediatamente después** | **E-33, empezando por el botón del Orders Broadcaster** | El paso que más se olvida, sin UI, y que ya rompió a un cliente entero. El semáforo YA lo detecta y le pide a un humano que abra una terminal: falta el botón. **Mejor relación esfuerzo/daño-evitado que queda en el plan** |
| **Cuando el techo técnico empiece a apretar de verdad** | E-10 (unidad de trabajo por org×tabla×día) | ⚠️ **Bajó de prioridad el 2026-09-08.** Es el techo real de los rollups y E-01 ya lo movió de ~8 a 50-77 orgs. **A 2-3 altas/mes eso no aprieta hasta 2028**, así que 1-2 semanas acá son 1-2 semanas que no van al techo que sí ata. Antes de hacerlo, re-derivar el disparador: el número que lo justificaba (25 clientes) viene del mismo estudio cuyo "8-10 clientes" ya se corrigió por un factor de seis |
| **Cuando haya 2 clientes grandes a la vista** | E-09 (retención) | 121 GB/año por cliente tamaño Arredo, y no hay política de retención de ninguna clase. Es lo único del plan que destruye datos: necesita la decisión del § 9 punto 1 |
| **Antes del primer contrato serio** | E-27, E-28 (ciclo de vida y cumplimiento) | No se puede firmar prometiendo borrado de datos que no existe |
| **Cuando el segmento chico se venda** | E-22 | E-24 y E-25 subieron de fila (arriba). Queda E-22: decidir qué entra en el paquete acotado, que es la § 9 punto 3 |
| **En paralelo, sin bloquear** | El resto de `PLAN_REMEDIACION.md` | Los medios y bajos, y toda la tanda de diseño |

---

# 11. Bitácora

> Formato en `PLAN_REMEDIACION.md` § 1 (REGLA #0). Lo más nuevo primero.
> **Si la Bitácora y el estado de una tarea se contradicen, gana la Bitácora.**

### [2026-09-08] 🧭 Revisión del PLAN contra lo construido — un revisor sin contexto + revisión de premisa

**Qué se hizo:** dos revisiones del plan en sí, no del código. Una con un agente sin contexto previo,
que comparó ficha por ficha contra la branch. Otra de premisa, preguntando si el plan sigue
resolviendo el problema que ata.

**Lo que encontró el revisor sin contexto** (cinco cosas, tres cambian una decisión):

1. **Tres crons seguían matando de hambre al último cliente.** `digest`, `anomalies` y
   `ads-utm-audit`: `maxDuration = 60`, un `for` sobre todas las orgs, sin reloj, sin `orderBy` y
   sin cursor. E-05 les puso el aislamiento, que era la mitad. **No estaban en la lista de 8 del
   estudio**, así que E-11 no los cubrió — y son los tres que le escriben al cliente por mail.
   Arreglados.
2. **`BACKFILL_VENTANA` documentada con un formato que el parser rechaza.** El doc decía
   `HH:MM-HH:MM`; sólo acepta horas enteras, y un valor que no parsea significa **sin restricción**.
   Alguien siguiendo esa tabla al mergear habría dejado la ventana apagada sin ninguna señal.
3. **El runbook de E-18 le mentía al operador.** Decía que el wizard no valida credenciales y que el
   `.sql` por cliente vive en el disco de Axel — las dos cosas dejaron de ser ciertas el mismo día
   que se escribió. **Es el único documento del plan que se usa sin un técnico al lado.**
4. **E-29 apuntaba a algo ya resuelto.** Shopify y Tiendanube ya están gateadas con badge "En
   desarrollo" y lista de espera. Lo que sigue roto es otra cosa: `globalCompletion` cuenta `skip`
   como decidido, así que se puede saltear las cuatro plataformas y ver el alta al 100 %.
5. **E-19 volvió urgentes a E-24 y E-25.** Convertir cuatro checks en un mail diario, con el
   detector de anomalías sin piso de volumen y el P&L con `COALESCE(..., 0)`, significa que el
   primer cliente chico recibe alertas falsas y margen bruto del 100 % desde la semana uno.

**Lo que encontró la revisión de premisa,** y es lo que más cambia:

> El plan prioriza por techo técnico, y **el techo técnico dejó de ser el que ata.** E-01 lo movió de
> ~8 a 50-77 orgs; el operativo sigue en 2-3 altas/mes, o sea que 50 orgs no llegan hasta 2028.
> **E-10 son 1-2 semanas para levantar un techo que no aprieta.** Mientras tanto la FASE E2, que
> existía para bajar las 12 h por alta a 3-4, está marcada como cerrada y **nadie midió a cuánto las
> bajó** — lo que la REGLA #0 de este plan exige explícitamente.

De ahí salen **E-32** (medir el próximo alta) y **E-33** (convertir en producto los 6 pasos que hoy
son fuera del producto). E-33 no es una tarea de 1-2 semanas: es una lista, y **la primera es un
botón** — el Orders Broadcaster de VTEX es API-only, es el paso que más se olvida, ya rompió a TeVe
Compras entero, y el semáforo de E-15 **ya lo detecta** y le pide a un humano que abra una terminal.

**Qué cambió en el plan:** FASE E6 nueva (E-32, E-33) · § 10 reordenada, con E-10 bajando de
prioridad y E-24/E-25 subiendo · E-29 reescrita · § 5 con tres números marcados como no remedidos ·
E-04 corregida (la entrada de `vercel.json` volvió a propósito) · el conteo de crons de 28 a 29 ·
N-05 verificado y corregido (era uno, no varios).

**Restos anotados:** la fila "cargas de dashboard concurrentes ~8-15" es el único número del
diagnóstico que dice "esto ya está roto hoy" y **no tiene tarea asignada en ninguna fase**; y el
secreto viaja en la URL de los 29 crons, o sea que además está en los logs de Vercel.

### [2026-09-08] 🔁 Segunda y tercera ronda, y revisión del plan contra lo construido

**Qué se hizo:** se cerraron los ocho hallazgos que la ronda anterior dejó abiertos, se corrió una
auditoría por mutación sobre los tests nuevos, y después una pasada distinta: en vez de buscar bugs,
revisar **qué rompió cada arreglo**. Esa última encontró lo peor.

**Los tres que importan, todos introducidos por arreglos de este plan:**

1. **El límite de concurrencia dejó de funcionar.** Sacar `lastChunkAt` del claim —el arreglo del
   reaper— dejó a `contarJobsActivos` sin su fuente. Un job recién tomado, que todavía no completó
   su primer chunk (y un chunk grande tarda minutos), figuraba en cero: el tick siguiente admitía
   otro. Con `maxConcurrentes = 1`, **dos backfills en paralelo contra Neon** — exactamente lo que
   E-08 vino a impedir y lo que tumbó la base la vez que motivó todo esto. Los tests no lo agarraron
   porque el helper `activos()` era una copia a mano del SQL; ahora importa el de verdad.
2. **El chequeo de frescura podía matar al cron que lo hospeda.** Corre dentro de `warm-cache`, que
   ya consumió 220 s de sus 300 antes de llegar ahí, y E-19 lo hizo más caro (15 queries agrupadas
   + 4 de fuentes). Si se pasa, Vercel mata la función y warm-cache no devuelve nada — y ahí vive
   `maybeSelfHealRollups`. El monitoreo habría tumbado al cron que recupera los rollups.
3. **El check de jobs atascados no veía los `FAILED`,** que desde el arreglo de `areAllJobsComplete`
   son justo los que retienen un alta.

**La auditoría de tests:** de los 373 casos nuevos, **248 atraparían un bug y 125 no**. Los tres
peores arreglados (uno testeaba una réplica del algoritmo escrita en el propio archivo de test; otro
pasaba en verde con el middleware apagado entero; el fix más caro de la branch no tenía un solo test
que lo ejecutara).

**Qué cambió en el plan:**

- **E-07 pasa a ser la tarea que define el gate.** Todo lo demás de E0 está hecho. Mientras
  `NEXTAUTH_SECRET` y `ADMIN_API_KEY` sean el mismo literal y ese literal esté en `vercel.json`
  versionado, **todos los controles de esta branch son evitables**. Nueva decisión en § 9 punto 6:
  no es "¿rotamos?" sino "¿se firma el próximo cliente antes de rotar?".
- **E-11 y E-13** figuraban como parciales/pendientes y ya estaban cerradas. Corregido, con las dos
  correcciones posteriores que sufrió cada una.
- **E-08, E-13 y E-19** llevan ahora un recuadro con lo que se rompió después de darlas por hechas.
- **§ 10 reescrita.** La secuencia original se cumplió casi entera y más rápido de lo estimado: la
  FASE E2, planificada para las semanas 4-6, está hecha salvo E-14.
- **§ 14 nueva:** el patrón de la variable con dos dueños, por qué "hecho" no es "cerrado", y cinco
  riesgos abiertos que el plan no contemplaba (N-01 a N-05).

**Corrección a un hallazgo previo:** la ronda anterior reportó que la cadencia de los rollups tenía
"margen cero" contra su umbral de alerta. Verificado: en operación normal son 9 hits/hora sobre 8
tablas, o sea un ciclo de ~53 min contra un umbral de 8 h. **El margen cero aplica sólo al escenario
degradado** —GitHub deshabilita los workflows programados tras 60 días sin actividad— y ahí sí
quedaba 1 hit/hora × 8 tablas = 8 h justas. Se le subió el respaldo de Vercel a 2 hits/hora.

**Validación:** `tsc` 0 · `vitest` **869 pasan**, 0 fallan · `npm run build` exit 0.
**Archivos tocados:** ver los commits `40832ec7`, `8a2313f1`, `c023121a`, `9a9dc8cb`, `b8c61028`,
`62efba36`, `2af35ff5`. Resumen para el merge en `docs/ESTADO-BRANCH-INTEGRACION.md`.

### [2026-09-07] 🔍 Ronda de verificación con cinco revisores independientes

Axel pidió verificar todo lo hecho hasta acá. Se lanzaron cinco revisores sin contexto previo
(regresiones, seguridad, flujo de punta a punta, evaluación de decisiones de diseño, calidad de
tests). **Tres terminaron; dos murieron por el límite de uso de la cuenta**, no por el código.

#### 🔴 Lo más grave, y no es de esta branch

**`NEXTAUTH_SECRET` es exactamente el literal publicado en `vercel.json`.** Verificado contra
producción con una llamada de sólo lectura: una key incorrecta da 401, ese literal da 200 en un
endpoint que valida específicamente contra `process.env.NEXTAUTH_SECRET`.

Consecuencia: con ese valor se puede **forjar un JWT** con `isStaff: true`. Todo el gate staff-only
que construyó esta branch lo saltea un token forjado. No está en el bundle del navegador
(verificado), así que hace falta acceso al repo — pero está en `vercel.json`, en `CLAUDE_STATE.md`,
en `TODOS.md`, en `BACKLOG_PENDIENTES.md` y en tres archivos más, y viaja en la URL de los 29 crons
— o sea que **también está en los logs de Vercel**, que es una superficie de exposición que este plan
no mencionaba y que se suma al argumento de rotar (señalado por el revisor del 2026-09-08).

**Esto es el techo de todo lo demás.** Mientras siga así, cada gate que se agregue es decorativo.
La rotación sigue congelada por decisión de Axel; ahora al menos el impacto está mapeado.

#### Lo que se arregló en esta ronda

| Qué | Commit | De quién era |
|---|---|---|
| Tres aserciones que no podían fallar nunca (los heredocs se comen los backslashes) | `0046d1a9` | **mío** |
| Un job roto bloqueaba el alta de TODOS los clientes | `93362908` | **mío** (regresión de E-08) |
| El cursor por índice salteaba orgs cuando la lista cambiaba | `7b7d800e` | **mío** (diseño de E-11) |
| Inyección SQL por `?orgId=` en `/api/metrics/orders` | `2fd9fe3f` | preexistente |
| `/products` y `/rentabilidad` con el gate escrito pero fuera del `matcher` | `7e7803be` | preexistente |
| `/api/admin/migrate-aura-dedup-indexes` sin ninguna autenticación | `7e7803be` | preexistente |
| Los dos estados donde el alta espera no estaban vigilados | `08c4696a` | preexistente |
| Una alerta que no dispara tapaba la cola para siempre | `08c4696a` | preexistente |

**Tres de los ocho eran míos**, y dos de ellos empeoraban lo que venían a arreglar: el límite de
concurrencia convertía un job roto en una caída total del onboarding, y el cursor por índice
reintroducía el mismo salteo de organizaciones que venía a eliminar. Vale como recordatorio de que
un freno sin observabilidad es peor que no tener freno.

#### Lo que queda abierto y por qué

- **El IDOR de `/api/metrics/*`** (`?orgId=<cualquiera>&key=`) sigue vivo. **No se puede cerrar sin
  rotar**: el cron `warm-cache` usa ese mismo camino para calentar la caché de cada organización, y
  cerrarlo la deja fría para todos. Y dado que esa clave ya abre las 155 rutas admin, el riesgo
  marginal de este bypass es ~cero *si la clave está comprometida* — que es exactamente el problema
  a resolver. Muere con la rotación, no antes.
- **`post-backfill-finalize` se dispara sin `waitUntil`** desde el runner: la lambda se congela
  antes de que corra. Consecuencia: `costPrice` no se puebla y el cliente nuevo entra con
  rentabilidad y P&L en cero, con pinta de estar bien. Nada lo reintenta.
- **`approve-backfill` marca `BACKFILLING` aunque no haya creado ningún job** (cliente sin VTEX ni
  ML, o con `historyVtexMonths = 0`). El cliente recibe el mail "ya arrancamos" y ve "0%" para
  siempre. Ahora al menos `checkStuckOnboardings` lo reporta a las 12 h.

---

### [2026-09-06] 🔀 Todo el plan pasa a UNA sola branch
- **Decisión de Axel:** "quiero que todo el plan esté en una branch antes de mergear a prod, así lo
  tenemos 100% probado y revisado antes de mandarlo". Todavía falta para los clientes nuevos, así que
  no hay apuro por mergear.
- **Qué se consolidó en `fix/expansion-gate-e0`:**
    · `origin/main` (que ya trae R-C25, lo único del plan que está en producción);
    · `feat/backfill-alta-controlada` (E-08, commits `6e502614` y `0389d7fb`).
- **Único conflicto:** `backfill-runner/route.ts`, donde las dos ramas habían agregado imports en el
  mismo lugar (`selfFetchBaseUrl` de un lado, el módulo de admisión del otro). Se quedaron los dos.
- **Validación de la branch consolidada:** `tsc` 0 · `vitest` **564 passed**, 7 skipped ·
  `next build` 0.
- **Consecuencia práctica:** ninguna de las protecciones del plan está viva en producción todavía.
  Si entra un cliente nuevo antes de mergear, entra contra el código de hoy. Eso es aceptado a
  propósito: se prioriza revisar el conjunto por encima de shipear de a pedazos.
- **Regla operativa de acá en adelante:** toda tarea nueva sale de esta branch y vuelve a esta
  branch. Nada de branches sueltas por tarea.

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
  `vercel.json` parsea, 29 crons, sólo claves `path`/`schedule`.
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

## R-V02 CONTESTADO (2026-09-06) — y es la peor de las respuestas

Medido con un endpoint temporal (ya borrado) que espeja exactamente cómo lee los
flags el serve (`metrics/pixel:264,294,324`), corrido en preview — vale para
producción porque las tres variables tienen alcance *Production and Preview*:

| Flag | Valor crudo | Derivado |
|---|---|---|
| `PIXEL_USE_GOLD` | `true` | `usePixelGold: true` |
| `PIXEL_USE_CHANNELS` | `true` | `usePixelChannels: true` |
| `PIXEL_USE_GOLD_CHANNEL` | `true` | **`useGoldChannel: TRUE`** |
| `ORDERS_USE_GOLD` | no seteada | `false` |
| `SILVER_ORDERS_ENABLED` | no seteada | **activo** (es opt-out) |
| `ATTRIBUTION_ROLLUP_ENABLED` | no seteada | **activo** (es opt-out) |

**Los tres están prendidos. `useGoldChannel` es `true` en producción.**

Y las dos mitades están vivas: el cron que materializa los Gold de atribución
corre (`ATTRIBUTION_ROLLUP_ENABLED` no está en `false`) **y** el dashboard los
lee. O sea que **R-C25 pasa de latente a ACTIVO**:

1. Una venta cancelada **sobrevive en `gold_attribution_channel` para siempre**.
   El revenue por canal sólo se corrige hacia arriba.
2. Editar una regla en `/pixel/canales` **duplica el revenue de los últimos
   4 días** (quedan la fila del canal viejo y la del nuevo) y parte la serie
   histórica en dos canales que son el mismo.

Esto no es una proyección de escala: **es lo que los clientes ven hoy**.

El arreglo está bien acotado y el patrón ya existe en el repo: los otros cuatro
rollups Gold usan `buildDeleteOrphans` + ventana de días afectados
(`affected-days.ts`), y `pixel_daily_channel` hace DELETE-then-insert con un
comentario que explica exactamente este problema. Los dos de atribución son los
únicos que no lo tienen. Ver `PLAN_REMEDIACION.md` § R-C25.

**Corrige mi lectura previa**, que decía que lo más probable era que estuviera
apagado. Estaba equivocada: el default del código es opt-in, pero alguien lo
prendió en Vercel.

## Pendiente de decisión

~~`PIXEL_USE_GOLD_CHANNEL = true` en Production. Si `PIXEL_USE_GOLD` y~~ **RESUELTO arriba: los tres en `true`.** Antes se leía: si `PIXEL_USE_GOLD` y
`PIXEL_USE_CHANNELS` también lo están —no se pueden leer, están marcadas como
sensibles— entonces **R-C25 es un problema activo, no latente**: el revenue de la
capa Gold sólo se corrige hacia arriba y editar una regla en `/pixel/canales`
duplica el de los últimos 4 días. Verificar esos dos valores es la próxima acción
de mayor valor por minuto invertido.

---

# 14. Lo que enseñaron las tres rondas de revisión (2026-09-07/08)

> Esta sección no existía en el plan original. Se agrega porque el trabajo hecho reveló un patrón
> que **cambia cómo conviene ejecutar lo que falta**, y eso vale más que cualquiera de los bugs
> sueltos.

## 14.1 El patrón: una variable con dos dueños

Once defectos encontrados en tres rondas. **Casi todos son la misma cosa**: un campo que servía para
dos propósitos distintos, y alguien —yo, en la mayoría de los casos— lo cambió pensando en uno solo.

| El campo | Servía para | Y también para | Qué se rompió |
|---|---|---|---|
| `lastChunkAt` | el latido que mira el reaper | el lock del claim **y** el conteo de concurrencia | primero el reaper no podía dispararse nunca; al arreglarlo, dos backfills en paralelo contra Neon |
| `hoursStale` | el número del mail | el disparador del self-heal de rollups | un cliente dormido dejaba un escaneo de ~190 s corriendo cada 4 minutos, para siempre |
| `missing` | "la tabla no existe todavía" | el cajón donde caía **cualquier** error | un `statement_timeout` se reportaba como "todo bien" |
| el cursor de los crons | reanudar el incremental | también se aplicaba al `?full=1` manual | el "rehacé toda la historia" se salteaba orgs en silencio y devolvía `ok` |
| `FAILED` | "este job terminó" | "este job salió bien" | el cliente quedaba activado con la data a medias |

**Por qué importa para lo que falta:** E-10 (unidad de trabajo), E-22 (planes) y E-27 (ciclo de vida)
son exactamente el tipo de tarea donde este patrón aparece — las tres redefinen el significado de
campos que ya existen y que ya tienen consumidores. Antes de tocar un campo en esas tareas, la
pregunta barata es **"¿quién más lee esto, y para qué?"**. Es un `grep`, y en este repo habría
ahorrado la mitad de los once.

## 14.2 "Hecho" no quiere decir "cerrado"

E-08 se dio por cerrada tres veces sin estarlo, y las tres veces el defecto estaba **en el código
escrito para cerrarla**. E-13 y E-19 pasaron por lo mismo. En los tres casos el código pasaba `tsc`,
pasaba los tests nuevos de su propia tarea, y no hacía lo que la ficha decía.

Lo que cambió el resultado no fue revisar más: fue **cambiar la pregunta**. Las primeras rondas
buscaban "¿hay un bug acá?". La que encontró lo peor preguntaba **"¿qué rompió este arreglo?"** —
y de ahí salieron los tres más caros, incluido el de los dos backfills en paralelo.

**Propuesta concreta para el resto del plan:** que cada tarea cierre con esa segunda pasada, sobre
los consumidores de lo que se tocó. Cuesta poco y es donde apareció todo lo grave.

## 14.3 Un tercio de los tests no probaba nada

Una auditoría por mutación sobre los 373 tests nuevos: **248 atraparían un bug de verdad, 125 no.**
Los tres peores ya están arreglados —uno testeaba una *réplica* del algoritmo escrita en el propio
archivo de test; otro pasaba en verde con el middleware apagado entero; el fix más caro de la branch
no tenía un solo test que lo ejecutara.

El resto de los 125 son guards estructurales legítimos y baratos (comparar dos listas, barrer el
árbol de rutas admin buscando handlers sin auth). **El problema no era el `readFileSync`**: era que
el nombre del archivo prometía conducta y entregaba un `grep`. Un test que lee el fuente está bien
mientras diga que hace eso.

## 14.4 Riesgos abiertos que el plan no contemplaba

Ninguno bloquea el merge. Se anotan para no perderlos.

| # | Qué | Por qué importa |
|---|---|---|
| N-01 | **Nadie vigila si el workflow de GitHub Actions sigue habilitado.** Es el disparador **principal** de los rollups (8 de los 9 hits por hora), y GitHub deshabilita los workflows programados tras 60 días sin actividad en el repo — justo el modo de falla que ese workflow vino a cubrir | El día que se apague, los rollups siguen andando con el respaldo de Vercel y nadie se entera hasta que se atrasan. Se le subió el margen al respaldo (de 1 a 2 hits/hora, ciclo de 4 h contra un umbral de 8), pero **la señal sigue sin existir** |
| N-02 | **El bootstrap de MercadoLibre no pasa por el control de admisión** de E-08: `approve-backfill` lo dispara en paralelo | El límite de concurrencia protege del backfill de VTEX y no del de ML. Con dos altas la misma semana, es la vía por la que vuelve el problema que E-08 cerró |
| N-03 | **`checkStuckOnboardings` mide 12 h desde `updatedAt`,** pero un backfill legítimamente grande (Arredo trajo 252.701 órdenes) puede tardar más | Falso positivo: alerta "atascado" sobre un alta que está funcionando. Es ruido de bajo costo, pero es el mismo mecanismo que E-19 vino a arreglar |
| N-04 | **La cache key de `/pixel/analytics` sigue desalineada** (R-C19, la mitad que E-12 no tocó) | Tira a la basura el 100% del warm de ese endpoint. Las dos opciones que propone la ficha rompen algo; el arreglo correcto —hacer la key canónica— cuesta un round-trip. **Necesita decisión** |
| N-05 | ~~Los checks de `control-alerts` tienen el mismo `catch { return [] }`~~ **Verificado: era uno solo, y se arregló el 2026-09-08.** Estaba en `checkJobsDeBackfillAtascados`, justo el check que acaba de volverse el único que ve un job reteniendo un alta | Devolver `[]` está bien —un check que no puede correr no puede inventar hallazgos— pero callarse no: para el cron, `[]` es indistinguible de "no hay problemas". Ahora loguea. **Se anota igual porque el patrón vale**: al escribir esta fila di por hecho que eran varios, y eran uno; conviene contarlos antes de afirmarlos |
