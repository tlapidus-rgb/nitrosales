// ══════════════════════════════════════════════════════════════
// Cron diario para Meta + Google Ads (modo full reconciliation).
//
// Itera todas las orgs con conexion ACTIVE y refresca los ultimos
// 30 dias completos. Skipea las que ya corrieron en las ultimas 23h.
// Concurrency = 2 (mas conservador porque cada sync es pesado).
//
// Schedule: cron diario 4am Meta, 5am Google? No, ambos juntos a las 4am.
// "0 4 * * *" en vercel.json
// ══════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from "next/server";
import {
  getActiveOrgs,
  shouldSkipSync,
  runWithConcurrency,
  getBaseUrl,
} from "@/lib/sync/scheduler";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

const CONCURRENCY = 2;

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (key !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const baseUrl = getBaseUrl();
  const syncKey = encodeURIComponent(process.env.NEXTAUTH_SECRET || "");

  const platforms: Array<{
    db: "META_ADS" | "GOOGLE_ADS";
    path: string;
  }> = [
    { db: "META_ADS", path: "/api/sync/meta" },
    { db: "GOOGLE_ADS", path: "/api/sync/google-ads" },
  ];

  const summary: any = { mode: "daily", platforms: {} };

  for (const p of platforms) {
    const orgs = await getActiveOrgs(p.db);

    const results = await runWithConcurrency(
      orgs,
      async (org) => {
        if (shouldSkipSync(org.connection, "daily")) {
          return { orgId: org.id, skipped: "fresh" };
        }
        try {
          const url = `${baseUrl}${p.path}?key=${syncKey}&organizationId=${org.id}&mode=daily`;
          const res = await fetch(url, { method: "GET" });
          const ok = res.ok;
          return { orgId: org.id, status: res.status, ok };
        } catch (e: any) {
          return { orgId: org.id, error: e?.message || String(e) };
        }
      },
      CONCURRENCY
    );

    summary.platforms[p.db] = {
      orgsTotal: orgs.length,
      results,
    };
  }

  return NextResponse.json({
    ok: true,
    runtimeMs: Date.now() - startedAt,
    ...summary,
  });
}
