// ══════════════════════════════════════════════════════════════
// GET /api/me/onboarding/verificar-pixel — ¿ya llega el pixel?
// ══════════════════════════════════════════════════════════════
// E-14. Lo que el checkbox "ya pegué el snippet" decía sin saber.
//
// ⚠️ NO recibe `orgId` por parámetro, a propósito: sale de la sesión. Este
// endpoint lo llama el wizard, que es la superficie más expuesta que tenemos,
// y aceptar un orgId de afuera convertiría una verificación en una forma de
// preguntar por el tráfico de cualquier organización.
//
// Lectura pura y barata: dos consultas acotadas sobre el índice
// `(organizationId, type, timestamp)`.
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import { evaluarPixel, VENTANA_RECIENTE_MIN } from "@/lib/onboarding/verificacion-pixel";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET() {
  const orgId = await getOrganizationId().catch(() => null);
  if (!orgId) {
    return NextResponse.json({ error: "Sin organización en la sesión" }, { status: 401 });
  }

  const desde = new Date(Date.now() - VENTANA_RECIENTE_MIN * 60 * 1000);

  try {
    // ⚠️ DOS `findFirst`, NUNCA UN COUNT. Contar sobre `pixel_events` (millones
    // de filas) es el error de performance #1 de este repo, y acá el número no
    // se usa para nada: la pregunta es "¿llegó algo?", no "¿cuántos?".
    //
    // Y se filtra por `timestamp` y no por `receivedAt` —que sería el reloj más
    // honesto— porque el índice multi-columna es `(organizationId, type,
    // timestamp)`. Misma lección que ya está anotada en `testNitroPixel`.
    const [recientes, algunaVez] = await Promise.all([
      prisma.pixelEvent
        .findFirst({
          where: { organizationId: orgId, timestamp: { gte: desde } },
          select: { id: true },
        })
        .then((e) => !!e),
      prisma.pixelEvent
        .findFirst({ where: { organizationId: orgId }, select: { id: true } })
        .then((e) => !!e),
    ]);

    return NextResponse.json({
      ventanaMin: VENTANA_RECIENTE_MIN,
      ...evaluarPixel({ hayEventosRecientes: recientes, huboEventosAlgunaVez: algunaVez }),
    });
  } catch (e: any) {
    // Que la verificación falle no puede trabar el alta ni afirmar nada. El
    // wizard lo muestra como "no pudimos verificar ahora".
    console.error("[verificar-pixel] falló:", e?.message);
    return NextResponse.json(
      {
        estado: "no-verificable",
        confirmado: false,
        titulo: "No pudimos verificar ahora",
        detalle: "Probá de nuevo en un minuto. Podés seguir con el alta igual.",
      },
      { status: 200 },
    );
  }
}
