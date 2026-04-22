// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/users/[userId]/reset-password
// ══════════════════════════════════════════════════════════════
// Regenera la password de un usuario y la devuelve en plain text
// UNA sola vez (al admin que llamo el endpoint).
//
// IMPORTANTE: las passwords NO se guardan en plain text en DB.
// Se guardan hasheadas con bcrypt cost 12. Este endpoint:
//   1. Genera password aleatoria de 12 chars legibles
//   2. La hashea y la guarda
//   3. Devuelve el plain text al admin (solo para esta response)
//
// El admin se la pasa al cliente. Si la pierde, hay que regenerar
// otra (no hay forma de "ver" la password vieja).
//
// Por defecto solo internal users (ver isInternalUser). Cuando haya
// admins por organizacion, expandir la auth.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { hash } from "bcryptjs";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

function generateTempPassword(): string {
  // 12 chars legibles (sin 0/O/l/I/1 que se confunden)
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const buf = randomBytes(12);
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[buf[i] % chars.length];
  return out;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { userId } = await params;
    if (!userId) {
      return NextResponse.json({ error: "userId requerido" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, organizationId: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User no encontrado" }, { status: 404 });
    }

    const newPassword = generateTempPassword();
    const hashed = await hash(newPassword, 12);

    await prisma.user.update({
      where: { id: userId },
      data: { hashedPassword: hashed },
    });

    return NextResponse.json({
      ok: true,
      user: { id: user.id, email: user.email, name: user.name, organizationId: user.organizationId },
      newPassword,
      note: "Esta password se muestra solo en esta response. Pasasela al cliente y guardala en un lugar seguro. No se puede recuperar despues.",
    });
  } catch (error: any) {
    console.error("[admin/users/reset-password] error:", error);
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 });
  }
}
