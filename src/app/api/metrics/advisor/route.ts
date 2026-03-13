import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import * as crypto from "crypto";

export const dynamic = "force-dynamic";

const ORG_ID = "cmmmga1uq0000sb43w0krvvys";

/* ── JWT auth for GA4 ──────────────── */
function createJWT(sa: any) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const claim = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  })).toString("base64url");
  const signInput = header + "." + claim;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signInput);
  return signInput + "." + sign.sign(sa.private_key, "base64url");
}

async function getAccessToken(sa: any) {
  const jwt = createJWT(sa);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=" + jwt,
  });
  const data = await res.json();
  return data.access_token;
}

/* ── Build full commercial context ── */
async function buildContext() {
  const products = await prisma.product.findMany({
    where: { organizationId: ORG_ID, isActive: true },
    select: { id: true, name: true, stock: true, brand: true, category: true },
  });

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const orderItems = await prisma.orderItem.findMany({
    where: { order: { organizationId: ORG_ID, orderDate: { gte: thirtyDaysAgo } } },
    select: { productId: true, quantity: true, totalPrice: true, order: { select: { id: true } } },
  });

  const salesMap = new Map<string, { unitsSold: number; revenue: number; orders: Set<string> }>();
  for (const item of orderItems) {
    if (!item.productId) continue;
    const e = salesMap.get(item.productId) || { unitsSold: 0, revenue: 0, orders: new Set() };
    e.unitsSold += item.quantity; e.revenue += item.totalPrice; e.orders.add(item.order.id);
    salesMap.set(item.productId, e);
  }

  const pw = products.map((p) => {
    const s = salesMap.get(p.id);
    return { ...p, unitsSold: s?.unitsSold || 0, revenue: s?.revenue || 0, orders: s?.orders.size || 0 };
  }).sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = pw.reduce((s, p) => s + p.revenue, 0);
  const totalUnits = pw.reduce((s, p) => s + p.unitsSold, 0);
  const totalProducts = pw.length;
  const withStock = pw.filter((p) => p.stock !== null && p.stock !== undefined);
  const noStock = pw.filter((p) => p.stock === 0 || p.stock === null);
  const criticalStock = withStock.filter((p) => { const d = p.unitsSold / 30; return d > 0 && p.stock! / d < 7; });
  const overstock = withStock.filter((p) => { const d = p.unitsSold / 30; if (d <= 0) return (p.stock || 0) > 100; return p.stock! / d > 90; });
  const noSales = pw.filter((p) => p.unitsSold === 0 && p.stock !== null && p.stock > 10);
  const topSellers = pw.slice(0, 20);

  // Brand analysis
  const brandMap = new Map<string, { revenue: number; units: number; products: number; noStock: number }>();
  for (const p of pw) {
    const b = p.brand || "Sin marca";
    const e = brandMap.get(b) || { revenue: 0, units: 0, products: 0, noStock: 0 };
    e.revenue += p.revenue; e.units += p.unitsSold; e.products++;
    if (p.stock === 0 || p.stock === null) e.noStock++;
    brandMap.set(b, e);
  }
  const topBrands = [...brandMap.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 10);

  // Category analysis
  const catMap = new Map<string, { revenue: number; units: number; products: number }>();
  for (const p of pw) {
    const c = p.category || "Sin categoria";
    const e = catMap.get(c) || { revenue: 0, units: 0, products: 0 };
    e.revenue += p.revenue; e.units += p.unitsSold; e.products++;
    catMap.set(c, e);
  }
  const topCategories = [...catMap.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 10);

  // GA4 search terms
  let searchTerms: { term: string; count: number }[] = [];
  const saJson = process.env.GA4_SERVICE_ACCOUNT_KEY;
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (saJson && propertyId) {
    try {
      const sa = JSON.parse(saJson);
      const token = await getAccessToken(sa);
      if (token) {
        const now = new Date();
        const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const gaRes = await fetch(
          `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
          {
            method: "POST",
            headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
            body: JSON.stringify({
              dateRanges: [{ startDate: start.toISOString().split("T")[0], endDate: now.toISOString().split("T")[0] }],
              dimensions: [{ name: "searchTerm" }],
              metrics: [{ name: "eventCount" }],
              limit: 50,
              orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
            }),
          }
        );
        if (gaRes.ok) {
          const gaData = await gaRes.json();
          searchTerms = (gaData.rows || [])
            .map((row: any) => ({ term: row.dimensionValues[0]?.value || "", count: parseInt(row.metricValues[0]?.value || "0") }))
            .filter((s: any) => s.term.length > 1 && s.term !== "(not set)" && !s.term.startsWith("/"));
        }
      }
    } catch (e) { /* silently fail */ }
  }

  // Revenue concentration
  const top5Rev = pw.slice(0, 5).reduce((s, p) => s + p.revenue, 0);
  const top5Pct = totalRevenue > 0 ? Math.round((top5Rev / totalRevenue) * 100) : 0;
  const top20Pct = pw.length > 0 ? (() => {
    const n = Math.max(1, Math.ceil(pw.length * 0.2));
    const r = pw.slice(0, n).reduce((s, p) => s + p.revenue, 0);
    return totalRevenue > 0 ? Math.round((r / totalRevenue) * 100) : 0;
  })() : 0;

  return {
    summary: {
      totalProducts, totalRevenue, totalUnits,
      withStockCount: withStock.length, noStockCount: noStock.length,
      criticalStockCount: criticalStock.length,
      overstockCount: overstock.length,
      noSalesCount: noSales.length,
      top5RevenuePct: top5Pct,
      top20RevenuePct: top20Pct,
      avgTicket: totalUnits > 0 ? Math.round(totalRevenue / totalUnits) : 0,
    },
    topSellers: topSellers.map((p) => ({
      name: p.name.substring(0, 60), brand: p.brand, stock: p.stock,
      unitsSold: p.unitsSold, revenue: p.revenue,
      daysOfStock: p.stock !== null && p.unitsSold > 0 ? Math.round(p.stock / (p.unitsSold / 30)) : null,
    })),
    criticalStock: criticalStock.slice(0, 15).map((p) => ({
      name: p.name.substring(0, 60), brand: p.brand, stock: p.stock,
      dailySales: +(p.unitsSold / 30).toFixed(1),
      daysLeft: p.stock !== null && p.unitsSold > 0 ? Math.round(p.stock / (p.unitsSold / 30)) : 0,
    })),
    overstock: overstock.slice(0, 10).map((p) => ({
      name: p.name.substring(0, 60), stock: p.stock,
      daysOfStock: p.stock !== null && p.unitsSold > 0 ? Math.round(p.stock / (p.unitsSold / 30)) : 999,
    })),
    noSales: noSales.length,
    topBrands: topBrands.map(([name, d]) => ({ name, revenue: d.revenue, units: d.units, products: d.products, noStock: d.noStock })),
    topCategories: topCategories.map(([name, d]) => ({ name, revenue: d.revenue, units: d.units, products: d.products })),
    searchTerms: searchTerms.slice(0, 25),
  };
}

/* ── Analyze question and generate response ── */
function generateResponse(question: string, ctx: any): string {
  const q = question.toLowerCase();

  // Greeting / general
  if (q.match(/^(hola|hey|buenas|buen dia|que tal)/)) {
    return `Hola! Soy Nitro Advisor AI, tu consultor comercial. Tengo acceso completo a tus ${ctx.summary.totalProducts} productos, ventas de los ultimos 30 dias ($${formatNum(ctx.summary.totalRevenue)}), stock en tiempo real y busquedas de tus clientes en GA4.\n\nPreguntame lo que necesites: stock critico, oportunidades de venta, marcas, tendencias, estrategias de pricing, o cualquier analisis comercial.`;
  }

  // Stock analysis
  if (q.match(/stock|inventario|reponer|reposicion|quiebre|faltante|critico/)) {
    const cs = ctx.criticalStock;
    const os = ctx.overstock;
    let resp = `## Analisis de Inventario\n\n`;
    resp += `**Resumen:** ${ctx.summary.criticalStockCount} productos con stock critico (<7 dias), ${ctx.summary.overstockCount} con sobrestock (>90 dias), ${ctx.summary.noStockCount} sin stock.\n\n`;
    if (cs.length > 0) {
      resp += `**Stock critico - Reponer urgente:**\n`;
      for (const p of cs.slice(0, 8)) {
        resp += `- **${p.name}** (${p.brand || "S/M"}) → ${p.stock} uds, ${p.daysLeft}d restantes, vende ${p.dailySales}/dia\n`;
      }
      resp += `\n`;
    }
    if (os.length > 0) {
      resp += `**Sobrestock - Liberar capital:**\n`;
      for (const p of os.slice(0, 5)) {
        resp += `- **${p.name}** → ${p.stock} uds, ${p.daysOfStock === 999 ? "sin ventas" : p.daysOfStock + " dias de stock"}\n`;
      }
      resp += `\n**Recomendacion:** Para los sobrestock, arma combos/bundles con tus top sellers para mover inventario. Para los criticos, prioriza reposicion de los que mas facturan.`;
    }
    return resp;
  }

  // Top sellers / best sellers / mas vendidos
  if (q.match(/top|mejor|mas vendid|ranking|seller|factura|venta/)) {
    let resp = `## Top Sellers - Ultimos 30 dias\n\n`;
    resp += `**Facturacion total:** $${formatNum(ctx.summary.totalRevenue)} | **Unidades:** ${formatNum(ctx.summary.totalUnits)} | **Ticket promedio:** $${formatNum(ctx.summary.avgTicket)}\n\n`;
    resp += `**Concentracion:** El top 5 genera el ${ctx.summary.top5RevenuePct}% del revenue. El top 20% genera el ${ctx.summary.top20RevenuePct}%.\n\n`;
    for (const [i, p] of ctx.topSellers.slice(0, 10).entries()) {
      const stockInfo = p.stock !== null ? `${p.stock} uds${p.daysOfStock !== null ? ` (${p.daysOfStock}d)` : ""}` : "sin dato";
      resp += `${i + 1}. **${p.name}** → $${formatNum(p.revenue)} | ${p.unitsSold} uds | Stock: ${stockInfo}\n`;
    }
    resp += `\n**Alerta:** ${ctx.summary.top5RevenuePct > 30 ? "Alta concentracion de revenue. Si alguno de tus top 5 tiene quiebre de stock, el impacto sera fuerte. Diversifica promoviendo productos similares." : "Buena diversificacion de revenue entre productos."}`;
    return resp;
  }

  // Brand analysis
  if (q.match(/marca|brand|proveedor|fabricante/)) {
    let resp = `## Analisis por Marca\n\n`;
    for (const b of ctx.topBrands.slice(0, 8)) {
      const riskFlag = b.noStock > 5 ? " ⚠️" : "";
      resp += `**${b.name}**${riskFlag} → $${formatNum(b.revenue)} | ${b.units} uds | ${b.products} prods | ${b.noStock} sin stock\n`;
    }
    const topBrand = ctx.topBrands[0];
    if (topBrand) {
      resp += `\n**Insight:** ${topBrand.name} lidera con $${formatNum(topBrand.revenue)} en facturacion. `;
      if (topBrand.noStock > 3) {
        resp += `Pero tiene ${topBrand.noStock} productos sin stock — hay revenue potencial perdido. Negocia mejor abastecimiento.`;
      } else {
        resp += `Buen nivel de stock. Negocia mejores condiciones dado el volumen.`;
      }
    }
    return resp;
  }

  // Category analysis
  if (q.match(/categoria|rubro|segmento|linea/)) {
    let resp = `## Analisis por Categoria\n\n`;
    for (const c of ctx.topCategories.slice(0, 8)) {
      resp += `**${c.name}** → $${formatNum(c.revenue)} | ${c.units} uds | ${c.products} prods\n`;
    }
    resp += `\n**Recomendacion:** Fortalece las categorias top asegurando stock completo y visibilidad premium. Las categorias con menos venta pueden ser oportunidad si tienen demanda en busquedas.`;
    return resp;
  }

  // Search demand / tendencias / busquedas
  if (q.match(/busqueda|demanda|tendencia|buscan|ga4|search|cliente|interes/)) {
    let resp = `## Demanda del Cliente (GA4 - 30 dias)\n\n`;
    if (ctx.searchTerms.length === 0) {
      return resp + "No hay datos de busquedas GA4 disponibles actualmente.";
    }
    resp += `**Top busquedas en tu tienda:**\n`;
    for (const [i, s] of ctx.searchTerms.slice(0, 15).entries()) {
      resp += `${i + 1}. "${s.term}" → ${formatNum(s.count)} busquedas\n`;
    }
    resp += `\n**Insight:** Las busquedas reflejan la intencion de compra real. Asegura que los terminos mas buscados tengan productos visibles, con stock y bien posicionados. Si un termino no tiene match en tu catalogo, es una oportunidad de expansion.`;
    return resp;
  }

  // Pricing / precio / ticket
  if (q.match(/precio|pricing|ticket|margen|caro|barato|promedio/)) {
    let resp = `## Analisis de Pricing\n\n`;
    resp += `**Ticket promedio:** $${formatNum(ctx.summary.avgTicket)}\n\n`;
    const premiums = ctx.topSellers.filter((p: any) => p.revenue > 0 && (p.revenue / p.unitsSold) > ctx.summary.avgTicket * 2);
    const budgets = ctx.topSellers.filter((p: any) => p.revenue > 0 && (p.revenue / p.unitsSold) < ctx.summary.avgTicket * 0.5);
    if (premiums.length > 0) {
      resp += `**Productos premium que venden bien:**\n`;
      for (const p of premiums.slice(0, 5)) {
        resp += `- **${p.name}** → $${formatNum(Math.round(p.revenue / p.unitsSold))} ticket | ${p.unitsSold} uds\n`;
      }
      resp += `\n`;
    }
    resp += `**Estrategia:** Los productos premium con buen volumen son candidatos para bundles. Crea packs "producto premium + accesorio" para subir el ticket promedio general. Los que venden muchas unidades a bajo precio pueden tener margen para un leve aumento.`;
    return resp;
  }

  // Opportunity / oportunidad
  if (q.match(/oportunidad|crecer|mejorar|optimizar|estrategia|consejo|recomendar|sugerir/)) {
    let resp = `## Oportunidades Comerciales\n\n`;
    resp += `**1. Stock critico en top sellers:** ${ctx.summary.criticalStockCount} productos van a quedarse sin stock pronto. Prioriza reposicion de los que mas facturan.\n\n`;
    resp += `**2. Productos dormidos:** ${ctx.summary.noSalesCount} productos con stock pero sin ventas en 30 dias. Revisa precios, fotos, titulos y posicionamiento. Considera promos o discontinuar.\n\n`;
    if (ctx.summary.overstockCount > 10) {
      resp += `**3. Capital atrapado:** ${ctx.summary.overstockCount} productos con +90 dias de stock. Libera capital con promos, bundles o descuentos escalonados.\n\n`;
    }
    if (ctx.summary.top5RevenuePct > 30) {
      resp += `**4. Diversificacion:** El ${ctx.summary.top5RevenuePct}% del revenue depende de 5 productos. Reduce riesgo promoviendo alternativas similares.\n\n`;
    }
    if (ctx.searchTerms.length > 0) {
      resp += `**5. Demanda no captada:** Tus clientes buscan terminos que no matchean con tu catalogo. Revisa los datos de busquedas GA4 para encontrar gaps.\n\n`;
    }
    resp += `**Siguiente paso:** Decime sobre cual de estos puntos queres profundizar y te armo un plan de accion detallado.`;
    return resp;
  }

  // Specific product search
  if (q.match(/producto|busca|encontra|tenes|hay|existe/)) {
    // Try to extract a product name
    const terms = q.replace(/producto|busca|encontra|tenes|hay|existe|que|el|la|los|las|un|una|de|del|en|con|por|para|como|esta|este|esto|estan|tiene/gi, "").trim();
    if (terms.length > 2) {
      const matches = ctx.topSellers.filter((p: any) => p.name.toLowerCase().includes(terms));
      if (matches.length > 0) {
        let resp = `Encontre ${matches.length} producto(s) en el top 20:\n\n`;
        for (const p of matches.slice(0, 5)) {
          resp += `- **${p.name}** → $${formatNum(p.revenue)} | ${p.unitsSold} uds | Stock: ${p.stock !== null ? p.stock + " uds" : "sin dato"}\n`;
        }
        return resp;
      }
    }
  }

  // Salud comercial / health
  if (q.match(/salud|health|score|estado|diagnostico|general|resumen/)) {
    let score = 75;
    if (ctx.summary.criticalStockCount > 50) score -= 15;
    else if (ctx.summary.criticalStockCount > 20) score -= 8;
    if (ctx.summary.noSalesCount > 50) score -= 5;
    if (ctx.summary.overstockCount > 20) score -= 5;
    if (ctx.summary.top5RevenuePct > 40) score -= 5;
    score = Math.max(20, Math.min(95, score));

    let resp = `## Diagnostico Comercial\n\n`;
    resp += `**Salud Comercial: ${score}%**\n\n`;
    resp += `| Metrica | Valor |\n|---|---|\n`;
    resp += `| Productos activos | ${formatNum(ctx.summary.totalProducts)} |\n`;
    resp += `| Facturacion 30d | $${formatNum(ctx.summary.totalRevenue)} |\n`;
    resp += `| Unidades vendidas | ${formatNum(ctx.summary.totalUnits)} |\n`;
    resp += `| Ticket promedio | $${formatNum(ctx.summary.avgTicket)} |\n`;
    resp += `| Sin stock | ${ctx.summary.noStockCount} |\n`;
    resp += `| Stock critico | ${ctx.summary.criticalStockCount} |\n`;
    resp += `| Sobrestock | ${ctx.summary.overstockCount} |\n`;
    resp += `| Sin ventas (con stock) | ${ctx.summary.noSalesCount} |\n`;
    resp += `| Concentracion top 5 | ${ctx.summary.top5RevenuePct}% |\n\n`;
    resp += `**Prioridades:** `;
    const priorities = [];
    if (ctx.summary.criticalStockCount > 20) priorities.push("reponer stock critico en top sellers");
    if (ctx.summary.noSalesCount > 30) priorities.push("activar productos dormidos o discontinuar");
    if (ctx.summary.overstockCount > 20) priorities.push("liberar capital de sobrestock con promos");
    if (priorities.length > 0) resp += priorities.join(", ") + ".";
    else resp += "Buen estado general. Mantene el monitoreo de stock y busca oportunidades de expansion.";
    return resp;
  }

  // Default - full overview
  let resp = `Soy Nitro Advisor AI, tu consultor comercial con acceso a todos tus datos en tiempo real.\n\n`;
  resp += `**Tu negocio hoy:** ${formatNum(ctx.summary.totalProducts)} productos | $${formatNum(ctx.summary.totalRevenue)} facturados | ${formatNum(ctx.summary.totalUnits)} unidades (30d)\n\n`;
  resp += `Puedo ayudarte con:\n`;
  resp += `- **"stock critico"** → productos que necesitas reponer urgente\n`;
  resp += `- **"top sellers"** → ranking de productos por facturacion\n`;
  resp += `- **"marcas"** → analisis de rendimiento por marca\n`;
  resp += `- **"categorias"** → ventas por categoria\n`;
  resp += `- **"busquedas"** → que buscan tus clientes (GA4)\n`;
  resp += `- **"oportunidades"** → donde podes crecer\n`;
  resp += `- **"precios"** → analisis de pricing y ticket\n`;
  resp += `- **"diagnostico"** → resumen de salud comercial\n\n`;
  resp += `O preguntame cualquier cosa especifica sobre tu operacion comercial.`;
  return resp;
}

function formatNum(n: number): string {
  return n.toLocaleString("es-AR");
}

/* ── API Handler ── */
export async function POST(req: Request) {
  try {
    const { message } = await req.json();
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const ctx = await buildContext();
    const response = generateResponse(message.trim(), ctx);

    return NextResponse.json({ response, status: "ok" });
  } catch (error: any) {
    console.error("Advisor error:", error);
    return NextResponse.json({ response: "Error al procesar tu consulta. Intenta de nuevo.", status: "error", error: error.message });
  }
}
