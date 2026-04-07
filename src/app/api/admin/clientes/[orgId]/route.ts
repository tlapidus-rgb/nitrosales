// ══════════════════════════════════════════════════════════════
// Admin · Detalle de un Cliente (Organization)
// ──────────────────────────────────────────────────────────────
// GET /api/admin/clientes/[orgId]
// Devuelve metadata + stats de UNA organización. Read-only.
// Gateado por isInternalUser.
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MS_DAY = 24 * 60 * 60 * 1000;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { orgId } = await params;

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        createdAt: true,
        _count: { select: { users: true } },
      },
    });

    if (!org) {
      return NextResponse.json({ ok: false, error: "Organization not found" }, { status: 404 });
    }

    const since7d = new Date(Date.now() - 7 * MS_DAY);
    const since24h = new Date(Date.now() - MS_DAY);

    const [lastEvent, events7d, events24h, totalVisitors, identifiedVisitors, totalPurchases7d] = await Promise.all([
      prisma.pixelEvent.findFirst({
        where: { organizationId: orgId },
        orderBy: { receivedAt: "desc" },
        select: { receivedAt: true },
      }),
      prisma.pixelEvent.count({
        where: { organizationId: orgId, receivedAt: { gte: since7d } },
      }),
      prisma.pixelEvent.count({
        where: { organizationId: orgId, receivedAt: { gte: since24h } },
      }),
      prisma.pixelVisitor.count({
        where: { organizationId: orgId },
      }),
      prisma.pixelVisitor.count({
        where: { organizationId: orgId, email: { not: null } },
      }),
      prisma.pixelEvent.count({
        where: { organizationId: orgId, type: "PURCHASE", receivedAt: { gte: since7d } },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      cliente: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        plan: org.plan,
        createdAt: org.createdAt.toISOString(),
        users: org._count.users,
        lastEventAt: lastEvent?.receivedAt.toISOString() ?? null,
        events7d,
        events24h,
        totalVisitors,
        identifiedVisitors,
        totalPurchases7d,
      },
      computedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[/api/admin/clientes/[orgId]]", e);
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
