// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/settings/custom-roles/[id] — Fase 7 QA
// ═══════════════════════════════════════════════════════════════════
// PUT: editar custom role (name/description/color/icon/permissions).
// DELETE: soft delete (isActive=false) + desasigna users con este
//         customRoleId (se les setea a null — quedan solo con base role).
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import {
  sanitizeRoleSlug,
  normalizeCustomPermissions,
  SECTIONS,
  validateLevel,
} from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const orgId = await getOrganizationId();
    const { id } = params;
    const body = await req.json();

    const existing = await prisma.customRole.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Rol no encontrado" },
        { status: 404 }
      );
    }

    const updateData: any = {};

    if (body.name != null) {
      const name = String(body.name).trim();
      if (name.length < 2 || name.length > 60) {
        return NextResponse.json(
          { error: "Nombre debe tener 2-60 caracteres" },
          { status: 400 }
        );
      }
      updateData.name = name;
      updateData.slug = sanitizeRoleSlug(name);
    }
    if (body.description !== undefined) {
      updateData.description =
        typeof body.description === "string"
          ? body.description.slice(0, 280)
          : null;
    }
    if (body.color !== undefined) {
      if (body.color && !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(body.color)) {
        return NextResponse.json(
          { error: "color invalido" },
          { status: 400 }
        );
      }
      updateData.color = body.color || null;
    }
    if (body.icon !== undefined) {
      updateData.icon = body.icon ? String(body.icon).slice(0, 40) : null;
    }
    if (body.permissions !== undefined) {
      for (const sec of SECTIONS) {
        const v = (body.permissions as any)?.[sec.key];
        if (v !== undefined && !validateLevel(v)) {
          return NextResponse.json(
            { error: `Nivel invalido para ${sec.key}: ${v}` },
            { status: 400 }
          );
        }
      }
      updateData.permissions = normalizeCustomPermissions(body.permissions);
    }

    const updated = await prisma.customRole.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        color: true,
        icon: true,
        permissions: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ ok: true, role: updated });
  } catch (error: any) {
    console.error("[custom-roles PUT] error:", error);
    if (error?.code === "P2002") {
      return NextResponse.json(
        { error: "Ya existe un rol con ese nombre" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const orgId = await getOrganizationId();
    const { id } = params;

    const existing = await prisma.customRole.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true, name: true, isActive: true, _count: { select: { users: true } } },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Rol no encontrado" },
        { status: 404 }
      );
    }

    // Transaccion: desasignar + desactivar
    await prisma.$transaction(async (tx) => {
      if (existing._count.users > 0) {
        await tx.user.updateMany({
          where: { organizationId: orgId, customRoleId: id },
          data: { customRoleId: null },
        });
      }
      await tx.customRole.update({
        where: { id },
        data: { isActive: false },
      });
    });

    return NextResponse.json({
      ok: true,
      deletedId: id,
      usersReassigned: existing._count.users,
      message:
        existing._count.users > 0
          ? `${existing._count.users} miembro(s) reasignado(s) a su rol base. El rol fue desactivado.`
          : "Rol desactivado.",
    });
  } catch (error: any) {
    console.error("[custom-roles DELETE] error:", error);
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
