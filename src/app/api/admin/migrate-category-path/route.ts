// ═══════════════════════════════════════════════════════════════════
// /api/admin/migrate-category-path
// ═══════════════════════════════════════════════════════════════════
// Endpoint idempotente para agregar la columna products.categoryPath
// a la base Neon production. Corre el mismo SQL que
// prisma/migrations/add_category_path.sql pero via HTTP para que Tomy
// no necesite credenciales locales.
//
// Uso:
//   curl "https://app.nitrosales.io/api/admin/migrate-category-path?key=<NEXTAUTH_SECRET>"
//
// Retorna: { ok: true, alreadyExisted: boolean, columnNow: "categoryPath" }
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

    // Check if column already exists (for reporting)
    const existing: Array<{ column_name: string }> = await prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'products' AND column_name = 'categoryPath'`
    );
    const alreadyExisted = existing.length > 0;

    // Run idempotent ALTER
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "categoryPath" TEXT`
    );

    // Verify post-state
    const after: Array<{ column_name: string }> = await prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'products' AND column_name = 'categoryPath'`
    );

    return NextResponse.json({
      ok: true,
      alreadyExisted,
      columnExistsNow: after.length > 0,
      message: alreadyExisted
        ? "La columna categoryPath ya existia. No se hizo nada."
        : "Columna categoryPath agregada a products. Ya podes deployar Stage 2.",
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || String(e) },
      { status: 500 }
    );
  }
}
