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
import type {
  PulsoPageData,
  RunwayInputs,
  Sparkline12mBucket,
  Sparkline12mData,
} from "@/types/finanzas";

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
// Revenue mensual últimos 24 meses → se divide en:
//   - últimos 12 meses   → sparkline principal
//   - 12 meses anteriores → base para delta YoY
//
// 1 sola query agrupada por mes Buenos Aires. Liviana (sin JOIN).
// ─────────────────────────────────────────────────────────────
async function load24MonthRevenue(params: {
  orgId: string;
  today: Date;
}): Promise<Sparkline12mData> {
  const { orgId, today } = params;

  // Rango: primer día del mes 23 meses atrás → hoy
  const fromMonth = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 23, 1)
  );
  const fromDate = new Date(
    `${fromMonth.toISOString().substring(0, 10)}T00:00:00.000-03:00`
  );
  const toDate = new Date(
    `${today.toISOString().substring(0, 10)}T23:59:59.999-03:00`
  );

  const rows = await prisma.$queryRaw<{ month: string; revenue: string }[]>`
    SELECT
      TO_CHAR(o."orderDate" AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM') as month,
      COALESCE(SUM(o."totalValue"), 0)::text as revenue
    FROM orders o
    WHERE o."organizationId" = ${orgId}
      AND o.status NOT IN ('CANCELLED', 'RETURNED')
      AND o."orderDate" >= ${fromDate}
      AND o."orderDate" <= ${toDate}
    GROUP BY month
    ORDER BY month ASC
  `;

  // Map mes → revenue
  const byMonth = new Map<string, number>();
  for (const r of rows) byMonth.set(r.month, toNumber(r.revenue));

  // Generar 24 buckets continuos (rellenar ceros donde no hay ventas)
  const buckets24: Sparkline12mBucket[] = [];
  for (let i = 23; i >= 0; i--) {
    const d = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1)
    );
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    buckets24.push({
      month: key,
      revenue: byMonth.get(key) ?? 0,
      costos: 0, // reservado para futuras fases
      grossMargin: 0, // reservado para futuras fases
    });
  }

  const last12 = buckets24.slice(12);
  const prev12 = buckets24.slice(0, 12);

  const revenue12mTotal = last12.reduce((s, b) => s + b.revenue, 0);
  const revenuePrev12mTotal = prev12.reduce((s, b) => s + b.revenue, 0);
  const revenueDeltaPct =
    revenuePrev12mTotal > 0
      ? Math.round(
          ((revenue12mTotal - revenuePrev12mTotal) / revenuePrev12mTotal) *
            1000
        ) / 10
      : null;

  return {
    buckets: last12,
    revenue12mTotal,
    revenuePrev12mTotal,
    revenueDeltaPct,
    // Se completan en el handler principal con los valores YTD ya cargados
    costosYTD: 0,
    grossMarginYTD: 0,
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

    // Corremos las 2 ventanas + el agregado de 24 meses en paralelo.
    // Cada ventana hace 5 queries internas en 2 batches respetando el
    // pool de 8. La query del sparkline es 1 sola ligera agrupada por
    // mes (sin JOIN), así que está holgado.
    const [ytdTotals, w90Totals, sparkline] = await Promise.all([
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
      load24MonthRevenue({ orgId, today }),
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

    // Completar costosYTD + grossMarginYTD con los valores ya cargados.
    const costosYTD =
      ytdTotals.cogs +
      ytdTotals.shipping +
      ytdTotals.adSpend +
      ytdTotals.manualCosts;
    const grossProfitYTD = ytdTotals.revenue - ytdTotals.cogs;
    const grossMarginYTD =
      ytdTotals.revenue > 0
        ? Math.round((grossProfitYTD / ytdTotals.revenue) * 1000) / 10
        : 0;

    const sparkline12m: Sparkline12mData = {
      ...sparkline,
      costosYTD,
      grossMarginYTD,
    };

    const payload: PulsoPageData = {
      runway,
      sparkline12m,
      // marketingFinance, narrative, alerts → se agregan en 1b/1d.
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
