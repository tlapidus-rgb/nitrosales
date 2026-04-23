// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/ml-diff-detail?orgId=X&from=YYYY-MM-DD&to=YYYY-MM-DD
// ══════════════════════════════════════════════════════════════
// BUSCARV: para cada pack que tenemos en DB como non-cancelled,
// consulta MELI y dice cuál es su status REAL ahí. Agrupa el
// resultado por status MELI para ver donde está la diferencia.
//
// Output:
//  - dbNonCancelledPacks: X (lo que cuenta /orders)
//  - meliStatusBreakdown: {paid: N, shipped: M, delivered: K, ...}
//  - diffSummary: qué status en MELI tienen los packs que pensamos "ventas"
//    pero MELI NO cuenta en 'concretadas+en camino'
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

export async function GET(req: NextRequest) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const url = new URL(req.url);
    const orgId = url.searchParams.get("orgId");
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");
    if (!orgId || !fromParam || !toParam) {
      return NextResponse.json({ error: "orgId, from, to required" }, { status: 400 });
    }

    const dateFrom = new Date(fromParam + "T00:00:00.000-03:00");
    const dateTo = new Date(toParam + "T23:59:59.999-03:00");

    // 1. Get non-cancelled packs from our DB
    const dbPacks: any[] = await prisma.$queryRawUnsafe(
      `SELECT COALESCE("packId", "externalId") AS pack_key,
              MAX("status"::text) AS db_status,
              MIN("externalId") AS sample_order_id,
              MIN("orderDate") AS first_date
       FROM "orders"
       WHERE "organizationId" = $1
         AND "source" = 'MELI'
         AND "orderDate" >= $2 AND "orderDate" <= $3
         AND "status" NOT IN ('CANCELLED', 'RETURNED')
       GROUP BY COALESCE("packId", "externalId")`,
      orgId, dateFrom, dateTo
    );

    // 2. Get all MELI orders in range and build map: pack_key → {statuses: Set<string>}
    const { token, mlUserId } = await getSellerToken(orgId);
    const meliPackStatusMap = new Map<string, Set<string>>();

    let windowEnd = new Date(dateTo);
    while (windowEnd.getTime() > dateFrom.getTime()) {
      const windowStart = new Date(Math.max(
        dateFrom.getTime(),
        windowEnd.getTime() - WINDOW_DAYS * 24 * 3600 * 1000
      ));
      let offset = 0;
      while (true) {
        const apiUrl =
          `${ML_API}/orders/search?seller=${mlUserId}` +
          `&order.date_created.from=${encodeURIComponent(windowStart.toISOString())}` +
          `&order.date_created.to=${encodeURIComponent(windowEnd.toISOString())}` +
          `&limit=${PAGE_SIZE}&offset=${offset}&sort=date_desc`;
        const res = await fetch(apiUrl, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(`MELI ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const data = await res.json();
        const results: any[] = data.results || [];
        if (results.length === 0) break;
        for (const o of results) {
          const pk = o.pack_id ? String(o.pack_id) : String(o.id);
          const s = meliPackStatusMap.get(pk) || new Set<string>();
          s.add(o.status);
          meliPackStatusMap.set(pk, s);
        }
        const total = data.paging?.total || 0;
        offset += PAGE_SIZE;
        if (offset >= total || offset >= ML_OFFSET_MAX) break;
      }
      windowEnd = windowStart;
    }

    // 3. For each non-cancelled pack in DB, find its MELI status (priority: paid > shipped > delivered > other)
    const breakdown: Record<string, number> = {};
    const missingInMeli: string[] = [];
    const samples: Record<string, Array<{ pack: string; dbStatus: string; meliStatuses: string[]; date: string }>> = {};

    for (const p of dbPacks) {
      const packKey = String(p.pack_key);
      const meliStatuses = meliPackStatusMap.get(packKey);
      let category: string;
      if (!meliStatuses) {
        category = "NOT_IN_MELI_RANGE";
        missingInMeli.push(packKey);
      } else {
        // Join statuses for display
        category = Array.from(meliStatuses).sort().join("+");
      }
      breakdown[category] = (breakdown[category] || 0) + 1;
      if (!samples[category]) samples[category] = [];
      if (samples[category].length < 5) {
        samples[category].push({
          pack: packKey,
          dbStatus: p.db_status,
          meliStatuses: meliStatuses ? Array.from(meliStatuses) : [],
          date: p.first_date,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      orgId,
      range: { from: fromParam, to: toParam },
      dbNonCancelledPacks: dbPacks.length,
      meliTotalPacksInRange: meliPackStatusMap.size,
      breakdownByMeliStatus: breakdown,
      samplesByCategory: samples,
      interpretation: {
        match: "paid, paid+shipped, paid+delivered, shipped, delivered = concretadas/en camino (esperado 1196)",
        mismatch: "Si aparecen otros grupos (cancelled+paid, solo cancelled, NOT_IN_MELI_RANGE), son los culpables de la diferencia",
      },
    });
  } catch (err: any) {
    console.error("[ml-diff-detail]", err);
    return NextResponse.json({ error: err.message, stack: err.stack?.slice(0, 500) }, { status: 500 });
  }
}
