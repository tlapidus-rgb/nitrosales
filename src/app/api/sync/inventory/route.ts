// ══════════════════════════════════════════════
// Sync de Inventario VTEX — SKU-level
// ══════════════════════════════════════════════
// Endpoint que sincroniza el inventario completo del catálogo VTEX
// usando las APIs privadas (SKU IDs + Logistics Inventory).
//
// Diseñado para Vercel Hobby (60s timeout):
// - Procesa ~500-700 SKUs por invocación
// - Resumable: llamar múltiples veces para completar
// - Rate limiting: max 5 concurrent, 80ms delay entre batches
// - Idempotente: usa stockUpdatedAt para skip SKUs ya sincronizados
//
// Uso:
//   GET /api/sync/inventory?key=<NEXTAUTH_SECRET>
//   GET /api/sync/inventory?key=<NEXTAUTH_SECRET>&force=true  (re-sync todo)

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { VtexConnector } from "@/lib/connectors/vtex";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── Constantes ──
const TIME_BUDGET_MS = 45000; // 45s de budget (15s de margen para Vercel)
const STALE_HOURS = 6; // SKUs con stockUpdatedAt > 6h se re-sincronizan
const MAX_CONCURRENT = 5; // Requests paralelos a VTEX

export async function GET(req: NextRequest) {
  const startTime = Date.now();

  try {
    // 1. Autenticación
    const key = req.nextUrl.searchParams.get("key") || "";
    if (key !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const forceSync = req.nextUrl.searchParams.get("force") === "true";

    // 2. Buscar organización
    const org = await db.organization.findFirst({
      where: { slug: "elmundodeljuguete" },
    });
    if (!org) {
      return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 });
    }

    // 3. Credenciales VTEX
    const accountName = process.env.VTEX_ACCOUNT_NAME;
    const appKey = process.env.VTEX_APP_KEY;
    const appToken = process.env.VTEX_APP_TOKEN;

    if (!accountName || !appKey || !appToken) {
      return NextResponse.json(
        { error: "Faltan credenciales VTEX (VTEX_ACCOUNT_NAME, VTEX_APP_KEY, VTEX_APP_TOKEN)" },
        { status: 500 }
      );
    }

    const vtex = new VtexConnector({ accountName, appKey, appToken });

    // 4. Fetch TODOS los SKU IDs del catálogo
    console.log("[Inventory Sync] Fetching all SKU IDs...");
    const allSkuIds = await vtex.fetchAllSkuIds();

    if (allSkuIds.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No se encontraron SKUs en el catálogo VTEX",
        totalSkus: 0,
        processed: 0,
        isComplete: true,
      });
    }

    // 5. Determinar qué SKUs necesitan sync
    let skuIdsToSync: number[];

    if (forceSync) {
      // Force: sincronizar todo
      skuIdsToSync = allSkuIds;
    } else {
      // Normal: skip SKUs sincronizados recientemente
      const staleThreshold = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000);

      // Buscar en la DB qué SKU IDs ya están sincronizados y son recientes
      const recentlySynced = await db.product.findMany({
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
        message: "Todos los SKUs ya estan sincronizados (< 6 horas)",
        totalSkus: allSkuIds.length,
        processed: 0,
        pendingSkus: 0,
        isComplete: true,
        syncedAt: new Date().toISOString(),
      });
    }

    // 6. Calcular time budget restante (descontando lo que tardó fetch de SKU IDs)
    const elapsedSoFar = Date.now() - startTime;
    const remainingBudget = Math.max(10000, TIME_BUDGET_MS - elapsedSoFar);

    console.log(
      `[Inventory Sync] Starting batch sync. Budget: ${Math.round(remainingBudget / 1000)}s, SKUs: ${skuIdsToSync.length}`
    );

    // 7. Procesar batch con time budget
    const { processed, failed, results } = await vtex.syncInventoryBatch(
      skuIdsToSync,
      org.id,
      db,
      remainingBudget,
      MAX_CONCURRENT
    );

    const pendingSkus = skuIdsToSync.length - processed - failed;
    const isComplete = pendingSkus <= 0;
    const totalElapsed = Date.now() - startTime;

    // 8. Actualizar Connection.lastSyncAt si procesó algo
    if (processed > 0) {
      try {
        await db.connection.upsert({
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
    const response = {
      ok: true,
      message: isComplete
        ? `Sync completo! ${processed} SKUs sincronizados.`
        : `Procesados ${processed} de ${skuIdsToSync.length} SKUs pendientes. Llamar de nuevo para continuar.`,
      totalSkus: allSkuIds.length,
      processed,
      failed,
      pendingSkus: Math.max(0, pendingSkus),
      isComplete,
      elapsedMs: totalElapsed,
      elapsedSeconds: Math.round(totalElapsed / 1000),
      syncedAt: new Date().toISOString(),
      // Sample de errores para debugging
      errors: results
        .filter((r) => !r.success)
        .slice(0, 10)
        .map((r) => ({ skuId: r.skuId, error: r.error })),
    };

    console.log(
      `[Inventory Sync] Done. Processed: ${processed}, Failed: ${failed}, Pending: ${pendingSkus}, Time: ${Math.round(totalElapsed / 1000)}s`
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

// POST handler para llamadas programáticas
export async function POST(req: NextRequest) {
  return GET(req);
}
