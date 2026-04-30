# BACKLOG_PENDIENTES.md — Temas pendientes de NitroSales

> **Propósito**: tracker vivo de temas que Tomy decidió no abordar ahora, pero que quedan registrados para no perderlos. Claude lee este archivo al inicio de cada sesión junto con `CLAUDE.md`, `CLAUDE_STATE.md` y `ERRORES_CLAUDE_NO_REPETIR.md`.
>
> **Cómo funciona**:
> - Tomy puede pedirle a Claude que cargue un tema nuevo acá en cualquier momento.
> - Cada ítem tiene contexto, prioridad, estado, y cuándo entró al backlog.
> - Cuando un ítem se resuelve, se marca como `✅ resuelto` con la sesión y commit(s), y se archiva en la sección "Resueltos".
> - Cuando un ítem se descarta, se marca como `🗑 descartado` con la razón.
>
> **Última actualización**: 2026-04-30 mediodia — Sesion 60. Bug afiliado VTEX detectado y resuelto manualmente para TVC. 4 entradas nuevas BP-S60-001 a BP-S60-004.

---

## 🔴 BP-S60-001 — Verificar atribucion end-to-end TVC con primera orden web real (URGENTE — destraba activacion)

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

## 🔴 BP-S60-002 — Implementar paso del afiliado VTEX en el wizard de onboarding (Tipo A — fix multi-tenant CRITICO)

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

## 🟠 BP-S60-003 — Reparar atribucion historica TVC (Tipo B — one-shot)

**Entró**: 2026-04-30 (S60)

**Contexto**: TVC tiene 33,985 ordenes VTEX traidas por backfill (S59 EXT2) sin atribucion en `pixel_attributions`. Tambien las 8 del 29/04 + las que entren antes de tener el webhook conectado. Como ahora el afiliado VTEX esta activo, las **futuras** ordenes se atribuiran automaticamente, pero **las pasadas no** — quedan vacias en el dashboard.

**Solucion (Tipo B, one-shot)**: endpoint admin nuevo `/api/admin/onboardings/[id]/replay-attribution` que:

1. Toma todas las ordenes web de la org (excluyendo MELI, FVG-, BPR-, channel=marketplace, trafficSource=Marketplace).
2. Para cada orden, intenta correr la misma logica de atribucion del webhook (las 6 estrategias en orden):
   - client-side PURCHASE event matching
   - email-checkout heuristic
   - email match
   - phone match
   - IP+UA fingerprint
   - recent activity
3. Si alguna estrategia matchea, llama `calculateAttribution(orderId, visitorId, orgId)`.
4. Idempotente: si ya hay attribution row, skip.
5. Limita procesamiento a ~500 ordenes por chunk con cursor para no timeout.

**Archivos a crear/tocar**:
- `src/app/api/admin/onboardings/[id]/replay-attribution/route.ts` — endpoint admin
- Refactor recomendado: extraer logica de las 6 estrategias del webhook (`src/app/api/webhooks/vtex/orders/route.ts` lineas 437-680) a `src/lib/pixel/attribution-strategies.ts` para usarlo desde el webhook Y desde el endpoint replay.

**Esfuerzo estimado**: ~2 horas (1.5h refactor + 0.5h endpoint).

**Estado**: Aprobado. A correr post-BP-S60-002.

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
