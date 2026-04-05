// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

// GET /api/ltv/customer-detail?id=xxx
// Returns order history + prediction details for a single customer

export async function GET(request: NextRequest) {
  try {
    const orgId = await getOrganizationId();
    const customerId = request.nextUrl.searchParams.get("id");
    if (!customerId) {
      return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
    }

    // Fetch orders for this customer
    const orders = await prisma.$queryRawUnsafe<
      Array<{
        order_id: string;
        external_id: string | null;
        order_date: Date;
        total_value: string;
        status: string;
        items_count: number;
        top_products: string;
      }>
    >(
      `SELECT
        o.id AS order_id,
        o."externalId" AS external_id,
        o."orderDate" AS order_date,
        o."totalValue"::text AS total_value,
        o.status,
        COALESCE((
          SELECT COUNT(*)::int FROM order_items oi WHERE oi."orderId" = o.id
        ), 0) AS items_count,
        COALESCE((
          SELECT string_agg(sub_prod.prod_name, ', ')
          FROM (
            SELECT COALESCE(p.name, 'Producto') AS prod_name
            FROM order_items oi
            LEFT JOIN products p ON p.id = oi."productId"
            WHERE oi."orderId" = o.id
            ORDER BY oi.quantity DESC
            LIMIT 5
          ) sub_prod
        ), '') AS top_products
      FROM orders o
      WHERE o."customerId" = $1
        AND o."organizationId" = $2
        AND o.source != 'MELI'
      ORDER BY o."orderDate" ASC`,
      customerId,
      orgId
    );

    // Fetch prediction details
    const prediction = await prisma.$queryRawUnsafe<
      Array<{
        segment: string;
        ltv_90d: string;
        ltv_365d: string;
        confidence: string;
        channel: string;
        features: any;
      }>
    >(
      `SELECT
        "segmentBucket" AS segment,
        "predictedLtv90d"::text AS ltv_90d,
        "predictedLtv365d"::text AS ltv_365d,
        confidence::text AS confidence,
        "acquisitionChannel" AS channel,
        "inputFeatures" AS features
      FROM customer_ltv_predictions
      WHERE "customerId" = $1 AND "organizationId" = $2`,
      customerId,
      orgId
    );

    return NextResponse.json({
      orders: orders.map((o) => ({
        orderId: o.order_id,
        externalId: o.external_id,
        date: o.order_date,
        total: Math.round(Number(o.total_value)),
        status: o.status,
        itemsCount: o.items_count,
        products: o.top_products,
      })),
      prediction: prediction[0]
        ? {
            segment: prediction[0].segment,
            predictedLtv90d: Math.round(Number(prediction[0].ltv_90d)),
            predictedLtv365d: Math.round(Number(prediction[0].ltv_365d)),
            confidence: Number(prediction[0].confidence),
            channel: prediction[0].channel,
            features: prediction[0].features,
          }
        : null,
    });
  } catch (error: any) {
    console.error("[LTV Customer Detail] Error:", error);
    return NextResponse.json(
      { error: "Error fetching customer detail", detail: error.message },
      { status: 500 }
    );
  }
}
