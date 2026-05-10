// @ts-nocheck
// GET /api/admin/debug-orders-deep?key=Y&orgSlug=tevecompras&externalIds=A,B,C
// Investigacion PROFUNDA de ordenes especificas que no tienen atribucion.
// Para cada orden:
//   - data completa (customer, channel, source, dates, status)
//   - eventos pixel asociados al customer email
//   - visitors pixel asociados al customer email
//   - eventos pixel cercanos en tiempo (-2h, +5min)
//   - eventos pixel por IP del checkout
//   - touchpoints/visitors candidatos
//   - razones de fallo de matching
//   - presencia/ausencia de atribuciones de cada modelo
// No asume nada. Devuelve raw data + diagnostico hipotetizado.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const KEY = "nitrosales-secret-key-2024-production";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const orgSlugOrId = url.searchParams.get("orgSlug") || url.searchParams.get("orgId");
    const externalIdsRaw = url.searchParams.get("externalIds");
    if (key !== KEY) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!orgSlugOrId) return NextResponse.json({ error: "orgSlug requerido" }, { status: 400 });
    if (!externalIdsRaw) return NextResponse.json({ error: "externalIds requerido" }, { status: 400 });

    // Resolver organizacion
    const org = await prisma.organization.findFirst({
      where: {
        OR: [
          { id: orgSlugOrId },
          { slug: orgSlugOrId },
          { name: { contains: orgSlugOrId, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, slug: true, settings: true },
    });
    if (!org) return NextResponse.json({ error: "org no encontrada" }, { status: 404 });

    const externalIds = externalIdsRaw.split(",").map((s) => s.trim()).filter(Boolean);

    const result: any = {
      org: { id: org.id, name: org.name, slug: org.slug },
      ordersAnalyzed: [],
    };

    for (const extId of externalIds) {
      const ord = await prisma.$queryRawUnsafe<any[]>(`
        SELECT
          o.id, o."externalId", o."packId", o."totalValue", o.status::text as status,
          o.source, o.channel, o."trafficSource", o."orderDate", o."createdAt",
          o."customerId", o."salesChannel", o."utmSource", o."utmMedium", o."utmCampaign",
          c.email as customer_email, c."firstName" as customer_firstName,
          c."lastName" as customer_lastName, c.phone as customer_phone
        FROM orders o
        LEFT JOIN customers c ON c.id = o."customerId"
        WHERE o."organizationId" = $1 AND o."externalId" = $2
        LIMIT 1
      `, org.id, extId);

      if (ord.length === 0) {
        result.ordersAnalyzed.push({ externalId: extId, error: "orden no encontrada" });
        continue;
      }
      const order = ord[0];
      const orderId = order.id;
      const orderTime = new Date(order.orderDate);
      const customerEmail = (order.customer_email || "").toLowerCase();
      const customerPhone = order.customer_phone;

      // Atribuciones existentes
      const allAttrs = await prisma.$queryRawUnsafe<any[]>(`
        SELECT pa.model::text as model, pa."touchpointCount", pa."attributedValue",
               pa."visitorId", pa."createdAt"
        FROM pixel_attributions pa
        WHERE pa."orderId" = $1
        ORDER BY pa.model
      `, orderId);

      // Visitors por email del customer
      const visitorsByEmail = customerEmail
        ? await prisma.$queryRawUnsafe<any[]>(`
            SELECT id, "visitorId", email, phone, "customerId", "createdAt"
            FROM pixel_visitors
            WHERE "organizationId" = $1 AND LOWER(email) = $2
            ORDER BY "createdAt" DESC
            LIMIT 20
          `, org.id, customerEmail)
        : [];

      // Visitors linkeados al customer (por customerId)
      const visitorsByCustomer = order.customerId
        ? await prisma.$queryRawUnsafe<any[]>(`
            SELECT id, "visitorId", email, phone, "customerId", "createdAt"
            FROM pixel_visitors
            WHERE "organizationId" = $1 AND "customerId" = $2
            ORDER BY "createdAt" DESC
            LIMIT 20
          `, org.id, order.customerId)
        : [];

      // Eventos pixel con el email del customer (en props->>'email')
      const eventsByEmail = customerEmail
        ? await prisma.$queryRawUnsafe<any[]>(`
            SELECT id, "visitorId", "sessionId", timestamp, type::text as type,
                   "pageUrl", referrer, "clickIds", "utmParams", "ipHash"
            FROM pixel_events
            WHERE "organizationId" = $1
              AND (LOWER(props->>'email') = $2 OR LOWER(COALESCE(props->>'userEmail','')) = $2)
            ORDER BY timestamp DESC
            LIMIT 10
          `, org.id, customerEmail)
        : [];

      // Touchpoint window: -2h, +5min alrededor del orderTime
      const windowStart = new Date(orderTime.getTime() - 2 * 60 * 60 * 1000);
      const windowEnd = new Date(orderTime.getTime() + 5 * 60 * 1000);

      const eventsNearOrder = await prisma.$queryRawUnsafe<any[]>(`
        SELECT id, "visitorId", "sessionId", timestamp, type::text as type,
               "pageUrl", referrer, "clickIds", "utmParams", "ipHash",
               (props->>'email') as email_prop
        FROM pixel_events
        WHERE "organizationId" = $1
          AND timestamp >= $2 AND timestamp <= $3
          AND "sessionId" NOT LIKE 'webhook-%'
        ORDER BY timestamp DESC
        LIMIT 50
      `, org.id, windowStart, windowEnd);

      // PURCHASE events alrededor del order time
      const purchaseEvents = await prisma.$queryRawUnsafe<any[]>(`
        SELECT id, "visitorId", "sessionId", timestamp, "pageUrl",
               (props->>'orderId') as event_order_id,
               (props->>'order_id') as event_order_id_2,
               (props->>'value') as event_value,
               (props->>'email') as email_prop
        FROM pixel_events
        WHERE "organizationId" = $1
          AND type = 'PURCHASE'
          AND timestamp >= $2 AND timestamp <= $3
        ORDER BY timestamp DESC
        LIMIT 20
      `, org.id, windowStart, windowEnd);

      // Otras ordenes del mismo customer (para detectar patrones)
      const otherOrdersSameCustomer = order.customerId
        ? await prisma.$queryRawUnsafe<any[]>(`
            SELECT o.id, o."externalId", o."totalValue", o."orderDate", o.source, o.channel,
                   (SELECT COUNT(*) FROM pixel_attributions pa WHERE pa."orderId" = o.id AND pa.model::text = 'NITRO') as has_nitro
            FROM orders o
            WHERE o."organizationId" = $1 AND o."customerId" = $2 AND o.id != $3
            ORDER BY o."orderDate" DESC
            LIMIT 10
          `, org.id, order.customerId, orderId)
        : [];

      // Diagnostico
      const diag: string[] = [];
      const nitroAttr = allAttrs.find((a) => a.model === "NITRO");
      if (!nitroAttr) {
        diag.push("NO_NITRO_ATTRIBUTION: no se creo atribucion NITRO para esta orden");
      } else if (nitroAttr.touchpointCount === 0) {
        diag.push("ZERO_TOUCHPOINTS: atribucion existe pero con 0 touchpoints");
      }
      if (allAttrs.length === 0) diag.push("NO_ATTRIBUTION_AT_ALL: ningun modelo tiene atribucion → calculateAttribution nunca corrio o no encontro visitor");
      if (!customerEmail) diag.push("NO_CUSTOMER_EMAIL: la orden no tiene email del customer (matching por email imposible)");
      if (customerEmail && visitorsByEmail.length === 0) diag.push("NO_VISITOR_FOR_EMAIL: hay email del customer pero NO existe pixel_visitor con ese email");
      if (visitorsByEmail.length > 0 && !nitroAttr) diag.push("VISITOR_EXISTS_BUT_NO_ATTR: hay visitor con email pero no se atribuyo — calculateAttribution puede haber fallado");
      if (eventsByEmail.length === 0 && customerEmail) diag.push("NO_PIXEL_EVENTS_FOR_EMAIL: no hay un solo evento pixel con ese email");
      if (eventsNearOrder.length === 0) diag.push("NO_EVENTS_NEAR_ORDER: no hubo eventos pixel en la ventana de tiempo (-2h, +5min) — el pixel quiza nunca cargo");
      if (otherOrdersSameCustomer.length > 0) {
        const withAttr = otherOrdersSameCustomer.filter((o) => Number(o.has_nitro) > 0).length;
        diag.push(`OTHER_ORDERS_CUSTOMER: customer tiene ${otherOrdersSameCustomer.length} otras orders, ${withAttr} con atribucion NITRO`);
      }

      result.ordersAnalyzed.push({
        externalId: extId,
        order: {
          ...order,
          totalValue: Number(order.totalValue),
          orderDate: order.orderDate,
          createdAt: order.createdAt,
        },
        attributions: allAttrs.map((a) => ({ ...a, attributedValue: Number(a.attributedValue) })),
        visitorsByEmail: visitorsByEmail.map((v) => ({ ...v, hash: v.visitorId })),
        visitorsByCustomerId: visitorsByCustomer,
        eventsByEmail: eventsByEmail.length,
        eventsByEmailSample: eventsByEmail.slice(0, 3),
        eventsNearOrder: eventsNearOrder.length,
        eventsNearOrderSample: eventsNearOrder.slice(0, 5),
        purchaseEventsInWindow: purchaseEvents.length,
        purchaseEventsSample: purchaseEvents.slice(0, 3),
        otherOrdersSameCustomer: otherOrdersSameCustomer.map((o) => ({
          ...o,
          totalValue: Number(o.totalValue),
          has_nitro: Number(o.has_nitro),
        })),
        diagnosis: diag,
      });
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, stack: err.stack?.slice(0, 800) }, { status: 500 });
  }
}
