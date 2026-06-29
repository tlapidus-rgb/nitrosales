-- ══════════════════════════════════════════════════════════════
-- Aura — endurecimiento de DB anti-doble-pago + integridad (2026-06-28)
-- ══════════════════════════════════════════════════════════════
-- Aplicado en prod 2026-06-28. Idempotente (IF NOT EXISTS / DROP IF EXISTS).
-- Prisma no expresa índices parciales → se gestionan acá por SQL.
-- Las FK RESTRICT también están reflejadas en schema.prisma (onDelete: Restrict)
-- para que un `prisma db push` no las revierta.

-- D1 — solo 1 deal de comisión ACTIVO por creador (guard físico contra el doble pago).
CREATE UNIQUE INDEX IF NOT EXISTS influencer_deals_one_active_commission
  ON influencer_deals ("organizationId", "influencerId")
  WHERE status = 'ACTIVE' AND type IN ('COMMISSION','TIERED_COMMISSION','HYBRID');

-- D3 — 1 payout por (org, deal, período) en PENDING/PAID (dealId no nulo).
CREATE UNIQUE INDEX IF NOT EXISTS payouts_dedup_deal_period
  ON payouts ("organizationId", "dealId", "periodStart", "periodEnd")
  WHERE status IN ('PENDING','PAID') AND "dealId" IS NOT NULL;

-- Always-On — un creador, una sola campaña base.
CREATE UNIQUE INDEX IF NOT EXISTS influencer_campaigns_one_always_on
  ON influencer_campaigns ("influencerId")
  WHERE "isAlwaysOn" = true;

-- FK SET NULL → RESTRICT: borrar un deal/campaña no debe dejar registros financieros huérfanos
-- ni corromper el scope de atribución. (Borrar creador/org sí cascadea: esas FK no se tocan.)
ALTER TABLE payouts DROP CONSTRAINT IF EXISTS "payouts_dealId_fkey";
ALTER TABLE payouts ADD CONSTRAINT "payouts_dealId_fkey"
  FOREIGN KEY ("dealId") REFERENCES influencer_deals(id) ON UPDATE NO ACTION ON DELETE RESTRICT;

ALTER TABLE payouts DROP CONSTRAINT IF EXISTS "payouts_campaignId_fkey";
ALTER TABLE payouts ADD CONSTRAINT "payouts_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES influencer_campaigns(id) ON UPDATE NO ACTION ON DELETE RESTRICT;

ALTER TABLE influencer_deals DROP CONSTRAINT IF EXISTS "influencer_deals_campaignId_fkey";
ALTER TABLE influencer_deals ADD CONSTRAINT "influencer_deals_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES influencer_campaigns(id) ON UPDATE NO ACTION ON DELETE RESTRICT;
