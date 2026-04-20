// ═══════════════════════════════════════════════════════════════════
// primitives/index.ts — registry central de primitivas Tier 1
// ═══════════════════════════════════════════════════════════════════

import type { PrimitiveDefinition } from "./types";
import { finanzasPrimitives } from "./finanzas";
import { fiscalPrimitives } from "./fiscal";
import { ordersPrimitives } from "./orders";
import { mlPrimitives } from "./ml";
import { adsPrimitives } from "./ads";
import { opsPrimitives } from "./ops";

// Tier 1 — 40+ primitivas productivas (el MVP)
export const PRIMITIVES_REGISTRY: Record<string, PrimitiveDefinition> = {};

const allTier1: PrimitiveDefinition[] = [
  ...finanzasPrimitives,
  ...fiscalPrimitives,
  ...ordersPrimitives,
  ...mlPrimitives,
  ...adsPrimitives,
  ...opsPrimitives,
];

for (const p of allTier1) {
  PRIMITIVES_REGISTRY[p.key] = p;
}

export function getPrimitive(key: string): PrimitiveDefinition | null {
  return PRIMITIVES_REGISTRY[key] ?? null;
}

export function listPrimitives(filter?: {
  module?: string;
  type?: "condition" | "schedule" | "anomaly";
}): PrimitiveDefinition[] {
  let list = Object.values(PRIMITIVES_REGISTRY);
  if (filter?.module) list = list.filter((p) => p.module === filter.module);
  if (filter?.type) list = list.filter((p) => p.type === filter.type);
  return list;
}

export function listModules(): Array<{ module: string; count: number }> {
  const counts = new Map<string, number>();
  for (const p of Object.values(PRIMITIVES_REGISTRY)) {
    counts.set(p.module, (counts.get(p.module) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([module, count]) => ({ module, count }));
}

export type { PrimitiveDefinition, EvaluationContext, EvaluationResult } from "./types";
