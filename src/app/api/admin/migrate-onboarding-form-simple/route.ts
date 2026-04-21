// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/migrate-onboarding-form-simple
// ══════════════════════════════════════════════════════════════
// Adapta onboarding_requests al form publico simplificado:
//   - Agrega referralSource TEXT (de donde nos conocio)
//   - Agrega notes TEXT (texto libre opcional del postulante)
//   - Hace opcionales los campos que ahora se piden adentro del producto:
//     proposedSlug, storeUrl, timezone, currency
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

    const addCol = async (col: string, def: string) => {
      try {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "onboarding_requests" ADD COLUMN IF NOT EXISTS "${col}" ${def}`
        );
        log.push(`✓ ADD COLUMN ${col}`);
      } catch (e: any) {
        log.push(`x ADD ${col}: ${e.message}`);
      }
    };

    const dropNotNull = async (col: string) => {
      try {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "onboarding_requests" ALTER COLUMN "${col}" DROP NOT NULL`
        );
        log.push(`✓ DROP NOT NULL ${col}`);
      } catch (e: any) {
        log.push(`? DROP NOT NULL ${col}: ${e.message}`);
      }
    };

    // 1. Nuevos campos del form simple
    await addCol("referralSource", "TEXT");
    await addCol("notes", "TEXT");

    // 2. Campos que dejan de ser requeridos en el form publico
    //    (se completan adentro del producto en el wizard)
    await dropNotNull("proposedSlug");
    await dropNotNull("storeUrl");
    await dropNotNull("timezone");
    await dropNotNull("currency");

    return NextResponse.json({ ok: true, log });
  } catch (error: any) {
    console.error("[migrate-onboarding-form-simple] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
