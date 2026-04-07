// ══════════════════════════════════════════════════════════════
// NitroPixel — Ads Without UTMs Detector (Cron)
// ══════════════════════════════════════════════════════════════
// Scans the last 7 days of pixel events for sessions where the
// landing URL has a paid click ID (fbclid/gclid/ttclid/msclkid/
// li_fat_id) but NO utm_source. These are ads that bypass our
// attribution layer because they were not tagged in the ad
// platform with proper UTMs.
//
// Output:
//   - JSON summary per organization with counts grouped by
//     click-ID family + a list of sample landing URLs.
//   - Persists an Insight (type=ANOMALY, severity=MEDIUM) when
//     ≥10 untagged events are detected for the same click family.
//
// Auth: ?key=SYNC_KEY  or  Authorization: Bearer <SYNC_KEY>
// Schedule (recommended): once per day.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface FamilyStats {
  family: string;
  untaggedCount: number;
  sampleUrls: string[];
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const syncKey =
    searchParams.get("key") || req.headers.get("authorization")?.replace("Bearer ", "");
  if (syncKey !== process.env.SYNC_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  try {
    const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
    const results: Array<{
      orgId: string;
      orgName: string;
      totalUntaggedEvents: number;
      families: FamilyStats[];
      insightCreated: boolean;
    }> = [];

    for (const org of orgs) {
      // Pull recent landing-ish events (PAGEVIEW + SESSION_START) that have
      // some clickIds attached. We rely on the JSON column to be non-null.
      const events = await prisma.pixelEvent.findMany({
        where: {
          organizationId: org.id,
          receivedAt: { gte: since },
          type: { in: ["PAGE_VIEW", "PAGEVIEW", "SESSION_START"] },
          NOT: { clickIds: { equals: undefined } },
        },
        select: { clickIds: true, pageUrl: true, props: true },
        take: 5000,
      });

      const families = new Map<string, FamilyStats>();

      for (const ev of events) {
        const clicks = (ev.clickIds || {}) as Record<string, string>;
        if (!clicks || Object.keys(clicks).length === 0) continue;

        // Determine the click family
        let family: string | null = null;
        if (clicks.fbclid) family = "meta";
        else if (clicks.gclid) family = "google";
        else if (clicks.ttclid) family = "tiktok";
        else if (clicks.msclkid) family = "microsoft";
        else if (clicks.li_fat_id) family = "linkedin";
        if (!family) continue;

        // Check if URL has utm_source
        const url = ev.pageUrl || "";
        const hasUtm = /[?&]utm_source=/.test(url);

        // Also accept utm carried in props (page-level snapshot)
        const props = (ev.props || {}) as Record<string, unknown>;
        const utms = (props.utm || props.utms || {}) as Record<string, string>;
        const propsHasUtm = !!utms?.source;

        if (hasUtm || propsHasUtm) continue;

        // Untagged ad click — count it
        const stats = families.get(family) || {
          family,
          untaggedCount: 0,
          sampleUrls: [],
        };
        stats.untaggedCount += 1;
        if (stats.sampleUrls.length < 5 && url) {
          // Strip query params for the sample to avoid leaking ids
          const clean = url.split("?")[0];
          if (!stats.sampleUrls.includes(clean)) stats.sampleUrls.push(clean);
        }
        families.set(family, stats);
      }

      const familyList = Array.from(families.values()).sort(
        (a, b) => b.untaggedCount - a.untaggedCount,
      );
      const totalUntagged = familyList.reduce((s, f) => s + f.untaggedCount, 0);

      // Persist an Insight if there are meaningful untagged volumes
      let insightCreated = false;
      const offenders = familyList.filter((f) => f.untaggedCount >= 10);
      if (offenders.length > 0) {
        try {
          const summary = offenders
            .map((f) => `${f.family}: ${f.untaggedCount} clicks sin UTM`)
            .join(" · ");
          await prisma.insight.create({
            data: {
              organizationId: org.id,
              type: "ALERT",
              priority: "MEDIUM",
              title: `Ads sin UTM detectados (últimos 7 días)`,
              description: `Hay clicks pagos llegando a la tienda sin utm_source. NitroPixel los puede atribuir igual via click ID, pero NO va a poder agruparlos por campaña/ad set/creativo. Detalle: ${summary}.`,
              action: `Agregá UTMs en cada campaña del ad platform: utm_source=meta|google|tiktok, utm_medium=cpc, utm_campaign={{campaign.name}}, utm_content={{ad.name}}.`,
              metric: "untagged_clicks",
              metricValue: offenders.reduce((s, f) => s + f.untaggedCount, 0),
            },
          });
          insightCreated = true;
        } catch (e) {
          console.error(`[ads-utm-audit] failed to persist insight for org ${org.id}:`, e);
        }
      }

      results.push({
        orgId: org.id,
        orgName: org.name,
        totalUntaggedEvents: totalUntagged,
        families: familyList,
        insightCreated,
      });
    }

    return NextResponse.json({ ok: true, since: since.toISOString(), results });
  } catch (error) {
    console.error("[ads-utm-audit] error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}
