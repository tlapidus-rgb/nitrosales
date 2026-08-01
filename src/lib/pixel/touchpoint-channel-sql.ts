// ══════════════════════════════════════════════════════════════════════════
// Resolución de CANAL a nivel touchpoint (capa de LECTURA del serve)
// ══════════════════════════════════════════════════════════════════════════
// Aplica las reglas de canal (channel_rule) sobre el `source/medium/campaign` que
// el touchpoint YA tiene en su JSONB. Es SOLO lectura: agrupa por canal la plata
// que la atribución ya calculó — NO toca la matemática de `attribution.ts` (CORE
// PROTEGIDO), que sigue byte-idéntica. El total de revenue no cambia; solo se
// re-agrupa de "por source" a "por canal".
//
// ⚠️ El `source` del touchpoint lo escribe attribution.ts con SU clasificador, que
// difiere del SQL first-source de la dim en algunos casos (ej. apps móviles:
// touchpoint 'instagram' vs dim 'referral'). Es divergencia CONOCIDA: para vistas
// first-touch/visitante se resuelve desde la DIM (paridad con el panel); el
// multi-touch usa esta resolución por-touchpoint. Ver canales-serve-integration.local.md.
//
// Espejo EXACTO de DIM_RULE_EXPRS (channel-rollup.ts) pero leyendo del touchpoint,
// así la misma regla resuelve igual sobre las dos fuentes cuando el source coincide.
// ══════════════════════════════════════════════════════════════════════════

import { Prisma } from "@prisma/client";
import {
  buildChannelRuleCase,
  buildSubChannelCase,
  type ChannelRule,
  type RuleExprs,
} from "@/lib/pixel/channel-rules";

/** Exprs de canal sobre un touchpoint JSONB (`tpExpr`, ej. "tp" o "pa.touchpoints::jsonb->0"). */
export function touchpointChannelExprs(tpExpr: string): RuleExprs {
  return {
    // source crudo del touchpoint, lower+trim, vacío/espacios → 'direct' (igual que
    // la dim y que el clasificador JS: `|| 'direct'`).
    source: `COALESCE(NULLIF(LOWER(TRIM(${tpExpr}->>'source')), ''), 'direct')`,
    medium: `LOWER(TRIM(COALESCE(${tpExpr}->>'medium', '')))`,
    campaign: `LOWER(TRIM(COALESCE(${tpExpr}->>'campaign', '')))`,
    // campaign SIN normalizar — valor del sub-canal (preserva mayúsculas: AXN/TNT).
    campaignRaw: `NULLIF(TRIM(${tpExpr}->>'campaign'), '')`,
  };
}

/** CASE de canal para un touchpoint. PURO (string SQL). */
export function buildTouchpointChannelCase(rules: ChannelRule[], tpExpr: string): string {
  return buildChannelRuleCase(rules, touchpointChannelExprs(tpExpr));
}

/** CASE de sub-canal (TV: AXN/TNT) para un touchpoint. */
export function buildTouchpointSubChannelCase(rules: ChannelRule[], tpExpr: string): string {
  return buildSubChannelCase(rules, touchpointChannelExprs(tpExpr));
}

/**
 * `Prisma.raw` del CASE de canal, para interpolar dentro de un tagged template
 * `prisma.$queryRaw`...`` del serve. El SQL crudo es 100% literales escapados
 * (escLit/escLike sobre los valores de channel_rule) + la expresión del touchpoint;
 * sin input de usuario sin escapar. Mismo patrón que `touchpointSourceSql`.
 */
export function touchpointChannelSql(rules: ChannelRule[], tpExpr: string): Prisma.Sql {
  return Prisma.raw(buildTouchpointChannelCase(rules, tpExpr));
}
