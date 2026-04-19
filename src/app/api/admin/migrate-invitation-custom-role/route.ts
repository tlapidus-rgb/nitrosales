// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/admin/migrate-invitation-custom-role
// ═══════════════════════════════════════════════════════════════════
// Fix bug reportado: al invitar miembro no aparecen los custom roles.
// Agrega team_invitations.customRoleId (FK nullable a custom_roles).
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
      ALTER TABLE "team_invitations"
      ADD COLUMN IF NOT EXISTS "customRoleId" TEXT;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "team_invitations_customRoleId_idx"
      ON "team_invitations"("customRoleId");
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "team_invitations"
          ADD CONSTRAINT "team_invitations_customRoleId_fkey"
          FOREIGN KEY ("customRoleId") REFERENCES "custom_roles"("id")
          ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    return NextResponse.json({
      ok: true,
      message:
        "team_invitations.customRoleId listo. Ahora se puede asignar un custom role al invitar.",
    });
  } catch (error: any) {
    console.error("[migrate-invitation-custom-role] error:", error);
    return NextResponse.json(
      { ok: false, error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
