// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/control/debug-errors
// ══════════════════════════════════════════════════════════════
// Helper temporal para que Tomy pueda ver que contienen los lastSyncError
// de cada conexion en la DB. Solo isInternalUser.
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function GET() {
  const allowed = await isInternalUser();
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const conns = await prisma.connection.findMany({
    select: {
      id: true,
      platform: true,
      status: true,
      lastSyncAt: true,
      lastSuccessfulSyncAt: true,
      lastSyncError: true,
      updatedAt: true,
      organization: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const now = Date.now();
  return NextResponse.json({
    ok: true,
    connections: conns.map((c) => ({
      org: c.organization.name,
      platform: c.platform,
      status: c.status,
      lastSyncAt: c.lastSyncAt ? c.lastSyncAt.toISOString() : null,
      minsSinceSync: c.lastSyncAt
        ? Math.floor((now - c.lastSyncAt.getTime()) / 60000)
        : null,
      lastSuccessfulSyncAt: c.lastSuccessfulSyncAt
        ? c.lastSuccessfulSyncAt.toISOString()
        : null,
      minsSinceSuccess: c.lastSuccessfulSyncAt
        ? Math.floor((now - c.lastSuccessfulSyncAt.getTime()) / 60000)
        : null,
      lastSyncError: c.lastSyncError,
    })),
  });
}
