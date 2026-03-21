// ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// Vision Analyzer â Claude Vision para anÃ¡lisis de creativos
// ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// Analiza imÃ¡genes de ads con Claude Vision para detectar:
// - Tipo de creativo (PRODUCT, UGC, LIFESTYLE, PROMO, etc.)
// - Colores dominantes y composiciÃ³n
// - Objetos, personas, texto overlay
// - Fortalezas y Ã¡reas de mejora
// - Riesgo de fatiga creativa
//
// Rate limit: max 1 anÃ¡lisis cada 2 segundos (para no saturar API)
// Costo: ~$0.003/imagen con Sonnet
// ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

import Anthropic from "@anthropic-ai/sdk";

export interface VisionAnalysisResult {
  classification: string;      // PRODUCT, UGC, LIFESTYLE, PROMO, etc.
  confidence: number;          // 0-1
  dominantColors: string[];    // Ej: ["#FF5733", "#FFFFFF", "#000000"]
  objects: string[];           // Ej: ["juguete", "niÃ±o", "caja"]
  hasPersons: boolean;
  personCount: number;
  hasTextOverlay: boolean;
  textOverlayContent: string | null;  // Texto detectado en la imagen
  composition: string;         // "centered", "left-right", "full-bleed", "split"
  mood: string;                // "fun", "professional", "urgent", "aspirational"
  strengths: string[];         // Lo que funciona bien
  improvements: string[];      // Lo que se podrÃ­a mejorar
  fatigueRisk: "LOW" | "MEDIUM" | "HIGH";  // Riesgo de fatiga creativa
  fatigueReason: string | null;
  summary: string;             // Resumen en 1-2 oraciones
}

export interface VisionAnalysisResponse {
  ok: boolean;
  result?: VisionAnalysisResult;
  error?: string;
}

// Rate limiting
let lastAnalysisTime = 0;
const MIN_INTERVAL_MS = 2000; // 2 seconds between analyses

async function respectRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastAnalysisTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - elapsed));
  }
  lastAnalysisTime = Date.now();
}

/**
 * Analyze an ad creative image using Claude Vision
 */
export async function analyzeCreativeImage(
  imageUrl: string,
  context?: {
    adName?: string | null;
    campaignName?: string | null;
    platform?: string;
    headline?: string | null;
    ctaType?: string | null;
  }
): Promise<VisionAnalysisResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "ANTHROPIC_API_KEY not configured" };
  }

  // Validate URL
  if (!imageUrl || (!imageUrl.startsWith("http://") && !imageUrl.startsWith("https://"))) {
    return { ok: false, error: `Invalid image URL: ${imageUrl}` };
  }

  await respectRateLimit();

  const anthropic = new Anthropic({ apiKey });

  const contextLines = [
    context?.adName ? `Nombre del anuncio: "${context.adName}"` : null,
    context?.campaignName ? `CampaÃ±a: "${context.campaignName}"` : null,
    context?.platform ? `Plataforma: ${context.platform}` : null,
    context?.headline ? `Headline: "${context.headline}"` : null,
    context?.ctaType ? `CTA: ${context.ctaType}` : null,
  ].filter(Boolean).join("\n");

  const prompt = `Analiza esta imagen de un anuncio publicitario de ecommerce (jugueterÃ­a online en Argentina).

${contextLines ? `CONTEXTO DEL ANUNCIO:\n${contextLines}\n` : ""}
INSTRUCCIONES:
1. Clasifica el tipo de creativo entre estos tipos:
   - PRODUCT: Foto/video centrado en el producto (fondo blanco, product shot, packshot)
   - UGC: User Generated Content (persona real usando el producto, estilo casual/autentico)
   - LIFESTYLE: Imagen aspiracional (niÃ±os jugando, familia, momento feliz)
   - PROMO: Promocional con descuento/precio/oferta visible en la imagen
   - TESTIMONIAL: Review o testimonio de cliente
   - CAROUSEL: MÃºltiples productos (si se ve que es un slide de carrusel)
   - VIDEO: Captura/thumbnail de video
   - BRAND: Branding/awareness (logo prominente, sin producto especÃ­fico)
   - DYNAMIC: DPA/catalogo dinÃ¡mico (mÃºltiples productos con precio)
   - OTHER: No clasificable

2. Analiza composiciÃ³n, colores, y elementos visuales.
3. EvalÃºa fortalezas y Ã¡reas de mejora para performance en ads.
4. EvalÃºa riesgo de fatiga creativa (si el diseÃ±o es genÃ©rico o se siente "visto mil veces").

IMPORTANTE:
- SÃ© especÃ­fico con los colores (hex aproximado)
- Si hay texto en la imagen, transcribilo
- SÃ© honesto con las mejoras â feedback accionable
- Responde SOLO con JSON vÃ¡lido, sin markdown ni backticks

Formato JSON:
{
  "classification": "PRODUCT|UGC|LIFESTYLE|PROMO|TESTIMONIAL|CAROUSEL|VIDEO|BRAND|DYNAMIC|OTHER",
  "confidence": 0.85,
  "dominantColors": ["#hex1", "#hex2", "#hex3"],
  "objects": ["objeto1", "objeto2"],
  "hasPersons": false,
  "personCount": 0,
  "hasTextOverlay": true,
  "textOverlayContent": "texto visible en la imagen",
  "composition": "centered|left-right|full-bleed|split|grid",
  "mood": "fun|professional|urgent|aspirational|playful|warm",
  "strengths": ["fortaleza 1", "fortaleza 2"],
  "improvements": ["mejora 1", "mejora 2"],
  "fatigueRisk": "LOW|MEDIUM|HIGH",
  "fatigueReason": "razÃ³n si aplica o null",
  "summary": "Resumen de 1-2 oraciones sobre el creativo"
}`;

  try {
    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: "Sos un analista experto en creativos publicitarios de ecommerce LATAM, especializado en jugueterÃ­a y retail. AnalizÃ¡s imÃ¡genes de ads y das feedback accionable. Solo respondÃ©s con JSON vÃ¡lido.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "url",
                url: imageUrl,
              },
            },
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "{}";

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Try to extract JSON from response
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        return { ok: false, error: "Failed to parse Vision response as JSON" };
      }
    }

    const result: VisionAnalysisResult = {
      classification: parsed.classification || "OTHER",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      dominantColors: Array.isArray(parsed.dominantColors) ? parsed.dominantColors : [],
      objects: Array.isArray(parsed.objects) ? parsed.objects : [],
      hasPersons: !!parsed.hasPersons,
      personCount: parsed.personCount || 0,
      hasTextOverlay: !!parsed.hasTextOverlay,
      textOverlayContent: parsed.textOverlayContent || null,
      composition: parsed.composition || "unknown",
      mood: parsed.mood || "unknown",
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
      improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
      fatigueRisk: ["LOW", "MEDIUM", "HIGH"].includes(parsed.fatigueRisk) ? parsed.fatigueRisk : "MEDIUM",
      fatigueReason: parsed.fatigueReason || null,
      summary: parsed.summary || "",
    };

    return { ok: true, result };
  } catch (error: any) {
    const msg = error.message || "Unknown Vision error";

    // Handle common errors gracefully
    if (msg.includes("Could not process image") || msg.includes("invalid_image")) {
      return { ok: false, error: "Image URL expired or inaccessible" };
    }
    if (msg.includes("rate_limit") || msg.includes("429")) {
      return { ok: false, error: "Rate limited â retry later" };
    }
    if (msg.includes("timeout") || msg.includes("ETIMEDOUT")) {
      return { ok: false, error: "Image download timeout" };
    }

    console.error("[VisionAnalyzer] Error:", msg);
    return { ok: false, error: msg };
  }
}

/**
 * Analyze multiple creatives (with rate limiting between each)
 */
export async function analyzeCreativeBatch(
  creatives: Array<{
    id: string;
    imageUrl: string;
    adName?: string | null;
    campaignName?: string | null;
    platform?: string;
    headline?: string | null;
    ctaType?: string | null;
  }>,
  maxCount?: number
): Promise<Array<{ id: string; response: VisionAnalysisResponse }>> {
  const results: Array<{ id: string; response: VisionAnalysisResponse }> = [];
  const limit = maxCount || creatives.length;

  for (let i = 0; i < Math.min(creatives.length, limit); i++) {
    const creative = creatives[i];
    const response = await analyzeCreativeImage(creative.imageUrl, {
      adName: creative.adName,
      campaignName: creative.campaignName,
      platform: creative.platform,
      headline: creative.headline,
      ctaType: creative.ctaType,
    });
    results.push({ id: creative.id, response });
  }

  return results;
}
