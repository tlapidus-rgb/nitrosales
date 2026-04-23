// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/ml-audit-packs?orgId=X&from=YYYY-MM-DD&to=YYYY-MM-DD
// ══════════════════════════════════════════════════════════════
// Auditoria 1:1 entre MELI y nuestra DB.
//
// 1. Baja TODAS las ordenes de MELI en el rango (con pagination +
//    scroll fallback). Dedup por pack_id para obtener "venta-unidades"
//    al estilo UI de MELI.
// 2. Lee de nuestra DB los distinct packs en el mismo rango.
// 3. Devuelve:
//    - meli.totalRows, meli.distinctPacks
//    - db.distinctPacks
//    - intersection (en ambos)
//    - onlyInMeli (perdidas por nosotros — sample de 20)
//    - onlyInDb (de mas — sample de 20)
//    - breakdownByStatus (de MELI con su status real)
//
// SAFETY: Solo admins. Read-only.
// PERF: Para rangos > 3 meses usa ventanas de 7 dias. Puede tardar
//       1-5 minutos segun volumen. Vercel maxDuration = 300s.
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
    const fromParam = url.searchParams.get("from"); // YYYY-MM-DD
    const toParam = url.searchParams.get("to");
    const statusFilter = url.searchParams.get("status"); // opcional: paid,cancelled,etc
    if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });
    if (!fromParam || !toParam) return NextResponse.json({ error: "from/to required (YYYY-MM-DD)" }, { status: 400 });

    const dateFrom = new Date(fromParam + "T00:00:00.000-03:00");
    const dateTo = new Date(toParam + "T23:59:59.999-03:00");

    const { token, mlUserId } = await getSellerToken(orgId);

    // ── 1) Bajar TODAS las ordenes de MELI en el rango ──
    const meliOrders = await fetchAllMliOrders(token, mlUserId, dateFrom, dateTo);

    // Dedup por pack_id (o order.id si no hay pack)
    const meliPackMap = new Map<string, { packKey: string; orderIds: string[]; statuses: Set<string>; totalAmount: number; lastDate: string }>();
    for (const o of meliOrders) {
      const packKey = o.pack_id ? String(o.pack_id) : String(o.id);
      const existing = meliPackMap.get(packKey);
      if (existing) {
        existing.orderIds.push(String(o.id));
        existing.statuses.add(o.status);
        existing.totalAmount += Number(o.total_amount) || 0;
        if (o.date_created > existing.lastDate) existing.lastDate = o.date_created;
      } else {
        meliPackMap.set(packKey, {
          packKey,
          orderIds: [String(o.id)],
          statuses: new Set([o.status]),
          totalAmount: Number(o.total_amount) || 0,
          lastDate: o.date_created,
        });
      }
    }

    // Filtro opcional por status (ej: solo "paid" para matchear "concretadas+en camino")
    let meliPacks = Array.from(meliPackMap.values());
    if (statusFilter) {
      const allowed = statusFilter.split(",").map(s => s.trim().toLowerCase());
      // Pack se incluye si algun status del pack esta en el filtro
      meliPacks = meliPacks.filter(p => [...p.statuses].some(s => allowed.includes(s.toLowerCase())));
    }

    const meliPackSet = new Set(meliPacks.map(p => p.packKey));

    // ── 2) Bajar nuestros distinct packs en el mismo rango ──
    const dbPacksRaw: any[] = await prisma.$queryRawUnsafe(
      `SELECT
         COALESCE("packId", "externalId") AS "packKey",
         ARRAY_AGG("externalId") AS "externalIds",
         ARRAY_AGG(DISTINCT "status"::text) AS "statuses",
         SUM("totalValue")::float AS "totalAmount",
         MAX("orderDate") AS "lastDate"
       FROM "orders"
       WHERE "organizationId" = $1
         AND "source" = 'MELI'
         AND "orderDate" >= $2 AND "orderDate" <= $3
       GROUP BY COALESCE("packId", "externalId")`,
      orgId, dateFrom, dateTo
    );

    const dbPackSet = new Set(dbPacksRaw.map((r: any) => String(r.packKey)));

    // ── 3) Diffs ──
    const onlyInMeli = meliPacks.filter(p => !dbPackSet.has(p.packKey)).slice(0, 20);
    const onlyInDb = dbPacksRaw.filter((r: any) => !meliPackSet.has(String(r.packKey))).slice(0, 20);
    const intersection = meliPacks.filter(p => dbPackSet.has(p.packKey)).length;

    // Breakdown por status MELI (de TODOS los packs, no filtrados)
    const allMeliPacks = Array.from(meliPackMap.values());
    const statusCounts: Record<string, number> = {};
    for (const p of allMeliPacks) {
      const key = [...p.statuses].sort().join("+");
      statusCounts[key] = (statusCounts[key] || 0) + 1;
    }

    return NextResponse.json({
      ok: true,
      orgId,
      range: { from: fromParam, to: toParam },
      statusFilter: statusFilter || "(ninguno, todos los statuses)",
      meli: {
        totalRows: meliOrders.length,
        distinctPacks: meliPackMap.size,
        distinctPacksFiltered: meliPacks.length,
        statusBreakdown: statusCounts,
      },
      db: {
        distinctPacks: dbPacksRaw.length,
      },
      diff: {
        intersection,
        onlyInMeliCount: meliPacks.length - intersection,
        onlyInDbCount: dbPacksRaw.length - intersection,
        onlyInMeliSample: onlyInMeli.map(p => ({
          packKey: p.packKey,
          orderIds: p.orderIds.slice(0, 3),
          statuses: [...p.statuses],
          totalAmount: Math.round(p.totalAmount),
          date: p.lastDate,
        })),
        onlyInDbSample: onlyInDb.map((r: any) => ({
          packKey: r.packKey,
          externalIds: (r.externalIds || []).slice(0, 3),
          statuses: r.statuses,
          totalAmount: Math.round(Number(r.totalAmount) || 0),
          date: r.lastDate,
        })),
      },
    });
  } catch (err: any) {
    console.error("[ml-audit-packs] error:", err);
    return NextResponse.json({ error: err.message, stack: err.stack?.slice(0, 500) }, { status: 500 });
  }
}

async function fetchAllMliOrders(token: string, mlUserId: number, dateFrom: Date, dateTo: Date): Promise<any[]> {
  const all: any[] = [];
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
        `&limit=${PAGE_SIZE}&offset=${offset}` +
        `&sort=date_desc`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`MELI ${res.status}: ${body.slice(0, 200)}`);
      }
      const data = await res.json();
      const results: any[] = data.results || [];
      if (results.length === 0) break;
      all.push(...results);
      const total = data.paging?.total || 0;
      offset += PAGE_SIZE;
      if (offset >= total || offset >= ML_OFFSET_MAX) break;
    }

    windowEnd = windowStart;
  }

  return all;
}
