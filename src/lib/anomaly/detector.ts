// ══════════════════════════════════════════════
// Anomaly Detector — Claude-powered + rule-based
// ══════════════════════════════════════════════
// Combines business heuristics (fast, no API cost) with
// Claude selection of metrics for review, with measured evidence text.
//
// Types of anomalies detected:
// 1. RULE-BASED: Sudden drops/spikes in KPIs (>30% change)
// 2. CLAUDE-BASED: Heuristic selection, not proof of causes or seasonality.

import Anthropic from "@anthropic-ai/sdk";
import { measuredAnomalyText, type EvidenceMetric } from "./evidence-text";
import {
  esCambioCreible,
  esSubaDeGastoCreible,
  elCeroEsNoticia,
  VOLUMEN_MINIMO,
} from "./piso-de-volumen";

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
  adConversions?: number; // Provider-attributed conversions, not store orders.
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
  if (!Number.isFinite(current) || !Number.isFinite(previous) || current < 0 || previous <= 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

// A missing cost is currently summed as zero. Partial coverage therefore cannot
// establish a change in profitability, even when both percentages look similar.
export function comparableCosts(current: MetricSnapshot, previous: MetricSnapshot): boolean {
  return [current, previous].every(s => s.cogsCoverage === 100 && s.revenue > 0 &&
    Number.isFinite(s.revenue) && Number.isFinite(s.grossProfit) && Number.isFinite(s.grossMargin));
}

export function detectRuleBasedAnomalies(
  current: MetricSnapshot,
  previous: MetricSnapshot
): AnomalyResult[] {
  const anomalies: AnomalyResult[] = [];

  // Volumen usado como filtro heurístico; no prueba significancia estadística.
  const base = Math.max(current.orders, previous.orders);
  const adBase = [current.adConversions, previous.adConversions].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0)
    ? Math.max(current.adConversions!, previous.adConversions!) : 0;

  const revChange = pctChange(current.revenue, previous.revenue);
  const ordersChange = pctChange(current.orders, previous.orders);
  const adSpendChange = pctChange(current.adSpend, previous.adSpend);
  const roasChange = pctChange(current.roas, previous.roas);
  const aovChange = pctChange(current.aov, previous.aov);
  const marginDiff = current.grossMargin - previous.grossMargin;

  // Revenue crash
  if (esCambioCreible(revChange, THRESHOLDS.revenueDrop, base)) {
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
  if (esCambioCreible(revChange, THRESHOLDS.revenueSpike, base)) {
    anomalies.push({
      type: "OPPORTUNITY",
      priority: "MEDIUM",
      title: `Facturacion subio ${revChange}% vs periodo anterior`,
      description: `Excelente performance. Facturacion paso de $${Math.round(previous.revenue).toLocaleString("es-AR")} a $${Math.round(current.revenue).toLocaleString("es-AR")}. Identificar que impulso este crecimiento.`,
      action: "Comparar campañas, productos y canales de ambos períodos antes de decidir cambios de inversión.",
      metric: "revenue",
      metricValue: current.revenue,
      metricDelta: revChange,
    });
  }

  // Ad spend spike without revenue growth
  //
  // El aumento de gasto usa el umbral de negocio aunque haya pocas ventas.
  if (
    esSubaDeGastoCreible(adSpendChange, THRESHOLDS.adSpendSpike, previous.adSpend) &&
    (revChange !== null ? revChange < 10 : current.revenue === 0 && previous.revenue === 0)
  ) {
    anomalies.push({
      type: "ALERT",
      priority: "HIGH",
      title: `Inversion en ads subio ${adSpendChange}% sin crecimiento proporcional`,
      description: `El gasto publicitario aumento significativamente pero la facturacion no acompano. Meta: $${Math.round(current.metaSpend).toLocaleString("es-AR")}, Google: $${Math.round(current.googleSpend).toLocaleString("es-AR")}.`,
      action: "Revisar inversión, conversiones y ventanas de atribución por campaña antes de modificar presupuestos.",
      metric: "adSpend",
      metricValue: current.adSpend,
      metricDelta: adSpendChange,
    });
  }

  // ROAS drop
  if (Number.isFinite(current.adSpend) && current.adSpend > 0 && Number.isFinite(previous.adSpend) && previous.adSpend > 0 && esCambioCreible(roasChange, THRESHOLDS.roasDrop, adBase)) {
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
  if (current.adSpend > 0 && previous.adSpend > 0 && (current.adConversions ?? 0) > 0 && (previous.adConversions ?? 0) > 0 && esCambioCreible(cpaChange, THRESHOLDS.cpaSpikeHigh, adBase)) {
    anomalies.push({
      type: "ALERT",
      priority: "MEDIUM",
      title: `CPA aumento ${cpaChange}% — mayor costo por conversión atribuida`,
      description: `El costo por conversión atribuida paso de $${Math.round(previous.cpa).toLocaleString("es-AR")} a $${Math.round(current.cpa).toLocaleString("es-AR")}. Las conversiones publicitarias no equivalen necesariamente a clientes nuevos o únicos.`,
      action: "Optimizar landing pages, revisar targeting de audiencias, y probar nuevos creativos.",
      metric: "cpa",
      metricValue: current.cpa,
      metricDelta: cpaChange,
    });
  }

  // AOV drop
  if (current.orders > 0 && previous.orders > 0 && esCambioCreible(aovChange, THRESHOLDS.aovDrop, base)) {
    anomalies.push({
      type: "TREND",
      priority: "MEDIUM",
      title: `Ticket promedio bajo ${Math.abs(aovChange)}%`,
      description: `El importe promedio por pedido paso de $${Math.round(previous.aov).toLocaleString("es-AR")} a $${Math.round(current.aov).toLocaleString("es-AR")}. Esto no permite determinar si cambió la cantidad de productos por pedido.`,
      action: "Revisar precios, descuentos y composición de los pedidos antes de definir promociones.",
      metric: "aov",
      metricValue: current.aov,
      metricDelta: aovChange,
    });
  }

  // Missing costs must not produce an apparent improvement/drop in profit.
  const hasCostData = comparableCosts(current, previous);
  if (hasCostData && base >= VOLUMEN_MINIMO && marginDiff <= THRESHOLDS.grossMarginDrop) {
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
  if (current.orders === 0 && elCeroEsNoticia(previous.orders)) {
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

/** Treat provider JSON as untrusted data. Numeric evidence comes from the
 * measured snapshots, never from model-generated amounts or percentages.
 */
export function validateAnomalies(input: unknown, current: MetricSnapshot, previous: MetricSnapshot): AnomalyResult[] {
  if (!input || typeof input !== "object" || !Array.isArray((input as { anomalies?: unknown }).anomalies)) return [];
  const rows = (input as { anomalies: unknown[] }).anomalies;
  const types = new Set(["ALERT", "OPPORTUNITY", "TREND", "RECOMMENDATION"]);
  const priorities = new Set(["HIGH", "MEDIUM", "LOW"]);
  const metrics = new Set(["revenue", "orders", "adSpend", "metaSpend", "googleSpend", "roas", "cpa", "aov", "grossMargin", "grossProfit"]);
  const result: AnomalyResult[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const a = row as Record<string, unknown>;
    if (typeof a.type !== "string" || !types.has(a.type) || typeof a.priority !== "string" || !priorities.has(a.priority)) continue;
    if (typeof a.metric !== "string" || !metrics.has(a.metric) || seen.has(a.metric)) continue;
    const validText = (field: unknown, max: number): field is string => typeof field === "string" && field.trim().length > 0 && field.length <= max;
    if (!validText(a.title, 200) || !validText(a.description, 1500) || !validText(a.action, 500)) continue;
    if (typeof a.metricValue !== "number" || !Number.isFinite(a.metricValue) ||
      (a.metricDelta !== null && (typeof a.metricDelta !== "number" || !Number.isFinite(a.metricDelta)))) continue;
    if ((a.metric === "grossMargin" || a.metric === "grossProfit") && !comparableCosts(current, previous)) continue;
    if ((a.metric === "roas" || a.metric === "cpa") && !(current.adSpend > 0 && previous.adSpend > 0)) continue;
    if (a.metric === "cpa" && !((current.adConversions ?? 0) > 0 && (previous.adConversions ?? 0) > 0)) continue;
    if (a.metric === "aov" && !(current.orders > 0 && previous.orders > 0)) continue;
    const metric = a.metric as keyof MetricSnapshot;
    const value = current[metric], before = previous[metric];
    if (typeof value !== "number" || typeof before !== "number" || !Number.isFinite(value) || !Number.isFinite(before)) continue;
    const delta = metric === "grossMargin" ? Math.round(value - before) : pctChange(value, before);
    if (delta !== null && !Number.isFinite(delta)) continue;
    result.push({ type: a.type as AnomalyResult["type"], priority: a.priority as AnomalyResult["priority"],
      ...measuredAnomalyText(metric as EvidenceMetric, value, before, delta),
      metric, metricValue: value, metricDelta: delta });
    seen.add(metric);
    if (result.length === 3) break;
  }
  return result;
}

export async function detectClaudeAnomalies(
  current: MetricSnapshot,
  previous: MetricSnapshot,
  orgName: string,
  additionalContext?: string
): Promise<AnomalyResult[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Análisis contextual no disponible: proveedor sin configurar");

  const anthropic = new Anthropic({ apiKey });

  const profitLine = (s: MetricSnapshot) => comparableCosts(current, previous)
    ? `Ganancia Bruta: $${Math.round(s.grossProfit).toLocaleString("es-AR")} (margen: ${s.grossMargin}%)`
    : "Ganancia y margen: no disponibles para comparar; costos incompletos en uno o ambos períodos.";
  const prompt = `Analiza estos KPIs de "${orgName}" (ecommerce Argentina, moneda ARS) y detecta anomalias o patrones interesantes que un sistema de reglas NO detectaria.

PERIODO ACTUAL (ultimos 7 dias completos, hora Argentina):
- Facturacion: $${Math.round(current.revenue).toLocaleString("es-AR")}
- Pedidos: ${current.orders}
- ${profitLine(current)}
- Inversion Ads: $${Math.round(current.adSpend).toLocaleString("es-AR")} (Meta: $${Math.round(current.metaSpend).toLocaleString("es-AR")}, Google: $${Math.round(current.googleSpend).toLocaleString("es-AR")})
- ROAS: ${current.roas}x
- CPA: ${current.adConversions && current.adConversions > 0 ? "$" + Math.round(current.cpa).toLocaleString("es-AR") : "no disponible (sin conversiones medidas)"}
- AOV: $${Math.round(current.aov).toLocaleString("es-AR")}

PERIODO ANTERIOR (7 dias previos):
- Facturacion: $${Math.round(previous.revenue).toLocaleString("es-AR")}
- Pedidos: ${previous.orders}
- ${profitLine(previous)}
- Inversion Ads: $${Math.round(previous.adSpend).toLocaleString("es-AR")}
- ROAS: ${previous.roas}x
- CPA: ${previous.adConversions && previous.adConversions > 0 ? "$" + Math.round(previous.cpa).toLocaleString("es-AR") : "no disponible (sin conversiones medidas)"}
- AOV: $${Math.round(previous.aov).toLocaleString("es-AR")}

${additionalContext ? `CONTEXTO ADICIONAL:\n${additionalContext}` : ""}

COBERTURA DE DATOS DE COSTO: actual ${current.cogsCoverage ?? 0}%, anterior ${previous.cogsCoverage ?? 0}%.

INSTRUCCIONES:
- Selecciona métricas que convenga revisar comparando ambos períodos. Dos agregados semanales no prueban correlaciones, tendencias graduales, estacionalidad ni causas; no afirmes esos fenómenos sin evidencia adicional.
- El texto visible se construye con los valores medidos. Tu selección y prioridad son recomendaciones heurísticas, no una prueba estadística.
- NO repitas lo que detectarian reglas simples (ej: "revenue bajo X%"). Eso ya lo cubrimos.
- IMPORTANTE: Si la cobertura de costos no es 100% en AMBOS períodos, NO generes insights sobre margen, ganancia o COGS ni los infieras de otras métricas.
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
      if (!match) throw new Error("Respuesta contextual inválida");
      parsed = JSON.parse(match[0]);
    }
    if (!parsed || !Array.isArray(parsed.anomalies)) throw new Error("Respuesta contextual inválida");
    const validated = validateAnomalies(parsed, current, previous);
    // Dropped/duplicate/unsupported rows are a failed analysis, not evidence
    // that no anomaly exists. The caller retains its independent rule results.
    if (validated.length !== parsed.anomalies.length) throw new Error("Hallazgos contextuales inválidos");
    return validated;
  } catch (error: any) {
    console.error("[anomaly] Contextual analysis unavailable");
    throw new Error("No se pudo completar el análisis contextual de anomalías");
  }
}
