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

import {
  GOOGLE_UTM_ALIASES,
  INSTAGRAM_UTM_ALIASES,
  META_UTM_ALIASES,
} from "@/lib/pixel/source-classification";

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
  /** De dónde sale el SUB-canal. 'campaign' = el nombre de campaña crudo (TV:
   *  AXN/TNT — decisión 4). NULL/undefined = sin sub-canal. */
  subFrom?: "campaign" | null;
}

/** Expresiones SQL de cada dimensión, YA normalizadas (lower+trim) por el caller. */
export interface RuleExprs {
  source: string;
  medium: string;
  campaign: string;
  /** Campaign SIN normalizar — es el VALOR del sub-canal (preserva mayúsculas:
   *  AXN/TNT). Sólo lo usa buildSubChannelCase; si falta, cae a `campaign`. */
  campaignRaw?: string;
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
/**
 * Orden de resolución (diseño §4): PRIMERO las reglas de la org (por priority),
 * DESPUÉS las globales (por priority). Una regla de la org gana sobre la global
 * aunque tenga peor priority — por eso el desempate por org va antes.
 */
function sortRules(rules: ChannelRule[]): ChannelRule[] {
  return [...rules].sort((a, b) => {
    const aOrg = a.organizationId ? 0 : 1;
    const bOrg = b.organizationId ? 0 : 1;
    if (aOrg !== bOrg) return aOrg - bOrg;
    return a.priority - b.priority;
  });
}

/** Condición SQL de una regla = AND de sus dimensiones (source/medium/campaign). */
function ruleCondSql(r: ChannelRule, exprs: RuleExprs): string {
  const conds: string[] = [];
  if (r.source) conds.push(dimCondSql(exprs.source, r.source));
  if (r.medium) conds.push(dimCondSql(exprs.medium, r.medium));
  if (r.campaign) conds.push(dimCondSql(exprs.campaign, r.campaign));
  return conds.length ? conds.join(" AND ") : "TRUE";
}

export function buildChannelRuleCase(rules: ChannelRule[], exprs: RuleExprs): string {
  const whens = sortRules(rules).map(
    (r) => `    WHEN ${ruleCondSql(r, exprs)} THEN '${escLit(r.channel)}'`
  );
  return `CASE\n${whens.join("\n")}\n    ELSE ${exprs.source}\n  END`;
}

/**
 * CASE del SUB-canal, en PARALELO al del canal (mismas condiciones y mismo orden,
 * así la regla que gana el canal es la que gana el sub-canal). Para esa regla: si
 * tiene `subFrom='campaign'` → el sub-canal es el `campaign` crudo (TV: AXN/TNT,
 * decisión 4); si no → NULL. Un `campaign` vacío → NULL (no un sub-canal ''). El
 * passthrough (ELSE) no tiene sub-canal.
 */
export function buildSubChannelCase(rules: ChannelRule[], exprs: RuleExprs): string {
  const whens = sortRules(rules).map((r) => {
    const then =
      r.subFrom === "campaign"
        ? `NULLIF(${exprs.campaignRaw ?? exprs.campaign}, '')`
        : "NULL";
    return `    WHEN ${ruleCondSql(r, exprs)} THEN ${then}`;
  });
  return `CASE\n${whens.join("\n")}\n    ELSE NULL\n  END`;
}

/**
 * Expresión booleana: TRUE si ALGUNA regla matchea (canal resuelto), FALSE si cae
 * al passthrough (source desconocido = "sin mapear"). La UI de `/control` la usa
 * para separar la bandeja de "sin mapear" (cola de trabajo) de los canales reales
 * — un source en passthrough NO es un canal más, es trabajo pendiente (diseño §4).
 */
export function buildIsMappedCase(rules: ChannelRule[], exprs: RuleExprs): string {
  const conds = sortRules(rules).map((r) => `(${ruleCondSql(r, exprs)})`);
  return conds.length ? `(${conds.join(" OR ")})` : "FALSE";
}

// ── Reglas seed globales (organizationId = NULL) ────────────────────────────
// Codifican las 4 decisiones de Tomy. Arranque idéntico a los alias de hoy +
// pago/orgánico. Las org-específicas (TV de TeVe, etc.) viven en channel_rule.

// Meta pago = todas las variantes/placements con medium de pauta.
const META_PAID_SOURCES = [
  ...META_UTM_ALIASES, // meta_ads, fb, fb_ads, facebook_ads, …
  ...INSTAGRAM_UTM_ALIASES, // ig, instagram_ads, instagram-ads (placement Meta pago)
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

  // ── Búsqueda orgánica: el first-source deriva estos del referrer (google.com →
  //    'google_organic', etc.). Sin regla quedaban SEPARADOS del "Google Orgánico"
  //    por-utm — medido en TeVe: google_organic 69.917 vs Google Orgánico 515. Es
  //    el mismo bug de adwords, del lado orgánico. Los juntamos. ──
  { id: "g-google-organic-ref", priority: 33, source: { match: "exact", pattern: "google_organic" }, channel: "Google Orgánico" },
  { id: "g-bing-organic", priority: 33, source: { match: "exact", pattern: "bing_organic" }, channel: "Bing Orgánico" },
  { id: "g-yahoo-organic", priority: 33, source: { match: "exact", pattern: "yahoo_organic" }, channel: "Yahoo Orgánico" },

  // ── TikTok (pago vs orgánico) ──
  { id: "g-tiktok-ads", priority: 34, source: { match: "exact", pattern: "tiktok" }, medium: { match: "in", pattern: PAID_MEDIUMS }, channel: "TikTok Ads" },
  { id: "g-tiktok-organico", priority: 35, source: { match: "exact", pattern: "tiktok" }, channel: "TikTok Orgánico" },

  // ── Referrers sociales/orgánicos (los deriva el first-source del referrer) ──
  { id: "g-youtube", priority: 36, source: { match: "exact", pattern: "youtube" }, channel: "YouTube" },
  { id: "g-whatsapp", priority: 36, source: { match: "exact", pattern: "whatsapp" }, channel: "WhatsApp" },
  { id: "g-twitter", priority: 36, source: { match: "exact", pattern: "twitter" }, channel: "Twitter/X" },
  { id: "g-linkedin", priority: 36, source: { match: "exact", pattern: "linkedin" }, channel: "LinkedIn" },

  // ── Decisión 3: pasarelas como canal propio (la vuelta de pago ya se excluyó en ingest) ──
  { id: "g-gocuotas", priority: 40, source: { match: "contains", pattern: "gocuotas" }, channel: "GoCuotas" },
  { id: "g-mercadopago", priority: 40, source: { match: "prefix", pattern: "mercadopago" }, channel: "Mercado Pago" },
  { id: "g-modo", priority: 40, source: { match: "exact", pattern: "modo" }, channel: "MODO" },

  // ── Básicos ──
  { id: "g-direct", priority: 90, source: { match: "exact", pattern: "direct" }, channel: "Directo" },
];
