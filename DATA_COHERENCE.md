# DATA_COHERENCE.md — Contrato de Coherencia de Datos en NitroSales

> **Última actualización: 2026-05-04 — Sesión 60 EXT-2 BIS+++++++**
>
> Este documento define cómo NitroSales garantiza que **un mismo concepto
> de negocio dé el mismo número en todas las pantallas**. Es un contrato:
> cualquier endpoint o componente que muestre datos de órdenes, revenue
> o atribución DEBE seguir estas reglas.

---

## ¿Por qué existe este documento?

El 3 de mayo de 2026 Tomy reportó que en `/pixel/analytics` filtrado por
"Ayer" veía:
- KPI "Órdenes Atribuidas" = **12**
- Funnel "Compra" = **16**
- Tabla "Conversión por Canal" sumaba **16**
- Página `/pedidos` filtrada por VTEX = **14**

4 lugares, 3 números distintos para la misma realidad de negocio. Causa raíz:
cada query tenía sus propios filtros, copiados-pegados ad-hoc sin un contrato
central. **Esto es inaceptable para una plataforma de data**.

---

## El contrato

### Regla 1 — Una orden es "VÁLIDA" si y sólo si:

```
status NOT IN ('CANCELLED', 'PENDING', 'RETURNED')
AND totalValue > 0
```

> Estos son los 3 status del enum `OrderStatus` que indican "no concretada".
> Los status válidos (concretados) son: `APPROVED`, `INVOICED`, `SHIPPED`, `DELIVERED`.
> Si en el futuro se agrega un status nuevo al enum (ej: `ON_HOLD`, `FAILED`), hay
> que clasificarlo en `ORDER_STATUS_CONCRETED` o `ORDER_STATUS_NOT_CONCRETED` en
> `src/lib/metrics/orders.ts`.

**Justificación**:
- `CANCELLED` / `RETURNED` → no es venta concretada
- `PENDING` → cliente eligió Mercado Pago/Transferencia pero no pagó. NO es venta hasta que pague (pasa a `APPROVED`)
- `ON_HOLD` / `FAILED` → idem, venta no concretada
- `totalValue <= 0` → orden vacía o anomalía de sync

### Regla 2 — Una orden es "WEB" si y sólo si:

```
trafficSource IS DISTINCT FROM 'Marketplace'
AND source IS DISTINCT FROM 'MELI'
AND channel IS DISTINCT FROM 'marketplace'
AND externalId NOT LIKE 'FVG-%'
AND externalId NOT LIKE 'BPR-%'
```

**Justificación**: en algunos casos VTEX tiene órdenes que vienen de marketplaces
(channel='marketplace', FVG-/BPR- prefix). Esas no son tráfico web propio.

### Regla 3 — El campo de fecha canónico es `orderDate`

NUNCA usar `createdAt` para "órdenes en el rango". `createdAt` es cuándo se
sincronizó (puede tener lag de minutos a horas), `orderDate` es cuándo se hizo
la compra (verdad de negocio).

### Regla 4 — Single source of truth: `src/lib/metrics/orders.ts`

Todo endpoint o query que necesite contar/sumar órdenes DEBE importar los
helpers de este archivo:

```ts
import { ordersValidWhere, ordersWebWhere, ordersValidWebWhere } from "@/lib/metrics/orders";

// En query SQL cruda:
prisma.$queryRaw`
  SELECT COUNT(*) FROM orders o
  WHERE o."organizationId" = ${orgId}
    AND o."orderDate" >= ${from}
    AND o."orderDate" <= ${to}
    AND ${ordersValidWebWhere("o")}   -- ← canonico
`;
```

**Prohibido**: copiar-pegar filtros SQL ad-hoc en endpoints nuevos. Si necesitás
un filtro distinto, agregalo al helper con un nombre claro.

---

## Mapping de métricas canónicas

| Métrica | Definición | Helper a usar | Endpoints que la consumen |
|---|---|---|---|
| **Órdenes web** | Válidas + web | `ordersValidWebWhere("o")` | `/api/metrics/pixel`, `/api/metrics/pixel/funnel`, `/api/metrics/pixel` query #23 |
| **Órdenes totales (incluye marketplace)** | Sólo válidas | `ordersValidWhere("o")` | `/api/metrics/orders` (página `/pedidos`) |
| **Órdenes atribuidas** | Web + tiene `pixel_attribution` con modelo X | `ordersValidWebWhere("o")` + JOIN `pixel_attributions` | `/api/metrics/pixel` queries #8, #20, #29 |
| **Revenue web** | Sum de totalValue de órdenes web | `ordersValidWebWhere("o")` | Multiple queries del pixel |
| **Revenue atribuido** | Sum de attributedValue de pixel_attributions con order válida | Idem + JOIN | Multiple queries del pixel |

### ⚠️ Diferencia legítima: web vs total

`/pedidos` muestra órdenes **totales** (incluye marketplace VTEX); `/pixel/analytics`
muestra órdenes **web** (excluye marketplace). Si las dos páginas dan números distintos
para "VTEX" en el mismo rango, la diferencia es las órdenes VTEX que vienen de
marketplaces (channel='marketplace' o externalId con prefix FVG-/BPR-). Esto es
legítimo y se documenta con un tooltip en cada lugar.

---

## Reglas para el funnel

### Regla 5 — El step "Compra" del funnel es ÓRDENES, no eventos

**Antes** (bug): `COUNT(DISTINCT visitorId) WHERE type='PURCHASE'`. Daba 16
porque contaba 1 visitor que disparó el evento 2 veces + 3 visitors con events
huérfanos (orderId que no matchea ninguna orden en la DB).

**Ahora** (canónico): `COUNT(*)` de órdenes web válidas en el rango (con o sin
filtro de canal vía pixel_attributions).

### Regla 6 — Steps anteriores del funnel siguen siendo visitors únicos

`pageView`, `viewProduct`, `addToCart`, `checkoutStart` siguen siendo distinct
visitors con el evento. Esto es correcto: el funnel mide visitors hasta el
último step donde se cruza con la realidad de negocio (orden creada).

---

## Qué NO debe pasar

❌ Endpoint nuevo con `WHERE status NOT IN ('CANCELLED', 'RETURNED')` sin PENDING
❌ Frontend que cuenta visitors únicos con un evento y los llama "ventas" o "compras"
❌ Query que filtra por `createdAt` cuando debería ser `orderDate`
❌ Tabla en UI que suma una columna y el header dice un número distinto
❌ "Conversión" definida como eventos/eventos en vez de órdenes/visitors

---

## Endpoint de auditoría: `/api/admin/orders-truth`

Para diagnosticar inconsistencias en el futuro, usar:

```
GET /api/admin/orders-truth?orgId=X&date=YYYY-MM-DD&key=Y
```

Devuelve los 3 universos cruzados:
- **U1** = `orders` (verdad de negocio): breakdown por (source, status), web/vtex/meli
- **U2** = `pixel_attributions`: validas, web, sample
- **U3** = `pixel_events PURCHASE`: total events, distinct visitors, duplicados, huérfanos

Si los números entre U1, U2, U3 no cuadran con lo que muestra la UI, ahí está el bug.

---

## Próximos pasos (BACKLOG)

- [ ] Migrar también `/api/metrics/pixel/discrepancy` a usar los helpers
- [ ] Migrar `/api/metrics/customers`, `/api/metrics/products`, `/api/metrics/aura/*`
- [ ] Linter rule: detectar `WHERE status NOT IN` en SQL crudo y forzar import del helper
- [ ] Test de coherencia automatizado: corre en CI y compara `/orders-truth` con los endpoints user-facing
- [ ] Tooltip en KPIs explicando "esto cuenta X / no cuenta Y" usando un componente compartido

---

## Historial de incidentes de coherencia

| Fecha | Síntoma | Causa raíz | Fix |
|---|---|---|---|
| 2026-05-03 | 12 ≠ 14 ≠ 16 en `/pixel/analytics` (TVC) | Filtros SQL ad-hoc duplicados; funnel contaba events no orders | Helper `lib/metrics/orders.ts` + refactor 4 endpoints |
