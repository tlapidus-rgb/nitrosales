import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/db/client";

export async function POST(req: Request) {
  try {
    const { email, password, name, setupKey } = await req.json();

    if (setupKey !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "El usuario ya existe" }, { status: 400 });
    }

    const hashedPassword = await hash(password, 12);

    const org = await prisma.organization.create({
      data: {
        name: "El Mundo del Juguete",
        slug: "elmundodeljuguete",
      },
    });

    const user = await prisma.user.create({
      data: {
        email,
        name,
        hashedPassword,
        role: "OWNER",
        organizationId: org.id,
      },
    });

    return NextResponse.json({ ok: true, userId: user.id, orgId: org.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
