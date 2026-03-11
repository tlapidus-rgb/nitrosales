import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db/client";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Sos NitroBot, el asistente de IA de NitroSales. Ayudas a analizar metricas de ecommerce, marketing y publicidad digital.

Tu rol:
- Analizar datos de ventas (VTEX), trafico web (GA4), y publicidad (Google Ads + Meta Ads)
- Dar insights accionables sobre ROAS, conversion, tendencias
- Responder en espanol argentino, de forma clara y directa
- Usar datos concretos cuando esten disponibles
- Sugerir acciones especificas para mejorar resultados

Si no tenes datos suficientes, decilo honestamente y sugeri que datos serviria recopilar.`;

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { message } = await req.json();

    let context = "";
    try {
      const [orders, webMetrics, adMetrics] = await Promise.all([
        prisma.order.count(),
        prisma.webMetricDaily.aggregate({ _sum: { sessions: true } }),
        prisma.adMetricDaily.aggregate({ _sum: { spend: true, revenue: true } }),
      ]);
      context = "\nDatos actuales: " + orders + " pedidos, " + (webMetrics._sum?.sessions || 0) + " sesiones, inversion ads: $" + (adMetrics._sum?.spend || 0) + ", revenue ads: $" + (adMetrics._sum?.revenue || 0);
    } catch {}

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: SYSTEM_PROMPT + context,
      messages: [{ role: "user", content: message }],
    });

    const reply = response.content[0].type === "text" ? response.content[0].text : "No pude generar una respuesta.";

    return NextResponse.json({ reply });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
