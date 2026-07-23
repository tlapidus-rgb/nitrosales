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

/** URLs del proceso de compra (checkout + retorno de pasarela). Fuente única:
 *  la usan la clasificación de source y el conteo de visitas (rollup). */
export const CHECKOUT_URL_REGEX = "/checkout/|orderPlaced|gatewayCallback";
const EMPTY_CLICKIDS = `("clickIds" IS NULL OR "clickIds"::text IN ('{}','null'))`;

/** Un `utm_source` de pasarela, en cualquiera de sus tres formas. */
const GATEWAY_SOURCE_PREDICATE = `(
  LOWER(COALESCE("utmParams"->>'source', '')) IN (${GATEWAY_UTM_SQL_IN})
  OR LOWER(COALESCE("utmParams"->>'source', '')) LIKE '%gocuotas%'
  OR LOWER(COALESCE("utmParams"->>'source', '')) LIKE 'mercadopago%'
)`;

/**
 * Per-event marketing source for first-touch attribution.
 * Returns NULL for non-marketing events (gateways, checkout returns) so callers
 * can pick the first non-null source per visitor.
 */
export const FIRST_SOURCE_MARKETING_CASE = `CASE
  -- ══════════════════════════════════════════════════════════════════════
  -- PASARELAS: sólo se anulan cuando hay EVIDENCIA DE RETORNO del pago.
  -- ══════════════════════════════════════════════════════════════════════
  -- ⚠️ ANTES se anulaba cualquier evento cuyo utm_source fuera una pasarela,
  -- sin mirar nada más. Eso borraba un canal de adquisición REAL y era la causa
  -- principal del bucket "sin clasificar" (medido 2026-07-22: 8.751 visitantes
  -- entre las tres orgs, el 85% de los marcados sin canal).
  --
  -- Por qué: GoCuotas, MODO, Naranja, Ualá y Mercado Pago NO son sólo pasarelas
  -- — también mandan tráfico a la tienda. Un visitante real de El Mundo del
  -- Juguete (cmrqc9o2u00eh12c0dhsx7mkh, 18-jul):
  --
  --   12:24  PAGE_VIEW  /?utm_source=gocuotas        ← LLEGA desde GoCuotas
  --   12:25  PAGE_VIEW  /rodados
  --   12:26  ADD_TO_CART
  --   12:30  PURCHASE                                 ← compra
  --   12:31  PAGE_VIEW  /checkout/orderPlaced         ← ref: gocuotas.com
  --                                                     (recién ACÁ vuelve de pagar)
  --
  -- El script guarda la UTM y la repite en toda la sesión, así que los 27
  -- eventos quedaban en NULL y el visitante entero caía en "sin clasificar".
  -- Su compra tampoco se le atribuía a nadie (en EMDJ eran $174M).
  --
  -- La distinción está en los datos: LLEGAR desde la pasarela deja el UTM en una
  -- página normal; VOLVER de pagar deja el referrer de la pasarela o cae en una
  -- URL de checkout. Se anula sólo el segundo caso.
  WHEN referrer ~* '${GATEWAY_REFERRER_REGEX}' THEN NULL
  WHEN ${GATEWAY_SOURCE_PREDICATE} AND "pageUrl" ~* '${CHECKOUT_URL_REGEX}' THEN NULL
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
  -- ⚠️ ACÁ HABÍA UN SEGUNDO FILTRO DE PASARELAS, y era el que mandaba.
  --
  --   WHEN (CASE...) IN (GATEWAY_UTM_SQL_IN) THEN NULL
  --
  -- Anulaba por NOMBRE cualquier source que terminara siendo una pasarela, sin
  -- importar el contexto. Existía como red de seguridad del passthrough del CASE
  -- interno, cuando ese CASE anulaba las pasarelas siempre y esta línea sólo
  -- podía atrapar sobrantes.
  --
  -- Ahora el CASE interno distingue LLEGAR desde la pasarela de VOLVER de pagar,
  -- así que un 'gocuotas' que sale de ahí es una llegada legítima y esta línea
  -- la volvía a matar. Se saca: la discriminación ya está hecha, y hacerla dos
  -- veces con criterios distintos es exactamente cómo se pierde un canal entero.
  --
  -- Cómo se detectó (2026-07-22): se arregló el CASE interno y los tests que
  -- codificaban el comportamiento viejo SIGUIERON PASANDO. Que no se rompieran
  -- fue la señal de que el fix no llegaba a ningún lado.
  WHEN (${FIRST_SOURCE_MARKETING_CASE}) = 'direct'
    AND "pageUrl" ~* '${CHECKOUT_URL_REGEX}'
    AND ${EMPTY_CLICKIDS}
    AND (("utmParams"->>'source') IS NULL OR ("utmParams"->>'source') = '')
  THEN NULL
  ELSE (${FIRST_SOURCE_MARKETING_CASE})
END`;

/** @deprecated Use FIRST_SOURCE_MARKETING_CASE_FILTERED — kept for grep compatibility. */
export const FIRST_SOURCE_CASE = FIRST_SOURCE_MARKETING_CASE_FILTERED;
