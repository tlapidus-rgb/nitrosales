# Auditoría de FUNCIONAMIENTO Y FLUJOS (backend) — NitroSales

**Commit auditado:** `9ad4616d` (= `origin/main` = producción, `nitrosales.vercel.app` / `app.nitrosales.ai`)
**Fecha:** 2026-09-02
**Alcance:** crons, webhooks, sync/conectores, manejo de errores, reglas App Router, concurrencia/pool, timeouts, onboarding, migraciones de DB, deuda operativa.
**Método:** solo lectura del árbol de trabajo. No se ejecutó nada contra producción, ni DB, ni crons, ni endpoints.
**424 API routes** en `src/app/api/`, **25 crons en disco**, **28 entradas en `vercel.json`**.

---

## Resumen de la tesis

Casi todos los hallazgos graves convergen en un mismo patrón: **el sistema no tiene forma de saber que está roto.**

Tres mecanismos concretos lo producen:

1. **No hay telemetría.** 519 `console.error` en `src/`, y **cero** Sentry / Datadog / OpenTelemetry / logtail (verificado por grep sobre `src/` y `package.json`). El único canal de alerta real es un mail a **una** dirección personal hardcodeada (`tlapidus@99media.com.ar`, 7 sitios).
2. **Las señales de salud son fabricadas.** `/api/sync` y `/api/sync/chain` marcan `lastSuccessfulSyncAt = now` incondicionalmente, incluso cuando *todos* los pasos fallaron. El health-check de `control-alerts` lee justamente ese campo.
3. **El antipatrón "fallo → HTTP 200 con ceros"** está en el dashboard principal *y* en el webhook de órdenes de VTEX, que es la boca de entrada de la plata.

---

# CRITICAL

## C-1 · `NEXTAUTH_SECRET` (la clave que firma los JWT de sesión) se usa como API key y viaja en URLs
**Severidad:** CRITICAL
**Evidencia:**
- `vercel.json:16` — `"/api/sync?key=nitrosales-secret-key-2024-production"` (el literal está commiteado, en las 28 entradas de cron)
- `src/app/api/sync/route.ts:92,139,161` — `if (syncKey !== process.env.NEXTAUTH_SECRET)`
- `src/app/api/sync/chain/route.ts:133` — idem
- `src/app/api/webhooks/vtex/orders/route.ts:80-82` — `if (key !== process.env.NEXTAUTH_SECRET)` → **este valor está configurado dentro de la URL del webhook en el VTEX Admin de cada cliente**
- `src/app/api/webhooks/vtex/inventory/route.ts:42` — idem
- `src/app/api/sync/trigger/route.ts:72-74` — `const syncKey = process.env.NEXTAUTH_SECRET` embebido en un self-fetch URL
- 30+ endpoints `admin/migrate-*` comparan contra `process.env.NEXTAUTH_SECRET` (ej. `admin/migrate-aura-payouts/route.ts:21`, `admin/backfill-always-on/route.ts:20`)

**Qué está mal:** el secreto que NextAuth usa para firmar y verificar los JWT de sesión es también la contraseña de los crons, del webhook de VTEX y de 30 endpoints de migración de esquema. Viaja como query param → queda en logs de acceso de Vercel, en logs de VTEX, y en la config del VTEX Admin de cada cliente (visible para el personal del cliente y para su agencia). Y, si `ADMIN_API_KEY == NEXTAUTH_SECRET == "nitrosales-secret-key-2024-production"` (condición necesaria para que los crons de `vercel.json` funcionen — ver C-2), entonces **el secreto de firma de sesión está en texto plano en el repositorio**.

**Escenario de falla concreto:** un dev de Arredo entra al VTEX Admin → Config tienda → Pedidos → hooks, ve la URL `.../api/webhooks/vtex/orders?key=<NEXTAUTH_SECRET>&org=...`. Con ese valor firma un JWT de NextAuth con `organizationId` = el de TeVeCompras y `isStaff: true`. Entra a la app como staff de NitroSales y ve la facturación, márgenes y clientes de las cuatro cuentas. Nada lo registra: es una sesión válida.

**Nota relacionada [YA CONOCIDO]:** `ERRORES_CLAUDE_NO_REPETIR.md` documenta que hubo un intento de sacar la key hardcodeada de 89 archivos (`src/lib/admin-key.ts:1-16`, BP-M1). El trabajo quedó a mitad: hoy conviven **cuatro** secretos distintos (ver C-2) y el peor de todos (`NEXTAUTH_SECRET`) sigue siendo el más usado.

---

## C-2 · Cuatro secretos distintos alimentados por un solo literal en `vercel.json`; si uno no coincide, esos crons mueren en silencio
**Severidad:** CRITICAL
**Evidencia:**

| Secreto | Dónde se valida | Crons afectados |
|---|---|---|
| `process.env.ADMIN_API_KEY` | `src/lib/admin-key.ts:19-27` | alerts-scheduler, backfill-runner, control-alerts, meta-token-refresh, ml-missed-feeds, ml-reconcile, post-backfill-finalize, refresh-* (7), vtex-sync-recent, warm-cache |
| `process.env.NEXTAUTH_SECRET` | `src/app/api/sync/route.ts:139`, `sync/chain/route.ts:133`, `cron/influencer-summary` | `/api/sync`, `/api/sync/chain`, influencer-summary |
| `process.env.SYNC_KEY` | `cron/ads-utm-audit/route.ts:37`, `cron/anomalies/route.ts:27`, `cron/digest/route.ts:23`, `cron/exchange-rates/route.ts:66`, `cron/inflation-index/route.ts:51` | 5 crons |
| literal `"nitrosales-backfill-2024"` | `app/api/backfill/vtex/route.ts:29`, `app/api/fix-brands/route.ts:9` | (no cron; endpoints manuales) |

`vercel.json` manda **el mismo** `key=nitrosales-secret-key-2024-production` a los 28.

**Qué está mal:** para que los 28 crons funcionen, `ADMIN_API_KEY`, `NEXTAUTH_SECRET` y `SYNC_KEY` tienen que valer exactamente ese literal en Vercel. Además `.env.example` **no documenta ninguna de las tres** (`ADMIN_API_KEY`, `SYNC_KEY`, `CRON_SECRET`, `VERCEL_AUTOMATION_BYPASS_SECRET`, `WEBHOOK_ENFORCE`, `VTEX_WEBHOOK_SECRET`, `SILVER_ORDERS_ENABLED` — ninguna aparece en `.env.example`). `src/lib/admin-key.ts:19-20` cae a un valor **aleatorio por proceso** si `ADMIN_API_KEY` no está seteada: fail-closed → 403 silencioso en 18 crons.

**Escenario de falla concreto:** alguien rota `NEXTAUTH_SECRET` en Vercel para invalidar sesiones (una práctica normal de seguridad). Al instante: el cron diario `/api/sync` de las 3am devuelve 401, `/api/sync/chain` cada 2h devuelve 401, y **el webhook de órdenes de VTEX de los cuatro clientes devuelve 401**. Vercel no alerta por 401 en crons. VTEX reintenta unas veces y desiste. Los pedidos dejan de entrar a NitroSales; el dashboard sigue mostrando lo viejo. Nadie se entera hasta que un cliente pregunta por qué no ve las ventas de ayer. El propio código ya conoce este modo de falla y lo documenta como mensaje de error: `cron/refresh-pixel-first-source/route.ts:207-209` — *"¿Se rotó la ADMIN_API_KEY sin actualizar vercel.json y redeployar?"*.

---

## C-3 · El webhook de órdenes de VTEX devuelve HTTP 200 cuando falla → la orden se pierde para siempre
**Severidad:** CRITICAL
**Evidencia:**
- `src/app/api/webhooks/vtex/orders/route.ts:794-796` — `catch (error) { console.error(...); return NextResponse.json({ ok: false, error: error.message }); }` — **sin `status`, o sea 200**
- `src/app/api/webhooks/vtex/orders/route.ts:152-159` — si el `GET /api/oms/pvt/orders/{id}` a VTEX no responde OK, devuelve `{ok:false}` también con **200**
- `src/app/api/webhooks/vtex/inventory/route.ts:293` — mismo patrón

**Qué está mal:** el Orders Broadcaster de VTEX usa el código HTTP para decidir si reintenta. Un 200 significa "recibido y procesado". Cualquier excepción en las ~700 líneas del handler (timeout de Neon, `statement_timeout`, un `upsert` que choca con un unique, VTEX OMS lento, un item con `sellingPrice` null) se convierte en un 200 → **VTEX nunca reintenta y la orden nunca entra**. La única red de seguridad es `vtex-sync-recent` cada 30 min, que está capado a `max=100` órdenes por org (ver H-6).

Agravantes en el mismo handler:
- `maxDuration = 30` (línea 29) pero el `fetch` a la OMS de VTEX (línea 148) **no tiene timeout**. Si VTEX tarda 35s, la función muere sin responder nada.
- **N+1 dentro del loop de items** (líneas ~344-412): por cada ítem hace `product.findUnique` + (a veces) un `fetch` HTTP a VTEX sin timeout + `product.upsert` + `orderItem.create`. Una orden de 20 ítems = 60 queries secuenciales + hasta 20 llamadas HTTP, todo dentro de 30s.
- `orderItem.deleteMany` + N × `orderItem.create` **fuera de transacción** (línea 344): si la función muere a mitad, la orden queda con ítems parciales o cero.

**Escenario de falla concreto:** Arredo tiene un pico de Hot Sale. Neon se satura (documentado en `BACKLOG_PENDIENTES.md` → BP-NEON-CAPACITY). Un `upsert` tarda 12s, otro 15s, el handler se pasa de 30s en las órdenes de 15+ ítems. Cada una de esas órdenes devuelve 200 (o muere) y VTEX la da por entregada. Se pierden las 300 órdenes más grandes del día — justo las de mayor ticket. `vtex-sync-recent` sólo recupera 100. El P&L de Arredo queda mal y **nadie recibe una alerta**, porque `control-alerts` sólo mira `lastSuccessfulSyncAt`, que se refresca solo (ver C-4).

---

## C-4 · `markSyncSuccess` se llama incondicionalmente → el health-check de conexiones es ciego por diseño
**Severidad:** CRITICAL
**Evidencia:**
- `src/app/api/sync/route.ts:83` — `await markSyncSuccess(orgId, "VTEX")` está **después** de los `try/catch` que capturan los fallos de VTEX y vtex-details, sin mirar `results`
- `src/app/api/sync/chain/route.ts:95` — igual: los tres pasos pueden haber tirado timeout y aun así marca éxito
- `src/lib/sync-tracker.ts:19-22` — `markSyncSuccess` escribe `lastSuccessfulSyncAt: now, lastSyncAt: now, lastSyncError: null`
- `src/lib/control/checks.ts:76-80` — el health-check calcula staleness sobre `lastSuccessfulSyncAt`
- `src/lib/control/checks.ts:42` — umbral VTEX = 1440 min (24h)

**Qué está mal:** `/api/sync/chain` corre **cada 2 horas** y sobrescribe `lastSuccessfulSyncAt` pase lo que pase. El umbral de alerta es 24h. Por lo tanto la conexión VTEX de cualquier org **nunca puede cruzar el umbral de staleness**. Además `lastSyncError` se pone en `null` en cada corrida (y también en `releaseSyncLock`, `src/lib/sync-lock.ts:80`), borrando el rastro de un error real.

**Escenario de falla concreto:** el sync de VTEX se rompe por cualquier motivo (credenciales vencidas, 401 del self-fetch, ver C-5). Cada 2 horas `/api/sync/chain` falla en los 3 pasos, los guarda en `results.*.error` que nadie lee, y a continuación escribe "sync exitoso hace 0 minutos". `checkConnectionIssues` ve verde. `control-alerts` (cada 6h) manda "sin issues" o no manda nada. El cliente deja de recibir órdenes nuevas y el Centro de Control dice que todo está bien. Es exactamente la mecánica del caso Arredo documentado en `ERRORES_CLAUDE_NO_REPETIR.md` → `#ONBOARDING-BACKFILL-ORDENES-FALTANTE`, pero para el sync corriente en vez del backfill.

---

## C-5 · `/api/sync/chain` sigue usando el patrón de self-fetch roto por Deployment Protection (401), sin header de bypass
**Severidad:** CRITICAL — **[PARCIALMENTE YA CONOCIDO]** (`BACKLOG_PENDIENTES.md` → BP-ROLLUP-CRON, "Fix 2b")
**Evidencia:**
- `src/app/api/sync/chain/route.ts:141` — `const baseUrl = req.nextUrl.origin;`
- líneas 47, 65, 80 — tres `fetch(...)` a `${baseUrl}/api/sync/inventory`, `/api/sync/vtex-details`, `/api/sync/reconcile` — **ninguno manda `x-vercel-protection-bypass`**

**Qué está mal:** cuando Vercel Cron dispara `/api/sync/chain` (cada 2h a las :30), `req.nextUrl.origin` es la **URL del deployment**, no el dominio custom. Esa URL está detrás de Vercel Deployment Protection → los tres self-fetch reciben **401 con un body HTML**. `res.json()` explota, cae al catch, y el resultado se guarda como `{ok:false, error:"Unexpected token..."}`. Después el código llama `markSyncSuccess` (C-4) y devuelve `ok: true`. Invocado a mano desde `app.nitrosales.ai` funciona, porque el dominio custom está exento — que es exactamente lo que despistó durante semanas en el caso BP-ROLLUP-CRON.

**Estado del patrón en el resto del árbol (verificado):**

| Cron con self-fetch | baseUrl | ¿bypass header? | Estado |
|---|---|---|---|
| `cron/warm-cache:263,135` | `NEXTAUTH_URL` | ✅ sí | OK |
| `cron/refresh-pixel-first-source:163` | `url.host` (deployment) | ✅ sí (agregado 2026-07-24) | OK — **el "pendiente" del backlog ya está cerrado** |
| `cron/vtex-sync-recent:67` | `NEXTAUTH_URL` | ❌ no (pero dominio custom) | OK por suerte |
| `cron/backfill-runner:147` | `NEXTAUTH_URL` | ❌ no (dominio custom) | OK por suerte |
| `cron/post-backfill-finalize:35` | `NEXTAUTH_URL` | ❌ no (dominio custom) | OK por suerte |
| `api/sync/route.ts:39,68` | `NEXTAUTH_URL` | ❌ no (dominio custom) | OK por suerte |
| **`api/sync/chain:141`** | **`req.nextUrl.origin`** | **❌ no** | **ROTO cuando lo dispara Vercel Cron** |
| `api/sync/trigger:73` | `NEXTAUTH_URL` | ❌ no (dominio custom) | OK por suerte |

Los seis "OK por suerte" dependen de que `NEXTAUTH_URL` esté seteado al dominio custom. Si alguien lo cambia a la URL del deployment, **seis flujos más se rompen a la vez y ninguno avisa**.

**Escenario de falla concreto:** hoy mismo, cada 2 horas, el sync de inventario + detalles de órdenes + reconcile de los cuatro clientes falla con 401 y se reporta como exitoso. Precios, stock, cupones y códigos postales de las órdenes quedan sin completar; el módulo de P&L usa `costPrice` que nunca se puebla.

---

## C-6 · `/api/cron/ml-sync` no tiene autenticación si `CRON_SECRET` no está seteada
**Severidad:** CRITICAL
**Evidencia:** `src/app/api/cron/ml-sync/route.ts:290-294`
```ts
const cronSecret = process.env.CRON_SECRET;
if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```
`CRON_SECRET` no aparece en `.env.example` ni en `vercel.json`.

**Qué está mal:** **fail-open**. Si la env no existe, el `if` no se evalúa y el endpoint queda **público**. El handler itera todas las orgs con ML activo y dispara un sync completo (llamadas a la API de MercadoLibre + escrituras masivas en Neon).

**Escenario de falla concreto:** cualquiera que descubra la URL (`GET https://app.nitrosales.ai/api/cron/ml-sync`) puede dispararla en loop. Cada llamada lanza syncs de ML para las 4 orgs. Neon —que ya se cae bajo carga según BP-NEON-CAPACITY— se satura, el pool de 24 conexiones se agota, y **todos los dashboards de todos los clientes se quedan en blanco o en cero** (porque `metrics/pixel` degrada a ceros, ver C-8). También se consume la cuota de rate limit de la app de MercadoLibre, lo que puede hacer que ML desactive la aplicación.

Agravante secundario: `ml-sync` **no está en `vercel.json`**, pero `CLAUDE.md` (sección "Modelo de sync de datos") documenta *"MercadoLibre | Webhooks (real-time) | Cron 1x/día 2am"*. Ese cron diario **no existe como schedule**. La documentación miente sobre una red de seguridad que no corre.

---

## C-7 · Credenciales VTEX de un tenant en variables de módulo compartidas entre requests concurrentes
**Severidad:** CRITICAL
**Evidencia:**
- `src/app/api/backfill/vtex/route.ts:25-28` — `let ORG_ID = ""; let VTEX_ACCOUNT = ""; let VTEX_KEY = ""; let VTEX_TOKEN = "";` a **nivel de módulo**
- `src/app/api/backfill/vtex/route.ts:606-608` — dentro del handler: `VTEX_KEY = vtexConfig.creds.appKey; VTEX_TOKEN = vtexConfig.creds.appToken; VTEX_ACCOUNT = vtexConfig.creds.accountName;` (nótese que `ORG_ID` **sí** se re-declara local en la línea 578, pero las tres `VTEX_*` no)
- `src/app/api/fix-brands/route.ts:15-16` — `let _requestHeaders`, `let _requestBaseUrl` a nivel de módulo, con un comentario en la línea 13 que afirma lo contrario: *"Multi-tenant: request-scoped VTEX config (NO cache global — evitar leak de creds entre orgs)"*

**Qué está mal:** el módulo se comparte entre todas las invocaciones que caen en la misma instancia de lambda. Vercel Fluid Compute —que este codebase usa y menciona explícitamente (`cron/refresh-pixel-first-source/route.ts:96`, `metrics/pixel/route.ts:1976`)— **ejecuta invocaciones concurrentes en la misma instancia**. Dos requests simultáneos para orgs distintas pisan mutuamente las credenciales.

**Escenario de falla concreto:** durante el onboarding de un cliente nuevo se corre `/api/backfill/vtex?org=<nuevo>` mientras alguien dispara `/api/fix-brands?org=<Arredo>`. El segundo request sobrescribe `VTEX_KEY`/`VTEX_TOKEN`/`VTEX_ACCOUNT`. El backfill del cliente nuevo sigue con `ORG_ID` correcto (es local) pero **pegando contra la tienda VTEX de Arredo**: escribe órdenes, productos y clientes de Arredo bajo el `organizationId` del cliente nuevo. Contaminación cross-tenant, con datos de facturación reales, imposible de detectar sin auditar fila por fila.

---

## C-8 · Antipatrón "fallo → HTTP 200 con todo en cero" en el dashboard principal
**Severidad:** CRITICAL — **[YA CONOCIDO]** (`BACKLOG_PENDIENTES.md` → BP-PIXEL-AUDIT: *"Dashboard miente en cero (`metrics/pixel:1641`)"*)
**Evidencia:**
- `src/app/api/metrics/pixel/route.ts:1991-1996` — `catch { return NextResponse.json({ ...buildEmptyMockResponse(), _error: ... }, { status: 200 }) }`
- `src/app/api/metrics/pixel/route.ts:1986` — `return NextResponse.json(buildEmptyMockResponse())` — **este ni siquiera lleva `_error`**: ceros indistinguibles de datos reales
- `src/app/api/metrics/pixel/route.ts:158` — la race de `GLOBAL_TIMEOUT_MS` (85s) también devuelve el mock vacío
- `src/app/api/metrics/orders/route.ts:27-34` + 26 usos — `safeQuery()` devuelve el `fallback` (`[]`, `0`) ante cualquier excepción y **el endpoint responde 200**

Lo mismo, con `{ status: 200 }` explícito, en:
- `src/app/api/metrics/orders/enrich/route.ts:116` y `:399` → `{ enriched: {}, error }` con 200
- `src/app/api/cron/exchange-rates/route.ts:88`, `src/app/api/cron/inflation-index/route.ts:67,75,91`

Y con 200 implícito (catch sin `status`) en 17 rutas más (lista completa en el anexo A).

**Qué está mal:** el frontend no puede distinguir "no hubo tráfico" de "la query murió". No hay retry, no hay cartel de error, no hay log accionable. `safeQuery` sí loguea el `label` de la query que falló, lo cual es mejor que el `try` monolítico — pero el log va a `console.error` sin telemetría (M-1), así que nadie lo lee.

**Escenario de falla concreto:** el `warm-cache` corre cada 5 min y cachea la respuesta del pixel. Si en el momento del warm la query se pasa de los 85s (cosa que ya pasó: `ERRORES_CLAUDE_NO_REPETIR.md` → `#DASHBOARD-LATERAL-EN-TABLA-GRANDE`, 33,8s → timeout → mock vacío), **el mock vacío se persiste en el caché compartido de Postgres** y se sirve a todos los usuarios de esa org hasta el próximo TTL. El cliente abre `/pixel/analytics` y ve todo en cero. Llama diciendo "perdí mis datos". No hay ningún registro de que hubo un fallo.

---

## C-9 · Un webhook de MercadoLibre cuyo procesamiento falla queda marcado como recibido y no se reintenta nunca
**Severidad:** CRITICAL
**Evidencia:**
- `src/app/api/webhooks/mercadolibre/route.ts:62-69` — se responde `200` **antes** de procesar; el trabajo va a `waitUntil`
- líneas 94-112 — se inserta la fila en `meli_webhook_events` (dedup por `UNIQUE(org, externalId)`) **antes** de procesar
- líneas 125-146 — si `processMLNotification` tira, se registra `lastError` y se re-lanza; la fila queda con `processed = false`
- **Nadie lee las filas con `processed = false`.** Grep sobre `src/`: el único `WHERE "processed" = false` es la definición de un índice parcial en `admin/migrate-ml-sync-infra/route.ts:98`. No hay worker de reintentos.

**Qué está mal:** ML considera entregada la notificación (recibió 200). Nuestro outbox ya tiene el `_id`, así que si ML reenviara, el dedup lo descartaría (línea 116-118). Y ningún proceso relee los pendientes. `/missed_feeds` (cron `ml-missed-feeds`) **sólo trae lo que ML no pudo entregar**, no lo que entregó y nosotros rompimos. La única red real es `ml-reconcile` cada 2h — que el propio comentario del archivo (`cron/ml-reconcile/route.ts:18-21`) dice que existe para eso, pero opera sobre la ventana del `sync_watermark` y no sobre la tabla de outbox.

**Escenario de falla concreto:** este es exactamente el incidente citado en `CLAUDE.md` (*"pérdida de 1600 órdenes MELI por 6 días"*). Si un deploy introduce un bug en `processMLNotification` (o Neon se cae 10 minutos), todas las notificaciones de ese lapso quedan en `processed=false` con su `lastError`, y ninguna alerta salta. Si además el `sync_watermark` de `ml-reconcile` avanza más allá de ese lapso (el `MAX_LOOKBACK_MS` es 7 días, `cron/ml-reconcile/route.ts:49`), las órdenes se pierden definitivamente.

**Vector de abuso adicional:** el POST **no tiene ninguna autenticación** (no key, no firma, no filtro de IP; los IPs de ML están comentados en las líneas 25-26). Cualquiera que conozca un `user_id` de ML de un cliente puede pre-insertar `_id`s en el outbox y **envenenar el dedup** para que las notificaciones reales se descarten.

---

## C-10 · `checkStuckOnboardings` no mira el estado `BACKFILLING` → un onboarding trabado es invisible para siempre
**Severidad:** CRITICAL — **[causa raíz YA CONOCIDA]** (`ERRORES_CLAUDE_NO_REPETIR.md` → `#ONBOARDING-BACKFILL-ORDENES-FALTANTE`, caso Arredo)
**Evidencia:**
- `src/lib/control/checks.ts:171` — `WHERE "status" IN ('PENDING', 'NEEDS_INFO', 'IN_PROGRESS')` — **`BACKFILLING` no está**
- `src/app/api/admin/onboardings/[id]/approve-backfill/route.ts:152-159` — pone `status = 'BACKFILLING'` **incondicionalmente**
- líneas 110-148 — el job de VTEX sólo se crea `if (vtexConn && vtexMonths > 0 && includeVtex)`; el de ML `if (mlConn && mlMonths > 0 && includeMl)`
- línea 205 — devuelve `ok: true, message: "Backfill aprobado... Jobs creados: 0"` aunque no haya creado ninguno
- líneas 182-188 — el runner sólo se dispara `if (createdJobs.length > 0)`

**Qué está mal:** si `historyVtexMonths` es 0 (default, o el admin no lo tocó en el wizard), **no se crea ningún job**, el onboarding pasa a `BACKFILLING`, el cliente recibe el mail "empezamos a traer tu historia" (líneas 162-176) y ahí se queda. Para siempre. Ni `checkStuckOnboardings` ni ningún otro check mira `BACKFILLING`.

Segundo agujero en la misma cadena: `backfill-runner/route.ts:147` dispara `post-backfill-finalize` con un `fetch(...)` **fire-and-forget sin `waitUntil`**, dentro de un handler que responde inmediatamente después. En Vercel, la función se congela al devolver la respuesta → **el fetch puede no llegar a salir nunca**. `post-backfill-finalize` no está en `vercel.json`, así que si ese único disparo se pierde, **nadie corre el catalog-refresh, ni el recompute de agregados de clientes, ni el backfill de `costPrice` de los `order_items`**. El cliente queda con órdenes pero sin costos → todo el módulo de P&L en cero. Contrastar con el mismo archivo líneas 89-101 y 183-197 de `approve-backfill`, donde **sí** se usa `waitUntil` para otros fire-and-forget: la inconsistencia confirma que este es un olvido, no una decisión.

**Escenario de falla concreto:** se onboardea a un cliente nuevo. El admin aprueba el backfill sin haber cargado meses de historia. El cliente recibe el mail, entra a la app, y ve gráficos con 3 días de datos — **el caso Arredo, literalmente repetido**. La única señal es que alguien mire `/control/clientes` a mano. `control-alerts` no lo va a decir nunca.

---

## C-11 · ~30 tablas físicas de producción no existen en `prisma/schema.prisma`
**Severidad:** CRITICAL — **[YA CONOCIDO]** (`ERRORES_CLAUDE_NO_REPETIR.md` → `#S60-EXT2BIS10X-PRISMA-MODEL-NO-EN-SCHEMA`)
**Evidencia:** `prisma/schema.prisma` tiene 63 modelos. Estas tablas se crean sólo desde endpoints admin o `.sql` y **no están mapeadas** (verificado cruzando todos los `CREATE TABLE` de `src/` y `scripts/` contra los `@@map`):

`alert_rules`, `alert_rule_requests`, `backfill_jobs`, `email_log`, `email_templates`, `leads`, `onboarding_requests`, `onboarding_aurum_conversations`, `meli_webhook_events`, `sync_watermarks`, `system_setting`, `user_alert_favorites`, `user_alert_reads`, `channel_rule`, `api_cache`, `attribution_no_match`, `pixel_visitor_first_source`, `pixel_visitor_no_source`, `pixel_daily_aggregates`, `pixel_daily_channel`, `pixel_daily_device`, `pixel_daily_funnel_by_source`, `pixel_daily_page`, `pixel_daily_product`, `pixel_daily_source`, `pixel_daily_type`, `pixel_product_name`, `silver_orders`, `silver_customer_firsts`, `gold_attribution_channel`, `gold_attribution_source`, `gold_customer_daily`, `gold_daily_revenue`, `gold_order_segments`, `gold_product_sales`, `vtex_category`, `vtex_sku_product`.

**Qué está mal:** todo el subsistema de onboarding, alertas, backfill, outbox de ML, emails y **la capa medallion completa (silver/gold) más los rollups del pixel** viven fuera del schema. Consecuencias:
1. Un `prisma db push` o `prisma migrate` **las considera huérfanas y las borra**.
2. Sin tipado: todo se accede con `$queryRawUnsafe` (de ahí los errores documentados de nombre de columna: `#S59-WRONG-COLUMN-NAME-IN-RAW-SQL`, `#S60-EXT2BIS11X-INDEXAR-COLUMNA-INEXISTENTE`).
3. **No hay registro de qué migración se corrió.** Hay **36 endpoints `admin/migrate-*`** vivos; el estado "ya ejecutado" sólo existe en la tabla de `CLAUDE.md` (que cubre 3 de los 36) y en la memoria de quien los corrió.

**Escenario de falla concreto:** alguien (o un agente) corre `npx prisma db push` para sincronizar un campo nuevo. Prisma detecta 30 tablas que no están en el schema y ofrece dropearlas. Se pierden `silver_orders`, `gold_*`, todos los `pixel_daily_*`, los `onboarding_requests` y el outbox de ML. El dashboard entero de los cuatro clientes queda en cero y la reconstrucción es de días.

---

# HIGH

## H-1 · `sync-lock.ts` no es un mutex, y hackea los campos de salud de la conexión
**Severidad:** HIGH
**Evidencia:** `src/lib/sync-lock.ts` completo (85 líneas). Usado en `api/sync/route.ts:13`, `api/sync/chain/route.ts:37`.

Cinco defectos independientes:
1. **TOCTOU (líneas 30-55):** `findFirst` y después `updateMany`. Dos corridas concurrentes leen "sin lock" y ambas adquieren. No es exclusión mutua.
2. **Usa `lastSyncError` como campo de lock (línea 54):** mientras un sync corre, la conexión muestra `lastSyncError = "LOCK:sync"`. `checkConnectionIssues` (`lib/control/checks.ts:146-156`) lo va a reportar como error. Y `releaseSyncLock` (línea 80) pone `lastSyncError = null`, **borrando un error real** si lo hubiera.
3. **Pisa `lastSyncAt` al adquirir (línea 54):** el lock por sí solo falsifica la señal de frescura antes de haber hecho nada.
4. **Fail-open (línea 60):** `catch { return { acquired: true } }`. Si la DB está caída, todos adquieren.
5. **Siempre escribe sobre `platform: "VTEX"` (líneas 31, 53, 76), sea cual sea el `lockType`.** Si una org no tiene conexión VTEX, `updateMany` afecta 0 filas → `acquired: true` siempre, sin lock real. Y el lock de VTEX **bloquea el sync on-demand de Meta y Google**: `api/sync/trigger/route.ts:55-69` consulta el `LOCK:` de la fila VTEX antes de disparar un sync de META_ADS.

Además el `finally { releaseSyncLock }` (`api/sync/route.ts:86`, `chain:114`) **no corre si Vercel mata la función al llegar a `maxDuration`** → el lock queda pegado hasta que expira el TTL de 5 min.

**Escenario de falla concreto:** `/api/sync/chain` se pasa de sus 60s de `maxDuration` (muy probable, ver H-2) y muere. El `finally` no corre. La conexión VTEX de esa org queda con `lastSyncError = "LOCK:chain"` y `lastSyncAt = <hace un rato>`. Durante los siguientes 5 minutos, cada usuario que abra `/campaigns/meta` recibe `{syncStarted: false, reason: "sync_locked"}` y ve datos viejos sin explicación. Y `control-alerts` reporta un "error de conexión" cuyo mensaje es `LOCK:chain`, que no significa nada para quien lo lee.

## H-2 · `maxDuration` declarado ≠ el techo real; varios crons no pueden terminar el trabajo que se asignan
**Severidad:** HIGH
**Evidencia:**
- `vercel.json:3-13` declara `maxDuration: 800` para `app/api/sync/**`, `app/api/cron/**`, `app/api/admin/**`
- `src/app/api/cron/refresh-pixel-first-source/route.ts:88-96` documenta empíricamente lo contrario: *"REVERTIDO a 240s (2026-08-18): Vercel NO da >300s pese a Fluid + Default Max Duration=800 + vercel.json + Node 22 (probado, la función muere a ~340s = cap 300s). El maxDuration=800 NO se respeta."*
- Siguen declarando 800 (y presupuestando contra eso, o no): `cron/refresh-pixel-rollups:116`, `cron/post-backfill-finalize:28`, `admin/setup-pixel-rollups:65`, `admin/create-attribution-iphash-index:39`, `admin/ml-reenrich-fields:30`
- `src/app/api/sync/route.ts:7` — `maxDuration = 60`, pero el handler hace **hasta 50 self-fetch paginados secuenciales por org** (líneas 38-48) **× N orgs secuencialmente** (líneas 106-113)
- `src/app/api/sync/chain/route.ts:13` — `maxDuration = 60`, pero presupuesta contra 50.000/55.000 ms por org (líneas 62, 78) **× N orgs secuencialmente** (líneas 149-152)

**Qué está mal:** `/api/sync/chain` con 4 orgs necesita hasta 220s y tiene 60s. **Sólo la primera org se procesa; las otras tres nunca.** Idem `/api/sync`: 50 páginas × 4 orgs no entra jamás en 60s. Y `post-backfill-finalize` presupuesta contra 800s cuando el techo real es 300s → el paso 4 (`backfill-orderitem-costs`) probablemente nunca llega a correr.

**Escenario de falla concreto:** el orden de `findMany` sin `orderBy` es indeterminado en Postgres. Cada corrida del cron de las :30 procesa "alguna" org y abandona el resto — y a las 4 les escribe `lastSuccessfulSyncAt` sólo a la que alcanzó a procesar... pero como es la única que ejecuta, **tres de los cuatro clientes nunca ven su inventario/detalles/reconcile actualizados** y su `lastSuccessfulSyncAt` sí envejece → después de 24h `control-alerts` manda un mail. Que va a una sola casilla personal.

## H-3 · El `statement_timeout` real es 150s y las conexiones son 24 por instancia (la doc del propio archivo dice otra cosa)
**Severidad:** HIGH
**Evidencia:** `src/lib/db/client.ts:59`
```ts
const dsUrl = `${rawUrl}${sep}connection_limit=24&pool_timeout=160&statement_timeout=150000${pgbouncer}`;
```
Los comentarios de las líneas 30-43 del mismo archivo dicen `pool_timeout=55` y `statement_timeout=50000`, y justifican los números con *"55 < maxDuration del endpoint (90)"*. **Tres valores distintos en un archivo de 79 líneas.**

**Qué está mal:**
- `pool_timeout=160` es **mayor** que el `maxDuration` de casi todas las rutas (60/90/120/200). Una request puede consumir todo su presupuesto **esperando una conexión** y morir con 504 sin haber ejecutado una sola query.
- `statement_timeout=150000`: una query descontrolada retiene una conexión de Neon **2 minutos y medio**. Con `connection_limit=24` **por instancia de lambda** y Vercel escalando a decenas de instancias, el total de conexiones contra el pooler de Neon no tiene techo efectivo.
- `CLAUDE.md` REGLA #3b sigue diciendo *"Pool de conexiones = 8. Nunca más de 3 queries en paralelo por batch"*. Está desactualizada respecto del código (24) — un auditor o un agente futuro va a razonar con el número equivocado. `metrics/pixel` dispara ~29 queries en paralelo (comentario en `db/client.ts:37`).

**Escenario de falla concreto:** dos clientes abren el dashboard a la vez en un rango de 30 días. Cada uno lanza ~29 queries en paralelo contra un pool de 24. Las 5 que sobran esperan; con `statement_timeout=150s` las que están corriendo pueden retener la conexión 2,5 min. Las que esperan agotan el `maxDuration` de la ruta y devuelven el mock en cero (C-8) — que además se cachea. **Dos usuarios simultáneos degradan el producto para toda su organización durante el TTL del caché.**

## H-4 · DDL (`ALTER TABLE` / `CREATE INDEX`) ejecutado desde un endpoint de dashboard en cada cold start
**Severidad:** HIGH
**Evidencia:**
- `src/app/api/metrics/orders/route.ts:37-58` (`ensureColumns`) — 7 sentencias DDL: 2 `ALTER TABLE orders ADD COLUMN`, 5 `CREATE INDEX` (**no `CONCURRENTLY`**) sobre `orders`, `order_items`, `products`
- línea 112 — `await ensureColumns().catch(() => {})` desde el handler `GET`
- líneas 56-58 — `catch (e) { /* Columns/indexes likely already exist */ }` — **catch vacío**
- `src/app/api/sync/google-ads/route.ts:132-138` — mismo patrón, `ALTER TABLE "ad_creatives" ADD COLUMN` con `catch (_) {}`

**Qué está mal:** viola la propia regla del repo (`CLAUDE.md` → "REGLA: Orden de migraciones": *endpoint admin → deploy → ejecutar → recién ahí tocar el schema*). Y un `CREATE INDEX` sin `CONCURRENTLY` toma un **ACCESS EXCLUSIVE lock** sobre la tabla: durante la construcción, **ninguna escritura a `orders` puede ocurrir** — incluidos los webhooks de VTEX y de MercadoLibre.

**Escenario de falla concreto:** una migración manual pendiente dejó `orders_organizationId_source_orderDate_idx` sin crear en producción. El primer usuario que abre `/pedidos` después de un deploy dispara el `CREATE INDEX` sobre las 250.000+ órdenes de Arredo. Durante los ~40s que tarda, cada webhook de orden de VTEX se bloquea esperando el lock, se pasa de su `maxDuration = 30` y **devuelve 200 sin haber escrito nada** (C-3). Se pierden las órdenes de esos 40 segundos, en el momento de mayor tráfico del día (cuando alguien abre el dashboard). Y el `catch` vacío garantiza que si el DDL falla no queda ni un log.

## H-5 · Un `webhookSecret` en cualquier conexión de una org rompe el webhook de VTEX de esa org
**Severidad:** HIGH
**Evidencia:** `src/lib/webhooks/signature.ts:41-57` — `resolveSecret` hace `findMany({ where: { organizationId } })` **sin filtrar por plataforma** y devuelve el primer `credentials.webhookSecret` que encuentre, de cualquier conexión.
Consumido en `src/app/api/webhooks/vtex/orders/route.ts:130-141`: si `verifyResult.ok` es false → **401 y la orden se descarta**.

**Qué está mal:** el modo "soft-allow" (líneas 85-91) sólo aplica cuando **no hay ningún** secreto. En cuanto una org tiene un `webhookSecret` guardado en la conexión de MercadoLibre (o de Meta, o de cualquier otra), el webhook de VTEX empieza a exigir una firma que VTEX nunca va a mandar.

**Escenario de falla concreto:** durante el onboarding de un cliente se configura un `webhookSecret` para MercadoLibre. A partir de ese instante, **el 100% de los webhooks de órdenes de VTEX de ese cliente devuelve 401**. VTEX reintenta y desiste. El sync de órdenes se corta por completo, `control-alerts` no dice nada (C-4), y la única traza es un `console.warn` en los logs de Vercel.

## H-6 · Las redes de seguridad de VTEX están capadas por debajo del volumen real de los clientes
**Severidad:** HIGH
**Evidencia:**
- `src/app/api/cron/vtex-sync-recent/route.ts:66` — `&max=100` órdenes por org, con `from` = ayer y `to` = hoy (líneas 45-49)
- `src/app/api/sync/route.ts:37` — `const maxPages = 50` (5.000 órdenes) por org, en una función con `maxDuration = 60`
- `src/app/api/cron/attribution-reconcile/route.ts` — `DEFAULT_LIMIT = 40` órdenes por org y corrida, con ventana de `DEFAULT_DAYS = 3`

**Qué está mal:** Arredo tiene ~250.000 órdenes históricas (`ERRORES_CLAUDE_NO_REPETIR.md` → caso Arredo: *"310 → 252.701 órdenes"*). Su volumen diario supera con holgura las 100 órdenes de la ventana de 2 días de `vtex-sync-recent`, y las 40 de `attribution-reconcile`.

**Escenario de falla concreto:** un lunes de Hot Sale se pierden 400 órdenes por el problema C-3. `vtex-sync-recent` corre 48 veces ese día, pero cada corrida re-procesa las mismas ~100 órdenes más recientes de una ventana de 2 días: **nunca alcanza las 300 que quedaron atrás**. El `attribution-reconcile` procesa 40/corrida × 48 = 1.920 órdenes/día en teoría, pero con el mismo problema de ventana. El resultado es un agujero permanente en el revenue reportado que sólo se descubre comparando a mano contra el VTEX Admin.

## H-7 · El refresh del token de MercadoLibre tiene una race que puede matar la conexión de forma permanente
**Severidad:** HIGH
**Evidencia:** `src/lib/connectors/mercadolibre-seller.ts:55-107` — `getSellerToken` lee el token, y si expiró hace `POST /oauth/token` y persiste. **Sin lock, sin transacción.** El comentario de la línea 95 lo admite: *"ML sends a new refresh_token each time"*.
El `fetch` de refresh (línea 74) **no tiene timeout**.

**Qué está mal:** MercadoLibre **rota e invalida** el `refresh_token` en cada uso. Dos llamadas concurrentes con el mismo `refresh_token` → la segunda falla, y peor: dependiendo del orden de escritura, se puede persistir un `refresh_token` ya invalidado. Los crons `ml-missed-feeds` (`*/30`) y `ml-reconcile` (`0 */2`) **coinciden en el minuto :00 de las horas pares**; el jitter (5 y 10 min, `lib/sync/jitter.ts`) reduce la colisión pero no la elimina, y el sync on-demand la agrava.

Segundo problema: a diferencia de `meta-token-refresh` (que sí pone `status: "ERROR"`, `cron/meta-token-refresh/route.ts:107-113`), acá el fallo sólo **tira una excepción** (línea 84). La conexión sigue figurando `ACTIVE`.

**Escenario de falla concreto:** a las 02:00 coinciden `ml-missed-feeds` y `ml-reconcile`. Ambos ven el token vencido, ambos refrescan. Uno gana; el otro recibe `invalid_grant` y persiste basura. **El sync de MercadoLibre queda muerto**: la conexión sigue en verde en el Centro de Control, `control-alerts` no dispara, y las órdenes de ML dejan de entrar hasta que alguien re-autoriza a mano. Es exactamente el modo del incidente de las 1600 órdenes.

## H-8 · `/api/debug/meta` es un endpoint público sin autenticación que devuelve datos de todos los tenants
**Severidad:** HIGH
**Evidencia:** `src/app/api/debug/meta/route.ts` (14 líneas, sin ningún guard)
```ts
export async function GET() {
  const [products, orderItems, customers, orders, itemsWithProduct, sampleItems] = await Promise.all([
    prisma.product.count(), prisma.orderItem.count(), prisma.customer.count(),
    prisma.order.count(), prisma.orderItem.count({...}),
    prisma.orderItem.findMany({ take: 3, include: { product: true } }),   // ← sin organizationId
  ]);
```
**Qué está mal:** sin sesión, sin key, sin filtro de org. Devuelve los totales globales del negocio (cuántas órdenes, clientes y productos hay en toda la plataforma) más **3 `orderItem` reales con su producto**, de cualquier tenant. Además dispara 6 queries en paralelo contra el pool en cada llamada.

**Escenario de falla concreto:** `curl https://app.nitrosales.ai/api/debug/meta` en un loop: (a) filtra métricas de negocio de NitroSales y nombres/precios de productos de clientes reales, (b) agota el pool de conexiones (H-3) y tumba los dashboards de todos.

## H-9 · 207 rutas de API con `@ts-nocheck` — el typecheck de la REGLA #3 no cubre el backend
**Severidad:** HIGH
**Evidencia:** 290 archivos con `// @ts-nocheck` en `src/`, de los cuales **207 son `route.ts` bajo `src/app/api/`** (de 424 totales: **el 49% del backend**). Incluye rutas críticas: `cron/refresh-pixel-first-source`, `cron/backfill-runner`, `cron/ml-reconcile`, `cron/ml-missed-feeds`, `cron/alerts-scheduler`, `cron/control-alerts`, `admin/onboardings/*`, `admin/reset-test-env`.

**Qué está mal:** `CLAUDE.md` REGLA #3 exige `npx tsc --noEmit` antes de cada push. Con `@ts-nocheck` en la mitad del backend, ese gate **da verde sobre código que nunca se verificó**. Es la condición que permitió los errores ya documentados de columna inexistente y de valor de enum inventado (`#S60-EXT2BIS8X-INVENTAR-VALORES-ENUM`).

**Escenario de falla concreto:** un refactor renombra un campo de `Connection`. `tsc` pasa (0 errores) porque las 207 rutas que lo usan están silenciadas. `next build` pasa. Se deploya. Los crons empiezan a tirar `undefined is not a function` en runtime, cada uno devolviendo su `{ok:false}` con 200, y nadie lo ve hasta que un cliente reclama.

## H-10 · `Promise.all` sin límite en el motor de alertas
**Severidad:** HIGH
**Evidencia:** `src/lib/alerts/engine.ts:248` — `const results = await Promise.all(rules.map((r) => evaluateRule(r)));` sobre **todas** las reglas del usuario, sin `withConcurrency`.
Nota: el proyecto **sí tiene** un helper (`src/lib/sync/concurrency.ts`, usado en `ml-missed-feeds` y `ml-reconcile`); acá simplemente no se usa.

**Qué está mal:** `evaluateAllUserRules` se invoca desde la UI de alertas. Cada `evaluateRule` corre un primitive que hace sus propias queries. 40 reglas = 40+ queries concurrentes contra un pool de 24, desde **una sola** request de usuario.

**Escenario de falla concreto:** un cliente configura 40 alertas (el producto lo invita a hacerlo). Abre `/alertas`. Las 40 evaluaciones saturan el pool; las que esperan se comen el `pool_timeout` de 160s (H-3); el dashboard de las otras tres orgs que estaban cargando en paralelo devuelve el mock en cero (C-8) y **ese cero se cachea**.

## H-11 · `loadAllPendingSchedules` y `loadUserRules` tienen `catch { return [] }` → "0 alertas evaluadas, todo OK"
**Severidad:** HIGH
**Evidencia:** `src/lib/alerts/engine.ts:264` y `:54` — `} catch { return []; }` sin log.
Consumido por `src/app/api/cron/alerts-scheduler/route.ts:47` → si devuelve `[]`, el cron responde `{ok: true, rulesEvaluated: 0, alertsFired: 0, errors: 0}`.

**Qué está mal:** si la tabla `alert_rules` no existe (ver C-11: no está en el schema), o Neon está caído, o hay un error de SQL, el cron reporta **éxito perfecto**. Este es el mismo antipatrón que C-8, pero en el subsistema cuyo trabajo es *avisar cuando algo anda mal*.

**Escenario de falla concreto:** el sistema de alertas se cae. El cron de cada 15 minutos reporta "ok: true, 0 reglas" 96 veces por día. Los clientes dejan de recibir sus alertas de quiebre de stock y de caída de ventas. Nadie lo nota durante semanas — porque la ausencia de alertas se lee como "no hay problemas".

## H-12 · 27 endpoints de debug y 10 de test vivos en producción (tabla completa en el anexo B)
**Severidad:** HIGH
**Evidencia:** listado completo en el anexo B. Además de `/api/debug/meta` (H-8), destacan:
- `src/app/api/admin/reset-test-env/route.ts` — **borra org, usuarios, órdenes, clientes, productos, conexiones, backfill jobs y webhook events** de un email. Guard: `isInternalUser()` (correcto), pero **9 `catch {}` vacíos** (líneas 93, 100, 115...) durante el borrado en cascada → un borrado parcial se reporta como éxito.
- `src/app/api/admin/debug-org/route.ts:26` — `key === ADMIN_API_KEY ? true : await isInternalUser()`: el bypass por key expone los emails de todos los usuarios de cualquier org.
- `src/app/api/sync/google-ads-test/route.ts:10` — `getServerSession()` **sin `authOptions`** (ver H-13); expone qué env vars de Google Ads faltan a cualquier usuario logueado de cualquier tenant.

## H-13 · 13 llamadas a `getServerSession()` sin `authOptions`
**Severidad:** HIGH — **[patrón YA CONOCIDO]** (`ERRORES_CLAUDE_NO_REPETIR.md` → `#RBAC-NEXTAUTH-SPLIT-BRAIN`)
**Evidencia:**
`aurum/context-autodetect:97`, `aurum/section-insight:93`, `chat:272`, `insights:151`, `memory/seed:14`, `onboarding:67,89`, `settings/api-keys:72`, `settings/custom-roles:62`, `settings/security/login-history:16`, `settings/security/password:17`, `sync/google-ads-only:11`, `sync/google-ads-test:9`.

**Qué está mal:** sin `authOptions`, los callbacks `session`/`jwt` de `src/lib/auth.ts` **no corren**. La sesión devuelta no tiene `organizationId`, ni `isStaff`, ni `allowedSections`, ni la resolución de View-as-Org/impersonate. El error ya documentado explica exactamente esto. Rutas afectadas incluyen `settings/custom-roles` (RBAC) y `settings/api-keys` (creación de credenciales).

**Escenario de falla concreto:** un usuario STANDARD entra a `/settings/api-keys`. Como la sesión no trae `organizationId`, el código o bien falla, o bien cae a un default. Si algún camino usa un fallback "primera org", el usuario ve o crea API keys de otro tenant. Y todo el gating por `isStaff` en esas 13 rutas es inoperante.

---

# MEDIUM

## M-1 · Cero telemetría: 519 `console.error` y un único destinatario de alertas hardcodeado
**Severidad:** MEDIUM (habilitador de todos los CRITICAL)
**Evidencia:** grep sobre `src/` y `package.json`: **0** ocurrencias de Sentry / `@sentry` / Datadog / logtail / OpenTelemetry. 519 `console.error`, 121 `console.log`. Único canal de alerta: `sendEmail` a un literal:
`cron/control-alerts/route.ts:31`, `cron/warm-cache/route.ts:52`, `cron/refresh-pixel-rollups/route.ts:67`, `lib/staff.ts:25` → `"tlapidus@99media.com.ar"`.
**Escenario:** esa casilla marca los mails de `nitrosales.ai` como spam (riesgo real: `ERRORES_CLAUDE_NO_REPETIR.md` → `#S55BIS3-NO-REPLY-SPAM` documenta problemas de entregabilidad en el dominio). A partir de ahí, **el sistema pierde su único sentido de la vista** y ninguno de los 11 CRITICAL de arriba tiene forma de manifestarse.

## M-2 · Cooldowns de alerta en memoria de proceso → no funcionan en serverless
**Severidad:** MEDIUM — **[decisión consciente documentada]** (`BACKLOG_PENDIENTES.md` → BP-ROLLUP-CRON: *"cooldown 6h (en memoria, sin dependencia de tablas)"*)
**Evidencia:** `cron/warm-cache/route.ts:115` — `let lastRollupTriggerAt = 0;` a nivel de módulo; mismo patrón para el cooldown del mail de stale.
**Qué está mal:** `warm-cache` corre cada 5 min y cada invocación puede caer en una instancia distinta (o fría). El cooldown no dedupa nada de forma confiable. En el otro extremo, si una instancia queda caliente y "se comió" el cooldown, una alerta legítima posterior se suprime.
**Escenario:** el pipeline se atrasa. Se manda 1 mail desde una instancia; las 11 corridas siguientes caen en instancias frías y mandan 11 mails más. Se aprende a ignorar la alerta. La próxima vez que es real, se ignora.

## M-3 · `useSyncStatus` declara éxito mirando `lastSyncAt`, que también se actualiza cuando el sync falla
**Severidad:** MEDIUM
**Evidencia:**
- `src/lib/hooks/useSyncStatus.ts:78` — considera el sync completo si `lastSyncAt` cambió respecto del valor inicial
- `src/lib/sync-tracker.ts:44` — `markSyncError` **también** escribe `lastSyncAt: new Date()`
- `useSyncStatus.ts:56` — `catch { return null }` sin log
- el hook nunca lee `lastSyncError`; `syncError` sólo se puebla desde el POST inicial o el timeout de 2,5 min

**Escenario:** el usuario abre `/campaigns/meta`. Se dispara el sync, falla, `markSyncError` actualiza `lastSyncAt`. El hook ve el cambio, apaga el spinner, llama `onSyncComplete()` y refresca los datos. El usuario ve la pantalla "actualizada" con los datos viejos de hace tres días y **ningún indicador de error**.

## M-4 · `/api/sync/trigger` sin `maxDuration`, y bloquea una lambda esperando otra
**Severidad:** MEDIUM
**Evidencia:** `src/app/api/sync/trigger/route.ts` — no exporta `maxDuration`; hace `waitUntil(fetch(syncUrl))` a **otra** ruta (líneas 76-84), que es una invocación separada.
**Qué está mal:** el `waitUntil` mantiene viva la lambda del *trigger* durante todo lo que tarde el sync interno. Se pagan y ocupan dos lambdas para el trabajo de una. Si el sync interno tarda más que el `maxDuration` heredado del trigger, éste muere sin registrar nada.

## M-5 · `attribution-reconcile` y `refresh-silver-orders`: comentarios de cabecera que mienten sobre si el cron corre
**Severidad:** MEDIUM
**Evidencia:** `cron/attribution-reconcile/route.ts:17-19` — *"NOTA DEPLOY: para que corra programado hay que agregar la entrada en vercel.json... Pendiente"*. Pero **sí está** en `vercel.json:100-102` (`*/30 * * * *`).
Contraste: `cron/refresh-silver-orders/route.ts:16-18` documenta haber sufrido este problema exacto: *"El comentario anterior decía 'NO está en vercel.json todavía' y llevaba semanas siendo falso — un header que miente sobre si un cron corre es peligroso justo cuando hay que diagnosticar por qué unos números no se actualizan."* La lección se escribió en un archivo y no se aplicó al otro.

## M-6 · `checkInactiveClients`: N+1 dentro de un loop sobre todas las organizaciones
**Severidad:** MEDIUM
**Evidencia:** `src/lib/control/checks.ts:186-210` — `for (const org of orgs)` con un `$queryRawUnsafe` de login + un `order.findFirst` por iteración. Hoy 4 orgs = 8 queries; escala linealmente. Corre cada 6h dentro de un `maxDuration = 60`.

## M-7 · `refresh-pixel-first-source` desagendado durante 5 semanas sin que nada avisara
**Severidad:** MEDIUM — **[YA CONOCIDO, documentado en el propio archivo]**
**Evidencia:** `cron/refresh-pixel-first-source/route.ts:33-37`: *"este cron estuvo DESAGENDADO desde el 2026-06-14 hasta el 2026-07-21 porque la versión vieja... pasaba los 300s. En ese hueco de 5 semanas la dimensión quedó congelada y `metrics/pixel` perdió del breakdown por canal a TODO visitante nuevo. **Si volvés a desagendarlo, ese agujero vuelve y NO avisa.**"*
**Qué falta:** el problema está diagnosticado y el aviso escrito, pero **no hay ningún check que compare el inventario de crons de `vercel.json` contra los crons esperados**. `checkPipelineFreshness` (usado en warm-cache) cubre las tablas del pipeline, pero no `pixel_visitor_first_source`.

## M-8 · `backfill-runner` corre cada minuto con un budget de 240s: solapamiento garantizado
**Severidad:** MEDIUM — **[parcialmente YA CONOCIDO]** (`BACKLOG_PENDIENTES.md` → BP-S59-009 Bug B: *"race condition del runner (overshoot del processedCount)"*)
**Evidencia:** `vercel.json:80-82` — `"* * * * *"`; `cron/backfill-runner/route.ts:42` — `LOOP_BUDGET_MS = 240_000`. La única protección es el cooldown de 2 min de `pickNextJob` basado en `lastChunkAt`.
**Escenario:** un chunk contra la API de VTEX tarda más de 2 minutos (perfectamente posible con la API OMS bajo carga). `lastChunkAt` envejece más allá del cooldown mientras el chunk sigue corriendo. El siguiente tick del cron toma el **mismo** job, con el mismo cursor, y lo procesa en paralelo. `processedCount` se sobrecuenta, la barra de progreso del onboarding muestra >100%, y algunos rangos se procesan dos veces mientras otros se saltean.

## M-9 · 96 `catch` vacíos o que descartan el error
**Severidad:** MEDIUM
**Evidencia:** 96 coincidencias de `catch {}` / `catch (e) {}` / `.catch(() => {})` en `src/app/` + `src/lib/`. Concentraciones:
- `app/api/fix-brands/route.ts` — **9** `catch (e) {}` (líneas 52, 91, 125, 143, 196, 221, 245, 287, 310)
- `app/api/admin/onboardings/[id]/reset-wipe/route.ts` — **7** (68, 76, 118, 126, 134, 144, 152, 167)
- `app/api/admin/reset-test-env/route.ts` — 3, durante un borrado en cascada
- `app/api/metrics/orders/route.ts:56` — el DDL (ver H-4)

## M-10 · 115 sitios de interpolación de string en SQL crudo para `organizationId`
**Severidad:** MEDIUM (defensa en profundidad; sin explotación conocida hoy)
**Evidencia:** `WHERE "organizationId" = '${ORG_ID}'` en 115 lugares, en `metrics/orders`, `metrics/ltv`, `bondly/clientes`, `bondly/clientes/[id]`, `alerts/rules`, `sync/vtex-details`, `backfill/vtex`.
**Verificado:** en todos los casos revisados el valor viene de `getOrganizationId()` (derivado de la sesión, un cuid) — **no es explotable hoy**. La excepción es `metrics/orders/route.ts:100-105`, donde `ORG_ID` puede venir de `?orgId=` — pero requiere además `?key=<ADMIN_API_KEY>`.
**Riesgo:** un solo cambio futuro que permita que un `orgId` llegue de query o body sin validar convierte 115 sitios en inyección SQL de golpe. El resto del repo ya usa parámetros posicionales; esto es inconsistencia, no necesidad.

## M-11 · El middleware de Prisma recorre recursivamente cada resultado convirtiendo `Decimal`
**Severidad:** MEDIUM
**Evidencia:** `src/lib/db/client.ts:14-27, 67-70` — `client.$use` corre `convertDecimalsToNumbers` sobre **todos** los resultados de **todas** las queries.
**Qué está mal:** para un `findMany` de decenas de miles de filas, esto es un recorrido recursivo completo del objeto en el hot path, en el mismo proceso que ya está peleando por CPU. `$use` además está deprecado en Prisma 5+ (reemplazado por `$extends`).

## M-12 · `Promise.all` sin límite sobre arrays de tamaño no acotado (4 sitios)
**Severidad:** MEDIUM
**Evidencia:**
- `app/api/admin/vtex-probe/route.ts:136` — `Promise.all(targets.map(...))`
- `app/api/admin/debug-vtex-order-vs-order/route.ts:78,79`
- `lib/onboarding/credential-tests.ts:218-220` — **tres** `Promise.all` anidados sobre `skusToCheck`, cada uno haciendo un `vtexFetch`
**Escenario:** `credential-tests` se ejecuta desde el wizard de onboarding. Si `skusToCheck` crece, se disparan 3×N llamadas simultáneas a VTEX → rate-limit de VTEX → el test de credenciales falla y el cliente cree que sus credenciales están mal.

---

# LOW

- **L-1 · `err.stack` filtrado al cliente.** `cron/vtex-sync-recent/route.ts:107` — `{ error: err.message, stack: err.stack?.slice(0,500) }`. También `error.message` crudo en `webhooks/vtex/orders:796` y en la mayoría de los `catch` de rutas admin.
- **L-2 · Mojibake en el código fuente.** `app/api/backfill/vtex/route.ts` tiene bloques de comentario con doble/triple mis-encoding UTF-8 (miles de caracteres). También `analyze/creative/route.ts:20`. Cosmético, pero indica ediciones con encoding roto.
- **L-3 · Dominio hardcodeado en 6+ sitios.** `"https://app.nitrosales.ai"` como fallback de `NEXTAUTH_URL` en `sync/route.ts:19`, `sync/trigger:73`, `cron/vtex-sync-recent:43`, `cron/backfill-runner:143`, `cron/post-backfill-finalize:54`, `approve-backfill:181`. Y `"https://nitrosales.vercel.app"` en `lib/alerts/engine.ts:217` (link dentro de un email a clientes: apunta al dominio viejo).
- **L-4 · `GET` público en el webhook de VTEX.** `webhooks/vtex/orders/route.ts:800-808` responde 200 sin key, confirmando la existencia del endpoint.
- **L-5 · `.env.example` desactualizado.** No documenta `ADMIN_API_KEY`, `SYNC_KEY`, `CRON_SECRET`, `VERCEL_AUTOMATION_BYPASS_SECRET`, `WEBHOOK_ENFORCE`, `VTEX_WEBHOOK_SECRET`, `SILVER_ORDERS_ENABLED`, `RESEND_API_KEY`, `ADMIN_EMAIL`. Sí documenta `GA4_*` que está deprecado (`sync/route.ts:76-77`).
- **L-6 · `useSyncStatus` dispara un sync en cada montaje** cuando la plataforma nunca sincronizó (`lib/hooks/useSyncStatus.ts:140-143`).
- **L-7 · Documentación desincronizada con el código.** `CLAUDE.md` REGLA #3b dice "pool = 8, nunca más de 3 queries en paralelo"; el código usa 24 y dispara 29. `CLAUDE.md` dice "MercadoLibre: cron 1x/día 2am"; ese cron no está agendado (C-6). `src/lib/db/client.ts` tiene tres pares de valores contradictorios entre comentarios y código (H-3).
- **L-8 · 121 `console.log` en producción**, incluyendo los hot paths de webhooks (`webhooks/vtex/orders:84`, `webhooks/mercadolibre:56` — este último con un comentario `// Log for debugging (remove in production later)`).
- **L-9 · Sin archivos `.bak`/`.old`/`.orig` en el árbol** — los backups mencionados en el backlog fueron limpiados correctamente. ✅

---

# Anexo A — Inventario de crons

Los 28 schedules de `vercel.json`. "Alerta" = ¿alguien se entera si falla?

| # | Cron | Schedule (UTC) | `maxDuration` | Auth contra | Qué hace | Riesgo |
|---|---|---|---|---|---|---|
| 1 | `/api/sync` | `0 3 * * *` | **60** | `NEXTAUTH_SECRET` | Red de seguridad diaria VTEX: hasta 50 páginas de órdenes × N orgs, secuencial | 🔴 60s no alcanza (H-2). `markSyncSuccess` incondicional (C-4). Sin alerta |
| 2 | `/api/cron/vtex-sync-recent` | `*/30 * * * *` | 300 | `ADMIN_API_KEY` \|\| `NEXTAUTH_SECRET` | Últimas ~3h de órdenes VTEX, 5 orgs en paralelo, `max=100` | 🟠 Cap de 100 insuficiente para Arredo (H-6). Filtra stack (L-1) |
| 3 | `/api/sync/chain` | `30 */2 * * *` | **60** | `NEXTAUTH_SECRET` | inventory + vtex-details + reconcile, N orgs secuencial | 🔴 Self-fetch a `nextUrl.origin` → 401 (C-5). Sólo 1 org entra en 60s (H-2). `markSyncSuccess` incondicional (C-4) |
| 4 | `/api/cron/anomalies` | `0 9 * * *` | 60 | **`SYNC_KEY`** | Detección de anomalías | 🟠 Secreto distinto (C-2) |
| 5 | `/api/cron/digest` | `0 10 * * 1` | 60 | **`SYNC_KEY`** | Digest semanal por email al cliente | 🟠 Secreto distinto (C-2); si no coincide, el cliente deja de recibirlo |
| 6 | `/api/sync/gsc` | `0 9 * * *` | — | — | Search Console | 🟡 Sin timeout ni retry en el conector (`lib/connectors/gsc.ts`) |
| 7 | `/api/sync/competitors` | `0 6 * * *` | 60 | — | Scraping de competidores | 🟢 |
| 8 | `/api/cron/ml-missed-feeds` | `*/30 * * * *` | 300 | `ADMIN_API_KEY` | Rescate de `/missed_feeds` de ML | 🟠 No cubre los webhooks que ACKeamos y rompimos (C-9). Race de token (H-7) |
| 9 | `/api/cron/ml-reconcile` | `0 */2 * * *` | 300 | `ADMIN_API_KEY` | Reconciliación por watermark | 🟠 Race de token en el minuto :00 con el #8 (H-7) |
| 10 | `/api/cron/ml-reconcile?mode=deep` | `0 3 * * *` | 300 | `ADMIN_API_KEY` | Reconcile profundo | 🟠 idem |
| 11 | `/api/cron/influencer-summary` | `0 10 1 * *` | 60 | `NEXTAUTH_SECRET` | Resumen mensual Aura | 🟠 Secreto distinto (C-2) |
| 12 | `/api/cron/ads-utm-audit` | `0 12 * * *` | 60 | **`SYNC_KEY`** | Auditoría de UTMs | 🟠 Secreto distinto (C-2) |
| 13 | `/api/cron/exchange-rates` | `0 15 * * *` | 60 | **`SYNC_KEY`** | Cotización del dólar (dolarapi.com) | 🟠 Devuelve `{status:200}` explícito ante fallo (líneas 88) |
| 14 | `/api/cron/inflation-index` | `0 13 16 * *` | 60 | **`SYNC_KEY`** | Índice de inflación | 🟠 Tres `{status:200}` ante fallo (67, 75, 91) |
| 15 | `/api/cron/alerts-scheduler` | `*/15 * * * *` | 300 | `ADMIN_API_KEY` | Dispara alertas programadas (secuencial ✅) | 🔴 `catch{return[]}` → "0 reglas, todo ok" (H-11) |
| 16 | `/api/cron/control-alerts` | `0 */6 * * *` | 60 | `ADMIN_API_KEY` | **El health-check del producto** | 🔴 Ciego por C-4 y C-10. Mail a una sola casilla (M-1) |
| 17 | `/api/cron/backfill-runner` | `* * * * *` | 300 | `ADMIN_API_KEY` | Procesa chunks de backfill (budget 240s) | 🔴 Solapamiento cada minuto vs budget de 240s (M-8). Fire-and-forget sin `waitUntil` a finalize (C-10) |
| 18 | `/api/cron/meta-token-refresh` | `0 5 * * *` | 300 | `ADMIN_API_KEY` | Renueva tokens de Meta (✅ marca `status: ERROR`) | 🟡 `ok:true` aunque `failed: N`; nadie lee el resultado |
| 19 | `/api/cron/warm-cache` | `*/5 * * * *` | 300 | `ADMIN_API_KEY` | Precalienta caché + watchdog de frescura + alerta de stale | 🟢 El mejor cron del repo (bypass ✅, timeout por fetch ✅, budget ✅). 🟡 cooldown en memoria (M-2) |
| 20 | `/api/cron/refresh-pixel-first-source` | `7,37 * * * *` | 800 (real 300) | `ADMIN_API_KEY` | first-touch por visitante | 🟡 Bypass ✅. Historia de haber estado 5 semanas desagendado sin aviso (M-7) |
| 21 | `/api/cron/refresh-pixel-rollups` | `3,18,33,48 * * * *` | 800 (real 300) | `ADMIN_API_KEY` | Rollups HLL diarios del pixel | 🟢 Gap-aware + auto-reparable; sin self-fetch (fix BP-ROLLUP-CRON aplicado) |
| 22 | `/api/cron/attribution-reconcile` | `*/30 * * * *` | 300 | `ADMIN_API_KEY` | Red de seguridad de atribución (40 órdenes/org) | 🟡 Comentario de cabecera dice que no está agendado — mentira (M-5). Límite bajo (H-6) |
| 23 | `/api/cron/refresh-silver-orders` | `0,30 * * * *` | 300 | `ADMIN_API_KEY` | Capa silver medallion | 🟢 Idempotente, con flag y budget |
| 24 | `/api/cron/refresh-gold-daily-revenue` | `15,45 * * * *` | 300 | `ADMIN_API_KEY` | Gold: revenue diario | 🟡 Tabla no está en `schema.prisma` (C-11) |
| 25 | `/api/cron/refresh-gold-attribution` | `20,50 * * * *` | 300 | `ADMIN_API_KEY` | Gold: atribución | 🟡 idem |
| 26 | `/api/cron/refresh-gold-attribution-channel` | `25,55 * * * *` | 300 | `ADMIN_API_KEY` | Gold: atribución por canal | 🟡 idem |
| 27 | `/api/cron/refresh-product-dimensions` | `30 4 * * *` | 300 | `ADMIN_API_KEY` | Dimensión de productos | 🟢 |
| 28 | `/api/cron/refresh-pixel-name-dict` | `0 5 * * *` | 300 | `ADMIN_API_KEY` | Diccionario de nombres de producto | 🟢 |

**En disco pero NO agendados:**

| Cron | Estado | Nota |
|---|---|---|
| `/api/cron/ml-sync` | ❌ No está en `vercel.json` | **`CLAUDE.md` afirma que corre 1×/día a las 2am. No corre.** Y es fail-open sin auth (C-6) |
| `/api/cron/post-backfill-finalize` | ❌ No está en `vercel.json` | Depende de un único `fetch` fire-and-forget sin `waitUntil` desde `backfill-runner:147`. Si se pierde, no hay reintento (C-10) |

**Colisiones de horario a vigilar:** minuto `:00` de horas pares → `ml-missed-feeds` + `ml-reconcile` (race de token OAuth, H-7). Minuto `:30` de horas pares → `sync/chain` + `refresh-silver-orders` + `vtex-sync-recent`, los tres pegándole a `orders` a la vez. Las 03:00 UTC → `/api/sync` + `ml-reconcile deep`. Y `backfill-runner` corre siempre, encima de todo.

---

# Anexo B — Endpoints de debug/test vivos en producción

| Endpoint | Guard | Riesgo |
|---|---|---|
| `/api/debug/meta` | **NINGUNO** | 🔴 **Público. Cuenta global de órdenes/clientes/productos + 3 `orderItem` reales de cualquier tenant** (H-8) |
| `/api/cron/ml-sync` | fail-open si falta `CRON_SECRET` | 🔴 Dispara syncs ML de todas las orgs (C-6) |
| `/api/admin/reset-test-env` | `isInternalUser()` | 🔴 Borra org+usuarios+órdenes+clientes+productos. 3 `catch{}` durante el cascade |
| `/api/admin/debug-org` | key \|\| `isInternalUser()` | 🟠 Emails y roles de todos los usuarios de cualquier org |
| `/api/admin/debug-test-creds` | `maxDuration:300` + guard | 🟠 Prueba credenciales de todas las conexiones |
| `/api/admin/debug-vtex-raw-emails` | key/internal | 🟠 Emails de clientes crudos |
| `/api/admin/debug-vtex-emails-by-channel` | key/internal | 🟠 idem |
| `/api/admin/debug-orders-emails-shown` | key/internal | 🟠 idem |
| `/api/admin/debug-vtex-hook-config` | key/internal | 🟠 Config de webhooks de VTEX (incluye la URL con el secreto) |
| `/api/admin/debug-vtex-affiliates` | key/internal | 🟡 |
| `/api/admin/debug-vtex-webhook-traffic` | key/internal | 🟡 |
| `/api/admin/debug-vtex-enrichment` | key/internal | 🟡 3 catch → `{ok:false}` con 200 |
| `/api/admin/debug-vtex-order-vs-order` | key/internal | 🟡 2 `Promise.all` sin límite (M-12) |
| `/api/admin/debug-flip-onboarding` | key/internal | 🟠 **Muta el estado de un onboarding** |
| `/api/admin/debug-flip-my-test` | key/internal | 🟠 Muta estado |
| `/api/admin/debug-email-flow`, `debug-email-test`, `debug-resend-confirmation` | key/internal | 🟠 **Envían emails reales** |
| `/api/admin/debug-ml-backfill` | key/internal | 🟡 2 `catch {}` |
| `/api/admin/debug-view-as` | key/internal | 🟠 Relacionado a impersonate |
| `/api/admin/debug-tvc-orders`, `debug-tvc-when-inserted` | key/internal | 🟡 Hardcodeados a un cliente específico |
| `/api/admin/debug-channel-sources`, `debug-cr-by-device`, `debug-orders-deep`, `debug-orders-attribution-detail`, `debug-pixel-attribution`, `debug-touchpoint-campaigns` | key/internal | 🟡 Solo lectura |
| `/api/control/debug-errors` | `isInternalUser()` | 🟢 Correcto |
| `/api/sync/google-ads-test` | `getServerSession()` **sin authOptions** | 🟠 Revela qué env vars faltan (H-13) |
| `/api/sync/ml-test` | `NEXTAUTH_SECRET` \|\| `ADMIN_API_KEY` | 🟠 Fuerza refresh de token ML → puede disparar la race H-7 |
| `/api/admin/test-vtex-masterdata-cl` | key/internal | 🟡 |
| `/api/me/vtex-test`, `/api/onboarding/test-credentials`, `/api/admin/onboardings/[id]/test-credentials` | sesión | 🟢 Legítimos del wizard |
| `/api/fix-brands` | literal `"nitrosales-backfill-2024"` | 🔴 Secreto hardcodeado + globals de credenciales (C-7) + 9 `catch{}` |
| `/api/backfill/vtex` | literal `"nitrosales-backfill-2024"` | 🔴 idem (C-7) |

**Además: 36 endpoints `/api/admin/migrate-*`** vivos, todos con `ADD COLUMN IF NOT EXISTS` (idempotentes ✅, salvo `migrate-onboarding-form-simple` que no se pudo verificar), pero **sin ningún registro de cuáles se ejecutaron ya**. `CLAUDE.md` documenta el estado de 3 de los 36.

---

# Anexo C — Rutas cuyo `catch` devuelve HTTP 200

Con `{ status: 200 }` explícito:
`metrics/pixel:1995` · `metrics/orders/enrich:116,399` · `cron/exchange-rates:88` · `cron/inflation-index:67,75,91`

Con 200 implícito (`NextResponse.json` sin `status` dentro de un `catch`):
`webhooks/vtex/orders:794` 🔴 · `webhooks/vtex/inventory:293` 🔴 · `sync/vtex-details:176,229,282,349` (devuelven `ok:true` en el catch) · `sync/ml-test:114` · `sync/google-ads-test:89` · `admin/reattribute:40` (`success:true` en el catch) · `admin/email-log:63` y `email-log/for-email:34` (`ok:true, rows:[]`) · `admin/debug-email-flow:79` · `admin/debug-vtex-enrichment:60,102,123` · `admin/debug-test-creds:114` (`ok:true` en el catch) · `dashboard/preferences:110`

---

# (a) Resumen por severidad

| Severidad | Cantidad | Hallazgos |
|---|---|---|
| 🔴 **CRITICAL** | **11** | C-1 secreto de sesión como API key · C-2 cuatro secretos / un literal · C-3 webhook VTEX 200 al fallar · C-4 `markSyncSuccess` incondicional · C-5 self-fetch 401 en `sync/chain` · C-6 `ml-sync` fail-open · C-7 credenciales VTEX en globals de módulo · C-8 dashboard miente en cero · C-9 webhook ML sin reintento · C-10 onboarding `BACKFILLING` invisible · C-11 30 tablas fuera de `schema.prisma` |
| 🟠 **HIGH** | **13** | H-1 sync-lock roto · H-2 `maxDuration` irreal · H-3 pool/statement_timeout · H-4 DDL en el dashboard · H-5 `webhookSecret` cruzado · H-6 redes de seguridad capadas · H-7 race de token ML · H-8 `/api/debug/meta` público · H-9 207 rutas con `@ts-nocheck` · H-10 `Promise.all` en alertas · H-11 alertas con `catch{return[]}` · H-12 37 endpoints debug/test vivos · H-13 13 `getServerSession()` sin `authOptions` |
| 🟡 **MEDIUM** | **12** | M-1 cero telemetría · M-2 cooldowns en memoria · M-3 `useSyncStatus` falso positivo · M-4 `sync/trigger` sin `maxDuration` · M-5 comentarios que mienten sobre crons · M-6 N+1 en `checkInactiveClients` · M-7 cron desagendado sin aviso · M-8 solapamiento de `backfill-runner` · M-9 96 `catch` vacíos · M-10 115 interpolaciones SQL · M-11 middleware Prisma recursivo · M-12 `Promise.all` sin límite (4 sitios) |
| 🔵 **LOW** | **9** | L-1 a L-9 |
| **TOTAL** | **45** | de los cuales **8 marcados [YA CONOCIDO]** (C-8, C-10, C-11, C-5 parcial, H-13, M-2, M-7, M-8) |

---

# (b) Los 3 escenarios que más probablemente rompan producción el mes que viene

### 1️⃣ Alguien rota `NEXTAUTH_SECRET` (o `ADMIN_API_KEY`) y se cae media plataforma en silencio
**Probabilidad: alta.** Es la acción más natural del mundo — endurecer la seguridad después de una auditoría, o rotar credenciales tras la salida de alguien. Y el propio código ya anticipa este modo de falla en un mensaje de error (`cron/refresh-pixel-first-source:207`).
**Qué pasa:** en el mismo minuto se caen `/api/sync` (safety net diario de VTEX), `/api/sync/chain` (inventario + detalles + reconcile cada 2h), `/api/sync/trigger` (Meta/Google on-demand), los 5 crons que usan `SYNC_KEY`, los 36 endpoints de migración, y —lo más grave— **el webhook de órdenes de VTEX de los cuatro clientes**. Vercel no alerta por 401 en crons. `control-alerts` sigue verde porque `markSyncSuccess` ya no corre pero `lastSuccessfulSyncAt` tarda 24h en cruzar el umbral… y cuando cruce, el mail va a una sola casilla.
**Se descubre:** cuando Arredo o TeVeCompras llame preguntando por qué no ve las ventas de ayer. Días después.
**Hallazgos:** C-1, C-2, C-3, C-4, M-1.

### 2️⃣ Pico de tráfico (Hot Sale / CyberMonday) → Neon se satura → se pierden las órdenes de mayor ticket y el dashboard se congela en cero
**Probabilidad: alta.** Es literalmente lo que pasó en el onboarding de Arredo (BP-NEON-CAPACITY: *"Neon se degradó/cayó repetidas veces"*), y noviembre trae el pico del año en Argentina.
**Cadena:** más órdenes → el webhook de VTEX (30s, sin timeout en el fetch a la OMS, N+1 de hasta 60 queries por orden) se pasa del tiempo en las órdenes de más ítems → devuelve 200 → VTEX no reintenta → **las órdenes de mayor ticket son exactamente las que se pierden**. En paralelo, el dashboard con 29 queries contra un pool de 24 y `pool_timeout=160s` devuelve el mock en cero → `warm-cache` cachea ese cero → todos los usuarios de la org ven todo en cero. `vtex-sync-recent` sólo puede recuperar 100 órdenes por corrida.
**Se descubre:** el cliente ve el dashboard en cero durante el evento más importante del año, y después descubre que los números nunca cuadraron con VTEX.
**Hallazgos:** C-3, C-8, H-3, H-4, H-6, M-11.

### 3️⃣ Se onboardea al quinto cliente y el backfill nunca se corre (o se corre a medias) sin que nadie avise
**Probabilidad: media-alta.** Ya pasó exactamente así con Arredo, está documentado como error a no repetir, y **el mecanismo que lo permitió sigue intacto**.
**Tres caminos independientes al mismo resultado:** (a) `historyVtexMonths = 0` → 0 jobs creados, el endpoint devuelve `ok:true`, el onboarding entra a `BACKFILLING` y el cliente recibe el mail de "empezamos"; (b) el `fetch` fire-and-forget a `post-backfill-finalize` (sin `waitUntil`) se pierde al congelarse la lambda → nunca corren el catalog-refresh, el recompute de agregados ni el backfill de `costPrice` → **el P&L entero queda en cero**; (c) `backfill-runner` se solapa consigo mismo, sobrecuenta `processedCount`, la barra llega a 100% y se saltea rangos.
**En los tres casos**, `checkStuckOnboardings` **no mira el estado `BACKFILLING`**, así que el onboarding es invisible para el Centro de Control para siempre.
**Se descubre:** cuando el cliente dice "los gráficos me muestran 3 días" — la frase textual del caso Arredo.
**Hallazgos:** C-10, C-4, M-8, M-1.

---

## Nota de método

Todo lo anterior es análisis estático del árbol de trabajo. Cuatro cosas **no** se pudieron verificar sin acceso a producción y quedan marcadas **SIN CONFIRMAR**:

1. Si `ADMIN_API_KEY`, `NEXTAUTH_SECRET` y `SYNC_KEY` valen efectivamente `"nitrosales-secret-key-2024-production"` en Vercel. **Verificable sin riesgo** ejecutando cada cron a mano desde `app.nitrosales.ai` y mirando el status. Es la comprobación con mejor relación costo/beneficio de toda esta lista: si alguno da 401/403, hay crons muertos ahora mismo.
2. Qué migraciones de las 36 se ejecutaron realmente en la DB de producción. Verificable con un `information_schema.columns` contra las columnas que cada endpoint agrega.
3. Si `NEXTAUTH_URL` apunta al dominio custom (de eso dependen seis self-fetch, C-5).
4. Si Fluid Compute está activo con concurrencia por instancia (condición de explotación de C-7). Los comentarios del propio código lo dan por sentado.
