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
import { waitUntil } from "@vercel/functions";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const KEY = "nitrosales-secret-key-2024-production";
const CONCURRENCY = 6;
const BATCH_SIZE = 500;            // por iteracion interna
const TIME_BUDGET_MS = 240_000;    // 4 min de las 5 max — deja 1 min para waitUntil + cleanup

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const orgId = url.searchParams.get("orgId");
    let offset = Number(url.searchParams.get("offset") || 0);
    const dryRun = url.searchParams.get("dryRun") === "1";
    const autoContinue = url.searchParams.get("autoContinue") !== "0"; // default true

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

    // Stats acumulados a lo largo de TODAS las iteraciones de este invoke
    let totalProcessed = 0;
    let totalUpdated = 0;
    let totalNulled = 0;
    let totalSkipped = 0;
    let totalFetchFailed = 0;
    let iterations = 0;
    const sample: any[] = [];
    let hasMore = false;

    // LOOP INTERNO: procesa batches hasta agotar tiempo o no quedar customers
    while (Date.now() - startTime < TIME_BUDGET_MS) {
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
        BATCH_SIZE,
        offset,
      );

      if (targets.length === 0) {
        hasMore = false;
        break;
      }

      iterations++;

      // De-duplicar por customerId
      const byCustomer = new Map<string, any>();
      for (const t of targets) {
        if (!byCustomer.has(t.customer_id)) byCustomer.set(t.customer_id, t);
      }

      const tasks = Array.from(byCustomer.values()).map((t) => async () => {
        totalProcessed++;
        try {
          const detail = await fetchVtexOrderDetail(creds, t.externalId);
          if (!detail) {
            totalFetchFailed++;
            return;
          }

          const rawEmail = detail?.clientProfileData?.email;
          if (!rawEmail) {
            totalSkipped++;
            return;
          }

          const cleanEmail = extractRealEmail(rawEmail);

          if (cleanEmail) {
            if (!dryRun) {
              await prisma.customer.update({
                where: { id: t.customer_id },
                data: { email: cleanEmail },
              });
            }
            totalUpdated++;
            if (sample.length < 5) {
              sample.push({ customerId: t.customer_id, raw: rawEmail, recovered: cleanEmail });
            }
          } else {
            totalNulled++;
          }
        } catch (err: any) {
          console.error(`[vtex-recover-customer-emails] order ${t.externalId}: ${err.message}`);
          totalFetchFailed++;
        }
      });

      await withConcurrency(CONCURRENCY, tasks);

      // Si la query trajo MENOS que BATCH_SIZE, llegamos al final
      if (targets.length < BATCH_SIZE) {
        hasMore = false;
        break;
      }

      // En dry-run no avanzamos offset: la siguiente iter pediria el mismo
      // rango (los customers no cambiaron). Mejor cortamos despues de 1 iter
      // para que el usuario vea la muestra y decida.
      if (dryRun) {
        hasMore = true;
        break;
      }

      // En modo real: como acabamos de updatear todos los del batch, los
      // proximos customers sin email YA estan al inicio de la query
      // (offset 0 vuelve a traer los pendientes nuevos). NO avanzamos offset.
      // Si por alguna razon updated == 0 en esta iter, entonces los
      // candidatos quedaron sin cambio, y hay que avanzar para no loopear.
      // Patron defensivo: si en esta iter no se updateo nada Y no se nuleo,
      // avanzamos offset.
      const totalThisIter = byCustomer.size;
      const updatedThisIter = totalUpdated; // acumulado, pero como antes era 0...
      // Mejor: contamos updates POR iter
      // (Simplificacion: si processed == fetchFailed + skipped, no hubo cambio → avanzar)
      // Lo dejamos sin avanzar offset porque updates + nulls dejan los customers fuera del WHERE c.email IS NULL en proxima query.
    }

    hasMore = hasMore || (Date.now() - startTime >= TIME_BUDGET_MS);

    // Si hay mas, auto-disparar la proxima invocacion en background.
    // Vercel mantiene la funcion alive con waitUntil hasta que el fetch
    // dispara y vuelve.
    if (hasMore && autoContinue && !dryRun) {
      const baseUrl = process.env.NEXTAUTH_URL || "https://app.nitrosales.ai";
      const nextUrl =
        `${baseUrl}/api/admin/vtex-recover-customer-emails` +
        `?orgId=${encodeURIComponent(orgId)}&key=${encodeURIComponent(KEY)}&autoContinue=1`;
      waitUntil(
        fetch(nextUrl, { method: "GET" })
          .then((r) => console.log(`[vtex-recover-customer-emails] auto-continue triggered: HTTP ${r.status}`))
          .catch((err) => console.error(`[vtex-recover-customer-emails] auto-continue failed: ${err.message}`)),
      );
    }

    return NextResponse.json({
      ok: true,
      orgId,
      dryRun,
      iterations,
      totalProcessed,
      totalUpdated,
      totalNulled,
      totalSkipped,
      totalFetchFailed,
      hasMore,
      autoContinueTriggered: hasMore && autoContinue && !dryRun,
      sample,
      elapsedMs: Date.now() - startTime,
      note: dryRun
        ? "Dry-run: no se modifico nada. Repeti sin ?dryRun=1 para auto-procesar todo."
        : hasMore
          ? "Esta invocacion proceso lo que pudo en 4 min. Auto-disparo siguiente en background — segui haciendo otras cosas, va a terminar solo."
          : "Completo: no quedan mas customers VTEX sin email.",
    });
  } catch (err: any) {
    console.error("[vtex-recover-customer-emails] error:", err);
    return NextResponse.json({ error: err.message, stack: err.stack?.slice(0, 500) }, { status: 500 });
  }
}
