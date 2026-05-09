// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/cleanup-orphan-attributions?dryRun=1&key=Y
// ══════════════════════════════════════════════════════════════
// Detecta y borra pixel_attributions cuyo visitorId apunta a un
// PixelVisitor que ya NO existe (orphan, post cleanup-leads /
// wipe-account / reset-test-env). Tipo B (one-shot data repair).
//
// Causa de los orphans: operaciones admin que borraron pixel_visitors
// pero las pixel_attributions siguen apuntando a IDs inexistentes.
// Esto rompia /pixel/journeys con el error de Prisma:
//   "Inconsistent query result: Field visitor is required"
//
// dryRun=1 → cuenta cuantos borrarian sin tocar nada.
// Sin dryRun → borra los orphans.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
const KEY = "nitrosales-secret-key-2024-production";

async function handle(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const dryRun = url.searchParams.get("dryRun") === "1";

    const allowed = key === KEY ? true : await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Detectar orphans: pa.visitorId no existe en pixel_visitors
    const orphans = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        organizationId: string;
        visitorId: string;
        orderId: string;
        model: string;
      }>
    >(`
      SELECT pa."id", pa."organizationId", pa."visitorId", pa."orderId", pa."model"::text as "model"
      FROM "pixel_attributions" pa
      LEFT JOIN "pixel_visitors" pv ON pv."id" = pa."visitorId"
      WHERE pv."id" IS NULL
    `);

    // Group by org for diagnostic
    const byOrg: Record<string, number> = {};
    for (const o of orphans) {
      byOrg[o.organizationId] = (byOrg[o.organizationId] || 0) + 1;
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        wouldDelete: orphans.length,
        byOrg,
        sample: orphans.slice(0, 10),
      });
    }

    // Ejecutar el delete
    let deletedCount = 0;
    if (orphans.length > 0) {
      const orphanIds = orphans.map((o) => o.id);
      // Batch delete en chunks de 1000 para no saturar
      const CHUNK_SIZE = 1000;
      for (let i = 0; i < orphanIds.length; i += CHUNK_SIZE) {
        const chunk = orphanIds.slice(i, i + CHUNK_SIZE);
        const result = await prisma.$executeRawUnsafe(
          `DELETE FROM "pixel_attributions" WHERE "id" = ANY($1::text[])`,
          chunk
        );
        deletedCount += Number(result);
      }
    }

    return NextResponse.json({
      ok: true,
      dryRun: false,
      deletedCount,
      byOrg,
    });
  } catch (err: any) {
    console.error("[cleanup-orphan-attributions] error:", err);
    return NextResponse.json(
      { error: err.message, stack: err.stack?.slice(0, 500) },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
