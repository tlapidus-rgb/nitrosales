// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/cron/ml-missed-feeds
// ══════════════════════════════════════════════════════════════
// Capa 2 del sync de ML: rescate de webhooks perdidos.
//
// MELI mantiene los webhooks fallidos en /missed_feeds por 2 días.
// Corremos este cron cada 30 min para recuperar eventos que ML no
// pudo entregar (nuestro endpoint caído, timeout, etc).
//
// Por cada connection ML activa:
//  1. GET /missed_feeds?app_id=X&topic=orders_v2
//  2. Para cada missed feed → simular processing del webhook
//     (mismo flujo que el handler normal con outbox dedup)
//  3. Actualizar watermark
//
// Escalabilidad:
//  - Jitter determinístico por orgId para distribuir carga
//  - withConcurrency(5) si hay muchas orgs
//  - Idempotencia garantizada por el outbox dedup
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { getSellerToken } from "@/lib/connectors/mercadolibre-seller";
import { processMLNotification } from "@/lib/connectors/ml-notification-processor";
import { retryWithBackoff, isRetryableStatus } from "@/lib/sync/retry";
import { withConcurrency } from "@/lib/sync/concurrency";
import { orgJitter, sleep } from "@/lib/sync/jitter";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CRON_KEY = "nitrosales-secret-key-2024-production";
const ML_API = "https://api.mercadolibre.com";

// Jitter scatter total: 5 min (para cron que corre cada 30 min)
const JITTER_WINDOW_MS = 5 * 60 * 1000;

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
      attempts: 4,
      baseMs: 500,
      capMs: 10_000,
      shouldRetry: (err: any) => !err.status || isRetryableStatus(err.status),
    }
  );
}

interface MissedFeed {
  _id: string;
  resource: string;
  user_id: number;
  topic: string;
  application_id: number;
  attempts: number;
  sent: string;
  received: string;
}

async function processOrgMissedFeeds(orgId: string, appId: string): Promise<{
  orgId: string; found: number; processed: number; skipped: number; errors: number;
}> {
  const stats = { orgId, found: 0, processed: 0, skipped: 0, errors: 0 };

  let token: string;
  try {
    const auth = await getSellerToken(orgId);
    token = auth.token;
  } catch (err: any) {
    console.warn(`[ml-missed-feeds] ${orgId}: no token (${err.message})`);
    return stats;
  }

  // Topics que nos interesan
  const topics = ["orders_v2", "items", "questions", "payments", "shipments"];

  for (const topic of topics) {
    let offset = 0;
    const limit = 50;

    while (true) {
      let data: any;
      try {
        data = await mlGet(
          `/missed_feeds?app_id=${appId}&topic=${topic}&limit=${limit}&offset=${offset}`,
          token
        );
      } catch (err: any) {
        console.warn(`[ml-missed-feeds] ${orgId} topic=${topic}: ${err.message}`);
        stats.errors++;
        break;
      }

      const feeds: MissedFeed[] = data.missed_feeds || data.results || [];
      if (feeds.length === 0) break;

      stats.found += feeds.length;

      for (const feed of feeds) {
        try {
          // Dedup via outbox: insertar, si P2002 skip, si nuevo procesar
          await prisma.$executeRawUnsafe(
            `INSERT INTO "meli_webhook_events" (
              "id","organizationId","externalId","resource","topic",
              "meliUserId","meliSentAt","meliReceivedAt","createdAt"
            ) VALUES (
              gen_random_uuid()::text,$1,$2,$3,$4,$5,$6::timestamptz,$7::timestamptz,NOW()
            )`,
            orgId, feed._id, feed.resource, feed.topic,
            feed.user_id, feed.sent, feed.received
          );

          // Nuevo → procesar
          await processMLNotification(feed as any);
          await prisma.$executeRawUnsafe(
            `UPDATE "meli_webhook_events" SET "processed"=true, "processedAt"=NOW()
             WHERE "organizationId"=$1 AND "externalId"=$2`,
            orgId, feed._id
          );
          stats.processed++;
        } catch (err: any) {
          const msg = String(err?.message || "");
          if (msg.includes("duplicate key") || msg.includes("unique") || err?.code === "P2002") {
            stats.skipped++;
          } else {
            console.error(`[ml-missed-feeds] ${orgId} ${feed._id}: ${msg}`);
            stats.errors++;
          }
        }
      }

      if (feeds.length < limit) break;
      offset += limit;
      if (offset >= 500) break; // Safety cap
    }
  }

  // Watermark update
  await prisma.$executeRawUnsafe(
    `INSERT INTO "sync_watermarks" ("organizationId","platform","syncLayer","lastSuccessfulSyncAt","lastRunAt","lastRunStatus","metadata")
     VALUES ($1,'MERCADOLIBRE','missed_feeds',NOW(),NOW(),'ok',$2::jsonb)
     ON CONFLICT ("organizationId","platform","syncLayer")
     DO UPDATE SET "lastSuccessfulSyncAt"=NOW(),"lastRunAt"=NOW(),"lastRunStatus"='ok',"metadata"=$2::jsonb,"updatedAt"=NOW()`,
    orgId, JSON.stringify(stats)
  );

  return stats;
}

export async function GET(req: NextRequest) {
  const start = Date.now();
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const ok = key === CRON_KEY ? true : await isInternalUser();
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Listar todas las orgs con conexión ML activa
  const connections = await prisma.connection.findMany({
    where: { platform: "MERCADOLIBRE" as any, status: "ACTIVE" as any },
    select: { organizationId: true, credentials: true },
  });

  // Procesar orgs con concurrency 5, con jitter scatter para no saturar
  const tasks = connections.map(c => async () => {
    const creds = c.credentials as any;
    const appId = creds?.appId;
    if (!appId) {
      return { orgId: c.organizationId, found: 0, processed: 0, skipped: 0, errors: 1, error: "no appId" };
    }
    // Scatter jitter determinístico
    await sleep(orgJitter(c.organizationId, JITTER_WINDOW_MS));
    return await processOrgMissedFeeds(c.organizationId, appId);
  });

  const results = await withConcurrency(5, tasks);

  const totals = {
    orgs: results.length,
    found: results.reduce((s, r) => s + r.found, 0),
    processed: results.reduce((s, r) => s + r.processed, 0),
    skipped: results.reduce((s, r) => s + r.skipped, 0),
    errors: results.reduce((s, r) => s + r.errors, 0),
    durationMs: Date.now() - start,
  };

  console.log(`[ml-missed-feeds] totals:`, totals);

  return NextResponse.json({ ok: true, totals, perOrg: results });
}
