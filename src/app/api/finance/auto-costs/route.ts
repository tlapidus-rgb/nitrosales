import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/finance/auto-costs?month=2025-03
 *
 * Returns auto-calculated costs from existing data:
 * 1. PLATAFORMAS: ML commissions, shipping costs charged by ML, tax withholdings
 * 2. MERMA: Value of cancelled and returned orders
 *
 * These are read-only calculations — no DB writes.
 * The UI shows them alongside manual costs for a complete picture.
 */
export async function GET(req: NextRequest) {
  const orgId = await getOrganizationId();
  const month = req.nextUrl.searchParams.get("month");

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month param required (YYYY-MM)" }, { status: 400 });
  }

  const [year, monthNum] = month.split("-").map(Number);
  const startDate = new Date(year, monthNum - 1, 1);
  const endDate = new Date(year, monthNum, 1);
  // Format as ISO with Argentina timezone offset for queries
  const startISO = `${month}-01T00:00:00-03:00`;
  const endISO = `${year}-${String(monthNum + 1).padStart(2, "0")}-01T00:00:00-03:00`;
  // Handle December -> January
  const endISOFix = monthNum === 12
    ? `${year + 1}-01-01T00:00:00-03:00`
    : endISO;

  try {
    // ═══ PLATAFORMAS: ML Commissions ═══
    const mlCommissions = await prisma.$queryRaw<[{
      total_commission: string;
      total_shipping: string;
      total_tax: string;
      total_net: string;
      total_sale: string;
      order_count: string;
    }]>`
      SELECT
        COALESCE(SUM("commissionAmount"), 0)::text as total_commission,
        COALESCE(SUM("shippingCost"), 0)::text as total_shipping,
        COALESCE(SUM("taxWithholdings"), 0)::text as total_tax,
        COALESCE(SUM("netAmount"), 0)::text as total_net,
        COALESCE(SUM("salePrice"), 0)::text as total_sale,
        COUNT(*)::text as order_count
      FROM ml_commissions
      WHERE "organizationId" = ${orgId}
        AND "orderDate" >= ${startISO}::timestamptz
        AND "orderDate" < ${endISOFix}::timestamptz
    `;

    const ml = mlCommissions[0];
    const mlTotalCommission = parseFloat(ml.total_commission);
    const mlTotalShipping = parseFloat(ml.total_shipping);
    const mlTotalTax = parseFloat(ml.total_tax);
    const mlTotalNet = parseFloat(ml.total_net);
    const mlTotalSale = parseFloat(ml.total_sale);
    const mlOrderCount = parseInt(ml.order_count);

    // Commission rate approximation
    const mlCommissionRate = mlTotalSale > 0
      ? ((mlTotalCommission / mlTotalSale) * 100).toFixed(1)
      : "0";

    // ═══ MERMA: Cancelled & Returned Orders ═══
    // Distinguish pre-dispatch (no product loss) vs post-dispatch (product/shipping loss)
    // Heuristic: if order has shippingCarrier or realShippingCost, it was dispatched
    const mermaResult = await prisma.$queryRaw<[{
      cancelled_pre_count: string;
      cancelled_pre_value: string;
      cancelled_post_count: string;
      cancelled_post_value: string;
      returned_count: string;
      returned_value: string;
    }]>`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'CANCELLED' AND "shippingCarrier" IS NULL AND "realShippingCost" IS NULL THEN 1 ELSE 0 END), 0)::text as cancelled_pre_count,
        COALESCE(SUM(CASE WHEN status = 'CANCELLED' AND "shippingCarrier" IS NULL AND "realShippingCost" IS NULL THEN "totalValue" ELSE 0 END), 0)::text as cancelled_pre_value,
        COALESCE(SUM(CASE WHEN status = 'CANCELLED' AND ("shippingCarrier" IS NOT NULL OR "realShippingCost" IS NOT NULL) THEN 1 ELSE 0 END), 0)::text as cancelled_post_count,
        COALESCE(SUM(CASE WHEN status = 'CANCELLED' AND ("shippingCarrier" IS NOT NULL OR "realShippingCost" IS NOT NULL) THEN "totalValue" ELSE 0 END), 0)::text as cancelled_post_value,
        COALESCE(SUM(CASE WHEN status = 'RETURNED' THEN 1 ELSE 0 END), 0)::text as returned_count,
        COALESCE(SUM(CASE WHEN status = 'RETURNED' THEN "totalValue" ELSE 0 END), 0)::text as returned_value
      FROM orders
      WHERE "organizationId" = ${orgId}
        AND "orderDate" >= ${startISO}::timestamptz
        AND "orderDate" < ${endISOFix}::timestamptz
        AND status IN ('CANCELLED', 'RETURNED')
    `;

    const merma = mermaResult[0];
    const cancelledPreCount = parseInt(merma.cancelled_pre_count);
    const cancelledPreValue = parseFloat(merma.cancelled_pre_value);
    const cancelledPostCount = parseInt(merma.cancelled_post_count);
    const cancelledPostValue = parseFloat(merma.cancelled_post_value);
    const cancelledCount = cancelledPreCount + cancelledPostCount;
    const cancelledValue = cancelledPreValue + cancelledPostValue;
    const returnedCount = parseInt(merma.returned_count);
    const returnedValue = parseFloat(merma.returned_value);

    // Total orders for the month (for % calculation)
    const totalOrdersResult = await prisma.$queryRaw<[{ cnt: string; val: string }]>`
      SELECT COUNT(*)::text as cnt, COALESCE(SUM("totalValue"), 0)::text as val
      FROM orders
      WHERE "organizationId" = ${orgId}
        AND "orderDate" >= ${startISO}::timestamptz
        AND "orderDate" < ${endISOFix}::timestamptz
    `;
    const totalOrders = parseInt(totalOrdersResult[0].cnt);
    const totalValue = parseFloat(totalOrdersResult[0].val);

    return NextResponse.json({
      month,
      platform: {
        mlCommission: mlTotalCommission,
        mlShipping: mlTotalShipping,
        mlTaxWithholdings: mlTotalTax,
        mlNet: mlTotalNet,
        mlSales: mlTotalSale,
        mlOrderCount,
        mlCommissionRate,
        // Itemized for display
        items: [
          ...(mlTotalCommission > 0 ? [{
            name: "Comisiones MercadoLibre",
            amount: mlTotalCommission,
            detail: `${mlOrderCount} ventas, tasa promedio ${mlCommissionRate}%`,
            source: "ml_commissions",
          }] : []),
          ...(mlTotalShipping > 0 ? [{
            name: "Envios cobrados por ML (Mercado Envios)",
            amount: mlTotalShipping,
            detail: "Costo de Mercado Envios descontado de las ventas",
            source: "ml_commissions",
          }] : []),
          ...(mlTotalTax > 0 ? [{
            name: "Retenciones impositivas ML",
            amount: mlTotalTax,
            detail: "IIBB, IVA, Ganancias retenidos por MercadoLibre",
            source: "ml_commissions",
          }] : []),
        ],
      },
      merma: {
        cancelledCount,
        cancelledValue,
        cancelledPreDispatch: { count: cancelledPreCount, value: cancelledPreValue },
        cancelledPostDispatch: { count: cancelledPostCount, value: cancelledPostValue },
        returnedCount,
        returnedValue,
        // Real cost impact: pre-dispatch cancellations = $0 product loss (only time/opportunity)
        // Post-dispatch cancellations + returns = actual loss (shipping + potential product loss)
        totalLost: cancelledPostValue + returnedValue,
        totalLostIncludingPre: cancelledValue + returnedValue,
        totalOrders,
        totalValue,
        cancelledRate: totalOrders > 0 ? ((cancelledCount / totalOrders) * 100).toFixed(1) : "0",
        returnedRate: totalOrders > 0 ? ((returnedCount / totalOrders) * 100).toFixed(1) : "0",
        items: [
          ...(cancelledPreCount > 0 ? [{
            name: "Cancelaciones pre-despacho",
            amount: cancelledPreValue,
            count: cancelledPreCount,
            detail: `${cancelledPreCount} ordenes — sin perdida de producto ni envio`,
            impactType: "low" as const,
            source: "orders",
          }] : []),
          ...(cancelledPostCount > 0 ? [{
            name: "Cancelaciones post-despacho",
            amount: cancelledPostValue,
            count: cancelledPostCount,
            detail: `${cancelledPostCount} ordenes — incluye costo de envio perdido`,
            impactType: "high" as const,
            source: "orders",
          }] : []),
          ...(returnedCount > 0 ? [{
            name: "Devoluciones",
            amount: returnedValue,
            count: returnedCount,
            detail: `${returnedCount} ordenes (${totalOrders > 0 ? ((returnedCount / totalOrders) * 100).toFixed(1) : 0}% del total)`,
            impactType: "high" as const,
            source: "orders",
          }] : []),
        ],
      },
    });
  } catch (error: any) {
    console.error("Auto-costs calculation error:", error);
    return NextResponse.json(
      { error: "Error calculando costos automaticos", details: error.message },
      { status: 500 }
    );
  }
}
