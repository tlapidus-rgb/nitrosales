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
import { getOrganizationIdStrict } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";
import { sendOnboardingEmail } from "@/lib/aura/create-creator";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    // ⚠️ ESTE ENDPOINT NO AUTENTICABA (R-03, 2026-09-15).
    //
    // El único gate era `getOrganization(req)`, que **no autentica**: si no
    // hay sesión cae al fallback de organización única (`auth-guard.ts:80`)
    // y devuelve la org igual. O sea que un POST anónimo mandaba el link de
    // set-password del creador a su casilla, las veces que quisiera — DoS
    // del onboarding del creador, y control del *timing* del mail para un
    // tercero (phishing sincronizado).
    //
    // Es el hermano exacto de `admin/aura-resend-onboarding`, que se arregló
    // el 2026-09-13 y manda el mismo mail con la misma función. Quedó afuera
    // porque el test que barre buscando rutas sin auth mira `/api/admin/**` y
    // esto vive en `/api/aura/**`.
    //
    // ── POR QUÉ NO `isInternalUser()` ────────────────────────────────────
    // Aquél es una herramienta de staff; éste lo llama la UI del CLIENTE
    // (`(app)/aura/creadores/[id]/page.tsx:365`). Gatearlo con staff lo
    // rompería para el dueño de la tienda, que es quien legítimamente le
    // reenvía el link a su creador. `getOrganizationIdStrict` tira si no hay
    // sesión, que es exactamente la diferencia con `getOrganization`.
    const orgId = await getOrganizationIdStrict();
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, slug: true },
    });
    if (!org) return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 });

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
