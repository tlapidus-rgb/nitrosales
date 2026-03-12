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
- Usa emojis para categorizar: \u{1F6A8} Alerta | \u{1F4A1} Oportunidad | \u{1F4C8} Tendencia | \u{1F3AF} Recomendacion
- Estructura: Que esta pasando + Por que importa + Que hacer

AREAS DE EXPERTISE:
- Marketing: ROAS, CPA, CTR, optimizacion de campanas, presupuesto entre plataformas
- Ecommerce: conversion, ticket promedio, abandono de carrito, mix de productos
- Comercial: productos estrella vs cola larga, stock vs demanda, pricing, estacionalidad
- Trafico: fuentes de adquisicion, calidad de sesiones, SEO vs paid`;

async function buildMetricsContext(orgId: string): Promise<string> {
  const now = new Date();
  const d30 = new Date(now.getTime() - 30*86400000);
  const d60 = new Date(now.getTime() - 60*86400000);
  const d7 = new Date(now.getTime() - 7*86400000);

  const [
    orders30, ordersPrev, orders7,
    web30, webPrev,
    ads30, adsPrev,
    orderItems,
    campaigns,
    webSources
  ] = await Promise.all([
    prisma.order.findMany({ where: { organizationId: orgId, orderDate: { gte: d30, lt: now } } }),
    prisma.order.findMany({ where: { organizationId: orgId, orderDate: { gte: d60, lt: d30 } } }),
    prisma.order.findMany({ where: { organizationId: orgId, orderDate: { gte: d7, lt: now } } }),
    prisma.webMetricDaily.findMany({ where: { organizationId: orgId, date: { gte: d30, lt: now } } }),
    prisma.webMetricDaily.findMany({ where: { organizationId: orgId, date: { gte: d60, lt: d30 } } }),
    prisma.adMetricDaily.findMany({ where: { organizationId: orgId, date: { gte: d30, lt: now } } }),
    prisma.adMetricDaily.findMany({ where: { organizationId: orgId, date: { gte: d60, lt: d30 } } }),
    prisma.orderItem.findMany({
      where: { order: { organizationId: orgId, orderDate: { gte: d30 } } },
      include: { product: true },
      take: 5000
    }),
    prisma.adCampaign.findMany({
      where: { organizationId: orgId, status: "ACTIVE" },
      include: { dailyMetrics: { where: { date: { gte: d30 } } } }
    }),
    prisma.webMetricDaily.groupBy({
      by: ["source", "medium"],
      _sum: { sessions: true, users: true },
      where: { organizationId: orgId, date: { gte: d30 } },
      orderBy: { _sum: { sessions: "desc" } },
      take: 10
    }),
  ]);

  const bill = ["INVOICED", "SHIPPED", "DELIVERED"];
  const c30 = orders30.filter(o => bill.includes(o.status));
  const p30 = ordersPrev.filter(o => bill.includes(o.status));
  const l7 = orders7.filter(o => bill.includes(o.status));
  const canc = orders30.filter(o => o.status === "CANCELLED");

  const rev = c30.reduce((s,o) => s+o.totalValue, 0);
  const revP = p30.reduce((s,o) => s+o.totalValue, 0);
  const rev7 = l7.reduce((s,o) => s+o.totalValue, 0);
  const revCh = revP > 0 ? Math.round(((rev-revP)/revP)*100) : null;

  const sess = web30.reduce((s,w) => s+w.sessions, 0);
  const sessP = webPrev.reduce((s,w) => s+w.sessions, 0);
  const sessCh = sessP > 0 ? Math.round(((sess-sessP)/sessP)*100) : null;
  const users = web30.reduce((s,w) => s+w.users, 0);
  const br = web30.length > 0 ? (web30.reduce((s,w) => s+(w.bounceRate||0), 0)/web30.length).toFixed(1) : "N/A";

  const spend = ads30.reduce((s,a) => s+a.spend, 0);
  const spendP = adsPrev.reduce((s,a) => s+a.spend, 0);
  const adRev = ads30.reduce((s,a) => s+a.conversionValue, 0);
  const adRevP = adsPrev.reduce((s,a) => s+a.conversionValue, 0);
  const impr = ads30.reduce((s,a) => s+a.impressions, 0);
  const clk = ads30.reduce((s,a) => s+a.clicks, 0);
  const conv = ads30.reduce((s,a) => s+a.conversions, 0);

  const gA = ads30.filter(a => a.platform==="GOOGLE");
  const mA = ads30.filter(a => a.platform==="META");
  const gS = gA.reduce((s,a)=>s+a.spend,0);
  const mS = mA.reduce((s,a)=>s+a.spend,0);
  const gR = gA.reduce((s,a)=>s+a.conversionValue,0);
  const mR = mA.reduce((s,a)=>s+a.conversionValue,0);
  const gC = gA.reduce((s,a)=>s+a.clicks,0);
  const mC = mA.reduce((s,a)=>s+a.clicks,0);

  // Top products from order items
  const prodMap = new Map<string, {revenue: number; qty: number}>();
  for (const item of orderItems) {
    const name = item.product?.name || "Sin nombre";
    const ex = prodMap.get(name) || {revenue:0, qty:0};
    ex.revenue += item.totalPrice;
    ex.qty += item.quantity;
    prodMap.set(name, ex);
  }
  const topProds = [...prodMap.entries()]
    .sort((a,b) => b[1].revenue - a[1].revenue)
    .slice(0, 15)
    .map(([n,d],i) => (i+1)+". "+n+": $"+Math.round(d.revenue)+" ("+d.qty+" uds)")
    .join("\n");

  // Campaign summary
  const campSum = campaigns.slice(0,10).map(c => {
    const m = c.dailyMetrics;
    const cs = m.reduce((s,x)=>s+x.spend,0);
    const cr = m.reduce((s,x)=>s+x.conversionValue,0);
    const cc = m.reduce((s,x)=>s+x.clicks,0);
    const cn = m.reduce((s,x)=>s+x.conversions,0);
    return c.name+" ("+c.platform+"): gasto $"+Math.round(cs)+", rev $"+Math.round(cr)+", ROAS "+(cs>0?(cr/cs).toFixed(2):"0")+"x, "+cn+" conv, "+cc+" clicks";
  }).join("\n");

  const sources = webSources.map(s => (s.source||"direct")+"/"+(s.medium||"none")+": "+(s._sum.sessions||0)+" ses").join(", ");

  const roas = spend > 0 ? (adRev/spend).toFixed(2) : "N/A";
  const roasP = spendP > 0 ? (adRevP/spendP).toFixed(2) : "N/A";
  const cpa = conv > 0 ? (spend/conv).toFixed(0) : "N/A";
  const ctr = impr > 0 ? ((clk/impr)*100).toFixed(2) : "N/A";
  const cpc = clk > 0 ? (spend/clk).toFixed(0) : "N/A";
  const convR = sess > 0 ? ((c30.length/sess)*100).toFixed(2) : "N/A";
  const avgT = c30.length > 0 ? Math.round(rev/c30.length) : 0;

  return `
--- DATOS REALES (actualizado: ${now.toISOString().split("T")[0]}) ---

VENTAS (30d):
- Revenue: $${Math.round(rev).toLocaleString()} (${revCh!==null ? (revCh>0?"+":"")+revCh+"% vs anterior" : "sin datos previos"})
- Pedidos: ${c30.length} (anterior: ${p30.length})
- Ticket promedio: $${avgT.toLocaleString()}
- Cancelados: ${canc.length} ordenes ($${Math.round(canc.reduce((s,o)=>s+o.totalValue,0)).toLocaleString()})
- Ultimos 7d: $${Math.round(rev7).toLocaleString()} (${l7.length} pedidos)
- Tasa conversion: ${convR}%

TOP PRODUCTOS (30d):
${topProds || "Sin datos de productos"}

PUBLICIDAD (30d):
- Inversion: $${Math.round(spend).toLocaleString()} (ant: $${Math.round(spendP).toLocaleString()})
- Revenue ads: $${Math.round(adRev).toLocaleString()} (ant: $${Math.round(adRevP).toLocaleString()})
- ROAS: ${roas}x (ant: ${roasP}x) | CPA: $${cpa} | CTR: ${ctr}% | CPC: $${cpc}
- Impresiones: ${impr.toLocaleString()} | Clicks: ${clk.toLocaleString()} | Conversiones: ${conv}

GOOGLE ADS: Gasto $${Math.round(gS).toLocaleString()} | Rev $${Math.round(gR).toLocaleString()} | ROAS ${gS>0?(gR/gS).toFixed(2):"0"}x | CPC $${gC>0?Math.round(gS/gC):"N/A"}
META ADS: Gasto $${Math.round(mS).toLocaleString()} | Rev $${Math.round(mR).toLocaleString()} | ROAS ${mS>0?(mR/mS).toFixed(2):"0"}x | CPC $${mC>0?Math.round(mS/mC):"N/A"}

CAMPANAS TOP:
${campSum || "Sin campanas activas"}

TRAFICO (GA4, 30d):
- Sesiones: ${sess.toLocaleString()} (${sessCh!==null ? (sessCh>0?"+":"")+sessCh+"% vs ant" : ""})
- Usuarios: ${users.toLocaleString()} | Bounce: ${br}%
- Fuentes: ${sources || "Sin datos"}
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
