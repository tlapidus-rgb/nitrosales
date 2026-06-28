// ══════════════════════════════════════════════════════════════
// Aura — Alta de creador con comisión OBLIGATORIA (lib compartida)
// ══════════════════════════════════════════════════════════════
// Lote 2B · Pieza 3. Crea creador + campaña Always-On + deal de comisión
// de forma ATÓMICA (corre dentro del tx que le pasen). La comisión es
// obligatoria: un creador nunca queda sin campaña ni sin deal de comisión.
//
// Lo consumen DOS llamadores:
//   - POST /api/aura/creators            (alta manual)
//   - PATCH /api/aura/applications/[id]  (aprobar postulación)
//
// ⚠️ Pieza 1 (pendiente OK de Tomy) va a mover la fuente de verdad del % al
// deal con vigencia mensual. HOY se preserva el comportamiento del motor CORE:
// influencer.commissionPercent espeja la del deal (el motor aún lee de ahí).
// NO se toca el motor de atribución acá.
// ══════════════════════════════════════════════════════════════

import { Prisma } from "@prisma/client";
import { validateDealInput } from "@/lib/aura/deal-validation";

// Tipos de deal que LLEVAN comisión (alineado con D1 en aura/campaigns/route.ts).
export const COMMISSION_DEAL_TYPES = ["COMMISSION", "TIERED_COMMISSION", "HYBRID"] as const;

// % por defecto del influencer cuando el deal no fija uno explícito (ej: TIERED).
// Preserva el comportamiento histórico de aprobar-postulación.
const DEFAULT_COMMISSION_PERCENT = 10;

export type DealInput = {
  type?: string;
  name?: string;
  currency?: string;
  notes?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  commissionPercent?: number | null;
  flatAmount?: number | null;
  flatUnit?: string | null;
  bonusAmount?: number | null;
  bonusMetric?: string | null;
  bonusTarget?: number | null;
  tiers?: unknown;
  cpmRate?: number | null;
  productValue?: number | null;
  productDescription?: string | null;
};

export type CreateCreatorInput = {
  organizationId: string;
  name: string;
  email?: string | null;
  deal: DealInput;
};

export type CreateCreatorResult = {
  influencerId: string;
  campaignId: string;
  dealId: string;
  code: string;
};

/** Genera un código base a partir del nombre (kebab sin acentos, ≤20 chars). */
export function slugifyCode(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 20);
}

/**
 * Valida (SIN DB) que el input alcance para dar de alta un creador con comisión
 * OBLIGATORIA: nombre presente, deal presente y de un tipo que lleva comisión
 * (COMMISSION / TIERED_COMMISSION / HYBRID), y la forma del deal coherente (D6/D7).
 * Es testeable sin base de datos.
 */
export function validateCreatorCommissionInput(input: {
  name?: unknown;
  deal?: unknown;
}): { ok: true } | { ok: false; error: string } {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) return { ok: false, error: "Nombre requerido" };

  const deal = input.deal;
  if (!deal || typeof deal !== "object") {
    return {
      ok: false,
      error: "La comisión es obligatoria: se requiere un deal de comisión",
    };
  }
  const type = (deal as { type?: unknown }).type;
  if (
    typeof type !== "string" ||
    !COMMISSION_DEAL_TYPES.includes(type as (typeof COMMISSION_DEAL_TYPES)[number])
  ) {
    return {
      ok: false,
      error: `La comisión es obligatoria: el deal debe ser de tipo ${COMMISSION_DEAL_TYPES.join(", ")}`,
    };
  }
  // Coherencia de la forma del deal (% en rango, campos requeridos por type, tiers, etc.)
  const formCheck = validateDealInput(deal);
  if (!formCheck.ok) return formCheck;

  return { ok: true };
}

/** Genera un código único dentro de la org (sufija con número si hay colisión). */
async function generateUniqueCode(
  tx: Prisma.TransactionClient,
  organizationId: string,
  name: string,
): Promise<string> {
  const base = slugifyCode(name) || "creator";
  let code = base;
  let tries = 0;
  while (tries < 20) {
    const clash = await tx.influencer.findUnique({
      where: { organizationId_code: { organizationId, code } },
      select: { id: true },
    });
    if (!clash) break;
    tries++;
    code = `${base}${tries}`;
  }
  return code;
}

/**
 * Crea creador + campaña Always-On + deal de comisión, ATÓMICO.
 * DEBE correr dentro de un tx (prisma.$transaction). Validar antes con
 * validateCreatorCommissionInput — esta función asume el input ya válido.
 */
export async function createCreatorWithCommission(
  tx: Prisma.TransactionClient,
  input: CreateCreatorInput,
): Promise<CreateCreatorResult> {
  const { organizationId, deal } = input;
  const name = input.name.trim();

  // El motor CORE aún lee influencer.commissionPercent → lo espejamos del deal
  // para COMMISSION/HYBRID; TIERED y otros caen al default (Pieza 1 lo migrará).
  const infCommission =
    (deal.type === "COMMISSION" || deal.type === "HYBRID") && deal.commissionPercent != null
      ? Number(deal.commissionPercent)
      : DEFAULT_COMMISSION_PERCENT;

  const code = await generateUniqueCode(tx, organizationId, name);

  const influencer = await tx.influencer.create({
    data: {
      organizationId,
      name,
      code,
      email: input.email ?? null,
      commissionPercent: infCommission,
      status: "ACTIVE",
    },
    select: { id: true },
  });

  const campaign = await tx.influencerCampaign.create({
    data: {
      organizationId,
      influencerId: influencer.id,
      name: `Always On · ${name}`,
      description: "Campaña base creada automáticamente al dar de alta al creador.",
      startDate: new Date(),
      isAlwaysOn: true,
      status: "ACTIVE",
    },
    select: { id: true },
  });

  // dealData con any (consistente con el resto del repo): se arma campo a campo.
  const dealData: any = {
    organizationId,
    influencerId: influencer.id,
    campaignId: campaign.id,
    name: (deal.name || "").trim() || `Deal inicial · ${name}`,
    type: deal.type,
    status: "ACTIVE",
    currency: deal.currency || "ARS",
    notes: deal.notes || null,
    startDate: deal.startDate ? new Date(deal.startDate) : new Date(),
    endDate: deal.endDate ? new Date(deal.endDate) : null,
  };
  if (deal.commissionPercent != null) dealData.commissionPercent = Number(deal.commissionPercent);
  if (deal.flatAmount != null) dealData.flatAmount = Number(deal.flatAmount);
  if (deal.flatUnit) dealData.flatUnit = deal.flatUnit;
  if (deal.bonusAmount != null) dealData.bonusAmount = Number(deal.bonusAmount);
  if (deal.bonusMetric) dealData.bonusMetric = deal.bonusMetric;
  if (deal.bonusTarget != null) dealData.bonusTarget = Number(deal.bonusTarget);
  if (deal.tiers) dealData.tiers = deal.tiers;
  if (deal.cpmRate != null) dealData.cpmRate = Number(deal.cpmRate);
  if (deal.productValue != null) dealData.productValue = Number(deal.productValue);
  if (deal.productDescription) dealData.productDescription = deal.productDescription;

  const createdDeal = await tx.influencerDeal.create({
    data: dealData,
    select: { id: true },
  });

  return {
    influencerId: influencer.id,
    campaignId: campaign.id,
    dealId: createdDeal.id,
    code,
  };
}
