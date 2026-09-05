# Auditoría de DATOS Y COHERENCIA DE MÉTRICAS — NitroSales

**Commit auditado:** `9ad4616d` (== `origin/main` == producción)
**Alcance:** contrato de coherencia, motor de atribución, identidad/dedupe, webhooks/idempotencia,
rollups y medallion, fechas/TZ, moneda, canales, schema.
**Método:** sólo lectura de código. No se ejecutó nada contra prod. Todo hallazgo lleva `archivo:línea`.
Lo que no pude cerrar leyendo código está marcado **SIN CONFIRMAR**.

---

## Resumen de la situación

El contrato `DATA_COHERENCE.md` existe y es bueno, pero **está desactualizado y sólo se cumple a medias**:

- El "single source of truth" que el contrato nombra (`src/lib/metrics/orders.ts`) **ya no existe**;
  se movió a `src/domains/orders/index.ts`. El documento nunca se actualizó.
- El endpoint que el propio contrato lista como consumidor canónico (`/api/metrics/orders`, la página
  `/pedidos`) **no importa el helper en absoluto** y aplica ~40 copias ad-hoc del filtro.
- La capa Gold de atribución (`gold_attribution_source` / `gold_attribution_channel`) es la **única**
  de las 6 tablas Gold que **no tiene el fix de "días afectados + borrado de huérfanas"**, que se
  construyó justamente para que el revenue no pudiera corregirse sólo hacia arriba.

Los hallazgos más graves no son "el filtro está mal escrito": son **dos definiciones distintas de la
misma métrica conviviendo detrás de un feature flag** (Gold vs Bronze, rollup vs live), donde el número
que ve el cliente depende de una env var y de cuándo corrió el último cron.

---

# CRITICAL

## C-1 — El "IP+UA merge" del motor de atribución es **solo-IP**: mezcla journeys de personas distintas

**Severidad:** CRITICAL — `[YA CONOCIDO]` (BACKLOG_PENDIENTES.md:67)
**Archivos:** `src/lib/pixel/attribution.ts:216-267`, `src/lib/pixel/identity.ts:139-141`

El bloque está rotulado "IP+UA Identity Merging (Triple Whale Identity Graph approach)" y justifica el
riesgo con "99.3% of IP+UA combos are unique to a single visitor". Pero la query sólo matchea por `ipHash`:

```ts
// attribution.ts:233-241
const relatedEvents = await prisma.pixelEvent.findMany({
  where: { organizationId, ipHash: { in: Array.from(visitorIpHashes) },
           visitorId: { not: visitorId }, timestamp: { gte: windowStart, lte: windowEnd }, ... }
});
```

Y `ipHash` no contiene el user agent:

```ts
// identity.ts:139-141
export function hashIP(ip: string): string {
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}
```

No hay ninguna condición sobre `userAgent` en esa query. La premisa estadística del 99,3% se apoya en
IP+UA; con IP sola, bajo CGNAT móvil argentino (Claro/Movistar/Personal comparten IP pública entre
miles de abonados) y bajo NAT corporativo, la unicidad se cae.

**Escenario concreto (Arredo):** Juan compra un sillón de $800.000 llegando por Google Orgánico desde
su casa. En los 30 días previos, otras 40 personas detrás del mismo CGNAT de Claro navegaron el sitio;
tres de ellas clickearon un anuncio de Meta. Los eventos de esas 40 personas se fusionan en el journey
de Juan. La sesión del click de Meta queda después de la de Google en el orden cronológico → **Meta se
lleva el last-click de $800.000 de una venta que no generó**. En LINEAR, los $800.000 se reparten entre
touchpoints de 4 personas distintas. En el panel de canales Meta aparece con ROAS inflado y se sube
presupuesto sobre un número falso.

**Agravante Aura:** el mismo motor alimenta `influencer-attribution.ts`. La comisión del creador se
calcula sobre esta atribución → se le paga plata real a quien no vendió.

---

## C-2 — Gold de atribución sin borrado de huérfanas: el revenue **sólo se corrige hacia arriba**

**Severidad:** CRITICAL
**Archivos:** `src/data/gold/gold-attribution-channel-transform.ts:28-101`,
`src/data/gold/gold-attribution-source-transform.ts:37-121`,
`src/app/api/cron/refresh-gold-attribution-channel/route.ts:76`,
`src/data/gold/affected-days.ts:80-97` (el fix que existe y no se aplicó acá)

`affected-days.ts` documenta exactamente este bug y su solución, y los 4 rollups Gold basados en Silver
(`gold_daily_revenue`, `gold_product_sales`, `gold_customer_daily`, `gold_order_segments`) la aplican:

```ts
// gold-daily-revenue-transform.ts:158,166
return buildRollup(affectedDaysPredicate("s"));
return buildDeleteOrphans("gold_daily_revenue");
```

Los dos Gold de atribución **no**. Son `INSERT ... ON CONFLICT DO UPDATE` puro, sin `DELETE`:

```ts
// gold-attribution-channel-transform.ts:85-100 — sólo ON CONFLICT DO UPDATE, no hay DELETE
// refresh-gold-attribution-channel/route.ts:76 — un solo $executeRawUnsafe, sin borrado previo
const n = await prisma.$executeRawUnsafe(buildGoldAttributionChannelUpsert(channelCase), org, since);
```

La ironía es que el rollup gemelo `pixel_daily_channel` **sí** hace DELETE-then-insert, y el comentario
explica el porqué palabra por palabra:

```ts
// rollup-backfill.ts:356-364
// DELETE-then-insert (NO upsert puro como las otras tablas): en pixel_daily_channel el `channel`
// es parte de la PK y CAMBIA cuando cambian las reglas. Un upsert por (org,day,channel) dejaría
// viva la fila del canal VIEJO (ej. 'TikTok Ads') junto a la del nuevo ('TikTok Orgánico') → el
// mismo visitante contado en dos canales.
```

`gold_attribution_channel` tiene PK `(organization_id, day, channel)` y el canal se resuelve con las
mismas `channel_rule` editables desde `/pixel/canales`. Tiene el problema idéntico y no el fix.

**Escenario concreto A (cancelación):** El 3 de agosto, Arredo tuvo una sola venta atribuida a
"TikTok Ads": $1.200.000. El 5 de agosto el cliente la cancela. El cron incremental del 5 recomputa
el día 3 (está dentro de `DAYS_BACK=4`), pero el `SELECT` ya no emite fila para `(2026-08-03, TikTok Ads)`
porque `ordersValidWebSql` la excluye. Sin `DELETE`, **la fila vieja sobrevive con los $1.200.000 para
siempre**. Con `PIXEL_USE_GOLD_CHANNEL=true` el panel muestra $1.200.000 de TikTok que ya no existen;
con el flag en off, el camino Bronze muestra $0. Dos números para la misma pantalla según una env var.

**Escenario concreto B (edición de regla):** Tomy entra a `/pixel/canales` y renombra/reasigna la regla
que mandaba `source=tiktok, medium=cpc` de "TikTok Ads" a "TikTok Paid". El siguiente cron re-materializa
los últimos 4 días y crea filas `(day, 'TikTok Paid')` — pero las filas `(day, 'TikTok Ads')` de esos
mismos días **quedan**. El revenue de esos 4 días se **duplica** en el total del panel. Los días
anteriores a la ventana de 4 conservan el canal viejo para siempre → la serie histórica queda partida
en dos canales que son el mismo.

**Agravante:** `DAYS_BACK = 4` (`refresh-gold-attribution-channel/route.ts:34`) con filtro
`o."orderDate" >= $2 AND pa."createdAt" >= $2`. Una orden re-atribuida por
`/api/cron/attribution-reconcile?days=14` o por `admin/replay-attribution` con `orderDate` de hace 10
días **nunca entra a Gold**. El comentario de `gold-attribution-source-transform.ts:116-117` asume
`createdAt >= orderDate` como lower-bound "redundante", lo cual es cierto, pero no salva el caso: el
recorte real es `orderDate >= $2`.

---

## C-3 — El funnel filtrado por canal cruza **dos vocabularios de source distintos**: la etapa "Compra" da 0

**Severidad:** CRITICAL
**Archivos:** `src/app/api/metrics/pixel/funnel/route.ts:172-186` (etapa Compra) vs
`src/app/api/metrics/pixel/funnel/route.ts:60-75` (etapas 1-4),
`src/lib/pixel/touchpoint-source-sql.ts:51-59`, `src/app/(app)/pixel/analytics/page.tsx:645,668,562`

El dropdown de canal del funnel se llena desde `channelRoas`, cuyos `source` salen de
`touchpointSourceCase`, que **agrega el sufijo `_organic`**:

```ts
// touchpoint-source-sql.ts:53-58
WHEN LOWER(COALESCE(${tpExpr}->>'medium','')) IN ('organic','social','referral')
  AND (${canonical}) IN ('google','bing','yahoo','duckduckgo')
THEN (${canonical}) || '_organic'
```

Esos valores (`google_organic`, `bing_organic`, …) se pasan tal cual al endpoint del funnel
(`page.tsx:562`). Las etapas 1-4 leen `pixel_daily_funnel_by_source.first_source`, que **sí** tiene
esos buckets (`first-source-sql.ts:120-122` emite `google_organic`/`bing_organic`/`yahoo_organic`).
Pero la etapa "Compra" compara contra el `source` **crudo** del touchpoint, sin el sufijo:

```sql
-- funnel/route.ts:178-181
AND EXISTS (
  SELECT 1 FROM jsonb_array_elements(pa.touchpoints::jsonb) AS tp
  WHERE LOWER(COALESCE(tp->>'source', 'direct')) = $5   -- $5 = 'google_organic'
     OR (LOWER(...) IN (${GOOGLE_UTM_SQL_IN}) AND $5 = 'google')
     OR (LOWER(...) IN (${META_UTM_SQL_IN}) AND $5 = 'meta'))
```

`attribution.ts` nunca escribe `'google_organic'` en `tp->>'source'`: escribe `source='google'`,
`medium='organic'` (`attribution.ts:47`, `attribution.ts:517-518`). El `=` nunca matchea.

**Escenario concreto:** `/pixel/analytics`, Arredo, últimos 30 días, funnel filtrado por
**"Google Orgánico"**. Pantalla: Visitas 84.300 → Vio Producto 41.100 → Carrito 6.900 →
Checkout 2.100 → **Compra 0**. La verdad son ~1.100 órdenes. El cliente ve que su canal orgánico más
grande convierte 0%.

**El espejo del mismo bug:** filtrando por **"Google Ads"** (`channel='google'`), las etapas 1-4 traen
sólo los visitantes cuyo `first_source='google'` (gclid o utm google = pago), pero la etapa Compra
matchea **todos** los touchpoints con `source='google'`, orgánicos incluidos → tasa de conversión
Checkout→Compra inflada. Con datos plausibles: Checkout 2.400, Compra 3.100 → **una tasa de conversión
del 129%**, visible en la propia UI (`page.tsx:1188-1193` calcula `step/prevStep`).

---

## C-4 — `/api/metrics/pixel/discrepancy` no filtra órdenes válidas ni marketplace: cuenta canceladas y pendientes

**Severidad:** CRITICAL
**Archivo:** `src/app/api/metrics/pixel/discrepancy/route.ts:94-101, 115-122, 136-143, 156-163, 180-187, 241-248, 277-280`

Ninguna de las 7 queries de este endpoint aplica `ordersValidWhere` ni el filtro web. El `import` del
contrato no existe en el archivo. El JOIN es sólo por rango de fecha:

```sql
FROM pixel_attributions pa
JOIN orders o ON o.id = pa."orderId"
WHERE pa."organizationId" = ${ORG_ID}
  AND o."orderDate" >= ${dateFrom}
  AND o."orderDate" <= ${dateTo}
  AND pa.model::text = ${selectedModel}
```

Esta es precisamente la pantalla cuyo trabajo es comparar el número de NitroSales contra el que
reporta Meta/Google. El backlog del contrato ya lo listaba como pendiente
(`DATA_COHERENCE.md`, sección "Próximos pasos": *"Migrar también /api/metrics/pixel/discrepancy a usar
los helpers"*) — **sigue sin migrar**. `[YA CONOCIDO parcialmente]`

Además, la atribución se calcula al primer webhook, cuando la orden VTEX suele estar en `PENDING`
(`webhooks/vtex/orders/route.ts:227,443` — `isNewOrder`), así que hay fila en `pixel_attributions`
para toda orden pendiente que nunca se pagó.

**Escenario concreto:** Arredo, 30 días. En `/pixel/analytics` el KPI "Revenue NitroPixel" da $850M
(usa `ordersValidWhere`). En `/pixel/discrepancia`, la columna "NitroPixel" para el mismo rango y el
mismo modelo da **$970M**, porque suma las órdenes `PENDING` (Mercado Pago elegido y nunca pagado),
las `CANCELLED` posteriores y las de marketplace FVG-/BPR-. El cliente ve dos números de NitroSales
distintos en dos pantallas contiguas, y el "delta vs Meta" queda sesgado ~14% hacia arriba.

**Bug secundario en el mismo archivo:** una de las queries del bloque hardcodea el modelo:

```ts
// discrepancy/route.ts:100
AND pa.model::text = 'NITRO'    // el resto usa ${selectedModel}
```

Si el usuario selecciona LAST_CLICK, esa tarjeta sigue mostrando NITRO.

---

## C-5 — La atribución no se recalcula cuando VTEX cambia el monto de la orden

**Severidad:** CRITICAL
**Archivos:** `src/app/api/webhooks/vtex/orders/route.ts:227, 254, 430-434`,
`src/lib/pixel/attribution.ts:751, 765-789`

El webhook actualiza `totalValue` en cada notificación de cambio de estado:

```ts
// route.ts:224-238 — bloque update del upsert
update: { status: nsStatus as any, totalValue, itemCount: items.length, ... }
```

pero la atribución sólo corre la primera vez:

```ts
// route.ts:430-434
if (!isNewOrder) {
  console.log(`[NitroPixel] Skipping attribution for ${orderId} — order already exists (status update)`);
  pixelAttribution = true; // Assume it was already done
}
```

y `attributedValue` se congela con el valor del momento (`attribution.ts:751`
`const totalValue = Number(order.totalValue);`). No hay ningún camino que re-sincronice
`pixel_attributions.attributedValue` con `orders.totalValue` (el reconcile de
`cron/attribution-reconcile` sólo procesa órdenes **sin** atribución NITRO,
`attribution-reconcile/route.ts:88-99`).

**Escenario concreto:** Una orden de Arredo entra por $1.500.000 (3 items). Al día siguiente VTEX
cancela 1 item y la orden queda en $900.000, estado `INVOICED`. En `/pixel/analytics`:
- KPI "Revenue web" (lee `orders.totalValue`) → cuenta $900.000. Correcto.
- Tabla "Revenue por canal" y KPI "Revenue NitroPixel" (leen `pixel_attributions.attributedValue`) →
  cuentan **$1.500.000**.

Las dos cifras están en la misma pantalla y no cierran. A escala Arredo (252k órdenes, cancelaciones
parciales frecuentes en muebles) la brecha es estructural, no un caso borde, y **infla el ROAS**
porque el numerador viene de `attributedValue` y el denominador de `ad_metrics_daily`.

---

# HIGH

## H-1 — `/api/metrics/orders` (página `/pedidos`) ignora el contrato canónico

**Severidad:** HIGH
**Archivo:** `src/app/api/metrics/orders/route.ts` — sin `import` de `@/domains/orders`
(imports en líneas 16-20); filtros ad-hoc en ~40 lugares (234, 254, 315, 369, 421, 465, 510, 645, 715,
852, 868, 900, 942, 983, 1033, 1105, 1140, 1194, 1237, 1270, 1331, 1365, 1399, …)

`DATA_COHERENCE.md` lista este endpoint como consumidor de `ordersValidWhere("o")`. No lo usa. Y el
filtro copiado **no es equivalente al canónico**: le falta `totalValue > 0`.

```bash
$ grep -c 'totalValue" > 0' src/app/api/metrics/orders/route.ts
0
```

Además introduce una regla que **ningún otro consumidor aplica**: excluye el **pack entero** si
cualquier fila del pack cayó en un estado no concretado dentro del rango:

```sql
-- route.ts:237-243
AND COALESCE("packId", "externalId") NOT IN (
  SELECT COALESCE("packId", "externalId") FROM orders
  WHERE "organizationId" = '...' AND "orderDate" >= $1 AND "orderDate" <= $2
    AND status IN ('CANCELLED', 'RETURNED', 'PENDING') ...)
```

**Escenario concreto:** Un carrito MELI (pack `P-9981`) de TeVeCompras con 2 items: uno `DELIVERED`
por $180.000 y otro `CANCELLED`. En `/pedidos` el pack completo desaparece: 0 órdenes, $0. En
`/api/mercadolibre/dashboard` (`mercadolibre/dashboard/route.ts:50`), que filtra sólo por estado sin
lógica de pack, el mismo carrito aporta **1 orden y $180.000**. Dos pantallas del mismo producto,
$180.000 de diferencia por carrito afectado.

Y la ausencia de `totalValue > 0`: 3 órdenes anómalas de $0 hacen que `/pedidos` diga 252.003 órdenes
mientras el pixel dice 252.000 para el mismo universo.

---

## H-2 — Los touchpoints **posteriores a la compra** entran a la ventana y se llevan el last-click

**Severidad:** HIGH — `[YA CONOCIDO]` (BACKLOG_PENDIENTES.md:66)
**Archivos:** `src/lib/pixel/attribution.ts:189-196, 607, 620-644, 834-837`

```ts
// attribution.ts:189-190
const windowStart = new Date(order.orderDate.getTime() - maxWindowDays * 86400000);
const windowEnd   = new Date(order.orderDate.getTime() + 86400000);   // orderDate + 24h
```

Los eventos de las 24h **posteriores** a la orden entran a `primaryEvents`, se agrupan en sesiones
(Step 1), producen `sessionSources`, se ordenan cronológicamente (línea 607) y el último de la lista
es, por definición, el touchpoint de LAST_CLICK. No hay ningún filtro `timestamp <= orderDate` entre
el Step 1 y el Step 4.

El comentario de la línea 187-188 justifica el +1d como "buffer para el disparo tardío del pixel
post-orden en la misma sesión". Pero el buffer no distingue el disparo tardío de una **visita nueva**.

**Escenario concreto:** Un cliente de El Mundo del Juguete compra por $95.000 llegando desde un
anuncio de Meta. Dos horas después recibe el mail de confirmación de VTEX, lo abre desde la app de
Gmail en Android y vuelve al sitio a ver el estado del pedido. El referrer `android-app://com.google.android.gm/`
se clasifica como `source='email'` (`attribution.ts:42`) → sesión nueva → touchpoint nuevo, posterior a
Meta. **LAST_CLICK atribuye los $95.000 a "email"**, no a Meta. En el panel, "Email" aparece como un
canal de adquisición con revenue y ROAS infinito (spend 0), y Meta pierde la venta que sí generó.

El caso más frecuente en Argentina es peor: la vuelta desde la pasarela. Está mitigado por
`isPaymentGatewayReferrerHostname` (attribution.ts:114) y por `shouldSkipSessionForJourney`
(attribution.ts:580-591), pero cualquier fuente **no listada** (un banco, un `link de pago` propio,
una app de billetera nueva) pasa el filtro y se lleva el crédito.

---

## H-3 — Estrategias 2b y 4 del webhook asignan órdenes a visitantes **al azar** en tiendas con concurrencia

**Severidad:** HIGH
**Archivo:** `src/app/api/webhooks/vtex/orders/route.ts:519-545` (Strategy 2b), `634-664` (Strategy 4)

Cuando falla el match por email/teléfono, el webhook agarra **el evento de checkout más reciente de
cualquiera** dentro de la ventana:

```sql
-- Strategy 2b (route.ts:522-537): ventana [orderTime-60min, orderTime+5min]
SELECT pe."visitorId" FROM pixel_events pe
WHERE pe."organizationId" = ${org.id} AND pe.timestamp >= ${windowStart} AND pe.timestamp <= ${windowEnd}
  AND (pe."pageUrl" LIKE '%/checkout/%' OR ... )
ORDER BY pe.timestamp DESC LIMIT 1
```

```sql
-- Strategy 4 (route.ts:642-655): ventana de 2 horas, cualquier visitor anónimo con un PAGE_VIEW
WHERE pv.email IS NULL AND pe.type = 'PAGE_VIEW' AND pe."pageUrl" NOT LIKE '%/checkout/%' ...
ORDER BY pe.timestamp DESC LIMIT 1
```

No hay ninguna restricción de unicidad: **el mismo visitante puede quedar asignado a decenas de
órdenes** dentro de la misma ventana, y una orden puede quedar asignada a alguien que no la hizo.
El comentario del código lo admite ("Less reliable but still useful for **single-concurrent-checkout
stores**") — Arredo no es esa tienda.

**Escenario concreto:** Arredo, martes 20:15 (pico). En una ventana de 60 minutos hay ~120 checkouts
concurrentes. Entran 40 webhooks de órdenes sin email utilizable. Las 40 caen a Strategy 2b y todas
resuelven al **mismo** visitante (el del último evento de checkout de cada ventana, que se solapa).
Ese visitante llegó por un anuncio de Meta. Resultado: 40 órdenes × ~$450.000 = **$18M atribuidos a
Meta** en una hora, de los cuales quizá 1 le corresponde. El ROAS de Meta de ese día se multiplica.

Nota: `pixel_attributions` tiene `@@unique([orderId, model])`, no `(visitorId, …)` —
`prisma/schema.prisma:826` — así que nada en el schema impide la asignación N:1.

---

## H-4 — `pixel_daily_funnel_by_source`: el chequeo de cobertura sólo mira el borde inferior

**Severidad:** HIGH (relacionado con `[YA CONOCIDO]` BP-PIXEL-CHANNEL-ROLLUP)
**Archivo:** `src/app/api/metrics/pixel/funnel/route.ts:52-82`

```ts
const cov = await prisma.$queryRawUnsafe(
  `SELECT (MIN(day) <= ($2 AT TIME ZONE '${AR_TZ}')::date) AS covered
   FROM pixel_daily_funnel_by_source WHERE "organizationId" = $1`, orgId, dateFrom);
if (cov[0]?.covered) { /* lee sólo del rollup */ }
```

Sólo se verifica `MIN(day) <= from`. **No se verifica `MAX(day) >= to`**, ni que no haya huecos
intermedios. El rollup es notoriamente incompleto: el propio backlog dice *"Hoy solo tiene los últimos
~7-8 días de Arredo/ElMundo"* (BACKLOG_PENDIENTES.md:34) y `rollup-backfill.ts:28-36` documenta que la
tabla `funnel` es la que más se quedaba stale por statement timeout.

Además, a diferencia del funnel sin filtro (`getFunnelStages`, que sí hace live-merge del tramo
reciente — `src/lib/metrics/pixel-funnel.ts:68-116`), este camino **no mergea nada en vivo**.

**Escenario concreto:** El rollup de Arredo cubre 2026-01-01 → 2026-08-25. El usuario pide
2026-08-20 → 2026-09-02. `MIN(day)=2026-01-01 <= 2026-08-20` → `covered = true` → se lee sólo el
rollup y se devuelven **8 días de 14**. Pantalla: funnel "Todos" (con live-merge) = 43.100 visitas;
funnel filtrado por "Directo" = 6.200. La suma de todos los canales da ~24.000 y **no cierra contra
el total**, sin ningún aviso en la UI. Peor con rango "Hoy": el total merge-live da 12.400 y el
filtrado por canal da ~0.

**Bug de definición adicional en el mismo par de caminos:** el rollup bucketea por
`pixel_visitor_first_source.first_source`, que es el **primer source histórico del visitante**
(dimensión por visitante, calculada por `first-source-batch.ts`), mientras el fallback en vivo
(`funnel/route.ts:99-104`) calcula el primer source **dentro del rango pedido**:

```sql
visitor_first_source AS (
  SELECT DISTINCT ON ("visitorId") "visitorId", first_source
  FROM event_sources          -- ya filtrado por [from, to]
  WHERE first_source IS NOT NULL ORDER BY "visitorId", timestamp ASC)
```

Un visitante cuyo primer toque histórico fue Meta hace 6 meses, pero que en el rango elegido sólo
entró por Google Orgánico, cae en el bucket **Meta** por el camino rollup y en **Google Orgánico** por
el camino en vivo. Los dos caminos alimentan la misma tarjeta.

---

## H-5 — `customers.totalSpent` / `totalOrders`: tres definiciones incompatibles, ninguna canónica

**Severidad:** HIGH
**Archivos:** `src/app/api/webhooks/vtex/orders/route.ts:276-282, 309-312`;
`src/app/api/admin/recompute-customer-aggregates/route.ts:59-62`;
`src/app/api/backfill/vtex/route.ts:445`;
lectores: `src/app/api/bondly/senales/route.ts:274-310`, `src/app/api/ltv/predict/route.ts:125`,
`src/app/api/finance/alerts/predictive/route.ts:134`, `src/lib/intelligence/handlers.ts:427-446`

1. **Webhook (incremental):** suma `totalValue` cuando `isNewOrder`, con la orden típicamente en
   `PENDING`. **Nunca resta** cuando la orden pasa a `CANCELLED`/`RETURNED` (el bloque `update` del
   upsert de customer, líneas 269-282, sólo incrementa si `isNewOrder`).
2. **Recompute admin:** `SUM(CASE WHEN status != 'CANCELLED' THEN totalValue ELSE 0 END)` →
   **incluye PENDING y RETURNED**, y `totalOrders = COUNT(*)` cuenta hasta las canceladas.
3. **Contrato canónico** (`src/domains/orders/index.ts:33-37, 51-58`): excluye
   `CANCELLED | PENDING | RETURNED` y exige `totalValue > 0`.

**Escenario concreto:** Un cliente de Arredo hizo 5 órdenes: 3 entregadas ($600.000), 1 cancelada
($200.000) y 1 pendiente que nunca pagó ($150.000).
- `/bondly/clientes` (usa `ordersValidSql`, `bondly/clientes/route.ts:187`) → **3 pedidos, $600.000**.
- `/bondly/senales` (usa `c."totalSpent"`, líneas 274-310) → **$950.000** y lo mete en el decil VIP.
- Tras correr `recompute-customer-aggregates` → **5 pedidos, $750.000**.

El mismo cliente, tres LTV distintos, y el ranking de "VIP" que se usa para decidir campañas de
retención se arma sobre el número inflado.

---

## H-6 — `/finanzas` calcula el "hoy" y el "año" con la fecha **UTC**: YTD se resetea 3 horas antes

**Severidad:** HIGH
**Archivo:** `src/app/api/finanzas/pulso/route.ts:49-62, 174-182, 289, 297`

```ts
function ytdBoundariesBA(today: Date) {
  const year = today.getUTCFullYear();                               // ← año UTC
  const from = new Date(`${year}-01-01T00:00:00.000-03:00`);
  const to = new Date(`${today.toISOString().substring(0,10)}T23:59:59.999-03:00`); // ← día UTC
  ...
}
...
const monthIso = today.toISOString().substring(0, 7);                 // ← mes UTC (route.ts:297)
```

Argentina es UTC−3 sin DST: entre las **21:00 y las 23:59 hora local**, `toISOString()` ya devuelve
el día siguiente, y el 31 de diciembre a partir de las 21:00 devuelve el **año siguiente**.

**Escenario concreto:** 31 de diciembre de 2026, 21:30 hora de Buenos Aires. `getUTCFullYear()`
devuelve **2027**. `from` = 2027-01-01, `to` = 2027-01-01 23:59 (−03:00). La ventana YTD queda vacía:
`/finanzas` muestra **Revenue YTD $0, COGS $0**, y el cálculo de runway
(`runwayInputs`, líneas 320+) divide por cero / da infinito. Todo el año de facturación desaparece de
la pantalla durante 3 horas, justo el día que el fundador la mira. El mismo mecanismo hace que
`loadCashOverride({ month: monthIso })` busque el override de enero-2027 estando en diciembre-2026.

Efecto más leve pero diario: entre 21:00 y 24:00 la ventana "hasta hoy" incluye un día extra, lo que
distorsiona el promedio diario y la proyección de fin de mes.

---

## H-7 — Divergencia estructural Gold vs Bronze en `/pedidos`: la ventana de `bad_packs` no es la misma

**Severidad:** HIGH
**Archivos:** `src/app/api/metrics/orders/route.ts:237-243, 209` (Bronze) vs
`src/data/gold/gold-daily-revenue-transform.ts:36-41, 158` + `src/data/gold/affected-days.ts:60-78`

Bronze acota los "packs malos" **al rango que pidió el usuario**:

```sql
SELECT COALESCE("packId","externalId") FROM orders
WHERE ... AND "orderDate" >= $1 AND "orderDate" <= $2 AND status IN ('CANCELLED','RETURNED','PENDING')
```

Gold los acota a los **días afectados por el último refresh de Silver** (`affectedDaysPredicate("s")`,
es decir `silver_orders.silver_updated_at >= now() − 4d`), que no tiene nada que ver con el rango del
usuario.

**Escenario concreto:** Un pack MELI de TeVeCompras con una fila entregada el lunes ($120.000) y una
fila cancelada el jueves. El usuario pide "lunes" (1 día):
- **Bronze** (`ORDERS_USE_GOLD` off): la fila cancelada del jueves no está en el rango → el pack no se
  excluye → **1 orden, $120.000**.
- **Gold** (`ORDERS_USE_GOLD=true`): el jueves está en la ventana de días afectados → `bad_packs` lo
  atrapa → el pack se excluye → **0 órdenes, $0**.

Mismo día, misma pantalla, dos números según una env var. Peor: el resultado Gold para un día
histórico **cambia con el tiempo**, porque la ventana de días afectados se mueve con cada corrida del
cron — el mismo reporte del mismo día puede dar distinto la semana que viene.

**Sub-hallazgo:** los 4 rollups Gold filtran por `status NOT IN (...)` directo
(`gold-daily-revenue-transform.ts:56`) e **ignoran `total_value > 0`**, aunque Silver ya calculó y
persiste `is_valid` con la definición completa (`silver-orders-transform.ts:44`). Dos definiciones de
"válida" conviviendo dentro del propio medallion.

---

## H-8 — ROAS: el delta período-a-período usa el **spend del período actual** para el período anterior

**Severidad:** HIGH
**Archivo:** `src/app/api/metrics/pixel/route.ts:1441-1447, 1670`

```ts
const pixelRoas = totalAdSpend > 0 ? Math.round((projectedRevenue / totalAdSpend) * 100) / 100 : 0;
...
const prevRoas  = totalAdSpend > 0 ? (prevPixelRevenue / totalAdSpend) : 0;   // ← mismo denominador
...
pixelRoas: pctChange(pixelRoas * 100, prevRoas * 100),                        // línea 1670
```

Dos errores en la misma línea: (a) `prevRoas` usa `totalAdSpend` del período **actual**, no el del
anterior; (b) el numerador de `pixelRoas` es `projectedRevenue` (escalado por cobertura) mientras el
de `prevRoas` es `prevPixelRevenue` (crudo, sin escalar).

**Escenario concreto:** Arredo duplica la inversión en ads: $5M el mes pasado, $10M este mes. Revenue
atribuido: $40M ambos meses. ROAS real: 8,0 → 4,0, una caída del 50%. La pantalla calcula
`pixelRoas = 40M/10M = 4,0` y `prevRoas = 40M/10M = 4,0` → muestra **"ROAS +0%"**. La duplicación del
gasto sin retorno es invisible. Si además la cobertura de atribución es del 80%,
`projectedRevenue = 50M` → `pixelRoas = 5,0` vs `prevRoas = 4,0` → la pantalla muestra **"+25%"** en
un mes en que el ROAS se cayó a la mitad.

---

## H-9 — `/api/finance/alerts/predictive` calcula revenue sobre **todas** las órdenes, sin filtro de estado

**Severidad:** HIGH
**Archivo:** `src/app/api/finance/alerts/predictive/route.ts:49-72`

```sql
SELECT COALESCE(SUM("totalValue"), 0)::text AS total FROM orders
WHERE "organizationId" = $1 AND "orderDate" >= $2 AND "orderDate" <= $3
```

Sin `status`, sin `totalValue > 0`, sin filtro de marketplace. Las tres agregaciones (revenue,
shipping, COGS) tienen el mismo problema. El archivo no importa `@/domains/orders`.

**Escenario concreto:** Arredo, últimos 30 días, con ~12% de órdenes en `PENDING` (Mercado Pago /
transferencia sin pagar) y ~4% canceladas. La alerta de margen calcula revenue = $1.160M cuando la
verdad es $960M. El COGS, en cambio, viene de `order_items` de esas mismas órdenes, así que se infla
proporcional — pero el `shippingCost` de las canceladas no siempre existe. El resultado es un margen
% que no coincide con `/finanzas` ni con `/pedidos`, y alertas que se disparan (o no) sobre un número
que no existe en ninguna otra pantalla.

---

## H-10 — El merge de visitantes por **teléfono solo** puede colapsar personas distintas

**Severidad:** HIGH
**Archivos:** `src/lib/pixel/identity.ts:262-291` (path phone-only), `36-81` (`mergeVisitorInto`),
`104-137` (`normalizePhone`), `src/app/api/webhooks/vtex/orders/route.ts:669-676`

Para el email hay lista negra de dominios desechables y validación de formato
(`identity.ts:241-255`). Para el teléfono **no hay ninguna validación semántica**: cualquier string
que normalice a 8-16 dígitos dispara un merge destructivo:

```ts
// identity.ts:273-283
const existingWithPhone = await prisma.pixelVisitor.findFirst({
  where: { organizationId, phone, id: { not: currentVisitor.id } } });
if (existingWithPhone) {
  await prisma.$transaction((tx) => mergeVisitorInto(tx, currentVisitor, existingWithPhone));
```

`normalizePhone` además **inventa prefijos**: un número de 8-11 dígitos sin `+` se convierte en
`'+54' + p` (línea 122). Un fijo `43215678` de Buenos Aires y uno de Córdoba con los mismos 8 dígitos
colapsan al mismo `+5443215678`.

**Escenario concreto:** El checkout de VTEX tiene el teléfono como campo obligatorio y mucha gente
pone relleno. 300 visitantes distintos de El Mundo del Juguete escriben `1111111111`. El primer
IDENTIFY crea el visitante A con ese teléfono; los 299 siguientes se **absorben en A**
(`mergeVisitorInto` mueve todos sus `pixel_events` y `pixel_attributions` a A y **borra** el visitante
original, línea 80). El visitante A queda con el journey combinado de 300 personas. Cualquier orden
que matchee por teléfono (webhook Strategy 3.1, `route.ts:503-517`) recibe ese journey Frankenstein.
El merge es **irreversible**: `pixelVisitor.delete` es físico y `pixel_visitor_first_source` /
`pixel_visitor_no_source` se borran (líneas 69-77).

Efecto secundario del mismo merge: `firstSeenAt` del sobreviviente **no** se baja al del absorbido
(líneas 58-67 sólo actualizan `lastSeenAt`), así que la "antigüedad del visitante" queda mal después
de todo merge, incluso los legítimos por email.

---

# MEDIUM

## M-1 — El filtro "web" está copiado inline en ~20 lugares y **dos copias divergen**

**Severidad:** MEDIUM
**Archivos:** `src/app/api/metrics/pixel/route.ts:1116-1117` (query #27, "Journey complexity") y
`1138-1139` (query #28, "Top channel pairs")

Las 18 copias restantes del archivo tienen las 5 condiciones; estas dos tienen sólo 2:

```sql
AND ${ordersValidWhere("o")}
AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
AND o.source IS DISTINCT FROM 'MELI'
-- faltan: channel IS DISTINCT FROM 'marketplace', externalId NOT LIKE 'FVG-%', NOT LIKE 'BPR-%'
```

Otros dos endpoints tienen la misma omisión (les faltan los prefijos FVG-/BPR-):
- `src/app/api/metrics/conversion/route.ts:153-155`
- `src/app/api/metrics/pixel/journeys/route.ts:170-172`

**Escenario concreto:** Arredo tiene órdenes de Fravega (`FVG-…`) sincronizadas por VTEX. En
`/pixel/analytics`, el KPI "Revenue NitroPixel" (query #9, filtro completo) da $850M, pero la tarjeta
"Complejidad del journey" (#27) suma $868M al totalizar sus buckets — $18M de Fravega que el pixel no
puede haber trackeado. La misma pantalla, dos totales.

**Causa raíz:** `DATA_COHERENCE.md` prohíbe explícitamente copiar filtros ad-hoc
(*"Prohibido: copiar-pegar filtros SQL ad-hoc en endpoints nuevos"*), y existe
`ordersWebWhere()` / `ordersValidWebWhere()` listos para usar (`src/domains/orders/index.ts:107-127`).
El endpoint principal del pixel importa **sólo** `ordersValidWhere` (línea 24) y hace el resto a mano.

---

## M-2 — La atribución diferida deja `pixel_attributions.visitorId` desincronizado de sus touchpoints

**Severidad:** MEDIUM
**Archivos:** `src/lib/pixel/identity.ts:413-429, 357-365`; `src/lib/pixel/attribution.ts:765-789`

`calculateAttribution` hace `upsert` por `orderId_model`. El bloque `update` **no incluye `visitorId`**:

```ts
// attribution.ts:781-788
update: { touchpoints, touchpointCount, attributedValue, conversionLag, campaignId, creativeId }
```

Cuando la atribución diferida re-calcula una orden con el visitante correcto
(`identity.ts:426`), los touchpoints se reemplazan por los del visitante nuevo pero la fila **conserva
el `visitorId` del visitante equivocado** que había adivinado Strategy 4.

Efectos: (a) cualquier query que agrupe atribuciones por `visitorId` (p. ej.
`silver-orders-transform.ts:49-56`, que resuelve `device_enriched` con
`LEFT JOIN pixel_visitors pv ON pv.id = att."visitorId"`) toma el device de la persona equivocada;
(b) el chequeo `existingAttribution` de `identity.ts:415-421` filtra por `visitorId: updated.id` y
**nunca** se cumple, así que `calculateAttribution` se re-ejecuta para las últimas 10 órdenes del
cliente en **cada** evento IDENTIFY de ese visitante.

---

## M-3 — `orders.channel` guarda dos formatos distintos según qué camino escribió la fila

**Severidad:** MEDIUM
**Archivos:** `src/app/api/webhooks/vtex/orders/route.ts:211` vs
`src/app/api/admin/vtex-reenrich-fields/route.ts:136`

```ts
// webhook (create): channel: vtexOrder.salesChannel || null      → "1", "2", …
// re-enrich:        const channel = vData.salesChannel != null ? `sc-${vData.salesChannel}` : null;
```

La misma dimensión guarda `"1"` y `"sc-1"`. Cualquier `GROUP BY channel` abre dos filas para el mismo
canal de venta.

Consecuencia sobre el contrato: `channel IS DISTINCT FROM 'marketplace'` (regla 2 de
`DATA_COHERENCE.md`) **nunca dispara para órdenes VTEX** — `'marketplace'` sólo lo escriben los
caminos de MercadoLibre (`sync/mercadolibre/route.ts:191`, `ml-notification-processor.ts:158`,
`mercadolibre-enrichment.ts:263`), que ya quedan excluidos por `source = 'MELI'`. Para VTEX, la
exclusión de marketplace depende enteramente de `trafficSource='Marketplace'`, que lo escribe un job
de enriquecimiento aparte (`vtex-enrichment.ts:274,307`), y de los prefijos FVG-/BPR-. **Si el
enriquecimiento no corrió para una org, sus órdenes de marketplace VTEX cuentan como "web".**
*SIN CONFIRMAR* cuántas órdenes por org están en ese estado (requiere consultar prod).

---

## M-4 — HLL con precisiones distintas entre tablas que se comparan en la misma pantalla

**Severidad:** MEDIUM
**Archivo:** `src/lib/pixel/rollup-backfill.ts:109-111, 300-317` (source, `P16`) vs `322-341`
(funnel, `P14`) vs `src/lib/pixel/channel-rollup.ts:71` (`16, 5`)

- `pixel_daily_source.pv_visitors_hll` → `(16, 5)` (~0,4% de error)
- `pixel_daily_funnel_by_source.pv_hll` → `(14, 5)` (~1,6% de error)
- `pixel_daily_aggregates` → `(14, 5)`

Miden **lo mismo** (visitantes únicos con PAGE_VIEW no-checkout por día y canal) con precisiones
distintas. Además, HLL de distintas precisiones **no se puede unir**: `hll_union` entre `(16,5)` y
`(14,5)` falla o degrada.

**Escenario concreto:** `/pixel/analytics`, columna "Visitantes" de la tabla de canales
(`pixel_daily_source`, 16,5) = 10.240 para Google Orgánico. El primer escalón del funnel filtrado por
Google Orgánico (`pixel_daily_funnel_by_source`, 14,5) = 10.061. 179 visitantes de diferencia sin
explicación posible para el cliente, en dos tarjetas de la misma pantalla. El comentario del código
(`rollup-backfill.ts:325`) dice *"Misma precisión (14,5) que la tabla, para poder unir los HLL entre
días"* — la tabla a la que se refiere usa 16,5.

---

## M-5 — El modelo `TIME_DECAY` se escribe en la base pero ninguna pantalla lo puede leer

**Severidad:** MEDIUM
**Archivos:** `src/lib/pixel/attribution.ts:754-760, 850-861`; `validModels` en
`metrics/pixel/route.ts:247`, `funnel/route.ts:157`, `discrepancy/route.ts:50`,
`sales-by-source/route.ts:31`, `sales-by-ad/route.ts:95`; `src/lib/pixel/attribution-weights.ts:41-66`

`calculateAttribution` escribe 5 filas por orden (una por modelo), pero los 5 endpoints validan contra
`["LAST_CLICK","FIRST_CLICK","LINEAR","NITRO"]`. El 20% de `pixel_attributions` es peso muerto — en
Arredo, ~50.000 filas inútiles por cada 250k órdenes atribuidas.

Peor: si alguna vez se expone, `reconstructSourceRevenue` lo manda al `default` del switch
(línea 50), que aplica los **pesos NITRO**. Es decir, seleccionar TIME_DECAY devolvería silenciosamente
los números de NITRO, no un error.

---

## M-6 — `orders.updatedAt` es `timestamp` sin zona y se compara contra `timestamptz`

**Severidad:** MEDIUM — *parcialmente SIN CONFIRMAR*
**Archivos:** `prisma/schema.prisma:210` (`updatedAt DateTime @default(now()) @updatedAt`, sin
`@db.Timestamptz`) vs `src/data/silver/silver-orders-transform.ts:100`
(`AND o."updatedAt" >= $2::timestamptz`)

`orderDate` sí es `@db.Timestamptz` (línea 208), `updatedAt` no. Postgres castea el `timestamp`
asumiendo la `TimeZone` de la sesión. Prisma escribe en UTC; si la sesión de Neon está en UTC no hay
daño, pero la ventana incremental de Silver — de la que dependen los 4 rollups Gold a través de
`affectedDaysSql()` — quedaría desplazada 3h ante cualquier cambio de configuración. No pude confirmar
la `TimeZone` efectiva de la conexión leyendo el repo (`src/lib/db/client.ts` no la setea).

Lo mismo aplica a `PixelAttribution.createdAt` (`schema.prisma:822`) usado en
`gold-attribution-*-transform.ts` con `>= $1::timestamptz`.

---

## M-7 — `/api/metrics/pixel` sin `from`/`to` compara una ventana rodante contra días calendario

**Severidad:** MEDIUM
**Archivo:** `src/app/api/metrics/pixel/route.ts:211-217, 265-268`

```ts
const dateTo   = toParam ? new Date(toParam + "T23:59:59.999-03:00") : now;
const dateFrom = fromParam ? new Date(fromParam + "T00:00:00.000-03:00") : new Date(now.getTime() - 7*MS_PER_DAY);
...
const goldDayFrom = arDayStr(dateFrom);   // día calendario AR
const goldDayTo   = arDayStr(dateTo);
```

Con parámetros explícitos los dos caminos coinciden. **Sin** parámetros, Bronze filtra
`orderDate >= now−168h` (ventana rodante) y Gold suma **días AR completos**, incluyendo las horas
previas a `now−168h` del primer día. Con `PIXEL_USE_GOLD=true` la llamada sin parámetros devuelve
más revenue que la misma llamada con el flag apagado.

---

## M-8 — `DIM_RULE_EXPRS.source` no aplica `LOWER`, el camino touchpoint sí

**Severidad:** MEDIUM — *SIN CONFIRMAR* si hay filas afectadas en prod
**Archivos:** `src/lib/pixel/channel-rollup.ts:52` vs `src/lib/pixel/touchpoint-channel-sql.ts:33`

```ts
// channel-rollup.ts:52  (camino DIM → pixel_daily_channel)
source: `BTRIM(d.source_raw, E' \\t\\n\\r')`,                     // sin LOWER

// touchpoint-channel-sql.ts:33  (camino serve → gold_attribution_channel)
source: `COALESCE(NULLIF(LOWER(TRIM(${tpExpr}->>'source')), ''), 'direct')`,   // con LOWER
```

Los patrones de `channel_rule` se comparan siempre en minúscula
(`channel-rules.ts:65` `const p = dim.pattern.toLowerCase()`). El comentario asume que
`first-source-batch.ts` guarda `source_raw` en minúscula, y efectivamente lo hace en el camino actual
(`first-source-batch.ts:97,161`) — pero cualquier fila escrita por un camino histórico o un backfill
manual con `ADWORDS` no matchearía ninguna regla y caería al passthrough como canal propio, junto a
`adwords`. Es exactamente el modo de falla histórico ("ADWORDS vs adwords", "$406M de TeVe" citado en
`touchpoint-source-sql.ts:65-68`). El fix es de una palabra y elimina la clase entera de bug.

---

## M-9 — La etapa "Compra" del funnel por canal es **any-touch** mientras las otras 4 son first-touch

**Severidad:** MEDIUM (documentado en el tooltip, pero produce tasas > 100%)
**Archivos:** `src/app/api/metrics/pixel/funnel/route.ts:172-186`; tooltip en
`src/app/(app)/pixel/analytics/page.tsx:1151`

Etapas 1-4: visitantes cuyo **primer** toque fue ese canal (mutuamente excluyentes).
Etapa 5: órdenes cuyo journey **contiene** ese canal en cualquier posición (`EXISTS` sobre todos los
touchpoints) → una orden con journey `[Meta, Google]` cuenta como compra **de Meta y de Google**.

La suma de "Compra" sobre todos los canales excede el total de órdenes atribuidas. Es el mismo patrón
que produjo el incidente 12/14/16 registrado en `DATA_COHERENCE.md`.

---

## M-10 — `traffic_enriched` de Silver usa el **primer touchpoint crudo**, sin canonicalizar ni respetar el modelo

**Severidad:** MEDIUM
**Archivo:** `src/data/silver/silver-orders-transform.ts:43`

```sql
COALESCE(o."trafficSource", att.touchpoints::jsonb->0->>'source') AS traffic_enriched
```

Tres problemas: (a) `->0` es siempre FIRST_CLICK, sin importar el modelo configurado por la org;
(b) el valor es el `source` **crudo**, sin `canonicalSourceSql` ni sufijo `_organic`; (c) la
atribución elegida es `ORDER BY pa."createdAt" DESC LIMIT 1` (líneas 49-55) — inofensivo hoy porque
los touchpoints son iguales entre modelos, pero frágil.

**Escenario concreto:** `/pedidos` → segmentación por "Fuente de tráfico" muestra filas separadas
`google`, `adwords`, `fb`, `meta`; `/pixel/analytics` muestra `Google Ads` y `Meta` consolidados. Un
mismo mes: `/pedidos` dice "Google: $210M" (sólo la fila `google`) mientras `/pixel` dice
"Google Ads: $340M". La diferencia son las filas `adwords` y `google_ads` que `/pedidos` lista aparte.

---

## M-11 — El funnel por canal no distingue `sin_clasificar` entre el camino rollup y el fallback

**Severidad:** MEDIUM
**Archivo:** `src/app/api/metrics/pixel/funnel/route.ts:70` vs `100-104`

El rollup mapea `first_source` NULL a `'sin_clasificar'` (`rollup-backfill.ts:308`), pero el fallback
en vivo hace `WHERE first_source IS NOT NULL` + `INNER JOIN` → filtrando por el canal
`sin_clasificar`, el rollup devuelve N visitantes y el fallback devuelve **0**.

---

# LOW

## L-1 — `DATA_COHERENCE.md` apunta a un archivo que no existe

`DATA_COHERENCE.md` (Regla 4 y ejemplos de import) referencia `src/lib/metrics/orders.ts`. El archivo
está en `src/domains/orders/index.ts`. `src/lib/metrics/` sólo contiene `pixel-funnel.ts`. El
comentario `metrics/pixel/route.ts:970` también sigue citando la ruta vieja. El documento que define
el contrato no compila mentalmente para quien lo lea por primera vez.

## L-2 — Ninguna métrica de dinero considera la moneda

`orders.currency` existe (`schema.prisma:190`, default `"ARS"`) y lo escribe el webhook desde
`storePreferencesData.currencyCode` (`webhooks/vtex/orders/route.ts:209`), pero **ningún**
`SUM(totalValue)` de la plataforma filtra ni convierte por moneda. Si una org vende en dos monedas,
todos los revenues son la suma de peras y manzanas. *SIN CONFIRMAR* si algún cliente actual lo hace.

## L-3 — `ad_metrics_daily.spend` no tiene columna de moneda

`schema.prisma:405`: `spend Decimal @default(0) @db.Decimal(12,2) // Gasto en USD/moneda` — el propio
comentario admite la ambigüedad. `meta-ads.ts:118,142,211` pide `spend` a la Graph API **sin** pedir
`account_currency` y sin convertir. El ROAS se calcula como `revenue(ARS) / spend(moneda de la cuenta)`
(`metrics/pixel/route.ts:1441`). Si alguna cuenta de Meta o Google factura en USD, el ROAS de ese
canal queda multiplicado por ~1.000. **Pregunta para el fundador** (ver abajo) — no se puede resolver
leyendo código.

## L-4 — `Number()` / `::float` sobre `Decimal(12,2)` de revenue

Patrón ubicuo (`attribution.ts:751`, `domains/orders/index.ts:163`, decenas de `::float` en las queries
de `metrics/pixel/route.ts`). `float8` tiene ~15-16 dígitos significativos; un revenue anual de Arredo
en ARS con 2 decimales ronda los 13. Hoy no rompe, pero no queda margen ante inflación y no hay ningún
motivo para no usar `::text` + `Decimal` como ya hace `/api/metrics/orders`
(`orders/route.ts:225-231`, `::text`) y `finanzas/pulso` (`toNumber`, líneas 42-47).

## L-5 — `Strategy 1` del webhook matchea el orderId por prefijo

`webhooks/vtex/orders/route.ts:471-477`: `props->>'orderId' LIKE ${orderIdBase + '%'}`. Sin ancla al
final ni sufijo. Un `orderId` VTEX que sea prefijo de otro (posible con IDs numéricos secuenciales)
matchea el evento PURCHASE equivocado. Existe `externalIdMatchesEvent()` en
`src/domains/orders/index.ts:202-208` que hace exactamente este match de forma exacta; el webhook no
lo usa.

## L-6 — `pixel_visitor_aliases.oldVisitorId` es único **global**, no por organización

`schema.prisma:754-763`: `@@unique([oldVisitorId])` sin `organizationId`, y
`identity.ts:158-160` resuelve el alias sin filtrar por org. En el caso extremo (mismo cookie
`_np_vid` visto en dos orgs) el alias de la org A redirige el visitante de la org B. Riesgo bajo
(cookie por dominio) pero es una barrera multi-tenant faltante en un `@@unique`.

## L-7 — Los conteos de "assisted revenue" nunca se materializan

`attribution.ts:797-822` calcula `assistedValuePerTP` y **no lo escribe** — la única escritura es
`UPDATE pixel_attributions SET "isAssisted" = false` (línea 808-811). Las columnas
`isAssisted`/`assistedValue` (`schema.prisma:823-824`) quedan en `false`/`0` para todo el universo, y
el índice `@@index([organizationId, isAssisted])` (línea 830) no filtra nada. Código muerto que sugiere
una métrica que no existe.

## L-8 — Claves de API en texto plano en `vercel.json`

`vercel.json:16-136` — `?key=nitrosales-secret-key-2024-production` repetido en las 28 entradas de
cron, commiteado al repo. Fuera del alcance de esta auditoría (dominio del auditor de seguridad), se
menciona porque quedó a la vista al revisar la programación de los rollups.

---

# (a) Resumen severidad × cantidad

| Severidad | Cantidad | Hallazgos |
|---|---|---|
| **CRITICAL** | 5 | C-1 IP-only merge · C-2 Gold sin borrado de huérfanas · C-3 vocabularios del funnel · C-4 discrepancy sin filtro de validez · C-5 atribución congelada ante cambio de monto |
| **HIGH** | 10 | H-1 `/pedidos` fuera del contrato · H-2 touchpoint post-compra · H-3 matching aleatorio en concurrencia · H-4 cobertura del rollup por canal · H-5 tres LTV de cliente · H-6 YTD en UTC · H-7 `bad_packs` Gold vs Bronze · H-8 delta de ROAS · H-9 alertas predictivas sin filtro · H-10 merge por teléfono |
| **MEDIUM** | 11 | M-1 … M-11 |
| **LOW** | 8 | L-1 … L-8 |
| **Total** | **34** | de los cuales **2 ya conocidos** (C-1, H-2 — BACKLOG_PENDIENTES.md:66-67) y **1 parcialmente conocido** (C-4, listado en el backlog del propio DATA_COHERENCE.md) |

---

# (b) Métricas que verifiqué coherentes

Lo que sí está bien y conviene no romper:

1. **`src/domains/orders/index.ts` como contrato.** El diseño es correcto: la versión SQL
   (`ordersValidSql`) y la versión JS (`isOrderValid`) derivan ambas de `ORDER_STATUS_NOT_CONCRETED`
   (líneas 66-78, 158-164), así que no pueden divergir. El problema es la adopción, no el helper.
2. **Parsing de fechas anclado a AR en los endpoints principales.** `metrics/pixel/route.ts:211-216`,
   `metrics/conversion/route.ts:57-59`, `metrics/pnl/route.ts:45-48` y
   `metrics/pixel/funnel/route.ts:147-150` usan todos `T00:00:00.000-03:00` / `T23:59:59.999-03:00`
   de forma consistente, con bordes inclusivos en ambos extremos (`>= from AND <= to`). No encontré
   ninguna mezcla de `<` y `<=` entre endpoints comparables.
3. **El día del rollup es siempre AR.** `(orderDate AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`
   está centralizado en `affected-days.ts:46-51` y replicado idénticamente en los 6 transforms Gold y
   en `rollup-backfill.ts:110` (`ARDAY`). No hay ningún bucket por día UTC.
4. **Filtro de modelo en `pixel_attributions`.** Revisé las 6 superficies que leen esa tabla
   (`metrics/pixel`, `funnel`, `discrepancy`, `sales-by-source`, `sales-by-ad`, `ltv`,
   `nitropixel/asset-stats`, `nitropixel/data-quality-score`): **todas** filtran por `model`. No hay
   ninguna suma ×5 de `attributedValue`. La única excepción es el hardcodeo de `'NITRO'` señalado en
   C-4.
5. **`DISTINCT ON (pa."orderId")` en los rollups de atribución** (`gold-attribution-source-transform.ts:31`,
   `gold-attribution-channel-transform.ts:31`) evita correctamente el ×5 al materializar, y la premisa
   ("touchpoints y attributedValue idénticos entre modelos") es cierta: `attribution.ts:762-789`
   escribe el mismo `touchpoints` y el mismo `totalValue` para los 5.
6. **Exclusión de sesiones sintéticas del webhook.** `WEBHOOK_SESSION_FILTER`
   (`first-source-sql.ts:15`) se aplica consistentemente en los 8 statements de `rollup-backfill.ts`,
   en `getFunnelStages` y en las 4 estrategias de matching del webhook — no encontré ningún camino
   donde los `PURCHASE` sintéticos contaminen métricas de visitantes.
7. **Idempotencia básica del webhook VTEX.** El `isNewOrder` (línea 227) protege correctamente contra
   el doble incremento de `customer.totalOrders`/`totalSpent` en reintentos y cambios de estado
   (líneas 276-282), y `orderItem.deleteMany` antes del re-insert (línea 347) evita items duplicados.
   El problema no es el reintento, es la irreversibilidad (H-5, C-5).
8. **Los 4 rollups Gold basados en Silver tienen el fix de días afectados + borrado de huérfanas**
   correctamente aplicado (`gold-daily-revenue`, `gold-product-sales`, `gold-customer-daily`,
   `gold-order-segments`), con `runStartedAt` tomado del reloj de la base y no de la app
   (`refresh-gold-daily-revenue/route.ts:60-68`) — un detalle que rara vez se hace bien.
9. **`normalizePhone` es determinista y simétrica** entre el ingest y el webhook: ambos caminos usan
   la misma función (`identity.ts:104-137`), así que un match por teléfono no falla por normalización
   asimétrica. El riesgo de H-10 es semántico, no de implementación.
10. **`pixel_daily_channel` hace DELETE-then-insert.** Es el único rollup con canal en la PK que
    maneja bien el cambio de reglas (`rollup-backfill.ts:356-370`). Es el modelo a copiar para C-2.
11. **El motor de reglas de canal ordena de forma determinista**: org antes que global, luego
    prioridad, luego especificidad (`channel-rules.ts:104-119`), con el desempate por especificidad ya
    corregido. No encontré reglas que se pisen de forma no determinista.
12. **`bondly/clientes` y `bondly/churn-risk` usan el contrato** (`ordersValidSql`/`ordersValidWhere`)
    y calculan el LTV al vuelo sobre `orders` en vez de leer la columna que deriva (H-5). Son el
    ejemplo correcto dentro de Bondly.

---

# (c) Las 3 preguntas para el fundador

**1. ¿En qué moneda facturan las cuentas de Meta Ads y Google Ads de Arredo, TeVeCompras, EMDJ y El
Mundo? ¿Alguna en USD?**
`ad_metrics_daily.spend` no tiene columna de moneda (`schema.prisma:405`) y el conector no la pide
(`meta-ads.ts:118`). El ROAS de toda la plataforma es `revenue(ARS) / spend(?)`. Si aunque sea una
cuenta factura en USD, el ROAS de ese canal está mal por un factor de ~1.000 y no hay forma de saberlo
leyendo el código. De la respuesta depende si esto es un LOW documental o un CRITICAL de negocio.

**2. ¿Qué feature flags están efectivamente en `true` hoy en producción: `PIXEL_USE_GOLD`,
`PIXEL_USE_CHANNELS`, `PIXEL_USE_GOLD_CHANNEL`, `ORDERS_USE_GOLD`, `ATTRIBUTION_ROLLUP_ENABLED`?**
Los hallazgos C-2, H-7 y M-7 sólo producen números equivocados **con el flag encendido**; con el flag
apagado el camino Bronze es correcto (más lento) y el problema es latente. No puedo ver las variables
de entorno de Vercel. Si `PIXEL_USE_GOLD_CHANNEL` ya está en `true` para la org grande, C-2 es un
incendio activo; si está en `false`, es una bomba que hay que desarmar antes de prenderla.

**3. ¿Cuándo fue la última vez que se corrió un backfill completo (`?full=1`) de
`gold_attribution_source` y `gold_attribution_channel`, y con qué frecuencia se editan las reglas en
`/pixel/canales`?**
Como esos dos rollups no borran huérfanas (C-2), su estado actual es el acumulado de todo lo que se
canceló, se re-atribuyó fuera de la ventana de 4 días, o cambió de canal desde el último backfill
completo. El delta Gold-vs-Bronje no se puede estimar leyendo código: depende enteramente de ese
historial operativo. Si Tomy edita reglas seguido, la contaminación por doble conteo puede ser grande;
si nunca las tocó desde el último backfill, sólo hay ghost revenue de cancelaciones.

---

_Auditoría de sólo lectura. No se modificó ningún archivo del repositorio ni se ejecutó ninguna query
contra producción._
