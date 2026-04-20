import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import Anthropic from "@anthropic-ai/sdk";
import { getOrganization } from "@/lib/auth-guard";
import { ALERT_TOOLS, ALERT_TOOLS_PROMPT, isAlertToolName } from "@/lib/alerts/aurum-tools";
import { executeAlertTool } from "@/lib/alerts/aurum-handlers";
import { getSessionUserId } from "@/lib/alerts/get-user-id";

export const dynamic = "force-dynamic";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MAX_TOOL_ROUNDS = 3;

/**
 * POST /api/aurum/section-insight
 *
 * Aurum contextual — analiza UNA tab/sección específica de la app.
 * A diferencia de /api/chat (full Aurum con tools), este endpoint:
 *   - Recibe la data ya cruda en el body (contextData)
 *   - No usa tools — la data la provee el caller
 *   - Respuestas cortas, concretas, solo sobre la data provista
 *   - Modelo haiku para latencia baja y bajo costo
 *
 * Body: {
 *   section: string;           // ej: "seo.opportunities", "seo.movers.up"
 *   contextLabel: string;      // ej: "Oportunidades de oro"
 *   contextData: object;       // data ya resumida (no todo el payload)
 *   question?: string;         // si viene vacío → genera insight inicial
 *   history?: {role, content}[];
 * }
 */
type InsightMode = "initial" | "question";

const SYSTEM_PROMPT_BASE = `Sos Aurum, el asistente estratégico de NitroSales, analizando UNA sección específica del dashboard.

=== REGLAS ABSOLUTAS ===
1. Respondés SOLO usando la data que te pasa el usuario en <context_data>. No inventes números.
2. Español rioplatense (vos, tenés, podés). Directo, sin rodeos.
3. RESPUESTAS CORTAS. Nunca más de 6 oraciones totales. Sin relleno.
4. No uses los 4 bloques del Aurum chat completo (Diagnóstico/Insights/etc). Esto es micro-análisis.
5. No des links ni recomendaciones de tools externas salvo que el usuario pregunte específicamente.
6. Hablale como coach puntual sobre ESA tab. Si pregunta algo que está fuera del alcance de esa tab, decile amablemente "para eso mejor preguntame en el chat de Aurum completo". EXCEPCIÓN: si te pide CREAR una alerta/regla de monitoreo (cualquier "avisame si...", "alertame cuando...", "todos los lunes mandame..."), tenés tools especiales para eso (ver sección CREACIÓN DE ALERTAS más abajo) — NO lo derives al chat completo, manejalo vos directo desde acá.
7. Cuando des números, mostralos limpios (ej: "23 clicks", "2.4% CTR", "pos. 7.3").
8. Nunca digas "como puedo ayudarte" ni frases genéricas.

=== FORMATO ===
- Insight inicial: arrancás con 1 frase hook (ej "Acá hay 3 oportunidades con potencial claro."). Después 2-3 bullets CORTÍSIMOS (máx 12 palabras c/u) con los hallazgos concretos.
- Pregunta del usuario: respuesta de 2-4 oraciones, directo al grano. Si aplica, terminás con UNA acción concreta.
- Usá **negrita** solo para destacar números clave o la acción principal. Nada más.`;

function buildSectionPrompt(section: string, contextLabel: string, contextData: any, mode: InsightMode): string {
  const dataStr = JSON.stringify(contextData, null, 2);

  const sectionFocus: Record<string, string> = {
    "seo.health": "Enfocate en el score 0-100 y su breakdown. Decile qué componente está más débil y el camino más corto a subir el score.",
    "seo.opportunities": "Enfocate en keywords con alto potencial de clicks. Identificá las 2-3 con mejor ROI de esfuerzo (impresiones altas, posición cercana al top 10).",
    "seo.movers.up": "Enfocate en qué patrón tienen las keywords que subieron. Identificá si hay un tema/categoría común para replicar el éxito.",
    "seo.movers.down": "Enfocate en las keywords que más cayeron y cuáles son urgentes de recuperar por impacto en clicks.",
    "seo.movers.new": "Enfocate en keywords nuevas con intención de compra que vale la pena consolidar.",
    "seo.movers.lost": "Enfocate en qué keywords perdidas vale la pena recuperar vs cuáles dejar ir.",
    "seo.cannibalization": "Enfocate en qué par/terna de páginas resolver primero por impacto.",
    "seo.device": "Enfocate en el mix mobile/desktop y qué acción concreta tomar según el dominante.",
    "seo.keywords": "Enfocate en la lista de keywords: cuáles son las ganadoras obvias, cuáles sorprenden (alto CTR o alta impresión con buena posición) y sobre cuáles accionar primero. No enumeres todas — destacá 2-3 patrones o keywords clave.",
    "seo.pages": "Enfocate en las páginas que más tráfico orgánico traen: cuáles son las estrella, cuáles deberían traer más de lo que traen (muchas keywords pero pocos clicks) y qué página priorizar para trabajar.",
  };

  const focus = sectionFocus[section] || "Enfocate solo en la data de esta tab.";

  const modeInstructions = mode === "initial"
    ? `\n\n=== MODO: INSIGHT INICIAL ===\nGenerá un análisis de bienvenida sobre esta tab. 1 frase hook + 2-3 bullets cortos.`
    : `\n\n=== MODO: PREGUNTA PUNTUAL ===\nEl usuario te hizo una pregunta específica. Respondé en 2-4 oraciones directas.`;

  return `${SYSTEM_PROMPT_BASE}

=== SECCIÓN ANALIZADA ===
${contextLabel} (id: ${section})

=== FOCO ===
${focus}
${modeInstructions}

=== DATA DE ESTA TAB ===
<context_data>
${dataStr}
</context_data>${ALERT_TOOLS_PROMPT}`;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const org = await getOrganization();
    const resolvedUserId = await getSessionUserId().catch(() => null);

    const body = await req.json();
    const {
      section,
      contextLabel,
      contextData,
      question,
      history,
    }: {
      section: string;
      contextLabel: string;
      contextData: any;
      question?: string;
      history?: { role: "user" | "assistant"; content: string }[];
    } = body;

    if (!section || !contextData) {
      return NextResponse.json({ error: "Faltan section o contextData" }, { status: 400 });
    }

    const mode: InsightMode = question && question.trim() ? "question" : "initial";
    const systemPrompt = buildSectionPrompt(section, contextLabel || section, contextData, mode);

    // Build messages
    const messages: Anthropic.MessageParam[] = [];
    if (mode === "question" && history && Array.isArray(history)) {
      for (const h of history.slice(-6)) {
        if (h.role === "user" || h.role === "assistant") {
          messages.push({ role: h.role, content: h.content });
        }
      }
    }
    messages.push({
      role: "user",
      content:
        mode === "initial"
          ? "Generá el insight inicial de esta tab."
          : question!.trim(),
    });

    // Tool-use loop (max 3 rondas) — solo se ativa si Aurum llama a las
    // ALERT_TOOLS (creación de reglas). En la mayoría de los casos
    // (insight inicial / pregunta puntual sobre la tab) sale en la 1° ronda
    // sin usar tools.
    let currentMessages = [...messages];
    let finalReply = "";
    let tokensIn = 0;
    let tokensOut = 0;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        system: systemPrompt,
        tools: ALERT_TOOLS,
        messages: currentMessages,
      });

      tokensIn += response.usage?.input_tokens || 0;
      tokensOut += response.usage?.output_tokens || 0;

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ContentBlock & { type: "tool_use" } => b.type === "tool_use"
      );

      if (toolUseBlocks.length === 0) {
        const textBlock = response.content.find((b) => b.type === "text");
        finalReply = textBlock && textBlock.type === "text" ? textBlock.text : "No pude generar una respuesta.";
        break;
      }

      const toolResults = await Promise.all(
        toolUseBlocks.map(async (toolBlock) => {
          let result: string;
          if (isAlertToolName(toolBlock.name)) {
            result = await executeAlertTool(
              toolBlock.name as any,
              toolBlock.input,
              { orgId: org.id, userId: resolvedUserId }
            );
          } else {
            result = `ERROR: tool "${toolBlock.name}" no disponible en Aurum contextual. Acá solo podés usar las tools de creación de alertas.`;
          }
          return {
            type: "tool_result" as const,
            tool_use_id: toolBlock.id,
            content: result,
          };
        })
      );

      currentMessages.push({ role: "assistant", content: response.content });
      currentMessages.push({ role: "user", content: toolResults });

      if (response.stop_reason === "end_turn") {
        const textBlock = response.content.find((b) => b.type === "text");
        if (textBlock && textBlock.type === "text" && textBlock.text.trim()) {
          finalReply = textBlock.text;
          break;
        }
      }
    }

    if (!finalReply) {
      finalReply = "No pude generar una respuesta. Probá de nuevo.";
    }

    return NextResponse.json({
      reply: finalReply,
      mode,
      tokensIn,
      tokensOut,
    });
  } catch (e: any) {
    console.error("[aurum/section-insight]", e?.message || e);
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}
