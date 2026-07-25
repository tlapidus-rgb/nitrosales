// ══════════════════════════════════════════════════════════════════════════
// NitroPixel — Motor de resolución de canal (Opción C, Fase 2)
// ══════════════════════════════════════════════════════════════════════════
// Convierte un set de reglas `(source, medium, campaign) → canal` en un CASE SQL
// ordenado por prioridad. Es la ÚNICA implementación de la resolución: la usa
// tanto el rollup (materializa el canal en pixel_daily_source) como el preview de
// la UI de /control (mismo CASE sobre el crudo reciente). Una sola fuente ⇒ el
// preview no puede divergir de lo que termina viendo el cliente.
//
// Las reglas seed globales (SEED_CHANNEL_RULES) codifican las 4 decisiones de
// Tomy (2026-07-25): Meta unificado + pago/orgánico separados, Google, pasarelas
// como canal propio, TV (por-org). Las reglas por org se agregan desde la tabla
// `channel_rule` (Fase 3) con prioridad más alta que las globales.
//
// ⚠️ La distinción llegada-vs-vuelta-de-pasarela NO vive acá (necesita referrer,
// que no está en (source,medium,campaign)): se congela en el ingest y las vueltas
// ya no llegan a esta resolución. Ver DISEÑO-CANALES-OPCION-C.local.md §1.
// ══════════════════════════════════════════════════════════════════════════

import { GOOGLE_UTM_ALIASES, META_UTM_ALIASES } from "@/lib/pixel/source-classification";

export type MatchType = "exact" | "in" | "prefix" | "contains";

/** Una condición sobre UNA dimensión (source | medium | campaign). */
export interface RuleDim {
  match: MatchType;
  /** Para `in`: lista separada por `|`. Todo se compara en minúsculas. */
  pattern: string;
}

export interface ChannelRule {
  id: string;
  /** NULL/undefined = regla global (built-in). */
  organizationId?: string | null;
  /** Menor = evalúa primero (el primer match gana). */
  priority: number;
  source?: RuleDim;
  medium?: RuleDim;
  campaign?: RuleDim;
  /** Canal canónico destino. */
  channel: string;
}

/** Expresiones SQL de cada dimensión, YA normalizadas (lower+trim) por el caller. */
export interface RuleExprs {
  source: string;
  medium: string;
  campaign: string;
}

const escLit = (s: string) => s.replace(/'/g, "''");
const escLike = (s: string) => s.replace(/'/g, "''").replace(/([%_\\])/g, "\\$1");

/** Condición SQL de una dimensión contra su expresión (normalizada). */
function dimCondSql(expr: string, dim: RuleDim): string {
  const p = dim.pattern.toLowerCase();
  switch (dim.match) {
    case "exact":
      return `${expr} = '${escLit(p)}'`;
    case "in": {
      const list = p
        .split("|")
        .map((v) => `'${escLit(v.trim())}'`)
        .join(",");
      return `${expr} IN (${list})`;
    }
    case "prefix":
      return `${expr} LIKE '${escLike(p)}%' ESCAPE '\\'`;
    case "contains":
      return `${expr} LIKE '%${escLike(p)}%' ESCAPE '\\'`;
  }
}

/**
 * Genera el CASE SQL de resolución de canal. Las reglas se ordenan por
 * `priority` asc (el primer WHEN que matchea gana). ELSE = passthrough: el
 * `source` crudo (que luego se marca "sin mapear" — es la cola de trabajo, no un
 * canal más). Sólo `exact`/`in`/`prefix` en el path crítico; ver riesgos del
 * diseño sobre `regex`.
 */
export function buildChannelRuleCase(rules: ChannelRule[], exprs: RuleExprs): string {
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  const whens = sorted.map((r) => {
    const conds: string[] = [];
    if (r.source) conds.push(dimCondSql(exprs.source, r.source));
    if (r.medium) conds.push(dimCondSql(exprs.medium, r.medium));
    if (r.campaign) conds.push(dimCondSql(exprs.campaign, r.campaign));
    const cond = conds.length ? conds.join(" AND ") : "TRUE";
    return `    WHEN ${cond} THEN '${escLit(r.channel)}'`;
  });
  return `CASE\n${whens.join("\n")}\n    ELSE ${exprs.source}\n  END`;
}

// ── Reglas seed globales (organizationId = NULL) ────────────────────────────
// Codifican las 4 decisiones de Tomy. Arranque idéntico a los alias de hoy +
// pago/orgánico. Las org-específicas (TV de TeVe, etc.) viven en channel_rule.

// Meta pago = todas las variantes/placements con medium de pauta.
const META_PAID_SOURCES = [
  ...META_UTM_ALIASES, // meta_ads, fb, fb_ads, facebook_ads, …
  "facebook",
  "meta",
  "instagram",
  "an", // Audience Network
  "th", // Threads
  "meta-story",
].join("|");
const PAID_MEDIUMS =
  "paid|cpc|ppc|paid_social|social-paid|paid-social|trafico|video|paidsocial";

export const SEED_CHANNEL_RULES: ChannelRule[] = [
  // ── Decisión 1+2: Meta unificado, pago vs orgánico separados ──
  { id: "g-meta-ads", priority: 10, source: { match: "in", pattern: META_PAID_SOURCES }, medium: { match: "in", pattern: PAID_MEDIUMS }, channel: "Meta Ads" },
  { id: "g-fb-organico", priority: 20, source: { match: "in", pattern: "facebook|fb" }, medium: { match: "in", pattern: "social|organic|" }, channel: "Facebook Orgánico" },
  { id: "g-ig-organico", priority: 20, source: { match: "exact", pattern: "instagram" }, medium: { match: "in", pattern: "social|organic|organic-social|" }, channel: "Instagram Orgánico" },

  // ── Decisión 1: Google (pago vs orgánico) ──
  { id: "g-google-ads-alias", priority: 30, source: { match: "in", pattern: GOOGLE_UTM_ALIASES.join("|") }, channel: "Google Ads" },
  { id: "g-google-ads-cpc", priority: 31, source: { match: "exact", pattern: "google" }, medium: { match: "in", pattern: "cpc|ppc|paid" }, channel: "Google Ads" },
  { id: "g-google-organico", priority: 32, source: { match: "exact", pattern: "google" }, medium: { match: "in", pattern: "organic|" }, channel: "Google Orgánico" },

  // ── Decisión 3: pasarelas como canal propio (la vuelta de pago ya se excluyó en ingest) ──
  { id: "g-gocuotas", priority: 40, source: { match: "contains", pattern: "gocuotas" }, channel: "GoCuotas" },
  { id: "g-mercadopago", priority: 40, source: { match: "prefix", pattern: "mercadopago" }, channel: "Mercado Pago" },
  { id: "g-modo", priority: 40, source: { match: "exact", pattern: "modo" }, channel: "MODO" },

  // ── Básicos ──
  { id: "g-direct", priority: 90, source: { match: "exact", pattern: "direct" }, channel: "Directo" },
];
