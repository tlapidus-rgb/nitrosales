// ═══════════════════════════════════════════════════════════════════
// /api/admin/migrate-ad-creative-metadata
// ═══════════════════════════════════════════════════════════════════
// Idempotente: agrega columna ad_creatives.metadata (JSONB) a Neon.
// Soporta headlines[], descriptions[], keywords[], finalUrls[] por
// cada creativo Google. Uso:
//   con sesión de staff, abrir logueado: https://nitrosales.vercel.app/api/admin/migrate-ad-creative-metadata
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

    const existing: Array<{ column_name: string }> = await prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'ad_creatives' AND column_name = 'metadata'`
    );
    const alreadyExisted = existing.length > 0;

    await prisma.$executeRawUnsafe(
      `ALTER TABLE "ad_creatives" ADD COLUMN IF NOT EXISTS "metadata" JSONB`
    );

    const after: Array<{ column_name: string }> = await prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'ad_creatives' AND column_name = 'metadata'`
    );

    return NextResponse.json({
      ok: true,
      alreadyExisted,
      columnExistsNow: after.length > 0,
      message: alreadyExisted
        ? "La columna metadata ya existia."
        : "Columna metadata agregada a ad_creatives.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
