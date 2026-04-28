// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/cron/post-backfill-finalize?orgId=X&key=Y
// ══════════════════════════════════════════════════════════════
// Disparado por backfill-runner cuando todos los jobs del onboarding
// completan. Orquesta los pasos finales SECUENCIALMENTE para que la
// data quede 100% completa:
//
//   1. catalog-refresh VTEX (await) → puebla Product.price/costPrice/stock
//   2. catalog-refresh ML (await)   → puebla Product.imageUrl/stock
//   3. recompute customer aggregates → totalOrders, totalSpent, firstOrderAt, lastOrderAt
//   4. backfill-orderitem-costs     → copia Product.costPrice → OrderItem.costPrice
//
// Fire-and-forget desde backfill-runner: como puede tardar 5-10 min,
// no podemos bloquear el cron del runner. Vercel waitUntil lo mantiene
// corriendo en background.
//
// Idempotente: si se llama 2 veces seguidas, los pasos individuales
// son no-ops sobre data ya procesada.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

const KEY = "nitrosales-secret-key-2024-production";

async function callInternal(path: string, baseUrl: string): Promise<{ ok: boolean; status: number; body?: any; durationMs: number }> {
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}${path}`, { method: "GET" });
    const body = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body, durationMs: Date.now() - start };
  } catch (err: any) {
    return { ok: false, status: 0, body: { error: err.message }, durationMs: Date.now() - start };
  }
}

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const allowed = key === KEY ? true : await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const orgId = url.searchParams.get("orgId");
    if (!orgId) return NextResponse.json({ error: "orgId requerido" }, { status: 400 });

    const baseUrl = process.env.NEXTAUTH_URL || "https://app.nitrosales.ai";

    // Detectar qué connections tiene la org para llamar solo los catalog-refresh relevantes.
    const connections = await prisma.connection.findMany({
      where: { organizationId: orgId },
      select: { platform: true },
    });
    const hasVtex = connections.some((c) => c.platform === "VTEX");
    const hasMl = connections.some((c) => c.platform === "MERCADOLIBRE");

    const results: Record<string, any> = {};

    // 1. Catalog refresh VTEX (await: bloquea hasta que termine)
    if (hasVtex) {
      results.vtexCatalogRefresh = await callInternal(
        `/api/sync/vtex/catalog-refresh?orgId=${encodeURIComponent(orgId)}&key=${KEY}`,
        baseUrl,
      );
    }

    // 2. Catalog refresh ML (await en paralelo con VTEX seria mas rapido pero
    // mas dificil de debuggear — secuencial por ahora).
    if (hasMl) {
      results.mlCatalogRefresh = await callInternal(
        `/api/sync/mercadolibre/catalog-refresh?orgId=${encodeURIComponent(orgId)}&key=${KEY}`,
        baseUrl,
      );
    }

    // 3. Recompute customer aggregates (rapido, ~1s)
    results.recomputeAggregates = await callInternal(
      `/api/admin/recompute-customer-aggregates?orgId=${encodeURIComponent(orgId)}&key=${KEY}`,
      baseUrl,
    );

    // 4. Backfill OrderItem costs (rapido, ~1-2s)
    results.backfillItemCosts = await callInternal(
      `/api/admin/backfill-orderitem-costs?orgId=${encodeURIComponent(orgId)}&key=${KEY}`,
      baseUrl,
    );

    return NextResponse.json({
      ok: true,
      orgId,
      durationMs: Date.now() - t0,
      results,
    });
  } catch (err: any) {
    console.error("[post-backfill-finalize] fatal:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
