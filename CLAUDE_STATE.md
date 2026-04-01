# CLAUDE_STATE.md â Estado del Proyecto NitroSales

> **INSTRUCCIÃN OBLIGATORIA**: Claude DEBE leer este archivo al inicio de CADA sesiÃ³n antes de hacer CUALQUIER cambio.
> Si este archivo no se lee primero, se corre riesgo de perder trabajo ya hecho.

## Ãltima actualizacion: 2026-04-01

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

### MERCADOLIBRE (Seller Integration)

| Archivo | Version | Estado | Notas |
|---------|---------|--------|-------|
| src/lib/connectors/mercadolibre-seller.ts | **v2** | ACTIVO | READ-ONLY connector. Token auto-refresh. Pagination fixes applied. |
| src/lib/connectors/ml-notification-processor.ts | **v1** | ACTIVO | Async webhook processor. 5 topic handlers. |
| src/app/api/webhooks/mercadolibre/route.ts | **v1** | ACTIVO | Webhook endpoint. Responds <500ms. |
| src/app/api/cron/ml-sync/route.ts | **v1** | ACTIVO | Cron backup each 4h. missed_feeds + reputation. maxDuration=800 via vercel.json. |
| src/app/api/sync/mercadolibre/backfill/route.ts | **v1** | ACTIVO | Chunked backfill. Weekly orders. maxDuration=800 via vercel.json. TESTEADO: 123.9s OK. |

### SEO (Google Search Console)

| Archivo | Version | Estado | Notas |
|---------|---------|--------|-------|
| src/lib/connectors/gsc.ts | **v1** | ACTIVO | JWT auth con SA de GA4. Paginacion 25K rows. |
| src/app/api/sync/gsc/route.ts | **v1** | ACTIVO | Cron sync dia-por-dia. maxDuration=800. |
| src/app/api/metrics/seo/route.ts | **v2** | ACTIVO | 14 queries paralelas. Opportunities, movers, cannibalization. |
| src/app/(app)/seo/page.tsx | **v2** | ACTIVO | 5 tabs: Overview, Keywords, Pages, Oportunidades, Movimientos. |

### INFRAESTRUCTURA

| Archivo | VersiÃ³n | Estado | Notas |
|---------|---------|--------|-------|
| src/lib/vtex-credentials.ts | **v1** | NEW | Centralized VTEX credential access (DB > env vars) |
| src/lib/crypto.ts | **v1** | NEW | AES-256-GCM credential encryption |
| src/lib/auth-guard.ts | **v1** | NEW | Org resolution from NextAuth session |
| src/lib/db/client.ts | **v1** | â ESTABLE | **NO TOCAR.** Prisma client singleton. Import: @/lib/db/client |
| prisma/schema.prisma | **v1** | â ESTABLE | **NO TOCAR** sin migraciÃ³n. brand y category son String? (no FK). |
| vercel.json | **v2** | ACTIVO | functions maxDuration=800 para sync/** y cron/**. 9 crons configurados. |
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
- **Deploy**: Vercel Pro (800s function timeout max, ISR revalidate=300). Fluid Compute habilitado. Region: iad1
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
| 4B | Bot de IA con datos multi-fuente | EN DEFINICION — concepto 2 capas, detalles pendientes | - |

### Pendiente: Connection Pooling (Fase 2.5)
- Requiere DATABASE_URL_DIRECT env var en Vercel
- Pospuesto hasta que se configure

## HISTORIAL DE CAMBIOS

### 2026-04-01 (GSC Integration + SEO Intelligence v2)
- GSC conectado: service account con permiso Completo en Search Console
- GSC sync: endpoint dia-por-dia para evitar OOM (14K-33K rows/dia)
- Backfill 90 dias: 1,982,896 query rows + 236,531 page rows via script local
- SEO API v2: 14 queries paralelas (opportunities, movers up/down, new/lost keywords, cannibalization, country)
- SEO Frontend v2: 5 tabs (Overview, Keywords, Pages, Oportunidades, Movimientos)
- Commits: 70262ef (GSC sync fix), 2600e73 (SEO v2 completo)

### 2026-04-01 (Vercel Pro 800s + ML Data Verification)
- Vercel Pro CONFIRMADO visualmente en dashboard (badge Pro, Fluid Compute ON)
- maxDuration 800s configurado en vercel.json functions config (sync/** y cron/**)
- CRITICO: export const maxDuration en route files NO es suficiente — vercel.json functions config es OBLIGATORIO
- Verificacion quirurgica de produccion: reputation 3.1s OK, backfill 123.9s OK, todas las paginas HTTP 200
- ML Dashboard API verificado: 7,495 ordenes, 23M revenue, 32,936 listings, 1,051 preguntas
- Import ML sales: 185,765 ordenes desde 4 XLSX exports (mar 2025 a mar 2026) via import_ml_sales.py
- Backfill listings: 32,936 (6,375 active + 26,180 paused) via backfill_listings.py directo a ML API
- Backfill questions: 1,051 via backfill_questions.py directo a ML API
- Commits: c73edbf, c522591, 28816e5

### 2026-03-31 (MercadoLibre Seller Integration)
- Seccion ML completa: Dashboard, Publicaciones, Reputacion, Preguntas
- Nav submenu agregado a layout.tsx (patron Campanas)
- 4 API routes: /api/mercadolibre/{dashboard,publicaciones,reputacion,preguntas}
- 4 UI pages: /mercadolibre, /publicaciones, /reputacion, /preguntas
- Webhook real-time: /api/webhooks/mercadolibre (ML Notifications API)
- Notification processor: ml-notification-processor.ts (orders, items, questions, payments, shipments)
- Cron backup: /api/cron/ml-sync (cada 4h, missed_feeds + reputation)
- Vercel cron configurado en vercel.json
- mercadolibre-seller.ts v2: paginacion corregida, status filter, scroll_id para >1000 items
- Backfill chunkeado: /api/sync/mercadolibre/backfill (weekly orders, 60s timeout compatible)
- ML Developer Portal configurado: 9 topics + callback URL

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

### Ultima actualizacion: 2026-03-25

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
| 8462cdd | CLAUDE_STATE.md update with NitroPixel section and pending tasks |
| 1333e46 | Complete conversion funnel tracking: VIEW_PRODUCT, ADD_TO_CART, IDENTIFY fix |
| 420db69 | FIX CRITICO: regex escaping bug en template literal + ADD_TO_CART via VTEX orderForm API |
| 8e7cba6 | SPA navigation tracking: pushState/popstate/hashchange hooks para VTEX SPA |

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
- Conversion funnel tracking: VIEW_PRODUCT (dataLayer + URL fallback + SPA), ADD_TO_CART (dataLayer + VTEX orderForm API)
- IDENTIFY events now persist to pixel_events (email stripped for PII)
- SPA navigation tracking: pushState, replaceState, popstate, hashchange hooks
- ADD_TO_CART via VTEX orderForm API interception (fetch + XMLHttpRequest)
- VTEX dataLayer interception: productView, addToCart, view_item, add_to_cart, Enhanced Ecommerce

### PENDIENTES PIXEL

#### PENDIENTE #1: RESUELTO — Comparacion NitroPixel vs GA4
- **Resultado 2026-03-25**: GA4 sync esta ROTO desde 19/03 (muestra 1-12 sesiones/dia vs 300-570 antes).
  La service account o property ID puede haber cambiado. Datos confiables solo hasta 18/03.
- **Baseline GA4 (pre-19/03)**: avg 8,468 users/dia, 10.5 pages/session, 106K PVs/dia.
- **NitroPixel 24/03**: 5,087 visitors, 1.9 pages/session, 10,850 PVs.
- **Diagnostico**: NitroPixel mostraba MENOS que GA4 porque no trackeaba SPA navigation.
  VTEX es SPA, y GA4 cuenta cada navegacion interna. FIX aplicado en commit 8e7cba6.
- **POST-FIX esperado**: Con SPA tracking, NitroPixel deberia subir a ~8-10 pages/session,
  acercandose a GA4. Visitantes unicos deberian ser similares o ligeramente mayores.
- **ACCION PENDIENTE**: Verificar GA4 service account — datos rotos desde 19/03. Revisar
  GA4_SERVICE_ACCOUNT_KEY y GA4_PROPERTY_ID en Vercel env vars.

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

#### PENDIENTE #4: Verificar que VIEW_PRODUCT y ADD_TO_CART fluyen post-deploy
- Los commits 420db69 y 8e7cba6 se deployaron el 25/03 ~01:00 UTC.
- Esperar trafico de producto y verificar que existen events type='VIEW_PRODUCT' y 'ADD_TO_CART'.
- El regex escaping bug impedia TODOS los VIEW_PRODUCT. Ya corregido.
- ADD_TO_CART ahora intercepta VTEX orderForm API (fetch + XHR).
- SPA tracking genera PAGE_VIEW + VIEW_PRODUCT en navegaciones internas.

#### PENDIENTE #5: GA4 sync roto desde 19/03
- Los datos de GA4 en web_metrics_daily muestran 1-12 sesiones/dia desde 19/03 (vs 300-570 antes).
- Causa probable: service account perdio acceso, o GA4 property ID cambio.
- Verificar: GA4_SERVICE_ACCOUNT_KEY y GA4_PROPERTY_ID en Vercel environment variables.
- Verificar en Google Analytics admin que la service account nitrosales-analytics@nitrosales-489804
  tiene acceso de lectura al property.

---

## MERCADOLIBRE SELLER INTEGRATION — Estado al 2026-04-01

### Ultima actualizacion: 2026-04-01

### Cuenta conectada
- **Seller**: ELMUNDODELJUG (KAVOR S.A.)
- **ML User ID**: 137081041
- **ML App ID**: 5750438437863167
- **Plataforma**: MercadoLibre Argentina
- **Conexion**: OAuth2 con refresh_token automatico

### Arquitectura de Sync (3 capas)

**Capa 1: Webhook en tiempo real (PRINCIPAL)**
- Endpoint: `/api/webhooks/mercadolibre` (POST)
- Recibe notificaciones push de ML para: orders_v2, items, questions, payments, shipments, orders_feedback, items_prices, stock_locations, fbm_stock_operations
- Responde 200 en <500ms (requisito ML), procesa async via fire-and-forget
- Procesador: `src/lib/connectors/ml-notification-processor.ts`
- Callback URL configurada en ML Developer Portal: `https://nitrosales.vercel.app/api/webhooks/mercadolibre`

**Capa 2: Cron backup (RED DE SEGURIDAD)**
- Endpoint: `/api/cron/ml-sync` (GET)
- Corre cada 4 horas via Vercel Cron
- Recupera notificaciones perdidas via `/missed_feeds` API
- Sincroniza snapshot de reputacion diario
- Configurado en `vercel.json`

**Capa 3: Sync manual completo**
- Endpoint: `/api/sync/mercadolibre` (GET) — sync de listings + reputacion + ordenes (6 meses) + preguntas
- Endpoint: `/api/sync/mercadolibre/backfill` (GET) — backfill chunkeado por semanas para evitar timeout
  - `?step=orders&week=1` hasta `week=26` (6 meses de historico)
  - `?step=listings` — todas las publicaciones activas+pausadas
  - `?step=questions` — hasta 500 preguntas
  - `?step=reputation` — snapshot de reputacion

### Archivos ML (Seller)

| Archivo | Estado | Notas |
|---------|--------|-------|
| src/lib/connectors/mercadolibre-seller.ts | ACTIVO | Conector READ-ONLY. Token auto-refresh. Funciones: getSellerToken, fetchSellerListings, fetchSellerOrders, fetchSellerReputation, fetchSellerQuestions, fetchShipmentForOrder |
| src/lib/connectors/ml-notification-processor.ts | ACTIVO | Procesador async de notificaciones. Handlers: processOrder, processItem, processQuestion, processPayment, processShipment |
| src/app/api/webhooks/mercadolibre/route.ts | ACTIVO | Webhook endpoint. POST=procesar notificacion, GET=status check |
| src/app/api/cron/ml-sync/route.ts | ACTIVO | Cron backup: missed_feeds + reputation snapshot |
| src/app/api/sync/mercadolibre/route.ts | ACTIVO | Sync manual completo (5min timeout, solo Pro plan) |
| src/app/api/sync/mercadolibre/backfill/route.ts | ACTIVO | Backfill chunkeado (60s timeout compatible con free plan) |
| src/app/api/mercadolibre/dashboard/route.ts | ACTIVO | Dashboard API: KPIs, ventas diarias, status breakdown, payment methods |
| src/app/api/mercadolibre/publicaciones/route.ts | ACTIVO | Listings API: paginada, filtrable por status y busqueda |
| src/app/api/mercadolibre/reputacion/route.ts | ACTIVO | Reputacion API: snapshot actual + historico |
| src/app/api/mercadolibre/preguntas/route.ts | ACTIVO | Preguntas API: paginada, filtrable, top items |
| src/app/(app)/mercadolibre/page.tsx | ACTIVO | Dashboard ML: KPIs, ventas diarias chart, status breakdown, pagos |
| src/app/(app)/mercadolibre/publicaciones/page.tsx | ACTIVO | Tabla publicaciones: thumbnail, precio, stock, tipo, envio |
| src/app/(app)/mercadolibre/reputacion/page.tsx | ACTIVO | Reputacion: nivel, ratings, metricas performance, historial |
| src/app/(app)/mercadolibre/preguntas/page.tsx | ACTIVO | Preguntas: cola, top items, KPIs respuesta |

### Tablas DB usadas por ML Seller

- `orders` (source="MELI") — ordenes de ML mapeadas al modelo unificado
- `ml_listings` — publicaciones activas/pausadas con detalles
- `ml_seller_metrics_daily` — snapshots diarios de reputacion y metricas
- `ml_questions` — preguntas de compradores con respuestas
- `connections` (platform="MERCADOLIBRE") — credenciales OAuth, tokens, estado sync

### Datos actuales en DB (2026-04-01) — BACKFILL COMPLETADO

| Tabla | Registros | Estado |
|-------|-----------|--------|
| orders (MELI) | 185,765 | COMPLETO — importado desde export XLSX (mar 2025 a mar 2026) |
| ml_listings | 32,936 | COMPLETO — 6,375 activas + 26,180 pausadas via ML API directa |
| ml_questions | 1,051 | COMPLETO — via ML API directa (2 sin responder) |
| ml_seller_metrics_daily | 1 | OK — se llena diariamente via cron |

### PENDIENTES ML

#### PENDIENTE ML #1: RESUELTO — Backfill historico completado (2026-04-01)
- Ordenes: 185,765 importadas desde export XLSX (4 archivos, mar 2025 a mar 2026)
- Listings: 32,936 importadas via script local contra ML API (scroll_id para >1000)
- Preguntas: 1,051 importadas via script local contra ML API
- Script de importacion: import_ml_sales.py (ordenes), backfill_listings.py, backfill_questions.py

#### PENDIENTE ML #2: Verificar webhook recibe notificaciones reales
- Webhook responde 200 a POST de prueba (verificado 2026-04-01)
- Falta verificar con eventos reales de ML (ordenes/preguntas nuevas)
- Verificar en Vercel logs que processMLNotification se ejecuta correctamente

#### PENDIENTE ML #3: RESUELTO — Vercel Pro 800s confirmado y verificado
- Vercel Pro CONFIRMADO visualmente en dashboard (badge Pro visible)
- Fluid Compute habilitado en Settings > Functions
- maxDuration=800 configurado en vercel.json (functions config, NO solo export const)
- VERIFICADO: questions backfill corrio 123.9s sin corte (antes cortaba a 60s)
- VERIFICADO: todas las paginas de produccion siguen respondiendo HTTP 200 en <1s
- vercel.json functions config es OBLIGATORIO — export const maxDuration solo NO alcanza
- Commits: c73edbf (300s), c522591 (vercel.json config), 28816e5 (bump a 800s)

---


## PENDIENTE: BOT DE IA (Fase 4B)

### Estado: EN DEFINICION — no implementar sin aprobacion

### Concepto general
Bot de IA en 2 capas:
- **Capa 1**: Mini-bots contextuales por KPI/seccion (analiza el dato puntual que esta mirando el usuario)
- **Capa 2**: Bot general estrategico que cruza datos de todas las fuentes (MELI + SEO + VTEX + Stock)

### Notas
- Los detalles de arquitectura e implementacion NO estan definidos todavia
- Requiere ANTHROPIC_API_KEY en Vercel
- Todas las APIs de datos necesarias ya existen y funcionan
- NO avanzar con implementacion hasta que el usuario defina el alcance exacto


## GOOGLE SEARCH CONSOLE (SEO Intelligence) — Estado al 2026-04-01

### Ultima actualizacion: 2026-04-01

### Conexion
- **Propiedad**: https://www.elmundodeljuguete.com.ar/
- **Service Account**: nitrosales-analytics@nitrosales-489804.iam.gserviceaccount.com (misma que GA4)
- **Verificacion DNS**: TXT record ya configurado por el usuario
- **Permiso**: Completo (agregado manualmente en GSC > Configuracion > Usuarios)

### Arquitectura de Sync
- **Cron diario**: /api/sync/gsc (9am, ultimos 7 dias incremental)
- **Backfill manual**: /api/sync/gsc?days=90 (dia por dia para evitar OOM)
- **Estrategia**: Fetch dia-por-dia porque elmundodeljuguete genera ~14K-33K rows/dia en GSC
- **Safety cutoff**: 700s para no exceder maxDuration 800s

### Archivos GSC

| Archivo | Estado | Notas |
|---------|--------|-------|
| src/lib/connectors/gsc.ts | ACTIVO | JWT auth, fetchSearchAnalytics con paginacion 25K rows |
| src/app/api/sync/gsc/route.ts | ACTIVO | Cron sync dia-por-dia. maxDuration=800. ?days=7 default, ?days=90 backfill |
| src/app/api/metrics/seo/route.ts | **v2** ACTIVO | 14 queries paralelas: KPIs, trend, keywords, pages, opportunities, movers, cannibalization, country |
| src/app/(app)/seo/page.tsx | **v2** ACTIVO | 5 tabs: Overview, Keywords, Pages, Oportunidades, Movimientos |

### Tablas DB

| Tabla | Registros | Notas |
|-------|-----------|-------|
| seo_query_daily | 1,982,896 | 90 dias (29/12/2025 a 29/03/2026). ~22K rows/dia promedio |
| seo_page_daily | 236,531 | Agregado por landing page. ~2,600/dia promedio |

### Datos del dashboard SEO (marzo 2026)
- 15,991 clics organicos / 1.41M impresiones
- CTR promedio: 1.13% / Posicion promedio: 7.6
- 87,356 keywords totales / 6,531 en Top 3 / 59,849 en Top 10
- 30 oportunidades de CTR detectadas
- 20 keywords subiendo / 20 bajando
- 20 keywords con canibalizacion (3+ URLs)
- Top keyword: "el mundo del juguete" (26,789 clics)

### Commits GSC
- 70262ef: fix GSC sync day-by-day (OOM fix)
- 2600e73: feat SEO Intelligence v2 (tabs, opportunities, movers, cannibalization)

---

## ERRORES Y LECCIONES ML — 2026-03-31

### ERROR ML #1: fetchSellerOrders capped at 200 — perdia 90%+ de ordenes
**Que paso**: El sync de ordenes traia max 200 ordenes porque el parametro `limit` se usaba como tope Y como batch size. EMDJ tiene miles de ordenes por mes.
**Causa raiz**: Parametro `limit: 200` se pasaba a la funcion, que lo usaba como `maxOrders`.
**Fix aplicado**: Renombrado a `maxOrders` con default 50000. Paginacion correcta con offset + total check. ML hard limit: offset+limit <= 10000.
**REGLA PERMANENTE**:
- **NUNCA** usar el mismo parametro para batch size Y para total cap.
- **SIEMPRE** paginar hasta total (o hard limit de la API), no hasta un limite arbitrario bajo.
- Para EMDJ, esperar miles de ordenes por mes. Un limit de 200 es absurdo.

### ERROR ML #2: Fetching closed listings causaba timeout — 33K+ items
**Que paso**: fetchSellerListings traia TODAS las publicaciones incluyendo cerradas (33K+). Esto excedia el timeout de 60s.
**Causa raiz**: No se filtraba por status. ML devuelve todos los items del seller incluyendo historicos cerrados.
**Fix aplicado**: Filtro por status (active+paused solamente). Funcion `fetchItemIdsByStatus` con scroll_id para sets >1000.
**REGLA PERMANENTE**:
- **SIEMPRE** filtrar listings por status. NUNCA traer closed/inactive por defecto.
- Para listados >1000 items, usar `search_type=scan` con `scroll_id` (offset-based llega hasta 1000 max).
- EMDJ tiene 33K+ listings cerrados. Las activas+pausadas son bastante mas de 1000 (requiere scroll_id, no offset-based).

### ERROR ML #3: Sync completo excede timeout de Vercel free plan
**Que paso**: `/api/sync/mercadolibre` con maxDuration=300 seguia timeouting porque Vercel free plan solo da 60s.
**Causa raiz**: maxDuration=300 solo funciona en Vercel Pro. Free plan siempre corta a 60s.
**Fix aplicado**: Creado endpoint de backfill chunkeado con maxDuration=60. Chunks semanales para ordenes.
**REGLA PERMANENTE**:
- **CONFIRMADO Vercel Pro** — timeout real es hasta 800s (13 min). Configurado en vercel.json functions config.
- Disenar sync para chunks que quepan en 800s.
- Para EMDJ, el sync completo puede correr en la plataforma directamente.

### ERROR ML #4: Backfill mensual tambien excedia timeout
**Que paso**: Incluso un mes de ordenes de EMDJ excedia 60s de procesamiento.
**Causa raiz**: EMDJ procesa cientos/miles de ordenes por mes. Fetch + upsert individual toma ~50ms/orden.
**Fix aplicado**: Cambio de chunks mensuales a chunks semanales (week=1..26 para 6 meses).
**REGLA PERMANENTE**:
- Para sellers grandes como EMDJ, **usar chunks semanales, no mensuales**.
- Calcular: si un seller tiene 1000 ordenes/mes, y cada upsert toma 50ms, un mes = 50 segundos. Muy justo para 60s timeout.
- Una semana = ~250 ordenes = ~12.5 segundos. Margen amplio.

### PROTOCOLO PRE-CAMBIO ML (ADICIONAL AL GENERAL)

Antes de modificar cualquier endpoint de sync ML:
1. Es READ-ONLY desde ML API? (NUNCA escribir en la cuenta de EMDJ)
2. Cabe en 800s de timeout? (Vercel Pro max, configurado en vercel.json)
3. Tiene paginacion correcta? (offset + total check + hard limit de ML)
4. Filtra por status cuando corresponde? (no traer closed listings)
5. El token se auto-refresca? (getSellerToken maneja refresh automatico)
