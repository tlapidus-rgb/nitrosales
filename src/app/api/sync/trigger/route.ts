import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ORG_ID = "cmmmga1uq0000sb43w0krvvys";

async function updateConnectionStatus(
  platform: string,
  success: boolean,
  errorMsg?: string
) {
  try {
    await prisma.connection.upsert({
      where: {
        organizationId_platform: {
          organizationId: ORG_ID,
          platform: platform as any,
        },
      },
      update: {
        status: success ? "ACTIVE" : "ERROR",
        lastSyncAt: new Date(),
        lastSyncError: success ? null : errorMsg || "Unknown error",
      },
      create: {
        organizationId: ORG_ID,
        platform: platform as any,
        status: success ? "ACTIVE" : "ERROR",
        lastSyncAt: new Date(),
        lastSyncError: success ? null : errorMsg || "Unknown error",
        credentials: {},
      },
    });
  } catch (e) {
    console.error(`Failed to update connection status for ${platform}:`, e);
  }
}

export async function POST() {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const syncKey = process.env.NEXTAUTH_SECRET || "";
  const baseUrl = process.env.NEXTAUTH_URL || "https://nitrosales.vercel.app";
  const results: Record<string, any> = {};

  // Run all syncs in parallel to stay within 60s
  const [vtexRes, ga4Res, gadsRes, metaRes] = await Promise.allSettled([
    fetch(baseUrl + "/api/sync/vtex", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ syncKey }),
    }).then((r) => r.json()),
    fetch(baseUrl + "/api/sync/ga4", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ syncKey }),
    }).then((r) => r.json()),
    fetch(
      baseUrl + `/api/sync/google-ads?key=${encodeURIComponent(syncKey)}`,
      { method: "GET" }
    ).then((r) => r.json()),
    fetch(
      baseUrl + `/api/sync/meta?key=${encodeURIComponent(syncKey)}`,
      { method: "GET" }
    ).then((r) => r.json()),
  ]);

  results.vtex =
    vtexRes.status === "fulfilled"
      ? vtexRes.value
      : { error: vtexRes.reason?.message };
  results.ga4 =
    ga4Res.status === "fulfilled"
      ? ga4Res.value
      : { error: ga4Res.reason?.message };
  results.googleAds =
    gadsRes.status === "fulfilled"
      ? gadsRes.value
      : { error: gadsRes.reason?.message };
  results.metaAds =
    metaRes.status === "fulfilled"
      ? metaRes.value
      : { error: metaRes.reason?.message };

  // 5. Fetch VTEX order details (products, items, customers) for orders without items
  try {
    const vtexDetailsRes = await fetch(
      baseUrl + `/api/sync/vtex-details?key=${encodeURIComponent(syncKey)}&batch=5`
    );
    results.vtexDetails = await vtexDetailsRes.json();
  } catch (e: any) {
    results.vtexDetails = { error: e.message };
  }

  // Update connection statuses in parallel
  await Promise.allSettled([
    updateConnectionStatus(
      "VTEX",
      vtexRes.status === "fulfilled" && !results.vtex.error,
      results.vtex.error
    ),
    updateConnectionStatus(
      "GA4",
      ga4Res.status === "fulfilled" && !results.ga4.error,
      results.ga4.error
    ),
    updateConnectionStatus(
      "GOOGLE_ADS",
      gadsRes.status === "fulfilled" && !results.googleAds.error,
      results.googleAds.error
    ),
    updateConnectionStatus(
      "META_ADS",
      metaRes.status === "fulfilled" && !results.metaAds.error,
      results.metaAds.error
    ),
  ]);

  return NextResponse.json({ ok: true, results });
}
