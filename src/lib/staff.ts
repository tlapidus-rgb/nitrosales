// ══════════════════════════════════════════════════════════════
// src/lib/staff.ts — Staff interno de NitroSales ("nosotros")
// ══════════════════════════════════════════════════════════════
// Fuente de verdad ÚNICA de quién es staff de NitroSales. El staff:
//   - bypassa todo el RBAC (ve todas las secciones, nivel admin),
//   - puede usar View-as-Org (ver todas las orgs de clientes).
//
// Fuente primaria: la columna `users.isStaff` (DB). Mientras se hace
// la transición (antes de marcar isStaff=true a cada uno), se mantiene
// una allowlist de emails como fallback para no perder el acceso
// existente. Una vez marcado el staff en DB, la allowlist se puede
// vaciar.
//
// Reemplaza las 3 copias hardcodeadas previas:
//   - auth.ts          INTERNAL_VIEW_AS_EMAILS
//   - feature-flags.ts INTERNAL_EMAILS
//   - OrgSwitcher.tsx  INTERNAL_EMAILS (cliente)
// ══════════════════════════════════════════════════════════════

/**
 * Allowlist de transición. Fallback hasta que `users.isStaff` esté
 * seteado para cada staff. Mantener en minúsculas.
 */
export const STAFF_EMAILS: ReadonlySet<string> = new Set<string>([
  "tlapidus@99media.com.ar",
]);

/** True si el email pertenece a la allowlist de staff (fallback). */
export function isStaffEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return STAFF_EMAILS.has(email.toLowerCase());
}

/**
 * Determinación canónica de staff. Combina el flag de DB (`isStaff`)
 * con la allowlist de transición por email.
 *
 * Usar en TODOS lados (server y cliente) para decidir bypass de RBAC
 * y acceso a View-as-Org.
 */
export function isStaffUser(params: {
  isStaff?: boolean | null;
  email?: string | null;
}): boolean {
  return params.isStaff === true || isStaffEmail(params.email);
}
