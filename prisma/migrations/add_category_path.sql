-- ═══════════════════════════════════════════════════════════════════
-- Migration: add Product.categoryPath column (Sesion 20)
-- ═══════════════════════════════════════════════════════════════════
-- Contexto: el campo `category` solo guarda la categoria hoja del
-- arbol de VTEX. Este campo nuevo guarda el path completo (ej:
-- "Juguetes > Bebes > Sonajeros") para permitir agrupacion
-- categoria > subcategoria en el dashboard de rentabilidad.
--
-- IDEMPOTENTE: correrlo 2 veces es no-op gracias a IF NOT EXISTS.
--
-- Ejecutar (opcion A - desde terminal local):
--   cd ~/Desktop/nitrosales
--   npx prisma db execute --file prisma/migrations/add_category_path.sql --schema prisma/schema.prisma
--
-- Ejecutar (opcion B - via endpoint admin, despues del deploy):
--   curl "https://app.nitrosales.io/api/admin/migrate-category-path?key=<NEXTAUTH_SECRET>"
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "categoryPath" TEXT;

-- Index opcional (no creo ahora, no vale la pena sin volumen de queries por path):
-- CREATE INDEX IF NOT EXISTS "products_categoryPath_idx" ON "products"("categoryPath");
