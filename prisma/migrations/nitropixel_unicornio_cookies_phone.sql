-- ══════════════════════════════════════════════════════════════
-- NitroPixel — Unicornio Migration
-- ══════════════════════════════════════════════════════════════
-- Adds real Meta cookie snapshots (_fbc/_fbp) + phone matching.
--
-- SAFETY NOTES:
--   • All new columns are NULLABLE → PostgreSQL 11+ applies them
--     in O(1) with no table rewrite. Zero downtime, zero lock
--     on reads or writes for existing rows.
--   • The new index uses CREATE INDEX CONCURRENTLY so that writes
--     to pixel_visitors are NEVER blocked while the index builds.
--     It may take a few minutes on a large table but the pixel
--     keeps ingesting events normally the entire time.
--   • Safe to run multiple times (IF NOT EXISTS guards).
--
-- HOW TO APPLY (one command, from a shell with DATABASE_URL set):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--        -f prisma/migrations/nitropixel_unicornio_cookies_phone.sql
--
-- Or via Neon console: paste the statements below.
-- ══════════════════════════════════════════════════════════════

-- 1) Add nullable columns to pixel_visitors (instant in PG 11+)
ALTER TABLE "pixel_visitors"
  ADD COLUMN IF NOT EXISTS "phone"    TEXT,
  ADD COLUMN IF NOT EXISTS "metaFbc"  TEXT,
  ADD COLUMN IF NOT EXISTS "metaFbp"  TEXT;

-- 2) Add nullable columns to pixel_events (instant in PG 11+)
ALTER TABLE "pixel_events"
  ADD COLUMN IF NOT EXISTS "metaFbc" TEXT,
  ADD COLUMN IF NOT EXISTS "metaFbp" TEXT;

-- 3) Build phone index WITHOUT blocking writes.
--    CONCURRENTLY cannot run inside a transaction block, so if you
--    paste this into Neon SQL Editor run each statement separately,
--    or use the psql -f command above (which doesn't wrap in a txn).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "pixel_visitors_organizationId_phone_idx"
  ON "pixel_visitors" ("organizationId", "phone");
