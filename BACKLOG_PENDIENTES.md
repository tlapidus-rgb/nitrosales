# BACKLOG_PENDIENTES.md — Temas pendientes de NitroSales

> **Propósito**: tracker vivo de temas que Tomy decidió no abordar ahora, pero que quedan registrados para no perderlos. Claude lee este archivo al inicio de cada sesión junto con `CLAUDE.md`, `CLAUDE_STATE.md` y `ERRORES_CLAUDE_NO_REPETIR.md`.
>
> **Cómo funciona**:
> - Tomy puede pedirle a Claude que cargue un tema nuevo acá en cualquier momento.
> - Cada ítem tiene contexto, prioridad, estado, y cuándo entró al backlog.
> - Cuando un ítem se resuelve, se marca como `✅ resuelto` con la sesión y commit(s), y se archiva en la sección "Resueltos".
> - Cuando un ítem se descarta, se marca como `🗑 descartado` con la razón.
>
> **Última actualización**: 2026-06-12 — Agregado **BP-ROLLUPS-001**: endpoint admin `setup-pixel-rollups`
> (crea hll + 7 tablas rollup + backfill chunked, idempotente y resumible) que destraba el BLOCKER #1 del
> deploy. Pasó /gstack-review + /gstack-cso, tsc exit 0, NADA pusheado. Ver también BP-I1/BP-I4/BP-M1/BP-CORE-001
> de la misma tanda de deploy. Agregado **BP-PERF-CONVERSION** (hallazgo del QA: `/api/metrics/conversion`
> escanea `pixel_events` crudo, lento en orgs grandes — pre-existente, no regresión, follow-up).
>
> _(Anterior: 2026-05-02 noche tarde — Sesion 60 EXT-2 BIS. 5 bugs: unificacion Funnel+Conversion por Canal a
> first-touch, fix guard marketplace prefijos, cron VTEX 30 min, recuperacion autonomia Claude via WebFetch,
> tooltips por modulo. Pendientes BP-S60-002/004/005 sin cambios.)_

---

## ⏳ BP-SKELETON-001 — Skeleton loading en 3 páginas demo (branch `fix/skeleton-loading`, 2026-06-15)

> **Estado:** ⏳ HECHO EN BRANCH, **sin mergear** (el merge lo decide Tomy). tsc 0 · next build 0.
> Medido en prod + verificado local (branch prod-local-axel). Detalle completo:
> `~/Documents/NitroSales-Diagnostico/CHECKLIST_DEMO_JUEVES.md`.
>
> **Síntoma:** las páginas cargaban pero los datos quedaban en skeleton gris / $0 mucho tiempo.
>
> 1. **/nitropixel (CR-4)** — `asset-stats` 3,6–28s en prod (query cruda `topSources` GROUP BY +
>    counts 24h/7d). Fix: portadas a rollups (`pixel_daily_aggregates` + `pixel_daily_source`) +
>    `maxDuration`. → **142–523ms** local. `src/app/api/nitropixel/asset-stats/route.ts`.
> 2. **Centro de Control** — el loader bloqueaba el skeleton full-page en `Promise.all` (esperaba al
>    endpoint más lento ~2,5–5s) aunque los KPIs (`/api/metrics`) estaban en 669ms. Fix: render
>    progresivo (merge incremental + guard anti-race). `src/app/(app)/dashboard/page.tsx`.
> 3. **/pixel/analytics** — `funnel` `channel="all"` hacía `COUNT(DISTINCT)` crudo → **>30s timeout**.
>    Fix: portado al rollup `pixel_daily_aggregates` (misma query que el funnel de `/api/metrics/pixel`
>    → números coinciden con el card, objetivo de PR #4) + `maxDuration`. Compra intacta.
>    `src/app/api/metrics/pixel/funnel/route.ts`. → **173–652ms** local.
>
> **No requiere migración** (solo LEE rollups ya existentes en prod). Backups `.bak` de los 3 archivos.
>
> **Residuales (NO en esta branch):** `/api/metrics/conversion` timeout (CR-3, no toca estas páginas) ·
> `/api/metrics/pixel` cold 30d ~20s (lo sostiene el warm-cron; fix robusto = cache compartido KV) ·
> funnel con filtro de canal específico sigue crudo.

---

## 🟡 BP-ROLLUP-REFRESH — Rollups del pixel se desactualizaban (sin cron de refresh) (2026-06-14)

> **Detectado** en la auditoría post-merge (2026-06-14): los rollups HLL del pixel tenían datos hasta el
> 12-jun; 13 y 14-jun salían en **0** en NitroPixel Analytics. **Causa raíz:** el backfill
> (`setup-pixel-rollups?phase=backfill`) solo se corría a mano; NO existía cron que reconstruyera los días
> nuevos. `warm-cache` solo calienta el cache SWR, NO reconstruye rollups. Era un prerequisito documentado
> en `LISTO_PARA_DEPLOY.md §3` que nunca se agendó.

**PASO 1 (hecho, 2026-06-14):** se corrió a mano el backfill 12→14-jun en prod
(`POST /api/admin/setup-pixel-rollups?phase=backfill&from=2026-06-12&to=2026-06-14`). Verificado: 13-jun
8.110 visitantes, 14-jun 4.236 (eran 0). `phase=status` → dayRange hasta 2026-06-14.

**PASO 2 (branch `fix/rollup-refresh`, PENDIENTE OK de Tomy para mergear):** cron nuevo
`/api/cron/refresh-pixel-rollups` (cada 2 h) que reconstruye los últimos 3 días.
- **Diseño:** self-fetch a `POST setup-pixel-rollups?phase=backfill&from&to` → REUTILIZA la lógica validada
  (cero duplicación de SQL). Idempotente (upsert), cubre gaps de hasta 3 días, resumible por cursor, auth
  fail-closed (vercel-cron UA o key). Mismo patrón que `warm-cache`. `vercel.json`: `0 */2 * * *`.
- **Review (/gstack-review):** sin findings P0/P1. tsc exit 0.
- **first-source (cron creado pero DESHABILITADO — no escala):** se agregó
  `/api/cron/refresh-pixel-first-source` y se agendó 1×/día, PERO al verificarlo en prod **falla**:
  `setup-pixel-rollups?phase=first-source` no termina UN org grande dentro del `maxDuration=300` de la función
  (Arredo 11,6M / EMDJ 6M → el `DISTINCT ON` de historia completa por org tarda >300s y la función se mata;
  verificado: POST directo orgCursor=0 → HTTP 000 a los 295s). Esa fase es resumible POR ORG pero NO dentro
  de un org, así que nunca completa el org grande → el cron devolvía 500 y disparaba un scan pesado e inútil
  cada noche. **Se quitó el schedule de `vercel.json`** (la route queda en el repo, sin agendar). El cron de
  rollups (cada 2h) NO se toca y sigue funcionando.
- **FIX correcto pendiente (BP-ROLLUP-FIRSTSOURCE-INCR):** hacer la fase first-source INCREMENTAL — procesar
  solo visitantes nuevos (no presentes en `pixel_visitor_first_source`) acotando por ventana de tiempo
  reciente, en vez de reconstruir toda la historia de cada org. Liviano y dentro del timeout. Requiere tocar
  `setup-pixel-rollups` con review de correctitud (first-touch). Mientras tanto, el breakdown `bySource` de
  visitantes brand-new puede quedar levemente atrasado (impacto de segundo orden; los demás rollups OK).
- **Deuda compartida:** el cron de rollups manda `ADMIN_API_KEY` en la URL (queda en logs) — mismo patrón que
  el resto de los crons; se cierra con la migración a `CRON_SECRET` (BP-M1).

**Estado:** PASO 1 resuelto en prod. PASO 2: cron de rollups (cada 2h) DEPLOYADO y verificado funcionando en
prod. Cron de first-source creado pero DESHABILITADO (no escala) — pendiente fix incremental.

---

## ✅/🟡 BP-CONSIST-PIXEL — Inconsistencia "órdenes atribuidas vs funnel compras" (2026-06-12)

> **Reporte del dueño:** "7d: 420 órdenes atribuidas pero 330 compras en el funnel — están mal".
> **Diagnóstico (EMDJ 7d, reproducido):** funnel compras=742 vs atribuidas=939 (misma proporción 1,27 que 330/420).
> **NO es un bug — es diferencia de DEFINICIÓN, ambas correctas:**
> - **"Órdenes atribuidas" (939)** = órdenes REALES (tabla orders) con atribución NITRO. Coincide **98,3%** con
>   las órdenes web del módulo Pedidos (955) y el revenue con Finanzas ($51,16M vs $52,05M). Cross-module ✅.
> - **"Funnel compras" (742)** = VISITANTES distintos que dispararon el evento PURCHASE del pixel (client-side).
>   Es menor porque: (a) ~20% de compras reales no disparan el evento (bloqueadores, cierre de pestaña, checkout
>   server-side) pero igual se atribuyen por email (145 órdenes así), y (b) compradores repetidos = 1 visitante
>   pero N órdenes (23). + HLL ~2% en buckets chicos.
> - Funnel monótono (visitas 55033 ≥ producto 29990 ≥ carrito 4395 ≥ checkout 2913 ≥ compra 742). ✅
>
> **FIX (decisión del dueño: "diferencia legítima → explicarla en la UI"):** tooltips nuevos en `/pixel/analytics`
> (header del Funnel + KPI "Órdenes Atribuidas") que aclaran qué mide cada uno y por qué difieren. Backup:
> `pixel-analytics-page.tsx.bak`.

---

## ✅ BP-PERF-DASHBOARD — Páginas lentas: /nitropixel + Centro de Control (2026-06-12)

**PÁGINA 2 — /nitropixel (Activo Vivo): ARREGLADA (root cause real).**
`/api/nitropixel/asset-stats` hacía `COUNT(*)` sobre ~11,6M pixel_events + COUNT sobre ~932K visitors para los
totales all-time (~37s; el fix previo de receivedAt→timestamp solo cubrió los conteos por ventana, no los
all-time). + un `date_trunc+COUNT` 30d (2,6s). **Fix:** totales desde el rollup `pixel_daily_aggregates`
(SUM + HLL) y timeline desde el rollup. **37,6s → 0,76s warm** (medido). Bonus: usa los mismos rollups que
`/pixel` → números consistentes entre páginas. Backup `asset-stats-route.ts.bak`.

**PÁGINA 1 — Centro de Control: causas raíz arregladas.**
1. **Doble batch de fetches:** el dashboard fetcheaba ~40 endpoints con `DEFAULT_LAYOUT` y de nuevo al cargar las
   preferencias (setLayout). **Fix:** gate `prefsLoaded` → 1 sola tanda. Backup `dashboard-page.tsx.bak`.
2. **SWR roto (stale = recompute bloqueante ~13-17s):** `/api/metrics/pixel` y `/api/metrics/products` servían
   sólo cache fresh; al expirar el fresh window (5 min) el siguiente request recomputaba bloqueante (pixel ~13-17s,
   products ~58s en branch throttleado). El lib `api-cache` ya soportaba SWR pero el route nunca implementó el
   serve-stale. **Fix:** `computeAndCache()` + serve stale instant + refresh background con lock anti-herd
   (`tryAcquireRefreshLock`). **Verificado: stale 13s → 0,05s** (sirve stale al instante). El lock evita el
   thundering-herd que motivó el revert previo (aquello era el cron warm-cache, 32 fetches; esto es 1 por key).
   Backups `pixel-route.ts.bak-preswr`, `products-route.ts.bak`.

**✅ WARM-CRON (2026-06-12, RESUELTO):** el endpoint `/api/cron/warm-cache` YA existía pero (1) NO estaba
agendado en `vercel.json` y (2) hacía `Promise.all(orgs.map(...))` = el thundering-herd que motivó el revert
del SWR. Arreglado: ahora **secuencial** (org→rango→endpoint, 1 fetch a la vez, con presupuesto de tiempo) y
warmea **pixel + products** (antes warmeaba orders, que es liviano). **Agendado cada 5 min** en `vercel.json`
(mantiene el cache dentro del fresh window de 5 min). Backup `warm-cache-route.ts.bak`. Para que el cron pueda
warmear products sin sesión, se agregó el bypass `?orgId=X&key=KEY` a `/metrics/products` (mismo patrón que
`/metrics/pixel`). Verificado en vivo: 3 orgs × 4 rangos × 2 endpoints = 24 requests secuenciales, 23/24 ok;
el cache hit posterior es instant (EMDJ pixel 30d 0,025s). Limitación serverless documentada (cache por-instancia;
solución multi-instancia completa = Vercel KV, follow-up).

**🐛 BUG ENCONTRADO Y CORREGIDO por el test del warm-cron — products 500 `RangeError: Invalid time value`:**
`/api/metrics/products` tiraba 500 para orgs con un producto de mucho stock y venta muy lenta (ej: TeVe 30d):
`daysOfStock = stock/dailySalesRate` daba un número astronómico → `new Date(now + daysOfStock días)` desbordaba
el rango máximo de Date → `.toISOString()` tiraba RangeError y mataba TODO el endpoint. **Pre-existente**, rompía
el widget de productos del dashboard para esas orgs. Fix: guard `Number.isFinite + daysOfStock<36500 (100 años)
+ !isNaN`; más allá de 100 años stockoutDate=null ("sin riesgo de quiebre"). Verificado: TeVe 30d ahora 200.
Backup `products-route.ts.bak`.
- **No se pudo validar el tiempo absoluto de carga en localhost:** el branch Neon `prod-local-axel` THROTTLEA los
  scans crudos (~8x); las queries frías dan 14-58s acá que en prod (sin throttle, rutas pre-compiladas) son ~2-7s.
  Las lecturas de rollup/cache (que es lo que sirve el 99% de los requests) SÍ son fiables y dan <2s.
  **Recomendación:** validar tiempos finales en un entorno prod-like (no throttleado).
- **`/api/metrics/products` query 30d pesada** (joins order_items×products): candidata a portar a rollups en una
  tanda futura (igual que se hizo con `/pixel`). No bloquea (SWR + cron lo mitigan).

---

## ✅ BP-VERIFY-20260612 — Verificación final pre-deploy (atribución 5 caminos + QA visual + canary)

**P2 — Atribución 100% going-forward: los 5 caminos corren la atribución (verificado).**
| Camino | Mecanismo | Evidencia |
|---|---|---|
| (a) Webhook VTEX | `calculateAttribution` | `webhooks/vtex/orders/route.ts:687` |
| (b) sync/vtex (cron diario) | `attributeOrderByMatch` | `sync/vtex/route.ts:477` |
| (c) Cron 30 min (red de seguridad webhook) | proxy → webhook | `cron/vtex-sync-recent/route.ts:67` |
| (d) backfill vtex-processor | `attributeOrderByMatch` | `vtex-processor.ts:290` |
| (e) cron attribution-reconcile | `attributeOrderByMatch` | LIVE: atribuyó 10 órdenes (EMDJ 5, TeVe 5) |

**Edge cases (probados en vivo con `attributeOrderByMatch` sobre órdenes reales de EMDJ):**
- Orden MELI → `marketplace-skip` (NO atribuida). ✅
- Orden sin email → `no-email-no-window` (graceful, sin crash). ✅
- Orden ya atribuida → `already-attributed`, before=1/after=1, **duplicateCreated=false** (idempotente). ✅
- Orden web sin atribuir → matcheó por `email` (el matcher funciona). ✅
- `calculateAttribution` crea row con touchpoints para órdenes atribuibles (verificado: order con touchpointCount=1).
- "Orden antes que visitor" / "webhook perdido" → los recupera el cron 30 min + reconcile (estructural, mismo helper).
- "Webhook duplicado" → orden upsert por externalId + atribución idempotente (NITRO único por orden) → sin dup.
- "200+ órdenes/día" → cada orden pasa por un camino real-time (webhook/sync) que corre atribución; no depende del
  límite del cron.

> Framing honesto del "100%": significa que **TODOS los caminos corren el intento de atribución** (imposible que
> baje por un gap de código). La TASA real es ~86-87% (techo por datos: órdenes sin journey reconstruible no se
> pueden atribuir — no es un bug).

**P4 — QA visual (Chromium, sesión EMDJ):** `/pixel/analytics`, `/pixel`, `/nitropixel` → **0 errores JS**, datos
reales (revenue atribuido $16,4M, valoración activo $379,5M), **0 NaN/null/$0**. Screenshots full-page en
`testout-qa/qa-*.png`. Tabs (KPIs/Verdad/Funnel/Revenue/Velocidad/Dispositivos/Cobertura/Journeys/Conversión) son
secciones de `/pixel/analytics` (capturadas en el screenshot full-page; scan de texto sin NaN). Cross-panel:
atribuidas ≈ Pedidos web 98,3% (ver BP-CONSIST-PIXEL). Cross-tenant: qa-demo (Arredo) no ve EMDJ (0 leak, BP previo).

**Canary (carga real):** 10× concurrente `/metrics/pixel` = 10/10 200, 0 mocks; 10× `/metrics/orders` = 10/10 200,
0×500. Sin saturación de pool. (Tiempos máximos altos = throttle del branch, no prod.)

**⚠️ Caveat global (sin cambios):** el branch Neon throttlea scans crudos ~8x → los tiempos ABSOLUTOS de página
(4-25s acá) no son representativos de prod (~1-3s). Validar tiempos finales en entorno prod-like. tsc 0 + `next build` 0.

---

## 🟡 BP-PERF-CONVERSION — `/api/metrics/conversion` escanea pixel_events crudo (lento en orgs grandes)

> **Hallazgo del QA exhaustivo pre-deploy (2026-06-12).** NO es regresión: es el comportamiento actual de
> prod (este endpoint nunca recibió el tratamiento de rollups que sí recibió `/api/metrics/pixel` en la Fase 2).

**Síntoma:** `/api/metrics/conversion` hace `COUNT(DISTINCT "visitorId") FROM pixel_events` directo (líneas
~48/75/131/167), sin usar las tablas rollup. En Arredo (11,6M eventos), branch throttleado:
1d 0,95s · 7d 8,2s · **30d 76s · 90d ~84s**. Tiene `force-dynamic` pero **NO** `maxDuration` explícito.

**Por qué no bloquea este deploy:** el código de conversion ya corre así en prod hoy; este deploy solo le
cambió el filtro de status (I4), que NO toca los scans de pixel_events. En prod (sin throttle + con el índice
covering `pixel_events_org_ts_cover_idx`) los scans son ~10x más rápidos. Igual conviene resolverlo.

**Fix propuesto (follow-up, NO ahora):** portar las queries de tráfico de conversion a leer los rollups HLL
(`pixel_daily_aggregates`/`_type`/`_source`) igual que hizo la Fase 2 con `/api/metrics/pixel`. Y agregar
`maxDuration` explícito. Prioridad media (no afecta /pixel/analytics, que usa el endpoint optimizado).

**Estado:** abierto, follow-up post-deploy.

---

## ✅ BP-S60-001 — Verificar atribucion end-to-end TVC con primera orden web real — RESUELTO

**Resuelto**: 2026-05-01 (S60 EXT) via endpoints `vtex-recent-orders` + `trigger-vtex-sync`.

VTEX tenia 30 ordenes (25 web + 5 Frávega) del 30/04 + 01/05 que no estaban en DB. Investigacion mostro que:
- Webhook de afiliado funciona perfecto desde 30/04 12:10 (las 26 post-config llegaron OK).
- Las 4 pre-12:10 NO llegaron (webhook no estaba activo) ni el cron diario las trajo (el cron 01/05 3am no corrio o fallo).
- `trigger-vtex-sync` recupero las 4 faltantes manualmente. 30/30 ahora en DB con 100% success.

Conclusion: el webhook esta validado end-to-end. **Bug colateral menor**: el cron diario VTEX fallo el 01/05. No bloquea TVC (las ordenes nuevas llegan via webhook), pero hay que entender por que. Anotado para revision (NO bloqueante).

---

## 🔴 BP-S60-001-OLD — texto original (referencia)

**Entró**: 2026-04-30 (S60), post-resolucion manual del afiliado VTEX

**Contexto**: Leandro de TVC creo el afiliado "NitroSales (NSL)" en su VTEX a las 12:10 hs del 30/04. La URL del endpoint responde, el pixel funciona, otros webhooks VTEX llegan. Pero hasta que entre una orden web real, no podemos confirmar end-to-end que el webhook de orders esta llegando y atribuyendo. TVC tuvo 0 ordenes web el 30/04 hasta el momento de cierre de sesion.

**Que hay que hacer**:
1. Cuando TVC tenga su primera orden web post-12:10 hs del 30/04, mirar logs Vercel buscando `[Webhook:Orders] Received: <orderId>` para esa orden.
2. Correr `https://app.nitrosales.ai/api/admin/debug-orders-attribution-detail?orgId=cmod6ns420047dlnth544px9c&date=YYYY-MM-DD&key=nitrosales-secret-key-2024-production` con la fecha de la orden y verificar que aparece como ATRIBUIDO.
3. Si despues de 2-3 ordenes seguidas no llega POST al endpoint, revisar que Leandro haya pegado la URL exacta sin typos (pedirle screenshot del afiliado guardado).

**Bloquea**: BP-S60-005 (activacion de TVC).

**Esfuerzo**: 5 minutos cuando entre la primera orden.

**Estado**: Esperando trafico real.

---

## ✅ BP-S60-002 — Implementar paso del afiliado VTEX en el wizard de onboarding — CERRADO 2026-05-10 (Sesion 60 EXT-3)

**Resuelto**: Sesión 60 EXT-3 (10 mayo 2026), commits `f6e9262` + `8d05f40` + `907a747`.

**Lo que se hizo**:
- Componente único `src/components/onboarding/VtexAffiliateInstructions.tsx` (DRY, theme dark|light) usado en 3 lugares: `OnboardingOverlay.tsx` (wizard dark) + `/settings/integraciones/vtex` (settings light) + `/control/preview/vtex-afiliado` (preview admin).
- Endpoint `/api/me/vtex-affiliate-info` arma la URL del webhook server-side con `orgId` + `NEXTAUTH_SECRET`, sin exponer el secret en el client.
- Captura real guardada en `public/onboarding/vtex-afiliado.jpg`.
- `activate-client` auto-configura el Orders Broadcaster via API al activar cliente VTEX (Tipo A multi-tenant, fix complementario para que el cliente nuevo arranque 100% sin depender de memoria humana).
- Storytelling refinado contra la captura real: "Política comercial" es número (1), checkbox "Utilizar mi medio de pago" SIN tildar, "Endpoint de busca" (texto sic VTEX), botones explícitos "+ Nuevo afiliado" verde y "Guardar" azul.

**Pendiente menor**: el paso visible al cliente NO bloquea forzadamente el avance del onboarding (idea #5 original era "marcarlo como obligatorio para terminar"). Se decidió dejar como instrucción muy visible pero no bloqueante porque cliente puede legítimamente diferirlo hasta tener tiempo de entrar a VTEX. Si en el futuro se ve que clientes lo saltean, agregar un checkbox "Ya lo configuré" + verificación opcional.

---

## (Histórico archivado) BP-S60-002 — Implementar paso del afiliado VTEX en el wizard de onboarding (Tipo A — fix multi-tenant CRITICO)

**Entró**: 2026-04-30 (S60), causa raiz del bug TVC

**Contexto**: el wizard de NitroSales NO automatiza la creacion del afiliado en VTEX (verificado por grep en codigo: cero referencias a `/api/orders/hook/config` ni a Afiliados). Para EMDJ se hizo manual en S53, para TVC se olvido y rompio atribucion. **Para Arredo y los proximos clientes va a romper igual hasta que se arregle.**

**Solucion (Tipo A, perdura)**: agregar un sub-paso dentro del step VTEX del wizard que:

1. Muestre la captura blurreada de la pantalla de Afiliados de VTEX (Tomy ya tiene la captura blurreada lista — guardarla en `/public/onboarding/vtex-afiliado.png` o similar).
2. Genere automaticamente la URL del endpoint con la `key` (env `NEXTAUTH_SECRET`) + `org` (de la sesion del cliente) lista para copiar:
   ```
   https://app.nitrosales.ai/api/webhooks/vtex/orders?key=<NEXTAUTH_SECRET>&org=<orgId>
   ```
3. Boton "Copiar URL".
4. Liste los valores para cada campo de la pantalla VTEX:
   - Nombre: NitroSales
   - ID: NSL (o NSL2, NSL3 si tiene multiples politicas)
   - Politica comercial: pedirle al cliente que confirme cual es la de su web propia (ofrecer pregunta tipo "¿que politica comercial usa tu web propia?"). Aclarar que las politicas de marketplaces externos (Frávega, Banco Provincia, etc.) NO necesitan afiliado.
   - Email para notificaciones: webhooks@nitrosales.ai
   - Endpoint de busca: la URL generada
   - Version del endpoint: 1.x.x
   - "Utilizar mi medio de pago": SIN tildar
5. Marcarlo como **paso obligatorio** para terminar el onboarding (no se puede continuar sin marcar "ya lo configure").
6. **Bonus**: agregar al test de credenciales VTEX una verificacion empirica del afiliado. Idea: hacer un GET a `/api/orders/hook/config` con auth de la app key del cliente para ver si VTEX expone la lista de afiliados y confirmar que "NitroSales" esta. Si VTEX no expone ese GET, dejar como verificacion manual.

**Archivos a tocar**:
- `src/app/(app)/wizard/...` (paso VTEX) — agregar sub-step
- `src/app/api/me/wizard/vtex/...` (si existe) o nuevo `/api/me/vtex-affiliate-info` — endpoint que retorna la URL armada server-side (NO exponer NEXTAUTH_SECRET en client)
- `public/onboarding/vtex-afiliado.png` — captura blurreada que ya tiene Tomy
- `src/lib/onboarding/credential-tests.ts` — opcional: agregar test de afiliado configurado

**Esfuerzo estimado**: ~2 horas (1h UI, 1h endpoint backend + integrar con wizard).

**Estado**: Aprobado por Tomy. A correr post-verificacion BP-S60-001.

---

## ✅ BP-S60-003 — Reparar atribucion historica TVC — RESUELTO

**Resuelto**: 2026-05-01 (S60 EXT) via endpoint `/api/admin/replay-attribution` (commits `a9e177e` + `5ad02b3`).

**Implementacion final** (mas simple que la propuesta original):
- Endpoint detecta automaticamente la fecha de instalacion del pixel para esa org y solo procesa ordenes posteriores (sino no hay data para atribuir).
- Estrategia: solo email-match (`pixel_visitor.email == customer.email`). El refactor de las 6 estrategias del webhook quedo como mejora futura — la mayoria de los matches historicos vienen por email.
- Idempotente: skip si ya hay attribution row con model='LAST_CLICK'.

**Resultado para TVC**:
- 93 ordenes web post-pixel sin atribuir
- **71 atribuidas (76%)**
- 22 sin visitor matching (data no recuperable, normal)
- 0 errores

**Aplicable para Arredo y futuros clientes**: correr el endpoint despues del backfill inicial cuando el cliente conecte el pixel.

---

## 🆕 BP-S60-006 — Mejorar /pixel/configuracion (bonus features)

**Entró**: 2026-05-01 (S60 EXT)

**Contexto**: la subseccion `/pixel/configuracion` (commit `23da7ac`) tiene constructor de UTMs + guia de tagueo. Falta agregar bonus features de configuracion del pixel:

**Que hacer**:
1. **Estado del snippet**: mostrar si el pixel esta instalado y disparando eventos (last-eventAt < 1h).
2. **Pixel ID visible**: mostrar el orgId que el cliente debe usar al integrar.
3. **Snippet copiable**: link al script `/api/pixel/script?org=<orgId>` con boton de copiar.
4. **Test de integracion**: boton para enviar un evento de prueba manualmente y validar que llega.

**Archivos**: extender `src/app/(app)/pixel/configuracion/page.tsx`.

**Esfuerzo**: ~1 hora.

**Estado**: Backlog. NO bloquea nada, mejora UX onboarding.

---

## 🟢 BP-S60-004 — Configurar alias webhooks@nitrosales.ai (operativo, no codigo)

**Entró**: 2026-04-30 (S60)

**Contexto**: en la pantalla de Afiliados VTEX se carga un email para que VTEX avise si el webhook se rompe. Para no exponer `tlapidus@99media.com.ar` al cliente, se decidio usar `webhooks@nitrosales.ai` (dominio comprado en Hostinger, S59) que reenvia a `tlapidus@99media.com.ar`.

**No bloquea** TVC: el email solo se usa para notificaciones de errores. VTEX igual acepta cargarlo aunque el alias todavia no exista. Cuando se cree el alias, los emails que VTEX haya mandado al "limbo" hasta ese momento se pierden, pero los siguientes empiezan a llegar.

**Solucion (operativa, Tomy lo hace, NO requiere codigo)**:
1. Crear cuenta en improvmx.com (gratis).
2. Agregar dominio `nitrosales.ai`.
3. Crear alias `webhooks` → `tlapidus@99media.com.ar`.
4. Copiar los 2 MX records que da ImprovMX.
5. Entrar a Hostinger → DNS Zone Editor de `nitrosales.ai`.
6. Verificar que NO hay MX previos (si hay, parar y avisar a Claude — puede pisar emails existentes).
7. Agregar 2 records MX (`mx1.improvmx.com` priority 10, `mx2.improvmx.com` priority 20).
8. Esperar 5-30 min de propagacion.
9. Probar: mandar email desde Gmail a `webhooks@nitrosales.ai` y ver si llega a `tlapidus@99media.com.ar`.

**Esfuerzo**: 10 minutos.

**Estado**: Pendiente. Tomy lo hace cuando pueda. No bloquea nada.

---

## 🟡 BP-S60-005 — Activar TVC (click "Habilitar cliente")

**Entró**: 2026-04-30 (S60)

**Contexto**: TVC sigue en `READY_FOR_REVIEW`. Falta darle click a "Habilitar cliente" en `/control/onboardings/eb283d21-b45d-4ccd-8caa-7db29309044d`. El click manda email "tu plataforma esta lista" a Leandro y le habilita el acceso al producto.

**Pre-requisitos**:
- ✅ BP-S60-001 confirmado (webhook llegando OK con orden real)
- ✅ BP-S60-003 corrido (atribucion historica reparada)
- (opcional) BP-S60-002 implementado para evitar que pase con Arredo
- (opcional) BP-S60-004 configurado para que las notificaciones VTEX queden en alias prolijo

**Esfuerzo**: 1 click + 5 min de QA visual con view-as-org antes.

**Estado**: Esperando pre-requisitos.

---

## 🟡 BP-S59-010 — Limpiar emails enmascarados VTEX en backfill + enrichment

**Entró**: 2026-04-29 (S59), durante backfill de TVC

**Contexto**: VTEX entrega emails con formato enmascarado (`real@email.com-265600829169b.ct.vtex.com.br`) y a veces full-anonimo (`abc123def456@ct.vtex.com.br`). Hay un helper `extractRealEmail` en `src/app/api/webhooks/vtex/orders/route.ts` (línea 33) que los limpia, pero **solo se aplica al webhook**. El backfill (`src/lib/backfill/processors/vtex-processor.ts`) y el enrichment (`src/lib/connectors/vtex-enrichment.ts`) NO usan ese helper, así que los clientes nuevos quedan con emails crudos en la DB.

**Impacto en TVC**: 12.536 customers VTEX (43%) sin email útil porque el helper no corrió en backfill.

**Solución**:
1. **Tipo A (perduran)**: mover `extractRealEmail` a `src/lib/connectors/vtex.ts` o nuevo helper `src/lib/connectors/vtex-email.ts`. Importarlo desde:
   - `webhooks/vtex/orders/route.ts` (ya lo usa)
   - `lib/connectors/vtex-enrichment.ts` (donde se hace el upsert del customer durante backfill)
   - Cualquier otro path que toque email VTEX
2. **Tipo B (one-shot para TVC)**: endpoint admin `/api/admin/onboardings/[id]/vtex-clean-emails` que recorra customers VTEX de la org y aplique `extractRealEmail` a los enmascarados existentes. Idempotente.

**Archivos a tocar**:
- `src/lib/connectors/vtex-email.ts` (crear) — helper compartido
- `src/lib/connectors/vtex-enrichment.ts` — usar el helper antes de upsert customer
- `src/app/api/webhooks/vtex/orders/route.ts` — importar del helper compartido
- `src/app/api/admin/onboardings/[id]/vtex-clean-emails/route.ts` (crear) — one-shot para legacy

**Esfuerzo estimado**: ~1 hora total (Tipo A + Tipo B)

**Estado**: Tomy aprobó. A correr cuando termine TVC.

---

## 🟡 BP-S59-009 — Backfill VTEX: cortar al detectar ventanas vacías + arreglar race condition del runner

**Entró**: 2026-04-29 (S59), durante backfill de TVC

**Contexto**: Dos bugs distintos en el motor de backfill, ambos manifestados con TVC.

### Bug A: walk-back infinito en historial vacío
Cuando un job pide "todo" (120 meses) pero el cliente arrancó hace 4 años, el motor sigue caminando hacia atrás en ventanas de 7 días después de haber cargado todas las órdenes reales. Cada chunk camina 5 ventanas (35 días), lo que significa atravesar ~6 años de "vacío" toma ~63 chunks = ~63 minutos de procesamiento inútil.

**Síntomas**: barra al 100% (DB count >= estimate) pero status = RUNNING durante ~30-60 min, "última actividad hace X min" sin avanzar nada.

**Solución propuesta**: en `processVtexChunk`, si N ventanas consecutivas (ej: 4) devuelven 0 órdenes Y el dbCount ya alcanzó el totalEstimate (con margen 95%), marcar `isComplete: true`. Persistir un contador de "windows seguidas vacías" en el cursor para soportar múltiples chunks.

### Bug B: race condition del runner (overshoot del processedCount)
El runner tiene cooldown de 2 min en `pickNextJob`. Si un chunk tarda más de 2 min (común con enrichment + 500 órdenes), el siguiente cron tick arranca otro motor que pickea el MISMO job → ambos procesan en paralelo → upsert duplica el trabajo (DB queda bien por externalId, pero processedCount infla 30-50%).

**Síntomas en TVC**: 33.985 órdenes únicas en DB pero processedCount llegó a 45.000+ (~30% overshoot).

**Solución propuesta**: subir cooldown de 2 min a 5 min en `pickNextJob` (`src/lib/backfill/job-manager.ts:72`). Considerar también un advisory lock en Postgres (`pg_try_advisory_lock(jobId.hashCode())`) para evitar pisarse aunque el cooldown se quede corto.

**Archivos a tocar**:
- `src/lib/backfill/processors/vtex-processor.ts` — corte temprano por ventanas vacías
- `src/lib/backfill/job-manager.ts` — cooldown 5 min + advisory lock opcional
- `src/lib/backfill/processors/ml-processor.ts` — verificar si tiene el mismo bug

**Mitigación temporal en S59**: botón "✓ Marcar completado" en `/control/onboardings/[id]` cuando dbCount ≥ 99% del estimate (commit fix de S59). Permite cerrar a mano si vuelve a pasar.

**Esfuerzo estimado**: ~2 horas (1h corte temprano + 1h race condition)

**Estado**: Tomy aprobó. A correr post-TVC junto con BP-S59-010.

---

## 🟡 BP-S59-008 — Estimado total + barra de progreso para backfill ML

**Entró**: 2026-04-29 (S59), durante backfill de TVC

**Contexto**: el processor de MercadoLibre usa pagination por ventanas de 7 días con offset hasta 1000 por ventana. La API `/orders/search` no devuelve un total global pre-calculado. Por eso, la UI del onboarding muestra para ML solo "X procesadas" sin un denominador, y la barra de progreso no avanza hasta saltar a 100% al completar.

**Comportamiento actual**:
- VTEX: "967 / 33.984 estimadas · 3%" — barra avanza correctamente.
- ML: "454 procesadas" sin total — barra inmóvil hasta 100% final.

**Solución a implementar**:
- Antes de arrancar el ML processor, hacer una llamada de "discovery" que estime el total (ej: pegarle a `/orders/search?seller=X&limit=1` por cada ventana de 7 días dentro del rango histórico, sumar los `paging.total` de cada ventana).
- Costo: 1 request por semana de rango (12 meses = ~52 requests). Se hace una sola vez al arrancar.
- Persistir el `totalEstimate` en el `backfill_job` antes del primer chunk → la UI ya tiene la información para mostrar % real.
- Si el estimado falla o es impreciso, fallback a comportamiento actual (sin total).

**Archivos a tocar**:
- `src/lib/backfill/processors/ml-processor.ts` — agregar función `estimateMlTotal()` antes del primer chunk
- (opcional) `src/lib/backfill/job-manager.ts` si hay que extender el shape

**Esfuerzo estimado**: ~1.5 horas

**Por qué queda pendiente**: no es bloqueante. El backfill funciona igual, solo es UX del progreso. Tomy lo prefiere como mejora para próxima iteración (no para TVC).

---

## ✅ BP-S59-005 — Activación manual del cliente (RESUELTO 2026-04-28, S59 extendida)

**Resuelto**: S59 — commit `e534ee5`

**Que se hizo**:
- Estado nuevo `READY_FOR_REVIEW` en enum OnboardingStatus
- backfill-runner finalizeOnboarding ya NO marca ACTIVE ni manda email automáticamente
- Cliente ve overlay "Estamos preparando tu plataforma" hasta que admin active
- Endpoint `POST /api/admin/onboardings/[id]/activate-client` marca ACTIVE + manda email
- Botón "Habilitar cliente" en `/control/onboardings/[id]` cuando status=READY_FOR_REVIEW
- Migración aplicada (READY_FOR_REVIEW agregado al enum)

**Por qué**: QA visual del admin antes de exponer el producto al cliente. Plataforma en fase temprana = mejor revisar antes que descubrir bugs cuando el cliente ya entró.

---

## ✅ BP-S59-006 — Impersonate read-only "Entrar como cliente" (RESUELTO 2026-04-28, S59 extendida)

**Resuelto**: S59 — commit `2653632`

**Que se hizo**:
- Magic link 60s firmado HMAC SHA256 + provider NextAuth `impersonate`
- Endpoint `POST /api/admin/impersonate` (body: `{ targetUserId }` o `{ orgId }`)
- Página `/auth/impersonate?token=X` (client component) que llama signIn
- ImpersonateBanner sticky amarillo arriba del producto cuando session.impersonatedBy presente
- middleware.ts read-only: bloquea POST/PUT/DELETE/PATCH a /api/* durante impersonate (excepto /api/auth/* para signOut)
- Botón "Entrar como cliente" en `/control/onboardings/[id]`
- Audit log en LoginEvent: "Impersonated by [admin]"

**Patrón profesional**: igual a Stripe / Intercom / Vercel.

---

## ✅ BP-S59-007 — Cancelar/resetear backfill (RESUELTO 2026-04-28, S59 extendida)

**Resuelto**: S59 — commit `0aae5d6`

**Que se hizo**:
- Endpoint nuevo `POST /api/admin/onboardings/[id]/reset-wipe` (borra TODA la data del cliente)
- Reset suave reusa endpoint `/reset-backfill` existente desde S58
- UI "Operaciones avanzadas" en `/control/onboardings/[id]` visible en BACKFILLING / READY_FOR_REVIEW / ACTIVE
- 2 botones: 🔄 Reset suave (amarillo) + ⚠️ Wipe completo (rojo, doble confirmación)
- Cancelación durante BACKFILLING: borrar jobs en DB → cron del próximo tick no encuentra los jobs → no continua

**Por qué**: control total a Tomy en cualquier momento del flow. Bug en código → reset suave + re-correr. Cuenta equivocada → wipe + re-correr. Cliente activo con problema → wipe sin tocar al cliente.

---

## ✅ BP-S58-001 — GA4 cleanup (RESUELTO 2026-04-28, S59)

**Resuelto**: S59 — commit `5e3c4cf`
**Entró**: 2026-04-24 (S58)

**Que se hizo**:
- Eliminado del UI `/settings/integraciones` (no aparece en lista)
- Eliminado de endpoint `/api/connectors` (no se devuelve)
- Endpoint `/api/sync/ga4` BORRADO completamente
- Llamada a sync GA4 sacada de `/api/sync/route.ts`
- Archivos `lib/connectors/ga4.ts` quedan como código muerto inocuo (nadie los importa)
- NitroPixel agregado en su lugar como integración visible

Analytics ahora se hacen desde NitroPixel (decisión de producto explícita de Tomy).

---

## ✅ BP-S58-005 — OAuth Meta Ads (RESUELTO 2026-04-28, S59)

**Resuelto**: S59 — commits `b64b665`, `c014e71`, `21ccde4`, `c5d1f59`, `de567d1`
**Entró**: 2026-04-27 (S58 BIS, post detección de gap en tutorial Meta)

**Que se hizo**:
- App Meta creada (App ID `1770085970626718`)
- Producto "Inicio de sesión con Facebook" agregado
- Redirect URIs configuradas (vercel.app + app.nitrosales.ai)
- Env vars META_APP_ID + META_APP_SECRET en Vercel
- Endpoints OAuth: `/api/oauth/meta/start`, `/api/oauth/meta/callback`
- Cron `/api/cron/meta-token-refresh` (5am diario, renueva tokens <7d de expirar)
- Flow auth-request: cliente pide ser tester, admin lo agrega manualmente, cliente conecta OAuth
- UI MetaAdsInputs en wizard con 4 estados (NONE/PENDING/APPROVED/CONNECTED)
- Selector dropdown Ad Accounts post-OAuth (lista de hasta 50 accounts)
- Cuenta @99media de Tomy conectada y validada (17 ad accounts)

**Approach**: A (User Access Token long-lived 60d con auto-refresh). Mismo patrón que Triple Whale, HubSpot.

**App Review**: pendiente del lado Tomy (lo hace cuando quiera). Mientras tanto, agregar emails de TVC/Arredo como "App Tester" en developers.facebook.com → Roles.

---

## ✅ BP-S59-001 — OAuth Google Ads (RESUELTO 2026-04-28, S59)

**Resuelto**: S59 — commit `1275543`
**Entró**: 2026-04-28 (S59) por pedido explícito de Tomy "hagamos lo mismo que Meta para Google"

**Que se hizo**:
- Endpoints `/api/auth/google-ads` (start) + `/api/auth/google-ads/callback` (persiste refreshToken en Connection)
- Flow auth-request idéntico a Meta: `/api/me/google-auth-request`, `/api/me/google-auth-status`, `/api/admin/google-auth-confirm`
- UI GoogleAdsInputs con 4 estados
- Login Customer ID con tooltip "¿Qué es MCC?" expandible

**Pre-requisitos del lado Tomy** (pendiente cuando quiera):
- App OAuth en Google Cloud Console (Test mode → agregar test users) + verificación posterior si quiere modo producción
- Mientras: agregar emails de clientes como Test Users en OAuth Consent Screen

---

## ✅ BP-S59-002 — Migración dominio app.nitrosales.ai (RESUELTO 2026-04-28, S59)

**Resuelto**: S59 — commit `bfa7bac`

**Que se hizo**:
- Dominio `nitrosales.ai` comprado en Hostinger
- DNS CNAME `app` → `fd391c1a5b4977b7.vercel-dns-017.com.`
- Dominio agregado en Vercel project nitrosales (Production)
- NEXTAUTH_URL actualizada a `https://app.nitrosales.ai`
- 22 archivos con fallback hardcoded `"https://nitrosales.vercel.app"` reemplazados por `"https://app.nitrosales.ai"` (Tipo A)

**Estado**: ambos dominios activos (vercel.app sigue funcionando como compat). Webhooks viejos VTEX/MELI no se migraron — siguen apuntando a vercel.app y funcionan.

---

## ✅ BP-S59-003 — Páginas dedicadas /settings/integraciones/* (RESUELTO 2026-04-28, S59)

**Resuelto**: S59 — commits `d4f63a8`, `3396fe6`, `f0e9f45`, `dd91a6a`, `5e3c4cf`

**Que se hizo**:
6 páginas standalone para gestionar conexiones desde dentro de la app sin pasar por wizard:
- `/settings/integraciones/meta` — 4 estados + Business ID + Pixel ID + Token CAPI protegido
- `/settings/integraciones/google-ads` — 4 estados + Customer ID + Login Customer ID con tooltip MCC
- `/settings/integraciones/vtex` — datos pre-rellenados, secretos protegidos como ••••• Cambiar
- `/settings/integraciones/mercadolibre` — OAuth flow, mlUserId, lastSync
- `/settings/integraciones/google-search-console` — propertyUrl + invitar service account
- `/settings/integraciones/nitropixel` — snippet copiable + status + tabla últimos 10 eventos

Patrón Stripe/Vercel: secretos NUNCA expuestos en frontend. Pre-rellena no-secretos con datos de la DB. Backend preserva secretos existentes si body viene vacío.

---

## ✅ BP-S59-004 — Sistema de bloqueo de secciones (RESUELTO 2026-04-28, S59)

**Resuelto**: S59 — commits `f1f3698`, `3ada66c`, `239091a`

**Que se hizo**:
Sistema completo para que Tomy controle qué secciones ven los clientes:
- 3 estados: Sin override (auto) / Activa (forzada) / Mantenimiento (cartel)
- Override por cliente individual + override global
- Override por org tiene prioridad sobre global
- Detección automática de "falta integración" → cartel "Conectá [Plataforma]" + botón directo
- Panel admin `/control/section-overrides` con tabla Sección × Org
- Link "Secciones" en ControlNav del admin
- AutoSectionGuard en `(app)/layout.tsx` aplica protección automática a todas las páginas

**Pendiente del lado Tomy**: correr migración 1 vez:
```
GET /api/admin/migrate-system-setting?key=nitrosales-secret-key-2024-production
```

Sin esto, los overrides globales no persisten (los por-org sí, van a Organization.settings).

---

## 🟡 BP-S58-005 (HISTÓRICO) — OAuth Meta Ads (en STANDBY hasta migración a nitrosales.ai)

**Entró**: 2026-04-27 (S58 BIS, post detección de gap en tutorial Meta)
**Estado**: 🟡 PARCIAL — pre-requisitos hechos, frenado para no configurar 2 veces
**Prioridad**: ALTA cuando se retome (lo pidió Tomy explícito: "no quiero hacer nada a medias, todo tiene que estar excelente porque los clientes están probando")

### Por qué se frenó

Cliente de TVC reportó que el tutorial Meta Ads no explica los pre-requisitos para crear la App de Meta (productos a agregar, asignar al BM, vincular System User). Decisión de fondo: migrar de **input manual de token** (status quo) a **OAuth completo "Conectar con Meta"** (como Google Ads/GSC). Mid-conversación Tomy avisó que va a migrar dominio a `nitrosales.ai` pronto, así que pausamos para no configurar la Redirect URI con `vercel.app` y tener que rehacerlo.

### Lo que YA está hecho (no se pierde)

- ✅ App Meta creada en developers.facebook.com — App ID **`1770085970626718`**
- ✅ Producto "Inicio de sesión con Facebook" agregado a la App
- ✅ Env vars cargadas en Vercel:
  - `META_APP_ID` = `1770085970626718`
  - `META_APP_SECRET` = (cargado, no compartido en chat)
- ✅ Redeploy de Vercel ejecutado (env vars activas en prod)
- ✅ Análisis del codebase: `meta-ads.ts`, `capi.ts`, `credential-tests.ts`, `OnboardingOverlay.tsx` (donde está GoogleAdsInputs como referencia)

### Lo que FALTA cuando se retome

**Pre-requisitos del lado Tomy (con dominio nitrosales.ai vivo)**:
1. Pegar Redirect URIs en Facebook Login → Configuración:
   - `https://nitrosales.vercel.app/api/oauth/meta/callback` (compat)
   - `https://nitrosales.ai/api/oauth/meta/callback` (producción)
2. App Review de Meta para permisos `ads_read`, `ads_management`, `business_management` (1-7 días Meta)
3. Mientras esperamos review: agregar emails de testers (Tomy + cliente TVC) en developers.facebook.com → Roles → Testers

**Pre-requisitos del lado código (Claude implementa)**:
1. Endpoint `/api/oauth/meta/start?orgId=X` → redirige a Meta OAuth dialog con scopes correctos
2. Endpoint `/api/oauth/meta/callback` → recibe `code`, intercambia por access_token (long-lived 60 días via `/oauth/access_token`)
3. Cron `/api/cron/meta-token-refresh` antes de día 55 (evita expiración silenciosa)
4. UI: en `OnboardingOverlay.tsx`, reemplazar inputs manuales (`accessToken`, `pixelAccessToken`) por botón **"Conectar con Meta"** estilo OAuth como Google Ads
5. Tutorial nuevo MUY simple: "Click conectar → Login Meta → Autorizar → Listo"
6. Eliminar tutorial viejo de System User Token

### Sub-decisión técnica al retomar

| Approach | Token | Recomendación |
|---|---|---|
| **B1** User Access Token long-lived | 60 días, refresh manual del cliente | OK para arrancar |
| **B2** System User Token via Business Login | No expira | Profesional (lo usan HubSpot, Triple Whale) |

Default sugerido: **empezar con B1** y migrar a B2 después de tener review aprobado y arquitectura validada.

### Trigger para retomar

Cuando Tomy diga **"ya activé el dominio nitrosales.ai"** o **"retomamos OAuth Meta"**.

---

## ✅ BP-S58-003 — Unificar Meta Ads + Meta Pixel (RESUELTO 2026-04-25)

**Resuelto**: 2026-04-25 — commit `a20afbf`
**Entró**: 2026-04-24 (S58) post workaround C

**Qué se hizo**:
- ALL_PLATFORMS: quitada entry "META_PIXEL". META_ADS renombrada a "Meta (Ads + Pixel)".
- MetaAdsInputs unificado: bloque obligatorio (Ad Account + Token + Business ID) + bloque opcional (Pixel ID + Pixel Access Token con fallback al token de Ads).
- MetaPixelInputs eliminado.
- submit-wizard limpio: sin buffer pixelCredsPending, sin case META_PIXEL en validate.
- VisualTutorials META_ADS ahora con 6 pasos (3 originales + 3 movidos del pixel renumerados como pasos 4-6 opcionales).
- saved-state simplificado: 1 loop sin ramas especiales, devuelve creds.META_ADS con todo junto.
- capi.ts sin cambios (ya leía desde META_ADS con fallback).

**Resultado**: 1 sola entry en el wizard con todo Meta unificado. -77 LOC neto.

> 📝 Pendiente menor: revisar audiences/ltv/alerts/intelligence/etc por si todavía buscan `platform: "META"` — si encuentran, cambiar a `"META_ADS"`. No bloqueante.

---

## 🟡 BP-S58-001 — Cleanup GA4 del codigo (fin de semana)

**Entró**: 2026-04-24 (S58)
**Estado**: 📝 pendiente
**Contexto**: El wizard NO pide GA4 (confirmado: GA4 no está en `ALL_PLATFORMS`). Analytics vienen de NitroPixel. GA4 es codigo muerto.

**Qué hay que limpiar**:
- `src/app/api/sync/ga4/route.ts` — eliminar
- Página `/analytics` (si es solo GA4) — verificar qué muestra; si es GA4 puro, redirigir a `/pixel/analytics`
- Variables de entorno `GA4_SERVICE_ACCOUNT_KEY` y `GA4_PROPERTY_ID` en Vercel — Tomy las borra manual
- Cron GA4 en vercel.json — verificar si existe (al parecer no)
- Cualquier referencia en dashboard/widgets

**Cuándo**: fin de semana, no bloquea nada.

**Por qué queda pendiente**: código muerto no interfiere con el primer cliente. Mejor hacer cleanup con calma que rompiendo algo por apuro.

---

## 🟡 BP-S58-002 — Fixes post-auditoria del wizard (parcialmente resuelto S58)

**Entró**: 2026-04-24 (S58)
**Estado**: 🟡 #5 y #7 RESUELTOS en S58 BIS (2026-04-27). Resto pendiente.

**Resueltos en S58 BIS**:
- ✅ **#5 VTEX guardar 8 campos faltantes**: TODOS poblados en `vtex-enrichment.ts`. Score health-check post EMDJ: VTEX 100% en channel/payment/deliveryType/shippingCarrier/postalCode. Solo `deviceType` queda 100% null por heuristica imposible sin pixel data — aceptable.
- ✅ **#7 ML shipping address completa**: `enrichOrderFromMl` hace GET `/shipments/{id}` cuando city/state vacios. Score post BIS-2: customer.city 99% completo (5 pickups), order.postalCode/shippingCost/shippingCarrier 99% completo (8 pickups, comportamiento esperado para retiros sin envio).

**Pendientes esta semana (~3h)**:
- **#2 Token Meta en wizard**: llamar testConnection al completar. Si falla, advertir al cliente antes de submit.
- **#3 CAPI desacoplado de Meta Pixel**: permitir que CAPI funcione con business_id + CAPI token sin requerir Pixel ID conectado.
- **#10 Cron Google Ads diario**: agregar a vercel.json.

**Pendientes proxima semana (~8-10h)**:
- **#6 ML shipments históricos + claims**: nuevo step backfill. Requiere modelo DB.
- **#8 Meta breakdowns demograficos**: breakdowns=age,gender,region en insights.
- **#9 Thumbnails Meta permanentes**: copy a R2/S3 storage, proxy layer.

**Validacion en cliente real**: EMDJ (orgId `cmod9fmy6000djepldqo2ty3v`) onboardeado con success en S58 BIS, health-check confirma fixes funcionando.

---

## ✅ BP-S58-004 — Race conditions OrderItem + price 0 + mini-object ML + truthy check (RESUELTO 2026-04-27)

**Resuelto**: S58 BIS — commits `06cae9e`, `32b80e5`, `c715de2`
**Entró**: 2026-04-27 detectado en auditoria con 3 agentes paralelos pre-reset+rebackfill EMDJ

**Que se hizo**:
- Race condition VTEX+ML OrderItem: `count+create` → `$transaction([deleteMany, createMany])`. Atomico, idempotente, race-safe entre webhook y backfill concurrentes.
- Price 0 perdido: `||` → `??` con `Number.isFinite` para soportar items con `sellingPrice = 0` (regalo, sample, promo).
- deliveryType refactor: ternario ambiguo → variable boolean `isPickup` intermedia.
- Timeout `/shipments` 8s → 15s para sellers grandes.
- Webhook ML pasa token y hace fallback `/shipments` cuando receiver_address vacio.
- Check truthy permisivo `!addr` → `!addr?.city?.name || !addr?.state?.name` (objetos vacios `{}` son truthy).
- Mini-objeto vs autoritativo: persistir `shipData` de `/shipments` y leer shippingCost/shippingCarrier/postalCode de ahi (en vez de `mlOrder.shipping` que casi nunca trae esos campos).

**Documentado** en ERRORES_CLAUDE_NO_REPETIR.md como #S58-RACE-COUNT-CREATE, #S58-FALLBACK-OR-VS-NULLISH, #S58-MINI-OBJECT-VS-AUTHORITATIVE, #S58-TRUTHY-OBJECT-CHECK.

---

## 🔴 PENDIENTE INMEDIATO — Retomar E2E de ML (al volver del evento)

### BP-S55BIS3-001 — Completar test E2E del sync de ML

**Entró**: 2026-04-22 (S55 BIS+3 interrumpido por evento)
**Estado**: 🟠 en progreso, mitad completada
**Contexto**: Tomy arrancó el test E2E del flow de onboarding para validar ML sync v2. Activó la cuenta "Tengo Todo" con su email. Emails llegaron al inbox (fix del no-reply). Se detuvo en el paso de conectar credenciales ML en el wizard porque tuvo que irse a un evento.

**Qué falta hacer al retomar**:
1. Ejecutar 2 migraciones pendientes (si no se hicieron):
   - POST `/api/admin/migrate-ml-sync-infra` (banner in-UI en `/control/onboardings`)
   - POST `/api/admin/migrate-email-log` (banner in-UI en `/control/emails`)
2. Si queda residuo del test anterior → usar "Reset test environment" en panel debug violeta (borra todo lo asociado a un email)
3. Conectar MercadoLibre en el wizard (cuenta alternativa de Tomy, no elmundodeljuguete)
4. Definir 3 meses de historia para el backfill
5. Aprobar backfill desde admin
6. Monitorear:
   - `/control/emails` para ver emails "backfill_started" y "data_ready"
   - Logs de Vercel (`[ml-processor] chunk done: X processed...`)
   - `/control/onboardings/[id]` para progreso
7. Validar que llega email "data_ready" al inbox cuando termine

**Criterio de éxito**: backfill completa 3 meses sin errores, emails llegan automáticamente al inbox, `/control/emails` muestra todos los envíos con ok=true.

---

## ✅ BP-S55-001 — Test end-to-end EXITOSO (Sesión 55)

**Resuelto**: 2026-04-22 — varios commits cubriendo Aurum Onboarding + admin tools + backfill speed refactor.

**Resultado del test**:
- Aprobado 03:36:02 → Completado 03:40:11 = **4 min 9 seg**
- 12.437 órdenes procesadas correctamente, 0 errores
- Email "tu data está lista" llegó al cliente
- Overlay desbloqueado automáticamente al terminar
- Cliente entró al producto con data real

**3 fixes críticos al backfill** (commits `4162d5b`, `debd13b`, `73f0aca`, `8d6144f`):
1. Loop interno + trigger inmediato + cron 1min + chunks de 2000
2. Reusar mismo job en loop interno (esquivar cooldown legítimo de pickNextJob)
3. **Date-window pagination** para esquivar límite de 30 páginas de VTEX (este era el ROOT cause del problema histórico)
4. Pre-query para totalEstimate (barra de progreso correcta)

---

## 🔴 Prioridad ALTA — Próxima sesión (S56)

### BP-S56-001 — Auditoría completa de paginación + eficiencia en sync de TODAS las plataformas

**Entró al backlog**: 2026-04-22 (Sesión 55, pedido explícito de Tomy)
**Estado**: 📝 pendiente
**Contexto**: Hoy arreglamos el backfill de VTEX (date-window, loop, etc). Tomy preguntó si esto se puede replicar a las otras plataformas. La respuesta es SÍ pero requiere análisis dedicado.

**Qué hay que hacer**:
1. **Auditar BACKFILL** (lo que se trae históricamente al onboardear) por plataforma:
   - VTEX: ✅ resuelto en S55
   - MercadoLibre: ❌ stub (devuelve isComplete=true sin procesar). Implementar con date-window similar a VTEX (`/orders/search` con filtros por fecha)
   - Meta Ads: actualmente es "on-demand" cuando el user abre la página. Evaluar si necesita backfill explícito en onboarding
   - Google Ads: idem Meta, on-demand. Evaluar
   - GA4: cron diario, sin backfill explícito. Evaluar
   - GSC: cron diario, sin backfill explícito. Evaluar

2. **Auditar SYNC INCREMENTAL** (lo que se trae cada día) por plataforma:
   - Verificar que ninguna sufra el límite de paginación que tuvo VTEX
   - Identificar cuellos de botella de tiempo
   - Ver si vale agregar APIs bulk donde existan (Meta async insights, Google Ads streaming, MELI bulk endpoints)

3. **Aplicar patterns aprendidos donde corresponda**:
   - Date-window pagination cuando hay límite de páginas
   - Loop interno + trigger inmediato cuando hay sistema de jobs
   - Pre-query para totalEstimate cuando se necesita progress real

**Estimación**: 2-3 horas dedicadas (sesión completa).

**Importante**: NO tocar nada hasta que Tomy esté en sesión y apruebe. El sync actual de producción funciona y mantiene la data al día.

---

## 🟡 Prioridad MEDIA — Para cuando haya aire

### ✅ BP-S57-001 — Editor admin de templates de email (RESUELTO en S55 BIS+2)

**Resuelto**: 2026-04-22 — commit `df05718`.
- Tabla `email_templates` creada (migration idempotente en `/api/admin/migrate-email-templates`)
- 9 templates seedeados (activation queda hardcoded por bloques especiales)
- CRUD endpoints: GET list, PUT edit, POST activate, GET render
- UI `/control/email-templates` con timeline 2 fases + drawer split edit-con-preview + toggle activa
- `emails.ts`: funciones `*Active` async con fallback al hardcoded
- Historial de versiones: pendiente como enhancement (no bloqueante)

**Falta de Tomy**: ejecutar migración desde botón in-UI (10 seg).

---

### BP-S56-002 — Implementar processor real de MercadoLibre para backfill

**Entró al backlog**: 2026-04-22 (Sesión 55)
**Estado**: 📝 pendiente
**Contexto**: El dispatcher actual de ML (`src/lib/backfill/dispatcher.ts:14-21`) devuelve `isComplete: true` sin procesar nada. Funciona el sync incremental normal de ML pero NO trae histórico al hacer onboarding.

**Qué hay que hacer**: implementar `processMercadoLibreChunk` siguiendo el patrón de `processVtexChunk`. ML usa `/orders/search` con filtros por fecha y paginado, similar a VTEX.

**Cuándo**: cuando llegue un cliente que use ML como canal principal (no es bloqueante para Arredo que no usa ML).

---

## 🟡 Prioridad MEDIA — Centro de Control

### BP-S55-002 — Panel de "Activity log / Run history" en Centro de Control

**Entró al backlog**: 2026-04-22 (Sesión 55, pedido de Tomy durante el test)
**Estado**: 📝 pendiente
**Contexto**: La tabla `backfill_jobs` guarda el detalle de cada job con timestamps. Hoy esa info solo se ve por queries directas a DB o el endpoint `backfill-status`.

**Qué hay que hacer**: agregar página `/control/activity` que muestre log histórico de:
- Backfills (de tabla `backfill_jobs`)
- Syncs incrementales (con timestamps, items procesados, errores)
- Webhooks recibidos (VTEX, ML, etc)
- Inspirado en "Activity log" de Stripe/Segment

---

## ✅ Pre-onboarding Arredo — COMPLETADO (Sesión 53)

Los 4 pendientes de la auditoría multi-tenant quedaron cerrados. **La plataforma está lista para onboardear Arredo.**

### BP-MT-001 — Cron ML-sync: iterar TODAS las orgs activas
**Resuelto**: 2026-04-20 (Sesión 53) — commit `c215039`
**Qué se hizo**: Refactor de `api/cron/ml-sync/route.ts` con helper `syncOneOrg(orgId, connId)`. Handler ahora itera todas las conns ML ACTIVE con fail-soft por org. Resultado per-org en el response.

### BP-MT-002 — Schema `user_alert_favorites` y `user_alert_reads` con `organizationId`
**Resuelto**: 2026-04-20 (Sesión 53) — commit `37b60eb`
**Qué se hizo**:
- Endpoint `/api/admin/migrate-alert-favs-reads-orgid` agregó columna `organizationId` + FK CASCADE + index
- Backfill: 0 rows en favorites, 4 rows en reads
- UNIQUE viejo `(userId, alertId)` reemplazado por `(userId, alertId, organizationId)`
- `alerts/favorite` + `alerts/read` + `lib/alerts/alert-hub.ts` actualizados para filtrar por orgId

### BP-MT-003 — STORE_URL multi-tenant
**Resuelto**: 2026-04-20 (Sesión 53) — commit `ed5a155`
**Qué se hizo**:
- 8 endpoints migrados a `getStoreUrl(orgId)` (helper ya existía)
- API `/api/settings/organization` GET/PUT acepta `storeUrl`
- UI `/settings/organizacion`: input "URL de tu tienda" + Organization ID visible read-only con botón Copiar
- Bug fix bonus: `aura/creators/[id]/send-password` tenía `STORE_URL` como fallback del APP URL (mal) + hardcode "elmundodeljuguete" en slug. Ambos arreglados.
- Tomy seteó storeUrl de MdJ vía UI post-deploy

### BP-MT-OPS-001 — Reconfigurar webhook VTEX con `?org=<mdjOrgId>`
**Resuelto**: 2026-04-20 (Sesión 53) — operación en VTEX prod vía API
**Qué se hizo**:
- Inventory webhook: Tomy actualizó manualmente en VTEX Admin → Afiliados → NSL
- Orders webhook: descubrimos que estaba configurado vía `/api/orders/hook/config` (API-only, no UI en VTEX). Ejecutamos POST con la URL actualizada (`&org=cmmmga1uq0000sb43w0krvvys`) tras dry-run de validación.
- Verificación end-to-end: orden REAL `1626321512569-01` procesada correctamente via URL nueva en 785ms (items, productos, customer, pixelAttribution OK).

**Aprendizaje clave** (agregado a MEMORY.md): los "Afiliados" en VTEX Admin NO cubren todos los hooks. El Orders Broadcaster es API-only. Para futuros onboardings, siempre chequear `/api/orders/hook/config` vía API, no solo la UI de Afiliados.

---

## 🔴 Prioridad CRÍTICA

### BP-001 — pLTV predictivo: rails de sanidad + capa contextual con IA

**Entró al backlog**: 2026-04-17 (Sesión 40)
**Estado**: 📝 pendiente
**Trigger**: bug encontrado en el rediseño Bondly LTV. Cliente Ariel Lizárraga (2 compras en 4 días, gasto total $157k) aparece en el top con pLTV 365d = $4.874.306 y 54% de confianza. Imposible defenderlo frente a un usuario no-técnico.

**Diagnóstico**:
- BG/NBD + Gamma-Gamma extrapola la frecuencia observada (0,5 compras/día con 4 días de historia) a 365 días sin piso de antigüedad mínima.
- El modelo es matemáticamente correcto para el input recibido, pero el input es inadecuado para clientes con T < 30 días.
- Probablemente el 15-30% de los clientes del top-N ranking actual están inflados por este efecto.
- Ver `ERRORES_CLAUDE_NO_REPETIR.md` → Error #S40-MODELO-SIN-BARANDAS para regla completa.

**Plan por fases** (acordado con Tomy en Sesión 40):

#### Fase 1 — Rails de sanidad (esta es la que arregla el bug visible)

Cambios en `/api/ltv/predict`:
1. **Piso de antigüedad**: si `T < 30 días` → NO usar BG/NBD. Fallback a promedio del segmento × factor de retención del canal.
2. **Cap duro**: `pLTV_365 ≤ avgTicket × freqP95_segmento × 365`. Si BG/NBD supera el cap, truncar.
3. **Confianza recalibrada**: `confianza_final = min(confianza_modelo, f(T))` con `f(T<30)=20%, f(T<90)=50%, f(T<180)=75%, f(T≥180)=modelo_raw`.
4. **Badge "Cliente nuevo"** en la UI cuando se usó el fallback, con texto explicativo "Historia insuficiente · usando promedio del segmento".
5. **Filtro default del Top-N ranking**: excluir T < 30 días, con toggle "Incluir clientes nuevos".

Esfuerzo: 1-2 commits. Impacto: arregla el bug visible de credibilidad. **No toca la matemática de BG/NBD**, solo agrega barandas alrededor.

#### Fase 2 — Capa contextual con IA (Claude Haiku)

Arquitectura de 5 capas:
1. **Capa de piso** (de Fase 1): hard rules + caps. Defensa contra ridículos.
2. **Capa estadística**: BG/NBD intacto, solo activa con T ≥ 30 días.
3. **Capa contextual (nueva)**: Claude Haiku recibe por cliente:
   - Perfil (productos, categorías, ticket, T, frecuencia, canal, ciudad, segmento).
   - Benchmark del segmento (promedio y p75 de clientes similares con 180+ días).
   - Macro del momento: inflación esperada (BCRA REM), ICC (Di Tella), calendario de tentpoles (Día del Niño, Black Friday, Navidad, inicio escolar).
   - Señales de NitroPixel: frecuencia de visita post-compra, engagement con email.
   Devuelve: `{p90d, p365d, confidence, reasoning_bullets[], intent_archetype}`.
4. **Capa de ensamble**: blending por T:
   - T < 30 → 85% contextual + 15% segmento (BG/NBD OFF).
   - 30 ≤ T < 180 → 40% BG/NBD + 50% contextual + 10% lookalike.
   - T ≥ 180 → 60% BG/NBD + 30% contextual + 10% lookalike.
5. **Capa UI**: mostrar ensemble value + reasoning text + breakdown colapsable de aporte de cada capa + confidence ring recalibrado.

Costo estimado: ~$7-15/mes en API calls (top-50 diario o top-1000 semanal). Precomputar en cron de las 3am → tabla `ltv_predictions` → dashboard solo hace SELECT.

Esfuerzo: 3-4 semanas.

#### Fase 3 — Drift monitor + feedback loop (mes 2-3)

- Comparar predicciones de hace 3/6/12 meses con lo que realmente pasó.
- Calcular MAE (mean absolute error) mensual y alertar si sube > X%.
- Dashboard interno de salud del modelo.
- Retrain cron trimestral.

Esfuerzo: 1-2 semanas.

#### Fase 4 — XGBoost especializado (mes 12-18+)

Solo cuando haya 3.000-5.000 clientes con ≥ 12 meses de historia digital madura. Entonces se entrena un modelo gradient-boosted sobre cohortes recientes y reemplaza parcialmente la Capa 3 contextual para clientes con historia suficiente. Los nuevos siguen usando Claude Haiku.

Requisitos previos:
- Tener Fases 1-3 funcionando.
- Volcar 5 años de data del retail Mundo del Juguete como **base de conocimiento y benchmarks** (NO como training data cruda — domain shift es real).
- Feature engineering: 30-50 features por cliente.
- Infra: entrenamiento en notebook/Colab + predicciones precomputadas en cron.

Esfuerzo: 4-6 semanas cuando llegue el momento.

**Data del retail Mundo del Juguete (aporte de Tomy en Sesión 40)**:
- 45 años de historia de clientes físicos.
- Útil como **contexto**, no como training data directo (cambió el negocio, los canales, el mix de productos).
- Transferible: arquetipos familiares (abuela regaladora, mamá con hijos, comprador impulso), estacionalidad cultural argentina, afinidades de categoría por edad del niño, geografía socioeconómica.
- No transferible: frecuencias absolutas, canales de adquisición, sensibilidad a cuotas, mix de productos actual.

**Decisión de Tomy (Sesión 40)**: avanzar Fase 1 cuando se retome el tema, no ahora. La Fase 2 se revisa con documento aparte antes de implementar.

**Actualización de ambición (Sesión 40, segundo pase)**: Tomy explícitamente dice que quiere "implementar el más potente para que NitroSales sea más robusto". O sea, la ambición explícita del ítem es ejecutar **las 4 fases completas** y posicionar este módulo como **la versión más robusta de pLTV predictivo del ecommerce argentino**. No limitarse a Fase 1. Cuando llegue el momento, se abre documento de arquitectura detallado con:

- Fases 1-3 implementadas en secuencia como ruta crítica.
- Fase 4 planificada con checkpoints claros de "¿ya tenemos data madura suficiente?" (criterio: 3-5k clientes con ≥12 meses de historia digital limpia).
- Uso completo del retail Mundo del Juguete como base de conocimiento (no training): arquetipos, benchmarks, curvas estacionales, grafo de afinidades por edad del niño.
- Señales externas dinámicas integradas al prompt de la capa contextual: Google Trends por IP/categoría, calendario cinematográfico infantil, TikTok trends, macro INDEC/BCRA/Di Tella, calendario escolar, paritarias, aguinaldos, clima, tipo de cambio, competencia MELI.
- Reasoning text expuesto en la ficha del cliente (auditable) + badges de archetype (regalo único / reponedor frecuente / estacional / heavy user / comprador impulso).
- Drift monitor con alertas automáticas en Slack/email cuando MAE sube sobre threshold.
- Posible API propia (`/api/ltv/predict/v2`) para que agencias/partners puedan consumir predicciones con cliente autorizado. Diferenciador comercial.

---

## 🟡 Prioridad ALTA

### BP-005 — Motor de mensajería multi-canal hiperpersonalizada (push + email + WhatsApp) alimentado por NitroPixel

**Entró al backlog**: 2026-04-17 (Sesión 40)
**Estado**: 📝 pendiente
**Trigger**: idea estratégica de Tomy. Activar el valor de NitroPixel convirtiendo sus señales de comportamiento en mensajes accionables que impacten ventas en tiempo real.

**Concepto**:
Un sistema de triggers que escucha en tiempo real las señales de comportamiento que NitroPixel captura —productos vistos, carrito abandonado, tiempo en página, intent score behavioral, recencia de visita, categorías de interés, scoring, etapa del funnel— y dispara mensajes **altamente personalizados** a través de 3 canales: push notifications web, email y WhatsApp. La diferencia con "email marketing tradicional" es que la personalización es **cliente → mensaje único**, no segmento → blast.

**Casos de uso concretos**:
- **Abandono de carrito inteligente**: WhatsApp si el cliente abrió un WhatsApp en los últimos 7 días, email si no. Mensaje menciona el producto específico + cuánto tiempo hace que lo vio + intent score ("parece que te interesó mucho").
- **Reposición predictiva**: si el cliente compró un producto de consumo repetitivo hace X días (pañales, pilas, etc.), dispara recordatorio en el canal de mayor engagement histórico.
- **Noticia de producto que miró**: si un producto que el cliente vio 3+ veces tiene stock bajo / vuelve al stock / baja de precio → push notification con deep link.
- **Win-back contextual**: cliente con behavioral score cayendo + antigüedad >60d sin compra → mensaje con el "archetype" identificado (regalo único vs. reponedor vs. estacional) y oferta ajustada.
- **Bienvenida behavioral**: nuevo visitante identificado, mensaje de onboarding diferente según categorías visitadas y hora del día.
- **Lanzamiento segmentado**: producto nuevo solo se anuncia a usuarios cuya historia behavioral predice interés real (no blast masivo).

**Requisitos técnicos** (high level):
- Orquestador de triggers (evaluación en tiempo real o near-real-time via cron de 5-10 min).
- Rules engine: condiciones compuestas (IF behavioral_score > 70 AND last_visit > 3d AND category_interest = 'juguetes_educativos' THEN dispara trigger X).
- Proveedores:
  - Web push: navegador nativo + service worker (gratis, sin proveedor externo).
  - Email: SendGrid / Resend / Postmark.
  - WhatsApp: WhatsApp Business API (Meta directo o via 360dialog / Twilio). Requiere templates aprobados.
- Templates dinámicos con merge fields por cliente (productos vistos, última visita, score, archetype).
- Consent & opt-out management por canal (fundamental para WhatsApp y legal por Ley 25.326).
- Frecuencia capping: no más de N mensajes por cliente por día / semana para evitar fatiga.
- Attribution: trackear qué trigger generó qué venta vía UTM + cookie matching.
- Dashboard operativo: volumen enviado / abierto / click / convertido por trigger, por canal, por arquetipo.
- Integración con Bondly Segmentos y Aura (los mismos clientes identificados).

**Por qué tiene sentido ahora**:
- NitroPixel ya captura las señales (implementado en sesiones 37-39).
- Bondly ya identifica clientes y scoring behavioral (sesión 40).
- El motor convierte datos observados → plata, que es la razón existencial de todo el stack.
- WhatsApp tiene tasas de apertura de 95%+ en Argentina — canal dominante para ecommerce retail.

**Skills relevantes para cuando se implemente**: `channels-whatsapp`, `email-automations`, `segmentation-clv`, `backend-api`, `gtm-master`, `legal-compliance` (consent).

**Riesgos/consideraciones**:
- **Fatiga de canal**: si se abusa, el cliente bloquea push/WhatsApp y se pierde el canal para siempre. Frecuencia capping es mandatorio.
- **Costos de WhatsApp**: la API cobra por conversación iniciada (~$0,05-0,15 por conversación en AR). Hay que calcular unit economics del trigger.
- **Compliance**: WhatsApp Business exige opt-in explícito + templates pre-aprobados + ventana de 24h para mensajes no-template. La implementación tiene burocracia.
- **Personalización genuina vs. creepy**: un mensaje que diga "vimos que viste esto 3 veces" es transparente. Uno que implique tracking sin decirlo es inquietante. Balance.

**Ambición**: motor nivel Klaviyo/Braze pero nativo a NitroSales, alimentado por NitroPixel (que un Klaviyo no tiene) y Bondly scoring. Diferencial competitivo fuerte.

---

### BP-006 — Aura como marketplace de afiliados cross-NitroSales (efecto red entre tiendas de la red)

**Entró al backlog**: 2026-04-17 (Sesión 40)
**Estado**: 📝 pendiente
**Trigger**: idea estratégica de Tomy. Transformar Aura de "módulo de creator economy de una marca" a "backbone de afiliación de toda la red NitroSales".

**Concepto**:
Hoy Aura vive dentro de una marca: cada tenant tiene sus propios creadores, campañas y deals aislados. La propuesta es abrirlo a marketplace multi-tenant donde:

- **Cualquier cliente** de cualquier tienda que use NitroSales aparece automáticamente en Aura como **afiliado potencial** (previa opción de opt-in obviamente).
- **Del lado oferta**: cada marca publica sus campañas de afiliación con comisiones, ventana de atribución, términos, y requisitos mínimos (ej: "solo para afiliados con score >70").
- **Del lado demanda**: creadores + clientes recurrentes + afiliados eligibles aplican y se matchean con marcas relevantes a su perfil (categoría de consumo, geografía, reach social si lo declaran, trust score interno).
- Aura deja de ser módulo cerrado → se vuelve el **sistema nervioso de afiliación de toda la red NitroSales**.

**Cómo crea efecto red**:
- Cada nueva tienda que se suma a NitroSales **aporta oferta** (campañas) + **aporta demanda** (su base de clientes como afiliados potenciales).
- Más tiendas = más ofertas para los afiliados = más afiliados activos = más ventas para todas las tiendas = más tiendas quieren entrar.
- Clásico two-sided marketplace con flywheel positivo.
- Diferencial contra plataformas genéricas (ShareASale, Impact): la data del comportamiento de compra real (vía NitroPixel + histórico de orders) hace que el matching sea muchísimo más preciso que un formulario de "me interesa la categoría X".

**Ejemplos de uso**:
- Cliente VIP de Mundo del Juguete que compra muñecos mensualmente aparece como afiliado recomendado para una marca nueva de accesorios de muñecas que entró a NitroSales.
- Creador ya activo en una marca puede aplicar a 5 campañas más de marcas complementarias sin pasar por otra curva de alta.
- Una marca chica que entra nueva a la red arranca con acceso a la base completa de afiliados activos (no tiene que empezar a construir audiencia desde cero).

**Requisitos técnicos** (high level):
- **Modelo multi-tenant real en Aura**: hoy `creatorId` vive bajo `organizationId`. Hay que agregar la noción de "afiliado global de la red" que puede operar contra múltiples `organizationId`.
- **Consent cross-tenant**: cada cliente de tenant A debe consentir que aparezca en Aura como afiliado potencial visible a otros tenants (GDPR-ish / Ley 25.326 requirement).
- **Matching engine**: recomendador que empareje afiliados con campañas según afinidad de categoría, historial de conversión, tamaño de audiencia declarado, geografía, arquetipo.
- **Browsing de campañas estilo marketplace**: UI donde un afiliado ve campañas disponibles, filtros por comisión/categoría/marca.
- **Dashboard de afiliado global**: el afiliado ve TODAS las campañas activas suyas en una sola vista, no tenant por tenant.
- **Liquidación cross-tenant**: un afiliado recibe payouts de múltiples tenants, posiblemente con estructuras fiscales distintas. Hay que modelar bien.
- **Trust score interno**: para evitar fraude / fake conversions, score de reputación basado en histórico de cumplimiento, tasa de conversión real, tasa de contracargo, etc.
- **Attribution cross-domain**: cookie / fingerprint / deterministic matching (email) para trackear conversions que cruzan de tienda A (donde el afiliado promociona) a tienda B (donde se concreta), sin romper atribución.
- **Dispute resolution**: marco para resolver conflictos de atribución entre marcas cuando 2 afiliados reclaman la misma venta.

**Por qué tiene sentido ahora**:
- Aura ya tiene la base de creator economy (sesiones 31-36).
- Bondly ya identifica y scorea clientes (sesión 40).
- El paso natural es abrir la puerta entre módulos y entre tenants.
- Un afiliado que conoce una marca porque fue su cliente probablemente la vende mejor que un desconocido con seguidores.

**Skills relevantes para cuando se implemente**: `loyalty-referral`, `marketplace-master`, `legal-compliance`, `backend-api`, `database-infra` (multi-tenant schema).

**Riesgos/consideraciones**:
- **Fricción de consent**: clientes pueden ver "querés ser afiliado de otras marcas" como invasivo. Propuesta de valor y UI de opt-in tienen que ser muy claras.
- **Competencia interna**: si 2 tiendas compiten en la misma categoría, ¿pueden verse los afiliados entre sí? Necesita reglas de exclusividad opcional por categoría o a criterio de la marca origen.
- **Escalabilidad de liquidación**: cuando haya 100+ tenants x 1000+ afiliados x múltiples monedas/AFIP, el módulo de payouts se pone complejo. Planear arquitectura desde el día 1.
- **Quality control**: afiliados con mal desempeño bajan la percepción de la red entera. Sistema de rating + baja automática requerido.
- **Pricing del feature**: ¿cobra NitroSales una comisión sobre comisiones? ¿Es gratis y se monetiza vía otros módulos? Decisión estratégica importante.

**Ambición**: volver a NitroSales el **"Shopify Collabs" del ecommerce LATAM** pero con data de comportamiento real en el core. Moat muy fuerte — cuanto más grande la red, más difícil de replicar.

---

## 🟢 Prioridad MEDIA

### BP-007 — Permisos granulares por tipo de dato dentro de cada sección (sub-permisos)

**Entró al backlog**: 2026-04-19 (Sesión 48 — fase Permisos / enforcement)
**Estado**: 📝 pendiente
**Trigger**: Tomy planteó caso real: "un analista de ecommerce entra a /productos para ver qué vende, pero NO debería ver márgenes ni costos". Sistema actual de permisos es binario por sección: ve toda la sección o no la ve.

**Contexto**:
- Hoy (commit `4ef1a52`) cada sección tiene 1 permiso con 4 niveles (none/read/write/admin). Funciona bien pero no separa data sensible de data operativa dentro de la misma página.
- Casos reales que aparecerán:
  - Analista de ecommerce ve productos pero NO márgenes/costos.
  - Contador externo ve Fiscal y Costos pero NO márgenes estratégicos.
  - Marketing manager ve Campañas (ROAS, spend) pero NO costos COGS del producto.
  - Jefe de ventas ve Órdenes (totales, clientes) pero NO márgen por orden.

**Opción acordada con Tomy (Opción B)**: sub-permisos por tipo de dato.
- Dividir secciones en sub-secciones lógicas:
  - `products` → `products_basico` (catálogo, SKU, stock, ventas unitarias) + `products_financiero` (costos, márgenes, rentabilidad)
  - `orders` → `orders_basico` (totales, clientes, productos) + `orders_financiero` (márgen, comisiones detalladas)
  - `bondly_clientes` → `bondly_basico` (contacto, compras) + `bondly_financiero` (LTV, revenue acumulado)
  - `campaigns` → `campaigns_basico` (spend, impresiones) + `campaigns_financiero` (ROAS, márgen por campaña)
- La matriz de permisos suma ~5-8 columnas nuevas.
- Cada card/columna sensible se envuelve con `<PermissionGate section="products_financiero" level="read">`.

**Esfuerzo estimado**: 2-3 sesiones.

**Cuándo implementarlo**: cuando algún cliente real (Arredo, TV Compras o posteriores) pida específicamente este nivel de control. No antes. Mientras tanto, si no querés que alguien vea márgenes → no le das acceso a Productos. Punto.

**Opción descartada**: field-level permissions completo (cada columna/card con permiso individual tipo Salesforce). Overkill para <30 personas por org. Se reconsiderará cuando haya 10+ clientes pagando con auditoría formal.

---



### BP-002 — `/bondly/audiencias` sin contenido

**Entró al backlog**: 2026-04-17 (Sesión 40)
**Estado**: 📝 pendiente
**Contexto**: la ruta existe en el sidebar de Bondly desde Fase 1, pero la página todavía no tiene contenido. Es la próxima sección natural del rediseño Bondly después de LTV. Debería incluir: builder de audiencias con reglas (gasto, recencia, productos, segmento, LTV tier), preview con contador, export a Meta/Google CRM lists, segmentos predefinidos (VIP, en riesgo, cart abandoners, etc.), sincronización automática.

### BP-003 — Row expansions en tabla de cohortes de LTV

**Entró al backlog**: 2026-04-17 (Sesión 40)
**Estado**: 📝 pendiente
**Contexto**: la tabla de retención por cohorte en `/bondly/ltv` muestra porcentajes por mes. Click en celda debería expandir fila mostrando el drill de clientes de ese cohorte con comportamiento de retención individual. Útil para investigar por qué un cohorte específico (ej: diciembre 2024) tiene retención anómala.

### BP-004 — Cursor pagination en Behavioral Explorer feed

**Entró al backlog**: 2026-04-17 (Sesión 40)
**Estado**: 📝 pendiente
**Contexto**: el Behavioral LTV Explorer en `/bondly/ltv` muestra visitantes pixel scoreados. Hoy está limitado a un paginado básico. Cuando la base de visitantes crezca (>50k), el endpoint puede volverse lento. Migrar a cursor pagination (`id > lastSeenId LIMIT N`) cuando sea necesario.

---

## 🔵 Prioridad BAJA (nice-to-have)

_(vacío por ahora)_

---

## ✅ Resueltos

_(vacío por ahora — cuando un ítem se resuelva, mover acá con fecha, sesión y commit)_

---

## 🗑 Descartados

_(vacío por ahora — cuando un ítem se descarte, mover acá con razón)_

---

## Notas de uso para Claude

- **Al inicio de cada sesión**: leer este archivo junto con los otros tres obligatorios (`CLAUDE.md`, `CLAUDE_STATE.md`, `ERRORES_CLAUDE_NO_REPETIR.md`).
- **Cuando Tomy pida "agregar un pendiente"**: agregar un nuevo ítem con ID correlativo (`BP-XXX`), prioridad, estado, fecha de entrada y contexto. No inventar prioridad — preguntar si no queda clara del mensaje.
- **Cuando Tomy pida "resolver un pendiente" o lo hagamos juntos**: actualizar el estado, mover al bloque "Resueltos" con fecha/sesión/commit(s).
- **Cuando Tomy pida "descartar un pendiente"**: mover al bloque "Descartados" con la razón.
- **Al cierre de sesión**: si surgieron cosas "para después" durante el trabajo, proponerlas a Tomy para agregarlas acá (no auto-agregarlas sin consulta).
- **No duplicar**: si un tema ya está en `CLAUDE_STATE.md` → sección "Pendientes / backlog" de alguna sesión, hacer match acá con el ID correspondiente para evitar que vivan en dos lados.

---

## ⚠️ BP-CORE-001 — Cambio en CORE PROTEGIDO: ventana de atribución anclada a orderDate (2026-06-11)

**ARCHIVO PROTEGIDO MODIFICADO:** `src/lib/pixel/attribution.ts` (motor de atribución).
**Backup original:** `~/Documents/NitroSales-Diagnostico/attribution.ts.bak`
**Branch:** `prod-local-axel` (NO prod, NO pusheado).

**Qué se cambió (2 lugares):**
1. Línea ~197 (query `primaryEvents`): `windowStart` pasó de `new Date()` (ahora) a
   `new Date(order.orderDate.getTime() - maxWindowDays*86400000)`, y se agregó
   `windowEnd = order.orderDate + 1 día`. El filtro `timestamp` pasó de `{ gte: windowStart }`
   a `{ gte: windowStart, lte: windowEnd }`.
2. Query de IP-merge (relatedEvents): mismo cambio en el filtro `timestamp` (agregar `lte: windowEnd`).

**Por qué:** la ventana estaba anclada a `now()`. En replay histórico (atribución retroactiva),
la ventana `[now-Nd, now]` NO contenía el journey de órdenes viejas → `primaryEvents.length===0`
→ return temprano sin crear atribución. Causa raíz de que la cobertura "no se recuperara"
retroactivamente. Anclar a `orderDate` es además más correcto (touchpoints previos a la compra).
Para real-time es equivalente (orderDate ≈ now).

**Impacto medido:** día 05-23 pasó de 0 → 18/20 órdenes atribuidas. (Recuperación completa: ver ESTADO_SESION.)

**Recuperación retroactiva CONVERGIDA (2026-06-11, branch, EMDJ, ventana 09-05→09-06):**
drain por-día hasta convergencia (`scripts-tmp-replay-drain.cjs`, vía `/api/admin/replay-attribution`,
excl. CANCELLED/PENDING/RETURNED + marketplace). Resultado: **4627/5374 = 86,1%** (baseline de arranque
85,3% → +45 órdenes este run; +respecto al ~73% techo con la lógica vieja). **Convergido**: un sweep
completo recuperó 0 nuevas. Las 747 restantes son irrecuperables retroactivamente — TODAS tienen email
de customer (744/747) pero NO matchean a un pixel-visitor con journey reconstruible (atribución que solo
existía en tiempo real: cookie/sesión/IP del momento de compra, ya perdida). El techo retroactivo real
es 86,1%; subirlo más requiere el FIX ESTRUCTURAL (BP I1 / Parte B: que TODA ingesta corra
`calculateAttribution` going-forward) — diferido al fundador.

**Cómo revertir:** `cp ~/Documents/NitroSales-Diagnostico/attribution.ts.bak src/lib/pixel/attribution.ts`
(o revertir los 2 bloques marcados con `FIX 2026-06-11`). tsc exit 0 con el cambio.

**Pendiente de OK del fundador** antes de considerarlo para prod (es CORE-ATTRIBUTION).

---

## ✅ BP-I2 — `receivedAt` sin índice en endpoints user-facing del pixel — ARREGLADO 2026-06-11 (branch)

**Bug** (BUGS_Y_ERRORES.md I2): `orderBy {receivedAt}` y `WHERE receivedAt >=` sobre `pixel_events`
(~19M filas) en endpoints del pixel. `receivedAt` NO tiene índice → full scan/sort 60-76s → la
página se cuelga o muestra $0. `timestamp` SÍ está indexado (`(orgId,type,timestamp)`, `(visitorId,
timestamp)` + covering `(orgId,timestamp)` de esta sesión).

**Arreglados esta sesión** (4 archivos, NO commiteado, branch prod-local-axel, tsc exit 0):
- `src/app/api/me/nitropixel-recent-events/route.ts`
- `src/app/api/connectors/route.ts`
- `src/app/api/nitropixel/data-quality-score/route.ts` (getOrgMeasurementStart + 3 queries de rango)
- `src/app/api/bondly/pulse/route.ts` (8 usos: first/last event, counts 24h/5m, 5m distinct, timeline 30d, live signals 60m)
(Antes ya estaban `install-status` y `asset-stats` — commit c8bfb3d.)

**Fix = swap `receivedAt` → `timestamp` (indexado) + GUARD anti-basura.** Verificado vía EXPLAIN:
Index Only Scan, 43-639ms (era 60-76s). **Hallazgo clave durante el fix**: `timestamp` es client-provided
y tiene datos corruptos (1978 y fechas futuras como 2026-07-02). Un swap "pelado" cambiaría "lento pero
correcto" por "rápido pero muestra evento hace 0s / 48 años de datos". Por eso se acotó:
`lte: now` (un evento no puede ocurrir en el futuro) + `PIXEL_FLOOR=2024-01-01` para first-event.
Verificado post-guard: first=2026-01-06 (real, era 1978), last=2026-06-08 (real, era 2026-07-02),
count 5m=0 (correcto, era 3 basura). `data-quality` ya estaba protegido por su clamp `max(FLOOR, first)`.

**gstack:** /gstack-investigate (causa raíz) + /gstack-review (critical pass: SQL parametrizado OK,
column-safety OK, time-window OK, type-coercion OK; sin findings críticos).

**Pendiente relacionado (root cause, separado):** limpiar los `timestamp` basura en `pixel_events`
+ guard en el write-path del pixel (ya es ítem M-note). Estos fixes DEFIENDEN contra la basura;
no la eliminan. Misma exposición latente quedó en `asset-stats`/`install-status` (ya shippeados):
conviene agregarles el mismo `lte: now` cuando se toquen.

---

## ✅ BP-I3 — Hacks DEMO restantes en `/api/metrics/orders` — ARREGLADO 2026-06-11 (branch)

**Bug** (BUGS_Y_ERRORES.md I3): 3 hacks demo que enmascaraban errores como $0 (gravísimo en
plataforma de data). Backups: `~/Documents/NitroSales-Diagnostico/orders-route.ts.bak` + `db-client.ts.bak`.

1. `orders/route.ts` `DEMO_GLOBAL_TIMEOUT_MS=15000` (race → mock vacío): **REMOVIDO**. Cortaba
   consultas históricas legítimas (30/90d tardan 10-12s, podían superar 15s) y devolvía $0 con
   200, anulando el retry del frontend. Ya hay resiliencia real: `maxDuration=120`,
   `statement_timeout=25000` en DSN, `safeQuery()` per-query (fallback parcial), y el frontend
   (`/orders` page.tsx) tiene timeout 45s + 3 reintentos en 5xx + setError.
2. `orders/route.ts` `DEMO_MODE_MOCK_ON_ERROR=true` (catch → mock vacío 200): **REMOVIDO** → vuelve
   a `500` real. El frontend ya estaba preparado (reintenta en 5xx, muestra error). Mostrar "$0
   ventas" cuando falló la query es peor que mostrar el error.
3. `db/client.ts` `connection_limit=24` "REVERTIR a 8": **relabeled, mantenido en 24** (NO revertido).
   El "8" de REGLA #3b es previo al diseño de 14 queries en paralelo de orders y causaría pool
   timeouts (que ahora saldrían como 500). Endpoint Neon -pooler → 24 lógicas seguras. Documentado.

**Verificado**: tsc exit 0; orders devuelve data real (EMDJ 1-8 jun VTEX = 1.108 órdenes/$60,9M,
sin `_demoMode`). `_demoMode`/`_timeoutMs` no se leen en ningún frontend (grep). 

**gstack:** /gstack-investigate (mapeo de los 3 hacks + verificación de manejo de errores del
frontend) + /gstack-review (critical pass sin findings).

---

## ✅ BP-I4 — Filtro de status inconsistente entre módulos — COMPLETO (2026-06-12, branch)

> **DECISIONES DE TOMY (2026-06-11):** solo cuentan ventas confirmadas. **APPROVED SÍ cuenta**
> (pago aprobado = venta real). **RETURNED siempre se excluye.** **PENDING nunca cuenta.**
> → Alinear TODO al helper canónico `ordersValidWhere()` = `NOT IN (CANCELLED,PENDING,RETURNED)
> AND totalValue>0`. Por tandas chicas con verificación de números antes/después por módulo.
>
> **Tandas (numeros = EMDJ, branch):**
> - ✅ **Tanda A — `metrics/pnl`** (13 filtros `$queryRaw` → `ordersValidWhere("o")`). 2026-06-11.
>   May1-Jun9: 19.255→19.253 ord, $768.606.680→$768.457.539 (Δ -2 ord/-$149k por PENDING; 0 por totalValue). tsc OK. Backup `pnl-route.ts.bak`.
> - ✅ **Tanda B — `metrics/products` (6) + `metrics/customers` (10, $queryRawUnsafe→`ordersValidSql`) + `metrics/analytics` (3)**.
>   Helper extendido: `ordersValidWhere`/`ordersValidSql` ahora soportan alias vacío ("") para `FROM orders`. Δ EMDJ 30d -2 ord/-$149k, 90d -5 ord/-$207k. tsc OK.
> - ✅ **Tanda C — `metrics/pixel` (20, CORE, backup) + `metrics/conversion` (3)**. Sumaron RETURNED
>   (antes solo excluían CANCELLED,PENDING) → canónico. Δ EMDJ 30d 0, 90d -33 ord/-$845k (RETURNED). tsc OK.
> - ✅ **Tanda D — `metrics/top` (5) + `metrics/trends` (1) + `metrics/route.ts` (1)** ($queryRawUnsafe→`ordersValidSql`).
>   `IN (INVOICED,SHIPPED,DELIVERED)` → canónico (SUMA APPROVED). **Δ EMDJ 30d +327 ord/+$11,0M, 90d +518 ord/+$21,1M.**
>   Arregla incoherencia: estas vistas mostraban MENOS revenue que el dashboard principal (que ya contaba APPROVED). tsc OK.
> - ✅ **Tanda E — bondly/* (5)**: pulse, ltv-insights, churn-risk (tagged) + clientes, clientes/[id] (unsafe, alias o/o2). Δ PENDING (~-2/-5 ord). tsc OK.
> - ✅ **Tanda F — finanzas/pulso + finance/shipping-rates/carriers + /calculate (3)** (tagged). tsc OK.
> - ✅ **Tanda G — cron/digest + cron/anomalies (2)** (tagged). tsc OK.
> - ✅ **Tanda H — ltv: prediction-engine + settings/ltv (unsafe→`ordersValidSql`) + send-meta + send-google + fix-brands (Prisma `notIn`→canónico) (5)**. tsc OK.
> - ✅ **Tanda I — alerts/primitives/orders + /finanzas (unsafe) + sync/reconcile (tagged) + admin/vtex-audit-all (5)**. tsc OK.
>   (NO tocado en alerts/orders: `getPendingShipment` usa `IN ('APPROVED','INVOICED')` = filtro específico, no "orden válida".)
> - ✅ **Extra (barrido final reveló subcontados)**: `metrics/ltv` (9), `metrics/distribution` (4, suma APPROVED), `health` (1 Prisma),
>   `mercadolibre/dashboard:136` (1 Prisma), `metrics/orders` (7 sub-queries internas que excluían PENDING solo para MELI → canónico),
>   `pixel/journeys` (1). tsc OK.
>
> **TOTAL: ~34 archivos, 134 call-sites** (78 `ordersValidWhere` + 56 `ordersValidSql`). Helper string nuevo `ordersValidSql()` +
> soporte de alias vacío. **Una sola fuente de verdad** (genera del enum `ORDER_STATUS_NOT_CONCRETED`).
>
> **Verificación final:** tsc exit 0 · QA (/pixel 200 sin _demoMode; `ordersValidSql` ejecuta en 4 contextos: alias/sin-alias/CASE WHEN/o2;
> orders headline intacto 1108/$60,9M) · CSO (134 call-sites con alias constante, cero input de usuario → sin inyección).
> Backups CORE: pnl, pixel, conversion (.bak). Resto recuperable por git.
>
> **Δ NÚMEROS CLAVE (EMDJ):** PENDING excluido = mínimo (~-2/-5 ord, 0,01%). RETURNED en pixel/conversion = 90d -33 ord/-$845k.
> **APPROVED sumado en top/trends/distribution = 30d +327 ord/+$11,0M, 90d +518 ord/+$21,1M** (arregla undercount vs dashboard principal).
>
> **Excluidos (intencional):** alerts `getPendingShipment` (IN APPROVED,INVOICED), finance/auto-costs (selecciona cancelled/returned),
> admin/validate-orders-count + debug-* + replay-attribution + ml-diff-detail (tools de diagnóstico admin, no métricas mostradas),
> mercadolibre/dashboard IN(CANCELLED,RETURNED) (métrica de cancelaciones), orders anti-join packs, ensure-coherence-indexes (partial idx),
> y no-órdenes (claims MELI, jobs backfill, status de onboarding).



**Bug** (BUGS_Y_ERRORES.md I4): la misma métrica de "ventas válidas" usa filtros de status
distintos en distintos módulos → números incoherentes.

**Hallazgo (investigate 2026-06-11)**: NO son 5 endpoints como decía BUGS — son **41 archivos**
con filtros ad-hoc. Conteo por patrón:
- `NOT IN (CANCELLED, RETURNED)` → **25 archivos** (dominante: bondly ×15, ltv, finanzas, products)
- `NOT IN (CANCELLED, PENDING)` → 8 (conversion/debug)
- `IN (INVOICED, SHIPPED, DELIVERED)` → 4 (metrics/trends, distribution)
- `NOT IN (CANCELLED)` solo → 3
- `NOT IN (CANCELLED, PENDING, RETURNED)` [= el helper canónico `ordersValidWhere`] → solo 3

**Por qué NO se ejecutó autónomo (requiere decisión de negocio):**
1. El helper canónico excluye PENDING, pero 25 archivos lo INCLUYEN. Unificar al canónico
   **bajaría revenue/clientes** en LTV/Bondly/Finanzas/Products (sacaría PENDING). ¿PENDING
   cuenta como venta válida? → decisión del dueño.
2. `IN (INVOICED,SHIPPED,DELIVERED)` (trends/distribution) cuenta solo despachado; LTV maneja
   RETURNED por su dominio. Algunas divergencias parecen intencionales, no bugs.
3. Blast radius 41 archivos + cambia números visibles platform-wide → REGLA #3b (cada cambio SQL
   con cuidado) y "coherencia > velocidad".

**Decisión pendiente (para Tomy):** definir el set canónico de "venta válida" (¿PENDING cuenta?)
y si distribution/LTV mantienen su semántica propia. Recomendación: (a) confirmar
`ordersValidWhere = NOT IN (CANCELLED,PENDING,RETURNED)` como verdad para dashboards de
revenue/órdenes; (b) migrar SOLO los módulos de revenue a ese helper en tandas chicas + verificar
números antes/después por org; (c) dejar distribution/trends (`IN INVOICED/SHIPPED/DELIVERED`) y
LTV como excepciones documentadas. NO hacer find-replace global.

---

## ✅ BP-I5 — avg_ticket por fila vs total_orders por packId — ARREGLADO 2026-06-11 (branch)

**Bug** (BUGS_Y_ERRORES.md I5): `avg_ticket = AVG("totalValue")` promedia por FILA, pero
`total_orders = COUNT(DISTINCT packId)` cuenta por PACK. Para packs MELI (N filas, 1 packId)
divergen → ticket promedio incorrectamente bajo.

**Hallazgo:** en `orders/route.ts` el avgTicket que se MUESTRA ya estaba correcto — se computa en
JS como `totalRevenue / totalOrders` (L~1204, con comentario explicando el problema MELI). Las
columnas SQL `AVG("totalValue") AS avg_ticket` de las queries #1 y #2 eran **dead code** (se
seleccionaban pero NUNCA se leían en JS) y computaban el promedio buggy por fila.

**Fix:** removidas las 2 columnas SQL `avg_ticket` + sus campos en el tipo TS, para que nadie las
cablee por error pensando que son correctas. Verificado: tsc exit 0; avgTicket MELI = 45.132 =
102.539.114,74 / 2.272 (revenue/orders, exacto). Sin cambio de número para el usuario.
`bondly/clientes` usa `AVG` pero filtrado a `source='VTEX'` (1 fila/orden) → no tiene el bug.

**gstack:** /gstack-investigate (traza de avg_ticket: dead code confirmado) + /gstack-review (sin findings).

---

## 🟢 Bugs menores (BUGS_Y_ERRORES.md) — estado 2026-06-11 (branch)

- **✅ M4 — `Domain: "Marketplace"` en payload de reattribute-missing-vtex** — ARREGLADO.
  Era un campo engañoso en el payload fabricado del webhook (son órdenes WEB, no marketplace).
  Verificado: el webhook `webhooks/vtex/orders` NO referencia `Domain` (grep 0 refs) → removerlo
  es cero cambio de comportamiento. Removido. tsc exit 0. (/gstack-investigate + /gstack-review).

- **✅ M1 — Key hardcodeada → env var** — HECHO EN CÓDIGO (2026-06-11, branch). Migrados **89
  archivos** + helper nuevo `src/lib/admin-key.ts` (lee `process.env.ADMIN_API_KEY`; fail-closed:
  si la env no está, cae a un valor aleatorio por proceso → nunca acepta key vacía; CERO literal en
  el código). `ADMIN_API_KEY` agregado al `.env` del branch. Verificado: `grep` = 0 ocurrencias del
  literal en `src/`; tsc exit 0; key válida autentica (orders 200 con data), key inválida → 403;
  todos los routes son Node runtime (crypto OK). Página cliente `control/preview/vtex-afiliado` →
  placeholder (no se bundlea el secreto al browser). gstack: /gstack-cso (scan) + /gstack-review.

  **⚠️ FALTA antes de prod (decisión/coordinación de Tomy):**
  1. **Setear `ADMIN_API_KEY` en Vercel** ANTES de mergear. **Acople importante:** `vercel.json`
     tiene 28 paths de cron con `?key=<literal>` (los crons SON los senders y vercel.json NO puede
     usar env vars en el path). Por eso, hasta migrar los crons a `CRON_SECRET` (auth por header de
     Vercel), `ADMIN_API_KEY` en prod **debe ser igual al literal actual** (no se puede rotar todavía).
  2. **Rotar el secreto** requiere ANTES migrar `vercel.json` → `CRON_SECRET` (header `Authorization:
     Bearer`). NO se hizo autónomo: cambia la AUTENTICACIÓN de TODOS los crons en prod, no se puede
     verificar en local (Vercel inyecta el header solo en su runtime de cron) → riesgo alto. Es la
     tanda siguiente, con OK de Tomy.
  3. (Hygiene baja) docs históricos (CLAUDE_STATE.md, NEXT_SESSION_PROMPT.md) tienen URLs de ejemplo
     con el literal — no funcional, opcional limpiar.

- **🟢 M2 — `count()` sobre tablas grandes en endpoints admin** (admin/alertas, admin/clientes,
  admin/clientes/[orgId], admin/compare-orgs-pixel) — BAJA PRIORIDAD, no tocado. Son admin-only y
  de baja frecuencia; el costo no justifica el riesgo de tocar 4 endpoints ahora. Fix futuro:
  cachear o usar estimaciones (o `findFirst` si alguno es chequeo de existencia, como section-status).

- **🟢 M3 — Pill "Recalculando atribuciones" persiste unos segundos** (`/pixel` page.tsx) — NO
  tocado (taste call). Es un debounce DELIBERADO ("minimum 800ms to avoid flash/glitch" + fade 0.4s)
  para evitar parpadeo; la data ya está correcta debajo. Acortar el floor (600ms) reduciría el
  lingering pero reintroduce riesgo de flash → decisión de UI/taste (requiere UI_VISION). Diferido.

---

## ✅ BP-I1 — Fix estructural de atribución (100% de ahora en adelante) — HECHO EN CÓDIGO (2026-06-11, branch)

> **DECISIÓN DE TOMY:** garantizar que TODA orden web nueva se atribuya, entre por donde entre
> (el cliente pidió 100% going-forward). Causa raíz: solo el webhook real-time corría
> `calculateAttribution`; los demás caminos creaban órdenes sin atribuir.

**Mapeo de los 3 caminos de ingesta (VTEX; MELI fuera de scope = marketplace sin journey):**
| Camino | Estado previo | Acción |
|---|---|---|
| Webhook real-time (`webhooks/vtex/orders`) | ✅ ya atribuía | — |
| Cron 30min (`vtex-sync-recent`→`trigger-vtex-sync`) | ✅ ya atribuía (proxia AL webhook) | — (verificado L118 POST a webhook) |
| Cron diario / deep sync (`sync/vtex` createMany) | ❌ NO atribuía | ✅ cableado |
| Backfill (`backfill/processors/vtex-processor`) | ❌ NO atribuía | ✅ cableado |

**Implementado:**
1. **Helper nuevo `src/lib/pixel/attribute-order-by-match.ts`**: matchea visitor (email → checkout-timing
   ±3h) y corre `calculateAttribution`. Idempotente, excluye marketplace, guard de email (no pisa otro).
   Lógica probada (= reconcile/replay; post-hoc no hay IP/teléfono, solo email — eso solo está en el payload live).
2. **`sync/vtex`** (backup `sync-vtex-route.ts.bak`): loop de atribución post-enrich (secuencial, idempotente,
   no-fatal), expone `attributed` en el response.
3. **`backfill/vtex-processor`** (backup `vtex-processor.ts.bak`): atribución post-enrich, concurrency 5.
4. **Cron de reconciliación nuevo `src/app/api/cron/attribution-reconcile`**: red de seguridad — barre
   órdenes web sin NITRO de los últimos N días (default 3) y las atribuye. limit default 40 (~240s < maxDuration).
   Cubre el race "webhook llegó antes que el visitor". Auth env-driven (ADMIN_API_KEY/NEXTAUTH_SECRET).

**TEST CLAVE (paso pedido por Tomy) ✅:** orden web creada por el camino cron (forma de `sync/vtex`) para
un cliente EMDJ con journey → quedó atribuida NITRO, strategy=email, 10 touchpoints, attributedValue=99999.
Data de test limpiada. Endpoint de test temporal borrado.

**gstack:** /gstack-investigate (mapeo de caminos + matching) · /gstack-review (helper + sync/vtex + backfill) ·
/gstack-health tras cada cableado (tsc exit 0) · /gstack-cso (cron: auth + SQL parametrizado, sin findings).

**Perf nota:** `calculateAttribution` ~6s/orden; el cron procesa hasta 40/corrida. Candidate query optimizada
(enum sin cast: 476ms→91ms). En steady-state hay pocas candidatas; el backlog histórico lo drena el replay.

**FALTA antes de prod (Tomy):** agregar la entrada de `attribution-reconcile` en `vercel.json` (schedule)
— diferido junto con la migración de crons a `CRON_SECRET` (BP-M1). Sin esa entrada, el cron es invocable
manual pero no corre programado. Los caminos sync/vtex + backfill + webhook ya atribuyen sin depender del cron.

---

## ✅ BP-ROLLUPS-001 — Endpoint admin para crear los rollups HLL del pixel en prod — HECHO EN CÓDIGO (2026-06-12, branch)

> **BLOCKER #1 del deploy resuelto.** La Fase 2 del pixel (`/api/metrics/pixel`, perf 72s→2s) lee 7 tablas
> rollup + la extensión `hll`. Esas tablas se crearon SOLO en la DB del branch con los scripts
> `scripts/p2*.cjs`; prod NO las tiene → sin esto `/pixel/analytics` sale en $0. No había endpoint en el
> repo para crearlas en prod. Ahora sí.

**Archivo nuevo:** `src/app/api/admin/setup-pixel-rollups/route.ts`. Porta los scripts validados
(`p2-setup` + `p2-backfill2` + `p2b-backfill` + `p2b-reprecision`) a un endpoint resumible y serverless-safe.

**Contrato de diseño:**
- **Idempotente:** `CREATE … IF NOT EXISTS` + `ON CONFLICT DO UPDATE`. SIN `TRUNCATE` (los scripts truncaban;
  acá no, para no destruir data si una corrida se corta a la mitad). Fuente append-only → re-correr converge
  a los mismos valores HLL. Correrlo dos veces NO rompe nada.
- **No bloquea la DB:** cada chunk es un `INSERT…SELECT` de UN día sobre `pixel_events` (MVCC → leer no
  bloquea los writes del pixel en tiempo real; el único lock es sobre las filas del rollup, tablas nuevas
  sin lectores). No hace falta `CONCURRENTLY`.
- **Resumible (no choca contra maxDuration):** cada POST procesa hasta 250s y devuelve un cursor; el caller
  repite hasta `done:true`. Si un día/org falla, devuelve el cursor exacto de reanudación + URL `resume`.

**Fases (POST muta, GET solo lee):**
| Fase | Qué hace |
|---|---|
| `POST ?phase=schema` | `CREATE EXTENSION hll` + las 7 tablas. Rápido. |
| `POST ?phase=first-source` | Rebuild de `pixel_visitor_first_source` (first-touch por visitante). Resumible por org (`orgCursor`). |
| `POST ?phase=backfill` | Rollups diarios (aggregates/device/type/page/product/source). Resumible por día (`cursor=fecha`). |
| `GET ?phase=status` | Counts + cobertura (min/max día) por tabla. Read-only. |

**Orden obligatorio:** schema → first-source → backfill (el rollup `source` JOINea la dimensión first-source;
hay guard que aborta el backfill con 409 si la dimensión está vacía).

**Precisión HLL (consistente con el estado final del branch):** aggregates/device/page/product = `14,5`;
type/source = `16,5` (post-reprecision). Coincide con lo que lee el route vía `hll_union_agg`.

**gstack:** /gstack-review (2 findings INFORMATIONAL auto-fixed: reanudación-on-error en first-source y backfill;
SQL safety / idempotencia / no-bloqueo / precisión = PASS; quality 9.5/10) · /gstack-cso (scope auth+inyección+
exposición+DoS: 0 findings sobre el gate 8/10 — inputs parametrizados/validados con `isYmd`, auth fail-closed
`isValidAdminKey`, POST-muta/GET-lee, sin CSRF por usar `?key=` no-cookie). tsc exit 0.

**Cómo correrlo en prod:** ver `~/Documents/NitroSales-Diagnostico/LISTO_PARA_DEPLOY.md` §3 (paso 0-2).
Resumen: `schema` (1 call) → `first-source` (repetir con `orgCursor` hasta done) → `backfill` (repetir con
`cursor` hasta done) → verificar con `GET ?phase=status`. Idempotente: si algo se corta, se reanuda con el
cursor devuelto.

**Deuda heredada (no de este archivo, ya trackeada en BP-M1):** auth por `?key=` en query string y
`e.message`/`e.stack` en respuestas de error — mismo patrón que `ensure-coherence-indexes`, detrás de auth
admin. Se migra a `CRON_SECRET` por header en la tanda de BP-M1.

**ACTUALIZACIÓN 2026-06-12 (QA exhaustivo pre-deploy) — 2 BUGS ENCONTRADOS Y CORREGIDOS:**
1. **Bracket UTC demasiado ajustado (undercount ~14%).** `tsHi` estaba en `addDays(d,1)` (= `dHi`, sin
   generosidad). Como AR=UTC-3, los eventos de la NOCHE AR del día `d` caen en UTC `[d+1 00:00Z, d+1 03:00Z]`
   y se perdían. Fix: `tsHi = addDays(dHi, 1)` (= `addDays(d,2)`), igual que los scripts. Verificado:
   `total_events` del 06-06 pasó de 74.114 (buggy) → **86.290 (= valor original de los scripts, exacto)**.
2. **All-orgs-en-un-statement rompía el índice (442s/día → seq-scan de 19M).** Procesaba todas las orgs sin
   `"organizationId"=$1`, así que no usaba el índice `(organizationId, timestamp)`. Fix: iterar **por org**
   (como los scripts) → cada statement usa el índice. Bajó de **442s/día → ~13-20s/día** (branch throttleado;
   ~1-2s/día en prod). Además: `globalRange` ahora hace MIN/MAX sobre `timestamp` crudo (índice, no seq-scan
   funcional) y la lista de orgs sale de `pixel_visitors`/`pixel_visitor_first_source` (índice) en vez de
   `pixel_events` (19M) → overhead fijo por llamada de ~90s → ~11s throttleado.

**QA del endpoint (todo verificado en vivo contra el branch DB):** schema idempotente ×2 · status OK ·
first-source resumible por org (total 1.685.833 preservado = idempotente) · backfill día único (valor ==
original), ventana, cursor de reanudación (skip de días previos), idempotente ×2 · auth fail-closed (403 sin/mal/
vacía key). tsc exit 0 · `next build` exit 0 · re-pasó /gstack-review + /gstack-cso conceptual sobre la versión final.
