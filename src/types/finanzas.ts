// ═══════════════════════════════════════════════════════════════════
// Tipos compartidos del módulo Finanzas · Fase 1 — Pulso
// ═══════════════════════════════════════════════════════════════════
// Contratos TypeScript que viajan entre:
//   - /api/finanzas/pulso (endpoint agregador)
//   - componentes de la portada (/finanzas/pulso/page.tsx)
//   - libs puras en /src/lib/finanzas/*
//
// Regla de oro: todo número financiero del Pulso viene en ARS nominales.
// La conversión a USD / ARS ajustado se hace en el cliente vía
// useCurrencyView, NO en el server.
// ═══════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// Cash Runway
// ─────────────────────────────────────────────────────────────
export type RunwayStatus = "safe" | "warn" | "critical";
export type RunwayBalanceSource = "auto" | "manual";

export interface RunwayInputs {
  // Todos los valores en ARS nominales YTD
  revenueYTD: number;
  cogsYTD: number;
  adSpendYTD: number;
  shippingYTD: number;
  manualCostsYTD: number;

  // Valores de los últimos 90 días (para burn rate mensual)
  cogs90d: number;
  adSpend90d: number;
  shipping90d: number;
  manualCosts90d: number;

  // Override manual opcional (Fase 1e). Si está presente, reemplaza
  // el cálculo automático de cashBalance.
  manualOverride?: {
    amount: number;
    month: string; // "YYYY-MM"
    note?: string | null;
    updatedAt: string; // ISO
  } | null;
}

export interface RunwayData {
  source: RunwayBalanceSource;
  cashBalance: number; // número final que se muestra (auto o manual)
  cashBalanceAuto: number; // cálculo automático (siempre presente)
  burnRate30d: number; // ARS/mes promediado sobre últimos 90 días
  monthsRemaining: number; // cashBalance / burnRate30d
  status: RunwayStatus;
  breakdown: {
    revenueYTD: number;
    costosYTD: number; // cogs + shipping + adSpend + manualCosts
    cogsYTD: number;
    shippingYTD: number;
    adSpendYTD: number;
    manualCostsYTD: number;
  };
  asOfDate: string; // "YYYY-MM-DD" fecha del cálculo
}

// ─────────────────────────────────────────────────────────────
// Marketing Financiero (Fase 1b)
// ─────────────────────────────────────────────────────────────
export type ChannelHealth = "healthy" | "warning" | "unprofitable";

export interface MarketingChannelRow {
  channel: string; // "Meta", "Google", "Orgánico", "Directo", ...
  cac: number;
  ltv: number;
  paybackMonths: number | null;
  roas30d: number | null;
  ltvCacRatio: number | null;
  health: ChannelHealth;
}

export interface MarketingFinanceData {
  rows: MarketingChannelRow[];
  summary: {
    blendedCac: number | null;
    blendedLtv: number | null;
    blendedRoas30d: number | null;
  };
}

// ─────────────────────────────────────────────────────────────
// Sparkline 12m + contexto (Fase 1c)
// ─────────────────────────────────────────────────────────────
export interface Sparkline12mBucket {
  month: string; // "YYYY-MM"
  revenue: number;
  costos: number;
  grossMargin: number; // porcentaje (0-100)
}

export interface Sparkline12mData {
  buckets: Sparkline12mBucket[];
  revenue12mTotal: number;
  revenuePrev12mTotal: number; // para delta YoY
  revenueDeltaPct: number | null;
  costosYTD: number;
  grossMarginYTD: number; // porcentaje
}

// ─────────────────────────────────────────────────────────────
// Narrativa + Alertas (Fase 1d)
// ─────────────────────────────────────────────────────────────
export type NarrativeSeverity = "info" | "positive" | "warning" | "critical";

export interface NarrativeData {
  title: string;
  body: string;
  severity: NarrativeSeverity;
  rule: string; // ID de la regla disparada ("runway_critical", "cac_gt_ltv", ...)
}

export type AlertPriority = "HIGH" | "MEDIUM" | "LOW";

export interface FinancialAlert {
  id: string; // determinístico, ej: "finanzas.pulso.runway_critical.2026-04"
  type: string; // "runway" | "margin" | "channel" | ...
  priority: AlertPriority;
  title: string;
  body: string;
  createdAt: string; // ISO
}

// ─────────────────────────────────────────────────────────────
// Payload completo del endpoint /api/finanzas/pulso
// ─────────────────────────────────────────────────────────────
export interface PulsoPageData {
  runway: RunwayData;
  marketingFinance?: MarketingFinanceData; // opcional hasta 1b
  sparkline12m?: Sparkline12mData; // opcional hasta 1c
  narrative?: NarrativeData; // opcional hasta 1d
  alerts?: FinancialAlert[]; // opcional hasta 1d
  meta: {
    generatedAt: string; // ISO
    ytdFrom: string; // "YYYY-MM-DD" (1 enero)
    ytdTo: string; // "YYYY-MM-DD" (hoy)
    window90dFrom: string;
    window90dTo: string;
  };
}
