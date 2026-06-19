// ══════════════════════════════════════════════════════════════
// src/lib/section-access.ts — mapa ruta → sección (edge-safe)
// ══════════════════════════════════════════════════════════════
// Lo usa middleware.ts (edge runtime) para decidir, sin tocar la DB,
// si una request a una ruta restringida está permitida para el user.
//
// REGLA DE DISEÑO: acá SOLO se listan rutas de secciones RESTRINGIBLES.
// Las rutas compartidas por páginas permitidas (ej: /api/metrics/orders,
// /api/metrics/products, /api/metrics/pixel, /api/metrics/pnl,
// /api/metrics/customers — que alimentan el dashboard) NO se listan →
// pasan siempre. Así nunca rompemos una página permitida por bloquear
// un endpoint que comparte.
//
// NO importa prisma ni nada server-only. Solo el tipo Section (puro).
// ══════════════════════════════════════════════════════════════

import type { Section } from "@/lib/permissions";

// Prefijos de API (rutas /api/*) → sección requerida (read).
// El primer prefijo que matchea gana; ordenar de más específico a menos.
const API_SECTION_PREFIXES: Array<{ prefix: string; section: Section }> = [
  { prefix: "/api/bondly", section: "bondly" },
  { prefix: "/api/aura", section: "aura" },
  { prefix: "/api/finanzas", section: "pulso" },
  { prefix: "/api/mercadolibre", section: "mercadolibre" },
  { prefix: "/api/competitors", section: "competencia" },
  { prefix: "/api/metrics/competitors", section: "competencia" },
  { prefix: "/api/seo", section: "seo" },
  { prefix: "/api/metrics/seo", section: "seo" },
  { prefix: "/api/metrics/searches", section: "seo" },
  { prefix: "/api/campaigns", section: "campaigns" },
  { prefix: "/api/ads", section: "campaigns" },
  { prefix: "/api/metrics/campaigns", section: "campaigns" },
  { prefix: "/api/metrics/ads", section: "campaigns" },
  { prefix: "/api/alerts", section: "alertas" },
];

// Prefijos de páginas (rutas no-/api) → sección requerida (read).
const PAGE_SECTION_PREFIXES: Array<{ prefix: string; section: Section }> = [
  { prefix: "/bondly", section: "bondly" },
  { prefix: "/aura", section: "aura" },
  { prefix: "/finanzas", section: "pulso" },
  { prefix: "/mercadolibre", section: "mercadolibre" },
  { prefix: "/competitors", section: "competencia" },
  { prefix: "/seo", section: "seo" },
  { prefix: "/campaigns", section: "campaigns" },
  { prefix: "/alertas", section: "alertas" },
  { prefix: "/orders", section: "orders" },
  { prefix: "/chat", section: "aurum" },
  { prefix: "/sinapsis", section: "sinapsis" },
  { prefix: "/boveda", section: "boveda" },
  { prefix: "/memory", section: "memory" },
];

function matchPrefix(
  pathname: string,
  table: Array<{ prefix: string; section: Section }>
): Section | null {
  for (const { prefix, section } of table) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      return section;
    }
  }
  return null;
}

/**
 * Devuelve la sección requerida para acceder a `pathname`, o null si la
 * ruta no está restringida (pública dentro de la app, o compartida).
 */
export function requiredSectionForPath(pathname: string): Section | null {
  if (pathname.startsWith("/api/")) {
    return matchPrefix(pathname, API_SECTION_PREFIXES);
  }
  return matchPrefix(pathname, PAGE_SECTION_PREFIXES);
}

/**
 * Decide si una request a `pathname` está permitida.
 *
 * - Staff → siempre permitido.
 * - Ruta no restringida → permitido.
 * - `allowedSections` undefined (token viejo / sin snapshot) → permitido
 *   (fail-open: no lockear users existentes; el server igual valida sesión).
 * - Sino: permitido sólo si la sección requerida está en allowedSections.
 */
export function isPathAllowed(params: {
  pathname: string;
  isStaff: boolean;
  allowedSections: string[] | undefined;
}): boolean {
  if (params.isStaff) return true;
  const section = requiredSectionForPath(params.pathname);
  if (section === null) return true;
  if (!Array.isArray(params.allowedSections)) return true; // fail-open
  return params.allowedSections.includes(section);
}
