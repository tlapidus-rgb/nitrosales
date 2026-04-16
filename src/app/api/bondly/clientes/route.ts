export const dynamic = "force-dynamic";
export const revalidate = 0;

// ═══════════════════════════════════════════════════════════════════
// /api/bondly/clientes — Lista enriquecida para Customer 360 (Fase 3)
// ═══════════════════════════════════════════════════════════════════
// Bondly trabaja SÓLO con VTEX (tienda propia). Los marketplaces no
// comparten identidad del cliente — se excluyen en toda query.
//
// Devuelve:
//   - kpis: total, nuevos 7d, navegando ahora, VIP (decil top)
//   - quickSegments: array con counts por segmento rápido (chips)
//   - filters: ciudades y canales disponibles
//   - customers: página enriquecida con tier, segmento, pixel data,
//                acquisition channel, favorite product, lifecycle state
//   - pagination
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 25;

// ──────────────────────────────────────────────────────────────────
// Tipos
// ──────────────────────────────────────────────────────────────────
type SortKey =
  | "last_order"       // default — recencia de compra
  | "last_visit"       // NitroPixel: quién está más fresco en el sitio
  | "first_identified" // registros nuevos (firstOrderAt)
  | "ltv"              // gastado total
  | "orders"           // total órdenes
  | "aov"              // ticket promedio
  | "name";            // alfabético

type QuickSegmentKey =
  | "all"
  | "new_7d"           // primera compra últimos 7 días
  | "vip"              // decil top por totalSpent
  | "browsing_now"     // pixel event hace < 10 minutos
  | "at_risk"          // 2+ órdenes pero sin comprar 60-180 días
  | "cart_abandoned"   // ADD_TO_CART últimos 14d sin PURCHASE posterior
  | "reappeared"       // activo en pixel últimos 7d pero había estado > 30d inactivo
  | "dormant"          // > 180 días sin comprar
  | "champions";       // 4+ órdenes con recencia <= 30 días

type Tier = "VIP" | "Loyal" | "Regular" | "New" | "At Risk" | "Dormant";

interface EnrichedCustomer {
  id: string;
  externalId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  // Commerce
  totalOrders: number;
  totalSpent: number;
  avgTicket: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  recencyDays: number | null;
  // Segmentation
  tier: Tier;
  segment: string; // RFM
  clvRank: number; // percentile 0-100
  // Pixel / activity
  lastVisitAt: string | null;
  lastVisitMinutesAgo: number | null;
  isActiveNow: boolean; // < 10 minutes
  hasOpenCart: boolean;
  sessionsLast30d: number;
  pageViewsLast30d: number;
  // Acquisition
  acquisitionChannel: string | null; // meta | google | organic | direct | email | referral | tiktok | other
  acquisitionCampaign: string | null;
  // Product affinity
  favoriteProductName: string | null;
  favoriteProductImage: string | null;
  // Flags
  flags: string[]; // ["vip_active", "at_risk", "cart_abandoned", "reappeared", "new_7d", "dormant"]
}

interface QuickSegmentCount {
  key: QuickSegmentKey;
  label: string;
  count: number;
}

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────
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

function computeTier(totalOrders: number, totalSpent: number, clvRank: number, recencyDays: number | null): Tier {
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

// ──────────────────────────────────────────────────────────────────
// GET
// ──────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const ORG_ID = await getOrganizationId();
    const { searchParams } = new URL(request.url);

    // Date range
    const now = new Date();
    const toParam = searchParams.get("to");
    const fromParam = searchParams.get("from");
    const dateTo = toParam ? new Date(toParam + "T23:59:59.999-03:00") : now;
    const dateFrom = fromParam
      ? new Date(fromParam + "T00:00:00.000-03:00")
      : new Date(now.getTime() - 365 * MS_PER_DAY);

    // Pagination
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, parseInt(searchParams.get("pageSize") || String(DEFAULT_PAGE_SIZE), 10));

    // Filters
    const sort = (searchParams.get("sort") || "last_order") as SortKey;
    const quickSegment = (searchParams.get("quickSegment") || "all") as QuickSegmentKey;
    const segmentFilter = searchParams.get("segment"); // RFM segment
    const channelFilter = searchParams.get("channel"); // meta, google, etc.
    const cityFilter = searchParams.get("city");
    const search = (searchParams.get("search") || "").trim().toLowerCase();

    // ── Base CTE: commerce lifetime per customer (solo VTEX, no cancelled)
    //    Sort and quickSegment logic sits on top of this.
    //    We limit to customers with at least 1 order OR (quickSegment === browsing_now && has pixel activity)
    //    because commerce-side segmentation needs at least 1 order.

    // Ten en cuenta: la tabla customers tiene totalOrders/totalSpent pre-calculados,
    // pero para lifetime_orders y recency preferimos calcularlos al vuelo sobre orders
    // con source='VTEX' (los totalSpent pueden incluir MELI de antes).

    // 1) KPIs de la zona superior (totales globales del periodo)
    const kpisPromise = prisma.$queryRawUnsafe<Array<{
      total_customers: string;
      new_7d: string;
      active_now: string;
      vip_count: string;
    }>>(`
      WITH lifetime AS (
        SELECT o."customerId",
               COUNT(*)::int AS orders_ct,
               SUM(o."totalValue") AS spent
        FROM orders o
        WHERE o."organizationId" = '${ORG_ID}'
          AND o."source" = 'VTEX'
          AND o.status NOT IN ('CANCELLED', 'RETURNED')
          AND o."customerId" IS NOT NULL
        GROUP BY o."customerId"
      ),
      vip_cutoff AS (
        SELECT percentile_cont(0.9) WITHIN GROUP (ORDER BY spent) AS p90
        FROM lifetime
      ),
      period_customers AS (
        SELECT DISTINCT o."customerId"
        FROM orders o
        WHERE o."organizationId" = '${ORG_ID}'
          AND o."source" = 'VTEX'
          AND o.status NOT IN ('CANCELLED', 'RETURNED')
          AND o."customerId" IS NOT NULL
          AND o."orderDate" >= $1 AND o."orderDate" <= $2
      ),
      new_7d AS (
        SELECT COUNT(*)::int AS n FROM customers c
        WHERE c."organizationId" = '${ORG_ID}'
          AND c."firstOrderAt" >= NOW() - INTERVAL '7 days'
      ),
      active_now AS (
        SELECT COUNT(DISTINCT v."customerId")::int AS n
        FROM pixel_visitors v
        WHERE v."organizationId" = '${ORG_ID}'
          AND v."customerId" IS NOT NULL
          AND v."lastSeenAt" >= NOW() - INTERVAL '10 minutes'
      ),
      vip_count AS (
        SELECT COUNT(*)::int AS n
        FROM lifetime l, vip_cutoff vc
        WHERE l.spent >= vc.p90
      )
      SELECT
        (SELECT COUNT(*)::text FROM period_customers) AS total_customers,
        (SELECT n::text FROM new_7d) AS new_7d,
        (SELECT n::text FROM active_now) AS active_now,
        (SELECT n::text FROM vip_count) AS vip_count
    `, dateFrom, dateTo);

    // 2) Filters disponibles (ciudades top y canales) + conteos rápidos de segmentos
    const quickCountsPromise = prisma.$queryRawUnsafe<Array<{
      key: string;
      n: string;
    }>>(`
      WITH lifetime AS (
        SELECT o."customerId",
               COUNT(*)::int AS orders_ct,
               SUM(o."totalValue") AS spent,
               MAX(o."orderDate") AS last_order,
               MIN(o."orderDate") AS first_order,
               EXTRACT(DAY FROM NOW() - MAX(o."orderDate"))::int AS recency
        FROM orders o
        WHERE o."organizationId" = '${ORG_ID}'
          AND o."source" = 'VTEX'
          AND o.status NOT IN ('CANCELLED', 'RETURNED')
          AND o."customerId" IS NOT NULL
        GROUP BY o."customerId"
      ),
      ranked AS (
        SELECT l.*, NTILE(10) OVER (ORDER BY l.spent) AS decile FROM lifetime l
      )
      SELECT 'new_7d' AS key, COUNT(*)::text AS n FROM ranked WHERE first_order >= NOW() - INTERVAL '7 days'
      UNION ALL
      SELECT 'vip' AS key, COUNT(*)::text AS n FROM ranked WHERE decile = 10
      UNION ALL
      SELECT 'at_risk' AS key, COUNT(*)::text AS n FROM ranked WHERE recency BETWEEN 60 AND 180 AND orders_ct >= 2
      UNION ALL
      SELECT 'dormant' AS key, COUNT(*)::text AS n FROM ranked WHERE recency > 180
      UNION ALL
      SELECT 'champions' AS key, COUNT(*)::text AS n FROM ranked WHERE recency <= 30 AND orders_ct >= 4
      UNION ALL
      SELECT 'browsing_now' AS key, COUNT(DISTINCT v."customerId")::text AS n
        FROM pixel_visitors v
        WHERE v."organizationId" = '${ORG_ID}'
          AND v."customerId" IS NOT NULL
          AND v."lastSeenAt" >= NOW() - INTERVAL '10 minutes'
      UNION ALL
      SELECT 'cart_abandoned' AS key, COUNT(DISTINCT v."customerId")::text AS n
        FROM pixel_visitors v
        JOIN pixel_events e ON e."visitorId" = v.id
        WHERE v."organizationId" = '${ORG_ID}'
          AND v."customerId" IS NOT NULL
          AND e.type = 'ADD_TO_CART'
          AND e.timestamp >= NOW() - INTERVAL '14 days'
          AND NOT EXISTS (
            SELECT 1 FROM pixel_events ep
            WHERE ep."visitorId" = v.id
              AND ep.type = 'PURCHASE'
              AND ep.timestamp > e.timestamp
          )
      UNION ALL
      SELECT 'reappeared' AS key, COUNT(DISTINCT v."customerId")::text AS n
        FROM pixel_visitors v
        WHERE v."organizationId" = '${ORG_ID}'
          AND v."customerId" IS NOT NULL
          AND v."lastSeenAt" >= NOW() - INTERVAL '7 days'
          AND EXISTS (
            SELECT 1 FROM pixel_events e
            WHERE e."visitorId" = v.id
              AND e.timestamp < NOW() - INTERVAL '30 days'
          )
    `);

    // 3) Ciudades top para filter dropdown
    const citiesPromise = prisma.$queryRawUnsafe<Array<{ city: string; n: string }>>(`
      SELECT INITCAP(LOWER(TRIM(c.city))) AS city, COUNT(*)::text AS n
      FROM customers c
      WHERE c."organizationId" = '${ORG_ID}'
        AND c.city IS NOT NULL
        AND TRIM(c.city) <> ''
      GROUP BY INITCAP(LOWER(TRIM(c.city)))
      ORDER BY COUNT(*) DESC
      LIMIT 20
    `);

    const [kpisRows, quickCountsRows, citiesRows] = await Promise.all([
      kpisPromise,
      quickCountsPromise,
      citiesPromise,
    ]);

    // ── Build customer list query with all filters applied
    // We build two CTEs: lifetime (commerce) and pixel_profile (pixel aggregates)
    // then combine. Filters/sort applied at the outer select.

    // WHERE fragments from filters
    const whereFragments: string[] = [];
    if (segmentFilter) {
      // Apply as post-filter — computed in JS
    }
    // Quick segment filters are computed in SQL for efficiency

    // Build ORDER BY
    let orderBy = "last_order_at DESC NULLS LAST";
    switch (sort) {
      case "last_visit":      orderBy = "last_visit_at DESC NULLS LAST"; break;
      case "first_identified": orderBy = "first_order_at DESC NULLS LAST"; break;
      case "ltv":             orderBy = "total_spent DESC NULLS LAST"; break;
      case "orders":          orderBy = "orders_ct DESC NULLS LAST"; break;
      case "aov":             orderBy = "avg_ticket DESC NULLS LAST"; break;
      case "name":            orderBy = "name ASC NULLS LAST"; break;
      default:                orderBy = "last_order_at DESC NULLS LAST";
    }

    // Quick-segment filter SQL clause
    let quickClause = "";
    switch (quickSegment) {
      case "new_7d":
        quickClause = `AND c."firstOrderAt" >= NOW() - INTERVAL '7 days'`;
        break;
      case "vip":
        quickClause = `AND decile = 10`;
        break;
      case "at_risk":
        quickClause = `AND recency BETWEEN 60 AND 180 AND orders_ct >= 2`;
        break;
      case "dormant":
        quickClause = `AND recency > 180`;
        break;
      case "champions":
        quickClause = `AND recency <= 30 AND orders_ct >= 4`;
        break;
      case "browsing_now":
        quickClause = `AND last_visit_at >= NOW() - INTERVAL '10 minutes'`;
        break;
      case "cart_abandoned":
        quickClause = `AND has_open_cart = TRUE`;
        break;
      case "reappeared":
        quickClause = `AND is_reappeared = TRUE`;
        break;
      default:
        quickClause = "";
    }

    // City filter (case-insensitive)
    let cityClause = "";
    if (cityFilter) {
      const safe = cityFilter.replace(/'/g, "''");
      cityClause = `AND INITCAP(LOWER(TRIM(c.city))) = '${safe}'`;
    }

    // Search (name/email/phone)
    let searchClause = "";
    if (search) {
      const safe = search.replace(/'/g, "''");
      searchClause = `AND (
        LOWER(c.email) LIKE '%${safe}%'
        OR LOWER(COALESCE(c."firstName", '')) LIKE '%${safe}%'
        OR LOWER(COALESCE(c."lastName", '')) LIKE '%${safe}%'
        OR LOWER(COALESCE(c."firstName", '') || ' ' || COALESCE(c."lastName", '')) LIKE '%${safe}%'
      )`;
    }

    // Count query (same filters, no pagination)
    //
    // NOTA: usamos DISTINCT ON (customerId) para que la CTE pixel
    // devuelva exactamente 1 fila por cliente (el visitor más reciente).
    // Sin esto, un cliente con múltiples visitor records produciría
    // filas duplicadas en el JOIN y rompería el COUNT.
    const countQuery = `
      WITH commerce AS (
        SELECT o."customerId",
               COUNT(*)::int AS orders_ct,
               SUM(o."totalValue") AS spent,
               MAX(o."orderDate") AS last_order_at,
               MIN(o."orderDate") AS first_order_at,
               EXTRACT(DAY FROM NOW() - MAX(o."orderDate"))::int AS recency
        FROM orders o
        WHERE o."organizationId" = '${ORG_ID}'
          AND o."source" = 'VTEX'
          AND o.status NOT IN ('CANCELLED', 'RETURNED')
          AND o."customerId" IS NOT NULL
        GROUP BY o."customerId"
      ),
      ranked AS (
        SELECT c2.*, NTILE(10) OVER (ORDER BY c2.spent) AS decile FROM commerce c2
      ),
      pixel AS (
        SELECT DISTINCT ON (v."customerId")
               v."customerId",
               v."lastSeenAt" AS last_visit_at,
               (EXISTS (
                 SELECT 1 FROM pixel_events e
                 WHERE e."visitorId" = v.id
                   AND e.type = 'ADD_TO_CART'
                   AND e.timestamp >= NOW() - INTERVAL '14 days'
                   AND NOT EXISTS (
                     SELECT 1 FROM pixel_events ep
                     WHERE ep."visitorId" = v.id
                       AND ep.type = 'PURCHASE'
                       AND ep.timestamp > e.timestamp
                   )
               )) AS has_open_cart,
               (v."lastSeenAt" >= NOW() - INTERVAL '7 days'
                AND EXISTS (
                  SELECT 1 FROM pixel_events eo
                  WHERE eo."visitorId" = v.id
                    AND eo.timestamp < NOW() - INTERVAL '30 days'
                )) AS is_reappeared
        FROM pixel_visitors v
        WHERE v."organizationId" = '${ORG_ID}' AND v."customerId" IS NOT NULL
        ORDER BY v."customerId", v."lastSeenAt" DESC NULLS LAST
      )
      SELECT COUNT(*)::text AS n
      FROM customers c
      JOIN ranked r ON r."customerId" = c.id
      LEFT JOIN pixel px ON px."customerId" = c.id
      WHERE c."organizationId" = '${ORG_ID}'
        ${quickClause.replace(/\bdecile\b/g, "r.decile").replace(/\borders_ct\b/g, "r.orders_ct").replace(/\brecency\b/g, "r.recency").replace(/\blast_visit_at\b/g, "px.last_visit_at").replace(/\bhas_open_cart\b/g, "px.has_open_cart").replace(/\bis_reappeared\b/g, "px.is_reappeared")}
        ${cityClause}
        ${searchClause}
    `;

    // Listado paginado (heavy query — single pass)
    const listQuery = `
      WITH commerce AS (
        SELECT o."customerId",
               COUNT(*)::int AS orders_ct,
               SUM(o."totalValue") AS spent,
               AVG(o."totalValue") AS avg_ticket,
               MAX(o."orderDate") AS last_order_at,
               MIN(o."orderDate") AS first_order_at,
               EXTRACT(DAY FROM NOW() - MAX(o."orderDate"))::int AS recency
        FROM orders o
        WHERE o."organizationId" = '${ORG_ID}'
          AND o."source" = 'VTEX'
          AND o.status NOT IN ('CANCELLED', 'RETURNED')
          AND o."customerId" IS NOT NULL
        GROUP BY o."customerId"
      ),
      ranked AS (
        SELECT c2.*, NTILE(10) OVER (ORDER BY c2.spent) AS decile FROM commerce c2
      ),
      pixel AS (
        SELECT DISTINCT ON (v."customerId")
               v."customerId",
               v.id AS visitor_id,
               v."lastSeenAt" AS last_visit_at,
               v."totalSessions" AS total_sessions,
               v."totalPageViews" AS total_pvs,
               (EXISTS (
                 SELECT 1 FROM pixel_events e
                 WHERE e."visitorId" = v.id
                   AND e.type = 'ADD_TO_CART'
                   AND e.timestamp >= NOW() - INTERVAL '14 days'
                   AND NOT EXISTS (
                     SELECT 1 FROM pixel_events ep
                     WHERE ep."visitorId" = v.id
                       AND ep.type = 'PURCHASE'
                       AND ep.timestamp > e.timestamp
                   )
               )) AS has_open_cart,
               (v."lastSeenAt" >= NOW() - INTERVAL '7 days'
                AND EXISTS (
                  SELECT 1 FROM pixel_events eo
                  WHERE eo."visitorId" = v.id
                    AND eo.timestamp < NOW() - INTERVAL '30 days'
                )) AS is_reappeared
        FROM pixel_visitors v
        WHERE v."organizationId" = '${ORG_ID}' AND v."customerId" IS NOT NULL
        ORDER BY v."customerId", v."lastSeenAt" DESC NULLS LAST
      )
      SELECT
        c.id,
        c."externalId" AS external_id,
        TRIM(COALESCE(c."firstName", '') || ' ' || COALESCE(c."lastName", '')) AS name,
        c.email,
        pv.phone AS phone,
        COALESCE(INITCAP(LOWER(TRIM(c.city))), '') AS city,
        c.state,
        r.orders_ct,
        r.spent::text AS total_spent,
        r.avg_ticket::text AS avg_ticket,
        r.decile,
        r.recency,
        r.last_order_at,
        r.first_order_at,
        px.last_visit_at,
        px.visitor_id,
        COALESCE(px.total_sessions, 0) AS total_sessions,
        COALESCE(px.total_pvs, 0) AS total_pvs,
        COALESCE(px.has_open_cart, FALSE) AS has_open_cart,
        COALESCE(px.is_reappeared, FALSE) AS is_reappeared
      FROM customers c
      JOIN ranked r ON r."customerId" = c.id
      LEFT JOIN pixel px ON px."customerId" = c.id
      LEFT JOIN pixel_visitors pv ON pv.id = px.visitor_id
      WHERE c."organizationId" = '${ORG_ID}'
        ${quickClause.replace(/\bdecile\b/g, "r.decile").replace(/\borders_ct\b/g, "r.orders_ct").replace(/\brecency\b/g, "r.recency").replace(/\blast_visit_at\b/g, "px.last_visit_at").replace(/\bhas_open_cart\b/g, "px.has_open_cart").replace(/\bis_reappeared\b/g, "px.is_reappeared")}
        ${cityClause}
        ${searchClause}
      ORDER BY ${orderBy}
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `;

    const [countRow, listRows] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{ n: string }>>(countQuery),
      prisma.$queryRawUnsafe<Array<any>>(listQuery),
    ]);

    const totalFiltered = Number(countRow[0]?.n || 0);

    // Enriquecimiento por cliente visible: acquisition channel + favorite product
    // (query separada sobre los visitors de esta página — eficiente)
    const visitorIds = listRows.map(r => r.visitor_id).filter(Boolean);
    const customerIds = listRows.map(r => r.id);

    let acquisitionByVisitor: Record<string, { channel: string | null; campaign: string | null }> = {};
    let favoriteByCustomer: Record<string, { name: string | null; image: string | null }> = {};

    if (visitorIds.length > 0) {
      const visitorIdList = visitorIds.map(id => `'${id}'`).join(",");
      const acqRows = await prisma.$queryRawUnsafe<Array<{
        visitor_id: string;
        click_ids: any;
        utm_params: any;
        referrer: string | null;
      }>>(`
        SELECT DISTINCT ON (e."visitorId")
          e."visitorId" AS visitor_id,
          e."clickIds" AS click_ids,
          e."utmParams" AS utm_params,
          e.referrer
        FROM pixel_events e
        WHERE e."visitorId" IN (${visitorIdList})
          AND e."organizationId" = '${ORG_ID}'
        ORDER BY e."visitorId", e.timestamp ASC
      `);
      acquisitionByVisitor = Object.fromEntries(
        acqRows.map(r => [r.visitor_id, {
          channel: detectChannel(r.click_ids, r.utm_params, r.referrer),
          campaign: (r.utm_params?.campaign as string) || null,
        }])
      );
    }

    if (customerIds.length > 0) {
      const cidList = customerIds.map(id => `'${id}'`).join(",");
      // Producto favorito: el más ordenado (product_items)
      const favRows = await prisma.$queryRawUnsafe<Array<{
        customer_id: string;
        product_name: string | null;
        image_url: string | null;
      }>>(`
        SELECT DISTINCT ON (o."customerId")
          o."customerId" AS customer_id,
          p.name AS product_name,
          p."imageUrl" AS image_url
        FROM orders o
        JOIN order_items oi ON oi."orderId" = o.id
        JOIN products p ON p.id = oi."productId"
        WHERE o."customerId" IN (${cidList})
          AND o."source" = 'VTEX'
          AND o.status NOT IN ('CANCELLED', 'RETURNED')
        ORDER BY o."customerId", oi.quantity DESC
      `);
      favoriteByCustomer = Object.fromEntries(
        favRows.map(r => [r.customer_id, {
          name: r.product_name,
          image: r.image_url,
        }])
      );
    }

    // Merge + compute derived fields in JS
    const customers: EnrichedCustomer[] = listRows.map((row: any) => {
      const totalSpent = Number(row.total_spent || 0);
      const avgTicket = Number(row.avg_ticket || 0);
      const orders = Number(row.orders_ct || 0);
      const decile = Number(row.decile || 1);
      const clvRank = decile * 10; // rough percentile
      const recencyDays = row.recency != null ? Number(row.recency) : null;

      const lastVisitAt: string | null = row.last_visit_at ? new Date(row.last_visit_at).toISOString() : null;
      const lastVisitMinutesAgo = lastVisitAt
        ? Math.floor((Date.now() - new Date(lastVisitAt).getTime()) / 60000)
        : null;
      const isActiveNow = lastVisitMinutesAgo != null && lastVisitMinutesAgo < 10;

      const acq = row.visitor_id ? acquisitionByVisitor[row.visitor_id] : null;
      const fav = favoriteByCustomer[row.id] || { name: null, image: null };

      const tier = computeTier(orders, totalSpent, clvRank, recencyDays);
      const segment = computeSegment(orders, recencyDays);

      const flags: string[] = [];
      if (decile === 10) flags.push("vip");
      if (isActiveNow) flags.push("browsing_now");
      if (row.has_open_cart) flags.push("cart_abandoned");
      if (row.is_reappeared) flags.push("reappeared");
      if (row.first_order_at && new Date(row.first_order_at).getTime() > Date.now() - 7 * MS_PER_DAY) flags.push("new_7d");
      if (recencyDays != null && recencyDays > 180) flags.push("dormant");
      if (recencyDays != null && recencyDays >= 60 && recencyDays <= 180 && orders >= 2) flags.push("at_risk");

      return {
        id: row.id,
        externalId: row.external_id,
        name: row.name || "Sin nombre",
        email: row.email || null,
        phone: row.phone || null,
        city: row.city || null,
        state: row.state || null,
        totalOrders: orders,
        totalSpent: Math.round(totalSpent),
        avgTicket: Math.round(avgTicket),
        firstOrderAt: row.first_order_at ? new Date(row.first_order_at).toISOString() : null,
        lastOrderAt: row.last_order_at ? new Date(row.last_order_at).toISOString() : null,
        recencyDays,
        tier,
        segment,
        clvRank,
        lastVisitAt,
        lastVisitMinutesAgo,
        isActiveNow,
        hasOpenCart: !!row.has_open_cart,
        sessionsLast30d: Number(row.total_sessions || 0),
        pageViewsLast30d: Number(row.total_pvs || 0),
        acquisitionChannel: acq?.channel || null,
        acquisitionCampaign: acq?.campaign || null,
        favoriteProductName: fav.name,
        favoriteProductImage: fav.image,
        flags,
      };
    });

    // Post-filter: channel + RFM segment (cheap in JS)
    let filteredCustomers = customers;
    if (channelFilter) {
      filteredCustomers = filteredCustomers.filter(c => c.acquisitionChannel === channelFilter);
    }
    if (segmentFilter) {
      filteredCustomers = filteredCustomers.filter(c => c.segment === segmentFilter);
    }

    // Quick segments labels (for chips)
    const countsMap: Record<string, number> = { all: Number(kpisRows[0]?.total_customers || 0) };
    for (const r of quickCountsRows) {
      countsMap[r.key] = Number(r.n || 0);
    }

    const quickSegments: QuickSegmentCount[] = [
      { key: "all", label: "Todos", count: countsMap.all || 0 },
      { key: "browsing_now", label: "Navegando ahora", count: countsMap.browsing_now || 0 },
      { key: "new_7d", label: "Nuevos 7d", count: countsMap.new_7d || 0 },
      { key: "vip", label: "VIP", count: countsMap.vip || 0 },
      { key: "champions", label: "Champions", count: countsMap.champions || 0 },
      { key: "cart_abandoned", label: "Carrito abandonado", count: countsMap.cart_abandoned || 0 },
      { key: "reappeared", label: "Reaparecidos", count: countsMap.reappeared || 0 },
      { key: "at_risk", label: "En riesgo", count: countsMap.at_risk || 0 },
      { key: "dormant", label: "Dormidos", count: countsMap.dormant || 0 },
    ];

    return NextResponse.json({
      ok: true,
      updatedAt: new Date().toISOString(),
      kpis: {
        totalCustomers: Number(kpisRows[0]?.total_customers || 0),
        new7d: Number(kpisRows[0]?.new_7d || 0),
        activeNow: Number(kpisRows[0]?.active_now || 0),
        vipCount: Number(kpisRows[0]?.vip_count || 0),
      },
      quickSegments,
      filters: {
        cities: citiesRows.map(c => ({ city: c.city, count: Number(c.n) })),
      },
      customers: filteredCustomers,
      pagination: {
        page,
        pageSize,
        totalFiltered,
        totalPages: Math.max(1, Math.ceil(totalFiltered / pageSize)),
      },
      meta: {
        sort,
        quickSegment,
        segment: segmentFilter,
        channel: channelFilter,
        city: cityFilter,
        search,
      },
    });
  } catch (error: any) {
    console.error("[/api/bondly/clientes] error:", error);
    return NextResponse.json(
      { ok: false, error: "Error fetching customers", detail: error.message },
      { status: 500 }
    );
  }
}
