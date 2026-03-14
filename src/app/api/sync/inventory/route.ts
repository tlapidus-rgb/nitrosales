// ══════════════════════════════════════════════
// Sync de Inventario VTEX — SKU-level (Optimizado)
// ══════════════════════════════════════════════
// Endpoint que sincroniza el inventario completo del catálogo VTEX
// usando las APIs privadas (SKU IDs + Logistics Inventory).
//
// Optimizaciones v2:
// - Cron cada 5 min (vs 1x/día) para sync completo en ~2h
// - Concurrencia 12 (vs 5) para ~1000 SKUs/invocación
// - Caché de SKU IDs en DB (evita re-fetch de 28K+ IDs cada call)
// - Batch upserts de 50 SKUs (vs 1 por 1)
// - Delay reducido entre batches (40ms vs 80ms)
//
// Uso:
//   GET /api/sync/inventory?key=<NEXTAUTH_SECRET>
//   GET /api/sync/inventory?key=<NEXTAUTH_SECRET>&force=true  (re-sync todo)
//   GET /api/sync/inventory?key=<NEXTAUTH_SECRET>&nocache=true (refrescar caché SKU IDs)

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { VtexConnector } from "@/lib/connectors/vtex";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── Constantes optimizadas ──
const TIME_BUDGET_MS = 50000; // 50s budget (10s margen - más agresivo)
const STALE_HOURS = 4; // Re-sync más frecuente (4h vs 6h)
const MAX_CONCURRENT = 12; // Más paralelos (12 vs 5)
const SKU_CACHE_HOURS = 12; // Caché de SKU IDs válido por 12h

export async function GET(req: NextRequest) {
  const startTime = Date.now();

  try {
    // 1. Autenticación
    const key = req.nextUrl.searchParams.get("key") || "";
    if (key !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const forceSync = req.nextUrl.searchParams.get("force") === "true";
    const noCache = req.nextUrl.searchParams.get("nocache") === "true";

    // 2. Buscar organización
    const org = await prisma.organization.findFirst({
      where: { slug: "elmundodeljuguete" },
    });
    if (!org) {
      return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 });
    }

    // 3. Credenciales VTEX
    const accountName = process.env.VTEX_ACCOUNT || "";
    const appKey = process.env.VTEX_APP_KEY || "";
    const appToken = process.env.VTEX_APP_TOKEN || "";

    if (!accountName || !appKey || !appToken) {
      return NextResponse.json(
        { error: "Faltan credenciales VTEX (VTEX_ACCOUNT, VTEX_APP_KEY, VTEX_APP_TOKEN)" },
        { status: 500 }
      );
    }

    const vtex = new VtexConnector({ accountName, appKey, appToken });

    // 4. Obtener SKU IDs (con caché en DB)
    console.log("[Inventory Sync] Loading SKU IDs...");
    const { allSkuIds, fromCache } = await getSkuIdsWithCache(vtex, org.id, noCache);

    if (allSkuIds.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No se encontraron SKUs en el catálogo VTEX",
        totalSkus: 0,
        processed: 0,
        isComplete: true,
      });
    }

    console.log(
      `[Inventory Sync] ${allSkuIds.length} SKUs totales (${fromCache ? "desde caché" : "fetch fresco"})`
    );

    // 5. Determinar qué SKUs necesitan sync
    let skuIdsToSync: number[];

    if (forceSync) {
      skuIdsToSync = allSkuIds;
    } else {
      const staleThreshold = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000);

      const recentlySynced = await prisma.product.findMany({
        where: {
          organizationId: org.id,
          externalId: { in: allSkuIds.map(String) },
          stockUpdatedAt: { gte: staleThreshold },
        },
        select: { externalId: true },
      });

      const recentIds = new Set(recentlySynced.map((p: any) => p.externalId));
      skuIdsToSync = allSkuIds.filter((id) => !recentIds.has(String(id)));
    }

    console.log(
      `[Inventory Sync] ${skuIdsToSync.length} SKUs pendientes de ${allSkuIds.length} total`
    );

    if (skuIdsToSync.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "Todos los SKUs ya estan sincronizados",
        totalSkus: allSkuIds.length,
        processed: 0,
        pendingSkus: 0,
        isComplete: true,
        fromCache,
        syncedAt: new Date().toISOString(),
      });
    }

    // 6. Calcular time budget restante
    const elapsedSoFar = Date.now() - startTime;
    const remainingBudget = Math.max(10000, TIME_BUDGET_MS - elapsedSoFar);

    console.log(
      `[Inventory Sync] Starting batch sync. Budget: ${Math.round(remainingBudget / 1000)}s, SKUs: ${skuIdsToSync.length}, Concurrency: ${MAX_CONCURRENT}`
    );

    // 7. Procesar batch con time budget
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

    // 8. Actualizar Connection.lastSyncAt
    if (processed > 0) {
      try {
        await prisma.connection.upsert({
          where: {
            organizationId_platform: {
              organizationId: org.id,
              platform: "VTEX",
            },
          },
          update: {
            lastSyncAt: new Date(),
            lastSyncError: null,
          },
          create: {
            organizationId: org.id,
            platform: "VTEX",
            status: "ACTIVE",
            credentials: {},
            lastSyncAt: new Date(),
          },
        });
      } catch (e) {
        console.warn("[Inventory Sync] Error updating connection status:", e);
      }
    }

    // 9. Respuesta con progreso
    const skusPerSecond = processed > 0 ? Math.round(processed / (totalElapsed / 1000)) : 0;
    const etaMinutes = pendingSkus > 0 && skusPerSecond > 0
      ? Math.round(pendingSkus / skusPerSecond / 60)
      : 0;

    const response = {
      ok: true,
      message: isComplete
        ? `Sync completo! ${processed} SKUs sincronizados.`
        : `Procesados ${processed} de ${skuIdsToSync.length} pendientes. Faltan ${pendingSkus}. ETA: ~${etaMinutes} min (${Math.ceil(pendingSkus / (skusPerSecond * 50))} llamadas más).`,
      totalSkus: allSkuIds.length,
      processed,
      failed,
      pendingSkus: Math.max(0, pendingSkus),
      isComplete,
      elapsedMs: totalElapsed,
      elapsedSeconds: Math.round(totalElapsed / 1000),
      skusPerSecond,
      fromCache,
      syncedAt: new Date().toISOString(),
      errors: results
        .filter((r) => !r.success)
        .slice(0, 10)
        .map((r) => ({ skuId: r.skuId, error: r.error })),
    };

    console.log(
      `[Inventory Sync] Done. Processed: ${processed}, Failed: ${failed}, Pending: ${pendingSkus}, Speed: ${skusPerSecond} SKUs/s, Time: ${Math.round(totalElapsed / 1000)}s`
    );

    return NextResponse.json(response);
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    console.error("[Inventory Sync] Fatal error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Error interno del servidor",
        elapsedMs: elapsed,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// ── Caché de SKU IDs en Connection metadata ──
async function getSkuIdsWithCache(
  vtex: VtexConnector,
  orgId: string,
  forceRefresh: boolean
): Promise<{ allSkuIds: number[]; fromCache: boolean }> {
  if (!forceRefresh) {
    try {
      // Intentar leer caché desde Connection metadata
      const conn = await prisma.connection.findFirst({
        where: { organizationId: orgId, platform: "VTEX" },
        select: { credentials: true, lastSyncAt: true },
      });

      if (conn?.credentials && typeof conn.credentials === "object") {
        const creds = conn.credentials as any;
        const cachedIds = creds._skuIdsCache as number[] | undefined;
        const cacheTime = creds._skuIdsCacheAt
          ? new Date(creds._skuIdsCacheAt)
          : null;

        if (
          cachedIds &&
          cachedIds.length > 0 &&
          cacheTime &&
          Date.now() - cacheTime.getTime() < SKU_CACHE_HOURS * 60 * 60 * 1000
        ) {
          console.log(
            `[Inventory Sync] Using cached SKU IDs: ${cachedIds.length} (cached ${Math.round((Date.now() - cacheTime.getTime()) / 60000)} min ago)`
          );
          return { allSkuIds: cachedIds, fromCache: true };
        }
      }
    } catch (e) {
      console.warn("[Inventory Sync] Cache read error:", e);
    }
  }

  // Fetch fresco
  console.log("[Inventory Sync] Fetching fresh SKU IDs from VTEX...");
  const allSkuIds = await vtex.fetchAllSkuIds();

  // Guardar en caché
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
      console.log(`[Inventory Sync] Cached ${allSkuIds.length} SKU IDs`);
    } catch (e) {
      console.warn("[Inventory Sync] Cache write error:", e);
    }
  }

  return { allSkuIds, fromCache: false };
}

// POST handler para llamadas programáticas
export async function POST(req: NextRequest) {
  return GET(req);
}
