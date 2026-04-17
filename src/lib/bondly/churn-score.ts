// ═══════════════════════════════════════════════════════════════════
// Bondly · Churn Risk Score (composite)
// ═══════════════════════════════════════════════════════════════════
//
// Score 0-100 de "probabilidad de churn" por cliente. 0 = safe,
// 100 = altísimo riesgo de no volver a comprar.
//
// Componentes y pesos (normalizados al total disponible):
//   - Días desde última compra (40%)
//   - Tendencia de frecuencia de compra (25%)
//   - Engagement pixel reciente (20%)
//   - Tendencia de AOV (15%)
//
// Cuando una señal no está disponible (ej. sin pixel), se descarta y
// se renormaliza el peso restante. Esto evita penalizar a clientes que
// simplemente no tienen data en ese eje.
//
// Server-side only. No se expone al cliente, solo el score final +
// tier + razones textuales.
// ═══════════════════════════════════════════════════════════════════

export type ChurnTier = "critico" | "alto" | "medio" | "bajo";

export interface ChurnScoreInput {
  daysSinceLastOrder: number;
  medianDaysBetweenOrders: number | null; // null si solo 1 orden
  ordersLast90d: number;
  ordersPrev90d: number | null;
  aovLast90d: number | null;
  aovPrev90d: number | null;
  pixelSessionsLast30d: number | null; // null si customer no tiene pixel ligado
  pixelSessionsPrev30d: number | null;
}

export interface ChurnScoreResult {
  score: number; // 0-100
  tier: ChurnTier;
  reasons: string[]; // max 3 textos humanos
  availableSignals: number; // cuántas señales entraron al score (1-4)
}

const BASE_WEIGHTS = {
  recency: 40,
  frequency: 25,
  pixelEngagement: 20,
  aovTrend: 15,
} as const;

const TIER_CUTOFFS = {
  critico: 75,
  alto: 55,
  medio: 30,
} as const;

// ─── Sub-scorers (cada uno devuelve 0-1, donde 1 = max riesgo) ────

function recencyRisk(
  daysSinceLastOrder: number,
  medianDaysBetweenOrders: number | null
): number {
  // Si tenemos la frecuencia típica del cliente, normalizamos contra eso.
  // Ejemplo: si el cliente compra cada 30 días y pasaron 90, risk=3x → alto.
  const baseline = medianDaysBetweenOrders && medianDaysBetweenOrders > 0
    ? medianDaysBetweenOrders
    : 45; // fallback "default shop"
  const ratio = daysSinceLastOrder / baseline;
  // ratio <=1 → 0, ratio>=4 → 1, interp lineal
  if (ratio <= 1) return 0;
  if (ratio >= 4) return 1;
  return (ratio - 1) / 3;
}

function frequencyRisk(
  ordersLast90d: number,
  ordersPrev90d: number | null
): number {
  if (ordersPrev90d == null || ordersPrev90d <= 0) return 0.3; // neutral si no hay comparable
  const delta = ordersLast90d - ordersPrev90d;
  // Cayó: risk alto. Subió: risk bajo. Igual: medio-bajo.
  if (delta >= 0) return Math.max(0, 0.2 - delta * 0.05); // 0 si subió mucho
  const drop = Math.abs(delta) / ordersPrev90d; // fracción perdida
  if (drop >= 1) return 1;
  return Math.min(1, 0.3 + drop * 0.7);
}

function pixelEngagementRisk(
  sessionsLast30d: number | null,
  sessionsPrev30d: number | null
): number | null {
  if (sessionsLast30d == null || sessionsPrev30d == null) return null;
  if (sessionsPrev30d === 0 && sessionsLast30d === 0) return 0.5; // no engagement en ambos
  if (sessionsPrev30d === 0) return 0.2; // arrancó a engagearse → bajo riesgo
  if (sessionsLast30d === 0) return 1; // se apagó → max riesgo
  const drop = 1 - sessionsLast30d / sessionsPrev30d;
  if (drop <= 0) return 0.1; // creció
  return Math.min(1, drop);
}

function aovTrendRisk(
  aovLast90d: number | null,
  aovPrev90d: number | null
): number | null {
  if (aovLast90d == null || aovPrev90d == null || aovPrev90d <= 0) return null;
  const delta = (aovLast90d - aovPrev90d) / aovPrev90d;
  // Caída fuerte en AOV = señal débil-a-moderada de churn
  if (delta >= 0) return 0;
  if (delta <= -0.5) return 1;
  return Math.abs(delta) * 2; // -50% drop = 1.0
}

// ─── Core ──────────────────────────────────────────────────────────

export function computeChurnScore(input: ChurnScoreInput): ChurnScoreResult {
  const scores: Array<{ weight: number; risk: number; kind: string }> = [];

  const rRisk = recencyRisk(input.daysSinceLastOrder, input.medianDaysBetweenOrders);
  scores.push({ weight: BASE_WEIGHTS.recency, risk: rRisk, kind: "recency" });

  const fRisk = frequencyRisk(input.ordersLast90d, input.ordersPrev90d);
  scores.push({ weight: BASE_WEIGHTS.frequency, risk: fRisk, kind: "frequency" });

  const pRisk = pixelEngagementRisk(
    input.pixelSessionsLast30d,
    input.pixelSessionsPrev30d
  );
  if (pRisk != null) {
    scores.push({ weight: BASE_WEIGHTS.pixelEngagement, risk: pRisk, kind: "pixel" });
  }

  const aRisk = aovTrendRisk(input.aovLast90d, input.aovPrev90d);
  if (aRisk != null) {
    scores.push({ weight: BASE_WEIGHTS.aovTrend, risk: aRisk, kind: "aov" });
  }

  const totalWeight = scores.reduce((acc, s) => acc + s.weight, 0);
  const weightedSum = scores.reduce((acc, s) => acc + s.risk * s.weight, 0);
  const rawScore = totalWeight > 0 ? (weightedSum / totalWeight) * 100 : 0;
  const score = Math.min(100, Math.max(0, Math.round(rawScore)));

  let tier: ChurnTier = "bajo";
  if (score >= TIER_CUTOFFS.critico) tier = "critico";
  else if (score >= TIER_CUTOFFS.alto) tier = "alto";
  else if (score >= TIER_CUTOFFS.medio) tier = "medio";

  // Razones humanas (max 3, ordenadas por contribución)
  const sorted = [...scores].sort(
    (a, b) => b.risk * b.weight - a.risk * a.weight
  );
  const reasons: string[] = [];
  for (const s of sorted.slice(0, 3)) {
    if (s.risk < 0.3) continue;
    switch (s.kind) {
      case "recency":
        reasons.push(
          input.medianDaysBetweenOrders
            ? `${input.daysSinceLastOrder}d sin comprar (vs patrón de ${Math.round(input.medianDaysBetweenOrders)}d)`
            : `${input.daysSinceLastOrder} días sin comprar`
        );
        break;
      case "frequency":
        reasons.push("Cayó la frecuencia de compra");
        break;
      case "pixel":
        reasons.push("Dejó de visitar el sitio");
        break;
      case "aov":
        reasons.push("Bajó el ticket promedio");
        break;
    }
  }
  if (reasons.length === 0) reasons.push("Sin señales de riesgo");

  return {
    score,
    tier,
    reasons,
    availableSignals: scores.length,
  };
}

export const CHURN_TIER_LABELS: Record<ChurnTier, string> = {
  critico: "Crítico",
  alto: "Alto",
  medio: "Medio",
  bajo: "Bajo",
};
