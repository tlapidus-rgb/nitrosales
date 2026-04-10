export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min for index creation

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (key !== "nitrosales-secret-key-2024-production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const log: string[] = [];
  const start = Date.now();

  try {
    // Order items indexes (critical for LATERAL JOIN + aggregations)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "order_items_orderId_idx" ON order_items ("orderId")`);
    log.push("order_items_orderId_idx: OK");

    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "order_items_productId_idx" ON order_items ("productId")`);
    log.push("order_items_productId_idx: OK");

    // Orders composite index
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "orders_organizationId_source_orderDate_idx" ON orders ("organizationId", "source", "orderDate")`);
    log.push("orders_organizationId_source_orderDate_idx: OK");

    // Orders status index
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "orders_status_idx" ON orders ("status")`);
    log.push("orders_status_idx: OK");

    // Orders customerId index
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "orders_customerId_idx" ON orders ("customerId")`);
    log.push("orders_customerId_idx: OK");

    // Products organizationId + externalId (for upserts)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "products_orgId_extId_idx" ON products ("organizationId", "externalId")`);
    log.push("products_orgId_extId_idx: OK");

    // Update query planner statistics
    await prisma.$executeRawUnsafe(`ANALYZE order_items`);
    log.push("ANALYZE order_items: OK");
    await prisma.$executeRawUnsafe(`ANALYZE orders`);
    log.push("ANALYZE orders: OK");
    await prisma.$executeRawUnsafe(`ANALYZE products`);
    log.push("ANALYZE products: OK");

    // Check table sizes
    const counts: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        (SELECT COUNT(*)::int FROM orders) AS orders_count,
        (SELECT COUNT(*)::int FROM order_items) AS items_count,
        (SELECT COUNT(*)::int FROM products) AS products_count,
        (SELECT COUNT(*)::int FROM customers) AS customers_count
    `);
    log.push(`Table sizes: ${JSON.stringify(counts[0])}`);

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    return NextResponse.json({ ok: true, elapsed: `${elapsed}s`, log });
  } catch (err: any) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    return NextResponse.json({ ok: false, elapsed: `${elapsed}s`, error: err.message, log }, { status: 500 });
  }
}
