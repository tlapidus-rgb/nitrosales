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
    default:
      // match desconocido (fila corrupta que se saltó dimFrom) → condición que NO
      // dispara, nunca `undefined` (que rompería el SQL del CASE).
      return "FALSE";
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
/** Cuántas dimensiones restringe la regla (más = más específica). */
function ruleSpecificity(r: ChannelRule): number {
  return (r.source ? 1 : 0) + (r.medium ? 1 : 0) + (r.campaign ? 1 : 0);
}

function sortRules(rules: ChannelRule[]): ChannelRule[] {
  return [...rules].sort((a, b) => {
    const aOrg = a.organizationId ? 0 : 1;
    const bOrg = b.organizationId ? 0 : 1;
    if (aOrg !== bOrg) return aOrg - bOrg;
    if (a.priority !== b.priority) return a.priority - b.priority;
    // Desempate (fix 2026-08-19): la MÁS específica primero. Las reglas del usuario
    // son TODAS priority 5 → sin esto el orden entre una source-only y una
    // source+medium del mismo origen era indefinido, y la source-only podía tapar
    // a la source+medium (esta última NUNCA disparaba). Con el desempate, una regla
    // `google+cpc` gana sobre `google` a secas para las filas cpc, y `google` a
    // secas agarra el resto. En las globales de igual prioridad casi no aplica; el
    // único solapamiento (g-microsoft-ads source-only vs g-bing-ads-cpc en
    // source=microsoft/msn, ambos priority 34) resuelve al MISMO canal
    // ("Microsoft Ads"), así que reordenarlas no cambia el resultado.
    return ruleSpecificity(b) - ruleSpecificity(a);
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
  // Sin reglas → passthrough PURO. Un `CASE ELSE x END` sin WHEN es error de
  // sintaxis en Postgres, así que devolvemos la expresión sola. Esto es lo que
  // hace válida la resiliencia de loadOrgChannelCases (channel_rule ausente/vacía
  // → rows=[] → este passthrough, no un CASE roto).
  if (whens.length === 0) return `(${exprs.source})`;
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
// (Los alias compartidos META_UTM_ALIASES/INSTAGRAM_UTM_ALIASES viven en
// source-classification.ts y ALIMENTAN atribution.ts (CORE) → NO se tocan; las
// variantes extra se agregan SOLO acá, en la capa de canales.)
const META_PAID_SOURCES = [
  ...META_UTM_ALIASES, // meta_ads, fb, fb_ads, facebook_ads, …
  ...INSTAGRAM_UTM_ALIASES, // ig, instagram_ads, instagram-ads (placement Meta pago)
  "facebook",
  "meta",
  "instagram",
  "an", // Audience Network
  "th", // Threads
  "meta-story",
  // Variantes estándar adicionales de placements/redacciones de Meta pago.
  "messenger", "msg", "ig_ads", "ig-ads", "igads", "fbig",
  "audiencenetwork", "audience_network", "meta_business", "metabusiness",
  "fb_reels", "ig_reels", "facebook_reels", "instagram_reels", "reels",
].join("|");
// Mediums que señalan PAUTA. OJO (fix 2026-08-19, BP-CANALES-VIDEO): `video` y
// `trafico` NO son señales de pago — son tipo-de-contenido/genéricos que el
// marketing ORGÁNICO de redes usa todo el tiempo (TikTok/Meta/YouTube orgánico
// taggea utm_medium=video). Estaban acá y clasificaban tráfico orgánico como
// "…Ads" (caso EMDJ: `tiktok·video` → "TikTok Ads" sin tener pauta). Triple Whale
// separa pago/orgánico por SEÑAL (UTM/ad-id reconocido), no por un medium de
// contenido. Se quitaron `video` y `trafico`. `display` sí es pauta (display ads).
const PAID_MEDIUMS =
  "paid|cpc|ppc|paid_social|social-paid|paid-social|paidsocial|paidsearch|display";

// Variantes estándar de Google Ads (además de GOOGLE_UTM_ALIASES, que va a CORE).
const GOOGLE_ADS_SOURCES =
  "gads|google-adwords|googleadwords|google_cpc|google_ads_cpc|pmax|performance_max|performancemax|gdn|google_display|googledisplay|google_search|googlesearch";
// Variantes estándar de TikTok. OJO (fix 2026-08-19): se quitó el token suelto
// `tt` — es una abreviatura ambigua de 2 letras que colisiona con códigos propios
// de clientes. Triple Whale tampoco lo acepta (su allowlist solo toma `tiktok`).
// TikTok pago real llega como `tiktok`/`tiktok_ads`, no como `tt` pelado. Si un
// cliente usa `tt` para TikTok, lo mapea desde el panel (regla por-org).
const TIKTOK_SOURCES = "tiktok|tiktok_ads|tiktok-ads|tiktokads|tt_ads|tik_tok|tik-tok";

export const SEED_CHANNEL_RULES: ChannelRule[] = [
  // ── Decisión 1+2: Meta unificado, pago vs orgánico separados ──
  { id: "g-meta-ads", priority: 10, source: { match: "in", pattern: META_PAID_SOURCES }, medium: { match: "in", pattern: PAID_MEDIUMS }, channel: "Meta Ads" },
  // `video|trafico` en el medium (fix 2026-08-19): tras sacarlos de PAID_MEDIUMS, un
  // `facebook·video` orgánico caía en passthrough (Meta no tiene fallback source-only
  // como TikTok). Se suman acá para que caiga en su Orgánico, consistente con TikTok.
  { id: "g-fb-organico", priority: 20, source: { match: "in", pattern: "facebook|fb" }, medium: { match: "in", pattern: "social|organic|video|trafico|" }, channel: "Facebook Orgánico" },
  // 'ig' es el alias estándar de Instagram (Arredo: 89.341 visitantes caían en
  // passthrough porque la regla sólo miraba 'instagram' exacto). El 'ig' pago ya
  // lo agarra g-meta-ads (está en META_PAID_SOURCES); el resto es orgánico.
  { id: "g-ig-organico", priority: 20, source: { match: "in", pattern: "instagram|ig" }, medium: { match: "in", pattern: "social|organic|organic-social|video|trafico|" }, channel: "Instagram Orgánico" },

  // Meta "pelado" (utm_source=meta, sin medium de pago): una source taggeada
  // 'meta' es una campaña = pago. Consistente con "Meta unificado" (decisión 1).
  { id: "g-meta-bare", priority: 15, source: { match: "in", pattern: "meta|meta-story" }, channel: "Meta Ads" },

  // ── Decisión 1: Google (pago vs orgánico) ──
  { id: "g-google-ads-alias", priority: 30, source: { match: "in", pattern: GOOGLE_UTM_ALIASES.join("|") }, channel: "Google Ads" },
  { id: "g-google-ads-extra", priority: 30, source: { match: "in", pattern: GOOGLE_ADS_SOURCES }, channel: "Google Ads" },
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
  { id: "g-tiktok-ads", priority: 34, source: { match: "in", pattern: TIKTOK_SOURCES }, medium: { match: "in", pattern: PAID_MEDIUMS }, channel: "TikTok Ads" },
  { id: "g-tiktok-organico", priority: 35, source: { match: "in", pattern: TIKTOK_SOURCES }, channel: "TikTok Orgánico" },

  // ── Microsoft/Bing Ads (pago) — distinto de bing_organico (búsqueda orgánica) ──
  { id: "g-microsoft-ads", priority: 34, source: { match: "in", pattern: "bing_ads|bingads|bing-ads|microsoft|microsoft_ads|microsoftads|msn_ads|msads" }, channel: "Microsoft Ads" },
  { id: "g-bing-ads-cpc", priority: 34, source: { match: "in", pattern: "bing|msn|microsoft" }, medium: { match: "in", pattern: PAID_MEDIUMS }, channel: "Microsoft Ads" },

  // ── Referrers sociales/orgánicos (los deriva el first-source del referrer) ──
  // OJO (fix 2026-08-19): se quitaron los tokens sueltos de 2 letras `yt`/`wa`/`pin`
  // de estas reglas source-only (sin guarda de medium disparan sobre cualquier fila
  // con ese source exacto → colisionan con códigos propios de clientes). Se dejan
  // los nombres completos. Alineado con Triple Whale (allowlist sin tokens ambiguos).
  { id: "g-youtube", priority: 36, source: { match: "in", pattern: "youtube|youtube_ads|youtube-ads" }, channel: "YouTube" },
  { id: "g-whatsapp", priority: 36, source: { match: "in", pattern: "whatsapp|whatsapp_business" }, channel: "WhatsApp" },
  { id: "g-twitter", priority: 36, source: { match: "in", pattern: "twitter|twitter_ads|twitter-ads|x_ads" }, channel: "Twitter/X" },
  { id: "g-linkedin", priority: 36, source: { match: "in", pattern: "linkedin|linkedin_ads|linkedin-ads" }, channel: "LinkedIn" },
  { id: "g-pinterest", priority: 36, source: { match: "in", pattern: "pinterest|pinterest_ads|pinterest-ads|pin_ads" }, channel: "Pinterest" },
  { id: "g-snapchat", priority: 36, source: { match: "in", pattern: "snapchat|snap|snapchat_ads|snap_ads|snapchatads" }, channel: "Snapchat" },
  { id: "g-reddit", priority: 36, source: { match: "in", pattern: "reddit|reddit_ads|reddit-ads" }, channel: "Reddit" },

  // ── Otros universales que la data de las 3 orgs destapó (nombre inequívoco) ──
  { id: "g-email", priority: 37, source: { match: "exact", pattern: "email" }, channel: "Email" },
  { id: "g-taboola", priority: 37, source: { match: "contains", pattern: "taboola" }, channel: "Taboola" },
  { id: "g-webpush", priority: 37, source: { match: "in", pattern: "webpush|web-push|push" }, channel: "Notificaciones Push" },

  // ── Más plataformas de PAUTA (allowlist estándar tipo Triple Whale; cada
  //    plataforma = su propio canal, no un bucket genérico). Variantes UTM
  //    públicas, no la lista propietaria de TW. ──
  { id: "g-amazon-ads", priority: 37, source: { match: "in", pattern: "amazon_ads|amazonads|amazon-ads|amazon_dsp|amazondsp" }, channel: "Amazon Ads" },
  { id: "g-criteo", priority: 37, source: { match: "contains", pattern: "criteo" }, channel: "Criteo" },
  { id: "g-outbrain", priority: 37, source: { match: "contains", pattern: "outbrain" }, channel: "Outbrain" },
  { id: "g-applovin", priority: 37, source: { match: "contains", pattern: "applovin" }, channel: "AppLovin" },
  { id: "g-google-shopping", priority: 29, source: { match: "in", pattern: "google_shopping|googleshopping|google-shopping" }, channel: "Google Shopping" },

  // ── Email / SMS por plataforma (nombre = canal; NO se bucketea en "Email"). ──
  { id: "g-klaviyo", priority: 38, source: { match: "contains", pattern: "klaviyo" }, channel: "Klaviyo" },
  { id: "g-mailchimp", priority: 38, source: { match: "contains", pattern: "mailchimp" }, channel: "Mailchimp" },
  { id: "g-attentive", priority: 38, source: { match: "contains", pattern: "attentive" }, channel: "Attentive" },
  { id: "g-postscript", priority: 38, source: { match: "contains", pattern: "postscript" }, channel: "Postscript" },
  { id: "g-omnisend", priority: 38, source: { match: "contains", pattern: "omnisend" }, channel: "Omnisend" },
  { id: "g-sms", priority: 39, source: { match: "in", pattern: "sms|sms_marketing|textmarketing" }, channel: "SMS" },

  // ── Decisión 3: pasarelas como canal propio (la vuelta de pago ya se excluyó en ingest) ──
  { id: "g-gocuotas", priority: 40, source: { match: "contains", pattern: "gocuotas" }, channel: "GoCuotas" },
  { id: "g-mercadopago", priority: 40, source: { match: "prefix", pattern: "mercadopago" }, channel: "Mercado Pago" },
  { id: "g-modo", priority: 40, source: { match: "exact", pattern: "modo" }, channel: "MODO" },

  // ── Consolidación de variantes de códigos PROPIOS del cliente ──
  // Tomy (2026-07-27): "el canal no tiene que definir qué es cada cosa; si es
  // Icomm, que diga Icomm". O sea: NO bucketear en categorías genéricas (Email,
  // etc.) — el nombre del origen ES el canal. Lo único que consolidamos es la
  // MISMA cosa escrita distinto (su versión del problema adwords/google). El
  // resto se muestra tal cual (passthrough). El operador arma más de estas
  // desde el panel.
  { id: "g-icomm", priority: 50, source: { match: "contains", pattern: "icomm" }, channel: "Icomm" },
  { id: "g-influencers", priority: 50, source: { match: "contains", pattern: "influencer" }, channel: "Influencers" },

  // ── Básicos ──
  { id: "g-direct", priority: 90, source: { match: "exact", pattern: "direct" }, channel: "Directo" },
];
