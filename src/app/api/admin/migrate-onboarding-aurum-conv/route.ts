// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/migrate-onboarding-aurum-conv
// ══════════════════════════════════════════════════════════════
// Crea la tabla onboarding_aurum_conversations que guarda el log
// de conversaciones entre el cliente y Aurum durante el onboarding.
//
// Por qué guardamos esto:
//   1. Auditoria / debug: ver que preguntan los clientes para mejorar
//      los tutoriales del wizard donde se traban mas.
//   2. Detectar plataformas con mas friccion.
//   3. Entrenar futuras mejoras del system prompt con data real.
//
// Schema:
//   - id (cuid)
//   - userId (quien chatea)
//   - organizationId (puede ser null si el onboarding esta en fase wizard
//     y aun no tiene org asignada — aunque en practica siempre tiene org
//     despues de la postulacion aprobada)
//   - onboardingRequestId (vincular con la postulacion)
//   - messages (jsonb array con role/content/images)
//   - lastPhase (que fase tenia el onboarding cuando conversaba)
//   - createdAt / updatedAt
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
      CREATE TABLE IF NOT EXISTS "onboarding_aurum_conversations" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "organizationId" TEXT,
        "onboardingRequestId" TEXT,
        "messages" JSONB NOT NULL DEFAULT '[]'::jsonb,
        "lastPhase" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    log.push("✓ tabla onboarding_aurum_conversations creada");

    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_obaurum_user" ON "onboarding_aurum_conversations" ("userId")`
    );
    log.push("✓ index userId");

    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_obaurum_org" ON "onboarding_aurum_conversations" ("organizationId")`
    );
    log.push("✓ index organizationId");

    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_obaurum_created" ON "onboarding_aurum_conversations" ("createdAt" DESC)`
    );
    log.push("✓ index createdAt DESC");

    return NextResponse.json({ ok: true, log });
  } catch (error: any) {
    console.error("[migrate-onboarding-aurum-conv] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
