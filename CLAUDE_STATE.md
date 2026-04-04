# CLAUDE_STATE.md â Estado del Proyecto NitroSales

> **INSTRUCCIÃN OBLIGATORIA**: Claude DEBE leer este archivo al inicio de CADA sesiÃ³n antes de hacer CUALQUIER cambio.
> Si este archivo no se lee primero, se corre riesgo de perder trabajo ya hecho.

## Ultima actualizacion: 2026-04-04 (Sesion 8 — Audience Sync + Meta Custom Audiences + Google Customer Match)

---

## ð¨ð¨ð¨ ACCIONES PROHIBIDAS â LEER ANTES QUE NADA ð¨ð¨ð¨

**ESTAS ACCIONES ESTÃN TERMINANTEMENTE PROHIBIDAS. Si el resumen de contexto, un plan anterior, o cualquier otra fuente sugiere hacerlas, IGNORAR COMPLETAMENTE.**

### PROHIBIDO #1: Deployar "API v3" o "page v4" o cualquier archivo desde la carpeta local NitroSales IA/
- Los archivos api-metrics-products-route-v3.ts, products-page-v10.tsx, page_v4.tsx, etc. en la carpeta local son BORRADORES VIEJOS
- La producciÃ³n YA tiene todo implementado y funcionando
- **NUNCA** leer estos archivos locales para "deployar" o "pushear" a GitHub
- **NUNCA** crear commits que reemplacen archivos de producciÃ³n con versiones locales

### PROHIBIDO #2: Re-implementar Tendencias de Venta, Stock Inteligente o Margenes
- Tendencias de Venta: YA ESTÃ EN PRODUCCIÃN dentro de products/page.tsx v10.1
- Stock Inteligente: YA ESTÃ EN PRODUCCIÃN dentro de products/page.tsx v10.1
- Margenes (IVA fix, cross-filtering, markup, column selector, catalogo): YA ESTA EN PRODUCCION dentro de products/page.tsx v11
- Los tabs Overview, Tendencias, Stock Inteligente, Margenes: YA FUNCIONAN
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
| src/app/(app)/products/page.tsx | **v11** | ACTIVO | 4 tabs (Overview + Tendencias + Stock Inteligente + Margenes). Tab Margenes: KPIs, distribucion, brand/category tables con cross-filtering, markup %, catalog completo con column selector, inline filters, CSV export. IVA fix aplicado. 1865 lineas. |
| src/app/(app)/dashboard/page.tsx | **v2** | ACTIVO | PeriodSelector integrado (2026-04-01). Quick ranges + custom date. |
| src/app/(app)/orders/page.tsx | - | Sin cambios | No modificado por Claude |
| src/app/(app)/finanzas/page.tsx | **v3** | ACTIVO | P&L dual view (Ejecutivo/Detallado). InfoTips explicativos. Health semaphore. Payment fees, IVA, discounts. |
| src/app/(app)/finanzas/costos/page.tsx | **v1** | ACTIVO | 1532 lineas. 8 categorias costos, perfil fiscal, tarifas envio, constancia AFIP import. |
| src/app/(app)/analytics/page.tsx | **v2** | ACTIVO | PeriodSelector integrado (2026-04-01). |
| src/app/(app)/pixel/page.tsx | **v2** | ACTIVO | PeriodSelector integrado (2026-04-01). |
| src/app/(app)/mercadolibre/page.tsx | **v2** | ACTIVO | PeriodSelector integrado (2026-04-01). |
| src/app/(app)/seo/page.tsx | **v3** | ACTIVO | PeriodSelector + audit fixes (country translations). |
| src/components/PeriodSelector.tsx | **v1** | ACTIVO | Componente reutilizable. Quick ranges + Hoy/Ayer + custom date. |
| src/components/dashboard/DateRangeFilter.tsx | **v2** | ACTIVO | Usado en finanzas. Quick ranges + date inputs. |

### BACKEND (APIs)

| Archivo | VersiÃ³n | Estado | Notas |
|---------|---------|--------|-------|
| src/app/api/metrics/products/route.ts | **v2** | ACTIVO | IVA fix: revenueNeto = revenue / 1.21, avgPriceNeto. Margen y markup calculados sin IVA. marginAnalysis con byBrand, byCategory, distribution, top/bottom. |
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
| src/app/(app)/seo/page.tsx | **v3** | ACTIVO | 5 tabs + PeriodSelector + country translations. Commits 2600e73, b42e533. |

### FINANZAS (P&L + Costos Operativos) — NUEVO 2026-04-02

| Archivo | Version | Estado | Notas |
|---------|---------|--------|-------|
| src/app/(app)/finanzas/page.tsx | **v3** | ACTIVO | P&L dual view (Ejecutivo/Detallado). InfoTip tooltips. Health semaphore. Payment fees, IVA RI, discounts, channel breakdown. |
| src/app/(app)/finanzas/costos/page.tsx | **v1** | ACTIVO | 1532 lineas. 8 categorias: LOGISTICA, EQUIPO, PLATAFORMAS, FISCAL, INFRAESTRUCTURA, MARKETING, MERMA, OTROS. Tarifas envio. Perfil fiscal. Constancia AFIP PDF. |
| src/app/api/metrics/pnl/route.ts | **v3** | ACTIVO | P&L completo con: source breakdown (MELI/VTEX), payment fees por metodo, IVA debito fiscal para RI, descuentos, manual costs por categoria, platform config. 284+ lineas nuevas. |
| src/app/api/finance/manual-costs/route.ts | **v1** | ACTIVO | CRUD costos manuales. GET (by month+category), POST (create), PUT (update), DELETE. |
| src/app/api/finance/fiscal-profile/route.ts | **v1** | ACTIVO | GET/POST perfil fiscal (condicion IVA, IIBB, jurisdiccion, CUIT). Auto-genera impuestos argentinos. |
| src/app/api/finance/fiscal-profile/parse-constancia/route.ts | **v1** | ACTIVO | Parsea PDF de constancia AFIP para auto-fill fiscal profile. Usa pdf-parse. |
| src/app/api/finance/auto-costs/route.ts | **v1** | ACTIVO | Calcula costos automaticos: comisiones ML (del revenue MELI real) y merma (del revenue total). |
| src/app/api/finance/platform-config/route.ts | **v1** | ACTIVO | GET/POST config de plataformas: comision VTEX %, fees medios de pago (tarjeta, debito, MP, transferencia). |
| src/app/api/finance/shipping-rates/route.ts | **v1** | ACTIVO | CRUD tarifas de envio por carrier+servicio+CP. |
| src/app/api/finance/shipping-rates/import/route.ts | **v1** | ACTIVO | Import masivo de tarifas desde Excel (.xlsx). Usa exceljs. |
| src/app/api/finance/shipping-rates/template/route.ts | **v1** | ACTIVO | Genera template Excel para importar tarifas. |
| src/app/api/finance/shipping-rates/calculate/route.ts | **v1** | ACTIVO | Calcula costo de envio dado carrier+service+CP. |
| src/app/api/finance/shipping-rates/carriers/route.ts | **v1** | ACTIVO | Lista carriers y servicios disponibles. |
| src/app/api/sync/cost-prices/route.ts | **v2** | ACTIVO | Sync precios de costo desde VTEX. Usa Pricing API (primary) + Catalog API (fallback). Fix critico: Pricing API tiene el costPrice, Catalog NO. |

### LTV & PREDICCION (Lifetime Value) — ACTUALIZADO 2026-04-03

| Archivo | Version | Estado | Notas |
|---------|---------|--------|-------|
| src/app/(app)/customers/ltv/page.tsx | **v3** | ACTIVO | Dashboard LTV + seccion pLTV con hero credibilidad (BG/NBD, Meta/Google badges, pipeline NitroPixel). Umbrales configurables con auto-sugerencia por percentiles. Top 20 con customer detail expandible. Nota "Sin datos" para clientes pre-NitroPixel. |
| src/app/api/metrics/ltv/route.ts | **v2** | ACTIVO | 7 queries paralelas: summary, prev period, by channel, cohort retention, repurchase, ad spend, top customers. MELI_EXCLUDE en todas las queries. |
| src/app/api/ltv/predict/route.ts | **v2** | ACTIVO | GET: predicciones + resumen + customer details en top 20. POST: batch prediction con umbrales de org settings. maxDuration=60. |
| src/app/api/ltv/customer-detail/route.ts | **v1** | ACTIVO | GET: historial de ordenes de un cliente + detalles de prediccion. Product names via JOIN a products table. |
| src/app/api/settings/ltv/route.ts | **v1** | ACTIVO | GET: umbrales actuales + auto-sugeridos (p50/p90 redondeados a 5K). PUT: valida y guarda umbrales. Min 100 clientes para sugerencias. |
| src/lib/ltv/prediction-engine.ts | **v3** | ACTIVO | Motor con 3 guardrails: (1) min 30 dias para personal_history, (2) freq cap 1/7 dia, (3) prediction cap 3x gasto real. Metodo cohort_boosted para 2+ ordenes con <30 dias. |
| src/lib/ltv/send-meta.ts | **v1** | DESACTIVADO | Envia predicted_ltv a Meta CAPI. Triple candado: LTV_SEND_ENABLED env var + confidence >= 0.5 + flag sentToMeta por cliente. NO ACTIVAR sin aprobacion de Tomy. |
| src/lib/ltv/send-google.ts | **v1** | DESACTIVADO | Envia RESTATEMENT a Google Ads ConversionAdjustmentUploadService. Triple candado identico al de Meta. Ventana de ajuste: 55 dias. NO ACTIVAR sin aprobacion de Tomy. |

### INFRAESTRUCTURA

| Archivo | VersiÃ³n | Estado | Notas |
|---------|---------|--------|-------|
| package.json | **v2** | ACTIVO | Build: `prisma generate && next build`. REMOVIDO `prisma db push` del build (causaba hang de 8+ min). |
| src/lib/vtex-credentials.ts | **v1** | NEW | Centralized VTEX credential access (DB > env vars) |
| src/lib/crypto.ts | **v1** | NEW | AES-256-GCM credential encryption |
| src/lib/auth-guard.ts | **v1** | NEW | Org resolution from NextAuth session |
| src/lib/db/client.ts | **v1** | â ESTABLE | **NO TOCAR.** Prisma client singleton. Import: @/lib/db/client |
| prisma/schema.prisma | **v4** | ACTIVO | +Influencer, InfluencerCampaign, InfluencerAttribution, InfluencerApplication, InfluencerBriefing, ContentSubmission, ProductSeeding (7 modelos nuevos). +isProductBreakdownEnabled en Influencer. +CustomerLtvPrediction. +ManualCost, ShippingRate. Order: +postalCode, shippingCarrier, shippingService, realShippingCost. |
| vercel.json | **v2** | ACTIVO | functions maxDuration=800 para sync/** y cron/**. 9 crons configurados. |
| src/app/(app)/layout.tsx | **v5** | ACTIVO | Sidebar con 9 grupos: OPERACIONES, CATALOGO, MARKETING Y ADQUISICION, NITRO CREATORS (gradient label, Influencers + Contenido expandibles), CLIENTES, CANALES, HERRAMIENTAS (NitroPixel + LTV + Audience Sync con premium cards), FINANZAS, sin-grupo. Premium cards con glow, badges LIVE/AI/SYNC, description text. Smart isActive logic para Influencers vs Contenido routes. |
| middleware.ts | â | Sin cambios | No modificado por Claude |

---

## FUNCIONALIDADES COMPLETADAS (NO TOCAR, NO RE-IMPLEMENTAR, NO MENCIONAR COMO PENDIENTES)

### Modulo Influencer Marketing (Nitro Creators) -- COMPLETADO Y EN PRODUCCION (2026-04-04)

**5 fases implementadas en sesiones 6-7. 18 commits. Modulo completo de influencer marketing.**

#### Fase 1: Base del modulo (commits 8735ddd, 1b427d5, b7cb5d9)
- Modelos Prisma: Influencer, InfluencerCampaign, InfluencerAttribution
- CRUD influencers con slug/code unicos
- Dashboard publico en /i/[slug]/[code] con password SHA-256
- Tracking link con UTM: ?utm_source=influencer&utm_medium=referral&utm_campaign=[slug]
- Atribucion via ordenes con UTM matching
- Comisiones por tier (porcentaje del revenue)
- Campanas con bonus % y fechas

#### Fase 2: Dashboard publico world-class (commit cdf0ea7)
- KPIs: revenue generado, comisiones, ordenes, tasa conversion
- Chart de ventas temporal
- Tabla de campanas activas con bonus
- Cupones asociados
- Estadisticas detalladas (ticket promedio, mejores dias, ventas recientes)

#### Fase 3: Self-service applications + emails (commits 0c07fc9, 1e4abc6, e740770, 7c81b4b, 599c593)
- Formulario publico de aplicacion en /i/[slug]/apply
- Admin: lista de aplicaciones con aprobar/rechazar
- Al aprobar: auto-crea Influencer + envia email via Resend con credenciales
- Tracking link visible en dashboard publico
- Fixes: input visibility (CSS specificity), Internal Error on approve, post-password loading

#### Fase 4: Analytics avanzados + Leaderboard + CSV (commits fa94143, 6216b80)
- Leaderboard: ranking de influencers por revenue/ordenes/comisiones
- Analytics: graficos temporales, top campaigns, channel breakdown
- CSV export de datos de influencers
- Empty states para paginas sin datos

#### Fase 5: Content management (commit 1abc297)
- Modelos: InfluencerBriefing, ContentSubmission, ProductSeeding
- Admin Briefings: CRUD, tipos (GENERAL/REEL/STORY/POST/UNBOXING/REVIEW), status management
- Admin Aprobaciones: grid de submissions, review workflow (approve/reject/revision), feedback
- Admin UGC Library: galeria de contenido aprobado como UGC, filtro por plataforma
- Admin Product Seeding: envio de productos, tracking PENDING->SHIPPED->DELIVERED->CONTENT_RECEIVED
- Public content API: influencers ven briefings y envian contenido desde su dashboard

#### Post-Fase 5: UX improvements (commits 75b7b0d, 15cce14, e3890cd, 4849eee, ba52674)
- Product breakdown: toggle isProductBreakdownEnabled para controlar visibilidad de productos vendidos en dashboard del influencer
- Tab unification: dashboard publico unificado en 1 URL con 2 tabs ("Mis Ganancias" / "Mi Contenido")
- Content data lazy-loaded solo al activar tab Contenido
- Nitro Creators: seccion propia en nav admin con gradient premium
- Premium cards: NitroPixel y LTV con cards especiales (glow, badges LIVE/AI, descripcion)

#### Patrones tecnicos criticos del modulo Influencer:
- **CSS Specificity**: globals.css tiene `body { color: var(--nitro-text) }` donde `--nitro-text: #FFFFFF`. MUST usar `style={{ color: "#111827", backgroundColor: "#ffffff" }}` en inputs de paginas admin
- **Store URL**: Organization NO tiene campo `website`. Usar `process.env.STORE_URL || "https://elmundodeljuguete.com.ar"`
- **Data isolation**: queries SIEMPRE filtran por `influencerId` AND `organizationId`, con defense-in-depth en JOINs a products
- **Password**: SHA-256 hash, verificado via /api/public/influencers/[slug]/[code]/verify
- **UGC es interno**: el influencer solo envia contenido, la empresa decide que es UGC (toggle en admin)
- **Email**: Resend REST API (no SDK) para emails de onboarding

- **ESTADO: MODULO COMPLETO EN PRODUCCION. 5 FASES IMPLEMENTADAS.**
- **PROHIBIDO: NO re-implementar ninguna fase. NO separar el portal en 2 URLs (ya unificado en tabs).**

### Modulo Margenes Completo -- COMPLETADO Y EN PRODUCCION (2026-04-03)
- Tab "Margenes" en products/page.tsx v11
- IVA fix: todos los margenes calculados con precioNeto (precio / 1.21) porque precios incluyen 21% IVA y costos no
- KPIs: Margen Bruto Prom (ponderado), Revenue Neto (sin IVA), Ganancia Bruta, Productos Sin Costo
- Distribucion por rango de margen (5 rangos con chips de filtro y conteo)
- Margen por Marca: chart horizontal top 10, respeta filtro de categoria activo
- Margen por Categoria: tabla con Revenue, COGS, Margen %, Markup %, Ganancia, Productos. Respeta filtro de marca activo
- Cross-filtering: seleccionar marca -> tabla categorias se filtra. Seleccionar categoria -> chart marcas se filtra
- Dropdowns de marca/categoria en header de tabla categorias
- Catalogo completo de margenes: tabla con 10 columnas (Producto, Precio, Costo, Margen %, Markup %, Margen $/ud, Unidades, Facturacion, Ganancia, Stock, ABC)
- Column Selector: dropdown con checkboxes para elegir columnas visibles (en tabla Overview y tabla Margenes)
- Filtros inline: busqueda por nombre/SKU, dropdown marca, dropdown categoria
- Paginacion 50 items/pagina, sort por cualquier columna
- CSV export con todos los campos incluyendo markup
- Top 10 mas rentables + Top 10 menos rentables
- computedByCategory y computedByBrand calculados client-side desde `filtered` para soportar cross-filtering
- Commits: ebc168a, d63fd48, 2da1b43, efbeacb, 9173a9d
- **ESTADO: TERMINADO. PROHIBIDO volver a implementar.**
- **PROHIBIDO: NO comparar precio con IVA contra costo sin IVA para calcular margenes.**

### LTV Dashboard + Prediccion de LTV -- COMPLETADO Y EN PRODUCCION
- Dashboard: src/app/(app)/customers/ltv/page.tsx v3 -- 5 secciones analiticas + seccion predicciones con hero de credibilidad
- Motor de prediccion: src/lib/ltv/prediction-engine.ts v3 -- Cohort-based pLTV con 3 guardrails de produccion
- API predict: src/app/api/ltv/predict/route.ts v2 -- GET/POST, batch con umbrales configurables
- API settings: src/app/api/settings/ltv/route.ts -- GET/PUT umbrales + auto-sugerencia percentiles
- API customer detail: src/app/api/ltv/customer-detail/route.ts -- Historial de ordenes expandible
- Envio Meta CAPI: src/lib/ltv/send-meta.ts -- Campo predicted_ltv en custom_data -- **DESACTIVADO**
- Envio Google Ads: src/lib/ltv/send-google.ts -- RESTATEMENT ConversionAdjustmentUploadService -- **DESACTIVADO**
- Nav: Clientes > Segmentacion | Lifetime Value (children en layout.tsx)
- MELI excluido de TODOS los queries (no tiene datos de clientes)
- Triple candado de seguridad: env var LTV_SEND_ENABLED + confidence threshold 0.5 + flag por cliente
- Modelo v3 con 3 guardrails:
  - Fix 1: Clientes con <30 dias de historia usan cohort_boosted (no extrapolan frecuencia personal)
  - Fix 2: Frecuencia personal capeada a max 1 compra cada 7 dias
  - Fix 3: Prediccion capeada a 3x gasto real como red de seguridad
- Metodos: cohort_lookup (1 compra), cohort_boosted (2+ compras, <30 dias), personal_history (2+ compras, 30+ dias)
- Umbrales: configurables por usuario + auto-sugeridos (low=p50, medium=p90, redondeados a 5K). Default: low=$25K, medium=$100K
- Commits: d950cef, b058253, d4eb371, 0aafb0d, 1b60f12, 4409537, 9eec0de, 6ff64d1, 0ca3726, 90df13e, 6da6c9d
- Prisma model: CustomerLtvPrediction con campos predictedLtv90d, predictedLtv365d, confidence, acquisitionChannel, segmentBucket, sentToMeta, sentToGoogle
- **ESTADO: ANALYTICS TERMINADO. GUARDRAILS IMPLEMENTADOS. ENVIO A PLATAFORMAS PENDIENTE APROBACION DE TOMY.**
- **PROHIBIDO: NO activar LTV_SEND_ENABLED ni enviar datos a Meta/Google sin aprobacion explicita del usuario.**
- **PENDIENTE: Recalcular predicciones desde la UI para que los guardrails se apliquen a la data existente.**

### Decisiones del usuario sobre LTV (para contexto de proximas sesiones)
- Tomy quiere validar las predicciones en el dashboard antes de activar envio a plataformas
- Preocupacion principal: que predicciones malas sean arma de doble filo
- No quiere que solo se envien los de alto valor -- entiende que Meta/Google necesitan el rango completo para optimizar
- Pregunto sobre estacionalidad (Dia del Nino en agosto para jugueteria) -- modelo actual no la considera explicitamente pero captura patrones via datos historicos. Se podria agregar indice estacional como mejora futura.
- Para clientes nuevos de NitroSales: el modelo empieza a dar valor con 50-100 clientes recurrentes. Primeros meses = solo dashboard, envio a plataformas cuando confianza promedio > 60-70%.
- Tomy quiere que umbrales sean configurables por el usuario pero con sugerencia automatica del sistema
- Tomy pidio customer detail expandible para verificar manualmente por que cada cliente fue clasificado como fue

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

### 2026-04-04 — Sesiones 6-7 (Influencer Module Completo Fases 1-5 + Nitro Creators + Premium Nav)

**Commits**: 8735ddd, 1b427d5, b7cb5d9, d7b29fd, cdf0ea7, 0c07fc9, 1e4abc6, e740770, 7c81b4b, 599c593, fa94143, 6216b80, 75b7b0d, 15cce14, 1abc297, e3890cd, 4849eee, ba52674 (18 commits)
**Deploy**: Vercel auto-deploy OK para cada commit (ba52674 ultimo -> main)

#### Errores encontrados y corregidos:

1. **Inputs invisibles en admin pages — texto blanco sobre fondo blanco** (ERROR UX)
   - SINTOMA: Al crear influencer, los inputs del formulario no mostraban texto. Parecia un form roto.
   - CAUSA RAIZ: `globals.css` tiene `body { color: var(--nitro-text) }` donde `--nitro-text: #FFFFFF`. Los inputs heredaban color blanco sobre fondo blanco.
   - FIX: Inline styles `style={{ color: "#111827", backgroundColor: "#ffffff" }}` en TODOS los inputs de paginas admin.
   - APRENDIZAJE: **En TODAS las paginas admin de NitroSales, los inputs DEBEN tener inline style con color="#111827" y backgroundColor="#ffffff". Tailwind classes como `text-gray-900` NO funcionan porque globals.css tiene mayor especificidad.**
   - Commit: 7c81b4b

2. **Internal Error al aprobar aplicacion — campo website en Organization** (ERROR DB)
   - SINTOMA: Al hacer click en "Aprobar" una aplicacion de influencer, error 500 Internal Server Error.
   - CAUSA RAIZ: El endpoint de aprobacion usaba `org.website` para construir el email de bienvenida, pero Organization NO tiene campo `website`. Ese campo esta en CompetitorStore.
   - FIX: Reemplazado `org.website` por `process.env.STORE_URL || "https://elmundodeljuguete.com.ar"`
   - APRENDIZAJE: **El modelo Organization NO tiene campo `website`. La URL de la tienda se obtiene de `process.env.STORE_URL` o se hardcodea. NUNCA asumir que Organization tiene campos que no estan en schema.prisma.**
   - Commit: 7c81b4b

3. **Dashboard publico "no disponible" tras crear influencer** (ERROR FLUJO)
   - SINTOMA: Tras aprobar aplicacion, el influencer recibia email con link al dashboard, pero al entrar decia "Dashboard no disponible".
   - CAUSA RAIZ: La pagina de verificacion de password no manejaba correctamente el loading state post-autenticacion. El fetch del dashboard fallaba silenciosamente.
   - FIX: Corregido flow de loading, agregado manejo de errores, validacion de slug/code.
   - Commit: 599c593

4. **Tracking link no visible en dashboard publico** (ERROR UX)
   - SINTOMA: El influencer entraba a su dashboard pero no veia donde estaba su link de tracking.
   - CAUSA RAIZ: El tracking link se generaba pero no se mostraba en la UI del dashboard publico.
   - FIX: Agregada card con el tracking link copiable en el dashboard publico.
   - Commit: e740770

5. **Toggle de productos habilitado pero seccion no visible** (ERROR LOGICA)
   - SINTOMA: Admin habilitaba isProductBreakdownEnabled para un influencer, pero en el dashboard no aparecia la seccion de productos.
   - CAUSA RAIZ: La condicion era `data.topProducts && data.topProducts.length > 0`, que ocultaba la seccion cuando habia 0 productos (caso de influencer nuevo sin ventas aun).
   - FIX: Cambiado a `data.topProducts !== undefined` con mensaje de empty state "Cuando tus ventas se registren, vas a ver aca que productos vendiste".
   - APRENDIZAJE: **Para secciones con toggle, mostrar empty state cuando esta habilitado pero sin datos, NO ocultar la seccion. El usuario necesita feedback de que el toggle funciona.**
   - Commit: 15cce14

6. **Portal del influencer con 2 URLs confusas** (ERROR ARQUITECTURA)
   - SINTOMA: El influencer tenia una URL para ganancias (/i/[slug]/[code]) y otra para contenido (/i/[slug]/[code]/content). El usuario (Tomy) se confundio sobre quien usaba cual.
   - CAUSA RAIZ: Se implementaron como paginas separadas durante Fase 5, cuando deberian haber sido una sola experiencia.
   - FIX: Unificado en 1 URL con 2 tabs ("Mis Ganancias" / "Mi Contenido"). La URL /content ahora redirige automaticamente.
   - APRENDIZAJE: **Para portales de usuario externo (influencers), UNA sola URL con navegacion interna (tabs). Los influencers necesitan la experiencia mas simple posible. Si hay duda, unificar.**
   - Commit: e3890cd

7. **Nav admin sobrecargado — 10 items bajo Influencers** (ERROR UX)
   - SINTOMA: Tomy reporto que el sidebar se sentia "muy cargado" con Briefings, Contenido, UGC Library y Product Seeding dentro de Influencers.
   - CAUSA RAIZ: Se agregaron los items de Fase 5 al dropdown existente sin reorganizar.
   - FIX: Creada seccion "NITRO CREATORS" con 2 sub-arboles: Influencers (6 items) y Contenido (4 items). Despues se promovieron NitroPixel y LTV a premium cards.
   - APRENDIZAJE: **Cuando un dropdown supera 6-7 items, reorganizar en secciones separadas. El usuario nota la sobrecarga antes que el developer.**
   - Commit: 4849eee, ba52674

#### Que se hizo (resumen por commit):

1. **Fase 1 base** (8735ddd) — Modelos Prisma, CRUD, dashboard publico, tracking, atribucion
2. **Password protection** (1b427d5) — SHA-256 auth para dashboards publicos, fix tipografia inputs
3. **Coupon attribution + commission tiers** (b7cb5d9) — Cupones, tiers de comision, bonus de campana
4. **DB schema sync** (d7b29fd) — Trigger redeploy post-push schema
5. **Dashboard publico v2** (cdf0ea7) — KPIs, chart, campanas, cupones, stats completos
6. **Fase 3 self-service** (0c07fc9) — Aplicaciones, form publico, email automatico via Resend
7. **Link form publico en admin** (1e4abc6) — Card con URL copiable del formulario
8. **Fixes Phase 3** (e740770) — Tracking link visible, bugs menores
9. **Fix Internal Error + inputs** (7c81b4b) — org.website fix, CSS specificity fix
10. **Fix email + loading** (599c593) — Nombre org en email, loading post-password
11. **Fase 4 analytics** (fa94143) — Leaderboard, analytics, CSV export
12. **Empty states** (6216b80) — Analytics y leaderboard con empty states
13. **Product breakdown** (75b7b0d) — Toggle isProductBreakdownEnabled, productos en dashboard
14. **Empty state productos** (15cce14) — Mostrar seccion vacia cuando toggle on pero sin ventas
15. **Fase 5 contenido** (1abc297) — Briefings, submissions, UGC library, product seeding
16. **Tab unification** (e3890cd) — 2 tabs en dashboard, redirect /content, nav reorganizado
17. **Nitro Creators** (4849eee) — Seccion propia con gradient premium, smart isActive
18. **Premium cards** (ba52674) — NitroPixel y LTV con cards glowing, badges, descripciones

#### Archivos nuevos creados (30+):
- 11 paginas admin bajo `/influencers/*`
- 3 paginas publicas bajo `/i/[slug]/*`
- 15 API routes bajo `/api/influencers/*` y `/api/public/influencers/*`
- 7 modelos Prisma nuevos

#### Archivos modificados:
- `prisma/schema.prisma` — v3 -> v4: +7 modelos influencer, +isProductBreakdownEnabled
- `src/app/(app)/layout.tsx` — v2 -> v4: NITRO CREATORS seccion + premium cards + smart routing
- `src/app/i/[slug]/[code]/page.tsx` — Reescrito 3 veces (v1 base -> v2 world-class -> v3 tabs)
- `src/app/i/[slug]/[code]/content/page.tsx` — Full page -> redirect only

#### Decisiones tomadas con Tomy:
- Content/UGC es concepto 100% interno de la empresa, NO se expone al influencer
- Influencer solo "envia contenido", la empresa decide que es UGC
- Portal del influencer DEBE ser lo mas simple posible — 1 URL, 2 tabs
- Admin nav reorganizado: Influencers (performance) separado de Contenido (creative)
- NitroPixel y LTV promovidos a premium cards para darles mas peso visual
- Nombre del producto: "Nitro Creators" (elegido sobre AFI, INFLUX, AMPLI)
- Ubicacion: seccion propia con gradient, al mismo nivel que HERRAMIENTAS

---

### 2026-04-03 — Sesion 5 (LTV Guardrails + Build Fix + Configurable Thresholds + Deep Audit + Sidebar Reorg)

**Commits**: 0aafb0d, 1b60f12, 4409537, 9eec0de, 6ff64d1, 0ca3726, 90df13e, 6da6c9d, 83676eb, 042445b (10 commits)
**Deploy**: Vercel auto-deploy OK (042445b -> main). Build time volvio a ~50s tras fix.

#### Errores encontrados y corregidos:

1. **Build colgado en Vercel — 8+ minutos** (ERROR CRITICO)
   - SINTOMA: Deploys en Vercel tardaban 8-9 minutos en vez de ~50 segundos. Build se quedaba en "Building..."
   - CAUSA RAIZ: `prisma db push` estaba en el build command de package.json (`prisma generate && prisma db push && next build`). `prisma db push` es un comando de DESARROLLO que hace schema introspection contra la DB en vivo. En cada deploy, se conectaba a la Railway DB de produccion y bloqueaba.
   - POR QUE NO SE VIO ANTES: Cuando la DB era chica, el schema introspection era rapido. Con crecimiento de datos y indices, empezo a tardar minutos.
   - FIX: Removido `prisma db push` del build command. Ahora: `prisma generate && next build`
   - APRENDIZAJE: **`prisma db push` NUNCA debe estar en un build de produccion. Es solo para desarrollo local. Las migraciones de schema en produccion se hacen con `prisma migrate deploy` y de forma separada al build.**
   - Commit: 0aafb0d

2. **`column "totalOrders" does not exist`** (Error en query de top customers)
   - SINTOMA: Al intentar mostrar detalles de clientes en la tabla top 20, query fallaba
   - CAUSA RAIZ: Se intento acceder a `customer_ltv_predictions."totalOrders"` como columna directa, pero `totalOrders` vive dentro del campo JSON `inputFeatures`
   - FIX: Cambiado a `p."inputFeatures"->>'totalOrders'` con cast apropiado
   - APRENDIZAJE: **Los datos de features de prediccion estan en `inputFeatures` (JSONB), NO como columnas separadas.**

3. **`column oi.productName does not exist`** (Error en customer detail)
   - SINTOMA: Endpoint customer-detail tiraba error SQL al intentar mostrar nombres de productos
   - CAUSA RAIZ: Tabla `order_items` NO tiene columna `productName`. Los nombres estan en tabla `products` via `productId` FK.
   - FIX: JOIN a `products` table y usar `COALESCE(p.name, 'Producto')`
   - APRENDIZAJE: **Schema de order_items: id, quantity, unitPrice, totalPrice, costPrice, orderId, productId. SIN productName.**

4. **SQL LIMIT inside string_agg** (Error de sintaxis PostgreSQL)
   - SINTOMA: Query con `string_agg(p.name, ', ' LIMIT 5)` fallaba
   - CAUSA RAIZ: PostgreSQL no permite LIMIT directamente dentro de una funcion de agregacion
   - FIX: Wrapping en subselect: `SELECT string_agg(sub.name, ', ') FROM (SELECT ... LIMIT 5) sub`
   - APRENDIZAJE: **Para limitar items en string_agg, siempre usar subquery wrapping.**

5. **Predicciones LTV infladas — $4.8M para cliente de $158K** (BUG MATEMATICO)
   - SINTOMA: Clientes con 2 compras en 3-4 dias aparecian con predicciones de millones de pesos
   - CAUSA RAIZ: El motor extrapolaba frecuencia personal linealmente. 2 compras en 4 dias = 0.25 compras/dia = ~91 compras en 365 dias. Multiplicado por ticket promedio, daba millones.
   - ANALISIS: 35 clientes con ratio > 5x (muy inflados), 122 con ratio 3-5x. El 93.8% de high_value tenia ratio razonable (<2x).
   - FIX: 3 guardrails implementados:
     - Guardrail 1 (MIN_HISTORY_DAYS=30): Clientes con <30 dias usan cohort_boosted, no personal_history
     - Guardrail 2 (MAX_FREQ_PER_DAY=1/7): Frecuencia personal capeada a max 1 compra/semana
     - Guardrail 3 (PREDICTION_CAP_MULTIPLIER=3): Prediccion max = 3x gasto real
   - BENCHMARKS: Google CrystalValue usa zero-inflated lognormal (modela prob de no-compra). Klaviyo requiere 180+ dias. Triple Whale ni siquiera predice individual.
   - APRENDIZAJE: **Toda extrapolacion de frecuencia necesita: (a) minimo de historia, (b) cap de frecuencia, (c) cap de prediccion. Sin estos guardrails, clientes recientes con multiples compras generan predicciones absurdas.**
   - Commit: 6da6c9d

6. **`inputFeatures` null para orderCount/totalSpent** (datos legacy)
   - SINTOMA: Campos dentro de inputFeatures mostraban null en la UI
   - CAUSA RAIZ: Las predicciones en DB fueron escritas por la v2 del engine (test run anterior) que no incluia estos campos. La v3 SI los escribe.
   - FIX: No se corrigio directamente — se recalculan las predicciones desde la UI con el POST /api/ltv/predict
   - APRENDIZAJE: **Tras cambiar el schema de inputFeatures, hay que recalcular las predicciones para que los datos nuevos se graben.**

#### Que se hizo:

1. **Fix build colgado** (0aafb0d)
   - Removido `prisma db push` del build command

2. **Customer details en top 20 predicciones** (1b60f12)
   - Agregado ordenes, gasto total, primera/ultima orden, dias como cliente al query GET /api/ltv/predict

3. **Nota "Sin datos"** (4409537)
   - Clientes con canal "Sin datos" son anteriores a la instalacion del NitroPixel
   - Nota explicativa en la UI

4. **Umbrales configurables con auto-sugerencia** (9eec0de)
   - Nuevo endpoint /api/settings/ltv (GET + PUT)
   - Auto-sugerencia basada en percentiles reales (p50=low, p90=medium, redondeados a 5K)
   - UI colapsable en pagina LTV para configurar
   - Motor parametrizado: recibe umbrales como argumentos

5. **Customer detail expandible** (6ff64d1)
   - Click en chevron en top 20 -> expande historial de ordenes
   - Muestra: prediction features + lista de ordenes con fecha, monto, status, items, productos

6. **Fix customer detail query** (0ca3726)
   - Corregido JOIN a products para nombres, subselect para LIMIT en string_agg

7. **Hero de credibilidad** (90df13e)
   - Banner gradiente violeta con descripcion BG/NBD
   - Badges: Meta CAPI, Google Ads, NitroPixel
   - Pipeline visual: Purchase Data -> pLTV Engine -> NitroPixel -> Meta/Google

8. **3 guardrails anti-inflacion** (6da6c9d)
   - MIN_HISTORY_DAYS = 30 (usa cohort_boosted si <30 dias)
   - MAX_FREQ_PER_DAY = 1/7 (cap de frecuencia)
   - PREDICTION_CAP_MULTIPLIER = 3 (max prediccion = 3x gasto)
   - Nuevo metodo `cohort_boosted` con boost 1.5x (2 ordenes) o 2x (3+)
   - Confidence reducida para clientes con historia insuficiente

9. **Documentacion Session 5** (83676eb)
   - Actualizado CLAUDE_STATE.md con todos los commits, errores, aprendizajes de la sesion

10. **Reorganizacion sidebar** (042445b)
   - Estructura cambiada de NavItem[] flat a NavGroup[] con 7 grupos
   - Grupos: OPERACIONES (Centro de Control, Pedidos, Analytics), CATALOGO (Productos), MARKETING Y ADQUISICION (Campanas, NitroPixel, SEO), CLIENTES (Segmentacion, Lifetime Value), CANALES (MercadoLibre, Competencia), FINANZAS (P&L con children), sin-grupo (Alertas, Chat IA, Configuracion)
   - Labels renombrados: Overview -> Centro de Control, Ordenes -> Pedidos, Finanzas -> P&L
   - Separadores visuales sutiles entre grupos (border-t + label uppercase tracking)
   - 14 items preservados sin cambios en rutas, iconos, children ni logica
   - Decision: nombres mayormente en espanol con terminos estrategicos en ingles (Lifetime Value, SEO)

#### Archivos nuevos creados (2):
- `src/app/api/settings/ltv/route.ts` — GET/PUT umbrales + auto-sugerencia
- `src/app/api/ltv/customer-detail/route.ts` — Historial de ordenes de cliente

#### Archivos modificados (5):
- `package.json` — Removido `prisma db push` del build command
- `src/lib/ltv/prediction-engine.ts` — v1 -> v3: parametrizado + 3 guardrails + cohort_boosted
- `src/app/api/ltv/predict/route.ts` — v1 -> v2: lee umbrales de settings + customer details en top 20
- `src/app/(app)/customers/ltv/page.tsx` — v2 -> v3: threshold config UI + expandable customer detail + nota Sin datos + hero credibilidad
- `src/app/(app)/layout.tsx` — v1 -> v2: sidebar reorganizado en 7 grupos con separadores visuales y labels renombrados

#### Investigacion realizada:
- Analisis profundo de 47,264 predicciones contra datos reales
- Benchmark contra 6 sistemas de produccion: Google CrystalValue (ZILN), Klaviyo (BG/NBD), Triple Whale (cohortes), Meta pLTV (clasificacion), Lifetimely (ML), Northbeam (analitico)
- Cross-tab gasto real vs segmento predicho: 10,988 clientes medium por gasto real clasificados como high por prediccion
- Repeat rates reales: high bucket 6.2%, medium 16.3%, low 13.6%
- 85.9% de clientes compraron 1 sola vez

#### Decisiones tomadas con Tomy:
- Umbrales deben ser configurables por el usuario + auto-sugeridos por el sistema
- Tomy pidio analisis McKinsey-level de datos reales antes de definir umbrales
- Nuevos umbrales propuestos y aceptados: low=$25K, medium=$100K (basados en percentiles reales)
- Customer detail expandible para verificacion humana de predicciones
- Hero de credibilidad para mostrar validacion Meta/Google y pipeline NitroPixel
- Guardrails aprobados para implementar, pero envio a plataformas NO activar sin aprobacion explicita

---

### 2026-04-03 — Sesion 4 (Modulo Margenes Completo + IVA Fix + Cross-Filtering)

**Commits**: ebc168a, d63fd48, 2da1b43, efbeacb, 9173a9d (5 commits)
**Deploy**: Vercel auto-deploy OK (9173a9d -> main)

#### Que se hizo:

1. **Tab Margenes en Productos** (ebc168a)
   - Nuevo tab "Margenes" en products/page.tsx
   - 4 KPI cards: Margen Bruto Prom (ponderado por revenue), Revenue Neto, Ganancia Bruta, Productos Sin Costo
   - Chart distribucion por rango de margen (Negativo, 0-30%, 30-50%, 50-70%, 70%+)
   - Chart horizontal margen por marca (top 10)
   - Tabla margen por categoria: Revenue, COGS, Margen %, Ganancia, Productos
   - Top 10 mas rentables y Top 10 menos rentables
   - Datos: solo productos con costPrice cargado

2. **Catalogo Completo de Margenes** (d63fd48)
   - Tabla full catalog dentro del tab Margenes con 10 columnas
   - Columnas: Producto, Precio, Costo, Margen %, Margen $/ud, Unidades, Facturacion, Ganancia, Stock, ABC
   - Paginacion (50 items/pagina)
   - Sort por cualquier columna
   - Chips de filtro por rango de margen (Negativo, 0-30%, 30-50%, 50-70%, 70%+) con conteo
   - Exportar CSV con todos los campos

3. **Fix IVA + Filtros Inline** (2da1b43) — Fix critico identificado por Tomy
   - PROBLEMA: El precio de venta incluye 21% IVA pero el costo NO incluye IVA
   - Todos los margenes estaban inflados porque comparaban precio con IVA vs costo sin IVA
   - FIX API: Agregado IVA_RATE = 1.21, revenueNeto = revenue / 1.21, avgPriceNeto = avgPrice / 1.21
   - Recalculados TODOS los margenes con revenueNeto: distribucion, byBrand, byCategory, marginAnalysis
   - Agregados campos revenueNeto y avgPriceNeto al tipo ProductMetrics y response
   - FIX FRONTEND: Parseo de nuevos campos, tooltips actualizados a "sin IVA"
   - Agregados filtros inline en catalogo de margenes: busqueda, dropdown marca, dropdown categoria

4. **Markup % + Column Selector** (efbeacb)
   - Columna Markup % en tabla de margenes: markup = (precioNeto - costo) / costo * 100
   - Badges de color: verde >= 100%, amarillo >= 50%, rojo < 50%
   - Sort por Markup
   - Markup incluido en CSV export
   - Componente ColumnSelector reutilizable (dropdown con checkboxes Eye/EyeOff)
   - Aplicado a tabla Overview (10 columnas configurables) y tabla Margenes (10 columnas configurables)
   - Tipo ColumnConfig: { key, label, defaultVisible }

5. **Cross-Filter Category/Brand + Markup en Tabla Categorias** (9173a9d)
   - PROBLEMA: Las tablas de "Margen por Categoria" y "Margen por Marca" usaban datos pre-computados del API, no respetaban los filtros de marca/categoria
   - FIX: computedByCategory y computedByBrand calculados client-side desde `filtered` (que ya respeta brandFilter/categoryFilter)
   - Seleccionar una marca -> tabla categorias muestra solo categorias de esa marca
   - Seleccionar una categoria -> chart marcas muestra solo marcas de esa categoria
   - Dropdowns de marca y categoria en el header de la tabla de categorias
   - Indicadores de filtro activo en ambas secciones
   - Columna Markup % en tabla de categorias con badges de color

#### Archivos modificados:
- `src/app/api/metrics/products/route.ts` — v1 -> v2: IVA fix, +revenueNeto, +avgPriceNeto, recalculo de todos los margenes
- `src/app/(app)/products/page.tsx` — v10.1 -> v11: +tab Margenes completo, +catalog table, +column selector, +inline filters, +markup, +cross-filtering. De ~1200 a 1865 lineas

#### Decisiones tomadas con Tomy:
- El IVA fix fue identificado por Tomy: "el precio tiene IVA incluido, y el costo no tiene IVA"
- Tomy pidio que las tablas de categoria se puedan filtrar por marca (cross-filtering)
- Tomy pidio columna Markup % ademas de Margen %
- Tomy pidio poder personalizar que columnas ver en las tablas

---

### 2026-04-02 — Sesion 3 (LTV Dashboard + Motor de Prediccion pLTV)

**Commits**: d950cef (LTV dashboard), b058253 (MELI exclusion fix), d4eb371 (prediction engine + send modules)
**Deploy**: Vercel auto-deploy OK (d4eb371 -> main)

#### Que se hizo:
1. **LTV Analytics Dashboard** (d950cef)
   - Nuevo endpoint GET /api/metrics/ltv con 7 queries paralelas SQL
   - Nueva pagina /customers/ltv con: KPIs (LTV promedio, tasa recompra, dias p/ recompra, LTV:CAC), chart por canal, cohort retention heatmap, patron de recompra, top 20 clientes
   - Nav actualizado: Clientes ahora tiene children (Segmentacion + Lifetime Value)

2. **MercadoLibre Exclusion** (b058253) — fix critico identificado por Tomy
   - MercadoLibre no comparte datos de clientes (no email, no nombre, no customerId)
   - Agregado `AND o."source" != 'MELI'` a TODAS las queries LTV
   - Removido ML del frontend, agregado badge "Solo Tienda Propia (VTEX)"

3. **Motor de Prediccion pLTV** (d4eb371)
   - prediction-engine.ts: modelo cohort-based inspirado en BG/NBD. Segmentos = canal x ticket bucket
   - Clientes 1 compra: cohort lookup. Clientes 2+: blend 70% personal / 30% segmento
   - POST /api/ltv/predict: batch prediction para todos los clientes
   - send-meta.ts: envio de predicted_ltv a Meta CAPI (DESACTIVADO)
   - send-google.ts: RESTATEMENT a Google Ads Conversion Adjustments (DESACTIVADO)
   - Frontend: seccion predicciones en dashboard LTV con KPIs, tabla, distribucion
   - Prisma: nuevo modelo CustomerLtvPrediction con triple candado seguridad

#### Schema changes:
- Nuevo model: CustomerLtvPrediction (customer_ltv_predictions table)
- Relaciones: Customer.ltvPredictions[], Organization.ltvPredictions[]
- Indices: orgId+segmentBucket, orgId+sentToMeta, orgId+sentToGoogle
- **prisma db push ejecutado exitosamente**

#### Decisiones tomadas con Tomy:
- Envio a Meta/Google DESACTIVADO hasta que Tomy apruebe (ve y valida las predicciones primero)
- Se discutio enviar solo alto valor — explicado que Meta/Google necesitan rango completo
- Se discutio estacionalidad (Dia del Nino agosto) — modelo captura patrones via datos historicos, mejora futura posible
- Se discutio requisito de datos historicos — no requiere 3 anios, con 50-100 clientes recurrentes ya funciona
- Ruta cost-free: prediccion in-house + batch delivery, sin Google Vertex AI

### 2026-04-02 — Sesion 2 (P&L Dual View + InfoTips + Cost Prices Sync Fix)

**Commits**: 5c056f2, 36e9aec
**Deploy**: Vercel auto-deploy OK (36e9aec -> main)

#### Que se hizo:

1. **Fix critico: Sync de precios de costo desde VTEX**
   - El endpoint `/api/sync/cost-prices` usaba VTEX Catalog API (`stockkeepingunitbyid`) que NO devuelve costPrice
   - DESCUBIERTO: El costPrice vive en VTEX Pricing API (`/api/pricing/prices/{skuId}`), NO en Catalog
   - Se necesitaba permiso "Read prices" en VTEX License Manager (recurso "Price List")
   - Se actualizo el endpoint con dual-source: Pricing API (primary) + Catalog (fallback)
   - Se sincronizaron ~1,487 de 22,673 productos antes de frenar (el resto se cargara via Excel)
   - Commit: 5c056f2

2. **P&L Dual View: Vista Ejecutiva + Detallada**
   - Vista Ejecutiva: Score card con semaforo de salud (Excelente/Saludable/Aceptable/Ajustado/Negativo), cascada de 3 cards (Facturacion/Costos/Resultado), mini sparkline, canales de un vistazo
   - Vista Detallada: 5 KPI cards consolidadas, unit economics (AOV, costo x unidad, margen x unidad), waterfall/trend chart toggle, P&L statement completo con IVA para RI, payment fees detallados, descuentos, costos manuales, P&L por canal, margen por categoria y marca
   - Toggle Ejecutivo/Detallado en header
   - `getHealthStatus()` con 5 niveles y colores
   - Commit: 5c056f2

3. **InfoTip tooltips explicativos en todo el P&L**
   - Componente `InfoTip` con icono "?" y tooltip hover
   - +30 tooltips en ambas vistas explicando terminos financieros en espanol claro
   - Pensado para usuarios no-financieros: Revenue, COGS, Margen Bruto, AOV, Beneficio Neto, comisiones, envios, IVA, etc.
   - Cada fila del P&L statement tiene su propio tooltip con `row.tip`
   - Commit: 36e9aec

#### Archivos modificados:
- `src/app/(app)/finanzas/page.tsx` — Rewrite completo (955 lineas): dual view + InfoTips
- `src/app/api/sync/cost-prices/route.ts` — Pricing API primary + Catalog fallback

### 2026-04-02 — Sesion 1 (Modulo Finanzas completo + Period Selector + Deep Audit)

**Commits**: 2600e73..3dd6d00 (22 commits)
**Deploy**: Vercel auto-deploy OK para cada commit

#### Que se hizo:

1. **SEO Intelligence v2** (2600e73)
   - 5 tabs: Overview, Keywords, Pages, Oportunidades, Movimientos
   - 14 queries paralelas en metrics/seo
   - Cannibalization detection, movers up/down

2. **Audit fixes quirurgicos** (b42e533)
   - ML Dashboard: filtro status `notIn: ['CANCELLED', 'RETURNED']` en KPIs y graficos
   - ML Preguntas: removido `take: 200` de promedio tiempo respuesta
   - Google Ads sync: timezone corregido a `-03:00` en 5 instancias
   - SEO frontend: traducciones paises faltantes (DOM, VEN, CRI, PAN, GTM)

3. **PeriodSelector unificado** (d58cf24, c2e39c3)
   - Componente reutilizable `PeriodSelector.tsx`
   - Quick ranges (7d, 14d, 30d, 90d) + Hoy + Ayer + rango custom con boton Aplicar
   - Integrado en: Dashboard, Analytics, Pixel, MercadoLibre, SEO (5 secciones)

4. **P&L Source Breakdown** (4ee511b)
   - P&L separado por canal: VTEX vs MELI
   - Comisiones de plataforma por canal con labels descriptivos
   - `platformFee`, `platformFeeLabel`, `mlCommission`, `mlTaxWithholdings` por source

5. **Modulo Costos Operativos completo** (d8e336a..8fd35fd, 10 commits)
   - Pagina `/finanzas/costos` con 1532 lineas
   - 8 categorias: LOGISTICA, EQUIPO, PLATAFORMAS, FISCAL, INFRAESTRUCTURA, MARKETING, MERMA, OTROS
   - Tarifas de envio: import Excel, template download, calculo por CP+carrier+servicio
   - Perfil fiscal: Monotributo vs RI, IIBB jurisdiccion, auto-generacion impuestos argentinos
   - Constancia AFIP: import PDF para auto-fill con pdf-parse
   - Costos auto-calculados: comisiones ML (% real del revenue MELI), merma estimada
   - Platform config: comision VTEX %, fees medios de pago editables
   - 12 nuevos API endpoints en `/api/finance/*`
   - 2 nuevos modelos Prisma: ManualCost, ShippingRate
   - 2 nuevos packages: exceljs, pdf-parse

6. **Deep Audit P&L** (323ced8, 3dd6d00)
   - Payment fees por metodo de pago con detalle
   - IVA debito fiscal para Responsable Inscripto
   - Descuentos y promociones separados
   - VTEX config editable (comision, fees medios de pago)
   - Merma tipos: roturas, devoluciones no recuperables, diferencias inventario

#### Archivos nuevos creados (12):
- `src/app/(app)/finanzas/costos/page.tsx`
- `src/app/api/finance/manual-costs/route.ts`
- `src/app/api/finance/fiscal-profile/route.ts`
- `src/app/api/finance/fiscal-profile/parse-constancia/route.ts`
- `src/app/api/finance/auto-costs/route.ts`
- `src/app/api/finance/platform-config/route.ts`
- `src/app/api/finance/shipping-rates/route.ts`
- `src/app/api/finance/shipping-rates/import/route.ts`
- `src/app/api/finance/shipping-rates/template/route.ts`
- `src/app/api/finance/shipping-rates/calculate/route.ts`
- `src/app/api/finance/shipping-rates/carriers/route.ts`
- `src/components/PeriodSelector.tsx`

#### Archivos modificados (22):
- `src/app/(app)/finanzas/page.tsx` — P&L source breakdown + manual costs
- `src/app/(app)/seo/page.tsx` — v2 con tabs + PeriodSelector
- `src/app/(app)/dashboard/page.tsx` — PeriodSelector
- `src/app/(app)/analytics/page.tsx` — PeriodSelector
- `src/app/(app)/pixel/page.tsx` — PeriodSelector
- `src/app/(app)/mercadolibre/page.tsx` — PeriodSelector
- `src/app/(app)/layout.tsx` — Nav submenu Finanzas (P&L + Costos)
- `src/app/api/metrics/pnl/route.ts` — +284 lineas: source breakdown, payment fees, IVA, discounts, manual costs
- `src/app/api/metrics/seo/route.ts` — v2 con 14 queries
- `src/app/api/metrics/route.ts` — PeriodSelector compat
- `src/app/api/metrics/trends/route.ts` — PeriodSelector compat
- `src/app/api/mercadolibre/dashboard/route.ts` — Fix status filter
- `src/app/api/mercadolibre/preguntas/route.ts` — Fix response time calc
- `src/app/api/sync/google-ads/route.ts` — Timezone fix -03:00
- `src/app/api/sync/vtex-details/route.ts` — +postalCode capture
- `src/app/api/sync/cost-prices/route.ts` — Pricing API + Catalog fallback
- `src/components/dashboard/DateRangeFilter.tsx` — Refactor para finanzas
- `prisma/schema.prisma` — +ManualCost, +ShippingRate, +Order fields
- `package.json` — +exceljs, +pdf-parse
- `src/types/pdf-parse.d.ts` — Type declaration

### 2026-04-02 (Auditoria completa + fixes quirurgicos pre-demo)
- Auditoria profunda de las 10 secciones, 29 rutas de sync, 9 crons, y consistencia cross-seccion
- Fix ML Dashboard: agregado status filter `notIn: ['CANCELLED', 'RETURNED']` a KPIs, grafico diario, y payment methods
- Fix ML Preguntas: removido `take: 200` del calculo de promedio de tiempo de respuesta (ahora usa todas las 1,048 respondidas)
- Fix Google Ads sync: cambiado timezone de `T00:00:00Z` a `T00:00:00.000-03:00` en 5 instancias (campaign, ad group, creative metrics)
- Fix SEO frontend: agregadas traducciones de paises faltantes (DOM, VEN, CRI, PAN, GTM)
- Verificado GA4 sync: FUNCIONANDO (7K-12K sessions/dia, datos hasta 31/03)
- Verificado VIEW_PRODUCT y ADD_TO_CART: FUNCIONANDO (75K y 12K eventos respectivamente)
- Verificado brand coverage: 66.3% (15,298 de 23,088 productos), mejorado desde 26%
- CLAUDE_STATE actualizado con hallazgos reales vs documentados

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

### ERROR #11: VTEX PRICING API vs CATALOG API — costPrice NO esta en Catalog
**Que paso**: El endpoint `/api/sync/cost-prices` usaba VTEX Catalog API (`/api/catalog_system/pvt/sku/stockkeepingunitbyid/{skuId}`) para obtener precios de costo. Sincronizo 22,673 productos pero TODOS quedaron con costPrice=0 (100 skipped, 0 updated).
**Causa raiz**: La VTEX Catalog API NO devuelve el campo CostPrice. El precio de costo vive en la VTEX **Pricing API** (`/api/pricing/prices/{skuId}`), que es un modulo separado con sus propios permisos.
**Investigacion**: Se probaron multiples endpoints de VTEX (catalog, pricing, computed prices, fixed prices, legacy pricing) hasta confirmar que `/api/pricing/prices/{skuId}` devuelve `costPrice: 6798` correctamente.
**Fix aplicado**: Commit 5c056f2 — El endpoint ahora usa Pricing API como fuente primaria con Catalog como fallback. Incluye check de permisos al inicio.
**REGLA PERMANENTE**:
- **El costPrice de VTEX vive en Pricing API, NO en Catalog API.**
- La Pricing API requiere permiso "Read prices" en License Manager (recurso "Price List").
- VTEX tiene modulos separados con permisos independientes — SIEMPRE verificar que el API key tiene el permiso del modulo correcto.
- Si un campo que deberia existir viene null/undefined, no asumir que no tiene dato — puede estar en OTRO modulo de VTEX.

---

### ERROR #12: VTEX PERMISSION 403 — Role no asociado al API key
**Que paso**: Despues de que el usuario tildo "Read prices" en License Manager, el endpoint seguia dando 403 Forbidden en Pricing API.
**Causa raiz (hipotesis 1)**: El usuario no habia guardado los cambios (confirmo que guardo "10 segundos despues" de la prueba).
**Causa raiz (real)**: El permiso "Read prices" se agrego al rol correcto (el asociado al API key de NitroSales), pero tomo unos segundos en propagarse.
**Cadena de permisos VTEX**: API Key -> Role -> Resources. Los tres eslabones deben estar conectados.
**REGLA PERMANENTE**:
- Verificar la cadena completa: (1) el recurso esta tildado? (2) en el rol correcto? (3) el rol esta asociado al API key correcto?
- Despues de cambiar permisos en VTEX License Manager, esperar 10-30 segundos antes de re-probar.
- Si sigue 403, pedir al usuario que verifique que GUARDO los cambios.

---

### ERROR #13: SYNC TIMEOUT POR SANDBOX — Proceso largo muere sin aviso
**Que paso**: Al correr el sync de cost-prices para 22,673 productos, el proceso murio repetidamente despues de ~1,200-1,500 productos sin error explicito.
**Causa raiz**: El sandbox de ejecucion tiene timeout implicito. No es un error de VTEX ni de la API.
**Workaround**: Se implemento ThreadPoolExecutor (15 workers) con resume capability (query solo productos sin costPrice). Se lograron ~1,487 antes de que el usuario pidiera frenar.
**Decision del usuario**: Cargar los costos restantes via Excel al dia siguiente.
**REGLA PERMANENTE**:
- Procesos que tocan >1000 registros con API calls externas NO se deben correr en sandbox interactivo.
- Para bulk operations, disenar endpoints con chunks y resume capability (query `WHERE costPrice IS NULL`).
- Siempre tener un plan B (Excel import, script local) para cuando el sync automatico sea lento.

---

### ERROR #14: CAMBIOS NO VISIBLES EN PRODUCCION — Falta commit + push
**Que paso**: Despues de reescribir finanzas/page.tsx completo (P&L dual view), el usuario dijo "la sigo viendo igual que antes" y "me parece que no se aplicaron los datos".
**Causa raiz**: Los cambios se hicieron en el repositorio local pero NO se committearon ni pushearon. Vercel necesita un push a main para triggear deploy.
**Fix**: Se hizo `git add + commit + push` y Vercel deployo automaticamente.
**REGLA PERMANENTE**:
- **Despues de CADA cambio significativo, commitear y pushear.**
- No dar por terminado un cambio hasta que este committeado, pusheado, y el usuario confirme que lo ve en produccion.
- Si el usuario dice "no veo los cambios", lo primero es verificar: (1) se committeo? (2) se pusheo? (3) Vercel deployo? (4) cache del browser?

---

### ERROR #15: IVA EN CALCULO DE MARGEN — Precios con IVA vs Costos sin IVA (2026-04-03)
**Que paso**: La pagina de Margenes mostraba margenes inflados para todos los productos. Por ejemplo, un producto con precio $12,100 y costo $6,798 aparecia con 43.8% de margen, cuando el real es 31.9%.
**Causa raiz**: En Argentina, los precios de venta incluyen 21% IVA pero los costos de compra no lo incluyen. El calculo de margen comparaba precio CON IVA vs costo SIN IVA, inflando el numerador artificialmente.
**Fix aplicado**: Commit 2da1b43 — Se agrego IVA_RATE = 1.21 en la API. revenueNeto = revenue / 1.21, avgPriceNeto = avgPrice / 1.21. TODOS los calculos de margen ahora usan revenueNeto: distribucion, byBrand, byCategory, marginAnalysis completo.
**REGLA PERMANENTE**:
- **En Argentina, precio de venta SIEMPRE incluye 21% IVA.** Para calcular margen, dividir precio por 1.21 primero.
- **Costo de compra (costPrice) NO incluye IVA.** Es el precio neto del proveedor.
- Formula correcta: `marginPct = (precioNeto - costo) / precioNeto * 100` donde `precioNeto = precio / 1.21`
- Formula markup: `markupPct = (precioNeto - costo) / costo * 100`
- NUNCA comparar precio con IVA contra costo sin IVA — el margen siempre saldra inflado.
- Si se agrega un modulo nuevo que calcule margenes, verificar que use revenueNeto, no revenue.

---

### ERROR #16: DATOS PRE-COMPUTADOS NO RESPETAN FILTROS — Tablas agregadas vs filtros activos (2026-04-03)
**Que paso**: La tabla "Margen por Categoria" mostraba TODAS las categorias sin importar si el usuario habia seleccionado una marca en los filtros. El usuario seleccionaba "Mattel" pero la tabla seguia mostrando categorias de todas las marcas.
**Causa raiz**: Los datos byCategory y byBrand venian pre-computados desde el API (`marginAnalysis.byCategory`), calculados sobre TODOS los productos. Los filtros de marca/categoria solo afectaban la tabla del catalogo, no las tablas agregadas.
**Fix aplicado**: Commit 9173a9d — Se movio el calculo de byCategory y byBrand al frontend como `useMemo` derivados de `filtered` (que ya respeta brandFilter/categoryFilter/searchTerm). Las tablas agregadas ahora usan `computedByCategory` y `computedByBrand` en vez de `marginAnalysis.byCategory/byBrand`.
**REGLA PERMANENTE**:
- **Si una seccion tiene filtros, TODAS las tablas/charts de esa seccion deben respetar los filtros**, no solo la tabla principal.
- Datos pre-computados en la API son utiles para la carga inicial, pero si hay filtros client-side, las agregaciones deben recalcularse en el frontend.
- Patron: usar `useMemo` derivado del array ya filtrado, no del response original de la API.
- Antes de agregar una tabla/chart nueva, preguntar: "esta tabla respeta los filtros activos de la seccion?"

---

### ERROR #17: INPUTS INVISIBLES POR CSS SPECIFICITY — globals.css override (2026-04-04)
**Que paso**: Los inputs en paginas admin del modulo Influencer no mostraban texto (blanco sobre blanco).
**Causa raiz**: `globals.css` tiene `body { color: var(--nitro-text) }` con `--nitro-text: #FFFFFF`. Los inputs heredan este color. Tailwind classes como `text-gray-900` pierden contra la especificidad de globals.css.
**Fix aplicado**: Inline styles `style={{ color: "#111827", backgroundColor: "#ffffff" }}` en todos los inputs.
**REGLA PERMANENTE**:
- **Inputs en paginas admin SIEMPRE necesitan inline style `color: "#111827"` y `backgroundColor: "#ffffff"`.**
- Tailwind text-color classes NO funcionan para inputs en NitroSales por la especificidad de globals.css.
- Este problema afecta a CUALQUIER pagina nueva que tenga formularios.

---

### ERROR #18: ASUMIR CAMPOS EN MODELOS SIN VERIFICAR SCHEMA — org.website (2026-04-04)
**Que paso**: El endpoint de aprobacion de influencers usaba `org.website` que no existe en el modelo Organization.
**Causa raiz**: Se asumio que Organization tenia campo `website` sin verificar schema.prisma. El campo `website` existe en CompetitorStore, no en Organization.
**Fix aplicado**: Reemplazado por `process.env.STORE_URL || "https://elmundodeljuguete.com.ar"`
**REGLA PERMANENTE**:
- **ANTES de acceder a un campo de cualquier modelo, verificar que EXISTE en prisma/schema.prisma.**
- En particular: Organization tiene name, slug, createdAt, settings (JSON). NO tiene website, url, domain, ni nada similar.
- Si necesitas la URL de la tienda: `process.env.STORE_URL` o hardcoded.

---

### ERROR #19: TOGGLE HABILITADO PERO SECCION OCULTA — Condicion con length > 0 (2026-04-04)
**Que paso**: Admin activo el toggle de productos para un influencer, pero la seccion no aparecia en el dashboard.
**Causa raiz**: La condicion `data.topProducts && data.topProducts.length > 0` ocultaba la seccion cuando el array estaba vacio (influencer nuevo sin ventas).
**Fix aplicado**: Cambiado a `data.topProducts !== undefined` con mensaje de empty state.
**REGLA PERMANENTE**:
- **Para features con toggle: mostrar empty state cuando habilitado pero sin datos, NO ocultar la seccion.**
- El usuario necesita feedback visual de que el toggle funciono.
- Patron: `{feature !== undefined ? (items.length > 0 ? <Content/> : <EmptyState/>) : null}`

---

### ERROR #20: PORTAL EXTERNO CON MULTIPLES URLs — Confusion del usuario (2026-04-04)
**Que paso**: El influencer tenia /i/[slug]/[code] para ganancias y /i/[slug]/[code]/content para contenido. Tomy se confundio.
**Causa raiz**: Se implementaron como paginas separadas durante Fase 5 por comodidad de desarrollo.
**Fix aplicado**: Unificado en 1 URL con 2 tabs. La URL /content redirige al dashboard principal.
**REGLA PERMANENTE**:
- **Portales para usuarios externos (influencers, proveedores, etc.) = UNA sola URL con navegacion interna.**
- Estos usuarios no son tech-savvy. Multiples URLs los confunden.
- Si necesitas secciones diferentes, usar tabs/accordions dentro de la misma pagina.
- Lazy-load el contenido de tabs no activos para performance.

---

### ERROR #21: NAV SIDEBAR SOBRECARGADO — Mas de 7 items en dropdown (2026-04-04)
**Que paso**: Tras Fase 5, el dropdown de Influencers tenia 10 items. Tomy dijo que estaba "muy cargado".
**Causa raiz**: Se agregaron items incrementalmente sin pensar en la experiencia del nav completo.
**Fix aplicado**: Separado en 2 secciones (Influencers + Contenido) bajo NITRO CREATORS.
**REGLA PERMANENTE**:
- **Un dropdown/submenu NO debe tener mas de 6-7 items.** Si excede, reorganizar en secciones.
- Antes de agregar items a un submenu existente, contar cuantos tiene. Si ya tiene 6+, crear nueva seccion.
- El usuario percibe la sobrecarga antes que el developer.

---

### PROTOCOLO PRE-CAMBIO (OBLIGATORIO)

Antes de CUALQUIER modificacion a codigo de NitroSales:

1. Lei CLAUDE_STATE.md completo?
2. Hice fetch del archivo ACTUAL de GitHub (no uso version local)?
3. Mi cambio es quirurgico (string.replace), no full-file rewrite?
4. Si toca fechas: uso -03:00 y AT TIME ZONE?
5. Si toca status filter: incluye CANCELLED y RETURNED?
6. Si toca SQL: todas las columnas existen en schema.prisma?
7. Si toca KPIs: uso summary de orders table, no calculo desde order_items?
8. Si toca paginacion: tengo page + startIndex + timeout handling?
9. Solo uso ASCII (sin acentos, sin emojis, sin Unicode especial)?
10. Pregunte al usuario antes de deployar?
11. Si calculo margenes: uso precioNeto (precio/1.21), no precio con IVA?
12. Si agrego tabla/chart: respeta los filtros activos de la seccion?
13. Si creo inputs en admin: tienen inline style color="#111827" backgroundColor="#ffffff"?
14. Si accedo a campos de un modelo: verifique que existen en schema.prisma?
15. Si agrego feature con toggle: muestro empty state cuando habilitado pero sin datos?
16. Si creo portal para usuario externo: es UNA sola URL con navegacion interna?
17. Si agrego items a un submenu: tiene menos de 7 items despues de agregar?

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
- **Resultado 2026-03-25**: GA4 sync estuvo ROTO desde 19/03 hasta ~fin de marzo (mostraba 1-12 sesiones/dia).
  **RESUELTO**: Verificado 2026-04-01, datos normales desde al menos 02/03 (7K-12K sessions/dia). Sync OK.
- **Baseline GA4 (pre-19/03)**: avg 8,468 users/dia, 10.5 pages/session, 106K PVs/dia.
- **NitroPixel 24/03**: 5,087 visitors, 1.9 pages/session, 10,850 PVs.
- **Diagnostico**: NitroPixel mostraba MENOS que GA4 porque no trackeaba SPA navigation.
  VTEX es SPA, y GA4 cuenta cada navegacion interna. FIX aplicado en commit 8e7cba6.
- **POST-FIX esperado**: Con SPA tracking, NitroPixel deberia subir a ~8-10 pages/session,
  acercandose a GA4. Visitantes unicos deberian ser similares o ligeramente mayores.
- **RESUELTO 2026-04-01**: GA4 service account OK. Datos normales en todo marzo.

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

#### PENDIENTE #5: RESUELTO — GA4 sync roto desde 19/03
- **Verificado 2026-04-01**: GA4 sync funcionando correctamente. Datos completos hasta 31/03.
- Volumenes normales: 7,000-12,000 sessions/dia, 6,000-10,000 users/dia, 65K-107K pageviews/dia.
- Connection status: ACTIVE, sin errores.

---

## MERCADOLIBRE SELLER INTEGRATION — Estado al 2026-04-01

### Ultima actualizacion: 2026-04-02

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


## FINANZAS (P&L + Costos Operativos) — Estado al 2026-04-02

### Arquitectura

**Frontend**:
- `/finanzas` — P&L con dual view (Ejecutivo/Detallado), toggle en header, date picker
- `/finanzas/costos` — 8 categorias de costos manuales, perfil fiscal, tarifas envio, constancia AFIP

**Backend APIs**:
- `/api/metrics/pnl` — P&L completo con source breakdown, payment fees, IVA, discounts, manual costs
- `/api/finance/manual-costs` — CRUD costos por categoria y mes
- `/api/finance/fiscal-profile` — Perfil fiscal (condicion IVA, IIBB, jurisdiccion)
- `/api/finance/fiscal-profile/parse-constancia` — PDF parser para constancia AFIP
- `/api/finance/auto-costs` — Costos auto-calculados (comisiones ML, merma)
- `/api/finance/platform-config` — Config VTEX (comision %, fees medios de pago)
- `/api/finance/shipping-rates/*` — CRUD + import Excel + template + calculate + carriers
- `/api/sync/cost-prices` — Sync precios de costo desde VTEX Pricing API

**Modelos Prisma nuevos**:
- `ManualCost` — costos manuales por categoria/mes/tipo
- `ShippingRate` — tarifas de envio por carrier/servicio/CP

**Packages nuevos**: exceljs (Excel import/export), pdf-parse (constancia AFIP)

### Datos de costos en P&L

El P&L (`/api/metrics/pnl`) ahora calcula y devuelve:
- `revenue` — facturacion total
- `cogs` — costo de mercaderia (de product.costPrice)
- `cogsCoverage` — % de items con precio de costo cargado
- `adSpend` — Meta + Google (de ad_campaign_metrics)
- `shipping` — envios (de orders)
- `platformFees` — comisiones de plataforma (ML real + VTEX config %)
- `paymentFees` — fees medios de pago (por metodo: tarjeta, debito, MP, transferencia)
- `discounts` — descuentos y promociones (de orders.promotionNames)
- `manualCostsTotal` — costos manuales cargados por el usuario
- `isRI` — si la org es Responsable Inscripto
- `ivaDebitoFiscal` — IVA 21% sobre revenue (solo RI)
- `revenueNetoIVA` — revenue sin IVA (solo RI)
- `bySource[]` — breakdown por canal (MELI, VTEX) con P&L individual
- `paymentFees[]` — detalle de fees por metodo y source

### VTEX Cost Price Sync

**Estado actual**: ~1,487 de 22,673 productos tienen costPrice sincronizado.
**Pendiente**: El usuario va a proporcionar un Excel con todos los costos para bulk import.
**API correcta**: VTEX Pricing API (`/api/pricing/prices/{skuId}`) — NO Catalog API.
**Permiso necesario**: "Read prices" en License Manager, recurso "Price List".
**VTEX account**: mundojuguete
**API key**: vtexappkey-mundojuguete-ZMTYUJ (tiene el permiso)

### PENDIENTES FINANZAS

#### PENDIENTE FIN #1: Cargar costos restantes via Excel
- ~21,186 productos sin costPrice
- El usuario prometio proporcionar Excel con todos los costos
- Endpoint de import ya existe pero necesita adaptarse para bulk costPrice update

#### PENDIENTE FIN #2: UX de onboarding sync (para nuevos clientes)
- El usuario quiere: progress bar visible, proceso en background, estimacion de tiempo
- Idealmente webhook-based para no bloquear el browser
- No implementado, solo planificado conceptualmente

#### PENDIENTE FIN #3: Prisma migration pendiente
- Se agregaron ManualCost y ShippingRate al schema + campos en Order
- Requiere `prisma db push` o migration formal
- Los modelos estan en schema pero la migracion puede no haberse corrido en produccion

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

### Ultima actualizacion: 2026-04-02

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

## NITRO CREATORS (INFLUENCER MODULE) — Estado al 2026-04-04

### Ultima actualizacion: 2026-04-04

### Arquitectura

**Portal Publico del Influencer** (1 URL, 2 tabs):
- URL: `/i/[slug]/[code]` — password-protected (SHA-256)
- Tab 1 "Mis Ganancias": KPIs, chart ventas, campanas, cupones, tracking link, stats, productos (si toggle on), mejores dias, ventas recientes
- Tab 2 "Mi Contenido": briefings asignados, seedings de productos, form para enviar contenido, historial de submissions
- Content data: lazy-loaded solo cuando el tab se activa
- Formulario de aplicacion: `/i/[slug]/apply` (publico, sin password)

**Admin (NITRO CREATORS seccion en sidebar)**:
- Influencers: Overview, Gestionar, Campanas, Aplicaciones, Leaderboard, Analytics
- Contenido: Briefings, Aprobaciones, UGC Library, Product Seeding

**Modelos Prisma** (7 nuevos):
- `Influencer` — slug, code, hashedPassword, commissionRate, isProductBreakdownEnabled, status
- `InfluencerCampaign` — name, bonus %, start/end dates, description
- `InfluencerAttribution` — orderId, influencerId, revenue, commission, attributedAt
- `InfluencerApplication` — name, email, instagram, tiktok, youtube, bio, status (PENDING/APPROVED/REJECTED)
- `InfluencerBriefing` — title, type (GENERAL/REEL/STORY/POST/UNBOXING/REVIEW), requirements, deadline, status
- `ContentSubmission` — type, platform, contentUrl, status (PENDING/APPROVED/REVISION/REJECTED), isUGC
- `ProductSeeding` — status (PENDING/SHIPPED/DELIVERED/CONTENT_RECEIVED), trackingNumber, productId

**Flujo de atribucion**:
1. Influencer comparte tracking link con UTM: `?utm_source=influencer&utm_medium=referral&utm_campaign=[slug]`
2. NitroPixel captura la visita con UTMs
3. Cuando se genera una orden, se busca el influencer por slug en utm_campaign
4. Se crea InfluencerAttribution con revenue y comision calculada
5. Influencer ve sus metricas en el dashboard publico

**Flujo de aplicaciones**:
1. Persona llena form en /i/[slug]/apply
2. Admin ve aplicacion en "Aplicaciones"
3. Al aprobar: auto-crea Influencer + envia email via Resend con slug, code y password temporal
4. Influencer accede a /i/[slug]/[code] con su password

**Data isolation**: todas las queries filtran por influencerId AND organizationId. Defense-in-depth en JOINs a products.

### PENDIENTES INFLUENCER

#### PENDIENTE INF #1: Recalcular atribuciones historicas
- Las ordenes existentes con UTM de influencers no tienen InfluencerAttribution creada
- Se podria hacer un backfill buscando ordenes con utm_campaign matching slug de influencers
- No implementado aun, depende de que haya influencers activos con ventas

#### PENDIENTE INF #2: Email templates mejorados
- Actualmente el email de onboarding es texto plano via Resend
- Se podria hacer un template HTML mas profesional con branding NitroSales

#### PENDIENTE INF #3: Notificaciones al influencer
- El influencer no recibe notificacion cuando un briefing nuevo se publica o cuando su contenido es aprobado/rechazado
- Se podria agregar email automatico en estos eventos

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

---

## AUDIENCE SYNC — Estado al 2026-04-04

**Sesion 8: Feature nueva completa. Backend + Frontend + Integraciones.**

### Que es
Sincroniza segmentos de clientes de NitroSales con Meta Custom Audiences y Google Customer Match. Permite crear audiencias basadas en segmentos RFM, LTV buckets, o criterios personalizados, y exportarlas a las plataformas de ads para lookalike audiences, retargeting, y exclusion lists.

### Arquitectura

**Modelos Prisma (2 nuevos):**
- `Audience` — Configuracion de audiencia (nombre, criterios, plataforma, status, IDs externos, match rates, auto-sync config)
- `AudienceSyncLog` — Log de cada sincronizacion (plataforma, resultado, clientes enviados, duracion, errores)
- SQL migration: `prisma/migrations/audience_sync_tables.sql` (ejecutar manualmente en Railway)

**Archivos creados:**

| Archivo | Descripcion |
|---|---|
| `src/lib/audiences/types.ts` | Tipos e interfaces: SegmentCriteria, MetaUserData, GoogleUserIdentifier, SyncResult, AudiencePreview |
| `src/lib/audiences/segment-engine.ts` | Motor de segmentacion: getMatchingCustomers() con filtros RFM/LTV/custom, previewAudience() para stats |
| `src/lib/audiences/send-meta.ts` | Integracion Meta Custom Audiences API v21.0: crear audience, hashear PII (SHA256), upload en batches de 10K, session-based, retry con backoff |
| `src/lib/audiences/send-google.ts` | Integracion Google Ads Customer Match API v17: crear user list, OfflineUserDataJob, operaciones en batches de 100K, Gmail normalization |
| `src/lib/audiences/index.ts` | Re-exports publicos |
| `src/app/api/audiences/route.ts` | CRUD API: GET (listar), POST (crear/preview), PUT (actualizar), DELETE |
| `src/app/api/audiences/sync/route.ts` | Sync API: POST con audienceId, ejecuta sync a Meta y/o Google, logs automáticos |
| `src/app/(app)/audiences/page.tsx` | UI admin: lista de audiencias, audience builder con segment picker, preview en tiempo real, sync manual, status badges |
| `prisma/migrations/audience_sync_tables.sql` | SQL migration para produccion (no usar prisma db push) |

**Archivos modificados:**

| Archivo | Cambio |
|---|---|
| `prisma/schema.prisma` | +2 modelos (Audience, AudienceSyncLog), +1 relacion en Organization |
| `src/app/(app)/layout.tsx` | v4 -> v5: Audience Sync premium card en HERRAMIENTAS (badge SYNC, color purple, glow) |

### Seguridad (Triple Candado)

1. **AUDIENCE_SYNC_ENABLED** — Variable de entorno. Si no es "true", toda la API de sync retorna skipped. Por defecto NO esta activado.
2. **Credenciales** — Requiere Connection de META_ADS y/o GOOGLE_ADS con status ACTIVE. Si no hay credenciales, retorna skipped.
3. **Minimo de audiencia** — Meta requiere minimo 20 clientes, Google similar. Si la audiencia es muy chica, retorna skipped.

### Flujo Meta Custom Audiences

1. Crear Custom Audience vacia (POST `/act_{AD_ACCOUNT_ID}/customaudiences`)
2. Generar session_id unico (random 64-bit int)
3. Hashear PII con SHA256: email, firstName, lastName, city, country, + EXTERN_ID (sin hash)
4. Subir en batches de 10,000 (maximo de Meta API)
5. Retry automatico con exponential backoff si rate limited (error 80003)
6. Marcar last_batch_flag=true en el ultimo batch

### Flujo Google Customer Match

1. Crear CrmBasedUserList (POST `/customers/{id}/userLists:mutate`)
2. Crear OfflineUserDataJob (tipo CUSTOMER_MATCH_USER_LIST, consent GRANTED)
3. Normalizar Gmail (remover dots y + aliases antes de hash)
4. Agregar operaciones en batches de 100K (AddOfflineUserDataJobOperations)
5. Ejecutar job (RunOfflineUserDataJob)
6. NOTA: Google depreca esta API desde Apr 1, 2026. Tokens activos siguen funcionando.

### Criterios de segmentacion soportados

- **RFM Segments**: Champions, Leales, Potenciales, Nuevos, Ocasionales, En riesgo, Perdidos
- **LTV Buckets**: high_value, medium_value, low_value
- **Custom filters**: minOrders, maxOrders, minSpent, maxSpent, recencyDaysMax, recencyDaysMin, cities, states, countries
- **ALL_CUSTOMERS**: todos los clientes con al menos 1 orden y email

### Preview (sin enviar nada)

La UI calcula en tiempo real:
- Total clientes que matchean
- Data completeness: con email, con nombre, con ciudad
- Estimated match rates: Meta (~65% base + multi-key bonus), Google (~45% base)
- Segment breakdown visual
- Top cities, AOV, avg lifetime orders

### Para activar en produccion

1. Ejecutar SQL migration en Railway: `prisma/migrations/audience_sync_tables.sql`
2. Configurar en Vercel env vars:
   - `AUDIENCE_SYNC_ENABLED=true`
   - Meta: `META_AD_ACCOUNT_ID`, `META_ADS_ACCESS_TOKEN` (o en Connection credentials)
   - Google: `GOOGLE_ADS_ACCESS_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID`, `GOOGLE_ADS_DEVELOPER_TOKEN` (o en Connection credentials)
3. Las credenciales tambien se pueden guardar en la tabla `connections` (platform META_ADS / GOOGLE_ADS)

### Investigacion realizada (world-class patterns)

Se investigaron a fondo antes de implementar:
- **Meta Custom Audiences API v21.0**: endpoints, hashing SHA256, multi-key matching (6 fields), session-based uploads, batch de 10K, rate limits, policy updates 2025
- **Google Ads Customer Match API v17**: OfflineUserDataJob, CrmBasedUserList, Gmail normalization, consent metadata, deprecation notice Apr 2026
- **Triple Whale**: audience sync a Meta/Google/TikTok/Pinterest, segment builder, multi-destination
- **Klaviyo**: email-first audience sync, hourly frequency, 100 profile minimum, engagement-based segmentation
- **Segment (Twilio) Engage**: real-time segment evaluation, Generative Audiences (AI), trait activation, health monitoring
- **Hightouch**: warehouse-native reverse ETL, visual audience builder, composable architecture, 250+ destinations

### Pendientes Audience Sync

- [ ] Ejecutar SQL migration en Railway
- [ ] Configurar AUDIENCE_SYNC_ENABLED=true cuando Tomy tenga credenciales
- [ ] Cron de auto-sync (POST /api/cron/audience-sync) para audiencias con autoSync=true
- [ ] UI: editar audiencia existente (form pre-populated)
- [ ] UI: ver historial de syncs (AudienceSyncLog)
- [ ] Incremental sync (solo enviar nuevos/cambiados, no full list cada vez)
- [ ] TikTok Ads audience sync (futuro)
- [ ] Match rate tracking post-sync (Meta devuelve esto en el audience status)
