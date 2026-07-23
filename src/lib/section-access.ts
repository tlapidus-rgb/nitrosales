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
  // Core "shared" pages: hasta S60 pasaban siempre. Se gatean para poder
  // ENTREGAR una org con acceso restringido (ej: TeVeCompras solo-pixel).
  // Solo afecta a users con customRole que NO tenga la sección; los base
  // roles (OWNER/ADMIN/MEMBER) tienen read+ en las tres → no se ven afectados.
  // OJO: acá van las PÁGINAS (/dashboard). Los endpoints /api/metrics/* que
  // alimentan el dashboard NO se listan (no empiezan con estos prefijos) → pasan.
  { prefix: "/dashboard", section: "dashboard" },
  { prefix: "/products", section: "products" },
  { prefix: "/rentabilidad", section: "rentabilidad" },
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
  // Configuración: ADMIN/OWNER (settings_org admin/read) y MEMBER (read) la
  // ven; el rol Standard (settings_org=none) NO. Mapeamos todo /settings/* a
  // settings_org — suficiente para la regla actual (Standard no ve config).
  { prefix: "/settings", section: "settings_org" },
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
 * - Read (GET, o cualquier método fuera de API): permitido si la sección
 *   requerida está en `allowedSections`.
 * - Write (POST/PUT/PATCH/DELETE a una ruta de API): además exige que la
 *   sección esté en `writableSections`.
 *
 * ⚠️ POR QUÉ EL MÉTODO IMPORTA (auditoría 2026-07-22): antes esto sólo miraba
 * `allowedSections` (read+) y jamás el método. Un user con `aura: read` podía
 * hacer POST /api/aura/creators/<id>/settle (registrar pagos), DELETE de
 * campañas, etc. — leer implicaba escribir. Un solo lugar gatea las ~420 rutas.
 */
export function isPathAllowed(params: {
  pathname: string;
  method: string;
  isApi: boolean;
  isStaff: boolean;
  allowedSections: string[] | undefined;
  writableSections: string[] | undefined;
}): boolean {
  if (params.isStaff) return true;
  const section = requiredSectionForPath(params.pathname);
  if (section === null) return true;
  if (!Array.isArray(params.allowedSections)) return true; // fail-open token viejo
  if (!params.allowedSections.includes(section)) return false; // ni ver puede

  const m = params.method.toUpperCase();
  const isWrite = m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE";
  if (params.isApi && isWrite) {
    // ⚠️ FAIL-OPEN SÓLO PARA TOKENS VIEJOS: un JWT emitido antes de este deploy
    // no trae `writableSections`. Bloquear sus writes de golpe lockearía a users
    // legítimos con write hasta que renueven sesión. Se deja pasar; al rotar el
    // JWT (maxAge) el snapshot aparece y el gate se vuelve efectivo. Misma
    // ventana transitoria que el fail-open de `allowedSections`.
    if (!Array.isArray(params.writableSections)) return true;
    return params.writableSections.includes(section);
  }
  return true;
}

// ══════════════════════════════════════════════════════════════
// Landing inteligente: a qué ruta mandar al entrar en "/".
// Prioridad: NitroPixel como landing por defecto y, si no está
// disponible por alguna razón, la primera sección permitida con
// página propia. Así la sesión arranca directamente en
// /nitropixel, que es la pantalla principal que Tomy quiere ver.
// ══════════════════════════════════════════════════════════════
const SECTION_LANDING: Array<{ section: Section; path: string }> = [
  { section: "nitropixel", path: "/nitropixel" },
  { section: "dashboard", path: "/dashboard" },
  { section: "pixel", path: "/pixel" },
  { section: "products", path: "/products" },
  { section: "rentabilidad", path: "/rentabilidad" },
  { section: "orders", path: "/orders" },
  { section: "bondly", path: "/bondly" },
  { section: "aura", path: "/aura" },
  { section: "campaigns", path: "/campaigns" },
  { section: "mercadolibre", path: "/mercadolibre" },
  { section: "competencia", path: "/competitors" },
  { section: "seo", path: "/seo" },
  { section: "pulso", path: "/finanzas" },
  { section: "alertas", path: "/alertas" },
];

/**
 * Ruta de landing para el set de secciones permitidas.
 * - undefined (staff / token viejo sin snapshot) → /dashboard (fallback previo).
 * - si incluye "nitropixel" → /nitropixel.
 * - sino → primera sección permitida con página (ej: solo-pixel → /pixel).
 */
export function landingPathForAllowedSections(
  allowed: string[] | undefined
): string {
  if (!Array.isArray(allowed)) return "/dashboard";
  for (const { section, path } of SECTION_LANDING) {
    if (allowed.includes(section)) return path;
  }
  return "/dashboard";
}
