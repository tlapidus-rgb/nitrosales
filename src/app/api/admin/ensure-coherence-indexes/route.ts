// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/ensure-coherence-indexes?key=Y
// ══════════════════════════════════════════════════════════════
// Crea indices que aceleran las queries del contrato data-coherence
// (introducidas en S60 EXT-2 BIS+++++++). Idempotente — usa
// CREATE INDEX IF NOT EXISTS asi se puede correr varias veces sin
// romper. NO modifica data, solo indices.
//
// Indices que crea:
//   - pixel_attributions(organizationId, model) — para filtros pa.organizationId + pa.model
//   - pixel_attributions(orderId) — para JOIN pa.orderId = o.id (NO existe hoy, solo unique con model)
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const KEY = "nitrosales-secret-key-2024-production";

const INDEXES = [
  {
    name: "pixel_attributions_orgId_model_idx",
    sql: `CREATE INDEX IF NOT EXISTS "pixel_attributions_orgId_model_idx" ON "pixel_attributions" ("organizationId", "model")`,
    purpose: "Acelera filtros pa.organizationId + pa.model (CTE visitor_to_orders en query #23)",
  },
  {
    name: "pixel_attributions_orderId_model_idx",
    sql: `CREATE INDEX IF NOT EXISTS "pixel_attributions_orderId_model_idx" ON "pixel_attributions" ("orderId", "model")`,
    purpose: "Acelera JOIN pa.orderId = o.id + filtro por model (funnel con channel)",
  },
  {
    name: "pixel_attributions_orgId_visitorId_idx",
    sql: `CREATE INDEX IF NOT EXISTS "pixel_attributions_orgId_visitorId_idx" ON "pixel_attributions" ("organizationId", "visitorId")`,
    purpose: "Acelera lookups de attributions por visitor (drill-down, reextract)",
  },
];

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    if (key !== KEY) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const results: Array<{ name: string; ok: boolean; ms: number; error?: string }> = [];

    for (const idx of INDEXES) {
      const start = Date.now();
      try {
        await prisma.$executeRawUnsafe(idx.sql);
        results.push({ name: idx.name, ok: true, ms: Date.now() - start });
      } catch (e: any) {
        results.push({
          name: idx.name,
          ok: false,
          ms: Date.now() - start,
          error: e.message,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      total: INDEXES.length,
      created_or_exists: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack?.slice(0, 500) }, { status: 500 });
  }
}
