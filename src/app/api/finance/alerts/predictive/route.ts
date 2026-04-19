// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/finance/alerts/predictive — Fase 6f
// ═══════════════════════════════════════════════════════════════════
// GET: devuelve alertas predictivas cruzando MoM deltas y metricas
// de marketing. Complementa /api/finanzas/pulso (que tiene alertas
// de estado actual, no de tendencia).
//
// Agrega data en parallel:
//   - /api/metrics/orders current vs previous (shipping, cogs)
//   - /api/metrics/ltv (CAC, LTV, payback)
//   - MlCommission retenciones current vs previous
//   - Fiscal calendar (proximo vencimiento)
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import {
  buildPredictiveAlerts,
  type PredictiveInput,
} from "@/lib/finanzas/predictive-alerts";
import {
  buildDefaultObligations,
  expandObligations,
  applyOverrides,
  type FiscalProfileInput,
  type OverrideRow,
} from "@/lib/finanzas/fiscal-calendar";

export const dynamic = "force-dynamic";

function monthBounds(offsetMonths: number = 0): { from: Date; to: Date; iso: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + offsetMonths;
  const from = new Date(Date.UTC(y, m, 1));
  const to = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59));
  const iso = `${from.getUTCFullYear()}-${String(from.getUTCMonth() + 1).padStart(2, "0")}`;
  return { from, to, iso };
}

async function aggregateShippingAndCogs(
  orgId: string,
  from: Date,
  to: Date
): Promise<{ revenue: number; shipping: number; cogs: number }> {
  // Revenue = sum totalValue
  const rev = await prisma.$queryRawUnsafe<Array<{ total: string }>>(
    `SELECT COALESCE(SUM("totalValue"), 0)::text AS total
       FROM orders
      WHERE "organizationId" = $1 AND "orderDate" >= $2 AND "orderDate" <= $3`,
    orgId, from, to
  );
  // Shipping = sum of order_items.costPrice para items de categoria SHIPPING no aplica;
  // usamos order.shippingCost si existe o 0.
  const ship = await prisma.$queryRawUnsafe<Array<{ total: string }>>(
    `SELECT COALESCE(SUM("shippingCost"), 0)::text AS total
       FROM orders
      WHERE "organizationId" = $1 AND "orderDate" >= $2 AND "orderDate" <= $3`,
    orgId, from, to
  );
  // COGS = sum(order_items.costPrice * quantity) — join orders+items
  const cogs = await prisma.$queryRawUnsafe<Array<{ total: string }>>(
    `SELECT COALESCE(SUM(oi."costPrice" * oi."quantity"), 0)::text AS total
       FROM order_items oi
       JOIN orders o ON o."id" = oi."orderId"
      WHERE o."organizationId" = $1
        AND o."orderDate" >= $2 AND o."orderDate" <= $3`,
    orgId, from, to
  );
  return {
    revenue: Number(rev?.[0]?.total ?? 0),
    shipping: Number(ship?.[0]?.total ?? 0),
    cogs: Number(cogs?.[0]?.total ?? 0),
  };
}

async function aggregateRetentions(
  orgId: string,
  from: Date,
  to: Date
): Promise<number> {
  const r = await prisma.$queryRawUnsafe<Array<{ total: string }>>(
    `SELECT COALESCE(SUM("taxWithholdings"), 0)::text AS total
       FROM ml_commissions
      WHERE "organizationId" = $1
        AND "orderDate" >= $2 AND "orderDate" <= $3`,
    orgId, from, to
  );
  return Number(r?.[0]?.total ?? 0);
}

export async function GET() {
  try {
    const orgId = await getOrganizationId();

    // Current vs previous month windows
    const curr = monthBounds(0);
    const prev = monthBounds(-1);

    // Paralelizar
    const [
      currMetrics,
      prevMetrics,
      currRet,
      prevRet,
      org,
      overrideRows,
      ltvJson,
    ] = await Promise.all([
      aggregateShippingAndCogs(orgId, curr.from, curr.to),
      aggregateShippingAndCogs(orgId, prev.from, prev.to),
      aggregateRetentions(orgId, curr.from, curr.to),
      aggregateRetentions(orgId, prev.from, prev.to),
      prisma.organization.findUnique({
        where: { id: orgId },
        select: { settings: true },
      }),
      prisma.fiscalObligationOverride.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: "asc" },
      }),
      // LTV endpoint — fetch via absolute URL o en proceso (si runtime lo permite)
      Promise.resolve(null), // placeholder — calcular inline para evitar fetch interno
    ]);

    // Calcular blended CAC/LTV/payback inline (sin internal fetch)
    // Datos base: customers first order en el periodo + ad spend 30d
    const cacInput = await prisma.$queryRawUnsafe<
      Array<{ customers: string; revenue: string }>
    >(`
      SELECT
        COUNT(DISTINCT c."id")::text AS customers,
        COALESCE(SUM(c."totalSpent"), 0)::text AS revenue
      FROM customers c
      WHERE c."organizationId" = $1
        AND c."firstOrderAt" >= $2
        AND c."firstOrderAt" <= $3
    `, orgId, new Date(Date.now() - 30 * 24 * 3600 * 1000), new Date());

    const adSpendRow = await prisma.$queryRawUnsafe<Array<{ total: string }>>(
      `SELECT COALESCE(SUM("spend"), 0)::text AS total
         FROM ad_metrics_daily
        WHERE "organizationId" = $1
          AND "date" >= $2`,
      orgId, new Date(Date.now() - 30 * 24 * 3600 * 1000)
    );

    const newCustomers = Number(cacInput?.[0]?.customers ?? 0);
    const newRevenue = Number(cacInput?.[0]?.revenue ?? 0);
    const adSpend30d = Number(adSpendRow?.[0]?.total ?? 0);
    const blendedCac =
      newCustomers > 0 && adSpend30d > 0 ? adSpend30d / newCustomers : null;
    const blendedLtv = newCustomers > 0 ? newRevenue / newCustomers : null;
    const blendedPaybackMonths =
      blendedCac && blendedLtv && blendedLtv > 0
        ? (12 * blendedCac) / blendedLtv
        : null;

    // Fiscal próximo vencimiento
    let nextFiscalDueInDays: number | null = null;
    let nextFiscalName: string | null = null;
    const settings = (org?.settings as Record<string, unknown>) || {};
    const profile = (settings.fiscalProfile as FiscalProfileInput) || null;
    if (profile) {
      const overrides: OverrideRow[] = overrideRows.map((r) => ({
        id: r.id,
        kind: r.kind,
        defaultKey: r.defaultKey,
        name: r.name,
        category: r.category,
        dueDay: r.dueDay,
        frequency: r.frequency,
        yearlyMonth: r.yearlyMonth,
        amount: r.amount ? Number(r.amount) : null,
        amountSource: r.amountSource,
        isActive: r.isActive,
        hideDefault: r.hideDefault,
        note: r.note,
        startMonth: r.startMonth,
        endMonth: r.endMonth,
      }));
      const defaults = buildDefaultObligations(profile);
      const merged = applyOverrides(defaults, overrides);
      const expanded = expandObligations(merged, new Date(), 2);
      const nonInformative = expanded.filter((o) => !o.isInformative);
      const upcoming = nonInformative.find((o) => {
        const d = new Date(o.dueDate + "T00:00:00");
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const days = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return days >= 0;
      });
      if (upcoming) {
        const d = new Date(upcoming.dueDate + "T00:00:00");
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        nextFiscalDueInDays = Math.round(
          (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );
        nextFiscalName = upcoming.name;
      }
    }

    const cogsPctCurrent =
      currMetrics.revenue > 0 ? (currMetrics.cogs / currMetrics.revenue) * 100 : null;
    const cogsPctPrev =
      prevMetrics.revenue > 0 ? (prevMetrics.cogs / prevMetrics.revenue) * 100 : null;

    const input: PredictiveInput = {
      monthIso: curr.iso,
      shippingCurrent: currMetrics.shipping,
      shippingPrev: prevMetrics.shipping,
      cogsPctCurrent: cogsPctCurrent ?? undefined,
      cogsPctPrev: cogsPctPrev ?? undefined,
      retentionsCurrent: currRet,
      retentionsPrev: prevRet,
      blendedCac,
      blendedLtv,
      blendedPaybackMonths,
      nextFiscalDueInDays,
      nextFiscalName,
    };

    const alerts = buildPredictiveAlerts(input);

    return NextResponse.json({
      alerts,
      debug: {
        curr: { ...currMetrics, retentions: currRet, iso: curr.iso },
        prev: { ...prevMetrics, retentions: prevRet, iso: prev.iso },
        blendedCac,
        blendedLtv,
        blendedPaybackMonths,
        nextFiscalDueInDays,
        nextFiscalName,
      },
    });
  } catch (error: any) {
    console.error("[finance/alerts/predictive] error:", error);
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
