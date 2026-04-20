// ═══════════════════════════════════════════════════════════════════
// get-user-id.ts — Fase 8e fix
// ═══════════════════════════════════════════════════════════════════
// Resuelve userId desde la sesion usando email como fuente primaria
// (que NextAuth siempre expone) y busca el id real en DB.
//
// Por que? En algunos tokens JWT viejos, `token.id` puede no estar
// seteado aun. Usando email es mas confiable.
// ═══════════════════════════════════════════════════════════════════

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

export async function getSessionUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  // 1. Preferir session.user.id si existe (mas rapido, evita query)
  const idFromSession = (session?.user as any)?.id;
  if (idFromSession) return idFromSession;

  // 2. Fallback: resolver por email
  const email = session?.user?.email;
  if (!email) return null;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  return user?.id ?? null;
}
