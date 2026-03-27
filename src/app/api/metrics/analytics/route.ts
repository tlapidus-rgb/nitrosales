import { NextResponse } from "next/server";
import * as crypto from "crypto";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

// ══════════════════════════════════════════════════════════════
// Analytics API — GA4 Data for Ecommerce Dashboard
// Fetches geographic, product, search, traffic, landing page,
// hourly, new-vs-returning data directly from GA4 API.
// ══════════════════════════════════════════════════════════════

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
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=" + createJWT(sa),
  });
  const data = await res.json();
  return data.access_token;
}

// Helper: run a GA4 report
async function runReport(
  propertyId: string,
  token: string,
  dimensions: string[],
  metrics: string[],
  startDate: string,
  endDate: string,
  opts?: { limit?: number; orderBy?: { metric: string; desc?: boolean }; dimensionFilter?: any }
) {
  const body: any = {
    dateRanges: [{ startDate, endDate }],
    dimensions: dimensions.map((name) => ({ name })),
    metrics: metrics.map((name) => ({ name })),
  };
  if (opts?.limit) body.limit = String(opts.limit);
  if (opts?.orderBy) {
    body.orderBys = [{ metric: { metricName: opts.orderBy.metric }, desc: opts.orderBy.desc ?? true }];
  }
  if (opts?.dimensionFilter) body.dimensionFilter = opts.dimensionFilter;

  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.rows || [];
}

// Parse helpers
const str = (row: any, idx: number) => row.dimensionValues?.[idx]?.value || "";
const num = (row: any, idx: number) => parseInt(row.metricValues?.[idx]?.value || "0");
const flt = (row: any, idx: number) => parseFloat(row.metricValues?.[idx]?.value || "0");

export async function GET(req: Request) {
  try {
    const org = await getOrganization(); // auth check

    const url = new URL(req.url);
    const startDate = url.searchParams.get("from") || "";
    const endDate = url.searchParams.get("to") || "";
    if (!startDate || !endDate) {
      return NextResponse.json({ error: "from and to required" }, { status: 400 });
    }

    const saJson = process.env.GA4_SERVICE_ACCOUNT_KEY;
    const propertyId = process.env.GA4_PROPERTY_ID;
    if (!saJson || !propertyId) {
      return NextResponse.json({ error: "Missing GA4 config" }, { status: 400 });
    }

    const token = await getAccessToken(JSON.parse(saJson));
    if (!token) {
      return NextResponse.json({ error: "GA4 auth failed" }, { status: 401 });
    }

    // ── 11 GA4 API calls in parallel ──
    const [geoRows, productRows, searchRows, trafficRows, landingRows, hourlyRows, dowRows, nvrRows, dailyFunnelRows, categoryRows, brandRows] = await Promise.all([
      // 1. Geographic
      runReport(propertyId, token, ["region", "city"], ["sessions", "ecommercePurchases", "purchaseRevenue", "totalUsers"], startDate, endDate, { limit: 30, orderBy: { metric: "sessions" } }),
      // 2. Products (views vs purchases) — full catalog with category+brand
      runReport(propertyId, token, ["itemName", "itemId", "itemCategory", "itemBrand"], ["itemsViewed", "itemsPurchased", "itemRevenue"], startDate, endDate, { limit: 10000, orderBy: { metric: "itemsViewed" } }),
      // 3. Internal searches
      runReport(propertyId, token, ["searchTerm"], ["eventCount"], startDate, endDate, { limit: 20, orderBy: { metric: "eventCount" } }),
      // 4. Traffic sources with revenue
      runReport(propertyId, token, ["sessionSource", "sessionMedium"], ["sessions", "totalUsers", "ecommercePurchases", "purchaseRevenue"], startDate, endDate, { orderBy: { metric: "purchaseRevenue" } }),
      // 5. Landing pages
      runReport(propertyId, token, ["landingPage"], ["sessions", "bounceRate", "ecommercePurchases", "purchaseRevenue"], startDate, endDate, { limit: 15, orderBy: { metric: "sessions" } }),
      // 6a. Hourly pattern
      runReport(propertyId, token, ["hour"], ["sessions", "ecommercePurchases"], startDate, endDate),
      // 6b. Day of week pattern
      runReport(propertyId, token, ["dayOfWeek"], ["sessions", "ecommercePurchases"], startDate, endDate),
      // 7. New vs returning
      runReport(propertyId, token, ["newVsReturning"], ["sessions", "totalUsers", "ecommercePurchases", "purchaseRevenue"], startDate, endDate),
      // 8. User-scoped funnel: unique users per funnel event (not event counts)
      runReport(propertyId, token, ["eventName"], ["totalUsers"], startDate, endDate, {
        dimensionFilter: {
          orGroup: {
            expressions: [
              { filter: { fieldName: "eventName", stringFilter: { value: "add_to_cart" } } },
              { filter: { fieldName: "eventName", stringFilter: { value: "begin_checkout" } } },
              { filter: { fieldName: "eventName", stringFilter: { value: "purchase" } } },
            ],
          },
        },
      }),
      // 9. Category conversion (products viewed vs purchased by category)
      runReport(propertyId, token, ["itemCategory"], ["itemsViewed", "itemsPurchased", "itemRevenue"], startDate, endDate, { limit: 30, orderBy: { metric: "itemsViewed" } }),
      // 10. Brand conversion (products viewed vs purchased by brand)
      runReport(propertyId, token, ["itemBrand"], ["itemsViewed", "itemsPurchased", "itemRevenue"], startDate, endDate, { limit: 30, orderBy: { metric: "itemsViewed" } }),
    ]);

    // ── Transform results ──
    const geographic = geoRows.map((r: any) => ({
      region: str(r, 0), city: str(r, 1),
      sessions: num(r, 0), purchases: num(r, 1), revenue: flt(r, 2), users: num(r, 3),
    }));

    // Build products with category+brand from GA4
    const rawProducts = productRows.map((r: any) => ({
      name: str(r, 0), id: str(r, 1), category: str(r, 2), brand: str(r, 3),
      views: num(r, 0), purchases: num(r, 1), revenue: flt(r, 2),
      viewToPurchaseRate: num(r, 0) > 0 ? Math.round((num(r, 1) / num(r, 0)) * 10000) / 100 : 0,
      imageUrl: null as string | null,
    }));

    // Look up product images from DB (match by externalId = GA4 itemId)
    const productIds = rawProducts.map((p: any) => p.id).filter(Boolean);
    let imageMap: Record<string, string> = {};
    if (productIds.length > 0) {
      try {
        const dbProducts = await prisma.product.findMany({
          where: { organizationId: org.id, externalId: { in: productIds } },
          select: { externalId: true, imageUrl: true },
        });
        for (const dp of dbProducts) {
          if (dp.imageUrl) imageMap[dp.externalId] = dp.imageUrl;
        }
      } catch { /* non-fatal */ }
    }

    const products = rawProducts.map((p: any) => ({
      ...p,
      imageUrl: imageMap[p.id] || null,
    }));

    const searches = searchRows.map((r: any) => ({
      term: str(r, 0), count: num(r, 0),
    })).filter((s: any) => s.term && s.term !== "(not set)" && !s.term.startsWith("/"));

    const trafficRevenue = trafficRows.map((r: any) => ({
      source: str(r, 0), medium: str(r, 1),
      sessions: num(r, 0), users: num(r, 1), purchases: num(r, 2), revenue: flt(r, 3),
      revenuePerSession: num(r, 0) > 0 ? Math.round((flt(r, 3) / num(r, 0)) * 100) / 100 : 0,
      conversionRate: num(r, 0) > 0 ? Math.round((num(r, 2) / num(r, 0)) * 10000) / 100 : 0,
    }));

    const landingPages = landingRows.map((r: any) => ({
      path: str(r, 0), sessions: num(r, 0), bounceRate: Math.round(flt(r, 1) * 100) / 100,
      purchases: num(r, 2), revenue: flt(r, 3),
    }));

    const hourly = hourlyRows.map((r: any) => ({
      hour: parseInt(str(r, 0)), sessions: num(r, 0), purchases: num(r, 1),
    })).sort((a: any, b: any) => a.hour - b.hour);

    const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const dayOfWeek = dowRows.map((r: any) => ({
      day: parseInt(str(r, 0)), dayName: DAY_NAMES[parseInt(str(r, 0))] || str(r, 0),
      sessions: num(r, 0), purchases: num(r, 1),
    })).sort((a: any, b: any) => a.day - b.day);

    // Aggregate new vs returning (GA4 returns "new", "returning", "(not set)")
    // We merge "returning" + "(not set)" into "Recurrentes"
    const nvrAgg: Record<string, { sessions: number; users: number; purchases: number; revenue: number }> = {};
    for (const r of nvrRows) {
      const key = str(r, 0) === "new" ? "Nuevos" : "Recurrentes";
      if (!nvrAgg[key]) nvrAgg[key] = { sessions: 0, users: 0, purchases: 0, revenue: 0 };
      nvrAgg[key].sessions += num(r, 0);
      nvrAgg[key].users += num(r, 1);
      nvrAgg[key].purchases += num(r, 2);
      nvrAgg[key].revenue += flt(r, 3);
    }
    const newVsReturning = Object.entries(nvrAgg).map(([type, data]) => ({ type, ...data }));

    // Cart abandonment — user-scoped (unique users per funnel step, not event counts)
    // dailyFunnelRows now has dimension: eventName, metric: totalUsers
    const funnelUserMap: Record<string, number> = {};
    for (const r of dailyFunnelRows) {
      const eventName = str(r, 0);
      funnelUserMap[eventName] = num(r, 0);
    }
    const usersAddToCart = funnelUserMap["add_to_cart"] || 0;
    const usersCheckout = funnelUserMap["begin_checkout"] || 0;
    const usersPurchase = funnelUserMap["purchase"] || 0;

    const abandonment = {
      cartAbandonmentRate: usersAddToCart > 0 ? Math.round(((usersAddToCart - usersPurchase) / usersAddToCart) * 10000) / 100 : 0,
      checkoutAbandonmentRate: usersCheckout > 0 ? Math.round(((usersCheckout - usersPurchase) / usersCheckout) * 10000) / 100 : 0,
      totalAddToCarts: usersAddToCart, totalCheckouts: usersCheckout, totalPurchases: usersPurchase,
    };

    // Category conversion
    const categories = categoryRows.map((r: any) => ({
      category: str(r, 0) || "(sin categoría)",
      views: num(r, 0), purchases: num(r, 1), revenue: flt(r, 2),
      conversionRate: num(r, 0) > 0 ? Math.round((num(r, 1) / num(r, 0)) * 10000) / 100 : 0,
    })).filter((c: any) => c.category !== "(not set)");

    // Brand conversion
    const brands = brandRows.map((r: any) => ({
      brand: str(r, 0) || "(sin marca)",
      views: num(r, 0), purchases: num(r, 1), revenue: flt(r, 2),
      conversionRate: num(r, 0) > 0 ? Math.round((num(r, 1) / num(r, 0)) * 10000) / 100 : 0,
    })).filter((b: any) => b.brand !== "(not set)");

    // ── VTEX: Ventas por zona (provincia) con costo de envío ──
    const zoneRows: any[] = await prisma.$queryRaw`
      SELECT
        UPPER(TRIM(c.state)) as state,
        COUNT(o.id)::int as orders,
        SUM(o."totalValue"::numeric)::float as revenue,
        AVG(o."totalValue"::numeric)::float as avg_ticket,
        AVG(CASE WHEN o."shippingCost" IS NOT NULL AND o."shippingCost" > 0 THEN o."shippingCost"::numeric END)::float as avg_shipping,
        COUNT(CASE WHEN o."shippingCost" IS NOT NULL AND o."shippingCost" > 0 THEN 1 END)::int as orders_with_shipping
      FROM orders o
      JOIN customers c ON o."customerId" = c.id
      WHERE o."organizationId" = ${org.id}
        AND o."orderDate" >= ${new Date(startDate)}::timestamp
        AND o."orderDate" <= ${new Date(endDate + "T23:59:59Z")}::timestamp
        AND o.status NOT IN ('CANCELLED', 'RETURNED')
        AND c.state IS NOT NULL AND TRIM(c.state) != ''
      GROUP BY UPPER(TRIM(c.state))
      ORDER BY revenue DESC
    `;

    const salesByZone = zoneRows.map((r: any) => ({
      zone: r.state,
      orders: r.orders,
      revenue: Math.round(r.revenue || 0),
      avgTicket: Math.round(r.avg_ticket || 0),
      avgShipping: r.avg_shipping ? Math.round(r.avg_shipping) : null,
      shippingPct: r.avg_shipping && r.avg_ticket > 0 ? Math.round((r.avg_shipping / r.avg_ticket) * 10000) / 100 : null,
      ordersWithShipping: r.orders_with_shipping,
    }));

    // ── VTEX: Envío vs Retiro en Sucursal ──
    const deliveryRows: any[] = await prisma.$queryRaw`
      SELECT
        "deliveryType",
        COUNT(*)::int as orders,
        SUM("totalValue"::numeric)::float as revenue
      FROM orders
      WHERE "organizationId" = ${org.id}
        AND "orderDate" >= ${new Date(startDate)}::timestamp
        AND "orderDate" <= ${new Date(endDate + "T23:59:59Z")}::timestamp
        AND status NOT IN ('CANCELLED', 'RETURNED')
        AND "deliveryType" IS NOT NULL
      GROUP BY "deliveryType"
    `;

    const deliverySplit = deliveryRows.map((r: any) => ({
      type: r.deliveryType === "pickup" ? "Retiro en Sucursal" : "Envío a Domicilio",
      key: r.deliveryType,
      orders: r.orders,
      revenue: Math.round(r.revenue || 0),
    }));

    // ── VTEX: Ventas por sucursal (solo pickup) ──
    const pickupRows: any[] = await prisma.$queryRaw`
      SELECT
        "pickupStoreName" as store,
        COUNT(*)::int as orders,
        SUM("totalValue"::numeric)::float as revenue
      FROM orders
      WHERE "organizationId" = ${org.id}
        AND "orderDate" >= ${new Date(startDate)}::timestamp
        AND "orderDate" <= ${new Date(endDate + "T23:59:59Z")}::timestamp
        AND status NOT IN ('CANCELLED', 'RETURNED')
        AND "deliveryType" = 'pickup'
        AND "pickupStoreName" IS NOT NULL
      GROUP BY "pickupStoreName"
      ORDER BY orders DESC
    `;

    const pickupByStore = pickupRows.map((r: any) => ({
      store: r.store,
      orders: r.orders,
      revenue: Math.round(r.revenue || 0),
    }));

    return NextResponse.json({
      geographic, products, searches, trafficRevenue,
      landingPages, hourly, dayOfWeek, newVsReturning, abandonment,
      categories, brands, salesByZone, deliverySplit, pickupByStore,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
