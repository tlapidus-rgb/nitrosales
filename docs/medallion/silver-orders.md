# Silver: `silver_orders` — diseño y plan de migración

> Fase 2 del `PLAN_ARQUITECTURA_MODULAR_MONOLITO.md` (§6.2). Prepara la primera tabla Silver.
> **Estado: preparado, NO aplicado.** La creación de tabla + backfill los corre el equipo en Neon
> (Vercel no migra DB — §13). Todo lo que no toca DB está hecho y verificado en branch.

## Qué resuelve
- **Elimina los `LATERAL`** de `metrics/orders` y `metrics/pixel` (el anti-patrón que timeoutea): device/channel/flags quedan pre-computados como columnas.
- **Corta el drift "12 vs 16"** a nivel datos: `is_valid`/`is_web` se calculan **una sola vez**, desde el contrato, y se guardan. Serve deja de recomputar el filtro en cada query.
- Tablas más chicas que Bronze → caben en cache de Neon, con índices por `(org, orderDate)`.

## Artefactos (en `src/data/silver/`)
| Archivo | Qué | Corre en DB? |
|---|---|---|
| `silver-orders.schema.sql` | `CREATE TABLE silver_orders` + índices | **Sí, en Neon (manual)** |
| `silver-orders-transform.ts` | `buildSilverOrdersUpsert()`: el UPSERT incremental generado **desde el contrato** | No (genera SQL) |
| `silver-orders-transform.test.ts` | Anti-drift: los flags salen de `ordersValidSql`/`ordersWebSql`, no a mano | No (test) |

## La clave anti-drift
`is_valid` y `is_web` **no están escritos a mano en ningún lado**. El transform los genera con `ordersValidSql("o")` y `ordersWebSql("o")` del contrato (`src/domains/orders`). Si el contrato cambia, Silver cambia con él. El test lo hace cumplir. Es la misma garantía que el guard del contrato, pero en la capa de datos.

## Pasos (en orden)

### Paso 1 — Crear la tabla (equipo, en Neon)
Correr `src/data/silver/silver-orders.schema.sql` en la consola de Neon (prod). Idempotente (`IF NOT EXISTS`). No toca `orders` (Bronze) ni nada existente.

### Paso 2 — Job incremental Bronze→Silver (yo lo cableo; corre cuando la tabla exista)
Un cron (ej. extender `refresh-pixel-rollups` o uno nuevo `refresh-silver-orders`) que, por cada org activa, ejecute:
```ts
await prisma.$executeRawUnsafe(buildSilverOrdersUpsert(), orgId, sinceISO);
```
- **Incremental:** `sinceISO` = ahora − ventana (ej. últimos 3 días) para el corriente; para el backfill inicial, `sinceISO` = época.
- **Idempotente:** `ON CONFLICT (id) DO UPDATE` → correr de más no duplica ni corrompe.
- **Resumible:** por org y por rango de fechas → si se corta, se re-corre el rango afectado sin degradar Neon (lección Arredo, §2).

### Paso 3 — Verificación de paridad (BDD, antes de que Serve lea Silver)
Antes de cambiar ninguna ruta, validar que Silver == contrato sobre los mismos datos:
```sql
-- debe dar 0: ninguna orden donde el flag de Silver difiera del contrato en Bronze
SELECT count(*) FROM silver_orders s JOIN orders o ON o.id = s.id
WHERE s.is_valid <> (o.status::text NOT IN ('CANCELLED','PENDING','RETURNED') AND o."totalValue" > 0);
```
(La misma idea del escenario cross-surface de `orden-valida.feature`, ahora contra datos reales.)

### Paso 4 — Migrar Serve a leer Silver (una ruta a la vez, ratchet)
- `metrics/orders`: cambiar el count/sum de órdenes válidas a `SELECT ... FROM silver_orders WHERE organization_id=$1 AND is_valid AND order_date BETWEEN ...` → **adiós LATERAL**.
- A medida que cada ruta deja de tocar `pixel_events`/`orders` crudo, **se saca del allowlist** de `check-serve-gold-first.mjs` (ratchet down).

## Lo que NO se toca
- El contrato (`domains/orders`) es la fuente; Silver lo consume.
- `orders` (Bronze) queda intacto: Silver es derivado y regenerable (se puede `TRUNCATE silver_orders` y re-backfillear sin perder nada).
- CORE atribución: fuera de este scope.
