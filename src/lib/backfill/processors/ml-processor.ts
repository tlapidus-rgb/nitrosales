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

import { prisma } from "@/lib/db/client";
import { getSellerToken } from "@/lib/connectors/mercadolibre-seller";
import { retryWithBackoff, isRetryableStatus } from "@/lib/sync/retry";
import type { ChunkResult } from "../types";

const ML_API = "https://api.mercadolibre.com";
const WINDOW_DAYS = 7;
const PAGE_SIZE = 50;          // MELI max por page
const ML_OFFSET_MAX = 1000;    // MELI hard limit (después de eso requiere scroll_id)
const PAGES_PER_CHUNK = 10;    // 10 × 50 = 500 órdenes/chunk (conservador vs timeout Vercel)

async function mlGetWithRetry(path: string, token: string): Promise<any> {
  return retryWithBackoff(
    async () => {
      const res = await fetch(`${ML_API}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
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
async function upsertMlOrder(orgId: string, order: any): Promise<"inserted" | "updated" | "skipped"> {
  const externalId = String(order.id);
  const packId = order.pack_id ? String(order.pack_id) : null; // dedup de carritos
  const status = mapMlStatus(order.status, order.tags);
  const total = Number(order.total_amount) || 0;
  const currency = order.currency_id || "ARS";
  const itemCount = Array.isArray(order.order_items)
    ? order.order_items.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 0), 0)
    : 0;
  const orderDate = new Date(order.date_created);
  const externalUpdatedAt = order.last_updated ? new Date(order.last_updated) : orderDate;
  const paymentMethod = order.payments?.[0]?.payment_method_id || null;
  const marketplaceFee = order.order_items?.[0]?.sale_fee
    ? order.order_items.reduce((sum: number, it: any) => sum + (Number(it.sale_fee) || 0), 0)
    : null;

  // Raw SQL con ON CONFLICT guard. Usamos el UNIQUE (organizationId, externalId).
  const rows: any[] = await prisma.$queryRawUnsafe(
    `
    INSERT INTO "orders" (
      "id", "externalId", "packId", "status", "totalValue", "currency", "itemCount",
      "source", "paymentMethod", "marketplaceFee",
      "orderDate", "externalUpdatedAt", "organizationId", "createdAt", "updatedAt"
    )
    VALUES (
      gen_random_uuid()::text, $1, $2, $3::"OrderStatus", $4, $5, $6,
      'MELI', $7, $8,
      $9, $10, $11, NOW(), NOW()
    )
    ON CONFLICT ("organizationId", "externalId")
    DO UPDATE SET
      "packId" = EXCLUDED."packId",
      "status" = EXCLUDED."status",
      "totalValue" = EXCLUDED."totalValue",
      "currency" = EXCLUDED."currency",
      "itemCount" = EXCLUDED."itemCount",
      "paymentMethod" = EXCLUDED."paymentMethod",
      "marketplaceFee" = EXCLUDED."marketplaceFee",
      "externalUpdatedAt" = EXCLUDED."externalUpdatedAt",
      "updatedAt" = NOW()
    WHERE
      "orders"."externalUpdatedAt" IS NULL
      OR "orders"."externalUpdatedAt" < EXCLUDED."externalUpdatedAt"
    RETURNING xmax = 0 AS "inserted"
    `,
    externalId, packId, status, total, currency, itemCount,
    paymentMethod, marketplaceFee,
    orderDate, externalUpdatedAt, orgId
  );

  if (rows.length === 0) return "skipped"; // guard blocked update (vino viejo)
  return rows[0].inserted ? "inserted" : "updated";
}

/**
 * Pre-query: devuelve Map<externalId, externalUpdatedAt> de las órdenes
 * que YA existen en DB para este org + platform + list de IDs dado.
 *
 * El caller usa esto para saber cuáles ya tenemos actualizados y
 * skippear el upsert de los que no cambiaron (ahorra writes).
 */
async function getExistingOrderMap(
  orgId: string,
  externalIds: string[]
): Promise<Map<string, Date | null>> {
  if (externalIds.length === 0) return new Map();
  const rows: any[] = await prisma.$queryRawUnsafe(
    `
    SELECT "externalId", "externalUpdatedAt"
    FROM "orders"
    WHERE "organizationId" = $1
      AND "source" = 'MELI'
      AND "externalId" = ANY($2::text[])
    `,
    orgId, externalIds
  );
  const m = new Map<string, Date | null>();
  for (const r of rows) m.set(r.externalId, r.externalUpdatedAt);
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
function mapMlStatus(mlStatus: string, tags?: string[]): string {
  // Si el tag 'delivered' está presente, priorizar DELIVERED
  if (Array.isArray(tags) && tags.includes("delivered")) return "DELIVERED";
  switch (mlStatus) {
    case "paid": return "APPROVED";
    case "shipped": return "SHIPPED";
    case "delivered": return "DELIVERED";
    case "confirmed":
    case "payment_required":
    case "payment_in_process":
    case "partially_paid": return "PENDING";
    case "cancelled":
    case "invalid": return "CANCELLED";
    default: return "PENDING";
  }
}

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

    const results: any[] = data.results || [];
    const total = data.paging?.total || 0;

    // 2. Si la ventana está vacía, avanzar a la ventana anterior
    if (results.length === 0) {
      const newWindowEnd = new Date(windowStartIso);
      const newWindowStart = new Date(Math.max(
        fromDate.getTime(),
        newWindowEnd.getTime() - WINDOW_DAYS * 24 * 3600 * 1000
      ));
      // Si ya cubrimos todo el rango, complete
      if (newWindowEnd.getTime() <= fromDate.getTime()) {
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
      const existingUpdatedAt = existingMap.get(String(o.id));
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
    const firstErrors: string[] = [];
    for (const order of toUpsert) {
      try {
        const action = await upsertMlOrder(orgId, order);
        if (action === "inserted") totalInserted++;
        else if (action === "updated") totalUpdated++;
        else totalSkipped++;
        totalProcessed++;
      } catch (err: any) {
        failedInPage++;
        if (firstErrors.length < 3) firstErrors.push(`${order.id}(${order.status}): ${err.message}`);
        console.error(`[ml-processor] upsert failed for order ${order.id} status=${order.status}:`, err.message);
        // Continue con los otros, no fallar todo el chunk
      }
    }
    // Si >50% de la página falló, abortar chunk con error para que quede trazado
    // en lastError del job (en vez de silenciar el problema).
    if (failedInPage > 0 && failedInPage >= Math.ceil(toUpsert.length / 2)) {
      return {
        itemsProcessed: totalProcessed,
        newCursor: cursor,
        isComplete: false,
        error: `${failedInPage}/${toUpsert.length} upserts fallaron. Primeros: ${firstErrors.join(" | ")}`,
      };
    }

    // 6. Avanzar cursor
    // ¿Terminamos la página actual?
    if (offset + PAGE_SIZE >= total || offset + PAGE_SIZE >= ML_OFFSET_MAX) {
      // Esta ventana se agotó (o choco con el límite de 1000 de MELI).
      // Mover a la ventana anterior.
      const newWindowEnd = new Date(windowStartIso);
      const newWindowStart = new Date(Math.max(
        fromDate.getTime(),
        newWindowEnd.getTime() - WINDOW_DAYS * 24 * 3600 * 1000
      ));
      if (newWindowEnd.getTime() <= fromDate.getTime()) {
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
