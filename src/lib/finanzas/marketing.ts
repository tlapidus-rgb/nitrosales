// ═══════════════════════════════════════════════════════════════════
// Marketing Financiero — helpers puros (sin React, sin fetch, sin DB)
// ═══════════════════════════════════════════════════════════════════
// Toma los datos crudos de /api/metrics/ltv (LTV, CAC, customers por
// canal) y los transforma en las filas que espera la portada de Pulso:
//
//   - ltvCacRatio: LTV / CAC
//   - paybackMonths: 12 × CAC / LTV   (asume ciclo de vida ≈ 12 meses)
//   - health: "healthy" | "warning" | "unprofitable"
//
// Thresholds (referencia: ecommerce LATAM con inflación argentina):
//
//   LTV:CAC >= 3   → healthy
//   LTV:CAC >= 1.5 → warning
//   LTV:CAC <  1.5 → unprofitable
//
//   Payback <= 6m  → healthy
//   Payback <= 12m → warning
//   Payback >  12m → unprofitable
//
// La salud final es el peor de los dos. Si CAC = 0 (canal orgánico) no
// se considera "unprofitable" — se marca como healthy con payback null
// y ratio null (no medible por diseño).
//
// Caveat importante: el payback usa una asunción simple de lifespan de
// 12 meses. Para mayor precisión habría que calcularlo con cohort
// revenue cumulativo (ya está en /api/metrics/ltv como `cohortRevenue`)
// pero para el MVP esta aproximación es suficientemente buena.
// ═══════════════════════════════════════════════════════════════════

import type {
  ChannelHealth,
  MarketingChannelRow,
  MarketingFinanceData,
} from "@/types/finanzas";

const LIFESPAN_MONTHS = 12;

const HEALTHY_LTV_CAC = 3;
const WARNING_LTV_CAC = 1.5;

const HEALTHY_PAYBACK = 6;
const WARNING_PAYBACK = 12;

function safeNum(v: unknown, fallback = 0): number {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ─────────────────────────────────────────────────────────────
// Health de un canal individual
// ─────────────────────────────────────────────────────────────
export function classifyChannelHealth(params: {
  ltv: number;
  cac: number;
  paybackMonths: number | null;
  ltvCacRatio: number | null;
}): ChannelHealth {
  const { cac, paybackMonths, ltvCacRatio } = params;

  // Canales sin spend (orgánico, directo) — health=healthy por default
  // no se puede clasificar como unprofitable porque CAC=0.
  if (cac <= 0) return "healthy";

  let ratioHealth: ChannelHealth;
  if (ltvCacRatio === null) ratioHealth = "unprofitable";
  else if (ltvCacRatio >= HEALTHY_LTV_CAC) ratioHealth = "healthy";
  else if (ltvCacRatio >= WARNING_LTV_CAC) ratioHealth = "warning";
  else ratioHealth = "unprofitable";

  let paybackHealth: ChannelHealth;
  if (paybackMonths === null) paybackHealth = ratioHealth; // fallback
  else if (paybackMonths <= HEALTHY_PAYBACK) paybackHealth = "healthy";
  else if (paybackMonths <= WARNING_PAYBACK) paybackHealth = "warning";
  else paybackHealth = "unprofitable";

  // Peor de los dos
  const order: Record<ChannelHealth, number> = {
    healthy: 0,
    warning: 1,
    unprofitable: 2,
  };
  return order[ratioHealth] >= order[paybackHealth] ? ratioHealth : paybackHealth;
}

// ─────────────────────────────────────────────────────────────
// Transforma la respuesta de /api/metrics/ltv en la estructura
// que espera la portada de Pulso.
// ─────────────────────────────────────────────────────────────
export interface LtvApiChannelRow {
  channel: string;
  customers: number;
  avgLtv: number;
  spend?: number;
  cac?: number;
  ltvCac?: number;
  totalRevenue?: number;
  avgOrders?: number;
}

export interface LtvApiSummary {
  avgLtv: number;
  globalCac: number;
  globalLtvCac: number;
}

export function buildMarketingFinance(params: {
  byChannel: LtvApiChannelRow[];
  summary: LtvApiSummary;
  // Mapa opcional de spend por plataforma para fallback en canales
  // que no tienen spend en el byChannel (ej: acá metemos Meta/Google
  // agregado si hace falta). Por ahora no se usa pero queda la puerta.
}): MarketingFinanceData {
  const rows: MarketingChannelRow[] = params.byChannel
    .filter((ch) => ch.customers > 0 || (ch.spend ?? 0) > 0)
    .map((ch) => {
      const cac = safeNum(ch.cac);
      const ltv = safeNum(ch.avgLtv);
      const ltvCacRatio = cac > 0 ? Math.round((ltv / cac) * 100) / 100 : null;
      const paybackMonths =
        cac > 0 && ltv > 0
          ? Math.round(((LIFESPAN_MONTHS * cac) / ltv) * 10) / 10
          : null;

      const health = classifyChannelHealth({
        ltv,
        cac,
        paybackMonths,
        ltvCacRatio,
      });

      return {
        channel: ch.channel,
        cac,
        ltv,
        paybackMonths,
        // ROAS 30d no viene del endpoint LTV — se deja null por ahora,
        // la columna muestra "—". En Fase 2 podemos enriquecerlo desde
        // /api/metrics/ads si lo necesitamos.
        roas30d: null,
        ltvCacRatio,
        health,
      };
    })
    // Ordenar: unprofitable primero (para que Tomy los vea), luego
    // por CAC descendente dentro de cada grupo.
    .sort((a, b) => {
      const order: Record<ChannelHealth, number> = {
        unprofitable: 0,
        warning: 1,
        healthy: 2,
      };
      const diff = order[a.health] - order[b.health];
      if (diff !== 0) return diff;
      return b.cac - a.cac;
    });

  const blendedCac = params.summary.globalCac > 0 ? params.summary.globalCac : null;
  const blendedLtv = params.summary.avgLtv > 0 ? params.summary.avgLtv : null;

  return {
    rows,
    summary: {
      blendedCac,
      blendedLtv,
      blendedRoas30d: null,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Paleta helper para UI
// ─────────────────────────────────────────────────────────────
export function healthToColor(health: ChannelHealth): {
  fg: string;
  bg: string;
  ring: string;
  label: string;
} {
  switch (health) {
    case "healthy":
      return {
        fg: "#065f46",
        bg: "rgba(16,185,129,0.08)",
        ring: "rgba(16,185,129,0.35)",
        label: "Saludable",
      };
    case "warning":
      return {
        fg: "#9a3412",
        bg: "rgba(249,115,22,0.08)",
        ring: "rgba(249,115,22,0.4)",
        label: "Atención",
      };
    case "unprofitable":
      return {
        fg: "#991b1b",
        bg: "rgba(239,68,68,0.08)",
        ring: "rgba(239,68,68,0.4)",
        label: "Pérdida",
      };
  }
}
