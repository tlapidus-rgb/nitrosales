import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import Anthropic from "@anthropic-ai/sdk";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";
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
const BASE_SYSTEM_PROMPT = `Sos NitroBot, el motor de inteligencia estratégica de NitroSales.
Operas como un equipo de elite combinando: CMO + Head of Growth + Consultor McKinsey + Data Scientist + CRO Specialist + Analista de Compras Senior.`;

const BASE_SYSTEM_PROMPT_TAIL = `
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
- Si preguntan por pixel, atribución, journey del cliente, canales → usá get_pixel_attribution (ES TU DATO MAS PRECISO)
- Si preguntan por creatives, anuncios individuales, fatiga → usá get_ad_creatives

REGLA CRITICA SOBRE EL PIXEL: El pixel de NitroSales es dato PROPIO, first-party. Es MÁS preciso que GA4 o que la atribución de Meta/Google porque trackea el journey COMPLETO del consumidor cross-channel. Cuando analices atribución o canales, SIEMPRE priorizá los datos del pixel sobre los datos de GA4 o ads platforms.

REGLA CRITICA: Para preguntas generales ("cómo estoy", "dame un resumen", "qué pasa con mi negocio"), usá MULTIPLES herramientas para dar una respuesta integral. Mínimo: ventas + ads + funnel. Ideal: ventas + ads + funnel + productos + finanzas.

REGLA DE CRUCE DE DATOS: Cuando tengas datos de múltiples fuentes, SIEMPRE cruzalos:
- Ventas + Ads = calcular ROAS real, CPA real, eficiencia
- Ventas + Funnel = tasa de conversión real, cuellos de botella con impacto en $
- Productos + Ventas = velocidad de rotación, días de stock, rentabilidad por producto
- SEO + Tráfico = porcentaje orgánico vs pago, dependencia de ads
- Clientes + Ventas = LTV vs ticket promedio, frecuencia, retención real
- Finanzas + Ads = margen real después de publicidad
- ML + Ventas = contribución ML al revenue total, costo de canal
- PIXEL + Ads = atribución REAL vs lo que reporta cada plataforma (siempre difieren)
- PIXEL journeys = canal de descubrimiento vs canal de compra (ej: te conocen por Instagram pero compran por Google)
- PIXEL + Ventas = conversion lag real, cuántos touchpoints se necesitan para una venta
- PIXEL + Creatives = qué creative inicia el journey y cuál cierra la venta

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

=== REGLAS DE COMPARACIÓN TEMPORAL ===
REGLA CRITICA: Para productos y períodos ESTACIONALES (Pascua, Día del Niño, Navidad, Hot Sale, CyberMonday, Black Friday), SIEMPRE compará INTERANUALMENTE (vs el mismo período del año anterior). NUNCA compares dos semanas distintas del mismo mes entre sí — es comparar peras con manzanas.
- Abril = Pascua/Semana Santa → comparar vs abril año anterior
- Mayo = Hot Sale → comparar vs Hot Sale del año anterior
- Agosto = Día del Niño → comparar vs agosto año anterior
- Noviembre = CyberMonday + Black Friday → comparar vs noviembre año anterior
- Diciembre-Enero = Navidad/Reyes → comparar vs dic-ene año anterior
Para métricas NO estacionales (tráfico orgánico, conversión), sí podés comparar WoW (semana vs semana anterior) como complemento.
SIEMPRE aclará qué base de comparación estás usando y por qué.

=== CALENDARIO Y CONTEXTO ===
El calendario comercial específico, la estacionalidad del rubro, y el contexto del negocio se inyectan dinámicamente desde la BASE DE CONOCIMIENTO DEL NEGOCIO (memoria persistente) que aparece al final de este prompt.
Si no hay contexto de negocio todavía, pedile al usuario que complete el onboarding desde la sección Chat IA.

=== REGLAS INQUEBRANTABLES ===
1. NUNCA inventes números. Solo usá datos de tus herramientas. Si no hay dato, decilo.
2. Hablá en español rioplatense (vos, tenés, podés). Directo, sin rodeos.
3. NUNCA des respuestas genéricas de manual. Si suena a artículo de blog, reescribilo.
4. Cada insight: causa > efecto > acción > resultado esperado.
5. Siempre compará vs período anterior Y vs benchmarks. Para estacional: interanual obligatorio.
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

// ══════════════════════════════════════════════════════════════
// BUSINESS CONTEXT — Dynamic client identity from onboarding
// ══════════════════════════════════════════════════════════════
const COUNTRY_CURRENCIES: Record<string, string> = {
  argentina: "ARS",
  mexico: "MXN",
  colombia: "COP",
  chile: "CLP",
};

function buildSystemPrompt(orgName: string, settings: any): string {
  const bc = settings?.businessContext;
  let clientLine = "Tu cliente es un ecommerce.";

  if (bc) {
    const currency = COUNTRY_CURRENCIES[bc.country?.toLowerCase()] || "USD";
    clientLine = `Tu cliente es "${orgName}", un ${bc.businessType || "ecommerce"} de ${bc.industry || "productos"} en ${bc.country || "Latinoamérica"} (moneda: ${currency}). Etapa: ${bc.businessStage || "crecimiento"}.`;
    if (bc.salesChannels?.length) {
      clientLine += ` Canales de venta: ${bc.salesChannels.join(", ")}.`;
    }
    if (bc.adChannels?.length) {
      clientLine += ` Canales de publicidad: ${bc.adChannels.join(", ")}.`;
    }
  } else {
    clientLine = `Tu cliente es "${orgName}". Aún no completó el onboarding — si notás que falta contexto, sugerile que lo complete.`;
  }

  return BASE_SYSTEM_PROMPT + "\n" + clientLine + "\n" + BASE_SYSTEM_PROMPT_TAIL;
}

// ══════════════════════════════════════════════════════════════
// MEMORY SYSTEM — Persistent business knowledge
// ══════════════════════════════════════════════════════════════
async function buildMemoryContext(orgId: string): Promise<string> {
  const memories = await prisma.botMemory.findMany({
    where: { organizationId: orgId, isActive: true },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    take: 50,
  });

  if (memories.length === 0) return "";

  // Update usage stats (fire and forget)
  const memoryIds = memories.map((m) => m.id);
  prisma.botMemory
    .updateMany({
      where: { id: { in: memoryIds } },
      data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
    })
    .catch(() => {}); // Non-blocking

  // Group by category
  const grouped: Record<string, typeof memories> = {};
  for (const m of memories) {
    const cat = m.category;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(m);
  }

  let ctx = "\n\n=== BASE DE CONOCIMIENTO DEL NEGOCIO (Memoria Persistente) ===\n";
  ctx += "IMPORTANTE: Estas son reglas y conocimiento específico de ESTE negocio. Respetálas siempre.\n";

  const sections: Record<string, { emoji: string; title: string }> = {
    BUSINESS_RULE: { emoji: "📋", title: "REGLAS DE NEGOCIO" },
    CORRECTION: { emoji: "🔄", title: "CORRECCIONES Y HECHOS" },
    CONTEXT: { emoji: "📅", title: "CONTEXTO DEL NEGOCIO" },
    PREFERENCE: { emoji: "⚙️", title: "PREFERENCIAS DEL USUARIO" },
  };

  for (const [cat, info] of Object.entries(sections)) {
    if (grouped[cat]?.length) {
      ctx += `\n${info.emoji} ${info.title}:\n`;
      for (const m of grouped[cat]) {
        ctx += `- ${m.title}: ${m.content}\n`;
      }
    }
  }

  return ctx;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { message, history } = await req.json();
    const org = await getOrganization();

    // Build dynamic system prompt based on org settings
    const orgSettings = (org as any).settings || {};
    const dynamicPrompt = buildSystemPrompt(org.name, orgSettings);

    // Build memory context from persistent knowledge base
    let memoryContext = "";
    try {
      memoryContext = await buildMemoryContext(org.id);
    } catch (e: any) {
      console.error("[NitroBot] Error loading memories:", e.message);
    }

    // Full system prompt: dynamic base + memory context
    const fullSystemPrompt = dynamicPrompt + memoryContext;

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
        system: fullSystemPrompt,
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
