// ══════════════════════════════════════════════════════════════
// Competitor Price Scraper — Extracción genérica de precios
// ══════════════════════════════════════════════════════════════
// Estrategia en orden de confiabilidad:
// 1. JSON-LD (schema.org Product) — VTEX, Shopify, WooCommerce, TiendaNube
// 2. Meta tags (og:price:amount, product:price:amount)
// 3. Selectores CSS genéricos (.price, [data-price], etc.)
// ══════════════════════════════════════════════════════════════

import * as cheerio from "cheerio";

export interface ScrapeResult {
  name: string;
  price: number;
  currency: string;
  imageUrl?: string;
  method: "json-ld" | "meta" | "css";
}

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
  "Accept-Encoding": "gzip, deflate",
  "Cache-Control": "no-cache",
};

// Parse a price string into a number (handles Argentine formats: $89.990 / $89,990.00)
function parsePrice(raw: string): number | null {
  if (!raw) return null;
  // Remove currency symbols, spaces, and non-numeric chars except . and ,
  let cleaned = raw.replace(/[^0-9.,]/g, "").trim();
  if (!cleaned) return null;

  // Argentine format: 89.990 (dots as thousands) or 89.990,50 (comma as decimal)
  // US format: 89,990 (comma as thousands) or 89,990.50 (dot as decimal)
  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");

  if (lastComma > lastDot) {
    // Comma is decimal separator: 89.990,50 → 89990.50
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma && cleaned.split(".").length === 2 && cleaned.split(".")[1].length <= 2) {
    // Dot is decimal separator: 89,990.50 → 89990.50
    cleaned = cleaned.replace(/,/g, "");
  } else {
    // Dots as thousands only: 89.990 → 89990
    cleaned = cleaned.replace(/\./g, "").replace(/,/g, "");
  }

  const num = parseFloat(cleaned);
  return isNaN(num) || num <= 0 ? null : num;
}

// Strategy 1: JSON-LD structured data
function extractFromJsonLd($: cheerio.CheerioAPI): ScrapeResult | null {
  const scripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < scripts.length; i++) {
    try {
      const text = $(scripts[i]).html();
      if (!text) continue;
      const data = JSON.parse(text);

      // Handle @graph arrays
      const items = Array.isArray(data) ? data : data["@graph"] ? data["@graph"] : [data];

      for (const item of items) {
        if (item["@type"] === "Product" || item["@type"]?.includes?.("Product")) {
          const name = item.name || "";
          const image = item.image?.url || item.image?.[0]?.url || item.image?.[0] || item.image || "";
          const offers = item.offers;

          let price: number | null = null;
          let currency = "ARS";

          if (offers) {
            const offer = Array.isArray(offers) ? offers[0] : offers;
            // AggregateOffer vs Offer
            const priceVal = offer.price || offer.lowPrice || offer.highPrice;
            price = typeof priceVal === "number" ? priceVal : parsePrice(String(priceVal || ""));
            currency = offer.priceCurrency || "ARS";
          }

          if (price && price > 0) {
            return {
              name: String(name).substring(0, 500),
              price,
              currency,
              imageUrl: typeof image === "string" ? image : undefined,
              method: "json-ld",
            };
          }
        }
      }
    } catch {
      // Invalid JSON, skip
    }
  }
  return null;
}

// Strategy 2: Meta tags (Open Graph / product)
function extractFromMeta($: cheerio.CheerioAPI): ScrapeResult | null {
  const priceStr =
    $('meta[property="og:price:amount"]').attr("content") ||
    $('meta[property="product:price:amount"]').attr("content") ||
    $('meta[name="price"]').attr("content") ||
    $('meta[property="product:price"]').attr("content") || "";

  const price = parsePrice(priceStr);
  if (!price) return null;

  const name =
    $('meta[property="og:title"]').attr("content") ||
    $("title").text() || "";

  const currency =
    $('meta[property="og:price:currency"]').attr("content") ||
    $('meta[property="product:price:currency"]').attr("content") || "ARS";

  const imageUrl = $('meta[property="og:image"]').attr("content") || undefined;

  return {
    name: name.substring(0, 500),
    price,
    currency,
    imageUrl,
    method: "meta",
  };
}

// Strategy 3: CSS selectors (generic patterns)
function extractFromCss($: cheerio.CheerioAPI): ScrapeResult | null {
  // Common price selectors across ecommerce platforms
  const priceSelectors = [
    ".product-price .best-price",           // VTEX
    ".skuBestPrice",                         // VTEX legacy
    "[data-product-price]",                  // Generic data attr
    ".product-price__value",                 // TiendaNube
    ".price--current",                       // Generic
    ".product__price .current-price",        // Shopify
    ".price-box .price",                     // Magento
    ".product-info-price .price",            // Magento 2
    ".woocommerce-Price-amount",             // WooCommerce
    ".price .money",                         // Shopify
    '[class*="Price"] [class*="current"]',   // Generic
    '[class*="price"] [class*="final"]',     // Generic
    ".bestPrice",                            // VTEX
    "#priceblock_ourprice",                  // Amazon
    ".price-new",                            // OpenCart
    ".product-price",                        // Generic
    ".sale-price",                           // Generic
    ".current-price",                        // Generic
  ];

  for (const sel of priceSelectors) {
    const el = $(sel).first();
    if (el.length) {
      const priceText = el.attr("data-product-price") || el.attr("content") || el.text();
      const price = parsePrice(priceText || "");
      if (price) {
        const name = $('h1[class*="product"]').first().text() ||
                     $('h1[class*="Product"]').first().text() ||
                     $("h1").first().text() ||
                     $("title").text() || "";

        const imageUrl = $('img[class*="product"]').first().attr("src") ||
                        $('[class*="gallery"] img').first().attr("src") ||
                        $('[class*="image"] img').first().attr("src") || undefined;

        return {
          name: name.trim().substring(0, 500),
          price,
          currency: "ARS",
          imageUrl,
          method: "css",
        };
      }
    }
  }
  return null;
}

// Main scraping function
export async function scrapeProductPrice(url: string): Promise<ScrapeResult | null> {
  try {
    const response = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(15000), // 15s timeout per request
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Try strategies in order
    return extractFromJsonLd($) || extractFromMeta($) || extractFromCss($);
  } catch (error: any) {
    console.error(`[Scraper] Error scraping ${url}:`, error.message);
    return null;
  }
}
