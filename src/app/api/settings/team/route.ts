// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/settings/team — Fase 7d + Fase 7 QA (custom roles)
// ═══════════════════════════════════════════════════════════════════
// GET: lista miembros + invitaciones + roles custom activos.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const orgId = await getOrganizationId();

    const [members, invitations, customRoles] = await Promise.all([
      prisma.user.findMany({
        where: { organizationId: orgId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          customRoleId: true,
          customRole: {
            select: { id: true, name: true, color: true, icon: true },
          },
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
          token: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.customRole.findMany({
        where: { organizationId: orgId, isActive: true },
        select: {
          id: true,
          name: true,
          slug: true,
          color: true,
          icon: true,
          description: true,
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    return NextResponse.json({
      members,
      invitations,
      customRoles,
      counts: {
        members: members.length,
        pending: invitations.filter((i) => i.status === "PENDING").length,
        customRoles: customRoles.length,
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
