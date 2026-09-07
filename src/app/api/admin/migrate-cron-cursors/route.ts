// ══════════════════════════════════════════════════════════════
// POST /api/admin/migrate-cron-cursors — tabla de cursores de cron
// ══════════════════════════════════════════════════════════════
// E-11. Crea `cron_cursors`, donde cada cron que recorre organizaciones deja
// anotado por dónde iba para que la próxima invocación arranque ahí.
//
// Por qué hace falta: de los 14 crons que recorren todas las organizaciones
// dentro de una invocación con presupuesto fijo, ocho no tienen forma de
// continuar donde quedaron. El modo de falla al crecer no es "va más lento":
// es "a algunos clientes no les corre nunca", en silencio, y siempre a los
// mismos — los últimos de la lista, que son los más nuevos.
//
// ORDEN DE MIGRACIONES (CLAUDE.md): este endpoint se deploya PRIMERO y se
// ejecuta DESPUÉS. Hasta que se corra, `cursor-store.ts` degrada solo: leer
// devuelve null (se arranca de cero, igual que hoy) y escribir no hace nada.
// O sea que el código nuevo se puede mergear sin haber corrido esto.
//
// Auth: ?key=<ADMIN_API_KEY>. Idempotente (IF NOT EXISTS).
// ══════════════════════════════════════════════════════════════

import { isValidAdminKey } from "@/lib/admin-key";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { TABLA_CURSORES } from "@/lib/cron/cursor-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function migrar() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "${TABLA_CURSORES}" (
      "name" TEXT PRIMARY KEY,
      "cursor" TEXT NOT NULL,
      "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const filas = await prisma.$queryRawUnsafe<Array<{ name: string; cursor: string }>>(
    `SELECT name, cursor FROM "${TABLA_CURSORES}" ORDER BY name`,
  );
  return filas;
}

export async function POST(req: NextRequest) {
  const key = new URL(req.url).searchParams.get("key");
  if (!isValidAdminKey(key)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const cursores = await migrar();
    return NextResponse.json({ ok: true, tabla: TABLA_CURSORES, cursores });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message).slice(0, 300) }, { status: 500 });
  }
}

/** GET = ver los cursores sin migrar nada. Útil para diagnosticar. */
export async function GET(req: NextRequest) {
  const key = new URL(req.url).searchParams.get("key");
  if (!isValidAdminKey(key)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const cursores = await prisma.$queryRawUnsafe(
      `SELECT name, cursor, updated_at FROM "${TABLA_CURSORES}" ORDER BY name`,
    );
    return NextResponse.json({ ok: true, cursores });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message).slice(0, 200), hint: "Corré POST a este mismo endpoint para crear la tabla." },
      { status: 200 },
    );
  }
}
