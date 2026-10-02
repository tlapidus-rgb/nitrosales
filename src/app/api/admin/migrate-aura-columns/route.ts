// ═══════════════════════════════════════════════════════════════════
// /api/admin/migrate-aura-columns
// ═══════════════════════════════════════════════════════════════════
// Endpoint idempotente para agregar columnas de la reestructuración
// deals → campañas:
//   - influencer_campaigns.isAlwaysOn
//   - influencer_deals.excludeFromCommission
//
// Uso:
//   con sesión de staff, abrir logueado: https://nitrosales.vercel.app/api/admin/migrate-aura-columns
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    if (!(await isInternalUser())) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // 1. isAlwaysOn en influencer_campaigns
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "influencer_campaigns"
        ADD COLUMN IF NOT EXISTS "isAlwaysOn" BOOLEAN NOT NULL DEFAULT false;
    `);

    // 2. excludeFromCommission en influencer_deals
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "influencer_deals"
        ADD COLUMN IF NOT EXISTS "excludeFromCommission" BOOLEAN NOT NULL DEFAULT false;
    `);

    return NextResponse.json({
      ok: true,
      columns: [
        "influencer_campaigns.isAlwaysOn",
        "influencer_deals.excludeFromCommission",
      ],
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
