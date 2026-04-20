export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/db/client";

/**
 * Setup inicial / onboarding de org + owner user.
 * Multi-tenant safe: acepta orgName + orgSlug por body.
 * Fallback si no se pasa: "elmundodeljuguete" (compat histórico).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, name, setupKey, orgName, orgSlug } = body;

    if (setupKey !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "El usuario ya existe" }, { status: 400 });
    }

    const hashedPassword = await hash(password, 12);

    // orgSlug + orgName opcionales — si no vienen, se usa el slug histórico.
    const finalSlug = orgSlug || "elmundodeljuguete";
    const finalName = orgName || "El Mundo del Juguete";

    let org = await prisma.organization.findFirst({
      where: { slug: finalSlug },
    });

    if (!org) {
      org = await prisma.organization.create({
        data: { name: finalName, slug: finalSlug },
      });
    }

    const user = await prisma.user.create({
      data: {
        email,
        name,
        hashedPassword,
        role: "OWNER",
        organizationId: org.id,
      },
    });

    return NextResponse.json({ ok: true, userId: user.id, orgId: org.id, orgSlug: org.slug });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
