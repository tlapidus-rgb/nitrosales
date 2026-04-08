export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// /api/metrics/distribution — Distribuciones (donut chart data)
// ══════════════════════════════════════════════════════════════
// Query params:
//   dim       = canal | estado | platform | category | device | source
//   from, to  = ISO date
//
// Devuelve: { slices: [{ key, label, value, color }], total }
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganization } from "@/lib/auth-guard";

type Slice = { key: string; label: string; value: number; color?: string };

const PALETTE = [
  "#06b6d4", "#8b5cf6", "#f97316", "#6366f1", "#10b981",
  "#f43f5e", "#eab308", "#0ea5e9", "#a855f7", "#ec4899",
];

export async function GET(request: Request) {
  try {
    const org = await getOrganization();
    const { searchParams } = new URL(request.url);
    const dim = searchParams.get("dim") || "canal";

    const now = new Date();
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const to = toParam ? new Date(toParam + "T23:59:59.999-03:00") : now;
    const from = fromParam
      ? new Date(fromParam + "T00:00:00.000-03:00")
      : new Date(to.getTime() - 30 * 86400000);

    let slices: Slice[] = [];

    switch (dim) {
      case "canal": {
        const rows = await prisma.$queryRawUnsafe<
          Array<{ source: string; revenue: string }>
        >(
          `SELECT source, COALESCE(SUM("totalValue"), 0)::text AS revenue
          FROM orders
          WHERE "organizationId" = $1
            AND "orderDate" >= $2 AND "orderDate" < $3
            AND status IN ('INVOICED', 'SHIPPED', 'DELIVERED')
          GROUP BY source
          ORDER BY SUM("totalValue") DESC NULLS LAST`,
          org.id, from, to
        );
        slices = rows.map((r, i) => ({
          key: r.source,
          label: r.source,
          value: Number(r.revenue),
          color: PALETTE[i % PALETTE.length],
        }));
        break;
      }

      case "estado": {
        const rows = await prisma.$queryRawUnsafe<
          Array<{ status: string; cnt: string }>
        >(
          `SELECT status::text AS status, COUNT(*)::text AS cnt
          FROM orders
          WHERE "organizationId" = $1
            AND "orderDate" >= $2 AND "orderDate" < $3
          GROUP BY status
          ORDER BY COUNT(*) DESC`,
          org.id, from, to
        );
        slices = rows.map((r, i) => ({
          key: r.status,
          label: r.status,
          value: Number(r.cnt),
          color: PALETTE[i % PALETTE.length],
        }));
        break;
      }

      case "platform": {
        const rows = await prisma.$queryRawUnsafe<
          Array<{ platform: string; spend: string }>
        >(
          `SELECT platform, COALESCE(SUM(spend), 0)::text AS spend
          FROM ad_metrics_daily
          WHERE "organizationId" = $1
            AND date >= $2 AND date < $3
          GROUP BY platform
          ORDER BY SUM(spend) DESC NULLS LAST`,
          org.id, from, to
        );
        slices = rows.map((r, i) => ({
          key: r.platform,
          label: r.platform,
          value: Number(r.spend),
          color: PALETTE[i % PALETTE.length],
        }));
        break;
      }

      case "category": {
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
          LIMIT 8`,
          org.id, from, to
        );
        slices = rows.map((r, i) => ({
          key: r.category,
          label: r.category,
          value: Number(r.revenue),
          color: PALETTE[i % PALETTE.length],
        }));
        break;
      }

      case "device": {
        const rows = await prisma.$queryRawUnsafe<
          Array<{ device: string; cnt: string }>
        >(
          `SELECT COALESCE("deviceType", 'unknown') AS device, COUNT(*)::text AS cnt
          FROM orders
          WHERE "organizationId" = $1
            AND "orderDate" >= $2 AND "orderDate" < $3
            AND status IN ('INVOICED', 'SHIPPED', 'DELIVERED')
          GROUP BY "deviceType"
          ORDER BY COUNT(*) DESC`,
          org.id, from, to
        );
        slices = rows.map((r, i) => ({
          key: r.device,
          label: r.device,
          value: Number(r.cnt),
          color: PALETTE[i % PALETTE.length],
        }));
        break;
      }

      case "source": {
        const rows = await prisma.$queryRawUnsafe<
          Array<{ src: string; cnt: string }>
        >(
          `SELECT COALESCE("trafficSource", 'direct') AS src, COUNT(*)::text AS cnt
          FROM orders
          WHERE "organizationId" = $1
            AND "orderDate" >= $2 AND "orderDate" < $3
            AND status IN ('INVOICED', 'SHIPPED', 'DELIVERED')
          GROUP BY "trafficSource"
          ORDER BY COUNT(*) DESC
          LIMIT 8`,
          org.id, from, to
        );
        slices = rows.map((r, i) => ({
          key: r.src,
          label: r.src,
          value: Number(r.cnt),
          color: PALETTE[i % PALETTE.length],
        }));
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown dim: ${dim}` }, { status: 400 });
    }

    const total = slices.reduce((s, i) => s + i.value, 0);
    return NextResponse.json({ slices, total, dim });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
