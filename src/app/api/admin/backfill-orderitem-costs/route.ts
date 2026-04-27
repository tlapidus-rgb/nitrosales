// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/backfill-orderitem-costs?orgId=X
// ══════════════════════════════════════════════════════════════
// Cuando el backfill VTEX crea OrderItems, snapshot-ea Product.costPrice
// al momento de la creacion. PERO Product.costPrice se popula DESPUES por
// catalog-refresh (Pricing API). Resultado: OrderItem.costPrice queda NULL
// aunque Product.costPrice tenga valor.
//
// Este endpoint actualiza retroactivamente: OrderItem.costPrice =
// Product.costPrice donde OrderItem.costPrice IS NULL y Product.costPrice
// IS NOT NULL.
//
// Solo afecta orgs donde corrio catalog-refresh DESPUES del backfill
// inicial — caso real S58 con EMDJ.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const KEY = "nitrosales-secret-key-2024-production";

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const allowed = key === KEY ? true : await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const orgId = url.searchParams.get("orgId");
    if (!orgId) return NextResponse.json({ error: "orgId requerido" }, { status: 400 });

    // Antes
    const before: any = await prisma.$queryRawUnsafe(
      `SELECT
         COUNT(*)::int as total,
         COUNT(*) FILTER (WHERE oi."costPrice" IS NULL)::int as no_cost,
         COUNT(*) FILTER (WHERE oi."costPrice" IS NOT NULL)::int as with_cost
       FROM "order_items" oi
       INNER JOIN "orders" o ON oi."orderId" = o."id"
       WHERE o."organizationId" = $1`,
      orgId
    );

    // UPDATE masivo: copiar Product.costPrice -> OrderItem.costPrice
    // donde OrderItem.costPrice IS NULL (no pisa valores ya seteados).
    const result: any = await prisma.$queryRawUnsafe(
      `UPDATE "order_items" oi
       SET "costPrice" = p."costPrice"
       FROM "products" p,
            "orders" o
       WHERE oi."productId" = p."id"
         AND oi."orderId" = o."id"
         AND o."organizationId" = $1
         AND oi."costPrice" IS NULL
         AND p."costPrice" IS NOT NULL
       RETURNING oi."id"`,
      orgId
    );
    const updated = Array.isArray(result) ? result.length : 0;

    // Despues
    const after: any = await prisma.$queryRawUnsafe(
      `SELECT
         COUNT(*)::int as total,
         COUNT(*) FILTER (WHERE oi."costPrice" IS NULL)::int as no_cost,
         COUNT(*) FILTER (WHERE oi."costPrice" IS NOT NULL)::int as with_cost
       FROM "order_items" oi
       INNER JOIN "orders" o ON oi."orderId" = o."id"
       WHERE o."organizationId" = $1`,
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
    console.error("[backfill-orderitem-costs] fatal:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
