export const dynamic = "force-dynamic";
export const revalidate = 0;

// ═══════════════════════════════════════════════════════════════════
// /api/bondly/churn-risk — Top clientes en riesgo de churn
// ═══════════════════════════════════════════════════════════════════
//
// Devuelve los N clientes con mayor churn score combinando:
//   - Recency (días desde última compra vs patrón propio)
//   - Frequency trend (órdenes últimos 90d vs anteriores 90d)
//   - Pixel engagement trend (sesiones últimos 30d vs anteriores 30d)
//   - AOV trend
//
// Focus en clientes con LTV relevante (total_orders >= 2, totalSpent > 0)
// para evitar ruido de customers de una sola compra.
//
// READ-ONLY. CLAUDE.md §REGLA #3b: max 3 queries por batch, sin JOIN
// a customers dentro de queries de orders pesadas.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import {
  computeChurnScore,
  CHURN_TIER_LABELS,
  type ChurnTier,
} from "@/lib/bondly/churn-score";

interface CustomerAggRow {
  customer_id: string;
  total_ltv: number;
  total_orders: number;
  last_order: Date;
  first_order: Date;
  orders_last_90d: number;
  orders_prev_90d: number;
  aov_last_90d: number;
  aov_prev_90d: number;
  days_since_last: number;
  median_days_between: number | null;
}

interface CustomerProfileRow {
  id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
}

interface PixelAggRow {
  customer_id: string;
  sessions_last_30d: number;
  sessions_prev_30d: number;
}

interface ChurnResponseItem {
  customerId: string;
  displayName: string;
  email: string | null;
  city: string | null;
  totalLtv: number;
  totalOrders: number;
  daysSinceLastOrder: number;
  churnScore: number;
  churnTier: ChurnTier;
  churnTierLabel: string;
  reasons: string[];
  availableSignals: number;
}

export async function GET(req: NextRequest) {
  try {
    const organizationId = await getOrganizationId();
    const url = new URL(req.url);
    const limit = Math.max(
      10,
      Math.min(100, parseInt(url.searchParams.get("limit") || "20", 10) || 20)
    );
    const minLtv = Math.max(
      0,
      parseInt(url.searchParams.get("minLtv") || "0", 10) || 0
    );

    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000);
    const oneEightyDaysAgo = new Date(now.getTime() - 180 * 86400000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000);

    // ─── Batch 1: agregados por customer (sin JOIN a customers) ──
    // Tomamos top 200 por totalSpent para acotar el scoring.
    const aggRows = await prisma.$queryRaw<CustomerAggRow[]>`
      WITH customer_agg AS (
        SELECT
          o."customerId" as customer_id,
          SUM(o."totalValue")::float as total_ltv,
          COUNT(*)::int as total_orders,
          MAX(o."orderDate") as last_order,
          MIN(o."orderDate") as first_order,
          COUNT(*) FILTER (WHERE o."orderDate" >= ${ninetyDaysAgo})::int as orders_last_90d,
          COUNT(*) FILTER (
            WHERE o."orderDate" >= ${oneEightyDaysAgo}
              AND o."orderDate" < ${ninetyDaysAgo}
          )::int as orders_prev_90d,
          COALESCE(AVG(o."totalValue") FILTER (WHERE o."orderDate" >= ${ninetyDaysAgo}), 0)::float as aov_last_90d,
          COALESCE(AVG(o."totalValue") FILTER (
            WHERE o."orderDate" >= ${oneEightyDaysAgo}
              AND o."orderDate" < ${ninetyDaysAgo}
          ), 0)::float as aov_prev_90d
        FROM orders o
        WHERE o."organizationId" = ${organizationId}
          AND o.source = 'VTEX'
          AND o."customerId" IS NOT NULL
          AND o.status NOT IN ('CANCELLED', 'RETURNED')
        GROUP BY o."customerId"
        HAVING COUNT(*) >= 2
      )
      SELECT
        ca.customer_id,
        ca.total_ltv,
        ca.total_orders,
        ca.last_order,
        ca.first_order,
        ca.orders_last_90d,
        ca.orders_prev_90d,
        ca.aov_last_90d,
        ca.aov_prev_90d,
        EXTRACT(DAY FROM (${now}::timestamptz - ca.last_order))::int as days_since_last,
        CASE
          WHEN ca.total_orders >= 3
          THEN (EXTRACT(DAY FROM (ca.last_order - ca.first_order)) / NULLIF(ca.total_orders - 1, 0))::float
          ELSE NULL
        END as median_days_between
      FROM customer_agg ca
      WHERE ca.total_ltv >= ${minLtv}
      ORDER BY ca.total_ltv DESC
      LIMIT 200
    `;

    if (aggRows.length === 0) {
      return NextResponse.json({
        clients: [],
        summary: {
          total: 0,
          critico: 0,
          alto: 0,
          medio: 0,
          bajo: 0,
        },
        generatedAt: new Date().toISOString(),
      });
    }

    const customerIds = aggRows.map((r) => r.customer_id);

    // ─── Batch 2: profile + pixel engagement (2 queries paralelas) ─
    const [profileRowsRes, pixelRowsRes] = await Promise.allSettled([
      prisma.$queryRaw<CustomerProfileRow[]>`
        SELECT
          c.id,
          COALESCE(NULLIF(TRIM(CONCAT_WS(' ', c."firstName", c."lastName")), ''), c.email, 'Cliente ' || SUBSTRING(c.id, 1, 6)) as display_name,
          c.email,
          c.phone,
          c.city
        FROM customers c
        WHERE c."organizationId" = ${organizationId}
          AND c.id = ANY(${customerIds}::text[])
      `,
      prisma.$queryRaw<PixelAggRow[]>`
        WITH pixel_per_customer AS (
          SELECT
            v."customerId" as customer_id,
            v.id as visitor_pk
          FROM pixel_visitors v
          WHERE v."organizationId" = ${organizationId}
            AND v."customerId" = ANY(${customerIds}::text[])
        ),
        sessions_last AS (
          SELECT
            ppc.customer_id,
            COUNT(DISTINCT e."sessionId")::int as cnt
          FROM pixel_per_customer ppc
          JOIN pixel_events e ON e."visitorId" = ppc.visitor_pk
          WHERE e."organizationId" = ${organizationId}
            AND e.timestamp >= ${thirtyDaysAgo}
            AND e."sessionId" IS NOT NULL
          GROUP BY ppc.customer_id
        ),
        sessions_prev AS (
          SELECT
            ppc.customer_id,
            COUNT(DISTINCT e."sessionId")::int as cnt
          FROM pixel_per_customer ppc
          JOIN pixel_events e ON e."visitorId" = ppc.visitor_pk
          WHERE e."organizationId" = ${organizationId}
            AND e.timestamp >= ${sixtyDaysAgo}
            AND e.timestamp < ${thirtyDaysAgo}
            AND e."sessionId" IS NOT NULL
          GROUP BY ppc.customer_id
        )
        SELECT
          ppc.customer_id,
          COALESCE(sl.cnt, 0) as sessions_last_30d,
          COALESCE(sp.cnt, 0) as sessions_prev_30d
        FROM pixel_per_customer ppc
        LEFT JOIN sessions_last sl ON sl.customer_id = ppc.customer_id
        LEFT JOIN sessions_prev sp ON sp.customer_id = ppc.customer_id
        GROUP BY ppc.customer_id, sl.cnt, sp.cnt
      `,
    ]);

    const profileRows =
      profileRowsRes.status === "fulfilled" ? profileRowsRes.value : [];
    const pixelRows =
      pixelRowsRes.status === "fulfilled" ? pixelRowsRes.value : [];

    const profileMap = new Map<string, CustomerProfileRow>();
    for (const p of profileRows) profileMap.set(p.id, p);
    const pixelMap = new Map<string, PixelAggRow>();
    for (const p of pixelRows) pixelMap.set(p.customer_id, p);

    // ─── Scoring ────────────────────────────────────────────────────
    const scored: ChurnResponseItem[] = aggRows.map((a) => {
      const profile = profileMap.get(a.customer_id);
      const pixel = pixelMap.get(a.customer_id);

      const churn = computeChurnScore({
        daysSinceLastOrder: Number(a.days_since_last) || 0,
        medianDaysBetweenOrders: a.median_days_between
          ? Number(a.median_days_between)
          : null,
        ordersLast90d: Number(a.orders_last_90d) || 0,
        ordersPrev90d: Number(a.orders_prev_90d) || 0,
        aovLast90d: a.aov_last_90d != null ? Number(a.aov_last_90d) : null,
        aovPrev90d: a.aov_prev_90d != null ? Number(a.aov_prev_90d) : null,
        pixelSessionsLast30d: pixel ? Number(pixel.sessions_last_30d) : null,
        pixelSessionsPrev30d: pixel ? Number(pixel.sessions_prev_30d) : null,
      });

      return {
        customerId: a.customer_id,
        displayName:
          profile?.display_name || `Cliente ${a.customer_id.slice(0, 6)}`,
        email: profile?.email ?? null,
        city: profile?.city ?? null,
        totalLtv: Number(a.total_ltv) || 0,
        totalOrders: Number(a.total_orders) || 0,
        daysSinceLastOrder: Number(a.days_since_last) || 0,
        churnScore: churn.score,
        churnTier: churn.tier,
        churnTierLabel: CHURN_TIER_LABELS[churn.tier],
        reasons: churn.reasons,
        availableSignals: churn.availableSignals,
      };
    });

    // Orden por churnScore desc, empate por LTV desc
    scored.sort((a, b) => {
      if (b.churnScore !== a.churnScore) return b.churnScore - a.churnScore;
      return b.totalLtv - a.totalLtv;
    });

    const clients = scored.slice(0, limit);

    const summary = {
      total: scored.length,
      critico: scored.filter((s) => s.churnTier === "critico").length,
      alto: scored.filter((s) => s.churnTier === "alto").length,
      medio: scored.filter((s) => s.churnTier === "medio").length,
      bajo: scored.filter((s) => s.churnTier === "bajo").length,
    };

    return NextResponse.json({
      clients,
      summary,
      analyzed: scored.length,
      limit,
      minLtv,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[/api/bondly/churn-risk] error:", err);
    return NextResponse.json(
      {
        error: "Failed to compute churn risk",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
