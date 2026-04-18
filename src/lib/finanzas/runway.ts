// ═══════════════════════════════════════════════════════════════════
// Cash Runway — cálculo puro (sin React, sin fetch, sin DB)
// ═══════════════════════════════════════════════════════════════════
// Estima cuántos meses de caja quedan dado el P&L YTD y el burn rate
// de los últimos 90 días.
//
// Fórmula V1 (Fase 1a — automático):
//
//   cashBalanceAuto = revenueYTD
//                   − cogsYTD
//                   − shippingYTD
//                   − adSpendYTD
//                   − manualCostsYTD
//
//   burnRate30d = (cogs90d + shipping90d + adSpend90d + manualCosts90d) / 3
//
//   monthsRemaining = cashBalance / burnRate30d
//
// Fase 1e extiende con override manual: si `manualOverride` viene en
// los inputs, reemplaza cashBalanceAuto a efectos del runway.
//
// Caveat importante: este cálculo es contabilidad devengada, no caja
// real. Ignora inventario comprado vs vendido, retiros del socio,
// impuestos, retenciones ML, timing de cobros. Por eso existe el
// override manual (Fase 1e) para que Tomy corrija con su saldo real.
//
// Thresholds:
//   > 6 meses → safe    (🟢)
//   3 – 6 meses → warn  (🟠)
//   < 3 meses → critical (🔴)
//
// Nunca lanza — siempre devuelve un `RunwayData` válido. Si los inputs
// son 0 o negativos, el status cae a "critical" y monthsRemaining = 0.
// ═══════════════════════════════════════════════════════════════════

import type { RunwayData, RunwayInputs, RunwayStatus } from "@/types/finanzas";

const THRESHOLD_SAFE_MONTHS = 6;
const THRESHOLD_WARN_MONTHS = 3;

function classifyStatus(monthsRemaining: number): RunwayStatus {
  if (!Number.isFinite(monthsRemaining) || monthsRemaining <= 0) return "critical";
  if (monthsRemaining < THRESHOLD_WARN_MONTHS) return "critical";
  if (monthsRemaining < THRESHOLD_SAFE_MONTHS) return "warn";
  return "safe";
}

function safeNumber(v: number | null | undefined): number {
  if (v === null || v === undefined || !Number.isFinite(v)) return 0;
  return v;
}

export function calculateCashRunway(inputs: RunwayInputs): RunwayData {
  const revenueYTD = safeNumber(inputs.revenueYTD);
  const cogsYTD = safeNumber(inputs.cogsYTD);
  const shippingYTD = safeNumber(inputs.shippingYTD);
  const adSpendYTD = safeNumber(inputs.adSpendYTD);
  const manualCostsYTD = safeNumber(inputs.manualCostsYTD);

  const cogs90d = safeNumber(inputs.cogs90d);
  const shipping90d = safeNumber(inputs.shipping90d);
  const adSpend90d = safeNumber(inputs.adSpend90d);
  const manualCosts90d = safeNumber(inputs.manualCosts90d);

  // Costos YTD totales (gasto acumulado del año)
  const costosYTD = cogsYTD + shippingYTD + adSpendYTD + manualCostsYTD;

  // Cálculo automático (siempre se devuelve como referencia)
  const cashBalanceAuto = revenueYTD - costosYTD;

  // Burn rate mensual promedio sobre los últimos 90 días (~3 meses)
  const totalBurn90d = cogs90d + shipping90d + adSpend90d + manualCosts90d;
  const burnRate30d = totalBurn90d / 3;

  // Determinar cashBalance final (override manual > automático)
  const override = inputs.manualOverride;
  const useManual = !!override && Number.isFinite(override.amount);
  const cashBalance = useManual ? Number(override.amount) : cashBalanceAuto;
  const source = useManual ? "manual" : "auto";

  // Meses restantes. Si burnRate == 0 (primer día del negocio) devolvemos
  // Infinity → status "safe" con monthsRemaining = 999 (capeado).
  let monthsRemaining: number;
  if (burnRate30d <= 0) {
    monthsRemaining = cashBalance > 0 ? 999 : 0;
  } else {
    monthsRemaining = cashBalance / burnRate30d;
  }

  // Capear para UI (más de 999 meses no tiene sentido mostrarlo)
  if (monthsRemaining > 999) monthsRemaining = 999;
  if (monthsRemaining < 0) monthsRemaining = 0;

  const status = classifyStatus(monthsRemaining);

  const today = new Date();
  const asOfDate = today.toISOString().substring(0, 10);

  return {
    source,
    cashBalance,
    cashBalanceAuto,
    burnRate30d,
    monthsRemaining,
    status,
    breakdown: {
      revenueYTD,
      costosYTD,
      cogsYTD,
      shippingYTD,
      adSpendYTD,
      manualCostsYTD,
    },
    asOfDate,
  };
}

// ─────────────────────────────────────────────────────────────
// Helper UI: color de status
// ─────────────────────────────────────────────────────────────
export function statusToColor(status: RunwayStatus): {
  fg: string;
  bg: string;
  ring: string;
  label: string;
} {
  switch (status) {
    case "safe":
      return {
        fg: "#065f46", // emerald-800
        bg: "rgba(16,185,129,0.08)",
        ring: "rgba(16,185,129,0.35)",
        label: "Saludable",
      };
    case "warn":
      return {
        fg: "#9a3412", // orange-800
        bg: "rgba(249,115,22,0.08)",
        ring: "rgba(249,115,22,0.4)",
        label: "Atención",
      };
    case "critical":
      return {
        fg: "#991b1b", // red-800
        bg: "rgba(239,68,68,0.08)",
        ring: "rgba(239,68,68,0.4)",
        label: "Crítico",
      };
  }
}
