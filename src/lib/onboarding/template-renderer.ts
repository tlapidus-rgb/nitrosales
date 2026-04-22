// ══════════════════════════════════════════════════════════════
// Renderer de email templates desde rows de DB
// ══════════════════════════════════════════════════════════════
// Convierte una row de email_templates + contexto (contactName,
// companyName, etc) en { subject, html } listo para sendEmail().
//
// Interpola {variables} tipo {contactName}, {companyName}, {listo}
// (destacado naranja en el hero).
// ══════════════════════════════════════════════════════════════

import {
  baseLayout,
  BRAND_BG,
  BRAND_ORANGE,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  BORDER,
  appUrl,
} from "./emails";

export type TemplateContext = {
  contactName?: string | null;
  companyName?: string | null;
  loginEmail?: string;
  temporaryPassword?: string;
  orgId?: string;
  statusToken?: string;
  extraPayload?: Record<string, any>;
};

export type TemplateRow = {
  id: string;
  templateKey: string;
  variant: string;
  label: string;
  subject: string;
  preheader: string;
  eyebrow: string | null;
  heroTop: string | null;
  heroAccent: string | null;
  subParagraphs: string[];
  ctaLabel: string | null;
  finePrint: string | null;
};

/** Interpola {key} → value en strings */
function interpolate(str: string | null, ctx: TemplateContext): string {
  if (!str) return "";
  const greeting = ctx.contactName ? `Hola ${ctx.contactName}` : "Hola";
  return str
    .replace(/\{contactName\}/g, ctx.contactName || "")
    .replace(/\{companyName\}/g, ctx.companyName || "")
    .replace(/\{greeting\}/g, greeting)
    .replace(/\{loginEmail\}/g, ctx.loginEmail || "")
    .replace(/\{temporaryPassword\}/g, ctx.temporaryPassword || "");
}

/** Renderiza subParagraphs: soporta <strong> inline para keywords */
function renderSub(paragraph: string, ctx: TemplateContext): string {
  const interp = interpolate(paragraph, ctx);
  // Auto-highlight: si la línea menciona estos keywords, los pone en blanco 600
  const keywords = ["inteligencia artificial", "píxel propio", ctx.companyName].filter(Boolean) as string[];
  let html = interp;
  for (const kw of keywords) {
    const safe = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    html = html.replace(
      new RegExp(`\\b${safe}\\b`, "gi"),
      (match) => `<strong style="color:${TEXT_PRIMARY};font-weight:600;">${match}</strong>`
    );
  }
  return html;
}

/**
 * Renderiza el hero. heroAccent puede contener {palabraEnNaranja} que se renderea
 * con color naranja. Ej: "está {listo}" → "está <span orange>listo</span>"
 */
function renderHero(heroTop: string | null, heroAccent: string | null, ctx: TemplateContext): string {
  const top = heroTop ? interpolate(heroTop, ctx) : "";
  const accent = heroAccent ? interpolate(heroAccent, ctx) : "";

  // heroAccent con {palabra} → esa palabra en naranja
  const accentHtml = accent.replace(/\{([^}]+)\}/g, (_m, word) =>
    `<span style="color:${BRAND_ORANGE};">${word}</span>`
  );

  if (!top && !accent) return "";
  return `
    <h1 class="ns-hero" style="margin:0 0 28px;font-size:42px;font-weight:800;color:${TEXT_PRIMARY};line-height:1.1;letter-spacing:-0.035em;">
      ${top}${top && accent ? "<br/>" : ""}${accentHtml}
    </h1>
  `;
}

export function renderTemplateFromRow(
  row: TemplateRow,
  ctx: TemplateContext
): { subject: string; html: string } {
  // Onboarding URL con query params para pre-llenar el form + personalizar hero
  const qs = new URLSearchParams();
  if (ctx.companyName) qs.set("company", ctx.companyName);
  if (ctx.contactName) qs.set("contact", ctx.contactName);
  const onboardingUrl = `${appUrl()}/onboarding${qs.toString() ? "?" + qs.toString() : ""}`;
  const statusUrl = ctx.statusToken ? `${appUrl()}/onboarding/status/${ctx.statusToken}` : onboardingUrl;
  const loginUrl = `${appUrl()}/login`;

  // CTA url depende del template
  const ctaUrl = (() => {
    if (row.templateKey === "lead_invite" || row.templateKey === "lead_followup") return onboardingUrl;
    if (row.templateKey === "onboarding_needs_info") return statusUrl;
    if (row.templateKey === "onboarding_activation") return loginUrl;
    return appUrl();
  })();

  const subject = interpolate(row.subject, ctx);
  const preheader = interpolate(row.preheader, ctx);

  const eyebrowHtml = row.eyebrow
    ? `<div style="font-size:11px;font-weight:700;color:${TEXT_SECONDARY};text-transform:uppercase;letter-spacing:0.22em;margin-bottom:36px;opacity:0.85;">
         ${interpolate(row.eyebrow, ctx)}
       </div>`
    : "";

  const heroHtml = renderHero(row.heroTop, row.heroAccent, ctx);

  const paragraphs = (row.subParagraphs || [])
    .map((p) =>
      `<p class="ns-sub" style="margin:0 0 18px;color:${TEXT_SECONDARY};font-size:16px;line-height:1.65;font-weight:400;max-width:480px;">${renderSub(p, ctx)}</p>`
    )
    .join("");

  const ctaHtml = row.ctaLabel
    ? `<a href="${ctaUrl}" style="display:inline-block;padding:15px 34px;background:${TEXT_PRIMARY};color:${BRAND_BG};text-decoration:none;border-radius:11px;font-size:15px;font-weight:700;letter-spacing:0.005em;margin-top:18px;box-shadow:0 1px 0 rgba(255,255,255,0.04) inset, 0 10px 28px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.3);">
         ${interpolate(row.ctaLabel, ctx)} →
       </a>`
    : "";

  const finePrintHtml = row.finePrint
    ? `<div style="height:1px;background:${BORDER};margin:48px 0 20px;max-width:480px;opacity:0.7;"></div>
       <p style="margin:0;color:${TEXT_SECONDARY};font-size:12px;line-height:1.65;opacity:0.65;max-width:480px;">
         ${renderSub(row.finePrint, ctx)}
       </p>`
    : "";

  const content = `
    <div style="padding:40px 0 24px;text-align:left;">
      ${eyebrowHtml}
      ${heroHtml}
      ${paragraphs}
      ${ctaHtml}
      ${finePrintHtml}
    </div>
  `;

  return { subject, html: baseLayout(subject, preheader, content) };
}

/**
 * Helper: busca el template ACTIVO para un templateKey en DB.
 * Si no hay en DB, devuelve null (el caller debe fallback a hardcoded).
 */
export async function findActiveTemplate(
  prisma: any,
  templateKey: string
): Promise<TemplateRow | null> {
  try {
    const rows: Array<any> = await prisma.$queryRawUnsafe(
      `SELECT * FROM "email_templates" WHERE "templateKey" = $1 AND "isActive" = true LIMIT 1`,
      templateKey
    );
    return (rows[0] as TemplateRow | undefined) || null;
  } catch (err) {
    // Tabla no existe aún (migración pendiente) — fallback silencioso
    return null;
  }
}
