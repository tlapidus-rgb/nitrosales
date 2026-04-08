// ══════════════════════════════════════════════════════════════
// Dashboard Per-Card Filter Config
// ──────────────────────────────────────────────────────────────
// Two-layer model:
//   1. Section defines the POOL of dimensions available.
//   2. Each widget inherits the full pool of its section, but
//      can opt-out of specific filters via `excludeFilters`.
//
// Adding a new widget = pick a section, optionally exclude a few
// filters. The popover & chips system reads this config and
// renders the right filters automatically.
//
// `wired` flag indicates whether the backend currently honours
// this filter. Unwired filters are still shown (so the design
// feels complete) but tagged as Beta in the UI.
// ══════════════════════════════════════════════════════════════

export type FilterOption = {
  value: string;
  label: string;
};

export type FilterDef = {
  id: string;
  label: string;
  // Inline = ≤4 options, segmented control. Dropdown = 5+ options.
  ui: "segmented" | "dropdown";
  options: FilterOption[];
  // Whether the backend currently honours this filter param.
  // When false, the filter is shown but its selection is ignored
  // server-side (preserved client-side until backend is wired).
  wired?: boolean;
};

export type SectionKey =
  | "ventas"
  | "marketing"
  | "seo"
  | "clientes"
  | "finanzas"
  | "productos"
  | "operaciones"
  | "nitropixel";

// ── Reusable filter primitives ──────────────────────────────

const FILTER_CANAL: FilterDef = {
  id: "canal",
  label: "Canal",
  ui: "segmented",
  wired: true,
  options: [
    { value: "all", label: "Todos" },
    { value: "VTEX", label: "VTEX" },
    { value: "MELI", label: "MercadoLibre" },
  ],
};

const FILTER_ESTADO_PEDIDO: FilterDef = {
  id: "estado_pedido",
  label: "Estado del pedido",
  ui: "segmented",
  options: [
    { value: "all", label: "Todos" },
    { value: "delivered", label: "Entregados" },
    { value: "pending", label: "Pendientes" },
    { value: "cancelled", label: "Cancelados" },
  ],
};

const FILTER_PAGO: FilterDef = {
  id: "pago",
  label: "Método de pago",
  ui: "dropdown",
  options: [
    { value: "all", label: "Todos" },
    { value: "1cuota", label: "1 pago" },
    { value: "3cuotas", label: "3 cuotas" },
    { value: "6cuotas", label: "6 cuotas" },
    { value: "12cuotas", label: "12 cuotas" },
    { value: "transferencia", label: "Transferencia" },
    { value: "mercadopago", label: "MercadoPago" },
  ],
};

const FILTER_CATEGORIA: FilterDef = {
  id: "categoria",
  label: "Categoría",
  ui: "dropdown",
  options: [
    { value: "all", label: "Todas las categorías" },
    // Dinámicas en runtime — ver getDynamicCategoryOptions()
  ],
};

const FILTER_TIPO_CLIENTE: FilterDef = {
  id: "tipo_cliente",
  label: "Tipo de cliente",
  ui: "segmented",
  options: [
    { value: "all", label: "Todos" },
    { value: "new", label: "Nuevos" },
    { value: "returning", label: "Recurrentes" },
  ],
};

const FILTER_PROVINCIA: FilterDef = {
  id: "provincia",
  label: "Provincia",
  ui: "dropdown",
  options: [
    { value: "all", label: "Todas las provincias" },
    { value: "CABA", label: "CABA" },
    { value: "BSAS", label: "Buenos Aires" },
    { value: "interior", label: "Interior" },
  ],
};

// ── Marketing-specific ──────────────────────────────────────

const FILTER_PLATAFORMA_AD: FilterDef = {
  id: "plataforma_ad",
  label: "Plataforma",
  ui: "segmented",
  options: [
    { value: "all", label: "Todas" },
    { value: "google", label: "Google" },
    { value: "meta", label: "Meta" },
    { value: "tiktok", label: "TikTok" },
  ],
};

const FILTER_TIPO_CAMPANA: FilterDef = {
  id: "tipo_campana",
  label: "Tipo de campaña",
  ui: "dropdown",
  options: [
    { value: "all", label: "Todas" },
    { value: "search", label: "Search" },
    { value: "shopping", label: "Shopping" },
    { value: "pmax", label: "Performance Max" },
    { value: "feed", label: "Feed" },
    { value: "reels", label: "Reels" },
    { value: "stories", label: "Stories" },
  ],
};

const FILTER_OBJETIVO: FilterDef = {
  id: "objetivo",
  label: "Objetivo",
  ui: "segmented",
  options: [
    { value: "all", label: "Todos" },
    { value: "awareness", label: "Awareness" },
    { value: "conversion", label: "Conversión" },
    { value: "retargeting", label: "Retarget" },
  ],
};

const FILTER_AUDIENCIA: FilterDef = {
  id: "audiencia",
  label: "Audiencia",
  ui: "segmented",
  options: [
    { value: "all", label: "Todas" },
    { value: "cold", label: "Cold" },
    { value: "warm", label: "Warm" },
    { value: "lookalike", label: "LAL" },
  ],
};

// ── Productos / catálogo ────────────────────────────────────

const FILTER_MARCA: FilterDef = {
  id: "marca",
  label: "Marca",
  ui: "dropdown",
  options: [
    { value: "all", label: "Todas las marcas" },
  ],
};

const FILTER_ESTADO_STOCK: FilterDef = {
  id: "estado_stock",
  label: "Estado de stock",
  ui: "segmented",
  options: [
    { value: "all", label: "Todos" },
    { value: "in", label: "En stock" },
    { value: "low", label: "Bajo" },
    { value: "out", label: "Sin stock" },
  ],
};

const FILTER_MARGEN: FilterDef = {
  id: "margen",
  label: "Margen",
  ui: "segmented",
  options: [
    { value: "all", label: "Todos" },
    { value: "high", label: "Alto" },
    { value: "mid", label: "Medio" },
    { value: "low", label: "Bajo" },
  ],
};

// ── Clientes / CRM ──────────────────────────────────────────

const FILTER_RFM: FilterDef = {
  id: "rfm",
  label: "Segmento RFM",
  ui: "dropdown",
  options: [
    { value: "all", label: "Todos los segmentos" },
    { value: "champions", label: "Champions" },
    { value: "loyal", label: "Loyal" },
    { value: "at_risk", label: "At Risk" },
    { value: "lost", label: "Lost" },
    { value: "new", label: "New" },
  ],
};

const FILTER_FRECUENCIA: FilterDef = {
  id: "frecuencia",
  label: "Frecuencia",
  ui: "segmented",
  options: [
    { value: "all", label: "Todos" },
    { value: "1", label: "1 compra" },
    { value: "2-3", label: "2-3" },
    { value: "4+", label: "4+" },
  ],
};

const FILTER_ADQUISICION: FilterDef = {
  id: "adquisicion",
  label: "Canal de adquisición",
  ui: "segmented",
  options: [
    { value: "all", label: "Todos" },
    { value: "paid", label: "Paid" },
    { value: "organic", label: "Orgánico" },
    { value: "direct", label: "Directo" },
    { value: "referral", label: "Referido" },
  ],
};

// ── Operaciones / Logística ─────────────────────────────────

const FILTER_TIPO_ENVIO: FilterDef = {
  id: "tipo_envio",
  label: "Tipo de envío",
  ui: "dropdown",
  options: [
    { value: "all", label: "Todos" },
    { value: "meli_full", label: "ME Full" },
    { value: "meli_flex", label: "ME Flex" },
    { value: "andreani", label: "Andreani" },
    { value: "correo", label: "Correo Argentino" },
    { value: "pickup", label: "Retiro en local" },
  ],
};

const FILTER_ESTADO_ENVIO: FilterDef = {
  id: "estado_envio",
  label: "Estado del envío",
  ui: "segmented",
  options: [
    { value: "all", label: "Todos" },
    { value: "preparing", label: "Preparación" },
    { value: "in_transit", label: "En tránsito" },
    { value: "delivered", label: "Entregado" },
    { value: "failed", label: "Fallido" },
  ],
};

// ── Finanzas ────────────────────────────────────────────────

const FILTER_TIPO_COSTO: FilterDef = {
  id: "tipo_costo",
  label: "Tipo de costo",
  ui: "dropdown",
  options: [
    { value: "all", label: "Todos" },
    { value: "cogs", label: "COGS" },
    { value: "marketing", label: "Marketing" },
    { value: "logistica", label: "Logística" },
    { value: "fees", label: "Payment fees" },
    { value: "impuestos", label: "Impuestos" },
    { value: "fijos", label: "Fijos" },
  ],
};

// ── SEO ─────────────────────────────────────────────────────

const FILTER_FUENTE_TRAFICO: FilterDef = {
  id: "fuente_trafico",
  label: "Fuente",
  ui: "segmented",
  options: [
    { value: "all", label: "Todas" },
    { value: "google", label: "Google" },
    { value: "bing", label: "Bing" },
    { value: "direct", label: "Directo" },
  ],
};

const FILTER_TIPO_PAGINA: FilterDef = {
  id: "tipo_pagina",
  label: "Tipo de página",
  ui: "dropdown",
  options: [
    { value: "all", label: "Todas" },
    { value: "home", label: "Home" },
    { value: "categoria", label: "Categoría" },
    { value: "pdp", label: "PDP" },
    { value: "blog", label: "Blog" },
  ],
};

const FILTER_DEVICE: FilterDef = {
  id: "device",
  label: "Dispositivo",
  ui: "segmented",
  options: [
    { value: "all", label: "Todos" },
    { value: "mobile", label: "Mobile" },
    { value: "desktop", label: "Desktop" },
    { value: "tablet", label: "Tablet" },
  ],
};

const FILTER_BRANDED: FilterDef = {
  id: "branded",
  label: "Branded vs non-branded",
  ui: "segmented",
  options: [
    { value: "all", label: "Todos" },
    { value: "branded", label: "Branded" },
    { value: "non_branded", label: "Non-branded" },
  ],
};

// ── NitroPixel ──────────────────────────────────────────────

const FILTER_PIXEL_FUENTE: FilterDef = {
  id: "pixel_fuente",
  label: "Fuente",
  ui: "segmented",
  options: [
    { value: "all", label: "Todas" },
    { value: "google", label: "Google" },
    { value: "meta", label: "Meta" },
    { value: "organic", label: "Orgánico" },
    { value: "direct", label: "Directo" },
  ],
};

const FILTER_IDENTIFICADO: FilterDef = {
  id: "identificado",
  label: "Identificación",
  ui: "segmented",
  options: [
    { value: "all", label: "Todos" },
    { value: "yes", label: "Identificados" },
    { value: "no", label: "Anónimos" },
  ],
};

// ══════════════════════════════════════════════════════════════
// SECTION → FILTER POOL MAP
// Cada sección define el universo de dimensiones disponibles.
// Cards de esa sección heredan todos por default.
// ══════════════════════════════════════════════════════════════

export const SECTION_FILTERS: Record<SectionKey, FilterDef[]> = {
  ventas: [
    FILTER_CANAL,
    FILTER_ESTADO_PEDIDO,
    FILTER_PAGO,
    FILTER_CATEGORIA,
    FILTER_TIPO_CLIENTE,
    FILTER_PROVINCIA,
  ],
  marketing: [
    FILTER_PLATAFORMA_AD,
    FILTER_TIPO_CAMPANA,
    FILTER_OBJETIVO,
    FILTER_AUDIENCIA,
  ],
  seo: [
    FILTER_FUENTE_TRAFICO,
    FILTER_TIPO_PAGINA,
    FILTER_DEVICE,
    FILTER_BRANDED,
  ],
  clientes: [
    FILTER_RFM,
    FILTER_FRECUENCIA,
    FILTER_ADQUISICION,
    FILTER_PROVINCIA,
  ],
  finanzas: [
    FILTER_TIPO_COSTO,
    FILTER_CANAL,
    FILTER_CATEGORIA,
  ],
  productos: [
    FILTER_CATEGORIA,
    FILTER_MARCA,
    FILTER_ESTADO_STOCK,
    FILTER_MARGEN,
    FILTER_CANAL,
  ],
  operaciones: [
    FILTER_TIPO_ENVIO,
    FILTER_ESTADO_ENVIO,
    FILTER_PROVINCIA,
  ],
  nitropixel: [
    FILTER_PIXEL_FUENTE,
    FILTER_DEVICE,
    FILTER_IDENTIFICADO,
  ],
};

// ══════════════════════════════════════════════════════════════
// Resolver: dado section + excludeFilters, devuelve los filtros
// efectivos que la card debe mostrar.
// ══════════════════════════════════════════════════════════════

export function getApplicableFilters(
  section: SectionKey | undefined,
  excludeFilters?: string[]
): FilterDef[] {
  if (!section) return [];
  const pool = SECTION_FILTERS[section] || [];
  if (!excludeFilters || excludeFilters.length === 0) return pool;
  const exclude = new Set(excludeFilters);
  return pool.filter((f) => !exclude.has(f.id));
}

// ══════════════════════════════════════════════════════════════
// Helper: dado un mapa de valores, devuelve sólo los que NO son
// "all" o vacío. Usado para detectar filtros activos.
// ══════════════════════════════════════════════════════════════

export function countActiveFilters(values: Record<string, string>): number {
  if (!values) return 0;
  return Object.values(values).filter((v) => v && v !== "all").length;
}

// ══════════════════════════════════════════════════════════════
// Helper: builds the API query string fragment for wired filters.
// Unwired filters are skipped from the URL but kept in state.
// ══════════════════════════════════════════════════════════════

export function buildFilterQuery(
  section: SectionKey | undefined,
  excludeFilters: string[] | undefined,
  values: Record<string, string>
): string {
  if (!section || !values) return "";
  const applicable = getApplicableFilters(section, excludeFilters);
  const params: string[] = [];
  for (const f of applicable) {
    if (!f.wired) continue;
    const v = values[f.id];
    if (v && v !== "all") {
      params.push(`${encodeURIComponent(f.id)}=${encodeURIComponent(v)}`);
    }
  }
  return params.join("&");
}
