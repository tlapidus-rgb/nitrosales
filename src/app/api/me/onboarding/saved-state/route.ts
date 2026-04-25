// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/me/onboarding/saved-state
// ══════════════════════════════════════════════════════════════
// Devuelve el estado guardado del wizard (credenciales, decisiones,
// historyMonths, orgInfo) para pre-llenar el wizard cuando:
//   - El cliente vuelve despues de cerrar el navegador (sessionStorage perdido).
//   - El cliente uso "Volver a editar mis datos" desde ValidatingPhase.
//
// Seguridad: solo OWNER de la org. Las credenciales devueltas son del
// propio cliente (info suya). No exponemos credenciales de otras orgs.
//
// Shape del response (igual al sessionStorage del wizard):
//   {
//     decisions: { VTEX: "use" | "skip" | "pending", ... },
//     creds:     { VTEX: { accountName, appKey, appToken, ... }, ... },
//     history:   { VTEX: 12, MERCADOLIBRE: 12, ... },
//     orgInfo:   { country, timezone, defaultCurrency },
//   }
//
// META_PIXEL: los campos pixel* estan guardados en Connection META_ADS
// por el workaround Opcion C. Los extraemos y los devolvemos como una
// "plataforma" META_PIXEL virtual para que el wizard los muestre.
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, organizationId: true, role: true },
    });
    if (!user || user.role !== "OWNER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 1. Connections de esta org (sin filtro de status)
    const connections = await prisma.connection.findMany({
      where: { organizationId: user.organizationId },
      select: { platform: true, credentials: true },
    });

    // 2. Onboarding request (history + decisions skipped)
    const obRows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT "historyVtexMonths", "historyMlMonths", "historyMetaMonths", "historyGoogleMonths"
       FROM "onboarding_requests" WHERE "createdOrgId" = $1 LIMIT 1`,
      user.organizationId
    );
    const ob = obRows[0] || {};

    // 3. Organization settings (country, timezone, currency)
    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { settings: true },
    });
    const settings = (org?.settings as any) || {};

    // ─── Construir el shape del state ────────────────────────
    const decisions: Record<string, "use" | "skip" | "pending"> = {};
    const creds: Record<string, any> = {};

    for (const c of connections) {
      const platform = String(c.platform);
      const credentials = (c.credentials as any) || {};
      // BP-S58-003: META_ADS contiene Ads + Pixel en un solo objeto.
      // No hace falta splittear — el wizard lee creds.META_ADS directo.
      decisions[platform] = "use";
      creds[platform] = credentials;
    }

    // Historia del wizard
    const history: Record<string, number> = {
      VTEX: Number(ob.historyVtexMonths) || 12,
      MERCADOLIBRE: Number(ob.historyMlMonths) || 12,
      META_ADS: Number(ob.historyMetaMonths) || 6,
      GOOGLE_ADS: Number(ob.historyGoogleMonths) || 6,
    };

    const orgInfo = {
      country: typeof settings.country === "string" ? settings.country : "AR",
      timezone: typeof settings.timezone === "string" ? settings.timezone : "America/Argentina/Buenos_Aires",
      defaultCurrency: typeof settings.defaultCurrency === "string" ? settings.defaultCurrency : "ARS",
    };

    return NextResponse.json({
      ok: true,
      decisions,
      creds,
      history,
      orgInfo,
    });
  } catch (error: any) {
    console.error("[me/onboarding/saved-state] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
