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

import { ADMIN_API_KEY } from "@/lib/admin-key";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { getSellerToken } from "@/lib/connectors/mercadolibre-seller";
import { retryWithBackoff, isRetryableStatus } from "@/lib/sync/retry";
import { withConcurrency } from "@/lib/sync/concurrency";
import { orgJitter, sleep } from "@/lib/sync/jitter";
// E-30. Acá vivía una de las SIETE copias del mapeo de estados de MELI, en
// dos familias que no coincidían: `confirmed` era APPROVED en cinco y
// PENDING en dos, y eso decide si la orden cuenta como venta. Ahora todos
// llaman a `mapMeliStatus` —espejo de `vtex-status.ts`— directamente.
import { ingestMlOrder } from "@/lib/connectors/ml-order-ingestion";
import { mapMeliStatus } from "@/lib/meli-status";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CRON_KEY = ADMIN_API_KEY;
const ML_API = "https://api.mercadolibre.com";

// Overlap: siempre consultamos desde (watermark - 5 min) para absorber clock skew
const WATERMARK_OVERLAP_MS = 5 * 60 * 1000;

// Small scatter within the request budget; never sleep longer than maxDuration.
const JITTER_WINDOW_MS = 1000;

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
        signal: AbortSignal.timeout(15000),
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


async function upsertOrderWithGuard(orgId: string, order: any, token: string): Promise<"inserted" | "updated" | "skipped"> {
  return (await ingestMlOrder(orgId, order, mapMeliStatus(order.status, order.tags), token)).action;
}

async function getExistingMap(orgId: string, ids: string[]): Promise<Map<string, any>> {
  if (ids.length === 0) return new Map();
  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT "externalId","externalUpdatedAt","backfillEnrichedVersion" FROM "orders"
     WHERE "organizationId"=$1 AND "source"='MELI' AND "externalId"=ANY($2::text[])`,
    orgId, ids
  );
  const m = new Map<string, any>();
  for (const r of rows) m.set(r.externalId, r);
  return m;
}

/** Reconciliación incremental para una org. */
async function reconcileOrg(orgId: string, layer: "incremental" | "deep", lookbackMs: number, deadline: number): Promise<any> {
  const stats = { orgId, layer, fetched: 0, inserted: 0, updated: 0, skipped: 0, errors: 0 };

  let token: string, mlUserId: number;
  try {
    const auth = await getSellerToken(orgId);
    token = auth.token;
    mlUserId = auth.mlUserId;
  } catch (err: any) {
    console.warn(`[ml-reconcile/${layer}] ${orgId}: no token`);
    return { ...stats, errors: 1, error: "ML token unavailable" };
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
    // Never silently discard an unprocessed interval after a prolonged failure.
  } else {
    from = new Date(now.getTime() - lookbackMs);
  }

  // Paginar con filtro date_last_updated.from=X&to=now (capta mutaciones)
  const windows = [{ from: from.getTime(), to: now.getTime() }];
  let requests = 0;
  while (windows.length && stats.errors === 0) {
    const window = windows.pop()!;
    let offset = 0;
    let expectedTotal: number | undefined;
    const fromIso = new Date(window.from).toISOString();
    const toIso = new Date(window.to).toISOString();
    while (offset < 1000) {
    if (++requests > 100 || Date.now() >= deadline) { stats.errors++; break; }
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

    const results = data?.results;
    const total = data?.paging?.total;
    // A truncated/invalid search is incomplete, never a successful empty scan.
    if (!Array.isArray(results) || !Number.isSafeInteger(total) || total < 0 ||
        results.length !== Math.min(PAGE_SIZE, Math.max(0, total - offset)) ||
        results.some(o => !o?.id || !Number.isFinite(new Date(o.last_updated || o.date_created).getTime()))) {
      stats.errors++;
      break;
    }
    if (expectedTotal !== undefined && expectedTotal !== total) { stats.errors++; break; }
    if (total > 1000) {
      if (window.from >= window.to) { stats.errors++; break; }
      const mid = window.from + Math.floor((window.to - window.from) / 2);
      windows.push({ from: window.from, to: mid }, { from: mid + 1, to: window.to });
      break;
    }
    expectedTotal = total;
    if (results.length === 0) break;
    stats.fetched += results.length;

    // Pre-query: cuáles ya tenemos actualizados?
    const ids = results.map(o => String(o.id));
    const existing = await getExistingMap(orgId, ids);

    // Filtrar: solo los que cambiaron
    const toUpsert = results.filter(o => {
      const saved = existing.get(String(o.id));
      if (!saved?.externalUpdatedAt) return true;
      const next = new Date(o.last_updated || o.date_created).getTime();
      const current = new Date(saved.externalUpdatedAt).getTime();
      return next > current || (next === current && (!saved.backfillEnrichedVersion || new Date(saved.backfillEnrichedVersion).getTime() !== next));
    });
    stats.skipped += results.length - toUpsert.length;

    for (const o of toUpsert) {
      if (Date.now() >= deadline) { stats.errors++; break; }
      try {
        const act = await upsertOrderWithGuard(orgId, o, token);
        if (act === "inserted") stats.inserted++;
        else if (act === "updated") stats.updated++;
        else stats.skipped++;
      } catch (err: any) {
        stats.errors++;
      }
    }

    if (offset + results.length >= total) break;
    offset += PAGE_SIZE;
    }
  }

  // A failed run must retain its previous successful boundary for retry.
  if (stats.errors > 0) return stats;

  // Watermark update (older concurrent completions cannot move it backwards).
  await prisma.$executeRawUnsafe(
    `INSERT INTO "sync_watermarks" ("organizationId","platform","syncLayer","lastSuccessfulSyncAt","lastRunAt","lastRunStatus","metadata")
     VALUES ($1,'MERCADOLIBRE',$2,$3::timestamptz,NOW(),'ok',$4::jsonb)
     ON CONFLICT ("organizationId","platform","syncLayer")
     DO UPDATE SET "lastSuccessfulSyncAt"=GREATEST("sync_watermarks"."lastSuccessfulSyncAt", $3::timestamptz),"lastRunAt"=NOW(),"lastRunStatus"='ok',"metadata"=$4::jsonb,"updatedAt"=NOW()`,
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
    return await reconcileOrg(c.organizationId, mode, Math.max(lookbackMs, MAX_LOOKBACK_MS), start + 180_000);
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
  return NextResponse.json({ ok: totals.errors === 0, totals, perOrg: results });
}
