// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/debug-org?orgId=...  (sesión de staff)
// ══════════════════════════════════════════════════════════════
// Debug rapido: devuelve info de una org + sus users.
// Sin clave: devolvía ids y emails de los usuarios de cualquier org, que
// con el secreto filtrado sirven para fabricar una sesión de esa persona.
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const orgId = url.searchParams.get("orgId");

    const allowed = await isInternalUser();
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!orgId) {
      return NextResponse.json({ error: "orgId requerido" }, { status: 400 });
    }

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, slug: true, createdAt: true },
    });

    const users = await prisma.user.findMany({
      where: { organizationId: orgId },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    // Tambien buscar onboarding_requests apuntando a esta org
    const onboardings = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT "id", "companyName", "contactEmail", "status", "createdAt"
       FROM "onboarding_requests"
       WHERE "createdOrgId" = $1
       ORDER BY "createdAt" DESC`,
      orgId,
    );

    return NextResponse.json({
      ok: true,
      org,
      users,
      onboardings,
    });
  } catch (err: any) {
    console.error("[debug-org] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
