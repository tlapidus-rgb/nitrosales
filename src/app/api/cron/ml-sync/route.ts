// ══════════════════════════════════════════════════════════════
// ML Cron Sync — Robust safety net for MercadoLibre data (MULTI-TENANT)
// ══════════════════════════════════════════════════════════════
// Runs every 4 hours (Vercel Cron). Para CADA org con ML activo:
//   1. SYNCS RECENT ORDERS directly from ML /orders/search API (48h)
//   2. Enriches order items (products + order_items rows)
//   3. Snapshots seller reputation metrics
//
// Multi-tenant: itera todas las Connection con platform=MERCADOLIBRE,
// status=ACTIVE. Secuencial (no paralelo). Cuando haya >5 orgs con ML,
// paralelizar con Promise.all pero con batching (~3 a la vez).
//
// SAFETY: READ-ONLY from ML API. Only writes to our DB.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSellerToken, fetchSellerReputation, fetchSellerOrders } from "@/lib/connectors/mercadolibre-seller";
// E-30. Acá vivía una de las SIETE copias del mapeo de estados de MELI, en
// dos familias que no coincidían: `confirmed` era APPROVED en cinco y
// PENDING en dos, y eso decide si la orden cuenta como venta. Ahora todos
// llaman a `mapMeliStatus` —espejo de `vtex-status.ts`— directamente.
import { ingestMlOrder } from "@/lib/connectors/ml-order-ingestion";
import { mapMeliStatus } from "@/lib/meli-status";
import { isValidAdminKey } from "@/lib/admin-key";
import { coincideConAlguna } from "@/lib/comparacion-segura";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Vercel Pro plan — 5 min
// Cooperative cutoff; an in-flight DB/provider operation still needs its own
// timeout. Leave a minute to finish the current unit and report incomplete work.
const WORK_BUDGET_MS = 240_000;


/**
 * Sincroniza UNA org con ML conectado. Captura errores internamente
 * para no bloquear el procesamiento de las otras orgs.
 */
async function syncOneOrg(
  orgId: string,
  connId: string,
  deadline: number,
): Promise<{ ok: boolean; log: string[]; error?: string }> {
  const log: string[] = [];
  let failed = false;
  try {
    const { token, mlUserId } = await getSellerToken(orgId);
    log.push(`Token OK for user ${mlUserId}`);

    // ── 1. Sync recent orders from ML API (last 72h) ─────────
    try {
      const twoDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
      const mlOrders = await fetchSellerOrders(token, mlUserId, {
        dateFrom: twoDaysAgo,
        maxOrders: 5000,
      });
      log.push(`Fetched ${mlOrders.length} orders from ML (last 72h)`);

      let ordersCreated = 0;
      let ordersUpdated = 0;
      for (const order of mlOrders) {
        if (Date.now() >= deadline) throw new Error("ML sync time budget exhausted; retry required");
        const saved = await ingestMlOrder(orgId, order, mapMeliStatus(order.status, order.tags), token);
        if (saved.action === "inserted") ordersCreated++;
        else if (saved.action === "updated") ordersUpdated++;
      }
      log.push(`Orders: ${ordersCreated} created, ${ordersUpdated} updated`);
    } catch (err: any) {
      failed = true;
      log.push(`Order sync error: ${err.message}`);
    }

    // ── 2. Sync reputation snapshot ──────────────────────────
    try {
      if (Date.now() >= deadline) throw new Error("ML reputation deferred by time budget");
      const rep = await fetchSellerReputation(token, mlUserId);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      await prisma.mlSellerMetricDaily.upsert({
        where: {
          organizationId_date: { organizationId: orgId, date: today },
        },
        update: {
          reputationLevel: rep.level,
          reputationPower: rep.powerSeller,
          totalSales: rep.transactions.total,
          completedSales: rep.transactions.completed,
          cancelledSales: rep.transactions.canceled,
          claimsRate: rep.metrics.claims.rate,
          delayedHandlingRate: rep.metrics.delayed.rate,
          cancellationRate: rep.metrics.cancellations.rate,
          positiveRatings: rep.ratings.positive,
          negativeRatings: rep.ratings.negative,
          neutralRatings: rep.ratings.neutral,
        },
        create: {
          organizationId: orgId,
          date: today,
          reputationLevel: rep.level,
          reputationPower: rep.powerSeller,
          totalSales: rep.transactions.total,
          completedSales: rep.transactions.completed,
          cancelledSales: rep.transactions.canceled,
          claimsRate: rep.metrics.claims.rate,
          delayedHandlingRate: rep.metrics.delayed.rate,
          cancellationRate: rep.metrics.cancellations.rate,
          positiveRatings: rep.ratings.positive,
          negativeRatings: rep.ratings.negative,
          neutralRatings: rep.ratings.neutral,
        },
      });
      log.push(`Reputation synced: ${rep.level}`);
    } catch (err: any) {
      failed = true;
      log.push(`Reputation error: ${err.message}`);
    }

    // ── Update connection lastSyncAt + marcar sync exitoso ─────
    const now = new Date();
    await prisma.connection.update({
      where: { id: connId },
      data: failed
        ? { lastSyncAt: now, lastSyncError: "ML sync incomplete" }
        : { lastSyncAt: now, lastSuccessfulSyncAt: now, lastSyncError: null },
    });

    return { ok: !failed, log };
  } catch (err: any) {
    console.error(`[ML Cron] Fatal for org ${orgId}:`, err);
    return { ok: false, log, error: err.message };
  }
}

export async function GET(req: NextRequest) {
  // ⚠️ FAIL-CLOSED (R-C04). Antes era `if (cronSecret && authHeader !== ...)`, o
  // sea: si la variable de entorno NO estaba seteada, el `if` no se evaluaba y
  // **el endpoint quedaba público**.
  //
  // ── POR QUÉ DOS PUERTAS Y NO UN 500 ──────────────────────────────────
  // La primera versión de este arreglo devolvía 500 si `CRON_SECRET` no
  // estaba seteada. Cambiaba un endpoint abierto por uno que no arranca, que
  // es mejor, pero apostaba el cron entero a una variable que este repo NO
  // usa en ningún lado: `CRON_SECRET` no figura en `.env.example`, y de los
  // 26 crons éste era el único que dependía de ella. Los otros 25 se
  // autentican con `ADMIN_API_KEY`, que es la que `vercel.json` manda.
  //
  // Así que ahora entra por cualquiera de las dos, y las dos son fail-closed
  // por construcción: `isValidAdminKey` cae a una clave aleatoria por proceso
  // si la env falta (nadie la puede matchear), y el Bearer exige que
  // `CRON_SECRET` exista ANTES de comparar.
  //
  // Ese último detalle no es paranoia: sin el chequeo de largo, con la env
  // sin setear el secreto esperado sería el string `"Bearer undefined"` —
  // que cualquiera puede mandar.
  //
  // Qué se podía hacer con eso: cualquiera que descubriera la URL la disparaba en
  // loop. Cada llamada lanza un sync completo de MercadoLibre para todas las orgs
  // con ML activo — satura Neon (que ya se cayó bajo carga, BP-NEON-CAPACITY) y
  // consume la cuota de la app de ML, que ML puede desactivar por abuso.
  //
  // Ahora: sin NINGUNA de las dos claves configuradas, no entra nadie. Es
  // preferible un cron que no arranca (y se nota) a uno abierto (que no se
  // nota) — pero con dos puertas, que no arranque deja de depender de una
  // sola variable que quizas nunca se seteo.
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const porSecretoDeCron =
    typeof cronSecret === "string" &&
    cronSecret.length > 0 &&
    coincideConAlguna(authHeader, `Bearer ${cronSecret}`, null);
  const porClaveDeAdmin = isValidAdminKey(req.nextUrl.searchParams.get("key"));
  if (!porSecretoDeCron && !porClaveDeAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    // Multi-tenant: iterar TODAS las orgs con ML activo
    const mlConnections = await prisma.connection.findMany({
      where: { platform: "MERCADOLIBRE" as any, status: "ACTIVE" as any },
      select: { id: true, organizationId: true },
    });

    if (mlConnections.length === 0) {
      return NextResponse.json({ error: "No active ML connections" }, { status: 404 });
    }

    // Procesar secuencialmente por org (cron tiene 5 min total).
    // TODO post-multi-tenant real (>5 orgs): paralelizar con Promise.all batched.
    const orgResults: Array<{
      orgId: string;
      ok: boolean;
      log: string[];
      error?: string;
      elapsedMs: number;
    }> = [];

    let overallOk = true;
    let orgsDeferred = 0;
    for (const conn of mlConnections) {
      const orgStart = Date.now();
      if (orgStart >= startTime + WORK_BUDGET_MS) {
        overallOk = false;
        orgsDeferred++;
        orgResults.push({ orgId: conn.organizationId, ok: false, log: [],
          error: "ML organization deferred by time budget", elapsedMs: 0 });
        continue;
      }
      const result = await syncOneOrg(conn.organizationId, conn.id, startTime + WORK_BUDGET_MS);
      orgResults.push({
        orgId: conn.organizationId,
        ok: result.ok,
        log: result.log,
        error: result.error,
        elapsedMs: Date.now() - orgStart,
      });
      if (!result.ok) overallOk = false;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    return NextResponse.json({
      ok: overallOk,
      elapsed: `${elapsed}s`,
      orgsProcessed: orgResults.length - orgsDeferred,
      orgsDeferred,
      results: orgResults,
    });
  } catch (err: any) {
    console.error("[ML Cron] Fatal:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
