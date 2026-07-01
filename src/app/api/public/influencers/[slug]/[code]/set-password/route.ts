export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Set-password del afiliado (Opción B onboarding)
// ══════════════════════════════════════════════════════════════
// POST /api/public/influencers/[slug]/[code]/set-password
// body: { token, password }
//
// El afiliado define su propia clave desde el link del mail. Se guarda SOLO el hash
// (S1: NO se escribe dashboardPasswordPlain). Hardening completo del security-review:
// verifica token (firma/scope/exp), authz token↔URL, single-use (fingerprint), min length.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db/client";
import { verifySetPasswordToken, passwordFingerprint } from "@/lib/aura/set-password-token";

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

const MIN_PASSWORD_LEN = 6;

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string; code: string } },
) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === "string" ? body.token : "";
    const password = typeof body.password === "string" ? body.password : "";

    // 1. Token: firma + scope + expiración + estructura.
    const payload = verifySetPasswordToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: "Link inválido o expirado. Pedí uno nuevo." },
        { status: 401 },
      );
    }

    // 2. Resolver slug→org y (org, code)→influencer desde la URL (misma resolución que el dashboard).
    const org = await prisma.organization.findFirst({
      where: { slug: params.slug },
      select: { id: true },
    });
    if (!org) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    const influencer = await prisma.influencer.findFirst({
      where: { organizationId: org.id, code: params.code },
      select: { id: true, dashboardPassword: true },
    });
    if (!influencer) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    // 3. AUTHZ token↔URL (CRÍTICO): el token tiene que ser de ESTE creador, org y code.
    //    Va ANTES del check de largo de password para no filtrar la validez del token a otro creador.
    if (
      payload.organizationId !== org.id ||
      payload.influencerId !== influencer.id ||
      payload.code !== params.code
    ) {
      return NextResponse.json({ error: "Link inválido para este creador." }, { status: 403 });
    }

    // 4. Single-use: el token se emitió para un estado puntual del password. Si cambió → stale.
    const currentPassword = influencer.dashboardPassword;
    if (payload.pwFingerprint !== passwordFingerprint(currentPassword)) {
      return NextResponse.json(
        { error: "Este link ya se usó o quedó vencido. Pedí uno nuevo." },
        { status: 410 },
      );
    }

    // 5. Password válida (después del authz).
    if (password.length < MIN_PASSWORD_LEN) {
      return NextResponse.json(
        { error: `La contraseña debe tener al menos ${MIN_PASSWORD_LEN} caracteres.` },
        { status: 400 },
      );
    }

    // 6. Escritura ATÓMICA (compare-and-swap): solo setea si el password NO cambió desde que lo
    //    leímos → cierra la race del single-use bajo requests concurrentes. NO escribe plain (S1).
    //    org en el where (aislamiento). Prisma trata dashboardPassword: null como IS NULL.
    const res = await prisma.influencer.updateMany({
      where: {
        id: influencer.id,
        organizationId: org.id,
        dashboardPassword: currentPassword,
      },
      data: { dashboardPassword: hashPassword(password) },
    });
    if (res.count === 0) {
      // Otro request seteó la clave entre el read y el write (o el link ya se usó).
      return NextResponse.json(
        { error: "Este link ya se usó o quedó vencido. Pedí uno nuevo." },
        { status: 410 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[set-password] error:", msg);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
