// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/vtex-recover-customer-emails?orgId=X&limit=500&offset=0
// ══════════════════════════════════════════════════════════════
// Re-procesa orders VTEX cuyos customers tienen email NULL para
// recuperar el email real desde el detail de VTEX (que entrega
// emails enmascarados que extractRealEmail puede limpiar).
//
// Caso TVC: el backfill viejo guardaba NULL cuando el email venia
// enmascarado. Ahora con extractRealEmail centralizado podemos
// extraer el email real de "real@email.com-12345b.ct.vtex.com.br"
// y guardarlo limpio.
//
// Idempotente: skip orders cuyo customer ya tiene email.
// Pagina con limit + offset (default 500). Concurrency 6.
// Devuelve { processed, updated, hasMore } para retomar.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { fetchVtexOrderDetail } from "@/lib/connectors/vtex-enrichment";
import { extractRealEmail } from "@/lib/connectors/vtex-email";
import { withConcurrency } from "@/lib/sync/concurrency";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const KEY = "nitrosales-secret-key-2024-production";
const CONCURRENCY = 6;

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const orgId = url.searchParams.get("orgId");
    const limit = Math.min(Number(url.searchParams.get("limit") || 500), 1000);
    const offset = Number(url.searchParams.get("offset") || 0);
    const dryRun = url.searchParams.get("dryRun") === "1";

    const allowed = key === KEY ? true : await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!orgId) return NextResponse.json({ error: "orgId requerido" }, { status: 400 });

    // VTEX credentials
    const conn = await prisma.connection.findFirst({
      where: { organizationId: orgId, platform: "VTEX" as any },
      select: { credentials: true },
    });
    if (!conn?.credentials) return NextResponse.json({ error: "Sin VTEX connection" }, { status: 404 });
    const creds = conn.credentials as any;
    if (!creds?.accountName || !creds?.appKey || !creds?.appToken) {
      return NextResponse.json({ error: "VTEX creds incompletas" }, { status: 400 });
    }

    // Orders VTEX cuyo customer tiene email NULL
    const targets: any[] = await prisma.$queryRawUnsafe(
      `SELECT o."id" as order_id, o."externalId", o."customerId", c."id" as customer_id
       FROM "orders" o
       INNER JOIN "customers" c ON c."id" = o."customerId"
       WHERE o."organizationId" = $1
         AND o."source" = 'VTEX'
         AND c."email" IS NULL
       ORDER BY o."orderDate" DESC
       LIMIT $2 OFFSET $3`,
      orgId,
      limit,
      offset,
    );

    if (targets.length === 0) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        updated: 0,
        nulled: 0,
        skipped: 0,
        hasMore: false,
        elapsedMs: Date.now() - startTime,
        note: "No hay orders pendientes (o offset paso el final).",
      });
    }

    let processed = 0;
    let updated = 0;
    let nulled = 0;
    let skipped = 0;
    let fetchFailed = 0;
    const sample: any[] = [];

    // De-duplicar por customerId: si N orders comparten 1 customer, solo
    // hace falta 1 update. Pero traemos UN order por customer para fetch.
    const byCustomer = new Map<string, any>();
    for (const t of targets) {
      if (!byCustomer.has(t.customer_id)) byCustomer.set(t.customer_id, t);
    }

    const tasks = Array.from(byCustomer.values()).map((t) => async () => {
      processed++;
      try {
        const detail = await fetchVtexOrderDetail(creds, t.externalId);
        if (!detail) {
          fetchFailed++;
          return;
        }

        const rawEmail = detail?.clientProfileData?.email;
        if (!rawEmail) {
          skipped++;
          return;
        }

        const cleanEmail = extractRealEmail(rawEmail);

        if (cleanEmail) {
          // Recuperamos email real
          if (!dryRun) {
            await prisma.customer.update({
              where: { id: t.customer_id },
              data: { email: cleanEmail },
            });
          }
          updated++;
          if (sample.length < 5) {
            sample.push({ customerId: t.customer_id, raw: rawEmail, recovered: cleanEmail });
          }
        } else {
          // Era hash anonimo — VTEX no entregaba email real, dejamos como NULL
          nulled++;
        }
      } catch (err: any) {
        console.error(`[vtex-recover-customer-emails] order ${t.externalId}: ${err.message}`);
        fetchFailed++;
      }
    });

    await withConcurrency(CONCURRENCY, tasks);

    return NextResponse.json({
      ok: true,
      orgId,
      dryRun,
      processed,
      uniqueCustomers: byCustomer.size,
      updated,
      nulled,
      skipped,
      fetchFailed,
      hasMore: targets.length === limit,
      nextOffset: offset + limit,
      sample,
      elapsedMs: Date.now() - startTime,
      note: dryRun
        ? "Dry-run: no se modifico nada. Repeti sin ?dryRun=1 para aplicar."
        : (targets.length === limit
            ? `Hay mas. Repeti con offset=${offset + limit} para continuar.`
            : "Completo."),
    });
  } catch (err: any) {
    console.error("[vtex-recover-customer-emails] error:", err);
    return NextResponse.json({ error: err.message, stack: err.stack?.slice(0, 500) }, { status: 500 });
  }
}
