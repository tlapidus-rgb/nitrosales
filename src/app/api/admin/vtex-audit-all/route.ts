// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/vtex-audit-all?orgId=X
// ══════════════════════════════════════════════════════════════
// Auditoria completa del estado de la data VTEX post-backfill.
//
// Mide:
//  - Orders DB (count, sum revenue, breakdown status) vs VTEX OMS (count)
//  - OrderItems DB (cantidad total, items per order ratio)
//  - Products DB (cuantos, cuantos con costPrice null, imageUrl null, brand null)
//  - Customers DB (cantidad, % con email, % con address)
//  - Backfill job del rango que corrio
//
// NO toca data. Solo lee DB + llama a VTEX API una vez para obtener el
// total de VTEX OMS para el rango de la org.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const url = new URL(req.url);
    const orgId = url.searchParams.get("orgId");
    if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

    // ── 1. Connection VTEX ──
    const conn = await prisma.connection.findFirst({
      where: { organizationId: orgId, platform: "VTEX" as any },
      select: { id: true, status: true, credentials: true, lastSyncAt: true, lastSyncError: true },
    });
    if (!conn) return NextResponse.json({ error: "No VTEX connection" }, { status: 404 });

    const creds = conn.credentials as any;
    const accountName = creds?.accountName;
    const appKey = creds?.appKey;
    const appToken = creds?.appToken;

    // ── 2. Backfill job info ──
    const jobs: any[] = await prisma.$queryRawUnsafe(
      `SELECT "id","status","monthsRequested","fromDate","toDate","processedCount","progressPct",
              "startedAt","completedAt","lastError"
       FROM "backfill_jobs"
       WHERE "organizationId" = $1 AND "platform" = 'VTEX'
       ORDER BY "createdAt" DESC LIMIT 1`,
      orgId
    );
    const job = jobs[0] || null;

    // Rango del job para comparar con VTEX API
    const fromDate = job?.fromDate ? new Date(job.fromDate) : null;
    const toDate = job?.toDate ? new Date(job.toDate) : null;

    // ── 3. Orders stats DB ──
    const ordersAgg: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS total,
              COALESCE(SUM("totalValue"),0)::float AS revenue,
              COUNT(CASE WHEN "status" NOT IN ('CANCELLED','RETURNED') THEN 1 END)::int AS active,
              MIN("orderDate") AS oldest,
              MAX("orderDate") AS newest
       FROM "orders"
       WHERE "organizationId" = $1 AND "source" = 'VTEX'`,
      orgId
    );
    const statusBreakdown: any[] = await prisma.$queryRawUnsafe(
      `SELECT "status"::text AS status, COUNT(*)::int AS count
       FROM "orders" WHERE "organizationId" = $1 AND "source" = 'VTEX'
       GROUP BY "status" ORDER BY count DESC`,
      orgId
    );

    // ── 4. OrderItems stats ──
    const itemsAgg: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS total,
              COUNT(DISTINCT "orderId")::int AS distinctOrders,
              COALESCE(SUM("quantity"),0)::int AS unitsSold
       FROM "order_items" oi
       JOIN "orders" o ON o."id" = oi."orderId"
       WHERE o."organizationId" = $1 AND o."source" = 'VTEX'`,
      orgId
    );

    // ── 5. Products stats ──
    const productsAgg: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS total,
              COUNT(CASE WHEN "costPrice" IS NULL OR "costPrice" = 0 THEN 1 END)::int AS nullCost,
              COUNT(CASE WHEN "imageUrl" IS NULL OR "imageUrl" = '' THEN 1 END)::int AS nullImage,
              COUNT(CASE WHEN "brand" IS NULL OR "brand" = '' THEN 1 END)::int AS nullBrand,
              COUNT(CASE WHEN "category" IS NULL OR "category" = '' THEN 1 END)::int AS nullCategory,
              COUNT(CASE WHEN "sku" IS NULL OR "sku" = '' THEN 1 END)::int AS nullSku
       FROM "products" WHERE "organizationId" = $1`,
      orgId
    );

    // ── 6. Customers stats ──
    const customersAgg: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS total,
              COUNT(CASE WHEN "email" IS NOT NULL AND "email" != '' THEN 1 END)::int AS withEmail,
              COUNT(CASE WHEN "firstName" IS NOT NULL THEN 1 END)::int AS withName
       FROM "customers" WHERE "organizationId" = $1`,
      orgId
    );

    // ── 7. VTEX OMS total (count only, 1 query) ──
    let vtexOmsTotal: number | null = null;
    let vtexOmsError: string | null = null;
    if (accountName && appKey && appToken && fromDate && toDate) {
      try {
        // Usamos la misma API que el backfill con filtro de fecha.
        const fromISO = fromDate.toISOString();
        const toISO = toDate.toISOString();
        const apiUrl = `https://${accountName}.vtexcommercestable.com.br/api/oms/pvt/orders` +
          `?f_creationDate=creationDate:[${encodeURIComponent(fromISO)} TO ${encodeURIComponent(toISO)}]` +
          `&per_page=1&page=1`;
        const res = await fetch(apiUrl, {
          headers: {
            "X-VTEX-API-AppKey": appKey,
            "X-VTEX-API-AppToken": appToken,
            "Accept": "application/json",
          },
        });
        if (!res.ok) {
          vtexOmsError = `VTEX ${res.status}: ${(await res.text()).slice(0, 200)}`;
        } else {
          const data = await res.json();
          vtexOmsTotal = data?.paging?.total || data?.stats?.stats?.totalValue?.Count || null;
        }
      } catch (e: any) {
        vtexOmsError = e.message;
      }
    }

    return NextResponse.json({
      ok: true,
      orgId,
      connection: {
        status: conn.status,
        lastSyncAt: conn.lastSyncAt,
        lastSyncError: conn.lastSyncError,
      },
      backfillJob: job,
      buscarv: {
        dbOrders: ordersAgg[0],
        vtexOmsTotalInRange: vtexOmsTotal,
        vtexOmsError,
        diff: vtexOmsTotal != null ? ordersAgg[0].total - vtexOmsTotal : null,
      },
      statusBreakdown,
      items: itemsAgg[0],
      products: productsAgg[0],
      customers: customersAgg[0],
      interpretation: {
        orders: "Si dbOrders.total ≈ vtexOmsTotal → backfill OK. Diff grande = gap a investigar.",
        items: "Si items.total == 0 → processor no crea OrderItems (bug conocido: vtex-processor v2 no los genera).",
        products: "Si products.total == 0 → idem, no hay catalog sync. Esperado en backfill actual.",
        customers: "Si customers.total == 0 → backfill no crea customers. A validar.",
      },
    });
  } catch (err: any) {
    console.error("[vtex-audit-all]", err);
    return NextResponse.json({ error: err.message, stack: err.stack?.slice(0, 500) }, { status: 500 });
  }
}
