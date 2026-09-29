export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min Vercel Pro

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { mlSessionConnection } from "@/lib/connectors/ml-session-connection";
import { enrichOrderFromMl } from "@/lib/connectors/mercadolibre-enrichment";
import { getSellerToken, fetchSellerOrders } from "@/lib/connectors/mercadolibre-seller";

// ══════════════════════════════════════════════════════════════
// GET /api/sync/mercadolibre/enrich-items?days=7&offset=0
// ══════════════════════════════════════════════════════════════
// Enriches existing MELI orders through the version-checked transaction.
// A mismatched basic version requires reconciliation before retrying.
//
// Params:
//   days    — how many days back to fetch (default: 7, max: 180)
//   offset  — day offset from today (default: 0)
//             e.g. days=7&offset=7 → 7-14 days ago
//   force   — "true" to re-enrich orders that already have items
// ══════════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const { searchParams } = new URL(req.url);
  const days = Number(searchParams.get("days") ?? "7");
  const dayOffset = Number(searchParams.get("offset") ?? "0");
  if (!Number.isSafeInteger(days) || days < 1 || days > 180 ||
      !Number.isSafeInteger(dayOffset) || dayOffset < 0 || dayOffset > 36500) {
    return NextResponse.json({ error: "Invalid days or offset" }, { status: 400 });
  }
  const force = searchParams.get("force") === "true";

  try {
    // Multi-tenant safe: resolver orgId primero
    const access = await mlSessionConnection();
    if (access.response) return access.response;
    const connection = access.connection;
    const orgId = connection.organizationId;
    const { token, mlUserId } = await getSellerToken(orgId);

    // Calculate date window
    const DAY = 24 * 60 * 60 * 1000;
    const dateEnd = new Date(Date.now() - dayOffset * DAY);
    const dateStart = new Date(dateEnd.getTime() - days * DAY);
    const label = `${dateStart.toISOString().split("T")[0]} → ${dateEnd.toISOString().split("T")[0]}`;

    // Fetch orders from ML (this paginates automatically, cap at 10k)
    const mlOrders = await fetchSellerOrders(token, mlUserId, {
      dateFrom: dateStart.toISOString(),
      dateTo: dateEnd.toISOString(),
      maxOrders: 10000,
    });

    // Defensive window filter; the search itself uses both bounds.
    const filtered = mlOrders.filter((o: any) => {
      const d = new Date(o.date_created);
      return d >= dateStart && d <= dateEnd;
    });

    const ids = filtered.map(order => String(order.id));
    const dbOrders = ids.length ? await prisma.$queryRawUnsafe<Array<{ id: string; externalId: string }>>(
      `SELECT o.id, o."externalId" FROM orders o
       WHERE o."organizationId"=$1 AND o.source='MELI' AND o."externalId"=ANY($2::text[])
         AND ($3::boolean OR NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi."orderId"=o.id))`,
      orgId, ids, force,
    ) : [];
    const selected = new Map(dbOrders.map(order => [order.externalId, order.id]));
    let enriched = 0, itemsCreated = 0, errors = 0;
    for (const order of filtered) {
      const id = selected.get(String(order.id));
      if (!id) continue;
      // Do not delete any items before the version check/transaction.
      const result = await enrichOrderFromMl(id, orgId, order, token);
      if (!result) { errors++; continue; }
      enriched++;
      itemsCreated += result.itemsCreated;
    }
    return NextResponse.json({
      ok: errors === 0, complete: errors === 0, label, fetched: filtered.length,
      ordersToEnrich: dbOrders.length, enriched, itemsCreated, errors,
      ...(errors ? { message: "Some orders could not be enriched; reconcile their basic version before retrying." } : {}),
      elapsed: `${((Date.now() - t0) / 1000).toFixed(1)}s`,
    });
  } catch (err: any) {
    console.error("[ML Enrich Items] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
