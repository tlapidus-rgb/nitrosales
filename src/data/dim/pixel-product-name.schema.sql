-- ══════════════════════════════════════════════════════════════════════════
-- Dimensión: pixel_product_name — nombre de ficha → productId
-- ══════════════════════════════════════════════════════════════════════════
-- POR QUÉ EXISTE (2026-07-18):
--   El 46% de los eventos VIEW_PRODUCT de Arredo NO traen `productId`
--   (770.538 de 1.731.186 en 30 días) pero SÍ traen `productName`. Esas visitas
--   no se le pueden asignar a ningún producto, así que el denominador del CR
--   queda sistemáticamente por debajo y **todo el CR aparece inflado**.
--
--   El diccionario lo tiene el propio pixel: el 54% de los eventos trae nombre
--   Y id. Medido en Arredo: 819 de 850 nombres (96,4%) son UNÍVOCOS, y con
--   ellos se recuperan 513.066 de los 770.538 eventos huérfanos (66,6%).
--
-- ⚠️ SOLO NOMBRES UNÍVOCOS. Un nombre que apunta a dos productIds distintos se
--   EXCLUYE: atribuir por un nombre ambiguo nos devolvería exactamente al bug
--   que acabamos de arreglar (visitas asignadas al producto equivocado).
--
-- ⚠️ CORRER MANUALMENTE EN NEON. Idempotente.
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pixel_product_name (
  "organizationId" text        NOT NULL,
  product_name     text        NOT NULL,
  product_id       text        NOT NULL,
  refreshed_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("organizationId", product_name)
);
