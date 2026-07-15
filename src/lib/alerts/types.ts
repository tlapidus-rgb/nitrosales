// ═══════════════════════════════════════════════════════════════════
// alerts/types.ts — tipos compartidos del subsistema de alertas
// ═══════════════════════════════════════════════════════════════════
// Extraídos de alert-hub.ts (Fase 1.5 S4) para romper el ciclo
// alert-hub ⇄ engine: engine solo necesita estos tipos (import type),
// así que viven acá y ambos los importan sin depender uno del otro.
// Son puros (0 runtime); alert-hub los re-exporta para compat externa.
// ═══════════════════════════════════════════════════════════════════

export type AlertSource =
  | "finanzas_narrative"
  | "finanzas_predictive"
  | "fiscal_monotributo"
  | "fiscal_calendar"
  | "marketing_cac_ltv"
  | "mercadolibre"
  | "system_sync"
  | "inventory"
  | "aurum"
  | "bondly"
  | "aura"
  | "nitropixel"
  | "custom";

export type AlertCategory =
  | "finanzas"
  | "fiscal"
  | "marketing"
  | "operaciones"
  | "ventas"
  | "sistema"
  | "asistente";

export type AlertSeverity = "critical" | "warning" | "info";
export type AlertPriority = "HIGH" | "MEDIUM" | "LOW";

export interface UnifiedAlert {
  id: string;                // deterministico (ej: `finanzas.predictive.shipping_spike.2026-04`)
  source: AlertSource;
  category: AlertCategory;
  severity: AlertSeverity;
  priority: AlertPriority;
  title: string;
  body: string;
  cta?: string | null;
  ctaHref?: string | null;   // Fase 8e: link directo del CTA
  metadata?: Record<string, any>;
  createdAt: string;
  expiresAt?: string | null;
  favorited?: boolean;       // Fase 8e: marcada como favorita por el user
  read?: boolean;            // Fase 8e fix: marcada como leida por el user
}
