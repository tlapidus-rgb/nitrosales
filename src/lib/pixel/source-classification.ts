// ══════════════════════════════════════════════════════════════
// NitroPixel — Marketing vs non-marketing source classification
// ══════════════════════════════════════════════════════════════
// Canonical blocklist for payment gateways and checkout-only sessions.
// See docs/nitropixel/CHANNEL_SOURCE_CLASSIFICATION.md §4–5.
// ══════════════════════════════════════════════════════════════

/** Exact `source` strings that are payment gateways — never journey touchpoints. */
export const PAYMENT_GATEWAY_SOURCES: readonly string[] = [
  "gocuotas",
  "mercadopago",
  "mercadolivre",
  "mercado_pago",
  "mercadopago_checkout",
  "payway",
  "todopago",
  "decidir",
  "sps-decidir",
  "prismamediosdepago",
  "prisma",
  "naranjax",
  "naranja",
  "rapipago",
  "pagofacil",
  "mobbex",
  "paypal",
  "stripe",
  "getnet",
  "payu",
  "vtexpayments",
  "modo",
  "uala",
];

const PAYMENT_GATEWAY_SOURCE_SET = new Set(PAYMENT_GATEWAY_SOURCES);

/** Referrer hostnames that indicate a payment-gateway return (not acquisition). */
export const PAYMENT_GATEWAY_HOSTNAME_PATTERNS: readonly RegExp[] = [
  /mercadopago\.com/,
  /mercadolivre\.com/,
  /payway\.com/,
  /todopago\.com/,
  /decidir\.com/,
  /sps-decidir\.com/,
  /prismamediosdepago\.com/,
  /naranjax\.com/,
  /rapipago\.com/,
  /pagofacil\.com/,
  /paypal\.com/,
  /stripe\.com/,
  /checkout\.vtex\.com/,
  /vtexpayments\.com/,
  /mobbex\.com/,
  /getnet\.com/,
  /payu\.com/,
  /gocuotas\.com/,
];

const CHECKOUT_INFRA_URL_PATTERN = /\/checkout\/|orderPlaced|gatewayCallback/i;

export function normalizeSourceKey(source: string | null | undefined): string {
  return (source || "").toLowerCase().trim();
}

/** True when `source` resolves to a payment gateway (UTM, touchpoint JSON, or aggregate key). */
export function isPaymentGatewaySource(source: string | null | undefined): boolean {
  const s = normalizeSourceKey(source);
  if (!s) return false;
  if (PAYMENT_GATEWAY_SOURCE_SET.has(s)) return true;
  if (s.startsWith("mercadopago")) return true;
  if (s.includes("gocuotas")) return true;
  if (/^vtex.?pay/i.test(s)) return true;
  return false;
}

export function isPaymentGatewayReferrerHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return PAYMENT_GATEWAY_HOSTNAME_PATTERNS.some((p) => p.test(h));
}

export function isCheckoutInfrastructureUrl(pageUrl: string | null | undefined): boolean {
  if (!pageUrl) return false;
  return CHECKOUT_INFRA_URL_PATTERN.test(pageUrl);
}

export interface SkipSessionParams {
  source: string;
  medium?: string | null;
  pageUrl?: string | null;
  campaign?: string | null;
  clickId?: string | null;
  /** Fresh click IDs or non-gateway UTMs in the landing URL. */
  hasFreshMarketingSignal?: boolean;
}

/**
 * True when a session must NOT become a journey touchpoint (ingest-time or display filter).
 */
export function shouldSkipSessionForJourney(params: SkipSessionParams): boolean {
  const source = normalizeSourceKey(params.source) || "direct";

  if (isPaymentGatewaySource(source)) return true;

  if (isCheckoutInfrastructureUrl(params.pageUrl)) {
    const hasMarketing =
      !!params.hasFreshMarketingSignal ||
      !!params.clickId ||
      (!!params.campaign && !isPaymentGatewaySource(source));
    if (!hasMarketing) return true;
  }

  return false;
}

export interface TouchpointLike {
  source?: string | null;
  medium?: string | null;
  page?: string | null;
  campaign?: string | null;
  clickId?: string | null;
}

/** Remove non-marketing touchpoints from stored JSON (historical safety net for journey UIs). */
export function filterMarketingTouchpoints<T extends TouchpointLike>(touchpoints: T[]): T[] {
  const filtered = touchpoints.filter(
    (tp) =>
      !shouldSkipSessionForJourney({
        source: tp.source || "direct",
        medium: tp.medium,
        pageUrl: tp.page,
        campaign: tp.campaign,
        clickId: tp.clickId,
        hasFreshMarketingSignal: false,
      })
  );

  if (filtered.length > 1) {
    const withoutCheckoutNoise = filtered.filter((tp) => {
      if (!tp.page) return true;
      const isCheckoutOnly =
        /\/checkout\//i.test(tp.page) &&
        normalizeSourceKey(tp.source) === "direct" &&
        !tp.campaign &&
        !tp.clickId;
      return !isCheckoutOnly;
    });
    if (withoutCheckoutNoise.length > 0) return withoutCheckoutNoise;
  }

  return filtered;
}

/** API aggregate filter — payment gateways are never marketing channels. */
export function isNonMarketingChannelSource(source: string | null | undefined): boolean {
  return isPaymentGatewaySource(source);
}
