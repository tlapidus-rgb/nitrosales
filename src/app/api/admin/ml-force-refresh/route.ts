// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/ml-force-refresh
// Body: { orgId, from: "YYYY-MM-DD", to: "YYYY-MM-DD" }
// ══════════════════════════════════════════════════════════════
// Re-clasifica todas las ordenes MELI de una org en el rango,
// aplicando el mapping ACTUAL (post-fix: cancelled gana sobre tag
// delivered). Bypassa el guard de externalUpdatedAt.
//
// Uso: para corregir packs que tenemos con status desactualizado
// (ej. MELI los cancelo pero nuestra DB los tiene como DELIVERED
// por el bug del tag).
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { getSellerToken } from "@/lib/connectors/mercadolibre-seller";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ML_API = "https://api.mercadolibre.com";
const WINDOW_DAYS = 7;
const PAGE_SIZE = 50;
const ML_OFFSET_MAX = 1000;

function mapMlStatus(mlStatus: string, tags?: string[]): string {
  if (mlStatus === "cancelled" || mlStatus === "invalid") return "CANCELLED";
  if (Array.isArray(tags) && tags.includes("delivered")) return "DELIVERED";
  switch (mlStatus) {
    case "paid": return "APPROVED";
    case "shipped": return "SHIPPED";
    case "delivered": return "DELIVERED";
    case "partially_refunded": return "APPROVED";
    case "confirmed":
    case "payment_required":
    case "payment_in_process":
    case "partially_paid": return "PENDING";
    default: return "PENDING";
  }
}

export async function POST(req: NextRequest) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const orgId = String(body.orgId || "");
    const fromParam = String(body.from || "");
    const toParam = String(body.to || "");
    if (!orgId || !fromParam || !toParam) {
      return NextResponse.json({ error: "orgId, from, to required" }, { status: 400 });
    }

    const dateFrom = new Date(fromParam + "T00:00:00.000-03:00");
    const dateTo = new Date(toParam + "T23:59:59.999-03:00");

    const { token, mlUserId } = await getSellerToken(orgId);

    let totalFetched = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    const statusChangeCounts: Record<string, number> = {};

    let windowEnd = new Date(dateTo);
    while (windowEnd.getTime() > dateFrom.getTime()) {
      const windowStart = new Date(Math.max(
        dateFrom.getTime(),
        windowEnd.getTime() - WINDOW_DAYS * 24 * 3600 * 1000
      ));
      let offset = 0;
      while (true) {
        const url =
          `${ML_API}/orders/search?seller=${mlUserId}` +
          `&order.date_created.from=${encodeURIComponent(windowStart.toISOString())}` +
          `&order.date_created.to=${encodeURIComponent(windowEnd.toISOString())}` +
          `&limit=${PAGE_SIZE}&offset=${offset}&sort=date_desc`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) {
          console.error(`[ml-force-refresh] MELI ${res.status}`);
          totalErrors++;
          break;
        }
        const data = await res.json();
        const results: any[] = data.results || [];
        if (results.length === 0) break;
        totalFetched += results.length;

        for (const order of results) {
          try {
            const externalId = String(order.id);
            const newStatus = mapMlStatus(order.status, order.tags);

            // UPDATE sin guard — forzar la re-clasificacion.
            const result: any = await prisma.$executeRawUnsafe(
              `UPDATE "orders"
               SET "status" = $1::"OrderStatus",
                   "packId" = $2,
                   "updatedAt" = NOW()
               WHERE "organizationId" = $3
                 AND "source" = 'MELI'
                 AND "externalId" = $4
                 AND "status" != $1::"OrderStatus"`,
              newStatus,
              order.pack_id ? String(order.pack_id) : null,
              orgId,
              externalId
            );
            if (Number(result) > 0) {
              totalUpdated++;
              const k = `→ ${newStatus}`;
              statusChangeCounts[k] = (statusChangeCounts[k] || 0) + 1;
            } else {
              totalSkipped++;
            }
          } catch (err: any) {
            console.error(`[ml-force-refresh] order ${order.id}: ${err.message}`);
            totalErrors++;
          }
        }

        const total = data.paging?.total || 0;
        offset += PAGE_SIZE;
        if (offset >= total || offset >= ML_OFFSET_MAX) break;
      }
      windowEnd = windowStart;
    }

    return NextResponse.json({
      ok: true,
      orgId,
      range: { from: fromParam, to: toParam },
      stats: {
        totalFetched,
        totalUpdated,
        totalSkipped,
        totalErrors,
        statusChangeCounts,
      },
    });
  } catch (err: any) {
    console.error("[ml-force-refresh] fatal", err);
    return NextResponse.json({ error: err.message, stack: err.stack?.slice(0, 500) }, { status: 500 });
  }
}
