// ═══════════════════════════════════════════════════════════════════
// /api/finanzas/pulso
// ═══════════════════════════════════════════════════════════════════
// Endpoint agregador de la portada /finanzas/pulso.
//
// Devuelve un payload `PulsoPageData` con todo lo que la portada
// necesita para renderizar en una sola llamada (Cash Runway, Marketing
// Financiero, Sparkline 12m, narrativa y alertas se van agregando a
// lo largo de las sub-fases 1a → 1e).
//
// Fase 1a: solo Runway.
// Fase 1b: + marketingFinance.
// Fase 1c: + sparkline12m.
// Fase 1d: + narrative + alerts.
// Fase 1e: + manualOverride para el cashBalance.
//
// IMPORTANTE (CLAUDE.md §REGLA #3b):
//   - Pool = 8, máximo 3 queries paralelas por batch.
//   - NO JOIN a customers desde orders (60K+ rows).
//   - Sin subqueries correlacionados adicionales.
// Las queries son ligeras (sum agregados sin JOIN pesados), similar
// a las de /api/metrics/pnl pero recortadas a solo lo necesario.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import { calculateCashRunway } from "@/lib/finanzas/runway";
import type { PulsoPageData, RunwayInputs } from "@/types/finanzas";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(v as string);
  return Number.isFinite(n) ? n : 0;
}

function ytdBoundariesBA(today: Date): { from: Date; to: Date; fromStr: string; toStr: string } {
  const year = today.getUTCFullYear();
  // 1 de enero del año actual en Buenos Aires (-03:00)
  const from = new Date(`${year}-01-01T00:00:00.000-03:00`);
  const to = new Date(
    `${today.toISOString().substring(0, 10)}T23:59:59.999-03:00`
  );
  return {
    from,
    to,
    fromStr: `${year}-01-01`,
    toStr: today.toISOString().substring(0, 10),
  };
}

function window90dBoundariesBA(today: Date): {
  from: Date;
  to: Date;
  fromStr: string;
  toStr: string;
} {
  const toDateStr = today.toISOString().substring(0, 10);
  const fromMillis = today.getTime() - 90 * 24 * 60 * 60 * 1000;
  const fromDateStr = new Date(fromMillis).toISOString().substring(0, 10);
  return {
    from: new Date(`${fromDateStr}T00:00:00.000-03:00`),
    to: new Date(`${toDateStr}T23:59:59.999-03:00`),
    fromStr: fromDateStr,
    toStr: toDateStr,
  };
}

// ─────────────────────────────────────────────────────────────
// Queries por ventana temporal (3 en paralelo, dentro del límite)
//
// Devuelve: { revenue, cogs, shipping, adSpend, manualCosts }
// ─────────────────────────────────────────────────────────────
async function loadWindowTotals(params: {
  orgId: string;
  fromDate: Date;
  toDate: Date;
  fromStr: string;
  toStr: string;
}): Promise<{
  revenue: number;
  cogs: number;
  shipping: number;
  adSpend: number;
  manualCosts: number;
}> {
  const { orgId, fromDate, toDate, fromStr, toStr } = params;

  // Batch 1: revenue + shipping + cogs (3 queries, todas ligeras, sin JOIN a customers)
  const [revRow, cogsRow, shipRow] = await Promise.all([
    prisma.$queryRaw<{ revenue: string }[]>`
      SELECT COALESCE(SUM(o."totalValue"), 0)::text as revenue
      FROM orders o
      WHERE o."organizationId" = ${orgId}
        AND o.status NOT IN ('CANCELLED', 'RETURNED')
        AND o."orderDate" >= ${fromDate}
        AND o."orderDate" <= ${toDate}
    `,
    prisma.$queryRaw<{ cogs: string }[]>`
      SELECT COALESCE(SUM(
        oi.quantity * COALESCE(oi."costPrice", p."costPrice", 0)
      ), 0)::text as cogs
      FROM order_items oi
      INNER JOIN orders o ON oi."orderId" = o.id
      LEFT JOIN products p ON oi."productId" = p.id
      WHERE o."organizationId" = ${orgId}
        AND o.status NOT IN ('CANCELLED', 'RETURNED')
        AND o."orderDate" >= ${fromDate}
        AND o."orderDate" <= ${toDate}
    `,
    prisma.$queryRaw<{ shipping: string }[]>`
      SELECT COALESCE(SUM(COALESCE(o."realShippingCost", o."shippingCost")), 0)::text as shipping
      FROM orders o
      WHERE o."organizationId" = ${orgId}
        AND o.status NOT IN ('CANCELLED', 'RETURNED')
        AND o."orderDate" >= ${fromDate}
        AND o."orderDate" <= ${toDate}
    `,
  ]);

  // Batch 2: adSpend + manualCosts (2 queries ligeras)
  const [adRow, mcRow] = await Promise.all([
    prisma.$queryRaw<{ spend: string }[]>`
      SELECT COALESCE(SUM(m.spend), 0)::text as spend
      FROM ad_metrics_daily m
      WHERE m."organizationId" = ${orgId}
        AND m.date >= ${fromDate}::date
        AND m.date <= ${toDate}::date
    `,
    prisma.$queryRaw<{ total: string }[]>`
      SELECT COALESCE(SUM(mc.amount), 0)::text as total
      FROM manual_costs mc
      WHERE mc."organizationId" = ${orgId}
        AND mc.month >= ${fromStr.substring(0, 7)}
        AND mc.month <= ${toStr.substring(0, 7)}
    `,
  ]);

  return {
    revenue: toNumber(revRow[0]?.revenue),
    cogs: toNumber(cogsRow[0]?.cogs),
    shipping: toNumber(shipRow[0]?.shipping),
    adSpend: toNumber(adRow[0]?.spend),
    manualCosts: toNumber(mcRow[0]?.total),
  };
}

// ─────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const orgId = await getOrganizationId();
    const today = new Date();
    const ytd = ytdBoundariesBA(today);
    const w90 = window90dBoundariesBA(today);

    // Corremos las 2 ventanas en paralelo. Cada una hace 5 queries
    // internas divididas en 2 batches respetando el pool de 8.
    const [ytdTotals, w90Totals] = await Promise.all([
      loadWindowTotals({
        orgId,
        fromDate: ytd.from,
        toDate: ytd.to,
        fromStr: ytd.fromStr,
        toStr: ytd.toStr,
      }),
      loadWindowTotals({
        orgId,
        fromDate: w90.from,
        toDate: w90.to,
        fromStr: w90.fromStr,
        toStr: w90.toStr,
      }),
    ]);

    const runwayInputs: RunwayInputs = {
      revenueYTD: ytdTotals.revenue,
      cogsYTD: ytdTotals.cogs,
      shippingYTD: ytdTotals.shipping,
      adSpendYTD: ytdTotals.adSpend,
      manualCostsYTD: ytdTotals.manualCosts,
      cogs90d: w90Totals.cogs,
      shipping90d: w90Totals.shipping,
      adSpend90d: w90Totals.adSpend,
      manualCosts90d: w90Totals.manualCosts,
      // manualOverride: se agrega en Fase 1e
      manualOverride: null,
    };

    const runway = calculateCashRunway(runwayInputs);

    const payload: PulsoPageData = {
      runway,
      // marketingFinance, sparkline12m, narrative, alerts → se agregan
      // en sub-fases 1b/1c/1d.
      meta: {
        generatedAt: today.toISOString(),
        ytdFrom: ytd.fromStr,
        ytdTo: ytd.toStr,
        window90dFrom: w90.fromStr,
        window90dTo: w90.toStr,
      },
    };

    return NextResponse.json(payload);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: msg, message: "Error cargando datos del Pulso" },
      { status: 500 }
    );
  }
}
