// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// MercadoLibre backfill processor
// ══════════════════════════════════════════════════════════════
// Procesa un chunk de órdenes historicas de MELI dentro del rango
// {fromDate, toDate} del job, paginando con cursor
// {windowStart, windowEnd, offset}.
//
// ESTRATEGIA C++ (reviewed S55 BIS+2):
//  1. Date-window pagination — ventanas de 7 días para esquivar
//     el límite de MELI (offset max 1000).
//  2. Pre-query de IDs locales antes de upsert — evita writes
//     innecesarios, solo inserta/actualiza lo que falta o cambió.
//  3. Upsert con guard `WHERE externalUpdatedAt < new` — idempotente
//     sin race conditions con webhooks corriendo en paralelo.
//
// El payload de /orders/search trae el objeto completo: no necesitamos
// un segundo GET por ID. Ahorra 50% de API calls vs approach naive.
//
// Cursor shape: { windowEnd: ISO, windowStart: ISO, offset: int }
// Backwards compat: cursor viejo o vacío → inicializa desde job.toDate.
// ══════════════════════════════════════════════════════════════

import { persistMlOrder } from "@/lib/connectors/ml-order-persistence";
import { prisma } from "@/lib/db/client";
import { getSellerToken } from "@/lib/connectors/mercadolibre-seller";
import { enrichOrderFromMl } from "@/lib/connectors/mercadolibre-enrichment";
import { retryWithBackoff, isRetryableStatus } from "@/lib/sync/retry";
import { withConcurrency } from "@/lib/sync/concurrency";
import type { ChunkResult } from "../types";
// E-30. Acá vivía una de las SIETE copias del mapeo de estados de MELI, en
// dos familias que no coincidían: `confirmed` era APPROVED en cinco y
// PENDING en dos, y eso decide si la orden cuenta como venta. Ahora todos
// llaman a `mapMeliStatus` —espejo de `vtex-status.ts`— directamente.
import { mapMeliStatus } from "@/lib/meli-status";

const ML_API = "https://api.mercadolibre.com";
const WINDOW_DAYS = 7;
const PAGE_SIZE = 50;          // MELI max por page
const ML_OFFSET_MAX = 1000;    // MELI hard limit (después de eso requiere scroll_id)
const PAGES_PER_CHUNK = 10;    // 10 × 50 = 500 órdenes/chunk (conservador vs timeout Vercel)
const ENRICH_CONCURRENCY = 5;  // upserts Customer + Products + Items en paralelo (pool Postgres = 8)

async function mlGetWithRetry(path: string, token: string): Promise<any> {
  return retryWithBackoff(
    async () => {
      const res = await fetch(`${ML_API}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const body = await res.text();
        const err: any = new Error(`ML ${res.status}: ${body.slice(0, 200)}`);
        err.status = res.status;
        throw err;
      }
      return res.json();
    },
    {
      attempts: 5,
      baseMs: 400,
      capMs: 15_000,
      shouldRetry: (err: any) => {
        // Retryable: 408, 429, 5xx. No retryable: 4xx (bad data, auth)
        if (!err.status) return true; // network error → retry
        return isRetryableStatus(err.status);
      },
    }
  );
}

/**
 * Upsert de una orden ML en la tabla `orders` con GUARD de idempotencia.
 * - Si la orden no existe → INSERT
 * - Si existe y viene más nueva → UPDATE
 * - Si existe y viene más vieja/igual → NO-OP (idempotente)
 *
 * Esto hace que webhooks y cron puedan correr en paralelo sin race
 * condition: siempre gana el update más reciente por externalUpdatedAt.
 */
async function upsertMlOrder(orgId: string, order: any) {
  return persistMlOrder(orgId, order, mapMeliStatus(order.status, order.tags));
}

/**
 * Pre-query: devuelve por externalId la identidad, versión externa y versión
 * enriquecida de las órdenes
 * que YA existen en DB para este org + platform + list de IDs dado.
 *
 * El caller usa esto para saber cuáles ya tenemos actualizados y
 * evitar upserts redundantes sin omitir enriquecimientos interrumpidos.
 */
async function getExistingOrderMap(
  orgId: string,
  externalIds: string[]
): Promise<Map<string, { id: string; externalUpdatedAt: Date | null; backfillEnrichedVersion: Date | null }>> {
  if (externalIds.length === 0) return new Map();
  const rows: any[] = await prisma.$queryRawUnsafe(
    `
    SELECT id, "externalId", "externalUpdatedAt", "backfillEnrichedVersion"
    FROM "orders"
    WHERE "organizationId" = $1
      AND "source" = 'MELI'
      AND "externalId" = ANY($2::text[])
    `,
    orgId, externalIds
  );
  const m = new Map();
  for (const r of rows) m.set(r.externalId, r);
  return m;
}

/**
 * Mapea el status de MELI al enum interno OrderStatus.
 * ML: "confirmed" | "payment_required" | "payment_in_process" | "paid" |
 *     "partially_paid" | "shipped" | "delivered" | "cancelled" | "invalid"
 *
 * Valores válidos del enum OrderStatus en Prisma:
 *   PENDING, APPROVED, INVOICED, SHIPPED, DELIVERED, CANCELLED, RETURNED
 * (NO existe "PAID" — usar APPROVED o DELIVERED según tags.)
 */

// ══════════════════════════════════════════════════════════════
// Main processor
// ══════════════════════════════════════════════════════════════

export async function processMercadoLibreChunk(job: any): Promise<ChunkResult> {
  const orgId = job.organizationId as string;
  const fromDate = new Date(job.fromDate);
  const toDate = new Date(job.toDate);

  // Token + mlUserId
  let token: string;
  let mlUserId: number;
  try {
    const auth = await getSellerToken(orgId);
    token = auth.token;
    mlUserId = auth.mlUserId;
  } catch (err: any) {
    return {
      itemsProcessed: 0,
      newCursor: job.cursor || {},
      isComplete: false,
      error: `ML credentials error: ${err.message}`,
    };
  }

  // Cursor: {windowEnd, windowStart, offset}
  let cursor = job.cursor && job.cursor.windowEnd
    ? { ...job.cursor }
    : {
        windowEnd: toDate.toISOString(),
        windowStart: new Date(Math.max(
          fromDate.getTime(),
          toDate.getTime() - WINDOW_DAYS * 24 * 3600 * 1000
        )).toISOString(),
        offset: 0,
      };

  let totalProcessed = 0;
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  for (let pageCount = 0; pageCount < PAGES_PER_CHUNK; pageCount++) {
    const windowStartIso = cursor.windowStart;
    const windowEndIso = cursor.windowEnd;
    const offset = cursor.offset;

    // 1. Fetch página de /orders/search dentro de la ventana actual
    const url =
      `/orders/search?seller=${mlUserId}` +
      `&order.date_created.from=${encodeURIComponent(windowStartIso)}` +
      `&order.date_created.to=${encodeURIComponent(windowEndIso)}` +
      `&limit=${PAGE_SIZE}&offset=${offset}` +
      `&sort=date_desc`;

    let data: any;
    try {
      data = await mlGetWithRetry(url, token);
    } catch (err: any) {
      return {
        itemsProcessed: totalProcessed,
        newCursor: cursor,
        isComplete: false,
        error: `ML fetch failed: ${err.message}`,
      };
    }

    const results: any[] = data?.results;
    const total = data?.paging?.total;
    if (!Array.isArray(results) || !Number.isSafeInteger(total) || total < 0) {
      return { itemsProcessed: totalProcessed, newCursor: cursor, isComplete: false, error: "Respuesta de órdenes ML inválida" };
    }

    // Search is descending: finish the NEWER half first, then the normal
    // backwards advance covers everything before its start. Keeping only the
    // older half discards recent orders that did not fit in the first 1000.
    // Split before persisting a probe page, and use exact durations so peaks
    // within a day can also be subdivided. The full cursor survives a restart.
    if (total > ML_OFFSET_MAX) {
      if (cursor.retryEnrichmentIds?.length) return { itemsProcessed: totalProcessed, newCursor: cursor, isComplete: false, error: "La ventana ML cambió con enriquecimientos pendientes; requiere reconciliación" };
      const startMs = new Date(windowStartIso).getTime();
      const endMs = new Date(windowEndIso).getTime();
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs - startMs <= 0) {
        return {
          itemsProcessed: totalProcessed,
          newCursor: cursor,
          isComplete: false,
          error: `ML window ${windowStartIso}..${windowEndIso} exceeds ${ML_OFFSET_MAX} orders and cannot be subdivided safely; manual recovery required.`,
        };
      }
      cursor = {
        windowStart: new Date(startMs + Math.floor((endMs - startMs) / 2) + 1).toISOString(),
        windowEnd: windowEndIso,
        offset: 0,
      };
      continue;
    }

    // 2. Si la ventana está vacía, avanzar a la ventana anterior
    if (results.length < Math.min(PAGE_SIZE, Math.max(0, total - offset))) {
      return { itemsProcessed: totalProcessed, newCursor: cursor, isComplete: false, error: "Página ML incompleta respecto del total" };
    }
    if (results.length === 0) {
      const newWindowEnd = new Date(Date.parse(windowStartIso) - 1);
      const newWindowStart = new Date(Math.max(
        fromDate.getTime(),
        newWindowEnd.getTime() - WINDOW_DAYS * 24 * 3600 * 1000
      ));
      // Si ya cubrimos todo el rango, complete
      if (Date.parse(windowStartIso) <= fromDate.getTime()) {
        return {
          itemsProcessed: totalProcessed,
          newCursor: cursor,
          isComplete: true,
          totalEstimate: totalProcessed,
        };
      }
      cursor = {
        windowEnd: newWindowEnd.toISOString(),
        windowStart: newWindowStart.toISOString(),
        offset: 0,
      };
      continue;
    }

    // 3. Pre-query: ¿cuáles de estos IDs ya tenemos actualizados?
    const idsInPage = results.map(o => String(o.id));
    const existingMap = await getExistingOrderMap(orgId, idsInPage);

    // 4. Filtrar: solo upsertar los que están desactualizados o son nuevos
    const toUpsert = results.filter(o => {
      const existingUpdatedAt = existingMap.get(String(o.id))?.externalUpdatedAt;
      if (!existingUpdatedAt) return true; // no existe → insertar
      const newUpdatedAt = o.last_updated ? new Date(o.last_updated) : null;
      if (!newUpdatedAt) return true; // sin fecha nueva → ir igual (el guard en DB dedupa)
      return newUpdatedAt.getTime() > existingUpdatedAt.getTime();
    });

    totalSkipped += results.length - toUpsert.length;

    // 5. Upsert secuencial (concurrency 1 para evitar saturar pool de 8)
    // Podríamos paralelizar con withConcurrency pero para 50 órdenes/page
    // el beneficio es marginal y complica el manejo de errores.
    let failedInPage = 0;
    // Orders que necesitan enrichment (inserted/updated + payload original para items)
    const toEnrich: Array<{ dbOrderId: string; mlOrder: any }> = [];
    for (const order of toUpsert) {
      try {
        const result = await upsertMlOrder(orgId, order);
        if (result.action === "inserted") totalInserted++;
        else if (result.action === "updated") totalUpdated++;
        else totalSkipped++;
        // Solo enriquecer si el upsert hizo algo Y tenemos el dbOrderId
        if (result.dbOrderId && result.action !== "skipped") {
          toEnrich.push({ dbOrderId: result.dbOrderId, mlOrder: order });
        }
      } catch (err: any) {
        failedInPage++;
        console.error(`[ml-processor] upsert failed for order ${order.id} status=${order.status}:`, err.message);
        // Continue con los otros, no fallar todo el chunk
      }
    }

    // Recover even after process death BEFORE saving retry IDs in the cursor.
    // The marker lives with the order and is invalidated atomically by an update.
    for (const order of results) {
      const existing = existingMap.get(String(order.id));
      if (!existing || toEnrich.some(e => String(e.mlOrder.id) === String(order.id))) continue;
      const payloadVersion = new Date(order.last_updated || order.date_created).getTime();
      const storedVersion = existing.externalUpdatedAt ? new Date(existing.externalUpdatedAt).getTime() : 0;
      const enrichedVersion = existing.backfillEnrichedVersion ? new Date(existing.backfillEnrichedVersion).getTime() : null;
      if (Number.isFinite(payloadVersion) && storedVersion <= payloadVersion && enrichedVersion !== payloadVersion) {
        toEnrich.push({ dbOrderId: existing.id, mlOrder: order });
      }
    }

    // Retomar enrichments que fallaron después de guardar la orden básica.
    // El guard de versiones del upsert no debe hacerlos desaparecer al reintentar.
    const retryIds: string[] = Array.isArray(cursor.retryEnrichmentIds) ? cursor.retryEnrichmentIds : [];
    if (retryIds.length) {
      if (retryIds.some(id => !idsInPage.includes(id))) {
        return { itemsProcessed: totalProcessed, newCursor: cursor, isComplete: false, error: "La página ML cambió y faltan órdenes pendientes de enriquecimiento" };
      }
      const retryRows: any[] = await prisma.$queryRawUnsafe(
        `SELECT id, "externalId", "externalUpdatedAt" FROM orders WHERE "organizationId" = $1 AND source = 'MELI' AND "externalId" = ANY($2::text[])`, orgId, retryIds);
      for (const id of retryIds) {
        const row = retryRows.find(r => r.externalId === id);
        const order = results.find(o => String(o.id) === id);
        if (!row) return { itemsProcessed: totalProcessed, newCursor: cursor, isComplete: false, error: "No se encontró una orden ML pendiente de enriquecimiento" };
        const storedTime = row.externalUpdatedAt ? new Date(row.externalUpdatedAt).getTime() : 0;
        const payloadTime = new Date(order.last_updated || order.date_created).getTime();
        if (!Number.isFinite(payloadTime)) return { itemsProcessed: totalProcessed, newCursor: cursor, isComplete: false, error: "Fecha ML inválida" };
        // Una versión posterior ya puede tener detalles más nuevos: no reescribirla con el payload viejo.
        if (storedTime <= payloadTime && !toEnrich.some(e => String(e.mlOrder.id) === id)) toEnrich.push({ dbOrderId: row.id, mlOrder: order });
      }
    }
    const failedEnrichment: string[] = [];
    // 5b. Enriquecer en paralelo (customer + products + items desde el payload ML)
    //     S58 F2.3: pasamos el token para que enrichOrderFromMl pueda llamar
    //     /shipments/{id} cuando la direccion NO viene en /orders/search (caso
    //     normal). Eso completa city/state/country del Customer.
    //     Un fallo conserva IDs pendientes en el cursor para no perder el enriquecimiento.
    if (toEnrich.length > 0) {
      await withConcurrency(
        ENRICH_CONCURRENCY,
        toEnrich.map((e) => async () => {
          try {
            const enriched = await enrichOrderFromMl(e.dbOrderId, orgId, e.mlOrder, token);
            if (!enriched) failedEnrichment.push(String(e.mlOrder.id));
            else {
              const version = new Date(e.mlOrder.last_updated || e.mlOrder.date_created);
              const marked = await prisma.$queryRawUnsafe(
                `UPDATE orders SET "backfillEnrichedVersion" = $3::timestamptz
                 WHERE id = $1 AND "organizationId" = $2 AND source = 'MELI'
                   AND "externalUpdatedAt" = $3::timestamptz RETURNING id`, e.dbOrderId, orgId, version);
              if (!marked.length) failedEnrichment.push(String(e.mlOrder.id));
            }
          } catch (err: any) {
            failedEnrichment.push(String(e.mlOrder.id));
            console.warn("[ml-processor] enrichment failed");
          }
        }),
      );
    }
    // Incluso un solo fallo debe conservar la página: avanzar lo omite para siempre.
    if (failedInPage > 0 || failedEnrichment.length > 0) {
      return {
        itemsProcessed: totalProcessed,
        newCursor: { ...cursor, retryEnrichmentIds: failedEnrichment },
        isComplete: false,
        error: `${failedInPage} upserts y ${failedEnrichment.length} enriquecimientos fallaron; se reintentará la misma página ML.`,
      };
    }

    // 6. Avanzar cursor
    delete cursor.retryEnrichmentIds;
    totalProcessed += results.length;

    const ventanaAgotada = offset + results.length >= total;

    // ¿Terminamos la página actual?
    if (ventanaAgotada) {
      // Esta ventana se agotó de verdad. Mover a la ventana anterior.
      const newWindowEnd = new Date(Date.parse(windowStartIso) - 1);
      const newWindowStart = new Date(Math.max(
        fromDate.getTime(),
        newWindowEnd.getTime() - WINDOW_DAYS * 24 * 3600 * 1000
      ));
      if (Date.parse(windowStartIso) <= fromDate.getTime()) {
        return {
          itemsProcessed: totalProcessed,
          newCursor: cursor,
          isComplete: true,
          totalEstimate: totalProcessed,
        };
      }
      cursor = {
        windowEnd: newWindowEnd.toISOString(),
        windowStart: newWindowStart.toISOString(),
        offset: 0,
      };
    } else {
      // Hay más páginas en esta ventana, avanzar offset
      cursor = { ...cursor, offset: offset + PAGE_SIZE };
    }
  }

  console.log(
    `[ml-processor] chunk done: ${totalProcessed} processed ` +
    `(${totalInserted} new, ${totalUpdated} updated, ${totalSkipped} skipped/unchanged)`
  );

  return {
    itemsProcessed: totalProcessed,
    newCursor: cursor,
    isComplete: false, // hay más ventanas por procesar, el runner llama de nuevo
    totalEstimate: undefined,
  };
}
