// ══════════════════════════════════════════════════════════════════════════
// F3.2 canales — rollup del CANAL RESUELTO (pixel_daily_channel)
// ══════════════════════════════════════════════════════════════════════════
// Materializa el canal (y sub-canal) resuelto por `channel_rule` sobre los
// crudos de la dim (source_raw/medium_raw/campaign_raw, F3.1). Tabla PARALELA a
// `pixel_daily_source`: el backfill la puebla SIEMPRE (aditivo, no toca la
// tabla vieja), y el serve la lee detrás de flag. Rollback = flag off, sin
// reprocesar nada (el beneficio de Opción C: cambiar reglas NO reescanea
// pixel_events; re-materializar este rollup alcanza).
//
// Grain: (org, día, channel, sub_channel). sub_channel = '' cuando no hay
// (solo TV lo usa, decisión 4). El canal se resuelve con las MISMAS reglas y el
// MISMO `buildChannelRuleCase` que el preview de la UI → lo que se ve antes de
// guardar es exactamente lo que materializa el rollup.
// ══════════════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";
import {
  buildChannelRuleCase,
  buildSubChannelCase,
  type ChannelRule,
  type RuleExprs,
} from "@/lib/pixel/channel-rules";
import {
  LOAD_CHANNEL_RULES_SQL,
  rowToChannelRule,
  type ChannelRuleRow,
} from "@/lib/pixel/channel-rules-store";

export const PIXEL_DAILY_CHANNEL_DDL = `
CREATE TABLE IF NOT EXISTS pixel_daily_channel (
  "organizationId" text NOT NULL,
  day             date NOT NULL,
  channel         text NOT NULL,
  sub_channel     text NOT NULL DEFAULT '',
  pv_visitors_hll hll,
  refreshed_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("organizationId", day, channel, sub_channel)
)`.trim();

// Expresiones de la dim para las reglas. La fila de la dim viene con alias `d`.
//   - source/medium ya están en minúscula (F3.1 los guarda LOWER).
//   - campaign para MATCHEAR va en minúscula (los patrones se comparan lower);
//     campaignRaw para el SUB-canal preserva mayúsculas (AXN/TNT, decisión 4).
export const DIM_RULE_EXPRS: RuleExprs = {
  source: `d.source_raw`,
  medium: `COALESCE(d.medium_raw, '')`,
  campaign: `LOWER(COALESCE(d.campaign_raw, ''))`,
  campaignRaw: `d.campaign_raw`,
};

/**
 * Statement del rollup de canal (paralelo al #6 de rollup-backfill). PURO: recibe
 * los CASE ya generados. Placeholders: $1 org, $2/$3 ts, $4/$5 día AR.
 * `visitPageview` = el filtro de visita del backfill (mismo que pixel_daily_source).
 */
export function buildChannelRollupStatement(
  channelCase: string,
  subChannelCase: string,
  visitPageview: string
): string {
  return `
INSERT INTO pixel_daily_channel ("organizationId",day,channel,sub_channel,pv_visitors_hll,refreshed_at)
SELECT pe."organizationId", (pe.timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
  COALESCE(${channelCase}, 'sin_clasificar'),
  COALESCE(${subChannelCase}, ''),
  hll_add_agg(hll_hash_text(pe."visitorId"), 16, 5) FILTER (WHERE ${visitPageview}),
  now()
FROM pixel_events pe
LEFT JOIN pixel_visitor_first_source d
  ON d."organizationId"=pe."organizationId" AND d."visitorId"=pe."visitorId"
WHERE pe."organizationId"=$1
  AND pe.timestamp >= $2::timestamptz AND pe.timestamp < $3::timestamptz
  AND (pe.timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date >= $4::date
  AND (pe.timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date <  $5::date
  AND (pe."sessionId" IS NULL OR pe."sessionId" NOT LIKE 'webhook-%')
GROUP BY 1,2,3,4
ON CONFLICT ("organizationId",day,channel,sub_channel) DO UPDATE SET
  pv_visitors_hll=EXCLUDED.pv_visitors_hll, refreshed_at=now()`.trim();
}

/** CASE de canal + sub-canal para una lista de reglas, sobre la dim (alias `d`). */
export function channelCasesFromRules(rules: ChannelRule[]): {
  channelCase: string;
  subChannelCase: string;
} {
  return {
    channelCase: buildChannelRuleCase(rules, DIM_RULE_EXPRS),
    subChannelCase: buildSubChannelCase(rules, DIM_RULE_EXPRS),
  };
}

/**
 * Carga las reglas de una org (globales + de la org) y devuelve los CASE listos.
 * Si `channel_rule` no existe todavía, devuelve reglas vacías → el canal cae al
 * passthrough (source crudo) — nunca rompe el backfill.
 */
export async function loadOrgChannelCases(orgId: string): Promise<{
  channelCase: string;
  subChannelCase: string;
}> {
  let rows: ChannelRuleRow[] = [];
  try {
    rows = (await prisma.$queryRawUnsafe(
      LOAD_CHANNEL_RULES_SQL,
      orgId
    )) as ChannelRuleRow[];
  } catch {
    rows = []; // tabla inexistente → passthrough, no rompe
  }
  return channelCasesFromRules(rows.map(rowToChannelRule));
}
