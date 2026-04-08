// ══════════════════════════════════════════════════════════════
// Dashboard Widget Formats
// ══════════════════════════════════════════════════════════════
// Cada widget puede mostrarse en distintos "formatos" visuales.
// Acá se definen los formatos disponibles, su tamaño en grid,
// label y descripción para el catalog modal.
// ══════════════════════════════════════════════════════════════

export type FormatId =
  | "kpi"          // 1×1  — número grande clásico con sparkline
  | "big-number"   // 2×1  — número XXL hero
  | "sparkline"    // 1×1  — solo línea, sin número
  | "mini-line"    // 2×1  — línea con eje sutil
  | "mini-bar"     // 2×1  — barras compactas
  | "donut"        // 2×2  — donut con leyenda
  | "list"         // 2×2  — top-N con barras horizontales
  | "area-full"    // 4×2  — area chart full width
  | "bar-full";    // 4×2  — bar chart full width

export interface FormatDef {
  id: FormatId;
  label: string;
  description: string;
  // Grid spans (base unit = 1 column en grid de 6 cols, 1 row de KPI)
  colSpan: number; // 1, 2, 3, 4
  rowSpan: number; // 1, 2
  // Categoría visual: small (KPI grid) o large (chart grid)
  shape: "small" | "wide" | "tall" | "full";
}

export const FORMAT_REGISTRY: Record<FormatId, FormatDef> = {
  kpi: {
    id: "kpi",
    label: "Numérico",
    description: "Número grande con delta y sparkline",
    colSpan: 1,
    rowSpan: 1,
    shape: "small",
  },
  "big-number": {
    id: "big-number",
    label: "Número XL",
    description: "Hero number gigante para destacar",
    colSpan: 2,
    rowSpan: 1,
    shape: "wide",
  },
  sparkline: {
    id: "sparkline",
    label: "Sparkline",
    description: "Solo la línea de tendencia",
    colSpan: 1,
    rowSpan: 1,
    shape: "small",
  },
  "mini-line": {
    id: "mini-line",
    label: "Mini línea",
    description: "Línea con eje y tooltip",
    colSpan: 2,
    rowSpan: 1,
    shape: "wide",
  },
  "mini-bar": {
    id: "mini-bar",
    label: "Mini barras",
    description: "Barras compactas por día",
    colSpan: 2,
    rowSpan: 1,
    shape: "wide",
  },
  donut: {
    id: "donut",
    label: "Donut",
    description: "Distribución porcentual",
    colSpan: 2,
    rowSpan: 2,
    shape: "tall",
  },
  list: {
    id: "list",
    label: "Top lista",
    description: "Top-N con barras horizontales",
    colSpan: 2,
    rowSpan: 2,
    shape: "tall",
  },
  "area-full": {
    id: "area-full",
    label: "Área grande",
    description: "Gráfico de área full width",
    colSpan: 4,
    rowSpan: 2,
    shape: "full",
  },
  "bar-full": {
    id: "bar-full",
    label: "Barras grande",
    description: "Gráfico de barras full width",
    colSpan: 4,
    rowSpan: 2,
    shape: "full",
  },
};

export const ALL_FORMAT_IDS: FormatId[] = Object.keys(FORMAT_REGISTRY) as FormatId[];

// Tailwind grid span classes (las clases tienen que ser literales para JIT)
export function formatGridClass(format: FormatId): string {
  switch (format) {
    case "kpi":
    case "sparkline":
      return "col-span-2 md:col-span-1 lg:col-span-1 row-span-1";
    case "big-number":
    case "mini-line":
    case "mini-bar":
      return "col-span-2 md:col-span-2 lg:col-span-2 row-span-1";
    case "donut":
    case "list":
      return "col-span-2 md:col-span-2 lg:col-span-2 row-span-2";
    case "area-full":
    case "bar-full":
      return "col-span-2 md:col-span-3 lg:col-span-4 row-span-2";
  }
}

// Active widget instance (id + chosen format)
export interface WidgetInstance {
  id: string;
  format: FormatId;
}

// Migra strings legacy a instancias con su default format
export function hydrateWidgetList(
  raw: unknown,
  defaultFormatLookup: (id: string) => FormatId
): WidgetInstance[] {
  if (!Array.isArray(raw)) return [];
  const out: WidgetInstance[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      out.push({ id: item, format: defaultFormatLookup(item) });
    } else if (item && typeof item === "object" && typeof (item as any).id === "string") {
      const inst = item as Record<string, unknown>;
      const fmt = inst.format as FormatId | undefined;
      const isValid = fmt && (fmt in FORMAT_REGISTRY);
      out.push({
        id: inst.id as string,
        format: isValid ? (fmt as FormatId) : defaultFormatLookup(inst.id as string),
      });
    }
  }
  return out;
}
