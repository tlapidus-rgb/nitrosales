// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/settings/custom-roles — Fase 7 QA
// ═══════════════════════════════════════════════════════════════════
// GET: lista roles custom activos de la org.
// POST: crear nuevo rol custom.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import { requirePermission } from "@/lib/permission-guard";
import { getServerSession } from "next-auth";
import {
  sanitizeRoleSlug,
  normalizeCustomPermissions,
  SECTIONS,
  validateLevel,
  type Section,
  type AccessLevel,
} from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const check = await requirePermission("settings_team", "read");
    if (!check.allowed) return check.response!;
    const orgId = await getOrganizationId();
    const roles = await prisma.customRole.findMany({
      where: { organizationId: orgId, isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        color: true,
        icon: true,
        permissions: true,
        createdAt: true,
        updatedAt: true,
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { users: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ roles, count: roles.length });
  } catch (error: any) {
    console.error("[custom-roles GET] error:", error);
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const check = await requirePermission("settings_team", "admin");
    if (!check.allowed) return check.response!;
    const orgId = await getOrganizationId();
    const session = await getServerSession();
    const email = session?.user?.email;
    const creator = email
      ? await prisma.user.findUnique({
          where: { email },
          select: { id: true },
        })
      : null;

    const body = await req.json();
    const name = (body?.name ?? "").trim();
    const description = typeof body?.description === "string" ? body.description.slice(0, 280) : null;
    const color = typeof body?.color === "string" ? body.color : null;
    const icon = typeof body?.icon === "string" ? body.icon.slice(0, 40) : null;
    const permissionsRaw = body?.permissions ?? {};

    if (!name || name.length < 2 || name.length > 60) {
      return NextResponse.json(
        { error: "Nombre debe tener 2-60 caracteres" },
        { status: 400 }
      );
    }
    if (color && !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) {
      return NextResponse.json(
        { error: "color invalido (usa #RRGGBB)" },
        { status: 400 }
      );
    }
    // Validar permisos
    for (const sec of SECTIONS) {
      const v = (permissionsRaw as any)[sec.key];
      if (v !== undefined && !validateLevel(v)) {
        return NextResponse.json(
          { error: `Nivel invalido para ${sec.key}: ${v}` },
          { status: 400 }
        );
      }
    }
    const permissions = normalizeCustomPermissions(permissionsRaw);
    const slug = sanitizeRoleSlug(name);
    if (slug.length < 2) {
      return NextResponse.json(
        { error: "Nombre invalido (slug demasiado corto post-sanitize)" },
        { status: 400 }
      );
    }

    const created = await prisma.customRole.create({
      data: {
        organizationId: orgId,
        name,
        slug,
        description,
        color,
        icon,
        permissions,
        createdById: creator?.id ?? null,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        color: true,
        icon: true,
        permissions: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ ok: true, role: created });
  } catch (error: any) {
    console.error("[custom-roles POST] error:", error);
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
