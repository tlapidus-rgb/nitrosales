export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// /api/metrics/top — Top-N rankings genérico
// ══════════════════════════════════════════════════════════════
// Query params:
//   dim       = products | customers | campaigns | categories | brands | sources
//   metric    = revenue | orders | spend | roas (depende de dim)
//   from, to  = ISO date
//   limit     = default 10, max 50
//
// Devuelve: { items: [{ key, label, value, secondary? }], total }
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganization } from "@/lib/auth-guard";

type TopItem = { key: string; label: string; value: number; secondary?: number };

export async function GET(request: Request) {
  try {
    const org = await getOrganization();
    const { searchParams } = new URL(request.url);
    const dim = searchParams.get("dim") || "products";
    const limitRaw = parseInt(searchParams.get("limit") || "10", 10);
    const limit = Math.min(Math.max(limitRaw, 1), 50);

    const now = new Date();
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const to = toParam ? new Date(toParam + "T23:59:59.999-03:00") : now;
    const from = fromParam
      ? new Date(fromParam + "T00:00:00.000-03:00")
      : new Date(to.getTime() - 30 * 86400000);

    let items: TopItem[] = [];

    switch (dim) {
      case "products": {
        // Top productos por revenue (suma de OrderItem.totalPrice de orders billable)
        const rows = await prisma.$queryRawUnsafe<
          Array<{ id: string; name: string; revenue: string; qty: string }>
        >(
          `SELECT p.id::text AS id,
                  COALESCE(p.name, 'Sin nombre') AS name,
                  COALESCE(SUM(oi."totalPrice"), 0)::text AS revenue,
                  COALESCE(SUM(oi.quantity), 0)::text AS qty
          FROM order_items oi
          JOIN orders o ON o.id = oi."orderId"
          LEFT JOIN products p ON p.id = oi."productId"
          WHERE o."organizationId" = $1
            AND o."orderDate" >= $2 AND o."orderDate" < $3
            AND o.status IN ('INVOICED', 'SHIPPED', 'DELIVERED')
            AND p.id IS NOT NULL
          GROUP BY p.id, p.name
          ORDER BY SUM(oi."totalPrice") DESC NULLS LAST
          LIMIT $4`,
          org.id, from, to, limit
        );
        items = rows.map((r) => ({
          key: r.id,
          label: r.name,
          value: Number(r.revenue),
          secondary: Number(r.qty),
        }));
        break;
      }

      case "customers": {
        const rows = await prisma.$queryRawUnsafe<
          Array<{ id: string; label: string; revenue: string; orders: string }>
        >(
          `SELECT c.id::text AS id,
                  COALESCE(NULLIF(TRIM(CONCAT(c."firstName", ' ', c."lastName")), ''), c.email, 'Sin nombre') AS label,
                  COALESCE(SUM(o."totalValue"), 0)::text AS revenue,
                  COUNT(o.id)::text AS orders
          FROM customers c
          JOIN orders o ON o."customerId" = c.id
          WHERE c."organizationId" = $1
            AND o."orderDate" >= $2 AND o."orderDate" < $3
            AND o.status IN ('INVOICED', 'SHIPPED', 'DELIVERED')
          GROUP BY c.id, c."firstName", c."lastName", c.email
          ORDER BY SUM(o."totalValue") DESC NULLS LAST
          LIMIT $4`,
          org.id, from, to, limit
        );
        items = rows.map((r) => ({
          key: r.id,
          label: r.label,
          value: Number(r.revenue),
          secondary: Number(r.orders),
        }));
        break;
      }

      case "campaigns": {
        const rows = await prisma.$queryRawUnsafe<
          Array<{ id: string; name: string; spend: string; conv_value: string }>
        >(
          `SELECT c.id::text AS id,
                  c.name,
                  COALESCE(SUM(d.spend), 0)::text AS spend,
                  COALESCE(SUM(d."conversionValue"), 0)::text AS conv_value
          FROM ad_campaigns c
          JOIN ad_metrics_daily d ON d."campaignId" = c.id
          WHERE c."organizationId" = $1
            AND d.date >= $2 AND d.date < $3
          GROUP BY c.id, c.name
          ORDER BY SUM(d."conversionValue") / NULLIF(SUM(d.spend), 0) DESC NULLS LAST
          LIMIT $4`,
          org.id, from, to, limit
        );
        items = rows.map((r) => {
          const spend = Number(r.spend);
          const cv = Number(r.conv_value);
          return {
            key: r.id,
            label: r.name,
            value: spend > 0 ? Math.round((cv / spend) * 100) / 100 : 0,
            secondary: spend,
          };
        });
        break;
      }

      case "categories": {
        const rows = await prisma.$queryRawUnsafe<
          Array<{ category: string; revenue: string }>
        >(
          `SELECT COALESCE(p.category, 'Sin categoría') AS category,
                  COALESCE(SUM(oi."totalPrice"), 0)::text AS revenue
          FROM order_items oi
          JOIN orders o ON o.id = oi."orderId"
          LEFT JOIN products p ON p.id = oi."productId"
          WHERE o."organizationId" = $1
            AND o."orderDate" >= $2 AND o."orderDate" < $3
            AND o.status IN ('INVOICED', 'SHIPPED', 'DELIVERED')
          GROUP BY p.category
          ORDER BY SUM(oi."totalPrice") DESC NULLS LAST
          LIMIT $4`,
          org.id, from, to, limit
        );
        items = rows.map((r) => ({
          key: r.category,
          label: r.category,
          value: Number(r.revenue),
        }));
        break;
      }

      case "brands": {
        const rows = await prisma.$queryRawUnsafe<
          Array<{ brand: string; revenue: string }>
        >(
          `SELECT COALESCE(p.brand, 'Sin marca') AS brand,
                  COALESCE(SUM(oi."totalPrice"), 0)::text AS revenue
          FROM order_items oi
          JOIN orders o ON o.id = oi."orderId"
          LEFT JOIN products p ON p.id = oi."productId"
          WHERE o."organizationId" = $1
            AND o."orderDate" >= $2 AND o."orderDate" < $3
            AND o.status IN ('INVOICED', 'SHIPPED', 'DELIVERED')
          GROUP BY p.brand
          ORDER BY SUM(oi."totalPrice") DESC NULLS LAST
          LIMIT $4`,
          org.id, from, to, limit
        );
        items = rows.map((r) => ({
          key: r.brand,
          label: r.brand,
          value: Number(r.revenue),
        }));
        break;
      }

      case "sources": {
        // Top fuentes de tráfico desde orders.trafficSource
        const rows = await prisma.$queryRawUnsafe<
          Array<{ source: string; revenue: string; orders: string }>
        >(
          `SELECT COALESCE("trafficSource", 'direct') AS source,
                  COALESCE(SUM("totalValue"), 0)::text AS revenue,
                  COUNT(*)::text AS orders
          FROM orders
          WHERE "organizationId" = $1
            AND "orderDate" >= $2 AND "orderDate" < $3
            AND status IN ('INVOICED', 'SHIPPED', 'DELIVERED')
          GROUP BY "trafficSource"
          ORDER BY SUM("totalValue") DESC NULLS LAST
          LIMIT $4`,
          org.id, from, to, limit
        );
        items = rows.map((r) => ({
          key: r.source,
          label: r.source,
          value: Number(r.revenue),
          secondary: Number(r.orders),
        }));
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown dim: ${dim}` }, { status: 400 });
    }

    const total = items.reduce((s, i) => s + i.value, 0);
    return NextResponse.json({ items, total, dim, limit });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
