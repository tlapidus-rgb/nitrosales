// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/admin/migrate-team-invitations-fase7
// ═══════════════════════════════════════════════════════════════════
// Fase 7 — Configuracion. Crea la tabla `team_invitations` para
// invitaciones pendientes por email. Los miembros activos ya viven en
// `users` con `organizationId` — esta tabla guarda SOLO las pendientes
// (token + expiracion).
//
// Flujo:
//   1. Owner/Admin invita por email → POST crea fila PENDING + envia email.
//   2. El invitado recibe link con token → accede al flujo de set-password.
//   3. Al completar → crea User con organizationId + rol + marca PENDING→ACCEPTED.
//   4. Cron diario marca EXPIRED las que pasaron expiresAt sin accept.
//
// White-label (logo, industry, timezone, primaryColor) va en
// `organizations.settings.whiteLabel` JSON — sin migracion adicional.
//
// ORDEN DE MIGRACIONES (CLAUDE.md regla #13 / error #S36):
//   1. Este endpoint se pushea PRIMERO (sin tocar schema.prisma).
//   2. Tomy lo ejecuta manualmente con la key.
//   3. Luego en 7b se agrega el modelo a `schema.prisma`.
//
// Uso:
//   curl "https://nitrosales.vercel.app/api/admin/migrate-team-invitations-fase7?key=<NEXTAUTH_SECRET>"
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
    // 1. Tabla `team_invitations`
    //
    //    Columnas:
    //      id             TEXT PK (cuid)
    //      organizationId TEXT FK -> organizations(id) ON DELETE CASCADE
    //      email          TEXT NOT NULL (lowercase, validar en app layer)
    //      token          TEXT NOT NULL UNIQUE (UUID sin guiones)
    //      role           TEXT NOT NULL ('OWNER'|'ADMIN'|'MEMBER')
    //      status         TEXT NOT NULL default 'PENDING'
    //                     ('PENDING'|'ACCEPTED'|'EXPIRED'|'REVOKED')
    //      invitedById    TEXT FK -> users(id) — quien invito
    //      expiresAt      TIMESTAMP NOT NULL (default +7 dias via app)
    //      acceptedAt     TIMESTAMP nullable
    //      acceptedUserId TEXT FK -> users(id) nullable
    //      note           TEXT nullable (mensaje opcional al invitado)
    //      createdAt      TIMESTAMP NOT NULL default NOW()
    //      updatedAt      TIMESTAMP NOT NULL default NOW()
    // ─────────────────────────────────────────────────────────────
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "team_invitations" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "organizationId" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "token" TEXT NOT NULL UNIQUE,
        "role" TEXT NOT NULL DEFAULT 'MEMBER',
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "invitedById" TEXT,
        "expiresAt" TIMESTAMP(3) NOT NULL,
        "acceptedAt" TIMESTAMP(3),
        "acceptedUserId" TEXT,
        "note" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // ─────────────────────────────────────────────────────────────
    // 2. Indices
    //    - org_idx: listar invitaciones por organizacion
    //    - org_status_idx: filtrar por estado dentro de la org
    //    - token_unique: ya UNIQUE arriba
    //    - org_email_pending_unique: solo 1 invitacion PENDING por email
    //                                dentro de una org (parcial unique)
    // ─────────────────────────────────────────────────────────────
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "team_invitations_org_idx"
      ON "team_invitations"("organizationId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "team_invitations_org_status_idx"
      ON "team_invitations"("organizationId", "status");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "team_invitations_email_idx"
      ON "team_invitations"("email");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "team_invitations_org_email_pending_unique"
      ON "team_invitations"("organizationId", "email")
      WHERE "status" = 'PENDING';
    `);

    // ─────────────────────────────────────────────────────────────
    // 3. FK a organizations (ignora si ya existe)
    // ─────────────────────────────────────────────────────────────
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "team_invitations"
          ADD CONSTRAINT "team_invitations_organizationId_fkey"
          FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
          ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // FK a users (invitedBy) — SET NULL si el user es borrado
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "team_invitations"
          ADD CONSTRAINT "team_invitations_invitedById_fkey"
          FOREIGN KEY ("invitedById") REFERENCES "users"("id")
          ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // ─────────────────────────────────────────────────────────────
    // 4. Sanity check
    // ─────────────────────────────────────────────────────────────
    const countRows = await prisma.$queryRawUnsafe<
      Array<{ count: bigint }>
    >(`SELECT COUNT(*)::bigint AS count FROM "team_invitations"`);
    const existingCount = Number(countRows?.[0]?.count ?? 0);

    return NextResponse.json({
      ok: true,
      message:
        "Tabla team_invitations lista (idempotente). White-label vive en organizations.settings.whiteLabel JSON — sin migracion adicional.",
      existingCount,
      validRoles: ["OWNER", "ADMIN", "MEMBER"],
      validStatuses: ["PENDING", "ACCEPTED", "EXPIRED", "REVOKED"],
    });
  } catch (error: any) {
    console.error("[migrate-team-invitations-fase7] error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: String(error?.message ?? error),
      },
      { status: 500 }
    );
  }
}
