import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function formatARS(n: number) {
  return "$ " + Math.round(n).toLocaleString("es-AR");
}

async function fetchJSON(url: string) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

function buildDashboardPrompt(metrics: any, trends: any) {
  const s = metrics?.summary;
  const c = metrics?.changes;
  if (!s) return null;
  return `Analiza estos KPIs del dashboard de El Mundo del Juguete (ultimos 30 dias):
- Facturacion: $${Math.round(s.revenue).toLocaleString()} (${c?.revenue ? (c.revenue > 0 ? "+" : "") + c.revenue + "%" : "sin comparacion"} vs periodo anterior)
- Pedidos facturados: ${s.orders} (${c?.orders ? (c.orders > 0 ? "+" : "") + c.orders + "%" : ""})
- Ticket promedio: $${Math.round(s.avgTicket).toLocaleString()}
- ROAS: ${s.roas}x
- Inversion ads: $${Math.round(s.adSpend).toLocaleString()} (Google: $${Math.round(s.googleSpend).toLocaleString()} | Meta: $${Math.round(s.metaSpend).toLocaleString()})
- Sesiones: ${s.sessions.toLocaleString()} (${c?.sessions ? (c.sessions > 0 ? "+" : "") + c.sessions + "%" : ""})
- Tasa conversion: ${s.conversionRate}%
- CTR: ${s.ctr}% | CPC: $${s.cpc}
- Cancelados: ${s.cancelledOrders} ordenes ($${Math.round(s.cancelledRevenue).toLocaleString()})`;
}

function buildProductsPrompt(data: any) {
  const s = data?.summary;
  const prods = data?.topProducts;
  if (!s || !prods) return null;

  const top5 = prods
    .slice(0, 5)
    .map(
      (p: any, i: number) =>
        `${i + 1}. ${p.name}: ${p.unitsSold} uds, $${Math.round(p.revenue).toLocaleString()}, precio prom $${Math.round(p.avgPrice).toLocaleString()}`
    )
    .join("\n");

  return `Analiza los datos de productos de El Mundo del Juguete (30 dias):
- Unidades vendidas estimadas: ${s.estimatedTotalUnits.toLocaleString()}
- Facturacion estimada: $${Math.round(s.estimatedTotalRevenue).toLocaleString()}
- Productos unicos: ${s.uniqueProducts}
- Concentracion Pareto: top 20% = ${s.paretoConcentration}% del revenue
- Top 5 productos:
${top5}`;
}

function buildCampaignsPrompt(data: any) {
  const camps = data?.campaigns;
  if (!camps || camps.length === 0) return null;

  const totalSpend = camps.reduce((s: number, c: any) => s + c.spend, 0);
  const totalRev = camps.reduce(
    (s: number, c: any) => s + c.conversionValue,
    0
  );
  const best = [...camps].sort((a: any, b: any) => b.roas - a.roas)[0];
  const worst = [...camps].sort((a: any, b: any) => a.roas - b.roas)[0];

  const google = camps.filter((c: any) => c.platform === "GOOGLE");
  const meta = camps.filter((c: any) => c.platform === "META");
  const gSpend = google.reduce((s: number, c: any) => s + c.spend, 0);
  const mSpend = meta.reduce((s: number, c: any) => s + c.spend, 0);
  const gRev = google.reduce(
    (s: number, c: any) => s + c.conversionValue,
    0
  );
  const mRev = meta.reduce(
    (s: number, c: any) => s + c.conversionValue,
    0
  );

  const campList = camps
    .slice(0, 8)
    .map(
      (c: any, i: number) =>
        `${i + 1}. ${c.name} (${c.platform}): Gasto $${Math.round(c.spend).toLocaleString()} | ROAS ${c.roas}x | CTR ${c.ctr}% | CPC $${c.cpc} | ${c.conversions} conv`
    )
    .join("\n");

  return `Analiza las campanas publicitarias de El Mundo del Juguete (30 dias):
- ${camps.length} campanas activas
- Inversion total: $${Math.round(totalSpend).toLocaleString()}
- Revenue publicitario: $${Math.round(totalRev).toLocaleString()}
- ROAS global: ${totalSpend > 0 ? (totalRev / totalSpend).toFixed(1) : 0}x
- Mejor campana: "${best.name}" con ROAS ${best.roas}x
- Peor campana: "${worst.name}" con ROAS ${worst.roas}x
- Google Ads: $${Math.round(gSpend).toLocaleString()} invertidos, ROAS ${gSpend > 0 ? (gRev / gSpend).toFixed(1) : 0}x
- Meta Ads: $${Math.round(mSpend).toLocaleString()} invertidos, ROAS ${mSpend > 0 ? (mRev / mSpend).toFixed(1) : 0}x
- Detalle campanas:
${campList}`;
}

function buildCustomersPrompt(data: any) {
  const s = data?.summary;
  if (!s) return null;

  const freq = data?.frequency;
  const tiers = data?.tiers;
  const topCustomers = data?.topCustomers;
  const topCities = data?.topCities;

  const top5 = topCustomers
    ? topCustomers
        .slice(0, 5)
        .map(
          (c: any, i: number) =>
            `${i + 1}. ${c.name}: ${c.totalOrders} pedidos, $${Math.round(c.totalSpent).toLocaleString()} gastados, ticket prom $${Math.round(c.avgTicket).toLocaleString()}`
        )
        .join("\n")
    : "Sin datos";

  const cityList = topCities
    ? topCities
        .slice(0, 5)
        .map((c: any) => `${c.city} (${c.count})`)
        .join(", ")
    : "Sin datos";

  return `Analiza los datos de clientes de El Mundo del Juguete (basado en pedidos facturados):
- Total clientes unicos: ${s.totalCustomers}
- Clientes identificados (con datos de VTEX): ${s.identifiedCustomers}
- Clientes que repiten: ${s.repeatCustomers} (tasa recompra: ${s.repeatRate}%)
- Pedidos facturados totales: ${s.totalOrders}
- Revenue total: $${Math.round(s.totalRevenue).toLocaleString()}
- Gasto promedio por cliente: $${Math.round(s.avgSpentPerCustomer).toLocaleString()}
- Pedidos promedio por cliente: ${s.avgOrdersPerCustomer}
- Concentracion Pareto: top 20% = ${s.paretoConcentration}% del revenue
- Clientes nuevos (30d): ${s.newCustomers30d}
- Clientes activos (30d): ${s.activeCustomers30d}
- Frecuencia: 1 orden (${freq?.oneOrder || 0}), 2-3 ordenes (${freq?.twoToThree || 0}), 4-6 ordenes (${freq?.fourToSix || 0}), 7+ ordenes (${freq?.sevenPlus || 0})
- Segmentos: VIP $200k+ (${tiers?.vip || 0}), Alto $50-200k (${tiers?.high || 0}), Medio $10-50k (${tiers?.medium || 0}), Bajo <$10k (${tiers?.low || 0})
- Top ciudades: ${cityList}
- Top 5 clientes:
${top5}`;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const section = searchParams.get("section") || "dashboard";

    const baseUrl =
      process.env.NEXTAUTH_URL || "https://nitrosales.vercel.app";

    let dataPrompt: string | null = null;

    if (section === "dashboard") {
      const [metrics, trends] = await Promise.all([
        fetchJSON(baseUrl + "/api/metrics"),
        fetchJSON(baseUrl + "/api/metrics/trends"),
      ]);
      dataPrompt = buildDashboardPrompt(metrics, trends);
    } else if (section === "products") {
      const data = await fetchJSON(baseUrl + "/api/metrics/products");
      dataPrompt = buildProductsPrompt(data);
    } else if (section === "campaigns") {
      const data = await fetchJSON(baseUrl + "/api/metrics/campaigns");
      dataPrompt = buildCampaignsPrompt(data);
    } else if (section === "customers") {
      const data = await fetchJSON(baseUrl + "/api/metrics/customers");
      dataPrompt = buildCustomersPrompt(data);
    }

    if (!dataPrompt) {
      return NextResponse.json({
        insights: [
          {
            type: "TREND",
            title: "Sin datos suficientes",
            description:
              "No hay datos disponibles para generar insights en esta seccion.",
            action:
              "Verifica que los conectores esten activos en Configuracion.",
          },
        ],
      });
    }

    const sectionNames: Record<string, string> = {
      dashboard: "el dashboard general",
      products: "productos",
      campaigns: "campanas publicitarias",
      customers: "clientes y retencion",
    };

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: `Sos NitroBot, analista de growth de El Mundo del Juguete (ecommerce de juguetes en Argentina).
Genera exactamente 3 insights accionables sobre ${sectionNames[section] || section}.
Habla en espanol rioplatense (vos, tenes, podes). Se directo y concreto.
IMPORTANTE: Solo usa datos del contexto, nunca inventes numeros.
Responde UNICAMENTE con un JSON valido (sin markdown, sin backticks) con esta estructura:
{"insights":[{"type":"ALERT|OPPORTUNITY|TREND","title":"max 10 palabras","description":"max 40 palabras con datos concretos del contexto","action":"1 accion especifica y concreta"}]}`,
      messages: [{ role: "user", content: dataPrompt }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "{}";

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Try to extract JSON from response
      const match = text.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { insights: [] };
    }

    return NextResponse.json(parsed);
  } catch (e: any) {
    console.error("Insights error:", e);
    return NextResponse.json({
      insights: [
        {
          type: "ALERT",
          title: "Error generando insights",
          description:
            "Hubo un problema al analizar los datos. Intenta recargar la pagina.",
          action: "Recargar pagina",
        },
      ],
    });
  }
}
