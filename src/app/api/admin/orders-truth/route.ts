// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/orders-truth?orgId=X&date=YYYY-MM-DD&key=Y
// ══════════════════════════════════════════════════════════════
// Cruza los 3 universos para entender por que dan distintos numeros:
//   U1 = orders         (tabla canonica de ventas)
//   U2 = pixel_attributions (lo que el pixel atribuyo)
//   U3 = pixel_events PURCHASE (eventos disparados por pixel)
//
// Devuelve:
//   - counts en cada universo con breakdown por (source, status)
//   - intersecciones: orders ∩ attributions, orders ∩ events, attributions ∩ events
//   - huerfanos: orders sin attribution, events sin order, attributions sin event
//   - razon de cada huerfano para cada orden con detalle
//
// Default: ayer en AR (UTC-3). Param date=YYYY-MM-DD.
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
    const dateStr = url.searchParams.get("date");
    const model = url.searchParams.get("model") || "NITRO";

    const allowed = key === KEY ? true : await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!orgId) return NextResponse.json({ error: "orgId requerido" }, { status: 400 });

    // Resolver "ayer en AR" igual que el frontend
    let dayStartAR: Date;
    let dayEndAR: Date;
    if (dateStr) {
      dayStartAR = new Date(`${dateStr}T00:00:00.000-03:00`);
      dayEndAR = new Date(`${dateStr}T23:59:59.999-03:00`);
    } else {
      const now = new Date();
      const arNow = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      arNow.setUTCHours(0, 0, 0, 0);
      arNow.setUTCDate(arNow.getUTCDate() - 1);
      dayStartAR = new Date(arNow.getTime() + 3 * 60 * 60 * 1000);
      dayEndAR = new Date(dayStartAR.getTime() + 24 * 60 * 60 * 1000 - 1);
    }

    // U1: Orders en el dia
    const ordersRaw = await prisma.$queryRaw<any[]>`
      SELECT
        id, "externalId", "packId", source, status, channel,
        "trafficSource", "totalValue", "orderDate", "createdAt"
      FROM orders
      WHERE "organizationId" = ${orgId}
        AND "orderDate" >= ${dayStartAR}
        AND "orderDate" <= ${dayEndAR}
      ORDER BY "orderDate" ASC
    `;

    const ordersBreakdown: Record<string, number> = {};
    for (const o of ordersRaw) {
      const k = `${o.source || "null"}|${o.status || "null"}`;
      ordersBreakdown[k] = (ordersBreakdown[k] || 0) + 1;
    }

    // Categorias claras
    const ordersAll = ordersRaw.length;
    const ordersValid = ordersRaw.filter(
      (o) => !["CANCELLED", "PENDING", "RETURNED"].includes(o.status) && Number(o.totalValue) > 0
    );
    const ordersWeb = ordersValid.filter(
      (o) =>
        o.trafficSource !== "Marketplace" &&
        o.source !== "MELI" &&
        o.channel !== "marketplace" &&
        !String(o.externalId || "").startsWith("FVG-") &&
        !String(o.externalId || "").startsWith("BPR-")
    );
    const ordersVTEX = ordersValid.filter((o) => o.source === "VTEX");
    const ordersMELI = ordersValid.filter((o) => o.source === "MELI");

    // U2: Pixel attributions
    const attributions = await prisma.$queryRaw<any[]>`
      SELECT pa.id, pa."orderId", pa.model, pa."attributedValue",
             pa.touchpoints, pa."visitorId" as "pa_visitorId",
             o."externalId", o.source, o.status, o."totalValue", o."orderDate"
      FROM pixel_attributions pa
      JOIN orders o ON o.id = pa."orderId"
      WHERE pa."organizationId" = ${orgId}
        AND pa.model::text = ${model}
        AND o."orderDate" >= ${dayStartAR}
        AND o."orderDate" <= ${dayEndAR}
    `;
    const attributionsValid = attributions.filter(
      (a) => !["CANCELLED", "PENDING", "RETURNED"].includes(a.status) && Number(a.totalValue) > 0
    );
    const attributionsWeb = attributionsValid.filter(
      (a) =>
        a.source !== "MELI" &&
        !String(a.externalId || "").startsWith("FVG-") &&
        !String(a.externalId || "").startsWith("BPR-")
    );

    // U3: Pixel events PURCHASE
    const purchaseEvents = await prisma.$queryRaw<any[]>`
      SELECT pe.id, pe."visitorId", pe.timestamp, pe."sessionId",
             pe.payload->>'orderId' as "payloadOrderId",
             pe.payload->>'value' as "payloadValue"
      FROM pixel_events pe
      WHERE pe."organizationId" = ${orgId}
        AND pe.type = 'PURCHASE'
        AND pe.timestamp >= ${dayStartAR}
        AND pe.timestamp <= ${dayEndAR}
        AND (pe."sessionId" IS NULL OR pe."sessionId" NOT LIKE 'webhook-%')
      ORDER BY pe.timestamp ASC
    `;
    const distinctVisitorsWithPurchase = new Set(purchaseEvents.map((e) => e.visitorId)).size;
    const distinctOrderIdsInEvents = new Set(
      purchaseEvents.map((e) => e.payloadOrderId).filter(Boolean)
    );

    // Cruces
    const orderIdsValidWeb = new Set(ordersWeb.map((o) => o.id));
    const orderIdsAttributedWeb = new Set(attributionsWeb.map((a) => a.orderId));

    // Huerfanos U1 \ U2: orders web sin attribution
    const ordersWebSinAttribution = ordersWeb.filter((o) => !orderIdsAttributedWeb.has(o.id));

    // Huerfanos U2 \ U1: attributions con order pero filtros adicionales no la deja pasar (ya filtrado)

    // Eventos PURCHASE con orderId que NO matchea ningun order
    const orderExternalIdsAll = new Set(
      ordersRaw.map((o) => String(o.externalId || "")).filter(Boolean)
    );
    const eventsHuerfanos = purchaseEvents.filter(
      (e) => e.payloadOrderId && !orderExternalIdsAll.has(String(e.payloadOrderId))
    );

    // Eventos PURCHASE duplicados por visitor (mismo visitor disparo PURCHASE varias veces)
    const eventsByVisitor: Record<string, number> = {};
    for (const e of purchaseEvents) {
      const k = String(e.visitorId);
      eventsByVisitor[k] = (eventsByVisitor[k] || 0) + 1;
    }
    const visitorsConMasDeUnEvento = Object.entries(eventsByVisitor)
      .filter(([_, n]) => n > 1)
      .map(([v, n]) => ({ visitorId: v, count: n }));

    return NextResponse.json({
      ok: true,
      orgId,
      model,
      window: {
        from: dayStartAR.toISOString(),
        to: dayEndAR.toISOString(),
        timezone: "America/Argentina/Buenos_Aires",
      },
      U1_orders: {
        total: ordersAll,
        breakdown_source_status: ordersBreakdown,
        valid_count: ordersValid.length,
        web_count: ordersWeb.length,
        vtex_count: ordersVTEX.length,
        meli_count: ordersMELI.length,
        web_orders_sample: ordersWeb.slice(0, 30).map((o) => ({
          id: o.id,
          externalId: o.externalId,
          source: o.source,
          status: o.status,
          totalValue: Number(o.totalValue),
          orderDate: o.orderDate,
          channel: o.channel,
          trafficSource: o.trafficSource,
        })),
      },
      U2_pixel_attributions: {
        total: attributions.length,
        valid_count: attributionsValid.length,
        web_count: attributionsWeb.length,
        model_used: model,
      },
      U3_pixel_purchase_events: {
        total_events: purchaseEvents.length,
        distinct_visitors: distinctVisitorsWithPurchase,
        distinct_orderIds_referenced: distinctOrderIdsInEvents.size,
        visitors_with_more_than_one_event: visitorsConMasDeUnEvento.length,
        sample_duplicate_visitors: visitorsConMasDeUnEvento.slice(0, 10),
        sample_events: purchaseEvents.slice(0, 20).map((e) => ({
          visitorId: e.visitorId,
          payloadOrderId: e.payloadOrderId,
          payloadValue: e.payloadValue,
          timestamp: e.timestamp,
          sessionId: e.sessionId,
        })),
      },
      diagnosis: {
        question_1_orders_web_sin_attribution: {
          count: ordersWebSinAttribution.length,
          message: `Hay ${ordersWebSinAttribution.length} ordenes web sin pixel_attribution`,
          sample: ordersWebSinAttribution.slice(0, 20).map((o) => ({
            externalId: o.externalId,
            source: o.source,
            totalValue: Number(o.totalValue),
            orderDate: o.orderDate,
          })),
        },
        question_2_purchase_events_huerfanos: {
          count: eventsHuerfanos.length,
          message: `Hay ${eventsHuerfanos.length} eventos PURCHASE con orderId que no matchea ninguna order en la DB`,
          sample: eventsHuerfanos.slice(0, 20),
        },
        question_3_visitors_con_evento_duplicado: {
          count: visitorsConMasDeUnEvento.length,
          message: `Hay ${visitorsConMasDeUnEvento.length} visitors que dispararon PURCHASE mas de una vez en el dia`,
        },
        summary: {
          orders_total: ordersAll,
          orders_valid: ordersValid.length,
          orders_web_valid: ordersWeb.length,
          orders_vtex_valid: ordersVTEX.length,
          attributed_web: attributionsWeb.length,
          attribution_coverage_pct:
            ordersWeb.length > 0
              ? Math.round((attributionsWeb.length / ordersWeb.length) * 100)
              : 0,
          purchase_events_distinct_visitors: distinctVisitorsWithPurchase,
          gap_orders_vs_attributed: ordersWeb.length - attributionsWeb.length,
          gap_events_vs_orders: distinctVisitorsWithPurchase - ordersWeb.length,
        },
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message, stack: err.stack?.slice(0, 500) },
      { status: 500 }
    );
  }
}
