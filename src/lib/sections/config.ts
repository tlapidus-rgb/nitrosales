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

// ══════════════════════════════════════════════════════════════
// CAPACIDADES (E-30, 2026-09-13)
// ══════════════════════════════════════════════════════════════
// `/orders` y `/products` pedían `[["VTEX","MERCADOLIBRE"]]` — la lista de
// plataformas escrita a mano. El problema no es que esté mal hoy: es que el día
// que entre Shopify o Tiendanube, esas secciones quedan **bloqueadas para ese
// cliente** hasta que alguien se acuerde de editar este array.
//
// Y no falla ruidosamente: el cliente nuevo entra, ve un candado sobre
// "Pedidos" y concluye que el producto no soporta su plataforma.
//
// La diferencia es qué se declara. `/orders` no necesita VTEX: necesita **que
// haya pedidos de algún lado**. Eso es una capacidad, y la plataforma es un
// detalle de quién la provee.
//
// Sumar una plataforma pasa a ser una línea en `CAPACIDADES_DE`, y todas las
// secciones que pedían capacidades se desbloquean solas.
// ══════════════════════════════════════════════════════════════

/** Lo que una sección necesita PODER hacer, sin decir quién se lo da. */
export type Capacidad =
  /** Hay pedidos entrando de algún lado. */
  | "PEDIDOS"
  /** Hay un catálogo de productos. */
  | "CATALOGO"
  /** Hay inversión publicitaria medible. */
  | "PUBLICIDAD"
  /** Hay tráfico web propio trackeado. */
  | "TRAFICO_WEB";

const TODAS_LAS_CAPACIDADES: readonly Capacidad[] = [
  "PEDIDOS",
  "CATALOGO",
  "PUBLICIDAD",
  "TRAFICO_WEB",
];

/**
 * Qué aporta cada integración.
 *
 * **Éste es el único lugar que hay que tocar para sumar una plataforma.**
 */
export const CAPACIDADES_DE: Record<RequiredIntegration, Capacidad[]> = {
  VTEX: ["PEDIDOS", "CATALOGO"],
  MERCADOLIBRE: ["PEDIDOS", "CATALOGO"],
  META_ADS: ["PUBLICIDAD"],
  GOOGLE_ADS: ["PUBLICIDAD"],
  // Search Console trae búsqueda orgánica, no tráfico propio trackeado: no
  // reemplaza al pixel para lo que `/analytics` necesita.
  GOOGLE_SEARCH_CONSOLE: [],
  NITROPIXEL: ["TRAFICO_WEB"],
};

/** `true` si el string es una capacidad y no el nombre de una integración. */
export function esCapacidad(v: string): v is Capacidad {
  return (TODAS_LAS_CAPACIDADES as readonly string[]).includes(v);
}

/**
 * ¿Las integraciones conectadas satisfacen este requisito?
 *
 * Un requisito puede ser el nombre de una integración —y ahí se pide esa y no
 * otra, como `/campaigns/meta`, que de verdad necesita Meta— o una capacidad,
 * y ahí sirve cualquier integración que la provea.
 */
export function satisface(requisito: string, conectadas: Set<string>): boolean {
  if (!esCapacidad(requisito)) return conectadas.has(requisito);
  for (const conectada of conectadas) {
    const capacidades = CAPACIDADES_DE[conectada as RequiredIntegration];
    if (capacidades?.includes(requisito)) return true;
  }
  return false;
}

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
  requires?: Array<RequiredIntegration | Capacidad> | Array<Array<RequiredIntegration | Capacidad>>;
}

export const SECTIONS: SectionConfig[] = [
  // Tier 1 — Activos digitales
  { key: "nitropixel", path: "/nitropixel", label: "NitroPixel" }, // siempre activa
  { key: "chat", path: "/chat", label: "Aurum (chat IA)" },

  // Tier 2 — Control de gestión
  { key: "dashboard", path: "/dashboard", label: "Centro de Control" }, // siempre activa
  // Pide la CAPACIDAD, no la lista de plataformas: una plataforma nueva la
  // desbloquea sola en cuanto figure en CAPACIDADES_DE.
  { key: "orders", path: "/orders", label: "Pedidos", requires: ["PEDIDOS"] },
  { key: "products", path: "/products", label: "Productos", requires: ["CATALOGO"] },
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

  // `satisface` resuelve las dos formas de requisito: el nombre de una
  // integración puntual, o una capacidad que puede aportar cualquiera.
  if (isOrShape) {
    // Cualquier grupo OR satisface.
    const groups = config.requires as string[][];
    const someGroupOk = groups.some((group) => group.some((r) => satisface(r, connectedPlatforms)));
    return someGroupOk ? "ACTIVE" : "LOCKED_INTEGRATION";
  } else {
    // AND: todas requeridas.
    const all = config.requires as string[];
    const allOk = all.every((r) => satisface(r, connectedPlatforms));
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

  // Un requisito que es una capacidad se traduce a las integraciones que la
  // proveen. Sin esto, la UI de un `/orders` bloqueado diría "te falta PEDIDOS",
  // que no le dice nada a nadie: el usuario no puede conectar una capacidad,
  // conecta una plataforma.
  const aIntegraciones = (requisito: string): RequiredIntegration[] => {
    if (!esCapacidad(requisito)) return [requisito as RequiredIntegration];
    return (Object.keys(CAPACIDADES_DE) as RequiredIntegration[]).filter((i) =>
      CAPACIDADES_DE[i].includes(requisito),
    );
  };

  const sinRepetir = (xs: RequiredIntegration[]) => [...new Set(xs)];

  const isOrShape = Array.isArray(config.requires[0]);
  if (isOrShape) {
    const groups = config.requires as string[][];
    // Si algún grupo está completo, no falta nada.
    if (groups.some((g) => g.some((r) => satisface(r, connectedPlatforms)))) return [];
    // Sino: devolvemos las del primer grupo (la opción más simple).
    return sinRepetir(groups[0].flatMap(aIntegraciones));
  } else {
    const all = config.requires as string[];
    return sinRepetir(
      all.filter((r) => !satisface(r, connectedPlatforms)).flatMap(aIntegraciones),
    );
  }
}
