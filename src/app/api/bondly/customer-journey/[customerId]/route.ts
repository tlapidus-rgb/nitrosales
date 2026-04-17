export const dynamic = "force-dynamic";
export const revalidate = 0;

// ═══════════════════════════════════════════════════════════════════
// /api/bondly/customer-journey/[customerId]
// ═══════════════════════════════════════════════════════════════════
//
// Devuelve el timeline completo de un cliente, unificando:
//   - Pixel events (pageviews, cart-adds, product views, identify)
//   - Órdenes VTEX
//
// El objetivo del endpoint es convertir un cliente de "un número" a
// "una historia": desde la primera vez que pisó el sitio (anónimo)
// hasta la última compra, pasando por cada cart-add, cada categoría
// vista, cada cambio de device.
//
// READ-ONLY. No modifica nada. CLAUDE.md §REGLA #3b respetado.
// Pixel events cap = 500 para evitar timeline absurdo en VIPs muy
// activos — la UI puede pedir más con ?eventsLimit= si hace falta.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

interface TimelineItem {
  id: string;
  timestamp: string;
  type: "pageview" | "product_view" | "cart_add" | "purchase" | "identify" | "order" | "custom";
  title: string;
  subtitle: string | null;
  meta: Record<string, unknown>;
  source: "pixel" | "vtex";
}

interface VisitorRaw {
  id: string; // PK cuid
  visitorId: string; // UUID _np_vid
  firstSeenAt: Date;
  lastSeenAt: Date;
  totalSessions: number;
  totalPageViews: number;
  deviceTypes: string[];
  email: string | null;
  phone: string | null;
}

interface PixelEventRaw {
  id: string;
  visitorId: string; // FK al PK de pixel_visitors
  type: string;
  timestamp: Date;
  sessionId: string | null;
  props: Record<string, unknown> | null;
  utmParams: Record<string, unknown> | null;
  pageUrl: string | null;
  deviceType: string | null;
}

interface OrderRaw {
  id: string;
  externalId: string;
  orderDate: Date;
  totalValue: unknown; // Decimal → number via middleware
  status: string | null;
  source: string | null;
  trafficSource: string | null;
  itemCount: number | null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { customerId: string } }
) {
  try {
    const organizationId = await getOrganizationId();
    const customerId = params.customerId;

    if (!customerId) {
      return NextResponse.json({ error: "customerId required" }, { status: 400 });
    }

    const url = new URL(req.url);
    const eventsLimit = Math.max(
      50,
      Math.min(
        1000,
        parseInt(url.searchParams.get("eventsLimit") || "500", 10) || 500
      )
    );

    // ─── Verificar que el customer existe y pertenece a la org ──────
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, organizationId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        firstOrderAt: true,
        lastOrderAt: true,
        totalOrders: true,
        totalSpent: true,
      },
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    // ─── Visitors ligados (pixel_visitors.customerId) ──────────────
    const visitors = await prisma.$queryRaw<VisitorRaw[]>`
      SELECT
        v.id,
        v."visitorId" as "visitorId",
        v."firstSeenAt" as "firstSeenAt",
        v."lastSeenAt" as "lastSeenAt",
        v."totalSessions" as "totalSessions",
        v."totalPageViews" as "totalPageViews",
        v."deviceTypes" as "deviceTypes",
        v.email,
        v.phone
      FROM pixel_visitors v
      WHERE v."organizationId" = ${organizationId}
        AND v."customerId" = ${customerId}
      ORDER BY v."firstSeenAt" ASC
    `;

    // pixel_events.visitorId es FK al PK `id` de pixel_visitors, no al UUID visitorId
    const visitorPks = visitors.map((v) => v.id);

    // ─── Pixel events (si hay visitors ligados) ─────────────────────
    let events: PixelEventRaw[] = [];
    if (visitorPks.length > 0) {
      events = await prisma.$queryRaw<PixelEventRaw[]>`
        SELECT
          e.id,
          e."visitorId" as "visitorId",
          e.type as type,
          e.timestamp,
          e."sessionId" as "sessionId",
          e.props,
          e."utmParams" as "utmParams",
          e."pageUrl" as "pageUrl",
          e."deviceType" as "deviceType"
        FROM pixel_events e
        WHERE e."organizationId" = ${organizationId}
          AND e."visitorId" = ANY(${visitorPks}::text[])
        ORDER BY e.timestamp DESC
        LIMIT ${eventsLimit}
      `;
    }

    // ─── Órdenes del cliente ───────────────────────────────────────
    // status es enum OrderStatus → ::text para string.
    // source y trafficSource ya son String (no enum), no requieren cast.
    const orders = await prisma.$queryRaw<OrderRaw[]>`
      SELECT
        o.id,
        o."externalId" as "externalId",
        o."orderDate" as "orderDate",
        o."totalValue" as "totalValue",
        o.status::text as status,
        o.source as source,
        o."trafficSource" as "trafficSource",
        o."itemCount" as "itemCount"
      FROM orders o
      WHERE o."organizationId" = ${organizationId}
        AND o."customerId" = ${customerId}
      ORDER BY o."orderDate" ASC
    `;

    // ─── Merge en timeline unificado ────────────────────────────────
    const timeline: TimelineItem[] = [];

    // Pixel events → timeline items
    for (const e of events) {
      let type: TimelineItem["type"] = "custom";
      let title = e.type;
      let subtitle: string | null = null;

      const props = e.props || {};

      switch (e.type) {
        case "PAGE_VIEW":
          type = "pageview";
          title = "Vio página";
          subtitle = (props["page_title"] as string) || e.pageUrl || null;
          break;
        case "VIEW_PRODUCT":
          type = "product_view";
          title = "Vio producto";
          subtitle =
            (props["item_name"] as string) ||
            (props["item_id"] as string) ||
            (props["page_title"] as string) ||
            null;
          break;
        case "ADD_TO_CART":
          type = "cart_add";
          title = "Agregó al carrito";
          subtitle =
            (props["item_name"] as string) ||
            (props["item_id"] as string) ||
            null;
          break;
        case "PURCHASE":
          type = "purchase";
          title = "Compra pixel";
          subtitle = (props["order_id"] as string) || null;
          break;
        case "IDENTIFY":
          type = "identify";
          title = "Se identificó";
          subtitle =
            (props["email"] as string) || (props["phone"] as string) || null;
          break;
        default:
          type = "custom";
          title = e.type;
      }

      timeline.push({
        id: `pixel-${e.id}`,
        timestamp: new Date(e.timestamp).toISOString(),
        type,
        title,
        subtitle,
        meta: {
          visitorId: e.visitorId,
          sessionId: e.sessionId,
          deviceType: e.deviceType,
          utmSource: (e.utmParams as Record<string, unknown> | null)?.utm_source,
          utmCampaign: (e.utmParams as Record<string, unknown> | null)?.utm_campaign,
        },
        source: "pixel",
      });
    }

    // Orders → timeline items
    for (const o of orders) {
      const totalValue =
        typeof o.totalValue === "number"
          ? o.totalValue
          : Number(o.totalValue) || 0;
      timeline.push({
        id: `order-${o.id}`,
        timestamp: new Date(o.orderDate).toISOString(),
        type: "order",
        title: `Orden ${o.externalId}`,
        subtitle: `${o.itemCount ?? 0} items · $${totalValue.toFixed(0)}`,
        meta: {
          externalId: o.externalId,
          totalValue,
          status: o.status,
          source: o.source,
          trafficSource: o.trafficSource,
        },
        source: "vtex",
      });
    }

    // Orden cronológico ascendente (más viejo primero = narrativa natural)
    timeline.sort((a, b) => {
      return (
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
    });

    // ─── Summary agregado ───────────────────────────────────────────
    const totalSessions = visitors.reduce(
      (acc, v) => acc + (Number(v.totalSessions) || 0),
      0
    );
    const totalPageViews = visitors.reduce(
      (acc, v) => acc + (Number(v.totalPageViews) || 0),
      0
    );
    const firstSeenAt =
      visitors.length > 0
        ? visitors.reduce((min, v) => {
            const t = new Date(v.firstSeenAt).getTime();
            return t < min ? t : min;
          }, new Date(visitors[0].firstSeenAt).getTime())
        : null;
    const lastSeenAt =
      visitors.length > 0
        ? visitors.reduce((max, v) => {
            const t = new Date(v.lastSeenAt).getTime();
            return t > max ? t : max;
          }, 0)
        : null;

    const firstOrderTime = orders.length
      ? new Date(orders[0].orderDate).getTime()
      : null;

    let daysBetweenFirstVisitAndFirstOrder: number | null = null;
    if (firstSeenAt != null && firstOrderTime != null) {
      const diffMs = firstOrderTime - firstSeenAt;
      if (diffMs >= 0) {
        daysBetweenFirstVisitAndFirstOrder = Math.floor(
          diffMs / (1000 * 60 * 60 * 24)
        );
      }
    }

    // Pre-pixel orders = órdenes antes del primer evento pixel capturado
    let prePixelOrders = 0;
    if (firstSeenAt != null) {
      prePixelOrders = orders.filter(
        (o) => new Date(o.orderDate).getTime() < firstSeenAt
      ).length;
    } else {
      prePixelOrders = orders.length;
    }

    const deviceTypeSet = new Set<string>();
    for (const v of visitors) {
      for (const d of v.deviceTypes || []) deviceTypeSet.add(d);
    }

    return NextResponse.json({
      customer: {
        id: customer.id,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
        firstOrderAt: customer.firstOrderAt,
        lastOrderAt: customer.lastOrderAt,
        totalOrders: customer.totalOrders,
        totalSpent:
          typeof customer.totalSpent === "number"
            ? customer.totalSpent
            : Number(customer.totalSpent) || 0,
      },
      summary: {
        visitorsCount: visitors.length,
        firstSeenAt: firstSeenAt != null ? new Date(firstSeenAt).toISOString() : null,
        lastSeenAt: lastSeenAt != null ? new Date(lastSeenAt).toISOString() : null,
        totalSessions,
        totalPageViews,
        totalEventsInTimeline: events.length,
        totalOrders: orders.length,
        prePixelOrders,
        daysBetweenFirstVisitAndFirstOrder,
        deviceTypes: Array.from(deviceTypeSet),
      },
      timeline,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[/api/bondly/customer-journey] error:", err);
    return NextResponse.json(
      {
        error: "Failed to build customer journey",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
