import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/finance/shipping-rates/carriers
 *
 * Returns distinct carrier + service combinations found in real orders.
 * Used to populate the dropdown before downloading/importing rate templates.
 */
export async function GET() {
  const orgId = await getOrganizationId();

  try {
    const carriers = await prisma.$queryRaw<
      Array<{ carrier: string; service: string; order_count: string }>
    >`
      SELECT
        "shippingCarrier" as carrier,
        "shippingService" as service,
        COUNT(*)::text as order_count
      FROM orders
      WHERE "organizationId" = ${orgId}
        AND "shippingCarrier" IS NOT NULL
        AND "shippingCarrier" != ''
        AND status NOT IN ('CANCELLED', 'RETURNED')
      GROUP BY "shippingCarrier", "shippingService"
      ORDER BY COUNT(*) DESC
    `;

    return NextResponse.json({
      carriers: carriers.map((c) => ({
        carrier: c.carrier,
        service: c.service,
        orderCount: parseInt(c.order_count),
      })),
    });
  } catch (error: any) {
    console.error("Error fetching carriers:", error);
    return NextResponse.json(
      { error: "Error obteniendo carriers", details: error.message },
      { status: 500 }
    );
  }
}
