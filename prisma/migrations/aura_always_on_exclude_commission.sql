-- ═══════════════════════════════════════════════════════════════════
-- Migration: Aura — isAlwaysOn + excludeFromCommission columns
-- ═══════════════════════════════════════════════════════════════════
-- Contexto: la reestructuración de deals → campañas necesita:
--   1. influencer_campaigns.isAlwaysOn  → marca la campaña base creada al aprobar
--   2. influencer_deals.excludeFromCommission → excluye ventas del cálculo UTM
--
-- IDEMPOTENTE: correrlo 2 veces es no-op gracias a IF NOT EXISTS.
--
-- Ejecutar via endpoint admin (después del deploy):
--   curl "https://nitrosales.vercel.app/api/admin/migrate-aura-columns?key=<NEXTAUTH_SECRET>"
-- ═══════════════════════════════════════════════════════════════════

-- 1. Columna isAlwaysOn en influencer_campaigns
ALTER TABLE "influencer_campaigns"
  ADD COLUMN IF NOT EXISTS "isAlwaysOn" BOOLEAN NOT NULL DEFAULT false;

-- 2. Columna excludeFromCommission en influencer_deals
ALTER TABLE "influencer_deals"
  ADD COLUMN IF NOT EXISTS "excludeFromCommission" BOOLEAN NOT NULL DEFAULT false;
