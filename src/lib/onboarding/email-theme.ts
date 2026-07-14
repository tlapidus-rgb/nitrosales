// ══════════════════════════════════════════════════════════════
// email-theme.ts — primitivas de marca/layout de los emails
// ══════════════════════════════════════════════════════════════
// Extraídas de emails.ts (Fase 1.5 S4) para romper el ciclo
// emails ⇄ template-renderer: template-renderer solo necesita estas
// primitivas (colores + appUrl + baseLayout), no las funciones de
// template. Al vivir acá, ambos las importan sin depender uno del otro.
// emails.ts las re-exporta para compat (10 rutas las importan de ahí).
// ══════════════════════════════════════════════════════════════

// NitroSales brand colors
export const BRAND_BG = "#0A0A0F";
export const CARD_BG = "#141419";
export const BRAND_ORANGE = "#FF5E1A";
export const TEXT_PRIMARY = "#FFFFFF";
export const TEXT_SECONDARY = "#9CA3AF";
export const BORDER = "#1F1F2E";
export const ACCENT_GREEN = "#22C55E";
export const ACCENT_PURPLE = "#A855F7";
export const ACCENT_AMBER = "#F59E0B";

export function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    "https://app.nitrosales.ai"
  ).replace(/\/+$/, "");
}

export function baseLayout(title: string, preheader: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark light">
  <meta name="supported-color-schemes" content="dark light">
  <title>${title}</title>
  <style>
    /* Responsive: mobile = full width, sin bordes, hero escalado */
    @media only screen and (max-width: 620px) {
      .ns-card { width: 100% !important; max-width: 100% !important; border-radius: 0 !important; border-left: 0 !important; border-right: 0 !important; }
      .ns-outer { padding: 0 !important; }
      .ns-pad-h { padding-left: 22px !important; padding-right: 22px !important; }
      .ns-hero { font-size: 34px !important; line-height: 1.08 !important; }
      .ns-sub { font-size: 15px !important; }
    }
    /* Dark mode safety para clientes que fuerzan light */
    @media (prefers-color-scheme: light) {
      .ns-card { background: ${BRAND_BG} !important; }
    }
    body { margin: 0; padding: 0; background: ${BRAND_BG}; }
    a { text-decoration: none; }
  </style>
</head>
<body style="margin:0;padding:0;background:${BRAND_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND_BG};">
    <tr>
      <td align="center" class="ns-outer" style="padding:0;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" class="ns-card" style="width:100%;max-width:600px;background:${BRAND_BG};border-left:1px solid ${BORDER};border-right:1px solid ${BORDER};">
          <!-- Header -->
          <tr>
            <td class="ns-pad-h" style="padding:40px 48px 20px;">
              <div style="font-size:20px;font-weight:800;letter-spacing:-0.02em;color:${TEXT_PRIMARY};">
                NITRO<span style="color:${BRAND_ORANGE};">SALES</span>
              </div>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td class="ns-pad-h" style="padding:8px 48px 48px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="ns-pad-h" style="padding:28px 48px 48px;border-top:1px solid ${BORDER};">
              <p style="margin:0 0 6px;color:${TEXT_SECONDARY};font-size:12px;line-height:1.5;">
                NitroSales — Inteligencia comercial para ecommerce
              </p>
              <p style="margin:0;color:${TEXT_SECONDARY};font-size:11px;line-height:1.5;opacity:0.7;">
                Enviado por el equipo de NitroSales.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function button(label: string, href: string): string {
  return `
    <a href="${href}" style="display:inline-block;padding:14px 32px;background:${BRAND_ORANGE};color:#fff;text-decoration:none;border-radius:12px;font-size:14px;font-weight:600;letter-spacing:0.02em;">
      ${label}
    </a>`;
}
