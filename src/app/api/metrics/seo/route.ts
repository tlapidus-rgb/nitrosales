export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// SEO Metrics API v2 — Google Search Console Intelligence
// ══════════════════════════════════════════════════════════════
// GET /api/metrics/seo?from=2026-03-01&to=2026-03-28
// All queries run in parallel
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const revalidate = 0;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const ORG_ID = await getOrganizationId();
    const { searchParams } = new URL(request.url);

    // ── Parse date range ──
    const now = new Date();
    const toParam = searchParams.get("to");
    const fromParam = searchParams.get("from");

    const dateTo = toParam
      ? new Date(toParam + "T23:59:59.999-03:00")
      : now;
    const dateFrom = fromParam
      ? new Date(fromParam + "T00:00:00.000-03:00")
      : new Date(now.getTime() - 30 * MS_PER_DAY);

    // ── Previous period for comparison ──
    const periodMs = dateTo.getTime() - dateFrom.getTime();
    const prevFrom = new Date(dateFrom.getTime() - periodMs);
    const prevTo = new Date(dateFrom.getTime() - 1);

    const fromStr = dateFrom.toISOString().split("T")[0];
    const toStr = dateTo.toISOString().split("T")[0];
    const prevFromStr = prevFrom.toISOString().split("T")[0];
    const prevToStr = prevTo.toISOString().split("T")[0];

    // ── ALL queries in parallel ──
    const [
      kpisCurrent,
      kpisPrevious,
      dailyTrend,
      topKeywords,
      topPages,
      positionDist,
      deviceSplit,
      // NEW v2 queries
      opportunities,
      moversUp,
      moversDown,
      cannibalization,
      countrySplit,
      newKeywords,
      lostKeywords,
    ] = await Promise.all([
      // 1. KPIs current period
      prisma.$queryRawUnsafe<Array<{
        total_clicks: string;
        total_impressions: string;
        avg_ctr: number | null;
        weighted_position: number | null;
        total_weight: string;
        kw_top3: string;
        kw_top10: string;
        total_keywords: string;
      }>>(`
        SELECT
          COALESCE(SUM(clicks), 0)::text as total_clicks,
          COALESCE(SUM(impressions), 0)::text as total_impressions,
          CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)::float / SUM(impressions) ELSE 0 END as avg_ctr,
          CASE WHEN SUM(impressions) > 0 THEN SUM(position * impressions) / SUM(impressions) ELSE 0 END as weighted_position,
          COALESCE(SUM(impressions), 0)::text as total_weight,
          (SELECT COUNT(DISTINCT keyword) FROM (
            SELECT keyword, SUM(position * impressions) / NULLIF(SUM(impressions), 0) as avg_pos
            FROM seo_query_daily
            WHERE "organizationId" = $1 AND date >= $2::date AND date <= $3::date
            GROUP BY keyword
            HAVING SUM(position * impressions) / NULLIF(SUM(impressions), 0) <= 3
          ) sub)::text as kw_top3,
          (SELECT COUNT(DISTINCT keyword) FROM (
            SELECT keyword, SUM(position * impressions) / NULLIF(SUM(impressions), 0) as avg_pos
            FROM seo_query_daily
            WHERE "organizationId" = $1 AND date >= $2::date AND date <= $3::date
            GROUP BY keyword
            HAVING SUM(position * impressions) / NULLIF(SUM(impressions), 0) <= 10
          ) sub)::text as kw_top10,
          (SELECT COUNT(DISTINCT keyword) FROM seo_query_daily
           WHERE "organizationId" = $1 AND date >= $2::date AND date <= $3::date)::text as total_keywords
        FROM seo_query_daily
        WHERE "organizationId" = $1 AND date >= $2::date AND date <= $3::date
      `, ORG_ID, fromStr, toStr),

      // 2. KPIs previous period
      prisma.$queryRawUnsafe<Array<{
        total_clicks: string;
        total_impressions: string;
        avg_ctr: number | null;
        weighted_position: number | null;
      }>>(`
        SELECT
          COALESCE(SUM(clicks), 0)::text as total_clicks,
          COALESCE(SUM(impressions), 0)::text as total_impressions,
          CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)::float / SUM(impressions) ELSE 0 END as avg_ctr,
          CASE WHEN SUM(impressions) > 0 THEN SUM(position * impressions) / SUM(impressions) ELSE 0 END as weighted_position
        FROM seo_query_daily
        WHERE "organizationId" = $1 AND date >= $2::date AND date <= $3::date
      `, ORG_ID, prevFromStr, prevToStr),

      // 3. Daily trend
      prisma.$queryRawUnsafe<Array<{
        day: string;
        clicks: string;
        impressions: string;
        ctr: number;
        position: number;
      }>>(`
        SELECT
          TO_CHAR(date, 'YYYY-MM-DD') as day,
          SUM(clicks)::text as clicks,
          SUM(impressions)::text as impressions,
          CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)::float / SUM(impressions) ELSE 0 END as ctr,
          CASE WHEN SUM(impressions) > 0 THEN SUM(position * impressions) / SUM(impressions) ELSE 0 END as position
        FROM seo_query_daily
        WHERE "organizationId" = $1 AND date >= $2::date AND date <= $3::date
        GROUP BY date
        ORDER BY date ASC
      `, ORG_ID, fromStr, toStr),

      // 4. Top 100 keywords with position change
      prisma.$queryRawUnsafe<Array<{
        keyword: string;
        clicks: string;
        impressions: string;
        ctr: number;
        avg_position: number;
        prev_position: number | null;
        prev_clicks: string | null;
      }>>(`
        SELECT
          cur.keyword,
          cur.clicks::text,
          cur.impressions::text,
          cur.ctr,
          cur.avg_position,
          prev.avg_position as prev_position,
          prev.clicks::text as prev_clicks
        FROM (
          SELECT keyword, SUM(clicks) as clicks, SUM(impressions) as impressions,
            CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)::float / SUM(impressions) ELSE 0 END as ctr,
            CASE WHEN SUM(impressions) > 0 THEN SUM(position * impressions) / SUM(impressions) ELSE 0 END as avg_position
          FROM seo_query_daily
          WHERE "organizationId" = $1 AND date >= $2::date AND date <= $3::date
          GROUP BY keyword
        ) cur
        LEFT JOIN (
          SELECT keyword, SUM(clicks) as clicks,
            CASE WHEN SUM(impressions) > 0 THEN SUM(position * impressions) / SUM(impressions) ELSE 0 END as avg_position
          FROM seo_query_daily
          WHERE "organizationId" = $1 AND date >= $4::date AND date <= $5::date
          GROUP BY keyword
        ) prev ON cur.keyword = prev.keyword
        ORDER BY cur.clicks DESC
        LIMIT 100
      `, ORG_ID, fromStr, toStr, prevFromStr, prevToStr),

      // 5. Top 50 landing pages
      prisma.$queryRawUnsafe<Array<{
        landing_page: string;
        clicks: string;
        impressions: string;
        ctr: number;
        avg_position: number;
        keyword_count: string;
      }>>(`
        SELECT
          p."landingPage" as landing_page,
          SUM(p.clicks)::text as clicks,
          SUM(p.impressions)::text as impressions,
          CASE WHEN SUM(p.impressions) > 0 THEN SUM(p.clicks)::float / SUM(p.impressions) ELSE 0 END as ctr,
          CASE WHEN SUM(p.impressions) > 0 THEN SUM(p."avgPosition" * p.impressions) / SUM(p.impressions) ELSE 0 END as avg_position,
          COALESCE(kw.kw_count, 0)::text as keyword_count
        FROM seo_page_daily p
        LEFT JOIN (
          SELECT "landingPage", COUNT(DISTINCT keyword)::bigint as kw_count
          FROM seo_query_daily
          WHERE "organizationId" = $1 AND date >= $2::date AND date <= $3::date
          GROUP BY "landingPage"
        ) kw ON p."landingPage" = kw."landingPage"
        WHERE p."organizationId" = $1 AND p.date >= $2::date AND p.date <= $3::date
        GROUP BY p."landingPage", kw.kw_count
        ORDER BY SUM(p.clicks) DESC
        LIMIT 50
      `, ORG_ID, fromStr, toStr),

      // 6. Position distribution
      prisma.$queryRawUnsafe<Array<{ band: string; count: string }>>(`
        SELECT band, COUNT(*)::text as count FROM (
          SELECT keyword,
            CASE
              WHEN SUM(position * impressions) / NULLIF(SUM(impressions), 0) <= 3 THEN 'pos1_3'
              WHEN SUM(position * impressions) / NULLIF(SUM(impressions), 0) <= 10 THEN 'pos4_10'
              WHEN SUM(position * impressions) / NULLIF(SUM(impressions), 0) <= 20 THEN 'pos11_20'
              ELSE 'pos20plus'
            END as band
          FROM seo_query_daily
          WHERE "organizationId" = $1 AND date >= $2::date AND date <= $3::date
          GROUP BY keyword
        ) sub GROUP BY band
      `, ORG_ID, fromStr, toStr),

      // 7. Device split
      prisma.$queryRawUnsafe<Array<{
        device: string; clicks: string; impressions: string; ctr: number; avg_position: number;
      }>>(`
        SELECT device, SUM(clicks)::text as clicks, SUM(impressions)::text as impressions,
          CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)::float / SUM(impressions) ELSE 0 END as ctr,
          CASE WHEN SUM(impressions) > 0 THEN SUM(position * impressions) / SUM(impressions) ELSE 0 END as avg_position
        FROM seo_query_daily
        WHERE "organizationId" = $1 AND date >= $2::date AND date <= $3::date
        GROUP BY device ORDER BY SUM(clicks) DESC
      `, ORG_ID, fromStr, toStr),

      // ═══ NEW v2 QUERIES ═══

      // 8. Opportunities: high impressions + low CTR (quick wins)
      prisma.$queryRawUnsafe<Array<{
        keyword: string; clicks: string; impressions: string; ctr: number; avg_position: number; potential_clicks: string;
      }>>(`
        SELECT keyword, SUM(clicks)::text as clicks, SUM(impressions)::text as impressions,
          CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)::float / SUM(impressions) ELSE 0 END as ctr,
          CASE WHEN SUM(impressions) > 0 THEN SUM(position * impressions) / SUM(impressions) ELSE 0 END as avg_position,
          -- Potential clicks if CTR improved to position average
          CASE
            WHEN SUM(position * impressions) / NULLIF(SUM(impressions), 0) <= 3 THEN (SUM(impressions) * 0.30 - SUM(clicks))
            WHEN SUM(position * impressions) / NULLIF(SUM(impressions), 0) <= 5 THEN (SUM(impressions) * 0.15 - SUM(clicks))
            WHEN SUM(position * impressions) / NULLIF(SUM(impressions), 0) <= 10 THEN (SUM(impressions) * 0.05 - SUM(clicks))
            ELSE 0
          END::bigint::text as potential_clicks
        FROM seo_query_daily
        WHERE "organizationId" = $1 AND date >= $2::date AND date <= $3::date
        GROUP BY keyword
        HAVING SUM(impressions) >= 100
          AND CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)::float / SUM(impressions) ELSE 0 END <
            CASE
              WHEN SUM(position * impressions) / NULLIF(SUM(impressions), 0) <= 3 THEN 0.30
              WHEN SUM(position * impressions) / NULLIF(SUM(impressions), 0) <= 5 THEN 0.15
              WHEN SUM(position * impressions) / NULLIF(SUM(impressions), 0) <= 10 THEN 0.05
              ELSE 1
            END
        ORDER BY (CASE
            WHEN SUM(position * impressions) / NULLIF(SUM(impressions), 0) <= 3 THEN (SUM(impressions) * 0.30 - SUM(clicks))
            WHEN SUM(position * impressions) / NULLIF(SUM(impressions), 0) <= 5 THEN (SUM(impressions) * 0.15 - SUM(clicks))
            WHEN SUM(position * impressions) / NULLIF(SUM(impressions), 0) <= 10 THEN (SUM(impressions) * 0.05 - SUM(clicks))
            ELSE 0
          END) DESC
        LIMIT 30
      `, ORG_ID, fromStr, toStr),

      // 9. Movers UP: keywords that improved position significantly
      prisma.$queryRawUnsafe<Array<{
        keyword: string; clicks: string; impressions: string; avg_position: number; prev_position: number; position_change: number;
      }>>(`
        SELECT cur.keyword, cur.clicks::text, cur.impressions::text, cur.avg_position,
          prev.avg_position as prev_position,
          (prev.avg_position - cur.avg_position) as position_change
        FROM (
          SELECT keyword, SUM(clicks) as clicks, SUM(impressions) as impressions,
            SUM(position * impressions) / NULLIF(SUM(impressions), 0) as avg_position
          FROM seo_query_daily
          WHERE "organizationId" = $1 AND date >= $2::date AND date <= $3::date
          GROUP BY keyword HAVING SUM(impressions) >= 50
        ) cur
        INNER JOIN (
          SELECT keyword, SUM(position * impressions) / NULLIF(SUM(impressions), 0) as avg_position
          FROM seo_query_daily
          WHERE "organizationId" = $1 AND date >= $4::date AND date <= $5::date
          GROUP BY keyword HAVING SUM(impressions) >= 50
        ) prev ON cur.keyword = prev.keyword
        WHERE (prev.avg_position - cur.avg_position) >= 2
        ORDER BY (prev.avg_position - cur.avg_position) DESC
        LIMIT 20
      `, ORG_ID, fromStr, toStr, prevFromStr, prevToStr),

      // 10. Movers DOWN: keywords that lost position
      prisma.$queryRawUnsafe<Array<{
        keyword: string; clicks: string; impressions: string; avg_position: number; prev_position: number; position_change: number;
      }>>(`
        SELECT cur.keyword, cur.clicks::text, cur.impressions::text, cur.avg_position,
          prev.avg_position as prev_position,
          (prev.avg_position - cur.avg_position) as position_change
        FROM (
          SELECT keyword, SUM(clicks) as clicks, SUM(impressions) as impressions,
            SUM(position * impressions) / NULLIF(SUM(impressions), 0) as avg_position
          FROM seo_query_daily
          WHERE "organizationId" = $1 AND date >= $2::date AND date <= $3::date
          GROUP BY keyword HAVING SUM(impressions) >= 50
        ) cur
        INNER JOIN (
          SELECT keyword, SUM(position * impressions) / NULLIF(SUM(impressions), 0) as avg_position
          FROM seo_query_daily
          WHERE "organizationId" = $1 AND date >= $4::date AND date <= $5::date
          GROUP BY keyword HAVING SUM(impressions) >= 50
        ) prev ON cur.keyword = prev.keyword
        WHERE (cur.avg_position - prev.avg_position) >= 2
        ORDER BY (cur.avg_position - prev.avg_position) DESC
        LIMIT 20
      `, ORG_ID, fromStr, toStr, prevFromStr, prevToStr),

      // 11. Cannibalization: keywords ranking on 3+ different pages
      prisma.$queryRawUnsafe<Array<{
        keyword: string; page_count: string; clicks: string; impressions: string; pages: string;
      }>>(`
        SELECT keyword, COUNT(DISTINCT "landingPage")::text as page_count,
          SUM(clicks)::text as clicks, SUM(impressions)::text as impressions,
          STRING_AGG(DISTINCT "landingPage", '|||' ORDER BY "landingPage") as pages
        FROM seo_query_daily
        WHERE "organizationId" = $1 AND date >= $2::date AND date <= $3::date
        GROUP BY keyword
        HAVING COUNT(DISTINCT "landingPage") >= 3 AND SUM(impressions) >= 100
        ORDER BY SUM(impressions) DESC
        LIMIT 20
      `, ORG_ID, fromStr, toStr),

      // 12. Country split
      prisma.$queryRawUnsafe<Array<{
        country: string; clicks: string; impressions: string; ctr: number; avg_position: number;
      }>>(`
        SELECT country, SUM(clicks)::text as clicks, SUM(impressions)::text as impressions,
          CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)::float / SUM(impressions) ELSE 0 END as ctr,
          CASE WHEN SUM(impressions) > 0 THEN SUM(position * impressions) / SUM(impressions) ELSE 0 END as avg_position
        FROM seo_query_daily
        WHERE "organizationId" = $1 AND date >= $2::date AND date <= $3::date
        GROUP BY country ORDER BY SUM(clicks) DESC
        LIMIT 15
      `, ORG_ID, fromStr, toStr),

      // 13. New keywords (in current period but NOT in previous)
      prisma.$queryRawUnsafe<Array<{
        keyword: string; clicks: string; impressions: string; avg_position: number;
      }>>(`
        SELECT cur.keyword, cur.clicks::text, cur.impressions::text, cur.avg_position
        FROM (
          SELECT keyword, SUM(clicks) as clicks, SUM(impressions) as impressions,
            SUM(position * impressions) / NULLIF(SUM(impressions), 0) as avg_position
          FROM seo_query_daily
          WHERE "organizationId" = $1 AND date >= $2::date AND date <= $3::date
          GROUP BY keyword HAVING SUM(clicks) >= 3
        ) cur
        LEFT JOIN (
          SELECT DISTINCT keyword FROM seo_query_daily
          WHERE "organizationId" = $1 AND date >= $4::date AND date <= $5::date
        ) prev ON cur.keyword = prev.keyword
        WHERE prev.keyword IS NULL
        ORDER BY cur.clicks DESC
        LIMIT 20
      `, ORG_ID, fromStr, toStr, prevFromStr, prevToStr),

      // 14. Lost keywords (in previous period but NOT in current)
      prisma.$queryRawUnsafe<Array<{
        keyword: string; clicks: string; impressions: string; avg_position: number;
      }>>(`
        SELECT prev.keyword, prev.clicks::text, prev.impressions::text, prev.avg_position
        FROM (
          SELECT keyword, SUM(clicks) as clicks, SUM(impressions) as impressions,
            SUM(position * impressions) / NULLIF(SUM(impressions), 0) as avg_position
          FROM seo_query_daily
          WHERE "organizationId" = $1 AND date >= $4::date AND date <= $5::date
          GROUP BY keyword HAVING SUM(clicks) >= 3
        ) prev
        LEFT JOIN (
          SELECT DISTINCT keyword FROM seo_query_daily
          WHERE "organizationId" = $1 AND date >= $2::date AND date <= $3::date
        ) cur ON prev.keyword = cur.keyword
        WHERE cur.keyword IS NULL
        ORDER BY prev.clicks DESC
        LIMIT 20
      `, ORG_ID, fromStr, toStr, prevFromStr, prevToStr),
    ]);

    // ── Process results ──
    const curr = kpisCurrent[0] || { total_clicks: "0", total_impressions: "0", avg_ctr: 0, weighted_position: 0, kw_top3: "0", kw_top10: "0", total_keywords: "0" };
    const prev = kpisPrevious[0] || { total_clicks: "0", total_impressions: "0", avg_ctr: 0, weighted_position: 0 };

    const pctChange = (c: number, p: number) =>
      p === 0 ? (c > 0 ? 100 : 0) : Math.round(((c - p) / p) * 100);

    const currClicks = parseInt(curr.total_clicks) || 0;
    const prevClicks = parseInt(prev.total_clicks) || 0;
    const currImpressions = parseInt(curr.total_impressions) || 0;
    const prevImpressions = parseInt(prev.total_impressions) || 0;

    const distObj: Record<string, number> = { pos1_3: 0, pos4_10: 0, pos11_20: 0, pos20plus: 0 };
    for (const row of positionDist) {
      distObj[row.band] = parseInt(row.count) || 0;
    }

    return NextResponse.json({
      kpis: {
        totalClicks: currClicks,
        totalImpressions: currImpressions,
        avgCtr: Math.round((curr.avg_ctr || 0) * 10000) / 100,
        avgPosition: Math.round((curr.weighted_position || 0) * 10) / 10,
        kwTop3: parseInt(curr.kw_top3) || 0,
        kwTop10: parseInt(curr.kw_top10) || 0,
        totalKeywords: parseInt(curr.total_keywords) || 0,
        changes: {
          clicks: pctChange(currClicks, prevClicks),
          impressions: pctChange(currImpressions, prevImpressions),
          ctr: pctChange(curr.avg_ctr || 0, prev.avg_ctr || 0),
          position: pctChange(prev.weighted_position || 0, curr.weighted_position || 0),
        },
      },
      dailyTrend: dailyTrend.map(d => ({
        day: d.day,
        clicks: parseInt(d.clicks) || 0,
        impressions: parseInt(d.impressions) || 0,
        ctr: Math.round(d.ctr * 10000) / 100,
        position: Math.round(d.position * 10) / 10,
      })),
      topKeywords: topKeywords.map(k => ({
        keyword: k.keyword,
        clicks: parseInt(k.clicks) || 0,
        impressions: parseInt(k.impressions) || 0,
        ctr: Math.round(k.ctr * 10000) / 100,
        position: Math.round(k.avg_position * 10) / 10,
        positionChange: k.prev_position != null
          ? Math.round((k.prev_position - k.avg_position) * 10) / 10
          : null,
        clicksChange: k.prev_clicks != null
          ? pctChange(parseInt(k.clicks) || 0, parseInt(k.prev_clicks) || 0)
          : null,
      })),
      topPages: topPages.map(p => ({
        url: p.landing_page,
        clicks: parseInt(p.clicks) || 0,
        impressions: parseInt(p.impressions) || 0,
        ctr: Math.round(p.ctr * 10000) / 100,
        avgPosition: Math.round(p.avg_position * 10) / 10,
        keywordCount: parseInt(p.keyword_count) || 0,
      })),
      positionDistribution: distObj,
      deviceSplit: deviceSplit.map(d => ({
        device: d.device,
        clicks: parseInt(d.clicks) || 0,
        impressions: parseInt(d.impressions) || 0,
        ctr: Math.round(d.ctr * 10000) / 100,
        avgPosition: Math.round(d.avg_position * 10) / 10,
      })),
      // ═══ NEW v2 data ═══
      opportunities: opportunities.map(o => ({
        keyword: o.keyword,
        clicks: parseInt(o.clicks) || 0,
        impressions: parseInt(o.impressions) || 0,
        ctr: Math.round(o.ctr * 10000) / 100,
        position: Math.round(o.avg_position * 10) / 10,
        potentialClicks: Math.max(0, parseInt(o.potential_clicks) || 0),
      })),
      movers: {
        up: moversUp.map(m => ({
          keyword: m.keyword,
          clicks: parseInt(m.clicks) || 0,
          impressions: parseInt(m.impressions) || 0,
          position: Math.round(m.avg_position * 10) / 10,
          prevPosition: Math.round(m.prev_position * 10) / 10,
          change: Math.round(m.position_change * 10) / 10,
        })),
        down: moversDown.map(m => ({
          keyword: m.keyword,
          clicks: parseInt(m.clicks) || 0,
          impressions: parseInt(m.impressions) || 0,
          position: Math.round(m.avg_position * 10) / 10,
          prevPosition: Math.round(m.prev_position * 10) / 10,
          change: Math.round(m.position_change * 10) / 10,
        })),
        new: newKeywords.map(k => ({
          keyword: k.keyword,
          clicks: parseInt(k.clicks) || 0,
          impressions: parseInt(k.impressions) || 0,
          position: Math.round(k.avg_position * 10) / 10,
        })),
        lost: lostKeywords.map(k => ({
          keyword: k.keyword,
          clicks: parseInt(k.clicks) || 0,
          impressions: parseInt(k.impressions) || 0,
          position: Math.round(k.avg_position * 10) / 10,
        })),
      },
      cannibalization: cannibalization.map(c => ({
        keyword: c.keyword,
        pageCount: parseInt(c.page_count) || 0,
        clicks: parseInt(c.clicks) || 0,
        impressions: parseInt(c.impressions) || 0,
        pages: (c.pages || "").split("|||").filter(Boolean),
      })),
      countrySplit: countrySplit.map(c => ({
        country: c.country,
        clicks: parseInt(c.clicks) || 0,
        impressions: parseInt(c.impressions) || 0,
        ctr: Math.round(c.ctr * 10000) / 100,
        avgPosition: Math.round(c.avg_position * 10) / 10,
      })),
      meta: {
        dateFrom: fromStr,
        dateTo: toStr,
        prevFrom: prevFromStr,
        prevTo: prevToStr,
        timezone: "America/Argentina/Buenos_Aires",
      },
    });
  } catch (error: any) {
    console.error("[SEO Metrics] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch SEO metrics", details: String(error) },
      { status: 500 }
    );
  }
}
