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
import { evaluarChecklist } from "@/lib/merge/checklist";
import type { InsumosDelChecklist } from "@/lib/merge/checklist";
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

export async function GET(req: NextRequest) {
  const key = new URL(req.url).searchParams.get("key");
  if (!isValidAdminKey(key) && !(await isInternalUser())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [tablaDeCursores, source, channel] = await Promise.all([
    prisma
      .$queryRawUnsafe<Array<{ existe: boolean }>>(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = $1
         ) AS existe`,
        TABLA_CURSORES,
      )
      .then((r) => Boolean(r[0]?.existe))
      .catch(() => null),
    diasDeHistoria("gold_attribution_source"),
    diasDeHistoria("gold_attribution_channel"),
  ]);

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
    ventanaDeRotacionAbierta: hayVentanaDeRotacionAbierta(),
  };

  return NextResponse.json({
    generadoEn: new Date().toISOString(),
    ...evaluarChecklist(insumos),
  });
}
