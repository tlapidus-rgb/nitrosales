// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/reset-password-by-email
// ══════════════════════════════════════════════════════════════
// Atajo para resetear password por email cuando no tenes el userId
// a mano. Util para resetear users de prueba rapido. Internamente
// usa la misma logica que /api/admin/users/[userId]/reset-password.
//
// Body: { email: "user@dominio.com" }
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { hash } from "bcryptjs";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

const KEY = "nitrosales-secret-key-2024-production";

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const buf = randomBytes(12);
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[buf[i] % chars.length];
  return out;
}

async function doReset(email: string) {
  const normalized = email.toString().trim().toLowerCase();
  if (!normalized) {
    return NextResponse.json({ error: "email requerido" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: normalized },
    select: { id: true, email: true, name: true, organizationId: true },
  });
  if (!user) {
    return NextResponse.json({ error: `No existe user con email ${normalized}` }, { status: 404 });
  }

  const newPassword = generateTempPassword();
  const hashed = await hash(newPassword, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: { hashedPassword: hashed },
  });

  return NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name, organizationId: user.organizationId },
    newPassword,
    note: "Cambiá esta password apenas te loguees (settings → security).",
  });
}

// S58 BIS: GET wrapper friendly-browser. Acepta ?key=... como bypass de
// session admin para casos donde el admin (Tomy) perdio acceso a la sesion
// (ej: reset de su propia cuenta). El KEY es server-side, no se logea.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const email = url.searchParams.get("email") || "";

    const allowed = key === KEY ? true : await isInternalUser();
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return await doReset(email);
  } catch (error: any) {
    console.error("[admin/reset-password-by-email GET] error:", error);
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    return await doReset(body?.email || "");
  } catch (error: any) {
    console.error("[admin/reset-password-by-email POST] error:", error);
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 });
  }
}
