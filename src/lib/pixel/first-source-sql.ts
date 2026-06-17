// ══════════════════════════════════════════════════════════════
// NitroPixel — First-touch source SQL (shared by rollups + funnel)
// ══════════════════════════════════════════════════════════════
// Keep in sync with src/lib/pixel/source-classification.ts (JS side).
// ══════════════════════════════════════════════════════════════

import {
  GOOGLE_UTM_ALIASES,
  INSTAGRAM_UTM_ALIASES,
  META_UTM_ALIASES,
  PAYMENT_GATEWAY_SOURCES,
} from "@/lib/pixel/source-classification";

/** Excludes synthetic webhook sessions. */
export const WEBHOOK_SESSION_FILTER = `("sessionId" IS NULL OR "sessionId" NOT LIKE 'webhook-%')`;

function sqlInList(values: readonly string[]): string {
  return values.map((v) => `'${v.replace(/'/g, "''")}'`).join(",");
}

export const META_UTM_SQL_IN = sqlInList(META_UTM_ALIASES);
export const GOOGLE_UTM_SQL_IN = sqlInList(GOOGLE_UTM_ALIASES);
export const INSTAGRAM_UTM_SQL_IN = sqlInList(INSTAGRAM_UTM_ALIASES);
export const GATEWAY_UTM_SQL_IN = sqlInList(PAYMENT_GATEWAY_SOURCES);

/** Referrer hostnames that are payment-gateway returns — not acquisition. */
export const GATEWAY_REFERRER_REGEX =
  "mercadopago\\.com|mercadolivre\\.com|payway\\.com|todopago\\.com|" +
  "decidir\\.com|sps-decidir\\.com|prismamediosdepago\\.com|naranjax\\.com|" +
  "rapipago\\.com|pagofacil\\.com|paypal\\.com|stripe\\.com|checkout\\.vtex\\.com|" +
  "vtexpayments\\.com|mobbex\\.com|getnet\\.com|payu\\.com|gocuotas\\.com";

const CHECKOUT_URL_REGEX = "/checkout/|orderPlaced|gatewayCallback";
const EMPTY_CLICKIDS = `("clickIds" IS NULL OR "clickIds"::text IN ('{}','null'))`;

/**
 * Per-event marketing source for first-touch attribution.
 * Returns NULL for non-marketing events (gateways, checkout returns) so callers
 * can pick the first non-null source per visitor.
 */
export const FIRST_SOURCE_MARKETING_CASE = `CASE
  WHEN LOWER(COALESCE("utmParams"->>'source', '')) IN (${GATEWAY_UTM_SQL_IN}) THEN NULL
  WHEN LOWER(COALESCE("utmParams"->>'source', '')) LIKE '%gocuotas%' THEN NULL
  WHEN LOWER(COALESCE("utmParams"->>'source', '')) LIKE 'mercadopago%' THEN NULL
  WHEN referrer ~* '${GATEWAY_REFERRER_REGEX}' THEN NULL
  WHEN ("clickIds"->>'fbclid') IS NOT NULL AND ("clickIds"->>'fbclid') != '' THEN 'meta'
  WHEN ("clickIds"->>'gclid') IS NOT NULL AND ("clickIds"->>'gclid') != '' THEN 'google'
  WHEN ("clickIds"->>'ttclid') IS NOT NULL AND ("clickIds"->>'ttclid') != '' THEN 'tiktok'
  WHEN ("clickIds"->>'msclkid') IS NOT NULL AND ("clickIds"->>'msclkid') != '' THEN 'microsoft'
  WHEN ("clickIds"->>'li_fat_id') IS NOT NULL AND ("clickIds"->>'li_fat_id') != '' THEN 'linkedin'
  WHEN LOWER("utmParams"->>'source') IN (${GOOGLE_UTM_SQL_IN}) THEN 'google'
  WHEN LOWER("utmParams"->>'source') IN (${META_UTM_SQL_IN}) THEN 'meta'
  WHEN LOWER("utmParams"->>'source') IN (${INSTAGRAM_UTM_SQL_IN}) THEN 'instagram'
  WHEN ("utmParams"->>'source') IS NOT NULL AND ("utmParams"->>'source') != '' THEN LOWER("utmParams"->>'source')
  WHEN referrer ~* 'l\\.instagram\\.com|instagram\\.com' THEN 'instagram'
  WHEN referrer ~* 'facebook\\.com|fb\\.com|m\\.facebook\\.com' THEN 'facebook'
  WHEN referrer ~* 'tiktok\\.com' THEN 'tiktok'
  WHEN referrer ~* 'twitter\\.com|x\\.com|t\\.co' THEN 'twitter'
  WHEN referrer ~* 'youtube\\.com|youtu\\.be' THEN 'youtube'
  WHEN referrer ~* 'linkedin\\.com|lnkd\\.in' THEN 'linkedin'
  WHEN referrer ~* 'pinterest\\.com' THEN 'pinterest'
  WHEN referrer ~* 'whatsapp\\.com|wa\\.me' THEN 'whatsapp'
  WHEN referrer ~* 't\\.me|telegram\\.org' THEN 'telegram'
  WHEN referrer ~* 'mail\\.google\\.com|gmail\\.com|outlook\\.com|yahoo\\.com/mail' THEN 'email'
  WHEN referrer ~* 'google\\.[a-z]{2,3}' THEN 'google_organic'
  WHEN referrer ~* 'bing\\.com' THEN 'bing_organic'
  WHEN referrer ~* 'yahoo\\.com' THEN 'yahoo_organic'
  WHEN referrer = '' OR referrer IS NULL THEN 'direct'
  ELSE 'referral'
END`;

/** Drop checkout-only direct hits (no click ID / UTM). */
export const FIRST_SOURCE_MARKETING_CASE_FILTERED = `CASE
  WHEN (${FIRST_SOURCE_MARKETING_CASE}) IS NULL THEN NULL
  WHEN (${FIRST_SOURCE_MARKETING_CASE}) IN (${GATEWAY_UTM_SQL_IN}) THEN NULL
  WHEN (${FIRST_SOURCE_MARKETING_CASE}) = 'direct'
    AND "pageUrl" ~* '${CHECKOUT_URL_REGEX}'
    AND ${EMPTY_CLICKIDS}
    AND (("utmParams"->>'source') IS NULL OR ("utmParams"->>'source') = '')
  THEN NULL
  ELSE (${FIRST_SOURCE_MARKETING_CASE})
END`;

/** @deprecated Use FIRST_SOURCE_MARKETING_CASE_FILTERED — kept for grep compatibility. */
export const FIRST_SOURCE_CASE = FIRST_SOURCE_MARKETING_CASE_FILTERED;
