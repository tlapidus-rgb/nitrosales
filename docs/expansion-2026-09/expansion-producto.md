# Ajuste de producto por tamaño de cliente

**Repo:** `C:/Users/axelf/github/nitrosales` · commit `9ad4616d` (= `origin/main` = producción)
**Fecha:** 2026-09-05 · **Alcance:** solo lectura del repo. No se tocó DB, endpoints ni branch.
**Ángulo:** ¿el producto *tiene sentido y da valor* en cada tamaño? (no performance — eso es otro review)
**Complementa (no repite):** `docs/auditoria-2026-09/review-diseno.md` (estados vacíos), `review-datos.md` (modelos), `docs/nitropixel-score-rollout.md` (NitroScore).

---

## 1. Veredicto en 5 líneas

1. **NitroSales está construido para un cliente con el perfil exacto de Arredo:** VTEX + volumen alto de órdenes + inversión en Meta/Google + costos cargados + catálogo grande. Es el único punto del rango donde *todos* los módulos tienen data suficiente para decir algo.
2. **Con un cliente chico el producto no se rompe: miente.** Los umbrales existen (LTV, insights, NitroScore) pero cada uno reacciona distinto — unos devuelven `null`, otros devuelven ruido estadístico presentado con la misma autoridad visual que un dato real. El caso más grave es el P&L: sin costos cargados, `COALESCE(costPrice, 0)` produce **margen bruto 100%** (`src/app/api/metrics/pnl/route.ts:94`), y solo la pantalla `/finanzas/estado` avisa (`:250`) — el resto no.
3. **Con un cliente más grande que Arredo el producto trunca en silencio en los lugares que más importan:** Behavioral LTV puntúa solo los **500 visitantes más recientes** (`src/app/api/bondly/behavioral-ltv/route.ts:125`) y Churn Risk solo los **200 de mayor LTV** (`src/app/api/bondly/churn-risk/route.ts:141`), sin bandera de truncado en la respuesta ni en la UI. `/products` trae el catálogo entero sin `LIMIT` (`src/app/api/metrics/products/route.ts`, 0 ocurrencias) y pagina en el browser.
4. **El sistema NO soporta vender módulos por separado hoy.** El campo `Organization.plan` (`prisma/schema.prisma:26`, enum `STARTER|GROWTH|PRO` en `:97`) existe pero **no gatea nada**: sus 10 usos en `src/` son todos de display. La entitlement real es **por usuario** (custom roles), y `OWNER` está hardcodeado a admin-en-todo (`src/lib/permissions.ts:154-157`, `:234-236`).
5. **Aurum es el único módulo con costo variable y no tiene ningún techo:** el modo `DEEP` (Opus 4.5, 8 tool rounds, 8000 tokens) lo elige el cliente desde la UI (`src/app/(app)/chat/page.tsx:156,736`) y no existe cuota, rate limit ni budget por org. La telemetría guarda tokens pero **no costo en USD** (`prisma/schema.prisma:683-703`).

**Rango atendible hoy, en una línea:** desde ~2.000 órdenes/mes con ads activos hasta ~el tamaño de Arredo. Fuera de esa ventana el producto o no dice nada, o dice cosas falsas.

---

## 2. Umbrales mínimos de datos por funcionalidad

| Funcionalidad | Mínimo exigido | Evidencia | Qué muestra si NO se alcanza | ¿Avisa? |
|---|---|---|---|---|
| **NitroScore — Click coverage** | 20 page views | `docs/nitropixel-score-rollout.md` (tabla palancas) | palanca en `collecting`, excluida; score renormaliza | Sí (interno) |
| **NitroScore — Identity richness** | 10 visitors con email | ídem | `collecting` | Sí (interno) |
| **NitroScore — Meta CAPI match** | 5 eventos PURCHASE | ídem | `collecting` | Sí (interno) |
| **NitroScore — Signal freshness** | 10 touchpoints | ídem | `collecting` | Sí (interno) |
| **NitroScore — Webhook reliability** | 5 órdenes | ídem | `collecting` | Sí (interno) |
| **NitroScore — global** | ≥1 palanca con muestra | ídem | `score = null` → "Recopilando datos" | Sí. **Pero el cliente nunca lo ve** (solo `/admin`, gate por `INTERNAL_EMAILS` en `src/lib/feature-flags.ts`) |
| **LTV predictivo — segmento** | 5 clientes en el segmento (canal × bucket de ticket) | `src/lib/ltv/prediction-engine.ts:37` `MIN_SEGMENT_SAMPLE=5`; filtro en `:333` `WHERE COALESCE(...) >= 5` | El cliente **desaparece** de la tabla de predicciones (cuenta en `skipped`) | **No.** El `skipped` vuelve en el resumen del batch, no en la UI del cliente |
| **LTV predictivo — método** | 30 días de historia + 2 órdenes para `personal_history` | `:40` `MIN_HISTORY_DAYS=30`; `:208`, `:265`, `:326` | cae a `cohort_lookup`/`cohort_boosted` con `confidence` 0.25–0.5 (`:319`) | Parcial: hay campo `confidence` y `method` |
| **LTV — techo de predicción** | — | `:42` `PREDICTION_CAP_MULTIPLIER=3`, aplicado en `:337-355` | Predicción nunca supera 3× el gasto real; piso = gasto real | No se marca en la UI cuando el cap se activó |
| **Churn risk — elegibilidad** | **2+ órdenes** (`HAVING COUNT(*) >= 2`) + top 200 por LTV | `src/app/api/bondly/churn-risk/route.ts:120,141` | Clientes de 1 sola orden nunca aparecen | No |
| **Churn risk — baseline sin frecuencia** | — | `src/lib/bondly/churn-score.ts:63-64` | Si `medianDaysBetweenOrders` es null usa **45 días fijos** de "default shop" | No |
| **Behavioral LTV** | — (pero techo de 500 visitors) | `src/app/api/bondly/behavioral-ltv/route.ts:125` | Puntúa solo los 500 `lastSeenAt` más recientes | **No** — no hay flag de truncado en la respuesta (`:272`) |
| **Insight: canal tóxico (LTV:CAC)** | **20 clientes** por canal + CAC>0 | `src/lib/bondly/insight-engine.ts:80` | `null` → la card no se genera | Vía fallback genérico |
| **Insight: sweet spot de recompra** | **30 clientes** en el bucket, con ≥7 días | `:111,114` | `null` | ídem |
| **Insight: cohorte estrella** | **20 clientes** por cohorte + delta ≥5pp | `:135,141` | `null` | ídem |
| **Insight: behavioral VIP** | **30 visitantes anónimos** con score >70 | `:158` | `null` | ídem |
| **Insight: whale at risk** | ≥1 cliente con churn ≥70 (de los 200 elegibles) | `:175` | `null` | ídem |
| **Insights — fallback si 0** | — | `:212-223` `INSIGHT_EMPTY_FALLBACK` | "Sin patrones fuertes en este período… probá ampliar a 90 o 180 días" | Sí — **es el único empty state honesto del motor** |
| **Anomalías (rule-based)** | **NINGUNO. Solo % de cambio** | `src/lib/anomaly/detector.ts:40-50` `THRESHOLDS`, `pctChange` en `:53` | Dispara igual con 3 órdenes que con 3.000 | **No.** Ver §3 |
| **Anomalía de margen** | cobertura de costos >20% | `src/lib/anomaly/detector.ts:158` `hasCostData` | No dispara la alerta de margen | Sí (silencioso pero correcto) |
| **Alerta admin `LOW_IDENTITY`** | ≥20 visitors | `docs/nitropixel-score-rollout.md` | No dispara | Sí (interno) |
| **Alerta admin `NO_PURCHASES`** | ≥50 visitors | ídem | No dispara | Sí (interno) |
| **P&L / margen bruto** | **NINGUNO** | `src/app/api/metrics/pnl/route.ts:94,151,181,200,241,323` | `COALESCE(costPrice, 0)` ⇒ COGS=0 ⇒ **margen 100%** | Solo `/finanzas/estado` (`:250`, `:798`, cuando cobertura <50%). `/finanzas/pulso` usa el mismo COALESCE (`src/app/api/finanzas/pulso/route.ts:113`) y **no expone `cogsCoverage`** |
| **Truth Score (pixel vs plataforma)** | `platformRevenue > 0` | `src/app/(app)/pixel/analytics/page.tsx:313-319` | `"N/A"` gris | Sí, correcto |
| **Truth Score — bandas** | — | `:315-318` | 90-110% verde / 70-130% ámbar / resto rojo | Bandas fijas: con 4 conversiones/semana el ratio salta de banda por 1 orden |
| **Matriz de afinidad** | **NINGUNO visible** | `src/app/api/metrics/ltv/route.ts:794`, techo `LIMIT 64` en `:637` | Pares categoría×categoría sin mínimo de co-ocurrencia | No |
| **Conversión por producto** | — (techo 20.000 productos) | `src/app/api/metrics/conversion/route.ts:47,102,108` | Trunca a top-20k por viewers | **Sí y bien**: `console.warn` en `:111` + `meta.productUniverseTruncated` en `:350`. ⚠️ Ningún componente lo consume (0 hits en `src/components`, `src/app/**/*.tsx`) |

---

## 3. El recorrido de la tienda chica

**Perfil supuesto:** VTEX, ~200 órdenes/mes (≈7/día), ~$2M ARS/mes de facturación, sin inversión en ads o muy poca, sin influencers, sin costos cargados, sin MercadoLibre, catálogo de ~300 SKUs, ~2.000 visitantes/mes.

### Lo que la sidebar le ofrece
El nav de `src/app/(app)/layout.tsx:47-224` muestra **9 grupos** de módulos. Cruzando con `src/lib/sections/config.ts`, solo **6 secciones tienen `requires`** (`orders`, `products`, `mercadolibre`, `campaigns_meta`, `campaigns_google`, `analytics`, `pixel`). Todo el resto —**Bondly, Aura, Finanzas, Rentabilidad, Alertas, Competidores, Influencers y el propio `/campaigns` padre**— no declara ninguna integración requerida, así que `computeSectionStatus` devuelve `ACTIVE` (`config.ts:107`) y la página se abre entera y vacía. `/seo` ni siquiera figura en `SECTIONS`, así que `AutoSectionGuard` la deja pasar sin guard (`src/components/AutoSectionGuard.tsx:46-49`) — y `GOOGLE_SEARCH_CONSOLE` está declarada como `RequiredIntegration` (`config.ts:25`) pero **ninguna sección la usa**.

### Módulo por módulo

| Módulo | ¿Le sirve? | Qué ve concretamente |
|---|---|---|
| **NitroPixel (atribución)** | ✅ **Sí, desde el día 1** | Es lo único que solo necesita tráfico propio. 2.000 visitantes/mes supera holgadamente los mínimos de click coverage (20 PV) y freshness (10 touchpoints). Truth Score va a decir `N/A` en los canales sin plataforma conectada, que es la respuesta correcta. |
| **NitroPixel — Meta CAPI** | ⚠️ Parcial | Necesita 5 PURCHASE; con 200 órdenes/mes las tiene, pero si no conectó Meta la palanca no aplica. |
| **Pixel / Canales** | ✅ Sí | Gateado por `NITROPIXEL` (`config.ts:66`) → se enciende con el primer evento. Buen comportamiento. |
| **Centro de Control (`/dashboard`)** | ⚠️ Ruido | Sin `requires`. Según `review-diseno.md:767` (C-3), vacío y error se pintan como skeleton infinito en `WidgetFormats.tsx`. Un cliente chico dispara varios de esos widgets a la vez. |
| **Pedidos** | ✅ Sí | Gateado a VTEX/MELI, y paginado server-side correcto (`src/app/api/metrics/orders/route.ts:154-155`, `pageSize` cap 100). Le funciona bien. |
| **Productos** | ✅ Sí | 300 SKUs entran cómodos en el fetch completo. Los selectores de marca/categoría son manejables. |
| **Alertas / Anomalías** | ❌ **Ruido activo — el peor caso** | `detectRuleBasedAnomalies` es 100% porcentual, sin piso de volumen (`src/lib/anomaly/detector.ts:40-88`). Con 7 órdenes/día: pasar de 7 a 4 = −43% ⇒ **`priority: "HIGH"` "Facturación cayó 43%… requiere atención inmediata"** (`:73-82`). Un día sin ventas (normal a ese volumen) dispara `current.orders === 0 && previous.orders > 0` ⇒ HIGH (`:173-176`). Y `pctChange` devuelve `+100` cuando el período anterior fue 0 (`:54`), así que 0→1 orden se presenta como OPPORTUNITY. **El cliente chico recibe alertas críticas casi todos los días y deja de leerlas en dos semanas.** |
| **Bondly — Clientes / Señales** | ⚠️ Sirve el listado, no la inteligencia | El CRM en sí (timeline, base de clientes) funciona. |
| **Bondly — LTV predictivo** | ❌ **Vacío o casi** | Con ~2.400 clientes/año repartidos en canal × 3 buckets de ticket, la mayoría de los segmentos queda bajo `MIN_SEGMENT_SAMPLE=5` y el `WHERE` de `prediction-engine.ts:333` los **elimina de la tabla sin decirlo**. Los que sobreviven caen a `cohort_lookup` con `confidence` 0.25–0.5. Mientras tanto la UI dice: *"Motor predictivo que combina BG/NBD… y Gamma-Gamma… Entrenado con tu propia historia de compras"* (`src/app/(app)/bondly/ltv/page.tsx:587`) — **el engine que corre es una heurística de cohortes, no BG/NBD** (encabezado de `prediction-engine.ts:13-18`: *"Cohort-based frequency prediction"*). El gap entre la promesa y el motor se nota mucho más en cliente chico, donde el resultado es visiblemente pobre. |
| **Bondly — Churn Risk** | ❌ **Casi vacío + sesgado** | `HAVING COUNT(*) >= 2` (`churn-risk/route.ts:120`) excluye a todos los clientes de una sola compra, que en una tienda chica son la abrumadora mayoría. Los pocos que califican se puntúan contra el baseline fijo de 45 días (`churn-score.ts:63-64`), así que casi todos salen `critico`. |
| **Bondly — Insights** | ❌ **Cero cards** | Los 5 detectores piden 20 / 30 / 20 / 30 clientes. Ninguno se alcanza. Sale `INSIGHT_EMPTY_FALLBACK` sugiriendo ampliar a 180 días — que tampoco alcanza. **Honesto, pero es un módulo que nunca se enciende.** |
| **Bondly — Afinidad** | ⚠️ Ruido | Sin mínimo de co-ocurrencia. Con pocos clientes, dos pares comprados por 1 persona aparecen como "afinidad". |
| **Campañas (Meta/Google)** | ✅ **Se apaga bien** | `campaigns_meta`/`campaigns_google` requieren `META_ADS`/`GOOGLE_ADS` ⇒ `LOCKED_INTEGRATION`, que `review-diseno.md:695` califica como *el mejor empty state del producto*. ⚠️ **Pero el padre `/campaigns` no tiene `requires`** (`config.ts:59`) y `/campaigns/creatives` resuelve al padre → se abren vacías. |
| **SEO** | ❌ **Ni gateado** | No existe en `SECTIONS`. La página renderiza cruda sin Search Console. |
| **Competidores** | ❌ Vacío sin gate | Sin `requires`. |
| **Rentabilidad / P&L** | ❌ **Peligroso** | Sin costos cargados: COGS=0 ⇒ **margen bruto 100%**. `/finanzas/estado` avisa bajo 50% de cobertura (`:250`), pero `/finanzas/pulso` comparte el `COALESCE(...,0)` (`finanzas/pulso/route.ts:113`) sin exponer cobertura. Un cliente chico que abre Pulso primero ve un negocio con margen perfecto. |
| **MercadoLibre** | ✅ Se apaga bien | `requires: ["MERCADOLIBRE"]`. |
| **Aura (creator economy)** | ❌ **Módulo completo abierto y vacío** | `{ key: "aura", path: "/aura" }` **sin `requires`** (`config.ts:74`). Un negocio que no trabaja con influencers ve Inicio, Creadores, Aplicaciones y Pagos, todo en cero, sin explicación de por qué está ahí. Igual `influencers` (`:75`). |
| **Aurum (chat IA)** | ✅ **Sí, y es la mejor puerta de entrada** | Es el módulo cuyo valor **no depende del volumen del cliente** — le contesta sobre la data que sí tiene. Ojo con el costo (§6). |

### El subconjunto que sí aporta valor desde el día uno

**Este es el paquete comercial que el código ya soporta:**

> **NitroPixel** (atribución + Truth Score + Canales) · **Pedidos** · **Productos** · **Aurum en modo FLASH/CORE** · **Centro de Control acotado**

Los cuatro primeros ya tienen gate de integración correcto o no dependen de volumen. Es exactamente el set que hoy tiene TeVeCompras vía custom role, así que **está probado en producción**. El `MEMBER` default de `permissions.ts:117-129` ya se aproxima: `aura: write`, `pixel: read`, `nitropixel: read`, todo lo demás `none` — corregir `aura` por `orders`/`products` y ese default *es* el paquete chico.

**Lo que hay que sacar del paquete chico:** Bondly LTV/Churn/Insights, Rentabilidad/P&L (hasta que carguen costos), Aura, SEO, Competidores, y **Alertas/Anomalías** hasta que tengan piso de volumen.

---

## 4. El recorrido del cliente más grande que Arredo

Base de referencia: Arredo ≈ 252k órdenes, 1,2M visitantes.

| Punto de quiebre | Evidencia | Qué pasa a 3–5× Arredo |
|---|---|---|
| **Behavioral LTV** | `bondly/behavioral-ltv/route.ts:117-125` — `ORDER BY lastSeenAt DESC LIMIT 500` | A 1,2M visitantes ya son los últimos 500 vistos (una ventana de minutos u horas). A 5M es ruido puro. El comentario del código lo asume *("para no explotar si hay 10K+ visitantes")* pero la respuesta (`:272`) **no lleva flag de truncado** y la UI presenta el score como si cubriera la base. El insight "N visitantes anónimos con perfil VIP" (`insight-engine.ts:158`) se calcula sobre esa muestra sesgada. **Truncado silencioso en el módulo predictivo — el caso más grave del producto.** |
| **Churn Risk** | `bondly/churn-risk/route.ts:141` — `ORDER BY total_ltv DESC LIMIT 200` | Con 252k órdenes ya se ven solo los 200 clientes de mayor LTV histórico. El "Churn Scoreboard" deja de ser un scoreboard de la base y pasa a ser un top-200; la respuesta (`:270`) devuelve `total: scored.length` (=200), que la UI puede leer como el total real. |
| **Catálogo `/products`** | `src/app/api/metrics/products/route.ts` (**0 ocurrencias de `LIMIT`**); `src/app/(app)/products/page.tsx:471` fetch único, `:463` `ITEMS_PER_PAGE=30`, `:616-620` `slice` en cliente | El endpoint devuelve el catálogo completo y el browser pagina. A 100k SKUs el payload y el `useMemo` de filtrado se vuelven inviables. **No hay paginación server-side.** |
| **Selectores de marca/categoría** | `products/page.tsx:1258-1265` — `brands.map(...)`, `categories.map(...)` en `<select>` nativos | Un `<select>` con miles de opciones sin búsqueda. Inusable, sin degradación. |
| **Exportación CSV** | `products/page.tsx:1268` `exportCSV` sobre `filtered`; `bondly/clientes/page.tsx:505` `exportCsv` sobre `customers` | Se generan en el cliente a partir de lo que ya está en memoria ⇒ el CSV **hereda cualquier truncado del fetch** y sale incompleto sin avisar. El de Bondly dice "Exportar CSV de la vista filtrada" (`:513`), lo cual salva parcialmente el copy. |
| **Conversión por producto** | `metrics/conversion/route.ts:47` `PRODUCT_UNIVERSE_CAP=20000`, warn en `:111`, `meta.productUniverseTruncated` en `:350` | **Es el patrón correcto** — el comentario de `:44-46` documenta el bug histórico del `LIMIT 500` que truncaba en silencio. ⚠️ Pero el flag **no lo consume ningún componente** (0 hits en `src/components/`, `src/app/**/*.tsx`), así que a >20k productos visitados vuelve a truncar sin que el usuario lo vea. Un cliente 3× Arredo (848 productos visitados en 30d) todavía no lo toca; uno con catálogo masivo sí. |
| **Afinidad de producto** | `metrics/ltv/route.ts:637` `LIMIT 64` | Top-64 pares. A gran escala pierde sentido semántico (siempre las mismas macro-categorías). |
| **Panel de uso Aurum** | `admin/usage/route.ts:41` `take: 10000` | El dashboard interno de consumo **subestima en silencio** cuando hay más de 10.000 queries en la ventana. Justo en el momento en que más importa mirarlo. |
| **Handlers de Aurum** | `src/lib/intelligence/handlers.ts:121` `take: 10000` | Un tool call de Aurum carga hasta 10k filas a JS. |
| **Sync de catálogo** | `sync/vtex/catalog-refresh/route.ts:58` `take: 5000`; `sync/mercadolibre/catalog-refresh/route.ts:35` `MAX_PRODUCTS=5000`; `sync/catalog/route.ts:9` `DEFAULT_MAX_PAGES=10` (≈500/corrida) | Techos por corrida — diseñados como chunking, pero a catálogo grande la frecuencia de cron determina si el catálogo converge o queda permanentemente atrasado. |
| **Auditoría UTM de ads** | `cron/ads-utm-audit/route.ts:63` `take: 5000` | Idem. |
| **Pagos de Aura** | `aura/payouts/list/route.ts:50` `take: 300` | Un programa de creators grande no ve todos sus pagos. |
| **Backfill VTEX** | `api/backfill/vtex/route.ts:297` `MAX_MONTHS=24` | Techo duro de 2 años de historia. Un retailer con 8 años de data pierde el resto — y **la historia larga es justo lo que hace bueno al LTV**. |
| **Agregaciones que pierden sentido** | `anomaly/detector.ts:40-50` | El problema inverso al del cliente chico: a escala Arredo un −30% de facturación diaria es un evento gravísimo y un −25% no dispara nada. Los mismos umbrales fijos son demasiado sensibles abajo y demasiado gruesos arriba. |

**Lo que NO se rompe arriba (crédito donde corresponde):** `/orders` con paginación real server-side (`metrics/orders/route.ts:154-155,834`), rollups HLL (`pixel_daily_source`, `pixel_daily_product`), el patrón `PRODUCT_UNIVERSE_CAP` con warn + meta, y `MAX_ENTRIES=500` en el cache (`src/lib/api-cache.ts:48`).

---

## 5. Techos y constantes escondidas

| Constante | Valor | Ubicación | Quién lo alcanza | Al alcanzarlo |
|---|---|---|---|---|
| `LIMIT 500` visitors | 500 | `bondly/behavioral-ltv/route.ts:125` | **Ya lo alcanzan los 4 clientes** | 🔴 **Trunca en silencio** |
| `LIMIT 200` churn | 200 | `bondly/churn-risk/route.ts:141` | Arredo y cualquiera con >200 clientes recurrentes | 🔴 **Trunca en silencio** |
| `HAVING COUNT(*) >= 2` | 2 órdenes | `bondly/churn-risk/route.ts:120` | Toda tienda con baja recompra (= toda tienda chica) | 🔴 Excluye sin explicar |
| `MIN_SEGMENT_SAMPLE` | 5 | `ltv/prediction-engine.ts:37`, filtro en `:333` | Todo cliente chico | 🔴 Cliente desaparece de la tabla; `skipped` no llega a la UI |
| `PREDICTION_CAP_MULTIPLIER` | 3 | `ltv/prediction-engine.ts:42,337-355` | Clientes con 1 compra grande | 🟡 Trunca la predicción, no se marca en UI |
| `MAX_FREQ_PER_DAY` | 1/7 | `ltv/prediction-engine.ts:41` | Consumo recurrente de alta frecuencia | 🟡 Subestima; no se marca |
| `MIN_HISTORY_DAYS` | 30 | `ltv/prediction-engine.ts:40` | Todo cliente nuevo | 🟢 Se refleja en `confidence` y `method` |
| `PRODUCT_UNIVERSE_CAP` | 20.000 | `metrics/conversion/route.ts:47,102`; `metrics/pixel/route.ts:92,1088` | Catálogo enorme (Arredo: 848 en 30d) | 🟡 Warn + `meta.productUniverseTruncated` — **pero ningún componente lo lee** |
| `LIMIT 64` afinidad | 64 pares | `metrics/ltv/route.ts:637` | Cualquiera con catálogo multi-categoría | 🟡 Trunca sin aviso |
| `LIMIT 5000` bondly clientes | 5.000 | `bondly/clientes/route.ts:509,576` | Arredo | 🟡 Verificar si es agregación o listado |
| `take: 10000` usage | 10.000 | `admin/usage/route.ts:41` | Uso alto de Aurum | 🔴 Subestima el consumo justo cuando importa |
| `take: 10000` handlers | 10.000 | `lib/intelligence/handlers.ts:121` | Arredo | 🟡 Aurum razona sobre data recortada |
| `take: 500` autodetect | 500 | `aurum/context-autodetect/route.ts:130` | Arredo | 🟡 Silencioso |
| `take: 300` payouts | 300 | `aura/payouts/list/route.ts:50` | Programa de creators grande | 🟡 Silencioso |
| `take: 5000` catálogo | 5.000 | `sync/vtex/catalog-refresh/route.ts:58`; `sync/mercadolibre/catalog-refresh/route.ts:35` | Catálogo >5k SKUs | 🟢 Chunking por corrida (por diseño) |
| `MAX_MONTHS` backfill | 24 | `api/backfill/vtex/route.ts:297` | Retailer con >2 años de historia | 🔴 Pierde historia — degrada LTV y cohortes |
| Catálogo `/products` | **sin límite** | `metrics/products/route.ts` (0 `LIMIT`) | Cliente con catálogo masivo | 🔴 Payload completo al browser; paginación client-side |
| `ITEMS_PER_PAGE` | 30 | `products/page.tsx:463` | — | 🟢 Paginación en cliente |
| `pageSize` órdenes | cap 100 | `metrics/orders/route.ts:155` | — | 🟢 Server-side correcto |
| `MAX_ENTRIES` cache | 500 | `lib/api-cache.ts:48` | Muchas orgs × rangos | 🟢 LRU |
| `ATTRIBUTION_WINDOW_MAX_DAYS` | 180 | `lib/aura/validation.ts:19` | Ciclo de compra largo (muebles, deco) | 🟡 Techo de producto. **Arredo mismo es un caso donde 180d puede quedar corto** |
| `MAX_CHANNEL_WINDOW` | 90 | `settings/attribution/route.ts:24` | ídem | 🟡 |
| `COHERENCE_MAX_DRIFT_PCT` | 15 | `lib/pipeline/coherence.ts:32` | Cliente chico | 🟡 Un drift de 15% son 1-2 órdenes; ruido abajo |
| Cuota Aurum | **no existe** | — | Cualquiera | 🔴 Ver §6 |

**Leyenda:** 🔴 trunca/falla en silencio o daña el dato · 🟡 trunca con aviso parcial o solo en logs · 🟢 comportamiento correcto

---

## 6. Aurum y el costo variable

- **Modos y modelos** (`src/app/api/chat/route.ts:142-166`): `FLASH` = Haiku 4.5 / 2.000 tokens / 2 rounds · `CORE` = Sonnet 4.5 / 4.000 / 5 · `DEEP` = **Opus 4.5 / 8.000 tokens / 8 tool rounds**.
- **Quién elige el modo:** el cliente, desde un selector en la UI (`src/app/(app)/chat/page.tsx:156` estado, `:736` botones). El default es `CORE` (`route.ts:171`).
- **Límite por org:** **no existe.** Barrido de `rateLimit|quota|429|budget` en todo `src/`: los únicos rate limits del repo son `forgot-password` (`:18,46`), `pixel/event` (`:38-47`), `public/influencers/apply` (`:16-36`), `public/influencers/[slug]/[code]` (`:24-37`) y `public/onboarding/*` (`MAX_PER_WINDOW`). **Ninguno sobre `/api/chat` ni `/api/aurum/*`.**
- **Qué se registra** (`prisma/schema.prisma:683-703`, `aurum_usage_logs`): `mode`, `model`, `inputTokens`, `outputTokens`, `totalTokens`, `latencyMs`, `toolRounds`, `toolsUsed`, `stopReason`, `success`, `errorMessage`. **No hay campo de costo en USD.**
- **Quién lo mira:** `/admin/usage` (`src/app/api/admin/usage/route.ts`). Agrega por modo, tendencia diaria, percentiles de latencia, tools más usadas y top orgs por **volumen**. Cero cálculo de costo (0 hits de `cost|USD|precio` en el archivo). El techo `take: 10000` (`:41`) hace que el panel subestime cuando el uso es alto.
- **Autenticación del panel:** `key !== process.env.ADMIN_SECRET && key !== "usage-2026"` (`:29-31`) — hay una clave hardcodeada de fallback. Fuera del alcance de este review, pero conviene anotarlo.

**Riesgo comercial concreto:** el pricing de `PRECIOS.md` dice *"Aurum: queries IA × modo (Deep = 10-50× Flash)"*, pero el sistema **no puede facturar eso ni frenarlo**. Un cliente chico de USD ~150/mes que descubre el botón DEEP y hace 200 consultas Opus con 8 tool rounds cada una puede volverse un cliente de margen negativo, y nadie se entera hasta ver la factura de Anthropic. **Este es el único lugar donde el tamaño del cliente y el costo real se desacoplan por completo.**

---

## 7. ¿Qué tan listo está el sistema para vender módulos por separado?

**Respuesta corta: parcialmente, y por un mecanismo que no fue diseñado para eso.**

### Lo que existe

**Tres sistemas paralelos que no están alineados:**

1. **`Organization.plan`** (`prisma/schema.prisma:26`, enum `STARTER|GROWTH|PRO` en `:97`). **No gatea nada.** Sus 10 usos en `src/` son puramente de display: `settings/organizacion/page.tsx:324`, `admin/clientes/page.tsx:165`, `admin/clientes/[orgId]/page.tsx:144`, `api/admin/clientes/route.ts:105`, `api/admin/clientes/[orgId]/route.ts:78`, `api/control/client/[id]/route.ts:114`, `api/control/clients-health/route.ts:157`, `api/settings/organization/route.ts:74,213`, `control/clientes/page.tsx:232`. Es un label, no una entitlement.

2. **RBAC por sección** (`src/lib/permissions.ts` + `src/lib/section-access.ts` + `middleware`). **Este es el mecanismo que funciona.** 28 secciones × 4 niveles, gate único en el middleware que cubre ~420 rutas (`section-access.ts:135-145`), con distinción read/write por método HTTP. Es lo que hoy sostiene el caso TeVeCompras solo-pixel.

3. **`SECTIONS` de integración** (`src/lib/sections/config.ts`) + overrides en `Organization.settings.sectionOverrides` (`api/me/section-status/route.ts:92-99`) y `system_setting.section_overrides_global` (`:78-88`).

### Los cinco bloqueos concretos

1. **La entitlement es por usuario, no por organización.** `resolveUserPermissions` (`permissions.ts:219-250`) resuelve base role + custom role. Vender "solo NitroPixel" a una org exige asignar el custom role correcto **a cada usuario, uno por uno, y a cada usuario nuevo que inviten**. Un olvido = módulo no vendido, entregado gratis.

2. **`OWNER` rompe cualquier empaquetado.** `resolveUserPermissions:225-227` devuelve `systemMatrix.OWNER` sin mirar el custom role, y `mergePermissions:154-157` fuerza `admin` en las 28 secciones *"(invariante de seguridad)"*. **Si el dueño de la tienda tiene rol OWNER, ve absolutamente todo, sin importar qué compró.**

3. **No hay estado "no contratado".** `SectionStatus` solo admite `ACTIVE | LOCKED_INTEGRATION | MAINTENANCE` (`config.ts:19`). Marcar un módulo no vendido como `MAINTENANCE` le muestra al cliente *"Sección en mantenimiento — Te avisamos cuando esté lista"* (`SectionGuard.tsx:66-69`): copy equivocado y **cero upsell**. Falta un estado `NOT_CONTRACTED` con mensaje comercial.

4. **Los dos registros de secciones no coinciden.** `sections/config.ts` usa `chat`, `finanzas`, `competitors`, `analytics`, `campaigns_meta`, `campaigns_google`, `influencers`; `permissions.ts` usa `aurum`, `pulso`, `competencia`, `campaigns`, y no tiene `analytics` ni `influencers`. Además `permissions.ts` tiene `estado`, `costos`, `escenarios`, `fiscal`, `sinapsis`, `boveda`, `memory` que no existen en el otro. Empaquetar contra un único concepto de "módulo" exige reconciliarlos primero.

5. **Los módulos del pricing no mapean 1:1 a secciones.** `PRECIOS.md` vende "Finanzas (P&L tri-currency)" como un módulo; en el RBAC son **5 secciones separadas** (`pulso`, `estado`, `costos`, `escenarios`, `fiscal`). "Rentabilidad / Comercial" mezcla `rentabilidad` + `products`. Falta una capa de **paquete → conjunto de secciones**.

### Lo que sí está listo

- El gate del middleware es sólido y de un solo punto (`isPathAllowed`, `section-access.ts:135`).
- El landing inteligente ya resuelve "a dónde entra un cliente que solo compró un módulo" (`landingPathForAllowedSections`, `:186-195`).
- El empty state `LOCKED_INTEGRATION` es la plantilla visual correcta para reusar en `NOT_CONTRACTED` (`SectionGuard.tsx`, elogiado en `review-diseno.md:695`).
- Hay precedente en producción: TeVeCompras solo-pixel.

**Veredicto:** el mecanismo existe como base, pero hoy es una herramienta de *permisos internos del cliente*, no de *entitlements comerciales*. Vender à la carte hoy es operativamente frágil y se cae con el primer usuario OWNER.

---

## 8. Las 5 cosas que más ensancharían el rango de clientes atendibles

### 1. Piso de volumen en el motor de anomalías *(desbloquea todo el segmento chico)*
Agregar un mínimo absoluto —del tipo `previous.orders >= 20 && previous.revenue >= X`— antes de que `detectRuleBasedAnomalies` (`src/lib/anomaly/detector.ts:60-190`) emita nada, y neutralizar `pctChange` cuando `previous === 0` (`:54`). Complemento: umbrales relativos al volumen del cliente, no fijos, para que a escala Arredo un −20% también dispare. **Sin esto no se puede vender Alertas a nadie por debajo de ~1.000 órdenes/mes, y hoy se les entrega igual porque `alertas` no tiene `requires`.**

### 2. Estado `NOT_CONTRACTED` + entitlements a nivel organización *(desbloquea el empaquetado)*
Tres cambios acoplados: (a) agregar `NOT_CONTRACTED` a `SectionStatus` (`sections/config.ts:19`) con copy comercial en `SectionGuard.tsx`; (b) mover la entitlement de usuario a org — un `Organization.settings.contractedModules` que intersecte con los permisos del usuario, de modo que **ni siquiera OWNER** vea un módulo no vendido; (c) reconciliar los dos registros de secciones en uno solo, con una capa `paquete → secciones` que refleje los packs de `PRECIOS.md`. Sin (b), OWNER anula cualquier empaquetado.

### 3. Bandera de truncado propagada a la UI en los tres módulos predictivos *(desbloquea el segmento grande)*
El patrón correcto ya está escrito en `metrics/conversion/route.ts:108-113,350` (warn + `meta.productUniverseTruncated`). Falta (a) aplicarlo a `behavioral-ltv` (`:125`), `churn-risk` (`:141`) y `metrics/ltv` (`:637`), (b) **consumirlo en la UI** — hoy `productUniverseTruncated` no lo lee ningún componente — y (c) reemplazar los `LIMIT` fijos por paginación real o cursor donde el módulo sea de base completa. *Truncado silencioso en un producto de analytics es el defecto más caro: el cliente decide sobre una muestra creyendo que es la población.*

### 4. Cuota y contabilidad de costo en Aurum *(protege el margen en ambos extremos)*
Agregar `costUsd` a `aurum_usage_logs` (`prisma/schema.prisma:683-703`) calculado con el pricing del modelo, un tope mensual por org configurable en `Organization.settings`, y gatear `DEEP` por plan en lugar de dejarlo abierto en la UI (`chat/page.tsx:736`). Subir o eliminar el `take: 10000` de `admin/usage/route.ts:41`. Sin esto, cada cliente chico es un riesgo de margen negativo y la dimensión "uso de IA" de `PRECIOS.md` es infacturable.

### 5. Gatear los módulos que asumen un perfil, y decir la verdad sobre el motor de LTV
(a) Agregar `requires` a las secciones que hoy se entregan vacías: `aura`/`influencers` (requieren creadores cargados), `finanzas`/`rentabilidad` (requieren cobertura de costos > umbral), `competitors`, y registrar `/seo` en `SECTIONS` con `requires: ["GOOGLE_SEARCH_CONSOLE"]` — la integración ya está declarada en `config.ts:25` y no la usa ninguna sección. Añadir `requires` al `/campaigns` padre. (b) Propagar el aviso de `cogsCoverage` de `/finanzas/estado:250` a `/finanzas/pulso` y al dashboard, o directamente **no mostrar margen cuando la cobertura es 0** en vez de mostrar 100%. (c) Alinear el copy de `bondly/ltv/page.tsx:587` y `components/bondly/primitives.tsx:285` con el motor que realmente corre (cohortes, no BG/NBD + Gamma-Gamma) — o implementar el modelo prometido. En cliente chico el gap se nota; en un due diligence de cliente grande, también.

---

## Anexo — Qué NO se verificó

- No se corrieron queries contra la DB: los volúmenes de Arredo (252k órdenes, 1,2M visitantes) se tomaron del enunciado, no se midieron.
- No se levantó la app: todos los recorridos de UI son inferidos del código, no observados.
- `bondly/clientes/route.ts:509,576` (`LIMIT 5000`): no se determinó si son listados expuestos o agregaciones internas.
- No se auditó `src/lib/alerts/engine.ts` ni `alert-hub.ts` en detalle (reglas configurables por usuario, distintas del motor de anomalías).
- La clave hardcodeada `"usage-2026"` en `admin/usage/route.ts:31` se anota como hallazgo incidental, fuera del alcance de este review.
