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
  // ⚠️ ESTA TABLA GUARDA DOS COSAS, Y LA SEGUNDA LLEGÓ DESPUÉS (E-20, 2026-09-12).
  //
  //   · el CURSOR — por dónde iba un cron que reparte trabajo entre corridas (E-11);
  //   · el LATIDO — cuándo corrió por última vez y cómo le fue (E-20).
  //
  // Van juntas en una tabla a propósito. Podrían ser dos, pero eso serían dos
  // migraciones, y la de cursores todavía no se corrió — así que agregarle
  // columnas acá mantiene **una sola acción manual** en vez de dos. Es la misma
  // lista de acciones manuales que `checklist-merge` verifica.
  //
  // El nombre `cron_cursors` queda corto para lo que guarda. Se mantiene igual
  // porque renombrar arrastra `cursor-store.ts` y sus tests, y el costo de un
  // nombre estrecho es menor que el de una migración de rename; el comentario
  // de acá tiene que suplir la diferencia.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "${TABLA_CURSORES}" (
      "name" TEXT PRIMARY KEY,
      "cursor" TEXT,
      "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "last_run_at" TIMESTAMPTZ,
      "last_ok" BOOLEAN,
      "last_error" TEXT
    )
  `);

  // Idempotente y compatible hacia atrás: si la tabla ya existe con la forma
  // vieja (alguien corrió una versión anterior de este endpoint), se le agregan
  // las columnas y se afloja el NOT NULL del cursor — un cron que sólo late no
  // tiene cursor que guardar.
  for (const sql of [
    `ALTER TABLE "${TABLA_CURSORES}" ADD COLUMN IF NOT EXISTS "last_run_at" TIMESTAMPTZ`,
    `ALTER TABLE "${TABLA_CURSORES}" ADD COLUMN IF NOT EXISTS "last_ok" BOOLEAN`,
    `ALTER TABLE "${TABLA_CURSORES}" ADD COLUMN IF NOT EXISTS "last_error" TEXT`,
    `ALTER TABLE "${TABLA_CURSORES}" ALTER COLUMN "cursor" DROP NOT NULL`,
  ]) {
    await prisma.$executeRawUnsafe(sql);
  }

  const filas = await prisma.$queryRawUnsafe<Array<{ name: string; cursor: string | null }>>(
    `SELECT name, cursor, last_run_at, last_ok FROM "${TABLA_CURSORES}" ORDER BY name`,
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
      `SELECT name, cursor, updated_at, last_run_at, last_ok, last_error FROM "${TABLA_CURSORES}" ORDER BY name`,
    );
    return NextResponse.json({ ok: true, cursores });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message).slice(0, 200), hint: "Corré POST a este mismo endpoint para crear la tabla." },
      { status: 200 },
    );
  }
}
