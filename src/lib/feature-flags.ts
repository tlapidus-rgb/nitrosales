// ══════════════════════════════════════════════════════════════
// Feature Flags
// ══════════════════════════════════════════════════════════════
// Allowlist explícita por email para features en validación.
// Decisión deliberada: mantener manual para forzar revisión consciente
// antes de exponer features a clientes (ver docs/nitropixel-score-rollout.md).
// ══════════════════════════════════════════════════════════════

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { isStaffUser } from "@/lib/staff";

/**
 * Devuelve true si el usuario actual es staff interno de NitroSales.
 * Server-side only — usar en layouts/pages para gatekeeping.
 *
 * La fuente de verdad ("quién es staff") vive en src/lib/staff.ts:
 * flag `users.isStaff` (DB) + allowlist de transición por email.
 *
 * Staff según la BASE, no según el token. La sesión es un JWT: quien
 * tenga el secreto que lo firma fabrica uno con isStaff=true y cualquier
 * id. Por eso el usuario tiene que existir, el email del token coincidir
 * con el de la base, y el staff se lee de la base. Mirando como otra
 * cuenta (impersonación) no se es staff.
 */
export async function isInternalUser(): Promise<boolean> {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!user?.id || user.impersonatedBy) return false;

    const real = await prisma.user.findUnique({
      where: { id: String(user.id) },
      select: { email: true, isStaff: true },
    });
    if (!real?.email) return false;
    if (real.email.toLowerCase() !== String(user.email || "").toLowerCase()) return false;
    return isStaffUser({ isStaff: real.isStaff, email: real.email });
  } catch (error) {
    // En el build, Next tantea si la página es estática y getServerSession
    // lanza su señal de "uso dinámico": no es un error, no se loguea.
    if ((error as any)?.digest !== "DYNAMIC_SERVER_USAGE") {
      console.error("[isInternalUser] no se pudo verificar el staff:", error);
    }
    return false;
  }
}

/**
 * NitroScore (página /nitropixel/quality y /nitropixel/setup) está
 * en validación interna. No se expone a clientes hasta fase 2.
 */
export async function canSeeNitroScore(): Promise<boolean> {
  return isInternalUser();
}
