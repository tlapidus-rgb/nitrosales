// ══════════════════════════════════════════════════════════════
// Competitor Auto-Discovery — Platform detection + API + fuzzy matching
// ══════════════════════════════════════════════════════════════
// Strategy (by platform):
//   VTEX    → /api/catalog_system/pub/products/search (JSON API, fast)
//   Shopify → /products.json (JSON API, fast)
//   Other   → sitemap.xml crawl + HTML scraping (slower fallback)
//
// Then: fuzzy match discovered products against own catalog
// ══════════════════════════════════════════════════════════════

import * as cheerio from "cheerio";
import { scrapeProductPrice } from "./competitor-scraper";

// ── Types ──────────────────────────────────────────────────────
export interface OwnProduct {
  id: string;
  name: string;
  sku: string | null;
  brand: string | null;
  category: string | null;
  price: number;
}

export interface DiscoveredProduct {
  url: string;
  name: string;
  price: number;
  currency: string;
  imageUrl?: string;
  method: string;
  matchedOwnProduct?: OwnProduct;
  matchScore: number;
  matchReason: string;
}

type Platform = "vtex" | "shopify" | "tiendanube" | "woocommerce" | "unknown";

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
};

// ── Platform Detection ─────────────────────────────────────────

async function detectPlatform(website: string): Promise<Platform> {
  const base = website.replace(/\/$/, "");

  // Try VTEX API first (most common in Argentina)
  try {
    const vtexRes = await fetch(`${base}/api/catalog_system/pub/products/search/?_from=0&_to=0`, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    if (vtexRes.ok) {
      const text = await vtexRes.text();
      if (text.startsWith("[")) return "vtex";
    }
  } catch { /* not vtex */ }

  // Try Shopify products.json
  try {
    const shopifyRes = await fetch(`${base}/products.json?limit=1`, {
      headers: { ...BROWSER_HEADERS, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (shopifyRes.ok) {
      const text = await shopifyRes.text();
      if (text.includes('"products"')) return "shopify";
    }
  } catch { /* not shopify */ }

  // Check homepage HTML for platform hints
  try {
    const homeRes = await fetch(base, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(10000),
    });
    if (homeRes.ok) {
      const html = await homeRes.text();
      if (html.includes("tiendanube") || html.includes("Tienda Nube")) return "tiendanube";
      if (html.includes("woocommerce") || html.includes("WooCommerce")) return "woocommerce";
    }
  } catch { /* ignore */ }

  return "unknown";
}

// ── VTEX Product Fetch ─────────────────────────────────────────

interface RawProduct {
  url: string;
  name: string;
  price: number;
  currency: string;
  imageUrl?: string;
  method: string;
}

async function fetchVtexProducts(
  website: string,
  maxProducts: number,
  maxRuntimeMs: number,
  startTime: number
): Promise<RawProduct[]> {
  const base = website.replace(/\/$/, "");
  const products: RawProduct[] = [];
  const pageSize = 50; // VTEX max per page

  for (let from = 0; from < maxProducts; from += pageSize) {
    if (Date.now() - startTime > maxRuntimeMs) break;

    const to = Math.min(from + pageSize - 1, maxProducts - 1);
    try {
      const res = await fetch(
        `${base}/api/catalog_system/pub/products/search/?_from=${from}&_to=${to}`,
        { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(15000) }
      );

      if (!res.ok) break;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) break;

      for (const item of data) {
        const name = item.productName || item.productTitle || "";
        const link = item.link || item.linkText
          ? `${base}/${item.linkText || ""}/p`
          : "";

        // Get price from first seller's commercial offer
        let price = 0;
        let currency = "ARS";
        const items = item.items || [];
        if (items.length > 0) {
          const sellers = items[0].sellers || [];
          if (sellers.length > 0) {
            const offer = sellers[0].commertialOffer || {};
            price = offer.Price || offer.ListPrice || 0;
            currency = offer.CurrencySymbolPosition ? "ARS" : "ARS";
          }
        }

        // Get image
        const imageUrl = items[0]?.images?.[0]?.imageUrl || item.items?.[0]?.images?.[0]?.imageUrl || undefined;

        if (name && price > 0) {
          products.push({
            url: link,
            name,
            price,
            currency,
            imageUrl,
            method: "vtex-api",
          });
        }
      }

      // Small delay between API pages
      await new Promise((r) => setTimeout(r, 300));
    } catch {
      break;
    }
  }

  return products;
}

// ── Shopify Product Fetch ──────────────────────────────────────

async function fetchShopifyProducts(
  website: string,
  maxProducts: number,
  maxRuntimeMs: number,
  startTime: number
): Promise<RawProduct[]> {
  const base = website.replace(/\/$/, "");
  const products: RawProduct[] = [];
  let page = 1;

  while (products.length < maxProducts) {
    if (Date.now() - startTime > maxRuntimeMs) break;

    try {
      const res = await fetch(
        `${base}/products.json?limit=250&page=${page}`,
        { headers: { ...BROWSER_HEADERS, Accept: "application/json" }, signal: AbortSignal.timeout(15000) }
      );

      if (!res.ok) break;
      const data = await res.json();
      const items = data.products || [];
      if (items.length === 0) break;

      for (const item of items) {
        const variant = item.variants?.[0];
        const price = parseFloat(variant?.price || "0");
        const name = item.title || "";

        if (name && price > 0) {
          products.push({
            url: `${base}/products/${item.handle}`,
            name,
            price,
            currency: "ARS",
            imageUrl: item.images?.[0]?.src || undefined,
            method: "shopify-api",
          });
        }
      }

      page++;
      await new Promise((r) => setTimeout(r, 500));
    } catch {
      break;
    }
  }

  return products.slice(0, maxProducts);
}

// ── Sitemap Fallback ───────────────────────────────────────────

async function fetchViaSmartSitemap(
  website: string,
  maxProducts: number,
  maxRuntimeMs: number,
  startTime: number
): Promise<RawProduct[]> {
  const base = website.replace(/\/$/, "");
  const productUrls = await discoverProductUrls(base, maxProducts * 2);

  const products: RawProduct[] = [];
  for (const url of productUrls.slice(0, maxProducts)) {
    if (Date.now() - startTime > maxRuntimeMs) break;

    try {
      const result = await scrapeProductPrice(url);
      if (result && result.price > 0) {
        products.push({
          url,
          name: result.name,
          price: result.price,
          currency: result.currency,
          imageUrl: result.imageUrl,
          method: result.method,
        });
      }
    } catch { /* skip */ }

    await new Promise((r) => setTimeout(r, 1500));
  }

  return products;
}

async function discoverProductUrls(base: string, maxUrls: number): Promise<string[]> {
  const productUrls: string[] = [];

  const sitemapCandidates = [
    `${base}/sitemap.xml`,
    `${base}/sitemap_index.xml`,
    `${base}/sitemap-products.xml`,
    `${base}/product-sitemap.xml`,
  ];

  // Discover from robots.txt
  try {
    const robotsRes = await fetch(`${base}/robots.txt`, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    if (robotsRes.ok) {
      const robotsTxt = await robotsRes.text();
      const sitemapLines = robotsTxt.match(/Sitemap:\s*(.+)/gi) || [];
      for (const line of sitemapLines) {
        const url = line.replace(/Sitemap:\s*/i, "").trim();
        // Only add sitemaps from the same domain (VTEX robots.txt sometimes points to wrong domain)
        if (url && url.includes(new URL(base).hostname) && !sitemapCandidates.includes(url)) {
          sitemapCandidates.unshift(url);
        }
      }
    }
  } catch { /* ignore */ }

  for (const sitemapUrl of sitemapCandidates) {
    if (productUrls.length >= maxUrls) break;
    try {
      const urls = await parseSitemap(sitemapUrl, base, maxUrls - productUrls.length);
      for (const u of urls) {
        if (!productUrls.includes(u)) productUrls.push(u);
      }
    } catch { /* try next */ }
  }

  return productUrls.slice(0, maxUrls);
}

async function parseSitemap(sitemapUrl: string, baseUrl: string, maxUrls: number): Promise<string[]> {
  const res = await fetch(sitemapUrl, {
    headers: { ...BROWSER_HEADERS, Accept: "application/xml,text/xml,*/*" },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) return [];
  const xml = await res.text();
  const $ = cheerio.load(xml, { xmlMode: true });

  const childSitemaps = $("sitemap loc").map((_, el) => $(el).text()).get();

  if (childSitemaps.length > 0) {
    const productSitemaps = childSitemaps.filter(
      (u: string) => /product|catalog|item|producto/i.test(u)
    );
    const toProcess = productSitemaps.length > 0 ? productSitemaps : childSitemaps.slice(0, 3);

    const allUrls: string[] = [];
    for (const childUrl of toProcess) {
      if (allUrls.length >= maxUrls) break;
      try {
        const urls = await parseSitemap(childUrl, baseUrl, maxUrls - allUrls.length);
        allUrls.push(...urls);
      } catch { /* skip */ }
    }
    return allUrls;
  }

  const allLocs = $("url loc").map((_, el) => $(el).text()).get();
  return filterProductUrls(allLocs, baseUrl).slice(0, maxUrls);
}

function filterProductUrls(urls: string[], baseUrl: string): string[] {
  const productPatterns = [
    /\/product\//i,
    /\/products\//i,
    /\/p$/i,               // VTEX: /slug/p (no trailing slash)
    /\/p\//i,              // VTEX: /slug/p/ (with trailing slash)
    /\/producto\//i,
    /\/productos\//i,
    /\/item\//i,
    /\/dp\//i,
    /\/-\/p$/i,
    /\/[a-z0-9_]+-\d+\/p$/i,  // VTEX slug with number + /p
    /\/MLA-\d+/i,
  ];

  const antiPatterns = [
    /\/category\//i, /\/categories\//i, /\/tag\//i, /\/blog\//i,
    /\/page\//i, /\/cart/i, /\/checkout/i, /\/account/i,
    /\/login/i, /\/search/i, /\/contact/i, /\/about/i,
    /\/legal/i, /\/privacy/i, /\/terms/i,
    /\.jpg$|\.png$|\.pdf$/i,
    /\/brand-/i, /\/category-/i,
  ];

  const hostname = new URL(baseUrl).hostname;

  return urls.filter((url) => {
    try {
      const urlHost = new URL(url).hostname;
      if (urlHost !== hostname) return false;
    } catch {
      return false;
    }
    const path = url.replace(baseUrl, "");
    const isProduct = productPatterns.some((p) => p.test(path));
    if (!isProduct) return false;
    if (antiPatterns.some((p) => p.test(path))) return false;
    return true;
  });
}

// ── Fuzzy Matching ─────────────────────────────────────────────

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

function calculateMatchScore(
  scrapedName: string,
  ownProduct: OwnProduct
): { score: number; reason: string } {
  const scrapedNorm = normalize(scrapedName);

  // 1. Exact SKU match
  if (ownProduct.sku) {
    const skuNorm = normalize(ownProduct.sku);
    if (skuNorm.length >= 3 && scrapedNorm.includes(skuNorm)) {
      return { score: 95, reason: `SKU match: ${ownProduct.sku}` };
    }
  }

  // 2. Token overlap
  const scrapedTokens = tokenize(scrapedName);
  const ownTokens = tokenize(ownProduct.name);

  if (scrapedTokens.length === 0 || ownTokens.length === 0) {
    return { score: 0, reason: "No tokens" };
  }

  const commonTokens = ownTokens.filter((t) => scrapedTokens.includes(t));
  const overlapRatio = commonTokens.length / Math.max(ownTokens.length, 1);
  let score = Math.round(overlapRatio * 70);
  let reason = `${commonTokens.length}/${ownTokens.length} tokens`;

  // 3. Brand bonus
  if (ownProduct.brand) {
    const brandNorm = normalize(ownProduct.brand);
    if (brandNorm.length >= 2 && scrapedNorm.includes(brandNorm)) {
      score += 15;
      reason += ` + marca ${ownProduct.brand}`;
    }
  }

  // 4. Consecutive word match bonus
  const scrapedStr = scrapedTokens.join(" ");
  for (let len = Math.min(4, ownTokens.length); len >= 3; len--) {
    let found = false;
    for (let i = 0; i <= ownTokens.length - len; i++) {
      const phrase = ownTokens.slice(i, i + len).join(" ");
      if (scrapedStr.includes(phrase)) {
        score += 10;
        reason += " + frase consecutiva";
        found = true;
        break;
      }
    }
    if (found || score >= 80) break;
  }

  return { score: Math.min(score, 100), reason };
}

export function findBestMatch(
  scrapedName: string,
  ownProducts: OwnProduct[],
  minScore = 50
): { product: OwnProduct; score: number; reason: string } | null {
  let bestMatch: { product: OwnProduct; score: number; reason: string } | null = null;

  for (const own of ownProducts) {
    const { score, reason } = calculateMatchScore(scrapedName, own);
    if (score >= minScore && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { product: own, score, reason };
    }
  }

  return bestMatch;
}

// ── Full Discovery Pipeline ────────────────────────────────────

export async function discoverCompetitorProducts(
  website: string,
  ownProducts: OwnProduct[],
  options: {
    maxProducts?: number;
    maxRuntimeMs?: number;
  } = {}
): Promise<{ platform: Platform; discovered: DiscoveredProduct[] }> {
  const {
    maxProducts = 500,
    maxRuntimeMs = 50000,
  } = options;

  const startTime = Date.now();

  // Phase 1: Detect platform
  const platform = await detectPlatform(website);
  console.log(`[Discovery] Platform detected: ${platform} for ${website}`);

  // Phase 2: Fetch products using platform-specific method
  let rawProducts: RawProduct[] = [];

  if (platform === "vtex") {
    rawProducts = await fetchVtexProducts(website, maxProducts, maxRuntimeMs, startTime);
  } else if (platform === "shopify") {
    rawProducts = await fetchShopifyProducts(website, maxProducts, maxRuntimeMs, startTime);
  } else {
    // Fallback: sitemap + scraping (slower, limited)
    rawProducts = await fetchViaSmartSitemap(website, Math.min(maxProducts, 40), maxRuntimeMs, startTime);
  }

  console.log(`[Discovery] Fetched ${rawProducts.length} products via ${platform}`);

  // Phase 3: Match against own catalog
  const discovered: DiscoveredProduct[] = rawProducts.map((rp) => {
    const match = findBestMatch(rp.name, ownProducts);
    return {
      ...rp,
      matchedOwnProduct: match?.product,
      matchScore: match?.score || 0,
      matchReason: match?.reason || "",
    };
  });

  // Sort: matched first (highest score), then unmatched
  discovered.sort((a, b) => b.matchScore - a.matchScore);

  return { platform, discovered };
}
