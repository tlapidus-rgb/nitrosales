// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/settings/permissions — Fase 7 fix
// ═══════════════════════════════════════════════════════════════════
// GET: devuelve la matriz actual (defaults mergeados con overrides).
// PUT: guarda overrides en organization.settings.rolePermissions.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import {
  DEFAULT_PERMISSIONS,
  mergePermissions,
  SECTIONS,
  validateLevel,
  type PermissionsMatrix,
  type Role,
  type Section,
} from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const orgId = await getOrganizationId();
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });
    const settings = (org?.settings as Record<string, unknown>) || {};
    const override = settings.rolePermissions as Partial<PermissionsMatrix> | null;
    const matrix = mergePermissions(override);

    return NextResponse.json({
      matrix,
      defaults: DEFAULT_PERMISSIONS,
      sections: SECTIONS,
    });
  } catch (error: any) {
    console.error("[settings/permissions GET] error:", error);
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const orgId = await getOrganizationId();
    const body = await req.json();
    const incoming = body?.matrix as PermissionsMatrix | undefined;

    if (!incoming || typeof incoming !== "object") {
      return NextResponse.json({ error: "matrix requerido" }, { status: 400 });
    }

    // Validar shape
    const cleaned: PermissionsMatrix = {
      OWNER: {} as any,
      ADMIN: {} as any,
      MEMBER: {} as any,
    };
    for (const role of ["OWNER", "ADMIN", "MEMBER"] as Role[]) {
      const rolePerms = incoming[role];
      if (!rolePerms || typeof rolePerms !== "object") {
        return NextResponse.json(
          { error: `matrix.${role} invalido` },
          { status: 400 }
        );
      }
      for (const sec of SECTIONS) {
        const v = (rolePerms as any)[sec.key];
        if (!validateLevel(v)) {
          return NextResponse.json(
            {
              error: `Nivel invalido para ${role}.${sec.key}: ${v} (debe ser none/read/write/admin)`,
            },
            { status: 400 }
          );
        }
        cleaned[role][sec.key] = v;
      }
    }

    // Invariante: OWNER siempre admin en todo
    for (const sec of SECTIONS) {
      cleaned.OWNER[sec.key] = "admin";
    }

    const existing = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });
    const currentSettings = (existing?.settings as Record<string, unknown>) || {};

    await prisma.organization.update({
      where: { id: orgId },
      data: {
        settings: {
          ...currentSettings,
          rolePermissions: cleaned,
        },
      },
    });

    return NextResponse.json({ ok: true, matrix: cleaned });
  } catch (error: any) {
    console.error("[settings/permissions PUT] error:", error);
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
