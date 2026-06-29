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

-- ── Pieza 1 (paso 1+2) — vigencia mensual del % de comisión (2026-06-28) ──
-- Tabla additive: el motor todavia NO lee de aca (el switch del engine es el paso 3).
CREATE TABLE IF NOT EXISTS influencer_deal_commission_rates (
  id TEXT PRIMARY KEY,
  "dealId" TEXT NOT NULL,
  "commissionPercent" DECIMAL(5,2) NOT NULL,
  "effectiveFrom" DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "organizationId" TEXT NOT NULL,
  CONSTRAINT "influencer_deal_commission_rates_dealId_fkey"
    FOREIGN KEY ("dealId") REFERENCES influencer_deals(id) ON UPDATE NO ACTION ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "influencer_deal_commission_rates_dealId_effectiveFrom_idx" ON influencer_deal_commission_rates ("dealId", "effectiveFrom");
CREATE INDEX IF NOT EXISTS "influencer_deal_commission_rates_organizationId_idx" ON influencer_deal_commission_rates ("organizationId");

-- Backfill: 1 fila por deal de comision ACTIVO, % = el que el motor usa hoy (influencer.commissionPercent),
-- effectiveFrom = 1° del mes de creacion del deal. Idempotente.
INSERT INTO influencer_deal_commission_rates (id, "dealId", "commissionPercent", "effectiveFrom", "organizationId", "createdAt")
SELECT gen_random_uuid()::text, d.id, i."commissionPercent", date_trunc('month', d."createdAt")::date, d."organizationId", CURRENT_TIMESTAMP
FROM influencer_deals d
JOIN influencers i ON i.id = d."influencerId"
WHERE d.status='ACTIVE' AND d.type IN ('COMMISSION','TIERED_COMMISSION','HYBRID')
  AND NOT EXISTS (SELECT 1 FROM influencer_deal_commission_rates r WHERE r."dealId" = d.id);
