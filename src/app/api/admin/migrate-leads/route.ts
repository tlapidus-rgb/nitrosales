// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/migrate-leads
// ══════════════════════════════════════════════════════════════
// Crea tabla `leads` para prospects manuales que Tomy carga ANTES
// de que el cliente complete el form publico /onboarding.
//
// Etapas del funnel:
//   1. LEAD (manual) — Tomy lo agrega aca, todavia no tiene onboarding_request
//   2. CONTACTADO — Tomy le mando el link
//   3. POSTULADO — completo el form (pasa a tabla onboarding_requests)
//   4-6. resto del flow ya en onboarding_requests
//
// Cuando un lead se convierte en postulacion, se linkea via convertedToOnboardingId.
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const log: string[] = [];

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "leads" (
        "id" TEXT PRIMARY KEY,
        "companyName" TEXT NOT NULL,
        "contactName" TEXT,
        "contactEmail" TEXT,
        "contactPhone" TEXT,
        "industry" TEXT,
        "estimatedMonthlyOrders" INTEGER,
        "source" TEXT,
        "notes" TEXT,
        "status" TEXT NOT NULL DEFAULT 'LEAD',
        "lastContactedAt" TIMESTAMP(3),
        "lastEmailSentAt" TIMESTAMP(3),
        "convertedToOnboardingId" TEXT,
        "addedById" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    log.push("✓ tabla leads creada");

    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_leads_status" ON "leads" ("status")`
    );
    log.push("✓ index status");

    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_leads_email" ON "leads" ("contactEmail")`
    );
    log.push("✓ index email");

    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_leads_created" ON "leads" ("createdAt" DESC)`
    );
    log.push("✓ index createdAt DESC");

    return NextResponse.json({ ok: true, log });
  } catch (error: any) {
    console.error("[migrate-leads] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
