// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/connection-status?key=Y
// ══════════════════════════════════════════════════════════════
// Devuelve por cada Connection VTEX activa:
//   - orgId + orgName
//   - lastSuccessfulSyncAt (cuando corrio sync sin error la ultima vez)
//   - lastSyncAt (cualquier intento)
//   - lastSyncError (si el ultimo fallo)
//   - createdAt (cuando se conecto la org)
//
// Sirve para diagnosticar por que TVC perdia ordenes y EMDJ no — ver
// si el cron diario corrio igual para ambas.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
const KEY = "nitrosales-secret-key-2024-production";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const platform = url.searchParams.get("platform") || "VTEX";

    const allowed = key === KEY ? true : await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const conns = await prisma.connection.findMany({
      where: { platform: platform as any },
      include: { organization: { select: { name: true, slug: true } } },
      orderBy: { lastSuccessfulSyncAt: "desc" },
    });

    const now = Date.now();

    return NextResponse.json({
      ok: true,
      platform,
      total: conns.length,
      connections: conns.map((c) => {
        const lastOk = c.lastSuccessfulSyncAt ? new Date(c.lastSuccessfulSyncAt) : null;
        const lastAny = c.lastSyncAt ? new Date(c.lastSyncAt) : null;
        const minutesSinceLastOk = lastOk ? Math.round((now - lastOk.getTime()) / 60000) : null;
        const hoursSinceLastOk = minutesSinceLastOk !== null ? Math.round(minutesSinceLastOk / 60 * 10) / 10 : null;
        return {
          orgId: c.organizationId,
          orgName: c.organization?.name || "(unknown)",
          orgSlug: c.organization?.slug,
          status: c.status,
          createdAt: c.createdAt.toISOString(),
          lastSuccessfulSyncAt: lastOk?.toISOString() || null,
          lastSyncAt: lastAny?.toISOString() || null,
          lastSyncError: c.lastSyncError,
          minutesSinceLastOk,
          hoursSinceLastOk,
          health: minutesSinceLastOk === null
            ? "never_synced"
            : minutesSinceLastOk < 60
              ? "ok"
              : minutesSinceLastOk < 24 * 60
                ? "stale_<24h"
                : "stale_>24h",
        };
      }),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, stack: err.stack?.slice(0, 500) }, { status: 500 });
  }
}
