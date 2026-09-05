# NitroSales — Operación y economía unitaria de cara a la expansión

**Commit analizado:** `9ad4616d` (= `origin/main` = producción).
**Método:** solo lectura del árbol de trabajo. No se ejecutó nada contra producción, ni DB, ni endpoints, ni crons. Toda cifra de dinero está marcada **ESTIMADO** con el razonamiento a la vista.
**Pregunta:** con 20 clientes en vez de 4 — ¿cómo se entera el equipo de que algo se rompió, cuánto cuesta atenderlos, y qué herramientas faltan?

---

## 1. Veredicto en cinco líneas

1. **El sistema no tiene detección; tiene un panel que alguien tiene que abrir.** El único canal que *empuja* una alerta es un mail a `tlapidus@99media.com.ar` (literal hardcodeado en 7 archivos) que dispara 4 veces por día, y los checks que alimenta son ciegos por construcción: `markSyncSuccess` se llama incondicionalmente, así que una conexión VTEX rota **no puede** salir en rojo.
2. **La detección real, históricamente, la hace el cliente.** Los incidentes documentados en el propio repo dan tiempos de detección de **5 días**, **5 semanas**, **~22 horas** y **"meses"** — y en los tres primeros el que avisó fue el cliente, no el sistema.
3. **Los umbrales están escritos para 4 clientes y no escalan: son globales, no por-cliente.** `checkPipelineFreshness` hace `MAX(col) FROM tabla` **sin filtrar por org**: con 20 clientes, si 19 refrescan bien y uno queda congelado, el chequeo da verde. Es un falso negativo que se vuelve más probable con cada cliente nuevo.
4. **Onboardear y operar un cliente es hoy trabajo manual de Axel, no un flujo de producto.** Hay 36 endpoints `admin/migrate-*` sin registro de cuáles corrieron, 27 endpoints `debug-*` vivos, tres archivos `.sql` escritos a mano *uno por cliente* en la raíz del repo, y un paso crítico de VTEX (registrar el afiliado) que sólo Tomy sabe hacer y que ya rompió a un cliente entero.
5. **No hay economía unitaria porque no hay instrumentación de costo ni facturación.** `Organization.plan` existe como enum decorativo (`STARTER|GROWTH|PRO`) sin un solo punto de enforcement; no hay suscripciones, límites, ni cuotas; `aurum_usage_logs` registra tokens pero **no dólares**; y no existe retención, exportación ni borrado completo de datos personales — el `wipe-account` deja las capas Silver/Gold y el `email_log` intactos.

**Traducción al negocio:** hoy el costo marginal de infraestructura de un cliente chico es despreciable (**~USD 5-15/mes ESTIMADO**) y el de un cliente grande es moderado (**~USD 80-200/mes ESTIMADO**). El costo real está en horas de Axel, y ése **no baja** con cada cliente nuevo: sube casi lineal. El techo de expansión no es la infraestructura, es que **un solo humano tiene que enterarse, diagnosticar y arreglar, a mano, cosas que el sistema no reporta**.

---

## 2. Tabla de detección — qué existe hoy

### 2.a — Los mecanismos que *empujan* (alguien se entera sin abrir nada)

| # | Mecanismo | Qué detecta | Umbral | A quién avisa | Cada cuánto | Qué NO detecta |
|---|---|---|---|---|---|---|
| 1 | `cron/control-alerts` → `checkConnectionIssues` (`src/lib/control/checks.ts:66`) | Conexión en `status=ERROR`; sync viejo | VTEX/MELI 1440 min (24h), warn; 2880 min (48h), error. GA4/GSC 2160 min | Mail a **`tlapidus@99media.com.ar`** (literal, `cron/control-alerts/route.ts:31`) | `0 */6 * * *` — 4×/día | **Un sync de VTEX roto.** `/api/sync/chain` corre cada 2h y llama `markSyncSuccess` incondicionalmente (`src/app/api/sync/route.ts:83`, `sync/chain/route.ts:95`), que escribe `lastSuccessfulSyncAt = now` y `lastSyncError = null` (`src/lib/sync-tracker.ts:19-22`). El umbral de 24h **nunca puede cruzarse**. El check lee justo ese campo (`checks.ts:76-80`). Ciego por diseño |
| 2 | ídem → `checkStuckOnboardings` (`checks.ts:157`) | Onboarding trabado >72h | 72h, estados `PENDING`, `NEEDS_INFO`, `IN_PROGRESS` | ídem | ídem | **El estado `BACKFILLING` no está en el `WHERE`** (`checks.ts:171`). Y `approve-backfill` pone `BACKFILLING` incondicionalmente aunque cree 0 jobs. Un onboarding que se traba ahí es invisible para siempre — es literalmente el caso Arredo |
| 3 | ídem → `checkInactiveClients` (`checks.ts:186`) | Org sin login >14d **y** sin orden >14d | 14 días, ambas condiciones a la vez | ídem | ídem | Un cliente que loguea pero cuyos datos están mal. Y es un N+1: `for (const org of orgs)` con 2 queries por iteración, dentro de `maxDuration=60`. 4 orgs = 8 queries; 20 orgs = 40 |
| 4 | `cron/warm-cache` → `checkPipelineFreshness` (`src/lib/pipeline/freshness.ts:47-77`) | 15 tablas Silver/Gold/pixel sin refrescar | Silver 3h, Gold 6h, pixel 8h | Mail a **`tlapidus@99media.com.ar`** (`warm-cache/route.ts:52`), cooldown 6h **en memoria de proceso** (`:57`) | `*/5 * * * *` + 1 hit de GitHub Actions cada 15 min | **Que la tabla esté fresca para 19 clientes y congelada para 1.** La query es `SELECT MAX("${t.column}") ... FROM ${t.table}` (`freshness.ts:100-104`) — **sin `WHERE organizationId`**. Con más orgs, la probabilidad de falso negativo crece monótonamente |
| 5 | `cron/refresh-pixel-rollups` — alerta de incoherencia (`route.ts:67`) | Incoherencia de rollups | — | Mail a **`tlapidus@99media.com.ar`** | `3,18,33,48 * * * *` | — |
| 6 | `cron/digest` | Digest semanal al **cliente** | — | El cliente | `0 10 * * 1` | Se autentica contra `SYNC_KEY`, un secreto **distinto** del literal que va en la URL del cron. Si no coinciden, el cliente deja de recibirlo y nadie se entera (C-2 de `review-flujos.md`) |
| 7 | `cron/anomalies` | Anomalías de negocio | — | — | `0 9 * * *` | ídem: auth contra `SYNC_KEY` |
| 8 | Mails de frescura al cliente (los que motivaron el workflow de GH Actions) | Rollups atrasados | — | El cliente | — | Que el cliente reciba una alerta de infraestructura es la señal de que la detección interna llegó tarde |

**Total de destinatarios humanos distintos de una alerta de sistema: uno.** Y `ERRORES_CLAUDE_NO_REPETIR.md` documenta problemas de entregabilidad del dominio (`#S55BIS3-NO-REPLY-SPAM`, y el caso de Resend fallando silencioso desde dominio no verificado, línea 1361). Si esa casilla marca los mails como spam, **el sistema pierde su único sentido de la vista** y no queda nada.

### 2.b — Los mecanismos que hay que ir a *mirar* (nadie avisa)

| Pantalla | Qué muestra | Quién la abre | Push |
|---|---|---|---|
| `/admin/alertas` (`src/app/api/admin/alertas/route.ts`) | Las **4 mejores señales del repo**: pixel muerto >24h habiendo tenido eventos (CRITICAL), pixel nunca instalado (SETUP), <10% de visitantes identificados en 7d (LOW_IDENTITY), tráfico con 0 PURCHASE en 7d = webhook roto (NO_PURCHASES) | Un humano, a mano | **Ninguno.** Verificado: `/api/admin/alertas` no aparece en `vercel.json`, ni en `.github/workflows/`, ni en ningún cron. Es una página que hay que acordarse de abrir |
| `/control/clientes` → `/api/control/clients-health` | Semáforo por cliente y por conexión | Un humano | Ninguno. Además arrastra el mismo sesgo del punto 1: clasifica sobre `lastSuccessfulSyncAt` |
| `/control/pipeline` | Leads y pipeline comercial | Un humano | Ninguno |
| `/admin/usage` | Telemetría de Aurum: queries, tokens, latencias p50/p95, top orgs | Un humano | Ninguno. **Y no muestra dólares** (ver §5) |
| `/control/emails`, `/admin/email-log` | Historial de envíos | Un humano | Ninguno |
| Logs de Vercel | 519 `console.error` | Un humano | Ninguno |

### 2.c — Lo que directamente no tiene ningún mecanismo

- **Telemetría.** Cero Sentry / Datadog / OpenTelemetry / logtail (grep sobre `src/` y `package.json`). No es un olvido: `CLAUDE_STATE.md:6455` documenta que **se probó Sentry y se sacó porque agregaba 15-25 s al cold start**. Es una decisión vieja que nunca se revisitó, y hoy es el habilitador de todos los demás hallazgos.
- **Que un cron deje de estar agendado.** El comentario de `freshness.ts:15-19` lo dice mejor que yo: *"el patrón del fallo no es 'el cron explota' —eso se ve en los logs— sino 'el cron deja de existir'"*. No hay ningún check que compare el inventario de `vercel.json` contra los crons esperados.
- **Que un webhook de VTEX falle.** `webhooks/vtex/orders/route.ts:794` devuelve HTTP 200 en el `catch` → VTEX no reintenta → la orden se pierde para siempre, sin traza.
- **Que el motor de alertas del cliente esté caído.** `src/lib/alerts/engine.ts:54` y `:264` tienen `catch { return []; }` sin log → el cron de cada 15 min reporta `{ok:true, rulesEvaluated:0, alertsFired:0}` 96 veces por día. La ausencia de alertas se lee como "no hay problemas".
- **Que el pixel de un cliente esté roto.** Existe el check (`/api/admin/alertas`, categoría CRITICAL) pero nadie lo dispara.
- **Costo por cliente.** No hay ninguna métrica de consumo por org, en ninguna unidad monetaria.

---

## 3. Tiempo real de detección — lo que dicen los incidentes históricos

Estos números salen de comentarios en el propio código y de los archivos de memoria. Son el mejor predictor disponible de qué va a pasar con 20 clientes.

| Incidente | Fuente | Qué se rompió | Tiempo hasta que alguien se enteró | Quién avisó |
|---|---|---|---|---|
| Rollup de pixel caído | `src/app/api/cron/warm-cache/route.ts:43-45` — *"pasó del 16 al 21-jun: 5 días con los gráficos del pixel en 0 y nadie se enteró hasta que se quejó el cliente"* | `refresh-pixel-rollups` dejó de dispararse en Vercel | **5 días** | **El cliente** |
| `refresh-pixel-first-source` desagendado | `src/lib/pipeline/freshness.ts:11-14` y `cron/refresh-pixel-first-source/route.ts:33-37` — removido de `vercel.json` el 14-jun, repuesto el 21-jul | La dimensión de first-touch quedó congelada; `metrics/pixel` perdió del breakdown por canal a **todo visitante nuevo** | **5 semanas** | Nadie — se descubrió de casualidad durante otra auditoría |
| Vercel deja de disparar `refresh-pixel-rollups` (2º episodio) | `.github/workflows/keep-pixel-rollups-fresh.yml:3-8` — *"dejando las 7 tablas del pixel stale ~22h → mails de frescura al cliente"* | ídem | **~22 h**, y el canal de aviso fue **un mail automático al cliente** | El sistema, pero avisándole al cliente |
| Onboarding de Arredo sin backfill de órdenes | `ERRORES_CLAUDE_NO_REPETIR.md:11-20` + `CLAUDE_STATE.md:41-48` | Nunca se corrió el backfill histórico: el cliente tenía 310 órdenes en vez de 252.701 | Desconocido, pero al menos desde el onboarding hasta el reclamo | **El cliente**: *"todos los gráficos muestran 3 días"* |
| TeVeCompras sin afiliado VTEX | `ERRORES_CLAUDE_NO_REPETIR.md:2662-2670` | 0 de 8 órdenes web atribuidas; VTEX nunca mandó un webhook | Hasta que alguien miró los números | Interno, por casualidad |
| Schedules de alertas disparando en cada carga de `/alertas` | `ERRORES_CLAUDE_NO_REPETIR.md:1563` | Alertas duplicadas al cliente desde S50 | **Desde S50 hasta S51**, y se encontró leyendo el código para otra cosa, no por QA | Nadie |
| Cron `/api/sync` que nunca paginaba | `ERRORES_CLAUDE_NO_REPETIR.md:695` | Órdenes >100 por rango **perdidas silenciosamente** | *"Bug pasivo durante MESES sin detectar"* (`:1057`) | Nadie |
| Tres bloques de código idénticos en prod | `ERRORES_CLAUDE_NO_REPETIR.md:560` | — | *"durante meses"* | Nadie |

**Conclusión, y es dura:** en 6 de 8 incidentes documentados el mecanismo de detección fue *un humano mirando algo por otro motivo*, o *el cliente quejándose*. El tiempo medio de detección observado se mide en **días a semanas**, no en minutos.

**Por qué esto empeora, no mejora, con 20 clientes:**

1. **Los checks son globales, no por-cliente.** `checkPipelineFreshness` mira `MAX()` sobre toda la tabla. Con 4 clientes, si uno se rompe hay 25% de chance de que sea el más reciente y la señal aparezca. Con 20, es 5%. La detección se diluye exactamente en proporción al crecimiento.
2. **La cobertura del warm-cache colapsa.** `warm-cache` recorre `org → rango → endpoint` = 4 rangos × 2 endpoints = **8 fetches por org**, secuencial, con `PER_FETCH_TIMEOUT_MS = 20_000` y `TIME_BUDGET_MS = 220_000` (`route.ts:244-247`). Eso son **~11 fetches por corrida como techo duro**. Con 4 orgs ya se necesitan 32 → hoy **ya está truncado**. Con 20 orgs se necesitan 160 y entran 11: **el 93% de los clientes nunca se calienta**. Peor: el loop no tiene `ORDER BY` (`route.ts:200-210`), así que no rota — los mismos primeros clientes se llevan todo el presupuesto y los últimos nunca. Es un mecanismo que se degrada en silencio con cada alta.
3. **La única casilla de correo no escala.** 4 clientes generan pocos falsos positivos. 20 generan 5× más ruido en la misma casilla, con cooldowns que no funcionan (`M-2`: `let lastRollupAlertSent = 0` a nivel de módulo, inútil en serverless). El resultado documentado es predecible: se aprende a ignorar la alerta.
4. **El check de inactivos es N+1.** `checkInactiveClients` corre 2 queries por org dentro de `maxDuration = 60`. A 20 orgs son 40 queries secuenciales contra un pool de 24; a 40 orgs, 80. En algún punto el cron de salud se muere por timeout — y su falla se vería como *nada*.

---

## 4. Operaciones que hoy requieren intervención técnica manual

Cada fila es una tarea que hoy hace Axel a mano y que, multiplicada por 20 clientes, no cierra.

| Operación | Cómo se hace hoy | Evidencia | Frecuencia | Por qué no escala |
|---|---|---|---|---|
| **Registrar el afiliado VTEX del cliente** | Tomy entra al admin de VTEX del cliente y lo configura a mano | `ERRORES_CLAUDE_NO_REPETIR.md:2662-2670` — *"cada cliente nuevo es una bomba de tiempo silenciosa"* | 1 × cliente | Conocimiento implícito del fundador. Sin esto **no llega ni un webhook**. Ya rompió a TeVeCompras entero |
| **Correr el backfill histórico de órdenes** | Crear el job a mano con los meses correctos; si `historyVtexMonths=0` el endpoint devuelve `ok:true` con **0 jobs** | `admin/onboardings/[id]/approve-backfill/route.ts:110-159,205`; `CLAUDE_STATE.md:41-48` | 1 × cliente | Falla en silencio, marca `BACKFILLING`, manda el mail "empezamos", y el check de onboardings trabados no mira ese estado |
| **Correr `firstSourceForOrg` para el cliente nuevo** | `tsx` contra la DB de producción | `CLAUDE_STATE.md:~105` — *"corri `firstSourceForOrg(Arredo)` (1,21M visitantes, ~16 min) ... directo con `runRollupBackfill`/`backfillDayOrg` via tsx contra prod. ⚠️ Neon se degradó/cayó repetidas veces"* | 1 × cliente grande | Es una operación de horas que tumba la DB de **todos** los demás clientes mientras corre |
| **Seedear canales / clasificar sources** | Ejecutar `canales-seeds-prod.local.sql` a mano en la consola de Neon | `canales-seeds-prod.local.sql` (raíz, gitignoreado) | 1 × cliente | Archivo no versionado |
| **Backfill de atribución por org** | **Un archivo `.sql` distinto por cliente**, con el `organizationId` hardcodeado | `backfill-1-cmod6ns.local.sql:119`, `backfill-2-emdj.local.sql`, `backfill-3-cmohl80fx.local.sql` — mismo SQL de 250 líneas, cambia sólo el cuid | 1 × cliente, y ad-hoc cuando algo se desvía | Es la firma más nítida del problema: **hay literalmente un archivo por cliente en la raíz del repo**, y ninguno está versionado (`.gitignore:18` — `*.local.sql`) |
| **Aplicar migraciones de schema** | Pegarle a uno de **36 endpoints `admin/migrate-*`** | `ls src/app/api/admin/migrate-*` = 36 | Cada cambio de schema | **No hay registro de cuáles se ejecutaron.** `CLAUDE.md` documenta 3 de 36. El estado vive en la memoria de quien los corrió |
| **Crear los rollups del pixel de un cliente** | `admin/setup-pixel-rollups` a mano | `BACKLOG_PENDIENTES.md:16-18` | 1 × cliente | — |
| **Crear/verificar índices** | `admin/ensure-indexes`, `admin/ensure-coherence-indexes`, `admin/create-attribution-iphash-index` | 3 endpoints admin | Ad-hoc | 13 de ~17 índices reales **no están en `schema.prisma`** (`review-performance.md` H5) |
| **Crear las tablas Gold/Silver** | Copiar y pegar SQL de un runbook en la consola de Neon | `docs/RUNBOOK-GOLD-ATTRIBUTION.md:3` — *"**Correr en Neon (prod), en este orden.**"* × 6 runbooks | 1 × despliegue de capa | DDL a mano en producción |
| **Diagnosticar por qué un cliente ve números raros** | Elegir entre **27 endpoints `debug-*`** y correrlos con la admin key | `ls -d src/app/api/admin/debug-*` = 27 | Cada incidente | Es un toolkit de dev, no una herramienta de soporte. Requiere saber cuál usar |
| **Reparar datos** (marketplaces mal marcados, atribuciones huérfanas, costos faltantes, emails de VTEX, campañas de touchpoints…) | ~20 endpoints admin de reparación: `backfill-orderitem-costs`, `cleanup-orphan-attributions`, `repair-marketplace-flag`, `replay-attribution`, `reextract-touchpoint-campaigns`, `vtex-recover-customer-emails`, `recompute-customer-aggregates`, … | listado en §Anexo | Ad-hoc | Cada uno requiere que alguien sepa que hace falta correrlo |
| **Correr cualquier SQL contra producción** | A mano, en la consola de Neon | `PROJECT-HANDOFF.local.md:12` — *"La DB de prod NO se toca desde acá. El usuario corre TODO el SQL en la consola de Neon"* (y menciona que una vez se filtró un `DATABASE_URL` y hubo que rotar la password de `neondb_owner`) | Constante | Un humano con acceso total, sin audit trail, sin dry-run |
| **Resetear la contraseña de un usuario** | `/control/clientes` → `admin/users/[id]/reset-password` | `src/app/control/clientes/page.tsx:539` | — | ✅ Esto **sí** está en la UI |
| **Borrar una cuenta** | `/control/cuentas` → `admin/orgs/[orgId]/wipe-account` con `confirm: "WIPE-{orgId}"` | `src/app/control/cuentas/page.tsx:160` | — | ✅ Existe en la UI, ⚠️ pero está incompleto (ver §7) |

**Lo que el equipo *sí* puede hacer sin tocar código:** ver salud de clientes, ver alertas internas (abriendo la página), ver el pipeline de leads, gestionar plantillas de mail, ver el log de emails, aprobar/rechazar onboardings, impersonar (`view-as-org`), resetear contraseñas, gestionar overrides de secciones, borrar una cuenta. Es una base decente — el problema no es que no haya panel, es que **todo lo que ocurre después de la aprobación del onboarding vive fuera del panel**.

---

## 5. Modelo de costo por cliente

> **Nota metodológica.** No tengo acceso a las facturas de Neon, Vercel, Anthropic ni Resend, y el repo no las contiene. Los precios de lista que uso están marcados **ESTIMADO** y pueden estar desactualizados; lo que sí es evidencia dura es el **conteo de invocaciones, la cadencia de los crons y el volumen de datos**, que salen del repo. El razonamiento está expuesto para que se pueda corregir con la factura real en la mano.

### 5.a — Cifras de escala tomadas del repo (evidencia dura)

| Magnitud | Valor | Fuente |
|---|---|---|
| Clientes | 4 orgs | `CLAUDE_STATE.md` |
| Cliente grande (Arredo) | 24M `pixel_events` / **43 GB**, 1,3M eventos/semana, 1,2M visitantes, 252.701 órdenes | `CLAUDE_STATE.md`, citado en `review-performance.md:7` |
| Neon | Max **4 CU** (16 GB RAM), autosuspend 5 min. Working set medido ~28 GB vs cache 16 GB | `BACKLOG_PENDIENTES.md:49-53` |
| Vercel | Plan **Pro**, Fluid Compute ON, región `gru1` | `CLAUDE_STATE.md:4166,4926-4927`; `vercel.json:2` |
| Crons | 28 en `vercel.json` + 1 workflow de GitHub Actions | `vercel.json`, `.github/workflows/keep-pixel-rollups-fresh.yml` |
| API routes | 424 | `find src/app/api -name route.ts` |
| Pool de DB | 24 conexiones/instancia, `pool_timeout=160s`, `statement_timeout=150s` | `review-flujos.md` H-3 |

### 5.b — Invocaciones de Vercel: cuánto es fijo y cuánto es por cliente

**Carga de fondo (fija, no depende de la cantidad de clientes):**

| Cron | Cadencia | Invocaciones/día |
|---|---|---|
| `backfill-runner` | `* * * * *` | **1.440** |
| `warm-cache` | `*/5` (Vercel) + 1×/15 min (GH) | 384 |
| `refresh-pixel-rollups` | `3,18,33,48` (96) + **6 hits × 96 corridas de GH = 576** | **672** |
| gold ×3 (`15,45` / `20,50` / `25,55`) | | 144 |
| `alerts-scheduler` | `*/15` | 96 |
| `vtex-sync-recent`, `ml-missed-feeds`, `attribution-reconcile`, `refresh-silver-orders` | `*/30` c/u | 192 |
| `refresh-pixel-first-source` | `7,37` | 48 |
| `sync/chain` (×3 self-fetch c/u) | `30 */2` | 48 |
| `ml-reconcile`, `control-alerts`, y ~10 diarios/semanales/mensuales | | ~26 |
| **Subtotal crons** | | **~3.050/día ≈ 92.000/mes** |
| Self-fetches disparados por `warm-cache` (techo del presupuesto: ~11 por corrida) | | **~4.200/día ≈ 126.000/mes** |
| **TOTAL FIJO** | | **≈ 7.250/día ≈ 218.000/mes** |

Este número **no cambia** si hay 4 clientes o 20. Es el costo de tener el sistema encendido.

**Carga marginal por cliente:**

| Fuente | Cliente grande (Arredo) | Cliente chico (~5% del volumen) |
|---|---|---|
| Ingesta del pixel (`POST /api/pixel/event`, 1 invocación por evento) | 1,3M/semana → **~5,6M/mes** | **~280.000/mes** |
| Webhooks de VTEX (varios cambios de estado por orden) | ~350 órdenes/día × 3-5 estados → **~35.000/mes** ESTIMADO | ~2.000/mes ESTIMADO |
| Dashboard (5-8 endpoints por carga de página, `review-performance.md` H8) | ~10.000/mes ESTIMADO | ~3.000/mes ESTIMADO |
| `warm-cache` self-fetches | **0 marginal** — el presupuesto es fijo; lo que cambia es que a más clientes, **menos cobertura por cliente** | ídem |
| **Subtotal marginal** | **~5,6M invocaciones/mes** | **~285.000/mes** |

**Traducción a dinero (ESTIMADO, precios de lista públicos que no pude verificar):**
- Vercel Pro: ~USD 20/asiento/mes × 2 = **~USD 40/mes fijo**.
- Invocaciones más allá del incluido: del orden de **USD 0,60 por millón** → un cliente grande cuesta **~USD 3,4/mes en invocaciones**. Despreciable.
- Lo que sí pesa es la **duración de función**: con Fluid Compute se paga CPU activa + memoria aprovisionada. A ~0,1 s promedio por evento de pixel, 5,6M invocaciones ≈ 155 horas-función/mes ≈ **USD 20-40/mes ESTIMADO** para el cliente grande.

### 5.c — Neon: el costo dominante, y es casi todo fijo

**Almacenamiento.** 43 GB de los ~43 GB totales son de **un** cliente. A ~USD 0,35/GB-mes (ESTIMADO):
- Arredo: **~USD 15/mes**. Cliente chico (1-3 GB): **~USD 0,35-1/mes**.
- El almacenamiento es barato. **No es el problema.**

**Cómputo.** Acá está el dinero, y la conclusión es incómoda: **la base nunca se suspende**. El autosuspend es de 5 min, pero `backfill-runner` corre **cada minuto** y `warm-cache` cada 5. La DB está despierta 24/7 por construcción.
- A 4 CU máximos: entre **1.460 CU-hora/mes** (promedio 2 CU) y **2.920 CU-hora/mes** (fijado en 4).
- A ~USD 0,16/CU-hora (ESTIMADO): **USD 234 – 467/mes**.
- **De eso, casi nada es marginal por cliente.** `review-performance.md` C1 lo cuantifica: el pipeline de rollups consume *hasta 1.750 segundos de escaneo pesado sobre 43 GB dentro de cada ventana de 900 segundos* — o sea, **≥2 escaneos concurrentes de la tabla más grande, permanentemente, 24/7**. Ese gasto existe con 4 clientes y existiría con 1.

**Qué pasa a 20 clientes.** `review-performance.md`, escenario B (5 clientes del tamaño de Arredo) es explícito: el working set pasa de ~28 GB a **>100 GB contra 16 GB de cache**, *"ninguna cantidad de CU razonable lo arregla"*, y harían falta **~8 CU sólo para volver al empate de hoy**. 8 CU permanentes ≈ 5.840 CU-hora/mes ≈ **USD 934/mes ESTIMADO**, y aún así con peor performance que hoy. Además `backfillDay` itera **org por org** (`rollup-backfill.ts:380-389`): con 5 orgs grandes el ciclo de refresco pasa de ~1,75 h a **>12 h**, por encima del umbral de frescura de 8 h → **mails de frescura permanentes al cliente**.

**El apalancamiento no está en pagar más CU. Está en dejar de escanear.**

### 5.d — Anthropic (Aurum): costo real, medición inexistente

- Modelos en uso: `claude-haiku-4-5` (FLASH), `claude-sonnet-4-5` (CORE), `claude-opus-4-5` (DEEP) — `src/app/api/chat/route.ts:148-165`. `maxTokens` 2.000 / 4.000 / 8.000; `maxToolRounds` 2 / 5 / 8.
- **`aurum_usage_logs` NO tiene `costUsd`.** Verificado en `prisma/schema.prisma:683-704`: guarda `inputTokens`, `outputTokens`, `totalTokens`, `latencyMs`, `toolRounds`, `model`, `mode` — y ningún campo monetario. `/api/admin/usage` agrega tokens y latencias, **nunca dólares**. *(Corrección al enunciado del encargo: el campo `costUsd` no existe en el código.)*
- Se puede derivar el costo multiplicando tokens × precio del modelo, pero **nadie lo hace hoy y el producto no lo expone**.
- El log es **fire-and-forget en un `finally` sin `waitUntil`** (`chat/route.ts:399-424`), en una lambda que ya devolvió la respuesta. En Vercel la función se congela al responder → **parte de la telemetría de costo probablemente se pierde**. Los números de `/admin/usage` son un piso, no un total.
- **No hay ninguna cuota, límite ni rate-limit por org sobre Aurum.** Un cliente puede disparar DEEP (Opus, 8 rondas de tools, 8k tokens de salida) tantas veces como quiera. `PRECIOS.md` reconoce que *"Deep = 10-50× Flash"*. Es el único costo verdaderamente ilimitado del sistema, y es invisible.

### 5.e — Los costos que nadie está modelando

| Servicio | Situación | Riesgo |
|---|---|---|
| **GitHub Actions** | `keep-pixel-rollups-fresh.yml` corre `*/15` (96/día) y cada corrida hace `for i in 1..6` con `-m 290` y `sleep 5`. En el peor caso ~30 min de runner por corrida | Repo privado ⇒ los minutos se facturan. Con corridas de 5-10 min reales serían **~21.600 min/mes**, muy por encima de cualquier tier incluido → **USD 100-200/mes ESTIMADO**, que probablemente nadie está mirando. La cifra exacta depende de cuánto tarda realmente cada hit; el mecanismo está en el archivo |
| **Resend** | Volumen bajo hoy. Free hasta ~3k mails/mes; Pro ~USD 20/mes | Crece con clientes (digest semanal, invitaciones, alertas de frescura al cliente). No es material |
| **`api_cache` que nunca se purga** | `review-performance.md` H7: payloads de ~878 KB, keys nuevas todos los días, **sin purga** | *"~10 GB/año a ~50 GB/año de basura acumulada"* con 5 clientes — dentro de la misma base cuyo cache ya no alcanza. Es costo de storage **y** de cache hit rate |

### 5.f — Síntesis: fijo vs marginal, chico vs grande

| Concepto | Fijo (independiente de clientes) | Marginal — cliente chico | Marginal — cliente grande |
|---|---|---|---|
| Neon cómputo | **USD 234-467/mes** (la tormenta de rollups + `backfill-runner` cada minuto) | ~USD 2-8 | ~USD 40-120 (escaneos de su `pixel_events`) |
| Neon storage | ~USD 0 | ~USD 0,35-1 | ~USD 15 |
| Vercel plataforma | ~USD 40 (2 asientos) | ~USD 1-3 | ~USD 25-45 |
| GitHub Actions | **USD 0-200 ESTIMADO** (sin medir) | 0 | 0 |
| Resend | ~USD 0-20 | ~USD 0 | ~USD 0 |
| Anthropic (Aurum) | 0 | **sin medir** | **sin medir, sin techo** |
| **TOTAL** | **≈ USD 275-730/mes** | **≈ USD 5-15/mes** | **≈ USD 80-200/mes** |

**Las tres conclusiones que importan:**

1. **Hoy el costo es casi todo fijo.** Con 4 clientes, ~USD 275-730/mes de costo fijo se reparten en 4 → **USD 70-180 por cliente** de los cuales casi nada es atribuible a nadie. Con 20 clientes ese mismo fijo se reparte en 20 → **USD 14-37 por cliente**. **La expansión mejora dramáticamente el margen de infraestructura.** Es la buena noticia del reporte.
2. **Pero sólo si el fijo no explota.** Y explota: `review-performance.md` proyecta que 5 clientes Arredo-sized exigen 8+ CU sólo para empatar la performance de hoy (**~USD 934/mes**), y que el ciclo de refresco de rollups se va a **>12 h** — o sea, el producto deja de funcionar antes de que el costo se vuelva caro. **El límite es técnico, no económico.**
3. **El costo real por cliente son horas de Axel, y no está en ninguna tabla.** Entre §4 (13 operaciones manuales por cliente) y §3 (detección en días o semanas), un onboarding es probablemente 8-20 h de trabajo técnico ESTIMADO, y cada incidente entre 2 y 8 h. A 20 clientes eso es **la restricción vinculante de todo el plan de expansión**, y ninguna optimización de infraestructura la toca.

---

## 6. Facturación, comercial y cumplimiento

### 6.a — Facturación: no existe nada

- `Organization.plan` es un enum `STARTER | GROWTH | PRO` (`prisma/schema.prisma:26,97-101`). Rastreé todos sus usos: `settings/organizacion/page.tsx:63`, `admin/clientes`, `control/client`, `control/clients-health`, `settings/organization`. **En los 8 sitios se lee para mostrarlo en pantalla. No hay un solo punto donde gatee una funcionalidad, imponga un límite o calcule un precio.** Es decorativo.
- No hay tablas de suscripción, factura, precio, cuota, período de facturación ni pasarela de pago. Cero Stripe, cero MercadoPago.
- Lo que sí existe como gate es **RBAC por sección** (`custom_roles`, `section-overrides`, `src/lib/permissions.ts`) — que se usa comercialmente de forma manual: a TeVeCompras se le vendió "sólo el pixel" y se implementó **cambiándole el rol custom a mano en la DB** (`CLAUDE_STATE.md`, sesión 07-02, punto 4). Eso *es* el enforcement de plan hoy: un rol editado a mano.
- Cómo se factura, entonces: **fuera del sistema**. Presumiblemente por acuerdo directo y factura manual.

### 6.b — Precios: dirección definida, números pendientes

`CLAUDE_VM/CONOCIMIENTO_PRODUCTO/PRECIOS.md` (leído en modo lectura) dice que Tomy eligió el **Modelo D: Scope × Scale** — packs de módulos (Activación / Crecimiento / Completo) multiplicados por volumen de data procesada (órdenes/mes, SKUs, integraciones, eventos de pixel, usuarios, uso de IA). Los valores numéricos están **pendientes de calibrar con data real de los trials**, con placeholders de USD ~100-300/mes para chico y USD ~2.000-5.000/mes para grande.

**El problema operativo es que el modelo elegido requiere medir exactamente lo que el sistema no mide.** Los seis cost drivers que `PRECIOS.md` nombra son órdenes/mes, SKUs activos, integraciones, eventos de pixel/mes, usuarios y uso de IA por modo. De esos, **ninguno tiene hoy un reporte por org listo para facturar**: hay que salir a hacer queries a mano. Y "uso de IA por modo" está en `aurum_usage_logs` sin dólares y con pérdida probable de registros. Si el pricing es por consumo, **la medición del consumo es parte del producto**, y hoy no está construida.

**Lo que hace falta antes de firmar clientes con este modelo:**
1. Un reporte de consumo por org y por mes, con las 6 dimensiones — reutilizable para facturar, para calibrar precios y para vigilar costos. Es la misma tabla que resuelve §5.
2. Convertir `plan` en algo con efecto: al menos límites blandos (alertar cuando un cliente supera lo contratado) antes de límites duros.
3. Costo por org en dólares, aunque sea aproximado: derivar el costo de Aurum de `aurum_usage_logs` es una multiplicación, y hoy no la hace nadie.

### 6.c — Datos personales y cumplimiento: el hallazgo más expuesto del reporte

El sistema almacena, **de los compradores de sus clientes**: emails (`customers.email`, `pixel_visitors.email`), teléfonos normalizados a E.164 (`pixel_visitors.phone`, `schema.prisma:723`), ciudad/provincia/país (`customers.city/state/country`), identificadores de dispositivo y cookies de terceros (`clickIds`, `metaFbc`, `metaFbp`), y el historial completo de navegación y compra por visitante.

Búsqueda exhaustiva sobre `src/` y `docs/` de: `gdpr`, `retention`, `retención`, `derecho al olvido`, `anonimiz*`, `purge`, `data deletion`, `dsr`. **Cero resultados relevantes.** No hay:

| Requisito | Estado |
|---|---|
| Política de retención de datos | **No existe.** `pixel_events` guarda todo desde 2024 en la tabla caliente. `review-performance.md` lo plantea como problema de performance, no de cumplimiento: *"¿realmente hacen falta 2 años de `pixel_events` crudos en la tabla caliente?"* |
| Borrado por pedido de un titular (un comprador) | **No existe.** No hay ningún endpoint que borre a *una persona* |
| Exportación de datos de un cliente | **No existe** como función. Hay export a PDF/Excel del P&L (`CLAUDE_STATE.md:3296`) — es un reporte, no una exportación de datos |
| Borrado al irse un cliente | **Existe pero incompleto** (abajo) |
| Contrato de tratamiento de datos / DPA | **No hay rastro en el repo** |
| Registro de accesos a datos personales | **No existe.** Hay `login_events`, no accesos a datos |

**El borrado está incompleto, y esto es lo importante si un cliente se va y pide que borren todo.** `POST /api/admin/orgs/[orgId]/wipe-account` (guardado por `isInternalUser` + `confirm: "WIPE-{orgId}"`, correcto) borra: `order_items`, `orders`, `pixel_attributions`, `pixel_visitor_aliases`, `pixel_events`, `pixel_visitors`, `customers`, `products`, `connections`, `backfill_jobs`, ~22 tablas opcionales, `users`, `onboarding_requests`, `organizations`.

**Lo que deja atrás (cruzando la lista de borrado contra las ~30 tablas fuera de `schema.prisma` de `review-flujos.md` C-11):**

- **Toda la capa Silver**: `silver_orders`, `silver_customer_firsts` — derivadas de órdenes y clientes.
- **Toda la capa Gold**: `gold_customer_daily`, `gold_order_segments`, `gold_daily_revenue`, `gold_product_sales`, `gold_attribution_source`, `gold_attribution_channel`.
- **Todos los rollups del pixel**: los 8 `pixel_daily_*`.
- **`pixel_visitor_first_source`** (3,9M filas) y `pixel_visitor_no_source` — dimensiones por visitante.
- **`attribution_no_match`**.
- **`api_cache`** — payloads de ~878 KB con resultados de dashboards, que nunca se purgan (`review-performance.md` H7).
- **`email_log`** — explícitamente conservado por decisión (`wipe-account/route.ts:16` — *"MANTIENE: email_log (historial)"*), con las direcciones de correo.
- **`leads`** — explícitamente conservado.
- **`aurum_usage_logs`** — con `organizationId` y `userId`.

Es decir: **hoy no se puede responder honestamente "sí, borramos todo"**. Con 4 clientes conocidos es un riesgo teórico. Con 20 clientes y contratos firmados, es una cláusula que se va a incumplir. Y notar que las tablas que quedan son justamente las que **no están en `schema.prisma`** — el mismo agujero que hace que `prisma db push` sea peligroso hace que el borrado sea incompleto. Es un solo defecto con dos consecuencias graves.

**Dos cosas más que conviene mirar antes de firmar con un cliente más grande:**
- `schema.prisma:1261` — `dashboardPasswordPlain: String?`, con el comentario *"Copia en texto plano para que el admin la vea/reenvíe (low-stakes read-only dashboard)"*. Contraseñas en claro en la base.
- `/api/debug/meta` es **público, sin autenticación**, y devuelve conteos globales de órdenes/clientes/productos más 3 `orderItem` reales de cualquier tenant (`review-flujos.md` H-8). Con 4 clientes es una filtración menor; con 20 es una brecha reportable.

---

## 7. Bus factor y runbooks

### 7.a — Lo que está versionado

`docs/RUNBOOK-GOLD-ATTRIBUTION.md`, `RUNBOOK-GOLD-CUSTOMER.md`, `RUNBOOK-GOLD-DEVICE-TRAFFIC.md`, `RUNBOOK-GOLD-TANDA2.md`, `RUNBOOK-SEGMENTS-TANDA4.md`, `RUNBOOK-SILVER-CUSTOMER-FIRSTS.md`, más `docs/MEDALLION_*.md`, `CANALES-METODOLOGIA.md` y los `SQL-PENDIENTE-*.md`.

**Son excelentes, y son todos del mismo tipo:** recetas de SQL para construir la capa Medallion, escritas para que un ingeniero las pegue en la consola de Neon. `RUNBOOK-GOLD-ATTRIBUTION.md:3` abre con *"Correr en Neon (prod), en este orden."*

**No hay un solo runbook operativo.** No existe: "cómo onboardear un cliente de punta a punta", "qué hacer cuando un cliente dice que ve todo en cero", "cómo verificar que el pixel de un cliente está sano", "qué hacer si Neon se degrada", "cómo responder un pedido de borrado de datos", "cómo se factura".

### 7.b — Lo que **no** está versionado, y es el documento maestro

`.gitignore:17-18` excluye `*.local.md` y `*.local.sql`. Confirmado con `git check-ignore`. Eso saca del repositorio, entre otros:

- **`PROJECT-HANDOFF.local.md`** — que se auto-describe como *"Documento maestro / punto de entrada. Para un chat nuevo: leé esto primero"*. Contiene las reglas operativas críticas, el mapa de la arquitectura, los IDs de las orgs reales, cómo verificar, y la clave de admin/cron de producción en texto plano (`:15`).
- **`RETOMAR.local.md`** (45 KB), `PENDIENTES.local.md`, `AUDITORIA-ESTRUCTURA.local.md`, `MIGRATION-RECIPE.local.md`, los `PARA-TOMY-*.local.md`, los `PLAN-CANALES*.local.md`.
- **Los `.sql` de backfill por cliente** — `backfill-1-cmod6ns.local.sql`, `backfill-2-emdj.local.sql`, `backfill-3-cmohl80fx.local.sql`, `canales-seeds-prod.local.sql`, `canales-setup.local.sql`. Es decir: **el SQL que hace funcionar a cada cliente vive sólo en el disco de Axel.**

Y `PROJECT-HANDOFF.local.md` referencia repetidamente memorias con sintaxis `[[nitrosales-pixel-rollup-incident]]`, `[[nitrosales-prod-crons-perf]]`, `[[nitrosales-org-ids]]`, `[[nitrosales-vtex-product-identity]]`… **que no están en el repositorio en ninguna forma.** Viven en el almacén de memoria del agente de Axel. El documento maestro apunta a documentos que no existen fuera de su máquina.

### 7.c — Lo que sí está versionado y es oro

`ERRORES_CLAUDE_NO_REPETIR.md` — **107 incidentes** documentados con "Cuándo pasó / Causa raíz / Regla que lo previene", 185 KB. `CLAUDE_STATE.md` — 586 KB de bitácora de sesiones. `BACKLOG_PENDIENTES.md` — 127 KB. `CLAUDE.md` — 7 reglas de proceso. Junto con `PLAN_REMEDIACION.md` y `docs/auditoria-2026-09/`, son un activo de conocimiento genuinamente inusual para un equipo de dos personas.

**Pero están escritos para un agente de IA, no para una persona nueva.** Son bitácoras cronológicas, no documentación de referencia. Y `PLAN_REMEDIACION.md` + `docs/auditoria-2026-09/` **están sin commitear y sin trackear** (`CLAUDE_STATE.md:27-29`: *"por decisión de Axel. Sobreviven a un checkout, pero `git clean -fd` los borra"*). Los 197 hallazgos de la auditoría existen en un solo disco.

### 7.d — La respuesta a "si Axel no está una semana"

| Escenario | ¿Se puede? |
|---|---|
| Onboardear un cliente nuevo | **No.** Requiere: registrar el afiliado VTEX (conocimiento de Tomy), crear el backfill con los meses correctos, correr `setup-pixel-rollups`, correr `firstSourceForOrg` con `tsx` contra prod, ejecutar los seeds de canales, y el `.sql` de backfill de atribución con el `organizationId` del cliente — que hay que escribir a mano copiando uno de los tres que están sólo en el disco de Axel |
| Atender "el cliente ve todo en cero" | **No con confianza.** El diagnóstico exige elegir entre 27 endpoints de debug, leer 519 `console.error` en los logs de Vercel, y saber que `HTTP 200 con ceros` es un modo de falla y no un dato real |
| Aplicar una migración de schema | **No con seguridad.** 36 endpoints `migrate-*` sin registro de cuáles corrieron |
| Responder un pedido de borrado de datos | **No completamente** (§6.c) |
| Detectar que algo se rompió | **Sólo si Tomy abre `/admin/alertas` y `/control/clientes` a diario** y sabe interpretarlos — y aun así los dos arrastran el sesgo de `markSyncSuccess` |
| Deployar un fix | Sí. `tsc`, `build`, `vitest` (396 tests) están en verde y documentados en `CLAUDE.md` REGLA #3 |

**El bus factor no es 1 por falta de documentación — hay muchísima. Es 1 porque la documentación que importa no está versionada, apunta a memorias privadas, y describe procedimientos manuales que sólo tienen sentido para quien ya los hizo.**

---

## 8. Las 5 cosas que más bajan el costo de operar cada cliente

Ordenadas por (reducción de horas de Axel + reducción de tiempo de detección) ÷ (riesgo del cambio). Nada de esto está implementado ni lo implementé — es sólo lectura.

### 1. Hacer que la detección sea por cliente, y que empuje

Tres cambios chicos, ninguno arquitectónico:
- **`checkPipelineFreshness` por org.** Hoy es `SELECT MAX("${t.column}") FROM ${t.table}` sin `WHERE` (`freshness.ts:100-104`). Agrupar por `organization_id` convierte un chequeo que se diluye con cada cliente en uno que se afila con cada cliente. **Es la línea de código de mayor apalancamiento en todo el reporte.**
- **Agendar `/api/admin/alertas`.** Los 4 mejores checks del repo (pixel muerto, pixel nunca instalado, baja identificación, tráfico sin compras) ya están escritos y ya funcionan; sólo les falta un cron y un mail. Es la diferencia entre "hay que acordarse de mirar" y "te avisa".
- **Agregar `BACKFILLING` al `WHERE` de `checkStuckOnboardings`** (`checks.ts:171`) y hacer que `approve-backfill` falle en vez de devolver `ok:true` con 0 jobs creados. Cierra el modo de falla exacto del caso Arredo, que sigue vivo.

Impacto: el tiempo de detección pasa de días/semanas a horas, y deja de degradarse con cada alta.

### 2. Dejar de mentir sobre el estado de salud

`markSyncSuccess` sólo debería llamarse si el sync efectivamente salió bien (`sync/route.ts:83`, `sync/chain/route.ts:95`, mirando `results.*.error`). Mientras no cambie, **todo el Centro de Control es decorativo** y cualquier inversión en detección se construye sobre una señal falsa. Es el prerequisito de todo lo demás — mejorar los umbrales de un sensor desconectado no sirve de nada.

### 3. Un panel de consumo y costo por cliente

Una sola vista con, por org y por mes: eventos de pixel, órdenes, SKUs, integraciones activas, usuarios, GB en la base, y queries de Aurum por modo **convertidas a dólares** (tokens × precio del modelo — es una multiplicación, los tokens ya están en `aurum_usage_logs`).

Esto resuelve tres problemas de una vez: (a) habilita el modelo de pricing por consumo que `PRECIOS.md` ya eligió, (b) permite ver qué cliente está desbalanceando la infraestructura antes de que la tumbe, (c) da el número para la factura. También conviene arreglar el log de Aurum para que no se pierda (`waitUntil` en el `finally` de `chat/route.ts:399`) y ponerle una cuota o al menos una alerta por org, que hoy no tiene ninguna.

### 4. Convertir el onboarding manual en un flujo

Las 13 operaciones de §4 son el costo marginal real de un cliente. Las de mayor retorno:
- **El paso del afiliado VTEX**, dentro del wizard, con la URL generada automáticamente y una verificación empírica de que el webhook llega. `ERRORES_CLAUDE_NO_REPETIR.md:2662` ya lo pide textualmente: *"Si un cliente nuevo va a romper un comportamiento del producto sin que el founder se dé cuenta, hay un bug grave de wizard"*.
- **Los tres `.sql` por cliente → un endpoint parametrizado por `organizationId`.** Son el mismo SQL con un cuid distinto; ya está escrito, sólo hay que parametrizarlo y versionarlo. Elimina un archivo manual por cliente.
- **Una checklist de onboarding en la UI** con verificación real: ¿llegó el primer webhook? ¿el backfill creó jobs y terminó? ¿los rollups tienen filas de esta org? ¿el pixel manda eventos? Cada ítem verificado contra la base, no marcado a mano.
- **Una tabla de migraciones aplicadas.** 36 endpoints `migrate-*` sin registro es una bomba de tiempo; una tabla `applied_migrations` es media hora de trabajo y elimina toda una clase de incidentes.

### 5. Bajar la carga de fondo — es el costo fijo, y es el techo de escala

`review-performance.md` C1 identifica el mismo cambio como el de mayor impacto y menor riesgo, y lo comparto: **hoy el pipeline de rollups se dispara ~7 veces cada 15 minutos desde dos schedulers que no se conocen** (GitHub Actions con `for i in 1..6`, más el cron de Vercel, más el self-heal de `warm-cache`). Dejar un solo scheduler y bajar el `for 1..6` a `1..2` reduce el escaneo permanente de la tabla de 43 GB sin tocar la red de seguridad.

Eso ataca, con un cambio de configuración: el gasto de cómputo de Neon (el mayor costo fijo, §5.c), el hit rate de cache que hace lentas todas las pantallas de todos los clientes, la factura probablemente no monitoreada de GitHub Actions (§5.e), y el techo de 12 horas de ciclo de refresco que hace que el producto deje de funcionar antes de que el costo se vuelva caro.

Y en la misma línea, dos cosas que hoy no cuestan pero van a costar: **purgar `api_cache`** (H7, ~10 GB/año por cliente que nunca se borran) y **definir una retención para `pixel_events`** — que además es el mismo trabajo que hace falta para poder decirle a un cliente que sus datos se borran cuando se va (§6.c).

---

## Anexo — Notas de método y límites

- Todo es análisis estático del árbol de trabajo en el commit `9ad4616d`. No se ejecutó nada contra producción, ni DB, ni endpoints, ni crons; no se editó ni commiteó ningún archivo del repo.
- **Los precios de Neon, Vercel, GitHub Actions y Anthropic son de lista pública y están marcados ESTIMADO.** No pude verificarlos contra facturas. Lo que sí es evidencia dura del repo es el conteo de crons, la cadencia, los presupuestos de tiempo, los volúmenes de datos y la ausencia de instrumentación de costo. **Con las facturas reales en la mano, los números de §5 se corrigen en media hora y las conclusiones estructurales (fijo >> marginal; el límite es técnico antes que económico) no cambian.**
- **Corrección al encargo:** `aurum_usage_logs` **no tiene** un campo `costUsd`. Verificado en `prisma/schema.prisma:683-704` y en `src/app/api/admin/usage/route.ts`. Registra tokens, no dinero. La mención a `costUsd` aparece en `CLAUDE_STATE.md` y en `CLAUDE_VM/CONOCIMIENTO_PRODUCTO/QUE_ES_CADA_PRODUCTO.md`, pero no en el schema ni en el código — es otro caso del patrón de "documentación que afirma algo que el código no hace" que ya está catalogado en el repo (`M-5` de `review-flujos.md`).
- Las estimaciones de horas humanas por onboarding e incidente (§5.f, punto 3) son inferencias mías a partir de las 13 operaciones manuales de §4 y de la narrativa de los incidentes; **no hay ningún registro de tiempo en el repo** que las respalde. Trátenlas como orden de magnitud.
- Cuatro cosas quedan **SIN CONFIRMAR** por requerir acceso a producción: el consumo real de CU-hora de Neon; los minutos reales de GitHub Actions; qué migraciones de las 36 se ejecutaron; y el volumen mensual real de eventos de pixel por org.
