export const dynamic = "force-dynamic";
export const revalidate = 0;

// ═══════════════════════════════════════════════════════════════════
// /api/bondly/clientes/[id] — Customer 360 detail (Fase 3)
// ═══════════════════════════════════════════════════════════════════
// Devuelve todo lo necesario para la ficha 360:
//   - Base info del cliente
//   - Lifetime stats (orders, spent, avg ticket, first/last)
//   - Tier, segment, CLV rank, churn risk
//   - Acquisition (primer canal + campaign)
//   - Favorite products (top 5)
//   - Unified timeline (orders + pixel events cronológico)
//   - Device breakdown
//   - Recent sessions
//   - Predictions (next purchase probability heurística)
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function detectChannel(clickIds: any, utm: any, referrer: string | null): string | null {
  const cid = clickIds || {};
  const u = utm || {};
  if (cid.fbclid || cid.last_utm_source === "fb" || u.source === "fb" || u.source === "facebook" || u.source === "instagram" || u.source === "ig") return "meta";
  if (cid.gclid || u.source === "google" || u.medium === "cpc") return "google";
  if (cid.ttclid || u.source === "tiktok") return "tiktok";
  if (u.source === "email" || u.medium === "email") return "email";
  if (u.source === "whatsapp" || u.medium === "whatsapp") return "whatsapp";
  if (u.medium === "referral" || (referrer && !referrer.includes("google") && !referrer.includes("facebook") && !referrer.includes("instagram"))) return "referral";
  if (u.medium === "organic" || (referrer && (referrer.includes("google") || referrer.includes("bing")))) return "organic";
  if (!referrer || referrer === "" || referrer === "direct") return "direct";
  return "other";
}

function computeTier(totalOrders: number, clvRank: number, recencyDays: number | null): string {
  if (clvRank >= 90 && (recencyDays == null || recencyDays <= 60)) return "VIP";
  if (recencyDays != null && recencyDays > 180) return "Dormant";
  if (recencyDays != null && recencyDays > 60 && totalOrders >= 2) return "At Risk";
  if (totalOrders >= 4) return "Loyal";
  if (totalOrders === 1) return "New";
  return "Regular";
}

function computeSegment(totalOrders: number, recencyDays: number | null): string {
  const r = recencyDays ?? 999;
  if (r <= 30 && totalOrders >= 4) return "Champions";
  if (totalOrders >= 4) return "Leales";
  if (r <= 30 && totalOrders === 1) return "Nuevos";
  if (r <= 60 && totalOrders >= 2) return "Potenciales";
  if (r > 180) return "Perdidos";
  if (r > 90 && totalOrders >= 2) return "En riesgo";
  return "Ocasionales";
}

// Churn risk heuristic 0-100
function churnRisk(recencyDays: number | null, orders: number, avgGapDays: number | null): number {
  if (orders === 0 || recencyDays == null) return 50;
  if (recencyDays > 365) return 95;
  if (recencyDays > 180) return 85;
  if (avgGapDays && recencyDays > avgGapDays * 2.5) return 70;
  if (recencyDays > 60 && orders >= 2) return 55;
  if (recencyDays <= 30) return 15;
  return 35;
}

// Next purchase probability 0-100 (inverso de churn)
function purchaseProbability(recencyDays: number | null, orders: number, avgGapDays: number | null): number {
  if (orders === 0) return 0;
  if (recencyDays == null) return 10;
  if (orders >= 4 && recencyDays <= 30) return 85;
  if (avgGapDays && recencyDays < avgGapDays) return 75;
  if (recencyDays <= 30) return 55;
  if (recencyDays <= 60) return 40;
  if (recencyDays <= 180) return 20;
  return 5;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const ORG_ID = await getOrganizationId();
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }

    // 1) Customer base
    const customer = await prisma.customer.findFirst({
      where: { id, organizationId: ORG_ID },
      select: {
        id: true, externalId: true, email: true, firstName: true, lastName: true,
        city: true, state: true, country: true,
        firstOrderAt: true, lastOrderAt: true, totalOrders: true, totalSpent: true,
      },
    });

    if (!customer) {
      return NextResponse.json({ ok: false, error: "Customer not found" }, { status: 404 });
    }

    // 2) Lifetime stats (sólo VTEX, excluye cancelled)
    const lifetimeRows = await prisma.$queryRawUnsafe<Array<{
      orders: string;
      total_spent: string;
      avg_ticket: string;
      first_order: Date | null;
      last_order: Date | null;
      recency: string | null;
      avg_gap_days: string | null;
    }>>(`
      WITH ord AS (
        SELECT o.id, o."orderDate"
        FROM orders o
        WHERE o."customerId" = '${id}'
          AND o."organizationId" = '${ORG_ID}'
          AND o."source" = 'VTEX'
          AND o.status NOT IN ('CANCELLED', 'RETURNED')
      ),
      gaps AS (
        SELECT EXTRACT(DAY FROM o."orderDate" - LAG(o."orderDate") OVER (ORDER BY o."orderDate"))::numeric AS gap
        FROM ord o
      )
      SELECT
        (SELECT COUNT(*)::text FROM ord) AS orders,
        (SELECT COALESCE(SUM(o2."totalValue"), 0)::text FROM orders o2
          WHERE o2."customerId" = '${id}' AND o2."organizationId" = '${ORG_ID}'
            AND o2."source" = 'VTEX' AND o2.status NOT IN ('CANCELLED', 'RETURNED')) AS total_spent,
        (SELECT COALESCE(AVG(o2."totalValue"), 0)::text FROM orders o2
          WHERE o2."customerId" = '${id}' AND o2."organizationId" = '${ORG_ID}'
            AND o2."source" = 'VTEX' AND o2.status NOT IN ('CANCELLED', 'RETURNED')) AS avg_ticket,
        (SELECT MIN(o."orderDate") FROM ord o) AS first_order,
        (SELECT MAX(o."orderDate") FROM ord o) AS last_order,
        (SELECT EXTRACT(DAY FROM NOW() - MAX(o."orderDate"))::text FROM ord o) AS recency,
        (SELECT AVG(gap)::text FROM gaps WHERE gap IS NOT NULL) AS avg_gap_days
    `);

    const lt = lifetimeRows[0];
    const orders = Number(lt.orders || 0);
    const totalSpent = Math.round(Number(lt.total_spent || 0));
    const avgTicket = Math.round(Number(lt.avg_ticket || 0));
    const recencyDays = lt.recency != null ? Math.round(Number(lt.recency)) : null;
    const avgGapDays = lt.avg_gap_days ? Math.round(Number(lt.avg_gap_days)) : null;

    // 3) CLV rank (percentil)
    const clvRankRow = await prisma.$queryRawUnsafe<Array<{ rank_pct: string }>>(`
      WITH lifetime AS (
        SELECT o."customerId", SUM(o."totalValue") AS spent
        FROM orders o
        WHERE o."organizationId" = '${ORG_ID}' AND o."source" = 'VTEX'
          AND o.status NOT IN ('CANCELLED', 'RETURNED') AND o."customerId" IS NOT NULL
        GROUP BY o."customerId"
      ),
      ranked AS (
        SELECT "customerId", PERCENT_RANK() OVER (ORDER BY spent) AS rank_pct
        FROM lifetime
      )
      SELECT COALESCE((rank_pct * 100)::text, '0') AS rank_pct
      FROM ranked WHERE "customerId" = '${id}'
    `);
    const clvRank = Math.round(Number(clvRankRow[0]?.rank_pct || 0));

    // 4) Pixel visitor data — match por 3-way identity (customerId OR email)
    //    Un mismo customer puede tener varios pixel_visitors (distintos devices,
    //    antes/después de login, etc.). Los unimos por customerId directo o por
    //    email normalizado (LOWER). Escapamos comilla simple para SQL safety.
    const safeEmail = customer.email ? customer.email.toLowerCase().replace(/'/g, "''") : null;
    const emailClause = safeEmail
      ? `OR (v.email IS NOT NULL AND LOWER(v.email) = '${safeEmail}')`
      : "";

    const visitorRows = await prisma.$queryRawUnsafe<Array<{
      id: string;
      email: string | null;
      phone: string | null;
      first_seen: Date;
      last_seen: Date;
      total_sessions: number;
      total_pvs: number;
      device_types: string[];
      country: string | null;
      region: string | null;
      click_ids: any;
    }>>(`
      SELECT v.id, v.email, v.phone, v."firstSeenAt" AS first_seen, v."lastSeenAt" AS last_seen,
             v."totalSessions" AS total_sessions, v."totalPageViews" AS total_pvs,
             v."deviceTypes" AS device_types, v.country, v.region, v."clickIds" AS click_ids
      FROM pixel_visitors v
      WHERE v."organizationId" = '${ORG_ID}'
        AND (
          v."customerId" = '${id}'
          ${emailClause}
        )
      ORDER BY v."lastSeenAt" DESC
    `);

    // Agregamos stats a través de TODOS los visitors que matchean.
    const visitor = visitorRows[0] || null;
    const visitorIds = visitorRows.map(v => v.id);
    const aggTotalSessions = visitorRows.reduce((s, v) => s + Number(v.total_sessions || 0), 0);
    const aggTotalPvs = visitorRows.reduce((s, v) => s + Number(v.total_pvs || 0), 0);
    const aggFirstSeen = visitorRows.reduce<Date | null>((acc, v) => {
      if (!v.first_seen) return acc;
      const d = new Date(v.first_seen);
      if (!acc || d < acc) return d;
      return acc;
    }, null);
    const aggLastSeen = visitorRows.reduce<Date | null>((acc, v) => {
      if (!v.last_seen) return acc;
      const d = new Date(v.last_seen);
      if (!acc || d > acc) return d;
      return acc;
    }, null);
    const aggDeviceTypes = Array.from(new Set(
      visitorRows.flatMap(v => (v.device_types || []).filter(Boolean))
    ));
    const aggCountry = visitorRows.find(v => v.country)?.country || null;
    const aggRegion = visitorRows.find(v => v.region)?.region || null;
    const aggPhone = visitorRows.find(v => v.phone)?.phone || null;

    // 5) Timeline: últimas 30 órdenes + últimos 50 pixel events, ordenado por fecha desc
    const ordersListPromise = prisma.$queryRawUnsafe<Array<{
      id: string;
      external_id: string;
      status: string;
      total_value: string;
      item_count: number;
      order_date: Date;
      channel: string | null;
      traffic_source: string | null;
      payment_method: string | null;
    }>>(`
      SELECT o.id, o."externalId" AS external_id, o.status, o."totalValue"::text AS total_value,
             o."itemCount" AS item_count, o."orderDate" AS order_date,
             o.channel, o."trafficSource" AS traffic_source, o."paymentMethod" AS payment_method
      FROM orders o
      WHERE o."customerId" = '${id}' AND o."organizationId" = '${ORG_ID}'
        AND o."source" = 'VTEX' AND o.status NOT IN ('CANCELLED', 'RETURNED')
      ORDER BY o."orderDate" DESC
      LIMIT 30
    `);

    let eventsPromise: Promise<any[]> = Promise.resolve([]);
    let firstEventPromise: Promise<any[]> = Promise.resolve([]);
    if (visitorIds.length > 0) {
      // Escapamos comilla simple por si alguna ID tuviera caracteres raros (cuid, pero por las dudas)
      const visitorIdList = visitorIds.map(v => `'${v.replace(/'/g, "''")}'`).join(",");

      eventsPromise = prisma.$queryRawUnsafe<Array<{
        id: string;
        type: string;
        page_url: string | null;
        props: any;
        device_type: string | null;
        timestamp: Date;
      }>>(`
        SELECT e.id, e.type, e."pageUrl" AS page_url, e.props,
               e."deviceType" AS device_type, e.timestamp
        FROM pixel_events e
        WHERE e."visitorId" IN (${visitorIdList}) AND e."organizationId" = '${ORG_ID}'
        ORDER BY e.timestamp DESC
        LIMIT 60
      `);

      // first event (acquisition) — el evento más viejo a través de TODOS los visitors
      firstEventPromise = prisma.$queryRawUnsafe<Array<{
        click_ids: any;
        utm_params: any;
        referrer: string | null;
        timestamp: Date;
      }>>(`
        SELECT e."clickIds" AS click_ids, e."utmParams" AS utm_params, e.referrer, e.timestamp
        FROM pixel_events e
        WHERE e."visitorId" IN (${visitorIdList}) AND e."organizationId" = '${ORG_ID}'
        ORDER BY e.timestamp ASC
        LIMIT 1
      `);
    }

    // 6) Top products comprados (por cantidad)
    const topProductsPromise = prisma.$queryRawUnsafe<Array<{
      product_id: string | null;
      name: string;
      image_url: string | null;
      category: string | null;
      quantity: string;
      total_spent: string;
      last_ordered: Date;
    }>>(`
      SELECT p.id AS product_id, p.name, p."imageUrl" AS image_url, p.category,
             SUM(oi.quantity)::text AS quantity,
             SUM(oi."totalPrice")::text AS total_spent,
             MAX(o."orderDate") AS last_ordered
      FROM orders o
      JOIN order_items oi ON oi."orderId" = o.id
      JOIN products p ON p.id = oi."productId"
      WHERE o."customerId" = '${id}' AND o."organizationId" = '${ORG_ID}'
        AND o."source" = 'VTEX' AND o.status NOT IN ('CANCELLED', 'RETURNED')
      GROUP BY p.id, p.name, p."imageUrl", p.category
      ORDER BY SUM(oi.quantity) DESC
      LIMIT 5
    `);

    const [orderList, events, firstEvents, topProducts] = await Promise.all([
      ordersListPromise,
      eventsPromise,
      firstEventPromise,
      topProductsPromise,
    ]);

    // 7) Acquisition (canal del primer evento)
    let acquisition = { channel: null as string | null, campaign: null as string | null, source: null as string | null, medium: null as string | null, firstTouchAt: null as string | null };
    if (firstEvents.length > 0) {
      const fe = firstEvents[0];
      acquisition = {
        channel: detectChannel(fe.click_ids, fe.utm_params, fe.referrer),
        campaign: (fe.utm_params?.campaign as string) || null,
        source: (fe.utm_params?.source as string) || null,
        medium: (fe.utm_params?.medium as string) || null,
        firstTouchAt: fe.timestamp ? new Date(fe.timestamp).toISOString() : null,
      };
    }

    // 8) Device breakdown (agregado a través de todos los visitors matching)
    const deviceBreakdown = aggDeviceTypes.reduce((acc: Record<string, number>, d: string) => {
      if (!d) return acc;
      acc[d] = (acc[d] || 0) + 1;
      return acc;
    }, {});

    // 9) Tier + segment + predictions
    const tier = computeTier(orders, clvRank, recencyDays);
    const segment = computeSegment(orders, recencyDays);
    const churn = churnRisk(recencyDays, orders, avgGapDays);
    const nextPurchaseProb = purchaseProbability(recencyDays, orders, avgGapDays);

    // 10) Next likely category (última categoría comprada)
    const nextCategory = topProducts[0]?.category || null;

    // 11) Unified timeline (orders + events)
    const timeline: Array<any> = [];
    for (const o of orderList) {
      timeline.push({
        kind: "order",
        id: o.id,
        timestamp: new Date(o.order_date).toISOString(),
        externalId: o.external_id,
        status: o.status,
        total: Math.round(Number(o.total_value)),
        itemCount: o.item_count,
        channel: o.channel,
        trafficSource: o.traffic_source,
        paymentMethod: o.payment_method,
      });
    }
    for (const e of events) {
      const props = e.props || {};
      timeline.push({
        kind: "event",
        id: e.id,
        timestamp: new Date(e.timestamp).toISOString(),
        type: e.type,
        pageUrl: e.page_url,
        deviceType: e.device_type,
        productName: props.name || props.product_name || null,
        productId: props.item_id || props.productId || null,
        value: props.value != null ? Number(props.value) : null,
      });
    }

    // Dedupe events: el píxel suele disparar PAGE_VIEW + VIEW_PRODUCT en el mismo
    // instante cuando el usuario abre una ficha de producto (y lo mismo con
    // PAGE_VIEW + INITIATE_CHECKOUT, etc.). Colapsamos por (minuto + sujeto) y
    // nos quedamos con el evento más específico del grupo. Las órdenes nunca se
    // tocan.
    const EVENT_SPECIFICITY: Record<string, number> = {
      PURCHASE: 100,
      CHECKOUT_PAYMENT: 90,
      CHECKOUT_SHIPPING: 85,
      INITIATE_CHECKOUT: 80,
      BEGIN_CHECKOUT: 80,
      ADD_TO_CART: 70,
      REMOVE_FROM_CART: 65,
      VIEW_PRODUCT: 60,
      VIEW_ITEM: 60,
      VIEW_ITEM_LIST: 50,
      SEARCH: 45,
      IDENTIFY: 40,
      SESSION_START: 30,
      CLICK: 20,
      PAGE_VIEW: 10,
    };
    const specificityOf = (t: string) => EVENT_SPECIFICITY[t] ?? 0;

    // Normalizador de URL: saca host/protocolo, query, hash, trailing slash y
    // pasa a lowercase. Así "/juego-quarto/p" y "https://site.com/juego-quarto/p?utm=x"
    // colapsan a la misma clave.
    const normalizeUrl = (raw: any): string => {
      if (!raw) return "";
      try {
        const s = String(raw).trim();
        // Si viene como URL absoluta, extraer pathname; si es path, usar tal cual
        let path = s;
        if (/^https?:\/\//i.test(s)) {
          try {
            path = new URL(s).pathname;
          } catch { /* noop */ }
        }
        // Cortar query y hash
        path = path.split("?")[0].split("#")[0];
        // Sacar trailing slash (salvo el root)
        if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
        return path.toLowerCase();
      } catch {
        return String(raw).toLowerCase();
      }
    };

    const normalizeText = (raw: any): string => {
      if (!raw) return "";
      return String(raw).trim().toLowerCase().replace(/\s+/g, " ");
    };

    // Sujeto canónico de un evento:
    //  1) URL normalizada si existe (junta PAGE_VIEW + VIEW_PRODUCT de la misma ficha)
    //  2) productId normalizado
    //  3) productName normalizado
    const canonicalSubject = (item: any): string => {
      const url = normalizeUrl(item.pageUrl);
      if (url) return `url:${url}`;
      const pid = normalizeText(item.productId);
      if (pid) return `pid:${pid}`;
      const pname = normalizeText(item.productName);
      if (pname) return `pname:${pname}`;
      return `type:${item.type || ""}`;
    };

    // Ventana de 3 minutos: ráfagas típicas del píxel (PAGE_VIEW + VIEW_PRODUCT +
    // reloads rápidos de la misma categoría) quedan como un único evento.
    const WINDOW_MS = 3 * 60 * 1000;

    const eventItems: any[] = [];
    const nonEventItems: any[] = [];
    for (const item of timeline) {
      if (item.kind !== "event") nonEventItems.push(item);
      else eventItems.push(item);
    }

    // Ordenar eventos ascendente por timestamp para poder agrupar por ventana
    eventItems.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Para cada sujeto canónico, llevar el último timestamp bucketizado; si el
    // evento nuevo cae dentro de WINDOW_MS del último visto del mismo sujeto,
    // se considera el mismo "momento" y se queda el más específico.
    const lastSeenBySubject = new Map<string, { item: any; ts: number }>();
    const keptEvents: any[] = [];

    for (const item of eventItems) {
      const subj = canonicalSubject(item);
      const ts = new Date(item.timestamp).getTime();
      const prev = lastSeenBySubject.get(subj);
      if (prev && ts - prev.ts <= WINDOW_MS) {
        // Mismo sujeto dentro de la ventana → colapsar
        const prevSpec = specificityOf(prev.item.type);
        const newSpec = specificityOf(item.type);
        if (newSpec > prevSpec) {
          // Reemplazar el anterior por el nuevo (más específico) en keptEvents
          const idx = keptEvents.indexOf(prev.item);
          if (idx !== -1) keptEvents.splice(idx, 1);
          keptEvents.push(item);
          lastSeenBySubject.set(subj, { item, ts });
        } else {
          // Mantener el anterior, avanzar el timestamp de referencia
          lastSeenBySubject.set(subj, { item: prev.item, ts });
        }
      } else {
        keptEvents.push(item);
        lastSeenBySubject.set(subj, { item, ts });
      }
    }

    const dedupedTimeline: any[] = [...nonEventItems, ...keptEvents];
    dedupedTimeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Last visit minutes ago — usar agregado (última visita a través de TODOS los devices)
    const lastVisitAt = aggLastSeen ? aggLastSeen.toISOString() : null;
    const lastVisitMinutesAgo = lastVisitAt
      ? Math.floor((Date.now() - new Date(lastVisitAt).getTime()) / 60000)
      : null;
    const isActiveNow = lastVisitMinutesAgo != null && lastVisitMinutesAgo < 10;

    return NextResponse.json({
      ok: true,
      customer: {
        id: customer.id,
        externalId: customer.externalId,
        name: `${customer.firstName || ""} ${customer.lastName || ""}`.trim() || "Sin nombre",
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: aggPhone,
        city: customer.city,
        state: customer.state,
        country: customer.country,
      },
      stats: {
        totalOrders: orders,
        totalSpent,
        avgTicket,
        firstOrderAt: lt.first_order ? new Date(lt.first_order).toISOString() : null,
        lastOrderAt: lt.last_order ? new Date(lt.last_order).toISOString() : null,
        recencyDays,
        avgGapDays,
        clvRank,
      },
      segmentation: {
        tier,
        segment,
        churnRisk: churn,
        nextPurchaseProbability: nextPurchaseProb,
        nextCategory,
      },
      activity: {
        lastVisitAt,
        lastVisitMinutesAgo,
        isActiveNow,
        totalSessions: aggTotalSessions,
        totalPageViews: aggTotalPvs,
        firstSeenAt: aggFirstSeen ? aggFirstSeen.toISOString() : null,
        deviceBreakdown,
        country: aggCountry,
        region: aggRegion,
      },
      acquisition,
      topProducts: topProducts.map(p => ({
        productId: p.product_id,
        name: p.name,
        imageUrl: p.image_url,
        category: p.category,
        quantity: Number(p.quantity),
        totalSpent: Math.round(Number(p.total_spent || 0)),
        lastOrdered: p.last_ordered ? new Date(p.last_ordered).toISOString() : null,
      })),
      timeline: dedupedTimeline.slice(0, 80),
    });
  } catch (error: any) {
    console.error("[/api/bondly/clientes/[id]] error:", error);
    return NextResponse.json(
      { ok: false, error: "Error fetching customer detail", detail: error.message },
      { status: 500 }
    );
  }
}
