// ══════════════════════════════════════════════════════════════
// MercadoLibre Connector — Search + Price Reading via Public API
// ══════════════════════════════════════════════════════════════
// Strategy:
//   1. Search ML by product name/EAN → find competitor listings
//   2. Read prices from any public listing
//   3. Match ML items to own catalog (EAN > name fuzzy)
//
// API Docs: https://developers.mercadolibre.com.ar/es_ar/items-y-busquedas
// Rate limits: ~10,000 req/hour with token, ~1,000/hour without
// ══════════════════════════════════════════════════════════════

import { OwnProduct, findBestMatch } from "./competitor-discovery";

// ── Types ──────────────────────────────────────────────────────

export interface MLCredentials {
  appId: string;
  secretKey: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
}

export interface MLSearchResult {
  id: string;              // "MLA1234567890"
  title: string;
  price: number;
  currency_id: string;     // "ARS"
  condition: string;       // "new" | "used"
  permalink: string;       // Full ML URL
  thumbnail: string;
  seller: {
    id: number;
    nickname: string;
  };
  shipping: {
    free_shipping: boolean;
  };
  attributes: Array<{
    id: string;
    name: string;
    value_name: string | null;
  }>;
  catalog_product_id?: string;
}

export interface MLDiscoveredItem {
  mlItemId: string;        // "MLA1234567890"
  title: string;
  price: number;
  currency: string;
  url: string;
  imageUrl?: string;
  sellerNickname: string;
  sellerId: number;
  condition: string;
  freeShipping: boolean;
  ean?: string;
  brand?: string;
  // Match info (filled after matching)
  matchedOwnProduct?: OwnProduct;
  matchScore: number;
  matchReason: string;
  matchMethod?: string;
}

// ── Constants ──────────────────────────────────────────────────

const ML_API_BASE = "https://api.mercadolibre.com";
const ML_SITE_ID = "MLA"; // Argentina

const ML_HEADERS = {
  "Accept": "application/json",
  "Content-Type": "application/json",
};

// ── Auth helpers ───────────────────────────────────────────────

/**
 * Get access token using app credentials (client_credentials flow).
 * This gives read-only access to public data — no user authorization needed.
 */
export async function getAccessToken(credentials: MLCredentials): Promise<string> {
  // If we have a valid token, reuse it
  if (credentials.accessToken && credentials.tokenExpiresAt && Date.now() < credentials.tokenExpiresAt) {
    return credentials.accessToken;
  }

  // If we have a refresh token, use it
  if (credentials.refreshToken) {
    const res = await fetch(`${ML_API_BASE}/oauth/token`, {
      method: "POST",
      headers: ML_HEADERS,
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: credentials.appId,
        client_secret: credentials.secretKey,
        refresh_token: credentials.refreshToken,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return data.access_token;
    }
  }

  // Fall back to client_credentials (limited but works for public search)
  const res = await fetch(`${ML_API_BASE}/oauth/token`, {
    method: "POST",
    headers: ML_HEADERS,
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: credentials.appId,
      client_secret: credentials.secretKey,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ML auth failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.access_token;
}

// ── Search Functions ───────────────────────────────────────────

/**
 * Search MercadoLibre for products matching a query.
 * Works without auth token (public API), but rate-limited.
 * With token: ~10,000 req/hour. Without: ~1,000 req/hour.
 */
export async function searchML(
  query: string,
  options: {
    accessToken?: string;
    categoryId?: string;
    limit?: number;
    offset?: number;
    condition?: "new" | "used";
    sort?: "price_asc" | "price_desc" | "relevance";
  } = {}
): Promise<{ results: MLSearchResult[]; total: number; paging: { total: number; offset: number; limit: number } }> {
  const { accessToken, categoryId, limit = 50, offset = 0, condition, sort } = options;

  const params = new URLSearchParams({
    q: query,
    limit: String(Math.min(limit, 50)), // ML max is 50 per page
    offset: String(offset),
  });

  if (categoryId) params.set("category", categoryId);
  if (condition) params.set("condition", condition);
  if (sort) params.set("sort", sort);

  const headers: Record<string, string> = { ...ML_HEADERS };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  const url = `${ML_API_BASE}/sites/${ML_SITE_ID}/search?${params}`;
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ML search failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return {
    results: data.results || [],
    total: data.paging?.total || 0,
    paging: data.paging || { total: 0, offset: 0, limit: 50 },
  };
}

/**
 * Search MercadoLibre by EAN/GTIN barcode.
 * Uses the catalog search which is optimized for exact product matching.
 */
export async function searchMLByEan(
  ean: string,
  options: { accessToken?: string } = {}
): Promise<MLSearchResult[]> {
  const { accessToken } = options;

  const headers: Record<string, string> = { ...ML_HEADERS };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  // ML supports searching by EAN directly
  const url = `${ML_API_BASE}/sites/${ML_SITE_ID}/search?q=${ean}&limit=10`;
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) return [];
  const data = await res.json();
  return data.results || [];
}

/**
 * Get detailed item info (includes seller, shipping, full attributes).
 */
export async function getMLItem(
  itemId: string,
  options: { accessToken?: string } = {}
): Promise<any | null> {
  const { accessToken } = options;

  const headers: Record<string, string> = { ...ML_HEADERS };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  const res = await fetch(`${ML_API_BASE}/items/${itemId}`, {
    headers,
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) return null;
  return res.json();
}

/**
 * Get multiple items in one call (max 20 per request).
 * Much more efficient than individual calls.
 */
export async function getMLItemsBatch(
  itemIds: string[],
  options: { accessToken?: string } = {}
): Promise<any[]> {
  const { accessToken } = options;
  if (itemIds.length === 0) return [];

  const headers: Record<string, string> = { ...ML_HEADERS };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  // ML allows max 20 items per multi-get
  const batches: string[][] = [];
  for (let i = 0; i < itemIds.length; i += 20) {
    batches.push(itemIds.slice(i, i + 20));
  }

  const results: any[] = [];
  for (const batch of batches) {
    const ids = batch.join(",");
    const res = await fetch(`${ML_API_BASE}/items?ids=${ids}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      // Multi-get returns [{code: 200, body: {...}}, ...]
      for (const item of data) {
        if (item.code === 200 && item.body) {
          results.push(item.body);
        }
      }
    }
  }

  return results;
}

// ── Extraction helpers ─────────────────────────────────────────

/** Extract EAN/GTIN from ML item attributes */
function extractEanFromAttributes(attributes: Array<{ id: string; value_name: string | null }>): string | undefined {
  const eanAttrs = ["GTIN", "EAN", "UPC", "MPN"];
  for (const attr of attributes) {
    if (eanAttrs.includes(attr.id) && attr.value_name) {
      const val = attr.value_name.trim();
      if (/^\d{8,14}$/.test(val)) return val;
    }
  }
  return undefined;
}

/** Extract brand from ML item attributes */
function extractBrandFromAttributes(attributes: Array<{ id: string; value_name: string | null }>): string | undefined {
  for (const attr of attributes) {
    if (attr.id === "BRAND" && attr.value_name) {
      return attr.value_name;
    }
  }
  return undefined;
}

/** Convert ML search result to our internal format */
function searchResultToDiscoveredItem(result: MLSearchResult): MLDiscoveredItem {
  const ean = extractEanFromAttributes(result.attributes || []);
  const brand = extractBrandFromAttributes(result.attributes || []);

  return {
    mlItemId: result.id,
    title: result.title,
    price: result.price,
    currency: result.currency_id || "ARS",
    url: result.permalink,
    imageUrl: result.thumbnail,
    sellerNickname: result.seller?.nickname || "Unknown",
    sellerId: result.seller?.id || 0,
    condition: result.condition || "new",
    freeShipping: result.shipping?.free_shipping || false,
    ean,
    brand,
    matchScore: 0,
    matchReason: "",
  };
}

// ── Discovery Pipeline ─────────────────────────────────────────

/**
 * Discover ML listings that match own products.
 * Strategy:
 *   1. For products WITH EAN: search by EAN (exact match, highest confidence)
 *   2. For products WITHOUT EAN: search by "brand + name" (fuzzy match)
 *   3. Match discovered items back to own catalog
 *
 * @param ownProducts - Products from our catalog to find on ML
 * @param options - Configuration
 * @returns Array of discovered items with match info
 */
export async function discoverMLCompetitors(
  ownProducts: OwnProduct[],
  options: {
    accessToken?: string;
    maxProducts?: number;     // Max own products to search for
    maxRuntimeMs?: number;    // Safety timeout
    delayBetweenRequests?: number; // Rate limit protection (ms)
  } = {}
): Promise<{
  discovered: MLDiscoveredItem[];
  searchedProducts: number;
  totalMLResults: number;
}> {
  const {
    accessToken,
    maxProducts = 50,
    maxRuntimeMs = 45000,
    delayBetweenRequests = 200,
  } = options;

  const startTime = Date.now();
  const allDiscovered: MLDiscoveredItem[] = [];
  const seenMLIds = new Set<string>();
  let searchedProducts = 0;
  let totalMLResults = 0;

  // Build EAN lookup for fast matching
  const eanLookup = new Map<string, OwnProduct>();
  for (const own of ownProducts) {
    if (own.ean) eanLookup.set(own.ean, own);
  }

  // Sort: products with EAN first (higher match confidence)
  const sorted = [...ownProducts].sort((a, b) => {
    if (a.ean && !b.ean) return -1;
    if (!a.ean && b.ean) return 1;
    return 0;
  });

  for (const own of sorted.slice(0, maxProducts)) {
    if (Date.now() - startTime > maxRuntimeMs) break;

    searchedProducts++;

    try {
      // Build search query
      let query: string;
      if (own.ean) {
        // EAN search — most precise
        query = own.ean;
      } else {
        // Name-based search — use brand + key words
        const parts: string[] = [];
        if (own.brand) parts.push(own.brand);
        // Take first 5 meaningful words from product name
        const nameWords = own.name
          .replace(/[^a-záéíóúñü0-9\s]/gi, " ")
          .split(/\s+/)
          .filter(w => w.length > 2)
          .slice(0, 5);
        parts.push(...nameWords);
        query = parts.join(" ").trim();
      }

      if (!query || query.length < 3) continue;

      const { results, total } = await searchML(query, {
        accessToken,
        limit: 10, // Top 10 results per search
        condition: "new",
      });

      totalMLResults += total;

      for (const result of results) {
        if (seenMLIds.has(result.id)) continue;
        seenMLIds.add(result.id);

        const item = searchResultToDiscoveredItem(result);

        // Try EAN match first (O(1))
        if (item.ean && eanLookup.has(item.ean)) {
          const matched = eanLookup.get(item.ean)!;
          item.matchedOwnProduct = matched;
          item.matchScore = 100;
          item.matchReason = `EAN exacto: ${item.ean}`;
          item.matchMethod = "EAN_EXACT";
        } else {
          // Fuzzy match against the product we searched for
          const match = findBestMatch(item.title, [own], 45, item.ean);
          if (match) {
            item.matchedOwnProduct = match.product;
            item.matchScore = match.score;
            item.matchReason = match.reason;
            item.matchMethod = match.method;
          }
        }

        // Only keep items that matched something
        if (item.matchedOwnProduct) {
          allDiscovered.push(item);
        }
      }

      // Rate limit protection
      if (delayBetweenRequests > 0) {
        await new Promise(r => setTimeout(r, delayBetweenRequests));
      }
    } catch (err) {
      console.error(`[ML Discovery] Error searching for "${own.name}":`, err);
      // Continue with next product
    }
  }

  // Sort by match score (best matches first)
  allDiscovered.sort((a, b) => b.matchScore - a.matchScore);

  return {
    discovered: allDiscovered,
    searchedProducts,
    totalMLResults,
  };
}

/**
 * Refresh prices for existing ML items (given their item IDs).
 * Uses batch API for efficiency.
 */
export async function refreshMLPrices(
  itemIds: string[],
  options: { accessToken?: string } = {}
): Promise<Map<string, { price: number; currency: string; status: string }>> {
  const priceMap = new Map<string, { price: number; currency: string; status: string }>();

  if (itemIds.length === 0) return priceMap;

  const items = await getMLItemsBatch(itemIds, options);

  for (const item of items) {
    if (item.id) {
      priceMap.set(item.id, {
        price: item.price || 0,
        currency: item.currency_id || "ARS",
        status: item.status || "unknown", // "active", "paused", "closed"
      });
    }
  }

  return priceMap;
}

/**
 * Get ML toy category IDs for Argentina.
 * Useful for browsing category-wide.
 */
export async function getMLToyCategories(
  options: { accessToken?: string } = {}
): Promise<Array<{ id: string; name: string }>> {
  const { accessToken } = options;
  const headers: Record<string, string> = { ...ML_HEADERS };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  try {
    // MLA1132 = "Juegos y Juguetes" in Argentina
    const res = await fetch(
      `${ML_API_BASE}/categories/MLA1132/children`,
      { headers, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data || []).map((cat: any) => ({
      id: cat.id,
      name: cat.name,
    }));
  } catch {
    return [];
  }
}
