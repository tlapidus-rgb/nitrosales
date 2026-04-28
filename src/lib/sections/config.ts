// ══════════════════════════════════════════════════════════════
// src/lib/sections/config.ts
// ══════════════════════════════════════════════════════════════
// Mapa central de secciones de NitroSales con sus dependencias y
// metadata. Single source of truth — todo el sistema de "secciones
// bloqueadas" lee de acá:
//
//   - Sidebar (muestra candado si está bloqueada)
//   - SectionGuard (renderiza cartel en vez del contenido)
//   - Endpoint /api/me/section-status (devuelve status real-time)
//   - Panel admin (lista todas las secciones para override manual)
//
// Cada sección puede estar:
//   - ACTIVE → todo bien, mostrar contenido
//   - LOCKED_INTEGRATION → falta una integración requerida
//   - MAINTENANCE → bloqueada manualmente desde admin (global o por org)
// ══════════════════════════════════════════════════════════════

export type SectionStatus = "ACTIVE" | "LOCKED_INTEGRATION" | "MAINTENANCE";

export type RequiredIntegration =
  | "VTEX"
  | "MERCADOLIBRE"
  | "META_ADS"
  | "GOOGLE_ADS"
  | "GOOGLE_SEARCH_CONSOLE"
  | "NITROPIXEL";

export interface SectionConfig {
  /** Clave única (la usa el panel admin + DB overrides) */
  key: string;
  /** Path de la página */
  path: string;
  /** Nombre human-friendly */
  label: string;
  /**
   * Integraciones requeridas. Si se especifica un array de arrays,
   * son OR (cualquiera basta). Si es array plano, son AND (todas requeridas).
   * Ej: [["VTEX", "MERCADOLIBRE"]] → basta una de las dos.
   * Ej: ["META_ADS"] → necesita Meta sí o sí.
   * undefined o [] → no requiere ninguna.
   */
  requires?: RequiredIntegration[] | RequiredIntegration[][];
}

export const SECTIONS: SectionConfig[] = [
  // Tier 1 — Activos digitales
  { key: "nitropixel", path: "/nitropixel", label: "NitroPixel" }, // siempre activa
  { key: "chat", path: "/chat", label: "Aurum (chat IA)" },

  // Tier 2 — Control de gestión
  { key: "dashboard", path: "/dashboard", label: "Centro de Control" }, // siempre activa
  { key: "orders", path: "/orders", label: "Pedidos", requires: [["VTEX", "MERCADOLIBRE"]] },
  { key: "products", path: "/products", label: "Productos", requires: [["VTEX", "MERCADOLIBRE"]] },
  { key: "mercadolibre", path: "/mercadolibre", label: "MercadoLibre", requires: ["MERCADOLIBRE"] },

  // Tier 3 — Marketing & ads
  { key: "campaigns_meta", path: "/campaigns/meta", label: "Campañas Meta", requires: ["META_ADS"] },
  { key: "campaigns_google", path: "/campaigns/google", label: "Campañas Google", requires: ["GOOGLE_ADS"] },
  { key: "campaigns", path: "/campaigns", label: "Campañas (todas)" },

  // Tier 4 — Analytics
  { key: "analytics", path: "/analytics", label: "Analytics web", requires: ["NITROPIXEL"] },
  { key: "pixel", path: "/pixel", label: "Pixel analytics", requires: ["NITROPIXEL"] },

  // Tier 5 — Inteligencia / clientes
  { key: "bondly", path: "/bondly", label: "Bondly (clientes)" },
  { key: "rentabilidad", path: "/rentabilidad", label: "Rentabilidad" },
  { key: "finanzas", path: "/finanzas", label: "Finanzas" },
  { key: "alertas", path: "/alertas", label: "Alertas" },
  { key: "competitors", path: "/competitors", label: "Competidores" },

  // Tier 6 — Creator economy
  { key: "aura", path: "/aura", label: "Aura (creator economy)" },
  { key: "influencers", path: "/influencers", label: "Influencers" },
];

/** Helper: lookup rápido por path */
export function findSectionByPath(path: string): SectionConfig | undefined {
  // Match exacto primero, después prefix match (ej /campaigns/meta/123 → campaigns_meta).
  const exact = SECTIONS.find((s) => s.path === path);
  if (exact) return exact;
  return SECTIONS.find((s) => path.startsWith(s.path + "/"));
}

/** Helper: lookup por key */
export function findSectionByKey(key: string): SectionConfig | undefined {
  return SECTIONS.find((s) => s.key === key);
}

/**
 * Calcula el status de una sección dada las integraciones conectadas
 * y los overrides manuales (global y por org).
 */
export function computeSectionStatus(
  config: SectionConfig,
  connectedPlatforms: Set<string>,
  overrides: { global?: Record<string, "ACTIVE" | "MAINTENANCE">; org?: Record<string, "ACTIVE" | "MAINTENANCE"> } = {},
): SectionStatus {
  // Override por org tiene prioridad sobre global.
  const orgOverride = overrides.org?.[config.key];
  const globalOverride = overrides.global?.[config.key];
  const finalOverride = orgOverride ?? globalOverride;

  if (finalOverride === "MAINTENANCE") return "MAINTENANCE";
  // Si es explícitamente ACTIVE, no chequeamos integración (admin lo forzó).
  if (finalOverride === "ACTIVE") return "ACTIVE";

  // Sin override manual → chequear integraciones requeridas.
  if (!config.requires || config.requires.length === 0) return "ACTIVE";

  // Detectar shape: array plano (AND) o array de arrays (OR).
  const isOrShape = Array.isArray(config.requires[0]);

  if (isOrShape) {
    // Cualquier grupo OR satisface.
    const groups = config.requires as RequiredIntegration[][];
    const someGroupOk = groups.some((group) => group.some((p) => connectedPlatforms.has(p)));
    return someGroupOk ? "ACTIVE" : "LOCKED_INTEGRATION";
  } else {
    // AND: todas requeridas.
    const all = config.requires as RequiredIntegration[];
    const allOk = all.every((p) => connectedPlatforms.has(p));
    return allOk ? "ACTIVE" : "LOCKED_INTEGRATION";
  }
}

/**
 * Devuelve la lista de integraciones que faltan para que una sección
 * pase de LOCKED_INTEGRATION a ACTIVE.
 */
export function getMissingIntegrations(
  config: SectionConfig,
  connectedPlatforms: Set<string>,
): RequiredIntegration[] {
  if (!config.requires || config.requires.length === 0) return [];
  const isOrShape = Array.isArray(config.requires[0]);
  if (isOrShape) {
    const groups = config.requires as RequiredIntegration[][];
    // Si algún grupo está completo, no falta nada.
    if (groups.some((g) => g.some((p) => connectedPlatforms.has(p)))) return [];
    // Sino: devolvemos las del primer grupo (la opción más simple).
    return groups[0];
  } else {
    const all = config.requires as RequiredIntegration[];
    return all.filter((p) => !connectedPlatforms.has(p));
  }
}
