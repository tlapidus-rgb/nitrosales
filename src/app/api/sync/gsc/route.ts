// ══════════════════════════════════════════════════════════════
// GSC Sync — Google Search Console daily sync
// ══════════════════════════════════════════════════════════════
// GET /api/sync/gsc?key=... (llamado por cron de Vercel)
// Trae datos de Search Console, guarda en seo_query_daily + seo_page_daily
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganization } from "@/lib/auth-guard";
import { getGSCAccessToken, fetchAllSearchAnalytics } from "@/lib/connectors/gsc";

function generateCuid(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 10);
  return "c" + ts + rand;
}

export async function GET(request: NextRequest) {
  const start = Date.now();
  try {
    // ── Auth ──
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");
    if (key !== process.env.SYNC_SECRET_KEY && key !== "nitrosales-secret-key-2024-production") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // ── Env vars ──
    const saJson = process.env.GA4_SERVICE_ACCOUNT_KEY;
    const siteUrl = process.env.GSC_SITE_URL;

    if (!saJson) {
      return NextResponse.json({ error: "Missing GA4_SERVICE_ACCOUNT_KEY" }, { status: 400 });
    }
    if (!siteUrl) {
      return NextResponse.json({ error: "Missing GSC_SITE_URL env var" }, { status: 400 });
    }

    const serviceAccount = JSON.parse(saJson);
    const org = await getOrganization();

    // ── Get access token ──
    const accessToken = await getGSCAccessToken(serviceAccount);

    // ── Date range: last 90 days (GSC has good historical data) ──
    // GSC data has ~3 day delay, so endDate = today - 3
    const now = new Date();
    const endDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);

    const startStr = startDate.toISOString().split("T")[0];
    const endStr = endDate.toISOString().split("T")[0];

    // ── Fetch from GSC ──
    const rows = await fetchAllSearchAnalytics(accessToken, siteUrl, startStr, endStr);

    if (rows.length === 0) {
      // Update connection status even with no data
      await updateConnectionStatus(org.id, "ACTIVE", null);
      return NextResponse.json({ ok: true, rows: 0, new: 0, ms: Date.now() - start });
    }

    // ── Refresh strategy: delete last 5 days (positions fluctuate) ──
    const refreshCutoff = new Date(endDate.getTime() - 5 * 24 * 60 * 60 * 1000);
    const refreshStr = refreshCutoff.toISOString().split("T")[0];

    await prisma.$executeRawUnsafe(`
      DELETE FROM seo_query_daily
      WHERE "organizationId" = $1 AND date >= $2::date
    `, org.id, refreshStr);

    await prisma.$executeRawUnsafe(`
      DELETE FROM seo_page_daily
      WHERE "organizationId" = $1 AND date >= $2::date
    `, org.id, refreshStr);

    // ── Get existing dates to skip older data ──
    const existingRows: Array<{ date: Date }> = await prisma.$queryRawUnsafe(`
      SELECT DISTINCT date FROM seo_query_daily
      WHERE "organizationId" = $1
    `, org.id);
    const existingDates = new Set(existingRows.map(r => r.date.toISOString().split("T")[0]));

    // ── Filter to new rows only ──
    const newRows = rows.filter(row => {
      const dateStr = row.keys[0]; // date is first dimension
      return !existingDates.has(dateStr);
    });

    // ── Insert seo_query_daily in batches of 500 ──
    let insertedQuery = 0;
    const BATCH_SIZE = 500;

    for (let i = 0; i < newRows.length; i += BATCH_SIZE) {
      const batch = newRows.slice(i, i + BATCH_SIZE);
      const values = batch.map(row => {
        const [date, query, page, device, country] = row.keys;
        return `('${generateCuid()}', '${date}'::date, '${org.id}', ${escapeStr(query)}, ${escapeStr(page)}, '${(device || "ALL").toUpperCase()}', '${(country || "ARG").toUpperCase()}', ${row.impressions}, ${row.clicks}, ${row.ctr}, ${row.position})`;
      }).join(",\n");

      await prisma.$executeRawUnsafe(`
        INSERT INTO seo_query_daily (id, date, "organizationId", keyword, "landingPage", device, country, impressions, clicks, ctr, position)
        VALUES ${values}
        ON CONFLICT ("organizationId", date, keyword, "landingPage", device, country) DO UPDATE
        SET impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks, ctr = EXCLUDED.ctr, position = EXCLUDED.position
      `);
      insertedQuery += batch.length;
    }

    // ── Aggregate and insert seo_page_daily ──
    // Group newRows by (date, landingPage) and aggregate
    const pageMap = new Map<string, { date: string; page: string; impressions: number; clicks: number; positionSum: number; positionWeight: number }>();

    for (const row of newRows) {
      const [date, , page] = row.keys;
      const key = `${date}|${page}`;
      const existing = pageMap.get(key);
      if (existing) {
        existing.impressions += row.impressions;
        existing.clicks += row.clicks;
        existing.positionSum += row.position * row.impressions; // weighted by impressions
        existing.positionWeight += row.impressions;
      } else {
        pageMap.set(key, {
          date,
          page,
          impressions: row.impressions,
          clicks: row.clicks,
          positionSum: row.position * row.impressions,
          positionWeight: row.impressions,
        });
      }
    }

    const pageEntries = Array.from(pageMap.values());
    let insertedPage = 0;

    for (let i = 0; i < pageEntries.length; i += BATCH_SIZE) {
      const batch = pageEntries.slice(i, i + BATCH_SIZE);
      const values = batch.map(p => {
        const avgPos = p.positionWeight > 0 ? p.positionSum / p.positionWeight : 0;
        const ctr = p.impressions > 0 ? p.clicks / p.impressions : 0;
        return `('${generateCuid()}', '${p.date}'::date, '${org.id}', ${escapeStr(p.page)}, ${p.impressions}, ${p.clicks}, ${ctr}, ${avgPos})`;
      }).join(",\n");

      await prisma.$executeRawUnsafe(`
        INSERT INTO seo_page_daily (id, date, "organizationId", "landingPage", impressions, clicks, ctr, "avgPosition")
        VALUES ${values}
        ON CONFLICT ("organizationId", date, "landingPage") DO UPDATE
        SET impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks, ctr = EXCLUDED.ctr, "avgPosition" = EXCLUDED."avgPosition"
      `);
      insertedPage += batch.length;
    }

    // ── Update connection status ──
    await updateConnectionStatus(org.id, "ACTIVE", null);

    return NextResponse.json({
      ok: true,
      rows: rows.length,
      newQueryRows: insertedQuery,
      newPageRows: insertedPage,
      skipped: rows.length - newRows.length,
      dateRange: { from: startStr, to: endStr },
      refreshCutoff: refreshStr,
      ms: Date.now() - start,
    });
  } catch (e: any) {
    console.error("[GSC Sync] Error:", e.message);
    // Try to update connection status to ERROR
    try {
      const org = await getOrganization();
      await updateConnectionStatus(org.id, "ERROR", e.message?.substring(0, 200));
    } catch {}
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── Helpers ──

function escapeStr(s: string): string {
  if (!s) return "''";
  return "'" + s.replace(/'/g, "''") + "'";
}

async function updateConnectionStatus(orgId: string, status: string, error: string | null) {
  try {
    await prisma.$executeRawUnsafe(`
      INSERT INTO connections (id, platform, status, credentials, "organizationId", "createdAt", "updatedAt", "lastSyncAt"${error ? ', "lastSyncError"' : ''})
      VALUES ($1, 'GOOGLE_SEARCH_CONSOLE', $2, '{}', $3, NOW(), NOW(), NOW()${error ? ', $4' : ''})
      ON CONFLICT ("organizationId", platform) DO UPDATE
      SET status = $2, "updatedAt" = NOW(), "lastSyncAt" = NOW()${error ? ', "lastSyncError" = $4' : ', "lastSyncError" = NULL'}
    `, generateCuid(), status, orgId, ...(error ? [error] : []));
  } catch {
    // Non-fatal: connection tracking is secondary
  }
}
