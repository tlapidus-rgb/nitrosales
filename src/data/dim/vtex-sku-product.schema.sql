-- ══════════════════════════════════════════════════════════════════════════
-- Dimensión: vtex_sku_product — mapa skuId ⇄ productId de VTEX
-- ══════════════════════════════════════════════════════════════════════════
-- POR QUÉ EXISTE (bug 2026-07-18):
--   `products.externalId` guarda DOS identificadores distintos de VTEX según qué
--   código creó la fila:
--     · sync/catalog         → p.productId (producto PADRE)
--     · webhooks/vtex/orders → item.id     (skuId, la VARIANTE)   ⛔ CORE PROTEGIDO
--   El NitroPixel emite el productId del padre. Ambos son numéricos de ~5 dígitos,
--   así que un ~24% COLISIONA POR AZAR y el JOIN parecía andar mientras emparejaba
--   productos DISTINTOS: el CR de "Juego de Sábanas" se mostraba en "Alfombra de Baño".
--
-- POR QUÉ UNA TABLA APARTE Y NO UNA COLUMNA EN `products`:
--   Escribir en `products` activaría la cola de desactivación de
--   sync/catalog:154-165, que desactivaría TODO el catálogo del cliente (verificado).
--   Esta tabla no toca ninguna tabla existente. El rollback es DROP TABLE.
--
-- GRANO: una fila por SKU. Un productId aparece N veces (una por variante) — es
-- correcto y esperado. El plegado a grano producto lo hace
-- `foldPurchasesToProductGrain` en src/lib/pixel/product-id-map.ts.
--
-- ⚠️ CORRER MANUALMENTE EN NEON (Vercel no migra DB). Idempotente.
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS vtex_sku_product (
  "organizationId" text        NOT NULL,
  sku_id           text        NOT NULL,   -- = products."externalId" (lo que referencian los order_items)
  product_id       text        NOT NULL,   -- = pixel_daily_product.product_id (lo que emite el pixel)
  refreshed_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("organizationId", sku_id)
);

-- Lectura del pixel: dado un product_id, traer sus sku_ids.
CREATE INDEX IF NOT EXISTS idx_vtex_sku_product_pid
  ON vtex_sku_product ("organizationId", product_id);

-- Frontera del backfill reanudable: procesar primero lo que hace más tiempo no
-- se refresca (mismo patrón que sync/inventory).
CREATE INDEX IF NOT EXISTS idx_vtex_sku_product_refreshed
  ON vtex_sku_product ("organizationId", refreshed_at);
