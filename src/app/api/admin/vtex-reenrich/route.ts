// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/vtex-reenrich?orgId=X&limit=2000
// ══════════════════════════════════════════════════════════════
// Re-enriquece orders VTEX que NO tienen OrderItems todavia.
// Usa el helper fetchVtexOrderDetail + enrichOrderFromVtex que ya
// sabemos que funciona (testeado con debug-vtex-enrichment).
//
// Por que: el backfill del cliente MdJ completo con processedCount=12298
// pero el enrichment no corrio (rate limit, timeout, race, etc). En
// lugar de re-hacer todo el backfill, recorremos las orders existentes
// que no tienen items y las enriquecemos una por una.
//
// Diseno:
//  - Paginado (limit=2000 por invocacion, max Vercel 5min)
//  - Concurrency 4 (mas bajo que backfill para evitar rate limit)
//  - Con logs de progreso en la response
//  - Idempotente: solo procesa orders sin OrderItems
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { decryptCredentials } from "@/lib/crypto";
import { fetchVtexOrderDetail, enrichOrderFromVtex } from "@/lib/connectors/vtex-enrichment";
import { withConcurrency } from "@/lib/sync/concurrency";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const KEY = "nitrosales-secret-key-2024-production";
const CONCURRENCY = 4;

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const ok = key === KEY ? true : await isInternalUser();
    if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const orgId = url.searchParams.get("orgId");
    if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

    const limit = Math.min(Number(url.searchParams.get("limit") || 2000), 5000);

    // ── Credenciales VTEX ──
    const conn = await prisma.connection.findFirst({
      where: { organizationId: orgId, platform: "VTEX" as any },
      select: { credentials: true },
    });
    if (!conn) return NextResponse.json({ error: "No VTEX connection" }, { status: 404 });
    let creds: any;
    const raw = conn.credentials as any;
    if (typeof raw === "string") creds = decryptCredentials(raw);
    else if (typeof raw === "object" && raw !== null) creds = raw;
    else creds = JSON.parse(raw);
    if (!creds?.accountName || !creds?.appKey || !creds?.appToken) {
      return NextResponse.json({ error: "VTEX credentials incompletas" }, { status: 400 });
    }

    // ── Orders sin items (candidatos a enriquecer) ──
    // LEFT JOIN a order_items para filtrar solo orders con 0 items.
    const candidates: Array<{ id: string; externalId: string }> = await prisma.$queryRawUnsafe(
      `SELECT o."id", o."externalId"
       FROM "orders" o
       LEFT JOIN "order_items" oi ON oi."orderId" = o."id"
       WHERE o."organizationId" = $1
         AND o."source" = 'VTEX'
         AND oi."id" IS NULL
       ORDER BY o."orderDate" DESC
       LIMIT $2`,
      orgId,
      limit
    );

    if (candidates.length === 0) {
      return NextResponse.json({
        ok: true,
        orgId,
        note: "No hay orders sin items para enriquecer. Todo OK.",
        enriched: 0,
        failed: 0,
        elapsedMs: Date.now() - startTime,
      });
    }

    // ── Enrichment en paralelo ──
    let enriched = 0;
    let failed = 0;
    let skippedNoData = 0;
    const errors: string[] = [];

    const tasks = candidates.map((ord) => async () => {
      try {
        const vData = await fetchVtexOrderDetail(creds, ord.externalId);
        if (!vData) {
          skippedNoData++;
          return;
        }
        const result = await enrichOrderFromVtex(ord.id, orgId, vData);
        if (result) {
          enriched++;
        } else {
          failed++;
          if (errors.length < 5) errors.push(`enrichOrder ${ord.externalId} returned null`);
        }
      } catch (err: any) {
        failed++;
        if (errors.length < 5) errors.push(`${ord.externalId}: ${err.message}`);
      }
    });

    await withConcurrency(tasks, CONCURRENCY);

    // ── Stats post-run ──
    const itemsAgg: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS total FROM "order_items" oi
       JOIN "orders" o ON o."id" = oi."orderId"
       WHERE o."organizationId" = $1 AND o."source" = 'VTEX'`,
      orgId
    );
    const productsAgg: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS total FROM "products" WHERE "organizationId" = $1`,
      orgId
    );
    const customersAgg: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS total FROM "customers" WHERE "organizationId" = $1`,
      orgId
    );

    const remaining: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS total
       FROM "orders" o
       LEFT JOIN "order_items" oi ON oi."orderId" = o."id"
       WHERE o."organizationId" = $1 AND o."source" = 'VTEX' AND oi."id" IS NULL`,
      orgId
    );

    return NextResponse.json({
      ok: true,
      orgId,
      processed: candidates.length,
      enriched,
      failed,
      skippedNoData,
      firstErrors: errors,
      totals: {
        orderItems: itemsAgg[0]?.total,
        products: productsAgg[0]?.total,
        customers: customersAgg[0]?.total,
        ordersWithoutItemsRemaining: remaining[0]?.total,
      },
      elapsedMs: Date.now() - startTime,
      nextStep: remaining[0]?.total > 0
        ? `Quedan ${remaining[0].total} sin items. Volver a correr este endpoint para seguir.`
        : "Todas las orders enriquecidas OK.",
    });
  } catch (err: any) {
    return NextResponse.json({
      error: err.message,
      stack: err.stack?.slice(0, 500),
      elapsedMs: Date.now() - startTime,
    }, { status: 500 });
  }
}
