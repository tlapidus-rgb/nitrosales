// ══════════════════════════════════════════════════════════════════════════
// Glosario de orígenes — traduce los códigos crudos (an, paid_social, gclid…) a
// un NOMBRE entendible + una EXPLICACIÓN en criollo para el ícono de info (ⓘ).
// ══════════════════════════════════════════════════════════════════════════
// Pedido de Tomy (2026-08-19): el cliente no tiene por qué saber qué es "an" o
// "paid_social". Mostramos el crudo (honestidad) pero con nombre claro + tip que
// explica QUÉ es y DE DÓNDE viene. Módulo PURO (solo data) → lo puede importar el
// server (display names) y el cliente (tooltips) sin traer dependencias.
// ══════════════════════════════════════════════════════════════════════════

export interface GlossaryEntry {
  /** Nombre entendible para mostrar (reemplaza al código crudo). */
  label: string;
  /** Explicación en criollo para el tooltip del ícono de info. */
  tip: string;
}

/** Normaliza un código para buscarlo (minúscula + trim). */
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

// ── ORÍGENES (source) ────────────────────────────────────────────────────────
// Cada plataforma con sus variantes de código apuntando a la misma entrada.
export const SOURCE_GLOSSARY: Record<string, GlossaryEntry> = {
  // Meta y sus superficies/placements (códigos oficiales del macro de Meta)
  meta: { label: "Meta", tip: "La cuenta de publicidad de Meta (agrupa Facebook e Instagram)." },
  facebook: { label: "Facebook", tip: "Facebook." },
  fb: { label: "Facebook", tip: "Facebook (código que usa Meta para el feed de Facebook)." },
  instagram: { label: "Instagram", tip: "Instagram." },
  ig: { label: "Instagram", tip: "Instagram (código que usa Meta para Instagram)." },
  an: { label: "Audience Network", tip: "Red de apps y sitios de terceros donde Meta muestra anuncios (fuera de Facebook e Instagram)." },
  msg: { label: "Messenger", tip: "El chat de Facebook (Messenger), donde Meta también puede mostrar anuncios." },
  th: { label: "Threads", tip: "La app de Meta parecida a X (Twitter)." },
  meta_ads: { label: "Anuncios de Meta", tip: "Anuncios pagos en Facebook/Instagram." },
  "meta-ads": { label: "Anuncios de Meta", tip: "Anuncios pagos en Facebook/Instagram." },
  fb_ads: { label: "Anuncios de Meta", tip: "Anuncios pagos de Meta (etiqueta de Facebook)." },
  facebook_ads: { label: "Anuncios de Meta", tip: "Anuncios pagos de Meta." },
  // Google
  google: { label: "Google", tip: "Google. Puede ser pago (anuncio) u orgánico (búsqueda gratis) según cómo llegó." },
  adwords: { label: "Google Ads", tip: "Anuncios pagos en Google (nombre viejo: AdWords)." },
  google_ads: { label: "Google Ads", tip: "Anuncios pagos en Google." },
  gads: { label: "Google Ads", tip: "Anuncios pagos en Google." },
  pmax: { label: "Performance Max", tip: "Campaña automática de Google que se muestra en varios lugares (buscador, YouTube, Gmail, Display)." },
  performance_max: { label: "Performance Max", tip: "Campaña automática de Google en varios lugares a la vez." },
  gdn: { label: "Display de Google", tip: "Banners pagos en la red de sitios asociados a Google." },
  google_organic: { label: "Google (búsqueda)", tip: "Búsqueda orgánica (gratis) en Google — la persona te encontró buscando." },
  google_shopping: { label: "Google Shopping", tip: "Los anuncios de productos con foto y precio en Google." },
  // Otras plataformas
  tiktok: { label: "TikTok", tip: "TikTok. Pago u orgánico según cómo llegó." },
  bing: { label: "Bing (Microsoft)", tip: "El buscador de Microsoft (Bing)." },
  bing_organic: { label: "Bing (búsqueda)", tip: "Búsqueda orgánica (gratis) en Bing." },
  microsoft: { label: "Microsoft Ads", tip: "Anuncios pagos en Bing (Microsoft)." },
  youtube: { label: "YouTube", tip: "YouTube." },
  whatsapp: { label: "WhatsApp", tip: "WhatsApp." },
  linkedin: { label: "LinkedIn", tip: "LinkedIn." },
  twitter: { label: "X (Twitter)", tip: "X, antes Twitter." },
  pinterest: { label: "Pinterest", tip: "Pinterest." },
  // Email / SMS por vendor
  email: { label: "Email", tip: "Vino de un email." },
  klaviyo: { label: "Klaviyo", tip: "Klaviyo, una herramienta de emails y SMS." },
  mailchimp: { label: "Mailchimp", tip: "Mailchimp, una herramienta de emails." },
  // Pasarelas de pago que también mandan tráfico
  gocuotas: { label: "GoCuotas", tip: "Medio de pago en cuotas que también manda visitas a tu tienda." },
  mercadopago: { label: "Mercado Pago", tip: "Mercado Pago (además de cobrar, manda visitas)." },
  modo: { label: "MODO", tip: "MODO, la billetera de los bancos." },
  // Básicos
  direct: { label: "Directo", tip: "Entró escribiendo tu dirección o desde un favorito — sin campaña ni referencia." },
  referral: { label: "Referido", tip: "Vino de un enlace en otro sitio web." },
};

// ── MEDIUM (cómo llegó) ──────────────────────────────────────────────────────
export const MEDIUM_GLOSSARY: Record<string, GlossaryEntry> = {
  cpc: { label: "Pago (por clic)", tip: "Anuncio pago: se cobra por cada clic (CPC)." },
  ppc: { label: "Pago (por clic)", tip: "Anuncio pago por clic (PPC), igual que CPC." },
  paid: { label: "Pago", tip: "Tráfico pago — vino de un anuncio (por la etiqueta del link o por el click de un ad detectado)." },
  paid_social: { label: "Redes (pago)", tip: "Anuncio pago en redes sociales." },
  "social-paid": { label: "Redes (pago)", tip: "Anuncio pago en redes sociales (misma cosa que paid_social, escrito distinto)." },
  "paid-social": { label: "Redes (pago)", tip: "Anuncio pago en redes sociales." },
  paidsocial: { label: "Redes (pago)", tip: "Anuncio pago en redes sociales." },
  paidsearch: { label: "Buscador (pago)", tip: "Anuncio pago en un buscador." },
  display: { label: "Display (pago)", tip: "Banner pago en sitios web." },
  organic: { label: "Orgánico", tip: "Tráfico gratis — NO es un anuncio." },
  social: { label: "Redes", tip: "Vino de una red social (sin indicar si es pago o gratis)." },
  "organic-social": { label: "Redes (orgánico)", tip: "Publicación gratis en redes sociales." },
  referral: { label: "Referido", tip: "Vino de un enlace en otro sitio." },
  email: { label: "Email", tip: "Vino de un email." },
  video: { label: "Video", tip: "Contenido de video. No dice por sí solo si fue pago o gratis." },
  trafico: { label: "Tráfico", tip: "Etiqueta genérica de 'tráfico'. No dice por sí sola si fue pago o gratis." },
};

/** Nombre entendible de un código de source. Cae al `undefined` si no se conoce. */
export function sourceGlossaryLabel(code: string | null | undefined): string | undefined {
  return SOURCE_GLOSSARY[norm(code)]?.label;
}

/** Explicación (tooltip) de un código de source, o `undefined`. */
export function sourceGlossaryTip(code: string | null | undefined): string | undefined {
  return SOURCE_GLOSSARY[norm(code)]?.tip;
}

/** Explicación (tooltip) de un código de medium, o `undefined`. */
export function mediumGlossaryTip(code: string | null | undefined): string | undefined {
  return MEDIUM_GLOSSARY[norm(code)]?.tip;
}
