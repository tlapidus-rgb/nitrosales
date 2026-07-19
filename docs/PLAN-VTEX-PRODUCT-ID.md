# Plan — reconciliar el ID de producto de VTEX (pixel ⇄ catálogo)

> Estado: REVISADO (`/plan-eng-review` 2026-07-18). Listo para implementar.
> Org verificada: Arredo (`cmohl80fx009j1sdusurp7fbj`).

## Problema

`products.externalId` guarda **dos identificadores distintos de VTEX** según qué código
creó la fila:

| Escritor | Qué guarda | Archivo |
|---|---|---|
| Sync de catálogo | `p.productId` (**productId** = producto padre) | `src/app/api/sync/catalog/route.ts:100` |
| Webhook de órdenes | `item.id` (**skuId** = variante) | `src/app/api/webhooks/vtex/orders/route.ts:350` ⛔ CORE PROTEGIDO |

El NitroPixel emite `props->>'productId'` (productId del padre).

**No es un ID mal guardado: son dos GRANOS distintos.** La documentación de VTEX es
explícita — `productId` identifica el producto padre, `skuId` cada variante. Por eso el
pixel ve 853 productos y las órdenes 2008.

## Evidencia (medida en Neon prod, 2026-07-18)

- `products` de Arredo: **6931 filas, 0 con `stockUpdatedAt`** → el sync de catálogo
  **nunca corrió**. El 100% del catálogo lo creó el webhook de órdenes (keyed by skuId).
- `sync/catalog` **no está en `vercel.json`** — nunca se agendó.
- Pixel 30d: 853 productos vistos; VTEX vendió 2008 distintos.
- De los 853 del pixel, solo 210 existen en `products`... y **son colisiones numéricas**:
  para el id `14444` el pixel dice "Juego de Sábanas Postal playa" y el catálogo dice
  "Alfombra de Baño Rayas Verticales Color Ocre". **Ninguna fila de la muestra de 15
  coincidió en nombre.**
- `matchean_por_sku = 0` (los `sku` del catálogo son alfanuméricos: `52001B76789%BO`).
- `ADD_TO_CART` aporta solo +36 productos → recuperarlo NO resuelve nada.
- 787.575 de 1.731.186 eventos `VIEW_PRODUCT` (46%) **no traen `productId`** (sí `productName`).
- Bug aparte confirmado: viewers y purchases tenían cada uno su `LIMIT 500` ordenado por
  criterios distintos. Intersección sin límites = 14, con los dos LIMIT = **0**.

### Impacto: no es data faltante, es data INCORRECTA
Las ~210 filas que hoy muestran CR atribuyen las visitas de un producto a otro.

## Decisiones de la review

| # | Decisión |
|---|---|
| D3 | Las tablas de CR van a **grano producto**: sumar ventas de todos los SKUs. |
| D12 | **Tabla de mapeo aparte. NO se toca `products`.** Separa el incidente vivo del proyecto de catálogo. |
| D13 | **Paso 0: ocultar ya** las filas con cruce no verificado. Shippable solo. |
| D14 | Cruce **al LEER** contra la tabla de mapeo (revierte D8: cero desactualización, sin re-proceso). |
| D15 | Helper compartido **solo para las tablas de CR**. `metrics/products` mantiene su grano SKU (corrige D6). |
| D7 | Medir cuántos `productName` son unívocos ANTES de decidir si recuperar el 46%. |
| D9 | Backfill **reanudable por frontera**, como el fix de `sync/inventory`. |
| D10 | Cobertura completa de los caminos identificados. |

## Diseño

```
  pixel_events (VIEW_PRODUCT, props->>'productId' = productId del PADRE)
        │
        ▼
  pixel_daily_product (org, day, product_id, viewers_hll)   ← sin cambios
        │
        │  JOIN al leer (D14)
        ▼
  vtex_sku_product (organizationId, sku_id, product_id)     ← TABLA NUEVA
        │            poblada desde GetProductAndSkuIds
        │  sku_id = products.externalId
        ▼
  products (keyed by skuId)  ──►  order_items  ──►  ventas
                                   agregadas a grano PRODUCTO (D3)
```

**Por qué tabla aparte y no una columna en `products`:** elimina de un saque cuatro modos
de fallar verificados en el código — la cola de desactivación, el fan-out de revenue, el
riesgo de credenciales cruzadas entre clientes y el de throughput. El rollback es borrar
una tabla nueva.

## Pasos

### Paso 0 — Ocultar las filas incorrectas (independiente, hoy)
Suprimir del CR los productos cuyo cruce no esté verificado. Un `WHERE`. Corta el único
daño real: un cliente decidiendo sobre datos falsos.

### Paso 1 — Tabla de mapeo
```sql
CREATE TABLE IF NOT EXISTS vtex_sku_product (
  "organizationId" text NOT NULL,
  sku_id           text NOT NULL,
  product_id       text NOT NULL,
  refreshed_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("organizationId", sku_id)
);
CREATE INDEX IF NOT EXISTS idx_vtex_sku_product_pid
  ON vtex_sku_product ("organizationId", product_id);
```

### Paso 2 — Backfill reanudable
Endpoint admin que lee **`/api/catalog_system/pvt/products/GetProductAndSkuIds`** (el
endpoint privado, que ES el mapa productId→skuIds, pagina bien e **incluye productos
inactivos**).

⚠️ **NO usar `products/search`** (el público que usa `sync/catalog`): pagina hasta ~2500 y
solo devuelve productos visibles en storefront → los descontinuados que sí se vendieron
nunca se mapearían.

Reanudable por frontera (patrón de `sync/inventory`), idempotente, `ON CONFLICT DO UPDATE`.
Org **explícita por parámetro** — no `getOrganizationId()`.

### Paso 3 — Helper compartido de CR (grano producto)
Un módulo que resuelve visitantes-vs-compradores, consumido por `metrics/conversion` y
`metrics/pixel`. Incluye el fix del doble LIMIT en ambos.

### Paso 4 — `metrics/products`
Solo el fix del cruce roto. **Mantiene grano SKU y su unión VTEX+MELI** (decisión de la
Sesión 22, deliberada y documentada en el código).

## NOT in scope (diferido a propósito)

| Diferido | Por qué |
|---|---|
| Completar el catálogo con productos nunca vendidos | Es el proyecto 2. Ahí viven los 6 blockers: desactivación masiva, credenciales cruzadas, throughput, ambigüedad de org, fan-out, constraint de sku. |
| Arreglar y agendar `sync/catalog` | Idem. No hace falta para resolver el incidente. |
| Modificar `webhooks/vtex/orders` | ⛔ CORE PROTEGIDO — requiere autorización del fundador. |
| Recuperar el 46% de vistas sin `productId` | Gateado por la medición de D7. Puede terminar siendo un fix del snippet (Tomy). |
| Recuperar `ADD_TO_CART` | Medido: aporta +36 productos. No vale el trabajo. |
| Re-proceso de 90 días del rollup (D11) | Ya no aplica: con cruce al leer (D14) no hay nada que re-procesar. |

## What already exists (reusar, no reconstruir)

| Existe | Estado |
|---|---|
| `src/lib/products/upsert-by-sku.ts` | Escrito en Sesión 21 contra este mismo problema. **No lo usamos en este plan** (no tocamos `products`), pero es la pieza central del proyecto 2. `sync/catalog:117` hoy lo viola llamando a `prisma.product.upsert` directo. |
| Patrón de frontera de `sync/inventory` | Se reusa en el paso 2 para la reanudación. |
| `touchpoint-source-sql.ts`, `gold-attribution-sql.ts` | Precedente de helper SQL compartido; el paso 3 sigue ese patrón. |
| `crPct` (tope 100%) en `metrics/conversion` | Ya existe, se mueve al helper. |

## Verificación (criterios de aceptación)

Consultas para correr en Neon, **no tests unitarios** — el riesgo está en la semántica del
JOIN y el grano, y eso los mocks no lo agarran:

1. **Fan-out:** `SELECT product_id, COUNT(*) FROM vtex_sku_product GROUP BY 1 HAVING COUNT(*) > 1` — esperado: muchos (es correcto, N SKUs por producto). El helper debe agregarlos a UNA fila.
2. **Invariante de revenue:** el total de las tablas de CR antes y después del cambio debe ser **idéntico**. Si sube, hay fan-out multiplicando.
3. **Verificación por NOMBRE, no por conteo:** para 15 productos cruzados, `productName` del pixel debe coincidir con `products.name`. Es el criterio que detectó las colisiones; el conteo solo, no.
4. **Cobertura:** cuántos de los 853 ids del pixel resuelven vía la tabla de mapeo.
5. **MELI intacto:** `metrics/products` debe seguir devolviendo ~5.436 SKUs.

## Rollback

- Paso 0: revertir un `WHERE`.
- Paso 1-2: `DROP TABLE vtex_sku_product`. Nada más lo referencia hasta el paso 3.
- Pasos 3-4: revertir el deploy. **Cero escrituras en tablas existentes en todo el plan.**

## Implementation Tasks
Sintetizadas de los hallazgos de la review. Cada tarea sale de un hallazgo concreto.

- [ ] **T1 (P1, human: ~1h / CC: ~10min)** — metrics/conversion + metrics/pixel — Ocultar las filas con cruce no verificado
  - Surfaced by: D13 / outside voice #13 — 210 filas muestran el CR de otro producto a un cliente real
  - Files: `src/app/api/metrics/conversion/route.ts`, `src/app/api/metrics/pixel/route.ts`
  - Verify: las tablas de CR de Arredo no muestran ninguna fila cuyo id no resuelva
- [ ] **T2 (P1, human: ~2h / CC: ~15min)** — data — Crear `vtex_sku_product` + índice
  - Surfaced by: D12 — tabla de mapeo aparte en vez de columna en `products`
  - Files: `src/data/dim/vtex-sku-product.schema.sql` (SQL lo corre el usuario en Neon)
  - Verify: tabla creada, vacía, nada la referencia todavía
- [ ] **T3 (P1, human: ~1d / CC: ~40min)** — sync — Backfill reanudable desde `GetProductAndSkuIds`
  - Surfaced by: D9 + outside voice #2 — `products/search` pagina hasta ~2500 y omite inactivos
  - Files: `src/app/api/admin/backfill-sku-product-map/route.ts`
  - Verify: dos corridas seguidas continúan sin repetir; estado final idéntico
- [ ] **T4 (P1, human: ~1d / CC: ~40min)** — metrics — Helper de CR a grano producto + fix del doble LIMIT
  - Surfaced by: D3 + D6 + regresión verificada (14 sin límites vs 0 con los dos LIMIT)
  - Files: `src/lib/pixel/cr-product-sql.ts`, `metrics/conversion`, `metrics/pixel`
  - Verify: las dos pantallas dan el mismo número para el mismo producto y rango
- [ ] **T5 (P2, human: ~3h / CC: ~20min)** — metrics/products — Fix del cruce manteniendo grano SKU
  - Surfaced by: D15 / outside voice #4 — une VTEX+MELI por SKU a propósito
  - Files: `src/app/api/metrics/products/route.ts`
  - Verify: sigue devolviendo ~5.436 SKUs; los visitantes de MELI no desaparecen
- [ ] **T6 (P1, human: ~30min / CC: ~5min)** — verificación — Queries de aceptación en Neon
  - Surfaced by: outside voice #3 + #11 — el fan-out infla revenue y los mocks no lo agarran
  - Files: `docs/RUNBOOK-SKU-PRODUCT-MAP.md`
  - Verify: invariante de revenue antes/después idéntico; 15 nombres cruzados coinciden
- [ ] **T7 (P2, human: ~2h / CC: ~15min)** — medición — Cuántos `productName` son unívocos
  - Surfaced by: D7 — decide si se recupera el 46% de vistas sin `productId`
  - Files: (solo query)
  - Verify: número medido antes de escribir cualquier matcher por nombre
- [ ] **T8 (P1, human: ~2d / CC: ~45min)** — tests — Cobertura de los caminos del plan
  - Surfaced by: D10 — hoy hay 0 tests sobre productos, catálogo o conversión
  - Files: `src/lib/pixel/cr-product-sql.test.ts`, `src/app/api/admin/backfill-sku-product-map/*.test.ts`
  - Verify: `npx vitest run` verde, incluida la regresión del doble LIMIT

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clean | 32 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**CROSS-MODEL:** la voz externa (subagente Claude — Codex no instalado) aportó 13 hallazgos; 4 verificados contra el código y adoptados, revirtiendo 3 decisiones de la review propia (D6 → helper solo para CR, D8 → cruce al leer, D4/D5 → tabla aparte sin tocar `products`). El hallazgo de mayor severidad — la cola de desactivación de `sync/catalog:154-165` — quedó fuera de alcance al elegir la tabla de mapeo, y documentado en `TODOS.md`.

**VERDICT:** ENG CLEARED — listo para implementar.

NO UNRESOLVED DECISIONS
