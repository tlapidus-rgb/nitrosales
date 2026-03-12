import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Sos NitroBot, el motor de inteligencia estrategica de NitroSales.
Operas como un equipo de elite combinando: CMO + Head of Growth + Consultor McKinsey + Data Scientist + CRO Specialist.
Tu cliente es "El Mundo del Juguete", ecommerce de juguetes en Argentina (moneda: ARS).

=== IDENTIDAD Y MENTALIDAD ===
Pensas como un consultor de growth de USD 10.000/mes. Cada respuesta debe justificar ese fee.
NO sos un chatbot generico. Sos un estratega que ve lo que otros no ven.
Tu obsesion: convertir datos en dinero. Cada insight debe tener un camino claro a mas revenue.

=== FRAMEWORKS ANALITICOS QUE USAS ===
1. PIRATE METRICS (AARRR): Acquisition > Activation > Retention > Revenue > Referral
2. ICE SCORING: Impact (1-10) x Confidence (1-10) x Ease (1-10) para priorizar acciones
3. PARETO 80/20: Siempre identificar el 20% que genera el 80% del resultado
4. UNIT ECONOMICS: CAC, LTV, LTV/CAC ratio, payback period, contribution margin
5. FUNNEL ANALYSIS: Medir cada paso, detectar la mayor caida, atacar primero ahi
6. COHORT THINKING: Nuevos vs recurrentes, comportamiento por segmento

=== ESTRUCTURA DE RESPUESTA (SIEMPRE SEGUIR) ===
Toda respuesta DEBE tener estos 4 bloques:

1. DIAGNOSTICO - Que esta pasando realmente (no lo obvio, la causa raiz)
   Usa datos concretos. Compara vs periodo anterior. Detecta anomalias.

2. INSIGHTS - Hallazgos estrategicos que el usuario NO esta viendo
   Minimo 3 insights. Cada uno debe revelar un patron, correlacion o causa raiz.
   Pensa: que diria un analista de Goldman Sachs mirando estos datos?

3. OPORTUNIDADES - Donde esta el mayor potencial de mejora
   Minimo 3 oportunidades rankeadas por impacto (usa ICE scoring mental).
   Se especifico: "Subir ROAS de Meta de 16x a 20x reasignando $X de campana Y a Z"

4. PLAN DE ACCION - Pasos concretos, con prioridad y timeline
   Minimo 3 acciones. Cada una con: que hacer, como, cuando, resultado esperado.
   Formato: [PRIORIDAD ALTA/MEDIA/BAJA] Accion > Implementacion > KPI objetivo

=== TIPOS DE ANALISIS QUE DOMINAS ===
- Cuellos de botella en conversion (donde se pierde mas plata)
- Eficiencia de gasto publicitario (redistribucion de budget)
- Optimizacion de mix de productos (heroes, villanos, oportunidades)
- Analisis de pricing y ticket promedio (elasticidad, bundles, upsell)
- Diagnostico de trafico (calidad de fuentes, intent, device gap)
- Deteccion de anomalias (picos, caidas, cambios de tendencia)
- Estrategias de retention y LTV (remarketing, email, loyalty)
- CRO: checkout friction, landing page optimization, copy/creative
- Psicologia de compra: urgencia, escasez, social proof, anchoring

=== BENCHMARKS DE INDUSTRIA (ecommerce retail Argentina) ===
- Conversion rate bueno: 1.5-3% | Excelente: >3%
- ROAS bueno: 4-8x | Excelente: >10x | Excepcional: >15x
- CTR Search bueno: 3-5% | Shopping: 1-2% | Social: 0.8-1.5%
- CPC promedio retail AR: $50-150 ARS
- Bounce rate bueno: <45% | Malo: >60%
- Cart abandonment promedio: 70% | Bueno: <65%
- Email open rate bueno: 20-25% | CTR: 2-4%
- Ticket promedio jugueteria: variable segun temporada

=== REGLAS INQUEBRANTABLES ===
1. NUNCA inventes numeros. Solo usa datos del contexto. Si no hay dato, decilo.
2. Habla en espanol rioplatense (vos, tenes, podes). Directo, sin rodeos.
3. NUNCA des respuestas genericas de manual. Si suena a articulo de blog, reescribilo.
4. Cada insight debe conectar causa > efecto > accion > resultado esperado.
5. Siempre compara vs periodo anterior Y vs benchmarks de industria.
6. Si detectas algo urgente, arranca con ALERTA antes de la estructura.
7. Responde en el idioma en que te pregunten.
8. Cuando falten datos: formula hipotesis y pregunta inteligente para validar.
9. Siempre agrega valor extra que el usuario no pidio pero necesita.
10. Prioriza por impacto en revenue. No pierdas tiempo en mejoras del 1%.

=== PERSONALIDAD ===
- Estrategico pero practico (no teoria, acciones)
- Directo pero no agresivo (decis la verdad aunque duela)
- Ambicioso (siempre buscas el proximo 10x, no el proximo 5%)
- Data-driven pero con intuicion de negocio
- Creativo en soluciones, riguroso en analisis`;

async function buildMetricsContext(orgId: string): Promise<string> {
  const now = new Date();
  const d30 = new Date(now.getTime() - 30*86400000);
  const d60 = new Date(now.getTime() - 60*86400000);
  const d7 = new Date(now.getTime() - 7*86400000);
  const d14 = new Date(now.getTime() - 14*86400000);

  const [
    orders30, ordersPrev, orders7, orders14,
    web30, webPrev,
    ads30, adsPrev,
    orderItems,
    campaigns,
    webSources,
    funnel30, funnelPrev,
    customers
  ] = await Promise.all([
    prisma.order.findMany({ where: { organizationId: orgId, orderDate: { gte: d30, lt: now } } }),
    prisma.order.findMany({ where: { organizationId: orgId, orderDate: { gte: d60, lt: d30 } } }),
    prisma.order.findMany({ where: { organizationId: orgId, orderDate: { gte: d7, lt: now } } }),
    prisma.order.findMany({ where: { organizationId: orgId, orderDate: { gte: d14, lt: d7 } } }),
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
    prisma.funnelDaily.findMany({ where: { organizationId: orgId, date: { gte: d30, lt: now } } }),
    prisma.funnelDaily.findMany({ where: { organizationId: orgId, date: { gte: d60, lt: d30 } } }),
    prisma.customer.findMany({
      where: { organizationId: orgId },
      orderBy: { totalSpent: "desc" },
      take: 100
    })
  ]);

  // === VENTAS ===
  const bill = ["INVOICED", "SHIPPED", "DELIVERED"];
  const c30 = orders30.filter(o => bill.includes(o.status));
  const p30 = ordersPrev.filter(o => bill.includes(o.status));
  const l7 = orders7.filter(o => bill.includes(o.status));
  const pw7 = orders14.filter(o => bill.includes(o.status));
  const canc = orders30.filter(o => o.status === "CANCELLED");

  const rev = c30.reduce((s,o) => s+o.totalValue, 0);
  const revP = p30.reduce((s,o) => s+o.totalValue, 0);
  const rev7 = l7.reduce((s,o) => s+o.totalValue, 0);
  const rev7P = pw7.reduce((s,o) => s+o.totalValue, 0);
  const pct = (c: number, p: number) => p > 0 ? Math.round(((c-p)/p)*100) : null;
  const revCh = pct(rev, revP);
  const rev7Ch = pct(rev7, rev7P);
  const avgT = c30.length > 0 ? Math.round(rev/c30.length) : 0;
  const avgTP = p30.length > 0 ? Math.round(revP/p30.length) : 0;
  const cancRate = orders30.length > 0 ? ((canc.length/orders30.length)*100).toFixed(1) : "0";

  // === DEVICE BREAKDOWN ===
  const deviceMap: Record<string, {orders: number; rev: number}> = {};
  for (const o of c30) {
    const d = o.deviceType || "unknown";
    if (!deviceMap[d]) deviceMap[d] = {orders:0, rev:0};
    deviceMap[d].orders++;
    deviceMap[d].rev += o.totalValue;
  }
  const deviceStr = Object.entries(deviceMap).map(([d,v]) => d+": "+v.orders+" pedidos ($"+Math.round(v.rev).toLocaleString()+")").join(" | ");

  // === TRAFICO ===
  const sess = web30.reduce((s,w) => s+w.sessions, 0);
  const sessP = webPrev.reduce((s,w) => s+w.sessions, 0);
  const users = web30.reduce((s,w) => s+w.users, 0);
  const br = web30.length > 0 ? (web30.reduce((s,w) => s+(w.bounceRate||0), 0)/web30.length).toFixed(1) : "N/A";
  const avgDur = web30.length > 0 ? (web30.reduce((s,w) => s+(w.avgSessionDuration||0), 0)/web30.length).toFixed(0) : "N/A";

  // Device traffic
  const devSess: Record<string, number> = {};
  for (const w of web30) {
    const d = w.deviceCategory || "unknown";
    devSess[d] = (devSess[d]||0) + w.sessions;
  }
  const devSessStr = Object.entries(devSess).sort((a,b)=>b[1]-a[1]).map(([d,s])=>d+": "+s).join(" | ");

  // === PUBLICIDAD ===
  const spend = ads30.reduce((s,a) => s+a.spend, 0);
  const spendP = adsPrev.reduce((s,a) => s+a.spend, 0);
  const adRev = ads30.reduce((s,a) => s+a.conversionValue, 0);
  const adRevP = adsPrev.reduce((s,a) => s+a.conversionValue, 0);
  const impr = ads30.reduce((s,a) => s+a.impressions, 0);
  const clk = ads30.reduce((s,a) => s+a.clicks, 0);
  const conv = ads30.reduce((s,a) => s+a.conversions, 0);
  const convP = adsPrev.reduce((s,a) => s+a.conversions, 0);

  const gA = ads30.filter(a => a.platform==="GOOGLE");
  const mA = ads30.filter(a => a.platform==="META");
  const gS=gA.reduce((s,a)=>s+a.spend,0), mS=mA.reduce((s,a)=>s+a.spend,0);
  const gR=gA.reduce((s,a)=>s+a.conversionValue,0), mR=mA.reduce((s,a)=>s+a.conversionValue,0);
  const gC=gA.reduce((s,a)=>s+a.clicks,0), mC=mA.reduce((s,a)=>s+a.clicks,0);
  const gCv=gA.reduce((s,a)=>s+a.conversions,0), mCv=mA.reduce((s,a)=>s+a.conversions,0);
  const gI=gA.reduce((s,a)=>s+a.impressions,0), mI=mA.reduce((s,a)=>s+a.impressions,0);

  const roas = spend > 0 ? (adRev/spend).toFixed(2) : "N/A";
  const roasP = spendP > 0 ? (adRevP/spendP).toFixed(2) : "N/A";

  // === FUNNEL ===
  const fVis = funnel30.reduce((s,f)=>s+f.visitors,0);
  const fPV = funnel30.reduce((s,f)=>s+f.productViews,0);
  const fATC = funnel30.reduce((s,f)=>s+f.addToCarts,0);
  const fCO = funnel30.reduce((s,f)=>s+f.checkoutStarts,0);
  const fPur = funnel30.reduce((s,f)=>s+f.purchases,0);
  const fVisP = funnelPrev.reduce((s,f)=>s+f.visitors,0);
  const fPurP = funnelPrev.reduce((s,f)=>s+f.purchases,0);

  const funnelStr = fVis > 0 ? `
FUNNEL DE CONVERSION (30d):
- Visitantes: ${fVis.toLocaleString()}
- Vieron producto: ${fPV.toLocaleString()} (${(fPV/fVis*100).toFixed(1)}% de visitantes)
- Add to cart: ${fATC.toLocaleString()} (${(fATC/fVis*100).toFixed(1)}% | dropoff producto>carrito: ${fPV>0?((1-fATC/fPV)*100).toFixed(1):"N/A"}%)
- Inicio checkout: ${fCO.toLocaleString()} (${(fCO/fVis*100).toFixed(1)}% | dropoff carrito>checkout: ${fATC>0?((1-fCO/fATC)*100).toFixed(1):"N/A"}%)
- Compras: ${fPur.toLocaleString()} (${(fPur/fVis*100).toFixed(2)}% | dropoff checkout>compra: ${fCO>0?((1-fPur/fCO)*100).toFixed(1):"N/A"}%)
- MAYOR CUELLO DE BOTELLA: ${(() => {
    const drops = [];
    if (fPV>0) drops.push({step:"Producto > Carrito", rate: 1-fATC/fPV, lost: fPV-fATC});
    if (fATC>0) drops.push({step:"Carrito > Checkout", rate: 1-fCO/fATC, lost: fATC-fCO});
    if (fCO>0) drops.push({step:"Checkout > Compra", rate: 1-fPur/fCO, lost: fCO-fPur});
    const worst = drops.sort((a,b)=>b.rate-a.rate)[0];
    return worst ? worst.step+" ("+Math.round(worst.rate*100)+"% abandono, "+worst.lost.toLocaleString()+" usuarios perdidos)" : "N/A";
  })()}
- Periodo anterior: ${fVisP.toLocaleString()} visitantes > ${fPurP.toLocaleString()} compras (${fVisP>0?(fPurP/fVisP*100).toFixed(2):"0"}%)
` : "";

  // === TOP PRODUCTS ===
  const prodMap = new Map<string, {revenue: number; qty: number; category: string}>();
  for (const item of orderItems) {
    const name = item.product?.name || "Sin nombre";
    const cat = item.product?.category || "Sin categoria";
    const ex = prodMap.get(name) || {revenue:0, qty:0, category: cat};
    ex.revenue += item.totalPrice;
    ex.qty += item.quantity;
    prodMap.set(name, ex);
  }
  const sortedProds = [...prodMap.entries()].sort((a,b) => b[1].revenue - a[1].revenue);
  const topProds = sortedProds.slice(0, 15).map(([n,d],i) =>
    (i+1)+". "+n+" ["+d.category+"]: $"+Math.round(d.revenue).toLocaleString()+" ("+d.qty+" uds, ticket unit $"+Math.round(d.revenue/d.qty)+")"
  ).join("\n");

  // Category analysis
  const catMap = new Map<string, {revenue: number; qty: number; products: number}>();
  for (const [n, d] of prodMap.entries()) {
    const ex = catMap.get(d.category) || {revenue:0, qty:0, products:0};
    ex.revenue += d.revenue;
    ex.qty += d.qty;
    ex.products++;
    catMap.set(d.category, ex);
  }
  const catStr = [...catMap.entries()].sort((a,b)=>b[1].revenue-a[1].revenue)
    .map(([c,d]) => c+": $"+Math.round(d.revenue).toLocaleString()+" ("+d.qty+" uds, "+d.products+" SKUs)")
    .join("\n");

  // Product concentration (Pareto)
  const totalProdRev = sortedProds.reduce((s,p) => s+p[1].revenue, 0);
  let cumRev = 0;
  let pareto20pct = Math.ceil(sortedProds.length * 0.2);
  const top20rev = sortedProds.slice(0, pareto20pct).reduce((s,p) => s+p[1].revenue, 0);
  const paretoStr = "Top "+pareto20pct+" productos (20%) generan "+Math.round(top20rev/totalProdRev*100)+"% del revenue";

  // === CAMPAIGNS (detailed) ===
  const campData = campaigns.map(c => {
    const m = c.dailyMetrics;
    const cs=m.reduce((s,x)=>s+x.spend,0), cr=m.reduce((s,x)=>s+x.conversionValue,0);
    const cc=m.reduce((s,x)=>s+x.clicks,0), cn=m.reduce((s,x)=>s+x.conversions,0);
    const ci=m.reduce((s,x)=>s+x.impressions,0);
    const roas = cs > 0 ? cr/cs : 0;
    const cpa = cn > 0 ? cs/cn : 0;
    const ctr = ci > 0 ? (cc/ci)*100 : 0;
    return { name: c.name, platform: c.platform, spend: cs, rev: cr, clicks: cc, conv: cn, impr: ci, roas, cpa, ctr };
  }).sort((a,b) => b.spend - a.spend);

  const campStr = campData.slice(0,12).map((c,i) =>
    (i+1)+". "+c.name+" ("+c.platform+"): Gasto $"+Math.round(c.spend).toLocaleString()+
    " | Rev $"+Math.round(c.rev).toLocaleString()+
    " | ROAS "+c.roas.toFixed(2)+"x"+
    " | CPA $"+Math.round(c.cpa).toLocaleString()+
    " | CTR "+c.ctr.toFixed(2)+"%"+
    " | "+c.conv+" conv"
  ).join("\n");

  // Campaign efficiency analysis
  const goodCamps = campData.filter(c => c.roas > 10 && c.spend > 0);
  const badCamps = campData.filter(c => c.roas < 3 && c.spend > 1000);
  const campAnalysis = "Campanas ROAS>10x: "+goodCamps.length+" ($"+Math.round(goodCamps.reduce((s,c)=>s+c.spend,0)).toLocaleString()+" invertidos)\n"+
    "Campanas ROAS<3x: "+badCamps.length+" ($"+Math.round(badCamps.reduce((s,c)=>s+c.spend,0)).toLocaleString()+" invertidos - OPORTUNIDAD DE REASIGNAR)";

  // === CUSTOMERS ===
  const totalCust = customers.length;
  const repeatCust = customers.filter(c => c.totalOrders > 1).length;
  const topCustomers = customers.slice(0,5).map((c,i) =>
    (i+1)+". "+(c.firstName||"")+" "+(c.lastName||"")+": "+c.totalOrders+" pedidos, $"+Math.round(c.totalSpent).toLocaleString()+" LTV"
  ).join("\n");
  const avgLTV = totalCust > 0 ? Math.round(customers.reduce((s,c)=>s+c.totalSpent,0)/totalCust) : 0;

  // === DAILY TRENDS (last 7 days) ===
  const dayMap = new Map<string, {rev: number; orders: number}>();
  for (const o of l7) {
    if (!bill.includes(o.status)) continue;
    const day = o.orderDate.toISOString().split("T")[0];
    const ex = dayMap.get(day) || {rev:0, orders:0};
    ex.rev += o.totalValue;
    ex.orders++;
    dayMap.set(day, ex);
  }
  const dailyTrend = [...dayMap.entries()].sort().map(([d,v]) =>
    d+": $"+Math.round(v.rev).toLocaleString()+" ("+v.orders+" pedidos)"
  ).join("\n");

  // === PRE-COMPUTED STRATEGIC ANALYSIS ===
  const convR = sess > 0 ? ((c30.length/sess)*100).toFixed(2) : "N/A";
  const cpa30 = conv > 0 ? Math.round(spend/conv) : 0;
  const ltvcac = avgLTV > 0 && cpa30 > 0 ? (avgLTV/cpa30).toFixed(1) : "N/A";

  const preAnalysis = `
=== PRE-ANALISIS ESTRATEGICO (computado server-side) ===
UNIT ECONOMICS:
- CAC (costo adquisicion): $${cpa30.toLocaleString()} | LTV promedio: $${avgLTV.toLocaleString()} | LTV/CAC ratio: ${ltvcac}x
- Ticket promedio actual: $${avgT.toLocaleString()} (anterior: $${avgTP.toLocaleString()}, cambio: ${pct(avgT, avgTP) !== null ? pct(avgT, avgTP)+"%" : "N/A"})

EFICIENCIA PUBLICITARIA:
- Costo por $1 de revenue: $${spend > 0 && rev > 0 ? (spend/rev*100).toFixed(1)+"%" : "N/A"} del revenue va a ads
- Google vs Meta efficiency: Google ROAS ${gS>0?(gR/gS).toFixed(2):"N/A"}x vs Meta ROAS ${mS>0?(mR/mS).toFixed(2):"N/A"}x
- Budget split: Google ${spend>0?Math.round(gS/spend*100):"0"}% vs Meta ${spend>0?Math.round(mS/spend*100):"0"}%
- Si rebalanceas 20% del budget de la plataforma con menor ROAS a la de mayor ROAS, revenue estimado extra: ~$${spend > 0 ? Math.round(Math.abs(gR/gS - mR/mS) * spend * 0.04).toLocaleString() : "N/A"}

VELOCIDAD DE CRECIMIENTO:
- Semana actual vs anterior: Revenue ${rev7Ch !== null ? (rev7Ch > 0 ? "+":"")+rev7Ch+"%" : "N/A"} | Pedidos ${pct(l7.length, pw7.length) !== null ? (pct(l7.length,pw7.length)! > 0 ? "+":"")+(pct(l7.length,pw7.length))+"%" : "N/A"}
- Tasa cancelacion: ${cancRate}% (${canc.length} cancelados de ${orders30.length} totales)

CONCENTRACION:
- ${paretoStr}
- Clientes recurrentes: ${repeatCust} de ${totalCust} (${totalCust > 0 ? Math.round(repeatCust/totalCust*100)+"%" : "N/A"})
`;

  const sources = webSources.map(s => (s.source||"direct")+"/"+(s.medium||"none")+": "+(s._sum.sessions||0)+" ses, "+(s._sum.users||0)+" users").join("\n");

  return `
--- DATOS EN VIVO: EL MUNDO DEL JUGUETE (${now.toISOString().split("T")[0]}) ---

VENTAS (30 dias):
- Revenue: $${Math.round(rev).toLocaleString()} (${revCh!==null ? (revCh>0?"+":"")+revCh+"% vs periodo anterior" : "primer periodo"})
- Pedidos facturados: ${c30.length} (anterior: ${p30.length})
- Ticket promedio: $${avgT.toLocaleString()} (anterior: $${avgTP.toLocaleString()})
- Cancelados: ${canc.length} ordenes ($${Math.round(canc.reduce((s,o)=>s+o.totalValue,0)).toLocaleString()}) - tasa: ${cancRate}%
- Dispositivos: ${deviceStr || "Sin datos"}

TENDENCIA DIARIA (ultimos 7 dias):
${dailyTrend || "Sin datos diarios"}

TOP 15 PRODUCTOS (30d con categoria y ticket unitario):
${topProds || "Sin datos"}

CATEGORIAS:
${catStr || "Sin datos"}
${paretoStr}

PUBLICIDAD (30d):
- Inversion total: $${Math.round(spend).toLocaleString()} (anterior: $${Math.round(spendP).toLocaleString()}, cambio: ${pct(spend,spendP)!==null ? pct(spend,spendP)+"%" : "N/A"})
- Revenue publicitario: $${Math.round(adRev).toLocaleString()} (anterior: $${Math.round(adRevP).toLocaleString()})
- ROAS global: ${roas}x (anterior: ${roasP}x)
- CPA: $${conv>0?Math.round(spend/conv).toLocaleString():"N/A"} | CTR: ${impr>0?((clk/impr)*100).toFixed(2):"N/A"}% | CPC: $${clk>0?Math.round(spend/clk).toLocaleString():"N/A"}
- Conversiones: ${conv} (anterior: ${convP})
- Impresiones: ${impr.toLocaleString()} | Clicks: ${clk.toLocaleString()}

GOOGLE ADS: Gasto $${Math.round(gS).toLocaleString()} | Rev $${Math.round(gR).toLocaleString()} | ROAS ${gS>0?(gR/gS).toFixed(2):"0"}x | CPA $${gCv>0?Math.round(gS/gCv).toLocaleString():"N/A"} | CTR ${gI>0?((gC/gI)*100).toFixed(2):"0"}% | ${gCv} conv
META ADS: Gasto $${Math.round(mS).toLocaleString()} | Rev $${Math.round(mR).toLocaleString()} | ROAS ${mS>0?(mR/mS).toFixed(2):"0"}x | CPA $${mCv>0?Math.round(mS/mCv).toLocaleString():"N/A"} | CTR ${mI>0?((mC/mI)*100).toFixed(2):"0"}% | ${mCv} conv

CAMPANAS TOP 12 (detalle completo):
${campStr || "Sin campanas activas"}

${campAnalysis}

${funnelStr}

TRAFICO WEB (GA4, 30d):
- Sesiones: ${sess.toLocaleString()} (${pct(sess,sessP)!==null ? (pct(sess,sessP)!>0?"+":"")+(pct(sess,sessP))+"% vs anterior" : ""})
- Usuarios: ${users.toLocaleString()} | Bounce: ${br}% | Duracion promedio: ${avgDur}s
- Conversion rate (pedidos/sesiones): ${convR}%
- Sesiones por dispositivo: ${devSessStr || "Sin datos"}
- Fuentes de trafico:
${sources || "Sin datos"}

CLIENTES:
- Total en DB: ${totalCust} | Recurrentes (>1 compra): ${repeatCust} (${totalCust>0?Math.round(repeatCust/totalCust*100):"0"}%)
- LTV promedio: $${avgLTV.toLocaleString()}
- Top 5 clientes por LTV:
${topCustomers || "Sin datos"}

${preAnalysis}
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
      metricsContext = "\n[Error cargando metricas: " + e.message + ". Responde con lo que puedas y sugeri revisar la conexion de datos.]";
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
      max_tokens: 4000,
      system: SYSTEM_PROMPT + metricsContext,
      messages,
    });

    const reply = response.content[0].type === "text" ? response.content[0].text : "No pude generar una respuesta.";
    return NextResponse.json({ reply });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
