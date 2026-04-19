// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/settings/api-keys/[id] — Fase 7 QA
// ═══════════════════════════════════════════════════════════════════
// DELETE: revocar API key (soft delete — seta revokedAt).
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const orgId = await getOrganizationId();
    const { id } = params;

    const existing = await prisma.apiKey.findFirst({
      where: { id, organizationId: orgId, revokedAt: null },
      select: { id: true, name: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "API key no encontrada o ya revocada" },
        { status: 404 }
      );
    }

    await prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });

    return NextResponse.json({
      ok: true,
      revokedId: id,
      name: existing.name,
    });
  } catch (error: any) {
    console.error("[api-keys DELETE] error:", error);
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
