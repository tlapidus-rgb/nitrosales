// ══════════════════════════════════════════════════════════════
// Feature Flags
// ══════════════════════════════════════════════════════════════
// Allowlist explícita por email para features en validación.
// Decisión deliberada: mantener manual para forzar revisión consciente
// antes de exponer features a clientes (ver docs/nitropixel-score-rollout.md).
// ══════════════════════════════════════════════════════════════

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * Usuarios internos / beta-testers.
 * Solo estos emails pueden ver features marcadas como beta.
 *
 * Para agregar uno: editar el array y desplegar.
 */
const INTERNAL_EMAILS = new Set<string>([
  "tlapidus@99media.com.ar",
]);

/**
 * Devuelve true si el usuario actual está en la allowlist interna.
 * Server-side only — usar en layouts/pages para gatekeeping.
 */
export async function isInternalUser(): Promise<boolean> {
  try {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;
    if (!email) return false;
    return INTERNAL_EMAILS.has(email.toLowerCase());
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
