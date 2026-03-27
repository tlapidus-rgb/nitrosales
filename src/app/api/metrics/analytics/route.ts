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
  opts?: { limit?: number; orderBy?: { metric: string; desc?: boolean } }
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
      runReport(propertyId, token, ["itemName", "itemId", "itemCategory", "itemBrand"], ["itemsViewed", "itemsPurchased", "itemRevenue"], startDate, endDate, { limit: 500, orderBy: { metric: "itemsViewed" } }),
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
      // 8. Daily funnel for abandonment trend
      runReport(propertyId, token, ["date"], ["addToCarts", "checkouts", "ecommercePurchases"], startDate, endDate),
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
    }));

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

    const newVsReturning = nvrRows.map((r: any) => ({
      type: str(r, 0) === "new" ? "Nuevos" : "Recurrentes",
      sessions: num(r, 0), users: num(r, 1), purchases: num(r, 2), revenue: flt(r, 3),
    }));

    // Cart abandonment from daily funnel
    let totalAddToCarts = 0, totalCheckouts = 0, totalPurchases = 0;
    const dailyAbandonment = dailyFunnelRows.map((r: any) => {
      const d = str(r, 0);
      const dateStr = d.length === 8 ? d.substring(0, 4) + "-" + d.substring(4, 6) + "-" + d.substring(6, 8) : d;
      const atc = num(r, 0), co = num(r, 1), pu = num(r, 2);
      totalAddToCarts += atc; totalCheckouts += co; totalPurchases += pu;
      return {
        day: dateStr, addToCarts: atc, checkouts: co, purchases: pu,
        cartAbandonmentRate: atc > 0 ? Math.round(((atc - pu) / atc) * 10000) / 100 : 0,
      };
    }).sort((a: any, b: any) => a.day.localeCompare(b.day));

    const abandonment = {
      cartAbandonmentRate: totalAddToCarts > 0 ? Math.round(((totalAddToCarts - totalPurchases) / totalAddToCarts) * 10000) / 100 : 0,
      checkoutAbandonmentRate: totalCheckouts > 0 ? Math.round(((totalCheckouts - totalPurchases) / totalCheckouts) * 10000) / 100 : 0,
      totalAddToCarts, totalCheckouts, totalPurchases,
      daily: dailyAbandonment,
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

    return NextResponse.json({
      geographic, products, searches, trafficRevenue,
      landingPages, hourly, dayOfWeek, newVsReturning, abandonment,
      categories, brands,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
