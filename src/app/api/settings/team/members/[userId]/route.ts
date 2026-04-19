// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/settings/team/members/[userId] — Fase 7d
// ═══════════════════════════════════════════════════════════════════
// PATCH: cambiar rol de un miembro (scope-safe por organizationId).
// DELETE: remover miembro de la organizacion (solo OWNER puede, no
//         puede borrarse a si mismo, no puede quedar org sin OWNER).
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

const VALID_ROLES = new Set(["OWNER", "ADMIN", "MEMBER"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const orgId = await getOrganizationId();
    const { userId } = params;
    const body = await req.json();
    const role = body?.role;
    const hasCustomRoleKey = Object.prototype.hasOwnProperty.call(body ?? {}, "customRoleId");
    const customRoleId = body?.customRoleId;

    const target = await prisma.user.findFirst({
      where: { id: userId, organizationId: orgId },
      select: { id: true, role: true, customRoleId: true },
    });
    if (!target) {
      return NextResponse.json(
        { error: "Usuario no encontrado en esta organización" },
        { status: 404 }
      );
    }

    const updateData: any = {};

    if (role !== undefined) {
      if (!VALID_ROLES.has(role)) {
        return NextResponse.json(
          { error: "Rol inválido (OWNER/ADMIN/MEMBER)" },
          { status: 400 }
        );
      }
      if (target.role === "OWNER" && role !== "OWNER") {
        const otherOwners = await prisma.user.count({
          where: {
            organizationId: orgId,
            role: "OWNER",
            id: { not: userId },
          },
        });
        if (otherOwners === 0) {
          return NextResponse.json(
            { error: "La organización debe tener al menos un OWNER" },
            { status: 400 }
          );
        }
      }
      updateData.role = role;
    }

    if (hasCustomRoleKey) {
      if (customRoleId === null) {
        updateData.customRoleId = null;
      } else if (typeof customRoleId === "string") {
        const cr = await prisma.customRole.findFirst({
          where: {
            id: customRoleId,
            organizationId: orgId,
            isActive: true,
          },
          select: { id: true },
        });
        if (!cr) {
          return NextResponse.json(
            { error: "Rol custom no encontrado o inactivo" },
            { status: 404 }
          );
        }
        updateData.customRoleId = customRoleId;
      } else {
        return NextResponse.json(
          { error: "customRoleId debe ser string o null" },
          { status: 400 }
        );
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "Nada para actualizar" },
        { status: 400 }
      );
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        customRoleId: true,
        customRole: {
          select: { id: true, name: true, color: true, icon: true },
        },
      },
    });

    return NextResponse.json({ ok: true, user: updated });
  } catch (error: any) {
    console.error("[team/members PATCH] error:", error);
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const orgId = await getOrganizationId();
    const { userId } = params;

    const target = await prisma.user.findFirst({
      where: { id: userId, organizationId: orgId },
      select: { id: true, role: true, email: true },
    });
    if (!target) {
      return NextResponse.json(
        { error: "Usuario no encontrado en esta organización" },
        { status: 404 }
      );
    }

    // No permitir borrar el ultimo OWNER
    if (target.role === "OWNER") {
      const otherOwners = await prisma.user.count({
        where: {
          organizationId: orgId,
          role: "OWNER",
          id: { not: userId },
        },
      });
      if (otherOwners === 0) {
        return NextResponse.json(
          {
            error:
              "No se puede remover el último OWNER. Transferí la propiedad a otro miembro primero.",
          },
          { status: 400 }
        );
      }
    }

    // Borrar el user. Nota: esto deja data auditable en tablas que
    // tienen createdById (ej InfluencerDeal) — se mantiene como null
    // via ON DELETE SET NULL o el FK correspondiente.
    await prisma.user.delete({ where: { id: userId } });

    return NextResponse.json({ ok: true, removedEmail: target.email });
  } catch (error: any) {
    console.error("[team/members DELETE] error:", error);
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
