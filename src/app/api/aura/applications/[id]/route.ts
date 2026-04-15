export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Decidir sobre una aplicación
// ══════════════════════════════════════════════════════════════
// PATCH /api/aura/applications/[id]
// Body: { status: "APPROVED" | "REJECTED" | "PENDING", notes?: string }
//
// Si se aprueba: crea un Influencer con código auto-generado a partir
// del nombre (kebab) y commissionPercent 10% por defecto.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

function slugifyCode(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 20);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const org = await getOrganization(req);
    const id = params.id;
    const body = await req.json();
    const status = body.status as string;
    const notes = typeof body.notes === "string" ? body.notes : undefined;

    if (!["APPROVED", "REJECTED", "PENDING"].includes(status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }

    const existing = await prisma.influencerApplication.findFirst({
      where: { id, organizationId: org.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let createdInfluencerId: string | null = null;
    if (status === "APPROVED" && existing.status !== "APPROVED") {
      // generar código único a partir del nombre
      const base = slugifyCode(existing.name) || "creator";
      let code = base;
      let tries = 0;
      while (tries < 20) {
        const clash = await prisma.influencer.findUnique({
          where: {
            organizationId_code: { organizationId: org.id, code },
          },
          select: { id: true },
        });
        if (!clash) break;
        tries++;
        code = `${base}${tries}`;
      }

      const created = await prisma.influencer.create({
        data: {
          organizationId: org.id,
          name: existing.name,
          code,
          email: existing.email,
          commissionPercent: 10,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      createdInfluencerId = created.id;
    }

    const updated = await prisma.influencerApplication.update({
      where: { id },
      data: {
        status,
        reviewedAt: status !== "PENDING" ? new Date() : null,
        ...(notes !== undefined ? { notes } : {}),
      },
    });

    return NextResponse.json({
      ok: true,
      application: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        reviewedAt: updated.reviewedAt ? updated.reviewedAt.toISOString() : null,
      },
      createdInfluencerId,
    });
  } catch (e: any) {
    console.error("[aura/applications/[id] PATCH] error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Internal error" },
      { status: 500 }
    );
  }
}
