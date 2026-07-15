# Medallion — Estado y cómo retomar

> Última actualización: 2026-07-15 (sesión larga). Plan maestro: `PLAN_ARQUITECTURA_MODULAR_MONOLITO.md`.
> **Para retomar: leer esto primero.** Es el estado completo + qué sigue.

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
| Pago, device, traffic, top products, customers, cohorts | ⏳ Bronze |

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

## 🔜 PRÓXIMA SESIÓN — lo que falta migrar de `metrics/orders`

**Patrón general (el que ya usamos 5 veces):** enriquecer Silver si hace falta → agregar dim/medida a Gold → transform drift-proof → migrar la query detrás de `useGold` con fallback Bronze → runbook DB (ALTER + re-backfill COMPLETO + paridad) → merge.

- **Pago** (`topPaymentMethods`): NO es incremental — necesita agregar la dimensión **`source`** a `gold_order_segments` (el chart agrupa por payment_method×source para traducir el label en JS). Eso cambia la PK/grain de la tabla → hay que re-backfillear channel/delivery/carrier también. Es el más grande de los que quedan.
- **Device / traffic** (`segByDevice`/`segByTraffic`): enriquecen desde `pixel_attributions`/`pixel_visitors` (device de `pv.deviceTypes[1]`, traffic del touchpoint). NO son order-level puro → hay que llevar el device/traffic ENRIQUECIDO a Silver (join a pixel en el transform de Silver, o un paso de enriquecimiento). Otro pipeline.
- **Top products** (`topProducts`): grain de PRODUCTO (JOIN order_items+products). Dataset Gold propio (ej. `gold_top_products` org×día×producto).
- **Top customers** (`topCustomers`): grain de CLIENTE. Dataset propio.
- **Cohorts** (`cohortsRaw`): new/returning/VIP con first-order-date (LATERAL a orders). Lógica propia.

## Otros pendientes (no-Medallion)
- Mergear `feat/ingest-queue` (necesita cuenta QStash + `QSTASH_TOKEN`/`INGEST_DRAIN_URL` en Vercel) + **OK del fundador** para la línea de VTEX (archivo CORE PROTEGIDO).
- Fase 3: reorg físico a `src/modules/{extract,transform,serve,product,shared}` (los `domains/` actuales se folden ahí).
- Dominio `finanzas` (disperso, necesita investigación).
- `metrics/pixel` y las otras rutas del allowlist de `check-serve-gold-first` (funnel/pixel/conversion/sales-by-ad/products) aún escanean `pixel_events` crudo — los rollups `pixel_daily_*` YA existen; migrarlas a leerlos.
