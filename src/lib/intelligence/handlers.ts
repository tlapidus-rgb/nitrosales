// ══════════════════════════════════════════════════════════════
// NitroSales Intelligence Engine — Tool Handlers
// ══════════════════════════════════════════════════════════════
// Cada handler ejecuta las queries necesarias para un dominio
// específico y devuelve datos estructurados como texto.
// ══════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";

// ── Helpers ──
const fmt = (n: number) => Math.round(n).toLocaleString("es-AR");
const pct = (c: number, p: number) => (p > 0 ? Math.round(((c - p) / p) * 100) : null);
const billable = ["INVOICED", "SHIPPED", "DELIVERED"];

function dateRange(days: number) {
  const now = new Date();
  const start = new Date(now.getTime() - days * 86400000);
  const prevStart = new Date(now.getTime() - days * 2 * 86400000);
  return { now, start, prevStart };
}

// ══════════════════════════════════════════════════════════════
// 1. SALES OVERVIEW
// ══════════════════════════════════════════════════════════════
export async function handleSalesOverview(orgId: string, input: any): Promise<string> {
  const days = input.days || 30;
  const { now, start, prevStart } = dateRange(days);
  const d7 = new Date(now.getTime() - 7 * 86400000);
  const d14 = new Date(now.getTime() - 14 * 86400000);

  const [orders, ordersPrev, orders7, orders14] = await Promise.all([
    prisma.order.findMany({ where: { organizationId: orgId, orderDate: { gte: start, lt: now } } }),
    prisma.order.findMany({ where: { organizationId: orgId, orderDate: { gte: prevStart, lt: start } } }),
    prisma.order.findMany({ where: { organizationId: orgId, orderDate: { gte: d7, lt: now } } }),
    prisma.order.findMany({ where: { organizationId: orgId, orderDate: { gte: d14, lt: d7 } } }),
  ]);

  const curr = orders.filter((o) => billable.includes(o.status));
  const prev = ordersPrev.filter((o) => billable.includes(o.status));
  const l7 = orders7.filter((o) => billable.includes(o.status));
  const pw7 = orders14.filter((o) => billable.includes(o.status));
  const canc = orders.filter((o) => o.status === "CANCELLED");

  const rev = curr.reduce((s, o) => s + o.totalValue, 0);
  const revP = prev.reduce((s, o) => s + o.totalValue, 0);
  const rev7 = l7.reduce((s, o) => s + o.totalValue, 0);
  const rev7P = pw7.reduce((s, o) => s + o.totalValue, 0);
  const avgT = curr.length > 0 ? rev / curr.length : 0;
  const avgTP = prev.length > 0 ? revP / prev.length : 0;

  // Device breakdown
  const devMap: Record<string, { orders: number; rev: number }> = {};
  for (const o of curr) {
    const d = o.deviceType || "unknown";
    if (!devMap[d]) devMap[d] = { orders: 0, rev: 0 };
    devMap[d].orders++;
    devMap[d].rev += o.totalValue;
  }
  const devStr = Object.entries(devMap).map(([d, v]) => `${d}: ${v.orders} pedidos ($${fmt(v.rev)})`).join(" | ");

  // Source breakdown
  const srcMap: Record<string, { orders: number; rev: number }> = {};
  for (const o of curr) {
    const s = (o as any).source || "direct";
    if (!srcMap[s]) srcMap[s] = { orders: 0, rev: 0 };
    srcMap[s].orders++;
    srcMap[s].rev += o.totalValue;
  }
  const srcStr = Object.entries(srcMap).sort((a, b) => b[1].rev - a[1].rev).slice(0, 8)
    .map(([s, v]) => `${s}: ${v.orders} pedidos ($${fmt(v.rev)})`).join("\n");

  // Daily trend last 7d
  const dayMap = new Map<string, { rev: number; orders: number }>();
  for (const o of l7) {
    const day = o.orderDate.toISOString().split("T")[0];
    const ex = dayMap.get(day) || { rev: 0, orders: 0 };
    ex.rev += o.totalValue;
    ex.orders++;
    dayMap.set(day, ex);
  }
  const dailyTrend = [...dayMap.entries()].sort().map(([d, v]) => `${d}: $${fmt(v.rev)} (${v.orders} pedidos)`).join("\n");

  return `VENTAS (${days}d):
- Revenue: $${fmt(rev)} (${pct(rev, revP) !== null ? (pct(rev, revP)! > 0 ? "+" : "") + pct(rev, revP) + "% vs anterior" : "primer periodo"})
- Pedidos facturados: ${curr.length} (anterior: ${prev.length}, cambio: ${pct(curr.length, prev.length) !== null ? pct(curr.length, prev.length) + "%" : "N/A"})
- Ticket promedio: $${fmt(avgT)} (anterior: $${fmt(avgTP)}, cambio: ${pct(avgT, avgTP) !== null ? pct(avgT, avgTP) + "%" : "N/A"})
- Cancelados: ${canc.length} (${orders.length > 0 ? ((canc.length / orders.length) * 100).toFixed(1) : "0"}%)
- Dispositivos: ${devStr || "Sin datos"}

VELOCIDAD SEMANAL:
- Semana actual: $${fmt(rev7)} (${l7.length} pedidos)
- Semana anterior: $${fmt(rev7P)} (${pw7.length} pedidos)
- Cambio: ${pct(rev7, rev7P) !== null ? (pct(rev7, rev7P)! > 0 ? "+" : "") + pct(rev7, rev7P) + "%" : "N/A"}

TENDENCIA DIARIA (7d):
${dailyTrend || "Sin datos"}

REVENUE POR FUENTE:
${srcStr || "Sin datos de fuente"}`;
}

// ══════════════════════════════════════════════════════════════
// 2. PRODUCTS & INVENTORY
// ══════════════════════════════════════════════════════════════
export async function handleProductsInventory(orgId: string, input: any): Promise<string> {
  const focus = input.focus || "overview";
  const d30 = new Date(Date.now() - 30 * 86400000);

  const [products, orderItems] = await Promise.all([
    prisma.product.findMany({
      where: { organizationId: orgId },
      select: {
        id: true, name: true, sku: true, brand: true, category: true,
        stock: true, price: true, costPrice: true, isActive: true,
      },
    }),
    prisma.orderItem.findMany({
      where: { order: { organizationId: orgId, orderDate: { gte: d30 } } },
      select: { productId: true, quantity: true, totalPrice: true },
      take: 10000,
    }),
  ]);

  // Build sales map
  const salesMap = new Map<string, { qty: number; rev: number }>();
  for (const item of orderItems) {
    if (!item.productId) continue;
    const ex = salesMap.get(item.productId) || { qty: 0, rev: 0 };
    ex.qty += item.quantity;
    ex.rev += item.totalPrice;
    salesMap.set(item.productId, ex);
  }

  // Enrich products
  const enriched = products.map((p) => {
    const s = salesMap.get(p.id) || { qty: 0, rev: 0 };
    const dailyRate = s.qty / 30;
    const daysInv = dailyRate > 0 && p.stock ? Math.round(p.stock / dailyRate) : p.stock && p.stock > 0 ? 9999 : 0;
    const margin = p.costPrice && p.price ? ((p.price - p.costPrice) / p.price * 100) : null;
    return {
      ...p, unitsSold: s.qty, revenue: s.rev, dailyRate: Math.round(dailyRate * 100) / 100,
      daysInv, margin: margin ? Math.round(margin) : null,
    };
  });

  const active = enriched.filter((p) => p.isActive);
  const withStock = enriched.filter((p) => (p.stock || 0) > 0);
  const withSales = enriched.filter((p) => p.unitsSold > 0);
  const critStock = enriched.filter((p) => p.stock && p.stock > 0 && p.dailyRate > 0 && p.daysInv < 7);
  const deadStock = enriched.filter((p) => (p.stock || 0) > 0 && p.unitsSold === 0);
  const overstock = enriched.filter((p) => p.daysInv > 90 && p.daysInv < 9999);

  if (focus === "search_product" && input.search_term) {
    const term = input.search_term.toLowerCase();
    const matches = enriched.filter((p) => p.name.toLowerCase().includes(term) || (p.brand || "").toLowerCase().includes(term) || (p.sku || "").toLowerCase().includes(term));
    if (matches.length === 0) return `No encontre productos que coincidan con "${input.search_term}".`;
    return `BUSQUEDA: "${input.search_term}" (${matches.length} resultados)\n\n` +
      matches.sort((a, b) => b.revenue - a.revenue).slice(0, 20).map((p, i) =>
        `${i + 1}. ${p.name} [${p.brand || "S/M"}/${p.category || "S/C"}] SKU:${p.sku || "N/A"}\n` +
        `   Precio: $${fmt(p.price || 0)} | Costo: ${p.costPrice ? "$" + fmt(p.costPrice) : "N/A"} | Margen: ${p.margin !== null ? p.margin + "%" : "N/A"}\n` +
        `   Stock: ${p.stock || 0} | Vendido 30d: ${p.unitsSold}uds ($${fmt(p.revenue)}) | Vel: ${p.dailyRate}/dia\n` +
        `   Dias inventario: ${p.daysInv > 9000 ? "INF(sin venta)" : p.daysInv + "d"} | ${p.isActive ? "ACTIVO" : "INACTIVO"}`
      ).join("\n\n");
  }

  let result = `RESUMEN INVENTARIO:
- Total productos: ${products.length} | Activos: ${active.length} | Con stock: ${withStock.length} | Con ventas 30d: ${withSales.length}
- Stock critico (<7 dias): ${critStock.length} productos
- Dead stock (con stock, sin ventas): ${deadStock.length} productos
- Sobrestock (>90 dias): ${overstock.length} productos\n\n`;

  if (focus === "overview" || focus === "critical_stock") {
    const sorted = critStock.sort((a, b) => a.daysInv - b.daysInv).slice(0, 20);
    if (sorted.length > 0) {
      result += `STOCK CRITICO - REPONER URGENTE:\n`;
      result += sorted.map((p) =>
        `- ${p.name} [${p.brand}] Stock:${p.stock} | Vel:${p.dailyRate}/dia | QUEDAN ${p.daysInv} DIAS | Rev30d:$${fmt(p.revenue)}`
      ).join("\n") + "\n\n";
    }
  }

  if (focus === "overview" || focus === "dead_stock") {
    const deadVal = deadStock.reduce((s, p) => s + (p.stock || 0) * (p.price || 0), 0);
    const deadUnits = deadStock.reduce((s, p) => s + (p.stock || 0), 0);
    result += `DEAD STOCK: ${deadStock.length} productos, ${deadUnits} unidades, $${fmt(deadVal)} inmovilizados\n`;
    // Group by brand
    const byBrand = new Map<string, { count: number; units: number; value: number }>();
    for (const p of deadStock) {
      const b = p.brand || "Sin marca";
      const ex = byBrand.get(b) || { count: 0, units: 0, value: 0 };
      ex.count++;
      ex.units += p.stock || 0;
      ex.value += (p.stock || 0) * (p.price || 0);
      byBrand.set(b, ex);
    }
    result += [...byBrand.entries()].sort((a, b) => b[1].value - a[1].value).slice(0, 10)
      .map(([b, d]) => `- ${b}: ${d.count} prods, ${d.units} uds, $${fmt(d.value)} inmovilizado`).join("\n") + "\n\n";
  }

  if (focus === "overview" || focus === "overstock") {
    if (overstock.length > 0) {
      result += `SOBRESTOCK (>90 dias de inventario):\n`;
      result += overstock.sort((a, b) => (b.stock || 0) * (b.price || 0) - (a.stock || 0) * (a.price || 0)).slice(0, 15)
        .map((p) => `- ${p.name} [${p.brand}] Stock:${p.stock} (${p.daysInv}d) | Valor:$${fmt((p.stock || 0) * (p.price || 0))}`).join("\n") + "\n\n";
    }
  }

  // Top sellers always included
  const topSellers = enriched.sort((a, b) => b.revenue - a.revenue).slice(0, 20);
  result += `TOP 20 PRODUCTOS POR REVENUE (30d):\n`;
  result += topSellers.map((p, i) =>
    `${i + 1}. ${p.name} [${p.brand}/${p.category}] $${fmt(p.revenue)} | ${p.unitsSold}uds | Stock:${p.stock || 0} | Margen:${p.margin !== null ? p.margin + "%" : "N/A"} | ${p.daysInv > 9000 ? "SIN VENTA" : p.daysInv + "d inv"}`
  ).join("\n") + "\n\n";

  if (focus === "overview" || focus === "brands") {
    const brandMap = new Map<string, { skus: number; active: number; rev: number; units: number; dead: number; stock: number }>();
    for (const p of enriched) {
      const b = p.brand || "Sin marca";
      const ex = brandMap.get(b) || { skus: 0, active: 0, rev: 0, units: 0, dead: 0, stock: 0 };
      ex.skus++;
      if (p.isActive) ex.active++;
      ex.rev += p.revenue;
      ex.units += p.unitsSold;
      ex.stock += p.stock || 0;
      if ((p.stock || 0) > 0 && p.unitsSold === 0) ex.dead++;
      brandMap.set(b, ex);
    }
    result += `ANALISIS POR MARCA (top 20):\n`;
    result += [...brandMap.entries()].sort((a, b) => b[1].rev - a[1].rev).slice(0, 20)
      .map(([b, d]) => `${b}: ${d.skus} SKUs (${d.active} activos) | Rev:$${fmt(d.rev)} | ${d.units}uds | Stock:${d.stock}${d.dead > 0 ? " | " + d.dead + " MUERTOS" : ""}`)
      .join("\n") + "\n\n";
  }

  if (focus === "overview" || focus === "categories") {
    const catMap = new Map<string, { rev: number; units: number; prods: number }>();
    for (const p of enriched) {
      const c = p.category || "Sin categoria";
      const ex = catMap.get(c) || { rev: 0, units: 0, prods: 0 };
      ex.rev += p.revenue;
      ex.units += p.unitsSold;
      ex.prods++;
      catMap.set(c, ex);
    }
    result += `ANALISIS POR CATEGORIA:\n`;
    result += [...catMap.entries()].sort((a, b) => b[1].rev - a[1].rev).slice(0, 15)
      .map(([c, d]) => `${c}: $${fmt(d.rev)} | ${d.units}uds | ${d.prods} SKUs`)
      .join("\n") + "\n";
  }

  return result;
}

// ══════════════════════════════════════════════════════════════
// 3. ADS PERFORMANCE
// ══════════════════════════════════════════════════════════════
export async function handleAdsPerformance(orgId: string, input: any): Promise<string> {
  const days = input.days || 30;
  const { now, start, prevStart } = dateRange(days);

  const [ads, adsPrev, campaigns] = await Promise.all([
    prisma.adMetricDaily.findMany({ where: { organizationId: orgId, date: { gte: start, lt: now } } }),
    prisma.adMetricDaily.findMany({ where: { organizationId: orgId, date: { gte: prevStart, lt: start } } }),
    prisma.adCampaign.findMany({
      where: { organizationId: orgId, status: "ACTIVE" },
      include: { dailyMetrics: { where: { date: { gte: start } } } },
    }),
  ]);

  const sum = (arr: any[], field: string) => arr.reduce((s, a) => s + (a[field] || 0), 0);

  const spend = sum(ads, "spend"), spendP = sum(adsPrev, "spend");
  const adRev = sum(ads, "conversionValue"), adRevP = sum(adsPrev, "conversionValue");
  const clicks = sum(ads, "clicks"), impr = sum(ads, "impressions"), conv = sum(ads, "conversions");
  const convP = sum(adsPrev, "conversions");

  const gA = ads.filter((a) => a.platform === "GOOGLE");
  const mA = ads.filter((a) => a.platform === "META");
  const gS = sum(gA, "spend"), mS = sum(mA, "spend");
  const gR = sum(gA, "conversionValue"), mR = sum(mA, "conversionValue");
  const gClk = sum(gA, "clicks"), mClk = sum(mA, "clicks");
  const gConv = sum(gA, "conversions"), mConv = sum(mA, "conversions");
  const gImpr = sum(gA, "impressions"), mImpr = sum(mA, "impressions");

  // Campaign detail
  const campData = campaigns.map((c) => {
    const m = c.dailyMetrics;
    const cs = sum(m, "spend"), cr = sum(m, "conversionValue");
    const cc = sum(m, "clicks"), cn = sum(m, "conversions"), ci = sum(m, "impressions");
    return {
      name: c.name, platform: c.platform, spend: cs, rev: cr, clicks: cc,
      conv: cn, impr: ci, roas: cs > 0 ? cr / cs : 0, cpa: cn > 0 ? cs / cn : 0,
      ctr: ci > 0 ? (cc / ci) * 100 : 0,
    };
  }).sort((a, b) => b.spend - a.spend);

  const goodCamps = campData.filter((c) => c.roas > 10 && c.spend > 0);
  const badCamps = campData.filter((c) => c.roas < 3 && c.spend > 1000);

  return `PUBLICIDAD (${days}d):
- Inversion total: $${fmt(spend)} (anterior: $${fmt(spendP)}, cambio: ${pct(spend, spendP) !== null ? pct(spend, spendP) + "%" : "N/A"})
- Revenue publicitario: $${fmt(adRev)} (anterior: $${fmt(adRevP)})
- ROAS global: ${spend > 0 ? (adRev / spend).toFixed(2) : "N/A"}x (anterior: ${spendP > 0 ? (adRevP / spendP).toFixed(2) : "N/A"}x)
- CPA: $${conv > 0 ? fmt(spend / conv) : "N/A"} | CTR: ${impr > 0 ? ((clicks / impr) * 100).toFixed(2) : "N/A"}% | CPC: $${clicks > 0 ? fmt(spend / clicks) : "N/A"}
- Conversiones: ${conv} (anterior: ${convP})

POR PLATAFORMA:
GOOGLE ADS: Gasto $${fmt(gS)} | Rev $${fmt(gR)} | ROAS ${gS > 0 ? (gR / gS).toFixed(2) : "0"}x | CPA $${gConv > 0 ? fmt(gS / gConv) : "N/A"} | CTR ${gImpr > 0 ? ((gClk / gImpr) * 100).toFixed(2) : "0"}% | ${gConv} conv
META ADS: Gasto $${fmt(mS)} | Rev $${fmt(mR)} | ROAS ${mS > 0 ? (mR / mS).toFixed(2) : "0"}x | CPA $${mConv > 0 ? fmt(mS / mConv) : "N/A"} | CTR ${mImpr > 0 ? ((mClk / mImpr) * 100).toFixed(2) : "0"}% | ${mConv} conv

EFICIENCIA:
- Budget split: Google ${spend > 0 ? Math.round((gS / spend) * 100) : 0}% vs Meta ${spend > 0 ? Math.round((mS / spend) * 100) : 0}%
- Campanas ROAS>10x: ${goodCamps.length} ($${fmt(goodCamps.reduce((s, c) => s + c.spend, 0))} invertidos)
- Campanas ROAS<3x con gasto>$1000: ${badCamps.length} ($${fmt(badCamps.reduce((s, c) => s + c.spend, 0))} invertidos — OPORTUNIDAD DE REASIGNAR)

CAMPANAS TOP 12:
${campData.slice(0, 12).map((c, i) =>
    `${i + 1}. ${c.name} (${c.platform}): Gasto $${fmt(c.spend)} | Rev $${fmt(c.rev)} | ROAS ${c.roas.toFixed(2)}x | CPA $${fmt(c.cpa)} | CTR ${c.ctr.toFixed(2)}% | ${c.conv} conv`
  ).join("\n")}

${badCamps.length > 0 ? `\nCAMPANAS INEFICIENTES (ROAS<3x):\n${badCamps.map((c) => `- ${c.name}: Gasto $${fmt(c.spend)} con ROAS ${c.roas.toFixed(2)}x. Considerar pausar o reestructurar.`).join("\n")}` : ""}`;
}

// ══════════════════════════════════════════════════════════════
// 4. TRAFFIC & FUNNEL
// ══════════════════════════════════════════════════════════════
export async function handleTrafficFunnel(orgId: string, input: any): Promise<string> {
  const days = input.days || 30;
  const { now, start, prevStart } = dateRange(days);

  const [web, webPrev, funnel, funnelPrev, sources] = await Promise.all([
    prisma.webMetricDaily.findMany({ where: { organizationId: orgId, date: { gte: start, lt: now } } }),
    prisma.webMetricDaily.findMany({ where: { organizationId: orgId, date: { gte: prevStart, lt: start } } }),
    prisma.funnelDaily.findMany({ where: { organizationId: orgId, date: { gte: start, lt: now } } }),
    prisma.funnelDaily.findMany({ where: { organizationId: orgId, date: { gte: prevStart, lt: start } } }),
    prisma.webMetricDaily.groupBy({
      by: ["source", "medium"],
      _sum: { sessions: true, users: true },
      where: { organizationId: orgId, date: { gte: start } },
      orderBy: { _sum: { sessions: "desc" } },
      take: 15,
    }),
  ]);

  const sess = web.reduce((s, w) => s + w.sessions, 0);
  const sessP = webPrev.reduce((s, w) => s + w.sessions, 0);
  const users = web.reduce((s, w) => s + w.users, 0);
  const br = web.length > 0 ? (web.reduce((s, w) => s + (w.bounceRate || 0), 0) / web.length).toFixed(1) : "N/A";
  const avgDur = web.length > 0 ? (web.reduce((s, w) => s + (w.avgSessionDuration || 0), 0) / web.length).toFixed(0) : "N/A";

  // Device
  const devSess: Record<string, number> = {};
  for (const w of web) { devSess[w.deviceCategory || "unknown"] = (devSess[w.deviceCategory || "unknown"] || 0) + w.sessions; }
  const devStr = Object.entries(devSess).sort((a, b) => b[1] - a[1]).map(([d, s]) => `${d}: ${s}`).join(" | ");

  // Funnel
  const fVis = funnel.reduce((s, f) => s + f.visitors, 0);
  const fPV = funnel.reduce((s, f) => s + f.productViews, 0);
  const fATC = funnel.reduce((s, f) => s + f.addToCarts, 0);
  const fCO = funnel.reduce((s, f) => s + f.checkoutStarts, 0);
  const fPur = funnel.reduce((s, f) => s + f.purchases, 0);
  const fVisP = funnelPrev.reduce((s, f) => s + f.visitors, 0);
  const fPurP = funnelPrev.reduce((s, f) => s + f.purchases, 0);

  // Biggest dropoff
  let bottleneck = "N/A";
  if (fVis > 0) {
    const drops = [
      { step: "Producto > Carrito", rate: fPV > 0 ? 1 - fATC / fPV : 0, lost: fPV - fATC },
      { step: "Carrito > Checkout", rate: fATC > 0 ? 1 - fCO / fATC : 0, lost: fATC - fCO },
      { step: "Checkout > Compra", rate: fCO > 0 ? 1 - fPur / fCO : 0, lost: fCO - fPur },
    ];
    const worst = drops.sort((a, b) => b.rate - a.rate)[0];
    if (worst) bottleneck = `${worst.step} (${Math.round(worst.rate * 100)}% abandono, ${worst.lost} usuarios perdidos)`;
  }

  const srcStr = sources.map((s) =>
    `${s.source || "direct"}/${s.medium || "none"}: ${s._sum.sessions || 0} sesiones, ${s._sum.users || 0} usuarios`
  ).join("\n");

  return `TRAFICO WEB (${days}d):
- Sesiones: ${sess.toLocaleString()} (${pct(sess, sessP) !== null ? (pct(sess, sessP)! > 0 ? "+" : "") + pct(sess, sessP) + "% vs anterior" : ""})
- Usuarios: ${users.toLocaleString()}
- Bounce rate: ${br}%
- Duracion promedio: ${avgDur}s
- Dispositivos: ${devStr || "Sin datos"}

FUNNEL DE CONVERSION (${days}d):
- Visitantes: ${fVis.toLocaleString()}
- Vieron producto: ${fPV.toLocaleString()} (${fVis > 0 ? ((fPV / fVis) * 100).toFixed(1) : "0"}%)
- Add to cart: ${fATC.toLocaleString()} (${fVis > 0 ? ((fATC / fVis) * 100).toFixed(1) : "0"}%)
- Inicio checkout: ${fCO.toLocaleString()} (${fVis > 0 ? ((fCO / fVis) * 100).toFixed(1) : "0"}%)
- Compras: ${fPur.toLocaleString()} (${fVis > 0 ? ((fPur / fVis) * 100).toFixed(2) : "0"}%)
- MAYOR CUELLO DE BOTELLA: ${bottleneck}
- Periodo anterior: ${fVisP.toLocaleString()} visitantes > ${fPurP.toLocaleString()} compras (${fVisP > 0 ? ((fPurP / fVisP) * 100).toFixed(2) : "0"}%)

FUENTES DE TRAFICO:
${srcStr || "Sin datos"}`;
}

// ══════════════════════════════════════════════════════════════
// 5. CUSTOMERS & LTV
// ══════════════════════════════════════════════════════════════
export async function handleCustomersLtv(orgId: string): Promise<string> {
  const d30 = new Date(Date.now() - 30 * 86400000);
  const d90 = new Date(Date.now() - 90 * 86400000);

  const [customers, predictions, recentOrders] = await Promise.all([
    prisma.customer.findMany({
      where: { organizationId: orgId },
      orderBy: { totalSpent: "desc" },
      take: 200,
    }),
    prisma.customerLtvPrediction.findMany({
      where: { organizationId: orgId },
      orderBy: { predictedLtv: "desc" },
      take: 50,
    }),
    prisma.order.findMany({
      where: { organizationId: orgId, orderDate: { gte: d90 }, status: { in: billable } },
      select: { customerId: true, orderDate: true, totalValue: true },
    }),
  ]);

  const total = customers.length;
  const repeat = customers.filter((c) => c.totalOrders > 1).length;
  const avgLTV = total > 0 ? customers.reduce((s, c) => s + c.totalSpent, 0) / total : 0;
  const avgOrders = total > 0 ? customers.reduce((s, c) => s + c.totalOrders, 0) / total : 0;

  // Recency
  const now = Date.now();
  const active30 = new Set(recentOrders.filter((o) => o.orderDate.getTime() > now - 30 * 86400000).map((o) => o.customerId)).size;
  const active90 = new Set(recentOrders.map((o) => o.customerId)).size;

  // VIP (top 10%)
  const vipCount = Math.ceil(total * 0.1);
  const vips = customers.slice(0, vipCount);
  const vipRev = vips.reduce((s, c) => s + c.totalSpent, 0);
  const totalRev = customers.reduce((s, c) => s + c.totalSpent, 0);

  // At risk: bought before but not in last 90 days
  const activeIds = new Set(recentOrders.map((o) => o.customerId));
  const atRisk = customers.filter((c) => c.totalOrders > 1 && !activeIds.has(c.id));

  const topStr = customers.slice(0, 10).map((c, i) =>
    `${i + 1}. ${c.firstName || ""} ${c.lastName || ""}: ${c.totalOrders} pedidos, $${fmt(c.totalSpent)} LTV, ultimo: ${c.lastOrderDate ? c.lastOrderDate.toISOString().split("T")[0] : "N/A"}`
  ).join("\n");

  let ltvPredStr = "";
  if (predictions.length > 0) {
    ltvPredStr = `\nPREDICCIONES LTV (modelo BG/NBD):\n` +
      predictions.slice(0, 10).map((p, i) =>
        `${i + 1}. Cliente ${p.customerId.substring(0, 8)}...: LTV predicho $${fmt(Number(p.predictedLtv))} | Confianza: ${(Number(p.confidence) * 100).toFixed(0)}% | Metodo: ${p.method}`
      ).join("\n");
  }

  return `CLIENTES:
- Total en DB: ${total}
- Recurrentes (>1 compra): ${repeat} (${total > 0 ? Math.round((repeat / total) * 100) : 0}%)
- LTV promedio: $${fmt(avgLTV)}
- Pedidos promedio por cliente: ${avgOrders.toFixed(1)}
- Activos ultimos 30d: ${active30} | Ultimos 90d: ${active90}

SEGMENTACION:
- VIP (top 10%): ${vipCount} clientes generan $${fmt(vipRev)} (${totalRev > 0 ? Math.round((vipRev / totalRev) * 100) : 0}% del revenue total)
- En riesgo (recurrentes sin compra en 90d): ${atRisk.length} clientes con $${fmt(atRisk.reduce((s, c) => s + c.totalSpent, 0))} en LTV historico

TOP 10 CLIENTES:
${topStr}
${ltvPredStr}`;
}

// ══════════════════════════════════════════════════════════════
// 6. SEO PERFORMANCE
// ══════════════════════════════════════════════════════════════
export async function handleSeoPerformance(orgId: string, input: any): Promise<string> {
  const days = input.days || 30;
  const { now, start, prevStart } = dateRange(days);

  const [queries, queriesPrev, pages] = await Promise.all([
    prisma.seoQueryDaily.findMany({
      where: { organizationId: orgId, date: { gte: start, lt: now } },
      take: 5000,
    }),
    prisma.seoQueryDaily.findMany({
      where: { organizationId: orgId, date: { gte: prevStart, lt: start } },
      take: 5000,
    }),
    prisma.seoPageDaily.findMany({
      where: { organizationId: orgId, date: { gte: start, lt: now } },
      take: 2000,
    }),
  ]);

  if (queries.length === 0) return "No hay datos de SEO (Google Search Console) disponibles. Verifica que la conexion con GSC este activa.";

  // Aggregate queries
  const qMap = new Map<string, { clicks: number; impr: number; pos: number; count: number }>();
  for (const q of queries) {
    const ex = qMap.get(q.query) || { clicks: 0, impr: 0, pos: 0, count: 0 };
    ex.clicks += q.clicks;
    ex.impr += q.impressions;
    ex.pos += q.position;
    ex.count++;
    qMap.set(q.query, ex);
  }

  const qPrevMap = new Map<string, { clicks: number; impr: number; pos: number; count: number }>();
  for (const q of queriesPrev) {
    const ex = qPrevMap.get(q.query) || { clicks: 0, impr: 0, pos: 0, count: 0 };
    ex.clicks += q.clicks;
    ex.impr += q.impressions;
    ex.pos += q.position;
    ex.count++;
    qPrevMap.set(q.query, ex);
  }

  // Top keywords
  const topKw = [...qMap.entries()]
    .map(([q, d]) => ({ query: q, clicks: d.clicks, impr: d.impr, avgPos: d.pos / d.count }))
    .sort((a, b) => b.clicks - a.clicks);

  const totalClicks = topKw.reduce((s, k) => s + k.clicks, 0);
  const totalImpr = topKw.reduce((s, k) => s + k.impr, 0);

  // Movers (position changes)
  const movers = topKw.slice(0, 100).map((k) => {
    const prev = qPrevMap.get(k.query);
    const prevPos = prev ? prev.pos / prev.count : null;
    return { ...k, prevPos, change: prevPos ? k.avgPos - prevPos : null };
  }).filter((k) => k.change !== null);

  const improved = movers.filter((k) => k.change! < -1).sort((a, b) => a.change! - b.change!).slice(0, 10);
  const declined = movers.filter((k) => k.change! > 1).sort((a, b) => b.change! - a.change!).slice(0, 10);

  // Opportunities: high impressions, low position
  const opps = topKw.filter((k) => k.impr > 100 && k.avgPos > 10 && k.avgPos < 30).sort((a, b) => b.impr - a.impr).slice(0, 10);

  return `SEO (${days}d - Google Search Console):
- Clicks organicos: ${totalClicks.toLocaleString()}
- Impresiones: ${totalImpr.toLocaleString()}
- CTR promedio: ${totalImpr > 0 ? ((totalClicks / totalImpr) * 100).toFixed(2) : "0"}%
- Keywords trackeadas: ${qMap.size}

TOP 15 KEYWORDS (por clicks):
${topKw.slice(0, 15).map((k, i) => `${i + 1}. "${k.query}" → ${k.clicks} clicks | ${k.impr} impr | Pos ${k.avgPos.toFixed(1)}`).join("\n")}

KEYWORDS QUE MEJORARON POSICION:
${improved.length > 0 ? improved.map((k) => `- "${k.query}": Pos ${k.prevPos!.toFixed(1)} → ${k.avgPos.toFixed(1)} (${k.change!.toFixed(1)} posiciones)`).join("\n") : "Sin cambios significativos"}

KEYWORDS QUE EMPEORARON:
${declined.length > 0 ? declined.map((k) => `- "${k.query}": Pos ${k.prevPos!.toFixed(1)} → ${k.avgPos.toFixed(1)} (+${k.change!.toFixed(1)} posiciones)`).join("\n") : "Sin caidas significativas"}

OPORTUNIDADES (alta impresion, posicion mejorable):
${opps.length > 0 ? opps.map((k) => `- "${k.query}": ${k.impr} impresiones pero posicion ${k.avgPos.toFixed(1)}. Si sube a top 5, potencial: ~${Math.round(k.impr * 0.05)} clicks/mes extra`).join("\n") : "Sin oportunidades claras"}`;
}

// ══════════════════════════════════════════════════════════════
// 7. COMPETITORS
// ══════════════════════════════════════════════════════════════
export async function handleCompetitorsAnalysis(orgId: string): Promise<string> {
  const [stores, prices, ownProducts] = await Promise.all([
    prisma.competitorStore.findMany({ where: { organizationId: orgId, isActive: true } }),
    prisma.competitorPrice.findMany({
      where: { organizationId: orgId, competitor: { isActive: true } },
      include: { competitor: { select: { name: true } } },
    }),
    prisma.product.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true, name: true, price: true, brand: true },
    }),
  ]);

  if (stores.length === 0) return "No hay competidores configurados. Agrega competidores desde la seccion de Competencia en NitroSales.";

  const ownMap = new Map(ownProducts.map((p) => [p.id, p]));
  const matched = prices.filter((p) => p.ownProductId);
  const totalMatched = new Set(matched.map((p) => p.ownProductId)).size;

  // Price comparison
  let cheaper = 0, pricier = 0, similar = 0;
  const opportunities: { name: string; ownPrice: number; compPrice: number; competitor: string; diff: number }[] = [];
  const threats: { name: string; ownPrice: number; compPrice: number; competitor: string; diff: number }[] = [];

  for (const cp of matched) {
    const own = ownMap.get(cp.ownProductId!);
    if (!own || !own.price || !cp.currentPrice) continue;
    const diff = ((own.price - Number(cp.currentPrice)) / own.price) * 100;
    if (diff > 5) {
      pricier++;
      threats.push({ name: own.name, ownPrice: own.price, compPrice: Number(cp.currentPrice), competitor: cp.competitor?.name || "?", diff });
    } else if (diff < -5) {
      cheaper++;
      opportunities.push({ name: own.name, ownPrice: own.price, compPrice: Number(cp.currentPrice), competitor: cp.competitor?.name || "?", diff: Math.abs(diff) });
    } else {
      similar++;
    }
  }

  threats.sort((a, b) => b.diff - a.diff);
  opportunities.sort((a, b) => b.diff - a.diff);

  return `COMPETENCIA:
- Competidores monitoreados: ${stores.length} (${stores.map((s) => s.name).join(", ")})
- Productos comparados: ${totalMatched} de ${ownProducts.length} (${ownProducts.length > 0 ? Math.round((totalMatched / ownProducts.length) * 100) : 0}% cobertura)
- Sos mas caro en: ${pricier} productos | Mas barato en: ${cheaper} | Precio similar: ${similar}

AMENAZAS (competidor mas barato, diferencia >5%):
${threats.slice(0, 10).map((t) => `- ${t.name}: Vos $${fmt(t.ownPrice)} vs ${t.competitor} $${fmt(t.compPrice)} (${t.diff.toFixed(1)}% mas caro)`).join("\n") || "Sin amenazas de precio significativas"}

OPORTUNIDADES (sos mas barato, potencial de subir precio):
${opportunities.slice(0, 10).map((o) => `- ${o.name}: Vos $${fmt(o.ownPrice)} vs ${o.competitor} $${fmt(o.compPrice)} (${o.diff.toFixed(1)}% mas barato — margen para subir)`).join("\n") || "Sin oportunidades claras"}`;
}

// ══════════════════════════════════════════════════════════════
// 8. FINANCIAL P&L
// ══════════════════════════════════════════════════════════════
export async function handleFinancialPnl(orgId: string, input: any): Promise<string> {
  const days = input.days || 30;
  const { now, start, prevStart } = dateRange(days);

  const [orders, ordersPrev, ads, manualCosts] = await Promise.all([
    prisma.order.findMany({ where: { organizationId: orgId, orderDate: { gte: start, lt: now }, status: { in: billable } } }),
    prisma.order.findMany({ where: { organizationId: orgId, orderDate: { gte: prevStart, lt: start }, status: { in: billable } } }),
    prisma.adMetricDaily.findMany({ where: { organizationId: orgId, date: { gte: start, lt: now } } }),
    prisma.manualCost.findMany({ where: { organizationId: orgId } }),
  ]);

  const rev = orders.reduce((s, o) => s + o.totalValue, 0);
  const revP = ordersPrev.reduce((s, o) => s + o.totalValue, 0);
  const revNeto = rev / 1.21; // Sin IVA
  const adSpend = ads.reduce((s, a) => s + a.spend, 0);

  // Breakdown by source
  const vtexOrders = orders.filter((o) => (o as any).source !== "MELI" && (o as any).source !== "mercadolibre");
  const meliOrders = orders.filter((o) => (o as any).source === "MELI" || (o as any).source === "mercadolibre");
  const vtexRev = vtexOrders.reduce((s, o) => s + o.totalValue, 0);
  const meliRev = meliOrders.reduce((s, o) => s + o.totalValue, 0);

  // Manual costs by category
  const costsByCategory = new Map<string, number>();
  for (const c of manualCosts) {
    const cat = c.category || "OTROS";
    costsByCategory.set(cat, (costsByCategory.get(cat) || 0) + Number(c.amount));
  }
  const totalManualCosts = [...costsByCategory.values()].reduce((s, v) => s + v, 0);
  const costsStr = [...costsByCategory.entries()].sort((a, b) => b[1] - a[1])
    .map(([cat, amount]) => `- ${cat}: $${fmt(amount)}`).join("\n");

  // Estimated P&L
  const meliCommission = meliRev * 0.13; // ~13% comision ML estimada
  const paymentFees = rev * 0.035; // ~3.5% medios de pago
  const estimatedCOGS = rev * 0.45; // Estimado si no hay costPrice
  const grossProfit = revNeto - estimatedCOGS;
  const opex = adSpend + totalManualCosts + meliCommission + paymentFees;
  const netIncome = grossProfit - opex;

  return `FINANZAS (${days}d):
REVENUE:
- Revenue bruto (con IVA): $${fmt(rev)} (anterior: $${fmt(revP)}, cambio: ${pct(rev, revP) !== null ? pct(rev, revP) + "%" : "N/A"})
- Revenue neto (sin IVA): $${fmt(revNeto)}
- VTEX (tienda): $${fmt(vtexRev)} (${vtexOrders.length} pedidos)
- MercadoLibre: $${fmt(meliRev)} (${meliOrders.length} pedidos)

P&L ESTIMADO:
- Revenue neto: $${fmt(revNeto)}
- COGS estimado (45%): -$${fmt(estimatedCOGS)}
- MARGEN BRUTO: $${fmt(grossProfit)} (${revNeto > 0 ? Math.round((grossProfit / revNeto) * 100) : 0}%)
- Publicidad: -$${fmt(adSpend)} (${revNeto > 0 ? Math.round((adSpend / revNeto) * 100) : 0}% del revenue)
- Comisiones ML: -$${fmt(meliCommission)}
- Medios de pago: -$${fmt(paymentFees)}
- Costos manuales: -$${fmt(totalManualCosts)}
${costsStr ? costsStr : "  (sin costos manuales cargados)"}
- RESULTADO NETO ESTIMADO: $${fmt(netIncome)} (${revNeto > 0 ? Math.round((netIncome / revNeto) * 100) : 0}%)

NOTA: COGS estimado al 45% porque no todos los productos tienen costo cargado. Para un P&L exacto, cargar costos reales en la seccion Finanzas > Costos.`;
}

// ══════════════════════════════════════════════════════════════
// 9. MERCADOLIBRE HEALTH
// ══════════════════════════════════════════════════════════════
export async function handleMercadolibreHealth(orgId: string): Promise<string> {
  const d30 = new Date(Date.now() - 30 * 86400000);

  const [listings, questions, sellerMetrics, commissions] = await Promise.all([
    prisma.mlListing.findMany({ where: { organizationId: orgId }, take: 500 }),
    prisma.mlQuestion.findMany({ where: { organizationId: orgId, createdAt: { gte: d30 } }, take: 500 }),
    prisma.mlSellerMetricDaily.findMany({ where: { organizationId: orgId, date: { gte: d30 } }, take: 30 }),
    prisma.mlCommission.findMany({ where: { organizationId: orgId, createdAt: { gte: d30 } }, take: 500 }),
  ]);

  const activeListings = listings.filter((l) => l.status === "active");
  const pausedListings = listings.filter((l) => l.status === "paused");
  const unanswered = questions.filter((q) => q.status === "UNANSWERED");
  const totalComm = commissions.reduce((s, c) => s + Number(c.amount || 0), 0);

  // Latest seller metrics
  const latest = sellerMetrics.sort((a, b) => b.date.getTime() - a.date.getTime())[0];

  return `MERCADOLIBRE:
- Publicaciones activas: ${activeListings.length} | Pausadas: ${pausedListings.length} | Total: ${listings.length}
- Preguntas recibidas (30d): ${questions.length} | Sin responder: ${unanswered.length}${unanswered.length > 0 ? " ⚠️ RESPONDER URGENTE" : ""}
- Comisiones pagadas (30d): $${fmt(totalComm)}

${latest ? `REPUTACION (ultimo dato):
- Ventas completadas: ${(latest as any).salesCompleted || "N/A"}
- Reclamos: ${(latest as any).claims || "N/A"}
- Envios demorados: ${(latest as any).delayedShipments || "N/A"}
- Cancelaciones: ${(latest as any).cancellations || "N/A"}` : "Sin datos de reputacion disponibles"}

${unanswered.length > 0 ? `\nPREGUNTAS SIN RESPONDER:\n${unanswered.slice(0, 10).map((q) => `- "${(q as any).text?.substring(0, 80) || "Sin texto"}..." (${q.createdAt.toISOString().split("T")[0]})`).join("\n")}` : ""}`;
}

// ══════════════════════════════════════════════════════════════
// 10. INFLUENCERS
// ══════════════════════════════════════════════════════════════
export async function handleInfluencersPerformance(orgId: string): Promise<string> {
  const d30 = new Date(Date.now() - 30 * 86400000);

  const [influencers, campaigns, attributions] = await Promise.all([
    prisma.influencer.findMany({ where: { organizationId: orgId, status: "ACTIVE" } }),
    prisma.influencerCampaign.findMany({ where: { organizationId: orgId, status: "ACTIVE" } }),
    prisma.influencerAttribution.findMany({
      where: { organizationId: orgId, createdAt: { gte: d30 } },
      include: { influencer: { select: { name: true } }, order: { select: { totalValue: true } } },
    }),
  ]);

  if (influencers.length === 0) return "No hay influencers activos en el programa. Activa el modulo Nitro Creators para empezar.";

  // Revenue by influencer
  const infMap = new Map<string, { name: string; rev: number; orders: number }>();
  for (const a of attributions) {
    const name = a.influencer?.name || "Unknown";
    const ex = infMap.get(a.influencerId) || { name, rev: 0, orders: 0 };
    ex.rev += a.order?.totalValue || 0;
    ex.orders++;
    infMap.set(a.influencerId, ex);
  }

  const totalRev = attributions.reduce((s, a) => s + (a.order?.totalValue || 0), 0);
  const topInf = [...infMap.entries()].sort((a, b) => b[1].rev - a[1].rev);

  return `INFLUENCERS (Nitro Creators):
- Influencers activos: ${influencers.length}
- Campanas activas: ${campaigns.length}
- Revenue atribuido (30d): $${fmt(totalRev)}
- Ordenes atribuidas (30d): ${attributions.length}

TOP INFLUENCERS POR REVENUE:
${topInf.slice(0, 10).map(([id, d], i) => `${i + 1}. ${d.name}: $${fmt(d.rev)} (${d.orders} ordenes)`).join("\n") || "Sin atribuciones aun"}`;
}

// ══════════════════════════════════════════════════════════════
// 11. PIXEL & ATTRIBUTION
// ══════════════════════════════════════════════════════════════
export async function handlePixelAttribution(orgId: string, input: any): Promise<string> {
  const days = input.days || 30;
  const focus = input.focus || "overview";
  const { now, start } = dateRange(days);

  const [attributions, events, visitors] = await Promise.all([
    prisma.pixelAttribution.findMany({
      where: { organizationId: orgId, createdAt: { gte: start, lt: now } },
      include: {
        order: { select: { totalValue: true, orderDate: true } },
      },
      take: 5000,
    }),
    prisma.pixelEvent.findMany({
      where: { organizationId: orgId, timestamp: { gte: start, lt: now } },
      select: {
        type: true, sessionId: true, deviceType: true, utmParams: true,
        clickIds: true, timestamp: true, pageUrl: true, referrer: true,
      },
      take: 20000,
    }),
    prisma.pixelVisitor.findMany({
      where: { organizationId: orgId, lastSeenAt: { gte: start } },
      select: {
        id: true, visitorId: true, totalSessions: true, totalPageViews: true,
        deviceTypes: true, clickIds: true, firstSeenAt: true, lastSeenAt: true,
        customerId: true,
      },
      take: 5000,
    }),
  ]);

  // ── Event breakdown ──
  const eventCounts: Record<string, number> = {};
  for (const e of events) {
    eventCounts[e.type] = (eventCounts[e.type] || 0) + 1;
  }
  const uniqueSessions = new Set(events.map((e) => e.sessionId)).size;

  // ── Device from events ──
  const deviceCounts: Record<string, number> = {};
  for (const e of events) {
    const d = e.deviceType || "unknown";
    deviceCounts[d] = (deviceCounts[d] || 0) + 1;
  }

  // ── Hour of day analysis ──
  const hourCounts: Record<number, number> = {};
  for (const e of events) {
    const h = new Date(e.timestamp).getHours();
    hourCounts[h] = (hourCounts[h] || 0) + 1;
  }
  const peakHour = Object.entries(hourCounts).sort((a, b) => Number(b[1]) - Number(a[1]))[0];

  let result = `PIXEL NITROSALES (${days}d):
- Eventos capturados: ${events.length.toLocaleString()}
- Sesiones únicas: ${uniqueSessions.toLocaleString()}
- Visitantes activos: ${visitors.length.toLocaleString()}
- Visitantes identificados (con customer): ${visitors.filter((v) => v.customerId).length}

EVENTOS POR TIPO:
${Object.entries(eventCounts).sort((a, b) => b[1] - a[1]).map(([type, count]) => `- ${type}: ${count.toLocaleString()}`).join("\n")}

DISPOSITIVOS (por eventos):
${Object.entries(deviceCounts).sort((a, b) => b[1] - a[1]).map(([d, c]) => `- ${d}: ${c.toLocaleString()} (${events.length > 0 ? Math.round((c / events.length) * 100) : 0}%)`).join("\n")}

HORA PICO DE ACTIVIDAD: ${peakHour ? `${peakHour[0]}hs (${peakHour[1]} eventos)` : "N/A"}
`;

  // ── Attribution analysis ──
  if (focus === "overview" || focus === "attribution") {
    const totalAttrRev = attributions.reduce((s, a) => s + Number(a.attributedValue || 0), 0);
    const avgTouchpoints = attributions.length > 0
      ? (attributions.reduce((s, a) => s + a.touchpointCount, 0) / attributions.length).toFixed(1)
      : "0";
    const avgConvLag = attributions.filter((a) => a.conversionLag !== null).length > 0
      ? (attributions.filter((a) => a.conversionLag !== null).reduce((s, a) => s + (a.conversionLag || 0), 0) / attributions.filter((a) => a.conversionLag !== null).length).toFixed(1)
      : "N/A";

    // By attribution model
    const byModel: Record<string, { count: number; rev: number }> = {};
    for (const a of attributions) {
      if (!byModel[a.model]) byModel[a.model] = { count: 0, rev: 0 };
      byModel[a.model].count++;
      byModel[a.model].rev += Number(a.attributedValue || 0);
    }

    // Assisted vs last-click
    const assisted = attributions.filter((a) => a.isAssisted);
    const assistedRev = assisted.reduce((s, a) => s + Number(a.assistedValue || 0), 0);

    result += `\nATRIBUCION:
- Ordenes con atribución pixel: ${attributions.length}
- Revenue atribuido total: $${fmt(totalAttrRev)}
- Touchpoints promedio por orden: ${avgTouchpoints}
- Conversion lag promedio: ${avgConvLag} días (primer contacto → compra)

POR MODELO DE ATRIBUCION:
${Object.entries(byModel).map(([model, d]) => `- ${model}: ${d.count} ordenes, $${fmt(d.rev)} revenue`).join("\n")}

ASISTENCIA:
- Conversiones asistidas: ${assisted.length} (touchpoints que ayudaron pero NO fueron ultimo click)
- Revenue asistido: $${fmt(assistedRev)}
`;
  }

  // ── Channel journeys ──
  if (focus === "overview" || focus === "journeys" || focus === "channels") {
    // Extract first touch and last touch from touchpoints
    const firstTouchChannels: Record<string, { count: number; rev: number }> = {};
    const lastTouchChannels: Record<string, { count: number; rev: number }> = {};

    for (const a of attributions) {
      const touchpoints = a.touchpoints as any[];
      if (!Array.isArray(touchpoints) || touchpoints.length === 0) continue;

      const first = touchpoints[0];
      const last = touchpoints[touchpoints.length - 1];
      const rev = Number(a.attributedValue || 0);

      const firstCh = `${first.source || "direct"}/${first.medium || "none"}`;
      const lastCh = `${last.source || "direct"}/${last.medium || "none"}`;

      if (!firstTouchChannels[firstCh]) firstTouchChannels[firstCh] = { count: 0, rev: 0 };
      firstTouchChannels[firstCh].count++;
      firstTouchChannels[firstCh].rev += rev;

      if (!lastTouchChannels[lastCh]) lastTouchChannels[lastCh] = { count: 0, rev: 0 };
      lastTouchChannels[lastCh].count++;
      lastTouchChannels[lastCh].rev += rev;
    }

    result += `\nCANALES DE DESCUBRIMIENTO (primer contacto — cómo te conocen):
${Object.entries(firstTouchChannels).sort((a, b) => b[1].count - a[1].count).slice(0, 10)
  .map(([ch, d]) => `- ${ch}: ${d.count} conversiones, $${fmt(d.rev)} revenue`).join("\n") || "Sin datos"}

CANALES DE CONVERSION (último click — con qué compran):
${Object.entries(lastTouchChannels).sort((a, b) => b[1].count - a[1].count).slice(0, 10)
  .map(([ch, d]) => `- ${ch}: ${d.count} conversiones, $${fmt(d.rev)} revenue`).join("\n") || "Sin datos"}
`;

    // Journey patterns (first → last)
    const journeyPatterns: Record<string, number> = {};
    for (const a of attributions) {
      const touchpoints = a.touchpoints as any[];
      if (!Array.isArray(touchpoints) || touchpoints.length < 2) continue;
      const first = touchpoints[0];
      const last = touchpoints[touchpoints.length - 1];
      const pattern = `${first.source || "direct"}/${first.medium || "none"} → ${last.source || "direct"}/${last.medium || "none"}`;
      journeyPatterns[pattern] = (journeyPatterns[pattern] || 0) + 1;
    }

    result += `\nRECORRIDOS MAS COMUNES (descubrimiento → compra):
${Object.entries(journeyPatterns).sort((a, b) => b[1] - a[1]).slice(0, 10)
  .map(([pattern, count]) => `- ${pattern}: ${count} conversiones`).join("\n") || "Sin datos suficientes (se necesitan ordenes con 2+ touchpoints)"}
`;
  }

  // ── UTM source analysis from events ──
  if (focus === "overview" || focus === "channels") {
    const utmSources: Record<string, number> = {};
    for (const e of events) {
      const utm = e.utmParams as any;
      if (utm && utm.source) {
        const key = `${utm.source}/${utm.medium || "none"}`;
        utmSources[key] = (utmSources[key] || 0) + 1;
      }
    }

    result += `\nFUENTES DE TRAFICO (pixel, por eventos):
${Object.entries(utmSources).sort((a, b) => b[1] - a[1]).slice(0, 15)
  .map(([src, count]) => `- ${src}: ${count.toLocaleString()} eventos`).join("\n") || "Sin UTMs capturados"}
`;
  }

  // ── Conversion lag distribution ──
  if (focus === "overview" || focus === "attribution") {
    const lagBuckets = { "Mismo día": 0, "1 día": 0, "2-3 días": 0, "4-7 días": 0, "8-14 días": 0, "15-30 días": 0, "30+ días": 0 };
    for (const a of attributions) {
      const lag = a.conversionLag;
      if (lag === null || lag === undefined) continue;
      if (lag === 0) lagBuckets["Mismo día"]++;
      else if (lag === 1) lagBuckets["1 día"]++;
      else if (lag <= 3) lagBuckets["2-3 días"]++;
      else if (lag <= 7) lagBuckets["4-7 días"]++;
      else if (lag <= 14) lagBuckets["8-14 días"]++;
      else if (lag <= 30) lagBuckets["15-30 días"]++;
      else lagBuckets["30+ días"]++;
    }

    result += `\nDISTRIBUCION DE CONVERSION LAG (días entre primer contacto y compra):
${Object.entries(lagBuckets).filter(([, c]) => c > 0).map(([bucket, count]) => `- ${bucket}: ${count} ordenes`).join("\n") || "Sin datos de conversion lag"}
`;
  }

  return result;
}

// ══════════════════════════════════════════════════════════════
// 12. AD CREATIVES
// ══════════════════════════════════════════════════════════════
export async function handleAdCreatives(orgId: string, input: any): Promise<string> {
  const days = input.days || 30;
  const platform = input.platform || "ALL";
  const { now, start, prevStart } = dateRange(days);

  const whereClause: any = { organizationId: orgId, date: { gte: start, lt: now } };
  const whereClausePrev: any = { organizationId: orgId, date: { gte: prevStart, lt: start } };

  const [creatives, metrics, metricsPrev, classifications] = await Promise.all([
    prisma.adCreative.findMany({
      where: {
        organizationId: orgId,
        ...(platform !== "ALL" ? { platform } : {}),
      },
      take: 500,
    }),
    prisma.adCreativeMetricDaily.findMany({
      where: whereClause,
      take: 10000,
    }),
    prisma.adCreativeMetricDaily.findMany({
      where: whereClausePrev,
      take: 10000,
    }),
    prisma.adCreativeClassification.findMany({
      where: { organizationId: orgId },
      take: 500,
    }),
  ]);

  if (creatives.length === 0) return "No hay datos de creatives publicitarios. Verifica que la sincronización de ads esté activa.";

  // Aggregate metrics by creative
  const creativeMap = new Map<string, { name: string; platform: string; spend: number; rev: number; clicks: number; impr: number; conv: number }>();
  const creativePrevMap = new Map<string, { spend: number; rev: number; clicks: number; impr: number }>();

  for (const c of creatives) {
    creativeMap.set(c.id, {
      name: (c as any).name || (c as any).title || c.id.substring(0, 12),
      platform: (c as any).platform || "UNKNOWN",
      spend: 0, rev: 0, clicks: 0, impr: 0, conv: 0,
    });
  }

  for (const m of metrics) {
    const ex = creativeMap.get(m.creativeId);
    if (ex) {
      ex.spend += m.spend || 0;
      ex.rev += m.conversionValue || 0;
      ex.clicks += m.clicks || 0;
      ex.impr += m.impressions || 0;
      ex.conv += m.conversions || 0;
    }
  }

  for (const m of metricsPrev) {
    const ex = creativePrevMap.get(m.creativeId) || { spend: 0, rev: 0, clicks: 0, impr: 0 };
    ex.spend += m.spend || 0;
    ex.rev += m.conversionValue || 0;
    ex.clicks += m.clicks || 0;
    ex.impr += m.impressions || 0;
    creativePrevMap.set(m.creativeId, ex);
  }

  // Sort by spend
  const sorted = [...creativeMap.entries()]
    .map(([id, d]) => ({
      id, ...d,
      roas: d.spend > 0 ? d.rev / d.spend : 0,
      ctr: d.impr > 0 ? (d.clicks / d.impr) * 100 : 0,
      cpa: d.conv > 0 ? d.spend / d.conv : 0,
    }))
    .filter((c) => c.spend > 0)
    .sort((a, b) => b.spend - a.spend);

  // Classification breakdown
  const classMap = new Map<string, string>();
  for (const cl of classifications) {
    classMap.set(cl.creativeId, (cl as any).type || (cl as any).classification || "UNCLASSIFIED");
  }

  const byType: Record<string, { count: number; spend: number; rev: number }> = {};
  for (const c of sorted) {
    const type = classMap.get(c.id) || "UNCLASSIFIED";
    if (!byType[type]) byType[type] = { count: 0, spend: 0, rev: 0 };
    byType[type].count++;
    byType[type].spend += c.spend;
    byType[type].rev += c.rev;
  }

  // Fatigue detection: creatives where CTR dropped vs previous period
  const fatigued = sorted.slice(0, 50).filter((c) => {
    const prev = creativePrevMap.get(c.id);
    if (!prev || prev.impr < 100) return false;
    const prevCtr = prev.impr > 0 ? (prev.clicks / prev.impr) * 100 : 0;
    return c.ctr < prevCtr * 0.7 && c.spend > 1000; // CTR dropped 30%+ with significant spend
  });

  // Top performers
  const topROAS = [...sorted].filter((c) => c.conv > 0).sort((a, b) => b.roas - a.roas).slice(0, 10);
  const worstROAS = [...sorted].filter((c) => c.spend > 1000).sort((a, b) => a.roas - b.roas).slice(0, 10);

  return `AD CREATIVES (${days}d${platform !== "ALL" ? ` — ${platform}` : ""}):
- Total creatives con gasto: ${sorted.length}
- Gasto total: $${fmt(sorted.reduce((s, c) => s + c.spend, 0))}
- Revenue total: $${fmt(sorted.reduce((s, c) => s + c.rev, 0))}

POR TIPO DE CREATIVE:
${Object.entries(byType).sort((a, b) => b[1].spend - a[1].spend)
  .map(([type, d]) => `- ${type}: ${d.count} creatives | Gasto $${fmt(d.spend)} | Rev $${fmt(d.rev)} | ROAS ${d.spend > 0 ? (d.rev / d.spend).toFixed(2) : "0"}x`)
  .join("\n") || "Sin clasificación"}

TOP 10 CREATIVES (mejor ROAS):
${topROAS.map((c, i) => `${i + 1}. ${c.name} (${c.platform}): ROAS ${c.roas.toFixed(2)}x | Gasto $${fmt(c.spend)} | Rev $${fmt(c.rev)} | CTR ${c.ctr.toFixed(2)}% | ${c.conv} conv`).join("\n")}

PEORES 10 CREATIVES (menor ROAS con gasto >$1000):
${worstROAS.map((c, i) => `${i + 1}. ${c.name} (${c.platform}): ROAS ${c.roas.toFixed(2)}x | Gasto $${fmt(c.spend)} | Rev $${fmt(c.rev)} | CTR ${c.ctr.toFixed(2)}%`).join("\n")}

${fatigued.length > 0 ? `\n⚠️ FATIGA CREATIVA DETECTADA (CTR cayó >30% vs periodo anterior):\n${fatigued.map((c) => {
  const prev = creativePrevMap.get(c.id)!;
  const prevCtr = prev.impr > 0 ? (prev.clicks / prev.impr) * 100 : 0;
  return `- ${c.name} (${c.platform}): CTR ${prevCtr.toFixed(2)}% → ${c.ctr.toFixed(2)}% (gasto $${fmt(c.spend)})`;
}).join("\n")}` : "Sin fatiga creativa detectada (buena señal)"}`;
}

// ══════════════════════════════════════════════════════════════
// DISPATCHER — Routes tool calls to handlers
// ══════════════════════════════════════════════════════════════
export async function executeToolCall(
  toolName: string,
  toolInput: any,
  orgId: string
): Promise<string> {
  try {
    switch (toolName) {
      case "get_sales_overview":
        return await handleSalesOverview(orgId, toolInput);
      case "get_products_inventory":
        return await handleProductsInventory(orgId, toolInput);
      case "get_ads_performance":
        return await handleAdsPerformance(orgId, toolInput);
      case "get_traffic_funnel":
        return await handleTrafficFunnel(orgId, toolInput);
      case "get_customers_ltv":
        return await handleCustomersLtv(orgId);
      case "get_seo_performance":
        return await handleSeoPerformance(orgId, toolInput);
      case "get_competitors_analysis":
        return await handleCompetitorsAnalysis(orgId);
      case "get_financial_pnl":
        return await handleFinancialPnl(orgId, toolInput);
      case "get_mercadolibre_health":
        return await handleMercadolibreHealth(orgId);
      case "get_influencers_performance":
        return await handleInfluencersPerformance(orgId);
      case "get_pixel_attribution":
        return await handlePixelAttribution(orgId, toolInput);
      case "get_ad_creatives":
        return await handleAdCreatives(orgId, toolInput);
      default:
        return `Tool "${toolName}" no reconocido.`;
    }
  } catch (error: any) {
    return `Error ejecutando ${toolName}: ${error.message}`;
  }
}
