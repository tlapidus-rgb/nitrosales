// ══════════════════════════════════════════════
// Anomaly Detector — Claude-powered + rule-based
// ══════════════════════════════════════════════
// Combines statistical rules (fast, no API cost) with
// Claude analysis (contextual, understands business logic).
//
// Types of anomalies detected:
// 1. RULE-BASED: Sudden drops/spikes in KPIs (>30% change)
// 2. CLAUDE-BASED: Contextual anomalies (seasonality, correlations)

import Anthropic from "@anthropic-ai/sdk";

export interface MetricSnapshot {
  revenue: number;
  orders: number;
  grossProfit: number;
  grossMargin: number;
  adSpend: number;
  metaSpend: number;
  googleSpend: number;
  roas: number;
  cpa: number;
  aov: number;
  sessions?: number;
  conversionRate?: number;
  cogsCoverage?: number; // % of order items that have costPrice (0-100)
}

export interface AnomalyResult {
  type: "ALERT" | "OPPORTUNITY" | "TREND" | "RECOMMENDATION";
  priority: "HIGH" | "MEDIUM" | "LOW";
  title: string;
  description: string;
  action: string;
  metric: string;
  metricValue: number;
  metricDelta: number | null;
}

// ── Rule-based anomaly detection ──────────────

const THRESHOLDS = {
  revenueDrop: -30,     // Revenue dropped > 30%
  revenueSpike: 50,     // Revenue spiked > 50%
  adSpendSpike: 40,     // Ad spend up > 40%
  roasDrop: -25,        // ROAS dropped > 25%
  cpaSpikeHigh: 50,     // CPA increased > 50%
  aovDrop: -20,         // AOV dropped > 20%
  grossMarginDrop: -15, // Margin dropped > 15 percentage points
  zeroOrders: 0,        // Zero orders in a day
  zeroSpend: 0,         // Zero ad spend (campaign paused?)
};

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

export function detectRuleBasedAnomalies(
  current: MetricSnapshot,
  previous: MetricSnapshot
): AnomalyResult[] {
  const anomalies: AnomalyResult[] = [];

  const revChange = pctChange(current.revenue, previous.revenue);
  const ordersChange = pctChange(current.orders, previous.orders);
  const adSpendChange = pctChange(current.adSpend, previous.adSpend);
  const roasChange = pctChange(current.roas, previous.roas);
  const aovChange = pctChange(current.aov, previous.aov);
  const marginDiff = current.grossMargin - previous.grossMargin;

  // Revenue crash
  if (revChange !== null && revChange <= THRESHOLDS.revenueDrop) {
    anomalies.push({
      type: "ALERT",
      priority: "HIGH",
      title: `Facturacion cayo ${Math.abs(revChange)}% vs periodo anterior`,
      description: `La facturacion paso de $${Math.round(previous.revenue).toLocaleString("es-AR")} a $${Math.round(current.revenue).toLocaleString("es-AR")}. Esto requiere atencion inmediata para identificar la causa.`,
      action: "Revisar campanas activas, stock de top sellers, y posibles problemas en el checkout.",
      metric: "revenue",
      metricValue: current.revenue,
      metricDelta: revChange,
    });
  }

  // Revenue spike (opportunity)
  if (revChange !== null && revChange >= THRESHOLDS.revenueSpike) {
    anomalies.push({
      type: "OPPORTUNITY",
      priority: "MEDIUM",
      title: `Facturacion subio ${revChange}% vs periodo anterior`,
      description: `Excelente performance. Facturacion paso de $${Math.round(previous.revenue).toLocaleString("es-AR")} a $${Math.round(current.revenue).toLocaleString("es-AR")}. Identificar que impulso este crecimiento.`,
      action: "Analizar que campanas, productos o canales impulsaron el spike y duplicar esfuerzos ahi.",
      metric: "revenue",
      metricValue: current.revenue,
      metricDelta: revChange,
    });
  }

  // Ad spend spike without revenue growth
  if (adSpendChange !== null && adSpendChange >= THRESHOLDS.adSpendSpike && (revChange === null || revChange < 10)) {
    anomalies.push({
      type: "ALERT",
      priority: "HIGH",
      title: `Inversion en ads subio ${adSpendChange}% sin crecimiento proporcional`,
      description: `El gasto publicitario aumento significativamente pero la facturacion no acompano. Meta: $${Math.round(current.metaSpend).toLocaleString("es-AR")}, Google: $${Math.round(current.googleSpend).toLocaleString("es-AR")}.`,
      action: "Pausar campanas con bajo ROAS y redistribuir presupuesto a las que mejor convierten.",
      metric: "adSpend",
      metricValue: current.adSpend,
      metricDelta: adSpendChange,
    });
  }

  // ROAS drop
  if (roasChange !== null && roasChange <= THRESHOLDS.roasDrop) {
    anomalies.push({
      type: "ALERT",
      priority: "HIGH",
      title: `ROAS cayo ${Math.abs(roasChange)}% — de ${previous.roas}x a ${current.roas}x`,
      description: `La eficiencia publicitaria esta bajando. Cada peso invertido genera menos retorno. Evaluar si hay fatiga creativa, saturacion de audiencia, o aumento de competencia.`,
      action: "Revisar frecuencia de ads, refrescar creativos, y evaluar audiencias.",
      metric: "roas",
      metricValue: current.roas,
      metricDelta: roasChange,
    });
  }

  // CPA spike
  const cpaChange = pctChange(current.cpa, previous.cpa);
  if (cpaChange !== null && cpaChange >= THRESHOLDS.cpaSpikeHigh) {
    anomalies.push({
      type: "ALERT",
      priority: "MEDIUM",
      title: `CPA aumento ${cpaChange}% — cuesta mas adquirir cada cliente`,
      description: `El costo por adquisicion paso de $${Math.round(previous.cpa).toLocaleString("es-AR")} a $${Math.round(current.cpa).toLocaleString("es-AR")}. Las campanas estan siendo menos eficientes.`,
      action: "Optimizar landing pages, revisar targeting de audiencias, y probar nuevos creativos.",
      metric: "cpa",
      metricValue: current.cpa,
      metricDelta: cpaChange,
    });
  }

  // AOV drop
  if (aovChange !== null && aovChange <= THRESHOLDS.aovDrop) {
    anomalies.push({
      type: "TREND",
      priority: "MEDIUM",
      title: `Ticket promedio bajo ${Math.abs(aovChange)}%`,
      description: `El AOV paso de $${Math.round(previous.aov).toLocaleString("es-AR")} a $${Math.round(current.aov).toLocaleString("es-AR")}. Los clientes estan comprando menos por pedido.`,
      action: "Implementar cross-sell, bundles, o free shipping en compras mayores a un umbral.",
      metric: "aov",
      metricValue: current.aov,
      metricDelta: aovChange,
    });
  }

  // Gross margin compression — solo si hay datos de costo cargados (>20% coverage)
  const hasCostData = (current.cogsCoverage ?? 0) > 20;
  if (hasCostData && marginDiff <= THRESHOLDS.grossMarginDrop) {
    anomalies.push({
      type: "ALERT",
      priority: "HIGH",
      title: `Margen bruto se comprimio ${Math.abs(Math.round(marginDiff))} puntos porcentuales`,
      description: `El margen paso de ${previous.grossMargin}% a ${current.grossMargin}%. Puede indicar aumento de costos, descuentos agresivos, o cambio en el mix de productos vendidos.`,
      action: "Revisar pricing, costos de proveedor, y el mix de productos promocionados.",
      metric: "grossMargin",
      metricValue: current.grossMargin,
      metricDelta: Math.round(marginDiff),
    });
  }

  // Zero orders day
  if (current.orders === 0 && previous.orders > 0) {
    anomalies.push({
      type: "ALERT",
      priority: "HIGH",
      title: "0 pedidos en el periodo — posible caida del sitio",
      description: `No se registraron pedidos cuando el periodo anterior tuvo ${previous.orders}. Puede indicar un problema tecnico en la plataforma de ecommerce.`,
      action: "Verificar que el sitio esta online, el checkout funciona, y los metodos de pago estan activos.",
      metric: "orders",
      metricValue: 0,
      metricDelta: -100,
    });
  }

  return anomalies;
}

// ── Claude-based contextual analysis ──────────

export async function detectClaudeAnomalies(
  current: MetricSnapshot,
  previous: MetricSnapshot,
  orgName: string,
  additionalContext?: string
): Promise<AnomalyResult[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];

  const anthropic = new Anthropic({ apiKey });

  const prompt = `Analiza estos KPIs de "${orgName}" (ecommerce Argentina, moneda ARS) y detecta anomalias o patrones interesantes que un sistema de reglas NO detectaria.

PERIODO ACTUAL (ultimos 7 dias):
- Facturacion: $${Math.round(current.revenue).toLocaleString("es-AR")}
- Pedidos: ${current.orders}
- Ganancia Bruta: $${Math.round(current.grossProfit).toLocaleString("es-AR")} (margen: ${current.grossMargin}%)
- Inversion Ads: $${Math.round(current.adSpend).toLocaleString("es-AR")} (Meta: $${Math.round(current.metaSpend).toLocaleString("es-AR")}, Google: $${Math.round(current.googleSpend).toLocaleString("es-AR")})
- ROAS: ${current.roas}x
- CPA: $${Math.round(current.cpa).toLocaleString("es-AR")}
- AOV: $${Math.round(current.aov).toLocaleString("es-AR")}

PERIODO ANTERIOR (7 dias previos):
- Facturacion: $${Math.round(previous.revenue).toLocaleString("es-AR")}
- Pedidos: ${previous.orders}
- Ganancia Bruta: $${Math.round(previous.grossProfit).toLocaleString("es-AR")} (margen: ${previous.grossMargin}%)
- Inversion Ads: $${Math.round(previous.adSpend).toLocaleString("es-AR")}
- ROAS: ${previous.roas}x
- CPA: $${Math.round(previous.cpa).toLocaleString("es-AR")}
- AOV: $${Math.round(previous.aov).toLocaleString("es-AR")}

${additionalContext ? `CONTEXTO ADICIONAL:\n${additionalContext}` : ""}

COBERTURA DE DATOS DE COSTO: ${current.cogsCoverage ?? 0}% de los items tienen precio de costo cargado.

INSTRUCCIONES:
- Busca patrones que reglas fijas NO detectarian: correlaciones entre metricas, contexto estacional (feriados argentinos, dia del nino, Black Friday, Hot Sale), tendencias graduales peligrosas, oportunidades ocultas.
- NO repitas lo que detectarian reglas simples (ej: "revenue bajo X%"). Eso ya lo cubrimos.
- IMPORTANTE: Si la cobertura de datos de costo es baja (<50%), NO generes alertas sobre margen bruto, ganancia bruta o COGS. Esos numeros no son confiables porque faltan datos de costo. No menciones el margen 100% como anomalia.
- Solo genera insights si HAY algo genuinamente interesante. Si todo es normal, devuelve array vacio.
- Maximo 3 insights.
- Responde SOLO con JSON valido, sin markdown ni backticks.

Formato:
{"anomalies":[{"type":"ALERT|OPPORTUNITY|TREND|RECOMMENDATION","priority":"HIGH|MEDIUM|LOW","title":"max 12 palabras","description":"max 50 palabras con datos concretos","action":"1 accion especifica","metric":"nombre_metrica","metricValue":0,"metricDelta":null}]}`;

  try {
    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: "Sos un analista de datos experto en ecommerce LATAM. Detectas anomalias y patrones que humanos y reglas simples pasan por alto. Habla en espanol rioplatense. Solo responde con JSON valido.",
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "{}";
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { anomalies: [] };
    }

    return (parsed.anomalies || []).map((a: any) => ({
      type: a.type || "TREND",
      priority: a.priority || "LOW",
      title: a.title || "",
      description: a.description || "",
      action: a.action || "",
      metric: a.metric || "",
      metricValue: a.metricValue || 0,
      metricDelta: a.metricDelta ?? null,
    }));
  } catch (error: any) {
    console.error("[anomaly] Claude analysis failed:", error.message);
    return [];
  }
}
