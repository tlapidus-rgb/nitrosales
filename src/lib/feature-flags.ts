// ══════════════════════════════════════════════════════════════
// Feature Flags
// ══════════════════════════════════════════════════════════════
// Allowlist explícita por email para features en validación.
// Decisión deliberada: mantener manual para forzar revisión consciente
// antes de exponer features a clientes (ver docs/nitropixel-score-rollout.md).
// ══════════════════════════════════════════════════════════════

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isStaffUser } from "@/lib/staff";

/**
 * Devuelve true si el usuario actual es staff interno de NitroSales.
 * Server-side only — usar en layouts/pages para gatekeeping.
 *
 * La fuente de verdad ("quién es staff") vive en src/lib/staff.ts:
 * flag `users.isStaff` (DB) + allowlist de transición por email.
 */
export async function isInternalUser(): Promise<boolean> {
  try {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;
    const isStaff = (session?.user as any)?.isStaff === true;
    return isStaffUser({ isStaff, email });
  } catch {
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
