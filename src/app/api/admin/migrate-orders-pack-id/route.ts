// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/migrate-orders-pack-id
// ══════════════════════════════════════════════════════════════
// Agrega columna "packId" (nullable text) a la tabla "orders" para
// dedupear carritos de MELI.
//
// MELI divide 1 carrito en N órdenes con el mismo pack_id. En la UI
// del vendedor aparece como 1 venta. Nuestro conteo inflaba (+15%
// aprox en cuentas con carritos). Solución: guardar pack_id y contar
// DISTINCT COALESCE(packId, externalId).
//
// SAFETY:
//   - Solo admins internos
//   - IDEMPOTENTE: ADD COLUMN IF NOT EXISTS
//   - No toca data existente
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await prisma.$executeRawUnsafe(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "packId" TEXT`);
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "orders_organizationId_packId_idx" ON "orders" ("organizationId", "packId") WHERE "packId" IS NOT NULL`
    );

    return NextResponse.json({ ok: true, migrated: ["orders.packId", "orders_organizationId_packId_idx"] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, stack: error.stack?.slice(0, 500) }, { status: 500 });
  }
}
