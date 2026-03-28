// ══════════════════════════════════════════════════════════════
// Competitor Auto-Discovery — Sitemap crawling + fuzzy matching
// ══════════════════════════════════════════════════════════════
// 1. Crawl sitemap.xml to find product URLs
// 2. Scrape each product for name + price
// 3. Fuzzy match against own catalog (name, sku, brand)
// 4. Auto-create CompetitorPrice entries with mapping
// ══════════════════════════════════════════════════════════════

import * as cheerio from "cheerio";
import { scrapeProductPrice, ScrapeResult } from "./competitor-scraper";

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
  matchScore: number; // 0-100
  matchReason: string;
}

export interface DiscoveryProgress {
  phase: "sitemap" | "scraping" | "matching" | "done";
  urlsFound: number;
  scraped: number;
  matched: number;
  errors: number;
  total: number;
}

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
};

// ── Sitemap Crawling ───────────────────────────────────────────

/**
 * Discover product URLs from a competitor's sitemap.xml
 * Tries: /sitemap.xml → /sitemap_index.xml → /sitemap-products.xml → robots.txt
 */
export async function discoverProductUrls(website: string, maxUrls = 200): Promise<string[]> {
  const base = website.replace(/\/$/, "");
  const productUrls: string[] = [];

  // Try different sitemap locations
  const sitemapCandidates = [
    `${base}/sitemap.xml`,
    `${base}/sitemap_index.xml`,
    `${base}/sitemap-products.xml`,
    `${base}/sitemap_products.xml`,
    `${base}/product-sitemap.xml`,
  ];

  // Also try to discover from robots.txt
  try {
    const robotsRes = await fetch(`${base}/robots.txt`, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(10000),
    });
    if (robotsRes.ok) {
      const robotsTxt = await robotsRes.text();
      const sitemapLines = robotsTxt.match(/Sitemap:\s*(.+)/gi) || [];
      for (const line of sitemapLines) {
        const url = line.replace(/Sitemap:\s*/i, "").trim();
        if (url && !sitemapCandidates.includes(url)) {
          sitemapCandidates.unshift(url); // prioritize robots.txt sitemaps
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

/**
 * Parse a sitemap XML and extract product-like URLs.
 * Handles both sitemap index files and regular sitemaps.
 */
async function parseSitemap(sitemapUrl: string, baseUrl: string, maxUrls: number): Promise<string[]> {
  const res = await fetch(sitemapUrl, {
    headers: { ...BROWSER_HEADERS, Accept: "application/xml,text/xml,*/*" },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) return [];
  const xml = await res.text();
  const $ = cheerio.load(xml, { xmlMode: true });

  // Check if it's a sitemap index (contains other sitemaps)
  const childSitemaps = $("sitemap loc").map((_, el) => $(el).text()).get();

  if (childSitemaps.length > 0) {
    // It's an index — find product-related sub-sitemaps first
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

  // Regular sitemap — extract URLs that look like product pages
  const allLocs = $("url loc").map((_, el) => $(el).text()).get();
  return filterProductUrls(allLocs, baseUrl).slice(0, maxUrls);
}

/**
 * Filter URLs that are likely product pages based on common ecommerce URL patterns
 */
function filterProductUrls(urls: string[], baseUrl: string): string[] {
  // Common product URL patterns across platforms
  const productPatterns = [
    /\/product\//i,          // Generic
    /\/products\//i,         // Shopify
    /\/p\//i,                // VTEX
    /\/producto\//i,         // Spanish
    /\/productos\//i,        // Spanish
    /\/item\//i,             // Generic
    /\/dp\//i,               // Amazon
    /\/catalog\//i,          // Generic
    /\/-\/p$/i,              // VTEX pattern ending
    /\/[a-z0-9-]+-\d+$/i,   // slug-with-id pattern
    /\/MLA-\d+/i,            // MercadoLibre
  ];

  // Anti-patterns (NOT product pages)
  const antiPatterns = [
    /\/category\//i,
    /\/categories\//i,
    /\/tag\//i,
    /\/blog\//i,
    /\/page\//i,
    /\/cart/i,
    /\/checkout/i,
    /\/account/i,
    /\/login/i,
    /\/search/i,
    /\/contact/i,
    /\/about/i,
    /\/legal/i,
    /\/privacy/i,
    /\/terms/i,
    /\.jpg$|\.png$|\.pdf$/i,
  ];

  return urls.filter((url) => {
    // Must be from the same domain
    if (!url.startsWith(baseUrl) && !url.startsWith("http")) return false;
    // Must match at least one product pattern OR have enough URL depth (slug-like)
    const path = url.replace(baseUrl, "");
    const isProduct = productPatterns.some((p) => p.test(path));
    const isDeepSlug = path.split("/").filter(Boolean).length >= 2 && /[a-z].*-.*[a-z]/i.test(path);
    if (!isProduct && !isDeepSlug) return false;
    // Must NOT match anti-patterns
    if (antiPatterns.some((p) => p.test(path))) return false;
    return true;
  });
}

// ── Fuzzy Matching ─────────────────────────────────────────────

/**
 * Normalize a product name for comparison
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9\s]/g, " ") // remove special chars
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tokenize a name into meaningful words (filtering stop words)
 */
function tokenize(text: string): string[] {
  const stopWords = new Set([
    "de", "la", "el", "los", "las", "un", "una", "con", "por", "para",
    "en", "del", "al", "y", "o", "a", "e", "the", "and", "or", "for",
    "with", "x", "cm", "mm", "ml", "gr", "kg", "lt",
  ]);
  return normalize(text).split(" ").filter((w) => w.length > 1 && !stopWords.has(w));
}

/**
 * Calculate similarity between two product names (0-100)
 * Uses token overlap + bonus for SKU/brand matches
 */
function calculateMatchScore(
  scrapedName: string,
  ownProduct: OwnProduct
): { score: number; reason: string } {
  const scrapedNorm = normalize(scrapedName);
  const ownNorm = normalize(ownProduct.name);

  // 1. Exact SKU match (highest confidence)
  if (ownProduct.sku) {
    const skuNorm = normalize(ownProduct.sku);
    if (skuNorm.length >= 3 && scrapedNorm.includes(skuNorm)) {
      return { score: 95, reason: `SKU match: ${ownProduct.sku}` };
    }
  }

  // 2. Token overlap scoring
  const scrapedTokens = tokenize(scrapedName);
  const ownTokens = tokenize(ownProduct.name);

  if (scrapedTokens.length === 0 || ownTokens.length === 0) {
    return { score: 0, reason: "No tokens" };
  }

  const commonTokens = ownTokens.filter((t) => scrapedTokens.includes(t));
  const overlapRatio = commonTokens.length / Math.max(ownTokens.length, 1);
  let score = Math.round(overlapRatio * 70); // Max 70 from token overlap

  let reason = `${commonTokens.length}/${ownTokens.length} tokens`;

  // 3. Brand bonus (+15 if brand matches)
  if (ownProduct.brand) {
    const brandNorm = normalize(ownProduct.brand);
    if (brandNorm.length >= 2 && scrapedNorm.includes(brandNorm)) {
      score += 15;
      reason += ` + marca ${ownProduct.brand}`;
    }
  }

  // 4. Consecutive word match bonus (+10 if 3+ consecutive words match)
  const ownStr = ownTokens.join(" ");
  const scrapedStr = scrapedTokens.join(" ");
  for (let len = Math.min(4, ownTokens.length); len >= 3; len--) {
    for (let i = 0; i <= ownTokens.length - len; i++) {
      const phrase = ownTokens.slice(i, i + len).join(" ");
      if (scrapedStr.includes(phrase)) {
        score += 10;
        reason += " + frase consecutiva";
        break;
      }
    }
    if (score >= 80) break;
  }

  return { score: Math.min(score, 100), reason };
}

/**
 * Find the best matching own product for a scraped product
 */
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

/**
 * Full auto-discovery: crawl sitemap → scrape products → match to catalog
 * Returns discovered products with matches
 */
export async function discoverCompetitorProducts(
  website: string,
  ownProducts: OwnProduct[],
  options: {
    maxUrls?: number;
    maxScrape?: number;
    rateDelayMs?: number;
    maxRuntimeMs?: number;
    onProgress?: (progress: DiscoveryProgress) => void;
  } = {}
): Promise<DiscoveredProduct[]> {
  const {
    maxUrls = 200,
    maxScrape = 50,
    rateDelayMs = 1500,
    maxRuntimeMs = 55000,
    onProgress,
  } = options;

  const startTime = Date.now();
  const progress: DiscoveryProgress = {
    phase: "sitemap",
    urlsFound: 0,
    scraped: 0,
    matched: 0,
    errors: 0,
    total: 0,
  };

  const report = () => onProgress?.(progress);

  // Phase 1: Discover URLs from sitemap
  report();
  const urls = await discoverProductUrls(website, maxUrls);
  progress.urlsFound = urls.length;
  progress.total = Math.min(urls.length, maxScrape);
  progress.phase = "scraping";
  report();

  if (urls.length === 0) {
    progress.phase = "done";
    report();
    return [];
  }

  // Phase 2: Scrape products (rate-limited, with timer)
  const discovered: DiscoveredProduct[] = [];
  const urlsToScrape = urls.slice(0, maxScrape);

  for (const url of urlsToScrape) {
    // Timer safety
    if (Date.now() - startTime > maxRuntimeMs) break;

    try {
      const result = await scrapeProductPrice(url);
      if (result && result.price > 0) {
        discovered.push({
          url,
          name: result.name,
          price: result.price,
          currency: result.currency,
          imageUrl: result.imageUrl,
          method: result.method,
          matchScore: 0,
          matchReason: "",
        });
        progress.scraped++;
      } else {
        progress.errors++;
      }
    } catch {
      progress.errors++;
    }

    report();

    // Rate limiting
    if (rateDelayMs > 0) {
      await new Promise((r) => setTimeout(r, rateDelayMs));
    }
  }

  // Phase 3: Match against own catalog
  progress.phase = "matching";
  report();

  for (const product of discovered) {
    const match = findBestMatch(product.name, ownProducts);
    if (match) {
      product.matchedOwnProduct = match.product;
      product.matchScore = match.score;
      product.matchReason = match.reason;
      progress.matched++;
    }
  }

  // Sort: matched first (highest score), then unmatched
  discovered.sort((a, b) => b.matchScore - a.matchScore);

  progress.phase = "done";
  report();

  return discovered;
}
