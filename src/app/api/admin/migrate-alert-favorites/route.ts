// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/admin/migrate-alert-favorites — Fase 8e
// ═══════════════════════════════════════════════════════════════════
// Crea la tabla user_alert_favorites para marcar alertas como favoritas
// por usuario. Las favoritas se muestran primero en /alertas.
//
// Schema:
//   id          TEXT PK
//   userId      TEXT FK -> users.id
//   alertId     TEXT       (id unico de la alerta en el hub)
//   createdAt   TIMESTAMP
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
      CREATE TABLE IF NOT EXISTS "user_alert_favorites" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "alertId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "user_alert_favorites_userId_alertId_key"
      ON "user_alert_favorites"("userId", "alertId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "user_alert_favorites_userId_idx"
      ON "user_alert_favorites"("userId");
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "user_alert_favorites"
          ADD CONSTRAINT "user_alert_favorites_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "users"("id")
          ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    return NextResponse.json({
      ok: true,
      message:
        "user_alert_favorites listo. Ahora los users pueden marcar alertas como favoritas.",
    });
  } catch (error: any) {
    console.error("[migrate-alert-favorites] error:", error);
    return NextResponse.json(
      { ok: false, error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
