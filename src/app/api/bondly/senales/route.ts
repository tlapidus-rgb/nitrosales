export const dynamic = "force-dynamic";
export const revalidate = 0;

// ═══════════════════════════════════════════════════════════════════
// /api/bondly/senales — Señales en vivo para Bondly
// ═══════════════════════════════════════════════════════════════════
// Devuelve:
//   - kpis: señales 24h, visitantes activos, identificados activos, carritos altos
//   - moments: eventos curados con alto valor de negocio + CTAs
//   - feed: stream de eventos recientes (identificados + anónimos)
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

// ─── Tipos de "Moment" ─────────────────────────────────────────────
type MomentType =
  | "VIP_ACTIVE"          // Cliente de alto valor activo ahora
  | "REAPPEARANCE"        // Visitante identificado volvió después de mucho tiempo
  | "HIGH_VALUE_ABANDON"  // Carrito grande abandonado reciente
  | "INTENSE_INTEREST"    // Mismo producto visto varias veces sin comprar
  | "CHECKOUT_STARTED"    // Inició checkout pero no compró
  | "NEW_IDENTIFIED";     // Recién se identificó (email/phone)

interface MomentAction {
  type: "whatsapp" | "email" | "view_profile" | "copy_email";
  label: string;
  href?: string;
}

interface Visitor {
  visitorId: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  deviceType: string | null;
  isIdentified: boolean;
  displayName: string;
  customerId: string | null;
}

interface Moment {
  id: string;
  type: MomentType;
  priority: "high" | "medium" | "low";
  title: string;
  subtitle: string;
  when: string;
  visitor: Visitor;
  context: Record<string, any>;
  actions: MomentAction[];
}

interface FeedItem {
  id: string;
  timestamp: string;
  eventType: string;
  visitor: Visitor;
  pageUrl: string | null;
  productName: string | null;
  value: number | null;
}

// ─── Helpers ───────────────────────────────────────────────────────

function displayNameFor(v: {
  email: string | null;
  phone: string | null;
  visitorId: string;
  firstName?: string | null;
  lastName?: string | null;
}): string {
  if (v.firstName || v.lastName) {
    return [v.firstName, v.lastName].filter(Boolean).join(" ");
  }
  if (v.email) return v.email;
  if (v.phone) return v.phone;
  // Anónimo: usamos últimos 6 chars del visitorId (UUID)
  const short = v.visitorId.slice(-6).toUpperCase();
  return `Visitante #${short}`;
}

function buildActions(
  momentType: MomentType,
  visitor: Visitor
): MomentAction[] {
  const actions: MomentAction[] = [];

  // Perfil siempre primero si es identificado
  if (visitor.isIdentified && visitor.customerId) {
    actions.push({
      type: "view_profile",
      label: "Ver perfil",
      href: `/bondly/clientes?highlight=${visitor.customerId}`,
    });
  }

  // WhatsApp si tenemos teléfono
  if (visitor.phone) {
    const phoneClean = visitor.phone.replace(/[^\d]/g, "");
    let msg = "";
    switch (momentType) {
      case "REAPPEARANCE":
        msg = `Hola${visitor.email ? "" : ""}! Te vimos de vuelta, te mandamos un código especial: `;
        break;
      case "HIGH_VALUE_ABANDON":
        msg = `Hola! Vimos que dejaste productos en el carrito. ¿Te ayudamos a finalizar la compra?`;
        break;
      case "VIP_ACTIVE":
        msg = `Hola! Como cliente VIP queremos ofrecerte atención personalizada. ¿En qué te podemos ayudar?`;
        break;
      case "INTENSE_INTEREST":
        msg = `Hola! Vimos que te interesa un producto. ¿Querés que te cuente más detalles?`;
        break;
      case "CHECKOUT_STARTED":
        msg = `Hola! Vimos que estabas por finalizar la compra. ¿Te ayudamos?`;
        break;
      case "NEW_IDENTIFIED":
        msg = `Hola! Bienvenido/a. Te mandamos un código de 10% OFF para tu primera compra: `;
        break;
    }
    actions.push({
      type: "whatsapp",
      label: "WhatsApp",
      href: `https://wa.me/${phoneClean}?text=${encodeURIComponent(msg)}`,
    });
  }

  // Email si tenemos email
  if (visitor.email) {
    actions.push({
      type: "email",
      label: "Mail",
      href: `mailto:${visitor.email}`,
    });
    actions.push({
      type: "copy_email",
      label: "Copiar email",
    });
  }

  return actions;
}

function visitorFromRow(row: {
  visitor_id: string;
  pv_id: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  region: string | null;
  device_types: string[] | null;
  customer_id: string | null;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
}): Visitor {
  const deviceType = row.device_types && row.device_types.length > 0 ? row.device_types[0] : null;
  const displayName = displayNameFor({
    email: row.email,
    phone: row.phone,
    visitorId: row.pv_id,
    firstName: row.first_name,
    lastName: row.last_name,
  });

  return {
    visitorId: row.pv_id,
    email: row.email,
    phone: row.phone,
    city: row.city ?? row.region ?? null,
    country: row.country,
    deviceType,
    isIdentified: !!(row.email || row.phone || row.customer_id),
    displayName,
    customerId: row.customer_id,
  };
}

// ─── GET ───────────────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  try {
    const orgId = await getOrganizationId();
    const now = new Date();
    const ago5m = new Date(now.getTime() - 5 * 60 * 1000);
    const ago30m = new Date(now.getTime() - 30 * 60 * 1000);
    const ago2h = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const ago1h = new Date(now.getTime() - 60 * 60 * 1000);

    // ═══ KPIs básicos ═══
    const [
      activeNowRows,
      identifiedActiveRows,
      signalsLast24hRows,
      abandonedHighValueRows,
    ] = await Promise.all([
      // Visitantes únicos con eventos en últimos 5 min
      prisma.$queryRaw<Array<{ cnt: number }>>`
        SELECT COUNT(DISTINCT "visitorId")::int AS cnt
        FROM pixel_events
        WHERE "organizationId" = ${orgId}
          AND timestamp >= ${ago5m}
      `,
      // Visitantes identificados activos en últimos 30 min
      prisma.$queryRaw<Array<{ cnt: number }>>`
        SELECT COUNT(DISTINCT e."visitorId")::int AS cnt
        FROM pixel_events e
        JOIN pixel_visitors v ON v.id = e."visitorId"
        WHERE e."organizationId" = ${orgId}
          AND e.timestamp >= ${ago30m}
          AND (v.email IS NOT NULL OR v.phone IS NOT NULL OR v."customerId" IS NOT NULL)
      `,
      // Eventos totales en últimas 24h (proxy de señales)
      prisma.$queryRaw<Array<{ cnt: number }>>`
        SELECT COUNT(*)::int AS cnt
        FROM pixel_events
        WHERE "organizationId" = ${orgId}
          AND timestamp >= ${ago24h}
      `,
      // Add-to-cart recientes (últimas 2h) que NO tuvieron PURCHASE después
      prisma.$queryRaw<Array<{ cnt: number }>>`
        SELECT COUNT(DISTINCT e."visitorId")::int AS cnt
        FROM pixel_events e
        WHERE e."organizationId" = ${orgId}
          AND e.type = 'ADD_TO_CART'
          AND e.timestamp >= ${ago2h}
          AND NOT EXISTS (
            SELECT 1 FROM pixel_events p
            WHERE p."organizationId" = ${orgId}
              AND p."visitorId" = e."visitorId"
              AND p.type = 'PURCHASE'
              AND p.timestamp >= e.timestamp
          )
      `,
    ]);

    const kpis = {
      activeVisitors5min: Number(activeNowRows[0]?.cnt || 0),
      identifiedActive30min: Number(identifiedActiveRows[0]?.cnt || 0),
      signalsLast24h: Number(signalsLast24hRows[0]?.cnt || 0),
      highValueAbandoned: Number(abandonedHighValueRows[0]?.cnt || 0),
    };

    // ═══ MOMENTS ═══
    const moments: Moment[] = [];

    // ── 1. VIP_ACTIVE ── customers top 10% LTV con actividad en últimos 30 min
    const vipActive = await prisma.$queryRaw<Array<{
      pv_id: string;
      visitor_id: string;
      email: string | null;
      phone: string | null;
      country: string | null;
      region: string | null;
      device_types: string[] | null;
      customer_id: string | null;
      first_name: string | null;
      last_name: string | null;
      city: string | null;
      total_spent: string;
      lifetime_orders: number;
      last_event_at: Date;
      last_page_url: string | null;
    }>>`
      WITH top_customers AS (
        SELECT c.id,
               c."firstName",
               c."lastName",
               c.city,
               c."totalSpent",
               c."totalOrders",
               NTILE(10) OVER (ORDER BY c."totalSpent" DESC) AS decile
        FROM customers c
        WHERE c."organizationId" = ${orgId}
          AND c."totalSpent" > 0
      ),
      recent_events AS (
        SELECT e."visitorId",
               MAX(e.timestamp) AS last_event_at,
               (ARRAY_AGG(e."pageUrl" ORDER BY e.timestamp DESC))[1] AS last_page_url
        FROM pixel_events e
        WHERE e."organizationId" = ${orgId}
          AND e.timestamp >= ${ago30m}
        GROUP BY e."visitorId"
      )
      SELECT v.id AS pv_id,
             v."visitorId" AS visitor_id,
             v.email,
             v.phone,
             v.country,
             v.region,
             v."deviceTypes" AS device_types,
             v."customerId" AS customer_id,
             tc."firstName" AS first_name,
             tc."lastName" AS last_name,
             tc.city,
             tc."totalSpent"::text AS total_spent,
             tc."totalOrders"::int AS lifetime_orders,
             r.last_event_at,
             r.last_page_url
      FROM pixel_visitors v
      JOIN top_customers tc ON tc.id = v."customerId"
      JOIN recent_events r ON r."visitorId" = v.id
      WHERE v."organizationId" = ${orgId}
        AND tc.decile = 1
      ORDER BY tc."totalSpent" DESC
      LIMIT 3
    `;

    for (const row of vipActive) {
      const visitor = visitorFromRow(row);
      const totalSpent = Number(row.total_spent || 0);
      moments.push({
        id: `vip-${row.pv_id}`,
        type: "VIP_ACTIVE",
        priority: "high",
        title: `${visitor.displayName} está navegando ahora`,
        subtitle: `Cliente VIP · ${row.lifetime_orders} órdenes · $${Math.round(totalSpent).toLocaleString("es-AR")} gastados`,
        when: row.last_event_at.toISOString(),
        visitor,
        context: {
          ltvTotal: totalSpent,
          lifetimeOrders: row.lifetime_orders,
          lastPageUrl: row.last_page_url,
        },
        actions: buildActions("VIP_ACTIVE", visitor),
      });
    }

    // ── 2. REAPPEARANCE ── identificados con evento en últimas 24h y actividad previa >=30 días
    const reappearance = await prisma.$queryRaw<Array<{
      pv_id: string;
      visitor_id: string;
      email: string | null;
      phone: string | null;
      country: string | null;
      region: string | null;
      device_types: string[] | null;
      customer_id: string | null;
      first_name: string | null;
      last_name: string | null;
      city: string | null;
      last_event_at: Date;
      previous_event_at: Date | null;
      days_since: number;
      last_page_url: string | null;
    }>>`
      WITH identified_visitors AS (
        SELECT v.id,
               v."visitorId",
               v.email,
               v.phone,
               v.country,
               v.region,
               v."deviceTypes",
               v."customerId",
               c."firstName",
               c."lastName",
               c.city
        FROM pixel_visitors v
        LEFT JOIN customers c ON c.id = v."customerId"
        WHERE v."organizationId" = ${orgId}
          AND (v.email IS NOT NULL OR v.phone IS NOT NULL OR v."customerId" IS NOT NULL)
      ),
      recent_activity AS (
        SELECT e."visitorId",
               MAX(e.timestamp) AS last_event_at,
               (ARRAY_AGG(e."pageUrl" ORDER BY e.timestamp DESC))[1] AS last_page_url
        FROM pixel_events e
        WHERE e."organizationId" = ${orgId}
          AND e.timestamp >= ${ago24h}
        GROUP BY e."visitorId"
      ),
      previous_activity AS (
        SELECT e."visitorId",
               MAX(e.timestamp) AS previous_event_at
        FROM pixel_events e
        WHERE e."organizationId" = ${orgId}
          AND e.timestamp < ${ago24h}
        GROUP BY e."visitorId"
      )
      SELECT iv.id AS pv_id,
             iv."visitorId" AS visitor_id,
             iv.email,
             iv.phone,
             iv.country,
             iv.region,
             iv."deviceTypes" AS device_types,
             iv."customerId" AS customer_id,
             iv."firstName" AS first_name,
             iv."lastName" AS last_name,
             iv.city,
             r.last_event_at,
             p.previous_event_at,
             EXTRACT(DAY FROM (r.last_event_at - p.previous_event_at))::int AS days_since,
             r.last_page_url
      FROM identified_visitors iv
      JOIN recent_activity r ON r."visitorId" = iv.id
      JOIN previous_activity p ON p."visitorId" = iv.id
      WHERE EXTRACT(DAY FROM (r.last_event_at - p.previous_event_at)) >= 30
      ORDER BY days_since DESC, r.last_event_at DESC
      LIMIT 3
    `;

    for (const row of reappearance) {
      const visitor = visitorFromRow(row);
      const days = Number(row.days_since || 0);
      moments.push({
        id: `reappear-${row.pv_id}`,
        type: "REAPPEARANCE",
        priority: "high",
        title: `${visitor.displayName} volvió después de ${days} días`,
        subtitle: `Última actividad: ${row.previous_event_at?.toLocaleDateString("es-AR") ?? "hace tiempo"}`,
        when: row.last_event_at.toISOString(),
        visitor,
        context: {
          daysSinceLastActivity: days,
          previousEventAt: row.previous_event_at?.toISOString(),
          lastPageUrl: row.last_page_url,
        },
        actions: buildActions("REAPPEARANCE", visitor),
      });
    }

    // ── 3. HIGH_VALUE_ABANDON ── ADD_TO_CART reciente (últimas 2h) sin PURCHASE posterior
    const highValueAbandon = await prisma.$queryRaw<Array<{
      pv_id: string;
      visitor_id: string;
      email: string | null;
      phone: string | null;
      country: string | null;
      region: string | null;
      device_types: string[] | null;
      customer_id: string | null;
      first_name: string | null;
      last_name: string | null;
      city: string | null;
      last_add_at: Date;
      cart_value: number;
      items_count: number;
      last_product: string | null;
    }>>`
      WITH recent_adds AS (
        SELECT e."visitorId",
               MAX(e.timestamp) AS last_add_at,
               SUM(
                 CASE
                   WHEN (e.props->>'value') ~ '^[0-9]+(\\.[0-9]+)?$'
                   THEN (e.props->>'value')::numeric
                   ELSE 0
                 END
               ) AS cart_value,
               COUNT(*)::int AS items_count,
               (ARRAY_AGG(COALESCE(e.props->>'item_name', e.props->>'productName') ORDER BY e.timestamp DESC))[1] AS last_product
        FROM pixel_events e
        WHERE e."organizationId" = ${orgId}
          AND e.type = 'ADD_TO_CART'
          AND e.timestamp >= ${ago2h}
        GROUP BY e."visitorId"
      )
      SELECT v.id AS pv_id,
             v."visitorId" AS visitor_id,
             v.email,
             v.phone,
             v.country,
             v.region,
             v."deviceTypes" AS device_types,
             v."customerId" AS customer_id,
             c."firstName" AS first_name,
             c."lastName" AS last_name,
             c.city,
             ra.last_add_at,
             ra.cart_value::float AS cart_value,
             ra.items_count,
             ra.last_product
      FROM recent_adds ra
      JOIN pixel_visitors v ON v.id = ra."visitorId"
      LEFT JOIN customers c ON c.id = v."customerId"
      WHERE v."organizationId" = ${orgId}
        AND NOT EXISTS (
          SELECT 1 FROM pixel_events p
          WHERE p."organizationId" = ${orgId}
            AND p."visitorId" = v.id
            AND p.type = 'PURCHASE'
            AND p.timestamp >= ra.last_add_at
        )
      ORDER BY ra.cart_value DESC NULLS LAST, ra.last_add_at DESC
      LIMIT 4
    `;

    for (const row of highValueAbandon) {
      const visitor = visitorFromRow(row);
      const cartValue = Number(row.cart_value || 0);
      const minutesAgo = Math.floor((now.getTime() - new Date(row.last_add_at).getTime()) / 60000);
      const cartLabel = cartValue > 0
        ? `$${Math.round(cartValue).toLocaleString("es-AR")} en el carrito`
        : `${row.items_count} productos en el carrito`;
      moments.push({
        id: `abandon-${row.pv_id}`,
        type: "HIGH_VALUE_ABANDON",
        priority: cartValue > 50000 ? "high" : "medium",
        title: `${visitor.displayName} dejó el carrito`,
        subtitle: `${cartLabel} · hace ${minutesAgo} min${row.last_product ? ` · ${row.last_product}` : ""}`,
        when: row.last_add_at.toISOString(),
        visitor,
        context: {
          cartValue,
          itemsCount: row.items_count,
          lastProduct: row.last_product,
          minutesAgo,
        },
        actions: buildActions("HIGH_VALUE_ABANDON", visitor),
      });
    }

    // ── 4. INTENSE_INTEREST ── 3+ VIEW_PRODUCT del mismo producto en últimas 24h sin PURCHASE
    const intenseInterest = await prisma.$queryRaw<Array<{
      pv_id: string;
      visitor_id: string;
      email: string | null;
      phone: string | null;
      country: string | null;
      region: string | null;
      device_types: string[] | null;
      customer_id: string | null;
      first_name: string | null;
      last_name: string | null;
      city: string | null;
      last_view_at: Date;
      item_id: string;
      product_name: string | null;
      view_count: number;
    }>>`
      WITH repeated_views AS (
        SELECT e."visitorId",
               COALESCE(e.props->>'item_id', e.props->>'productId', e.props->>'sku') AS item_id,
               MAX(e.timestamp) AS last_view_at,
               (ARRAY_AGG(COALESCE(e.props->>'item_name', e.props->>'productName') ORDER BY e.timestamp DESC))[1] AS product_name,
               COUNT(*)::int AS view_count
        FROM pixel_events e
        WHERE e."organizationId" = ${orgId}
          AND e.type = 'VIEW_PRODUCT'
          AND e.timestamp >= ${ago24h}
          AND e.props IS NOT NULL
          AND COALESCE(e.props->>'item_id', e.props->>'productId', e.props->>'sku') IS NOT NULL
        GROUP BY e."visitorId", item_id
        HAVING COUNT(*) >= 3
      )
      SELECT v.id AS pv_id,
             v."visitorId" AS visitor_id,
             v.email,
             v.phone,
             v.country,
             v.region,
             v."deviceTypes" AS device_types,
             v."customerId" AS customer_id,
             c."firstName" AS first_name,
             c."lastName" AS last_name,
             c.city,
             rv.last_view_at,
             rv.item_id,
             rv.product_name,
             rv.view_count
      FROM repeated_views rv
      JOIN pixel_visitors v ON v.id = rv."visitorId"
      LEFT JOIN customers c ON c.id = v."customerId"
      WHERE v."organizationId" = ${orgId}
        AND NOT EXISTS (
          SELECT 1 FROM pixel_events p
          WHERE p."organizationId" = ${orgId}
            AND p."visitorId" = v.id
            AND p.type = 'PURCHASE'
            AND p.timestamp >= rv.last_view_at - INTERVAL '24 hours'
        )
      ORDER BY rv.view_count DESC, rv.last_view_at DESC
      LIMIT 4
    `;

    for (const row of intenseInterest) {
      const visitor = visitorFromRow(row);
      const productLabel = row.product_name ?? `Producto #${row.item_id.slice(0, 8)}`;
      moments.push({
        id: `interest-${row.pv_id}-${row.item_id}`,
        type: "INTENSE_INTEREST",
        priority: visitor.isIdentified ? "high" : "medium",
        title: `${visitor.displayName} vio ${productLabel} ${row.view_count} veces`,
        subtitle: `Sin comprar · interés alto en el producto`,
        when: row.last_view_at.toISOString(),
        visitor,
        context: {
          itemId: row.item_id,
          productName: productLabel,
          viewCount: row.view_count,
        },
        actions: buildActions("INTENSE_INTEREST", visitor),
      });
    }

    // ── 5. NEW_IDENTIFIED ── visitantes que se identificaron en la última hora
    const newIdentified = await prisma.$queryRaw<Array<{
      pv_id: string;
      visitor_id: string;
      email: string | null;
      phone: string | null;
      country: string | null;
      region: string | null;
      device_types: string[] | null;
      customer_id: string | null;
      first_name: string | null;
      last_name: string | null;
      city: string | null;
      identify_at: Date;
    }>>`
      SELECT v.id AS pv_id,
             v."visitorId" AS visitor_id,
             v.email,
             v.phone,
             v.country,
             v.region,
             v."deviceTypes" AS device_types,
             v."customerId" AS customer_id,
             c."firstName" AS first_name,
             c."lastName" AS last_name,
             c.city,
             MAX(e.timestamp) AS identify_at
      FROM pixel_events e
      JOIN pixel_visitors v ON v.id = e."visitorId"
      LEFT JOIN customers c ON c.id = v."customerId"
      WHERE e."organizationId" = ${orgId}
        AND e.type = 'IDENTIFY'
        AND e.timestamp >= ${ago1h}
        AND (v.email IS NOT NULL OR v.phone IS NOT NULL)
      GROUP BY v.id, v."visitorId", v.email, v.phone, v.country, v.region, v."deviceTypes", v."customerId", c."firstName", c."lastName", c.city
      ORDER BY MAX(e.timestamp) DESC
      LIMIT 3
    `;

    for (const row of newIdentified) {
      const visitor = visitorFromRow(row);
      moments.push({
        id: `identified-${row.pv_id}`,
        type: "NEW_IDENTIFIED",
        priority: "medium",
        title: `${visitor.displayName} se identificó`,
        subtitle: `Nuevo contacto · ${visitor.email ? "email" : ""}${visitor.email && visitor.phone ? " + " : ""}${visitor.phone ? "teléfono" : ""} capturado`,
        when: row.identify_at.toISOString(),
        visitor,
        context: {},
        actions: buildActions("NEW_IDENTIFIED", visitor),
      });
    }

    // Ordenar moments: high priority primero, luego por timestamp desc
    moments.sort((a, b) => {
      const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
      const pd = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pd !== 0) return pd;
      return new Date(b.when).getTime() - new Date(a.when).getTime();
    });

    // ═══ FEED LIVE ═══ últimos 60 eventos, prioritizando identificados
    const feedRaw = await prisma.$queryRaw<Array<{
      id: string;
      timestamp: Date;
      event_type: string;
      page_url: string | null;
      props: any;
      pv_id: string;
      visitor_id: string;
      email: string | null;
      phone: string | null;
      country: string | null;
      region: string | null;
      device_types: string[] | null;
      customer_id: string | null;
      first_name: string | null;
      last_name: string | null;
      city: string | null;
    }>>`
      SELECT e.id,
             e.timestamp,
             e.type AS event_type,
             e."pageUrl" AS page_url,
             e.props,
             v.id AS pv_id,
             v."visitorId" AS visitor_id,
             v.email,
             v.phone,
             v.country,
             v.region,
             v."deviceTypes" AS device_types,
             v."customerId" AS customer_id,
             c."firstName" AS first_name,
             c."lastName" AS last_name,
             c.city
      FROM pixel_events e
      JOIN pixel_visitors v ON v.id = e."visitorId"
      LEFT JOIN customers c ON c.id = v."customerId"
      WHERE e."organizationId" = ${orgId}
        AND e.timestamp >= ${ago24h}
      ORDER BY e.timestamp DESC
      LIMIT 80
    `;

    const feed: FeedItem[] = feedRaw.map((row) => {
      const visitor = visitorFromRow(row);
      const props = row.props || {};
      const productName = (typeof props === "object" && props !== null)
        ? (props.item_name ?? props.productName ?? props.name ?? null)
        : null;
      const value = (typeof props === "object" && props !== null && props.value != null)
        ? Number(props.value)
        : null;

      return {
        id: row.id,
        timestamp: row.timestamp.toISOString(),
        eventType: row.event_type,
        visitor,
        pageUrl: row.page_url,
        productName,
        value: Number.isFinite(value) ? value : null,
      };
    });

    return NextResponse.json({
      ok: true,
      updatedAt: now.toISOString(),
      kpis,
      moments,
      feed,
    });
  } catch (err: any) {
    console.error("[bondly/senales] error", err);
    return NextResponse.json(
      { ok: false, error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
