import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // Allow up to 2 minutes for index creation

/**
 * POST /api/setup/ensure-indexes?key=nitrosales-secret-key-2024-production
 *
 * Creates missing performance indexes on the database.
 * Safe to run multiple times (IF NOT EXISTS).
 * Should be called once after deployment.
 */
export async function POST(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (key !== "nitrosales-secret-key-2024-production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Array<{ index: string; status: string }> = [];

  const indexes = [
    {
      name: "idx_orders_org_status_date",
      sql: `CREATE INDEX IF NOT EXISTS idx_orders_org_status_date ON orders ("organizationId", status, "orderDate")`,
    },
    {
      name: "idx_adm_org_plat_date",
      sql: `CREATE INDEX IF NOT EXISTS idx_adm_org_plat_date ON ad_metrics_daily ("organizationId", platform, date)`,
    },
    {
      name: "idx_acmd_org_date",
      sql: `CREATE INDEX IF NOT EXISTS idx_acmd_org_date ON ad_creative_metrics_daily ("organizationId", date)`,
    },
    {
      name: "idx_pattr_org_model_created",
      sql: `CREATE INDEX IF NOT EXISTS idx_pattr_org_model_created ON pixel_attributions ("organizationId", model, "createdAt")`,
    },
    {
      name: "idx_cust_org_first_order",
      sql: `CREATE INDEX IF NOT EXISTS idx_cust_org_first_order ON customers ("organizationId", "firstOrderAt")`,
    },
    {
      name: "idx_oi_order_product",
      sql: `CREATE INDEX IF NOT EXISTS idx_oi_order_product ON order_items ("orderId", "productId")`,
    },
    // ── Tanda 2 (Session 16) — Orders overhaul: fundación de datos ──
    {
      name: "idx_orders_org_status_updated",
      sql: `CREATE INDEX IF NOT EXISTS idx_orders_org_status_updated ON orders ("organizationId", status, "updatedAt")`,
    },
    {
      name: "idx_orders_org_coupon",
      sql: `CREATE INDEX IF NOT EXISTS idx_orders_org_coupon ON orders ("organizationId", "couponCode") WHERE "couponCode" IS NOT NULL`,
    },
    {
      name: "idx_orders_org_delivery_carrier",
      sql: `CREATE INDEX IF NOT EXISTS idx_orders_org_delivery_carrier ON orders ("organizationId", "deliveryType", "shippingCarrier")`,
    },
    {
      name: "idx_orders_org_device",
      sql: `CREATE INDEX IF NOT EXISTS idx_orders_org_device ON orders ("organizationId", "deviceType")`,
    },
    {
      name: "idx_orders_org_channel",
      sql: `CREATE INDEX IF NOT EXISTS idx_orders_org_channel ON orders ("organizationId", channel)`,
    },
    {
      name: "idx_oi_order_cost",
      sql: `CREATE INDEX IF NOT EXISTS idx_oi_order_cost ON order_items ("orderId") INCLUDE ("costPrice", quantity, "totalPrice")`,
    },
  ];

  for (const idx of indexes) {
    try {
      await prisma.$executeRawUnsafe(idx.sql);
      results.push({ index: idx.name, status: "created" });
    } catch (e: any) {
      results.push({ index: idx.name, status: `error: ${e.message}` });
    }
  }

  return NextResponse.json({ results });
}
