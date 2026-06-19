// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/admin/migrate-user-isstaff
// ═══════════════════════════════════════════════════════════════════
// feat/role-based-access — Staff cross-org ("nosotros").
//
// Agrega la columna `users.isStaff` (boolean, default false). Marca al
// staff interno de NitroSales: bypass total del RBAC + acceso a
// View-as-Org (ver todas las orgs). Reemplaza la allowlist de emails
// hardcodeada (auth.ts / feature-flags.ts / OrgSwitcher.tsx).
//
// Idempotente: ADD COLUMN IF NOT EXISTS. NO marca a nadie como staff
// (eso es una asignación manual posterior, con OK explícito del founder).
//
// Orden de migración (regla del repo): este endpoint corre / la columna
// existe en prod ANTES de agregar `isStaff` al schema.prisma + código.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isValidAdminKey } from "@/lib/admin-key";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    if (!isValidAdminKey(key)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // ─────────────────────────────────────────────────────────────
    // users.isStaff (boolean, default false). Metadata-only en PG
    // moderno (default constante) → sin reescritura de tabla, instantáneo.
    // ─────────────────────────────────────────────────────────────
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "isStaff" BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    // ─────────────────────────────────────────────────────────────
    // Sanity check: cuántos users hay y cuántos staff (debería ser 0
    // hasta la asignación manual).
    // ─────────────────────────────────────────────────────────────
    const rows = await prisma.$queryRawUnsafe<
      Array<{ total: bigint; staff: bigint }>
    >(`SELECT COUNT(*)::bigint AS total,
              COUNT(*) FILTER (WHERE "isStaff" = TRUE)::bigint AS staff
       FROM "users"`);

    return NextResponse.json({
      ok: true,
      message: "Columna users.isStaff lista (idempotente).",
      totalUsers: Number(rows?.[0]?.total ?? 0),
      staffUsers: Number(rows?.[0]?.staff ?? 0),
    });
  } catch (error: any) {
    console.error("[migrate-user-isstaff] error:", error);
    return NextResponse.json(
      { ok: false, error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
