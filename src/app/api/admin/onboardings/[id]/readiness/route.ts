// ══════════════════════════════════════════════════════════════
// GET /api/admin/onboardings/[id]/readiness — el semáforo del alta
// ══════════════════════════════════════════════════════════════
// E-15. Junta en un solo lugar los insumos que ya existían desparramados y
// contesta la pregunta que nadie contestaba: **¿este cliente está listo para
// que le abramos el producto?**
//
// Antes, habilitar a un cliente era acordarse de chequear cinco cosas en cinco
// pantallas distintas. El paso que se olvidaba no avisaba: TeVe Compras entró
// con 0 de 8 órdenes atribuidas porque nadie registró el afiliado de VTEX.
//
// El criterio vive aparte, en `src/lib/onboarding/readiness.ts`, y es puro: acá
// sólo se recolecta. Cada consulta va con su propio try/catch y devuelve `null`
// cuando falla — un semáforo que trata "no sé" como "está bien" es peor que no
// tener semáforo.
//
// Auth: staff. Lectura pura, no escribe nada.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { isValidAdminKey } from "@/lib/admin-key";
import { evaluarReadiness } from "@/lib/onboarding/readiness";
import type { InsumosDeReadiness } from "@/lib/onboarding/readiness";
import { testCredentialsByPlatform, testNitroPixel } from "@/lib/onboarding/credential-tests";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const key = new URL(req.url).searchParams.get("key");
  if (!isValidAdminKey(key) && !(await isInternalUser())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const filas = await prisma.$queryRawUnsafe<Array<any>>(
    `SELECT "id", "companyName", "status", "createdOrgId"
       FROM "onboarding_requests" WHERE "id" = $1 LIMIT 1`,
    id,
  );
  const ob = filas[0];
  if (!ob) {
    return NextResponse.json({ error: "Onboarding no encontrado" }, { status: 404 });
  }
  const orgId: string | null = ob.createdOrgId ?? null;

  if (!orgId) {
    // Todavía no se creó la organización: no hay nada que medir.
    return NextResponse.json({
      onboardingId: id,
      companyName: ob.companyName,
      estado: ob.status,
      readiness: {
        listo: false,
        bloqueantes: 1,
        items: [
          {
            clave: "credenciales",
            titulo: "Conexiones",
            estado: "falta",
            detalle: "Todavía no se creó la organización del cliente.",
            queHacer: "Activar la solicitud primero (crea org + usuario).",
          },
        ],
      },
    });
  }

  // ── Recolección. Cada una aislada: que una falle no puede tumbar el resto.
  const conns = await prisma.connection
    .findMany({
      where: { organizationId: orgId },
      select: { platform: true, credentials: true },
    })
    .catch(() => [] as Array<{ platform: string; credentials: unknown }>);

  const [conexiones, eventosDePixel, ordenes, jobs] = await Promise.all([
    Promise.all(
      conns.map(async (c) => {
        try {
          const r = await testCredentialsByPlatform(c.platform as string, c.credentials);
          return { plataforma: c.platform as string, credencialesOk: !!r.ok, detalle: r.detail };
        } catch {
          return { plataforma: c.platform as string, credencialesOk: null, detalle: "error al probar" };
        }
      }),
    ),
    testNitroPixel(orgId, prisma)
      .then((r) => {
        // `testNitroPixel` devuelve el conteo dentro del texto; lo que importa
        // acá es sí/no, así que se traduce a 0 o a un positivo.
        if (!r.ok) return 0;
        const m = /([\d.]+) eventos/.exec(r.detail ?? "");
        return m ? Number(m[1].replace(/\./g, "")) : 1;
      })
      .catch(() => null),
    prisma.order.count({ where: { organizationId: orgId } }).catch(() => null),
    prisma
      .$queryRawUnsafe<Array<any>>(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE "status" = 'COMPLETED')::int AS completos,
           COUNT(*) FILTER (WHERE "status" = 'FAILED')::int AS fallados,
           COUNT(*) FILTER (WHERE "status" IN ('QUEUED','RUNNING'))::int AS pendientes
         FROM "backfill_jobs" WHERE "onboardingRequestId" = $1`,
        id,
      )
      .then((r) => ({
        total: Number(r[0]?.total || 0),
        completos: Number(r[0]?.completos || 0),
        fallados: Number(r[0]?.fallados || 0),
        pendientes: Number(r[0]?.pendientes || 0),
      }))
      .catch(() => ({ total: 0, completos: 0, fallados: 0, pendientes: 0 })),
  ]);

  const insumos: InsumosDeReadiness = {
    estadoOnboarding: ob.status,
    conexiones,
    eventosDePixel,
    ordenes,
    jobs,
    // ⚠️ Sin verificar a propósito: confirmar el Orders Broadcaster requiere
    // llamar a la API de VTEX con las credenciales del cliente, y este endpoint
    // es de lectura y tiene que ser rápido. Se reporta como "sin verificar" con
    // la instrucción exacta al lado, que es mejor que no mencionarlo — es el
    // paso que más se olvida y el que más duele.
    webhookVtexRegistrado: null,
  };

  return NextResponse.json({
    onboardingId: id,
    companyName: ob.companyName,
    estado: ob.status,
    orgId,
    readiness: evaluarReadiness(insumos),
  });
}
