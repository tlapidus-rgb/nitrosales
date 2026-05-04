// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/debug-touchpoint-campaigns?orgId=X&channel=facebook&days=30&key=Y
// ══════════════════════════════════════════════════════════════
// Diagnostico para entender por que tantos touchpoints aparecen como
// "(sin campaña)" en el drill-down. Devuelve por canonicalSource:
//   - touchpoints con campaign: count + sample
//   - touchpoints sin campaign: count + sample con TODOS sus campos
//     (medium, clickId, clickType, page, confidence) para entender por
//     que llegaron sin campaign.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
const KEY = "nitrosales-secret-key-2024-production";

function canonicalSource(source: string): string {
  const lower = (source || "direct").toLowerCase().trim();
  if (["adwords", "google_ads", "google-ads", "googleads"].includes(lower)) return "google";
  if (["meta_ads", "meta-ads", "metaads", "fb_ads", "fb-ads", "fbads", "facebook_ads", "facebook-ads", "fb"].includes(lower)) return "meta";
  if (["ig", "instagram_ads", "instagram-ads"].includes(lower)) return "instagram";
  return lower;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const orgId = url.searchParams.get("orgId");
    const filterChannel = (url.searchParams.get("channel") || "").toLowerCase();
    const days = parseInt(url.searchParams.get("days") || "30", 10);
    const model = url.searchParams.get("model") || "NITRO";

    const allowed = key === KEY ? true : await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!orgId) return NextResponse.json({ error: "orgId requerido" }, { status: 400 });

    const dateTo = new Date();
    const dateFrom = new Date(dateTo.getTime() - days * 24 * 60 * 60 * 1000);

    // Traer las pixel_attributions y descomponer touchpoints en JS
    const attributions = await prisma.$queryRaw<Array<{
      orderId: string; touchpoints: any; revenue: number;
    }>>`
      SELECT pa."orderId", pa."touchpoints", o."totalValue" as revenue
      FROM pixel_attributions pa
      JOIN orders o ON o.id = pa."orderId"
      WHERE pa."organizationId" = ${orgId}
        AND o."orderDate" >= ${dateFrom}
        AND o."orderDate" <= ${dateTo}
        AND pa.model::text = ${model}
        AND o.status NOT IN ('CANCELLED', 'PENDING')
        AND o."totalValue" > 0
      LIMIT 500
    `;

    type TouchpointSummary = {
      source: string; medium: string | null; campaign: string | null;
      clickType: string | null; clickId: string | null; page: string | null;
      hasCampaign: boolean;
    };

    const allTouchpoints: TouchpointSummary[] = [];
    for (const a of attributions) {
      const tps = Array.isArray(a.touchpoints) ? a.touchpoints : [];
      for (const tp of tps) {
        const canonSource = canonicalSource(tp.source || "direct");
        if (filterChannel && canonSource !== filterChannel) continue;
        allTouchpoints.push({
          source: tp.source || null,
          medium: tp.medium || null,
          campaign: tp.campaign || null,
          clickType: tp.clickType || null,
          clickId: tp.clickId ? "(present)" : null,
          page: tp.page ? tp.page.slice(0, 80) : null,
          hasCampaign: !!(tp.campaign && String(tp.campaign).trim().length > 0),
        });
      }
    }

    // Agrupar por canonicalSource
    const bySource: Record<string, {
      total: number;
      withCampaign: number;
      withoutCampaign: number;
      pctWithCampaign: number;
      sampleWithoutCampaign: TouchpointSummary[];
      sampleWithCampaign: TouchpointSummary[];
      campaignsList: Record<string, number>;
    }> = {};

    for (const tp of allTouchpoints) {
      const key = canonicalSource(tp.source || "direct");
      if (!bySource[key]) {
        bySource[key] = {
          total: 0, withCampaign: 0, withoutCampaign: 0, pctWithCampaign: 0,
          sampleWithoutCampaign: [], sampleWithCampaign: [], campaignsList: {},
        };
      }
      bySource[key].total += 1;
      if (tp.hasCampaign) {
        bySource[key].withCampaign += 1;
        bySource[key].campaignsList[tp.campaign!] = (bySource[key].campaignsList[tp.campaign!] || 0) + 1;
        if (bySource[key].sampleWithCampaign.length < 5) bySource[key].sampleWithCampaign.push(tp);
      } else {
        bySource[key].withoutCampaign += 1;
        if (bySource[key].sampleWithoutCampaign.length < 10) bySource[key].sampleWithoutCampaign.push(tp);
      }
    }

    for (const k of Object.keys(bySource)) {
      const s = bySource[k];
      s.pctWithCampaign = s.total > 0 ? Math.round((s.withCampaign / s.total) * 100) : 0;
    }

    // Sort by total desc
    const sorted = Object.entries(bySource)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([key, value]) => ({ source: key, ...value }));

    return NextResponse.json({
      ok: true,
      orgId,
      model,
      filterChannel: filterChannel || "(all)",
      window: { from: dateFrom.toISOString(), to: dateTo.toISOString(), days },
      totalAttributions: attributions.length,
      totalTouchpoints: allTouchpoints.length,
      bySource: sorted,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, stack: err.stack?.slice(0, 500) }, { status: 500 });
  }
}
