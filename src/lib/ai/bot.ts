// ══════════════════════════════════════════════
// Motor del Bot de IA - NitroSales
// ══════════════════════════════════════════════
// Este es el "cerebro" que analiza los datos de todas las
// fuentes y genera insights accionables.

import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `Sos un experto senior en ecommerce y marketing digital con 15 años de experiencia.
Tu nombre es NitroBot y trabajás dentro de la plataforma NitroSales.

Tu rol es analizar los datos del ecommerce del cliente y darle recomendaciones ACCIONABLES para vender más.

REGLAS IMPORTANTES:
1. SIEMPRE basate en los datos reales que te comparto. No inventes números.
2. Cada insight debe tener una ACCIÓN CONCRETA que el cliente pueda ejecutar.
3. Hablá en español rioplatense (vos, tenés, podés). Sé directo y claro.
4. No uses jerga técnica innecesaria. Si usás un término técnico, explicalo brevemente.
5. Priorizá los insights por impacto en revenue.
6. Cuando compares métricas, siempre da el contexto (vs período anterior, vs benchmark).
7. Si ves algo urgente (caída fuerte de ROAS, spike de CPA), marcalo como ALERTA.
8. Sé conciso. Un insight no debería ser más de 3-4 oraciones.

FUENTES DE DATOS DISPONIBLES:
- VTEX: órdenes, productos, clientes, revenue
- Google Analytics 4: tráfico web, embudos, comportamiento
- Meta Ads: campañas de Facebook/Instagram, ROAS, CPA
- Google Ads: campañas de Search/Shopping, keywords, Quality Score

FORMATO DE RESPUESTA:
Cuando analices datos, usá este formato para cada insight:
📊 [CATEGORÍA] Título del insight
💡 Análisis: Qué está pasando y por qué
🎯 Acción: Qué hacer al respecto
📈 Impacto esperado: Qué resultado se podría esperar
`;

export class NitroBot {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  // ── Chat interactivo con el usuario ──
  async chat(params: {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    currentData?: DashboardContext;
  }): Promise<string> {
    const systemMessage = this.buildSystemMessage(params.currentData);

    const response = await this.client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: systemMessage,
      messages: params.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock?.text || "No pude generar una respuesta. Intentá de nuevo.";
  }

  // ── Generar insights automáticos diarios ──
  async generateDailyInsights(data: DashboardContext): Promise<GeneratedInsight[]> {
    const prompt = this.buildInsightPrompt(data);

    const response = await this.client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 3000,
      system: SYSTEM_PROMPT + "\n\nRespondé SOLO con un JSON array de insights. Nada más.",
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock?.text) return [];

    try {
      const cleaned = textBlock.text.replace(/```json\n?|```\n?/g, "").trim();
      return JSON.parse(cleaned);
    } catch {
      console.error("Error parsing bot insights:", textBlock?.text);
      return [];
    }
  }

  // ── Construir el mensaje de sistema con datos actuales ──
  private buildSystemMessage(data?: DashboardContext): string {
    if (!data) return SYSTEM_PROMPT;

    let context = SYSTEM_PROMPT + "\n\n--- DATOS ACTUALES DEL CLIENTE ---\n";

    if (data.sales) {
      context += `\n📦 VENTAS (últimos ${data.periodDays || 30} días):
- Revenue total: $${data.sales.totalRevenue?.toLocaleString()}
- Cambio vs período anterior: ${data.sales.revenueChange > 0 ? "+" : ""}${data.sales.revenueChange}%
- Órdenes: ${data.sales.totalOrders}
- Ticket promedio: $${data.sales.averageOrderValue?.toLocaleString()}
- Top productos: ${data.sales.topProducts?.map((p) => `${p.name} ($${p.revenue})`).join(", ")}
`;
    }

    if (data.marketing) {
      context += `\n📣 MARKETING:
- ROAS global: ${data.marketing.globalROAS}x
- ROAS Meta: ${data.marketing.metaROAS}x | ROAS Google: ${data.marketing.googleROAS}x
- CPA global: $${data.marketing.globalCPA?.toLocaleString()}
- Gasto total ads: $${data.marketing.totalAdSpend?.toLocaleString()}
- Revenue por ads: $${data.marketing.totalAdRevenue?.toLocaleString()}
- Gasto Meta: $${data.marketing.metaSpend?.toLocaleString()} | Gasto Google: $${data.marketing.googleSpend?.toLocaleString()}
`;
    }

    if (data.funnel) {
      context += `\n🔍 EMBUDO:
- Visitantes: ${data.funnel.visitors?.toLocaleString()}
- Vieron producto: ${data.funnel.productViews?.toLocaleString()}
- Add to cart: ${data.funnel.addToCarts?.toLocaleString()}
- Checkout: ${data.funnel.checkoutStarts?.toLocaleString()}
- Compras: ${data.funnel.purchases?.toLocaleString()}
- Tasa de conversión: ${data.funnel.conversionRate}%
- Abandono de carrito: ${data.funnel.cartAbandonmentRate}%
`;
    }

    if (data.web) {
      context += `\n🌐 TRÁFICO WEB:
- Sesiones: ${data.web.totalSessions?.toLocaleString()}
- Usuarios: ${data.web.totalUsers?.toLocaleString()}
- Duración promedio: ${data.web.avgSessionDuration}s
- Tasa de rebote: ${data.web.bounceRate}%
- Top fuentes: ${data.web.topSources?.map((s) => `${s.source}/${s.medium}: ${s.sessions}`).join(", ")}
`;
    }

    return context;
  }

  // ── Construir el prompt para insights automáticos ──
  private buildInsightPrompt(data: DashboardContext): string {
    return `Analizá los siguientes datos del ecommerce y generá entre 3 y 6 insights accionables.
Priorizá por impacto en revenue. Incluí al menos 1 alerta si hay algo preocupante.

${this.buildSystemMessage(data).split("--- DATOS ACTUALES DEL CLIENTE ---")[1] || ""}

Respondé SOLO con un JSON array con este formato:
[
  {
    "type": "ALERT" | "OPPORTUNITY" | "TREND" | "RECOMMENDATION",
    "priority": "HIGH" | "MEDIUM" | "LOW",
    "title": "Título corto y claro",
    "description": "Explicación de qué está pasando (2-3 oraciones)",
    "action": "Qué hacer al respecto (acción concreta)",
    "metric": "Nombre del KPI principal relacionado",
    "metricValue": 123.45,
    "metricDelta": -15.5
  }
]`;
  }
}

// ── Tipos para el contexto del dashboard ──
export interface DashboardContext {
  periodDays?: number;
  sales?: {
    totalRevenue: number;
    revenueChange: number;
    totalOrders: number;
    averageOrderValue: number;
    topProducts?: Array<{ name: string; revenue: number }>;
  };
  marketing?: {
    globalROAS: number;
    metaROAS: number;
    googleROAS: number;
    globalCPA: number;
    totalAdSpend: number;
    totalAdRevenue: number;
    metaSpend: number;
    googleSpend: number;
  };
  funnel?: {
    visitors: number;
    productViews: number;
    addToCarts: number;
    checkoutStarts: number;
    purchases: number;
    conversionRate: number;
    cartAbandonmentRate: number;
  };
  web?: {
    totalSessions: number;
    totalUsers: number;
    avgSessionDuration: number;
    bounceRate: number;
    topSources?: Array<{ source: string; medium: string; sessions: number }>;
  };
}

export interface GeneratedInsight {
  type: "ALERT" | "OPPORTUNITY" | "TREND" | "RECOMMENDATION";
  priority: "HIGH" | "MEDIUM" | "LOW";
  title: string;
  description: string;
  action: string;
  metric?: string;
  metricValue?: number;
  metricDelta?: number;
}
