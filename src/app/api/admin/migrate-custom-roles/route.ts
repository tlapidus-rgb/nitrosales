// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/admin/migrate-custom-roles
// ═══════════════════════════════════════════════════════════════════
// Fase 7 QA - Custom roles per-org.
//
// Tabla `custom_roles`: roles definidos por el Owner/Admin para su org.
// Column `users.customRoleId`: FK opcional. Si esta seteada, los
// permisos del user se leen del custom role en vez de los defaults
// del base role (OWNER/ADMIN/MEMBER).
//
// Regla: el base role (users.role) sigue existiendo por compatibilidad
// con NextAuth y como "nivel inicial" cuando se invita. El custom role
// overridea SOLO la matriz de permisos — NO cambia el base role.
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
    // 1. Tabla custom_roles
    //    id, organizationId (FK CASCADE), name (display),
    //    slug (URL-safe unique por org), description, color, icon,
    //    permissions JSONB (Record<Section, AccessLevel>), isActive,
    //    createdById (FK SET NULL), createdAt, updatedAt.
    // ─────────────────────────────────────────────────────────────
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "custom_roles" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "organizationId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "slug" TEXT NOT NULL,
        "description" TEXT,
        "color" TEXT,
        "icon" TEXT,
        "permissions" JSONB NOT NULL DEFAULT '{}',
        "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
        "createdById" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Indices
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "custom_roles_org_idx"
      ON "custom_roles"("organizationId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "custom_roles_org_active_idx"
      ON "custom_roles"("organizationId", "isActive");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "custom_roles_org_slug_unique"
      ON "custom_roles"("organizationId", "slug");
    `);

    // FKs
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "custom_roles"
          ADD CONSTRAINT "custom_roles_organizationId_fkey"
          FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
          ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "custom_roles"
          ADD CONSTRAINT "custom_roles_createdById_fkey"
          FOREIGN KEY ("createdById") REFERENCES "users"("id")
          ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // ─────────────────────────────────────────────────────────────
    // 2. users.customRoleId (FK opcional a custom_roles)
    // ─────────────────────────────────────────────────────────────
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "customRoleId" TEXT;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "users_customRoleId_idx"
      ON "users"("customRoleId");
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "users"
          ADD CONSTRAINT "users_customRoleId_fkey"
          FOREIGN KEY ("customRoleId") REFERENCES "custom_roles"("id")
          ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // ─────────────────────────────────────────────────────────────
    // 3. Sanity check
    // ─────────────────────────────────────────────────────────────
    const countRows = await prisma.$queryRawUnsafe<
      Array<{ count: bigint }>
    >(`SELECT COUNT(*)::bigint AS count FROM "custom_roles"`);
    const existingCount = Number(countRows?.[0]?.count ?? 0);

    return NextResponse.json({
      ok: true,
      message:
        "Tabla custom_roles + users.customRoleId listas (idempotente).",
      existingCount,
    });
  } catch (error: any) {
    console.error("[migrate-custom-roles] error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: String(error?.message ?? error),
      },
      { status: 500 }
    );
  }
}
