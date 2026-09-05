# Onboarding — costo humano, fallas silenciosas y brecha hasta self-serve

**Repo:** `C:/Users/axelf/github/nitrosales` · commit `9ad4616d` (= `origin/main` = producción)
**Método:** solo lectura del árbol de trabajo. No se ejecutó nada contra producción, DB ni endpoints.
**Insumos previos:** `docs/auditoria-2026-09/review-flujos.md` (C-10), `ERRORES_CLAUDE_NO_REPETIR.md` (`#ONBOARDING-BACKFILL-ORDENES-FALTANTE`), `ONBOARDING_ROADMAP.md`, `CLAUDE_STATE.md`, `docs/nitropixel-score-rollout.md`.
**Marcado:** todo lo que no pude confirmar contra el código va con `[NO VERIFICADO]`.

---

## 1. El número titular

> **Un cliente nuevo cuesta entre 8 y 18 horas de trabajo humano, de las cuales 4 a 12 son de Axel.**
> **Con el sistema como está hoy, el equipo soporta 2 a 3 clientes nuevos por mes** — y el cuello de botella no es el promedio, es la cola: un onboarding que sale mal cuesta 3 veces el que sale bien, y hoy no hay forma de saber cuál es cuál hasta que el cliente se queja.

### Desglose (estimación; los pasos son verificados, las horas no)

| Bloque | Quién | Horas |
|---|---|---|
| Revisar postulación + aprobar cuenta (paso 1) | Tomy | 0,25 |
| Acompañar al cliente durante el wizard (llamadas, WhatsApp, screenshots de VTEX) | Tomy | 1 – 3 |
| Diagnosticar credenciales VTEX que fallan (roles de la App Key, token truncado, permisos por área) | **Axel** | 0,5 – 2 |
| Aprobar backfill (paso 2) + monitorear que avance | Tomy | 0,25 – 1 |
| QA post-backfill: comparar números contra el admin del cliente, ver que el P&L no esté en cero | **Axel** | 1 – 2 |
| Verificar los **dos** webhooks de VTEX con `curl` (`CLAUDE.md:323-330`) | **Axel** | 0,5 – 1 |
| Mapear los códigos de origen propios del cliente a canales (`channel_rule`) | **Axel** | 1 – 3 |
| Rescates: job trabado, `post-backfill-finalize` perdido, rollups vacíos, permisos custom | **Axel** | 0 – 4 |
| Habilitar cliente + seguimiento primera semana | Tomy | 1 – 2 |
| **Total** | | **8 – 18 h** (mediana ~12) |
| **De eso, requiere a Axel** | | **4 – 12 h** (mediana ~6) |

### Por qué el techo es 2–3 clientes/mes y no 6

1. **Axel es el único que puede hacer 6 de las 9 tareas.** No es cuestión de entrenar a Tomy: implican leer respuestas de la API de VTEX, correr `curl` con credenciales del cliente, mirar `backfill_jobs` en la DB y decidir si un número es correcto.
2. **La varianza es el costo real.** Un onboarding limpio son ~8h; uno con credenciales mal (caso S58: App Token truncado a 12 chars, "tardamos horas en diagnosticar" — `credential-tests.ts:45-52`) o sin backfill (caso Arredo, semanas sin que nadie se entere) son 20h+. Con 14 pasos que pueden fallar sin aviso (§3), la cola es gorda.
3. **Cada cliente nuevo empeora a los 4 actuales.** `review-flujos.md:249`: `/api/sync/chain` con 4 orgs necesita hasta 220s y tiene 60s de `maxDuration` — *"sólo la primera org se procesa; las otras tres nunca"*. El cliente #5 no suma carga lineal: entra a competir por un presupuesto de cron que ya está desbordado. Esto es un techo **duro**, independiente de las horas humanas.
4. **La auditoría dejó 197 hallazgos vivos** (`CLAUDE_STATE.md:1-30`, `PLAN_REMEDIACION.md`), ninguno implementado. Las horas de Axel están comprometidas.

**Con las 5 mejoras de §6, la estimación baja a 3–6 h/cliente (1–2 de Axel) → 6–8 clientes/mes.** Ninguna de las 5 es un proyecto: cuatro son de días, no de semanas, y dos ya están escritas y sin conectar.

---

## 2. El flujo completo, paso por paso

Leyenda: **[AUTO]** el sistema lo hace solo · **[UI-MANUAL]** un humano aprieta un botón dentro del producto · **[FUERA]** un humano hace algo fuera de NitroSales (panel de VTEX, terminal, DB).

### Etapa A — Alta de la cuenta

| # | Paso | Tipo | Quién | Evidencia |
|---|---|---|---|---|
| 1 | El prospecto completa el form público y se crea `onboarding_requests` en `PENDING` + email de confirmación + auto-merge con el lead previo | **[AUTO]** | cliente | `src/app/api/public/onboarding/start/route.ts:136-199` |
| 1b | *(camino real hoy)* Tomy carga el lead a mano en `/control/cuentas` antes de que el cliente postule | **[UI-MANUAL]** | Tomy | `start/route.ts:161-186` (el auto-merge existe justamente porque este camino es el habitual) |
| 2 | Tomy abre `/control/onboardings`, revisa la postulación y aprieta **"Aprobar cuenta (paso 1)"** | **[UI-MANUAL]** | Tomy | `OnboardingDetailDrawer.tsx:137, 603` |
| 3 | Se crea Organization + User OWNER + password temporal, status → `IN_PROGRESS`, email con credenciales de login | **[AUTO]** | — | `admin/onboardings/[id]/activate/route.ts:113-180` |
| 3b | **Si el email ya existe como user o el slug está tomado → 409.** Hay que pedirle otro email al cliente o editar el slug a mano antes de reintentar | **[UI-MANUAL]** | Tomy/Axel | `activate/route.ts:79-102` |

### Etapa B — El cliente carga sus datos (el wizard)

| # | Paso | Tipo | Quién | Evidencia |
|---|---|---|---|---|
| 4 | El cliente loguea; `OnboardingGate` consulta el estado y, si está `locked`, renderiza **solo** el overlay (el producto no se carga atrás) | **[AUTO]** | — | `OnboardingGate.tsx:34, 69-71` · `api/me/onboarding/state/route.ts:85-108` |
| 5 | Decide *usar / saltear* cada una de las 6 plataformas y completa credenciales | **[UI-MANUAL]** | cliente | `OnboardingOverlay.tsx:402-484` |
| 5a | **VTEX:** el cliente entra a SU admin de VTEX, crea una App Key con los roles correctos y copia `accountName` / `appKey` / `appToken` | **[FUERA]** | cliente | `OnboardingOverlay.tsx:405-409`; validación anti-truncado en `submit-wizard/route.ts:293-302` |
| 5b | **VTEX Afiliados** (mecanismo 1 de 2): el cliente va a VTEX Admin → Pedidos → Config → tab Afiliados y da de alta el afiliado con la URL del hook | **[FUERA]** | cliente | `components/onboarding/VtexAffiliateInstructions.tsx` (usado desde `OnboardingOverlay.tsx:42`) · `CLAUDE.md:318-321` |
| 5c | **NitroPixel:** copia el snippet y lo pega en el `<head>` o GTM de su tienda | **[FUERA]** | cliente | `OnboardingOverlay.tsx:1911-1919` |
| 5d | **NitroPixel — confirmación:** tilda "Ya pegué el snippet". La UI promete *"NitroSales validará que recibimos pings antes de aprobar tu cuenta"* | **[UI-MANUAL]** | cliente | `OnboardingOverlay.tsx:2003-2012`. **Esa validación no existe automáticamente** (ver §3.5) |
| 5e | **MercadoLibre / Meta / Google Ads:** OAuth real, sin copiar tokens | **[AUTO]** | cliente | `OnboardingOverlay.tsx:1258, 1461` |
| 5f | Elige el rango histórico por plataforma (default VTEX **12 meses**) | **[UI-MANUAL]** | cliente | `OnboardingOverlay.tsx:521-522, 996-1001` |
| 6 | Submit: se crean las `Connection` en `PENDING`, se guardan los `historyXxxMonths`, status → `NEEDS_INFO`, mail a Tomy | **[AUTO]** | — | `api/me/onboarding/submit-wizard/route.ts:110-257` |

> **El cliente nunca ve si sus credenciales funcionan.** Es una decisión explícita: *"el cliente no debe ver fallas técnicas... eso genera dudas sobre el producto"* (`admin/onboardings/[id]/test-credentials/route.ts:10-15`). El costo de esa decisión es que todo el ciclo de corrección pasa por un humano.

### Etapa C — Validación admin

| # | Paso | Tipo | Quién | Evidencia |
|---|---|---|---|---|
| 7 | Tomy aprieta **"Probar credenciales"**: 6 plataformas, con sub-checks por área en VTEX | **[UI-MANUAL, opcional]** | Tomy | `OnboardingDetailDrawer.tsx:180-182` → `admin/onboardings/[id]/test-credentials/route.ts:132` |
| 8 | Si algo falla, se le avisa al cliente por WhatsApp/mail y se espera a que corrija | **[FUERA]** | Tomy | no hay email automático de "corregí esto" (la Fase 1.3 del `ONBOARDING_ROADMAP.md:171-178` lo propone; no está implementada) |
| 9 | **"Aprobar backfill (paso 2)"** → modal de selección de plataformas → connections a `ACTIVE`, se crean los `backfill_jobs`, status → `BACKFILLING`, email al cliente, se dispara el runner | **[UI-MANUAL]** | Tomy | `approve-backfill/route.ts:87-188` |

### Etapa D — Backfill y post-proceso

| # | Paso | Tipo | Evidencia |
|---|---|---|---|
| 10 | `cron/backfill-runner` (cada minuto, budget 240s) procesa chunks | **[AUTO]** | `vercel.json:80` · `cron/backfill-runner/route.ts:43` |
| 11 | Al completar todos los jobs, dispara `post-backfill-finalize`: catalog-refresh VTEX + ML → `Product.costPrice`, recompute de agregados de clientes, backfill de `costPrice` en `order_items` | **[AUTO, frágil]** | `backfill-runner/route.ts:142-152` · `cron/post-backfill-finalize/route.ts:66-93` |
| 12 | `finalizeOnboarding` marca `READY_FOR_REVIEW` | **[AUTO]** | `backfill-runner/route.ts:191-206` |
| 13 | Pipeline del pixel para la org nueva: `refresh-pixel-first-source` (cada :07 y :37) descubre la org sola desde `pixel_visitors`; `refresh-pixel-rollups` (cada 2h, últimos 3 días) toma su lista de orgs de `pixel_visitor_first_source` | **[AUTO]** | `lib/pixel/first-source-batch.ts:239-243` · `lib/pixel/rollup-backfill.ts:497` · `vercel.json:92,96` |

> **Buena noticia, y hay que decirla:** el `first-source` manual y pesado que menciona la auditoría era el problema de **Arredo**, que tenía 1,2M de visitantes de historia previa (`CLAUDE_STATE.md:104-112`). Para un cliente nuevo que instala el pixel limpio, la cadena `pixel_events → first-source (horario) → rollups (2h)` se auto-arranca sin intervención. **Este paso ya no es manual para clientes nuevos.** Sí sigue siendo manual el backfill de rollups históricos (`?phase=backfill`) para cualquier cliente que traiga historia de pixel previa.

### Etapa E — QA y habilitación

| # | Paso | Tipo | Quién | Evidencia |
|---|---|---|---|---|
| 14 | Tomy usa "Entrar como cliente" (impersonate) y revisa las pantallas a ojo. **No hay checklist** | **[UI-MANUAL]** | Tomy | `OnboardingDetailDrawer.tsx:283, 302` |
| 15 | **"Habilitar cliente"** → status `ACTIVE`, email "tu data está lista", y **recién acá** se configura el Orders Broadcaster de VTEX (mecanismo 2 de 2) vía `POST /api/orders/hook/config` | **[UI-MANUAL]** + **[AUTO]** | Tomy | `activate-client/route.ts:60-123` |
| 16 | Verificar por `curl` que los dos hooks quedaron con `?org=<orgId>` | **[FUERA]** | Axel | `CLAUDE.md:323-330` · `review-arquitectura.md:736` (*"es un `curl` a mano por onboarding"*) |

### Etapa F — Ajuste fino (no está en ningún flujo, pero pasa siempre)

| # | Paso | Tipo | Quién | Evidencia |
|---|---|---|---|---|
| 17 | Mapear los códigos de origen propios del cliente a canales. Hay UI (`/pixel/canales`), pero requiere preguntarle al cliente qué significa cada código | **[UI-MANUAL]** + **[FUERA]** | Axel + Tomy + cliente | `src/app/(app)/pixel/canales/page.tsx:124-396` · `PARA-TOMY-SOURCES-SIN-MAPEAR.local.md` (TeVe: `iconmarketing` 13.050 visitantes, `productosentv` 2.293, todos sin clasificar) |
| 18 | Roles/secciones custom si el cliente ve solo una parte del producto (casos TeVeCompras y Arredo: convertir el OWNER en MEMBER con custom role, tocando la DB) | **[FUERA]** | Axel | `CLAUDE_STATE.md:56-59, 130-134` |
| 19 | Verificar que `costPrice` quedó poblado; si la tienda VTEX no lo tiene cargado, todo el P&L queda en cero | **[FUERA]** | Axel | `post-backfill-finalize/route.ts:89-93` |

**Total: 19 pasos. 7 automáticos, 8 manuales en UI, 6 fuera del producto** (algunos pasos cuentan doble).

---

## 3. Los pasos que pueden fallar en silencio

La forma del caso Arredo — *se salteó, el sistema devolvió OK, nadie se enteró hasta que el cliente preguntó* — se repite en **13 de los 14 puntos de falla del onboarding**. El único que avisa es el cliente que abandona el wizard.

| # | Paso | Qué pasa si falla | ¿Avisa? | Qué ve el cliente | Evidencia |
|---|---|---|---|---|---|
| 1 | **Backfill nunca creado** (`historyVtexMonths = 0`) | 0 jobs, el endpoint devuelve `ok:true, "Jobs creados: 0"`, status pasa igual a `BACKFILLING` y sale el mail "empezamos a traer tu historia" | **NO** | Overlay "preparando tu cuenta" **para siempre** | `approve-backfill/route.ts:111,133,152-159,206` (C-10) |
| 2 | **Onboarding trabado en `BACKFILLING` o `READY_FOR_REVIEW`** | `checkStuckOnboardings` filtra `status IN ('PENDING','NEEDS_INFO','IN_PROGRESS')` — los otros dos **no están** | **NO, nunca** | Overlay "preparando" indefinido, incluso esperando el click de Tomy | `src/lib/control/checks.ts:171` (C-10; `PLAN_REMEDIACION.md` R-C15) |
| 3 | **`post-backfill-finalize` se pierde** | `fetch` fire-and-forget **sin `waitUntil`** en un handler que responde acto seguido; la lambda se congela. El endpoint **no está en `vercel.json`** → sin reintento. No corre catalog-refresh, ni agregados, ni `costPrice` | **NO** | Ve órdenes pero **todo el P&L y los márgenes en cero** — y el dashboard presenta el cero como dato real | `cron/backfill-runner/route.ts:146-149` vs. `approve-backfill/route.ts:168,183` (donde **sí** usa `waitUntil`) |
| 4 | **`backfill-runner` se solapa consigo mismo** | Cron cada minuto con budget de 240s y cooldown de 2 min: un chunk lento de VTEX hace que el siguiente tick tome el mismo job | **NO** | Barra de progreso pasa de 100%; rangos duplicados y rangos salteados en su historia | `vercel.json:80` · `backfill-runner/route.ts:43` (M-8) |
| 5 | **El pixel no se instaló (o quedó mal)** | El cliente tilda "ya pegué el snippet". El overlay **filtra `NITROPIXEL` de las plataformas** y manda `pixelInstalled` como campo suelto, que `submit-wizard` **nunca lee** (`VALID_PLATFORMS` no lo incluye). No se crea Connection, no queda registro de la afirmación | **NO** — solo si Tomy aprieta "Probar credenciales", que corre `testNitroPixel` | Toda la sección de analytics/atribución vacía. La promesa literal de la UI ("validará que recibimos pings") no se cumple sola | `OnboardingOverlay.tsx:652, 665, 2009-2010` · `submit-wizard/route.ts:28, 112` · `credential-tests.ts:1026` |
| 6 | **GSC se descarta en silencio** | El cliente carga `propertyUrl` en el wizard; `GSC` no está en `VALID_PLATFORMS` → `continue` sin error | **NO** | Sección de SEO vacía; hay que recargar la URL desde settings (`/api/me/gsc-save`) | `submit-wizard/route.ts:28, 112` · `OnboardingOverlay.tsx:459-464` |
| 7 | **Afiliado VTEX no configurado o sin `?org=`** | No llegan cambios de SKU/inventario de ese cliente | **NO** — no existe ningún check | Stock y catálogo desactualizados, sin señal de por qué | `CLAUDE.md:318-321, 323-330` |
| 8 | **Orders Broadcaster falla** | Se configura *fail-open* (el `catch` solo loguea) y el resultado vive únicamente en el JSON de la respuesta. Además apunta a `https://nitrosales.vercel.app` **hardcodeado**, no al dominio custom, y usa `NEXTAUTH_SECRET` como key | **NO** — y peor: el webhook de VTEX devuelve **200 aunque falle** (C-3) y `markSyncSuccess` marca éxito incondicional (C-4), así que el Centro de Control dice verde | **No entran órdenes nuevas.** El dashboard sigue mostrando lo viejo | `activate-client/route.ts:86-87, 119-122` |
| 9 | **Se configura un `webhookSecret` de ML** | A partir de ese instante **el 100% de los webhooks de órdenes de VTEX de ese cliente devuelve 401**; VTEX reintenta y desiste | **NO** — un `console.warn` | Las ventas dejan de aparecer | `review-flujos.md:287` |
| 10 | **Backfill concurrente entre orgs** | `VTEX_KEY`/`VTEX_TOKEN`/`VTEX_ACCOUNT` son variables **a nivel de módulo**; Fluid Compute corre invocaciones concurrentes en la misma instancia | **NO** — *"imposible de detectar sin auditar fila por fila"* | Órdenes de otro cliente escritas bajo su `organizationId` | `app/api/backfill/vtex/route.ts:25-28, 606-608` (C-7) |
| 11 | **Canales sin mapear** | Los códigos de origen propios del cliente caen en `sin_clasificar` | **NO** | Un bloque grande de tráfico sin canal en su reporte de atribución | `PARA-TOMY-SOURCES-SIN-MAPEAR.local.md` |
| 12 | **`costPrice` vacío en el catálogo VTEX** | Márgenes y P&L en cero | **NO** (el test de VTEX tiene un sub-check con `warning` de "costo igual a precio", pero solo si Tomy lo corre) | Rentabilidad en cero, presentada como dato | `credential-tests.ts:8-14` · `post-backfill-finalize/route.ts:89-93` |
| 13 | **Un email transaccional falla** (activación / backfill / data lista) | `.catch(err => console.error(...))` en los tres | **NO** | **Nunca recibe su password temporal.** Mitigación parcial: vuelve en `_adminNote` de la respuesta, pero solo si Tomy la mira en ese momento | `activate/route.ts:176-180, 189-193` · `approve-backfill/route.ts:168-175` |
| 14 | **El cliente abandona el wizard** | Queda en `IN_PROGRESS` | **SÍ** — a las 72h, mail a **una** casilla personal hardcodeada | Nada; el estado se restaura desde `sessionStorage` | `checks.ts:165-171` · `OnboardingOverlay.tsx:594` · M-1 |

**Sobre el caso Arredo específicamente:** su causa raíz directa (`historyVtexMonths` sin cargar) hoy está mitigada — el wizard viene con **12 meses por default** (`OnboardingOverlay.tsx:521`) y `clampMonths` cae a 12 si no llega el campo (`submit-wizard:270-277`). Pero eso solo cierra **uno** de los tres caminos: los caminos 3 y 4 de esta tabla llegan al mismo resultado (historia incompleta, P&L en cero) y **siguen abiertos**, y sobre todo la **invisibilidad** —fila 2— sigue intacta. Si vuelve a pasar, se vuelve a descubrir igual: porque el cliente pregunta.

---

## 4. Verificación: ¿existe un semáforo de "este cliente está listo"?

**No.** Lo que hay:

| Pieza | Qué mide | ¿Sirve como semáforo de onboarding? |
|---|---|---|
| `checkStuckOnboardings` (`checks.ts:165`) | Postulaciones con >72h en 3 de los 6 estados | **No** — le faltan justo los dos estados donde un onboarding se traba |
| `checkConnectionIssues` (`checks.ts:63`) | Salud de conexiones, leyendo `lastSuccessfulSyncAt` | **No** — ese campo se escribe incondicionalmente aunque todo falle (C-4) |
| `/api/nitropixel/install-status` | ¿Hay ≥1 evento del pixel? | **Sí, como insumo.** Es la señal binaria correcta y es barata (`findFirst`, no `COUNT(*)`) |
| `testCredentialsByPlatform` + `testNitroPixel` (`credential-tests.ts`, 1.054 líneas) | 6 plataformas, con sub-checks por área en VTEX | **Sí, como insumo** — pero solo corre si un humano aprieta un botón |
| **NitroScore** (`/api/nitropixel/data-quality-score`) | Calidad del **pixel** ya instalado | **No sirve como semáforo de onboarding** (ver abajo) |

### Por qué el NitroScore no es el semáforo (aunque sea tentador)

Mide otra cosa y en el peor momento:

1. **Mide calidad del pixel, no completitud del onboarding.** Sus 5 palancas (cobertura de clicks, riqueza de identidad, match de CAPI, frescura de señales, confiabilidad de webhook) no dicen nada sobre si el backfill de órdenes corrió, si el `costPrice` está poblado, si el Orders Broadcaster quedó configurado o si el afiliado emite.
2. **En el día 1 devuelve `null` por diseño.** Con `MIN_SAMPLES` de 20 page views, 10 visitantes con email, 5 PURCHASE, 10 touchpoints y 5 órdenes (`data-quality-score/route.ts:45-51`), un cliente chico tiene **todas** las palancas en `collecting` → *"Recopilando datos"*. Justo en el momento en que necesitás decidir si activarlo.
3. **Está deliberadamente cerrado al cliente** y esa decisión está bien argumentada (`docs/nitropixel-score-rollout.md:9-27`). No hay que tocarla.

**Lo que falta construir es un `checkOnboardingReadiness(orgId)`** que combine señales que ya existen por separado, y que devuelva verde/amarillo/rojo con el detalle de qué falta:

- ≥1 `Connection` en `ACTIVE` por cada plataforma marcada "uso" en el wizard
- resultado de `testCredentialsByPlatform` en verde, corrido automáticamente (no a demanda)
- ≥1 `pixel_event` de la org (`install-status` ya lo resuelve)
- `GET /api/orders/hook/config` de VTEX devuelve un hook con `?org=<orgId>` correcto — **los dos** mecanismos
- `backfill_jobs` en `COMPLETED` con `processedCount > 0` y `lastError` nulo
- `post-backfill-finalize` efectivamente corrió → `Product.costPrice` poblado en >X% del catálogo
- rollups del pixel con ≥1 día cubierto para la org
- % de tráfico en `sin_clasificar` por debajo de un umbral

Ninguna de estas señales es nueva. Lo que no existe es el objeto que las junta, la corrida automática, y el mail cuando alguna está en rojo.

---

## 5. Los primeros 30 días de un cliente chico

### Qué funciona el día 1 (más de lo que uno esperaría)

**Porque el backfill trae historia real**, un cliente que activa con 12 meses de VTEX arranca con dashboard de ventas, órdenes, productos y clientes con historia completa. El motor de LTV **no** exige compras repetidas propias: para clientes con 1 sola orden o con menos de 30 días de historia usa el *repeat rate* del segmento como fallback y baja el `confidence score` (`src/lib/ltv/prediction-engine.ts:15, 186-212, 316`). O sea: el backfill no es un adorno, es **lo que hace que el producto sirva desde el minuto cero**. Es exactamente por eso que saltearlo (caso Arredo) es tan caro.

Y el P&L funciona **solo si** `post-backfill-finalize` corrió y la tienda tiene costos cargados. Son dos condiciones que hoy nadie verifica (§3, filas 3 y 12).

### Qué NO funciona hasta semanas después

Todo lo que depende del pixel, que solo acumula hacia adelante:

| Capacidad | Cuándo empieza a servir |
|---|---|
| Analytics propias (`/pixel/analytics`) | días |
| Atribución multi-touch | necesita volumen de touchpoints + órdenes atribuidas |
| Breakdown por canal | tras la primera corrida de `first-source` (~1h) **y** el mapeo manual de sus códigos propios (paso 17) |
| Meta CAPI match quality | 5 PURCHASE |
| NitroScore completo | 5 palancas con sample; en una tienda chica, **semanas** |

### Qué ve mientras tanto — y acá está el problema

`review-diseno.md:93`, sobre el dashboard principal:

> *Un cliente recién onboardeado, con 0 pedidos: **grilla de rectángulos grises brillando para siempre.***

`dash-skeleton` (`src/components/dashboard/DashboardStyles.tsx:371-381`) es un shimmer **infinito**, sin estado terminal. Tres situaciones distintas producen la misma pantalla: sin datos, error de API, y período sin ventas. No hay copy, ni ícono, ni botón de reintentar. Y `/nitropixel` presenta ceros de error como si fueran el dato real (`review-diseno.md` C-4, `nitropixel/page.tsx:100-106`).

La capacidad existe y está bien hecha en otro lado: `pixel/analytics/page.tsx:889` hace exactamente lo correcto. No se aplicó en la pantalla principal.

**El momento de mayor curiosidad del cliente — el primer login después del mail "tu data está lista" — coincide con la pantalla más ambigua del producto.** Ese es el riesgo de churn del mes 1, y no se arregla con más features: se arregla con un estado vacío honesto.

### Lo que el roadmap ya diseñó y no está construido

`ONBOARDING_ROADMAP.md` § Fase 2 tiene exactamente los antídotos, aprobados por Tomy y sin ejecutar: checklist post-unlock (2.1), carrusel durante el backfill (2.2), email "tu data está lista" con contenido real (2.3), y 3 insights de Aurum precalculados para el primer login (2.4). La Fase 0 (Aurum Onboarding Assistant) **sí está implementada**: `OnboardingAurumChat.tsx`, `/api/onboarding/aurum-assist`, tabla `onboarding_aurum_conversations`.

---

## 6. La brecha hasta self-serve, pieza por pieza

| Lo que hoy hace un humano | ¿La pieza existe? | Qué falta construir |
|---|---|---|
| **Aprobar la cuenta / crear org + user** | ✅ `activate/route.ts` es transaccional, valida y manda email | El disparo automático, y resolver las colisiones de email/slug sin humano (hoy son 409 que alguien destraba) |
| **Cargar credenciales de VTEX de forma segura** | ⚠️ parcial: `lib/crypto` (`decryptCredentials`, `isEncrypted`) existe y el wizard sanitiza caracteres invisibles (`submit-wizard:37-52`) | El wizard guarda en `Connection.credentials` como JSON; uniformar el cifrado en reposo. Y **arreglar C-7** (credenciales VTEX en globals de módulo) antes de permitir cualquier backfill concurrente |
| **Validar credenciales antes de seguir** | ✅ **existe entera y está apagada para el cliente** — `lib/onboarding/credential-tests.ts`, 1.054 líneas, 6 plataformas, sub-checks por área. `/api/onboarding/test-credentials` existe. Es la pieza grande ya construida | Exponerla en el wizard con copy no-alarmante y bloquear el submit hasta verde. Es la Fase 1.1 del roadmap, **ya aprobada por Tomy**. Cuidado: `credential-tests.ts:218-220` tiene 3 `Promise.all` anidados sin límite → rate-limit de VTEX (M-12) |
| **Configurar el Orders Broadcaster** (webhook 2 de 2) | ✅ **ya es automático** (`activate-client:88-114`), + herramienta manual en `/api/admin/vtex-configure-broadcaster` | Correrlo **al aprobar el backfill**, no al final; verificar con un `GET` después; persistir el resultado en DB; **bloquear la activación si falló**; y arreglar el dominio hardcodeado `nitrosales.vercel.app` |
| **Configurar el Afiliado VTEX** (webhook 1 de 2) | ⚠️ solo instrucciones (`VtexAffiliateInstructions.tsx`, ya integrado en el wizard) | No es automatizable — es UI-only en VTEX. Lo que sí se puede: un **verificador** que confirme que llegó al menos un evento de afiliado, y un semáforo en el wizard |
| **Verificar que el pixel quedó instalado** | ✅ `install-status` + `testNitroPixel` | Reemplazar el checkbox autodeclarado por un **poller en vivo** ("esperando el primer ping… ✅ recibido de tutienda.com"). Y que `submit-wizard` **lea** `pixelInstalled` en vez de descartarlo |
| **Disparar y monitorear el propio backfill** | ✅ `approve-backfill` + `/backfill-status` + progreso por job en el overlay (`state/route.ts:110-133`) | Que el disparo no dependa del click de Tomy: gate automático = tests en verde + ping del pixel + webhooks OK. Y que un job trabado alerte |
| **Habilitar el cliente** (`READY_FOR_REVIEW` → `ACTIVE`) | ✅ `activate-client` | Que la decisión la tome `checkOnboardingReadiness()` en vez de un ojo humano |
| **Semáforo "está listo"** | ❌ **no existe** (el NitroScore no sirve, §4) | Construir `checkOnboardingReadiness(orgId)` juntando señales que ya existen; sumarlo a `checks.ts` y a `control-alerts` |
| **Resolver errores sin soporte humano** | ✅ Aurum Onboarding ya implementado | Darle acceso al resultado de los tests de credenciales para que diagnostique de verdad, no solo oriente |
| **Mapear los canales del cliente** | ⚠️ UI existe (`/pixel/canales`), el conocimiento no | Un flujo que le muestre al **cliente** sus códigos sin clasificar y le pida mapearlos — hoy la pregunta va de Axel a Tomy al cliente y vuelve |

---

## 7. Multiplataforma: qué sobrevive si el próximo cliente no es VTEX

**Sirve tal cual (~70% del flujo):** el form público, la máquina de estados `PENDING → IN_PROGRESS → NEEDS_INFO → BACKFILLING → READY_FOR_REVIEW → ACTIVE`, la creación de org/user/emails, el `OnboardingGate`/overlay (la UI **ya está diseñada agnóstica**: la plataforma se llama "Plataforma Ecommerce", con `ECOMMERCE_PROVIDERS` listando Tiendanube, Shopify, Woo y Magento — `OnboardingOverlay.tsx:404-407, 484-490`), el NitroPixel entero, Meta/Google/GSC, el motor de backfill (`backfill_jobs` tiene `platform` como campo, el runner es genérico), la capa silver/gold, LTV, alertas y Aurum.

**No sirve (~30%, todo VTEX-específico):**
- `testVtex` (1 de los 6 tests) — `credential-tests.ts:33-455`
- `lib/backfill/processors/vtex-processor.ts` y `getVtexConfig`
- los **dos** mecanismos de webhook: cada plataforma tiene el suyo (Shopify: OAuth app + webhooks; Tiendanube: OAuth + webhooks; Woo: REST keys) `[NO VERIFICADO — no hay código de esas plataformas en el repo]`
- `sync/vtex/catalog-refresh` → `costPrice`
- el flujo del afiliado

**Costo concreto de sumar una plataforma:** `VALID_PLATFORMS` es un `Set` de 4 strings (`submit-wizard:28`) y `Platform` es un enum de Prisma (`schema.prisma:169`). Sumar Shopify toca: enum + migración, un processor de backfill, un test de credenciales, un receptor de webhook, un catalog-refresh y un `getXConfig`. Estimo **3–5 semanas de dev por plataforma** `[ESTIMACIÓN]` — más que todo el resto del onboarding junto.

**Un agujero que hay que conocer antes de decidir:** hoy, si el cliente elige un provider ≠ `vtex` en el wizard, el submit **lo acepta** y crea una `Connection` de plataforma `VTEX` con `provider:"tiendanube"` y sin credenciales — se valida solo el campo `provider` (`submit-wizard:286-305`, `calcCompletion` en `OnboardingOverlay.tsx:508-511`). Es decir: **hoy puede entrar al producto una cuenta que nunca va a recibir una sola orden, y nada avisa.** Estaba pensado como "captura de interés", pero el flujo no lo distingue de un cliente real.

---

## 8. Las 5 cosas que más bajan el costo por cliente

Ordenadas por horas ahorradas ÷ esfuerzo.

### 1. Exponer el test de credenciales en el wizard y bloquear el submit hasta que pase
**La pieza ya está escrita** (`credential-tests.ts`, 1.054 líneas, 6 plataformas). Es la Fase 1.1 del `ONBOARDING_ROADMAP.md:149-157`, ya aprobada por Tomy. Hoy la corrección de credenciales es un ciclo humano de días: Tomy prueba → escribe al cliente → el cliente corrige → Tomy vuelve a probar. Con el test en vivo, el cliente lo resuelve en el momento.
**Ahorro:** 1–3 h de Axel/Tomy por cliente, y días de calendario. **Ojo con M-12** (los `Promise.all` anidados de `credential-tests.ts:218-220` pueden hacer rate-limit a VTEX y mostrarle al cliente "credenciales inválidas" cuando están bien).

### 2. Verificación real del pixel en vez del checkbox autodeclarado
Un poller a `install-status` en el paso de NitroPixel: *"esperando el primer ping…"* → *"✅ recibido de tutienda.com hace 4 segundos"*. Y que `submit-wizard` deje de descartar `pixelInstalled` (`OnboardingOverlay.tsx:665` → `submit-wizard:28`).
**Ahorro:** mata la falla más silenciosa y la más cara de descubrir tarde, y cumple una promesa que la UI ya le hace al cliente hoy.

### 3. `checkOnboardingReadiness()` + incluir `BACKFILLING` y `READY_FOR_REVIEW` en `checkStuckOnboardings`
La segunda mitad es **una línea** (`checks.ts:171`) y es el R-C15 del `PLAN_REMEDIACION.md:701`. La primera es el semáforo de §4. Juntas convierten "nadie se enteró por semanas" en "un mail a las 6 horas".
**Ahorro:** elimina la cola gorda de la distribución de horas — que es lo que realmente limita a 2–3 clientes/mes.

### 4. Arreglar la cadena de finalización del backfill
Tres cambios chicos: (a) `waitUntil` en el `fetch` de `backfill-runner:147` — el mismo archivo ya lo usa bien en otros lados, es un olvido; (b) agendar `post-backfill-finalize` en `vercel.json` como red de seguridad; (c) no pasar a `READY_FOR_REVIEW` sin verificar que `costPrice` quedó poblado.
**Ahorro:** ~20 líneas y evita el escenario "el cliente ve ventas pero todo su P&L en cero", que es indistinguible de un bug del producto.

### 5. Estados vacíos honestos en `/dashboard`
Reemplazar el `dash-skeleton` infinito por "todavía no hay datos acá" / "no pudimos cargar esto — reintentar". El patrón correcto ya existe en `pixel/analytics/page.tsx:889`.
**No baja horas de Axel; baja churn del mes 1**, que es el otro costo por cliente y el que no se ve en ninguna planilla.

---

### Bonus (barato y no está en el top 5)
Mover la configuración del Orders Broadcaster de `activate-client` a `approve-backfill`, verificarla con un `GET` posterior, persistir el resultado, y arreglar el `https://nitrosales.vercel.app` hardcodeado de `activate-client:86`. Hoy el webhook de órdenes se configura **al final**, fail-open, contra el dominio viejo, y su resultado se pierde en cuanto Tomy cierra el drawer.

---

## Anexo — archivos clave

| Archivo | Rol |
|---|---|
| `src/app/api/public/onboarding/start/route.ts` | Form público → `onboarding_requests` PENDING |
| `src/app/api/admin/onboardings/[id]/activate/route.ts` | Aprobación 1: crea org + user + email |
| `src/components/OnboardingGate.tsx` · `src/components/OnboardingOverlay.tsx` (2.413 líneas) | El wizard que ve el cliente |
| `src/app/api/me/onboarding/state/route.ts` | Decide `locked`/`phase` contra la realidad, no contra el status |
| `src/app/api/me/onboarding/submit-wizard/route.ts` | Guarda credenciales, rangos, avisa a Tomy |
| `src/lib/onboarding/credential-tests.ts` | 6 tests de plataforma — la pieza clave para self-serve, hoy solo admin |
| `src/app/api/admin/onboardings/[id]/approve-backfill/route.ts` | Aprobación 2: crea los jobs (C-10) |
| `src/app/api/cron/backfill-runner/route.ts` · `post-backfill-finalize/route.ts` | Procesamiento y cierre |
| `src/app/api/admin/onboardings/[id]/activate-client/route.ts` | Habilitación final + Orders Broadcaster |
| `src/lib/control/checks.ts` | Los 3 health-checks del Centro de Control |
| `src/app/api/nitropixel/install-status/route.ts` · `data-quality-score/route.ts` | Insumos del semáforo que falta |
| `src/components/control/OnboardingDetailDrawer.tsx` (1.844 líneas) | La cabina de Tomy |
