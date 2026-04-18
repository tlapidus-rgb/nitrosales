// ═══════════════════════════════════════════════════════════════════
// Narrativa determinista + alertas financieras (Fase 1d)
// ═══════════════════════════════════════════════════════════════════
// Motor de reglas 100% JS. Sin LLM, sin DB, sin fetch.
//
// Entradas: métricas ya calculadas del Pulso.
// Salidas:
//   - NarrativeData: título + body (≤ 2 líneas, ≤ 120 chars c/u) + severity
//   - FinancialAlert[]: 0-N alertas accionables con prioridad
//
// Reglas de narrativa (se evalúa en orden, primera que matchea gana):
//
//   1. runway.monthsRemaining < 3           → severity="critical"   (runway_critical)
//   2. revenueDeltaYoY <= -20%              → severity="warning"    (revenue_decay)
//   3. grossMarginYTD < 20%                 → severity="warning"    (margin_low)
//   4. runway.monthsRemaining < 6           → severity="warning"    (runway_short)
//   5. revenueDeltaYoY >= +30% Y margin≥25  → severity="positive"   (healthy_scale)
//   6. revenueDeltaYoY >= +10%              → severity="positive"   (growing)
//   7. fallback                              → severity="info"       (steady)
//
// Cada regla tiene 2-3 variantes de mensaje para que no se lea
// idéntico todos los días. La variante elegida depende de una semilla
// determinística (hash del día) para que el mismo día produzca la
// misma narrativa en cada render.
//
// Alertas (se generan todas las que apliquen, no excluyentes):
//
//   HIGH   runway_critical   (monthsRemaining < 3)
//   HIGH   margin_collapse   (grossMarginYTD < 10%)
//   MEDIUM runway_short      (monthsRemaining 3-6m)
//   MEDIUM revenue_decay     (revenueDeltaYoY <= -15%)
//   MEDIUM margin_low        (grossMarginYTD 10-25%)
//   MEDIUM ad_heavy          (adSpendYTD / revenueYTD > 35%)
//   LOW    burn_high         (burnRate30d > 40% revenueMonthly actual)
// ═══════════════════════════════════════════════════════════════════

import type {
  FinancialAlert,
  NarrativeData,
  NarrativeSeverity,
  RunwayData,
  Sparkline12mData,
} from "@/types/finanzas";

// ─────────────────────────────────────────────────────────────
// Input unificado
// ─────────────────────────────────────────────────────────────
export interface NarrativeInput {
  runway: RunwayData;
  sparkline: Sparkline12mData | null;
  revenueYTD: number;
  adSpendYTD: number;
  monthIso: string; // "YYYY-MM" — para IDs determinísticos de alertas
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function pickVariant<T>(variants: T[], seed: string): T {
  if (variants.length === 0) throw new Error("pickVariant: no variants");
  const idx = simpleHash(seed) % variants.length;
  return variants[idx];
}

function fmtPct(v: number): string {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

function fmtMonths(m: number): string {
  if (!Number.isFinite(m)) return "∞";
  if (m <= 0) return "0";
  if (m < 1) {
    const days = Math.round(m * 30);
    return `${days}d`;
  }
  return `${m.toFixed(1)}m`;
}

// ─────────────────────────────────────────────────────────────
// Builder principal de narrativa
// ─────────────────────────────────────────────────────────────
export function buildNarrative(input: NarrativeInput): NarrativeData {
  const { runway, sparkline } = input;
  const deltaYoY = sparkline?.revenueDeltaPct ?? null;
  const margin = sparkline?.grossMarginYTD ?? 0;
  const months = runway.monthsRemaining;
  const seed = input.monthIso;

  // 1. runway crítico
  if (months > 0 && months < 3) {
    const variants: { title: string; body: string }[] = [
      {
        title: `Quedan ${fmtMonths(months)} de caja`,
        body: `Al ritmo actual se agota la caja en menos de 3 meses. Frená spend o acelerá cobros.`,
      },
      {
        title: `Runway en rojo · ${fmtMonths(months)}`,
        body: `El burn mensual supera la reserva. Priorizá ajustar costos fijos o subir margen ya.`,
      },
      {
        title: `Caja corta · ${fmtMonths(months)}`,
        body: `Menos de 90 días de oxígeno. Reuní al equipo y definí plan de contención esta semana.`,
      },
    ];
    const v = pickVariant(variants, `runway_critical_${seed}`);
    return { ...v, severity: "critical", rule: "runway_critical" };
  }

  // 2. revenue cayendo fuerte YoY
  if (deltaYoY !== null && deltaYoY <= -20) {
    const variants: { title: string; body: string }[] = [
      {
        title: `Revenue bajando ${fmtPct(deltaYoY)} YoY`,
        body: `Los últimos 12m ingresaron menos que el período anterior. Revisá tráfico, conversión y mix de canales.`,
      },
      {
        title: `Ventas retrocediendo · ${fmtPct(deltaYoY)}`,
        body: `Tendencia negativa sostenida vs año anterior. Atacá primero el canal que más cayó.`,
      },
    ];
    const v = pickVariant(variants, `revenue_decay_${seed}`);
    return { ...v, severity: "warning", rule: "revenue_decay" };
  }

  // 3. margen apretado
  if (margin > 0 && margin < 20) {
    const variants: { title: string; body: string }[] = [
      {
        title: `Margen bruto bajo · ${margin.toFixed(1)}%`,
        body: `Cada peso vendido deja poco antes de fijos. Subí precio, renegociá costo o mejorá mix.`,
      },
      {
        title: `Margen ajustado (${margin.toFixed(1)}%)`,
        body: `Poco colchón para absorber ads. Apuntá a llegar a 30% antes de escalar inversión.`,
      },
    ];
    const v = pickVariant(variants, `margin_low_${seed}`);
    return { ...v, severity: "warning", rule: "margin_low" };
  }

  // 4. runway corto (3-6m)
  if (months >= 3 && months < 6) {
    const variants: { title: string; body: string }[] = [
      {
        title: `Runway ajustado · ${fmtMonths(months)}`,
        body: `Entre 3 y 6 meses de caja. Sostenible pero sin margen de error. Cuidá cada peso de ad spend.`,
      },
      {
        title: `Caja limitada (${fmtMonths(months)})`,
        body: `Buen momento para proyectar escenarios: ¿qué pasa si crecés 20% vs si caés 10%?`,
      },
    ];
    const v = pickVariant(variants, `runway_short_${seed}`);
    return { ...v, severity: "warning", rule: "runway_short" };
  }

  // 5. healthy scale (crecimiento + margen)
  if (deltaYoY !== null && deltaYoY >= 30 && margin >= 25) {
    const variants: { title: string; body: string }[] = [
      {
        title: `Escala saludable · ${fmtPct(deltaYoY)} YoY`,
        body: `Revenue creciendo con margen ${margin.toFixed(1)}%. Momento ideal para sumar ad spend al canal top.`,
      },
      {
        title: `Combo positivo · ${fmtPct(deltaYoY)}`,
        body: `Creciendo y manteniendo margen. Testeá expansión agresiva sin romper la caja.`,
      },
    ];
    const v = pickVariant(variants, `healthy_scale_${seed}`);
    return { ...v, severity: "positive", rule: "healthy_scale" };
  }

  // 6. growing (solo crecimiento, sin check de margen)
  if (deltaYoY !== null && deltaYoY >= 10) {
    const variants: { title: string; body: string }[] = [
      {
        title: `Revenue creciendo · ${fmtPct(deltaYoY)} YoY`,
        body: `Subiendo vs el año anterior. Enfocate en que el crecimiento deje margen suficiente.`,
      },
      {
        title: `Tendencia positiva (${fmtPct(deltaYoY)})`,
        body: `Venís arriba. Perfecto para invertir un 10-15% más en el canal más rentable.`,
      },
    ];
    const v = pickVariant(variants, `growing_${seed}`);
    return { ...v, severity: "positive", rule: "growing" };
  }

  // 7. fallback neutral
  const variants: { title: string; body: string }[] = [
    {
      title: "Negocio estable",
      body: "Sin señales críticas hoy. Es un buen día para revisar mix de costos y proyección a 90 días.",
    },
    {
      title: "Pulso tranquilo",
      body: "Números sin alertas rojas. Aprovechá el momento para plantar una prueba: precio, canal o creativo.",
    },
  ];
  const v = pickVariant(variants, `steady_${seed}`);
  return { ...v, severity: "info", rule: "steady" };
}

// ─────────────────────────────────────────────────────────────
// Builder de alertas (todas las que aplican, no excluyentes)
// ─────────────────────────────────────────────────────────────
export function buildAlerts(input: NarrativeInput): FinancialAlert[] {
  const alerts: FinancialAlert[] = [];
  const nowIso = new Date().toISOString();
  const { runway, sparkline, revenueYTD, adSpendYTD, monthIso } = input;

  const margin = sparkline?.grossMarginYTD ?? 0;
  const deltaYoY = sparkline?.revenueDeltaPct ?? null;
  const months = runway.monthsRemaining;

  // 1. runway crítico
  if (months > 0 && months < 3) {
    alerts.push({
      id: `finanzas.pulso.runway_critical.${monthIso}`,
      type: "runway",
      priority: "HIGH",
      title: `Caja crítica: ${fmtMonths(months)}`,
      body: `Burn rate mensual de $${Math.round(runway.burnRate30d).toLocaleString("es-AR")}. A este ritmo se agota la caja antes de 90 días.`,
      createdAt: nowIso,
    });
  } else if (months >= 3 && months < 6) {
    alerts.push({
      id: `finanzas.pulso.runway_short.${monthIso}`,
      type: "runway",
      priority: "MEDIUM",
      title: `Runway ajustado: ${fmtMonths(months)}`,
      body: "Mantené reserva para imprevistos y proyectá escenarios a 6 y 12 meses.",
      createdAt: nowIso,
    });
  }

  // 2. margen
  if (margin > 0 && margin < 10) {
    alerts.push({
      id: `finanzas.pulso.margin_collapse.${monthIso}`,
      type: "margin",
      priority: "HIGH",
      title: `Margen bruto colapsado: ${margin.toFixed(1)}%`,
      body: "Menos de 10% de margen deja al negocio sin colchón. Revisá precios y costo de adquisición por SKU.",
      createdAt: nowIso,
    });
  } else if (margin >= 10 && margin < 25) {
    alerts.push({
      id: `finanzas.pulso.margin_low.${monthIso}`,
      type: "margin",
      priority: "MEDIUM",
      title: `Margen bajo: ${margin.toFixed(1)}%`,
      body: "Target saludable es ≥ 40%. Trabajá mix de productos y renegociación con proveedores.",
      createdAt: nowIso,
    });
  }

  // 3. revenue decay YoY
  if (deltaYoY !== null && deltaYoY <= -15) {
    alerts.push({
      id: `finanzas.pulso.revenue_decay.${monthIso}`,
      type: "revenue",
      priority: "MEDIUM",
      title: `Revenue cae ${fmtPct(deltaYoY)} YoY`,
      body: "Analizá canal, producto y temporalidad. Puede ser ciclo o problema estructural.",
      createdAt: nowIso,
    });
  }

  // 4. ad-heavy (ads > 35% del revenue YTD)
  if (revenueYTD > 0) {
    const adRatio = adSpendYTD / revenueYTD;
    if (adRatio > 0.35) {
      alerts.push({
        id: `finanzas.pulso.ad_heavy.${monthIso}`,
        type: "channel",
        priority: "MEDIUM",
        title: `Ads = ${(adRatio * 100).toFixed(1)}% del revenue`,
        body: "Inversión publicitaria alta vs ingresos. Confirmá que cada canal tiene ROAS positivo.",
        createdAt: nowIso,
      });
    }
  }

  // 5. burn alto vs revenue mensual actual (último bucket)
  const lastMonthRevenue =
    sparkline && sparkline.buckets.length > 0
      ? sparkline.buckets[sparkline.buckets.length - 1].revenue
      : 0;
  if (lastMonthRevenue > 0 && runway.burnRate30d / lastMonthRevenue > 0.4) {
    alerts.push({
      id: `finanzas.pulso.burn_high.${monthIso}`,
      type: "burn",
      priority: "LOW",
      title: "Burn mensual > 40% del revenue mensual",
      body: "El negocio consume gran parte de lo que factura. Mirá costos fijos + ads + manuales antes de escalar.",
      createdAt: nowIso,
    });
  }

  // Ordenar por prioridad (HIGH → MEDIUM → LOW)
  const order: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  alerts.sort((a, b) => order[a.priority] - order[b.priority]);

  return alerts;
}

// ─────────────────────────────────────────────────────────────
// Helpers UI — paletas por severidad
// ─────────────────────────────────────────────────────────────
export function severityToPalette(s: NarrativeSeverity): {
  fg: string;
  bg: string;
  ring: string;
  accent: string;
  label: string;
} {
  switch (s) {
    case "critical":
      return {
        fg: "#991b1b",
        bg: "rgba(239,68,68,0.08)",
        ring: "rgba(239,68,68,0.35)",
        accent: "#ef4444",
        label: "Crítico",
      };
    case "warning":
      return {
        fg: "#9a3412",
        bg: "rgba(249,115,22,0.08)",
        ring: "rgba(249,115,22,0.4)",
        accent: "#f97316",
        label: "Atención",
      };
    case "positive":
      return {
        fg: "#065f46",
        bg: "rgba(16,185,129,0.08)",
        ring: "rgba(16,185,129,0.35)",
        accent: "#10b981",
        label: "Saludable",
      };
    case "info":
    default:
      return {
        fg: "rgba(15,23,42,0.75)",
        bg: "rgba(15,23,42,0.04)",
        ring: "rgba(15,23,42,0.12)",
        accent: "#64748b",
        label: "Estable",
      };
  }
}

export function priorityToPalette(p: "HIGH" | "MEDIUM" | "LOW"): {
  fg: string;
  bg: string;
  ring: string;
  label: string;
} {
  switch (p) {
    case "HIGH":
      return {
        fg: "#991b1b",
        bg: "rgba(239,68,68,0.08)",
        ring: "rgba(239,68,68,0.3)",
        label: "Alta",
      };
    case "MEDIUM":
      return {
        fg: "#9a3412",
        bg: "rgba(249,115,22,0.08)",
        ring: "rgba(249,115,22,0.3)",
        label: "Media",
      };
    case "LOW":
    default:
      return {
        fg: "rgba(15,23,42,0.65)",
        bg: "rgba(15,23,42,0.04)",
        ring: "rgba(15,23,42,0.12)",
        label: "Baja",
      };
  }
}
