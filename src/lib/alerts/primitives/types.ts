// ═══════════════════════════════════════════════════════════════════
// primitives/types.ts — Fase 8g-1
// ═══════════════════════════════════════════════════════════════════
// Tipos base del sistema de primitivas. Toda primitiva implementa
// esta interfaz y se registra en registry.ts.
// ═══════════════════════════════════════════════════════════════════

export type PrimitiveType = "condition" | "schedule" | "anomaly";

export type AlertSeverity = "critical" | "warning" | "info";

export type AlertChannel = "in_app" | "email" | "whatsapp" | "push_browser" | "slack" | "sms";

// Context que recibe la primitiva al evaluar
export interface EvaluationContext {
  orgId: string;
  userId: string | null;
  params: Record<string, any>;
  now: Date;
  lastFiredAt?: Date | null;
}

// Resultado de evaluar una primitiva
export interface EvaluationResult {
  triggered: boolean;             // Si cumple la condición / si es schedule, siempre true
  severity?: AlertSeverity;       // Puede overridear el default
  title?: string;                 // Título dinámico (ej: "Runway crítico: 1.8 meses")
  body?: string;                  // Descripción humana del dato
  metadata?: Record<string, any>; // Datos para mostrar en detail pane
  ctaHref?: string;               // Link al módulo relevante
  cta?: string;                   // Texto del CTA
  // Para evitar duplicar alertas iguales
  dedupeKey?: string;
}

// Definición de una primitiva en el registry
export interface PrimitiveDefinition {
  key: string;                    // ej: "finanzas.runway.below_months"
  type: PrimitiveType;            // condition / schedule / anomaly
  module: string;                 // ej: "finanzas", "ml", "orders"
  submodule?: string;             // ej: "pulso", "preguntas"
  label: string;                  // título humano (ej: "Runway bajo X meses")
  description: string;            // descripción larga
  defaultSeverity: AlertSeverity;
  defaultChannels: AlertChannel[];
  defaultCooldownMinutes: number;
  paramsSchema: {
    [key: string]: {
      type: "number" | "string" | "array" | "boolean";
      label: string;
      default?: any;
      required: boolean;
      description?: string;
      min?: number;
      max?: number;
      options?: Array<{ value: string; label: string }>;
    };
  };
  // Ejemplos de cómo pedirlo en Aurum
  naturalExamples: string[];
  // La función que evalúa la primitiva
  evaluate: (ctx: EvaluationContext) => Promise<EvaluationResult>;
}

// Para stub de primitivas que todavía no están implementadas
export function stubPrimitive(
  key: string,
  type: PrimitiveType = "condition",
  module: string = "generic",
  label?: string
): PrimitiveDefinition {
  return {
    key,
    type,
    module,
    label: label ?? key,
    description: "Stub — implementación pendiente",
    defaultSeverity: "info",
    defaultChannels: ["in_app"],
    defaultCooldownMinutes: 60,
    paramsSchema: {},
    naturalExamples: [],
    evaluate: async () => ({ triggered: false }),
  };
}

// Helpers para primitivas condicionales con operadores
export interface ConditionOperator {
  op:
    | "below"
    | "above"
    | "between"
    | "equals"
    | "not_equals"
    | "drops_by"
    | "rises_by"
    | "changes_by"
    | "is_zero"
    | "crosses_below"
    | "crosses_above"
    | "trending_down"
    | "trending_up";
  value?: number;
  min?: number;
  max?: number;
  percent?: number;
  n?: number;
}

export function applyOperator(
  currentValue: number,
  operator: ConditionOperator,
  prevValue?: number | null,
  series?: number[]
): boolean {
  switch (operator.op) {
    case "below":
      return currentValue < (operator.value ?? 0);
    case "above":
      return currentValue > (operator.value ?? 0);
    case "between":
      return (
        currentValue >= (operator.min ?? -Infinity) &&
        currentValue <= (operator.max ?? Infinity)
      );
    case "equals":
      return currentValue === (operator.value ?? 0);
    case "not_equals":
      return currentValue !== (operator.value ?? 0);
    case "is_zero":
      return currentValue === 0;
    case "drops_by":
      if (prevValue == null || prevValue === 0) return false;
      return ((prevValue - currentValue) / prevValue) * 100 >= (operator.percent ?? 0);
    case "rises_by":
      if (prevValue == null || prevValue === 0) return false;
      return ((currentValue - prevValue) / prevValue) * 100 >= (operator.percent ?? 0);
    case "changes_by":
      if (prevValue == null || prevValue === 0) return false;
      return Math.abs(((currentValue - prevValue) / prevValue) * 100) >= (operator.percent ?? 0);
    case "crosses_below":
      if (prevValue == null) return false;
      return prevValue >= (operator.value ?? 0) && currentValue < (operator.value ?? 0);
    case "crosses_above":
      if (prevValue == null) return false;
      return prevValue < (operator.value ?? 0) && currentValue >= (operator.value ?? 0);
    case "trending_down":
      if (!series || series.length < (operator.n ?? 3)) return false;
      const lastN = series.slice(-(operator.n ?? 3));
      return lastN.every((v, i) => i === 0 || v < lastN[i - 1]);
    case "trending_up":
      if (!series || series.length < (operator.n ?? 3)) return false;
      const lastNUp = series.slice(-(operator.n ?? 3));
      return lastNUp.every((v, i) => i === 0 || v > lastNUp[i - 1]);
    default:
      return false;
  }
}
