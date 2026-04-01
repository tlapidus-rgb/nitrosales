import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/**
 * P&L (Profit & Loss) API
 *
 * Returns financial metrics for a given period:
 * - Revenue, COGS, Gross Profit, Gross Margin
 * - Ad Spend, Shipping, Operating Profit
 * - Daily breakdown for trend charts
 * - Per-category and per-brand margins
 *
 * Query params:
 *   dateFrom, dateTo: ISO date strings (YYYY-MM-DD)
 *   compareDateFrom, compareDateTo: optional comparison period
 */
export async function GET(req: NextRequest) {
  const ORG_ID = await getOrganizationId();
  const { searchParams } = req.nextUrl;

  // Default: last 30 days
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 30);

  const dateFrom = searchParams.get("dateFrom") || defaultFrom.toISOString().split("T")[0];
  const dateTo = searchParams.get("dateTo") || now.toISOString().split("T")[0];

  // Comparison period (default: previous period of same length)
  const daysDiff = Math.ceil(
    (new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / (1000 * 60 * 60 * 24)
  );
  const defaultCompFrom = new Date(new Date(dateFrom).getTime() - daysDiff * 24 * 60 * 60 * 1000);
  const defaultCompTo = new Date(new Date(dateFrom).getTime() - 24 * 60 * 60 * 1000);

  const compareDateFrom = searchParams.get("compareDateFrom") || defaultCompFrom.toISOString().split("T")[0];
  const compareDateTo = searchParams.get("compareDateTo") || defaultCompTo.toISOString().split("T")[0];

  try {
    // Build date boundaries in Argentina timezone
    const fromDate = new Date(`${dateFrom}T00:00:00.000-03:00`);
    const toDate = new Date(`${dateTo}T23:59:59.999-03:00`);
    const compFromDate = new Date(`${compareDateFrom}T00:00:00.000-03:00`);
    const compToDate = new Date(`${compareDateTo}T23:59:59.999-03:00`);

    // ── Current period queries ──────────────────────────
    const [
      revenueResult,
      cogsResult,
      shippingResult,
      adSpendResult,
      dailyRevenue,
      dailyCogs,
      dailyAdSpend,
      categoryMargins,
      brandMargins,
      sourceBreakdown,
      mlCommissions,
    ] = await Promise.all([
      // 1. Total Revenue
      prisma.$queryRaw<[{ revenue: string; orders: string; units: string }]>`
        SELECT
          COALESCE(SUM(o."totalValue"), 0)::text as revenue,
          COUNT(DISTINCT o.id)::text as orders,
          COALESCE(SUM(oi.quantity), 0)::text as units
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi."orderId"
        WHERE o."organizationId" = ${ORG_ID}
          AND o.status NOT IN ('CANCELLED', 'RETURNED')
          AND o."orderDate" >= ${fromDate}
          AND o."orderDate" <= ${toDate}
      `,

      // 2. COGS (from order_items.costPrice or fallback to product.costPrice)
      prisma.$queryRaw<[{ cogs: string; items_with_cost: string; items_total: string }]>`
        SELECT
          COALESCE(SUM(
            oi.quantity * COALESCE(oi."costPrice", p."costPrice", 0)
          ), 0)::text as cogs,
          COUNT(CASE WHEN COALESCE(oi."costPrice", p."costPrice") IS NOT NULL THEN 1 END)::text as items_with_cost,
          COUNT(oi.id)::text as items_total
        FROM order_items oi
        INNER JOIN orders o ON oi."orderId" = o.id
        LEFT JOIN products p ON oi."productId" = p.id
        WHERE o."organizationId" = ${ORG_ID}
          AND o.status NOT IN ('CANCELLED', 'RETURNED')
          AND o."orderDate" >= ${fromDate}
          AND o."orderDate" <= ${toDate}
      `,

      // 3. Total Shipping
      prisma.$queryRaw<[{ shipping: string }]>`
        SELECT COALESCE(SUM(o."shippingCost"), 0)::text as shipping
        FROM orders o
        WHERE o."organizationId" = ${ORG_ID}
          AND o.status NOT IN ('CANCELLED', 'RETURNED')
          AND o."orderDate" >= ${fromDate}
          AND o."orderDate" <= ${toDate}
      `,

      // 4. Total Ad Spend (Meta + Google + TikTok)
      prisma.$queryRaw<[{ spend: string; meta_spend: string; google_spend: string }]>`
        SELECT
          COALESCE(SUM(m.spend), 0)::text as spend,
          COALESCE(SUM(CASE WHEN m.platform = 'META' THEN m.spend ELSE 0 END), 0)::text as meta_spend,
          COALESCE(SUM(CASE WHEN m.platform = 'GOOGLE' THEN m.spend ELSE 0 END), 0)::text as google_spend
        FROM ad_metrics_daily m
        WHERE m."organizationId" = ${ORG_ID}
          AND m.date >= ${fromDate}::date
          AND m.date <= ${toDate}::date
      `,

      // 5. Daily Revenue trend
      prisma.$queryRaw<{ fecha: string; revenue: string; orders: string }[]>`
        SELECT
          (o."orderDate" AT TIME ZONE 'America/Argentina/Buenos_Aires')::date::text as fecha,
          COALESCE(SUM(o."totalValue"), 0)::text as revenue,
          COUNT(DISTINCT o.id)::text as orders
        FROM orders o
        WHERE o."organizationId" = ${ORG_ID}
          AND o.status NOT IN ('CANCELLED', 'RETURNED')
          AND o."orderDate" >= ${fromDate}
          AND o."orderDate" <= ${toDate}
        GROUP BY fecha
        ORDER BY fecha ASC
      `,

      // 6. Daily COGS trend
      prisma.$queryRaw<{ fecha: string; cogs: string }[]>`
        SELECT
          (o."orderDate" AT TIME ZONE 'America/Argentina/Buenos_Aires')::date::text as fecha,
          COALESCE(SUM(oi.quantity * COALESCE(oi."costPrice", p."costPrice", 0)), 0)::text as cogs
        FROM order_items oi
        INNER JOIN orders o ON oi."orderId" = o.id
        LEFT JOIN products p ON oi."productId" = p.id
        WHERE o."organizationId" = ${ORG_ID}
          AND o.status NOT IN ('CANCELLED', 'RETURNED')
          AND o."orderDate" >= ${fromDate}
          AND o."orderDate" <= ${toDate}
        GROUP BY fecha
        ORDER BY fecha ASC
      `,

      // 7. Daily Ad Spend trend
      prisma.$queryRaw<{ fecha: string; spend: string }[]>`
        SELECT
          m.date::text as fecha,
          COALESCE(SUM(m.spend), 0)::text as spend
        FROM ad_metrics_daily m
        WHERE m."organizationId" = ${ORG_ID}
          AND m.date >= ${fromDate}::date
          AND m.date <= ${toDate}::date
        GROUP BY m.date
        ORDER BY m.date ASC
      `,

      // 8. Category margins
      prisma.$queryRaw<{ category: string; revenue: string; cogs: string; units: string }[]>`
        SELECT
          COALESCE(p.category, 'Sin categoria') as category,
          COALESCE(SUM(oi."totalPrice"), 0)::text as revenue,
          COALESCE(SUM(oi.quantity * COALESCE(oi."costPrice", p."costPrice", 0)), 0)::text as cogs,
          COALESCE(SUM(oi.quantity), 0)::text as units
        FROM order_items oi
        INNER JOIN orders o ON oi."orderId" = o.id
        LEFT JOIN products p ON oi."productId" = p.id
        WHERE o."organizationId" = ${ORG_ID}
          AND o.status NOT IN ('CANCELLED', 'RETURNED')
          AND o."orderDate" >= ${fromDate}
          AND o."orderDate" <= ${toDate}
        GROUP BY p.category
        ORDER BY SUM(oi."totalPrice") DESC
        LIMIT 20
      `,

      // 9. Brand margins
      prisma.$queryRaw<{ brand: string; revenue: string; cogs: string; units: string }[]>`
        SELECT
          COALESCE(p.brand, 'Sin marca') as brand,
          COALESCE(SUM(oi."totalPrice"), 0)::text as revenue,
          COALESCE(SUM(oi.quantity * COALESCE(oi."costPrice", p."costPrice", 0)), 0)::text as cogs,
          COALESCE(SUM(oi.quantity), 0)::text as units
        FROM order_items oi
        INNER JOIN orders o ON oi."orderId" = o.id
        LEFT JOIN products p ON oi."productId" = p.id
        WHERE o."organizationId" = ${ORG_ID}
          AND o.status NOT IN ('CANCELLED', 'RETURNED')
          AND o."orderDate" >= ${fromDate}
          AND o."orderDate" <= ${toDate}
          AND p.brand IS NOT NULL
        GROUP BY p.brand
        ORDER BY SUM(oi."totalPrice") DESC
        LIMIT 20
      `,

      // 10. Revenue, COGS, Shipping, Orders by source (MELI vs VTEX)
      // Uses subqueries to avoid double-counting from order_items join
      prisma.$queryRaw<{ source: string; revenue: string; cogs: string; shipping: string; orders: string; units: string }[]>`
        SELECT
          rev.source,
          rev.revenue,
          COALESCE(cog.cogs, '0') as cogs,
          rev.shipping,
          rev.orders,
          COALESCE(cog.units, '0') as units
        FROM (
          SELECT
            o.source,
            COALESCE(SUM(o."totalValue"), 0)::text as revenue,
            COALESCE(SUM(o."shippingCost"), 0)::text as shipping,
            COUNT(DISTINCT o.id)::text as orders
          FROM orders o
          WHERE o."organizationId" = ${ORG_ID}
            AND o.status NOT IN ('CANCELLED', 'RETURNED')
            AND o."orderDate" >= ${fromDate}
            AND o."orderDate" <= ${toDate}
          GROUP BY o.source
        ) rev
        LEFT JOIN (
          SELECT
            o.source,
            COALESCE(SUM(oi.quantity * COALESCE(oi."costPrice", p."costPrice", 0)), 0)::text as cogs,
            COALESCE(SUM(oi.quantity), 0)::text as units
          FROM order_items oi
          INNER JOIN orders o ON oi."orderId" = o.id
          LEFT JOIN products p ON oi."productId" = p.id
          WHERE o."organizationId" = ${ORG_ID}
            AND o.status NOT IN ('CANCELLED', 'RETURNED')
            AND o."orderDate" >= ${fromDate}
            AND o."orderDate" <= ${toDate}
          GROUP BY o.source
        ) cog ON rev.source = cog.source
        ORDER BY rev.revenue DESC
      `,

      // 11. ML Commissions (may be empty if sync not configured)
      prisma.$queryRaw<[{ commission: string; tax_withholdings: string; net_amount: string; count: string }]>`
        SELECT
          COALESCE(SUM(mc."commissionAmount"), 0)::text as commission,
          COALESCE(SUM(mc."taxWithholdings"), 0)::text as tax_withholdings,
          COALESCE(SUM(mc."netAmount"), 0)::text as net_amount,
          COUNT(mc.id)::text as count
        FROM ml_commissions mc
        WHERE mc."organizationId" = ${ORG_ID}
          AND mc."orderDate" >= ${fromDate}
          AND mc."orderDate" <= ${toDate}
      `,
    ]);

    // ── Comparison period ──────────────────────────────
    const [compRevenue, compCogs, compAdSpend] = await Promise.all([
      prisma.$queryRaw<[{ revenue: string; orders: string }]>`
        SELECT
          COALESCE(SUM(o."totalValue"), 0)::text as revenue,
          COUNT(DISTINCT o.id)::text as orders
        FROM orders o
        WHERE o."organizationId" = ${ORG_ID}
          AND o.status NOT IN ('CANCELLED', 'RETURNED')
          AND o."orderDate" >= ${compFromDate}
          AND o."orderDate" <= ${compToDate}
      `,
      prisma.$queryRaw<[{ cogs: string }]>`
        SELECT COALESCE(SUM(
          oi.quantity * COALESCE(oi."costPrice", p."costPrice", 0)
        ), 0)::text as cogs
        FROM order_items oi
        INNER JOIN orders o ON oi."orderId" = o.id
        LEFT JOIN products p ON oi."productId" = p.id
        WHERE o."organizationId" = ${ORG_ID}
          AND o.status NOT IN ('CANCELLED', 'RETURNED')
          AND o."orderDate" >= ${compFromDate}
          AND o."orderDate" <= ${compToDate}
      `,
      prisma.$queryRaw<[{ spend: string }]>`
        SELECT COALESCE(SUM(m.spend), 0)::text as spend
        FROM ad_metrics_daily m
        WHERE m."organizationId" = ${ORG_ID}
          AND m.date >= ${compFromDate}::date
          AND m.date <= ${compToDate}::date
      `,
    ]);

    // ── Build response ─────────────────────────────────
    const revenue = parseFloat(revenueResult[0].revenue);
    const orders = parseInt(revenueResult[0].orders);
    const units = parseInt(revenueResult[0].units);
    const cogs = parseFloat(cogsResult[0].cogs);
    const itemsWithCost = parseInt(cogsResult[0].items_with_cost);
    const itemsTotal = parseInt(cogsResult[0].items_total);
    const shipping = parseFloat(shippingResult[0].shipping);
    const adSpend = parseFloat(adSpendResult[0].spend);
    const metaSpend = parseFloat(adSpendResult[0].meta_spend);
    const googleSpend = parseFloat(adSpendResult[0].google_spend);

    const grossProfit = revenue - cogs;
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    // Note: operatingProfit here is pre-platform-fees (global view)
    // The bySource breakdown includes platform-specific fees
    const operatingProfit = grossProfit - adSpend - shipping;
    const operatingMargin = revenue > 0 ? (operatingProfit / revenue) * 100 : 0;
    const aov = orders > 0 ? revenue / orders : 0;

    // COGS coverage: what % of items have cost data
    const cogsCoverage = itemsTotal > 0 ? (itemsWithCost / itemsTotal) * 100 : 0;

    // Comparison calculations
    const prevRevenue = parseFloat(compRevenue[0].revenue);
    const prevOrders = parseInt(compRevenue[0].orders);
    const prevCogs = parseFloat(compCogs[0].cogs);
    const prevAdSpend = parseFloat(compAdSpend[0].spend);
    const prevGrossProfit = prevRevenue - prevCogs;
    const prevOperatingProfit = prevGrossProfit - prevAdSpend;

    function pctChange(current: number, previous: number): number | null {
      if (previous === 0) return current > 0 ? 100 : null;
      return Math.round(((current - previous) / Math.abs(previous)) * 100);
    }

    // Merge daily trends
    const dailyMap = new Map<string, { revenue: number; cogs: number; adSpend: number; orders: number }>();
    for (const d of dailyRevenue) {
      dailyMap.set(d.fecha, {
        revenue: parseFloat(d.revenue),
        orders: parseInt(d.orders),
        cogs: 0,
        adSpend: 0,
      });
    }
    for (const d of dailyCogs) {
      const entry = dailyMap.get(d.fecha);
      if (entry) entry.cogs = parseFloat(d.cogs);
    }
    for (const d of dailyAdSpend) {
      const entry = dailyMap.get(d.fecha);
      if (entry) entry.adSpend = parseFloat(d.spend);
    }

    const dailyTrend = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date,
        revenue: Math.round(data.revenue),
        cogs: Math.round(data.cogs),
        grossProfit: Math.round(data.revenue - data.cogs),
        adSpend: Math.round(data.adSpend),
        operatingProfit: Math.round(data.revenue - data.cogs - data.adSpend),
        orders: data.orders,
      }));

    // Category/Brand margins
    const categories = categoryMargins.map((c) => {
      const rev = parseFloat(c.revenue);
      const cost = parseFloat(c.cogs);
      return {
        category: c.category,
        revenue: Math.round(rev),
        cogs: Math.round(cost),
        grossProfit: Math.round(rev - cost),
        grossMargin: rev > 0 ? Math.round(((rev - cost) / rev) * 100) : 0,
        units: parseInt(c.units),
      };
    });

    // Source breakdown (MELI vs VTEX) with platform costs
    const VTEX_VARIABLE_RATE = 0.025; // 2.5% of gross revenue
    // VTEX fixed cost TBD — placeholder for when user provides it
    const VTEX_FIXED_COST = 0;

    const bySource = sourceBreakdown.map((s) => {
      const rev = parseFloat(s.revenue);
      const cost = parseFloat(s.cogs);
      const ship = parseFloat(s.shipping);
      const ord = parseInt(s.orders);
      const un = parseInt(s.units);
      const gross = rev - cost;
      const grossM = rev > 0 ? (gross / rev) * 100 : 0;

      // Platform-specific costs
      let platformFee = 0;
      let platformFeeLabel = "";
      let mlCommission = 0;
      let mlTaxWithholdings = 0;

      if (s.source === "MELI") {
        mlCommission = parseFloat(mlCommissions[0].commission);
        mlTaxWithholdings = parseFloat(mlCommissions[0].tax_withholdings);
        platformFee = mlCommission + mlTaxWithholdings;
        platformFeeLabel = mlCommission > 0
          ? "Comisiones + retenciones ML"
          : "Comisiones ML (sin datos de sync)";
      } else if (s.source === "VTEX") {
        platformFee = rev * VTEX_VARIABLE_RATE + VTEX_FIXED_COST;
        platformFeeLabel = `VTEX ${VTEX_VARIABLE_RATE * 100}% variable${VTEX_FIXED_COST > 0 ? " + fijo" : ""}`;
      }

      const operatingP = gross - ship - platformFee;
      const operatingM = rev > 0 ? (operatingP / rev) * 100 : 0;

      return {
        source: s.source,
        revenue: Math.round(rev),
        orders: ord,
        units: un,
        cogs: Math.round(cost),
        grossProfit: Math.round(gross),
        grossMargin: Math.round(grossM * 10) / 10,
        shipping: Math.round(ship),
        platformFee: Math.round(platformFee),
        platformFeeLabel,
        mlCommission: Math.round(mlCommission),
        mlTaxWithholdings: Math.round(mlTaxWithholdings),
        operatingProfit: Math.round(operatingP),
        operatingMargin: Math.round(operatingM * 10) / 10,
        aov: ord > 0 ? Math.round(rev / ord) : 0,
      };
    });

    // Total platform costs (for global P&L)
    const totalPlatformFees = bySource.reduce((sum, s) => sum + s.platformFee, 0);

    const brands = brandMargins.map((b) => {
      const rev = parseFloat(b.revenue);
      const cost = parseFloat(b.cogs);
      return {
        brand: b.brand,
        revenue: Math.round(rev),
        cogs: Math.round(cost),
        grossProfit: Math.round(rev - cost),
        grossMargin: rev > 0 ? Math.round(((rev - cost) / rev) * 100) : 0,
        units: parseInt(b.units),
      };
    });

    return NextResponse.json({
      period: { from: dateFrom, to: dateTo },
      comparePeriod: { from: compareDateFrom, to: compareDateTo },
      summary: {
        revenue: Math.round(revenue),
        orders,
        units,
        aov: Math.round(aov),
        cogs: Math.round(cogs),
        cogsCoverage: Math.round(cogsCoverage),
        grossProfit: Math.round(grossProfit),
        grossMargin: Math.round(grossMargin * 10) / 10,
        adSpend: Math.round(adSpend),
        metaSpend: Math.round(metaSpend),
        googleSpend: Math.round(googleSpend),
        shipping: Math.round(shipping),
        platformFees: Math.round(totalPlatformFees),
        operatingProfit: Math.round(operatingProfit),
        operatingMargin: Math.round(operatingMargin * 10) / 10,
        // Net operating (after platform fees)
        netOperatingProfit: Math.round(operatingProfit - totalPlatformFees),
        netOperatingMargin: revenue > 0
          ? Math.round(((operatingProfit - totalPlatformFees) / revenue) * 1000) / 10
          : 0,
      },
      changes: {
        revenue: pctChange(revenue, prevRevenue),
        orders: pctChange(orders, prevOrders),
        grossProfit: pctChange(grossProfit, prevGrossProfit),
        adSpend: pctChange(adSpend, prevAdSpend),
        operatingProfit: pctChange(operatingProfit, prevOperatingProfit),
      },
      dailyTrend,
      categories,
      brands,
      bySource,
    });
  } catch (error: any) {
    console.error("P&L API error:", error);
    return NextResponse.json(
      { error: "Error calculating P&L", details: error.message },
      { status: 500 }
    );
  }
}
