import { collectReadiness } from "@/lib/onboarding/collect-readiness";
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
        estado: "pendiente",
        sinVerificar: 0,
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

  return NextResponse.json(await collectReadiness({ ...ob, createdOrgId: orgId }, new URL(req.url).searchParams.get("verificarWebhook") === "1"));
}
