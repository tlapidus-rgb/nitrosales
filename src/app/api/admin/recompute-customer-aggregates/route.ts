// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/recompute-customer-aggregates?orgId=X
// ══════════════════════════════════════════════════════════════
// El backfill inserta customers con totalOrders=1, totalSpent=0,
// firstOrderAt/lastOrderAt = orderDate (de la PRIMER orden que vio).
// Pero como el backfill procesa orders en chunks paralelos, esos
// agregados quedan inconsistentes (no reflejan TODAS las orders).
//
// Este endpoint recalcula desde cero:
//   - totalOrders = count(orders del customer)
//   - totalSpent = sum(orders.totalValue) excluyendo CANCELLED
//   - firstOrderAt = min(orders.orderDate)
//   - lastOrderAt = max(orders.orderDate)
//
// Hace 1 sola query masiva con UPDATE FROM (subselect). Eficiente
// para 10k+ customers.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const orgId = new URL(req.url).searchParams.get("orgId");
    if (!orgId) return NextResponse.json({ error: "orgId requerido" }, { status: 400 });

    // Antes y despues — para mostrar el delta
    const before: any = await prisma.$queryRawUnsafe(
      `SELECT
         COUNT(*)::int as total,
         COUNT(*) FILTER (WHERE "totalOrders" = 0)::int as zero_orders,
         COUNT(*) FILTER (WHERE "totalSpent" = 0)::int as zero_spent,
         COUNT(*) FILTER (WHERE "firstOrderAt" IS NULL)::int as no_first_order,
         COUNT(*) FILTER (WHERE "lastOrderAt" IS NULL)::int as no_last_order
       FROM "customers" WHERE "organizationId" = $1`,
      orgId
    );

    // UPDATE masivo: recalcula agregados desde la tabla orders.
    // Solo cuenta orders NO canceladas (CANCELLED no contribuye a LTV/totalSpent).
    // totalOrders incluye TODAS para reflejar el comportamiento del customer.
    const result: any = await prisma.$queryRawUnsafe(
      `WITH agg AS (
         SELECT
           o."customerId",
           COUNT(*)::int AS cnt,
           COALESCE(SUM(CASE WHEN o."status" != 'CANCELLED' THEN o."totalValue" ELSE 0 END), 0) AS spent,
           MIN(o."orderDate") AS first_at,
           MAX(o."orderDate") AS last_at
         FROM "orders" o
         WHERE o."organizationId" = $1 AND o."customerId" IS NOT NULL
         GROUP BY o."customerId"
       )
       UPDATE "customers" c
       SET
         "totalOrders" = agg.cnt,
         "totalSpent" = agg.spent,
         "firstOrderAt" = agg.first_at,
         "lastOrderAt" = agg.last_at,
         "updatedAt" = NOW()
       FROM agg
       WHERE c."id" = agg."customerId" AND c."organizationId" = $1
       RETURNING c."id"`,
      orgId
    );
    const updated = Array.isArray(result) ? result.length : 0;

    const after: any = await prisma.$queryRawUnsafe(
      `SELECT
         COUNT(*)::int as total,
         COUNT(*) FILTER (WHERE "totalOrders" = 0)::int as zero_orders,
         COUNT(*) FILTER (WHERE "totalSpent" = 0)::int as zero_spent,
         AVG("totalOrders")::float as avg_orders,
         AVG("totalSpent")::float as avg_spent,
         MAX("totalOrders")::int as max_orders,
         MAX("totalSpent")::float as max_spent
       FROM "customers" WHERE "organizationId" = $1`,
      orgId
    );

    return NextResponse.json({
      ok: true,
      orgId,
      durationMs: Date.now() - t0,
      updated,
      before: before[0],
      after: after[0],
    });
  } catch (err: any) {
    console.error("[recompute-customer-aggregates] fatal:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
