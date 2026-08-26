// ══════════════════════════════════════════════════════════════════════════
// NitroPixel — Persistencia de reglas de canal (Opción C, Fase 3)
// ══════════════════════════════════════════════════════════════════════════
// La tabla `channel_rule` guarda las reglas (globales + por org). Es SQL crudo,
// igual que el resto del pipeline del pixel (pixel_visitor_first_source,
// pixel_daily_source, …) — NO es modelo de Prisma. Se crea/siembra por endpoint
// admin (ver /api/admin/channel-rules-setup), no por `prisma migrate`
// (orden de migraciones de CLAUDE.md).
//
// `loadChannelRules` trae globales + las de la org; `buildChannelRuleCase`
// (channel-rules.ts) resuelve poniendo las de la org primero.
// ══════════════════════════════════════════════════════════════════════════

import type { ChannelRule, MatchType, RuleDim } from "@/lib/pixel/channel-rules";

export const CHANNEL_RULE_DDL = `
CREATE TABLE IF NOT EXISTS channel_rule (
  id               text PRIMARY KEY,
  "organizationId" text,                       -- NULL = regla global (built-in)
  priority         int  NOT NULL DEFAULT 100,  -- menor = evalúa primero
  source_match     text, source_pattern   text,
  medium_match     text, medium_pattern   text,
  campaign_match   text, campaign_pattern text,
  channel          text NOT NULL,
  sub_from         text,                        -- NULL | 'campaign' (sub-canal, ej. TV)
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS channel_rule_org_priority_idx
  ON channel_rule ("organizationId", priority) WHERE is_active;
`.trim();

/** SELECT de las reglas activas aplicables a una org (globales + de la org). */
export const LOAD_CHANNEL_RULES_SQL = `
  SELECT id, "organizationId", priority,
         source_match, source_pattern, medium_match, medium_pattern,
         campaign_match, campaign_pattern, channel, sub_from
  FROM channel_rule
  WHERE is_active AND ("organizationId" = $1 OR "organizationId" IS NULL)
  ORDER BY ("organizationId" IS NOT NULL) DESC, priority ASC
`.trim();

export interface ChannelRuleRow {
  id: string;
  organizationId: string | null;
  priority: number;
  source_match: string | null;
  source_pattern: string | null;
  medium_match: string | null;
  medium_pattern: string | null;
  campaign_match: string | null;
  campaign_pattern: string | null;
  channel: string;
  sub_from: string | null;
}

const VALID_MATCH: ReadonlySet<string> = new Set(["exact", "in", "prefix", "contains"]);
function dimFrom(match: string | null, pattern: string | null): RuleDim | undefined {
  if (!match || pattern == null) return undefined;
  if (!VALID_MATCH.has(match)) return undefined; // regla inválida → se ignora esa dim
  return { match: match as MatchType, pattern };
}

/** Fila de `channel_rule` → objeto `ChannelRule` que consume `buildChannelRuleCase`. */
export function rowToChannelRule(r: ChannelRuleRow): ChannelRule {
  return {
    id: r.id,
    organizationId: r.organizationId,
    priority: r.priority,
    source: dimFrom(r.source_match, r.source_pattern),
    medium: dimFrom(r.medium_match, r.medium_pattern),
    campaign: dimFrom(r.campaign_match, r.campaign_pattern),
    channel: r.channel,
    subFrom: r.sub_from === "campaign" ? "campaign" : null,
  };
}

/** Valores para el INSERT de una regla (seed o alta desde la UI). Idempotente por id. */
export function ruleInsertParams(
  r: ChannelRule & { subFrom?: string | null }
): unknown[] {
  return [
    r.id,
    r.organizationId ?? null,
    r.priority,
    r.source?.match ?? null,
    r.source?.pattern ?? null,
    r.medium?.match ?? null,
    r.medium?.pattern ?? null,
    r.campaign?.match ?? null,
    r.campaign?.pattern ?? null,
    r.channel,
    r.subFrom ?? null,
  ];
}

export const INSERT_CHANNEL_RULE_SQL = `
  INSERT INTO channel_rule
    (id, "organizationId", priority, source_match, source_pattern,
     medium_match, medium_pattern, campaign_match, campaign_pattern, channel, sub_from)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
  ON CONFLICT (id) DO UPDATE SET
    "organizationId"=EXCLUDED."organizationId", priority=EXCLUDED.priority,
    source_match=EXCLUDED.source_match, source_pattern=EXCLUDED.source_pattern,
    medium_match=EXCLUDED.medium_match, medium_pattern=EXCLUDED.medium_pattern,
    campaign_match=EXCLUDED.campaign_match, campaign_pattern=EXCLUDED.campaign_pattern,
    channel=EXCLUDED.channel, sub_from=EXCLUDED.sub_from, updated_at=now()
`.trim();
