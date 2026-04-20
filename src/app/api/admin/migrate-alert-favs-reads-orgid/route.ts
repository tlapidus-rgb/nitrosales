// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/admin/migrate-alert-favs-reads-orgid — Sesión 53 BP-MT-002
// ═══════════════════════════════════════════════════════════════════
// Multi-tenant fix: agrega columna organizationId a:
//  - user_alert_favorites
//  - user_alert_reads
//
// Backfill: para rows existentes, setea organizationId = el orgId del user
// (users.organizationId). En single-tenant hoy, todos los rows van a
// MdJ. Una vez entre Arredo, los rows nuevos tomarán su orgId correcto.
//
// Indices:
//  - Drop UNIQUE (userId, alertId) viejo
//  - CREATE UNIQUE (userId, alertId, organizationId) nuevo
//  - INDEX (organizationId) para queries
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

    const results: string[] = [];

    // ─── user_alert_favorites ──────────────────────────────────
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "user_alert_favorites"
      ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
    `);
    results.push("favorites: column added");

    // Backfill desde users.organizationId
    const favBackfill = await prisma.$executeRawUnsafe(`
      UPDATE "user_alert_favorites" uf
      SET "organizationId" = u."organizationId"
      FROM "users" u
      WHERE uf."userId" = u."id"
        AND uf."organizationId" IS NULL
    `);
    results.push(`favorites: backfilled ${favBackfill} rows`);

    // Make NOT NULL después del backfill
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "user_alert_favorites"
      ALTER COLUMN "organizationId" SET NOT NULL;
    `).catch(() => {
      // Si falla (ya es NOT NULL o hay rows null), log y continue
      results.push("favorites: NOT NULL already set or has null rows");
    });

    // Drop unique viejo + create nuevo con orgId
    await prisma.$executeRawUnsafe(`
      DROP INDEX IF EXISTS "user_alert_favorites_userId_alertId_key";
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "user_alert_favorites_userId_alertId_orgId_key"
      ON "user_alert_favorites"("userId", "alertId", "organizationId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "user_alert_favorites_organizationId_idx"
      ON "user_alert_favorites"("organizationId");
    `);

    // FK a organizations con cascade
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "user_alert_favorites"
          ADD CONSTRAINT "user_alert_favorites_organizationId_fkey"
          FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
          ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    results.push("favorites: indices + FK organizations OK");

    // ─── user_alert_reads ──────────────────────────────────────
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "user_alert_reads"
      ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
    `);
    results.push("reads: column added");

    const readBackfill = await prisma.$executeRawUnsafe(`
      UPDATE "user_alert_reads" ur
      SET "organizationId" = u."organizationId"
      FROM "users" u
      WHERE ur."userId" = u."id"
        AND ur."organizationId" IS NULL
    `);
    results.push(`reads: backfilled ${readBackfill} rows`);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "user_alert_reads"
      ALTER COLUMN "organizationId" SET NOT NULL;
    `).catch(() => {
      results.push("reads: NOT NULL already set or has null rows");
    });

    await prisma.$executeRawUnsafe(`
      DROP INDEX IF EXISTS "user_alert_reads_userId_alertId_key";
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "user_alert_reads_userId_alertId_orgId_key"
      ON "user_alert_reads"("userId", "alertId", "organizationId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "user_alert_reads_organizationId_idx"
      ON "user_alert_reads"("organizationId");
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "user_alert_reads"
          ADD CONSTRAINT "user_alert_reads_organizationId_fkey"
          FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
          ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    results.push("reads: indices + FK organizations OK");

    return NextResponse.json({
      ok: true,
      message: "Multi-tenant: organizationId agregado a user_alert_favorites y user_alert_reads",
      results,
    });
  } catch (error: any) {
    console.error("[migrate-alert-favs-reads-orgid] error:", error);
    return NextResponse.json(
      { ok: false, error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
