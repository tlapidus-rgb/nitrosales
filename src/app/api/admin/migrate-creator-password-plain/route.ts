// ═══════════════════════════════════════════════════════════════════
// /api/admin/migrate-creator-password-plain
// ═══════════════════════════════════════════════════════════════════
// Agrega la columna "dashboardPasswordPlain" a la tabla influencers
// para que el admin pueda ver y reenviar la contraseña del creador.
//
// Uso:
//   con sesión de staff, abrir logueado: https://nitrosales.vercel.app/api/admin/migrate-creator-password-plain
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    if (!(await isInternalUser())) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "influencers"
      ADD COLUMN IF NOT EXISTS "dashboardPasswordPlain" TEXT;
    `);

    const result = await prisma.$queryRawUnsafe<any[]>(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'influencers' AND column_name = 'dashboardPasswordPlain';
    `);

    return NextResponse.json({ ok: true, column_added: result.length > 0 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
