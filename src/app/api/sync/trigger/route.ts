// ══════════════════════════════════════════════════════════════
// On-demand sync trigger — fires background sync for a platform
// Returns immediately; sync runs via waitUntil in background.
// ══════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/db/client";
import { getOrganization } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 min
const MIN_SYNC_GAP_MS = 2 * 60 * 1000; // 2 min — don't re-trigger if sync ran recently

const PLATFORM_MAP: Record<string, { dbPlatform: string; syncPath: string }> = {
  META: { dbPlatform: "META_ADS", syncPath: "/api/sync/meta" },
  GOOGLE: { dbPlatform: "GOOGLE_ADS", syncPath: "/api/sync/google-ads" },
};

export async function POST(req: NextRequest) {
  try {
    const org = await getOrganization();
    const platform = req.nextUrl.searchParams.get("platform")?.toUpperCase();

    if (!platform || !PLATFORM_MAP[platform]) {
      return NextResponse.json(
        { ok: false, error: "Platform must be META or GOOGLE" },
        { status: 400 }
      );
    }

    const { dbPlatform, syncPath } = PLATFORM_MAP[platform];

    // Check freshness — skip if recently synced
    const connection = await prisma.connection.findFirst({
      where: { organizationId: org.id, platform: dbPlatform as any },
      select: { lastSyncAt: true, lastSyncError: true },
    });

    const lastSync = connection?.lastSyncAt
      ? Date.now() - new Date(connection.lastSyncAt).getTime()
      : Infinity;

    // If synced less than 2 min ago, skip (probably still running or just finished)
    if (lastSync < MIN_SYNC_GAP_MS) {
      return NextResponse.json({
        ok: true,
        syncStarted: false,
        reason: "recently_synced",
        lastSyncAgo: Math.round(lastSync / 1000),
      });
    }

    // Check if a sync lock is active (VTEX Connection has LOCK: prefix)
    const lockCheck = await prisma.connection.findFirst({
      where: { organizationId: org.id, platform: "VTEX" as any },
      select: { lastSyncError: true, lastSyncAt: true },
    });
    if (
      lockCheck?.lastSyncError?.startsWith("LOCK:") &&
      lockCheck.lastSyncAt &&
      Date.now() - new Date(lockCheck.lastSyncAt).getTime() < 5 * 60 * 1000
    ) {
      return NextResponse.json({
        ok: true,
        syncStarted: false,
        reason: "sync_locked",
      });
    }

    // Fire-and-forget: trigger sync in background
    const syncKey = process.env.NEXTAUTH_SECRET || "";
    const baseUrl = process.env.NEXTAUTH_URL || "https://app.nitrosales.ai";
    const syncUrl = `${baseUrl}${syncPath}?key=${encodeURIComponent(syncKey)}`;

    waitUntil(
      fetch(syncUrl, { method: "GET" })
        .then((res) => {
          console.log(`[sync/trigger] ${platform} sync completed: ${res.status}`);
        })
        .catch((err) => {
          console.error(`[sync/trigger] ${platform} sync failed:`, err.message);
        })
    );

    return NextResponse.json({
      ok: true,
      syncStarted: true,
      platform,
      lastSyncAgo: lastSync === Infinity ? null : Math.round(lastSync / 1000),
    });
  } catch (error: any) {
    console.error("[sync/trigger] Error:", error.message);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}

// Also support GET for simplicity
export async function GET(req: NextRequest) {
  return POST(req);
}
