// ══════════════════════════════════════════════════════════════
// Chain Sync: ejecuta inventory + vtex-details + reconcile
// en una sola request con time-budgeting inteligente
// Multi-tenant: itera todas las conns VTEX activas (BP-MT-001 pattern).
// Soporta ?org=<orgId> para procesar UNA sola org.
// ══════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { markSyncSuccess } from "@/lib/sync-tracker";
import { acquireSyncLock, releaseSyncLock } from "@/lib/sync-lock";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ChainResult {
  orgId: string;
  ok: boolean;
  isComplete?: boolean;
  summary?: any;
  steps?: any;
  elapsedMs?: number;
  error?: string;
  skipped?: boolean;
  reason?: string;
}

async function runChainForOrg(
  orgId: string,
  key: string,
  baseUrl: string,
  skipInventory: boolean,
  skipDetails: boolean,
  skipReconcile: boolean
): Promise<ChainResult> {
  const startTime = Date.now();

  const lock = await acquireSyncLock(orgId, "chain");
  if (!lock.acquired) {
    return { orgId, ok: false, skipped: true, reason: lock.reason };
  }

  try {
    const results: Record<string, any> = {};

    // Step 1: Inventory Sync (budget: 25s)
    if (!skipInventory) {
      try {
        const inventoryUrl = `${baseUrl}/api/sync/inventory?key=${encodeURIComponent(key)}&org=${encodeURIComponent(orgId)}`;
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
        const detailsUrl = `${baseUrl}/api/sync/vtex-details?key=${encodeURIComponent(key)}&batch=50&org=${encodeURIComponent(orgId)}`;
        const res = await fetch(detailsUrl, { signal: AbortSignal.timeout(detailsBudget) });
        results.vtexDetails = await res.json();
      } catch (e: any) {
        results.vtexDetails = { ok: false, error: e.name === "TimeoutError" ? `timeout (${Math.round(detailsBudget / 1000)}s)` : e.message };
      }
    } else {
      results.vtexDetails = { skipped: true };
    }

    const afterDetails = Date.now() - startTime;

    // Step 3: Reconcile (budget: remaining)
    if (!skipReconcile) {
      const reconcileBudget = Math.max(3000, 55000 - afterDetails);
      try {
        const reconcileUrl = `${baseUrl}/api/sync/reconcile?key=${encodeURIComponent(key)}&dryrun=false&batch=50&org=${encodeURIComponent(orgId)}`;
        const res = await fetch(reconcileUrl, { signal: AbortSignal.timeout(reconcileBudget) });
        results.reconcile = await res.json();
      } catch (e: any) {
        results.reconcile = { ok: false, error: e.name === "TimeoutError" ? `timeout (${Math.round(reconcileBudget / 1000)}s)` : e.message };
      }
    } else {
      results.reconcile = { skipped: true };
    }

    const totalElapsed = Date.now() - startTime;
    const inventoryPending = results.inventory?.pendingSkus || 0;
    const detailsPending = results.vtexDetails?.remaining || 0;
    const isComplete = inventoryPending === 0 && detailsPending === 0;

    await markSyncSuccess(orgId, "VTEX");

    return {
      orgId,
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
    };
  } catch (error: any) {
    return { orgId, ok: false, error: error.message };
  } finally {
    await releaseSyncLock(orgId);
  }
}

export async function GET(req: NextRequest) {
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

    const skipInventory = req.nextUrl.searchParams.get("skip_inventory") === "true";
    const skipDetails = req.nextUrl.searchParams.get("skip_details") === "true";
    const skipReconcile = req.nextUrl.searchParams.get("skip_reconcile") === "true";
    const orgParam = req.nextUrl.searchParams.get("org");
    const baseUrl = req.nextUrl.origin;

    if (orgParam) {
      const r = await runChainForOrg(orgParam, key, baseUrl, skipInventory, skipDetails, skipReconcile);
      return NextResponse.json(r);
    }

    // Iterar todas las conns VTEX activas (multi-tenant)
    const vtexConns = await prisma.connection.findMany({
      where: { platform: "VTEX" as any, status: "ACTIVE" as any },
      select: { organizationId: true },
    });

    if (vtexConns.length === 0) {
      return NextResponse.json({ ok: true, message: "No active VTEX connections", results: [] });
    }

    const results: ChainResult[] = [];
    for (const conn of vtexConns) {
      const r = await runChainForOrg(conn.organizationId, key, baseUrl, skipInventory, skipDetails, skipReconcile);
      results.push(r);
    }

    return NextResponse.json({ ok: true, orgsProcessed: results.length, results });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
