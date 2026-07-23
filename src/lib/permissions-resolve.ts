// ═══════════════════════════════════════════════════════════════════
// permissions-resolve.ts — resolución de permisos efectivos (server)
// ═══════════════════════════════════════════════════════════════════
// Lógica única de "qué permisos tiene este user", reutilizada por:
//   - permission-guard.ts (requirePermission/canUserAccess en endpoints)
//   - auth.ts (snapshot de allowedSections en el JWT, para el middleware)
//
// Importa prisma + permissions.ts + staff.ts. NO importa auth.ts (evita
// dependencia circular: auth.ts es quien lo consume).
//
// Ver feat/role-based-access (BP-ROLES-001).
// ═══════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";
import {
  mergePermissions,
  resolveUserPermissions,
  fullAccessPermissions,
  SECTIONS,
  type Role,
  type Section,
  type AccessLevel,
  type PermissionsMatrix,
  type CustomRolePermissions,
} from "@/lib/permissions";
import { isStaffUser } from "@/lib/staff";

export interface EffectivePermissions {
  userId: string;
  role: Role;
  customRoleId: string | null;
  isStaff: boolean;
  permissions: Record<Section, AccessLevel>;
}

/**
 * Resuelve los permisos efectivos de un user por email:
 *   - base role (users.role)
 *   - customRoleId (si tiene)
 *   - system matrix (organization.settings.rolePermissions)
 *   - custom roles activos de la org
 *
 * Staff interno de NitroSales (users.isStaff o allowlist) → bypass total
 * (full access a todas las secciones), sin leer matriz ni custom roles.
 *
 * Devuelve null si el user no existe.
 */
export async function resolveEffectivePermissionsByEmail(
  email: string
): Promise<EffectivePermissions | null> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      role: true,
      customRoleId: true,
      isStaff: true,
      organizationId: true,
    },
  });
  if (!user) return null;

  // Staff interno: bypass total del RBAC.
  if (isStaffUser({ isStaff: user.isStaff, email })) {
    return {
      userId: user.id,
      role: user.role as Role,
      customRoleId: user.customRoleId,
      isStaff: true,
      permissions: fullAccessPermissions(),
    };
  }

  const [org, customRoles] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { settings: true },
    }),
    prisma.customRole.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      select: { id: true, isActive: true, permissions: true },
    }),
  ]);

  const settings = (org?.settings as Record<string, unknown>) || {};
  const override = settings.rolePermissions as Partial<PermissionsMatrix> | null;
  const systemMatrix = mergePermissions(override);

  const mappedCustomRoles = customRoles.map((r) => ({
    id: r.id,
    isActive: r.isActive,
    permissions: (r.permissions ?? {}) as CustomRolePermissions,
  }));

  const permissions = resolveUserPermissions({
    baseRole: user.role as Role,
    customRoleId: user.customRoleId,
    systemMatrix,
    customRoles: mappedCustomRoles,
  });

  return {
    userId: user.id,
    role: user.role as Role,
    customRoleId: user.customRoleId,
    isStaff: false,
    permissions,
  };
}

const LEVEL_ORDER: Record<AccessLevel, number> = {
  none: 0,
  read: 1,
  write: 2,
  admin: 3,
};

/**
 * Lista de secciones que el user puede VER (read+). Es lo que se
 * snapshotea en el JWT para que el middleware (edge, sin DB) decida
 * acceso por ruta.
 */
export function allowedSectionsFrom(
  permissions: Record<Section, AccessLevel>
): Section[] {
  return SECTIONS.filter(
    (s) => LEVEL_ORDER[permissions[s.key] ?? "none"] >= LEVEL_ORDER.read
  ).map((s) => s.key);
}

/**
 * Secciones donde el user puede ESCRIBIR (write+). Es el complemento de
 * `allowedSectionsFrom` (que sólo mira read+): se snapshotea también en el JWT
 * para que el middleware distinga leer de escribir.
 *
 * ⚠️ POR QUÉ EXISTE (auditoría 2026-07-22): el gating por sección sólo miraba
 * "¿puede VER la sección?" y nunca el método HTTP. Un user con `aura: read`
 * podía hacer POST /api/aura/creators/<id>/settle (registrar pagos), DELETE de
 * campañas, etc. Con esta lista el middleware puede exigir write en los métodos
 * que mutan.
 */
export function writableSectionsFrom(
  permissions: Record<Section, AccessLevel>
): Section[] {
  return SECTIONS.filter(
    (s) => LEVEL_ORDER[permissions[s.key] ?? "none"] >= LEVEL_ORDER.write
  ).map((s) => s.key);
}
