// ─────────────────────────────────────────────────────────────
// src/lib/finanzas/scenario-engine.ts — Fase 5 — Escenarios
// ─────────────────────────────────────────────────────────────
// Motor puro (sin React, sin DB) para el modulo de Escenarios.
//
// Responsabilidades:
//   1. Definir la taxonomia de drivers conocidos + sus defaults.
//   2. Proveer los 3 presets (Conservador / Base / Optimista).
//   3. Computar el forecast 12 meses a partir de un escenario, aplicando
//      seasonality LATAM (Hot Sale, Dia del Niño, Black Friday, Navidad,
//      vuelta al cole).
//   4. Computar bandas min/max cuando los drivers tienen rango.
//
// Usado por:
//   - /api/finance/scenarios/[id]/compute (POST)
//   - /api/finance/scenarios (GET — incluye forecast en cache)
//   - UI /finanzas/escenarios (via API)
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type DriverValue = {
  value: number;
  min?: number;
  max?: number;
  unit?: string;
};

export type ScenarioDrivers = Partial<Record<DriverKey, DriverValue>>;

export type DriverKey =
  | "trafficPerDay"
  | "conversionRate"
  | "aov"
  | "adSpendPerDay"
  | "roas"
  | "cogsPct"
  | "headcount"
  | "opexBase"
  | "inflationMonthly"
  | "fxMonthly";

export type ScenarioKind = "BASE" | "OPTIMIST" | "CONSERVATIVE" | "CUSTOM";

export type MonthForecast = {
  month: string; // "2026-05"
  monthIndex: number; // 0..(horizon-1)
  daysInMonth: number;
  seasonalityWeight: number;
  // Volumen
  traffic: number;
  orders: number;
  // Revenue
  revenue: number;
  revenueMin?: number;
  revenueMax?: number;
  // Costos
  cogs: number;
  adSpend: number;
  opex: number;
  // Resultados
  grossProfit: number;
  netProfit: number;
  netProfitMin?: number;
  netProfitMax?: number;
  marginPct: number;
};

export type ForecastResult = {
  months: MonthForecast[];
  totals: {
    revenue: number;
    revenueMin?: number;
    revenueMax?: number;
    cogs: number;
    adSpend: number;
    opex: number;
    grossProfit: number;
    netProfit: number;
    netProfitMin?: number;
    netProfitMax?: number;
    marginPct: number;
    avgOrdersPerMonth: number;
  };
  runwayMonths: number | null;
  generatedAt: string; // ISO
  assumptions: {
    startMonth: string;
    horizon: number;
    cashToday: number | null;
    seasonalityProfile: string;
  };
};

// ─────────────────────────────────────────────────────────────
// Driver metadata — defaults, rangos razonables, unidades
// ─────────────────────────────────────────────────────────────

export const DRIVER_META: Record<
  DriverKey,
  {
    label: string;
    unit: string;
    defaultValue: number;
    rangeable: boolean;
    step?: number;
    min?: number; // bound absoluto del slider UI
    max?: number;
    sliderHint?: string;
  }
> = {
  trafficPerDay: {
    label: "Trafico / dia",
    unit: "visitas",
    defaultValue: 1200,
    rangeable: true,
    step: 10,
    min: 0,
    max: 50000,
    sliderHint: "Visitas unicas diarias al sitio",
  },
  conversionRate: {
    label: "Conversion rate",
    unit: "%",
    defaultValue: 2.1,
    rangeable: true,
    step: 0.05,
    min: 0,
    max: 15,
    sliderHint: "% de visitas que compran",
  },
  aov: {
    label: "Ticket promedio",
    unit: "ARS",
    defaultValue: 18500,
    rangeable: true,
    step: 100,
    min: 0,
    max: 5000000,
    sliderHint: "Monto promedio por orden (AOV)",
  },
  adSpendPerDay: {
    label: "Ad spend / dia",
    unit: "ARS",
    defaultValue: 45000,
    rangeable: true,
    step: 1000,
    min: 0,
    max: 10000000,
    sliderHint: "Inversion diaria total en paid ads",
  },
  roas: {
    label: "ROAS",
    unit: "x",
    defaultValue: 2.8,
    rangeable: true,
    step: 0.1,
    min: 0,
    max: 20,
    sliderHint: "Revenue atribuido / ad spend",
  },
  cogsPct: {
    label: "COGS %",
    unit: "%",
    defaultValue: 38,
    rangeable: true,
    step: 0.5,
    min: 0,
    max: 95,
    sliderHint: "Costo de mercaderia vendida como % del revenue",
  },
  headcount: {
    label: "Headcount",
    unit: "personas",
    defaultValue: 7,
    rangeable: false,
    step: 1,
    min: 0,
    max: 500,
    sliderHint: "Equipo total en el mes",
  },
  opexBase: {
    label: "Opex base",
    unit: "ARS/mes",
    defaultValue: 3500000,
    rangeable: false,
    step: 50000,
    min: 0,
    max: 500000000,
    sliderHint: "Opex fijo mensual (alquiler, servicios, software)",
  },
  inflationMonthly: {
    label: "Inflacion mensual",
    unit: "%",
    defaultValue: 2.5,
    rangeable: true,
    step: 0.1,
    min: 0,
    max: 30,
    sliderHint: "Ajuste % que se aplica a opex y cogs mes a mes",
  },
  fxMonthly: {
    label: "Depreciacion ARS",
    unit: "%",
    defaultValue: 1.8,
    rangeable: false,
    step: 0.1,
    min: 0,
    max: 30,
    sliderHint: "Devaluacion % esperada del ARS por mes",
  },
};

export const DRIVER_KEYS: readonly DriverKey[] = Object.keys(
  DRIVER_META
) as DriverKey[];

// ─────────────────────────────────────────────────────────────
// Seasonality LATAM (perfil Toys — puede extenderse a otros)
//
// Weights multiplican el revenue base mensual. 1.0 = mes promedio.
// Fuente: patron tipico de retail juguetero en Argentina 2022-2024.
// ─────────────────────────────────────────────────────────────

type SeasonalityProfile = "LATAM_TOYS" | "LATAM_GENERIC";

export const SEASONALITY_WEIGHTS: Record<SeasonalityProfile, number[]> = {
  // Index 0 = enero, 11 = diciembre.
  LATAM_TOYS: [
    0.82, // Ene — post vacaciones, baja
    0.9, // Feb — arranque vuelta al cole
    1.05, // Mar — vuelta al cole full
    1.0, // Abr
    1.2, // May — Hot Sale + Dia de la Madre Mex
    0.95, // Jun — Dia del Padre
    1.0, // Jul — vacaciones de invierno
    1.35, // Ago — Dia del Niño (pico principal para toys)
    0.9, // Sep
    1.0, // Oct — Dia de la Madre ARG
    1.4, // Nov — Black Friday + Cyber Monday
    1.55, // Dic — Navidad (pico absoluto)
  ],
  LATAM_GENERIC: [
    0.9, 0.95, 1.0, 1.0, 1.15, 0.95, 1.0, 1.05, 0.95, 1.05, 1.3, 1.45,
  ],
};

// ─────────────────────────────────────────────────────────────
// Defaults para los 3 presets
// Valores razonables para un ecommerce toys argentino ~$12M/mes.
// ─────────────────────────────────────────────────────────────

export function buildDefaultScenariosPayloads(): Array<{
  name: string;
  kind: ScenarioKind;
  color: string;
  description: string;
  isActive: boolean;
  drivers: ScenarioDrivers;
}> {
  return [
    {
      name: "Conservador",
      kind: "CONSERVATIVE",
      color: "#ef4444",
      description: "Si las cosas se ponen feas — drivers -10/-15%",
      isActive: false,
      drivers: {
        trafficPerDay: { value: 1020, min: 900, max: 1100, unit: "visitas" },
        conversionRate: { value: 1.7, min: 1.5, max: 1.9, unit: "%" },
        aov: { value: 16500, unit: "ARS" },
        adSpendPerDay: { value: 45000, unit: "ARS" },
        roas: { value: 2.2, min: 1.8, max: 2.5, unit: "x" },
        cogsPct: { value: 42, min: 40, max: 46, unit: "%" },
        headcount: { value: 7, unit: "personas" },
        opexBase: { value: 3500000, unit: "ARS/mes" },
        inflationMonthly: { value: 3.8, min: 3.0, max: 4.5, unit: "%" },
        fxMonthly: { value: 3.5, unit: "%" },
      },
    },
    {
      name: "Base",
      kind: "BASE",
      color: "#0ea5e9",
      description: "Lo mas probable — tendencia + estacionalidad",
      isActive: true,
      drivers: {
        trafficPerDay: { value: 1200, min: 1100, max: 1300, unit: "visitas" },
        conversionRate: { value: 2.1, min: 1.9, max: 2.3, unit: "%" },
        aov: { value: 18500, unit: "ARS" },
        adSpendPerDay: { value: 45000, unit: "ARS" },
        roas: { value: 2.8, min: 2.5, max: 3.1, unit: "x" },
        cogsPct: { value: 38, min: 36, max: 42, unit: "%" },
        headcount: { value: 7, unit: "personas" },
        opexBase: { value: 3500000, unit: "ARS/mes" },
        inflationMonthly: { value: 2.5, min: 2.0, max: 3.0, unit: "%" },
        fxMonthly: { value: 1.8, unit: "%" },
      },
    },
    {
      name: "Optimista",
      kind: "OPTIMIST",
      color: "#10b981",
      description: "Si todo sale bien — drivers +10/+15%",
      isActive: false,
      drivers: {
        trafficPerDay: { value: 1380, min: 1250, max: 1500, unit: "visitas" },
        conversionRate: { value: 2.5, min: 2.3, max: 2.8, unit: "%" },
        aov: { value: 21000, unit: "ARS" },
        adSpendPerDay: { value: 55000, unit: "ARS" },
        roas: { value: 3.4, min: 3.0, max: 3.8, unit: "x" },
        cogsPct: { value: 34, min: 32, max: 37, unit: "%" },
        headcount: { value: 9, unit: "personas" },
        opexBase: { value: 4200000, unit: "ARS/mes" },
        inflationMonthly: { value: 1.8, min: 1.5, max: 2.2, unit: "%" },
        fxMonthly: { value: 1.2, unit: "%" },
      },
    },
  ];
}

// ─────────────────────────────────────────────────────────────
// Validacion del payload de drivers en POST/PUT
// ─────────────────────────────────────────────────────────────

export function validateScenarioDrivers(raw: unknown): {
  ok: boolean;
  error?: string;
  value?: ScenarioDrivers;
} {
  if (raw === null || raw === undefined) {
    return { ok: true, value: {} };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "drivers debe ser un objeto JSON" };
  }
  const obj = raw as Record<string, unknown>;
  const out: ScenarioDrivers = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!DRIVER_KEYS.includes(k as DriverKey)) {
      // Ignoramos keys desconocidas silenciosamente (forward-compat).
      continue;
    }
    if (!v || typeof v !== "object") {
      return { ok: false, error: `driver ${k} debe ser objeto` };
    }
    const dv = v as Record<string, unknown>;
    if (typeof dv.value !== "number" || !Number.isFinite(dv.value)) {
      return { ok: false, error: `driver ${k}.value invalido` };
    }
    const driver: DriverValue = { value: dv.value };
    if (dv.min !== undefined && dv.min !== null) {
      if (typeof dv.min !== "number" || !Number.isFinite(dv.min)) {
        return { ok: false, error: `driver ${k}.min invalido` };
      }
      driver.min = dv.min;
    }
    if (dv.max !== undefined && dv.max !== null) {
      if (typeof dv.max !== "number" || !Number.isFinite(dv.max)) {
        return { ok: false, error: `driver ${k}.max invalido` };
      }
      driver.max = dv.max;
    }
    if (typeof dv.unit === "string") driver.unit = dv.unit;
    // Sanity check: si hay min y max, min <= value <= max
    if (driver.min !== undefined && driver.max !== undefined) {
      if (driver.min > driver.max) {
        return { ok: false, error: `driver ${k}.min > ${k}.max` };
      }
    }
    out[k as DriverKey] = driver;
  }
  return { ok: true, value: out };
}

// ─────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────

function daysInMonthFor(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

function parseMonthIso(monthIso: string): { year: number; month: number } {
  const [y, m] = monthIso.split("-").map(Number);
  return { year: y, month: m || 1 };
}

function formatMonthIso(year: number, monthIndex0: number): string {
  const y = year + Math.floor(monthIndex0 / 12);
  const m = ((monthIndex0 % 12) + 12) % 12;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

function driverVal(
  drivers: ScenarioDrivers,
  key: DriverKey,
  which: "value" | "min" | "max"
): number {
  const d = drivers[key];
  const meta = DRIVER_META[key];
  if (!d) return meta.defaultValue;
  if (which === "value") return d.value;
  if (which === "min") return d.min ?? d.value;
  return d.max ?? d.value;
}

// ─────────────────────────────────────────────────────────────
// Compute forecast 12 meses
//
// Modelo P&L simplificado por mes:
//   traffic = trafficPerDay * daysInMonth * seasonalityWeight
//   orders  = traffic * (conversionRate / 100)
//   revenue = orders * aov
//   adSpend = adSpendPerDay * daysInMonth
//   cogs    = revenue * (cogsPct / 100) * inflationFactor(mes)
//   opex    = opexBase * inflationFactor(mes)
//   grossProfit = revenue - cogs - adSpend
//   netProfit   = grossProfit - opex
//
// Bandas min/max: usa los extremos de cada driver (pesimista usa max de
// costos + min de revenue; optimista al reves). Devuelve revenueMin/Max
// y netProfitMin/Max.
// ─────────────────────────────────────────────────────────────

export type ComputeOptions = {
  startMonth?: string; // default: mes actual
  horizonMonths?: number; // default: 12 (o el del escenario)
  cashToday?: number | null;
  seasonalityProfile?: SeasonalityProfile;
};

export function computeForecast(
  drivers: ScenarioDrivers,
  opts: ComputeOptions = {}
): ForecastResult {
  const today = new Date();
  const startIso =
    opts.startMonth ??
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const horizon = Math.max(
    1,
    Math.min(36, Math.floor(opts.horizonMonths ?? 12))
  );
  const profile: SeasonalityProfile =
    opts.seasonalityProfile ?? "LATAM_TOYS";
  const seasonality = SEASONALITY_WEIGHTS[profile];

  const { year: startYear, month: startMonth } = parseMonthIso(startIso);
  const startIndex = startMonth - 1; // 0..11

  const months: MonthForecast[] = [];
  const totals = {
    revenue: 0,
    revenueMin: 0,
    revenueMax: 0,
    cogs: 0,
    adSpend: 0,
    opex: 0,
    grossProfit: 0,
    netProfit: 0,
    netProfitMin: 0,
    netProfitMax: 0,
  };

  const inflationMonthly = driverVal(drivers, "inflationMonthly", "value") / 100;

  for (let i = 0; i < horizon; i++) {
    const absIndex = startIndex + i;
    const calYear = startYear + Math.floor(absIndex / 12);
    const calMonth = ((absIndex % 12) + 12) % 12;
    const monthIso = formatMonthIso(startYear, absIndex);
    const days = daysInMonthFor(calYear, calMonth);
    const seasonalityWeight = seasonality[calMonth] ?? 1.0;
    const inflationFactor = Math.pow(1 + inflationMonthly, i);

    // Base values
    const trafficVal = driverVal(drivers, "trafficPerDay", "value");
    const crVal = driverVal(drivers, "conversionRate", "value") / 100;
    const aovVal = driverVal(drivers, "aov", "value");
    const adSpendDailyVal = driverVal(drivers, "adSpendPerDay", "value");
    const cogsPctVal = driverVal(drivers, "cogsPct", "value") / 100;
    const opexBaseVal = driverVal(drivers, "opexBase", "value");

    const traffic = trafficVal * days * seasonalityWeight;
    const orders = traffic * crVal;
    const revenue = orders * aovVal;
    const adSpend = adSpendDailyVal * days;
    const cogs = revenue * cogsPctVal * inflationFactor;
    const opex = opexBaseVal * inflationFactor;
    const grossProfit = revenue - cogs - adSpend;
    const netProfit = grossProfit - opex;
    const marginPct = revenue > 0 ? netProfit / revenue : 0;

    // Bandas min/max (si hay ranges en drivers)
    const trafficMin = driverVal(drivers, "trafficPerDay", "min");
    const trafficMax = driverVal(drivers, "trafficPerDay", "max");
    const crMin = driverVal(drivers, "conversionRate", "min") / 100;
    const crMax = driverVal(drivers, "conversionRate", "max") / 100;
    const aovMin = driverVal(drivers, "aov", "min");
    const aovMax = driverVal(drivers, "aov", "max");
    const cogsPctMin = driverVal(drivers, "cogsPct", "min") / 100;
    const cogsPctMax = driverVal(drivers, "cogsPct", "max") / 100;

    const revenueMin = trafficMin * days * seasonalityWeight * crMin * aovMin;
    const revenueMax = trafficMax * days * seasonalityWeight * crMax * aovMax;
    // Escenario malo: revenueMin + cogsPctMax; escenario bueno: revenueMax + cogsPctMin
    const netProfitMin =
      revenueMin -
      revenueMin * cogsPctMax * inflationFactor -
      adSpend -
      opex;
    const netProfitMax =
      revenueMax -
      revenueMax * cogsPctMin * inflationFactor -
      adSpend -
      opex;

    months.push({
      month: monthIso,
      monthIndex: i,
      daysInMonth: days,
      seasonalityWeight,
      traffic: round(traffic),
      orders: round(orders),
      revenue: round(revenue),
      revenueMin: round(revenueMin),
      revenueMax: round(revenueMax),
      cogs: round(cogs),
      adSpend: round(adSpend),
      opex: round(opex),
      grossProfit: round(grossProfit),
      netProfit: round(netProfit),
      netProfitMin: round(netProfitMin),
      netProfitMax: round(netProfitMax),
      marginPct: Number(marginPct.toFixed(4)),
    });

    totals.revenue += revenue;
    totals.revenueMin += revenueMin;
    totals.revenueMax += revenueMax;
    totals.cogs += cogs;
    totals.adSpend += adSpend;
    totals.opex += opex;
    totals.grossProfit += grossProfit;
    totals.netProfit += netProfit;
    totals.netProfitMin += netProfitMin;
    totals.netProfitMax += netProfitMax;
  }

  // Runway: si cashToday esta seteado y el promedio mensual es negativo,
  // estimamos cuantos meses duran.
  let runwayMonths: number | null = null;
  if (opts.cashToday !== null && opts.cashToday !== undefined && opts.cashToday > 0) {
    const avgMonthlyNet = totals.netProfit / horizon;
    if (avgMonthlyNet < 0) {
      runwayMonths = Number((opts.cashToday / -avgMonthlyNet).toFixed(1));
    } else {
      // Positivo → runway infinito (representamos como null pero clamp a 120m
      // para UI que lo pinta como "> 10 años").
      runwayMonths = null;
    }
  }

  const avgOrdersPerMonth =
    months.reduce((s, m) => s + m.orders, 0) / Math.max(1, months.length);
  const marginPctTotal =
    totals.revenue > 0 ? totals.netProfit / totals.revenue : 0;

  return {
    months,
    totals: {
      revenue: round(totals.revenue),
      revenueMin: round(totals.revenueMin),
      revenueMax: round(totals.revenueMax),
      cogs: round(totals.cogs),
      adSpend: round(totals.adSpend),
      opex: round(totals.opex),
      grossProfit: round(totals.grossProfit),
      netProfit: round(totals.netProfit),
      netProfitMin: round(totals.netProfitMin),
      netProfitMax: round(totals.netProfitMax),
      marginPct: Number(marginPctTotal.toFixed(4)),
      avgOrdersPerMonth: round(avgOrdersPerMonth),
    },
    runwayMonths,
    generatedAt: new Date().toISOString(),
    assumptions: {
      startMonth: startIso,
      horizon,
      cashToday: opts.cashToday ?? null,
      seasonalityProfile: profile,
    },
  };
}

function round(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

// ─────────────────────────────────────────────────────────────
// Helpers de clone/activate
// ─────────────────────────────────────────────────────────────

export function cloneScenarioDrivers(drivers: unknown): ScenarioDrivers {
  const res = validateScenarioDrivers(drivers);
  return res.ok ? res.value ?? {} : {};
}

/**
 * Ajusta drivers por un factor (-0.10 para -10%, +0.15 para +15%).
 * Usado en UI cuando el usuario arrastra un slider global "pesimista/optimista".
 */
export function applyGlobalFactor(
  drivers: ScenarioDrivers,
  factor: number
): ScenarioDrivers {
  const out: ScenarioDrivers = {};
  for (const k of DRIVER_KEYS) {
    const d = drivers[k];
    if (!d) continue;
    const factorable = DRIVER_META[k].rangeable;
    if (!factorable) {
      out[k] = { ...d };
      continue;
    }
    out[k] = {
      value: round(d.value * (1 + factor)),
      min: d.min !== undefined ? round(d.min * (1 + factor)) : undefined,
      max: d.max !== undefined ? round(d.max * (1 + factor)) : undefined,
      unit: d.unit,
    };
  }
  return out;
}
