// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/migrate-email-log
// ══════════════════════════════════════════════════════════════
// Crea la tabla email_log que registra CADA intento de envío
// de email. Idempotente.
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
      CREATE TABLE IF NOT EXISTS "email_log" (
        "id" TEXT PRIMARY KEY,
        "toEmail" TEXT NOT NULL,
        "fromEmail" TEXT NOT NULL,
        "subject" TEXT NOT NULL,
        "htmlLength" INT NOT NULL DEFAULT 0,
        "ok" BOOLEAN NOT NULL,
        "resendId" TEXT,
        "errorMessage" TEXT,
        "httpStatus" INT,
        "durationMs" INT,
        "context" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    log.push("✓ Tabla email_log creada");

    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "email_log_created_idx" ON "email_log"("createdAt" DESC)`
    );
    log.push("✓ Index por createdAt DESC");

    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "email_log_to_idx" ON "email_log"("toEmail", "createdAt" DESC)`
    );
    log.push("✓ Index por destinatario");

    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "email_log_fails_idx" ON "email_log"("createdAt" DESC) WHERE "ok" = false`
    );
    log.push("✓ Index parcial para fallos");

    return NextResponse.json({ ok: true, log });
  } catch (error: any) {
    console.error("[migrate-email-log] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
