// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/debug-vtex-emails-by-channel?orgId=X&key=Y
// ══════════════════════════════════════════════════════════════
// Cuenta orders y customers VTEX con/sin email separando por
// canal (web normal vs marketplaces FVG-Fravega y BPR-Banco Pcia).
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

    // Orders por canal: web normal (sin prefijo) vs FVG vs BPR
    const ordersByChannel: any[] = await prisma.$queryRawUnsafe(
      `SELECT
         CASE
           WHEN o."externalId" LIKE 'FVG-%' THEN 'FVG_FRAVEGA'
           WHEN o."externalId" LIKE 'BPR-%' THEN 'BPR_BANCO_PROVINCIA'
           ELSE 'WEB'
         END as channel,
         COUNT(*)::int as total,
         COUNT(*) FILTER (WHERE c."email" IS NOT NULL AND c."email" != '')::int as with_email,
         COUNT(*) FILTER (WHERE c."email" IS NULL OR c."email" = '')::int as without_email
       FROM "orders" o
       LEFT JOIN "customers" c ON c."id" = o."customerId"
       WHERE o."organizationId" = $1 AND o."source" = 'VTEX'
       GROUP BY 1
       ORDER BY total DESC`,
      orgId,
    );

    // Customers unicos asociados a orders WEB (sin marketplace)
    const customersWeb: any[] = await prisma.$queryRawUnsafe(
      `SELECT
         COUNT(DISTINCT c.id)::int as total,
         COUNT(DISTINCT c.id) FILTER (WHERE c."email" IS NOT NULL AND c."email" != '')::int as with_email,
         COUNT(DISTINCT c.id) FILTER (WHERE c."email" IS NULL OR c."email" = '')::int as without_email
       FROM "orders" o
       INNER JOIN "customers" c ON c."id" = o."customerId"
       WHERE o."organizationId" = $1
         AND o."source" = 'VTEX'
         AND o."externalId" NOT LIKE 'FVG-%'
         AND o."externalId" NOT LIKE 'BPR-%'`,
      orgId,
    );

    // Stats general (todos los customers VTEX, sin filtrar canal)
    const customersAll: any[] = await prisma.$queryRawUnsafe(
      `SELECT
         COUNT(DISTINCT c.id)::int as total,
         COUNT(DISTINCT c.id) FILTER (WHERE c."email" IS NOT NULL AND c."email" != '')::int as with_email
       FROM "orders" o
       INNER JOIN "customers" c ON c."id" = o."customerId"
       WHERE o."organizationId" = $1 AND o."source" = 'VTEX'`,
      orgId,
    );

    return NextResponse.json({
      ok: true,
      orgId,
      ordersByChannel: ordersByChannel.map((r) => ({
        channel: r.channel,
        total: r.total,
        withEmail: r.with_email,
        withoutEmail: r.without_email,
        emailPct: r.total > 0 ? Math.round((r.with_email / r.total) * 100) : 0,
      })),
      customers: {
        webOnly: {
          total: Number(customersWeb[0]?.total || 0),
          withEmail: Number(customersWeb[0]?.with_email || 0),
          withoutEmail: Number(customersWeb[0]?.without_email || 0),
          emailPct: Number(customersWeb[0]?.total || 0) > 0
            ? Math.round((Number(customersWeb[0]?.with_email || 0) / Number(customersWeb[0]?.total || 0)) * 100)
            : 0,
        },
        allChannels: {
          total: Number(customersAll[0]?.total || 0),
          withEmail: Number(customersAll[0]?.with_email || 0),
          emailPct: Number(customersAll[0]?.total || 0) > 0
            ? Math.round((Number(customersAll[0]?.with_email || 0) / Number(customersAll[0]?.total || 0)) * 100)
            : 0,
        },
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
