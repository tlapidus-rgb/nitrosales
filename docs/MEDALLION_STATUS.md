# Medallion — Estado y cómo retomar

> Última actualización: 2026-07-15. Plan maestro: `PLAN_ARQUITECTURA_MODULAR_MONOLITO.md`.
> Este doc = dónde estamos + el runbook del próximo paso. Para retomar, leer esto primero.

## ✅ En PROD hoy (todo en `main`, verificado y mergeado)

### Pipeline de datos Medallion (vivo)
```
orders (Bronze)  ──cron 0,30──>  silver_orders  ──cron 15,45──>  gold_daily_revenue
   (VTEX/MELI/pixel)              (flags valid/web           (rollup diario pack-aware
                                   pre-computados)            org×día×source)
                                                                     │
                                    metrics/orders  <────────────────┘
                                    (2 gráficos diarios leen Gold)
```
- **`silver_orders`**: copia conformada de `orders` con flags `is_valid`/`is_web` pre-computados. Backfilleada (632k). Cron `refresh-silver-orders` cada 30 min (`0,30 * * * *`).
- **`gold_daily_revenue`**: rollup diario **pack-aware** (org×día×source: orders/revenue/items). Backfilleado. Cron `refresh-gold-daily-revenue` cada 30 min (`15,45 * * * *`, 15 min después de Silver).
- **`metrics/orders`**: el gráfico de ventas diarias **y** el breakdown por-source leen `gold_daily_revenue` → sub-segundo. Detrás del flag **`ORDERS_USE_GOLD=true`** (ya seteado en Vercel), con fallback a Bronze si el flag está off / hay filtro de source / Gold falla.
- **Lag del dashboard**: ≤30 min (los crons). Los gráficos de Gold y el header (Bronze) pueden diferir en "hoy" hasta que el header también pase a Gold (ver cascadeo abajo) — ahí lagean juntos = consistentes.

### Drift-proof (la clave)
Los flags de Silver (`is_valid`/`is_web`) y del rollup Gold se generan **desde el contrato** (`src/domains/orders/index.ts`: `ordersValidSql`/`ordersWebSql`/`orderStatusNotConcretedList`), nunca a mano. Si el contrato cambia, Silver y Gold cambian con él. Imposible el drift "12 vs 16".

### Guards que protegen el build de Vercel
- `scripts/check-order-contract.mjs` — "orden válida" definida en un solo lugar.
- `scripts/check-serve-gold-first.mjs` — Serve no escanea `pixel_events` crudo.
- `depcruise` (`no-circular`=error) — 0 ciclos.
Todos corren en `npm run build`. Un PR que los viole rompe el build antes de prod.

### Paridad verificada
3 orgs reales (EMDJ, Arredo=`cmohl80fx` la de $1.3B, TVC): `orders_diff=0` y `revenue_diff=0` cuando Silver está fresco. Discrepancias `-1` vistas = org de PRUEBA (`cmmmga1uq`) + freshness lag (venta reciente sin propagar), NO bugs.

## Branches
| Branch | Estado |
|---|---|
| `main` | Todo lo de arriba, en prod |
| `feat/ingest-queue` | Cola de ingesta QStash (I1a/b: pixel+ml). **Sin mergear.** VTEX pendiente de OK del fundador (archivo CORE PROTEGIDO) |
| `refactor/microservices` | Docs de planeamiento (local, sin pushear) |

## ⏳ PRÓXIMO PASO — Cascadeo del HEADER de KPIs (el grande que falta)

**Objetivo:** que el header de `metrics/orders` (revenue/órdenes/envío/descuentos/comisión ML) también lea Gold → `metrics/orders` 100% en Gold, header+gráficos consistentes.

**Por qué es un cascadeo:** el header necesita `shipping / discounts / marketplaceFee` (+ `orders_with_fee`), que hoy NO viajan por Silver ni Gold. Hay que agregarlas a las dos capas.

### Runbook (ejecutar en orden)
1. **Silver — agregar columnas** (Neon): `ALTER TABLE silver_orders ADD COLUMN shipping_cost numeric(12,2), ADD COLUMN discount_value numeric(12,2), ADD COLUMN marketplace_fee numeric(12,2);` (nullables → instantáneo).
2. **Silver — actualizar transform**: en `src/data/silver/silver-orders-transform.ts` agregar esas 3 cols al SELECT/INSERT/ON CONFLICT (mapean directo de `orders`: `shippingCost`, `discountValue`, `marketplaceFee`).
3. **Silver — re-backfill** (Neon): re-correr el UPSERT de Silver (idempotente) para llenar las cols nuevas en las filas existentes.
4. **Gold — agregar columnas** (Neon): `ALTER TABLE gold_daily_revenue ADD COLUMN shipping numeric(14,2) DEFAULT 0, ADD COLUMN discounts numeric(14,2) DEFAULT 0, ADD COLUMN marketplace_fee numeric(14,2) DEFAULT 0, ADD COLUMN orders_with_fee int DEFAULT 0;`.
5. **Gold — actualizar transform**: en `gold-daily-revenue-transform.ts` sumar `SUM(shipping_cost)`, `SUM(discount_value)`, `SUM(marketplace_fee)`, y `COUNT(DISTINCT pack_key) FILTER (WHERE marketplace_fee > 0)` como `orders_with_fee`.
6. **Gold — re-backfill** (Neon).
7. **Migrar el header** (query 1 de `metrics/orders`, `currentPeriod`): leer de `gold_daily_revenue` (sumar sobre el rango) cuando `ORDERS_USE_GOLD` + sin filtro de source; fallback a Bronze. Mismo patrón que el gráfico diario ya migrado.
8. **Paridad del header** (Gold vs la query 1 exacta) → esperar diffs=0 en las 3 reales.
9. Merge + (el flag ya está on).

**Ojo:** query 1 de `metrics/orders` calcula `avgTicket` en JS como `revenue/orders` (no `AVG`, por los packs MELI) — mantener eso. Ver comentarios `BP-I5` en el archivo.

## Otros pendientes (post-header)
- Migrar el resto de `metrics/orders` a Gold (top products, customers, cohorts, device, channel, traffic, logistics) — cada uno necesita su propio dataset Gold.
- Ingesta durable: mergear `feat/ingest-queue` (necesita cuenta QStash + `QSTASH_TOKEN`/`INGEST_DRAIN_URL` en Vercel) + OK del fundador para la línea de VTEX.
- Fase 3: reorg físico a `src/modules/{extract,transform,serve,product,shared}` (los `domains/` actuales se folden ahí).
- Dominio `finanzas` (disperso, necesita investigación).
