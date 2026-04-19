// ═══════════════════════════════════════════════════════════════════
// permissions.ts — Fase 7 fix (permisos granulares)
// ═══════════════════════════════════════════════════════════════════
// Sistema RBAC (role-based access control) con matriz
// role × section × access_level.
//
// Niveles:
//   none   — el tab no aparece en la sidebar
//   read   — ve pero no modifica
//   write  — ve + modifica existente
//   admin  — todo (crear + modificar + borrar)
//
// Storage: organization.settings.rolePermissions como JSON, sin
// migracion DB. Se leen defaults si no existe override del user.
// ═══════════════════════════════════════════════════════════════════

export type Role = "OWNER" | "ADMIN" | "MEMBER";
export type AccessLevel = "none" | "read" | "write" | "admin";

export type Section =
  | "pulso"
  | "estado"
  | "costos"
  | "escenarios"
  | "fiscal"
  | "rentabilidad"
  | "mercadolibre"
  | "competencia"
  | "alertas"
  | "bondly"
  | "aura"
  | "campaigns"
  | "seo"
  | "products"
  | "orders"
  | "nitropixel"
  | "aurum"
  | "dashboard"
  | "sinapsis"
  | "boveda"
  | "pixel"
  | "memory"
  | "settings_org"
  | "settings_team"
  | "settings_integrations"
  | "settings_billing"
  | "settings_security"
  | "settings_api_keys";

export interface SectionMeta {
  key: Section;
  label: string;
  category: "finanzas" | "ventas" | "marketing" | "operaciones" | "config";
}

export const SECTIONS: SectionMeta[] = [
  // Finanzas
  { key: "pulso", label: "Pulso", category: "finanzas" },
  { key: "estado", label: "Estado de resultados", category: "finanzas" },
  { key: "costos", label: "Costos", category: "finanzas" },
  { key: "escenarios", label: "Escenarios", category: "finanzas" },
  { key: "fiscal", label: "Fiscal", category: "finanzas" },
  { key: "rentabilidad", label: "Rentabilidad", category: "finanzas" },

  // Ventas
  { key: "orders", label: "Órdenes", category: "ventas" },
  { key: "products", label: "Productos", category: "ventas" },
  { key: "mercadolibre", label: "MercadoLibre", category: "ventas" },
  { key: "pixel", label: "NitroPixel Analytics", category: "ventas" },
  { key: "nitropixel", label: "NitroPixel (Asset)", category: "ventas" },

  // Marketing
  { key: "campaigns", label: "Campañas", category: "marketing" },
  { key: "bondly", label: "Bondly (CRM)", category: "marketing" },
  { key: "aura", label: "Aura (Creators)", category: "marketing" },
  { key: "competencia", label: "Competencia", category: "marketing" },
  { key: "seo", label: "SEO", category: "marketing" },

  // Operaciones
  { key: "alertas", label: "Alertas", category: "operaciones" },
  { key: "dashboard", label: "Centro de Control", category: "operaciones" },
  { key: "aurum", label: "Aurum (AI Chat)", category: "operaciones" },
  { key: "sinapsis", label: "Sinapsis", category: "operaciones" },
  { key: "boveda", label: "Bóveda", category: "operaciones" },
  { key: "memory", label: "Memory", category: "operaciones" },

  // Config
  { key: "settings_org", label: "Organización", category: "config" },
  { key: "settings_team", label: "Team & Permisos", category: "config" },
  { key: "settings_integrations", label: "Integraciones", category: "config" },
  { key: "settings_billing", label: "Billing", category: "config" },
  { key: "settings_security", label: "Seguridad", category: "config" },
  { key: "settings_api_keys", label: "API Keys", category: "config" },
];

export type PermissionsMatrix = Record<Role, Record<Section, AccessLevel>>;

// ─────────────────────────────────────────────────────────────
// Defaults razonables
// ─────────────────────────────────────────────────────────────
export const DEFAULT_PERMISSIONS: PermissionsMatrix = {
  OWNER: SECTIONS.reduce(
    (acc, s) => ({ ...acc, [s.key]: "admin" as AccessLevel }),
    {} as Record<Section, AccessLevel>
  ),
  ADMIN: SECTIONS.reduce((acc, s) => {
    // Admin: todo admin excepto settings_billing (read) y api_keys (read)
    const level: AccessLevel =
      s.key === "settings_billing" || s.key === "settings_api_keys"
        ? "read"
        : "admin";
    return { ...acc, [s.key]: level };
  }, {} as Record<Section, AccessLevel>),
  MEMBER: SECTIONS.reduce((acc, s) => {
    // Member: read en finanzas, write en costos+escenarios+fiscal,
    // read en ventas/marketing/alertas, none en config (excepto org=read)
    let level: AccessLevel = "read";
    if (["costos", "escenarios", "fiscal"].includes(s.key)) {
      level = "write";
    } else if (
      [
        "settings_team",
        "settings_integrations",
        "settings_billing",
        "settings_security",
        "settings_api_keys",
      ].includes(s.key)
    ) {
      level = "none";
    } else if (s.key === "settings_org") {
      level = "read";
    }
    return { ...acc, [s.key]: level };
  }, {} as Record<Section, AccessLevel>),
};

// ─────────────────────────────────────────────────────────────
// Merge overrides de DB con defaults
// ─────────────────────────────────────────────────────────────
export function mergePermissions(
  override: Partial<PermissionsMatrix> | null | undefined
): PermissionsMatrix {
  if (!override) return DEFAULT_PERMISSIONS;
  const out: PermissionsMatrix = {
    OWNER: { ...DEFAULT_PERMISSIONS.OWNER },
    ADMIN: { ...DEFAULT_PERMISSIONS.ADMIN },
    MEMBER: { ...DEFAULT_PERMISSIONS.MEMBER },
  };
  for (const role of ["OWNER", "ADMIN", "MEMBER"] as Role[]) {
    const roleOverride = override[role];
    if (roleOverride) {
      for (const sec of SECTIONS) {
        const v = roleOverride[sec.key];
        if (v && ["none", "read", "write", "admin"].includes(v)) {
          out[role][sec.key] = v;
        }
      }
    }
  }
  // Owner SIEMPRE tiene admin en todas (invariante de seguridad)
  for (const sec of SECTIONS) {
    out.OWNER[sec.key] = "admin";
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// Helpers de chequeo
// ─────────────────────────────────────────────────────────────
const LEVEL_ORDER: Record<AccessLevel, number> = {
  none: 0,
  read: 1,
  write: 2,
  admin: 3,
};

export function canAccess(
  matrix: PermissionsMatrix,
  role: Role,
  section: Section,
  requiredLevel: AccessLevel = "read"
): boolean {
  const userLevel = matrix[role]?.[section] ?? "none";
  return LEVEL_ORDER[userLevel] >= LEVEL_ORDER[requiredLevel];
}

export function getVisibleSections(
  matrix: PermissionsMatrix,
  role: Role
): Section[] {
  return SECTIONS.filter((s) => canAccess(matrix, role, s.key, "read")).map(
    (s) => s.key
  );
}

export function validateLevel(v: unknown): v is AccessLevel {
  return v === "none" || v === "read" || v === "write" || v === "admin";
}

// ─────────────────────────────────────────────────────────────
// Custom roles — helpers
// ─────────────────────────────────────────────────────────────
export interface CustomRolePermissions {
  [section: string]: AccessLevel;
}

/**
 * Resuelve la matriz de permisos efectiva para un user, considerando
 * su baseRole + opcional customRoleId.
 *
 * Prioridad:
 *   1. OWNER siempre admin en todo (invariante).
 *   2. Si tiene customRoleId y el rol existe y esta activo, usa esa
 *      matriz (secciones faltantes -> "none").
 *   3. Fallback: matriz del sistema para el base role.
 */
export function resolveUserPermissions(params: {
  baseRole: Role;
  customRoleId?: string | null;
  systemMatrix: PermissionsMatrix;
  customRoles: Array<{
    id: string;
    isActive: boolean;
    permissions: CustomRolePermissions;
  }>;
}): Record<Section, AccessLevel> {
  const { baseRole, customRoleId, systemMatrix, customRoles } = params;

  if (baseRole === "OWNER") {
    return systemMatrix.OWNER;
  }

  if (customRoleId) {
    const custom = customRoles.find(
      (c) => c.id === customRoleId && c.isActive
    );
    if (custom) {
      const out: Record<Section, AccessLevel> = {} as any;
      for (const sec of SECTIONS) {
        const v = custom.permissions[sec.key];
        out[sec.key] = validateLevel(v) ? v : "none";
      }
      return out;
    }
  }

  return systemMatrix[baseRole];
}

/**
 * Genera un slug URL-safe desde un nombre de rol.
 */
export function sanitizeRoleSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/**
 * Valida que un objeto permissions tenga shape correcto y devuelve
 * una version normalizada (secciones faltantes -> "none").
 */
export function normalizeCustomPermissions(
  input: Record<string, unknown> | null | undefined
): CustomRolePermissions {
  const out: CustomRolePermissions = {};
  for (const sec of SECTIONS) {
    const v = input?.[sec.key];
    out[sec.key] = validateLevel(v) ? v : "none";
  }
  return out;
}
