-- ═══════════════════════════════════════════════════════════════════
-- Migration: Aura — seguidores POR RED en influencer_applications
-- ═══════════════════════════════════════════════════════════════════
-- Contexto (reunión Tomy): en el form de aplicación pública, los seguidores
-- se cargan POR red social (al lado del @), no como un rango total. Se agregan
-- 3 columnas Int nullable; la columna legacy `followers` (rango total) se deja
-- para las aplicaciones viejas.
--
-- IDEMPOTENTE: correrlo 2 veces es no-op gracias a IF NOT EXISTS.
--
-- Ejecutar via endpoint admin (después del deploy):
--   curl "https://<host>/api/admin/migrate-application-followers?key=<NEXTAUTH_SECRET>"
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE "influencer_applications"
  ADD COLUMN IF NOT EXISTS "instagramFollowers" INTEGER,
  ADD COLUMN IF NOT EXISTS "tiktokFollowers" INTEGER,
  ADD COLUMN IF NOT EXISTS "youtubeFollowers" INTEGER;
