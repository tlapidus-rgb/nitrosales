// ══════════════════════════════════════════════════════════════
// POST /api/admin/pixel/repair-first-source?org=<orgId>
// ══════════════════════════════════════════════════════════════
// E-17. Reemplaza los `.sql` que había uno por cliente en el disco de Axel:
// `backfill-1-cmod6ns.local.sql`, `backfill-2-emdj.local.sql`,
// `backfill-3-cmohl80fx.local.sql` — el mismo SQL con el cuid cambiado a mano,
// ninguno versionado (`.gitignore` excluye `*.local.sql`).
//
// El problema no era la repetición: era que cada archivo llevaba pegado adentro
// un **snapshot** del CASE de clasificación de origen, que en el código cambia.
// Un backfill corrido con un archivo viejo clasifica distinto que el cron, y la
// diferencia aparece como visitantes en `sin_clasificar` que nadie entiende.
// Acá el CASE se importa de la misma fuente que usa el cron.
//
// GET  → cuántas filas quedan sin origen (no escribe nada).
// POST → repara. Idempotente: sólo toca filas con `source_raw IS NULL`.
//
// ── AUTH: LO QUE REALMENTE PASA ──────────────────────────────────────────
// Este encabezado decía "Auth: staff (además el middleware gatea
// `/api/admin/*`)". Las dos mitades estaban mal.
//
//   · No es sólo staff: `puedeEntrar()` acepta `?key=<ADMIN_API_KEY>` **o**
//     sesión de staff. Es el patrón de los ~20 endpoints admin del repo.
//   · Y el middleware NO gatea esto para un request anónimo. El gate por
//     sección corre dentro de un `if (token)`: sin token, `middleware.ts`
//     devuelve `NextResponse.next()` a propósito y delega en la auth del
//     endpoint. Lo que el middleware sí hace es frenar a un usuario LOGUEADO
//     cuyo rol no incluye la sección.
//
// O sea que la única puerta frente a alguien sin sesión es el `?key=` de acá.
// Se deja así —es idempotente y sólo completa filas con `source_raw IS NULL`,
// no pisa datos— pero el encabezado tiene que decirlo, no taparlo con una
// capa de seguridad que no existe.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { isValidAdminKey } from "@/lib/admin-key";
import { orgIdDeLaQuery } from "@/lib/org-id-seguro";
import {
  buildFirstSourceRepairSql,
  buildFirstSourcePendingSql,
} from "@/lib/pixel/first-source-repair";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function autorizado(req: NextRequest): Promise<boolean> {
  const key = new URL(req.url).searchParams.get("key");
  return isValidAdminKey(key) || (await isInternalUser());
}

/** El `?org=` validado, o `null` si falta o no tiene forma de id. */
function orgDe(req: NextRequest): string | null {
  return orgIdDeLaQuery(new URL(req.url).searchParams.get("org"));
}

export async function GET(req: NextRequest) {
  if (!(await autorizado(req))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const org = orgDe(req);
  if (!org) {
    return NextResponse.json(
      { error: "Falta ?org=<orgId> válido." },
      { status: 400 },
    );
  }
  try {
    const filas = await prisma.$queryRawUnsafe<Array<{ pendientes: number }>>(
      buildFirstSourcePendingSql(),
      org,
    );
    return NextResponse.json({ ok: true, org, pendientes: Number(filas[0]?.pendientes || 0) });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message).slice(0, 300) },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  if (!(await autorizado(req))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const org = orgDe(req);
  if (!org) {
    return NextResponse.json(
      { error: "Falta ?org=<orgId> válido." },
      { status: 400 },
    );
  }

  const startedAt = Date.now();
  try {
    const antes = await prisma.$queryRawUnsafe<Array<{ pendientes: number }>>(
      buildFirstSourcePendingSql(),
      org,
    );
    const reparadas = await prisma.$executeRawUnsafe(buildFirstSourceRepairSql(), org);
    const despues = await prisma.$queryRawUnsafe<Array<{ pendientes: number }>>(
      buildFirstSourcePendingSql(),
      org,
    );

    return NextResponse.json({
      ok: true,
      org,
      reparadas: Number(reparadas),
      pendientesAntes: Number(antes[0]?.pendientes || 0),
      // Lo que queda son visitantes cuyos eventos clasifican TODOS a null —
      // sólo pasarelas de pago o vueltas de checkout. No es un error: no hay
      // origen que asignarles. Ver `pixel_visitor_no_source`.
      pendientesDespues: Number(despues[0]?.pendientes || 0),
      durationMs: Date.now() - startedAt,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message).slice(0, 300), durationMs: Date.now() - startedAt },
      { status: 500 },
    );
  }
}
