// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/cleanup-marketplace-attributions?orgId=X&dryRun=1&key=Y
// ══════════════════════════════════════════════════════════════
// Borra retroactivamente las pixel_attributions de ordenes marketplace
// que NO deberian estar atribuidas porque el pixel propio nunca se
// disparo (la sesion del comprador estuvo en Fravega/BPR/MELI, no en
// la web del cliente).
//
// Causa: hasta S60 EXT, el webhook VTEX corria atribucion para TODAS
// las ordenes incluyendo marketplaces. Eso generaba atribuciones
// FALSAS asignadas a visitors random o a clientes recurrentes que no
// compraron esa orden especifica.
//
// Criterio: borra attribution row si la orden tiene:
//   - externalId LIKE 'FVG-%' (Fravega)
//   - externalId LIKE 'BPR-%' (Banco Provincia)
//   - source = 'MELI' (MercadoLibre)
//   - channel = 'marketplace'
//   - trafficSource = 'Marketplace'
//
// Sin orgId aplica a TODAS las orgs (multi-tenant).
// dryRun=1 para ver que cambiaria sin escribir.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
const KEY = "nitrosales-secret-key-2024-production";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const orgId = url.searchParams.get("orgId");
    const dryRun = url.searchParams.get("dryRun") === "1";

    const allowed = key === KEY ? true : await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Encontrar attribution rows linkeadas a ordenes marketplace
    const targets = await prisma.$queryRawUnsafe<Array<{
      attribution_id: string;
      orderId: string;
      externalId: string;
      organizationId: string;
      source: string | null;
      channel: string | null;
      trafficSource: string | null;
    }>>(
      `SELECT
         pa."id" as attribution_id,
         pa."orderId",
         o."externalId",
         o."organizationId",
         o."source",
         o."channel",
         o."trafficSource"
       FROM "pixel_attributions" pa
       INNER JOIN "orders" o ON o."id" = pa."orderId"
       WHERE ${orgId ? `o."organizationId" = $1 AND` : ""} (
         o."externalId" LIKE 'FVG-%'
         OR o."externalId" LIKE 'BPR-%'
         OR o."source" = 'MELI'
         OR o."channel" = 'marketplace'
         OR o."trafficSource" = 'Marketplace'
       )`,
      ...(orgId ? [orgId] : []),
    );

    // Agrupar por org + razon para diagnostico
    const byOrg: Record<string, number> = {};
    const byReason: Record<string, number> = {};
    for (const t of targets) {
      byOrg[t.organizationId] = (byOrg[t.organizationId] || 0) + 1;
      let reason = "other";
      if (t.externalId?.startsWith("FVG-")) reason = "FVG (Fravega)";
      else if (t.externalId?.startsWith("BPR-")) reason = "BPR (Banco Provincia)";
      else if (t.source === "MELI") reason = "MELI";
      else if (t.channel === "marketplace") reason = "channel=marketplace";
      else if (t.trafficSource === "Marketplace") reason = "trafficSource=Marketplace";
      byReason[reason] = (byReason[reason] || 0) + 1;
    }

    let deleted = 0;
    if (!dryRun && targets.length > 0) {
      const ids = targets.map((t) => t.attribution_id);
      const result = await prisma.pixelAttribution.deleteMany({
        where: { id: { in: ids } },
      });
      deleted = result.count;
    }

    return NextResponse.json({
      ok: true,
      orgId: orgId || "(all orgs)",
      dryRun,
      attributionsFound: targets.length,
      attributionsDeleted: deleted,
      byOrg,
      byReason,
      message: dryRun
        ? "Dry run completado. Volve a correr sin dryRun=1 para aplicar."
        : `Borradas ${deleted} atribuciones de ordenes marketplace.`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, stack: err.stack?.slice(0, 500) }, { status: 500 });
  }
}
