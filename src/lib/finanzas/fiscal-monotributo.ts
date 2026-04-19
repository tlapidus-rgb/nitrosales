// ═══════════════════════════════════════════════════════════════════
// fiscal-monotributo.ts — Fase 6d
// ═══════════════════════════════════════════════════════════════════
// Rule engine deterministico para alertas Monotributo + sugerencia
// de régimen. 100% TS puro, sin LLM, sin DB, sin fetch. Sigue el
// patrón de narrative.ts (ver Fase 1d).
//
// Inputs: facturación real últimos 12m + fiscalProfile.
// Outputs: alertas Monotributo + sugerencia (mantener / recategorizar
// / pasar a RI).
// ═══════════════════════════════════════════════════════════════════

import {
  MONOTRIBUTO_AMOUNTS,
  MONOTRIBUTO_LIMITS,
} from "./fiscal-calendar";

export type RegimeSuggestion =
  | "STAY"                    // no hay alerta
  | "RECATEGORIZE_UP"         // subir categoria dentro de Monotributo
  | "RECATEGORIZE_DOWN"       // bajar categoria (ahorro)
  | "UPGRADE_TO_RI"           // pasar a Responsable Inscripto
  | "CONSIDER_RI";            // cerca del tope K, evaluar

export type AlertSeverity = "info" | "warning" | "critical";

export interface MonotributoAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  body: string;
  cta?: string;
  suggestion: RegimeSuggestion;
}

export interface MonotributoAnalysisInput {
  currentCategory: string;                 // A..K
  projectedRevenue12m: number;             // ARS proyectado proximos 12m
  actualRevenueLast12m: number;            // ARS reales ultimos 12m
  monthlyRevenueSeries?: number[];         // opcional, para trend check
}

export interface MonotributoAnalysis {
  currentCategory: string;
  currentLimit: number;
  currentMonthlyAmount: number;
  suggestedCategory: string | null;
  utilizationPct: number;                  // 0..100+ (puede pasar 100 si se excede)
  monthsToExceed: number | null;           // null si no se proyecta exceder
  suggestion: RegimeSuggestion;
  alerts: MonotributoAlert[];
  headline: string;
}

const CATEGORY_ORDER = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"];

function findSuggestedCategory(
  projectedRevenue: number,
  currentCategory: string
): string | null {
  // Recorre desde la actual hacia arriba — encuentra la primera que cubre.
  // Si ninguna cubre, devuelve null (= pasa a RI).
  const startIdx = CATEGORY_ORDER.indexOf(currentCategory);
  if (startIdx === -1) return null;
  for (let i = 0; i < CATEGORY_ORDER.length; i++) {
    const cat = CATEGORY_ORDER[i];
    if (MONOTRIBUTO_LIMITS[cat] >= projectedRevenue) {
      return cat;
    }
  }
  return null;
}

function catCompare(a: string, b: string): number {
  return CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b);
}

/**
 * Analiza el estado actual del Monotributo y devuelve alertas +
 * sugerencia de régimen.
 */
export function analyzeMonotributo(
  input: MonotributoAnalysisInput
): MonotributoAnalysis {
  const {
    currentCategory,
    projectedRevenue12m,
    actualRevenueLast12m,
    monthlyRevenueSeries,
  } = input;

  const currentLimit = MONOTRIBUTO_LIMITS[currentCategory] ?? 0;
  const currentMonthlyAmount = MONOTRIBUTO_AMOUNTS[currentCategory] ?? 0;

  // Utilization basada en proyeccion (mas util que el real para accionar)
  const utilizationPct =
    currentLimit > 0
      ? (projectedRevenue12m / currentLimit) * 100
      : 0;

  // Suggested category
  const suggestedCategory = findSuggestedCategory(
    projectedRevenue12m,
    currentCategory
  );

  // Months to exceed: cuantos meses faltan a ritmo actual para romper tope
  let monthsToExceed: number | null = null;
  if (monthlyRevenueSeries && monthlyRevenueSeries.length >= 3) {
    // Usamos el promedio de los ultimos 3 meses como ritmo actual
    const last3 = monthlyRevenueSeries.slice(-3);
    const monthlyPace = last3.reduce((a, b) => a + b, 0) / 3;
    if (monthlyPace > 0 && actualRevenueLast12m < currentLimit) {
      const remaining = currentLimit - actualRevenueLast12m;
      const months = remaining / monthlyPace;
      monthsToExceed = months > 0 && months < 36 ? months : null;
    } else if (actualRevenueLast12m >= currentLimit) {
      monthsToExceed = 0;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Rule engine
  // ─────────────────────────────────────────────────────────────
  let suggestion: RegimeSuggestion = "STAY";
  const alerts: MonotributoAlert[] = [];
  let headline = `Categoría ${currentCategory}, margen de holgura`;

  // Regla 1 — ya excedió el tope de la categoría
  if (utilizationPct >= 100) {
    if (!suggestedCategory) {
      suggestion = "UPGRADE_TO_RI";
      headline = `Excediste el tope del Monotributo. Corresponde pasar a RI`;
      alerts.push({
        id: "mono_exceeded_topcat",
        severity: "critical",
        title: "Facturación supera Monotributo K",
        body: `Tu facturación proyectada ($${fmtK(projectedRevenue12m)}) supera el tope de la categoría K ($${fmtK(MONOTRIBUTO_LIMITS.K)}). Tenés que inscribirte en IVA + Ganancias.`,
        cta: "Consultar con tu contador para pasar a RI",
        suggestion: "UPGRADE_TO_RI",
      });
    } else if (suggestedCategory !== currentCategory) {
      suggestion = "RECATEGORIZE_UP";
      headline = `Recategorización urgente a ${suggestedCategory}`;
      alerts.push({
        id: "mono_recategorize_up_now",
        severity: "critical",
        title: `Recategorizar a ${suggestedCategory}`,
        body: `Excediste el tope de ${currentCategory} ($${fmtK(currentLimit)}). Proyectado $${fmtK(projectedRevenue12m)} encaja en ${suggestedCategory} ($${fmtK(MONOTRIBUTO_LIMITS[suggestedCategory])}).`,
        cta: `Recategorizar en AFIP a ${suggestedCategory}`,
        suggestion: "RECATEGORIZE_UP",
      });
    }
  }
  // Regla 2 — utilization 85-100%, aviso de alerta
  else if (utilizationPct >= 85) {
    if (currentCategory === "K" || !suggestedCategory) {
      suggestion = "CONSIDER_RI";
      headline = `Cerca del tope K — empezá a evaluar RI`;
      alerts.push({
        id: "mono_near_topcat",
        severity: "warning",
        title: "Cerca del tope del Monotributo",
        body: `Estás al ${Math.round(utilizationPct)}% de la categoría K. Si la tendencia sigue, en 2-3 meses tenés que pasar a RI.`,
        cta: "Preparar transición a RI con tu contador",
        suggestion: "CONSIDER_RI",
      });
    } else {
      suggestion = "RECATEGORIZE_UP";
      headline = `Estás al ${Math.round(utilizationPct)}% de cat. ${currentCategory}`;
      alerts.push({
        id: "mono_near_limit_up",
        severity: "warning",
        title: `Preparate para recategorizar a ${suggestedCategory}`,
        body: `Estás al ${Math.round(utilizationPct)}% del tope de ${currentCategory}. En la próxima recategorización cuatrimestral vas a pasar a ${suggestedCategory}.`,
        cta: `Agendar recategorización a ${suggestedCategory}`,
        suggestion: "RECATEGORIZE_UP",
      });
    }
  }
  // Regla 3 — utilization < 40%, podrías bajar categoría
  else if (
    utilizationPct < 40 &&
    currentCategory !== "A" &&
    suggestedCategory &&
    catCompare(suggestedCategory, currentCategory) < 0
  ) {
    suggestion = "RECATEGORIZE_DOWN";
    const savings =
      (currentMonthlyAmount - (MONOTRIBUTO_AMOUNTS[suggestedCategory] ?? 0)) *
      12;
    headline = `Podrías bajar a cat. ${suggestedCategory} y ahorrar`;
    alerts.push({
      id: "mono_recategorize_down",
      severity: "info",
      title: `Considerá bajar a ${suggestedCategory}`,
      body: `Tu facturación proyectada ($${fmtK(projectedRevenue12m)}) encaja holgada en ${suggestedCategory}. Ahorrarías ~$${fmtK(savings)} al año.`,
      cta: `Recategorizar a ${suggestedCategory} en próxima evaluación`,
      suggestion: "RECATEGORIZE_DOWN",
    });
  }
  // Regla 4 — por encima de categoría pero aún dentro de Monotributo
  else if (suggestedCategory && catCompare(suggestedCategory, currentCategory) > 0) {
    suggestion = "RECATEGORIZE_UP";
    headline = `Tendencia indica mover a ${suggestedCategory}`;
    alerts.push({
      id: "mono_trending_up",
      severity: "info",
      title: `Tendencia hacia ${suggestedCategory}`,
      body: `A ritmo actual, en 6 meses te conviene estar en ${suggestedCategory}. No urgente todavía.`,
      suggestion: "RECATEGORIZE_UP",
    });
  }

  // Regla 5 — alert de recategorización próxima (info)
  if (alerts.length === 0) {
    alerts.push({
      id: "mono_healthy",
      severity: "info",
      title: `Monotributo ${currentCategory} dentro del rango`,
      body: `Facturación proyectada en ${Math.round(utilizationPct)}% del tope. Próxima recategorización obligatoria: ene/may/sep.`,
      suggestion: "STAY",
    });
  }

  return {
    currentCategory,
    currentLimit,
    currentMonthlyAmount,
    suggestedCategory,
    utilizationPct,
    monthsToExceed,
    suggestion,
    alerts,
    headline,
  };
}

function fmtK(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return `${Math.round(v)}`;
}
