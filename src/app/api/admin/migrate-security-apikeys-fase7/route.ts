// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/admin/migrate-security-apikeys-fase7
// ═══════════════════════════════════════════════════════════════════
// Fase 7 QA - Seguridad + API Keys productivos.
//
// Crea dos tablas:
//   1. login_events  — historial de logins (success + failures)
//   2. api_keys      — tokens para integracion externa por org
//
// ORDEN (CLAUDE.md regla #13):
//   1. Este endpoint se pushea PRIMERO (sin tocar schema.prisma).
//   2. Tomy lo ejecuta manualmente con la key.
//   3. Luego en siguiente push se declara schema + UI + APIs.
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

    // ─────────────────────────────────────────────────────────────
    // 1. Tabla login_events
    //    id, userId (FK), success bool, ip, userAgent, location,
    //    failureReason, createdAt.
    // ─────────────────────────────────────────────────────────────
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "login_events" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT,
        "email" TEXT,
        "success" BOOLEAN NOT NULL DEFAULT TRUE,
        "ip" TEXT,
        "userAgent" TEXT,
        "location" TEXT,
        "failureReason" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "login_events_user_created_idx"
      ON "login_events"("userId", "createdAt" DESC);
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "login_events_email_idx"
      ON "login_events"("email");
    `);

    // FK con ON DELETE SET NULL — mantiene auditoria aunque borren user
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "login_events"
          ADD CONSTRAINT "login_events_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "users"("id")
          ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // ─────────────────────────────────────────────────────────────
    // 2. Tabla api_keys
    //    Cada token tiene prefix visible (ns_live_...) + hashed tail.
    //    scopes = JSON con lista de permisos (["read:orders", ...]).
    // ─────────────────────────────────────────────────────────────
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "api_keys" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "organizationId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "prefix" TEXT NOT NULL,
        "hashedToken" TEXT NOT NULL,
        "scopes" JSONB NOT NULL DEFAULT '[]',
        "lastUsedAt" TIMESTAMP(3),
        "expiresAt" TIMESTAMP(3),
        "createdById" TEXT,
        "revokedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "api_keys_org_idx"
      ON "api_keys"("organizationId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_hashedToken_unique"
      ON "api_keys"("hashedToken");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "api_keys_prefix_idx"
      ON "api_keys"("prefix");
    `);

    // FKs
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "api_keys"
          ADD CONSTRAINT "api_keys_organizationId_fkey"
          FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
          ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "api_keys"
          ADD CONSTRAINT "api_keys_createdById_fkey"
          FOREIGN KEY ("createdById") REFERENCES "users"("id")
          ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // Sanity check
    const [loginCount, apiKeyCount] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS count FROM "login_events"`
      ),
      prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS count FROM "api_keys"`
      ),
    ]);

    return NextResponse.json({
      ok: true,
      message:
        "Tablas login_events + api_keys listas (idempotentes).",
      counts: {
        loginEvents: Number(loginCount?.[0]?.count ?? 0),
        apiKeys: Number(apiKeyCount?.[0]?.count ?? 0),
      },
    });
  } catch (error: any) {
    console.error("[migrate-security-apikeys-fase7] error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: String(error?.message ?? error),
      },
      { status: 500 }
    );
  }
}
