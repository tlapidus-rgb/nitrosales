// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/onboardings/[id]
// ══════════════════════════════════════════════════════════════
// Detalle de una solicitud. Devuelve TODOS los campos (excepto las
// credentials desencriptadas; se desencriptan solo al momento de activar).
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    const rows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT * FROM "onboarding_requests" WHERE "id" = $1 LIMIT 1`,
      id
    );

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    const r = rows[0];

    // Sanitizar: NO devolver raw encrypted blobs (solo indicar si existen)
    return NextResponse.json({
      ok: true,
      request: {
        id: r.id,
        status: r.status,
        token: r.token,
        companyName: r.companyName,
        proposedSlug: r.proposedSlug,
        cuit: r.cuit,
        industry: r.industry,
        storeUrl: r.storeUrl,
        contactName: r.contactName,
        contactEmail: r.contactEmail,
        contactPhone: r.contactPhone,
        contactWhatsapp: r.contactWhatsapp,
        vtexAccountName: r.vtexAccountName,
        hasVtexCredentials: !!r.vtexAppKeyEncrypted && !!r.vtexAppTokenEncrypted,
        mlUsername: r.mlUsername,
        metaAdAccountId: r.metaAdAccountId,
        hasMetaCredentials: !!r.metaAccessTokenEncrypted,
        googleAdsCustomerId: r.googleAdsCustomerId,
        adminNotes: r.adminNotes,
        progressStage: r.progressStage,
        createdOrgId: r.createdOrgId,
        activatedAt: r.activatedAt ? new Date(r.activatedAt).toISOString() : null,
        createdAt: new Date(r.createdAt).toISOString(),
        updatedAt: new Date(r.updatedAt).toISOString(),
      },
    });
  } catch (error: any) {
    console.error("[admin/onboardings GET id] error:", error);
    return NextResponse.json(
      { error: "Error al cargar solicitud" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    // Solo permitir updates acotados
    const updates: string[] = [];
    const values: any[] = [id];
    let idx = 2;

    if (body.adminNotes !== undefined) {
      updates.push(`"adminNotes" = $${idx++}`);
      values.push(String(body.adminNotes).slice(0, 5000));
    }
    if (body.progressStage !== undefined) {
      updates.push(`"progressStage" = $${idx++}`);
      values.push(String(body.progressStage).slice(0, 80));
    }
    if (body.status !== undefined) {
      const validStatuses = ["PENDING", "IN_PROGRESS", "NEEDS_INFO", "ACTIVE", "REJECTED"];
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json({ error: "status inválido" }, { status: 400 });
      }
      updates.push(`"status" = $${idx++}::"OnboardingStatus"`);
      values.push(body.status);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
    }

    updates.push(`"updatedAt" = NOW()`);

    await prisma.$executeRawUnsafe(
      `UPDATE "onboarding_requests" SET ${updates.join(", ")} WHERE "id" = $1`,
      ...values
    );

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("[admin/onboardings PATCH] error:", error);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}
