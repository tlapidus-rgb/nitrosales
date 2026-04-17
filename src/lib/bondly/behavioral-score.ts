// ═══════════════════════════════════════════════════════════════════
// Bondly · Behavioral LTV Score (V1 heurístico)
// ═══════════════════════════════════════════════════════════════════
//
// Este módulo calcula un score 0-100 de "probabilidad de convertirse
// en VIP" para cada visitante pixel, basado en su comportamiento
// pre-compra. Es la capa diferencial de Bondly LTV: ningún competidor
// (Klaviyo, Lifetimely, Peel, Triple Whale) puede hacer esto porque
// requiere tener una capa pixel propia con identidad cross-device.
//
// IMPORTANTE (IP protection):
//   - Este archivo vive solo del lado servidor. NUNCA se expone al
//     cliente. El endpoint que lo consume devuelve solo `score`,
//     `tier` y `drivers` textuales — jamás los pesos.
//   - El cliente solo ve el score final + "drivers" en lenguaje humano
//     ("Alto engagement", "Origen directo"). No ve coeficientes, no ve
//     la fórmula, no ve los umbrales exactos.
//
// Credibilidad (ver plan Trust Layer):
//   - Basado en investigación de marketing digital sobre señales
//     tempranas de intención de compra (McKinsey, HBR, Google Research).
//   - Recalibración semanal contra conversiones reales.
// ═══════════════════════════════════════════════════════════════════

export type BehavioralTier = "alto" | "medio" | "bajo" | "frio";

export interface BehavioralScoreInput {
  totalSessions: number;
  totalPageViews: number;
  cartAddsLast30d: number;
  uniqueProductsViewed: number;
  source: string | null; // "organic" | "direct" | "paid" | "email" | "referral" | "social" | null
  deviceTypesCount: number; // cuántos devices distintos (1 = consistente)
  daysSinceLastSeen: number | null;
  hasPurchase: boolean;
}

export interface BehavioralScoreResult {
  score: number; // 0-100
  tier: BehavioralTier;
  drivers: string[]; // max 4 textos cortos en lenguaje humano
  decayed: boolean;
}

// ─── Configuración interna (NO exportada, no expuesta al cliente) ──

const WEIGHTS = {
  sessions: 25,
  pvPerSession: 15,
  cartAdds: 25,
  uniqueProducts: 15,
  source: 10,
  deviceConsistency: 10,
} as const;

const DECAY_THRESHOLDS = [
  { days: 30, factor: 0.7 },
  { days: 60, factor: 0.5 },
  { days: 90, factor: 0.3 },
] as const;

const TIER_CUTOFFS = {
  alto: 80,
  medio: 50,
  bajo: 25,
} as const;

// ─── Sub-scorers ────────────────────────────────────────────────────

function scoreSessions(sessions: number): number {
  // Log-scale: 1 sess ~5pts, 3 sess ~14pts, 8 sess ~21pts, 20+ sess = 25pts.
  if (sessions <= 0) return 0;
  const raw = (Math.log(sessions + 1) / Math.log(21)) * WEIGHTS.sessions;
  return Math.min(WEIGHTS.sessions, Math.max(0, raw));
}

function scorePvPerSession(pv: number, sessions: number): number {
  if (sessions <= 0 || pv <= 0) return 0;
  const ratio = pv / sessions;
  // 1 pv/sess = 0, 4 pv/sess = ~12pts, 8+ pv/sess = 15pts.
  const raw = Math.min(1, Math.max(0, (ratio - 1) / 7)) * WEIGHTS.pvPerSession;
  return Math.min(WEIGHTS.pvPerSession, raw);
}

function scoreCartAdds(cartAdds: number): number {
  if (cartAdds <= 0) return 0;
  // Fuerte indicador de intención. 1 cart-add = 10pts, 3 = 20pts, 5+ = 25pts.
  const raw = (Math.log(cartAdds + 1) / Math.log(6)) * WEIGHTS.cartAdds;
  return Math.min(WEIGHTS.cartAdds, raw);
}

function scoreUniqueProducts(unique: number): number {
  if (unique <= 0) return 0;
  // 1 prod = 5pts, 5 prods = 12pts, 10+ prods = 15pts.
  const raw = (Math.log(unique + 1) / Math.log(11)) * WEIGHTS.uniqueProducts;
  return Math.min(WEIGHTS.uniqueProducts, raw);
}

function scoreSource(source: string | null): number {
  if (!source) return 3;
  const s = source.toLowerCase();
  if (s.includes("organic") || s.includes("direct")) return 10;
  if (s.includes("referral")) return 7;
  if (s.includes("email") || s.includes("newsletter")) return 6;
  if (s.includes("social")) return 5;
  if (s.includes("paid") || s.includes("cpc") || s.includes("ads")) return 4;
  return 3;
}

function scoreDeviceConsistency(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 10;
  if (count === 2) return 5;
  return 2;
}

// ─── Core ──────────────────────────────────────────────────────────

export function computeBehavioralScore(
  input: BehavioralScoreInput
): BehavioralScoreResult {
  const sSessions = scoreSessions(input.totalSessions);
  const sPvRatio = scorePvPerSession(input.totalPageViews, input.totalSessions);
  const sCart = scoreCartAdds(input.cartAddsLast30d);
  const sUnique = scoreUniqueProducts(input.uniqueProductsViewed);
  const sSource = scoreSource(input.source);
  const sDevice = scoreDeviceConsistency(input.deviceTypesCount);

  let rawScore = sSessions + sPvRatio + sCart + sUnique + sSource + sDevice;

  // Decay por inactividad — un visitante que no volvió pierde peso
  let decayed = false;
  if (input.daysSinceLastSeen != null && input.daysSinceLastSeen > 0) {
    for (const t of DECAY_THRESHOLDS) {
      if (input.daysSinceLastSeen > t.days) {
        rawScore *= t.factor;
        decayed = true;
        // Solo aplicamos el primer threshold que matchea (el de mayor decay)
        // porque vienen ordenados de menor a mayor. Rompemos en el último.
      }
    }
  }

  // Floor/ceiling
  const score = Math.min(100, Math.max(0, Math.round(rawScore)));

  // Tier
  let tier: BehavioralTier = "frio";
  if (score >= TIER_CUTOFFS.alto) tier = "alto";
  else if (score >= TIER_CUTOFFS.medio) tier = "medio";
  else if (score >= TIER_CUTOFFS.bajo) tier = "bajo";

  // Drivers humanos (max 4) — texto genérico, sin números crudos
  const drivers: string[] = [];
  if (sCart >= 15) drivers.push("Intención alta");
  else if (sCart > 0) drivers.push("Intención media");
  if (sSessions >= 18) drivers.push("Múltiples sesiones");
  else if (sSessions >= 10) drivers.push("Sesiones recurrentes");
  if (sPvRatio >= 10) drivers.push("Alto engagement");
  if (sUnique >= 10) drivers.push("Explora catálogo");
  if (sSource >= 10) drivers.push("Origen directo");
  else if (sSource >= 7) drivers.push("Origen de calidad");
  if (sDevice === 10 && input.totalSessions >= 3) drivers.push("Fiel a un device");
  if (decayed) drivers.push("En enfriamiento");

  // Si no hay drivers fuertes, damos una explicación neutra
  if (drivers.length === 0 && score > 0) drivers.push("Actividad inicial");
  if (drivers.length === 0) drivers.push("Sin señales aún");

  return {
    score,
    tier,
    drivers: drivers.slice(0, 4),
    decayed,
  };
}

// ─── Export de tiers para UI (solo el mapping, no los cutoffs) ────

export const BEHAVIORAL_TIER_LABELS: Record<BehavioralTier, string> = {
  alto: "Alto potencial",
  medio: "Potencial medio",
  bajo: "Potencial bajo",
  frio: "En frío",
};
