// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/admin/migrate-alert-reads — Fase 8e fix
// ═══════════════════════════════════════════════════════════════════
// Crea tabla user_alert_reads para trackear alertas leidas por user.
// Reemplaza el localStorage actual que no se sincroniza con AlertsBadge.
//
// Schema:
//   id         TEXT PK
//   userId     TEXT FK -> users.id
//   alertId    TEXT
//   readAt     TIMESTAMP
//
// Unique: (userId, alertId)
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    if (!key || key !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "user_alert_reads" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "alertId" TEXT NOT NULL,
        "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "user_alert_reads_userId_alertId_key"
      ON "user_alert_reads"("userId", "alertId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "user_alert_reads_userId_idx"
      ON "user_alert_reads"("userId");
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "user_alert_reads"
          ADD CONSTRAINT "user_alert_reads_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "users"("id")
          ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    return NextResponse.json({
      ok: true,
      message:
        "user_alert_reads listo. El badge del sidebar ahora refleja alertas no leidas del user.",
    });
  } catch (error: any) {
    console.error("[migrate-alert-reads] error:", error);
    return NextResponse.json(
      { ok: false, error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
