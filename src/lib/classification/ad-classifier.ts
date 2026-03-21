// ââââââââââââââââââââââââââââââââââââââââââââââ
// Clasificador automÃ¡tico de creativos
// ââââââââââââââââââââââââââââââââââââââââââââââ
// Detecta el tipo/categorÃ­a de un anuncio basÃ¡ndose en:
// 1. Metadatos de la API (video vs imagen vs carrusel)
// 2. Nombre de la campaÃ±a (patrones comunes)
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
//   VIDEO     - Video genÃ©rico
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

  // ââ Rule 1: Carousel from API metadata ââ
  if (type === "CAROUSEL" || type === "COLLECTION") {
    return { type: "CAROUSEL", confidence: 0.95, reason: "API metadata: carousel/collection type" };
  }

  // ââ Rule 2: Dynamic Product Ads ââ
  if (/DPA|DYNAMIC|DABA|CATALOG_SALES|PRODUCT_CATALOG/.test(combined)) {
    return { type: "DYNAMIC", confidence: 0.9, reason: "Name pattern matches Dynamic Product Ads" };
  }

  // ââ Rule 3: UGC patterns ââ
  if (/UGC|USER.?GENERATED|CREATOR|INFLUENCER|REELS?\b|TIKTOK|UNBOX/.test(combined)) {
    return { type: "UGC", confidence: 0.85, reason: "Name pattern matches UGC content" };
  }

  // ââ Rule 4: Testimonial ââ
  if (/TESTIMON|REVIEW|RESE[NÃ]A|OPINION|RATING|STARS/.test(combined)) {
    return { type: "TESTIMONIAL", confidence: 0.85, reason: "Name pattern matches testimonial" };
  }

  // ââ Rule 5: Promo/Offer ââ
  if (/PROMO|DESCUENTO|OFERTA|SALE|%\s*OFF|HOT\s*SALE|CYBER|BLACK\s*FRIDAY|CUOTAS|FREE.?SHIP|ENV[IÃ]O.?GRATIS|2X1|3X2/.test(combined)) {
    return { type: "PROMO", confidence: 0.85, reason: "Name pattern matches promotional content" };
  }

  // ââ Rule 6: Brand/Awareness ââ
  if (/BRAND|AWARENESS|REACH|RECONOCIMIENTO|MARCA\b/.test(combined)) {
    return { type: "BRAND", confidence: 0.8, reason: "Name pattern matches branding" };
  }

  // ââ Rule 7: Lifestyle ââ
  if (/LIFESTYLE|ASPIRACIONAL|MOOD|AMBI[EE]NT|EXPERIENCE/.test(combined)) {
    return { type: "LIFESTYLE", confidence: 0.8, reason: "Name pattern matches lifestyle" };
  }

  // ââ Rule 8: Video from API metadata ââ
  if (type === "VIDEO" || type.includes("VIDEO")) {
    return { type: "VIDEO", confidence: 0.75, reason: "API metadata: video type" };
  }

  // ââ Rule 9: Product-focused (default for shopping/catalog) ââ
  if (/PRODUCT|PRODUCTO|SHOPPING|CATALOG|SKU|ARTICUL/.test(combined) || type === "SHOPPING_PRODUCT") {
    return { type: "PRODUCT", confidence: 0.75, reason: "Name pattern matches product-focused" };
  }

  // ââ Rule 10: Image with product signals ââ
  if (type === "IMAGE" || type === "RESPONSIVE_DISPLAY") {
    return { type: "PRODUCT", confidence: 0.6, reason: "Image ad defaulting to product" };
  }

  // ââ Rule 11: Search ads â categorize as PRODUCT by default ââ
  if (type === "RESPONSIVE_SEARCH") {
    return { type: "PRODUCT", confidence: 0.5, reason: "Search ad defaulting to product" };
  }

  // ââ Fallback ââ
  return { type: "OTHER", confidence: 0.3, reason: "No classification pattern matched" };
}

/**
 * Blend regex classification with Vision analysis.
 * Logic:
 * - If both agree â high confidence (max of both)
 * - If they differ â vision wins if confidence > 0.7
 * - If no vision data â regex-only (existing behavior)
 */
export function classifyWithVision(
  regexResult: ClassificationResult,
  visionClassification?: string | null,
  visionConfidence?: number | null
): ClassificationResult {
  // No vision data â return regex as-is
  if (!visionClassification || visionConfidence == null) {
    return regexResult;
  }

  const visionType = visionClassification.toUpperCase();
  const regexType = regexResult.type.toUpperCase();

  // Both agree â boost confidence
  if (visionType === regexType) {
    return {
      type: regexResult.type,
      confidence: Math.min(0.99, Math.max(regexResult.confidence, visionConfidence) + 0.1),
      reason: `Regex + Vision coinciden: ${regexResult.type}`,
    };
  }

  // They differ â vision wins if confident enough
  if (visionConfidence >= 0.7) {
    // Exception: if regex matched from API metadata (confidence >= 0.9), trust regex
    if (regexResult.confidence >= 0.9) {
      return {
        type: regexResult.type,
        confidence: regexResult.confidence,
        reason: `API metadata (${regexResult.type}) priorizado sobre Vision (${visionType})`,
      };
    }

    return {
      type: visionType,
      confidence: visionConfidence,
      reason: `Vision (${visionType} @ ${Math.round(visionConfidence * 100)}%) override regex (${regexType} @ ${Math.round(regexResult.confidence * 100)}%)`,
    };
  }

  // Vision not confident enough â keep regex
  return {
    ...regexResult,
    reason: `${regexResult.reason} (Vision sugiriÃ³ ${visionType} con baja confianza ${Math.round(visionConfidence * 100)}%)`,
  };
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
