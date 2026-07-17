// ══════════════════════════════════════════════════════════════
// campaignNameToSlug — slug canónico de nombre de campaña
// ══════════════════════════════════════════════════════════════
// CONTRATO CRÍTICO: este slug se usa en DOS puntas que DEBEN coincidir:
//   1. Generación del utm_campaign en los tracking links del creador
//      (influencers/[id]/tracking-link y influencers/[id]/campaigns)
//   2. Matching touchpoint ↔ campaña en el motor de atribución
//      (lib/pixel/influencer-attribution.ts — decide ventana y campaignId)
// Si las dos puntas divergen, la atribución por campaña deja de matchear
// EN SILENCIO (sin error). Por eso vive en un solo módulo.
// Review 2026-07: antes estaba copy-pasteado en los 3 archivos.
// ══════════════════════════════════════════════════════════════

export function campaignNameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 30);
}
