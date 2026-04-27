// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/ml-reenrich-fields?orgId=X&limit=N
// ══════════════════════════════════════════════════════════════
// Re-enriquece orders MELI existentes con los campos opcionales que
// el processor backfill viejo NO seteaba (channel, shippingCost,
// deliveryType, postalCode, shippingCarrier) + completa city/state
// del Customer via /shipments cuando estaba vacio.
//
// Hace 1 GET /orders/{id} por orden (refetcha payload fresh) + llama
// enrichOrderFromMl con el token. Concurrency 5 (pool DB = 8).
//
// Idempotente — re-correr no duplica nada (deleteMany+createMany de
// items, upsert de customer/products).
//
// Solo isInternalUser. Usar despues de cambios en enrichOrderFromMl
// para repoblar orders historicas sin reset+backfill completo.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { getSellerToken } from "@/lib/connectors/mercadolibre-seller";
import { enrichOrderFromMl } from "@/lib/connectors/mercadolibre-enrichment";
import { withConcurrency } from "@/lib/sync/concurrency";
import { retryWithBackoff, isRetryableStatus } from "@/lib/sync/retry";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

const ML_API = "https://api.mercadolibre.com";
const KEY = "nitrosales-secret-key-2024-production";
const CONCURRENCY = 5;

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const allowed = key === KEY ? true : await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const orgId = url.searchParams.get("orgId");
    if (!orgId) return NextResponse.json({ error: "orgId requerido" }, { status: 400 });

    const limit = Math.min(parseInt(url.searchParams.get("limit") || "1000"), 5000);

    // Token ML
    let token: string;
    try {
      const auth = await getSellerToken(orgId);
      token = auth.token;
    } catch (err: any) {
      return NextResponse.json({ error: `Sin token ML: ${err.message}` }, { status: 400 });
    }

    // Lista de orders MELI a procesar
    const orders: Array<{ id: string; externalId: string }> = await prisma.$queryRawUnsafe(
      `SELECT "id", "externalId"
       FROM "orders"
       WHERE "organizationId" = $1 AND "source" = 'MELI'
       ORDER BY "orderDate" DESC
       LIMIT $2`,
      orgId, limit
    );

    if (orders.length === 0) {
      return NextResponse.json({
        ok: true,
        orgId,
        message: "No hay orders MELI en esta org.",
        durationMs: Date.now() - t0,
      });
    }

    let enriched = 0;
    let errors = 0;
    const firstErrors: string[] = [];

    await withConcurrency(
      CONCURRENCY,
      orders.map((o) => async () => {
        try {
          // GET /orders/{id} fresh
          const data = await retryWithBackoff(
            async () => {
              const res = await fetch(`${ML_API}/orders/${o.externalId}`, {
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(15000),
              });
              if (!res.ok) {
                const err: any = new Error(`ML ${res.status}`);
                err.status = res.status;
                throw err;
              }
              return res.json();
            },
            {
              attempts: 3,
              baseMs: 400,
              capMs: 5000,
              shouldRetry: (err: any) => !err.status || isRetryableStatus(err.status),
            }
          );

          await enrichOrderFromMl(o.id, orgId, data, token);
          enriched++;
        } catch (err: any) {
          errors++;
          if (firstErrors.length < 5) {
            firstErrors.push(`${o.externalId}: ${err.message}`);
          }
        }
      })
    );

    return NextResponse.json({
      ok: true,
      orgId,
      durationMs: Date.now() - t0,
      total: orders.length,
      enriched,
      errors,
      firstErrors,
    });
  } catch (err: any) {
    console.error("[ml-reenrich-fields] fatal:", err);
    return NextResponse.json({ error: err.message, stack: err.stack?.slice(0, 500) }, { status: 500 });
  }
}
