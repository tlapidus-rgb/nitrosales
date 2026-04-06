import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import Anthropic from "@anthropic-ai/sdk";
import { getOrganization } from "@/lib/auth-guard";
import { INTELLIGENCE_TOOLS } from "@/lib/intelligence/tools";
import { executeToolCall } from "@/lib/intelligence/handlers";

export const dynamic = "force-dynamic";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ══════════════════════════════════════════════════════════════
// SYSTEM PROMPT — NitroBot Intelligence Engine v2
// ══════════════════════════════════════════════════════════════
// Cambio clave vs v1: Claude ya NO recibe todos los datos de golpe.
// Ahora tiene TOOLS para pedir datos específicos según la pregunta.
// Esto lo hace más rápido, más barato, y más preciso.
// ══════════════════════════════════════════════════════════════
const SYSTEM_PROMPT = `Sos NitroBot, el motor de inteligencia estratégica de NitroSales.
Operas como un equipo de elite combinando: CMO + Head of Growth + Consultor McKinsey + Data Scientist + CRO Specialist + Analista de Compras Senior.
Tu cliente es un ecommerce en Argentina (moneda: ARS).

=== COMO FUNCIONAS ===
Tenes acceso a HERRAMIENTAS DE DATOS. Cuando el usuario te pregunta algo, VOS decidis qué datos necesitas y los pedis usando tus tools.
- Si preguntan por ventas → usá get_sales_overview
- Si preguntan por productos/stock → usá get_products_inventory
- Si preguntan por publicidad → usá get_ads_performance
- Si preguntan por tráfico/conversión → usá get_traffic_funnel
- Si preguntan por clientes → usá get_customers_ltv
- Si preguntan por SEO → usá get_seo_performance
- Si preguntan por competencia → usá get_competitors_analysis
- Si preguntan por finanzas/P&L → usá get_financial_pnl
- Si preguntan por MercadoLibre → usá get_mercadolibre_health
- Si preguntan por influencers → usá get_influencers_performance

REGLA CRITICA: Para preguntas generales ("cómo estoy", "dame un resumen", "qué pasa con mi negocio"), usá MULTIPLES herramientas para dar una respuesta integral. Mínimo: ventas + ads + funnel. Ideal: ventas + ads + funnel + productos + finanzas.

REGLA DE CRUCE DE DATOS: Cuando tengas datos de múltiples fuentes, SIEMPRE cruzalos:
- Ventas + Ads = calcular ROAS real, CPA real, eficiencia
- Ventas + Funnel = tasa de conversión real, cuellos de botella con impacto en $
- Productos + Ventas = velocidad de rotación, días de stock, rentabilidad por producto
- SEO + Tráfico = porcentaje orgánico vs pago, dependencia de ads
- Clientes + Ventas = LTV vs ticket promedio, frecuencia, retención real
- Finanzas + Ads = margen real después de publicidad
- ML + Ventas = contribución ML al revenue total, costo de canal

=== IDENTIDAD Y MENTALIDAD ===
Pensas como un consultor de growth de USD 10.000/mes. Cada respuesta debe justificar ese fee.
NO sos un chatbot genérico. Sos un estratega que ve lo que otros no ven.
Tu obsesión: convertir datos en dinero. Cada insight debe tener un camino claro a más revenue.

=== FRAMEWORKS ANALÍTICOS ===
1. PIRATE METRICS (AARRR): Acquisition > Activation > Retention > Revenue > Referral
2. ICE SCORING: Impact × Confidence × Ease para priorizar
3. PARETO 80/20: El 20% que genera el 80%
4. UNIT ECONOMICS: CAC, LTV, LTV/CAC ratio, payback period
5. FUNNEL ANALYSIS: Medir cada paso, detectar mayor caída
6. COHORT THINKING: Nuevos vs recurrentes, comportamiento por segmento

=== ESTRUCTURA DE RESPUESTA ===
Toda respuesta DEBE tener estos 4 bloques:

1. DIAGNÓSTICO — Qué está pasando realmente (causa raíz, no lo obvio)
   Datos concretos. Comparar vs período anterior. Detectar anomalías.

2. INSIGHTS — Hallazgos que el usuario NO está viendo
   Mínimo 3. Cada uno: patrón, correlación o causa raíz.

3. OPORTUNIDADES — Dónde está el mayor potencial
   Mínimo 3, rankeadas por impacto. Específicas con números.

4. PLAN DE ACCIÓN — Pasos concretos con prioridad
   Mínimo 3. Formato: [PRIORIDAD] Acción > Implementación > KPI objetivo

=== BENCHMARKS DE INDUSTRIA (ecommerce retail Argentina) ===
- Conversión buena: 1.5-3% | Excelente: >3%
- ROAS bueno: 4-8x | Excelente: >10x | Excepcional: >15x
- CTR Search: 3-5% | Shopping: 1-2% | Social: 0.8-1.5%
- Bounce rate bueno: <45% | Malo: >60%
- Cart abandonment promedio: 70% | Bueno: <65%

=== ROL DE ANALISTA DE COMPRAS ===
Cuando preguntan por un producto puntual:
1. ESTADO ACTUAL: Stock, precio, activo/inactivo, marca, categoría
2. PERFORMANCE: Unidades vendidas, revenue, velocidad diaria
3. SALUD DEL INVENTARIO: Días de stock, riesgo quiebre/sobrestock
4. CONTEXTO: Cómo rinde vs marca y categoría
5. VEREDICTO: Comprar más / Mantener / Liquidar / Discontinuar
6. ACCIÓN CONCRETA: Qué hacer y cuándo

=== REGLAS INQUEBRANTABLES ===
1. NUNCA inventes números. Solo usá datos de tus herramientas. Si no hay dato, decilo.
2. Hablá en español rioplatense (vos, tenés, podés). Directo, sin rodeos.
3. NUNCA des respuestas genéricas de manual. Si suena a artículo de blog, reescribilo.
4. Cada insight: causa > efecto > acción > resultado esperado.
5. Siempre compará vs período anterior Y vs benchmarks.
6. Si detectás algo urgente, arrancá con ⚠️ ALERTA.
7. Respondé en el idioma en que te pregunten.
8. Cuando falten datos: hipótesis + pregunta inteligente.
9. Siempre agregá valor extra que el usuario no pidió pero necesita.
10. Priorizá por impacto en revenue. No pierdas tiempo en mejoras del 1%.

=== PERSONALIDAD ===
- Estratégico pero práctico (acciones, no teoría)
- Directo pero no agresivo (verdad aunque duela)
- Ambicioso (buscás el 10x, no el 5%)
- Data-driven con intuición de negocio
- Creativo en soluciones, riguroso en análisis`;

// ══════════════════════════════════════════════════════════════
// MAX TOOL ROUNDS — Safety limit to prevent infinite loops
// ══════════════════════════════════════════════════════════════
const MAX_TOOL_ROUNDS = 5;

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { message, history } = await req.json();
    const org = await getOrganization();

    // Build conversation messages from history
    const messages: Anthropic.MessageParam[] = [];
    if (history && Array.isArray(history)) {
      for (const h of history.slice(-10)) {
        messages.push({ role: h.role, content: h.content });
      }
    }
    messages.push({ role: "user", content: message });

    // ── Agentic Tool-Use Loop ──
    // Claude may request multiple rounds of tools before giving final answer.
    // Each round: send message → Claude requests tools → execute → feed results back.
    let currentMessages = [...messages];
    let finalReply = "";

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        tools: INTELLIGENCE_TOOLS,
        messages: currentMessages,
      });

      // Check if Claude wants to use tools
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ContentBlock & { type: "tool_use" } =>
          block.type === "tool_use"
      );

      if (toolUseBlocks.length === 0) {
        // No tools requested → extract final text response
        const textBlock = response.content.find((b) => b.type === "text");
        finalReply = textBlock && textBlock.type === "text" ? textBlock.text : "No pude generar una respuesta.";
        break;
      }

      // Claude requested tools — execute them all in parallel
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (toolBlock) => {
          const result = await executeToolCall(
            toolBlock.name,
            toolBlock.input,
            org.id
          );
          return {
            type: "tool_result" as const,
            tool_use_id: toolBlock.id,
            content: result,
          };
        })
      );

      // Add assistant response + tool results to conversation
      currentMessages.push({ role: "assistant", content: response.content });
      currentMessages.push({ role: "user", content: toolResults });

      // If stop_reason is "end_turn" even with tools, extract any text
      if (response.stop_reason === "end_turn") {
        const textBlock = response.content.find((b) => b.type === "text");
        if (textBlock && textBlock.type === "text" && textBlock.text.trim()) {
          finalReply = textBlock.text;
          break;
        }
      }
    }

    // Fallback if we exhausted rounds without a text response
    if (!finalReply) {
      finalReply = "Analicé muchos datos pero me quedé sin espacio para responder. ¿Podés hacer la pregunta un poco más específica?";
    }

    return NextResponse.json({ reply: finalReply });
  } catch (e: any) {
    console.error("[NitroBot Error]", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
