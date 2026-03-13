import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import * as crypto from "crypto";

export const revalidate = 3600;

const ORG_ID = "cmmmga1uq0000sb43w0krvvys";

interface Insight {
  type: "urgente" | "oportunidad" | "alerta" | "tip";
  icon: string;
  title: string;
  detail: string;
  metric?: string;
  tags?: string[];
}

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

export async function GET() {
  try {
    /* ── 1. Fetch products with sales ── */
    const products = await prisma.product.findMany({
      where: { organizationId: ORG_ID, isActive: true },
      select: {
        id: true, name: true, stock: true, brand: true,
        category: true, imageUrl: true,
      },
    });

    /* ── 2. Fetch order items for sales data ── */
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const orderItems = await prisma.orderItem.findMany({
      where: {
        order: { organizationId: ORG_ID, orderDate: { gte: thirtyDaysAgo } },
      },
      select: {
        productId: true, quantity: true, totalPrice: true,
        order: { select: { id: true } },
      },
    });

    /* Build sales map */
    const salesMap = new Map<string, { unitsSold: number; revenue: number; orders: Set<string>; avgPrice: number }>();
    for (const item of orderItems) {
      if (!item.productId) continue;
      const entry = salesMap.get(item.productId) || { unitsSold: 0, revenue: 0, orders: new Set(), avgPrice: 0 };
      entry.unitsSold += item.quantity;
      entry.revenue += item.totalPrice;
      entry.orders.add(item.order.id);
      salesMap.set(item.productId, entry);
    }

    const productsWithSales = products.map((p) => {
      const sales = salesMap.get(p.id);
      return {
        ...p,
        unitsSold: sales?.unitsSold || 0,
        revenue: sales?.revenue || 0,
        orders: sales?.orders.size || 0,
        avgPrice: sales ? sales.revenue / sales.unitsSold : 0,
      };
    }).sort((a, b) => b.revenue - a.revenue);

    const totalRevenue = productsWithSales.reduce((s, p) => s + p.revenue, 0);.GA4_PROPERTY_ID;
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
            const rows = gaData.rows || [];
            searchTerms = rows
              .map((row: any) => ({
                term: row.dimensionValues[0]?.value || "",
                count: parseInt(row.metricValues[0]?.value || "0"),
              }))
              .filter((s: any) => s.term.length > 1 && s.term !== "(not set)")
              .map((s: any) => {
                const termLower = s.term.toLowerCase();
                const matched = products
                  .filter((p) => {
                    const nl = p.name.toLowerCase();
                    return nl.includes(termLower) || termLower.split(/\s+/).some((w: string) => w.length > 2 && nl.includes(w));
                  })
                  .slice(0, 3)
                  .map((p) => ({ id: p.id, name: p.name, stock: p.stock, brand: p.brand, inStock: p.stock !== null && p.stock > 0 }));
                return { ...s, matchedProducts: matched, hasStock: matched.length === 0 || matched.some((m) => m.inStock) };
              });
          }
        }
      } catch (e) { /* silently fail on GA4 */ }
    }

    /* ── 4. Generate insights ────── */
    const insights: Insight[] = [];

    /* DEMANDA SIN STOCK */
    const demandNoStock = searchTerms.filter((s) => s.count > 100 && s.matchedProducts.length > 0 && !s.hasStock);
    for (const s of demandNoStock.slice(0, 5)) {
      const names = s.matchedProducts.map((p: any) => p.name.substring(0, 40)).slice(0, 2).join(", ");
      insights.push({
        type: "urgente", icon: "\uD83D\uDEA8",
        title: `"${s.term}" se busca ${s.count.toLocaleString("es-AR")} veces pero no hay stock`,
        detail: `Los clientes buscan "${s.term}" activamente pero los productos matcheados (${names}) estan sin stock. Cada busqueda sin resultado es una venta perdida.`,
        metric: `${s.count.toLocaleString("es-AR")} busquedas/mes`,
        tags: ["stock", "demanda", "venta-perdida"],
      });
    }

    /* ALTA DEMANDA SIN PRODUCTOS */
    const demandNoProducts = searchTerms.filter((s) => s.count > 200 && s.matchedProducts.length === 0 && !s.term.startsWith("/"));
    for (const s of demandNoProducts.slice(0, 3)) {
      insights.push({
        type: "oportunidad", icon: "\uD83D\uDCA1",
        title: `"${s.term}" tiene ${s.count.toLocaleString("es-AR")} busquedas pero ningun producto coincide`,
        detail: `Los clientes buscan "${s.term}" y no encuentran nada en tu catalogo. Evalua incorporar productos de esta categoria o mejorar los titulos/tags de los existentes.`,
        metric: `${s.count.toLocaleString("es-AR")} busquedas sin resultados`,
        tags: ["catalogo", "seo", "oportunidad"],
      });
    }

    /* STOCK CRITICO EN TOP SELLERS */
    const topSellers = productsWithSales.slice(0, 30);
    const criticalTop = topSellers.filter((p) => {
      if (p.stock === null || p.stock === undefined) return false;
      const daily = p.unitsSold / 30;
      return daily > 0 && p.stock / daily < 7;
    });
    for (const p of criticalTop.slice(0, 3)) {
      const daily = (p.unitsSold / 30).toFixed(1);
      const daysLeft = Math.round(p.stock! / (p.unitsSold / 30));
      insights.push({
        type: "urgente", icon: "\u23F0",
        title: `${p.name.substring(0, 50)} se queda sin stock en ${daysLeft} dias`,
        detail: `Este producto es Top Seller (vende ${daily} uds/dia) y solo le quedan ${p.stock} unidades. Repone urgente para no perder ventas.`,
        metric: `${p.stock} uds restantes \u00B7 ${daysLeft}d`,
        tags: ["stock", "top-seller", "reposicion"],
      });
    }

    /* CONCENTRACION DE REVENUE */
    if (productsWithSales.length > 5 && totalRevenue > 0) {
      const top5Rev = productsWithSales.slice(0, 5).reduce((s, p) => s + p.revenue, 0);
      const top5Pct = Math.round((top5Rev / totalRevenue) * 100);
      if (top5Pct > 25) {
        insights.push({
          type: "alerta", icon: "\uD83D\uDCCA",
          title: `El ${top5Pct}% de tu facturacion depende de solo 5 productos`,
          detail: `Alta concentracion de revenue. Si alguno tiene quiebre de stock, el impacto es fuerte. Diversifica promocionando productos de categorias similares a tus top sellers.`,
          metric: `Top 5 = ${top5Pct}% revenue`,
          tags: ["riesgo", "concentracion", "diversificacion"],
        });
      }
    }

    /* SOBRESTOCK */
    const overstock = productsWithSales.filter((p) => {
      if (p.stock === null || p.stock === undefined || p.stock < 50) return false;
      const daily = p.unitsSold / 30;
      if (daily <= 0) return p.stock > 100;
      return p.stock / daily > 90;
    });
    if (overstock.length > 0) {
      const names = overstock.slice(0, 3).map((p) => p.name.substring(0, 35)).join(", ");
      insights.push({
        type: "alerta", icon: "\uD83D\uDCE6",
        title: `${overstock.length} productos con mas de 90 dias de stock`,
        detail: `Productos como ${names}... tienen stock para mas de 3 meses. Considera promociones, bundles o descuentos para mover inventario y liberar capital.`,
        metric: `${overstock.length} sobreestockeados`,
        tags: ["sobrestock", "capital", "promocion"],
      });
    }

    /* MARCAS MAS BUSCADAS */
    if (searchTerms.length > 0) {
      const brandSearches = new Map<string, number>();
      for (const s of searchTerms) {
        for (const p of s.matchedProducts || []) {
          if (p.brand) brandSearches.set(p.brand, (brandSearches.get(p.brand) || 0) + s.count);
        }
      }
      const sortedBrands = [...brandSearches.entries()].sort((a, b) => b[1] - a[1]);
      if (sortedBrands.length >= 2) {
        insights.push({
          type: "tip", icon: "\uD83C\uDFAF",
          title: `Las marcas mas buscadas son ${sortedBrands[0][0]} y ${sortedBrands[1][0]}`,
          detail: `Asegura visibilidad premium en la home y categorias para estas marcas. Negocia mejores condiciones con estos proveedores dado el volumen de demanda.`,
          metric: `${sortedBrands[0][1].toLocaleString("es-AR")} + ${sortedBrands[1][1].toLocaleString("es-AR")} busquedas`,
          tags: ["marcas", "negociacion", "visibilidad"],
        });
      }
    }

    /* PRODUCTOS SIN VENTAS CON STOCK */
    const noSalesWithStock = productsWithSales.filter((p) => p.unitsSold === 0 && p.stock !== null && p.stock > 10);
    if (noSalesWithStock.length > 5) {
      insights.push({
        type: "alerta", icon: "\uD83D\uDCA4",
        title: `${noSalesWithStock.length} productos con stock pero sin ventas en 30 dias`,
        detail: `Estos productos tienen inventario pero no generan revenue. Revisa si estan bien categorizados, con fotos y precios competitivos, o si conviene discontinuarlos.`,
        metric: `${noSalesWithStock.length} productos dormidos`,
        tags: ["inventario", "rotacion", "optimizacion"],
      });
    }

    /* TICKET PROMEDIO */
    if (productsWithSales.length > 0) {
      const avgPrice = productsWithSales.filter((p) => p.avgPrice > 0).reduce((s, p) => s + p.avgPrice, 0) / productsWithSales.filter((p) => p.avgPrice > 0).length;
      const topByPrice = productsWithSales.filter((p) => p.avgPrice > avgPrice * 2 && p.unitsSold > 5);
      if (topByPrice.length > 0) {
        insights.push({
          type: "tip", icon: "\uD83D\uDCB0",
          title: `${topByPrice.length} productos premium venden bien por encima del promedio`,
          detail: `Hay productos con ticket 2x superior al promedio que siguen vendiendo. Oportunidad de expandir la gama premium o crear bundles con estos productos como ancla.`,
          metric: `Ticket prom: $${Math.round(avgPrice).toLocaleString("es-AR")}`,
          tags: ["pricing", "premium", "upsell"],
        });
      }
    }

    /* ── 5. Health Score ────────── */
    let healthScore = 75;
    const withStock = productsWithSales.filter((p) => p.stock !== null && p.stock !== undefined);
    if (withStock.length > 0) {
      const criticalPct = withStock.filter((p) => { const d = p.unitsSold / 30; return d > 0 && p.stock! / d < 7; }).length / withStock.length;
      healthScore -= Math.round(criticalPct * 30);
    }
    if (demandNoStock.length > 3) healthScore -= 8;
    if (demandNoStock.length > 6) healthScore -= 7;
    if (overstock.length > 10) healthScore -= 5;
    if (noSalesWithStock.length > 20) healthScore -= 5;
    healthScore = Math.max(20, Math.min(95, healthScore));

    return NextResponse.json({
      insights: insights.sort((a, b) => {
        const order = { urgente: 0, oportunidad: 1, alerta: 2, tip: 3 };
        return order[a.type] - order[b.type];
      }),
      healthScore,
      generatedAt: new Date().toISOString(),
      status: "ok",
    });
  } catch (error: any) {
    console.error("Insights error:", error);
    return NextResponse.json({ insights: [], healthScore: 0, status: "error", error: error.message });
  }
}
