// ══════════════════════════════════════════════════════════════════════════
// Nombre legible de un origen crudo (para la "izquierda" del panel de canales)
// ══════════════════════════════════════════════════════════════════════════
// PIVOT v2 (Tomy, 2026-07-27): la clasificación source→canal la hace el USUARIO.
// Lo que SÍ hace la plataforma es mostrarle el origen entrante con un nombre
// LIMPIO y entendible, no un ID ni el string crudo en minúscula. Textual:
// "que identifique Icommarketing y te ponga el nombre Icommarketing… que el
// usuario vea algo simple". Después el usuario lo mapea a su canal.
//
// Es SÓLO presentación del nombre — NO clasifica (esa es decisión del usuario).
// Regla: separar por -, _, ., espacio; Capitalizar Cada Palabra; preservar las
// siglas conocidas en mayúscula (TV, IA…). No inventa: si no sabe separar
// (productosentv), capitaliza la primera letra y listo — el usuario lo renombra.
// ══════════════════════════════════════════════════════════════════════════

// Siglas/marcas que quedan en mayúscula (o su casing propio) si aparecen enteras.
const KNOWN_CASING: Record<string, string> = {
  tv: "TV",
  ia: "IA",
  nps: "NPS",
  crm: "CRM",
  sms: "SMS",
  qr: "QR",
  cace: "CACE",
  whatsapp: "WhatsApp",
  gocuotas: "GoCuotas",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  chatgpt: "ChatGPT",
};

function capWord(w: string): string {
  const low = w.toLowerCase();
  if (KNOWN_CASING[low]) return KNOWN_CASING[low];
  if (!w) return w;
  return low.charAt(0).toUpperCase() + low.slice(1);
}

/**
 * Origen crudo → nombre legible para el panel. Puro y determinista.
 *   'icommarketing'   → 'Icommarketing'
 *   'facebook-chat'   → 'Facebook Chat'
 *   'wa_mkt'          → 'Wa Mkt'
 *   'meta-story'      → 'Meta Story'
 *   'chatgpt.com'     → 'ChatGPT.com'  (dominio: se preserva el TLD)
 *   '' | null         → 'Sin origen'
 */
export function sourceDisplayName(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "Sin origen";

  // Dominios (chatgpt.com, copilot.com): capitalizar el nombre, dejar el TLD.
  const domainMatch = s.match(/^([a-z0-9-]+)\.([a-z]{2,})$/i);
  if (domainMatch) {
    return `${capWord(domainMatch[1])}.${domainMatch[2].toLowerCase()}`;
  }

  const words = s.split(/[-_.\s]+/).filter(Boolean);
  if (words.length === 0) return "Sin origen";
  return words.map(capWord).join(" ");
}
