# Acoplamiento a plataforma — ¿NitroSales es un producto de ecommerce o un producto de VTEX?

**Repo:** `C:/Users/axelf/github/nitrosales` · **Commit:** `9ad4616d` (== `origin/main` == producción)
**Fecha:** 2026-09-05 · **Alcance:** solo lectura. No se modificó ningún archivo del repo.
**Método:** inventario de acoplamiento sobre `src/` (846 archivos `.ts/.tsx`), `prisma/schema.prisma`, `vercel.json` y docs. Cada afirmación tiene evidencia `archivo:línea`.

---

## 1. Veredicto en 5 líneas

1. **NitroSales es un producto de VTEX con un adaptador de MercadoLibre pegado al costado, no un producto de ecommerce.** 211 de 846 archivos de `src/` mencionan VTEX (25%); 98 archivos tienen el literal `'VTEX'`/`"VTEX"` en código.
2. **El schema de datos es el único nivel donde la abstracción existe de verdad**: `enum Platform` ya tiene `SHOPIFY`, `TIENDANUBE` y `WOOCOMMERCE` (`prisma/schema.prisma:159-170`), y `Order.source` es un `String` libre (`:192`). Es una fachada: **ninguna línea de código sabe qué hacer con esos valores**.
3. **El default es VTEX, no "desconocido".** `Order.source String @default("VTEX")` (`prisma/schema.prisma:192`) y 42 ocurrencias de `COALESCE("source", 'VTEX')` en queries (`src/app/api/metrics/orders/route.ts`, `src/app/api/metrics/customers/route.ts`). Una orden sin `source` **es** una orden VTEX para todo el sistema.
4. **El pixel — el activo central — es ~2/3 código VTEX.** De las ~1.560 líneas del script emitido, las líneas 534-1596 (~1.063, **68%**) son LAYER 1/1.5/2/2.3/2.5/3, todas VTEX (`src/app/api/pixel/script/route.ts:534,656,983,1192,1280,1439`). El núcleo genérico (UTMs, click IDs, cookies cross-domain LATAM, sesión, batching, device) son ~490 líneas y **sí** es reutilizable.
5. **El precedente de MercadoLibre es la mala noticia.** ML no se abstrajo: se duplicó. Y el resultado es que **las órdenes de ML nunca pasan por el motor de atribución** — o sea, la segunda plataforma entró al producto sin la feature que justifica el producto.

> **Traducción comercial para Tomy:** hoy podés vender a una tienda Shopify el pixel de tráfico (UTMs, canales, sesiones) pero **no** podés venderle atribución de ventas, Bondly, Pedidos ni Productos sin trabajo de ingeniería real. La app le va a mostrar dos secciones bloqueadas y varias tarjetas vacías con un cartel que dice "VTEX-only".

---

## 2. Tabla-inventario de puntos de acoplamiento

Severidad = impacto para meter un cliente que NO es VTEX.
`H` = VTEX hardcodeado · `A` = abstracción real con impl. VTEX · `A/f` = abstracción de fachada (existe el enum/campo, no existe el código)

| # | Archivo / área | Qué asume | ¿Abstraído? | Sev. |
|---|---|---|---|---|
| 1 | `src/app/api/pixel/script/route.ts:534-1596` | dataLayer VTEX (`orderPlaced`, `productView`, `addToCart`), `window.vtexjs.checkout.orderForm`, `POST /api/checkout/pub/orderForm/{id}/items`, `/api/vtexid/pub/authenticated/user`, cookie `VtexIdclientAutCookie`, hash `#/shipping`/`#/payment`, selectores `.vtex-omnishipping-1-x-*`, `/checkout/orderPlaced?og=` | **H** — sin ninguna capa de detección de plataforma | 🔴 |
| 2 | `src/app/api/webhooks/vtex/orders/route.ts` (809 líneas, `POST` de 766) | Payload del Orders Broadcaster de VTEX + `GET /api/oms/pvt/orders/{id}`. Única puerta de entrada de las órdenes VTEX. 0 tests (audit `review-arquitectura.md:545`) | **H** | 🔴 |
| 3 | `src/lib/vtex-status.ts:14-45` | Mapa de 27 estados VTEX OMS → `OrderStatus`. Se declara a sí mismo "FUENTE ÚNICA DE VERDAD" (`:5`) | **A** para VTEX, **no genérico**: no existe `mapPlatformStatus(platform, raw)` | 🟠 |
| 4 | `prisma/schema.prisma:228-236` `enum OrderStatus` | 7 estados modelados sobre el flujo VTEX (`PENDING/APPROVED/INVOICED/SHIPPED/DELIVERED/CANCELLED/RETURNED`). `INVOICED` es concepto VTEX/AFIP, no existe en Shopify | **H** (enum de DB) | 🟠 |
| 5 | `prisma/schema.prisma:184-225` `model Order` | `packId` = MELI pack_id (`:187`); `couponCode` de `marketingData.coupon` VTEX (`:198`); `promotionNames` de `ratesAndBenefitsData` (`:199`); `deliveryType` de `logisticsInfo` (`:200`); `postalCode` de `shippingData.address` (`:202`); `orderDate` "UTC from VTEX" (`:208`) | **A/f** — los campos son genéricos por tipo, la semántica es VTEX | 🟡 |
| 6 | `prisma/schema.prisma:219` `@@unique([organizationId, externalId])` | El id externo es único **sin** discriminar `source`. Idem `Product:283` y `Customer:311` | **H** — bug latente multi-plataforma: una tienda con VTEX + Shopify puede pisar órdenes | 🟠 |
| 7 | `prisma/schema.prisma:159-170` `enum Platform` | Ya lista `SHOPIFY`, `TIENDANUBE`, `WOOCOMMERCE` | **A/f** — fachada pura, no hay código que los consuma | 🟢 (bien) |
| 8 | `src/lib/connectors/vtex.ts` (632 líneas) | 10 interfaces `Vtex*` (`:7-87`). **No existe interfaz `Connector` común**: `MLCredentials` (`mercadolibre.ts:17`) y `VtexCredentials` (`vtex.ts:7`) no comparten nada | **H** | 🔴 |
| 9 | 15 archivos con `X-VTEX-API-AppKey` a mano; 25 con `vtexcommercestable.com.br` | No hay cliente HTTP VTEX único — ya identificado por la auditoría (`review-arquitectura.md:495-505`, hallazgo M-03) | **H** | 🟠 |
| 10 | `src/lib/order-validation.ts:5-11` | `VtexOrderSummary`, importa `mapVtexStatus`. El contrato de "orden importable" es literalmente VTEX | **H** | 🟠 |
| 11 | `src/app/api/metrics/orders/route.ts:149` y `src/app/api/metrics/customers/route.ts:21` | `const VALID_SOURCES = ["VTEX", "MELI"]` — allowlist cerrada. `source=SHOPIFY` se descarta silenciosamente y cae a "todos" | **H** | 🔴 |
| 12 | `src/app/api/metrics/orders/route.ts` (42 ocurrencias de `COALESCE("source", 'VTEX')`, p.ej. `:235,255,316,362,370,378,503,646,758`) | VTEX es el valor por defecto semántico de cualquier orden | **H** | 🟠 |
| 13 | `src/app/api/metrics/orders/route.ts:44` | `ALTER TABLE orders ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'VTEX'` — DDL en un endpoint de lectura | **H** | 🟡 |
| 14 | `src/lib/sections/config.ts:53-54` | `/orders` y `/products` requieren `[["VTEX","MERCADOLIBRE"]]`. Un cliente Shopify **no ve Pedidos ni Productos** | **A** (el gating es un mecanismo real) con **lista H** | 🔴 |
| 15 | `src/lib/sync-lock.ts:30,51` | El lock de sync se escribe **siempre** sobre `platform: "VTEX"`, sea cual sea el `lockType`. Sin conexión VTEX el lock es un no-op (ya reportado en `review-flujos.md:234`) | **H** | 🟠 |
| 16 | `src/lib/onboarding/credential-tests.ts:1054-1071` | `testCredentialsByPlatform` — switch de 6 casos: VTEX, META_ADS, META_PIXEL, MERCADOLIBRE, GOOGLE_ADS, GSC. `default: "Plataforma X desconocida"` | **A** (switch por plataforma, extensible) — `testVtex` solo son ~420 líneas (`:33-455`) | 🟡 |
| 17 | `src/app/api/me/onboarding/submit-wizard/route.ts:28` | `VALID_PLATFORMS = new Set(["VTEX","MERCADOLIBRE","META_ADS","GOOGLE_ADS"])` | **H** | 🟠 |
| 18 | `src/app/api/me/onboarding/submit-wizard/route.ts:282-305` | El wizard tiene dropdown de plataforma, pero: *"Para providers no-vtex (tiendanube/shopify/etc), **solo capturamos interes**"* (`:304`). Es una lista de espera, no un onboarding | **H** (explícito) | 🔴 |
| 19 | `src/components/OnboardingOverlay.tsx:489-490` | `{ key:"tiendanube", active: false }`, `{ key:"shopify", active: false }`; subtítulo comercial `"VTEX · Tiendanube · Shopify · …"` (`:405`) | **A/f** — la UI ya promete lo que el backend no hace | 🟠 |
| 20 | `src/app/api/bondly/{clientes,clientes/[id],pulse,ltv-insights,churn-risk}/route.ts` (25 ocurrencias de `source = 'VTEX'` en SQL, p.ej. `clientes/route.ts:186,203,265,438,645`) | Bondly filtra por el literal `'VTEX'` en SQL crudo, no por "plataforma con datos de cliente" | **H** | 🔴 |
| 21 | `src/app/(app)/bondly/ltv/page.tsx:473` ("Solo VTEX"), `src/components/orders/PlatformScopeBanner.tsx` (usado en `CouponsCard`, `GeographyCard`, `LogisticsCard`) | La UI tiene un componente dedicado a explicar por qué una tarjeta es VTEX-only | **H** institucionalizado | 🟠 |
| 22 | `src/components/orders/SourceTabs.tsx:15,27-31`; `src/app/(app)/orders/page.tsx:99` | `type SourceValue = "ALL" \| "VTEX" \| "MELI"`; tabs y colores de marca hardcodeados | **H** | 🟠 |
| 23 | `src/app/api/connectors/route.ts:91-93,122-124` | `platformLabels` y `platforms[]` son listas literales | **H** (fácil) | 🟢 |
| 24 | `src/data/dim/vtex-category.schema.sql`, `src/data/dim/vtex-sku-product.schema.sql` + 8 consumidores (`src/lib/pixel/product-id-map.ts:31,62`, `src/lib/products/category-label.ts`, `api/metrics/{products,pixel,conversion}`) | Tablas de dimensión con `vtex_` en el **nombre**; `product-id-map` resuelve el problema específico de VTEX de que `products.externalId` guarda a veces el productId y a veces el skuId (`product-id-map.ts:5-8`) | **H** en el nombre; el problema que resuelve es genuinamente VTEX | 🟡 |
| 25 | `vercel.json:20` (`/api/cron/vtex-sync-recent`) y crons de `/api/sync`, `/api/sync/chain` que llaman `sync/vtex` + `sync/vtex-details` + `sync/vtex-stock` | La red de seguridad de sync es por plataforma, con rutas literales | **H** | 🟡 |
| 26 | `src/lib/pixel/attribution.ts`, `source-classification.ts:30,51,52,72` | El motor de atribución es **genérico** (UTMs, referrers, click IDs). Lo único VTEX es reconocer `checkout.vtex.com` / `vtexpayments.com` como gateway de pago para no contarlo como fuente de tráfico | **A** — la joya reutilizable | 🟢 |
| 27 | `src/lib/webhooks/signature.ts:41-57` | `resolveSecret` busca `webhookSecret` en **cualquier** conexión de la org sin filtrar plataforma (bug H-5 de `review-flujos.md:280-287`). Con 2+ plataformas esto se agrava | **H** (y roto) | 🟠 |
| 28 | `src/lib/backfill/processors/vtex-processor.ts`, `src/app/api/backfill/vtex/route.ts` | Backfill histórico solo VTEX (+ un camino ML separado). `submit-wizard:208` usa `historyMonths.VTEX` y la columna `historyVtexMonths` (`:215`) — **el nombre de la columna de DB tiene "Vtex" adentro** | **H** hasta el schema | 🟠 |

**Resumen del inventario:** 28 áreas. **11 severidad alta (🔴/🟠 bloqueantes de venta)**, 10 medias, 4 bajas, 3 en verde. De las 28, **21 son VTEX hardcodeado**, 4 son abstracciones reales, 3 son fachadas (el enum `Platform`, los campos `externalId`, la UI que ya promete Shopify).

---

## 3. El caso MercadoLibre como predictor: **se duplicó, no se abstrajo**

Esta es la sección que más debería pesar en la decisión, porque ML **ya es** la segunda plataforma y muestra exactamente qué pasa cuando se agrega una.

### Evidencia 1 — Siete implementaciones de escritura de órdenes, cero compartidas

No existe ningún `upsertOrder()` / `ingestOrder()` común (grep de `export function.*[Uu]psertOrder|saveOrder|ingestOrder` en `src/`: **0 resultados**). Los que escriben en `orders` son:

| Camino VTEX | Camino ML |
|---|---|
| `src/app/api/webhooks/vtex/orders/route.ts` | `src/lib/connectors/ml-notification-processor.ts` |
| `src/app/api/sync/vtex/route.ts` | `src/app/api/sync/mercadolibre/route.ts` |
| `src/app/api/backfill/vtex/route.ts` | `src/app/api/sync/mercadolibre/backfill/route.ts` |
| `src/lib/backfill/processors/vtex-processor.ts` | `src/app/api/cron/ml-sync/route.ts` |

**4 + 4 = 8 implementaciones paralelas de "guardar una orden".** La tercera plataforma agrega 3-4 más.

### Evidencia 2 — El mapper de estados de ML está **triplicado**, y VTEX ya había resuelto ese problema

`src/lib/vtex-status.ts:5` dice literalmente: *"FUENTE ÚNICA DE VERDAD para mapeo de status. Todos los puntos de entrada (sync, webhook, backfill) DEBEN importar de aquí. **NO duplicar esta lógica**."*

Cuando entró ML, la lección no se aplicó. El mismo bloque de 8 líneas está copiado textualmente en tres lugares:

- `src/app/api/sync/mercadolibre/route.ts:321-327`
- `src/lib/connectors/ml-notification-processor.ts:467-473`
- `src/app/api/cron/ml-sync/route.ts:28-34`

```
case "paid": return "APPROVED";
case "partially_paid": return "PENDING";
case "shipped": return "SHIPPED";
case "delivered": return "DELIVERED";
case "cancelled": return "CANCELLED";
default: return "PENDING";
```

No hay archivo `ml-status.ts`. **Existía el patrón correcto, escrito en mayúsculas, y la segunda plataforma no lo siguió.**

### Evidencia 3 — Las órdenes de ML **nunca entran al motor de atribución**

`calculateAttribution` (el core del producto) se llama desde 13 archivos. Los que ingieren órdenes son exactamente dos: `src/app/api/webhooks/vtex/orders/route.ts` y `src/app/api/sync/vtex/route.ts`. **Ningún archivo del camino ML lo invoca.**

O sea: la segunda plataforma entró al producto sin la feature que define al producto. Y esto no está tratado como deuda sino como **posicionamiento**: la doc comercial (`CLAUDE_VM/CONOCIMIENTO_PRODUCTO/QUE_ES_CADA_PRODUCTO.md:251`) convierte el límite técnico en un argumento de venta ("ML no comparte la data necesaria, por eso vive como canal separado"), y el producto construyó un componente reutilizable (`PlatformScopeBanner.tsx`) para explicarle al usuario, tarjeta por tarjeta, por qué está vacía.

### Qué predice esto para la tercera plataforma

- **El costo NO baja con la segunda.** Cada plataforma nueva paga el precio completo: su propio webhook, su propio sync, su propio backfill, su propio mapper de estados, su propia ingesta de órdenes, sus propios literales en 20+ queries SQL.
- **El riesgo es que Shopify entre "modo ML"**: datos en las tablas, tab en `/orders`, y afuera de Bondly, de la atribución y de la mitad de las tarjetas. Eso es aceptable para un marketplace que efectivamente no da datos de cliente; **es inaceptable para Shopify**, que da todo (email, customer id, webhooks, checkout propio) y donde el cliente va a esperar paridad con VTEX.
- **La duplicación es cultural, no accidental.** Hubo un patrón documentado y se ignoró. Sin un refactor que haga físicamente imposible duplicar (una interfaz que hay que implementar), la tercera se va a duplicar igual.

---

## 4. Qué se rompe con un cliente Shopify, pantalla por pantalla

Supuesto del ejercicio: una tienda Shopify contrata hoy, se le crea la org, se le instala el pixel vía GTM, y **no hay** conexión VTEX ni ML.

| Pantalla | Qué pasa | Evidencia |
|---|---|---|
| **Onboarding (wizard)** | El dropdown muestra Shopify pero está `active: false`; si igual lo eligiera, el backend **guarda el interés y no pide credenciales**. No hay conexión, no hay sync, no hay backfill. | `OnboardingOverlay.tsx:490`; `submit-wizard/route.ts:289,304` |
| **Test de credenciales** | `testCredentialsByPlatform("SHOPIFY", …)` → `{ ok:false, "Plataforma SHOPIFY desconocida" }` | `credential-tests.ts:1054-1071` |
| **Settings → Integraciones** | No existe `/settings/integraciones/shopify` (solo `vtex`, `mercadolibre`, `meta`, `google-ads`, `google-search-console`, `nitropixel`). El listado de conectores tampoco la incluye. | `ls src/app/(app)/settings/integraciones/`; `api/connectors/route.ts:122-124` |
| **Pedidos (`/orders`)** | **Sección bloqueada** (`LOCKED_INTEGRATION`): requiere VTEX o MERCADOLIBRE. | `src/lib/sections/config.ts:53` |
| **Productos (`/products`)** | **Sección bloqueada**, mismo motivo. | `src/lib/sections/config.ts:54` |
| **Pedidos (si se desbloqueara a mano)** | `SourceTabs` solo tiene Todos/VTEX/MELI; el filtro `?source=SHOPIFY` se descarta por la allowlist y las órdenes Shopify se contarían como VTEX vía `COALESCE(...,'VTEX')`. Números mezclados, no cero: **es peor que romperse, muestra mal**. | `SourceTabs.tsx:15`; `orders/page.tsx:99`; `metrics/orders/route.ts:149` + 42 `COALESCE` |
| **Bondly (clientes / LTV / churn)** | Devuelve **vacío**. Las 5 rutas filtran `AND o."source" = 'VTEX'` en SQL crudo. La UI dice "Solo VTEX". | `api/bondly/clientes/route.ts:186,203,265,438,645`; `bondly/ltv/page.tsx:473` |
| **NitroPixel / Analytics web** | **Funciona parcialmente.** Sesiones, UTMs, click IDs (`gclid`/`fbclid`), referrers, device, canales, cookies cross-subdominio con TLDs LATAM: todo genérico y sirve. | `pixel/script/route.ts:76-533` |
| **NitroPixel — compras** | **No detecta ninguna.** El purchase se detecta por `orderPlaced` del dataLayer VTEX, por `/checkout/orderPlaced?og=`, y por `GET /api/checkout/pub/orders/order-group/{id}`. Shopify no expone nada de eso. | `pixel/script/route.ts:535-654, 1439-1596` |
| **NitroPixel — add-to-cart / product view** | **No detecta.** Intercepta `POST /api/checkout/pub/orderForm/{id}/items` (fetch y XHR) y eventos `productView`/`addToCart` del dataLayer de VTEX. Shopify usa `/cart/add.js` y `window.ShopifyAnalytics`. | `pixel/script/route.ts:656-980` |
| **NitroPixel — identificación de email** | **No identifica.** Las 4 métodos son VTEX: `window.vtexjs.checkout.orderForm`, `GET /api/checkout/pub/orderForm`, cookie `VtexIdclientAutCookie`, `GET /api/vtexid/pub/authenticated/user`, selectores `.vtex-profile-form__email`. Solo sobrevive el listener genérico de blur en inputs de email (`:1406`). | `pixel/script/route.ts:991-1018, 1129-1140, 1291-1376` |
| **NitroPixel — pasos de checkout** | **No dispara.** Depende del hash SPA `#/shipping` / `#/payment` y de clases `.vtex-omnishipping-1-x-*`. En Shopify el checkout vive en otro dominio (`checkout.shopify.com` / `shop.app`), donde el script ni siquiera se carga. | `pixel/script/route.ts:1192-1276` |
| **Atribución de ventas** | **No existe**, porque no hay órdenes ni compras del pixel que atribuir. Es la propuesta de valor completa del producto. | `calculateAttribution` solo se invoca desde caminos VTEX |
| **Rentabilidad / Finanzas / P&L** | Vacío: dependen de `orders`/`order_items`. `useBreakeven.ts:27` documenta "solo VTEX". | `src/lib/hooks/useBreakeven.ts:27`; `campaigns/page.tsx:1223` |
| **Campañas Meta / Google** | **Funcionan.** Son conectores independientes de la plataforma de ecommerce. Pero sin órdenes no hay ROAS real, solo el que reporta la plataforma de ads — que es exactamente el problema que NitroSales dice resolver. | `api/sync/{meta,google-ads}` |
| **Aura (creators)** | Parcial: cupones y UTMs sí; la conversión a venta atribuida no, porque no hay órdenes. | — |
| **Centro de Control / Alertas** | `checks.ts` chequea frescura de la conexión VTEX. Sin conexión VTEX, `sync-lock` escribe sobre 0 filas y devuelve `acquired:true` siempre. | `src/lib/control/checks.ts:42`; `src/lib/sync-lock.ts:30,51` |

### El punto ciego más caro: el checkout de Shopify

Todo el diseño de identificación y de purchase-detection del pixel asume que **el checkout corre en el dominio del cliente** (VTEX Smart Checkout: `mitienda.com.ar/checkout#/...`). En Shopify, salvo Shopify Plus, el checkout es una propiedad de Shopify en otro dominio y **no admite scripts de terceros** — la vía soportada es la Web Pixels API con sandbox, y los `ScriptTag`/`checkout.liquid` están deprecados. Esto no es "portar unas líneas": es una **arquitectura de captura distinta** (eventos `checkout_completed` / `product_added_to_cart` desde el sandbox de Shopify, más el webhook `orders/create` del lado servidor). *(SIN CONFIRMAR contra la doc vigente de Shopify — es análisis, no evidencia del repo; verificar antes de comprometer fechas.)*

**Lo bueno:** el webhook `orders/create` de Shopify trae `customer.email` server-side, así que la identificación puede resolverse por webhook en vez de por navegador — algo que en VTEX se resolvió con 5 capas de scraping en el cliente. La pieza que sí hay que resolver en el navegador es el **puente `visitorId → orden`**, que hoy vive en `attribute-order-by-match.ts` / `link-visitor.ts` y ya es semi-genérico.

---

## 5. Estimación de esfuerzo

No estimo horas con confianza (el repo tiene 290 archivos con `@ts-nocheck`, 0 validación `zod` en 114 rutas y 0 tests en el webhook de órdenes — `review-arquitectura.md`; cualquier número de horas sería inventado). Estimo en **archivos a tocar** y **puntos de acoplamiento a resolver**, que es verificable contra el repo.

### (a) Agregar Shopify — con paridad razonable

| Bloque | Archivos nuevos | Archivos modificados | Puntos de acoplamiento |
|---|---|---|---|
| Conector HTTP + tipos (espejo de `vtex.ts`, 632 líneas) | 1-2 | — | #8, #9 |
| OAuth de app pública Shopify (copiar patrón de `api/auth/mercadolibre`) | 2-3 | 1 | #16, #17 |
| Mapper de estados (`financial_status` + `fulfillment_status` → `OrderStatus`) | 1 | — | #3, #4 |
| Webhooks `orders/create|updated|cancelled` + HMAC-SHA256 | 2-3 | 1 (`webhooks/signature.ts`, hoy roto — #27) | #2, #27 |
| Sync + backfill + cron de red de seguridad | 3-4 | 1 (`vercel.json`) | #25, #28 |
| **Pixel: capa Shopify** (Web Pixels API / `ShopifyAnalytics` / `/cart/add.js`) | 1 (o refactor del actual) | 1 (`pixel/script/route.ts`) | #1 — **el bloque más caro y más riesgoso** |
| Test de credenciales | — | 1 (`credential-tests.ts`) | #16 |
| Wizard + overlay de onboarding | — | 3-4 | #18, #19 |
| Página de integraciones + listado de conectores | 1 | 2 | #23 |
| Métricas: allowlists + `COALESCE` | — | 2 (42 ocurrencias) | #11, #12, #13 |
| Bondly: 5 rutas, 25 literales `'VTEX'` en SQL | — | 5-6 | #20, #21 |
| UI de Pedidos/Productos: tabs, filtros, gating de secciones | — | 4-6 | #14, #22 |
| Catálogo / dimensiones de producto | — | 2-3 | #24 |
| Schema: `historyVtexMonths`, unique keys sin `source` | — | 1 + migración | #6, #28 |

**Total: ~14-18 archivos nuevos, ~26-32 modificados → 40-50 archivos tocados; 14 de los 28 puntos de acoplamiento del inventario.**

Riesgo dominante: **el pixel**. Es el único archivo del repo marcado `⛔ CORE PROTEGIDO — NO MODIFICAR SIN AUTORIZACION DEL FUNDADOR` (`pixel/script/route.ts:5`), tiene una trampa de escapado documentada en el encabezado (`:8-10`: los regex usan `\\/` y cambiarlo *"rompe el script entero"*), y da servicio en vivo a los 4 clientes actuales. Cualquier cambio ahí se despliega directo a producción sin staging (`CLAUDE.md`, REGLA #1).

### (b) Agregar Tiendanube — **después** de Shopify

| Escenario | Archivos | Comentario |
|---|---|---|
| Tiendanube **primero** (sin refactor previo) | **~40-50** | Prácticamente el mismo costo que Shopify: se paga otra vez cada uno de los 14 puntos |
| Tiendanube **después** de Shopify, sin refactor | **~35-45** | Ahorra poco: se copia el archivo de Shopify y se cambian los endpoints. Es exactamente lo que pasó con ML (evidencia §3) |
| Tiendanube después de un refactor a adaptador (opción c) | **~10-14** | 1 adaptador + 1 mapper + 1 webhook + 1 capa de pixel + registro |

Diferencias técnicas a favor de Tiendanube: API REST más simple, checkout en el dominio de la tienda (el pixel no enfrenta el problema del checkout cross-domain de Shopify), y ya es el mercado natural del pitch LATAM. Diferencia en contra: menos volumen por cliente, y el catálogo/variantes es distinto.

### (c) Refactorizar a una abstracción de plataforma (para que la cuarta sea barata)

Alcance mínimo honesto — un `PlatformAdapter` con `{ testCredentials, fetchOrders, fetchOrder, mapStatus, mapOrder, webhookVerify }` + un `ingestOrder()` compartido + `platform.source` como dato en vez de literal:

| Bloque | Archivos a tocar | Punto |
|---|---|---|
| Definir la interfaz + registro de plataformas | 2-3 nuevos | — |
| Unificar las **8** implementaciones de escritura de órdenes en un `ingestOrder` | 8 | §3 ev.1 |
| Unificar los **4** mappers de estado (1 VTEX + 3 ML duplicados) | 4 | §3 ev.2, #3 |
| Llevar `calculateAttribution` al pipeline compartido (que ML también atribuya) | 3-5 | §3 ev.3 |
| Cliente HTTP VTEX único (M-03 de la auditoría) | 15 | #9 |
| Sacar las 42 `COALESCE(...,'VTEX')` y las 2 `VALID_SOURCES` | 2-4 | #11, #12 |
| Parametrizar Bondly por "plataformas con datos de cliente" | 5-6 | #20 |
| Modularizar el pixel en núcleo + capas por plataforma | 1 grande (1.614 líneas) | #1 |
| `sections/config` por capacidad en vez de por plataforma | 1-2 | #14 |
| Fix de `sync-lock` y `webhooks/signature` (ya son bugs abiertos) | 2 | #15, #27 |
| Schema: agregar `source` a las unique keys + renombrar `historyVtexMonths` | 1 + migraciones | #6, #28 |
| UI: tabs y banners generados desde las conexiones activas | 6-8 | #21, #22 |

**Total: ~50-65 archivos tocados, sobre 98 archivos que hoy contienen el literal `'VTEX'`.** Toca el webhook de 766 líneas sin tests y el pixel `CORE PROTEGIDO`.

**Contexto que no se puede ignorar:** hay una auditoría abierta de 197 hallazgos con al menos 7 críticos, incluida la clave de admin de producción en el repo (`vercel.json:15`) y un webhook que devuelve HTTP 200 cuando falla y pierde órdenes (`review-flujos.md:63-77`). Un refactor de plataforma sobre esa base, en un repo con una sola branch y deploy directo a producción, es una apuesta grande. **La secuencia sensata es: estabilizar → adaptador → Shopify.** No al revés.

### Comparación

| Opción | Archivos | Puntos resueltos | ¿La 4ª plataforma cuesta…? |
|---|---|---|---|
| (a) Shopify tal cual está | 40-50 | 14 de 28 (solo para Shopify) | lo mismo otra vez |
| (b) Tiendanube tal cual está | 35-50 | idem | lo mismo otra vez |
| (c) Refactor primero | 50-65 (sin ninguna plataforma nueva) | 20+ de 28, para todas | ~10-14 archivos |

**Punto de equilibrio:** el refactor se paga solo a partir de la **segunda** plataforma nueva. Si Tomy va a vender a Shopify **y** a Tiendanube, (c) es más barato. Si va a vender solo a una, (a) o (b) directo es más barato — **con la deuda explícita de que la siguiente vuelve a costar lo mismo**.

---

## 6. Qué se podría hacer HOY, barato, para no cerrarse puertas

Ordenado por (impacto / costo). Nada de esto requiere comprometerse todavía con Shopify ni con Tiendanube.

**Costo trivial (1-2 archivos cada uno), altísimo retorno de opción:**

1. **Dejar de usar `'VTEX'` como default semántico.** Las 42 `COALESCE("source", 'VTEX')` de `metrics/orders` y `metrics/customers` son una bomba: el día que entre una orden de otra plataforma sin `source`, se cuenta como VTEX y **nadie se entera**. Backfillear `source` en las filas existentes y sacar el `COALESCE` es una tarde de trabajo hoy, y una investigación de datos corruptos mañana.
2. **Reemplazar las 2 `VALID_SOURCES = ["VTEX","MELI"]`** (`metrics/orders:149`, `metrics/customers:21`) por la lista de `source` distintos que la org tiene realmente en `orders`. Elimina el modo de falla más silencioso de todos: filtro inválido → se ignora → se muestran todos los datos como si el filtro hubiera funcionado.
3. **Crear `src/lib/ml-status.ts` y borrar las 3 copias del mapper** (`sync/mercadolibre:321`, `ml-notification-processor:467`, `cron/ml-sync:28`). Es una hora. Y es la prueba de que la regla de `vtex-status.ts:5` se puede cumplir — sin eso, la tercera plataforma se duplica igual.
4. **Agregar `source` a las unique keys de `orders`, `products` y `customers`** (`schema.prisma:219,283,311`). Es la única de esta lista que **cambia la DB**, pero es la que evita corrupción cross-plataforma cuando un cliente tenga dos. Seguir el orden de migraciones de `CLAUDE.md` (endpoint admin → deploy → ejecutar → schema).
5. **Sacar Shopify y Tiendanube de la UI de onboarding, o etiquetarlos "próximamente" sin dropdown funcional** (`OnboardingOverlay.tsx:405,489-490`). Hoy el wizard acepta la elección y **solo captura interés** (`submit-wizard:304`): un cliente Shopify puede completar el onboarding creyendo que quedó conectado. Ese es un problema comercial, no técnico, y se arregla con una línea.

**Costo bajo, prepara el terreno sin comprometerlo:**

6. **Extraer la capa VTEX del pixel a una función aparte, sin cambiar una sola línea de comportamiento.** Separar `pixel/script/route.ts` en núcleo (líneas 58-533 + 1597-1614) y `vtexLayers()` (534-1596). No agrega features, no cambia el JS emitido (verificable byte a byte), y convierte "agregar Shopify al pixel" de *cirugía sobre el CORE PROTEGIDO* en *escribir una función nueva al lado*. **Es la palanca individual de mayor valor de toda la lista.**
7. **Extraer un `ingestOrder(orgId, canonicalOrder)` compartido** y hacer que los 8 escritores actuales lo llamen. Aunque no se agregue ninguna plataforma, esto arregla de paso que **ML no pase por `calculateAttribution`** — es decir, mejora un producto que ya está vendido, no solo uno hipotético.
8. **Parametrizar `sections/config.ts` por capacidad** (`requires: ["ECOMMERCE_ORDERS"]`) en vez de por nombre de plataforma (`:53-54`). Dos líneas + un mapa plataforma→capacidades. Sin eso, cualquier plataforma nueva deja `/orders` y `/products` bloqueados hasta que alguien se acuerde de editar el array.

**Barato y decide la estrategia sin escribir código:**

9. **Hacer un spike de 1 día sobre el checkout de Shopify** (Web Pixels API: ¿se puede leer `checkout_completed` y el email desde el sandbox? ¿alcanza el webhook `orders/create` para la identificación?). Es la única incógnita que puede duplicar la estimación (a), y la respuesta cambia si la estrategia es "Shopify primero" o "Tiendanube primero".
10. **Reordenar la pregunta comercial**: si el objetivo es crecer, Tiendanube es técnicamente más barato (checkout en el dominio propio → el pixel funciona con mucho menos trabajo) y comercialmente más cercano al mercado LATAM que ya se atiende. Shopify es más grande pero paga el impuesto del checkout cerrado. **Esa asimetría no está reflejada en la doc comercial**, que lista ambos como "sin fecha" (`INTEGRACIONES.md:251,254`).

**Lo que NO conviene hacer hoy:** el refactor completo a `PlatformAdapter` (opción c). Con 7 hallazgos críticos abiertos, sin staging, sin tests en el webhook que ingiere todas las órdenes, y sin saber todavía en qué plataforma venden los clientes nuevos, ese refactor es riesgo puro sin información. Los 8 ítems de arriba compran **la misma opcionalidad** por una fracción del costo y del riesgo — y los cuatro primeros son bugs latentes que hay que arreglar de todos modos.
