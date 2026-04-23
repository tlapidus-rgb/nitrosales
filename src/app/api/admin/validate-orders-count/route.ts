// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/validate-orders-count?orgId=X&from=YYYY-MM-DD&to=YYYY-MM-DD&source=MELI
// ══════════════════════════════════════════════════════════════
// Ejecuta EXACTAMENTE la misma query que usa /api/metrics/orders para el
// KPI 'Total pedidos'. Sirve para validar deploys sin depender del render
// de la pagina /orders (que podria estar cacheada).
//
// Incluye:
//   - buildVersion: para saber si el deploy esta activo
//   - filtroVentas: cuenta con anti-join (lo que verias en /orders)
//   - filtroCanceladas: cuenta cancelled (con mixtos)
//   - sumaTotal: ventas + canceladas (deberia = distinct packs en rango)
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

// Incrementar cada vez que cambiamos la logica, permite validar que el
// deploy corriendo es el esperado.
const BUILD_VERSION = "anti-join-v1-s56";

export async function GET(req: NextRequest) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const url = new URL(req.url);
    const orgId = url.searchParams.get("orgId");
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");
    const source = url.searchParams.get("source"); // opcional: MELI, VTEX
    if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });
    if (!fromParam || !toParam) return NextResponse.json({ error: "from/to required" }, { status: 400 });

    const dateFrom = new Date(fromParam + "T00:00:00.000-03:00");
    const dateTo = new Date(toParam + "T23:59:59.999-03:00");

    const srcFilter = source ? `AND "source" = '${source}'` : "";

    // Replica EXACTA del KPI ventas en /api/metrics/orders (post anti-join)
    const ventasRow: any[] = await prisma.$queryRawUnsafe(
      `SELECT
         COUNT(DISTINCT COALESCE("packId", "externalId"))::int AS cnt,
         COALESCE(SUM("totalValue"), 0)::float AS revenue
       FROM "orders"
       WHERE "organizationId" = $1
         AND "orderDate" >= $2 AND "orderDate" <= $3
         AND status NOT IN ('CANCELLED', 'RETURNED')
         AND NOT (COALESCE("source", 'VTEX') = 'MELI' AND status = 'PENDING')
         AND COALESCE("packId", "externalId") NOT IN (
           SELECT COALESCE("packId", "externalId") FROM "orders"
           WHERE "organizationId" = $1
             AND "orderDate" >= $2 AND "orderDate" <= $3
             AND status IN ('CANCELLED', 'RETURNED')
             ${srcFilter}
         )
         ${srcFilter}`,
      orgId, dateFrom, dateTo
    );

    // Canceladas (any cancelled)
    const canceladasRow: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(DISTINCT COALESCE("packId", "externalId"))::int AS cnt
       FROM "orders"
       WHERE "organizationId" = $1
         AND "orderDate" >= $2 AND "orderDate" <= $3
         AND status IN ('CANCELLED', 'RETURNED')
         ${srcFilter}`,
      orgId, dateFrom, dateTo
    );

    // Total distinct packs (para verificar que ventas+canceladas suman)
    const totalRow: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(DISTINCT COALESCE("packId", "externalId"))::int AS cnt
       FROM "orders"
       WHERE "organizationId" = $1
         AND "orderDate" >= $2 AND "orderDate" <= $3
         ${srcFilter}`,
      orgId, dateFrom, dateTo
    );

    const ventas = Number(ventasRow[0]?.cnt || 0);
    const canceladas = Number(canceladasRow[0]?.cnt || 0);
    const total = Number(totalRow[0]?.cnt || 0);

    return NextResponse.json({
      ok: true,
      buildVersion: BUILD_VERSION,
      orgId,
      range: { from: fromParam, to: toParam },
      source: source || "ALL",
      counts: {
        ventas,
        canceladas,
        total,
        sumaVentasCanceladas: ventas + canceladas,
        cuadraConTotal: (ventas + canceladas) === total,
        packsMixtosInvisibles: total - (ventas + canceladas), // deberia ser 0 si todo OK
      },
      revenue: Math.round(Number(ventasRow[0]?.revenue || 0)),
      expectedMeli: {
        ventas: "1196 (concretadas + en camino)",
        canceladas: "~182",
        total: "1378",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, stack: error.stack?.slice(0, 500) }, { status: 500 });
  }
}
