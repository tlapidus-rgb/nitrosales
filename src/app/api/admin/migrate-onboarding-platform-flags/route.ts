// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/migrate-onboarding-platform-flags
// ══════════════════════════════════════════════════════════════
// Agrega columnas boolean usesXxx al onboarding_requests para que
// el form publico corto pueda indicar qué plataformas usa el cliente
// sin pedir credenciales. Las credenciales se completan despues en
// el wizard /setup dentro del producto.
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
        log.push(`✓ onboarding_requests.${col}`);
      } catch (e: any) {
        log.push(`x ${col}: ${e.message}`);
      }
    };

    await addCol("usesVtex", "BOOLEAN DEFAULT FALSE");
    await addCol("usesMl", "BOOLEAN DEFAULT FALSE");
    await addCol("usesMeta", "BOOLEAN DEFAULT FALSE");
    await addCol("usesMetaPixel", "BOOLEAN DEFAULT FALSE");
    await addCol("usesGoogle", "BOOLEAN DEFAULT FALSE");

    return NextResponse.json({ ok: true, log });
  } catch (error: any) {
    console.error("[migrate-onboarding-platform-flags] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
