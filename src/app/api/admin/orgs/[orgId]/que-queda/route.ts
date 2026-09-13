// ══════════════════════════════════════════════════════════════════════════
// GET /api/admin/orgs/{orgId}/que-queda — ¿qué datos quedan de este cliente?
// ══════════════════════════════════════════════════════════════════════════
// E-28. **No borra nada.** Cuenta.
//
// Existe para poder contestar con evidencia la pregunta que hoy se contesta de
// memoria: *"si un cliente se va, ¿borramos todo?"*. Hoy la respuesta honesta
// es **no**, y esto lo demuestra tabla por tabla.
//
// `wipe-account` borra de **9 tablas**. El schema tiene **54 con
// `organizationId`**, y hay ~30 más en producción que ni siquiera están en
// `schema.prisma` (Silver, Gold, los ocho `pixel_daily_*`).
//
// Y el header de `wipe-account` **afirma** que borra `pixel_events`,
// `pixel_visitors`, `pixel_attributions`, `ad_campaigns`, `influencer_*`,
// `alerts`, `ml_webhook_events` y `sync_watermarks`. Ninguna aparece en su
// código. Esa promesa es lo que este endpoint viene a poder desmentir con
// números.
//
// ── POR QUÉ LAS TABLAS SALEN DE LA BASE Y NO DE UNA LISTA ────────────────
// Se le pregunta a `information_schema` cuáles tienen columna `organizationId`.
// Una lista escrita a mano vuelve a perder las tablas que no están en Prisma —
// que son exactamente las que se escaparon la primera vez— y no se nota, porque
// **borrar de menos no falla**: devuelve ok.
//
// Sirve igual antes del borrado (para saber qué hay) que después (para probar
// que ya no está).
//
// Auth: staff o ?key=. Lectura pura.
// ══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { isValidAdminKey } from "@/lib/admin-key";
import {
  auditar,
  armarPlanDeBorrado,
  loQueSePuedeAfirmar,
  SE_CONSERVAN,
  type TablaConOrg,
  type Dependencia,
} from "@/lib/organizacion/borrado";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Todas las tablas del esquema público que tienen una columna `organizationId`. */
const TABLAS_CON_ORG = `
  SELECT table_name AS tabla
  FROM information_schema.columns
  WHERE table_schema = 'public' AND column_name = 'organizationId'
  ORDER BY table_name
`;

/** Las foreign keys entre esas tablas, para poder borrar en orden. */
const DEPENDENCIAS = `
  SELECT
    tc.table_name    AS hija,
    ccu.table_name   AS madre
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
`;

export async function GET(req: NextRequest, { params }: { params: { orgId: string } }) {
  const url = new URL(req.url);
  if (!isValidAdminKey(url.searchParams.get("key")) && !(await isInternalUser())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { orgId } = params;
  if (!orgId) return NextResponse.json({ error: "orgId requerido" }, { status: 400 });

  const org = await prisma.organization
    .findUnique({ where: { id: orgId }, select: { name: true } })
    .catch(() => null);

  const tablas = (await prisma.$queryRawUnsafe<Array<{ tabla: string }>>(TABLAS_CON_ORG)).map(
    (r) => r.tabla,
  );

  const dependencias = await prisma
    .$queryRawUnsafe<Dependencia[]>(DEPENDENCIAS)
    .catch(() => [] as Dependencia[]);

  // Cada COUNT va con su propio catch: una tabla que no se puede consultar sale
  // como `null`, que NO es cero. La diferencia es la que decide si se puede
  // afirmar que está todo borrado.
  const conteos: TablaConOrg[] = [];
  for (const tabla of tablas) {
    try {
      const r = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
        `SELECT COUNT(*)::float8 AS n FROM "${tabla}" WHERE "organizationId" = $1`,
        orgId,
      );
      conteos.push({ tabla, filas: Number(r[0]?.n ?? 0) });
    } catch {
      conteos.push({ tabla, filas: null });
    }
  }

  const auditoria = auditar(conteos);
  const plan = armarPlanDeBorrado(tablas, dependencias);

  // Lo que `wipe-account` borra hoy, para poder mostrar el hueco.
  const QUE_BORRA_HOY = [
    "backfill_jobs",
    "connections",
    "customers",
    "onboarding_requests",
    "order_items",
    "orders",
    "organizations",
    "products",
    "users",
  ];
  const seLeEscapan = auditoria.conDatos
    .filter((t) => !QUE_BORRA_HOY.includes(t.tabla))
    .map((t) => ({ tabla: t.tabla, filas: t.filas }));

  return NextResponse.json({
    generadoEn: new Date().toISOString(),
    organizationId: orgId,
    nombre: org?.name ?? null,
    existe: org !== null,

    // La frase que se puede decir, redactada en un solo lugar.
    loQueSePuedeAfirmar: loQueSePuedeAfirmar(auditoria),

    resumen: {
      tablasConOrganizationId: tablas.length,
      tablasQueBorraWipeAccount: QUE_BORRA_HOY.length,
      tablasConDatos: auditoria.conDatos.length,
      filasQueQuedan: auditoria.filasQueQuedan,
      limpio: auditoria.limpio,
    },

    // El hueco, que es el punto de todo esto.
    seLeEscapanAWipeAccount: {
      tablas: seLeEscapan.length,
      filas: seLeEscapan.reduce((a, t) => a + (t.filas ?? 0), 0),
      detalle: seLeEscapan,
    },

    // `null` no es cero: son las que no se pudieron contar.
    sinPoderContar: auditoria.sinPoderContar,

    planDeBorrado: {
      orden: plan.orden,
      seConservan: plan.seConservan,
      // Si esto viene con datos, hay tablas que se referencian en círculo y el
      // borrado de ésas necesita otra estrategia.
      ciclosDeForeignKeys: plan.ciclos,
    },

    detallePorTabla: auditoria.conDatos,
  });
}
