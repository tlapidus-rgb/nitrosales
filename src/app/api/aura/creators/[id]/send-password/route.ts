export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — (Re)enviar el link de acceso al creador (Opción B)
// ══════════════════════════════════════════════════════════════
// POST /api/aura/creators/:id/send-password
//
// Recuperación de acceso: manda por mail el LINK de set-password (el creador define
// su propia clave). Reemplaza el flujo viejo de generar/mandar una clave en texto plano
// (S1): acá NO se genera ni se guarda ninguna contraseña — el link se auto-invalida
// cuando el creador setea la clave (single-use por fingerprint).
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";
import { sendOnboardingEmail } from "@/lib/aura/create-creator";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const org = await getOrganization(req);

    const influencer = await prisma.influencer.findFirst({
      where: { id: params.id, organizationId: org.id },
      select: { id: true, name: true, email: true, code: true, dashboardPassword: true },
    });
    if (!influencer) {
      return NextResponse.json({ error: "Creador no encontrado" }, { status: 404 });
    }
    if (!influencer.email) {
      return NextResponse.json(
        { error: "El creador no tiene email configurado" },
        { status: 400 },
      );
    }

    // Manda el link de set-password. Fingerprint del estado ACTUAL del password → cuando el
    // creador define la clave, este link queda inválido (single-use).
    const r = await sendOnboardingEmail({
      influencerId: influencer.id,
      organizationId: org.id,
      name: influencer.name,
      email: influencer.email,
      code: influencer.code,
      dashboardPassword: influencer.dashboardPassword,
      orgSlug: org.slug,
      orgName: org.name,
    });

    if (!r.ok) {
      return NextResponse.json(
        { error: r.error || "No se pudo enviar el email" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, email: influencer.email });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[aura/creators/send-password]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
