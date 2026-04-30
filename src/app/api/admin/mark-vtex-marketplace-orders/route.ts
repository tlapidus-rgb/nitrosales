// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/mark-vtex-marketplace-orders?orgId=X&key=Y
// ══════════════════════════════════════════════════════════════
// One-shot reparativo: marca como "marketplace" las orders VTEX
// cuyo externalId empieza con FVG- (Fravega) o BPR- (Banco Provincia).
//
// Setea:
//   - channel = 'marketplace'
//   - trafficSource = 'Marketplace'
//
// Esto hace que las queries de pixel (cobertura, atribucion, etc)
// las excluyan correctamente del calculo. Sin esto, esos 8k+ pedidos
// de TVC se contaban como "pedidos web" → cobertura aparece en 1%
// cuando en realidad esos pedidos nunca pueden tener atribucion del
// pixel (son ventas en Fravega/BPR, no en la web propia).
//
// Idempotente: skip orders ya marcadas.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const KEY = "nitrosales-secret-key-2024-production";

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const orgId = url.searchParams.get("orgId");
    const dryRun = url.searchParams.get("dryRun") === "1";

    const allowed = key === KEY ? true : await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!orgId) return NextResponse.json({ error: "orgId requerido" }, { status: 400 });

    // Contar antes
    const beforeStats: any[] = await prisma.$queryRawUnsafe(
      `SELECT
         COUNT(*) FILTER (WHERE "externalId" LIKE 'FVG-%')::int as fvg_total,
         COUNT(*) FILTER (WHERE "externalId" LIKE 'FVG-%' AND "channel" = 'marketplace')::int as fvg_already_marked,
         COUNT(*) FILTER (WHERE "externalId" LIKE 'BPR-%')::int as bpr_total,
         COUNT(*) FILTER (WHERE "externalId" LIKE 'BPR-%' AND "channel" = 'marketplace')::int as bpr_already_marked
       FROM "orders"
       WHERE "organizationId" = $1 AND "source" = 'VTEX'`,
      orgId,
    );

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        orgId,
        dryRun: true,
        wouldUpdate: {
          fvg: Number(beforeStats[0]?.fvg_total || 0) - Number(beforeStats[0]?.fvg_already_marked || 0),
          bpr: Number(beforeStats[0]?.bpr_total || 0) - Number(beforeStats[0]?.bpr_already_marked || 0),
        },
        before: beforeStats[0],
        elapsedMs: Date.now() - startTime,
        note: "Dry-run. Repeti sin ?dryRun=1 para aplicar.",
      });
    }

    // Aplicar update en batch
    const updatedFvg = await prisma.$executeRawUnsafe(
      `UPDATE "orders"
       SET "channel" = 'marketplace', "trafficSource" = 'Marketplace', "updatedAt" = NOW()
       WHERE "organizationId" = $1
         AND "source" = 'VTEX'
         AND "externalId" LIKE 'FVG-%'
         AND ("channel" IS DISTINCT FROM 'marketplace' OR "trafficSource" IS DISTINCT FROM 'Marketplace')`,
      orgId,
    );

    const updatedBpr = await prisma.$executeRawUnsafe(
      `UPDATE "orders"
       SET "channel" = 'marketplace', "trafficSource" = 'Marketplace', "updatedAt" = NOW()
       WHERE "organizationId" = $1
         AND "source" = 'VTEX'
         AND "externalId" LIKE 'BPR-%'
         AND ("channel" IS DISTINCT FROM 'marketplace' OR "trafficSource" IS DISTINCT FROM 'Marketplace')`,
      orgId,
    );

    return NextResponse.json({
      ok: true,
      orgId,
      updated: {
        fvg: Number(updatedFvg),
        bpr: Number(updatedBpr),
        total: Number(updatedFvg) + Number(updatedBpr),
      },
      before: beforeStats[0],
      elapsedMs: Date.now() - startTime,
      note: "Orders FVG y BPR marcadas como marketplace. Recarga /pixel/analytics para ver el cambio en cobertura.",
    });
  } catch (err: any) {
    console.error("[mark-vtex-marketplace-orders] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
