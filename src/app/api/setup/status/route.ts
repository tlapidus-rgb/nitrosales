// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/setup/status
// ══════════════════════════════════════════════════════════════
// Devuelve el estado de las plataformas del cliente logueado:
// - cuales PENDING (necesitan setup)
// - cuales ACTIVE (listas)
// - cuales no fueron seleccionadas en el onboarding
// Tambien devuelve el rango historico elegido por plataforma (del
// onboarding_request asociado) para mostrarlo en el wizard.
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

const ALL_PLATFORMS = ["VTEX", "MERCADOLIBRE", "META_ADS", "META_PIXEL", "GOOGLE_ADS"] as const;

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
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Connections del cliente
    const connections = await prisma.connection.findMany({
      where: { organizationId: user.organizationId },
      select: {
        platform: true,
        status: true,
        credentials: true,
      },
    });

    // Onboarding request asociado (para saber que meses pidió por plataforma)
    const obRows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT "historyVtexMonths", "historyMlMonths", "historyMetaMonths", "historyGoogleMonths"
       FROM "onboarding_requests"
       WHERE "createdOrgId" = $1
       LIMIT 1`,
      user.organizationId
    );
    const ob = obRows[0] || {};

    const platformDetail = ALL_PLATFORMS.map((p) => {
      const conn = connections.find((c) => c.platform === p);
      return {
        platform: p,
        selected: !!conn,
        status: conn?.status || null,
        needsSetup: conn?.status === "PENDING",
        // Exponer solo campos no-secretos de credentials (para pre-rellenar campos
        // visibles como username, accountName, pixelId, customerId).
        publicCreds: conn ? sanitizeCreds(conn.credentials as any) : null,
      };
    });

    return NextResponse.json({
      ok: true,
      user: {
        email: session.user.email,
        role: user.role,
        organizationId: user.organizationId,
      },
      platforms: platformDetail,
      historyMonths: {
        VTEX: Number(ob.historyVtexMonths || 12),
        MERCADOLIBRE: Number(ob.historyMlMonths || 12),
        META_ADS: Number(ob.historyMetaMonths || 6),
        GOOGLE_ADS: Number(ob.historyGoogleMonths || 6),
      },
      counts: {
        selected: platformDetail.filter((p) => p.selected).length,
        active: platformDetail.filter((p) => p.status === "ACTIVE").length,
        pending: platformDetail.filter((p) => p.needsSetup).length,
      },
    });
  } catch (error: any) {
    console.error("[setup/status] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Devuelve solo campos no-secretos (username, accountName, pixelId, customerId, adAccountId)
function sanitizeCreds(creds: any): any {
  if (!creds) return null;
  const out: any = {};
  if (creds.accountName) out.accountName = creds.accountName;
  if (creds.username) out.username = creds.username;
  if (creds.pixelId) out.pixelId = creds.pixelId;
  if (creds.customerId) out.customerId = creds.customerId;
  if (creds.adAccountId) out.adAccountId = creds.adAccountId;
  if (creds.needsOAuth) out.needsOAuth = true;
  if (creds.needsSetup) out.needsSetup = true;
  return out;
}
