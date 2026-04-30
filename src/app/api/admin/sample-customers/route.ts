// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/sample-customers?orgId=X&key=Y
// ══════════════════════════════════════════════════════════════
// Devuelve samples de customers de una org separados por:
//   - Con email (5 samples)
//   - Sin email (5 samples)
//   - Email formato enmascarado VTEX (5 samples)
//   - Email formato real (5 samples)
// Para comparar entre orgs y entender de donde sale la diferencia.
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

    const withEmail: any[] = await prisma.$queryRawUnsafe(
      `SELECT "id", "externalId", "email", "firstName", "lastName", "createdAt"
       FROM "customers"
       WHERE "organizationId" = $1 AND "email" IS NOT NULL
       ORDER BY "createdAt" DESC LIMIT 5`,
      orgId,
    );

    const withoutEmail: any[] = await prisma.$queryRawUnsafe(
      `SELECT "id", "externalId", "email", "firstName", "lastName", "createdAt"
       FROM "customers"
       WHERE "organizationId" = $1 AND "email" IS NULL
       ORDER BY "createdAt" DESC LIMIT 5`,
      orgId,
    );

    const masked: any[] = await prisma.$queryRawUnsafe(
      `SELECT "id", "externalId", "email", "firstName", "createdAt"
       FROM "customers"
       WHERE "organizationId" = $1 AND "email" LIKE '%.ct.vtex.com.br'
       LIMIT 5`,
      orgId,
    );

    // Distribuciones
    const total = await prisma.customer.count({ where: { organizationId: orgId } });
    const totalWithEmail = await prisma.customer.count({
      where: { organizationId: orgId, email: { not: null } },
    });
    const totalMasked: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int as n FROM "customers"
       WHERE "organizationId" = $1 AND "email" LIKE '%.ct.vtex.com.br'`,
      orgId,
    );
    const totalRealEmail: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int as n FROM "customers"
       WHERE "organizationId" = $1
         AND "email" IS NOT NULL
         AND "email" NOT LIKE '%.ct.vtex.com.br'`,
      orgId,
    );

    return NextResponse.json({
      ok: true,
      orgId,
      stats: {
        total,
        withEmail: totalWithEmail,
        withMaskedEmail: Number(totalMasked[0]?.n || 0),
        withRealEmail: Number(totalRealEmail[0]?.n || 0),
        withoutEmail: total - totalWithEmail,
      },
      samples: {
        withEmail,
        withoutEmail,
        masked,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
