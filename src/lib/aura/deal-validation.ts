// ══════════════════════════════════════════════════════════════
// Aura — validación de input de deals (ROBUSTEZ, D6/D7)
// ══════════════════════════════════════════════════════════════
// Rechaza inputs IMPOSIBLES antes de tocar la DB: % fuera de 0-100,
// montos negativos, type sin su campo requerido, tiers malformados/NaN/
// rangos invertidos. Es robustez pura — NO decide reglas de negocio.
//
// ⚠️ NO valida "1 comisión activa por creador" (eso es D1, decisión de
// diseño aparte / requiere OK de Tomy). Acá solo se valida la FORMA del input.
// ══════════════════════════════════════════════════════════════
import { z } from "zod";

const tierSchema = z
  .object({
    minRevenue: z.coerce.number().min(0),
    maxRevenue: z.coerce.number().positive().nullish(),
    commissionPercent: z.coerce.number().min(0).max(100),
    label: z.string().optional(),
  })
  .refine((t) => t.maxRevenue == null || t.maxRevenue > t.minRevenue, {
    message: "Tier inválido: maxRevenue debe ser mayor que minRevenue",
  });

// passthrough: solo validamos los campos de plata/coherencia; el resto del body
// (name, influencerId, campaignId, etc.) lo siguen validando los endpoints.
const dealSchema = z
  .object({
    type: z.string(),
    commissionPercent: z.coerce.number().min(0).max(100).nullish(),
    flatAmount: z.coerce.number().positive().nullish(),
    bonusAmount: z.coerce.number().positive().nullish(),
    bonusTarget: z.coerce.number().positive().nullish(),
    cpmRate: z.coerce.number().positive().nullish(),
    productValue: z.coerce.number().positive().nullish(),
    tiers: z.array(tierSchema).nullish(),
  })
  .passthrough()
  .superRefine((d, ctx) => {
    const requireMsg = (bad: boolean, message: string) => {
      if (bad) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    };
    // Coherencia type ↔ campo requerido (un deal incoherente es imposible de pagar).
    if (d.type === "COMMISSION") requireMsg(d.commissionPercent == null, "COMMISSION requiere commissionPercent (0-100)");
    if (d.type === "FLAT_FEE") requireMsg(d.flatAmount == null, "FLAT_FEE requiere flatAmount > 0");
    if (d.type === "CPM") requireMsg(d.cpmRate == null, "CPM requiere cpmRate > 0");
    if (d.type === "TIERED_COMMISSION") requireMsg(!d.tiers || d.tiers.length === 0, "TIERED_COMMISSION requiere al menos un tier válido");
    if (d.type === "PERFORMANCE_BONUS") requireMsg(d.bonusAmount == null || d.bonusTarget == null, "PERFORMANCE_BONUS requiere bonusAmount y bonusTarget");
    if (d.type === "HYBRID") requireMsg(d.commissionPercent == null && d.flatAmount == null && d.bonusAmount == null, "HYBRID requiere al menos comisión, flat o bonus");
  });

/** Valida la forma del input de un deal. Devuelve el primer error legible, o ok. */
export function validateDealInput(body: unknown): { ok: true } | { ok: false; error: string } {
  const r = dealSchema.safeParse(body);
  if (r.success) return { ok: true };
  return { ok: false, error: r.error.issues[0]?.message || "Input de deal inválido" };
}
