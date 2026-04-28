import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { markSyncSuccess } from "@/lib/sync-tracker";
import { acquireSyncLock, releaseSyncLock } from "@/lib/sync-lock";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Sync one org: VTEX orders + VTEX details + GA4.
// Google Ads + Meta Ads tienen sus propios crones.
async function runSyncForOrg(orgId: string, syncKey: string) {
  // Acquire sync lock per-org — prevent overlapping cron runs (misma org)
  const lock = await acquireSyncLock(orgId, "sync");
  if (!lock.acquired) {
    return { orgId, ok: false, skipped: true, reason: lock.reason };
  }

  try {
    const baseUrl = process.env.NEXTAUTH_URL || "https://app.nitrosales.ai";
    const results: any = {
      orgId,
      vtex: null,
      vtexDetails: null,
      ga4: null,
      googleAds: null,
      metaAds: null,
    };

    // 1. Sync VTEX orders
    try {
      const vtexRes = await fetch(`${baseUrl}/api/sync/vtex?org=${encodeURIComponent(orgId)}`, {
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
        `${baseUrl}/api/sync/vtex-details?key=${encodeURIComponent(syncKey)}&batch=5&org=${encodeURIComponent(orgId)}`
      );
      results.vtexDetails = await vtexDetailsRes.json();
    } catch (e: any) {
      results.vtexDetails = { error: e.message };
    }

    // 2. GA4 — eliminado en S58 BP-S58-001 (analytics via NitroPixel ahora).
    results.ga4 = { status: "deprecated", reason: "moved_to_nitropixel" };

    // 3. Google Ads + 4. Meta Ads corren en crones independientes
    results.googleAds = { status: "independent_cron", schedule: "*/15 * * * *" };
    results.metaAds = { status: "independent_cron", schedule: "*/15 * * * *" };

    await markSyncSuccess(orgId, "VTEX");
    return { ok: true, ...results };
  } finally {
    await releaseSyncLock(orgId);
  }
}

// Multi-tenant: itera todas las orgs con VTEX ACTIVE. Pattern BP-MT-001.
async function runSync(syncKey: string) {
  if (syncKey !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const vtexConns = await prisma.connection.findMany({
    where: { platform: "VTEX" as any, status: "ACTIVE" as any },
    select: { organizationId: true },
  });

  if (vtexConns.length === 0) {
    return NextResponse.json({ ok: true, message: "No active VTEX connections", results: [] });
  }

  const results: any[] = [];
  for (const conn of vtexConns) {
    try {
      const r = await runSyncForOrg(conn.organizationId, syncKey);
      results.push(r);
    } catch (e: any) {
      results.push({ orgId: conn.organizationId, ok: false, error: e.message });
    }
  }

  return NextResponse.json({ ok: true, orgsProcessed: results.length, results });
}

// GET handler for Vercel Cron and manual triggers.
// Soporta ?org=<orgId> para procesar UNA sola org; sin ?org= itera todas.
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
    const orgParam = url.searchParams.get("org");

    if (syncKey !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    if (orgParam) {
      const r = await runSyncForOrg(orgParam, syncKey);
      return NextResponse.json(r);
    }

    return await runSync(syncKey);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST handler for programmatic calls
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const syncKey = body.syncKey || "";
    const orgId = body.orgId || null;

    if (syncKey !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    if (orgId) {
      const r = await runSyncForOrg(orgId, syncKey);
      return NextResponse.json(r);
    }

    return await runSync(syncKey);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
