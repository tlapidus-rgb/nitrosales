# Medallion — Estado y cómo retomar

> Última actualización: 2026-07-17 (retomada post-hotfixes; tandas 2-4 mergeadas y verificadas).
> Plan maestro: `PLAN_ARQUITECTURA_MODULAR_MONOLITO.md`.
> **Para retomar: leer esto primero.** Es el estado completo + qué sigue.
>
> ## ▶️ ESTADO: ACTIVO — retomar en "PRÓXIMA SESIÓN" (abajo)
> Los hotfixes de Tomy (7/7) se mergearon el 16-jul. La estructura se retomó la misma
> noche: **tandas 2, 3 y 4 de metrics/orders → Gold están EN PROD con paridad 0**.

## 🐢 Diagnóstico de velocidad (actualizado 2026-07-17)
1. ~~topProducts / profitability / cohorts / payment en Bronze~~ → **MIGRADAS (tandas 2-4)**.
2. **Rollups pixel_daily_\*: FRESCOS y sanos** (verificado en Neon 17-jul 02:08 UTC: las 4
   tablas con ultimo_dia=hoy en las 3 orgs con pixel). La hipótesis "cron trabado → rollups
   stale" (logs del 12-jul) quedó **DESCARTADA** — el fix `61108e4` recuperó todo.
3. El índice `pixel_events_orgId_ts_idx (organizationId, timestamp)` **SÍ existe en prod**
   (creado a mano, NO está en schema.prisma — ojo al hacer db pull). Los 5 scans crudos de
   metrics/pixel (floor, health, recent events, count cacheado) están soportados por índice.
4. ⏳ **PENDIENTE EL DATO QUE DEFINE EL ATAQUE de #11**: el usuario debe traer el Network
   tab (F12) de /pixel, /pixel/analytics y /orders (org pesada = Arredo): tiempos de
   /api/metrics/pixel, /discrepancy, /conversion, /funnel y /metrics/orders. El timeout de
   60s del 12-jul puede ya no existir. **Medir antes de migrar más.**

## ✅ EN PROD HOY (todo en `main`, verificado y mergeado)

### Pipeline Medallion (vivo, refresca cada 30 min)
```
orders (Bronze) ──cron 0,30──> silver_orders ──cron 15,45──> gold_daily_revenue ──┐
  (VTEX/MELI/pixel)             (conformado + flags)          (rollup diario        │
                                                               pack-aware)          ├─> metrics/orders
                                              └──> gold_order_segments ─────────────┘   (leen Gold)
                                                   (channel/delivery/carrier)
```

### Tablas
- **`silver_orders`**: copia conformada de `orders`. Columnas: los campos de orders + flags pre-computados `is_valid`/`is_web`/`is_marketplace` + `shipping_cost/discount_value/marketplace_fee/real_shipping_cost/delivery_type/shipping_carrier`. Cron `refresh-silver-orders` (`0,30 * * * *`).
- **`gold_daily_revenue`**: rollup diario pack-aware (org×día×source): orders/revenue/items + shipping/discounts/marketplace_fee/orders_with_fee. Cron `refresh-gold-daily-revenue` (`15,45 * * * *`).
- **`gold_order_segments`**: rollup de segmentaciones (org×día×dimension×bucket): orders/revenue/shipping_charged/shipping_real. Dimensiones: `channel`, `delivery`, `carrier`. Mismo cron que gold_daily_revenue (upsert independiente).

### `metrics/orders` — qué lee de Gold (flag `ORDERS_USE_GOLD=true` en Vercel; fallback a Bronze si off / hay filtro de source / Gold falla)
| Componente | Fuente |
|---|---|
| Header de KPIs (revenue/órdenes/items/envío/descuentos/comisión ML) | ✅ Gold |
| Gráfico diario (total + por source) | ✅ Gold |
| Segmentación channel / delivery / carrier | ✅ Gold |
| Top products (tanda 2: `gold_product_sales` org×día×source×producto) | ✅ Gold |
| Profitability (tanda 2: +6 medidas item_* en `gold_daily_revenue`) | ✅ Gold |
| Cohorts new/returning (tanda 3: dim `silver_customer_firsts`, sin LATERAL) | ✅ Silver-dim |
| Pago (tanda 4: dim `payment` + SOURCE en el grain de `gold_order_segments`) | ✅ Gold |
| Device, traffic (enriquecen de pixel — otro pipeline), top customers, recentOrders, dayOfWeek/hour, status | ⏳ Bronze |

**Tandas 2-4 (2026-07-16/17, paridad 0 verificada en Neon en cada una):**
- Runbooks corridos: `RUNBOOK-GOLD-TANDA2.md`, `RUNBOOK-SILVER-CUSTOMER-FIRSTS.md`, `RUNBOOK-SEGMENTS-TANDA4.md` (el SQL de backfill se GENERA de los builders con tsx — no editar a mano).
- Tanda 4 cambió el GRAIN de gold_order_segments a (org, day, SOURCE, dimension, bucket) — TRUNCATE+re-PK+backfill en una transacción; invariante verificado: revenue idéntico entre las 4 dims por org.
- silver_orders ganó `payment_method`; el cron de Silver también upsertea `silver_customer_firsts` (LEAST(), resiliente).
- payment tiene DOBLE fallback (error O vacío → Bronze).

Lag ≤30 min; header y gráficos leen Gold → lagean juntos = consistentes.

### Drift-proof (LA CLAVE)
Los flags de Silver y los rollups Gold se generan **desde el contrato** (`src/domains/orders/index.ts`: `ordersValidSql`/`ordersWebSql`/`orderStatusNotConcretedList`), nunca a mano. Si el contrato cambia, Silver+Gold cambian con él.

### Guards en el build de Vercel
`scripts/check-order-contract.mjs` (contrato en un solo lugar) · `scripts/check-serve-gold-first.mjs` (Serve no escanea pixel_events crudo) · `depcruise` `no-circular`=error (0 ciclos). Rompen el build ante violaciones.

## Branches
| Branch | Estado |
|---|---|
| `main` | Todo lo de arriba, en prod |
| `feat/ingest-queue` | Cola de ingesta QStash (pixel+ml). **Sin mergear.** VTEX espera OK del fundador (archivo CORE PROTEGIDO) |
| `refactor/microservices` | Docs de planeamiento (local) |

## ⚠️ LECCIONES (para no repetir)
1. **Re-backfill de tabla ya poblada = `ON CONFLICT DO UPDATE SET` de TODAS las columnas**, no solo las nuevas. Si no, quedan filas con datos de dos momentos → paridad da diffs raros. (Pasó con el header; el código de los transforms hace refresh completo, el error fue el SQL manual.)
2. **La paridad es la red de seguridad.** Siempre correr paridad Gold-vs-Bronze ANTES de mergear (el flag `ORDERS_USE_GOLD` ya está on → mergear activa al instante).
3. **Freshness lag es normal:** las orgs reales dan `diff=0` cuando Silver está fresco; Arredo (`cmohl80fx`, la más movida) suele dar ±1-2 por ventas que entran entre el re-backfill y la paridad. La org de PRUEBA es `cmmmga1uq` (data manual, se ignora). Reales: EMDJ, Arredo=`cmohl80fx`, TVC.
4. **`avgTicket` se calcula en JS** (`revenue/orders`, no `AVG`, por packs MELI). Ver `BP-I5`.

## 🥇 TANDA 5 EN CURSO — gold_attribution_source (metrics/pixel)
Branch `feat/medallion-pixel-attribution` (4 commits, pusheable). El dolor #1 real
medido: `/api/metrics/pixel` = 14-25s en Arredo (Network tab). Causa (EXPLAIN):
4 queries que desanidan `pa.touchpoints` (JSONB) por request (#9 by-source, #20
day×source, #22 channel roles, #29 model×channel), cada una ~3s, seq-scan de
pixel_attributions. (El fix del índice `pa.createdAt` NO alcanzó — el planner
seq-scanea igual; branch `perf/pixel-attribution-index` DESCARTADO.)

**Diseño (post /plan-eng-review, verificado en Neon):** grano `(org, día, source)`
— touchpoints y attributedValue son model-independientes (25120/25121). Guarda
COMPONENTES SIN PONDERAR (last_click/first_click/linear + los 6 de NITRO +
touch-role counts) → los pesos NITRO configurables se aplican AL LEER
(`lib/pixel/attribution-weights.ts`), cambiar pesos no invalida historia.

**HECHO + EN PROD (backfill corrido, PARIDAD CONFIRMADA):** tabla creada +
backfilleada en Neon; paridad Gold-vs-Bronze en VENTANA CONGELADA (60-30d) = 0
filas (los diffs del rango reciente eran 100% freshness). Cron
`refresh-gold-attribution` (:20/:50, off-switch ATTRIBUTION_ROLLUP_ENABLED) ya lo
mantiene fresco. Núcleo + tests (171) + helper compartido `touchpoint-source-sql.ts`.

**FALTA (retomar acá — es lo único que queda de #11):** migrar el SERVE — las 4
queries JSONB de `metrics/pixel/route.ts` a leer gold_attribution_source detrás de
flag NUEVO `PIXEL_USE_GOLD` con fallback Bronze. Diseño: UNA lectura del rollup +
reconstruir los 4 shapes en JS (reconstructSourceRevenue). Consumidores a preservar
EXACTO: attributionBySourceResult (1150 filter, 1156 map, 1238 channelRoas, 1470
loop), channelRolesResult (1170 merge), attributionByModelChannelResult (1572),
y el daily-by-source (#20). Money-path → hacerlo fresco, no apurado. Runbook ya
corrido, cron ya activo: solo falta el commit del serve + medir preview (25s→~5s).

## 🔜 lo que sigue de metrics/orders (menor prioridad, el grueso ya está)

**Estado del task list:** #8 topProducts+profitability ✅, #9 cohorts ✅, #10 payment ✅.
**#11 (rutas pixel) EN CURSO — bloqueado por dato del usuario:**

1. **PRIMERO: pedir el Network tab** (F12, org Arredo): ms de `/api/metrics/pixel`,
   `/discrepancy`, `/conversion`, `/funnel` y `/api/metrics/orders`. Los rollups están
   frescos y el índice (org,timestamp) existe → NO asumir dónde duele, medir.
2. Según el dato: los sospechosos restantes de `metrics/pixel` son las queries sobre
   `pixel_attributions`/orders (journeys, revenue por canal/día, comparación de modelos),
   NO pixel_events crudo. El funnel tiene 2 scans crudos solo en su fallback híbrido.
3. `metrics/conversion` ya NO toca pixel_events (migrada en los hotfixes, quedó en 2
   queries + rollup meta) — se puede SACAR del allowlist de `check-serve-gold-first`
   (ratchet down) cuando se toque ese archivo.
4. Hallazgo suelto: la org `cmod9fmy...` NO tiene eventos de pixel (ausente de todos los
   rollups). Si es TeVe Compras, revisar instalación del NitroPixel con Tomy.

**Lo que queda de `metrics/orders` (menor prioridad, el grueso ya está):**
- **Device / traffic** (`segByDevice`/`segByTraffic`): enriquecen desde `pixel_attributions`/`pixel_visitors` (device de `pv.deviceTypes[1]`, traffic del touchpoint). NO son order-level puro → llevar device/traffic ENRIQUECIDO a Silver (join a pixel en el transform) o dataset propio. Otro pipeline.
- **Top customers** (`topCustomers`): grain de CLIENTE. Dataset propio (o dim como customer_firsts).
- recentOrders / dayOfWeek / hour / status breakdown: livianas, evaluar si hace falta.

## Otros pendientes (no-Medallion)
- Mergear `feat/ingest-queue` (necesita cuenta QStash + `QSTASH_TOKEN`/`INGEST_DRAIN_URL` en Vercel) + **OK del fundador** para la línea de VTEX (archivo CORE PROTEGIDO).
- Fase 3: reorg físico a `src/modules/{extract,transform,serve,product,shared}` (los `domains/` actuales se folden ahí).
- Dominio `finanzas` (disperso, necesita investigación).
- `metrics/pixel` y las otras rutas del allowlist de `check-serve-gold-first` (funnel/pixel/conversion/sales-by-ad/products) aún escanean `pixel_events` crudo — los rollups `pixel_daily_*` YA existen; migrarlas a leerlos.
