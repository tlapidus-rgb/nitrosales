// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/debug-orders-attribution-detail?orgId=X&date=YYYY-MM-DD&key=Y
// ══════════════════════════════════════════════════════════════
// Para cada orden web de un dia especifico (default: ayer), muestra
// el detalle de por que se atribuyo o no:
//   - customerId, customer.email, customer.phone
//   - ¿hay pixel_visitor con email/phone matching?
//   - ¿el visitor esta linkeado a un customer (pixel_visitors.customerId)?
//   - ¿hay pixel_attribution para esta order?
//   - razon si no se atribuyo
//
// Excluye marketplaces (FVG-, BPR-, MELI, channel='marketplace').
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
    const dateStr = url.searchParams.get("date"); // YYYY-MM-DD; default = ayer

    const allowed = key === KEY ? true : await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!orgId) return NextResponse.json({ error: "orgId requerido" }, { status: 400 });

    let dayStart: Date;
    let dayEnd: Date;
    if (dateStr) {
      dayStart = new Date(`${dateStr}T00:00:00.000-03:00`); // AR timezone
      dayEnd = new Date(`${dateStr}T23:59:59.999-03:00`);
    } else {
      // Ayer en AR
      const now = new Date();
      const ar = new Date(now.getTime() - 3 * 60 * 60 * 1000); // -3h offset
      ar.setUTCHours(0, 0, 0, 0);
      ar.setUTCDate(ar.getUTCDate() - 1);
      dayStart = new Date(ar.getTime() + 3 * 60 * 60 * 1000); // back to UTC for query
      dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
    }

    // Orders web del dia (excluyendo marketplaces)
    const orders: any[] = await prisma.$queryRawUnsafe(
      `SELECT
         o."id" as order_id,
         o."externalId",
         o."orderDate",
         o."totalValue",
         o."status",
         o."source",
         o."channel",
         o."trafficSource",
         o."customerId",
         c."email" as customer_email,
         c."firstName" as customer_first
       FROM "orders" o
       LEFT JOIN "customers" c ON c."id" = o."customerId"
       WHERE o."organizationId" = $1
         AND o."orderDate" >= $2
         AND o."orderDate" <= $3
         AND o."source" != 'MELI'
         AND (o."channel" IS NULL OR o."channel" != 'marketplace')
         AND (o."trafficSource" IS NULL OR o."trafficSource" != 'Marketplace')
         AND o."externalId" NOT LIKE 'FVG-%'
         AND o."externalId" NOT LIKE 'BPR-%'
         AND o."status" NOT IN ('CANCELLED', 'PENDING')
         AND o."totalValue" > 0
       ORDER BY o."orderDate" DESC`,
      orgId,
      dayStart,
      dayEnd,
    );

    const results: any[] = [];
    for (const o of orders) {
      // ¿hay pixel_visitor con ese email?
      let visitorByEmail: any = null;
      if (o.customer_email) {
        const v: any[] = await prisma.$queryRawUnsafe(
          `SELECT "id", "visitorId", "email", "customerId", "lastSeenAt", "totalSessions"
           FROM "pixel_visitors"
           WHERE "organizationId" = $1 AND LOWER("email") = LOWER($2)
           LIMIT 1`,
          orgId,
          o.customer_email,
        );
        visitorByEmail = v[0] || null;
      }

      // ¿hay pixel_attribution para esta order?
      const attribution: any[] = await prisma.$queryRawUnsafe(
        `SELECT "id", "model"::text, "attributedValue", "touchpointCount"
         FROM "pixel_attributions"
         WHERE "orderId" = $1`,
        o.order_id,
      );

      // Razon si no se atribuyo
      let reason: string;
      if (attribution.length > 0) {
        reason = "ATRIBUIDO ✓";
      } else if (!o.customer_email) {
        reason = "Customer sin email — no se puede matchear con visitor";
      } else if (!visitorByEmail) {
        reason = `Customer tiene email (${o.customer_email}) pero NO hay visitor del pixel con ese email`;
      } else if (!visitorByEmail.customerId) {
        reason = "Visitor existe pero no esta linkeado al customer (linkVisitorToCustomer no corrio)";
      } else {
        reason = "Visitor linkeado pero no hay attribution row (logica de atribucion no se ejecuto)";
      }

      results.push({
        externalId: o.externalId,
        orderDate: o.orderDate,
        totalValue: Number(o.totalValue),
        status: o.status,
        customer: o.customerId
          ? { id: o.customerId, email: o.customer_email, firstName: o.customer_first }
          : null,
        visitorByEmail: visitorByEmail
          ? {
              id: visitorByEmail.id,
              visitorId: visitorByEmail.visitorId,
              email: visitorByEmail.email,
              linkedToCustomer: visitorByEmail.customerId,
              sessions: visitorByEmail.totalSessions,
            }
          : null,
        attribution: attribution[0] || null,
        diagnosis: reason,
      });
    }

    // Summary de razones
    const reasonCounts: Record<string, number> = {};
    for (const r of results) {
      reasonCounts[r.diagnosis] = (reasonCounts[r.diagnosis] || 0) + 1;
    }

    return NextResponse.json({
      ok: true,
      orgId,
      dayStart,
      dayEnd,
      totalOrdersWeb: results.length,
      reasonCounts,
      orders: results,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, stack: err.stack?.slice(0, 500) }, { status: 500 });
  }
}
