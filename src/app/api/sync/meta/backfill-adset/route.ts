// @ts-nocheck
// Endpoint para REPARAR datos existentes: linkea AdCreative -> AdSet
// para todos los AdCreative META que tengan adSetId = null.
//
// No hace sync completo: solo trae el mapping ad_id -> adset_id desde
// Meta y hace updateMany por adSet.
//
// Uso: GET /api/sync/meta/backfill-adset (requiere session activa)

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { MetaAdsConnector } from "@/lib/connectors/meta-ads";
import { getOrganization } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const org = await getOrganization();

    const metaToken = process.env.META_ADS_ACCESS_TOKEN || "";
    const metaAdAccount = process.env.META_ADS_AD_ACCOUNT_ID || "";
    if (!metaToken || !metaAdAccount) {
      return NextResponse.json({ error: "Missing Meta credentials" }, { status: 500 });
    }

    // 1) Traer mapping ad_id -> adset_id desde Meta
    const connector = new MetaAdsConnector({
      accessToken: metaToken,
      adAccountId: metaAdAccount,
    });
    const allAds = await connector.fetchAllAds();

    // 2) Construir adSetMap (externalId -> dbId) desde nuestra DB
    const dbAdSets = await prisma.adSet.findMany({
      where: { organizationId: org.id, platform: "META" },
      select: { id: true, externalId: true },
    });
    const adSetMap: Record<string, string> = {};
    for (const as of dbAdSets) {
      adSetMap[as.externalId] = as.id;
    }

    // 3) Agrupar ads por adSet externalId
    const adsByAdSet: Record<string, string[]> = {};
    let adsWithoutAdSet = 0;
    let adsWithUnknownAdSet = 0;
    for (const ad of allAds) {
      const externalAdSetId = (ad as any).adset_id;
      if (!externalAdSetId) {
        adsWithoutAdSet++;
        continue;
      }
      if (!adSetMap[externalAdSetId]) {
        adsWithUnknownAdSet++;
        continue;
      }
      if (!adsByAdSet[externalAdSetId]) adsByAdSet[externalAdSetId] = [];
      adsByAdSet[externalAdSetId].push(ad.id);
    }

    // 4) Bulk update por adSet
    let creativesLinked = 0;
    let adSetsProcessed = 0;
    for (const externalAdSetId of Object.keys(adsByAdSet)) {
      const dbAdSetId = adSetMap[externalAdSetId];
      const externalAdIds = adsByAdSet[externalAdSetId];
      const result = await prisma.adCreative.updateMany({
        where: {
          organizationId: org.id,
          platform: "META",
          externalId: { in: externalAdIds },
        },
        data: { adSetId: dbAdSetId } as any,
      });
      creativesLinked += result.count;
      adSetsProcessed++;
    }

    // 5) Stats post-fix
    const totalCreatives = await prisma.adCreative.count({
      where: { organizationId: org.id, platform: "META" },
    });
    const creativesWithAdSet = await prisma.adCreative.count({
      where: { organizationId: org.id, platform: "META", adSetId: { not: null } } as any,
    });

    return NextResponse.json({
      ok: true,
      adsFromMeta: allAds.length,
      adSetsInDb: dbAdSets.length,
      adSetsProcessed,
      creativesLinked,
      adsWithoutAdSet,
      adsWithUnknownAdSet,
      totalCreativesAfter: totalCreatives,
      creativesWithAdSetAfter: creativesWithAdSet,
    });
  } catch (e: any) {
    console.error("[backfill-adset] error:", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
