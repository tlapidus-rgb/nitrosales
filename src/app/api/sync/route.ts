import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { markSyncSuccess } from "@/lib/sync-tracker";
import { acquireSyncLock, releaseSyncLock } from "@/lib/sync-lock";
import { getOrganization } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function runSync(syncKey: string) {
  if (syncKey !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Acquire sync lock — prevent overlapping cron runs
  const lock = await acquireSyncLock("sync");
  if (!lock.acquired) {
    return NextResponse.json({ ok: false, skipped: true, reason: lock.reason }, { status: 200 });
  }

  try {
  const org = await getOrganization();

  const baseUrl = process.env.NEXTAUTH_URL || "https://nitrosales.vercel.app";

  const results: any = {
    vtex: null,
    vtexDetails: null,
    ga4: null,
    googleAds: null,
    metaAds: null,
  };

  // 1. Sync VTEX orders
  try {
    const vtexRes = await fetch(baseUrl + "/api/sync/vtex", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ syncKey }),
    });
    results.vtex = await vtexRes.json();
  } catch (e: any) {
    results.vtex = { error: e.message };
  }

  // 1b. Fetch VTEX order details (products, items, customers)
  try {
    const vtexDetailsRes = await fetch(
      baseUrl + "/api/sync/vtex-details?key=" + encodeURIComponent(syncKey) + "&batch=5"
    );
    results.vtexDetails = await vtexDetailsRes.json();
  } catch (e: any) {
    results.vtexDetails = { error: e.message };
  }

  // 2. Sync GA4
  try {
    const ga4Res = await fetch(baseUrl + "/api/sync/ga4", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ syncKey }),
    });
    results.ga4 = await ga4Res.json();
  } catch (e: any) {
    results.ga4 = { error: e.message };
  }

  // 3. Google Ads — now runs on its own dedicated cron (see vercel.json)
  results.googleAds = { status: "independent_cron", schedule: "*/15 * * * *" };

  // 4. Meta Ads — now runs on its own dedicated cron (see vercel.json)
  results.metaAds = { status: "independent_cron", schedule: "*/15 * * * *" };

  await markSyncSuccess("VTEX");
  return NextResponse.json({ ok: true, results });
  } finally {
    await releaseSyncLock();
  }
}

// GET handler for Vercel Cron and manual triggers
export async function GET(req: Request) {
  try {
    // Browser navigation guard — redirect browsers to dashboard
    const headers = new Headers(req.headers);
    const secFetchDest = headers.get("sec-fetch-dest");
    const secFetchMode = headers.get("sec-fetch-mode");
    const accept = headers.get("accept") || "";
    if (
      secFetchDest === "document" ||
      secFetchMode === "navigate" ||
      (accept.includes("text/html") && !accept.includes("application/json"))
    ) {
      return NextResponse.redirect(new URL("/", req.url));
    }

    const url = new URL(req.url);
    const syncKey = url.searchParams.get("key") || "";
    return await runSync(syncKey);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST handler for programmatic calls
export async function POST(req: Request) {
  try {
    const { syncKey } = await req.json();
    return await runSync(syncKey || "");
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
