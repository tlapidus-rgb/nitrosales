// ══════════════════════════════════════════════════════════════
// Search-First Price Matcher — "Buscar nuestro producto en el competidor"
// ══════════════════════════════════════════════════════════════
//
// ARCHITECTURE DIFFERENCE vs. old system:
//   OLD: Scrape entire competitor catalog → fuzzy match against ours
//   NEW: For EACH of our products → search on competitor → verify match
//
// This is how Prisync, Price2Spy, Turbodato, and Minderest work.
// It's fundamentally more accurate because:
//   1. We search by EAN (barcode) — guaranteed exact product
//   2. We search by "brand + product name" — targeted query
//   3. We verify each match with a strict cascade before accepting
//
// Supported platforms:
//   - VTEX: /api/catalog_system/pub/products/search/{query}
//           /api/catalog_system/pub/products/search/?fq=alternateIds_Ean:{ean}
//   - MercadoLibre: /sites/MLA/search?q={ean_or_name}
//   - Shopify: /search/suggest.json?q={query}&resources[type]=product
//   - Generic: Google Shopping or sitemap fallback
// ══════════════════════════════════════════════════════════════

import { OwnProduct } from "./competitor-discovery";

// ── Types ──────────────────────────────────────────────────────

export interface SearchMatch {
  ownProduct: OwnProduct;
  competitorName: string;
  competitorPrice: number;
  competitorUrl: string;
  competitorEan?: string;
  competitorBrand?: string;
  competitorImageUrl?: string;
  currency: string;
  matchMethod: "EAN_EXACT" | "EAN_SEARCH" | "NAME_VERIFIED" | "CATALOG_MATCH";
  matchConfidence: number;  // 0-100
  matchReason: string;
  searchQuery: string;      // What we searched for
  platform: string;         // vtex, mercadolibre, shopify
}

export interface SearchFirstResult {
  matches: SearchMatch[];
  searched: number;
  matched: number;
  skipped: number;
  errors: number;
  elapsedMs: number;
}

// ── Text utilities ─────────────────────────────────────────────

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  const stopWords = new Set([
    "de", "la", "el", "los", "las", "un", "una", "con", "por", "para",
    "en", "del", "al", "y", "o", "a", "e", "the", "and", "or", "for",
    "with", "x", "cm", "mm", "ml", "gr", "kg", "lt",
  ]);
  return normalize(text).split(" ").filter((w) => w.length > 1 && !stopWords.has(w));
}

/** Build search query from product name + brand (for ML/Shopify) */
function buildSearchQuery(product: OwnProduct): string {
  const parts: string[] = [];

  // Add brand if available (crucial for disambiguation on ML)
  if (product.brand && product.brand.length >= 2) {
    parts.push(product.brand);
  }

  // Take meaningful words from product name (skip brand if already included)
  const brandNorm = product.brand ? normalize(product.brand) : "";
  const nameTokens = tokenize(product.name)
    .filter((t) => t !== brandNorm && t.length > 2)
    .slice(0, 6); // Max 6 tokens to keep search focused

  parts.push(...nameTokens);

  return parts.join(" ").trim();
}

/**
 * Build search query optimized for VTEX full-text search.
 * VTEX full-text (ft=) works best WITHOUT brand prefix.
 * Uses raw product name words (preserving original casing/accents for better hits).
 */
function buildVtexSearchQuery(product: OwnProduct): string[] {
  // Strategy: return multiple queries from broad to narrow
  const words = product.name
    .replace(/[^a-záéíóúñüA-ZÁÉÍÓÚÑÜ0-9\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const queries: string[] = [];

  // Query 1: First 3-4 meaningful words (broad)
  if (words.length >= 2) {
    queries.push(words.slice(0, Math.min(4, words.length)).join(" "));
  }

  // Query 2: Full name (narrower, but some VTEX stores need it)
  if (words.length > 4) {
    queries.push(words.slice(0, 6).join(" "));
  }

  return queries;
}

// ── Verification Cascade ───────────────────────────────────────
// This is CAMBIO 3: strict verification before accepting any match

const GENERIC_WORDS = new Set([
  "juego", "mesa", "cartas", "juguete", "muneco", "muneca", "peluche",
  "auto", "pista", "disfraz", "infantil", "nena", "nene", "bebe",
  "set", "kit", "mini", "grande", "pequeno", "nuevo", "original",
  "luz", "sonido", "musical", "interactivo", "radio", "control",
  "figura", "accion", "super", "mega", "clasico", "premium",
  "cartuchera", "mochila", "doble", "cierre", "juegos", "juguetes",
  "ninas", "ninos", "anos", "pilas",
]);

interface VerificationResult {
  verified: boolean;
  confidence: number;
  method: "EAN_EXACT" | "EAN_SEARCH" | "NAME_VERIFIED" | "CATALOG_MATCH";
  reason: string;
}

/**
 * Strict verification cascade:
 * Level 1: EAN exact match → 100% confidence
 * Level 2: Brand matches + 2+ specific tokens → 90% confidence
 * Level 3: 3+ specific consecutive tokens match → 80% confidence
 * Level 4: Reject everything else
 */
function verifyMatch(
  ownProduct: OwnProduct,
  competitorName: string,
  competitorEan?: string,
  competitorBrand?: string
): VerificationResult {
  // Level 1: EAN exact match — gold standard
  if (competitorEan && ownProduct.ean && competitorEan === ownProduct.ean) {
    return {
      verified: true,
      confidence: 100,
      method: "EAN_EXACT",
      reason: `EAN exacto: ${competitorEan}`,
    };
  }

  const ownTokens = tokenize(ownProduct.name);
  const compTokens = tokenize(competitorName);

  // Find specific (non-generic) common tokens
  const commonTokens = ownTokens.filter((t) => compTokens.includes(t));
  const specificCommon = commonTokens.filter((t) => !GENERIC_WORDS.has(t));

  // Level 2: Brand matches + at least 2 specific tokens
  if (ownProduct.brand && competitorBrand) {
    const ownBrand = normalize(ownProduct.brand);
    const compBrand = normalize(competitorBrand);
    const brandMatch = ownBrand.length >= 2 && (
      compBrand.includes(ownBrand) || ownBrand.includes(compBrand)
    );

    if (brandMatch && specificCommon.length >= 2) {
      return {
        verified: true,
        confidence: 90,
        method: "NAME_VERIFIED",
        reason: `Marca ${ownProduct.brand} + ${specificCommon.length} tokens: ${specificCommon.join(", ")}`,
      };
    }
  }

  // Also check brand in the competitor name text (not just attribute)
  if (ownProduct.brand) {
    const ownBrand = normalize(ownProduct.brand);
    const compNorm = normalize(competitorName);
    if (ownBrand.length >= 2 && compNorm.includes(ownBrand) && specificCommon.length >= 2) {
      return {
        verified: true,
        confidence: 85,
        method: "NAME_VERIFIED",
        reason: `Marca en nombre + ${specificCommon.length} tokens: ${specificCommon.join(", ")}`,
      };
    }
  }

  // Level 3: 3+ specific consecutive tokens match in both directions
  if (specificCommon.length >= 3) {
    // Check consecutive: are there 3+ specific tokens in a row?
    const compStr = compTokens.join(" ");
    const ownStr = ownTokens.join(" ");
    const specificOnlyOwn = ownTokens.filter((t) => !GENERIC_WORDS.has(t));

    for (let len = Math.min(4, specificOnlyOwn.length); len >= 3; len--) {
      for (let i = 0; i <= specificOnlyOwn.length - len; i++) {
        const phrase = specificOnlyOwn.slice(i, i + len).join(" ");
        if (compStr.includes(phrase)) {
          // Also verify bidirectional — competitor shouldn't have too many EXTRA specific tokens
          const compSpecific = compTokens.filter((t) => !GENERIC_WORDS.has(t));
          const extraTokens = compSpecific.filter((t) => !ownTokens.includes(t));

          // Allow max 2 extra specific tokens (variant info like size, color)
          if (extraTokens.length <= 2) {
            return {
              verified: true,
              confidence: 80,
              method: "NAME_VERIFIED",
              reason: `${len} tokens consecutivos: "${phrase}" (extras: ${extraTokens.length})`,
            };
          }
        }
      }
    }
  }

  // Level 4: Bidirectional high overlap with specifics (strict)
  if (specificCommon.length >= 2) {
    const ownSpecific = ownTokens.filter((t) => !GENERIC_WORDS.has(t));
    const compSpecific = compTokens.filter((t) => !GENERIC_WORDS.has(t));

    if (ownSpecific.length > 0 && compSpecific.length > 0) {
      const overlapOwn = specificCommon.length / ownSpecific.length;
      const overlapComp = specificCommon.length / compSpecific.length;
      const minOverlap = Math.min(overlapOwn, overlapComp);

      // Both directions must be >= 70% overlap on specific tokens
      if (minOverlap >= 0.7) {
        return {
          verified: true,
          confidence: 75,
          method: "NAME_VERIFIED",
          reason: `Overlap específico ${Math.round(minOverlap * 100)}%: ${specificCommon.join(", ")}`,
        };
      }
    }
  }

  // Not verified — reject
  return {
    verified: false,
    confidence: 0,
    method: "NAME_VERIFIED",
    reason: `Rechazado: solo ${specificCommon.length} tokens específicos (${specificCommon.join(", ") || "ninguno"})`,
  };
}

// ── VTEX Search-First ──────────────────────────────────────────

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json,text/html,application/xhtml+xml,*/*;q=0.8",
  "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
};

/** Search VTEX by EAN using the facet API */
async function searchVtexByEan(base: string, ean: string): Promise<any[]> {
  // Method 1: fq=alternateIds_Ean (most reliable for EAN search)
  try {
    const url = `${base}/api/catalog_system/pub/products/search/?fq=alternateIds_Ean:${ean}`;
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    if (res.status >= 200 && res.status < 300) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch { /* try next */ }

  // Method 2: fq=alternateIds_RefId
  try {
    const url = `${base}/api/catalog_system/pub/products/search/?fq=alternateIds_RefId:${ean}`;
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    if (res.status >= 200 && res.status < 300) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch { /* try next */ }

  return [];
}

/** Search VTEX by product name/brand text query */
async function searchVtexByName(base: string, query: string): Promise<any[]> {
  try {
    // VTEX full-text search endpoint
    const encoded = encodeURIComponent(query);
    const url = `${base}/api/catalog_system/pub/products/search/?ft=${encoded}&_from=0&_to=9`;
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    if (res.status >= 200 && res.status < 300) {
      const data = await res.json();
      if (Array.isArray(data)) return data;
    }
  } catch { /* ignore */ }

  return [];
}

/** Extract structured data from a VTEX product API item */
function parseVtexSearchResult(item: any, base: string): {
  name: string;
  price: number;
  url: string;
  ean?: string;
  brand?: string;
  imageUrl?: string;
} | null {
  const name = item.productName || item.productTitle || "";
  const link = item.link || (item.linkText ? `${base}/${item.linkText}/p` : "");
  const brand = item.brand || "";

  const items = item.items || [];
  if (items.length === 0) return null;

  let price = 0;
  const sellers = items[0].sellers || [];
  if (sellers.length > 0) {
    const offer = sellers[0].commertialOffer || {};
    price = offer.Price || offer.ListPrice || 0;
  }

  if (!name || price <= 0) return null;

  // Extract EAN from the proper field: items[].ean
  const itemEan = items[0]?.ean || "";
  const ref = item.productReference || "";
  const refIdVal = items[0]?.referenceId?.[0]?.Value || "";
  const ean =
    (itemEan.length >= 8 && /^\d+$/.test(itemEan)) ? itemEan
    : (refIdVal.length >= 12 && /^\d+$/.test(refIdVal)) ? refIdVal
    : (ref.length >= 12 && /^\d+$/.test(ref)) ? ref
    : undefined;

  const imageUrl = items[0]?.images?.[0]?.imageUrl || undefined;

  return { name, price, url: link, ean, brand, imageUrl };
}

/** Search for one of our products on a VTEX competitor site */
async function searchProductOnVtex(
  base: string,
  product: OwnProduct
): Promise<SearchMatch | null> {
  // Strategy 1: Search by EAN (highest confidence)
  if (product.ean) {
    const eanResults = await searchVtexByEan(base, product.ean);
    for (const item of eanResults) {
      const parsed = parseVtexSearchResult(item, base);
      if (!parsed) continue;

      const verification = verifyMatch(product, parsed.name, parsed.ean, parsed.brand);
      if (verification.verified || (parsed.ean && product.ean && parsed.ean === product.ean)) {
        return {
          ownProduct: product,
          competitorName: parsed.name,
          competitorPrice: parsed.price,
          competitorUrl: parsed.url,
          competitorEan: parsed.ean,
          competitorBrand: parsed.brand,
          competitorImageUrl: parsed.imageUrl,
          currency: "ARS",
          matchMethod: parsed.ean === product.ean ? "EAN_EXACT" : "EAN_SEARCH",
          matchConfidence: parsed.ean === product.ean ? 100 : verification.confidence,
          matchReason: verification.reason,
          searchQuery: product.ean,
          platform: "vtex",
        };
      }
    }
  }

  // Strategy 2: Search by name (VTEX-optimized queries without brand prefix)
  const vtexQueries = buildVtexSearchQuery(product);
  let nameResults: any[] = [];
  let nameQuery = vtexQueries[0] || "";

  for (const q of vtexQueries) {
    if (!q || q.length < 4) continue;
    nameResults = await searchVtexByName(base, q);
    if (nameResults.length > 0) {
      nameQuery = q;
      break; // Use first query that returns results
    }
  }

  // Check each result with strict verification
  for (const item of nameResults.slice(0, 5)) { // Only check top 5
    const parsed = parseVtexSearchResult(item, base);
    if (!parsed) continue;

    // First check if EANs happen to match (competitor had EAN even though we searched by name)
    if (parsed.ean && product.ean && parsed.ean === product.ean) {
      return {
        ownProduct: product,
        competitorName: parsed.name,
        competitorPrice: parsed.price,
        competitorUrl: parsed.url,
        competitorEan: parsed.ean,
        competitorBrand: parsed.brand,
        competitorImageUrl: parsed.imageUrl,
        currency: "ARS",
        matchMethod: "EAN_EXACT",
        matchConfidence: 100,
        matchReason: `EAN exacto encontrado por búsqueda de nombre: ${parsed.ean}`,
        searchQuery: nameQuery,
        platform: "vtex",
      };
    }

    // Strict name verification
    const verification = verifyMatch(product, parsed.name, parsed.ean, parsed.brand);
    if (verification.verified) {
      return {
        ownProduct: product,
        competitorName: parsed.name,
        competitorPrice: parsed.price,
        competitorUrl: parsed.url,
        competitorEan: parsed.ean,
        competitorBrand: parsed.brand,
        competitorImageUrl: parsed.imageUrl,
        currency: "ARS",
        matchMethod: "NAME_VERIFIED",
        matchConfidence: verification.confidence,
        matchReason: verification.reason,
        searchQuery: nameQuery,
        platform: "vtex",
      };
    }
  }

  return null;
}

// ── MercadoLibre Search-First ──────────────────────────────────

const ML_API_BASE = "https://api.mercadolibre.com";

/** Search for one of our products on MercadoLibre */
async function searchProductOnML(
  product: OwnProduct,
  accessToken?: string
): Promise<SearchMatch[]> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  const matches: SearchMatch[] = [];
  const seenIds = new Set<string>();

  // Strategy 1: Search by EAN
  if (product.ean) {
    try {
      const url = `${ML_API_BASE}/sites/MLA/search?q=${product.ean}&limit=10&condition=new`;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const data = await res.json();
        for (const result of (data.results || []).slice(0, 5)) {
          if (seenIds.has(result.id)) continue;
          seenIds.add(result.id);

          const compEan = extractMLEan(result.attributes || []);
          const compBrand = extractMLBrand(result.attributes || []);

          const verification = verifyMatch(product, result.title, compEan, compBrand);

          // For EAN search: accept if EAN matches OR if name verification passes
          if ((compEan && product.ean && compEan === product.ean) || verification.verified) {
            matches.push({
              ownProduct: product,
              competitorName: result.title,
              competitorPrice: result.price,
              competitorUrl: result.permalink,
              competitorEan: compEan,
              competitorBrand: compBrand,
              competitorImageUrl: result.thumbnail,
              currency: result.currency_id || "ARS",
              matchMethod: (compEan && compEan === product.ean) ? "EAN_EXACT" : "NAME_VERIFIED",
              matchConfidence: (compEan && compEan === product.ean) ? 100 : verification.confidence,
              matchReason: verification.reason,
              searchQuery: product.ean,
              platform: "mercadolibre",
            });
          }
        }
      }
    } catch { /* continue */ }
  }

  // Strategy 2: Search by brand + name
  const nameQuery = buildSearchQuery(product);
  if (nameQuery && nameQuery.length >= 4) {
    try {
      const encoded = encodeURIComponent(nameQuery);
      const url = `${ML_API_BASE}/sites/MLA/search?q=${encoded}&limit=10&condition=new`;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const data = await res.json();
        for (const result of (data.results || []).slice(0, 5)) {
          if (seenIds.has(result.id)) continue;
          seenIds.add(result.id);

          const compEan = extractMLEan(result.attributes || []);
          const compBrand = extractMLBrand(result.attributes || []);

          // First: check if EANs match (bonus find)
          if (compEan && product.ean && compEan === product.ean) {
            matches.push({
              ownProduct: product,
              competitorName: result.title,
              competitorPrice: result.price,
              competitorUrl: result.permalink,
              competitorEan: compEan,
              competitorBrand: compBrand,
              competitorImageUrl: result.thumbnail,
              currency: result.currency_id || "ARS",
              matchMethod: "EAN_EXACT",
              matchConfidence: 100,
              matchReason: `EAN exacto encontrado por búsqueda de nombre: ${compEan}`,
              searchQuery: nameQuery,
              platform: "mercadolibre",
            });
            continue;
          }

          // Strict verification
          const verification = verifyMatch(product, result.title, compEan, compBrand);
          if (verification.verified) {
            matches.push({
              ownProduct: product,
              competitorName: result.title,
              competitorPrice: result.price,
              competitorUrl: result.permalink,
              competitorEan: compEan,
              competitorBrand: compBrand,
              competitorImageUrl: result.thumbnail,
              currency: result.currency_id || "ARS",
              matchMethod: "NAME_VERIFIED",
              matchConfidence: verification.confidence,
              matchReason: verification.reason,
              searchQuery: nameQuery,
              platform: "mercadolibre",
            });
          }
        }
      }
    } catch { /* continue */ }
  }

  return matches;
}

function extractMLEan(attributes: Array<{ id: string; value_name: string | null }>): string | undefined {
  const eanAttrs = ["GTIN", "EAN", "UPC"];
  for (const attr of attributes) {
    if (eanAttrs.includes(attr.id) && attr.value_name) {
      const val = attr.value_name.trim();
      if (/^\d{8,14}$/.test(val)) return val;
    }
  }
  return undefined;
}

function extractMLBrand(attributes: Array<{ id: string; value_name: string | null }>): string | undefined {
  for (const attr of attributes) {
    if (attr.id === "BRAND" && attr.value_name) return attr.value_name;
  }
  return undefined;
}

// ── Shopify Search-First ───────────────────────────────────────

/** Search for one of our products on a Shopify competitor site */
async function searchProductOnShopify(
  base: string,
  product: OwnProduct
): Promise<SearchMatch | null> {
  const query = product.ean || buildSearchQuery(product);
  if (!query || query.length < 3) return null;

  try {
    const encoded = encodeURIComponent(query);
    // Shopify predictive search API
    const url = `${base}/search/suggest.json?q=${encoded}&resources[type]=product&resources[limit]=5`;
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const products = data.resources?.results?.products || [];

    for (const item of products) {
      const name = item.title || "";
      const price = parseFloat(item.price || "0") / 100; // Shopify prices are in cents
      if (!name || price <= 0) continue;

      const compUrl = `${base}/products/${item.handle}`;
      const imageUrl = item.image || item.featured_image?.url || undefined;

      const verification = verifyMatch(product, name, undefined, item.vendor);
      if (verification.verified) {
        return {
          ownProduct: product,
          competitorName: name,
          competitorPrice: price,
          competitorUrl: compUrl,
          competitorBrand: item.vendor || undefined,
          competitorImageUrl: imageUrl,
          currency: "ARS",
          matchMethod: "NAME_VERIFIED",
          matchConfidence: verification.confidence,
          matchReason: verification.reason,
          searchQuery: query,
          platform: "shopify",
        };
      }
    }
  } catch { /* ignore */ }

  return null;
}

// ── Main Pipeline ──────────────────────────────────────────────

export type CompetitorPlatform = "vtex" | "shopify" | "mercadolibre";

/**
 * Search-first matching pipeline.
 * Takes OUR products and searches for each one on the competitor.
 *
 * @param ownProducts - Our catalog products to search for
 * @param target - Where to search (competitor website or "mercadolibre")
 * @param platform - "vtex" | "shopify" | "mercadolibre"
 * @param options - Configuration
 */
export async function searchFirstMatch(
  ownProducts: OwnProduct[],
  target: string,  // website URL or "mercadolibre"
  platform: CompetitorPlatform,
  options: {
    maxProducts?: number;
    maxRuntimeMs?: number;
    delayMs?: number;
    mlAccessToken?: string;
  } = {}
): Promise<SearchFirstResult> {
  const {
    maxProducts = 100,
    maxRuntimeMs = 45000,
    delayMs = 300,
    mlAccessToken,
  } = options;

  const startTime = Date.now();
  const allMatches: SearchMatch[] = [];
  let searched = 0;
  let matched = 0;
  let skipped = 0;
  let errors = 0;

  const base = target.replace(/\/$/, "");

  // Prioritize products WITH EAN first (higher chance of match)
  const sorted = [...ownProducts].sort((a, b) => {
    if (a.ean && !b.ean) return -1;
    if (!a.ean && b.ean) return 1;
    return 0;
  });

  for (const product of sorted.slice(0, maxProducts)) {
    // Safety timeout
    if (Date.now() - startTime > maxRuntimeMs) {
      console.log(`[SearchFirst] Timeout after ${searched} products`);
      break;
    }

    searched++;

    try {
      let result: SearchMatch | SearchMatch[] | null = null;

      if (platform === "vtex") {
        result = await searchProductOnVtex(base, product);
      } else if (platform === "mercadolibre") {
        result = await searchProductOnML(product, mlAccessToken);
      } else if (platform === "shopify") {
        result = await searchProductOnShopify(base, product);
      }

      if (result) {
        const matches = Array.isArray(result) ? result : [result];
        if (matches.length > 0) {
          allMatches.push(...matches);
          matched++;
        } else {
          skipped++;
        }
      } else {
        skipped++;
      }
    } catch (err) {
      errors++;
      console.error(`[SearchFirst] Error searching "${product.name}":`, err);
    }

    // Rate limit
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  // Deduplicate: same ownProduct + same competitor URL → keep highest confidence
  const deduped = new Map<string, SearchMatch>();
  for (const m of allMatches) {
    const key = `${m.ownProduct.id}::${m.competitorUrl}`;
    const existing = deduped.get(key);
    if (!existing || m.matchConfidence > existing.matchConfidence) {
      deduped.set(key, m);
    }
  }

  return {
    matches: Array.from(deduped.values()).sort((a, b) => b.matchConfidence - a.matchConfidence),
    searched,
    matched,
    skipped,
    errors,
    elapsedMs: Date.now() - startTime,
  };
}

// ── Platform Detection ─────────────────────────────────────────

export async function detectCompetitorPlatform(website: string): Promise<CompetitorPlatform | "unknown"> {
  const base = website.replace(/\/$/, "");

  // Try VTEX
  try {
    const res = await fetch(`${base}/api/catalog_system/pub/products/search/?_from=0&_to=0`, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(5000),
    });
    if (res.status >= 200 && res.status < 300) {
      const text = await res.text();
      if (text.startsWith("[")) return "vtex";
    }
  } catch { /* not vtex */ }

  // Try Shopify
  try {
    const res = await fetch(`${base}/products.json?limit=1`, {
      headers: { ...BROWSER_HEADERS, Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const text = await res.text();
      if (text.includes('"products"')) return "shopify";
    }
  } catch { /* not shopify */ }

  return "unknown";
}
