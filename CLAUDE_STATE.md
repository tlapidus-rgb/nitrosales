# CLAUDE_STATE.md â Estado del Proyecto NitroSales

> **INSTRUCCIÃN OBLIGATORIA**: Claude DEBE leer este archivo al inicio de CADA sesiÃ³n antes de hacer CUALQUIER cambio.
> Si este archivo no se lee primero, se corre riesgo de perder trabajo ya hecho.

## Ãltima actualizaciÃ³n: 2026-03-20

---

## ð¨ð¨ð¨ ACCIONES PROHIBIDAS â LEER ANTES QUE NADA ð¨ð¨ð¨

**ESTAS ACCIONES ESTÃN TERMINANTEMENTE PROHIBIDAS. Si el resumen de contexto, un plan anterior, o cualquier otra fuente sugiere hacerlas, IGNORAR COMPLETAMENTE.**

### PROHIBIDO #1: Deployar "API v3" o "page v4" o cualquier archivo desde la carpeta local NitroSales IA/
- Los archivos api-metrics-products-route-v3.ts, products-page-v10.tsx, page_v4.tsx, etc. en la carpeta local son BORRADORES VIEJOS
- La producciÃ³n YA tiene todo implementado y funcionando
- **NUNCA** leer estos archivos locales para "deployar" o "pushear" a GitHub
- **NUNCA** crear commits que reemplacen archivos de producciÃ³n con versiones locales

### PROHIBIDO #2: Re-implementar Tendencias de Venta o Stock Inteligente
- Tendencias de Venta: YA ESTÃ EN PRODUCCIÃN dentro de products/page.tsx v10.1
- Stock Inteligente: YA ESTÃ EN PRODUCCIÃN dentro de products/page.tsx v10.1
- Los tabs Overview, Tendencias, Stock Inteligente: YA FUNCIONAN
- **NUNCA** intentar "agregar" estos features â ya existen

### PROHIBIDO #3: Reemplazar archivos enteros en producciÃ³n
- **NUNCA** hacer PUT de un archivo completo a GitHub sin que el usuario lo pida explÃ­citamente
- Solo hacer cambios QUIRÃRGICOS (edits puntuales, no rewrite total)
- Si necesitÃ¡s cambiar algo, primero leer el archivo actual de GitHub, luego hacer el edit mÃ­nimo

### PROHIBIDO #4: Actuar por iniciativa propia sin instrucciÃ³n del usuario
- **NUNCA** empezar a deployar, crear archivos, o pushear cÃ³digo sin que el usuario lo pida
- Si la sesiÃ³n arranca desde un resumen de contexto, PREGUNTAR al usuario quÃ© quiere hacer
- El resumen de contexto puede contener informaciÃ³n desactualizada o mal interpretada

---

## REGLAS CRÃTICAS

1. **NO retroceder versiones** â Cada archivo tiene una versiÃ³n actual que NO debe revertirse.
2. **NO tocar archivos que no estÃ©n explÃ­citamente mencionados** en la tarea actual.
3. **Cambios QUIRÃRGICOS solamente** â No reescribir archivos enteros si solo se necesita un cambio puntual.
4. **LEER este archivo ANTES de cualquier modificaciÃ³n**.
5. **ACTUALIZAR este archivo** despuÃ©s de cada cambio exitoso.
6. **PREGUNTAR al usuario** antes de cualquier deploy o push a producciÃ³n.

---

## ARCHIVOS CRÃTICOS â VERSIONES ACTUALES

### FRONTEND (Visual)

| Archivo | VersiÃ³n | Estado | Notas |
|---------|---------|--------|-------|
| src/app/(app)/products/page.tsx | **v10.1** | â ESTABLE | **NO TOCAR.** KPIs, tabla, grÃ¡ficos, filtros, 3 tabs (Overview + Tendencias + Stock Inteligente), Bolsas de Compra. Encoding fixes aplicados. |
| src/app/(app)/dashboard/page.tsx | â | Sin cambios | No modificado por Claude |
| src/app/(app)/orders/page.tsx | â | Sin cambios | No modificado por Claude |

### BACKEND (APIs)

| Archivo | VersiÃ³n | Estado | Notas |
|---------|---------|--------|-------|
| src/app/api/metrics/products/route.ts | **v1** | â ESTABLE | **NO TOCAR.** Alimenta la pÃ¡gina de productos. |
| src/app/api/fix-brands/route.ts | **v5** | â OPERATIVO | Mejoras incrementales OK. BrandIdâBrandName 2-step, CategoryIdâCategoryName, acciones: stats/test/test-category/fix-vtex/fix-categories/deduplicate/debug. |
| src/app/api/backfill/vtex/route.ts | **v1** | â ESTABLE | **NO TOCAR.** Backfill original con credenciales hardcodeadas. |

### INFRAESTRUCTURA

| Archivo | VersiÃ³n | Estado | Notas |
|---------|---------|--------|-------|
| src/lib/vtex-credentials.ts | **v1** | NEW | Centralized VTEX credential access (DB > env vars) |
| src/lib/crypto.ts | **v1** | NEW | AES-256-GCM credential encryption |
| src/lib/auth-guard.ts | **v1** | NEW | Org resolution from NextAuth session |
| src/lib/db/client.ts | **v1** | â ESTABLE | **NO TOCAR.** Prisma client singleton. Import: @/lib/db/client |
| prisma/schema.prisma | **v1** | â ESTABLE | **NO TOCAR** sin migraciÃ³n. brand y category son String? (no FK). |
| middleware.ts | â | Sin cambios | No modificado por Claude |

---

## FUNCIONALIDADES COMPLETADAS (NO TOCAR, NO RE-IMPLEMENTAR, NO MENCIONAR COMO PENDIENTES)

### â Tendencias de Venta â COMPLETADO Y EN PRODUCCIÃN
- Incluido en products/page.tsx v10.1
- Tab "Tendencias" con AreaCharts de categorÃ­as y marcas
- WoW (week-over-week) comparisons
- **ESTADO: TERMINADO. PROHIBIDO volver a implementar.**

### â Stock Inteligente â COMPLETADO Y EN PRODUCCIÃN
- Incluido en products/page.tsx v10.1
- Tab "Stock Inteligente" con health indicators, ABC classification, dead stock
- **ESTADO: TERMINADO. PROHIBIDO volver a implementar.**

### â Encoding/Mojibake Fixes â COMPLETADO (v10.1)
- 85+ caracteres UTF-8 double-encoded corregidos
- Bolsas de Compra movida dentro de activeTab === "overview"
- 6 caracteres FFFD en secciÃ³n Bolsas corregidos
- Commits: 4bbf299, 877615a, 05eb35e
- **ESTADO: TERMINADO.**

### â PÃ¡gina de Productos â COMPLETADA
- KPIs de revenue, Ã³rdenes, items
- Tabla de productos con filtros
- GrÃ¡ficos de distribuciÃ³n
- Tendencias + Stock Inteligente
- Bug TypeError toLocaleString: RESUELTO
- Bug 86% sin marca: EN PROCESO (batch corriendo)

---

## PROCESOS EN CURSO

### Batch de Marcas + CategorÃ­as (2026-03-16)
- **Endpoint**: fix-brands?action=fix-vtex
- **Progreso**: ~26% completado (~8,100 de 31,214 productos con marca+categorÃ­a)
- **Script**: Corre autÃ³nomamente en el browser via window._fixProgress
- **CategorÃ­as ya resueltas**: nombres legibles (ej: "Pistas", "Inflables y Piletas", "Robots y Transformables")
- **Pendiente post-batch**: Correr fix-categories para los ~1,286 que se procesaron antes del fix de categorÃ­as (tienen marca pero categorÃ­a numÃ©rica)

---

## STACK TÃCNICO

- **Framework**: Next.js 14 App Router
- **ORM**: Prisma (import desde @/lib/db/client)
- **DB**: PostgreSQL en Railway
- **Deploy**: Vercel Pro (60s function timeout, ISR revalidate=300)
- **VTEX Account**: mundojuguete
- **Org ID**: cmmmga1uq0000sb43w0krvvys
- **Credenciales VTEX**: env var DJQFRI + fallback backfill ZMTYUJ

---



---

## FASES DEL PLAN TECNICO

| Fase | Nombre | Estado | Commits |
|------|--------|--------|---------|
| 0 | Instrumentacion y fetch-retry | COMPLETADA | Sesion anterior |
| 1 | Proteccion de datos (sync-lock, f_status) | COMPLETADA | Sesion anterior |
| 2 | Integracion de protecciones en rutas | COMPLETADA | 8256d3f |
| 3 | Tests + integridad de datos + tipado | COMPLETADA | dcdcb22..71ff8b9 |
| 4A | Infra: Prisma Migrate, cred centralization, encryption, auth guard | EN CURSO | pendiente commit |
| 4B | Bot de IA con datos multi-fuente | PENDIENTE (esperar mas data) | - |

### Pendiente: Connection Pooling (Fase 2.5)
- Requiere DATABASE_URL_DIRECT env var en Vercel
- Pospuesto hasta que se configure

## HISTORIAL DE CAMBIOS

### 2026-03-20 (Fase 4A: Infraestructura)
- 4A.1: Script init-prisma-migrate.sh para baseline migration
- 4A.2: Centralized VTEX credentials (vtex-credentials.ts) - eliminated ALL hardcoded tokens
- 4A.3: AES-256-GCM encryption module (crypto.ts) + migration script
- 4A.4: Auth guard module (auth-guard.ts) for org resolution from session
- Refactored 7 routes to use centralized credential access
- Removed hardcoded VTEX tokens from: backfill, webhooks, fix-brands, sync routes

### 2026-03-20 (Fase 3 completa)
- 3.1: Shared vtex-status.ts module + refactor 3 routes (dcdcb22)
- 3.2/3.3: Order validation module + 24 idempotency/anti-ghost tests (f14d4d0)
- 3.4: Float->Decimal(12,2) en 10 campos monetarios + auto-conversion middleware (a67f885)
- 3.5: DateTime->timestamptz en 5 campos de fecha (665fc10)
- 3.6: Tipar conector VTEX: eliminar 8 any types (71ff8b9)
- Fix: webhook routes usan shared Prisma singleton (no mas new PrismaClient())

### 2026-03-19 (Fase 2 completa)
- 2.1: fetchWithRetry integrado en VtexConnector (5 metodos)
- 2.2: Sync lock (mutex DB-based) en sync/route.ts y chain/route.ts
- 2.3: f_status filter en backfill/vtex (ultimo entry point anti-ghost)
- 2.4: Promise.allSettled batching en fetchProducts (grupos de 10)
- Commit: 8256d3f, deploy exitoso en Vercel

### 2026-03-16
- CLAUDE_STATE.md v3: Agregadas secciones PROHIBIDAS explÃ­citas para prevenir regresiones
- v10.1: Fixed 85+ mojibake characters + Bolsas solo en Overview + 6 FFFD fixes
- CLAUDE_STATE.md: Creado sistema de versiones (v1, actualizado a v2 con separaciÃ³n visual/API)
- fix-brands v5: Agregada resoluciÃ³n CategoryId â CategoryName via VTEX Category API
- fix-brands v5: Agregada acciÃ³n fix-categories para productos con categorÃ­a numÃ©rica
- fix-brands v5: Stats ahora incluyen cobertura de categorÃ­as (withCategory/withoutCategory)
- Batch processing de marcas+categorÃ­as iniciado (~23K productos pendientes)

### 2026-03-15
- products/page.tsx v10: Fix TypeError toLocaleString con optional chaining
- products/page.tsx v10: Fix 1L useMemo early return guard
- fix-brands v3: Creado endpoint con lookup VTEX 2-step (BrandIdâBrandName)
- fix-brands v4: Agregadas credenciales VTEX de backfill como fallback
- Env var VTEX_APP_KEY agregada en Vercel


---

## 🚨🚨🚨 REGISTRO DE ERRORES Y LECCIONES — LEER OBLIGATORIAMENTE 🚨🚨🚨

> **Fecha**: 2026-03-16 / 2026-03-17
> **Severidad**: CRITICA — Estos errores costaron horas de debugging y generaron datos incorrectos en produccion.
> **Regla**: Antes de CUALQUIER cambio, verificar que NO se esta por cometer uno de estos errores.

---

### ERROR #1: DATOS INCONSISTENTES ENTRE SECCIONES — Fuentes de verdad diferentes
**Que paso**: La pagina de Productos calculaba KPIs (Facturacion Total, Unidades) sumando `p.revenue` de cada fila de producto (tabla `order_items`), mientras que la pagina de Pedidos usaba `orders.totalValue` (tabla `orders`). Los numeros siempre diferian.
**Causa raiz**: El frontend de Products ignoraba el `summary` de la API y recalculaba totales desde product rows.
**Fix aplicado**: Commit `18d9780` — Products page ahora usa `summary.totalRevenue30d` / `totalItems30d` de la API (misma fuente que Orders).
**REGLA PERMANENTE**: 
- **UNA SOLA fuente de verdad para KPIs globales**: la tabla `orders` via `summary` de la API.
- **NUNCA** calcular totales globales sumando filas de `order_items` en el frontend — siempre usar el `summary` del backend.
- Antes de crear un KPI nuevo, preguntar: "de que tabla viene este dato? Es la misma que usa Orders?"

---

### ERROR #2: TIMEZONE UTC vs UTC-3 — Queries inconsistentes entre APIs
**Que paso**: Products API usaba `T23:59:59.999Z` (UTC) y Orders API usaba `T23:59:59.999-03:00` (Argentina). Esto generaba que las ordenes del borde del dia aparecieran en una seccion pero no en la otra.
**Causa raiz**: Copy-paste desde codigo generico sin adaptar al timezone del negocio.
**Fix aplicado**: Commit `1818df6` — Todas las fechas ahora usan `-03:00`.
**REGLA PERMANENTE**:
- **TODA fecha en queries SQL DEBE usar `-03:00` (America/Argentina/Buenos_Aires)**.
- **NUNCA usar `Z` (UTC)** en parametros de fecha para queries de NitroSales.
- **TODA funcion date_trunc() DEBE incluir `AT TIME ZONE 'America/Argentina/Buenos_Aires'`**.
- CHECKLIST antes de pushear queries con fechas: (1) timezone -03:00? (2) AT TIME ZONE presente? (3) Misma logica que Orders API?

---

### ERROR #3: BACKFILL SIN PAGINACION REAL — Perdia 67% de ordenes
**Que paso**: El backfill iteraba meses (batch=0,1,2...) pero SIEMPRE empezaba de page=1 en cada llamada. Con el timeout de 8s, procesaba ~5 de 15 ordenes por pagina, y luego saltaba al siguiente batch (mes), perdiendo las ordenes restantes de esa pagina y todas las paginas siguientes del mes.
**Causa raiz**: El parametro `page` no se pasaba correctamente entre llamadas. Luego, incluso con `page` arreglado, no habia `startIndex` para retomar DENTRO de una pagina despues de un timeout.
**Fix aplicado**: Commit `8f03833` (startIndex) + commit `88a1aa1` (page parameter).
**REGLA PERMANENTE**:
- **Todo proceso de paginacion DEBE tener**: (1) parametro `page`, (2) parametro `startIndex`, (3) logica de timeout que guarde la posicion exacta.
- **NUNCA** asumir que una pagina se procesa completa en un solo request — Vercel Hobby tiene 10s timeout.
- **SIEMPRE** devolver `nextPage` + `nextIndex` en la respuesta para retomar exactamente donde se corto.
- **VERIFICAR** despues de implementar paginacion: llamar una vez, ver que nextPage/nextIndex NO salten una pagina entera.

---

### ERROR #4: STATUS FILTER INCONSISTENTE — CANCELLED vs CANCELLED+RETURNED
**Que paso**: Products API excluia solo `CANCELLED` pero Orders API excluia `CANCELLED` y `RETURNED`. Las ordenes devueltas se contaban en Products pero no en Orders.
**Fix aplicado**: Commit `1818df6` — Ambas APIs ahora excluyen `('CANCELLED', 'RETURNED')`.
**REGLA PERMANENTE**:
- **El filtro de status DEBE ser identico en TODAS las APIs**: `NOT IN ('CANCELLED', 'RETURNED')`.
- Si se agrega un status nuevo a excluir, DEBE actualizarse en TODAS las APIs simultaneamente.
- CHECKLIST: metrics/orders, metrics/products, y cualquier query futura que filtre por status.

---

### ERROR #5: DEPLOYAR ARCHIVOS LOCALES VIEJOS — Sobreescribir produccion con drafts
**Que paso**: Se pusheo un archivo viejo desde la carpeta NitroSales IA/ que sobreescribio codigo de produccion ya funcionando, causando regresiones.
**REGLA PERMANENTE** (ya existia, se refuerza):
- **ABSOLUTAMENTE PROHIBIDO** pushear archivos desde `/NitroSales IA/`. Son BORRADORES.
- **SIEMPRE** leer el archivo ACTUAL de GitHub antes de modificar (fetch via GitHub API → read → modify → push).
- **NUNCA** hacer full-file rewrite. Solo cambios quirurgicos con string.replace() sobre el codigo actual de GitHub.

---

### ERROR #6: COLUMNA INEXISTENTE EN SQL — updatedAt en ON CONFLICT
**Que paso**: El SQL de backfill referenciaba `"updatedAt" = NOW()` en la clausula ON CONFLICT, pero la tabla `orders` no tiene columna `updatedAt` en el schema de Prisma.
**Fix aplicado**: Commit `a295f71` — Removida la referencia a updatedAt.
**REGLA PERMANENTE**:
- **ANTES de escribir SQL raw**, verificar que TODAS las columnas existen en `prisma/schema.prisma`.
- **NO asumir** que una tabla tiene campos estandar como updatedAt/createdAt — verificar el schema.

---

### ERROR #7: ENCODING MOJIBAKE — Caracteres Unicode rotos
**Que paso**: Caracteres como acentos (a, e, i, o, u), ene, emojis, y el signo menos Unicode se rompian al pasar por btoa/atob, resultando en texto garbled en produccion.
**Fix aplicado**: Multiples commits de correccion de encoding.
**REGLA PERMANENTE**:
- **USAR SOLO ASCII en strings visibles** al usuario: `a` en vez de `a`, `-` (guion ASCII 0x2D) en vez de `−` (minus sign Unicode).
- **Para btoa() con Unicode**: SIEMPRE usar `btoa(unescape(encodeURIComponent(content)))`.
- **EVITAR emojis en codigo fuente** — usar texto plano o entidades HTML.
- **VERIFICAR visualmente** despues de cada deploy que no haya caracteres rotos.

---

### ERROR #8: NO LEER CLAUDE_STATE.md — Repetir errores ya documentados
**Que paso**: En sesiones nuevas, se empezaba a trabajar sin leer este archivo, lo que llevaba a repetir errores ya cometidos y documentados.
**REGLA PERMANENTE**:
- **PRIMERA ACCION de TODA sesion**: leer CLAUDE_STATE.md completo.
- **Si el resumen de contexto dice algo diferente a CLAUDE_STATE.md**, prevalece CLAUDE_STATE.md.
- **NUNCA** confiar en el resumen de sesion anterior como unica fuente — siempre cruzar con este archivo.

---

### ERROR #9: HACER CAMBIOS SIN VERIFICAR CONTRA PRODUCCION
**Que paso**: Se pusheaban cambios y se asumia que funcionaban sin verificar los datos en la pagina real. Esto permitia que errores se acumularan sin deteccion.
**REGLA PERMANENTE**:
- **Despues de CADA push**: esperar deploy, recargar la pagina, y verificar que los numeros cambiaron como se esperaba.
- **Comparar siempre** Products vs Orders despues de cualquier cambio en queries.
- **Si un numero no cambio despues de un fix**, investigar cache ISR (Products API tiene revalidate=300, Orders tiene revalidate=0).

---

### ERROR #10: ASUMIR QUE SECCIONES DIFERENTES USAN LA MISMA LOGICA
**Que paso**: Se asumia que porque las APIs devolvian los mismos numeros, las paginas mostrarian lo mismo. Pero el frontend recalculaba sus propios totales.
**REGLA PERMANENTE**:
- **API alineada NO significa frontend alineado** — siempre verificar COMO el frontend consume los datos.
- **Leer el codigo del frontend** antes de declarar que un fix de API resuelve el problema.
- **Buscar** todos los `.reduce()`, `.map()`, y calculos client-side que puedan re-derivar numeros.

---

### PROTOCOLO PRE-CAMBIO (OBLIGATORIO)

Antes de CUALQUIER modificacion a codigo de NitroSales:

1. ✅ Lei CLAUDE_STATE.md completo?
2. ✅ Hice fetch del archivo ACTUAL de GitHub (no uso version local)?
3. ✅ Mi cambio es quirurgico (string.replace), no full-file rewrite?
4. ✅ Si toca fechas: uso -03:00 y AT TIME ZONE?
5. ✅ Si toca status filter: incluye CANCELLED y RETURNED?
6. ✅ Si toca SQL: todas las columnas existen en schema.prisma?
7. ✅ Si toca KPIs: uso summary de orders table, no calculo desde order_items?
8. ✅ Si toca paginacion: tengo page + startIndex + timeout handling?
9. ✅ Solo uso ASCII (sin acentos, sin emojis, sin Unicode especial)?
10. ✅ Pregunte al usuario antes de deployar?

**Si alguno de estos puntos no se cumple, DETENER y corregir antes de continuar.**

---

## NITROPIXEL — Estado del Pixel de Atribucion

### Ultima actualizacion: 2026-03-24

### Archivos del Pixel

| Archivo | Estado | Notas |
|---------|--------|-------|
| src/lib/pixel/attribution.ts | ACTIVO | Motor de atribucion session-based v2. 4 modelos: LAST_CLICK, FIRST_CLICK, LINEAR, NITRO. |
| src/app/api/pixel/script/route.ts | ACTIVO | Script JS servido a tiendas via GTM. Fresh/stale signal detection. |
| src/app/api/pixel/event/route.ts | ACTIVO | Receptor de eventos. Bot filter, CAPI integration. |
| src/app/api/metrics/pixel/route.ts | ACTIVO | Dashboard API con 18+ queries paralelas. |
| src/app/api/metrics/pixel/discrepancy/route.ts | NUEVO | Revenue discrepancy report (pixel vs plataforma). |
| src/lib/pixel/capi.ts | ACTIVO | Meta Conversions API integration. |
| src/lib/pixel/identity.ts | ACTIVO | Identity resolution, cross-device merge. |

### Commits del Pixel (cronologico)

| Commit | Descripcion |
|--------|-------------|
| 773449c | Phase 1: CAPI, cross-domain cookies, bot filter, PAGE_VIEW dedup, organic detection |
| 7b4e06b | Fix: remove 'whatsapp' from BOT_PATTERNS (bloqueaba WhatsApp in-app browser) |
| cd8a5c7 | Phase 2: attribution window configurable, early identify, discrepancy report, view-through |
| 797abd3 | Session-based touchpoint engine: fresh/stale signals, _isLanding fix, session dedup |
| 3e7871e | Audit fixes: backward compat, unknown sessionId by day, internal referrer protection |

### Funcionalidades Completadas

- Cross-domain cookie persistence (LATAM multi-part TLDs: .com.ar, .com.br, etc.)
- Bot filtering (BOT_PATTERNS regex, UA validation) — CUIDADO: WhatsApp NO es bot
- PAGE_VIEW deduplication (1 per session)
- Organic/social/referral source detection via referrer
- Session-based touchpoint engine (1 touchpoint per session, not per event)
- Fresh vs stale signal detection (_signals_fresh, _is_landing flags)
- Configurable attribution window (7/14/30/60 days via org.settings.attributionWindowDays)
- Early identification (VTEX profile API, login forms, account pages)
- Revenue discrepancy report (pixel vs Meta/Google reported)
- View-through attribution (organic visits + active ad spend)
- Meta CAPI integration (fire-and-forget on PURCHASE)
- XSS protection on orgId parameter
- localStorage null-safety for visitor ID recovery

### PENDIENTES PIXEL

#### PENDIENTE #1: Comparacion NitroPixel vs GA4 (para 2026-03-25)
- **Que**: Sincronizar GA4 y comparar visitantes unicos del 24/03 entre NitroPixel y GA4.
- **Por que**: El pixel empezo a funcionar bien la noche del 23/03. El 24/03 es el primer dia completo.
  GA4 no tenia data sincronizada de ese dia al momento de consultar. Manana deberia estar disponible.
- **Query GA4**: web_metrics_daily.users (totalUsers de GA4 Data API)
- **Query NitroPixel**: COUNT(DISTINCT visitorId) de pixel_events
- **Que esperamos**: NitroPixel reporte entre +10% y +30% mas que GA4 (cookies directas vs modelo
  estadistico de GA4 + consent mode). Si la diferencia es mayor, investigar cookie regeneration.
- **Dato de referencia**: GA4 muestra ~5300 users el 11/03 (dia Hot Sale). NitroPixel mostro 5324
  visitors el 24/03 — orden de magnitud consistente.
- **Accion**: Correr el script de comparacion Python (psycopg2 directo a Railway) con data de ambos
  sistemas para el 24/03 completo. Evaluar si totalPageViews necesita filtro type='PAGE_VIEW'.

#### PENDIENTE #2: totalPageViews cuenta TODOS los eventos, no solo PAGE_VIEW
- **Que**: La query del dashboard usa COUNT(*) como "totalPageViews" pero cuenta IDENTIFY,
  ADD_TO_CART, PURCHASE, etc. Deberia ser COUNT(*) FILTER (WHERE type = 'PAGE_VIEW').
- **Impacto**: Numero inflado en el dashboard. No afecta atribucion ni visitantes unicos.
- **Prioridad**: Baja — corregir cuando se trabaje en el dashboard.

#### PENDIENTE #3: Warnings de la auditoria (no criticos, para futuro)
- View-through detection usa ventana de 24h (podria ser configurable)
- Session timeout no enforzado server-side (sesiones largas sin actividad)
- Script cache 5min puede causar data mixta durante deploys
- Implicit any en sort callback (attribution.ts linea 178)
