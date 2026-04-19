// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/settings/team — Fase 7d
// ═══════════════════════════════════════════════════════════════════
// GET: lista miembros activos + invitaciones pendientes.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const orgId = await getOrganizationId();

    const [members, invitations] = await Promise.all([
      prisma.user.findMany({
        where: { organizationId: orgId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      }),
      prisma.teamInvitation.findMany({
        where: {
          organizationId: orgId,
          status: { in: ["PENDING", "EXPIRED"] },
        },
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          expiresAt: true,
          createdAt: true,
          note: true,
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({
      members,
      invitations,
      counts: {
        members: members.length,
        pending: invitations.filter((i) => i.status === "PENDING").length,
      },
    });
  } catch (error: any) {
    console.error("[settings/team GET] error:", error);
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
