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
      sql: `CREATE INDEX IF NOT EXISTS idx_adm_org_plat_date ON ad_metric_daily ("organizationId", platform, date)`,
    },
    {
      name: "idx_acmd_org_date",
      sql: `CREATE INDEX IF NOT EXISTS idx_acmd_org_date ON ad_creative_metric_daily ("organizationId", date)`,
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
