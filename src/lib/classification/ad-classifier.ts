// ══════════════════════════════════════════════
// Clasificador automático de creativos
// ══════════════════════════════════════════════
// Detecta el tipo/categoría de un anuncio basándose en:
// 1. Metadatos de la API (video vs imagen vs carrusel)
// 2. Nombre de la campaña (patrones comunes)
// 3. Nombre del anuncio (keywords)
// 4. Tipo de CTA
//
// Tipos posibles:
//   PRODUCT   - Foto/video de producto
//   UGC       - User Generated Content
//   LIFESTYLE - Lifestyle/aspiracional
//   PROMO     - Promocional/descuento/oferta
//   TESTIMONIAL - Testimonio de cliente
//   CAROUSEL  - Carrusel de productos
//   VIDEO     - Video genérico
//   BRAND     - Branding/awareness
//   DYNAMIC   - Dynamic Product Ads (DPA)
//   OTHER     - No clasificado

export interface ClassificationResult {
  type: string;
  confidence: number; // 0-1
  reason: string;
}

/** Classify a creative based on all available metadata */
export function classifyCreative(params: {
  adName?: string | null;
  campaignName?: string | null;
  adType?: string | null;       // From API: VIDEO, IMAGE, CAROUSEL, RESPONSIVE_SEARCH, etc.
  headline?: string | null;
  description?: string | null;
  ctaType?: string | null;
  mediaUrls?: string[];
  platform?: string;
}): ClassificationResult {
  const {
    adName = "",
    campaignName = "",
    adType = "",
    headline = "",
    description = "",
    ctaType = "",
  } = params;

  const combined = [adName, campaignName, headline, description]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
  const type = (adType || "").toUpperCase();

  // ── Rule 1: Carousel from API metadata ──
  if (type === "CAROUSEL" || type === "COLLECTION") {
    return { type: "CAROUSEL", confidence: 0.95, reason: "API metadata: carousel/collection type" };
  }

  // ── Rule 2: Dynamic Product Ads ──
  if (/DPA|DYNAMIC|DABA|CATALOG_SALES|PRODUCT_CATALOG/.test(combined)) {
    return { type: "DYNAMIC", confidence: 0.9, reason: "Name pattern matches Dynamic Product Ads" };
  }

  // ── Rule 3: UGC patterns ──
  if (/UGC|USER.?GENERATED|CREATOR|INFLUENCER|REELS?\b|TIKTOK|UNBOX/.test(combined)) {
    return { type: "UGC", confidence: 0.85, reason: "Name pattern matches UGC content" };
  }

  // ── Rule 4: Testimonial ──
  if (/TESTIMON|REVIEW|RESE[NÑ]A|OPINION|RATING|STARS/.test(combined)) {
    return { type: "TESTIMONIAL", confidence: 0.85, reason: "Name pattern matches testimonial" };
  }

  // ── Rule 5: Promo/Offer ──
  if (/PROMO|DESCUENTO|OFERTA|SALE|%\s*OFF|HOT\s*SALE|CYBER|BLACK\s*FRIDAY|CUOTAS|FREE.?SHIP|ENV[IÍ]O.?GRATIS|2X1|3X2/.test(combined)) {
    return { type: "PROMO", confidence: 0.85, reason: "Name pattern matches promotional content" };
  }

  // ── Rule 6: Brand/Awareness ──
  if (/BRAND|AWARENESS|REACH|RECONOCIMIENTO|MARCA\b/.test(combined)) {
    return { type: "BRAND", confidence: 0.8, reason: "Name pattern matches branding" };
  }

  // ── Rule 7: Lifestyle ──
  if (/LIFESTYLE|ASPIRACIONAL|MOOD|AMBI[EE]NT|EXPERIENCE/.test(combined)) {
    return { type: "LIFESTYLE", confidence: 0.8, reason: "Name pattern matches lifestyle" };
  }

  // ── Rule 8: Video from API metadata ──
  if (type === "VIDEO" || type.includes("VIDEO")) {
    return { type: "VIDEO", confidence: 0.75, reason: "API metadata: video type" };
  }

  // ── Rule 9: Product-focused (default for shopping/catalog) ──
  if (/PRODUCT|PRODUCTO|SHOPPING|CATALOG|SKU|ARTICUL/.test(combined) || type === "SHOPPING_PRODUCT") {
    return { type: "PRODUCT", confidence: 0.75, reason: "Name pattern matches product-focused" };
  }

  // ── Rule 10: Image with product signals ──
  if (type === "IMAGE" || type === "RESPONSIVE_DISPLAY") {
    return { type: "PRODUCT", confidence: 0.6, reason: "Image ad defaulting to product" };
  }

  // ── Rule 11: Search ads → categorize as PRODUCT by default ──
  if (type === "RESPONSIVE_SEARCH") {
    return { type: "PRODUCT", confidence: 0.5, reason: "Search ad defaulting to product" };
  }

  // ── Fallback ──
  return { type: "OTHER", confidence: 0.3, reason: "No classification pattern matched" };
}

/** All available classification types for the UI */
export const CLASSIFICATION_TYPES = [
  { value: "PRODUCT", label: "Producto", color: "#3B82F6" },
  { value: "UGC", label: "UGC", color: "#8B5CF6" },
  { value: "LIFESTYLE", label: "Lifestyle", color: "#EC4899" },
  { value: "PROMO", label: "Promo", color: "#F59E0B" },
  { value: "TESTIMONIAL", label: "Testimonio", color: "#10B981" },
  { value: "CAROUSEL", label: "Carrusel", color: "#6366F1" },
  { value: "VIDEO", label: "Video", color: "#EF4444" },
  { value: "BRAND", label: "Branding", color: "#06B6D4" },
  { value: "DYNAMIC", label: "DPA", color: "#F97316" },
  { value: "OTHER", label: "Otro", color: "#6B7280" },
] as const;

export type ClassificationType = typeof CLASSIFICATION_TYPES[number]["value"];
