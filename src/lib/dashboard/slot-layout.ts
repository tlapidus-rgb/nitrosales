// ══════════════════════════════════════════════════════════════
// Dashboard Slot Layout — Row-based puzzle system
// ══════════════════════════════════════════════════════════════
// El tablero es una pila de filas. Cada fila tiene una plantilla
// fija (template) que define cuántos slots contiene y qué tamaño
// tienen. Cada slot sólo acepta widgets cuyo formato encaje en
// ese tamaño. Esto garantiza alineación perfecta y cero huecos.
// ══════════════════════════════════════════════════════════════

import { FormatId, FORMAT_REGISTRY } from "./format-config";

// ── Slot size classes ──────────────────────────────────────────
// El grid base es de 6 columnas. Cada tamaño ocupa un múltiplo
// de columnas y 1 o 2 filas de altura.
export type SlotSize = "xs" | "sm" | "md" | "lg" | "xl";

export interface SlotSizeDef {
  id: SlotSize;
  label: string;
  cols: number; // columnas que ocupa (sobre grid de 6)
  rows: number; // filas verticales (1 = compacto, 2 = alto)
  allowedFormats: FormatId[];
}

export const SLOT_SIZES: Record<SlotSize, SlotSizeDef> = {
  xs: {
    id: "xs",
    label: "Micro",
    cols: 1,
    rows: 1,
    allowedFormats: ["kpi", "sparkline"],
  },
  sm: {
    id: "sm",
    label: "Estándar",
    cols: 2,
    rows: 1,
    allowedFormats: ["big-number", "mini-line", "mini-bar"],
  },
  md: {
    id: "md",
    label: "Mediano",
    cols: 2,
    rows: 2,
    allowedFormats: ["donut", "list"],
  },
  lg: {
    id: "lg",
    label: "Grande",
    cols: 3,
    rows: 2,
    allowedFormats: ["area-full", "bar-full"],
  },
  xl: {
    id: "xl",
    label: "Full width",
    cols: 6,
    rows: 2,
    allowedFormats: ["area-full", "bar-full"],
  },
};

export const ALL_SLOT_SIZES: SlotSize[] = ["xs", "sm", "md", "lg", "xl"];

// Retorna la clase Tailwind de grid-span para un slot dado.
// Las clases tienen que ser literales para que las levante el JIT.
export function slotGridClass(size: SlotSize): string {
  switch (size) {
    case "xs":
      return "col-span-2 md:col-span-1 lg:col-span-1 row-span-1";
    case "sm":
      return "col-span-2 md:col-span-2 lg:col-span-2 row-span-1";
    case "md":
      return "col-span-2 md:col-span-2 lg:col-span-2 row-span-2";
    case "lg":
      return "col-span-2 md:col-span-3 lg:col-span-3 row-span-2";
    case "xl":
      return "col-span-2 md:col-span-3 lg:col-span-6 row-span-2";
  }
}

// ── Row templates ──────────────────────────────────────────────
// Cada plantilla define la estructura de una fila. Los slots suman
// exactamente 6 columnas. La altura (rows) se deriva del slot más
// alto. Los templates son la única forma de armar filas — no se
// pueden componer slots a mano.
export type RowTemplateId =
  | "kpi-6"
  | "kpi-3"
  | "trio-md"
  | "chart-duo"
  | "chart-full";

export interface RowTemplate {
  id: RowTemplateId;
  label: string;
  description: string;
  slots: SlotSize[];
  // Altura visual: "compact" (1 row) o "tall" (2 rows).
  // Se usa para elegir ícono en el picker, no impacta render.
  height: "compact" | "tall";
}

export const ROW_TEMPLATES: Record<RowTemplateId, RowTemplate> = {
  "kpi-6": {
    id: "kpi-6",
    label: "6 KPIs micro",
    description: "Seis KPIs numéricos compactos",
    slots: ["xs", "xs", "xs", "xs", "xs", "xs"],
    height: "compact",
  },
  "kpi-3": {
    id: "kpi-3",
    label: "3 KPIs estándar",
    description: "Tres KPIs grandes con sparkline o mini chart",
    slots: ["sm", "sm", "sm"],
    height: "compact",
  },
  "trio-md": {
    id: "trio-md",
    label: "Trío mediano",
    description: "Tres donuts o listas top-N",
    slots: ["md", "md", "md"],
    height: "tall",
  },
  "chart-duo": {
    id: "chart-duo",
    label: "2 gráficos medianos",
    description: "Dos gráficos de área o barras lado a lado",
    slots: ["lg", "lg"],
    height: "tall",
  },
  "chart-full": {
    id: "chart-full",
    label: "Gráfico full width",
    description: "Un gráfico a todo el ancho del tablero",
    slots: ["xl"],
    height: "tall",
  },
};

export const ALL_ROW_TEMPLATES: RowTemplate[] = Object.values(ROW_TEMPLATES);

// ── Layout model ───────────────────────────────────────────────
export interface LayoutSlot {
  size: SlotSize;
  widgetId: string | null; // null = slot vacío (placeholder)
  format: FormatId | null;
}

export interface LayoutRow {
  id: string; // uid local para drag tracking
  templateId: RowTemplateId;
  title?: string; // título opcional de la fila
  slots: LayoutSlot[];
}

export interface DashboardLayout {
  rows: LayoutRow[];
}

// ── Helpers ────────────────────────────────────────────────────

// Genera un ID único liviano para filas nuevas (no cryptographic).
export function makeRowId(): string {
  return `row_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Dado un tamaño de slot, devuelve los formatos válidos para ese slot.
export function formatsForSize(size: SlotSize): FormatId[] {
  return SLOT_SIZES[size].allowedFormats;
}

// Dado un formato, devuelve el tamaño de slot que le corresponde.
// Usa el primero que lo acepte (los tamaños están ordenados de
// menor a mayor, así que siempre matchea el más chico).
export function sizeForFormat(format: FormatId): SlotSize {
  for (const size of ALL_SLOT_SIZES) {
    if (SLOT_SIZES[size].allowedFormats.includes(format)) return size;
  }
  // Fallback: kpi → xs
  return "xs";
}

// Crea una fila nueva a partir de una plantilla, con todos los
// slots vacíos.
export function createEmptyRow(templateId: RowTemplateId, title?: string): LayoutRow {
  const tpl = ROW_TEMPLATES[templateId];
  return {
    id: makeRowId(),
    templateId,
    title,
    slots: tpl.slots.map((size) => ({
      size,
      widgetId: null,
      format: null,
    })),
  };
}

// Valida que una fila matchee su plantilla (cantidad y tamaño de slots).
// Si no matchea, intenta repararla truncando/rellenando.
export function normalizeRow(row: LayoutRow): LayoutRow {
  const tpl = ROW_TEMPLATES[row.templateId];
  if (!tpl) {
    // Template desconocido — convertir a kpi-6
    return createEmptyRow("kpi-6", row.title);
  }
  const targetSlots = tpl.slots;
  const normalized: LayoutSlot[] = targetSlots.map((size, i) => {
    const existing = row.slots[i];
    if (
      existing &&
      existing.size === size &&
      existing.widgetId &&
      existing.format &&
      SLOT_SIZES[size].allowedFormats.includes(existing.format)
    ) {
      return existing;
    }
    return { size, widgetId: null, format: null };
  });
  return {
    id: row.id || makeRowId(),
    templateId: row.templateId,
    title: row.title,
    slots: normalized,
  };
}

// Cambia el template de una fila. Preserva los widgets compatibles
// en orden (los que no entran se descartan, los slots nuevos quedan
// vacíos).
export function changeRowTemplate(row: LayoutRow, newTemplateId: RowTemplateId): LayoutRow {
  const newTpl = ROW_TEMPLATES[newTemplateId];
  if (!newTpl) return row;

  // Indexamos los slots existentes con widget por tamaño para
  // intentar conservarlos al máximo.
  const pool: LayoutSlot[] = row.slots.filter((s) => s.widgetId && s.format);
  const newSlots: LayoutSlot[] = newTpl.slots.map((size) => {
    // Buscar en el pool algo que encaje en este tamaño
    const idx = pool.findIndex(
      (s) => s.format && SLOT_SIZES[size].allowedFormats.includes(s.format)
    );
    if (idx >= 0) {
      const match = pool.splice(idx, 1)[0];
      return { size, widgetId: match.widgetId, format: match.format };
    }
    return { size, widgetId: null, format: null };
  });

  return {
    id: row.id,
    templateId: newTemplateId,
    title: row.title,
    slots: newSlots,
  };
}

// ── Migration from legacy WidgetInstance[] → DashboardLayout ──
// Agrupa widgets por tamaño de slot y los chunkea en filas del
// template correspondiente. El orden general se preserva.
export function migrateInstancesToLayout(
  instances: Array<{ id: string; format: FormatId }>,
  getWidgetExists: (id: string) => boolean
): DashboardLayout {
  const rows: LayoutRow[] = [];

  // Agrupamos por "bucket" según tamaño. Cada bucket tiene su template.
  const bucketOrder: Array<{ size: SlotSize; template: RowTemplateId; slotsPerRow: number }> = [
    { size: "xs", template: "kpi-6", slotsPerRow: 6 },
    { size: "sm", template: "kpi-3", slotsPerRow: 3 },
    { size: "md", template: "trio-md", slotsPerRow: 3 },
    { size: "lg", template: "chart-duo", slotsPerRow: 2 },
    { size: "xl", template: "chart-full", slotsPerRow: 1 },
  ];

  const buckets: Record<SlotSize, Array<{ id: string; format: FormatId }>> = {
    xs: [],
    sm: [],
    md: [],
    lg: [],
    xl: [],
  };

  for (const inst of instances) {
    if (!getWidgetExists(inst.id)) continue;
    if (!(inst.format in FORMAT_REGISTRY)) continue;
    const size = sizeForFormat(inst.format);
    buckets[size].push(inst);
  }

  for (const { size, template, slotsPerRow } of bucketOrder) {
    const items = buckets[size];
    for (let i = 0; i < items.length; i += slotsPerRow) {
      const chunk = items.slice(i, i + slotsPerRow);
      const row = createEmptyRow(template);
      chunk.forEach((inst, j) => {
        if (j < row.slots.length) {
          row.slots[j] = { size, widgetId: inst.id, format: inst.format };
        }
      });
      rows.push(row);
    }
  }

  return { rows };
}

// Hidrata un layout arbitrario recibido del backend a un DashboardLayout
// válido. Si viene en forma legacy (widgets: WidgetInstance[]), migra.
// Si viene como layout de filas, normaliza cada fila.
export function hydrateLayout(
  raw: unknown,
  getWidgetExists: (id: string) => boolean
): DashboardLayout | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  // Forma nueva: { rows: [...] }
  if (Array.isArray(obj.rows)) {
    const rows: LayoutRow[] = [];
    for (const rawRow of obj.rows) {
      if (!rawRow || typeof rawRow !== "object") continue;
      const r = rawRow as Record<string, unknown>;
      const templateId = r.templateId as RowTemplateId | undefined;
      if (!templateId || !(templateId in ROW_TEMPLATES)) continue;
      const tpl = ROW_TEMPLATES[templateId];
      const rawSlots = Array.isArray(r.slots) ? r.slots : [];
      const slots: LayoutSlot[] = tpl.slots.map((size, i) => {
        const rawSlot = rawSlots[i] as Record<string, unknown> | undefined;
        if (!rawSlot) return { size, widgetId: null, format: null };
        const widgetId = typeof rawSlot.widgetId === "string" ? rawSlot.widgetId : null;
        const format = (rawSlot.format as FormatId | undefined) || null;
        if (!widgetId || !format) return { size, widgetId: null, format: null };
        if (!getWidgetExists(widgetId)) return { size, widgetId: null, format: null };
        if (!SLOT_SIZES[size].allowedFormats.includes(format)) {
          return { size, widgetId: null, format: null };
        }
        return { size, widgetId, format };
      });
      rows.push({
        id: typeof r.id === "string" ? r.id : makeRowId(),
        templateId,
        title: typeof r.title === "string" && r.title.trim().length > 0 ? r.title : undefined,
        slots,
      });
    }
    return { rows };
  }

  return null;
}
