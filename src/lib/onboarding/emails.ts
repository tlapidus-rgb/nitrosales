// ══════════════════════════════════════════════════════════════
// Emails del flujo de Async Onboarding
// ══════════════════════════════════════════════════════════════
// 3 templates:
//   1. confirmation     → al submit del formulario
//   2. activationReady  → cuando Tomy activa la cuenta
//   3. needsInfo        → si falta algo (manual trigger)
// ══════════════════════════════════════════════════════════════

// NitroSales brand colors
const BRAND_BG = "#0A0A0F";
const CARD_BG = "#141419";
const BRAND_ORANGE = "#FF5E1A";
const TEXT_PRIMARY = "#FFFFFF";
const TEXT_SECONDARY = "#9CA3AF";
const BORDER = "#1F1F2E";
const ACCENT_GREEN = "#22C55E";

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    "https://nitrosales.vercel.app"
  ).replace(/\/+$/, "");
}

function baseLayout(title: string, preheader: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND_BG};padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:${CARD_BG};border-radius:20px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.4);">
          <!-- Header -->
          <tr>
            <td style="padding:36px 40px 24px;border-bottom:1px solid ${BORDER};">
              <div style="font-size:22px;font-weight:700;letter-spacing:-0.5px;color:${TEXT_PRIMARY};">
                NITRO<span style="color:${BRAND_ORANGE};">SALES</span>
              </div>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:36px 40px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px 32px;border-top:1px solid ${BORDER};background:${BRAND_BG};">
              <p style="margin:0 0 6px;color:${TEXT_SECONDARY};font-size:12px;line-height:1.5;">
                NitroSales — Inteligencia comercial para ecommerce
              </p>
              <p style="margin:0;color:${TEXT_SECONDARY};font-size:11px;line-height:1.5;opacity:0.7;">
                Este email fue enviado por el equipo de onboarding de NitroSales.
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

function button(label: string, href: string): string {
  return `
    <a href="${href}" style="display:inline-block;padding:14px 32px;background:${BRAND_ORANGE};color:#fff;text-decoration:none;border-radius:12px;font-size:14px;font-weight:600;letter-spacing:0.02em;">
      ${label}
    </a>`;
}

// ──────────────────────────────────────────────────────────────
// 1. Confirmation — al submit del formulario
// ──────────────────────────────────────────────────────────────

export function onboardingConfirmationEmail(opts: {
  contactName: string;
  companyName: string;
  statusToken: string;
}) {
  const { contactName, companyName, statusToken } = opts;
  const statusUrl = `${appUrl()}/onboarding/status/${statusToken}`;
  const subject = `Recibimos tu solicitud de activación — ${companyName}`;
  const preheader = `Estamos preparando la cuenta de ${companyName}. Te avisaremos en 48-72 hs hábiles.`;

  const content = `
    <div style="font-size:11px;font-weight:700;color:${ACCENT_GREEN};text-transform:uppercase;letter-spacing:0.12em;margin-bottom:12px;">
      ✓ SOLICITUD RECIBIDA
    </div>
    <h1 style="margin:0 0 16px;font-size:26px;font-weight:700;color:${TEXT_PRIMARY};line-height:1.3;letter-spacing:-0.02em;">
      Bienvenido a NitroSales, ${contactName}
    </h1>
    <p style="margin:0 0 20px;color:${TEXT_SECONDARY};font-size:15px;line-height:1.7;">
      Recibimos la solicitud de activación de <strong style="color:${TEXT_PRIMARY};">${companyName}</strong>. Nuestro equipo de implementación ya empezó a preparar tu cuenta.
    </p>

    <div style="background:rgba(255,94,26,0.06);border:1px solid rgba(255,94,26,0.2);border-radius:14px;padding:20px;margin:24px 0;">
      <div style="font-size:11px;font-weight:600;color:${BRAND_ORANGE};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">
        Próximos pasos
      </div>
      <ul style="margin:0;padding:0 0 0 18px;color:${TEXT_PRIMARY};font-size:14px;line-height:1.9;">
        <li>Validamos los datos de tu empresa y las credenciales de tus plataformas.</li>
        <li>Configuramos las integraciones (VTEX, MercadoLibre, Ads si aplica).</li>
        <li>Activamos los webhooks en tiempo real para que empiece a fluir la data.</li>
        <li>Te enviamos el email de acceso con tus credenciales temporales.</li>
      </ul>
    </div>

    <div style="background:${BRAND_BG};border:1px solid ${BORDER};border-radius:14px;padding:18px 20px;margin:24px 0;">
      <div style="font-size:11px;font-weight:600;color:${TEXT_SECONDARY};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">
        Tiempo estimado
      </div>
      <div style="font-size:18px;font-weight:700;color:${TEXT_PRIMARY};">
        48 a 72 horas hábiles
      </div>
    </div>

    <p style="margin:24px 0 20px;color:${TEXT_SECONDARY};font-size:14px;line-height:1.6;">
      Mientras tanto, podés seguir el progreso de tu activación acá:
    </p>
    ${button("Ver estado de mi activación →", statusUrl)}

    <p style="margin:32px 0 0;color:${TEXT_SECONDARY};font-size:12px;line-height:1.6;opacity:0.8;">
      Si tenés alguna pregunta, respondé a este email y el equipo te contactará.
    </p>
  `;

  return { subject, html: baseLayout(subject, preheader, content) };
}

// ──────────────────────────────────────────────────────────────
// 2. Activation Ready — cuenta lista, credenciales
// ──────────────────────────────────────────────────────────────

export function onboardingActivationEmail(opts: {
  contactName: string;
  companyName: string;
  loginEmail: string;
  temporaryPassword: string;
  orgId: string;
}) {
  const { contactName, companyName, loginEmail, temporaryPassword, orgId } = opts;
  const loginUrl = `${appUrl()}/login`;
  const pixelSnippet = `<script src="${appUrl()}/api/pixel/script?org=${orgId}" async></script>`;
  const subject = `Tu cuenta de NitroSales está lista — ${companyName}`;
  const preheader = `${companyName} ya está activo en NitroSales. Entrá con tus credenciales temporales.`;

  const content = `
    <div style="font-size:11px;font-weight:700;color:${ACCENT_GREEN};text-transform:uppercase;letter-spacing:0.12em;margin-bottom:12px;">
      ✓ TU CUENTA ESTÁ LISTA
    </div>
    <h1 style="margin:0 0 16px;font-size:28px;font-weight:700;color:${TEXT_PRIMARY};line-height:1.25;letter-spacing:-0.02em;">
      Bienvenido a bordo, ${contactName}
    </h1>
    <p style="margin:0 0 24px;color:${TEXT_SECONDARY};font-size:15px;line-height:1.7;">
      <strong style="color:${TEXT_PRIMARY};">${companyName}</strong> ya está activo en NitroSales. Completamos la configuración de todas tus integraciones y tu data empezó a sincronizar.
    </p>

    <div style="background:${BRAND_BG};border:1px solid ${BORDER};border-radius:14px;padding:22px;margin:28px 0;">
      <div style="font-size:11px;font-weight:600;color:${BRAND_ORANGE};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:14px;">
        🔐 Tus credenciales de acceso
      </div>
      <div style="margin-bottom:14px;">
        <div style="font-size:11px;color:${TEXT_SECONDARY};margin-bottom:4px;">Email</div>
        <div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:14px;color:${TEXT_PRIMARY};padding:10px 14px;background:${CARD_BG};border-radius:8px;border:1px solid ${BORDER};">
          ${loginEmail}
        </div>
      </div>
      <div>
        <div style="font-size:11px;color:${TEXT_SECONDARY};margin-bottom:4px;">Contraseña temporal</div>
        <div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:14px;color:${TEXT_PRIMARY};padding:10px 14px;background:${CARD_BG};border-radius:8px;border:1px solid ${BORDER};letter-spacing:0.08em;">
          ${temporaryPassword}
        </div>
      </div>
      <p style="margin:12px 0 0;font-size:12px;color:${TEXT_SECONDARY};line-height:1.5;">
        Por seguridad, te recomendamos cambiarla al primer ingreso en <strong style="color:${TEXT_PRIMARY};">Configuración → Seguridad</strong>.
      </p>
    </div>

    ${button("Entrar a NitroSales →", loginUrl)}

    <div style="margin:36px 0 0;padding-top:24px;border-top:1px solid ${BORDER};">
      <div style="font-size:11px;font-weight:600;color:${TEXT_SECONDARY};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:12px;">
        Qué pasó durante la activación
      </div>
      <ul style="margin:0;padding:0 0 0 18px;color:${TEXT_SECONDARY};font-size:13px;line-height:1.9;">
        <li>Creamos tu organización y tu usuario OWNER</li>
        <li>Conectamos tus plataformas (VTEX, MercadoLibre y Ads)</li>
        <li>Configuramos los webhooks en tiempo real</li>
        <li>Iniciamos la primera sincronización de órdenes y productos</li>
      </ul>
    </div>

    <p style="margin:28px 0 0;color:${TEXT_SECONDARY};font-size:12px;line-height:1.6;opacity:0.8;">
      La sincronización inicial puede tardar hasta 30 minutos mientras se procesan tus primeras órdenes. Una vez completada, recibirás tu primer reporte de salud de negocio automáticamente.
    </p>

    <!-- ── NitroPixel: último paso para completar la activación ── -->
    <div style="margin-top:40px;padding:26px;background:${BRAND_BG};border:1px solid ${BORDER};border-radius:16px;">
      <div style="font-size:11px;font-weight:700;color:${BRAND_ORANGE};text-transform:uppercase;letter-spacing:0.12em;margin-bottom:10px;">
        ⚡ ÚLTIMO PASO — NITROPIXEL
      </div>
      <h2 style="margin:0 0 10px;font-size:18px;font-weight:700;color:${TEXT_PRIMARY};line-height:1.3;letter-spacing:-0.01em;">
        Instalá el NitroPixel en tu tienda
      </h2>
      <p style="margin:0 0 20px;color:${TEXT_SECONDARY};font-size:14px;line-height:1.7;">
        El NitroPixel es <strong style="color:${TEXT_PRIMARY};">nuestro tracking propio</strong> — atribuye cada venta a la campaña correcta sin depender de Meta ni Google. Pegá este snippet en tu tienda para empezar a capturar data de tus visitantes.
      </p>

      <div style="font-size:11px;color:${TEXT_SECONDARY};margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">
        Tu snippet personalizado
      </div>
      <div style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:10px;padding:14px 16px;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:12px;color:${TEXT_PRIMARY};word-break:break-all;line-height:1.6;margin-bottom:22px;">
        ${pixelSnippet.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
      </div>

      <div style="font-size:11px;color:${TEXT_SECONDARY};margin-bottom:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">
        Dónde pegarlo (según tu tienda)
      </div>
      <div style="background:rgba(255,94,26,0.05);border:1px solid rgba(255,94,26,0.2);border-radius:10px;padding:16px 18px;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:600;color:${TEXT_PRIMARY};margin-bottom:6px;">📦 Tienda VTEX</div>
        <ol style="margin:0;padding-left:20px;font-size:13px;color:${TEXT_SECONDARY};line-height:1.7;">
          <li>VTEX Admin → Storefront → CMS → Templates</li>
          <li>Abrí tu template principal (ej: "default")</li>
          <li>Pegalo antes del <code style="background:${CARD_BG};padding:1px 6px;border-radius:4px;color:${TEXT_PRIMARY};">&lt;/head&gt;</code></li>
          <li>Guardá y publicá</li>
        </ol>
      </div>
      <div style="background:rgba(255,94,26,0.05);border:1px solid rgba(255,94,26,0.2);border-radius:10px;padding:16px 18px;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:600;color:${TEXT_PRIMARY};margin-bottom:6px;">📦 Google Tag Manager</div>
        <ol style="margin:0;padding-left:20px;font-size:13px;color:${TEXT_SECONDARY};line-height:1.7;">
          <li>Entrá a tu container de GTM</li>
          <li>Crear tag nuevo → Tipo: Custom HTML</li>
          <li>Pegá el snippet completo en el HTML</li>
          <li>Trigger: All Pages</li>
          <li>Guardá y publicá el container</li>
        </ol>
      </div>
      <div style="background:rgba(255,94,26,0.05);border:1px solid rgba(255,94,26,0.2);border-radius:10px;padding:16px 18px;margin-bottom:18px;">
        <div style="font-size:13px;font-weight:600;color:${TEXT_PRIMARY};margin-bottom:6px;">📦 Tienda custom / otros CMS</div>
        <p style="margin:0;font-size:13px;color:${TEXT_SECONDARY};line-height:1.7;">
          Pegá el snippet antes del cierre de <code style="background:${CARD_BG};padding:1px 6px;border-radius:4px;color:${TEXT_PRIMARY};">&lt;/head&gt;</code> en tu layout principal. Si tu plataforma tiene un panel de "Scripts personalizados" o "Head code", pegalo ahí.
        </p>
      </div>

      <p style="margin:0;font-size:12px;color:${TEXT_SECONDARY};line-height:1.6;">
        Una vez instalado, vas a ver los primeros eventos en tu panel en <strong style="color:${TEXT_PRIMARY};">Configuración → NitroPixel</strong> en menos de 5 minutos.
      </p>

      <p style="margin:14px 0 0;font-size:12px;color:${TEXT_SECONDARY};line-height:1.6;opacity:0.85;">
        <strong style="color:${TEXT_PRIMARY};">¿Necesitás ayuda para instalarlo?</strong> Respondé este email y nuestro equipo te ayuda a configurarlo.
      </p>
    </div>
  `;

  return { subject, html: baseLayout(subject, preheader, content) };
}

// ──────────────────────────────────────────────────────────────
// 3. Needs Info — falta algo en la solicitud
// ──────────────────────────────────────────────────────────────

export function onboardingNeedsInfoEmail(opts: {
  contactName: string;
  companyName: string;
  statusToken: string;
  missingFields: string[];
  customMessage?: string;
}) {
  const { contactName, companyName, statusToken, missingFields, customMessage } = opts;
  const statusUrl = `${appUrl()}/onboarding/status/${statusToken}`;
  const subject = `Necesitamos un dato más para activar ${companyName}`;
  const preheader = `Para completar la activación de ${companyName} nos falta confirmar algunos datos.`;

  const missingList = missingFields
    .map(
      (field) =>
        `<li style="margin-bottom:6px;">${field}</li>`
    )
    .join("");

  const content = `
    <div style="font-size:11px;font-weight:700;color:#F59E0B;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:12px;">
      ⏸ PAUSADO — NECESITAMOS MÁS INFO
    </div>
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:${TEXT_PRIMARY};line-height:1.3;letter-spacing:-0.02em;">
      Hola ${contactName}, nos falta un dato
    </h1>
    <p style="margin:0 0 20px;color:${TEXT_SECONDARY};font-size:15px;line-height:1.7;">
      Para completar la activación de <strong style="color:${TEXT_PRIMARY};">${companyName}</strong>, nuestro equipo necesita confirmar lo siguiente:
    </p>

    ${customMessage ? `
    <div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.25);border-radius:12px;padding:16px 18px;margin:20px 0;color:${TEXT_PRIMARY};font-size:14px;line-height:1.6;">
      ${customMessage}
    </div>
    ` : ""}

    ${missingList ? `
    <div style="background:${BRAND_BG};border:1px solid ${BORDER};border-radius:12px;padding:18px 22px;margin:20px 0;">
      <div style="font-size:11px;font-weight:600;color:${TEXT_SECONDARY};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">
        Campos pendientes
      </div>
      <ul style="margin:0;padding:0 0 0 18px;color:${TEXT_PRIMARY};font-size:14px;line-height:1.8;">
        ${missingList}
      </ul>
    </div>
    ` : ""}

    <p style="margin:24px 0 20px;color:${TEXT_SECONDARY};font-size:14px;line-height:1.6;">
      Respondé a este email con los datos faltantes, o actualizá tu solicitud desde acá:
    </p>
    ${button("Actualizar mi solicitud →", statusUrl)}
  `;

  return { subject, html: baseLayout(subject, preheader, content) };
}
