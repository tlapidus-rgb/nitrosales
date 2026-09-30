// ══════════════════════════════════════════════════════════════
// GET /api/admin/checklist-merge — ¿quedó algo sin hacer al mergear?
// ══════════════════════════════════════════════════════════════
// E-33. Las cuatro acciones manuales del merge eran una tabla en un documento:
// cuatro oportunidades de olvido y ninguna forma de saber después si se
// hicieron. Esto las contesta.
//
// **Verifica, no ejecuta.** Dos de las cuatro son variables de entorno de
// Vercel y el código no puede escribirlas; las otras dos —una migración y dos
// backfills Gold— sí se podrían correr y a propósito no se corren desde acá
// (ver el módulo del criterio para el porqué).
//
// También mira las cinco migraciones de las que depende el código (y los
// permisos de la tabla de intentos de creadores). Ojo con el momento: esta ruta
// es parte del código que se deploya, así que ANTES del merge no existe en
// producción. Para ese momento está la verificación en SQL de
// `docs/revision-2026-09/08-MIGRACIONES-NEON.sql`, que se corre en la consola.
//
// Sirve antes del merge y también después: si alguien se olvidó de algo, esto
// lo sigue diciendo. Todas las consultas van con su propio catch — un checklist
// que se rompe no puede reportar "todo bien".
//
// Auth: staff o ?key=. Lectura pura.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { isValidAdminKey, hayVentanaDeRotacionAbierta } from "@/lib/admin-key";
import { hayVentanaDeRotacionDeWebhookAbierta } from "@/lib/webhook-key";
import { evaluarChecklist, MIGRACIONES_REQUERIDAS } from "@/lib/merge/checklist";
import type { InsumosDelChecklist, ClaveDeMigracion } from "@/lib/merge/checklist";
import { estadoDeLaVentana } from "@/lib/backfill/admision";
import { destinatariosDeAlertas } from "@/lib/alertas/destinatarios";
import { TABLA_CURSORES } from "@/lib/cron/cursor-store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Días entre el registro más viejo de una tabla Gold y hoy. */
async function diasDeHistoria(tabla: string): Promise<number | null> {
  try {
    const r = await prisma.$queryRawUnsafe<Array<{ dias: number | null }>>(
      `SELECT EXTRACT(DAY FROM (NOW() - MIN(day::timestamptz)))::int AS dias FROM ${tabla}`,
    );
    const d = r[0]?.dias;
    return d == null ? null : Number(d);
  } catch {
    // La tabla puede no existir todavía (runbook pendiente). No es un error del
    // checklist: es que no se puede saber.
    return null;
  }
}

// ⚠️ `to_regclass` y `pg_attribute`, NO `information_schema`. Las vistas de
// information_schema sólo muestran lo que el rol actual tiene permiso de ver:
// una tabla creada desde la consola con otro rol y sin GRANT a la app aparece
// como inexistente, el checklist diría "falta, corré la migración", y correrla
// no cambiaría nada (IF NOT EXISTS). El catálogo no filtra por permisos, así
// que "existe pero no la podés usar" sale como lo que es: un problema de
// permisos.

/** ¿Existe la tabla (o la columna, si se pide)? `null` = no se pudo consultar. */
async function existeEnEsquema(tabla: string, columna: string | null): Promise<boolean | null> {
  try {
    const r = columna
      ? await prisma.$queryRawUnsafe<Array<{ existe: boolean }>>(
          `SELECT EXISTS (
             SELECT 1 FROM pg_attribute
              WHERE attrelid = to_regclass($1) AND attname = $2
                AND attnum > 0 AND NOT attisdropped
           ) AS existe`,
          `public.${tabla}`,
          columna,
        )
      : await prisma.$queryRawUnsafe<Array<{ existe: boolean }>>(
          `SELECT to_regclass($1) IS NOT NULL AS existe`,
          `public.${tabla}`,
        );
    return Boolean(r[0]?.existe);
  } catch {
    return null;
  }
}

/**
 * ¿El rol de la app tiene sobre la tabla todos los permisos que usa el código?
 * `null` = la tabla no existe o no se pudo consultar (el paso ya dice "falta").
 *
 * Una llamada por permiso, a propósito: `has_table_privilege` con varios
 * permisos separados por coma devuelve `true` si tiene CUALQUIERA, no todos.
 * Y `CASE`, no `AND`: Postgres no garantiza el orden de un AND, y
 * `has_table_privilege` sobre una tabla que no existe tira error.
 */
async function tienePermisos(tabla: string, permisos: readonly string[]): Promise<boolean | null> {
  try {
    const chequeos = permisos
      .map((_, n) => `has_table_privilege(current_user, to_regclass($1), $${n + 2})`)
      .join(" AND ");
    const r = await prisma.$queryRawUnsafe<Array<{ puede: boolean | null }>>(
      `SELECT CASE WHEN to_regclass($1) IS NULL THEN NULL ELSE (${chequeos}) END AS puede`,
      `public.${tabla}`,
      ...permisos,
    );
    const puede = r[0]?.puede;
    return puede == null ? null : Boolean(puede);
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const key = new URL(req.url).searchParams.get("key");
  if (!isValidAdminKey(key) && !(await isInternalUser())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [tablaDeCursores, source, channel] = await Promise.all([
    existeEnEsquema(TABLA_CURSORES, null),
    diasDeHistoria("gold_attribution_source"),
    diasDeHistoria("gold_attribution_channel"),
  ]);

  const [existencias, conPermisos] = await Promise.all([
    Promise.all(MIGRACIONES_REQUERIDAS.map((m) => existeEnEsquema(m.tabla, m.columna))),
    Promise.all(MIGRACIONES_REQUERIDAS.map((m) => (m.permisos ? tienePermisos(m.tabla, m.permisos) : null))),
  ]);
  const esquema = Object.fromEntries(
    MIGRACIONES_REQUERIDAS.map((m, n) => [m.clave, existencias[n]]),
  ) as Record<ClaveDeMigracion, boolean | null>;
  const permisos = Object.fromEntries(
    MIGRACIONES_REQUERIDAS.filter((m) => m.permisos).map((m) => [m.clave, conPermisos[MIGRACIONES_REQUERIDAS.indexOf(m)]]),
  ) as Partial<Record<ClaveDeMigracion, boolean | null>>;

  // `destinatariosDeAlertas` nunca devuelve vacío: sin configurar cae a la
  // casilla histórica. Para saber si alguien la configuró hay que comparar
  // contra lo que devuelve con el entorno vacío.
  const configurados = destinatariosDeAlertas();
  const fallback = destinatariosDeAlertas({} as NodeJS.ProcessEnv);
  const esElFallback =
    configurados.length === fallback.length && configurados.every((d, n) => d === fallback[n]);

  const v = estadoDeLaVentana();

  const insumos: InsumosDelChecklist = {
    tablaDeCursores,
    alertas: { destinatarios: configurados.length, esElFallback },
    ventana:
      v.estado === "mal-escrita"
        ? { estado: "mal-escrita", valor: v.valor, motivo: v.motivo }
        : { estado: v.estado },
    historiaGold: { source, channel },
    ventanasDeRotacionAbiertas: {
      adminKey: hayVentanaDeRotacionAbierta(),
      webhook: hayVentanaDeRotacionDeWebhookAbierta(),
    },
    esquema,
    permisos,
  };

  return NextResponse.json({
    generadoEn: new Date().toISOString(),
    ...evaluarChecklist(insumos),
  });
}
