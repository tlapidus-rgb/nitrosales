> Estado técnico actualizado: [integración local del 2 de octubre](EXPANSION-INTEGRACION-2026-10-02.md). Lo siguiente conserva el historial.

# Estado de la branch de integración

> **Última actualización: 2026-09-13, después de la revisión con ojos frescos.** Branch
> `fix/expansion-gate-e0`, **106 commits** por delante de `origin/main`. **Nada de esto está en
> producción.** La decisión fue explícita: todo el plan entra en una sola branch, se prueba y se
> revisa entero, y recién ahí se mergea — antes de sumar clientes nuevos.
>
> **El merge todavía no está autorizado** (2026-09-13). Y antes de mergear hay un prerequisito que
> el `checklist-merge` **no** verifica: `vercel.json` tiene la clave vieja escrita en las 29 URLs de
> cron, y `admin-key.ts` ahora la lee de `ADMIN_API_KEY` con fallback a un valor aleatorio. Si esa
> variable no está seteada en Vercel —o no vale ese mismo literal— los 29 crons y los endpoints
> admin empiezan a devolver 403. Falla cerrado, que es lo correcto, pero falla.
>
> **Actualizado 2026-09-30:** la branch a mergear ya no es `fix/expansion-gate-e0` (superada) sino
> **`claude/listo-para-merge`**: sale del HEAD de Codex (`codex/expansion-review-fixes` =
> `db4dbdd6`, 43 commits sobre `060607f8`) y suma los arreglos de la revisión final. **179
> commits** por delante de `origin/main` (`39d93a20`), **sin push, sin mergear**. Antes del merge
> hay que correr las **cinco migraciones** en Neon con
> `docs/revision-2026-09/08-MIGRACIONES-NEON.sql`; el estado completo y lo que falta decidir está
> en `docs/revision-2026-09/07-ESTADO-FINAL.md`. La tabla de abajo es la del 2026-09-13; la
> corrida vigente es la de esta línea.

## Cómo está

| | |
|---|---|
| `npx tsc --noEmit` | 0 errores |
| `npx vitest run` | **1.362 passed**, 7 skipped, **0 failed** |
| `npm run build` | exit 0 (incluye los guards de contrato y `depcruise`) |
| Tests nuevos en la branch | 60 archivos (`git diff --name-status origin/main...HEAD`) |
| Guards de build | `order-contract`, `serve-gold-first`, `ts-nocheck` — los 3 en verde |
| **Actualizado 2026-09-30** (`claude/listo-para-merge`, corrida completa en `eff86b87`) | `vitest` **1976 pasan**, 7 omitidos, 0 fallan (165 archivos + 1 omitido) · `tsc` limpio · `npm run build` OK (106 páginas, guards OK, `depcruise` sin violaciones). **No corrido:** PostgreSQL real ni proveedores reales |

## La tanda de arreglos (2026-09-15/16) — 24 de 37 hallazgos cerrados

Doce commits, todos en la branch, **ninguno pusheado**. Cada arreglo verificado por
**mutación**: se reintroduce el bug y se confirma que el test se pone rojo. Ese paso frenó
cuatro arreglos que ya estaban dados por buenos y eran cosméticos.

### Seguridad (`540cf21e`)

- **Cinco crons se abrían mandando *nada*.** `if (syncKey !== process.env.SYNC_KEY)`: con la
  env sin setear, las dos puntas valen `undefined` y `undefined !== undefined` es **false**.
  Con una clave *incorrecta* devolvía 401, así que sólo se abría mandando nada — ningún
  escáner de claves lo encontraba. **Está en `main`**, no lo introdujo esta branch.
- **SQL injection** en `admin/validate-orders-count`: `?source=` entraba crudo a tres
  `$queryRawUnsafe`.
- **`aura/creators/[id]/send-password` no autenticaba.** Se gateó con
  `getOrganizationIdStrict`, no con staff: lo llama la UI del cliente.
- **La clave del creador se podía romper a fuerza bruta.** Se agrega
  `src/lib/rate-limit.ts` (5 intentos/minuto por IP **+ código**; el limitador de al lado
  permitía 86.400 por día).
  **Actualizado 2026-09-30:** ya no es un limitador en memoria. Codex lo pasó a una **admisión
  compartida en Postgres** (tabla `creator_password_attempts`, `src/lib/creator-password.ts`): 5
  intentos/minuto por cuenta y 30 por IP, contados en la base, así que valen entre instancias. Si
  la base no responde —o falta la migración— contesta 503 en vez de dejar pasar; no hay respaldo en
  memoria. La tabla es una de las cinco migraciones de `08-MIGRACIONES-NEON.sql`.
- **Un preview podía filtrar `ADMIN_API_KEY`** a un host arbitrario, porque seis rutas
  pasaban el header `Origin` —que controla quien hace el request— a `selfFetchBaseUrl`.
  Lo introdujo el arreglo del incidente del 2026-09-06.

### Datos y plata (`30e9b2ff`, `6886e6b2`, `5585cf2c`, `e608cd80`)

- **La facturación contaba órdenes de más**: `COUNT(*)` donde todo el repo usa
  `COUNT(DISTINCT COALESCE("packId","externalId"))`. Una de las seis dimensiones que se
  facturan, siempre para el mismo lado: cobrando de más.
- **El filtro de PII de la exportación tenía agujeros reales**: `appKey` no matchea
  `/apikey/i` —y es el nombre literal de la credencial de VTEX— y `/\bhash\b/` es inerte
  contra camelCase. Cero tests; ahora 21.
- **Las dos promesas falsas que sobrevivieron a E-26**: "Recalibración semanal" en pantalla
  y `modelo BG/NBD` **dentro del prompt del asistente**. Los dos tests que tenían que
  cazarlas estaban verdes (un espacio literal que Prettier partió; un `\b` que no matchea
  la barra de `BG/NBD`).
- **Las dos pantallas del margen decían cosas distintas**: con 0 % de costos cargados, un
  cliente veía "no podemos calcular tu margen" en una y **"Margen 100 % — Excelente"** en
  la otra.
- **Aurum opinaba del margen sin saber la cobertura**, porque el snapshot que se le publica
  dejaba esos campos afuera.
- **`SE_CONSERVAN` era configuración muerta**: `email_log` y `leads` sobrevivían al borrado
  y no se mencionaban en ninguna respuesta.

### Trabajo que se perdía (`571f3cd0`, `0a4ab8d4`, `def18a17`, `a0773431`)

- **Tres crons descartaban `persiste`**: una corrida manual pisaba el cursor del
  incremental y las orgs de atrás perdían su vuelta.
- **`refresh-gold-attribution-channel` sin aislamiento por org**: una org que falle siempre
  clavaba el cursor **y dejaba a las anteriores sin refrescar**.
- **El cupo de backfills no era atómico.** `SKIP LOCKED` evita que dos invocaciones tomen
  el mismo job, pero hace lo contrario para el cupo: la segunda se lleva **otra**. Dos
  backfills en paralelo con `maxConcurrentes = 1`.
- **`ml-processor` descartaba órdenes** pasado el offset 1000 de MELI, en silencio. La
  ventana de 7 días sólo "esquiva el límite" bajo ~142 órdenes/día; Arredo hace 1.600 por
  semana. Ahora parte la ventana. ⚠️ Los backfills grandes van a tardar más.
- **`approve-backfill` escribía antes de poder abortar**: el 409 dejaba la org enrolada en
  siete crons con el alta sin aprobar.
- **El chequeo de frescura era ciego al cliente recién firmado**: enumeraba desde la tabla
  de salida, así que una org sin una sola fila no se medía.

### Errores reportados como éxito (`a33b804c`, `decbaa3f`)

Fallo total de rollups → `ok: true` + HTTP 200. `evaluarChecklist` → `listo: true` sin
haber podido verificar nada. `post-backfill-finalize` → `ok: true` con los cuatro pasos
fallados. El purgado de caché devolvía `0` tanto al fallar como al no hacer nada.

### Tests que no podían ponerse rojos (`5483d249`, `280e6459`)

Seis falsos verdes, cada uno confirmado por mutación. El peor: **el escáner de inyección
SQL tenía un typo** (`/^s*[(<]/` en vez de `/^\s*[(<]/` — `s*` matchea la letra ese), así
que una inyección escrita con un espacio pasaba. Y la lista de señales de auth incluía dos
**nombres de variable**: borrar la comparación y dejar el import dejaba el test verde, con
38 rutas admin dependiendo sólo de eso.

Más siete encabezados que describían otra cosa que el código — incluido uno que documentaba
como abierto un bug que **esta misma branch cerró**, y que al reescribirlo destapó un hueco
real: el camino de excepción no reprogramaba la cola.

### Lo que NO se hizo

**11 decisiones** que cambian lo que ve o recibe un cliente: `docs/revision-2026-09/04-DECISIONES-TECNICAS.md`
(versión técnica) y `docs/revision-2026-09/05-DECISIONES-PARA-TOMY.md` (en castellano llano).

**R-09 pausado**: su arreglo depende de qué se decida sobre `wipe-account`. Corregirlo ahora
y borrarlo mañana es trabajo tirado.

### Trece errores propios, documentados

`docs/revision-2026-09/06-ERRORES-COMETIDOS.md`. Escritos en el momento, no al final. Tres del mismo tipo en
un día —un chequeo que lee el texto que yo mismo acababa de insertar— y uno que casi deja
una página de finanzas rota en runtime, con `tsc` en verde porque ese archivo tiene
`@ts-nocheck`.

El que más importa: **el primer arreglo de un falso verde era, otra vez, un falso verde**, y
lo detectó la mutación. Sin ese paso quedaban cuatro arreglos cosméticos en el repo con la
tranquilidad de haberlos cerrado.

---

## La revisión multiagente (2026-09-14) — `docs/revision-2026-09/02-HALLAZGOS.md`

Nueve revisiones independientes, con los 127 archivos no-test repartidos en lotes **disjuntos y
exhaustivos** (cobertura demostrada con un script: 127/127, cero sin asignar). **37 hallazgos
abiertos**, en `BACKLOG_PENDIENTES.md` → `BP-REVISION-0914`.

Los cinco que bloquean el merge: el **techo de organizaciones estaba 18× inflado** (ver la
corrección en `PLAN_EXPANSION.md`), un preview puede **filtrar `ADMIN_API_KEY`** a un host
arbitrario, el **borrado completo no borra la organización** (`wipe-account` sí lo hacía), **Search
Console da verde sin crear conexiones**, y la **captura de leads no-VTEX está rota**.

Y uno que **no es de esta branch y afecta producción hoy**: cinco crons se abren mandando *nada*,
porque `undefined !== undefined` es `false`. Pendiente de confirmar si `SYNC_KEY` existe en Vercel.

Lo que **se verificó y está bien**, para no revisarlo de nuevo: el SQL de `metrics/orders` es byte a
byte idéntico a producción (dos revisores, 72 ocurrencias), el pixel emite JS byte-idéntico
(verificado por fuera del test, 62.471 = 62.471), las ~45 rutas de influencers no filtran
contraseñas de creadores, el cambio de secciones a capacidades no movió ningún acceso, y las 110
fuentes nuevas de la branch no tienen un solo `@ts-nocheck`.

## La revisión con ojos frescos (2026-09-13) — commit `3560d31b`

Repaso completo de la branch antes de mergear. **9 hallazgos**, cada uno verificado por mutación:
se reintroduce el bug y se confirma que el test se pone rojo.

**El más grave: `admin/aura-resend-onboarding` no autenticaba.** Un POST anónimo con
`{"dryRun": false}` le mandaba a todos los creadores del cliente el mail con el link para definir
su contraseña. Pasaba el test de *"toda ruta admin autentica"* porque menciona `getOrganization`,
que **no es auth**: sin sesión cae al fallback de org única y devuelve la org igual. Hoy en
producción devuelve 500 de rebote porque hay más de una org — pero eso es una casualidad del dato,
no una puerta.

**Seguridad (3 más).** `techo-de-orgs` aceptaba `?key=` y **escribe** (recalcula los rollups de
todas las orgs) con una clave que está en `vercel.json` versionado. El token de Meta viajaba en la
query string en un archivo que esta misma branch agrega. Y `cron/ml-sync` devolvía 500 si faltaba
`CRON_SECRET`, apostando el cron a una variable que ningún otro de los 26 crons usa.

**Bugs (5).** Uno peor que el reportado: **el fixture de los tests de `cursor-store` creaba una
tabla distinta a la de producción** —`cursor TEXT NOT NULL` y sin ninguna columna de latido—, así
que toda esa suite corría contra un esquema que no existe. La DDL pasó a estar en un solo lugar.
Los otros cuatro: `warm-cache` usando una variable inexistente en el `catch` (que se comía el error
real **y** el latido), el mail de control diciendo *"✅ Todo OK"* con crones caídos listados
abajo, cerrar una vuelta borrando el latido, y la alerta de gasto publicitario silenciándose justo
con poco volumen — la plata no tiene ruido de Poisson.

**Tests que no probaban lo que decían (5).** `comparacion-segura.ts` —lo único que decide si entra
un request al webhook de VTEX y a todo endpoint admin— **no tenía un solo test propio**. El guard
de self-fetch leía comentarios (#S61, tercera vez en esta branch). `destinatarios` afirmaba
`toContain("@")` sobre la casilla de alertas, así que podía pasar a ser cualquier cosa con arroba.

**Honestidad (3).** La suspensión de un cliente se anotaba y contestaba `ok: true`, pero **nadie lee
ese estado**: el cliente sigue entrando igual. No se conectó el gate acá —va en el camino de auth de
todos los requests y merece su propia verificación— pero la respuesta ahora trae `seAplica: false`,
y hay un test que barre el repo y falla si alguien lo conecta sin actualizar la constante.

**Al margen:** tres archivos habían quedado con finales de línea mezclados, que es lo que hizo que
una mutación anterior no se aplicara y reportara verde **sin haber tocado nada**.

## Lo que se construyó el 12 y 13 de septiembre

| | Qué | Dónde |
|---|---|---|
| **E-07 (prep)** | Los dos secretos toleran una **ventana de rotación**. Rotar deja de ser un corte de raíz: durante la ventana valen la clave vieja y la nueva. **Nada está rotado.** | `lib/comparacion-segura.ts`, `lib/webhook-key.ts`, `lib/admin-key.ts` |
| **E-26** | El truncado silencioso de los paneles predictivos ahora se ve, y dice **por qué criterio** se recortó. Se quitaron **cuatro afirmaciones falsas** de la UI sobre el motor de LTV | `lib/analytics/cobertura.ts`, `components/bondly/AvisoDeCobertura.tsx` |
| **E-29** | El wizard mostraba 100 % en verde sobre un alta que el backend rechazaba con 400. Era una pared, no una promesa falsa | `lib/onboarding/listo-para-enviar.ts` |
| **E-21** | Las **seis dimensiones** de facturación por organización, más el costo de IA en dólares. La tabla de precios de modelos **no existía en el repo** | `GET /api/admin/consumo-por-cliente`, `lib/costos/*` |
| **E-23** | Tope de gasto y freno de loop en Aurum. **Degrada, no bloquea** | `lib/aurum/cuota.ts` |
| **E-30** | El mapeo de estados de MELI estaba en **siete copias, en dos familias que no coincidían**. El pixel partido en núcleo + capas VTEX | `lib/meli-status.ts`, `api/pixel/script/route.ts` |

### Lo más grave que apareció: el mapeo de MELI movía plata

Siete copias del mapeo de estados, en dos familias:

| estado MELI | Familia A (5 archivos, **incluye el webhook en vivo**) | Familia B (2) | ¿Cuenta como venta? |
|---|---|---|---|
| `confirmed` | `APPROVED` | `PENDING` | **A sí · B no** |
| `partially_refunded` | `PENDING` | `APPROVED` | **A no · B sí** |

En MELI `confirmed` es *"orden creada, esperando pago"*. La familia B tiene razón y era la
minoría: **el webhook en tiempo real contaba plata que todavía no entró**, hasta que el cron de
reconcile lo curaba unas horas después. Por eso nunca explotó, y por eso nadie lo vio.

### Dos archivos CORE PROTEGIDO tocados, con autorización explícita de Axel

| Archivo | Cambio | Red |
|---|---|---|
| `api/webhooks/vtex/orders/route.ts` | **2 líneas**: un import y la validación de `?key=` | `webhook-vtex-clave-rotable.test.ts` |
| `api/pixel/script/route.ts` | Template de 1.600 líneas partido en tres funciones. **Corte textual: el JS emitido es idéntico byte a byte** | `pixel-script-byte-identico.test.ts` |

`src/lib/pixel/attribution.ts` **no se tocó**. Las excepciones están anotadas en el header de cada
archivo y en `docs/HANDOFF.md`.

⚠️ **El snapshot del pixel congela 65.491 bytes.** Si ese test se pone rojo, el JS emitido cambió.
Regenerarlo para que pase destruye la única red que ese archivo tiene.

### Hallazgos que quedaron en el backlog, no resueltos

| | Qué |
|---|---|
| **N-06** | ~50 endpoints comparan `NEXTAUTH_SECRET` con `!==` y **no toleran la ventana de rotación**. Hay que cerrarlos ANTES de rotar de verdad |
| **N-07** | El paquete "sólo NitroPixel" no se puede dar de alta solo. Decisión de producto |
| **N-08** | **Aurum no usa prompt caching en ninguna llamada.** Es la palanca de costo más grande y más barata que hay |
| **N-09** | `Order`/`Product`/`Customer` tienen clave única sin la plataforma. Hoy no colisiona; arreglarlo necesita migrar datos |

## Lo que se construyó del 11 al 12 de septiembre

Seis tareas del plan, todas antes del próximo cliente. El hilo que las une: **casi ninguna era
construir algo nuevo — era hacer visible algo que ya pasaba.**

### E-24 · Piso de volumen en las anomalías

El detector era 100 % porcentual. Con 7 órdenes por día, pasar a 4 disparaba una alerta HIGH de
"facturación cayó 43 %". Con cuatro clientes grandes era teórico; desde E-19 los checks mandan **un
mail por día**, así que el primer cliente chico recibiría alertas falsas desde la semana uno — y el
modo de falla no es "molesta", es que **deja de leer los mails**.

La cuenta: las órdenes son un conteo y tienen ruido de Poisson, así que con `n` órdenes la variación
esperada **sólo por azar** es `1/√n`. Con 7, eso da 38 % — el umbral de −30 % disparaba sobre nada.
El umbral ahora se ajusta al ruido (2 sigmas), así que **a un cliente grande no le cambia nada** y a
uno chico le sube la vara hasta donde el dato deja de ser azar.

### E-25 · Margen bruto del 100 %

Sin costos cargados, `COALESCE(costPrice, 0)` da COGS = 0 y el margen sale 100 %. Le pasa a **todo
cliente nuevo el día 1**, y miente en la dirección más peligrosa. `/finanzas/pulso` ni siquiera
calculaba la cobertura. Ahora por debajo del 20 % el margen **no se muestra**: un cartel al lado de
un "100 %" gigante sigue siendo una mentira en pantalla.

Aparecieron dos bugs del mismo patrón: el componente hacía `?? 0` (habría mostrado 0 % "Crítico"), y
`narrative.ts` escondía que un margen legítimo de 0 % —vendiendo al costo— no alertaba.

### E-33 · Los pasos que hoy son fuera del producto (4 de 6)

**Los tres primeros no eran lo que decía la ficha.** En los tres la cadena ya estaba construida y lo
que faltaba era que alguien mirara el resultado. Está anotado como
`#FICHA-ESCRITA-LEYENDO-EL-RUNBOOK`.

- **Orders Broadcaster** — configurar ya estaba automatizado. Faltaba verificar, y apareció un caso
  que nadie miraba: un hook con el `?org=` de **otro cliente** manda las órdenes de éste al otro.
  Silencioso, rompe los números de **dos clientes a la vez**, y se vuelve probable cuando entran
  clientes (copiar el curl del alta anterior).
- **Precios de costo** — la cadena corre entera y `catalog-refresh` devuelve un `withCost` que no lee
  nadie. La causa más probable de que venga en cero **no se adivina**: la API key de VTEX necesita el
  rol de **Pricing**, aparte del de Catalog. Sin él el costo no viaja y el resto del catálogo sí.
- **Afiliado de VTEX** — el único que de verdad no se puede automatizar. Se reusa el mismo criterio
  del broadcaster.
- **Las 4 acciones manuales del merge** — `GET /api/admin/checklist-merge`. **Verifica, no ejecuta**:
  dos de las cuatro son variables de Vercel y el código no puede escribirlas.

### E-14 · El checkbox del pixel

"Ya pegué el snippet" no verificaba nada. Ahora hay un botón que pregunta de verdad y tilda el
checkbox solo cuando llegan eventos. Lo que el mensaje **no** dice importa tanto como lo que dice:
cero eventos no prueba que esté mal, porque una tienda recién abierta puede no tener una visita.

El guard `check-serve-gold-first` atajó la primera versión y sirvió: el `COUNT` sobre `pixel_events`
era innecesario. La excepción al allowlist está escrita con el motivo.

### E-20 · Telemetría — un latido por cron

El modo de falla más caro de la historia del producto: `refresh-pixel-first-source` estuvo **cinco
semanas** fuera de `vercel.json` sin que nadie se enterara. `checkPipelineFreshness` lo detecta **de
rebote** y por eso deja afuera a los crons cuyo trabajo no termina en una tabla vigilada — que son
justo los que le hablan al cliente.

La cadencia sale de `vercel.json`, no de una lista a mano. **Sin migración nueva:** las columnas del
latido entran en la migración de cursores que todavía no se corrió, así que siguen siendo cuatro
acciones manuales.

## Lo que encontró la revisión del PLAN (2026-09-08)

Un revisor sin contexto comparó `PLAN_EXPANSION.md` ficha por ficha contra la branch. Lo peor que
encontró es código, no documentación.

### Tres crons que le escriben al cliente seguían matando de hambre al último

`digest`, `anomalies` y `ads-utm-audit`: `maxDuration = 60` y un `for` sobre TODAS las
organizaciones, **sin reloj, sin `orderBy` y sin cursor**. E-05 les puso el aislamiento por
organización, que era la mitad del problema; ésta era la otra.

Con 20 clientes el loop se come los 60 s a mitad de lista, Vercel mata la función y **no devuelve
nada**: los de atrás no reciben su digest ni sus alertas, nunca, en silencio. Y quién queda afuera lo
decidía el orden físico de las filas en Postgres. **No estaban en la lista de 8 del estudio**, así
que E-11 no los cubrió — y son justo los tres que le hablan al cliente por mail.

`ads-utm-audit` era el peor: además hace un `findMany` de 7 días de `pixel_events` **por
organización** sobre la tabla más grande del sistema.

### Y la tabla de acciones manuales de este mismo documento apagaba la ventana del backfill

Decía que `BACKFILL_VENTANA` va en formato `HH:MM-HH:MM`. El parser sólo acepta horas enteras, y
**un valor que no parsea significa "sin restricción"**. Alguien siguiendo esa tabla al mergear habría
dejado la ventana apagada sin ninguna señal, y el backfill de un cliente nuevo podría arrancar a las
3 de la tarde contra Neon — el escenario exacto que E-08 vino a evitar. Corregido acá y en el parser,
que ahora avisa cuando descarta un valor en vez de fallar abierto en silencio.

## Los tres que encontró el repaso de segundo orden

Después de arreglar los ocho de abajo, hice una pasada distinta: en vez de buscar bugs nuevos,
revisar qué **rompió cada uno de mis arreglos**. Salieron tres, y el primero es el más peligroso de
toda la branch.

### El límite de concurrencia dejó de funcionar

Sacar `lastChunkAt` del claim (el arreglo de A5) rompió `contarJobsActivos`, porque esa misma
escritura servía para **dos** cosas: el lock del claim y el conteo de concurrencia.

El resultado: un job recién tomado, que todavía no completó su primer chunk —y un chunk de un
backfill grande tarda **minutos**— figuraba en cero. El tick siguiente del cron veía 0 activos,
admitía, y reclamaba otro job. Con `maxConcurrentes = 1`: **dos backfills en paralelo contra Neon**,
que es exactamente lo que E-08 vino a impedir y lo que tumbó la base la vez que motivó todo esto.

Los tests no lo agarraron porque el helper `activos()` era una copia a mano del SQL. Ahora importa el
de verdad.

### El check de jobs atascados no veía los FALLADOS

Desde A6, un job FAILED es lo que retiene el onboarding en `BACKFILLING`. Pero
`checkJobsDeBackfillAtascados` miraba sólo `QUEUED` y `RUNNING`: el estado más urgente de mirar era
el único que el check no veía. El aviso quedaba a las 12 h y sin decir qué job ni con qué error.

### El chequeo de frescura podía matar al cron que lo hospeda

`checkPipelineFreshness` corre dentro de `warm-cache`, que ya se comió hasta 220 s de sus 300 antes
de llegar ahí — y yo lo hice más caro (15 queries agrupadas + 4 de las fuentes, contra 15 `MAX()`
simples). Si se pasa, Vercel mata la función y **warm-cache no devuelve nada**. Y ahí vive
`maybeSelfHealRollups`: el monitoreo habría tumbado al cron que recupera los rollups atrasados.

## Lo que se arregló después de la segunda revisión

La revisión del 2026-09-07 (varios agentes, uno de ellos sin contexto previo) encontró **ocho bugs
que introdujo esta misma branch**. Todos están arreglados y con tests que los atrapan; cada uno se
verificó por mutación, o sea revirtiendo el arreglo y comprobando que el test se ponga en rojo.

Vale la pena leer la lista completa antes de mergear, porque el patrón se repite: **casi todos son
un arreglo que parecía cerrado y no lo estaba.**

### C1 — la validación del wizard rompía el alta de 3 de 4 plataformas

E-13 validaba las credenciales de las cuatro plataformas al enviar el wizard. Pero en Meta Ads,
Google Ads y MercadoLibre las credenciales de verdad (`accessToken`, `refreshToken`) **no viajan en
el wizard**: las pone el callback de OAuth del lado del servidor, y el submit las mergea *después*
de la validación. Se validaban vacías, los testers devolvían una falla confirmada ("OAuth pendiente,
falta autorizar Google Ads") sobre un cliente que ya había hecho OAuth, y el resultado era un 400 en
cada intento **sin ninguna forma de salir desde la interfaz**.

Ahora sólo se valida VTEX, que es la única que el cliente tipea (`PLATAFORMAS_QUE_SE_TIPEAN`).

### C2 — un timeout trababa un alta

`credential-tests.ts` tiene su propio tope de 10 s y convierte el timeout en `ok:false`, así que el
"no sé" se volvía "no" **antes** de que el presupuesto de 20 s se enterara. Una Graph API de Meta
lenta bloqueaba a un cliente con las credenciales perfectas. Ahora vuelve como inconcluso.

### A5 — el reaper de jobs no podía dispararse nunca

El arreglo del "job zombie" no arreglaba nada. El claim escribía `lastChunkAt = NOW()`, el cron corre
**cada minuto** y el cooldown para re-tomar un job es de 2: un job roto se re-reclamaba cada dos
minutos y se refrescaba el latido solo, así que nunca acumulaba los 30 minutos que el reaper exige.
Los 8 tests que había probaban el `UPDATE` aislado y nunca la interacción con el claim, así que
pasaban todos en verde.

Ahora hay dos relojes separados: `updatedAt` ("esto está tomado", lo pisa el claim, es el lock) y
`lastChunkAt` ("esto avanza", sólo lo mueve un chunk exitoso).

### A6 — un backfill fallado se daba por alta completa

`areAllJobsComplete` contaba `FAILED` como terminado. Junto con A5: una caída de VTEX de media hora
→ el reaper marca el job FAILED → "todos terminaron" → dispara `post-backfill-finalize` → **el
cliente queda activado con la data a medias**, y nadie lo re-encola. Ahora un fallado deja el
onboarding en `BACKFILLING`, donde `checkStuckOnboardings` lo levanta a las 12 h.

### A1 — el chequeo de frescura alertaba para siempre por clientes quietos

Todos los upserts del pipeline filtran por ventana. Si un cliente no vendió en tres días, el upsert
afecta cero filas y `silver_updated_at` no se mueve: el cron corrió bien y el chequeo lo reportaba
atrasado. Cada cliente tranquilo generaba una alerta permanente. Ahora cada tabla derivada declara su
fuente y el criterio es relativo: está atrasada si su fuente tiene algo **más nuevo** que ella.

### A2 — el monitoreo se rompía y reportaba silencio

Un `catch {}` marcaba todo como "la tabla no existe, no es una alerta". Cualquier `statement_timeout`
de la query agrupada nueva salía por esa puerta. El módulo que existe para avisar que algo dejó de
correr se rompía y decía que todo estaba bien.

### A4 — el cursor se aplicaba y se pisaba también en `?full=1`

`refresh-silver-orders` arrancaba un `?full=1` desde donde había quedado el cron automático,
salteándose en silencio las orgs anteriores: devolvía `ok` sin haber rehecho lo que se le pidió, que
es la peor combinación posible en una herramienta de reparación.

### A3 — el respaldo de los rollups no tenía margen

En operación normal hay 9 hits/hora sobre 8 tablas: ciclo de ~53 min contra un umbral de 8 h. Pero
**GitHub deshabilita los workflows programados tras 60 días sin actividad en el repo** — justo el
modo de falla que ese workflow vino a cubrir. Sin él quedaba 1 hit/hora × 8 tablas = exactamente 8 h
contra un umbral de 8 h. Se pasó a `11,41 * * * *`.

Y de paso: `hoursStale` alimenta el self-heal de `warm-cache`, que dispara un escaneo HLL de ~190 s
sobre una tabla de 43 GB. Salía del máximo sobre todas las orgs, así que **un solo cliente dormido
alcanzaba para dejar ese escaneo corriendo cada cuatro minutos, para siempre.** El síntoma habría
sido "la app está lenta", no "hay una alerta".

## Auditoría de calidad de los tests

Se corrió una auditoría por mutación sobre los tests nuevos: 373 casos, de los cuales **248
atraparían un bug de verdad y 125 no**. Los tres peores están arreglados:

1. `metrics-pixel-degradacion` testeaba una **réplica** del algoritmo escrita en el propio archivo de
   test. El helper se movió a `@/lib/api/all-or-empty` y ahora se ejecuta el original.
2. `alerts/engine` — el fix de *starvation* de la cola de alertas, el más caro de la branch, tenía 20
   líneas de comentario y cero tests que lo ejecutaran. Nuevo `engine-cola.test.ts` con PGlite.
3. `gates-conectados` pasaba en verde **con el middleware apagado entero**. Ahora hay un bloque que
   lo ejecuta con un token solo-pixel.

El resto de los 125 son guards estructurales legítimos y baratos (comparar dos listas, barrer el
árbol de rutas admin buscando handlers sin auth). El problema no era el `readFileSync`: era que el
nombre del archivo prometía conducta y entregaba un `grep`.

---

## ⚠️ Acciones manuales al mergear

> **Desde el 2026-09-12 no hay que confiar en esta tabla: hay un endpoint que las verifica.**
>
> ```
> GET /api/admin/checklist-merge?key=<ADMIN_API_KEY>
> ```
>
> Devuelve los cuatro pasos en verde o en rojo, con qué hacer en cada uno. Sirve **antes** del merge
> y también **después**: si alguien se olvidó de algo, lo sigue diciendo. La tabla de abajo queda
> como referencia de por qué importa cada una.
>
> **Verifica, no ejecuta**, y no por vagancia: dos de las cuatro son variables de entorno de Vercel
> y el código que corre adentro de Vercel no puede escribirlas. Las otras dos sí se podrían correr
> —una migración y dos backfills Gold— y a propósito no se corren desde un botón: `CLAUDE.md` tiene
> una regla entera sobre cambios en producción que pide dry-run, backup y rollback preparado.

Estas **no** las hace el deploy. Sin ellas, parte de lo que se construyó queda inerte.

| # | Qué | Cómo | Si no se hace |
|---|---|---|---|
| 1 | Migrar la tabla de cursores | `POST /api/admin/migrate-cron-cursors` — **antes** del merge del código que la usa, como manda `CLAUDE.md` | Los crons vuelven a arrancar de cero cada vez. Degrada sin romper: es el comportamiento de hoy |
| 2 | `ALERTAS_EMAILS` | Vercel → Environment Variables. Separadas por coma | Las alertas siguen yendo a una sola casilla. **Ojo: no falla nada** — el código cae a la casilla histórica, así que sin mirar el checklist no te enterás |
| 3 | `BACKFILL_VENTANA` | Vercel. **Horas enteras, `1-7`** (de la 1 a las 7 AM, hora argentina). NO `01:00-07:00`: el parser lo rechaza y un valor que no parsea significa **sin restricción** | El backfill corre a cualquier hora. El checklist distingue "sin configurar" de "configurada y mal escrita", que para el backfill son lo mismo y para vos no |
| 4 | `?full=1` en los dos crons Gold | Una corrida manual después del deploy | Las tablas Gold arrancan con la ventana incremental y tardan en llenarse. El checklist lo detecta mirando si tienen historia más allá de los 4 días |
## Lo que sigue congelado

**Rotación de secretos (R-C07 / R-C08 / R-C09).** Decisión explícita: no se rotan hasta entender el
impacto. Sigue en pie. Lo que cambió es que **rotar dejó de ser un corte de raíz**.

Hasta el 2026-09-12 el bloqueo era este: la clave viaja en la URL de los 29 crons y en la del webhook
de órdenes de VTEX, así que cambiar el valor en Vercel dejaba a todo eso devolviendo 401/403 hasta
actualizar cada URL — y en el caso de VTEX, que no reintenta, eso era ingesta perdida en silencio.

Ahora los dos secretos toleran una **ventana de rotación**: `ADMIN_API_KEY_ANTERIOR` y
`NEXTAUTH_SECRET_ANTERIOR`. Durante la ventana valen la clave vieja y la nueva a la vez, así que la
rotación pasa a ser por etapas y cada una es reversible:

1. Setear la `*_ANTERIOR` con el valor viejo y la principal con el nuevo. **Nada se corta.**
2. Actualizar las URLs —`vercel.json` y el hook de cada cuenta VTEX— con calma, verificando una por
   una con `/api/admin/verificar-webhook-vtex`.
3. Borrar la `*_ANTERIOR`. Recién ahí la vieja deja de servir.

El `/api/admin/checklist-merge` reporta las dos ventanas por separado, porque **una ventana que queda
abierta para siempre es una rotación que no terminó** y no tiene ningún síntoma: todo funciona igual.

⚠️ **Esto no rota nada.** Sin las `*_ANTERIOR` seteadas el comportamiento es idéntico al de antes.

⚠️ **Y no cubre todo.** Quedan ~50 endpoints que comparan `NEXTAUTH_SECRET` con `!==` directo
(`/api/sync/prices`, `/api/sync/catalog`, los `migrate-*`, el webhook de inventory). Esos **no**
toleran la ventana: durante una rotación aceptarían sólo la clave nueva. Los crons principales sí
sobreviven porque aceptan además `ADMIN_API_KEY`, que ya es rotable. Está anotado en
`BACKLOG_PENDIENTES.md`.

Mientras tanto, y esto conviene tenerlo presente: `ADMIN_API_KEY` y `NEXTAUTH_SECRET` son el mismo
literal, y ese literal está en `vercel.json`, que está versionado. Con él se puede forjar una sesión
de staff, lo que hace que todos los gates de esta branch sean evitables por alguien que lea el repo.
Los gates igual valen —cubren al usuario logueado, que es el caso real— pero no son una frontera de
seguridad hasta que se rote.

## Hallazgos menores todavía abiertos

`M2`–`M5` y `B1`–`B3` de la revisión: baja severidad, ninguno afecta el alta de un cliente. Están en
los reviews de `docs/auditoria-2026-09/`.
