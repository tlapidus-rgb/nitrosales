// ══════════════════════════════════════════════════════════════
// Chain Sync: ejecuta inventory + vtex-details + reconcile
// en una sola request con time-budgeting inteligente
// ══════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from "next/server";
import { markSyncSuccess } from "@/lib/sync-tracker";
import { acquireSyncLock, releaseSyncLock } from "@/lib/sync-lock";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const startTime = Date.now();

  try {
    // Browser navigation guard — redirect browsers to dashboard
    const secFetchDest = req.headers.get("sec-fetch-dest");
    const secFetchMode = req.headers.get("sec-fetch-mode");
    const accept = req.headers.get("accept") || "";
    if (
      secFetchDest === "document" ||
      secFetchMode === "navigate" ||
      (accept.includes("text/html") && !accept.includes("application/json"))
    ) {
      return NextResponse.redirect(new URL("/", req.url));
    }

    const key = req.nextUrl.searchParams.get("key") || "";
    if (key !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Acquire sync lock — prevent overlapping chain runs
    const lock = await acquireSyncLock("chain");
    if (!lock.acquired) {
      return NextResponse.json({ ok: false, skipped: true, reason: lock.reason }, { status: 200 });
    }

    const skipInventory = req.nextUrl.searchParams.get("skip_inventory") === "true";
    const skipDetails = req.nextUrl.searchParams.get("skip_details") === "true";
    const skipReconcile = req.nextUrl.searchParams.get("skip_reconcile") === "true";

    const baseUrl = req.nextUrl.origin;
    const results: Record<string, any> = {};

    // Step 1: Inventory Sync (budget: 25s)
    if (!skipInventory) {
      try {
        const inventoryUrl = `${baseUrl}/api/sync/inventory?key=${key}`;
        const res = await fetch(inventoryUrl, { signal: AbortSignal.timeout(25000) });
        results.inventory = await res.json();
      } catch (e: any) {
        results.inventory = { ok: false, error: e.name === "TimeoutError" ? "timeout (25s)" : e.message };
      }
    } else {
      results.inventory = { skipped: true };
    }

    const afterInventory = Date.now() - startTime;

    // Step 2: VTEX Details (budget: remaining - 12s)
    if (!skipDetails) {
      const detailsBudget = Math.max(5000, 50000 - afterInventory - 12000);
      try {
        const detailsUrl = `${baseUrl}/api/sync/vtex-details?key=${key}&batch=50`;
        const res = await fetch(detailsUrl, { signal: AbortSignal.timeout(detailsBudget) });
        results.vtexDetails = await res.json();
      } catch (e: any) {
        results.vtexDetails = { ok: false, error: e.name === "TimeoutError" ? `timeout (${Math.round(detailsBudget/1000)}s)` : e.message };
      }
    } else {
      results.vtexDetails = { skipped: true };
    }

    const afterDetails = Date.now() - startTime;

    // Step 3: Reconcile (budget: remaining)
    if (!skipReconcile) {
      const reconcileBudget = Math.max(3000, 55000 - afterDetails);
      try {
        const reconcileUrl = `${baseUrl}/api/sync/reconcile?key=${key}&dryrun=false&batch=50`;
        const res = await fetch(reconcileUrl, { signal: AbortSignal.timeout(reconcileBudget) });
        results.reconcile = await res.json();
      } catch (e: any) {
        results.reconcile = { ok: false, error: e.name === "TimeoutError" ? `timeout (${Math.round(reconcileBudget/1000)}s)` : e.message };
      }
    } else {
      results.reconcile = { skipped: true };
    }

    const totalElapsed = Date.now() - startTime;
    const inventoryPending = results.inventory?.pendingSkus || 0;
    const detailsPending = results.vtexDetails?.remaining || 0;
    const isComplete = inventoryPending === 0 && detailsPending === 0;

    await markSyncSuccess("VTEX");

    return NextResponse.json({
      ok: true,
      isComplete,
      summary: {
        inventoryProcessed: results.inventory?.processed || 0,
        inventoryPending,
        detailsProcessed: results.vtexDetails?.processed || 0,
        detailsPending,
        reconcileMerged: results.reconcile?.actions?.merged || 0,
      },
      steps: results,
      elapsedMs: totalElapsed,
      elapsedSeconds: Math.round(totalElapsed / 1000),
      nextAction: isComplete
        ? "All synced! No action needed."
        : `Still pending: ${inventoryPending} inventory SKUs, ${detailsPending} order details. Call again to continue.`,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  } finally {
    await releaseSyncLock();
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
