-- ══════════════════════════════════════════════════════════════
-- Aura: teléfono de creador + ventana de atribución por campaña
-- (hotfixes feedback 2026-07-15)
-- ══════════════════════════════════════════════════════════════
-- Idempotente. YA CORRIDO EN PROD (Neon, 2026-07-16) por el usuario;
-- este archivo existe para paridad de otros entornos (preview/dev/DR).
--
-- 1) Influencer.phone — teléfono del creador (obligatorio solo en altas
--    nuevas, a nivel app; filas viejas quedan NULL).
ALTER TABLE "influencers" ADD COLUMN IF NOT EXISTS "phone" TEXT;

-- 2) InfluencerCampaign.attributionWindowDays — ventana de atribución de
--    la campaña (1-180 días). NULL = hereda la ventana del creador.
ALTER TABLE "influencer_campaigns" ADD COLUMN IF NOT EXISTS "attributionWindowDays" INTEGER;
