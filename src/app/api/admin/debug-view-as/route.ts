// @ts-nocheck
// GET /api/admin/debug-view-as
// Diagnostico del view-as-org: muestra que cookie hay seteada,
// que session resuelve, y si el override esta aplicandose.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const c = await cookies();
    const viewAsCookie = c.get("nitro-view-org")?.value || null;
    const session = await getServerSession(authOptions as any);

    let cookieOrg: { id: string; name: string } | null = null;
    if (viewAsCookie) {
      cookieOrg = await prisma.organization.findUnique({
        where: { id: viewAsCookie },
        select: { id: true, name: true },
      });
    }

    return NextResponse.json({
      ok: true,
      cookie: {
        present: !!viewAsCookie,
        value: viewAsCookie,
        orgFound: cookieOrg,
      },
      session: {
        userEmail: (session as any)?.user?.email,
        organizationId: (session as any)?.user?.organizationId,
        organizationName: (session as any)?.user?.organizationName,
        realOrganizationId: (session as any)?.user?.realOrganizationId,
        realOrganizationName: (session as any)?.user?.realOrganizationName,
        viewingAsOrg: (session as any)?.user?.viewingAsOrg,
      },
      diagnosis:
        viewAsCookie && cookieOrg
          ? (session as any)?.user?.organizationId === viewAsCookie
            ? "OK: cookie y session matchean. Override funcionando."
            : `BUG: cookie tiene ${viewAsCookie} pero session.organizationId es ${(session as any)?.user?.organizationId}. El override NO se aplico.`
          : viewAsCookie && !cookieOrg
            ? `BUG: cookie tiene orgId ${viewAsCookie} pero esa org no existe en DB.`
            : "Sin cookie view-as. Estas viendo tu org real.",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
