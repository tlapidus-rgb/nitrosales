// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/audit-marketplace-flags?orgId=X&key=Y
// ══════════════════════════════════════════════════════════════
// Audita cuantas ordenes tiene cada org con cada flag de marketplace,
// y muestra samples de externalIds para validar visualmente que
// realmente son marketplace y no falsos positivos.
//
// Sirve para verificar ANTES de correr cleanup-marketplace-attributions
// que los flags estan bien seteados (no estamos por borrar atribuciones
// de ordenes web propias mal etiquetadas).
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
const KEY = "nitrosales-secret-key-2024-production";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const orgId = url.searchParams.get("orgId");

    const allowed = key === KEY ? true : await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!orgId) return NextResponse.json({ error: "orgId requerido" }, { status: 400 });

    // 1) Total ordenes en la org
    const totalOrders = await prisma.order.count({
      where: { organizationId: orgId },
    });

    // 2) Por cada flag, contar ordenes y devolver sample
    const flags: Array<{
      name: string;
      where: any;
      count: number;
      samples: Array<{ externalId: string; orderDate: Date; totalValue: number; status: string; source: string | null; channel: string | null; trafficSource: string | null }>;
    }> = [];

    const flagDefs = [
      { name: "FVG- (Fravega)", where: { organizationId: orgId, externalId: { startsWith: "FVG-" } } },
      { name: "BPR- (Banco Provincia)", where: { organizationId: orgId, externalId: { startsWith: "BPR-" } } },
      { name: "source=MELI", where: { organizationId: orgId, source: "MELI" } },
      { name: "channel=marketplace", where: { organizationId: orgId, channel: "marketplace" } },
      { name: "trafficSource=Marketplace", where: { organizationId: orgId, trafficSource: "Marketplace" } },
    ];

    for (const f of flagDefs) {
      const count = await prisma.order.count({ where: f.where });
      const samples = count > 0
        ? await prisma.order.findMany({
            where: f.where,
            select: { externalId: true, orderDate: true, totalValue: true, status: true, source: true, channel: true, trafficSource: true },
            orderBy: { orderDate: "desc" },
            take: 10,
          })
        : [];
      flags.push({
        name: f.name,
        where: f.where,
        count,
        samples: samples.map((s) => ({ ...s, totalValue: Number(s.totalValue) })),
      });
    }

    // 3) Solapamiento: ordenes con flag MARKETPLACE pero externalId numerico (sospechoso)
    const trafSrcMarketplaceCount = flags.find((f) => f.name === "trafficSource=Marketplace")?.count || 0;
    const suspiciousQuery = await prisma.$queryRaw<Array<{ externalId: string; orderDate: Date; totalValue: any; source: string; channel: string; trafficSource: string }>>`
      SELECT "externalId", "orderDate", "totalValue", source, channel, "trafficSource"
      FROM orders
      WHERE "organizationId" = ${orgId}
        AND "trafficSource" = 'Marketplace'
        AND "externalId" NOT LIKE 'FVG-%'
        AND "externalId" NOT LIKE 'BPR-%'
        AND source != 'MELI'
        AND (channel IS NULL OR channel != 'marketplace')
      ORDER BY "orderDate" DESC
      LIMIT 15
    `;

    return NextResponse.json({
      ok: true,
      orgId,
      totalOrders,
      flags,
      suspicious: {
        description: "Ordenes con trafficSource=Marketplace PERO sin prefijo conocido (FVG/BPR), sin source=MELI y sin channel=marketplace. Si estos externalIds parecen ordenes web normales (numericos sin prefijo claro), el flag 'trafficSource=Marketplace' puede estar mal seteado en el enrichment.",
        count: suspiciousQuery.length,
        samples: suspiciousQuery.map((s) => ({ ...s, totalValue: Number(s.totalValue) })),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, stack: err.stack?.slice(0, 500) }, { status: 500 });
  }
}
