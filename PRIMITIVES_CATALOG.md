# PRIMITIVES_CATALOG.md — Catálogo exhaustivo de primitivas de alertas

> **Propósito**: Este archivo es la **fuente de verdad única** sobre qué tipos de alertas puede generar NitroSales. Se usa para: (a) el engine de evaluación de reglas en `/alertas/reglas`, (b) el mapper natural-language → primitiva en Aurum, (c) la documentación comercial para prospectos, (d) referencia para todo Claude (producto + VM) sobre qué cubre la plataforma.
>
> **Fecha inicial**: 2026-04-19 (Sesión 49/50). Autor: Claude Opus 4.6.
>
> **Cómo leer este archivo**: cada sección representa un módulo de NitroSales. Dentro de cada sección hay 4 grupos de primitivas (Condicional, Reporte, Anomalía, Cross-section). Cada primitiva tiene un `key` único, descripción humana, parámetros, temporalidad soportada y ejemplos de cómo un usuario lo pediría a Aurum en lenguaje natural.
>
> **IMPORTANTE**: una primitiva existe en este catálogo solo si los **datos subyacentes están disponibles** en DB o vía APIs activas. Si agregás una primitiva acá, tiene que tener correspondencia con una tabla/endpoint real. Si un cliente pide algo que no está cubierto, va al **backlog de primitivas** (`alert_rule_requests`) para ampliación futura.

---

## 0. Arquitectura de las reglas

### Tipos de reglas

Toda regla del sistema se categoriza en uno de estos 3 tipos:

| Tipo | Trigger | Ejemplo | Output |
|---|---|---|---|
| **Condicional** | "SI pasa X, avisame" | "si runway < 3 meses" | Emite alerta SOLO cuando cumple (con cooldown) |
| **Reporte programado** | "CADA [freq] a las Y, mandame X" | "cada lunes 9am mandame el revenue de la semana" | Emite sí o sí según schedule, con datos del momento |
| **Anomalía automática** | "avisame cuando X se salga de lo normal" | "avisame cuando el CAC se dispare" | El engine detecta >2σ del promedio histórico |

### Operadores universales sobre primitivas numéricas

Toda primitiva que devuelve un número acepta estos operadores:

```
.below(X)         → valor < X
.above(X)         → valor > X
.between(X, Y)    → X ≤ valor ≤ Y
.equals(X)        → valor === X
.not_equals(X)    → valor !== X
.drops_by(P%)     → valor baja P% vs período de referencia
.rises_by(P%)     → valor sube P% vs período de referencia
.changes_by(P%)   → |Δ%| > P (sube o baja)
.is_zero()        → valor === 0
.crosses_below(X) → pasó de >=X a <X (edge trigger, sin re-alert hasta volver a >=X)
.crosses_above(X) → pasó de <X a >=X
.trending_down(N) → N períodos consecutivos bajando
.trending_up(N)   → N períodos consecutivos subiendo
.anomaly(σ)       → fuera del rango [μ-σ·std, μ+σ·std] histórico (default σ=2)
.top_n(N)         → está entre los N más altos del conjunto
.bottom_n(N)      → está entre los N más bajos del conjunto
.rank_drops_by(P) → ranking baja P posiciones vs período anterior
```

### Ventanas temporales soportadas

Cuando la primitiva implica un período, se acepta cualquiera de estos:

```
now                 → instante actual (último dato)
today               → desde 00:00 hasta ahora
yesterday           → día anterior completo
last_24h            → últimas 24 horas rolling
last_7d / wtd       → últimos 7 días / semana hasta hoy
last_30d / mtd      → últimos 30 días / mes hasta hoy
last_90d / qtd      → últimos 90 días / trimestre hasta hoy
last_12m / ytd      → últimos 12 meses / año hasta hoy
prev_day / week / month / quarter / year
custom_range(from, to)
```

### Comparativos (benchmarks automáticos)

Cuando querés comparar vs algo, el engine soporta:

```
.vs_prev(period)     → vs mismo período inmediato anterior (ej: mes vs mes anterior)
.vs_yoy(period)      → vs mismo período hace 1 año (año contra año)
.vs_avg(period, n)   → vs promedio de los últimos N períodos (ej: "vs promedio últimos 6 meses")
.vs_budget()         → vs presupuesto / forecast / escenario activo
.vs_benchmark()      → vs benchmark del sector (requiere data externa)
```

### Frecuencia de reportes programados

```
daily_at(HH:MM, timezone)
weekly_on(weekday, HH:MM, timezone)    → weekday: mon|tue|wed|thu|fri|sat|sun
monthly_on(day, HH:MM, timezone)       → day: 1-31 | "last_day"
quarterly_on(...)
yearly_on(month, day, HH:MM, timezone)
custom_cron(expr)                      → escape hatch con cron expression
```

### Cooldown y anti-spam

Toda regla condicional tiene `cooldownMinutes` (default: 60). Mientras esté en cooldown, aunque el trigger siga cumpliéndose, no re-emite. Al salir del cooldown, si el trigger sigue válido, re-emite.

Para reglas con operador `.crosses_below` / `.crosses_above`, el cooldown se desactiva implícitamente (edge-triggered: solo dispara en el cruce).

### Canales de notificación

| Canal | Estado | Notas |
|---|---|---|
| **in_app** | ✅ Activo | Emite `UnifiedAlert` al hub → aparece en `/alertas` |
| **email** | ✅ Activo | Via Resend, dominio `nitrosales.ai` verificado |
| **whatsapp** | 🔜 Próximamente | Requiere integración Twilio o WA Business API |
| **push_browser** | 🔜 Próximamente | Web Push API, requiere permiso del user |
| **slack** | 🔜 Backlog | Webhook por org, útil para teams |
| **sms** | 🔜 Backlog | Solo para severity CRITICAL |

### Storage DB (definición de la tabla `alert_rules`)

```sql
CREATE TABLE alert_rules (
  id              TEXT PRIMARY KEY,
  organizationId  TEXT NOT NULL REFERENCES organizations(id),
  userId          TEXT NOT NULL REFERENCES users(id),
  name            TEXT NOT NULL,                  -- label humano
  type            TEXT NOT NULL,                  -- 'condition' | 'schedule' | 'anomaly'
  primitiveKey    TEXT NOT NULL,                  -- ej: 'finanzas.runway_below_months'
  params          JSONB NOT NULL,                 -- ej: { "months": 3 }
  operators       JSONB,                          -- ej: { "op": "below", "value": 3 }
  schedule        JSONB,                          -- para type='schedule': { freq, time, dayOfWeek, ... }
  channels        TEXT[] NOT NULL DEFAULT '{in_app}',
  cooldownMinutes INT NOT NULL DEFAULT 60,
  severity        TEXT NOT NULL DEFAULT 'warning',-- 'critical' | 'warning' | 'info'
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  lastFiredAt     TIMESTAMP,
  nextFireAt      TIMESTAMP,                      -- para schedule
  createdAt       TIMESTAMP NOT NULL DEFAULT NOW(),
  updatedAt       TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### Convención de naming de primitivas

```
{modulo}.{tipo}.{metrica}[.{variante}]

Ejemplos:
  finanzas.condition.runway_below_months
  finanzas.report.snapshot_daily
  ventas.condition.sku_count_in_period_above
  ml.anomaly.reputation_drop
```

---

## 1. Finanzas / Pulso (runway, burn, cash)

**Contexto**: Pulso es la vista de solvencia y flujo de caja proyectado. El founder entra todas las mañanas acá. Las alertas críticas viven en este módulo.

**Dimensiones medibles**:

| Dimensión | Tipo | Fuente |
|---|---|---|
| Cash disponible | monto ARS/USD | `cash_balance_overrides` + cash in banks |
| Burn rate 30d | monto/mes | computed: egresos - ingresos últimos 30d |
| Runway | meses | computed: cash / burn_rate |
| Net cash flow | monto | computed por mes |
| Forecast cash fin de mes | monto | escenario activo |
| Cuentas por cobrar | monto | orders pendientes cobro |
| Cuentas por pagar | monto | manual_costs + fiscal vencimientos |
| Concentración clientes | % | top 10 clientes / revenue total |

### 1.1 Primitivas condicionales (16)

| Key | Descripción | Parámetros | Ejemplo humano |
|---|---|---|---|
| `finanzas.runway.below_months` | Runway cae por debajo de X meses | `months: int` | "avisame si tengo menos de 3 meses de runway" |
| `finanzas.runway.crosses_below_months` | Runway CRUZA el umbral (solo al cruzar) | `months: int` | "avisame la primera vez que runway baje de 6 meses" |
| `finanzas.cash.below_amount` | Cash total < monto | `amount, currency` | "avisame si el cash baja de $5M" |
| `finanzas.cash.drops_pct_vs_prev` | Cash cae X% vs período anterior | `percent, period` | "si el cash baja más de 20% este mes vs el anterior" |
| `finanzas.burn_rate.above` | Burn rate mensual > monto | `amount, currency` | "si el burn pasa de $2M por mes" |
| `finanzas.burn_rate.rises_pct_vs_prev` | Burn rate sube X% | `percent, period` | "si el burn sube más de 30% en un mes" |
| `finanzas.burn_rate.trending_up` | Burn rate sube N meses consecutivos | `n: int` | "si llevo 3 meses con burn creciente" |
| `finanzas.net_flow.negative_for_months` | N meses consecutivos con flujo negativo | `n: int` | "si llevo 2 meses quemando plata" |
| `finanzas.net_flow.positive_for_first_time` | Primer mes con flujo positivo en > N meses | `n: int` | "avisame la primera vez que tenga mes positivo después de 6 meses rojos" |
| `finanzas.revenue.below_target` | Revenue del período < target del escenario | `period` | "si revenue de este mes queda bajo el target" |
| `finanzas.revenue.drops_pct_vs_yoy` | Revenue baja X% vs mismo período año anterior | `percent, period` | "si el revenue del mes baja más de 15% YoY" |
| `finanzas.revenue.rises_pct_vs_yoy` | Revenue sube X% YoY | `percent, period` | "si estamos creciendo más de 50% YoY" |
| `finanzas.revenue.below_amount` | Revenue período absoluto < monto | `amount, period` | "si el revenue del mes queda bajo $10M" |
| `finanzas.ar.above_amount` | Cuentas por cobrar > monto | `amount` | "si tengo más de $3M pendiente de cobro" |
| `finanzas.ap.above_amount` | Cuentas por pagar > monto | `amount` | "si debo pagar más de $2M el próximo mes" |
| `finanzas.client_concentration.above_pct` | Top N clientes > X% del revenue | `topN: int, percent` | "si 3 clientes representan más de 50% del revenue" |

### 1.2 Primitivas de reporte (8)

| Key | Descripción | Schedule típico | Output |
|---|---|---|---|
| `finanzas.report.snapshot_daily` | Snapshot diario: cash, burn, runway, revenue hoy | daily 9am | Card con 4 métricas + trend vs ayer |
| `finanzas.report.weekly_summary` | Resumen semanal con variaciones | weekly lunes 9am | P&L semanal + waterfall variaciones |
| `finanzas.report.monthly_closing` | Cierre de mes completo | monthly día 1 9am | Revenue, costos, margen, runway, YoY |
| `finanzas.report.cash_position_weekly` | Posición de cash + proyección 4 semanas | weekly lunes | Tabla de cash actual + forecast |
| `finanzas.report.burn_trend_monthly` | Trend de burn últimos 6 meses | monthly | Gráfico + delta % |
| `finanzas.report.runway_projection` | Proyección de runway por escenario | weekly | Base/Optimist/Conservative |
| `finanzas.report.revenue_vs_target_monthly` | % cumplimiento vs target mes | monthly | % + gap absoluto |
| `finanzas.report.cash_flow_statement_monthly` | Estado de flujo de efectivo completo | monthly | Operativo / Inversión / Financiación |

### 1.3 Primitivas de anomalía (4)

| Key | Descripción |
|---|---|
| `finanzas.anomaly.burn_rate_outlier` | Burn del mes fuera de 2σ del promedio últimos 12m |
| `finanzas.anomaly.revenue_outlier` | Revenue diario fuera de 2σ del promedio últimos 30d |
| `finanzas.anomaly.cash_drop` | Cash cae en un día más que el percentil 95 histórico |
| `finanzas.anomaly.unusual_expense` | Egreso del día > 3σ del promedio últimos 90d |

### 1.4 Combinaciones cross-section

- **Finanzas + Ventas**: "si revenue baja 20% Y orders sube 10%" = problema de AOV
- **Finanzas + Marketing**: "si burn sube 30% Y ROAS baja" = gasto ineficiente
- **Finanzas + Fiscal**: "si cash < $X Y hay obligación AFIP de $Y en próximos N días" = crisis de liquidez

### 1.5 Ejemplos Aurum → primitiva

| Pedido en lenguaje natural | Primitiva + params |
|---|---|
| "avisame si tengo menos de 2 meses de runway" | `finanzas.runway.below_months` { months: 2 } |
| "mandame todos los días a las 8am el cash y burn" | `finanzas.report.snapshot_daily` schedule daily_at(08:00) |
| "si el cash baja más del 15% en una semana" | `finanzas.cash.drops_pct_vs_prev` { percent: 15, period: "week" } |
| "cuando el burn esté raro" | `finanzas.anomaly.burn_rate_outlier` |
| "si llevamos 3 meses bajando revenue" | `finanzas.revenue.trending_down` (via operator sobre revenue) { n: 3 } |

**Total Finanzas/Pulso: 28 primitivas**

---

## 2. Finanzas / Estado (P&L)

**Contexto**: Estado es el P&L de la empresa con revenue, COGS, gastos, márgenes, bridge CAC/LTV. Lo mira el founder mensualmente y el contador al cierre.

**Dimensiones**: Revenue (bruto y neto), COGS, Gross Profit, Gross Margin %, Ad Spend, Contribution Margin, Operating Margin, EBITDA, CAC, LTV, Payback period, Contribution per order, per category, per brand, per channel.

### 2.1 Primitivas condicionales (22)

| Key | Descripción | Params |
|---|---|---|
| `finanzas.gross_margin.below_pct` | Gross margin % < umbral | `percent, period` |
| `finanzas.gross_margin.drops_pct_vs_prev` | GM% baja X puntos vs período anterior | `points, period` |
| `finanzas.contribution_margin.below_pct` | Contribution margin < umbral | `percent, period` |
| `finanzas.operating_margin.below_pct` | Operating margin < umbral | `percent, period` |
| `finanzas.ebitda.negative` | EBITDA negativo en el período | `period` |
| `finanzas.cogs.above_pct_of_revenue` | COGS > X% del revenue | `percent, period` |
| `finanzas.cogs.rises_pct_vs_prev` | COGS sube X% vs período anterior | `percent, period` |
| `finanzas.ad_spend.above_pct_of_revenue` | Ad spend > X% del revenue | `percent, period` |
| `finanzas.ad_spend.above_amount` | Ad spend total > monto | `amount, period` |
| `finanzas.discounts.above_pct_of_gmv` | Descuentos > X% del GMV | `percent, period` |
| `finanzas.cac.above_amount` | CAC > monto | `amount, period` |
| `finanzas.cac.rises_pct_vs_prev` | CAC sube X% vs período anterior | `percent, period` |
| `finanzas.ltv.below_amount` | LTV < monto | `amount, period` |
| `finanzas.cac_ltv_ratio.above` | CAC/LTV > umbral (ej: >0.4 = problema) | `ratio, period` |
| `finanzas.ltv_cac_ratio.below` | LTV/CAC < umbral (ej: <3 = problema) | `ratio, period` |
| `finanzas.payback.above_months` | Payback period > X meses | `months, period` |
| `finanzas.category_margin.below_pct` | Margen de categoría específica bajo % | `categoryName, percent, period` |
| `finanzas.brand_margin.below_pct` | Margen de marca específica bajo % | `brandName, percent, period` |
| `finanzas.channel_revenue.drops_pct` | Revenue de canal específico baja | `channel, percent, period` |
| `finanzas.discount_abuse.above_pct_orders` | > X% de orders con descuento | `percent, period` |
| `finanzas.refund_rate.above_pct` | % de refunds sobre orders > X | `percent, period` |
| `finanzas.category_revenue_concentration.above_pct` | Una categoría > X% del revenue | `percent, period` |

### 2.2 Primitivas de reporte (10)

| Key | Descripción | Schedule |
|---|---|---|
| `finanzas.report.pnl_monthly` | P&L completo del mes | monthly día 1 |
| `finanzas.report.pnl_weekly` | P&L semanal | weekly lunes |
| `finanzas.report.pnl_yoy` | P&L YoY con variaciones | monthly |
| `finanzas.report.margin_by_category` | Margen por categoría | weekly |
| `finanzas.report.margin_by_brand` | Margen por marca | weekly |
| `finanzas.report.top_products_by_margin` | Top N productos por margen absoluto | monthly |
| `finanzas.report.bottom_products_by_margin` | Bottom N productos por margen (candidatos a dropear) | monthly |
| `finanzas.report.cac_ltv_trend` | Evolución CAC/LTV últimos 6m | monthly |
| `finanzas.report.discount_impact` | Revenue y margen perdidos por descuentos | monthly |
| `finanzas.report.channel_performance` | Revenue + margen por canal (VTEX/MELI/directo) | monthly |

### 2.3 Primitivas de anomalía (5)

- `finanzas.anomaly.gross_margin_drop` — GM% fuera de 2σ histórico
- `finanzas.anomaly.cogs_spike` — COGS con cambio mayor a percentil 95
- `finanzas.anomaly.ad_spend_spike` — Ad spend outlier
- `finanzas.anomaly.cac_spike` — CAC se dispara vs histórico
- `finanzas.anomaly.revenue_category_shift` — Mix de revenue por categoría cambió significativamente

**Total Finanzas/Estado: 37 primitivas**

---

## 3. Finanzas / Costos

**Contexto**: Módulo de costos granular (fijos, variables, driver-based). El CFO/founder entra a planear y el engine calcula impacto.

**Dimensiones**: Costos por categoría (logística, team, platforms, fiscal, infraestructura), por rateType (FIXED_MONTHLY/PER_SHIPMENT/PERCENTAGE/DRIVER_BASED), por subcategoría, trend mensual, vs forecast.

### 3.1 Primitivas condicionales (14)

| Key | Descripción | Params |
|---|---|---|
| `costos.category.above_amount` | Categoría X > monto | `category, amount, period` |
| `costos.category.rises_pct_vs_prev` | Categoría X sube Y% vs período anterior | `category, percent, period` |
| `costos.subcategory.above_amount` | Subcategoría específica > monto | `subcategory, amount, period` |
| `costos.specific_cost.above_amount` | Costo individual (por nombre) > monto | `costName, amount` |
| `costos.specific_cost.rises_pct` | Costo individual sube X% | `costName, percent, period` |
| `costos.fixed_costs.above_amount` | Total costos fijos > monto | `amount, period` |
| `costos.variable_costs.above_pct_of_revenue` | Variables > X% del revenue | `percent, period` |
| `costos.logistica.above_amount` | Logística total > monto | `amount, period` |
| `costos.team.above_amount` | Equipo + social charges > monto | `amount, period` |
| `costos.platforms.above_amount` | Plataformas + SaaS > monto | `amount, period` |
| `costos.new_cost_added` | Nuevo costo creado en el período | `period` |
| `costos.cost_increase_above` | Cualquier costo existente aumentó X% | `percent` |
| `costos.infrastructure.drops` | Infra baja (oportunidad de optimización visible) | `percent` |
| `costos.driver_based.recalculated` | Un costo DRIVER_BASED cambió por recálculo de driver | — |

### 3.2 Primitivas de reporte (6)

- `costos.report.breakdown_monthly` — Breakdown completo mes
- `costos.report.fixed_vs_variable_trend` — Trend últimos 6m
- `costos.report.top_costs_ranking` — Top 10 costos del mes
- `costos.report.cost_per_order` — Costo total / orders del mes
- `costos.report.cost_category_variance` — Variación vs mes anterior por categoría
- `costos.report.driver_based_impact` — Qué costos cambiaron por recálculo de driver

### 3.3 Primitivas de anomalía (3)

- `costos.anomaly.category_spike` — Categoría con jump > 3σ histórico
- `costos.anomaly.new_expensive_cost` — Costo nuevo en top 5 apenas creado
- `costos.anomaly.missing_recurring_cost` — Costo que se repetía mensualmente desapareció

**Total Finanzas/Costos: 23 primitivas**

---

## 4. Finanzas / Escenarios

**Contexto**: Módulo de what-if con múltiples escenarios (Base/Optimist/Conservative/Custom) y drivers ajustables. Para la toma de decisiones estratégicas.

**Dimensiones**: Escenarios activos, drivers por escenario (traffic, conversion rate, AOV, ad spend, ROAS, COGS%, headcount, inflation), forecast a 12m, delta vs escenario base, probability of scenario becoming reality.

### 4.1 Primitivas condicionales (8)

| Key | Descripción | Params |
|---|---|---|
| `escenarios.current_trend.closer_to_conservative` | Trayectoria real más cerca del conservador que del base | — |
| `escenarios.current_trend.closer_to_optimist` | Trayectoria real más cerca del optimista | — |
| `escenarios.actual_vs_base.diverges_pct` | Real vs Base escenario divergió > X% | `percent, period` |
| `escenarios.driver_value.outside_range` | Un driver real quedó fuera del rango del escenario base | `driverName` |
| `escenarios.forecast_runway.below_months` | Runway del escenario activo < X meses | `months` |
| `escenarios.inflation_driver.above` | Driver de inflación supera X | `percent` |
| `escenarios.headcount_driver.above` | Driver headcount supera X personas | `count` |
| `escenarios.scenario_switched` | Escenario activo cambió (nueva "realidad hipotética") | — |

### 4.2 Primitivas de reporte (4)

- `escenarios.report.scenarios_comparison_weekly` — Comparación semanal de los 3 escenarios
- `escenarios.report.active_drivers_snapshot` — Dump de drivers actuales
- `escenarios.report.actual_vs_forecast` — Trayectoria real vs proyectada
- `escenarios.report.probability_ranking` — Cuál escenario está "ganando" en probabilidad

**Total Finanzas/Escenarios: 12 primitivas**

---

## 5. Finanzas / Fiscal (calendario AFIP + Monotributo)

**Contexto**: Vencimientos fiscales derivados del fiscalProfile + overrides. Monotributo con rule engine que detecta cerca de tope / exceso. Crítico para no tener sorpresas con AFIP.

**Dimensiones**: Obligaciones por categoría (MONOTRIBUTO/IVA/IIBB/GANANCIAS), dueDate, amount, frequency, revenue acumulado 12m, proyección 12m, categoría Monotributo actual.

### 5.1 Primitivas condicionales (16)

| Key | Descripción | Params |
|---|---|---|
| `fiscal.obligation.due_in_days` | Cualquier obligación vence en ≤ N días | `days: int` |
| `fiscal.obligation.due_today` | Hay obligaciones con vencimiento hoy | — |
| `fiscal.obligation.specific_due_in_days` | Obligación específica (IVA/Ganancias/etc) vence en ≤ N días | `category, days` |
| `fiscal.obligation.amount_above` | Monto de la próxima obligación > X | `amount` |
| `fiscal.obligation.total_upcoming_above` | Total a pagar próximos N días > X | `days, amount` |
| `fiscal.monotributo.near_limit_pct` | Revenue 12m > X% del tope de la categoría | `percent` |
| `fiscal.monotributo.exceeds_limit` | Proyección 12m supera el tope de la categoría | — |
| `fiscal.monotributo.should_recategorize_up` | Debería subir de categoría | — |
| `fiscal.monotributo.should_recategorize_down` | Revenue bajó suficiente para bajar de categoría (ahorro) | — |
| `fiscal.monotributo.close_to_responsable_inscripto` | Revenue cerca del tope máximo del Monotributo | `percent` |
| `fiscal.iva.due_in_days` | IVA mensual vence en ≤ N días | `days` |
| `fiscal.iibb.due_in_days` | IIBB provincial vence en ≤ N días | `days` |
| `fiscal.ganancias.due_in_days` | Ganancias (anticipo/DDJJ) vence en ≤ N días | `days` |
| `fiscal.saldo_tecnico.negative` | Tengo IVA a favor > X meses seguidos | `months, amount` |
| `fiscal.retention.above_pct_revenue` | Retenciones totales > X% del revenue | `percent, period` |
| `fiscal.override_active_expiring` | Override de obligación con endMonth próximo | `months` |

### 5.2 Primitivas de reporte (5)

- `fiscal.report.upcoming_obligations_weekly` — Tabla de próximos 30 días
- `fiscal.report.monthly_tax_summary` — Qué pagué este mes, qué debo
- `fiscal.report.monotributo_status_monthly` — Dónde estoy vs el tope
- `fiscal.report.retentions_summary_monthly` — Todas las retenciones sufridas
- `fiscal.report.fiscal_calendar_quarterly` — Calendario visible del trimestre

### 5.3 Primitivas de anomalía (3)

- `fiscal.anomaly.sudden_retention_jump` — Retención inusual recibida
- `fiscal.anomaly.missing_expected_obligation` — Obligación recurrente que no apareció
- `fiscal.anomaly.monotributo_jump` — Revenue del mes saltó categoría de golpe

**Total Finanzas/Fiscal: 24 primitivas**

---

## 6. Rentabilidad (profitabilidad por SKU / categoría / canal)

**Contexto**: Vista cruzada de rentabilidad a nivel SKU, categoría, brand, canal. Fundamental para decisiones de producto (qué dropear, qué scalear).

**Dimensiones**: Margin% per SKU, contribution $ per SKU, stock turnover, sell-through, dead stock flag, price elasticity (vs competitors), COGS history.

### 6.1 Primitivas condicionales (18)

| Key | Descripción | Params |
|---|---|---|
| `rent.sku.margin_below_pct` | Un SKU específico tiene margin < X% | `sku, percent, period` |
| `rent.sku.contribution_negative` | SKU con contribution $ < 0 | `sku, period` |
| `rent.sku.cost_above_price` | SKU con costPrice > price (dumping / error) | `sku` |
| `rent.sku.no_sales_in_period` | SKU sin ventas en período (dead stock) | `sku, days` |
| `rent.category.margin_below_pct` | Categoría con margin < X% | `category, percent, period` |
| `rent.brand.margin_below_pct` | Marca con margin < X% | `brand, percent, period` |
| `rent.channel.margin_below_pct` | Canal (VTEX/MELI) con margin < X% | `channel, percent, period` |
| `rent.top_selling_sku.margin_drops` | Un top-selling SKU baja el margen | `topN, percent, period` |
| `rent.sku.stock_turnover_below` | Rotación de stock < X veces al año | `sku, turnover` |
| `rent.sku.stock_turnover_above` | SKU con rotación muy alta (oportunidad stockear más) | `sku, turnover` |
| `rent.sku.overstock_months` | Stock > X meses de ventas | `sku, months` |
| `rent.sku.price_below_cost_plus_margin` | Precio no cubre cost + margen objetivo | `sku, targetMargin` |
| `rent.category.concentration_above_pct` | Una categoría > X% del profit | `percent` |
| `rent.category.losing_money` | Categoría con profit total < 0 en el período | `category, period` |
| `rent.sku.new_product_performance_low` | SKU lanzado < 90 días con venta < X | `salesThreshold, days` |
| `rent.sku.price_elastic_warning` | Subiste precio y ventas bajaron > Y% | `priceDelta, salesDelta` |
| `rent.abc_classification.item_demoted` | Un SKU pasó de A a B o C (menos ventas) | `sku` |
| `rent.abc_classification.item_promoted` | Un SKU pasó a clase A (mejor performance) | `sku` |

### 6.2 Primitivas de reporte (8)

- `rent.report.top_products_monthly` — Top 20 SKUs por contribution $
- `rent.report.bottom_products_monthly` — Bottom 20 SKUs (candidatos a dropear)
- `rent.report.dead_stock_weekly` — Lista de SKUs sin ventas en 90d con valor de inventario
- `rent.report.margin_by_category_weekly` — Tabla con margen por categoría + trend
- `rent.report.new_products_performance` — Performance de SKUs lanzados últimos 90d
- `rent.report.stock_turnover_monthly` — Rotación por SKU
- `rent.report.abc_classification_quarterly` — Clasificación ABC del catálogo
- `rent.report.channel_mix_weekly` — Mix VTEX/MELI/directo con margen por canal

### 6.3 Primitivas de anomalía (4)

- `rent.anomaly.sku_margin_crash` — Margen de SKU cae drásticamente (> 3σ)
- `rent.anomaly.category_mix_shift` — Mix de categoría cambió bruscamente
- `rent.anomaly.sudden_sellout` — SKU con > X ventas en 24h vs histórico
- `rent.anomaly.price_war_detected` — Competidor bajó precio y venta mía cayó

**Total Rentabilidad: 30 primitivas**

---

## 7. Orders (Pedidos)

**Contexto**: Módulo de operaciones diarias. El operador mira orders todos los días para detectar problemas de pago, envío, cancelaciones.

**Dimensiones**: Orders count, totalValue, status (PENDING/APPROVED/INVOICED/SHIPPED/DELIVERED/CANCELLED/RETURNED), paymentMethod, shippingCarrier, source (VTEX/MELI), deviceType, postalCode, AOV, cycle time.

### 7.1 Primitivas condicionales (20)

| Key | Descripción | Params |
|---|---|---|
| `orders.count.below_in_period` | Orders en período < X | `count, period` |
| `orders.count.above_in_period` | Orders en período > X (posible spike de demanda o fraude) | `count, period` |
| `orders.count.drops_pct_vs_prev` | Orders bajan X% vs período anterior | `percent, period` |
| `orders.count.drops_pct_vs_yoy` | Orders bajan X% YoY | `percent, period` |
| `orders.aov.drops_pct` | AOV baja X% vs período anterior | `percent, period` |
| `orders.aov.below_amount` | AOV del período < monto | `amount, period` |
| `orders.cancellation_rate.above_pct` | % cancelaciones > umbral | `percent, period` |
| `orders.return_rate.above_pct` | % devoluciones > umbral | `percent, period` |
| `orders.pending_payment.count_above` | # orders con pago pendiente > X | `count` |
| `orders.pending_shipment.count_above` | # orders pendientes de envío > X | `count` |
| `orders.failed_payment.count_above` | # pagos rechazados > X en período | `count, period` |
| `orders.cycle_time.above_hours` | Tiempo desde compra hasta envío > X horas | `hours` |
| `orders.cycle_time.rises_pct` | Cycle time sube X% | `percent, period` |
| `orders.specific_carrier.cancellation_rate_above` | Cancelaciones con un carrier específico altas | `carrier, percent` |
| `orders.payment_method.concentration_drops` | Diversidad de métodos de pago cae (ej: todo MP) | — |
| `orders.device_type.mix_changes` | Mix mobile/desktop cambió significativamente | `percent` |
| `orders.geographic.concentration_above_pct` | Una provincia/CP > X% de orders | `percent, period` |
| `orders.first_time_customer_ratio.changes` | % de nuevos customers cambió > X puntos | `points, period` |
| `orders.repeat_customer_ratio.drops` | % de repeat customers baja X% | `percent, period` |
| `orders.shipping_cost.above_pct_of_aov` | Shipping cost > X% del AOV | `percent, period` |

### 7.2 Primitivas de reporte (9)

- `orders.report.daily_digest` — Orders + revenue + AOV del día (snapshot)
- `orders.report.weekly_summary` — Agregado semanal con trends
- `orders.report.top_products_by_orders` — Top SKUs del período
- `orders.report.top_customers_by_revenue` — Top clientes del período
- `orders.report.cancellation_breakdown` — Por qué se cancelaron (por motivo/carrier/canal)
- `orders.report.shipping_performance` — Por carrier/service
- `orders.report.postal_code_heatmap` — Concentración geográfica
- `orders.report.payment_method_mix` — Mix de métodos de pago
- `orders.report.device_behavior` — Desktop vs mobile orders + AOV diferencial

### 7.3 Primitivas de anomalía (5)

- `orders.anomaly.sudden_drop` — Caída abrupta > 3σ vs promedio
- `orders.anomaly.sudden_spike` — Spike inusual (posible promo viral o fraude)
- `orders.anomaly.carrier_failure` — Carrier con failure rate fuera de norma
- `orders.anomaly.suspicious_pattern` — Patrón sospechoso (ej: mismo customer múltiples orders grandes)
- `orders.anomaly.aov_outlier` — AOV con cambio inusual

**Total Orders: 34 primitivas**

---

## 8. Products (Catálogo)

**Contexto**: Master catalog de productos con stock, precios, costos, atributos. Crítico para inventario, pricing, SEO.

**Dimensiones**: SKU count, active/inactive, stock levels, price ranges, missing data (sin cost, sin imagen, sin descripción), category tree, brand distribution, sell-through.

### 8.1 Primitivas condicionales (16)

| Key | Descripción | Params |
|---|---|---|
| `products.stock.below_sku` | Stock de SKU específico < X unidades | `sku, units` |
| `products.stock.zero_sku` | SKU específico en 0 unidades | `sku` |
| `products.stock.out_of_stock_count_above` | # SKUs sin stock > X | `count` |
| `products.stock.critical_count_above` | # SKUs bajo safety level > X | `safetyUnits, count` |
| `products.stock.category_below_units` | Total stock de categoría < X unidades | `category, units` |
| `products.stock.value_above_amount` | Valor de stock total > monto | `amount` |
| `products.stock.reorder_point_triggered` | SKU con reorder point triggered | `sku` |
| `products.catalog.new_sku_added` | Nuevo SKU creado | — |
| `products.catalog.sku_discontinued` | SKU desactivado | — |
| `products.catalog.missing_cost_count_above` | # SKUs sin costPrice > X | `count` |
| `products.catalog.missing_ean_count_above` | # SKUs sin EAN > X | `count` |
| `products.catalog.missing_image_count_above` | # SKUs sin imagen > X | `count` |
| `products.price.changed_sku` | Precio de SKU cambió | `sku` |
| `products.price.increase_above_pct` | Subida de precio > X% | `percent, sku` |
| `products.price.decrease_above_pct` | Bajada de precio > X% | `percent, sku` |
| `products.overstock.sku_above_months` | SKU con > X meses de stock según ventas | `sku, months` |

### 8.2 Primitivas de reporte (7)

- `products.report.low_stock_weekly` — Lista SKUs críticos con acción recomendada
- `products.report.out_of_stock_daily` — SKUs que se quebraron hoy
- `products.report.new_products_weekly` — SKUs creados la semana
- `products.report.dead_stock_monthly` — SKUs sin ventas en 90d + valor
- `products.report.category_summary` — # SKUs + stock + valor por categoría
- `products.report.missing_data_weekly` — SKUs con data incompleta
- `products.report.top_restock_candidates` — SKUs que más urgente reordenar

### 8.3 Primitivas de anomalía (3)

- `products.anomaly.stock_disappeared` — Stock bajó mucho en 24h sin orders que lo expliquen
- `products.anomaly.price_reset` — Precio de SKU vuelve a default sospechosamente
- `products.anomaly.sku_disabled_active_sales` — SKU se desactivó pero tenía ventas activas

**Total Products: 26 primitivas**

---

## 9. MercadoLibre / Listings

**Contexto**: Listings activos en ML, healthScore, precio, stock, categoría, listingType (gold/classic/premium), catálogo vs no catálogo.

### 9.1 Primitivas condicionales (14)

| Key | Descripción | Params |
|---|---|---|
| `ml.listings.active_count_drops` | # listings activos baja X% | `percent, period` |
| `ml.listings.specific_paused` | Listing específico pasó a paused | `mlItemId` |
| `ml.listings.specific_under_review` | Listing específico under_review (infracción) | `mlItemId` |
| `ml.listings.closed_count_above` | # listings cerrados en período > X | `count, period` |
| `ml.listings.health_score_below` | HealthScore promedio < X | `score` |
| `ml.listings.specific_health_score_below` | Listing específico healthScore < X | `mlItemId, score` |
| `ml.listings.price_changed` | Precio de listing cambió | `mlItemId` |
| `ml.listings.free_shipping_dropped` | Perdió free shipping | `mlItemId` |
| `ml.listings.fulfillment_changed` | Cambió modo fulfillment (full ↔ flex ↔ colecta) | `mlItemId` |
| `ml.listings.stock_zero` | Listing con availableQty = 0 | `mlItemId` |
| `ml.listings.low_visits_in_period` | Visitas < X en período | `visits, period, mlItemId` |
| `ml.listings.conversion_rate_drops` | Conversion rate de listing baja X% | `percent, period, mlItemId` |
| `ml.listings.catalog_wining_dropped` | Perdí la posición en catálogo ML | `mlItemId` |
| `ml.listings.category_performance_drop` | Performance por categoría baja | `category, percent, period` |

### 9.2 Primitivas de reporte (6)

- `ml.listings.report.top_performers_weekly` — Top 10 listings por ventas
- `ml.listings.report.unhealthy_listings` — Listings con score bajo
- `ml.listings.report.catalog_positioning` — Qué listings son catálogo + ganadores
- `ml.listings.report.price_history_monthly` — Trend de precios del mes
- `ml.listings.report.listing_types_mix` — Distribución gold/classic/premium
- `ml.listings.report.paused_listings_weekly` — Listings pausados con motivo

**Total ML/Listings: 20 primitivas**

---

## 10. MercadoLibre / Preguntas (Q&A)

**Contexto**: Preguntas abiertas de compradores. Fundamental responder rápido: afecta reputación + conversión.

### 10.1 Primitivas condicionales (8)

| Key | Descripción | Params |
|---|---|---|
| `ml.questions.unanswered_count_above` | # preguntas sin responder > X | `count` |
| `ml.questions.unanswered_over_hours` | # preguntas > X horas sin responder | `hours, count` |
| `ml.questions.response_time.above_hours` | Tiempo promedio de respuesta > X horas | `hours` |
| `ml.questions.response_time.rises_pct` | Response time sube X% | `percent, period` |
| `ml.questions.volume_spike` | Volumen de preguntas sube X% (posible problema masivo) | `percent, period` |
| `ml.questions.specific_listing_volume` | Un listing concentra > X preguntas (sintoma de descripción confusa) | `count, mlItemId, period` |
| `ml.questions.contains_keyword` | Pregunta con keyword específico (ej: "cancelar", "reembolso", "envío") | `keyword` |
| `ml.questions.closed_unanswered_count` | # preguntas cerradas sin respuesta (perdiste ventas) > X | `count, period` |

### 10.2 Primitivas de reporte (5)

- `ml.questions.report.pending_digest_daily` — Lista diaria de preguntas pendientes priorizadas
- `ml.questions.report.response_time_weekly` — Trend semanal
- `ml.questions.report.common_keywords` — Topics más preguntados
- `ml.questions.report.listings_with_most_questions` — Top listings por volumen
- `ml.questions.report.closed_unanswered_weekly` — Qué dejé sin responder

**Total ML/Preguntas: 13 primitivas**

---

## 11. MercadoLibre / Claims & Reputación

**Contexto**: Claims activos, ratings (positivos/neutros/negativos), reputation level (5_green/4_light_green/etc), métricas de seller que afectan tu visibilidad.

### 11.1 Primitivas condicionales (12)

| Key | Descripción | Params |
|---|---|---|
| `ml.reputation.level_dropped` | Reputation level bajó (ej: 5_green → 4_light_green) | — |
| `ml.reputation.below_level` | Reputation < nivel X | `level` |
| `ml.reputation.power_drops_pct` | Reputation power baja X% | `percent, period` |
| `ml.claims.active_count_above` | Claims activos > X | `count` |
| `ml.claims.specific_high_priority` | Claim con monto > X abierto | `amount` |
| `ml.claims.rate_above_pct` | Claims rate (% sobre orders) > X | `percent, period` |
| `ml.claims.rate_rises_pct` | Claims rate sube X% | `percent, period` |
| `ml.claims.specific_buyer_concentration` | Mismo buyer con > X claims | `count, days` |
| `ml.negative_ratings.count_above_in_period` | # ratings negativos > X en período | `count, period` |
| `ml.negative_ratings.rate_above_pct` | % negativos > umbral | `percent, period` |
| `ml.cancellation_rate.above_pct` | Cancellation rate > umbral | `percent, period` |
| `ml.delayed_handling_rate.above_pct` | Delayed handling > umbral | `percent, period` |

### 11.2 Primitivas de reporte (5)

- `ml.reputation.report.snapshot_weekly` — Estado de reputation + métricas clave
- `ml.claims.report.active_weekly` — Lista claims activos priorizados
- `ml.ratings.report.recent_negatives` — Últimos negativos con contexto
- `ml.metrics.report.seller_dashboard_daily` — Reputation + rates + sales
- `ml.metrics.report.trend_monthly` — Evolución mensual

**Total ML/Claims-Reputación: 17 primitivas**

---

## 12. MercadoLibre / Shipments

**Contexto**: Envíos ML con estados, carriers, fulfillment types, delays.

### 12.1 Primitivas condicionales (9)

| Key | Descripción | Params |
|---|---|---|
| `ml.shipments.delayed_count_above` | # envíos con delay > X | `count` |
| `ml.shipments.not_delivered_count_above` | # envíos con not_delivered > X | `count, period` |
| `ml.shipments.pending_ready_to_ship_above` | # envíos en ready_to_ship sin despachar > X | `count, hours` |
| `ml.shipments.avg_delivery_time_rises` | Tiempo promedio de entrega sube X% | `percent, period` |
| `ml.shipments.full_utilization_drops` | % envíos con Full (FBM) baja | `percent, period` |
| `ml.shipments.flex_cost_rises` | Costo de Flex sube X% | `percent, period` |
| `ml.shipments.specific_carrier_problem` | Carrier específico con > X not_delivered | `carrier, count, period` |
| `ml.shipments.specific_destination_problem` | Ciudad/provincia con issues concentrados | `location, period` |
| `ml.shipments.cost_per_shipment_rises` | Costo promedio de shipment sube X% | `percent, period` |

### 12.2 Primitivas de reporte (4)

- `ml.shipments.report.daily_status` — Snapshot estados hoy
- `ml.shipments.report.delayed_weekly` — Lista envíos demorados priorizados
- `ml.shipments.report.carrier_performance_monthly` — Comparativa carriers
- `ml.shipments.report.fulfillment_mix` — % Full / Flex / Colecta

**Total ML/Shipments: 13 primitivas**

---

## 13. MercadoLibre / Ads (Product Ads + Brand Ads)

**Contexto**: Campañas de ML Ads con ACOS, impressions, clicks, conversions, spend.

### 13.1 Primitivas condicionales (11)

| Key | Descripción | Params |
|---|---|---|
| `ml.ads.acos_above_pct` | ACOS (ad cost / sales) > X% | `percent, period, campaignId?` |
| `ml.ads.specific_campaign_acos_above` | Campaña específica con ACOS alto | `campaignId, percent` |
| `ml.ads.daily_spend_above` | Spend diario > X | `amount` |
| `ml.ads.spend_rises_pct` | Spend sube X% | `percent, period` |
| `ml.ads.roas_below` | ROAS < X | `roas, period` |
| `ml.ads.conversion_rate_drops` | CR de ads baja X% | `percent, period` |
| `ml.ads.cpc_above` | CPC promedio > X | `amount, period` |
| `ml.ads.impressions_drop_pct` | Impressions bajan X% | `percent, period` |
| `ml.ads.campaign_paused_auto` | ML pausó automáticamente una campaña | `campaignId` |
| `ml.ads.budget_exhausted` | Campaña agotó budget del día antes de X hora | `campaignId, hour` |
| `ml.ads.new_campaign_created` | Nueva campaña ML Ads creada | — |

### 13.2 Primitivas de reporte (5)

- `ml.ads.report.daily_performance` — ACOS, spend, conversions del día
- `ml.ads.report.weekly_summary` — Summary por campaña
- `ml.ads.report.top_performing_ads` — Top campañas por ROAS
- `ml.ads.report.budget_utilization` — % budget consumido por campaña
- `ml.ads.report.product_ads_ranking` — Ranking productos con ads activos

**Total ML/Ads: 16 primitivas**

---

## 14. Campañas / Meta Ads

**Contexto**: Campañas de Facebook/Instagram. ROAS, CPC, CPA, frecuencia, creative performance.

### 14.1 Primitivas condicionales (18)

| Key | Descripción | Params |
|---|---|---|
| `meta.roas.below` | ROAS < X | `roas, period, campaignId?` |
| `meta.roas.drops_pct` | ROAS baja X% | `percent, period` |
| `meta.cpc.above` | CPC > monto | `amount, period` |
| `meta.cpc.rises_pct` | CPC sube X% | `percent, period` |
| `meta.cpa.above` | CPA > monto | `amount, period` |
| `meta.ctr.below_pct` | CTR < X% | `percent, period` |
| `meta.frequency.above` | Frequency > X (creative fatigue) | `freq, period, adId?` |
| `meta.daily_spend.above` | Spend diario > X | `amount` |
| `meta.daily_spend.below_budget_pct` | Gasté < X% del budget diario (delivery issue) | `percent` |
| `meta.campaign_status_changed` | Campaña pasó a paused/removed | `campaignId` |
| `meta.ad_set_in_learning_phase_long` | Ad set > X días en learning phase | `days, adSetId` |
| `meta.creative.new_activated` | Nuevo creative activo | — |
| `meta.creative.performance_drop` | Creative con ROAS que baja X% | `percent, period, adId` |
| `meta.video_completion.below_pct` | Video P100 watched < X% | `percent, adId` |
| `meta.conversion_api.events_drop` | Eventos CAPI bajan X% (problema tracking) | `percent, period` |
| `meta.conversion_api.sync_failure` | Eventos no sincronizados > X | `count` |
| `meta.audience_saturation` | Reach no crece aunque sube spend | `period` |
| `meta.classification.needs_review` | Creative con classification manual pendiente | — |

### 14.2 Primitivas de reporte (7)

- `meta.report.daily_performance` — Spend, ROAS, conversions
- `meta.report.weekly_summary` — Agregado por campaña
- `meta.report.top_creatives` — Top creatives por ROAS
- `meta.report.fatiguing_creatives` — Creatives con frequency alta
- `meta.report.budget_utilization` — Budget vs actual por campaña
- `meta.report.audience_overlap` — Overlap entre audiences
- `meta.report.attribution_vs_capi` — Diferencia entre attribution y CAPI

**Total Meta Ads: 25 primitivas**

---

## 15. Campañas / Google Ads

**Contexto**: Search, Shopping, Performance Max, Display, YouTube.

### 15.1 Primitivas condicionales (17)

| Key | Descripción | Params |
|---|---|---|
| `google.roas.below` | ROAS < X | `roas, period, campaignId?` |
| `google.roas.drops_pct` | ROAS baja X% | `percent, period` |
| `google.cpc.above` | CPC > monto | `amount, period` |
| `google.cpa.above` | CPA > monto | `amount, period` |
| `google.impression_share.below_pct` | Impression share < X% (perdiendo terreno) | `percent, period` |
| `google.impression_share.lost_to_rank_above_pct` | Perdiendo IS por rank > X% | `percent` |
| `google.impression_share.lost_to_budget_above_pct` | Perdiendo IS por budget > X% | `percent` |
| `google.quality_score.drops` | QS promedio baja | `period` |
| `google.keyword.low_quality_score` | Keywords con QS < X | `score, count` |
| `google.conversion_rate.drops_pct` | CR baja X% | `percent, period` |
| `google.daily_spend.above` | Spend > X | `amount` |
| `google.campaign_status_changed` | Campaña paused/removed | `campaignId` |
| `google.shopping.disapproved_items_above` | Shopping con items rechazados > X | `count` |
| `google.shopping.feed_errors_above` | Feed con errores > X | `count` |
| `google.performance_max.asset_group_low_strength` | Asset group con strength "Low" | `assetGroupId` |
| `google.search_term.new_high_cost` | Search term nuevo con cost > X | `amount` |
| `google.negative_keyword_candidate` | Search term con 0 conv + spend > X | `amount` |

### 15.2 Primitivas de reporte (7)

- `google.report.daily_performance`
- `google.report.weekly_summary`
- `google.report.shopping_feed_health`
- `google.report.search_terms_weekly`
- `google.report.impression_share_trend`
- `google.report.performance_max_assets`
- `google.report.quality_score_breakdown`

**Total Google Ads: 24 primitivas**

---

## 16. Campañas / Cross-platform (Meta + Google + ML Ads)

**Contexto**: Métricas consolidadas cruzando plataformas.

### 16.1 Primitivas condicionales (8)

| Key | Descripción | Params |
|---|---|---|
| `ads.total_spend.above` | Spend consolidado > X | `amount, period` |
| `ads.blended_roas.below` | ROAS blended (todas las plataformas) < X | `roas, period` |
| `ads.blended_cac.above` | CAC blended > X | `amount, period` |
| `ads.platform_concentration.above_pct` | Una plataforma > X% del spend | `percent` |
| `ads.platform_roas_divergence` | Diferencia de ROAS entre plataformas > X puntos | `points` |
| `ads.spend_vs_revenue_ratio.above_pct` | Spend / Revenue > X% | `percent, period` |
| `ads.new_platform_activated` | Se activó una nueva plataforma (TikTok, etc) | — |
| `ads.all_platforms_roas_drops` | ROAS cae en todas las plataformas simultáneamente | `percent, period` |

### 16.2 Primitivas de reporte (5)

- `ads.report.blended_daily` — Spend/ROAS/CAC consolidado
- `ads.report.platform_comparison` — Tabla comparativa
- `ads.report.allocation_weekly` — % budget por plataforma
- `ads.report.attribution_cross_platform` — Multi-touch cross-platform
- `ads.report.incrementality_monthly` — Test de incrementalidad

**Total Cross-platform: 13 primitivas**

---

## 17. Aura / Creators

**Contexto**: Creator economy. Influencers, campaigns (Always On + time-limited), deals, attributions, payouts, content.

### 17.1 Primitivas condicionales (14)

| Key | Descripción | Params |
|---|---|---|
| `aura.creators.total_count_below` | # creadores activos < X | `count` |
| `aura.creators.new_pending_applications_above` | # aplicaciones pendientes > X | `count` |
| `aura.creators.inactive_for_days` | Creador sin actividad > X días | `days, creatorId?` |
| `aura.creators.top_performer_drops` | Top creador baja performance > X% | `percent, period, topN` |
| `aura.creators.new_approved` | Creador aprobado | — |
| `aura.creators.paused` | Creador pasó a PAUSED | `creatorId` |
| `aura.creators.revenue_attributed_below` | Revenue atribuido total < X | `amount, period` |
| `aura.creators.specific_revenue_above` | Creador específico genera > X | `creatorId, amount, period` |
| `aura.creators.commission_accrued_above` | Comisiones acumuladas > X (plan de payout) | `amount, period` |
| `aura.creators.revenue_concentration_above_pct` | Top 3 creadores > X% del revenue attributed | `percent, topN` |
| `aura.creators.ltv_cac_via_creators.below` | LTV/CAC de clientes venidos por creators < X | `ratio` |
| `aura.creators.repeat_customer_pct.below` | % customers from creators que repitieron < X | `percent` |
| `aura.creators.attribution_model_mismatch` | Diferencia grande entre modelos de attribution | `percent` |
| `aura.creators.deal_performance_vs_target.below_pct` | Deal < X% del target | `percent, dealId` |

### 17.2 Primitivas de reporte (8)

- `aura.creators.report.weekly_ranking` — Top creadores de la semana
- `aura.creators.report.monthly_payout_summary` — Qué pagar este mes
- `aura.creators.report.inactive_creators` — Creadores dormidos
- `aura.creators.report.campaign_performance` — Por campaign
- `aura.creators.report.deal_status_weekly` — Deals activos con %
- `aura.creators.report.attribution_trend` — Evolución attributions
- `aura.creators.report.new_creator_onboarding` — Pipeline de nuevos
- `aura.creators.report.seeding_status` — Productos enviados + estado

**Total Aura/Creators: 22 primitivas**

---

## 18. Aura / Deals & Payouts

**Contexto**: Compensaciones con multi-type (COMMISSION / FLAT_FEE / PERFORMANCE_BONUS / TIERED / CPM / GIFTING / HYBRID).

### 18.1 Primitivas condicionales (10)

| Key | Descripción | Params |
|---|---|---|
| `aura.payouts.pending_count_above` | # payouts pending > X | `count` |
| `aura.payouts.pending_amount_above` | Monto pending > X | `amount` |
| `aura.payouts.overdue_days_above` | Payout pending > X días sin pagar | `days` |
| `aura.payouts.monthly_total_above` | Total a pagar mes > X | `amount` |
| `aura.deals.active_count_above` | # deals activos > X | `count` |
| `aura.deals.expiring_in_days` | Deal termina en < X días | `days` |
| `aura.deals.auto_renewed` | Deal se renovó automáticamente | `dealId` |
| `aura.deals.tier_unlocked` | Creador desbloqueó nuevo tier de comisión | `creatorId, tierLabel` |
| `aura.deals.bonus_achieved` | Creador alcanzó bonus target | `creatorId, dealId` |
| `aura.deals.ended_unachieved` | Deal terminó sin alcanzar target | `creatorId, dealId` |

### 18.2 Primitivas de reporte (5)

- `aura.payouts.report.pending_weekly`
- `aura.payouts.report.monthly_forecast`
- `aura.deals.report.expiring_soon`
- `aura.deals.report.active_summary`
- `aura.deals.report.bonus_progress` — Trackea bonuses próximos a achievable

**Total Aura/Deals-Payouts: 15 primitivas**

---

## 19. Aura / Contenido (Briefings + Submissions + UGC)

**Contexto**: Briefings asignados, submissions pendientes, metrics del contenido publicado (views/likes/comments), UGC approvals.

### 19.1 Primitivas condicionales (10)

| Key | Descripción | Params |
|---|---|---|
| `aura.content.briefings_overdue_count` | # briefings con deadline pasada sin entrega > X | `count` |
| `aura.content.submissions_pending_review_above` | # pendientes review > X | `count` |
| `aura.content.review_time_above_days` | Tiempo promedio review > X días | `days` |
| `aura.content.approval_rate_below_pct` | % approved < X | `percent, period` |
| `aura.content.engagement_drops_pct` | Engagement promedio baja X% | `percent, period` |
| `aura.content.specific_post_viral` | Post específico > X views (amplificar) | `views, contentId` |
| `aura.content.ugc_candidates_pending` | # UGC posibles sin aprobar > X | `count` |
| `aura.content.platform_performance_diff` | Diferencia de performance IG vs TikTok > X% | `percent, period` |
| `aura.content.published_below_expected` | Contenido publicado < expected por briefing | — |
| `aura.content.seeding_no_content_yet` | Seeding entregado hace > X días sin contenido | `days` |

### 19.2 Primitivas de reporte (5)

- `aura.content.report.weekly_publications` — Qué se publicó
- `aura.content.report.top_posts` — Top 10 por engagement
- `aura.content.report.review_queue` — Pendientes review
- `aura.content.report.ugc_library` — UGC disponible para reuso
- `aura.content.report.briefing_status` — Qué está pendiente

**Total Aura/Contenido: 15 primitivas**

---

## 20. Bondly (LTV predictions + Churn + Retención)

**Contexto**: Customer-level intelligence: LTV predicho, churn risk, segmentación, retention.

### 20.1 Primitivas condicionales (12)

| Key | Descripción | Params |
|---|---|---|
| `bondly.churn_risk.high_value_at_risk_above` | # customers high-value con churn risk alto > X | `count` |
| `bondly.churn_risk.revenue_at_risk_above` | $ en revenue at risk > X | `amount` |
| `bondly.ltv.prediction_drops_cohort` | LTV predicho de cohort baja X% | `percent, cohort` |
| `bondly.ltv.high_value_segment_growth` | % customers high_value crece | `percent, period` |
| `bondly.retention.cohort_below_pct` | Retention de cohort < X% | `percent, cohortMonth, period` |
| `bondly.retention.first_90d_drops` | Retention primeros 90d baja | `percent, period` |
| `bondly.new_customer_acquired` | Nuevo customer con LTV > X | `amountLTV` |
| `bondly.churned_customer_high_value` | Customer high_value churneó | — |
| `bondly.repeat_purchase_rate.below_pct` | Repeat purchase rate < X% | `percent, period` |
| `bondly.time_between_purchases.rises` | Tiempo entre compras sube X% | `percent, period` |
| `bondly.segment_transition.high_to_low` | Customer pasó de high a low value | `customerId` |
| `bondly.acquisition_channel_ltv_below` | Canal con LTV predicho muy bajo | `channel, amount` |

### 20.2 Primitivas de reporte (6)

- `bondly.report.high_risk_customers_weekly`
- `bondly.report.ltv_by_cohort_monthly`
- `bondly.report.retention_heatmap`
- `bondly.report.segment_distribution`
- `bondly.report.churn_drivers`
- `bondly.report.reactivation_candidates`

**Total Bondly: 18 primitivas**

---

## 21. Competencia / Precios

**Contexto**: Competitor price tracking con variación histórica, vs mi precio, match con mis SKUs.

### 21.1 Primitivas condicionales (11)

| Key | Descripción | Params |
|---|---|---|
| `comp.price.dropped_pct` | Competidor bajó precio > X% | `percent, competitorId?, productId?` |
| `comp.price.raised_pct` | Competidor subió precio > X% | `percent, competitorId?, productId?` |
| `comp.price.lower_than_mine_by_pct` | Competidor < mi precio en > X% | `percent, productId?` |
| `comp.price.higher_than_mine_by_pct` | Competidor > mi precio en > X% (oportunidad) | `percent, productId?` |
| `comp.price.all_competitors_lower` | Todos mis competidores tienen precio menor | `productId` |
| `comp.price.new_competitor_detected` | Nuevo competidor aparece en producto | `productId` |
| `comp.price.scraping_error` | Scraping falla > X veces consecutivas | `count, competitorId` |
| `comp.price.out_of_stock_competitor` | Competidor sin stock (oportunidad subir precio) | `competitorId, productId` |
| `comp.price.average_market_drops_pct` | Precio promedio del mercado baja X% | `percent, period, category?` |
| `comp.price.my_position_drops` | Mi ranking por precio en categoría baja | `position, category` |
| `comp.price.large_discount_detected` | Competidor lanzó descuento > X% | `percent, competitorId` |

### 21.2 Primitivas de reporte (5)

- `comp.price.report.daily_changes` — Cambios detectados hoy
- `comp.price.report.my_position_weekly` — Mi posición vs competidores por categoría
- `comp.price.report.price_history_sku` — Historial de precio por SKU (mío y competidores)
- `comp.price.report.opportunities_weekly` — SKUs donde puedo subir precio
- `comp.price.report.threats_weekly` — SKUs donde me están pisando

**Total Competencia/Precios: 16 primitivas**

---

## 22. Competencia / Ads (Ad Library Meta + Google)

**Contexto**: Ads que corren los competidores (Meta Ad Library + Google).

### 22.1 Primitivas condicionales (8)

| Key | Descripción | Params |
|---|---|---|
| `comp.ads.new_ad_launched` | Competidor lanza ad nuevo | `competitorId?` |
| `comp.ads.active_count_above` | # ads activos competidor > X | `count, competitorId` |
| `comp.ads.new_format_detected` | Nuevo formato (video/carousel/etc) que antes no usaba | `competitorId, format` |
| `comp.ads.promotion_detected` | Ad con mención de descuento/promoción | `competitorId` |
| `comp.ads.holiday_campaign_active` | Campaña estacional activa (Hot Sale, etc) | `competitorId` |
| `comp.ads.ad_duration_long` | Ad corre > X días (es winner) | `days, competitorId` |
| `comp.ads.impressions_range_high` | Ad con impressions range alto | `range, competitorId` |
| `comp.ads.all_competitors_launched_ads_same_day` | Todos lanzaron ads hoy (evento del mercado) | — |

### 22.2 Primitivas de reporte (4)

- `comp.ads.report.daily_new_ads`
- `comp.ads.report.weekly_library_changes`
- `comp.ads.report.format_distribution`
- `comp.ads.report.top_ads_per_competitor`

**Total Competencia/Ads: 12 primitivas**

---

## 23. SEO (Keywords + Rankings + Visibility)

**Contexto**: Google Search Console data. Keywords, rankings, impressions, clicks, CTR por keyword/page/device/country.

### 23.1 Primitivas condicionales (14)

| Key | Descripción | Params |
|---|---|---|
| `seo.ranking.position_drops_for_keyword` | Keyword cae > X posiciones | `keyword, positions, period` |
| `seo.ranking.lost_top_10` | Keyword salió del top 10 | `keyword` |
| `seo.ranking.entered_top_10` | Keyword entró al top 10 (oportunidad) | `keyword` |
| `seo.ranking.new_keyword_ranking` | Keyword nueva apareció | `keyword` |
| `seo.impressions.drops_pct` | Impressions totales bajan X% | `percent, period` |
| `seo.clicks.drops_pct` | Clicks totales bajan X% | `percent, period` |
| `seo.ctr.keyword_below_pct` | CTR de keyword < X% | `keyword, percent, period` |
| `seo.ctr.average_drops` | CTR promedio baja | `percent, period` |
| `seo.landing_page.impressions_drop` | Landing page específica pierde impressions | `url, percent` |
| `seo.landing_page.rankings_drop` | Landing page pierde rankings promedio | `url, positions` |
| `seo.device.mobile_performance_drops` | Performance mobile baja más que desktop | `percent, period` |
| `seo.country.new_country_traffic` | Tráfico aparece desde nuevo país | `country, impressions` |
| `seo.query.new_high_volume` | Keyword nueva con > X impressions | `impressions, period` |
| `seo.position.average_drops` | Posición promedio baja X posiciones | `positions, period` |

### 23.2 Primitivas de reporte (6)

- `seo.report.weekly_performance` — Summary
- `seo.report.top_keywords_monthly` — Top keywords por clicks + impressions
- `seo.report.ranking_changes_weekly` — Qué cambió
- `seo.report.opportunities_monthly` — Keywords con alta impression, bajo CTR
- `seo.report.landing_pages_performance` — Top pages por tráfico
- `seo.report.new_keywords_monthly` — Keywords nuevas rankeando

**Total SEO: 20 primitivas**

---

## 24. NitroPixel / Tracking & Attribution

**Contexto**: First-party pixel con tracking de eventos, identificación cross-device, attribution multi-touch, CAPI sync.

### 24.1 Primitivas condicionales (14)

| Key | Descripción | Params |
|---|---|---|
| `pixel.events.volume_drops_pct` | Volumen de eventos baja X% (tracking roto?) | `percent, period` |
| `pixel.events.volume_zero_for_hours` | 0 eventos recibidos en últimas X horas | `hours` |
| `pixel.visitors.identified_ratio_drops` | % de visitantes identificados baja | `percent, period` |
| `pixel.capi.events_not_synced_above` | # eventos CAPI sin sincronizar > X | `count` |
| `pixel.capi.sync_error_rate_above_pct` | Error rate de CAPI > X% | `percent, period` |
| `pixel.capi.latency_above_ms` | Latency promedio > X ms | `ms, period` |
| `pixel.attribution.assisted_value_above_pct` | % assisted > X (muchos touchpoints) | `percent, period` |
| `pixel.attribution.avg_touchpoints_rises` | Customer journey se alarga | `percent, period` |
| `pixel.attribution.conversion_lag_rises` | Tiempo entre first click y conversión sube | `percent, period` |
| `pixel.visitor_merge.rate_drops` | Rate de merge cross-device baja | `percent, period` |
| `pixel.device.desktop_conversion_drops` | Desktop convierte menos que antes | `percent, period` |
| `pixel.utm.unknown_source_spike` | Jump en traffic sin UTM (lost attribution) | `percent, period` |
| `pixel.referrer.new_high_volume_source` | Nuevo referrer con > X visitantes | `visitors, period` |
| `pixel.bot_traffic.above_pct` | % de traffic identificado como bot > X | `percent, period` |

### 24.2 Primitivas de reporte (5)

- `pixel.report.data_quality_daily` — Eventos recibidos, identified, CAPI
- `pixel.report.attribution_by_model` — Diferencia entre modelos
- `pixel.report.journey_insights` — Journeys más comunes
- `pixel.report.conversion_funnel` — Funnel visitor → purchase
- `pixel.report.capi_health` — Estado de CAPI sync

**Total NitroPixel: 19 primitivas**

---

## 25. NitroPixel / Journeys

**Contexto**: Visualización de journeys individuales (3+touch) y aggregated patterns.

### 25.1 Primitivas condicionales (6)

| Key | Descripción | Params |
|---|---|---|
| `pixel.journeys.pattern_detected` | Journey pattern específico superó threshold | `pattern, count` |
| `pixel.journeys.avg_length_rises` | Longitud promedio de journey sube | `percent, period` |
| `pixel.journeys.first_touch_source_shift` | Cambia el source principal de first-touch | `percent` |
| `pixel.journeys.paid_to_organic_flow.drops` | Flow paid → organic (brand search post-ad) baja | `percent, period` |
| `pixel.journeys.direct_traffic_conversion_drop` | Direct traffic convierte menos | `percent, period` |
| `pixel.journeys.email_journey_revenue_attribution` | Revenue atribuido a email en journeys | `amount, period` |

### 25.2 Primitivas de reporte (3)

- `pixel.journeys.report.top_patterns_weekly`
- `pixel.journeys.report.first_touch_distribution`
- `pixel.journeys.report.conversion_by_journey_length`

**Total Pixel/Journeys: 9 primitivas**

---

## 26. Chat Aurum (Usage del asistente + Async alerts)

**Contexto**: Logs de uso de Aurum (modes FLASH/CORE/DEEP), latency, tokens, errors. Plus: async task completions (ej: "avisame cuando Aurum termine esta query larga").

### 26.1 Primitivas condicionales (10)

| Key | Descripción | Params |
|---|---|---|
| `aurum.usage.invocations_above_daily` | # invocaciones hoy > X | `count` |
| `aurum.usage.tokens_spent_above_period` | Tokens gastados período > X | `tokens, period` |
| `aurum.usage.cost_above_period` | Costo estimado período > X | `amount, period` |
| `aurum.latency.above_ms_avg` | Latency promedio > X ms | `ms, mode?` |
| `aurum.error_rate.above_pct` | Error rate > X% | `percent, period` |
| `aurum.deep_mode.usage_spike` | Spike en DEEP mode (caro) | `percent, period` |
| `aurum.async.query_completed` | Una query async terminó (user pidió aviso) | `queryId` |
| `aurum.async.query_failed` | Query async falló | `queryId` |
| `aurum.async.long_running_still_pending` | Query async > X min sin terminar | `minutes` |
| `aurum.insights.generated_count_above` | # insights generados período > X | `count, period` |

### 26.2 Primitivas de reporte (5)

- `aurum.usage.report.daily_summary` — Invocaciones + tokens + latency
- `aurum.usage.report.weekly_cost` — Costo LLM estimado
- `aurum.usage.report.popular_tools` — Tools más usados
- `aurum.usage.report.insights_weekly` — Insights generados
- `aurum.usage.report.user_engagement` — Cómo usa Aurum el team

**Total Aurum: 15 primitivas**

---

## 27. Sistema / Integraciones

**Contexto**: Estado de conexiones con plataformas externas (VTEX, MELI, Meta, Google, GA4, GSC, TikTok). Crítico: si un sync cae, los datos de todo el resto se desactualizan.

### 27.1 Primitivas condicionales (14)

| Key | Descripción | Params |
|---|---|---|
| `system.connection.status_error` | Cualquier integración en ERROR | `platform?` |
| `system.connection.specific_platform_down` | Integración específica down | `platform` |
| `system.connection.sync_stale_above_hours` | lastSuccessfulSyncAt > X horas atrás | `hours, platform?` |
| `system.connection.multiple_down_above` | > X integraciones down simultáneas | `count` |
| `system.connection.token_expiring_in_days` | Token expira en < X días | `days, platform?` |
| `system.connection.token_expired` | Token ya expirado | `platform` |
| `system.connection.new_integration_activated` | Nueva integración conectada | — |
| `system.connection.integration_disconnected` | Una integración se desconectó | `platform` |
| `system.webhooks.failure_count_above` | # webhooks fallidos > X | `count, platform` |
| `system.webhooks.not_received_for_hours` | No llega ningún webhook hace X horas | `hours, platform` |
| `system.api.rate_limit_hit` | Platform X devolvió 429 | `platform, period` |
| `system.api.quota_near_limit_pct` | Cuota de API > X% usada | `percent, platform` |
| `system.sync.duration_above_minutes` | Sync dura > X min (lento) | `minutes, platform` |
| `system.sync.data_volume_drop` | Data sincronizada cae X% (alguna fuente muerta?) | `percent, period, platform?` |

### 27.2 Primitivas de reporte (5)

- `system.connection.report.daily_health` — Estado + freshness de todas las conexiones
- `system.connection.report.weekly_sync_logs` — Qué se sincronizó bien/mal
- `system.connection.report.token_expiration_upcoming` — Tokens por vencer
- `system.connection.report.webhook_health` — Webhooks por plataforma
- `system.connection.report.api_usage_monthly` — Cuota utilizada por API

### 27.3 Primitivas de anomalía (3)

- `system.anomaly.all_platforms_degraded` — Problema cross-platform simultáneo
- `system.anomaly.sync_stuck` — Sync arrancó hace > X min sin completar
- `system.anomaly.data_volume_outlier` — Volumen sincronizado fuera de 2σ

**Total Sistema: 22 primitivas**

---

## 28. Settings / Team & Security

**Contexto**: Gestión del equipo, invitaciones, login events, API keys, permisos.

### 28.1 Primitivas condicionales (14)

| Key | Descripción | Params |
|---|---|---|
| `security.login.failed_attempts_above` | > X intentos fallidos en período | `count, period` |
| `security.login.unusual_location` | Login desde ubicación nueva | `userId` |
| `security.login.unusual_hour` | Login en horario inusual para el user | `userId` |
| `security.login.concurrent_sessions` | User con múltiples sesiones activas | `userId` |
| `security.api_keys.expiring_in_days` | API key expira en < X días | `days` |
| `security.api_keys.unused_for_days` | API key sin uso > X días | `days` |
| `security.api_keys.new_created` | Nueva API key creada | — |
| `security.api_keys.revoked` | API key revocada | `keyId` |
| `security.team.new_member_joined` | Miembro aceptó invitación | — |
| `security.team.invitation_pending_above_days` | Invitación pending > X días | `days` |
| `security.team.invitation_expired` | Invitación expiró sin aceptar | — |
| `security.team.role_changed` | Rol de miembro cambió | `userId` |
| `security.team.member_removed` | Miembro removido | `userId` |
| `security.team.inactive_member_above_days` | Miembro sin login > X días | `days, userId` |

### 28.2 Primitivas de reporte (6)

- `security.report.login_activity_weekly` — Resumen de logins del equipo
- `security.report.failed_logins_daily` — Intentos fallidos del día
- `security.report.api_keys_usage_monthly` — Uso de API keys
- `security.report.team_activity_weekly` — Actividad por miembro
- `security.report.permissions_audit_monthly` — Quién tiene acceso a qué
- `security.report.pending_invitations_weekly` — Invitaciones abiertas

**Total Settings/Security: 20 primitivas**

---

## 29. Custom / Aurum-defined (escape hatch)

**Contexto**: Si ningún match exacto, Aurum puede generar primitiva custom basada en query parametrizada. Guardada en `alert_rule_requests` si necesita revisión humana; ejecutada directamente si Aurum tiene confianza alta.

### 29.1 Primitivas custom (4)

| Key | Descripción | Notas |
|---|---|---|
| `custom.sql_query` | Query SQL parametrizada por Aurum, ejecutada periódicamente | Solo SELECT, whitelist de tablas, sin JOINS peligrosos |
| `custom.metric_compare` | Comparar dos métricas de cualquier módulo | Aurum decide qué comparar |
| `custom.composite_condition` | Combinación AND/OR de primitivas existentes | Aurum arma el árbol lógico |
| `custom.request_backlog` | Pedido imposible de mapear → va a backlog | Tomy / Claude lo revisan después y agregan primitiva nueva |

**Total Custom: 4 primitivas**

---

# Resumen y totales

| Sección | # Primitivas |
|---|---|
| 1. Finanzas / Pulso | 28 |
| 2. Finanzas / Estado (P&L) | 37 |
| 3. Finanzas / Costos | 23 |
| 4. Finanzas / Escenarios | 12 |
| 5. Finanzas / Fiscal | 24 |
| 6. Rentabilidad | 30 |
| 7. Orders | 34 |
| 8. Products | 26 |
| 9. ML / Listings | 20 |
| 10. ML / Preguntas | 13 |
| 11. ML / Claims-Reputación | 17 |
| 12. ML / Shipments | 13 |
| 13. ML / Ads | 16 |
| 14. Meta Ads | 25 |
| 15. Google Ads | 24 |
| 16. Cross-platform Ads | 13 |
| 17. Aura / Creators | 22 |
| 18. Aura / Deals-Payouts | 15 |
| 19. Aura / Contenido | 15 |
| 20. Bondly | 18 |
| 21. Competencia / Precios | 16 |
| 22. Competencia / Ads | 12 |
| 23. SEO | 20 |
| 24. NitroPixel / Tracking | 19 |
| 25. NitroPixel / Journeys | 9 |
| 26. Chat Aurum | 15 |
| 27. Sistema / Integraciones | 22 |
| 28. Settings / Security | 20 |
| 29. Custom (escape hatch) | 4 |
| **TOTAL** | **602** |

---

# Implementación por tiers de prioridad

## Tier 1 — MVP (primeras 60 primitivas, ~10% de coverage pero cubre 60% de uso)

Arranco implementando estas 60 en Fase 8g-1 (siguiente sesión). Son las más pedidas en ecommerce LATAM:

- Finanzas/Pulso: runway, cash, burn, revenue (8)
- Fiscal: vencimientos AFIP + Monotributo (6)
- Orders: count, AOV, cancelaciones, pendientes (8)
- Products: stock crítico + zero (4)
- ML: preguntas sin responder, reputation, claims (6)
- Meta Ads: ROAS, CPA, spend (4)
- Google Ads: ROAS, impression share (3)
- Aura: payouts pending (3)
- Competencia: price drops (3)
- Sistema: sync errors (4)
- Security: login failures, token expiring (3)
- Reportes básicos (daily snapshot, weekly summary por módulo) (8)

## Tier 2 — Expansion (próximas 150 primitivas)

Post-MVP, según feedback de los primeros usuarios reales (Arredo + TV Compras). Incluye reportes avanzados, anomalías por módulo, cross-section básicos.

## Tier 3 — Advanced (el resto, ~390)

Primitivas nicho, edge cases, cross-section complejos, custom SQL. Se implementan on-demand según lo que pidan clientes en `alert_rule_requests`.

---

# Decisiones arquitectónicas pendientes

Estas quedan para discutir con Tomy antes de codear Fase 8g-1:

1. **Frequency del evaluation engine**: ¿cada cuánto corre el cron que evalúa las rules? Opciones: cada 5min / 15min / 30min / 1h. Recomendación: 15min para Tier 1, con escalado a 5min cuando sean críticas.

2. **Bulk ejecution de schedule primitives**: si hay 500 rules con schedule daily_at(09:00), el cron tiene que evaluarlas todas. ¿Queue con concurrency limit? ¿Batches?

3. **Cooldown granularity**: actualmente por rule. ¿Permitir cooldown por rule Y per-trigger-value? Ej: si runway < 3 meses dispara, después cooldown. Si después runway < 2 meses (empeoró), ¿re-dispara?

4. **Email batching**: si 10 reglas condicionales se cumplen para el mismo user, ¿mandar 10 emails o 1 digest? Default: digest con cooldown de 15min.

5. **Timezone por user**: schedules están en timezone del user (default org timezone). ¿Manejar DST automático o dejar en UTC?

6. **Primitivas con cost alto de evaluación** (SQL pesado): ¿cachear el último resultado? ¿TTL?

---

# Próximos pasos

1. **Revisar este catálogo con Tomy** (esta sesión).
2. **Ajustar/completar** si falta algo crítico.
3. **Fase 8g-1** (próxima sesión): migración + engine + primer batch de 60 primitivas Tier 1 + API CRUD.
4. **Fase 8g-2**: integración Aurum (tool `create_alert_rule`) + mapping NL → primitiva.
5. **Fase 8g-3**: UI `/alertas/reglas` (lista + editor) + channels email + quick rule button por página.
6. **Fase 8g-4+**: expansión a Tier 2 + Tier 3 on-demand.

---

**Versión**: 1.0 (Sesión 49, 2026-04-19)
**Próxima revisión**: al terminar Fase 8g-1, validar que las primitivas del Tier 1 están bien implementadas antes de expandir.
