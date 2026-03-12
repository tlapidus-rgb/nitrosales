import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Sos NitroBot, el asistente de IA de NitroSales para "El Mundo del Juguete".
Sos un experto senior en ecommerce, marketing digital y gestion comercial con 15 anios de experiencia.

TU ROL:
- Analizar datos REALES de ventas, trafico, publicidad y productos
- Dar insights ACCIONABLES y proactivos (no esperar que te pregunten todo)
- Sugerir acciones concretas para mejorar revenue, ROAS, conversion y eficiencia
- Detectar anomalias, oportunidades y riesgos en los datos
- Hablar de stock, demanda, oferta y estrategia de producto cuando sea relevante

REGLAS:
1. SIEMPRE basate en los datos reales que tenes en el contexto. NUNCA inventes numeros.
2. Habla en espanol rioplatense (vos, tenes, podes). Se directo y claro.
3. Cada insight debe tener una ACCION CONCRETA que se pueda ejecutar.
4. Si ves algo urgente (caida de ROAS > 20%, spike de CPA, caida de ventas), marcalo como ALERTA.
5. Compara siempre vs el periodo anterior para dar contexto.
6. Se conciso: 2-4 oraciones por punto. No repitas datos que ya estan en el dashboard.
7. Si te preguntan algo y no tenes datos suficientes, decilo y sugeri que datos serviria tener.
8. Responde en el idioma en que te pregunten (espanol o ingles).

FORMATO para insights proactivos:
- Usa emojis para categorizar: 🚨 Alerta | 💡 Oportunidad | 📈 Tendencia | 🎯 Recomendacion
- Estructura: Que esta pasando + Por que importa + Que hacer

AREAS DE EXPERTISE:
- Marketing: ROAS, CPA, CTR, optimizacion de campanas, presupuesto entre plataformas
- Ecommerce: conversion, ticket promedio, abandono de carrito, mix de productos
- Comercial: productos estrella vs cola larga, stock vs demanda, pricing, estacionalidad
- Trafico: fuentes de adquisicion, calidad de sesiones, SEO vs paid`;

async function buildMetricsContext(orgId: string): Promise<string> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    orders30d, ordersPrev30d, orders7d,
    webMetrics30d, webMetricsPrev30d,
    adMetrics30d, adMetricsPrev30d,
    topProducts, campaigns,
    recentOrders, webBySource
  ] = await Promise.all([
    prisma.order.findMany({ where: { organizationId: orgId, orderDate: { gte: thirtyDaysAgo, lt: now } } }),
    prisma.order.findMany({ where: { organizationId: orgId, orderDate: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } }),
    prisma.order.findMany({ where: { organizationId: orgId, orderDate: { gte: sevenDaysAgo, lt: now } } }),
    prisma.webMetricDaily.findMany({ where: { organizationId: orgId, date: { gte: thirtyDaysAgo, lt: now } } }),
    prisma.webMetricDaily.findMany({ where: { organizationId: orgId, date: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } }),
    prisma.adMetricDaily.findMany({ where: { organizationId: orgId, date: { gte: thirtyDaysAgo, lt: now } } }),
    prisma.adMetricDaily.findMany({ where: { organizationId: orgId, date: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } }),
    prisma.orderItem.groupBy({ by: ["productName"], _sum: { totalPrice: true, quantity: true }, where: { order: { organizationId: orgId, orderDate: { gte: thirtyDaysAgo } } }, orderBy: { _sum: { totalPrice: "desc" } }, take: 15 }),
    prisma.adCampaign.findMany({ where: { organizationId: orgId, status: "ACTIVE" }, include: { metrics: { where: { date: { gte: thirtyDaysAgo } } } } }),
    prisma.webMetricDaily.groupBy({ by: ["source", "medium"], _sum: { sessions: true, users: true }, where: { organizationId: orgId, date: { gte: thirtyDaysAgo } }, orderBy: { _sum: { sessions: "desc" } }, take: 10 }),
  ]);

  const billable = ["INVOICED", "SHIPPED", "DELIVERED"];
  const curr = orders30d.filter(o => billable.includes(o.status));
  const prev = ordersPrev30d.filter(o => billable.includes(o.status));
  const last7 = orders7d.filter(o => billable.includes(o.status));
  const cancelled30 = orders30d.filter(o => o.status === "CANCELLED");

  const rev30 = curr.reduce((s, o) => s + o.totalValue, 0);
  const revPrev = prev.reduce((s, o) => s + o.totalValue, 0);
  const rev7 = last7.reduce((s, o) => s + o.totalValue, 0);
  const revChange = revPrev > 0 ? Math.round(((rev30 - revPrev) / revPrev) * 100) : null;

  const sessions30 = webMetrics30d.reduce((s, w) => s + w.sessions, 0);
  const sessionsPrev = webMetricsPrev30d.reduce((s, w) => s + w.sessions, 0);
  const sessChange = sessionsPrev > 0 ? Math.round(((sessions30 - sessionsPrev) / sessionsPrev) * 100) : null;
  const users30 = webMetrics30d.reduce((s, w) => s + w.users, 0);
  const bounce30 = webMetrics30d.length > 0 ? (webMetrics30d.reduce((s, w) => s + w.bounceRate, 0) / webMetrics30d.length).toFixed(1) : "N/A";

  const spend30 = adMetrics30d.reduce((s, a) => s + a.spend, 0);
  const spendPrev = adMetricsPrev30d.reduce((s, a) => s + a.spend, 0);
  const adRev30 = adMetrics30d.reduce((s, a) => s + a.conversionValue, 0);
  const adRevPrev = adMetricsPrev30d.reduce((s, a) => s + a.conversionValue, 0);
  const impr30 = adMetrics30d.reduce((s, a) => s + a.impressions, 0);
  const clicks30 = adMetrics30d.reduce((s, a) => s + a.clicks, 0);
  const conv30 = adMetrics30d.reduce((s, a) => s + a.conversions, 0);

  const gAds = adMetrics30d.filter(a => a.platform === "GOOGLE");
  const mAds = adMetrics30d.filter(a => a.platform === "META");
  const gSpend = gAds.reduce((s, a) => s + a.spend, 0);
  const mSpend = mAds.reduce((s, a) => s + a.spend, 0);
  const gRev = gAds.reduce((s, a) => s + a.conversionValue, 0);
  const mRev = mAds.reduce((s, a) => s + a.conversionValue, 0);
  const gClicks = gAds.reduce((s, a) => s + a.clicks, 0);
  const mClicks = mAds.reduce((s, a) => s + a.clicks, 0);

  const roas30 = spend30 > 0 ? (adRev30 / spend30).toFixed(2) : "N/A";
  const roasPrev = spendPrev > 0 ? (adRevPrev / spendPrev).toFixed(2) : "N/A";
  const gRoas = gSpend > 0 ? (gRev / gSpend).toFixed(2) : "N/A";
  const mRoas = mSpend > 0 ? (mRev / mSpend).toFixed(2) : "N/A";
  const cpa30 = conv30 > 0 ? (spend30 / conv30).toFixed(0) : "N/A";
  const ctr30 = impr30 > 0 ? ((clicks30 / impr30) * 100).toFixed(2) : "N/A";
  const cpc30 = clicks30 > 0 ? (spend30 / clicks30).toFixed(0) : "N/A";

  const convRate = sessions30 > 0 ? ((curr.length / sessions30) * 100).toFixed(2) : "N/A";
  const avgTicket = curr.length > 0 ? Math.round(rev30 / curr.length) : 0;

  // Campaign performance summary
  const campSummary = campaigns.slice(0, 10).map(c => {
    const m = c.metrics;
    const cSpend = m.reduce((s, x) => s + x.spend, 0);
    const cRev = m.reduce((s, x) => s + x.conversionValue, 0);
    const cClicks = m.reduce((s, x) => s + x.clicks, 0);
    const cConv = m.reduce((s, x) => s + x.conversions, 0);
    return c.name + " (" + c.platform + "): gasto $" + Math.round(cSpend) + ", rev $" + Math.round(cRev) + ", ROAS " + (cSpend > 0 ? (cRev/cSpend).toFixed(2) : "0") + "x, " + cConv + " conv, " + cClicks + " clicks";
  }).join("\n");

  const topProds = topProducts.map((p, i) => (i+1) + ". " + (p.productName || "Sin nombre") + ": $" + Math.round(p._sum.totalPrice || 0) + " (" + (p._sum.quantity || 0) + " uds)").join("\n");

  const sources = webBySource.map(s => (s.source || "direct") + "/" + (s.medium || "none") + ": " + (s._sum.sessions || 0) + " sesiones").join(", ");

  return `
--- DATOS REALES (actualizado: ${now.toISOString().split("T")[0]}) ---

VENTAS (ultimos 30 dias):
- Revenue: $${Math.round(rev30).toLocaleString()} (${revChange !== null ? (revChange > 0 ? "+" : "") + revChange + "% vs periodo anterior" : "sin datos previos"})
- Pedidos facturados: ${curr.length} (anterior: ${prev.length})
- Ticket promedio: $${avgTicket.toLocaleString()}
- Cancelados: ${cancelled30.length} ordenes ($${Math.round(cancelled30.reduce((s,o) => s + o.totalValue, 0)).toLocaleString()})
- Revenue ultimos 7 dias: $${Math.round(rev7).toLocaleString()} (${last7.length} pedidos)
- Tasa de conversion: ${convRate}%

TOP 15 PRODUCTOS (por revenue 30d):
${topProds}

PUBLICIDAD GLOBAL (30 dias):
- Inversion total: $${Math.round(spend30).toLocaleString()} (anterior: $${Math.round(spendPrev).toLocaleString()})
- Revenue por ads: $${Math.round(adRev30).toLocaleString()} (anterior: $${Math.round(adRevPrev).toLocaleString()})
- ROAS global: ${roas30}x (anterior: ${roasPrev}x)
- CPA: $${cpa30} | CTR: ${ctr30}% | CPC: $${cpc30}
- Impresiones: ${impr30.toLocaleString()} | Clicks: ${clicks30.toLocaleString()} | Conversiones: ${conv30}

GOOGLE ADS:
- Gasto: $${Math.round(gSpend).toLocaleString()} | Revenue: $${Math.round(gRev).toLocaleString()} | ROAS: ${gRoas}x
- Clicks: ${gClicks.toLocaleString()} | CPC: $${gClicks > 0 ? Math.round(gSpend/gClicks) : "N/A"}

META ADS:
- Gasto: $${Math.round(mSpend).toLocaleString()} | Revenue: $${Math.round(mRev).toLocaleString()} | ROAS: ${mRoas}x
- Clicks: ${mClicks.toLocaleString()} | CPC: $${mClicks > 0 ? Math.round(mSpend/mClicks) : "N/A"}

CAMPANAS TOP 10:
${campSummary}

TRAFICO WEB (GA4, 30 dias):
- Sesiones: ${sessions30.toLocaleString()} (${sessChange !== null ? (sessChange > 0 ? "+" : "") + sessChange + "% vs anterior" : ""})
- Usuarios: ${users30.toLocaleString()}
- Bounce rate promedio: ${bounce30}%
- Fuentes: ${sources}
`;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { message, history } = await req.json();

    const org = await prisma.organization.findFirst({ where: { slug: "elmundodeljuguete" } });
    if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });

    let metricsContext = "";
    try {
      metricsContext = await buildMetricsContext(org.id);
    } catch (e: any) {
      metricsContext = "\n[Error cargando metricas: " + e.message + "]";
    }

    // Build messages with history
    const messages: Array<{role: "user" | "assistant"; content: string}> = [];
    if (history && Array.isArray(history)) {
      for (const h of history.slice(-10)) {
        messages.push({ role: h.role, content: h.content });
      }
    }
    messages.push({ role: "user", content: message });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: SYSTEM_PROMPT + metricsContext,
      messages,
    });

    const reply = response.content[0].type === "text" ? response.content[0].text : "No pude generar una respuesta.";
    return NextResponse.json({ reply });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
