// ══════════════════════════════════════════════════════════════
// /api/admin/orgs-list — Lista de orgs para org switcher (S60 EXT-2 BIS)
// ══════════════════════════════════════════════════════════════
// Devuelve todas las orgs (id, name, slug) para que el admin las pueda
// elegir en el dropdown del sidebar y cambiar de vista con view-as-org.
//
// Solo accesible si user es internal (isInternalUser).
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const isAdmin = await isInternalUser();
    if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const orgs = await prisma.organization.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ ok: true, orgs });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
