// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/debug-pixel-attribution?orgId=X&key=Y&days=7
// ══════════════════════════════════════════════════════════════
// Diagnostico: por que las ordenes no se atribuyen al pixel.
// Mira las ultimas N ordenes del periodo y para cada una:
//   - tiene customer? con email?
//   - existe pixel_visitor con ese email?
//   - tiene pixel_attribution ya creada?
// Cuenta totales por categoria.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KEY = "nitrosales-secret-key-2024-production";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const orgId = url.searchParams.get("orgId");
    const days = Number(url.searchParams.get("days") || "7");

    const allowed = key === KEY ? true : await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!orgId) return NextResponse.json({ error: "orgId requerido" }, { status: 400 });

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // ── Resumen del pixel ──
    const eventsTotal = await prisma.pixelEvent.count({ where: { organizationId: orgId } });
    const eventsRecent = await prisma.pixelEvent.count({
      where: { organizationId: orgId, timestamp: { gte: since } },
    });
    const purchaseEventsRecent = await prisma.pixelEvent.count({
      where: { organizationId: orgId, type: "PURCHASE", timestamp: { gte: since } },
    });
    const purchaseWithEmail = await prisma.pixelEvent.count({
      where: {
        organizationId: orgId,
        type: "PURCHASE",
        timestamp: { gte: since },
        // props->>'email' is not null
      },
    });

    const visitorsTotal = await prisma.pixelVisitor.count({ where: { organizationId: orgId } });
    const visitorsWithEmail = await prisma.pixelVisitor.count({
      where: { organizationId: orgId, email: { not: null } },
    });
    const visitorsLinked = await prisma.pixelVisitor.count({
      where: { organizationId: orgId, customerId: { not: null } },
    });

    // ── Resumen de orders ──
    const ordersRecent = await prisma.order.count({
      where: { organizationId: orgId, orderDate: { gte: since } },
    });
    const ordersVtexRecent = await prisma.order.count({
      where: { organizationId: orgId, source: "VTEX", orderDate: { gte: since } },
    });
    const ordersWithCustomer: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int as n FROM "orders"
       WHERE "organizationId" = $1 AND "orderDate" >= $2 AND "customerId" IS NOT NULL`,
      orgId,
      since,
    );
    const ordersWithEmail: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int as n FROM "orders" o
       INNER JOIN "customers" c ON c.id = o."customerId"
       WHERE o."organizationId" = $1 AND o."orderDate" >= $2 AND c."email" IS NOT NULL`,
      orgId,
      since,
    );

    // ── Pixel attributions ──
    const attributionsRecent: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int as n FROM "pixel_attributions"
       WHERE "organizationId" = $1 AND "createdAt" >= $2`,
      orgId,
      since,
    );

    // ── Sample: 10 ultimas orders y su estado de atribucion ──
    const sampleOrders: any[] = await prisma.$queryRawUnsafe(
      `SELECT
         o."id" as order_id,
         o."externalId",
         o."source",
         o."orderDate",
         o."totalValue",
         o."customerId",
         c."email" as customer_email,
         c."firstName" as customer_first,
         (SELECT COUNT(*)::int FROM "pixel_visitors" pv
            WHERE pv."organizationId" = o."organizationId"
              AND pv."email" = c."email") as matching_visitors_by_email,
         (SELECT COUNT(*)::int FROM "pixel_attributions" pa
            WHERE pa."orderId" = o."id") as has_attribution
       FROM "orders" o
       LEFT JOIN "customers" c ON c."id" = o."customerId"
       WHERE o."organizationId" = $1 AND o."orderDate" >= $2
       ORDER BY o."orderDate" DESC
       LIMIT 10`,
      orgId,
      since,
    );

    // ── Diagnostico ──
    const diagnosis: string[] = [];
    if (eventsRecent === 0) {
      diagnosis.push("CRITICO: pixel no esta recibiendo eventos en este periodo");
    }
    if (purchaseEventsRecent === 0 && eventsRecent > 0) {
      diagnosis.push("Pixel captura pageviews pero NO PURCHASE events. El snippet quiza no envia eventos de compra al completar.");
    }
    if (visitorsWithEmail === 0 && visitorsTotal > 0) {
      diagnosis.push("Visitors NO tienen email capturado. El pixel no esta haciendo IDENTIFY (cliente no se identifica al loguear/checkout).");
    }
    if (ordersRecent > 0 && Number(ordersWithEmail[0]?.n || 0) === 0) {
      diagnosis.push("Las orders no tienen customer.email. VTEX puede no exponer emails. Linking via email es imposible.");
    }
    if (visitorsLinked === 0 && visitorsWithEmail > 0) {
      diagnosis.push("Visitors con email NO se linkearon a customers. linkVisitorToCustomer puede no estar corriendo.");
    }
    if (Number(attributionsRecent[0]?.n || 0) === 0 && ordersRecent > 0) {
      diagnosis.push("0 atribuciones en periodo: confirma que el problema es de linking, no de pixel.");
    }

    return NextResponse.json({
      ok: true,
      orgId,
      periodDays: days,
      since: since.toISOString(),
      pixel: {
        eventsTotal,
        eventsRecent,
        purchaseEventsRecent,
        visitorsTotal,
        visitorsWithEmail,
        visitorsLinked,
      },
      orders: {
        recent: ordersRecent,
        vtexRecent: ordersVtexRecent,
        withCustomer: Number(ordersWithCustomer[0]?.n || 0),
        withEmail: Number(ordersWithEmail[0]?.n || 0),
      },
      attributions: {
        recent: Number(attributionsRecent[0]?.n || 0),
      },
      sampleOrders,
      diagnosis,
    });
  } catch (err: any) {
    console.error("[debug-pixel-attribution] error:", err);
    return NextResponse.json({ error: err.message, stack: err.stack?.slice(0, 500) }, { status: 500 });
  }
}
