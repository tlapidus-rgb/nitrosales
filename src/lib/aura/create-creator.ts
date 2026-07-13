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
import { sendEmail } from "@/lib/email/send";
import { affiliateOnboardingEmail } from "@/lib/email/templates";
import { signSetPasswordToken, passwordFingerprint } from "@/lib/aura/set-password-token";

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
  email?: unknown;
  deal?: unknown;
}): { ok: true } | { ok: false; error: string } {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) return { ok: false, error: "Nombre requerido" };

  // Email OBLIGATORIO: el onboarding (link de set-password) se manda por mail; sin email
  // el creador nunca recibe su acceso. Mismo formato que el apply público.
  const email = typeof input.email === "string" ? input.email.trim() : "";
  if (!email) return { ok: false, error: "Email requerido (se le manda su acceso por mail)" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Email inválido" };
  }

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

/**
 * Valida el input mínimo para el alta SIN comisión (item 9, reunión Tomy
 * 08/07/26): nombre + email. La comisión ya NO se pide al dar de alta — se
 * asigna después por campaña ("Comenzar campaña"). Testeable sin DB.
 */
export function validateCreatorSimpleInput(input: {
  name?: unknown;
  email?: unknown;
}): { ok: true } | { ok: false; error: string } {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) return { ok: false, error: "Nombre requerido" };
  const email = typeof input.email === "string" ? input.email.trim() : "";
  if (!email) return { ok: false, error: "Email requerido (se le manda su acceso por mail)" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Email inválido" };
  return { ok: true };
}

/**
 * Alta de creador SIN comisión (item 9). Crea SOLO el influencer con
 * commissionPercent = 0 (sin campaña ni deal). La comisión y las campañas se
 * asignan después con "Comenzar campaña", que actualiza influencer.commissionPercent.
 * DEBE correr dentro de un tx.
 */
export async function createCreatorSimple(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; name: string; email?: string | null },
): Promise<{ influencerId: string; code: string }> {
  const name = input.name.trim();
  const code = await generateUniqueCode(tx, input.organizationId, name);
  const influencer = await tx.influencer.create({
    data: {
      organizationId: input.organizationId,
      name,
      code,
      email: input.email ?? null,
      commissionPercent: 0, // sin comisión hasta que una campaña se la asigne
      status: "ACTIVE",
    },
    select: { id: true },
  });
  return { influencerId: influencer.id, code };
}

/** Base URL para los links del mail (mismo resolver que el dashboard existente).
 *
 * ⚠️ En PREVIEW (deploy de branch) Neon crea una DB branch separada: el creador de
 * prueba vive en la DB del preview. Si el link apunta a prod (app.nitrosales.ai), el
 * set-password busca al creador en la DB de prod y da "No encontrado". Por eso en
 * preview linkeamos al PROPIO deployment (misma DB branch donde se creó). En prod,
 * comportamiento idéntico al anterior. */
function appBaseUrl(): string {
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "https://app.nitrosales.ai";
}

/**
 * Manda el mail de onboarding con el LINK de set-password (Opción B; la clave NO viaja).
 * DEBE llamarse DESPUÉS del commit de la transacción (no dentro), envuelto en waitUntil por el
 * caller. Fire-and-forget con fallo VISIBLE: sendEmail no tira, así que se chequea r.ok y se
 * loguea con creatorId+email. Nunca rompe el alta (todo va en try/catch).
 */
export async function sendOnboardingEmail(input: {
  influencerId: string;
  organizationId: string;
  name: string;
  email: string;
  code: string;
  dashboardPassword: string | null;
  orgSlug: string;
  orgName: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = signSetPasswordToken({
      influencerId: input.influencerId,
      organizationId: input.organizationId,
      code: input.code,
      pwFingerprint: passwordFingerprint(input.dashboardPassword),
    });
    const link = `${appBaseUrl()}/i/${input.orgSlug}/${input.code}/set-password?token=${encodeURIComponent(token)}`;
    const { subject, html } = affiliateOnboardingEmail(input.name, input.orgName, link);
    const r = await sendEmail({ to: input.email, subject, html, context: "aura.creator.onboarding" });
    if (!r.ok) {
      // Fallo VISIBLE (para el caso fire-and-forget donde nadie chequea el return).
      console.error(
        `[aura/onboarding-email] envío FALLÓ (creador ${input.influencerId} / ${input.email}): ${r.error}`,
      );
    }
    return { ok: r.ok, error: r.error };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[aura/onboarding-email] excepción (creador ${input.influencerId} / ${input.email}):`,
      msg,
    );
    return { ok: false, error: msg };
  }
}
