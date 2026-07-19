-- ══════════════════════════════════════════════════════════════════════════
-- Dimensión: vtex_category — id de categoría VTEX → nombre legible
-- ══════════════════════════════════════════════════════════════════════════
-- POR QUÉ EXISTE (2026-07-18):
--   `products.category` guarda `item.additionalInfo.categoriesIds` del webhook de
--   órdenes (webhooks/vtex/orders:396), que son IDs: "/1/11/" significa
--   categoría 1 > categoría 11. Los nombres legibles solo los devuelve la API de
--   catálogo, que nunca corrió para Arredo. Resultado: las tablas de CR muestran
--   "/1/11/" en vez de "Sábanas".
--
--   Existe `products.categoryPath` en el esquema (Sesión 20) para el texto
--   legible, pero NADIE la escribe.
--
-- POR QUÉ UNA DIMENSIÓN Y NO ARREGLAR `products`:
--   Mismo criterio que vtex_sku_product: escribir en `products` activaría la cola
--   de desactivación de sync/catalog:154-165. Esta tabla no toca nada existente.
--
-- ⚠️ CORRER MANUALMENTE EN NEON. Idempotente.
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS vtex_category (
  "organizationId" text        NOT NULL,
  category_id      text        NOT NULL,   -- id numérico de VTEX, como texto
  name             text        NOT NULL,   -- "Sábanas"
  full_path        text,                   -- "Ropa de cama > Sábanas"
  refreshed_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("organizationId", category_id)
);
