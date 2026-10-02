// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/reset-password-by-email
// ══════════════════════════════════════════════════════════════
// Atajo para resetear password por email cuando no tenes el userId
// a mano. Util para resetear users de prueba rapido. Internamente
// usa la misma logica que /api/admin/users/[userId]/reset-password.
//
// Body: { email: "user@dominio.com" }
//
// Sólo staff verificado contra la BASE (isInternalUser). Antes había un GET que aceptaba
// ?key=<ADMIN_API_KEY>: con esa clave cualquiera reseteaba la password
// de cualquier cuenta —staff incluido— y la recibía en la respuesta.
// Ya no hay GET ni clave, y las cuentas de staff no se resetean por acá
// (para la propia: "Olvidé mi contraseña" en el login).
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { isStaffUser } from "@/lib/staff";
import { hash } from "bcryptjs";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

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
    select: { id: true, email: true, name: true, organizationId: true, isStaff: true },
  });
  if (!user) {
    return NextResponse.json({ error: `No existe user con email ${normalized}` }, { status: 404 });
  }
  if (isStaffUser({ isStaff: user.isStaff, email: user.email })) {
    return NextResponse.json(
      { error: "Las cuentas de staff no se resetean por acá. Usá \"Olvidé mi contraseña\" en el login." },
      { status: 403 },
    );
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

export async function POST(req: Request) {
  try {
    if (!(await isInternalUser())) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    return await doReset(body?.email || "");
  } catch (error: any) {
    console.error("[admin/reset-password-by-email POST] error:", error);
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 });
  }
}
