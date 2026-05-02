// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/repair-marketplace-flag?orgId=X&dryRun=1&key=Y
// ══════════════════════════════════════════════════════════════
// Repara el bug del enrichment historico que marcaba erroneamente
// ordenes web propia con trafficSource='Marketplace'.
//
// Criterio de "mal etiquetada":
//   - trafficSource = 'Marketplace'
//   - PERO externalId NO empieza con FVG- ni BPR-
//   - Y source != 'MELI'
//   - Y (channel IS NULL o channel != 'marketplace')
//
// Esas son web propia (channel='1' tipico VTEX) y el flag esta mal.
// Set trafficSource = NULL.
//
// Multi-tenant: sin orgId aplica a todas las orgs.
// dryRun=1 para preview.
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
    const orgId = url.searchParams.get("orgId");
    const dryRun = url.searchParams.get("dryRun") === "1";

    const allowed = key === KEY ? true : await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Buscar ordenes mal etiquetadas
    const targets = await prisma.$queryRawUnsafe<Array<{
      id: string;
      externalId: string;
      organizationId: string;
      source: string | null;
      channel: string | null;
    }>>(
      `SELECT id, "externalId", "organizationId", source, channel
       FROM orders
       WHERE ${orgId ? `"organizationId" = $1 AND` : ""}
         "trafficSource" = 'Marketplace'
         AND "externalId" NOT LIKE 'FVG-%'
         AND "externalId" NOT LIKE 'BPR-%'
         AND (source IS NULL OR source != 'MELI')
         AND (channel IS NULL OR channel != 'marketplace')`,
      ...(orgId ? [orgId] : []),
    );

    const byOrg: Record<string, number> = {};
    for (const t of targets) {
      byOrg[t.organizationId] = (byOrg[t.organizationId] || 0) + 1;
    }

    let updated = 0;
    if (!dryRun && targets.length > 0) {
      const ids = targets.map((t) => t.id);
      const result = await prisma.order.updateMany({
        where: { id: { in: ids } },
        data: { trafficSource: null },
      });
      updated = result.count;
    }

    return NextResponse.json({
      ok: true,
      orgId: orgId || "(all orgs)",
      dryRun,
      ordersFound: targets.length,
      ordersUpdated: updated,
      byOrg,
      sample: targets.slice(0, 10).map((t) => ({
        externalId: t.externalId,
        source: t.source,
        channel: t.channel,
      })),
      message: dryRun
        ? "Dry run completado. Volve a correr sin dryRun=1 para aplicar."
        : `Reparado trafficSource de ${updated} ordenes web propia (set a NULL).`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, stack: err.stack?.slice(0, 500) }, { status: 500 });
  }
}
