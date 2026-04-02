import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/**
 * POST /api/finance/shipping-rates/calculate
 *
 * Matches orders with postal codes against the shipping rate table
 * and writes realShippingCost to each matched order.
 *
 * Logic:
 * - Only processes orders with postalCode set and source = VTEX (or ML Flex in future)
 * - For each order, finds the best matching rate:
 *   1. Exact CP match (postalCodeTo IS NULL AND postalCodeFrom = CP)
 *   2. Range match (postalCodeFrom <= CP AND postalCodeTo >= CP)
 * - Uses raw SQL for efficient bulk update
 */
export async function POST() {
  const ORG_ID = await getOrganizationId();

  try {
    // Step 1: Count orders with postalCode that can be matched
    const ordersWithCP = await prisma.$queryRaw<[{ count: string }]>`
      SELECT COUNT(*)::text as count
      FROM orders o
      WHERE o."organizationId" = ${ORG_ID}
        AND o."postalCode" IS NOT NULL
        AND o."postalCode" != ''
        AND o.status NOT IN ('CANCELLED', 'RETURNED')
    `;
    const totalWithCP = parseInt(ordersWithCP[0].count);

    // Step 2: Get all active rates for this org
    const activeRates = await prisma.shippingRate.count({
      where: { organizationId: ORG_ID, isActive: true },
    });

    if (activeRates === 0) {
      return NextResponse.json({
        matched: 0,
        unmatched: totalWithCP,
        total: totalWithCP,
        message: "No hay tarifas activas. Importa tarifas primero.",
      });
    }

    // Step 3: Update orders with exact CP match (individual CPs)
    const exactMatched = await prisma.$executeRaw`
      UPDATE orders o
      SET "realShippingCost" = sr.cost
      FROM shipping_rates sr
      WHERE o."organizationId" = ${ORG_ID}
        AND sr."organizationId" = ${ORG_ID}
        AND sr."isActive" = true
        AND sr."postalCodeTo" IS NULL
        AND o."postalCode" = sr."postalCodeFrom"
        AND o."postalCode" IS NOT NULL
        AND o.status NOT IN ('CANCELLED', 'RETURNED')
    `;

    // Step 4: Update orders with range match (for orders not yet matched)
    const rangeMatched = await prisma.$executeRaw`
      UPDATE orders o
      SET "realShippingCost" = sub.cost
      FROM (
        SELECT DISTINCT ON (o2.id) o2.id as order_id, sr.cost
        FROM orders o2
        INNER JOIN shipping_rates sr
          ON sr."organizationId" = ${ORG_ID}
          AND sr."isActive" = true
          AND sr."postalCodeTo" IS NOT NULL
          AND o2."postalCode" >= sr."postalCodeFrom"
          AND o2."postalCode" <= sr."postalCodeTo"
        WHERE o2."organizationId" = ${ORG_ID}
          AND o2."postalCode" IS NOT NULL
          AND o2."realShippingCost" IS NULL
          AND o2.status NOT IN ('CANCELLED', 'RETURNED')
        ORDER BY o2.id, (LENGTH(sr."postalCodeTo") - LENGTH(sr."postalCodeFrom")) ASC
      ) sub
      WHERE o.id = sub.order_id
    `;

    const totalMatched = exactMatched + rangeMatched;

    // Step 5: Count remaining unmatched
    const unmatchedResult = await prisma.$queryRaw<[{ count: string }]>`
      SELECT COUNT(*)::text as count
      FROM orders o
      WHERE o."organizationId" = ${ORG_ID}
        AND o."postalCode" IS NOT NULL
        AND o."postalCode" != ''
        AND o."realShippingCost" IS NULL
        AND o.status NOT IN ('CANCELLED', 'RETURNED')
    `;
    const unmatched = parseInt(unmatchedResult[0].count);

    return NextResponse.json({
      matched: totalMatched,
      exactMatched,
      rangeMatched,
      unmatched,
      total: totalWithCP,
      activeRates,
    });
  } catch (error: any) {
    console.error("Shipping rate calculation error:", error);
    return NextResponse.json(
      { error: "Error calculando costos de envio", details: error.message },
      { status: 500 }
    );
  }
}
