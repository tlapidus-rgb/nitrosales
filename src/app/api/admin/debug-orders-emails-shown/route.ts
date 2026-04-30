// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/debug-orders-emails-shown?orgId=X&key=Y
// ══════════════════════════════════════════════════════════════
// Muestra 20 ordenes VTEX recientes con el email que se lee desde
// la MISMA query del dashboard de pedidos (customers.email).
// Asi vemos si lo que Tomy ve en el dashboard coincide o no con
// lo que dice mi diagnostico.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
const KEY = "nitrosales-secret-key-2024-production";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const orgId = url.searchParams.get("orgId");

    const allowed = key === KEY ? true : await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!orgId) return NextResponse.json({ error: "orgId requerido" }, { status: 400 });

    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT
         o."externalId",
         o."orderDate",
         o."source",
         o."totalValue",
         o."customerId",
         c."firstName",
         c."lastName",
         c."email" as customer_email
       FROM "orders" o
       LEFT JOIN "customers" c ON c."id" = o."customerId"
       WHERE o."organizationId" = $1
         AND o."source" = 'VTEX'
       ORDER BY o."orderDate" DESC
       LIMIT 20`,
      orgId,
    );

    // Stats globales sobre TODA la tabla VTEX para esa org
    const stats: any[] = await prisma.$queryRawUnsafe(
      `SELECT
         COUNT(*)::int as total_orders_vtex,
         COUNT(*) FILTER (WHERE c."email" IS NOT NULL AND c."email" != '')::int as orders_with_customer_email,
         COUNT(*) FILTER (WHERE c."email" IS NULL OR c."email" = '')::int as orders_without_customer_email
       FROM "orders" o
       LEFT JOIN "customers" c ON c."id" = o."customerId"
       WHERE o."organizationId" = $1 AND o."source" = 'VTEX'`,
      orgId,
    );

    const withEmail = rows.filter((r) => r.customer_email && r.customer_email !== "").length;
    const withoutEmail = rows.length - withEmail;

    return NextResponse.json({
      ok: true,
      orgId,
      sampleSize: rows.length,
      sampleStats: { withEmail, withoutEmail },
      globalStats: stats[0],
      rows: rows.map((r) => ({
        externalId: r.externalId,
        orderDate: r.orderDate,
        source: r.source,
        firstName: r.firstName,
        lastName: r.lastName,
        customerEmail: r.customer_email,
        emailIsEmpty: !r.customer_email || r.customer_email === "",
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
