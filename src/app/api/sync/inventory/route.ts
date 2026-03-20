// ââââââââââââââââââââââââââââââââââââââââââââââ
// Sync de Inventario VTEX â SKU-level (Optimizado v4)
// ââââââââââââââââââââââââââââââââââââââââââââââ
// Optimizaciones v4:
// - TIME_BUDGET reducido a 40s (20s margen para Hobby 60s limit)
// - Concurrencia 8 (mÃ¡s estable con VTEX API)
// - Query de "recently synced" simplificada (sin IN clause de 28K)
// - CachÃ© de SKU IDs en DB (12h)
// - Batch upserts de 50 SKUs
// - v4: Excluir SKUs inactivos conocidos (re-check cada 24h)

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { VtexConnector } from "@/lib/connectors/vtex";
import { getVtexCredentials } from "@/lib/vtex-credentials";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ââ Constantes ââ
const TIME_BUDGET_MS = 40000; // 40s budget (20s margen antes del hard limit de 60s)
const STALE_HOURS = 4;
const MAX_CONCURRENT = 8; // Concurrencia moderada para estabilidad
const SKU_CACHE_HOURS = 12;

export async function GET(req: NextRequest) {
  const startTime = Date.now();

  try {
    // 1. Auth
    const key = req.nextUrl.searchParams.get("key") || "";
    if (key !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const forceSync = req.nextUrl.searchParams.get("force") === "true";
    const noCache = req.nextUrl.searchParams.get("nocache") === "true";

    // 2. Org
    const org = await prisma.organization.findFirst({
      where: { slug: "elmundodeljuguete" },
    });
    if (!org) {
      return NextResponse.json({ error: "Org no encontrada" }, { status: 404 });
    }

    // 3. VTEX creds (centralized)
    const vtexCreds = await getVtexCredentials(org.id);
    const vtex = new VtexConnector(vtexCreds);

    // 4. SKU IDs (cached)
    console.log("[Sync] Loading SKU IDs...");
    const { allSkuIds, fromCache } = await getSkuIdsWithCache(vtex, org.id, noCache);

    if (allSkuIds.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No SKUs found",
        totalSkus: 0,
        processed: 0,
        isComplete: true,
      });
    }

    console.log(`[Sync] ${allSkuIds.length} SKUs (${fromCache ? "cache" : "fresh"})`);

    // 5. Determine which SKUs need sync
    // OPTIMIZADO v4: Excluir SKUs conocidos como inactivos en la DB
    // Si un SKU ya fue sincronizado y es inactivo, no tiene stock → no lo re-procesamos
    // Solo re-chequeamos inactivos cada 24h por si reactivaron alguno
    let skuIdsToSync: number[];

    if (forceSync) {
      skuIdsToSync = allSkuIds;
    } else {
      const staleThreshold = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000);
      const inactiveRecheckThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Query 1: SKUs recién sincronizados (dentro de STALE_HOURS) → skip
      const recentlySynced = await prisma.product.findMany({
        where: {
          organizationId: org.id,
          stockUpdatedAt: { gte: staleThreshold },
        },
        select: { externalId: true },
      });

      // Query 2: SKUs conocidos como inactivos, sincronizados en las últimas 24h → skip
      const knownInactive = await prisma.product.findMany({
        where: {
          organizationId: org.id,
          isActive: false,
          stockUpdatedAt: { gte: inactiveRecheckThreshold },
        },
        select: { externalId: true },
      });

      const recentIds = new Set(recentlySynced.map((p: any) => p.externalId));
      const inactiveIds = new Set(knownInactive.map((p: any) => p.externalId));
      
      skuIdsToSync = allSkuIds.filter(
        (id) => !recentIds.has(String(id)) && !inactiveIds.has(String(id))
      );

      const skippedRecent = recentIds.size;
      const skippedInactive = inactiveIds.size - [...inactiveIds].filter(id => recentIds.has(id)).length;
      console.log(`[Sync] Skipping ${skippedRecent} recent + ${skippedInactive} inactive SKUs`);
    }

    console.log(`[Sync] ${skuIdsToSync.length} pending of ${allSkuIds.length}`);

    if (skuIdsToSync.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "Todos los SKUs sincronizados",
        totalSkus: allSkuIds.length,
        processed: 0,
        pendingSkus: 0,
        isComplete: true,
        fromCache,
        syncedAt: new Date().toISOString(),
      });
    }

    // 6. Time budget
    const elapsedSoFar = Date.now() - startTime;
    const remainingBudget = Math.max(10000, TIME_BUDGET_MS - elapsedSoFar);

    console.log(`[Sync] Budget: ${Math.round(remainingBudget / 1000)}s, Concurrency: ${MAX_CONCURRENT}`);

    // 7. Process
    const { processed, failed, results } = await vtex.syncInventoryBatch(
      skuIdsToSync,
      org.id,
      prisma,
      remainingBudget,
      MAX_CONCURRENT
    );

    const pendingSkus = skuIdsToSync.length - processed - failed;
    const isComplete = pendingSkus <= 0;
    const totalElapsed = Date.now() - startTime;

    // 8. Update connection
    if (processed > 0) {
      try {
        await prisma.connection.upsert({
          where: {
            organizationId_platform: {
              organizationId: org.id,
              platform: "VTEX",
            },
          },
          update: { lastSyncAt: new Date(), lastSyncError: null },
          create: {
            organizationId: org.id,
            platform: "VTEX",
            status: "ACTIVE",
            credentials: {},
            lastSyncAt: new Date(),
          },
        });
      } catch (e) {
        console.warn("[Sync] Connection update error:", e);
      }
    }

    // 9. Response
    const skusPerSecond = processed > 0 ? Math.round(processed / (totalElapsed / 1000)) : 0;
    const etaMinutes = pendingSkus > 0 && skusPerSecond > 0
      ? Math.round(pendingSkus / skusPerSecond / 60)
      : 0;

    const response = {
      ok: true,
      message: isComplete
        ? `Sync completo! ${processed} SKUs sincronizados.`
        : `Procesados ${processed} de ${skuIdsToSync.length} pendientes. Faltan ${pendingSkus}. ETA: ~${etaMinutes} min.`,
      totalSkus: allSkuIds.length,
      processed,
      failed,
      pendingSkus: Math.max(0, pendingSkus),
      totalInCatalog: allSkuIds.length,
      isComplete,
      elapsedMs: totalElapsed,
      elapsedSeconds: Math.round(totalElapsed / 1000),
      skusPerSecond,
      fromCache,
      etaMinutes,
      syncedAt: new Date().toISOString(),
      errors: results
        .filter((r) => !r.success)
        .slice(0, 10)
        .map((r) => ({ skuId: r.skuId, error: r.error })),
    };

    console.log(`[Sync] Done: ${processed} ok, ${failed} fail, ${pendingSkus} pending, ${skusPerSecond} SKUs/s, ${Math.round(totalElapsed / 1000)}s`);

    return NextResponse.json(response);
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    console.error("[Sync] Fatal:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Error interno",
        elapsedMs: elapsed,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// ââ SKU IDs Cache ââ
async function getSkuIdsWithCache(
  vtex: VtexConnector,
  orgId: string,
  forceRefresh: boolean
): Promise<{ allSkuIds: number[]; fromCache: boolean }> {
  if (!forceRefresh) {
    try {
      const conn = await prisma.connection.findFirst({
        where: { organizationId: orgId, platform: "VTEX" },
        select: { credentials: true },
      });

      if (conn?.credentials && typeof conn.credentials === "object") {
        const creds = conn.credentials as any;
        const cachedIds = creds._skuIdsCache as number[] | undefined;
        const cacheTime = creds._skuIdsCacheAt ? new Date(creds._skuIdsCacheAt) : null;

        if (
          cachedIds &&
          cachedIds.length > 0 &&
          cacheTime &&
          Date.now() - cacheTime.getTime() < SKU_CACHE_HOURS * 60 * 60 * 1000
        ) {
          console.log(`[Sync] Cached SKU IDs: ${cachedIds.length}`);
          return { allSkuIds: cachedIds, fromCache: true };
        }
      }
    } catch (e) {
      console.warn("[Sync] Cache read error:", e);
    }
  }

  console.log("[Sync] Fetching fresh SKU IDs...");
  const allSkuIds = await vtex.fetchAllSkuIds();

  if (allSkuIds.length > 0) {
    try {
      const conn = await prisma.connection.findFirst({
        where: { organizationId: orgId, platform: "VTEX" },
        select: { credentials: true },
      });
      const existingCreds = (conn?.credentials as any) || {};

      await prisma.connection.updateMany({
        where: { organizationId: orgId, platform: "VTEX" },
        data: {
          credentials: {
            ...existingCreds,
            _skuIdsCache: allSkuIds,
            _skuIdsCacheAt: new Date().toISOString(),
          },
        },
      });
      console.log(`[Sync] Cached ${allSkuIds.length} SKU IDs`);
    } catch (e) {
      console.warn("[Sync] Cache write error:", e);
    }
  }

  return { allSkuIds, fromCache: false };
}

export async function POST(req: NextRequest) {
  return GET(req);
}
