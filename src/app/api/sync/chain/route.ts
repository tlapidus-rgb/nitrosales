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
import { ORG_BUDGET_MS, canStartAnotherOrg } from "@/lib/sync/chain-budget";

export const dynamic = "force-dynamic";

// ── Presupuestos (E-03, 2026-09-05) ─────────────────────────────────────────
// ⚠️ ESTO ESTABA ROTO CON 4 CLIENTES, no era una proyección:
//   `maxDuration` era 60 y los presupuestos de los 3 pasos suman ~55s POR ORG
//   (25s inventory + ~13s details + ~17s reconcile). O sea que entraba UNA sola
//   organización por corrida y las demás NUNCA sincronizaban inventario, precios
//   ni detalles de VTEX. Se nota río abajo: el módulo de P&L usa `costPrice`, que
//   para esos clientes no se poblaba nunca.
//
//   `vercel.json` ya cubre `app/api/sync/**` con maxDuration 800; lo que faltaba
//   era el `export` de la ruta, que es el que manda. Se sube a 300 (no a 800) a
//   propósito: el cron corre cada 2h, así que 5 minutos es margen de sobra, y un
//   techo más bajo hace que un cuelgue se note antes.
export const maxDuration = 300;

// Los presupuestos viven en el lib porque Next no deja exportar símbolos
// arbitrarios desde un route.ts (rompe el build), y la decisión tiene que ser
// testeable sin levantar la ruta. Ver src/lib/sync/chain-budget.ts.

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

// ── Self-fetch: headers (R-C14 / E-03) ──────────────────────────────────────
// Cuando Vercel Cron dispara esta ruta, `req.nextUrl.origin` es la URL del
// DEPLOYMENT, que está detrás de Deployment Protection → los tres self-fetch
// reciben 401 con un body HTML, `res.json()` explota, y el paso se anota como
// error… que después `markSyncSuccess` tapa igual (ver R-C13). Invocado a mano
// desde el dominio propio funciona, y eso es lo que despistó durante semanas en
// el incidente BP-ROLLUP-CRON.
//
// El header de bypass lo mandan hoy `cron/warm-cache` y
// `cron/refresh-pixel-first-source`; acá faltaba. Sin el secreto seteado (local)
// no se manda nada y el comportamiento es el de antes.
function selfFetchHeaders(): HeadersInit | undefined {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  return secret ? { "x-vercel-protection-bypass": secret } : undefined;
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
        const res = await fetch(inventoryUrl, { signal: AbortSignal.timeout(25000), headers: selfFetchHeaders() });
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
      const detailsBudget = Math.max(5000, ORG_BUDGET_MS - 5000 - afterInventory - 12000);
      try {
        const detailsUrl = `${baseUrl}/api/sync/vtex-details?key=${encodeURIComponent(key)}&batch=50&org=${encodeURIComponent(orgId)}`;
        const res = await fetch(detailsUrl, { signal: AbortSignal.timeout(detailsBudget), headers: selfFetchHeaders() });
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
      const reconcileBudget = Math.max(3000, ORG_BUDGET_MS - afterDetails);
      try {
        const reconcileUrl = `${baseUrl}/api/sync/reconcile?key=${encodeURIComponent(key)}&dryrun=false&batch=50&org=${encodeURIComponent(orgId)}`;
        const res = await fetch(reconcileUrl, { signal: AbortSignal.timeout(reconcileBudget), headers: selfFetchHeaders() });
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
    // Preferimos el dominio propio: `req.nextUrl.origin` es la URL del deployment
    // cuando dispara Vercel Cron, y esa está detrás de Deployment Protection.
    // Con el header de bypass los dos funcionan, pero el dominio propio no
    // depende de que el secreto esté seteado.
    const baseUrl = process.env.NEXTAUTH_URL || req.nextUrl.origin;

    if (orgParam) {
      const r = await runChainForOrg(orgParam, key, baseUrl, skipInventory, skipDetails, skipReconcile);
      return NextResponse.json(r);
    }

    // ── Iterar todas las conns VTEX activas (multi-tenant) ──────────────────
    // ⚠️ EL ORDEN IMPORTA (E-03 / mismo patrón que E-02): antes era un `findMany`
    // SIN `orderBy`, o sea orden arbitrario de Postgres — estable en la práctica.
    // Como sólo entraba una organización por corrida, era SIEMPRE la misma la que
    // sincronizaba y siempre las mismas las que no.
    //
    // Ahora se atiende primero a la que hace más tiempo que no corre. Nótese que
    // esto funciona incluso con el bug de R-C13 (`markSyncSuccess` incondicional)
    // sin resolver: como proxy de "a quién le tocó último" el campo sirve igual,
    // haya salido bien o mal.
    const vtexConns = await prisma.connection.findMany({
      where: { platform: "VTEX" as any, status: "ACTIVE" as any },
      select: { organizationId: true, lastSuccessfulSyncAt: true },
      orderBy: [{ lastSuccessfulSyncAt: { sort: "asc", nulls: "first" } }, { organizationId: "asc" }],
    });

    if (vtexConns.length === 0) {
      return NextResponse.json({ ok: true, message: "No active VTEX connections", results: [] });
    }

    const startedAt = Date.now();
    const results: ChainResult[] = [];
    let nextOrgId: string | null = null;

    for (const conn of vtexConns) {
      // No arrancar una organización que no vamos a poder terminar: cortar a
      // mitad no ahorra nada y dejaría el lock tomado más tiempo del necesario.
      if (!canStartAnotherOrg(Date.now() - startedAt)) {
        nextOrgId = conn.organizationId;
        break;
      }
      const r = await runChainForOrg(conn.organizationId, key, baseUrl, skipInventory, skipDetails, skipReconcile);
      results.push(r);
    }

    return NextResponse.json({
      ok: true,
      orgsProcessed: results.length,
      orgsTotal: vtexConns.length,
      // Con valor = se acabó el presupuesto y quedaron organizaciones sin correr.
      // No hace falta reanudar a mano: el orden por antigüedad de sync hace que
      // la próxima corrida arranque justo por acá.
      stoppedForBudget: nextOrgId !== null,
      nextOrgId,
      results,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
