// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/cron/ml-reconcile
// ══════════════════════════════════════════════════════════════
// Capa 3 del sync de ML: reconciliación incremental.
//
// Corre cada 2hs. Chequea órdenes con last_updated en las últimas
// N horas (ventana adaptativa desde lastSuccessfulSyncAt) usando el
// cursor persistente en sync_watermarks.
//
// Estrategia C++:
//  1. Watermark con overlap de 5 min (absorbe clock skew)
//  2. Pre-query de IDs en DB antes de escribir (ahorra writes)
//  3. Upsert con guard externalUpdatedAt (idempotente vs webhook)
//  4. Usa payload de /orders/search directo (no segundo GET)
//
// Diferencia vs missed_feeds: missed_feeds trae SOLO los que ML
// marcó como "entrega fallida". Reconcile trae TODAS las
// actualizadas (aunque los webhooks hayan llegado), para captura
// casos donde el webhook sí llegó pero nuestro procesamiento
// falló silenciosamente.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { getSellerToken } from "@/lib/connectors/mercadolibre-seller";
import { retryWithBackoff, isRetryableStatus } from "@/lib/sync/retry";
import { withConcurrency } from "@/lib/sync/concurrency";
import { orgJitter, sleep } from "@/lib/sync/jitter";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CRON_KEY = "nitrosales-secret-key-2024-production";
const ML_API = "https://api.mercadolibre.com";

// Overlap: siempre consultamos desde (watermark - 5 min) para absorber clock skew
const WATERMARK_OVERLAP_MS = 5 * 60 * 1000;

// Jitter scatter: 10 min (para cron que corre cada 2h)
const JITTER_WINDOW_MS = 10 * 60 * 1000;

// Máximo default: 2 horas hacia atrás si no hay watermark (bootstrap)
const DEFAULT_LOOKBACK_MS = 2 * 60 * 60 * 1000;

// Safety cap: no retroceder más de 7 días aunque watermark esté viejo
const MAX_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

const PAGE_SIZE = 50;

async function mlGet(path: string, token: string): Promise<any> {
  return retryWithBackoff(
    async () => {
      const res = await fetch(`${ML_API}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err: any = new Error(`ML ${res.status}: ${(await res.text()).slice(0, 200)}`);
        err.status = res.status;
        throw err;
      }
      return res.json();
    },
    {
      attempts: 4, baseMs: 500, capMs: 10_000,
      shouldRetry: (err: any) => !err.status || isRetryableStatus(err.status),
    }
  );
}

function mapMlStatus(mlStatus: string, tags?: string[]): string {
  // Enum OrderStatus en Prisma: PENDING, APPROVED, INVOICED, SHIPPED, DELIVERED, CANCELLED, RETURNED
  // (NO existe "PAID")
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

async function upsertOrderWithGuard(orgId: string, order: any): Promise<"inserted" | "updated" | "skipped"> {
  const externalId = String(order.id);
  const packId = order.pack_id ? String(order.pack_id) : null;
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

  const rows: any[] = await prisma.$queryRawUnsafe(
    `
    INSERT INTO "orders" (
      "id","externalId","packId","status","totalValue","currency","itemCount",
      "source","paymentMethod","marketplaceFee",
      "orderDate","externalUpdatedAt","organizationId","createdAt","updatedAt"
    )
    VALUES (
      gen_random_uuid()::text,$1,$2,$3::"OrderStatus",$4,$5,$6,
      'MELI',$7,$8,$9,$10,$11,NOW(),NOW()
    )
    ON CONFLICT ("organizationId","externalId")
    DO UPDATE SET
      "packId"=EXCLUDED."packId",
      "status"=EXCLUDED."status","totalValue"=EXCLUDED."totalValue",
      "currency"=EXCLUDED."currency","itemCount"=EXCLUDED."itemCount",
      "paymentMethod"=EXCLUDED."paymentMethod","marketplaceFee"=EXCLUDED."marketplaceFee",
      "externalUpdatedAt"=EXCLUDED."externalUpdatedAt","updatedAt"=NOW()
    WHERE "orders"."externalUpdatedAt" IS NULL
       OR "orders"."externalUpdatedAt" < EXCLUDED."externalUpdatedAt"
    RETURNING xmax = 0 AS "inserted"
    `,
    externalId, packId, status, total, currency, itemCount,
    paymentMethod, marketplaceFee,
    orderDate, externalUpdatedAt, orgId
  );
  if (rows.length === 0) return "skipped";
  return rows[0].inserted ? "inserted" : "updated";
}

async function getExistingMap(orgId: string, ids: string[]): Promise<Map<string, Date | null>> {
  if (ids.length === 0) return new Map();
  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT "externalId","externalUpdatedAt" FROM "orders"
     WHERE "organizationId"=$1 AND "source"='MELI' AND "externalId"=ANY($2::text[])`,
    orgId, ids
  );
  const m = new Map<string, Date | null>();
  for (const r of rows) m.set(r.externalId, r.externalUpdatedAt);
  return m;
}

/** Reconciliación incremental para una org. */
async function reconcileOrg(orgId: string, layer: "incremental" | "deep", lookbackMs: number): Promise<any> {
  const stats = { orgId, layer, fetched: 0, inserted: 0, updated: 0, skipped: 0, errors: 0 };

  let token: string, mlUserId: number;
  try {
    const auth = await getSellerToken(orgId);
    token = auth.token;
    mlUserId = auth.mlUserId;
  } catch (err: any) {
    console.warn(`[ml-reconcile/${layer}] ${orgId}: no token`);
    return { ...stats, error: err.message };
  }

  // Watermark: desde (lastSuccessfulSyncAt - 5min overlap) o (now - lookback)
  const wmRows: any[] = await prisma.$queryRawUnsafe(
    `SELECT "lastSuccessfulSyncAt" FROM "sync_watermarks"
     WHERE "organizationId"=$1 AND "platform"='MERCADOLIBRE' AND "syncLayer"=$2`,
    orgId, layer
  );
  const now = new Date();
  let from: Date;
  if (wmRows.length > 0 && wmRows[0].lastSuccessfulSyncAt) {
    from = new Date(wmRows[0].lastSuccessfulSyncAt.getTime() - WATERMARK_OVERLAP_MS);
    // Safety: no retroceder más de lookbackMs aunque el watermark diga lo contrario
    const maxBack = new Date(now.getTime() - lookbackMs);
    if (from < maxBack) from = maxBack;
  } else {
    from = new Date(now.getTime() - lookbackMs);
  }

  // Paginar con filtro date_last_updated.from=X&to=now (capta mutaciones)
  let offset = 0;
  const fromIso = from.toISOString();
  const toIso = now.toISOString();

  while (offset < 1000) {
    let data: any;
    try {
      data = await mlGet(
        `/orders/search?seller=${mlUserId}` +
        `&order.date_last_updated.from=${encodeURIComponent(fromIso)}` +
        `&order.date_last_updated.to=${encodeURIComponent(toIso)}` +
        `&limit=${PAGE_SIZE}&offset=${offset}&sort=date_asc`,
        token
      );
    } catch (err: any) {
      stats.errors++;
      break;
    }

    const results: any[] = data.results || [];
    if (results.length === 0) break;
    stats.fetched += results.length;

    // Pre-query: cuáles ya tenemos actualizados?
    const ids = results.map(o => String(o.id));
    const existing = await getExistingMap(orgId, ids);

    // Filtrar: solo los que cambiaron
    const toUpsert = results.filter(o => {
      const curr = existing.get(String(o.id));
      if (!curr) return true;
      const nu = o.last_updated ? new Date(o.last_updated) : null;
      if (!nu) return true;
      return nu.getTime() > curr.getTime();
    });
    stats.skipped += results.length - toUpsert.length;

    for (const o of toUpsert) {
      try {
        const act = await upsertOrderWithGuard(orgId, o);
        if (act === "inserted") stats.inserted++;
        else if (act === "updated") stats.updated++;
        else stats.skipped++;
      } catch (err: any) {
        stats.errors++;
      }
    }

    if (results.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  // Watermark update
  await prisma.$executeRawUnsafe(
    `INSERT INTO "sync_watermarks" ("organizationId","platform","syncLayer","lastSuccessfulSyncAt","lastRunAt","lastRunStatus","metadata")
     VALUES ($1,'MERCADOLIBRE',$2,$3::timestamptz,NOW(),'ok',$4::jsonb)
     ON CONFLICT ("organizationId","platform","syncLayer")
     DO UPDATE SET "lastSuccessfulSyncAt"=$3::timestamptz,"lastRunAt"=NOW(),"lastRunStatus"='ok',"metadata"=$4::jsonb,"updatedAt"=NOW()`,
    orgId, layer, now, JSON.stringify(stats)
  );

  return stats;
}

export async function GET(req: NextRequest) {
  const start = Date.now();
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const mode = (url.searchParams.get("mode") === "deep" ? "deep" : "incremental") as "incremental" | "deep";
  const ok = key === CRON_KEY ? true : await isInternalUser();
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // incremental: 2h típico (max 7 días de lookback safety)
  // deep: 30 días (captura refunds tardíos)
  const lookbackMs = mode === "deep"
    ? 30 * 24 * 60 * 60 * 1000
    : DEFAULT_LOOKBACK_MS;

  const connections = await prisma.connection.findMany({
    where: { platform: "MERCADOLIBRE" as any, status: "ACTIVE" as any },
    select: { organizationId: true },
  });

  const tasks = connections.map(c => async () => {
    await sleep(orgJitter(c.organizationId, JITTER_WINDOW_MS));
    return await reconcileOrg(c.organizationId, mode, Math.max(lookbackMs, MAX_LOOKBACK_MS));
  });

  const results = await withConcurrency(5, tasks);

  const totals = {
    mode,
    orgs: results.length,
    fetched: results.reduce((s: number, r: any) => s + (r.fetched || 0), 0),
    inserted: results.reduce((s: number, r: any) => s + (r.inserted || 0), 0),
    updated: results.reduce((s: number, r: any) => s + (r.updated || 0), 0),
    skipped: results.reduce((s: number, r: any) => s + (r.skipped || 0), 0),
    errors: results.reduce((s: number, r: any) => s + (r.errors || 0), 0),
    durationMs: Date.now() - start,
  };

  console.log(`[ml-reconcile/${mode}] totals:`, totals);
  return NextResponse.json({ ok: true, totals, perOrg: results });
}
