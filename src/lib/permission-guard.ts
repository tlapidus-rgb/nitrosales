// ═══════════════════════════════════════════════════════════════════
// permission-guard.ts — Fase 7 QA enforcement
// ═══════════════════════════════════════════════════════════════════
// Helpers server-side para validar permisos en endpoints y pages.
//
// Uso en API routes:
//   export async function GET() {
//     const check = await requirePermission("finanzas_pulso", "read");
//     if (!check.allowed) return check.response;
//     // ... logica normal del endpoint
//   }
//
// Uso en server components / layouts:
//   const { allowed } = await canUserAccess("settings_team", "admin");
//   if (!allowed) redirect("/unauthorized");
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  type Role,
  type Section,
  type AccessLevel,
} from "@/lib/permissions";
import {
  resolveEffectivePermissionsByEmail,
  type EffectivePermissions,
} from "@/lib/permissions-resolve";

export interface PermissionCheck {
  allowed: boolean;
  reason?: string;
  userId?: string;
  role?: Role;
  customRoleId?: string | null;
  isStaff?: boolean;
  effectiveLevel?: AccessLevel;
  response?: NextResponse; // pre-armada 401/403 para return directo
}

/**
 * Resuelve los permisos efectivos del user logueado. Delega en el
 * resolver compartido (src/lib/permissions-resolve.ts) para que el
 * guard de endpoints y el snapshot del JWT (auth.ts) usen la MISMA
 * lógica. Staff → full access. Devuelve null si el user no existe.
 */
async function getEffectivePermissions(
  email: string
): Promise<EffectivePermissions | null> {
  return resolveEffectivePermissionsByEmail(email);
}

/**
 * Chequea permisos del user logueado. Para uso en API routes.
 * Si allowed=false, `response` trae el NextResponse listo para return.
 */
export async function requirePermission(
  section: Section,
  requiredLevel: AccessLevel = "read"
): Promise<PermissionCheck> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  if (!email) {
    return {
      allowed: false,
      reason: "No autenticado",
      response: NextResponse.json(
        { error: "No autenticado" },
        { status: 401 }
      ),
    };
  }

  const eff = await getEffectivePermissions(email);
  if (!eff) {
    return {
      allowed: false,
      reason: "Usuario no encontrado",
      response: NextResponse.json(
        { error: "Usuario no encontrado" },
        { status: 401 }
      ),
    };
  }

  const levelOrder: Record<AccessLevel, number> = {
    none: 0,
    read: 1,
    write: 2,
    admin: 3,
  };
  const userLevel = eff.permissions[section] ?? "none";
  const allowed = levelOrder[userLevel] >= levelOrder[requiredLevel];

  if (!allowed) {
    return {
      allowed: false,
      reason: `Rol sin permiso ${requiredLevel} sobre ${section} (tiene ${userLevel})`,
      userId: eff.userId,
      role: eff.role,
      customRoleId: eff.customRoleId,
      isStaff: eff.isStaff,
      effectiveLevel: userLevel,
      response: NextResponse.json(
        {
          error: "Sin permisos para acceder a este recurso",
          section,
          requiredLevel,
          currentLevel: userLevel,
        },
        { status: 403 }
      ),
    };
  }

  return {
    allowed: true,
    userId: eff.userId,
    role: eff.role,
    customRoleId: eff.customRoleId,
    isStaff: eff.isStaff,
    effectiveLevel: userLevel,
  };
}

/**
 * Version booleana liviana para server components / layouts.
 * No arma response — solo devuelve si permite o no + nivel.
 */
export async function canUserAccess(
  section: Section,
  requiredLevel: AccessLevel = "read"
): Promise<{
  allowed: boolean;
  level: AccessLevel;
  role: Role | null;
}> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return { allowed: false, level: "none", role: null };

  const eff = await getEffectivePermissions(email);
  if (!eff) return { allowed: false, level: "none", role: null };

  const userLevel = eff.permissions[section] ?? "none";
  const levelOrder: Record<AccessLevel, number> = {
    none: 0,
    read: 1,
    write: 2,
    admin: 3,
  };
  return {
    allowed: levelOrder[userLevel] >= levelOrder[requiredLevel],
    level: userLevel,
    role: eff.role,
  };
}

/**
 * Devuelve TODOS los permisos del user logueado (para que el cliente
 * haga hide/show de tabs en la sidebar).
 */
export async function getCurrentUserPermissions(): Promise<{
  authenticated: boolean;
  role: Role | null;
  customRoleId: string | null;
  isStaff: boolean;
  permissions: Record<Section, AccessLevel>;
}> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return {
      authenticated: false,
      role: null,
      customRoleId: null,
      isStaff: false,
      permissions: {} as Record<Section, AccessLevel>,
    };
  }

  const eff = await getEffectivePermissions(email);
  if (!eff) {
    return {
      authenticated: false,
      role: null,
      customRoleId: null,
      isStaff: false,
      permissions: {} as Record<Section, AccessLevel>,
    };
  }

  return {
    authenticated: true,
    role: eff.role,
    customRoleId: eff.customRoleId,
    isStaff: eff.isStaff,
    permissions: eff.permissions,
  };
}
