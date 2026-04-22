// ══════════════════════════════════════════════════════════════
// Emails del flujo de pipeline + Async Onboarding
// ══════════════════════════════════════════════════════════════
// Principios (sesión 55):
//   - Tercera persona ("el equipo de NitroSales")
//   - Sin firma personal con nombre propio
//   - Sin promesas de tiempo concretas
//   - Solo decir lo que es VERDAD en cada etapa
//   - Cierre con next step claro para el cliente
//   - Todos usan baseLayout premium oscuro (consistencia brand)
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
    "https://nitrosales.vercel.app"
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

function greeting(name: string | null | undefined): string {
  const n = (name || "").trim();
  return n ? `Hola ${n}` : "Hola";
}

// ──────────────────────────────────────────────────────────────
// 1. Invite — email inicial al lead con link al form /onboarding
// ──────────────────────────────────────────────────────────────

export function leadInviteEmail(opts: {
  contactName: string | null;
  companyName: string;
}) {
  const { contactName, companyName } = opts;
  const onboardingUrl = `${appUrl()}/onboarding`;
  const subject = `Tu acceso a NitroSales`;
  const preheader = `El equipo de NitroSales te habilita el acceso para sumar a ${companyName}.`;

  const content = `
    <div style="font-size:11px;font-weight:700;color:${BRAND_ORANGE};text-transform:uppercase;letter-spacing:0.12em;margin-bottom:12px;">
      ACCESO HABILITADO
    </div>
    <h1 style="margin:0 0 16px;font-size:26px;font-weight:700;color:${TEXT_PRIMARY};line-height:1.3;letter-spacing:-0.02em;">
      ${greeting(contactName)}
    </h1>
    <p style="margin:0 0 20px;color:${TEXT_SECONDARY};font-size:15px;line-height:1.7;">
      El equipo de NitroSales te habilita el acceso para sumar a <strong style="color:${TEXT_PRIMARY};">${companyName}</strong> a la plataforma.
    </p>
    <p style="margin:0 0 24px;color:${TEXT_SECONDARY};font-size:15px;line-height:1.7;">
      El primer paso es completar un formulario corto con los datos del negocio. Una vez recibido, el equipo revisa la postulación y habilita el acceso al producto.
    </p>

    <div style="margin:28px 0;">
      ${button("Empezar onboarding →", onboardingUrl)}
    </div>

    <p style="margin:32px 0 0;color:${TEXT_SECONDARY};font-size:12px;line-height:1.6;opacity:0.8;">
      Si tenés alguna duda, respondé este email y el equipo te contesta.
    </p>
  `;

  return { subject, html: baseLayout(subject, preheader, content) };
}

// ──────────────────────────────────────────────────────────────
// 1b. Invite Followup — recordatorio para leads que no respondieron
// ──────────────────────────────────────────────────────────────

export function leadFollowupEmail(opts: {
  contactName: string | null;
  companyName: string;
}) {
  const { contactName, companyName } = opts;
  const onboardingUrl = `${appUrl()}/onboarding`;
  const subject = `Recordatorio de tu acceso a NitroSales`;
  const preheader = `El acceso para sumar a ${companyName} sigue disponible.`;

  const content = `
    <div style="font-size:11px;font-weight:700;color:${ACCENT_PURPLE};text-transform:uppercase;letter-spacing:0.12em;margin-bottom:12px;">
      RECORDATORIO
    </div>
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:${TEXT_PRIMARY};line-height:1.3;letter-spacing:-0.02em;">
      ${greeting(contactName)}
    </h1>
    <p style="margin:0 0 20px;color:${TEXT_SECONDARY};font-size:15px;line-height:1.7;">
      El acceso para sumar a <strong style="color:${TEXT_PRIMARY};">${companyName}</strong> a NitroSales sigue disponible. Te dejamos nuevamente el link por si se perdió en el mail anterior.
    </p>

    <div style="margin:28px 0;">
      ${button("Empezar onboarding →", onboardingUrl)}
    </div>

    <p style="margin:32px 0 0;color:${TEXT_SECONDARY};font-size:12px;line-height:1.6;opacity:0.8;">
      Si hay algo que no quedó claro o preferís charlar antes, respondé este email.
    </p>
  `;

  return { subject, html: baseLayout(subject, preheader, content) };
}

// ──────────────────────────────────────────────────────────────
// 2. Confirmation — postulación recibida
// ──────────────────────────────────────────────────────────────

export function onboardingConfirmationEmail(opts: {
  contactName: string;
  companyName: string;
  statusToken: string;
}) {
  const { contactName, companyName } = opts;
  const subject = `Postulación recibida — ${companyName}`;
  const preheader = `La postulación de ${companyName} fue recibida y está en revisión.`;

  const content = `
    <div style="font-size:11px;font-weight:700;color:${ACCENT_GREEN};text-transform:uppercase;letter-spacing:0.12em;margin-bottom:12px;">
      ✓ POSTULACIÓN RECIBIDA
    </div>
    <h1 style="margin:0 0 16px;font-size:26px;font-weight:700;color:${TEXT_PRIMARY};line-height:1.3;letter-spacing:-0.02em;">
      ${greeting(contactName)}
    </h1>
    <p style="margin:0 0 20px;color:${TEXT_SECONDARY};font-size:15px;line-height:1.7;">
      La postulación de <strong style="color:${TEXT_PRIMARY};">${companyName}</strong> fue recibida. El equipo de NitroSales la está revisando.
    </p>

    <div style="background:rgba(255,94,26,0.06);border:1px solid rgba(255,94,26,0.2);border-radius:14px;padding:20px;margin:24px 0;">
      <div style="font-size:11px;font-weight:600;color:${BRAND_ORANGE};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">
        Qué pasa ahora
      </div>
      <ul style="margin:0;padding:0 0 0 18px;color:${TEXT_PRIMARY};font-size:14px;line-height:1.9;">
        <li>El equipo revisa los datos del negocio.</li>
        <li>Llega un email con las credenciales de acceso al producto.</li>
        <li>Adentro de NitroSales se conectan las plataformas y arranca la sincronización.</li>
      </ul>
    </div>

    <p style="margin:32px 0 0;color:${TEXT_SECONDARY};font-size:12px;line-height:1.6;opacity:0.8;">
      Si surge alguna pregunta, respondé este email y el equipo te contesta.
    </p>
  `;

  return { subject, html: baseLayout(subject, preheader, content) };
}

// ──────────────────────────────────────────────────────────────
// 3. Activation Ready — cuenta lista, credenciales
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
  const subject = `Acceso habilitado — ${companyName}`;
  const preheader = `${companyName} ya tiene cuenta en NitroSales. Entrá con las credenciales para conectar las plataformas.`;

  const content = `
    <div style="font-size:11px;font-weight:700;color:${ACCENT_GREEN};text-transform:uppercase;letter-spacing:0.12em;margin-bottom:12px;">
      ✓ ACCESO HABILITADO
    </div>
    <h1 style="margin:0 0 16px;font-size:28px;font-weight:700;color:${TEXT_PRIMARY};line-height:1.25;letter-spacing:-0.02em;">
      ${greeting(contactName)}
    </h1>
    <p style="margin:0 0 24px;color:${TEXT_SECONDARY};font-size:15px;line-height:1.7;">
      El acceso de <strong style="color:${TEXT_PRIMARY};">${companyName}</strong> a NitroSales ya está habilitado. Adentro del producto se conectan las plataformas (VTEX, MercadoLibre, Meta Ads, Google Ads) y se define el rango de data histórica a sincronizar.
    </p>

    <div style="background:${BRAND_BG};border:1px solid ${BORDER};border-radius:14px;padding:22px;margin:28px 0;">
      <div style="font-size:11px;font-weight:600;color:${BRAND_ORANGE};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:14px;">
        🔐 Credenciales de acceso
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
        Por seguridad, cambiala al primer ingreso desde <strong style="color:${TEXT_PRIMARY};">Configuración → Seguridad</strong>.
      </p>
    </div>

    ${button("Entrar a NitroSales →", loginUrl)}

    <div style="margin:36px 0 0;padding-top:24px;border-top:1px solid ${BORDER};">
      <div style="font-size:11px;font-weight:600;color:${TEXT_SECONDARY};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:12px;">
        Próximos pasos dentro del producto
      </div>
      <ul style="margin:0;padding:0 0 0 18px;color:${TEXT_SECONDARY};font-size:13px;line-height:1.9;">
        <li>Conectar VTEX y/o MercadoLibre con las credenciales del negocio.</li>
        <li>Autorizar Meta Ads y Google Ads vía OAuth (opcional).</li>
        <li>Definir el rango de data histórica a sincronizar.</li>
        <li>Al confirmar, arranca el backfill y llega un email cuando termina.</li>
      </ul>
    </div>

    <!-- ── NitroPixel ── -->
    <div style="margin-top:40px;padding:26px;background:${BRAND_BG};border:1px solid ${BORDER};border-radius:16px;">
      <div style="font-size:11px;font-weight:700;color:${BRAND_ORANGE};text-transform:uppercase;letter-spacing:0.12em;margin-bottom:10px;">
        ⚡ NITROPIXEL
      </div>
      <h2 style="margin:0 0 10px;font-size:18px;font-weight:700;color:${TEXT_PRIMARY};line-height:1.3;letter-spacing:-0.01em;">
        Instalá el NitroPixel en la tienda
      </h2>
      <p style="margin:0 0 20px;color:${TEXT_SECONDARY};font-size:14px;line-height:1.7;">
        El NitroPixel es <strong style="color:${TEXT_PRIMARY};">el tracking propio de NitroSales</strong> — atribuye cada venta a la campaña correcta sin depender de Meta ni Google. Pegá este snippet en la tienda para empezar a capturar data de visitantes.
      </p>

      <div style="font-size:11px;color:${TEXT_SECONDARY};margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">
        Snippet personalizado
      </div>
      <div style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:10px;padding:14px 16px;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:12px;color:${TEXT_PRIMARY};word-break:break-all;line-height:1.6;margin-bottom:22px;">
        ${pixelSnippet.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
      </div>

      <div style="font-size:11px;color:${TEXT_SECONDARY};margin-bottom:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">
        Dónde pegarlo
      </div>
      <div style="background:rgba(255,94,26,0.05);border:1px solid rgba(255,94,26,0.2);border-radius:10px;padding:16px 18px;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:600;color:${TEXT_PRIMARY};margin-bottom:6px;">📦 Tienda VTEX</div>
        <ol style="margin:0;padding-left:20px;font-size:13px;color:${TEXT_SECONDARY};line-height:1.7;">
          <li>VTEX Admin → Storefront → CMS → Templates</li>
          <li>Abrir el template principal (ej: "default")</li>
          <li>Pegar antes del <code style="background:${CARD_BG};padding:1px 6px;border-radius:4px;color:${TEXT_PRIMARY};">&lt;/head&gt;</code></li>
          <li>Guardar y publicar</li>
        </ol>
      </div>
      <div style="background:rgba(255,94,26,0.05);border:1px solid rgba(255,94,26,0.2);border-radius:10px;padding:16px 18px;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:600;color:${TEXT_PRIMARY};margin-bottom:6px;">📦 Google Tag Manager</div>
        <ol style="margin:0;padding-left:20px;font-size:13px;color:${TEXT_SECONDARY};line-height:1.7;">
          <li>Entrar al container de GTM</li>
          <li>Crear tag nuevo → Tipo: Custom HTML</li>
          <li>Pegar el snippet completo</li>
          <li>Trigger: All Pages</li>
          <li>Guardar y publicar</li>
        </ol>
      </div>
      <div style="background:rgba(255,94,26,0.05);border:1px solid rgba(255,94,26,0.2);border-radius:10px;padding:16px 18px;margin-bottom:18px;">
        <div style="font-size:13px;font-weight:600;color:${TEXT_PRIMARY};margin-bottom:6px;">📦 Tienda custom / otros CMS</div>
        <p style="margin:0;font-size:13px;color:${TEXT_SECONDARY};line-height:1.7;">
          Pegar el snippet antes del cierre de <code style="background:${CARD_BG};padding:1px 6px;border-radius:4px;color:${TEXT_PRIMARY};">&lt;/head&gt;</code> en el layout principal, o en el panel de "Scripts personalizados" / "Head code" si existe.
        </p>
      </div>

      <p style="margin:0;font-size:12px;color:${TEXT_SECONDARY};line-height:1.6;">
        Una vez instalado, los primeros eventos aparecen en <strong style="color:${TEXT_PRIMARY};">Configuración → NitroPixel</strong>.
      </p>

      <p style="margin:14px 0 0;font-size:12px;color:${TEXT_SECONDARY};line-height:1.6;opacity:0.85;">
        <strong style="color:${TEXT_PRIMARY};">¿Hace falta ayuda?</strong> Respondé este email y el equipo asiste con la instalación.
      </p>
    </div>
  `;

  return { subject, html: baseLayout(subject, preheader, content) };
}

// ──────────────────────────────────────────────────────────────
// 4. Backfill Started — arrancó el backfill
// ──────────────────────────────────────────────────────────────

export function backfillStartedEmail(opts: {
  contactName: string | null;
  companyName: string;
}) {
  const { contactName, companyName } = opts;
  const url = appUrl();
  const subject = `Sincronización iniciada — ${companyName}`;
  const preheader = `La sincronización de la data histórica de ${companyName} arrancó.`;

  const content = `
    <div style="font-size:11px;font-weight:700;color:${BRAND_ORANGE};text-transform:uppercase;letter-spacing:0.12em;margin-bottom:12px;">
      SINCRONIZACIÓN INICIADA
    </div>
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:${TEXT_PRIMARY};line-height:1.3;letter-spacing:-0.02em;">
      ${greeting(contactName)}
    </h1>
    <p style="margin:0 0 20px;color:${TEXT_SECONDARY};font-size:15px;line-height:1.7;">
      La sincronización de la data histórica de <strong style="color:${TEXT_PRIMARY};">${companyName}</strong> ya arrancó. Llega un email cuando termine.
    </p>
    <p style="margin:0 0 24px;color:${TEXT_SECONDARY};font-size:14px;line-height:1.7;">
      Mientras tanto se puede entrar al producto — el progreso se ve en vivo y la plataforma se desbloquea automáticamente al completarse.
    </p>

    <div style="margin:28px 0;">
      ${button("Abrir NitroSales →", url)}
    </div>
  `;

  return { subject, html: baseLayout(subject, preheader, content) };
}

// ──────────────────────────────────────────────────────────────
// 5. Data Ready — backfill completado
// ──────────────────────────────────────────────────────────────

export function dataReadyEmail(opts: {
  contactName: string | null;
  companyName: string;
}) {
  const { contactName, companyName } = opts;
  const url = appUrl();
  const subject = `Data lista — ${companyName}`;
  const preheader = `La sincronización de ${companyName} terminó. La plataforma está completamente desbloqueada.`;

  const content = `
    <div style="font-size:11px;font-weight:700;color:${ACCENT_GREEN};text-transform:uppercase;letter-spacing:0.12em;margin-bottom:12px;">
      ✓ DATA LISTA
    </div>
    <h1 style="margin:0 0 16px;font-size:26px;font-weight:700;color:${TEXT_PRIMARY};line-height:1.3;letter-spacing:-0.02em;">
      ${greeting(contactName)}
    </h1>
    <p style="margin:0 0 20px;color:${TEXT_SECONDARY};font-size:15px;line-height:1.7;">
      La sincronización de <strong style="color:${TEXT_PRIMARY};">${companyName}</strong> terminó. Toda la data histórica ya está procesada y la plataforma está completamente desbloqueada.
    </p>

    <div style="background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.2);border-radius:14px;padding:20px;margin:24px 0;">
      <div style="font-size:11px;font-weight:600;color:${ACCENT_GREEN};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">
        Por dónde empezar
      </div>
      <ul style="margin:0;padding:0 0 0 18px;color:${TEXT_PRIMARY};font-size:14px;line-height:1.9;">
        <li>Revisar ventas y métricas de los últimos 30 días.</li>
        <li>Configurar la primera alerta para recibir avisos automáticos.</li>
        <li>Hablar con <strong style="color:${BRAND_ORANGE};">Aurum</strong>, el asistente de NitroSales, para explorar la data.</li>
      </ul>
    </div>

    <div style="margin:28px 0;">
      ${button("Abrir NitroSales →", url)}
    </div>
  `;

  return { subject, html: baseLayout(subject, preheader, content) };
}

// ══════════════════════════════════════════════════════════════
// VARIANTES DE INVITACIÓN (A/B/C/D) — para A/B testing / preview
// ══════════════════════════════════════════════════════════════
// Al lead YA lo contactamos antes, el email es el link para que
// entre al form. Entonces subject = utilitario ("Tu acceso a
// NitroSales") y el body pega duro con un HERO minimal tipo
// Vercel/Linear:
//
//   [eyebrow naranja: IMPLEMENTÁ AI COMMERCE]
//   [HERO gigante 48px con keyword en naranja]
//   [subtítulo 17px, 1 o 2 líneas, que pega]
//   [CTA blanco]
//   [fine print]
//
// Las 4 variantes solo cambian el hero + sub. Estructura idéntica.
// ══════════════════════════════════════════════════════════════

/** Helper: render del hero premium minimalista compartido */
function inviteHero(opts: {
  contactName: string | null;
  companyName: string;
  heroTop: string;          // texto blanco (parte 1 del hero)
  heroAccent: string;       // texto en naranja (parte 2, remate)
  sub: string;              // subtítulo 1-2 líneas
  ctaLabel: string;         // label del boton
  onboardingUrl: string;
}): string {
  const { contactName, heroTop, heroAccent, sub, ctaLabel, onboardingUrl } = opts;
  return `
    <div style="padding:36px 0 20px;text-align:left;">
      <!-- Eyebrow -->
      <div style="font-size:11px;font-weight:700;color:${BRAND_ORANGE};text-transform:uppercase;letter-spacing:0.22em;margin-bottom:36px;">
        ⚡ Implementá AI commerce
      </div>

      <!-- Greeting sutil -->
      <div style="font-size:13px;color:${TEXT_SECONDARY};margin-bottom:18px;letter-spacing:0.02em;">
        ${greeting(contactName)},
      </div>

      <!-- HERO -->
      <h1 class="ns-hero" style="margin:0 0 22px;font-size:46px;font-weight:800;color:${TEXT_PRIMARY};line-height:1.05;letter-spacing:-0.04em;">
        ${heroTop}<br/>
        <span style="color:${BRAND_ORANGE};">${heroAccent}</span>
      </h1>

      <!-- Subtítulo -->
      <p class="ns-sub" style="margin:0 0 44px;color:${TEXT_SECONDARY};font-size:17px;line-height:1.5;font-weight:400;max-width:440px;">
        ${sub}
      </p>

      <!-- CTA blanco sobre dark -->
      <a href="${onboardingUrl}" style="display:inline-block;padding:16px 36px;background:${TEXT_PRIMARY};color:${BRAND_BG};text-decoration:none;border-radius:12px;font-size:15px;font-weight:700;letter-spacing:0.01em;">
        ${ctaLabel} →
      </a>

      <!-- Fine print -->
      <p style="margin:40px 0 0;color:${TEXT_SECONDARY};font-size:12px;line-height:1.6;opacity:0.6;">
        Un formulario corto. Acceso inmediato al producto.
      </p>
    </div>
  `;
}

const INVITE_SUBJECT = "Tu acceso a NitroSales";

// ──────────────────────────────────────────────────────────────
// Variante A — "Pierde dinero" (custom: rojo chillón + glow)
// ──────────────────────────────────────────────────────────────
// No usa inviteHero(): tiene un hero a medida donde "pierde dinero"
// va en un rojo vibrante con text-shadow multicapa (glow premium).
// Soportado en Gmail / Apple Mail / Outlook moderno. En clientes
// viejos degradan al color sólido, que igual se lee bien.
// ──────────────────────────────────────────────────────────────

export function leadInviteVariantA(opts: {
  contactName: string | null;
  companyName: string;
}) {
  const { contactName, companyName } = opts;
  const onboardingUrl = `${appUrl()}/onboarding`;
  const subject = INVITE_SUBJECT;
  const preheader = `IA + píxel propio. Más visibilidad, más performance, más rentabilidad.`;

  // Rojo profundo sobrio (Tailwind red-600 style) + glow MUY sutil de 1 capa.
  // El peso visual viene del font-weight 900 y el color denso, no del halo.
  const RED_HOT = "#DC2626";
  const glow = `0 0 18px rgba(220,38,38,0.32)`;

  const content = `
    <div style="padding:36px 0 20px;text-align:left;">
      <!-- Eyebrow -->
      <div style="font-size:11px;font-weight:700;color:${BRAND_ORANGE};text-transform:uppercase;letter-spacing:0.22em;margin-bottom:36px;">
        ⚡ Implementá AI commerce
      </div>

      <!-- Greeting sutil -->
      <div style="font-size:13px;color:${TEXT_SECONDARY};margin-bottom:18px;letter-spacing:0.02em;">
        ${greeting(contactName)},
      </div>

      <!-- HERO: 2 líneas, "pierde dinero" en rojo con glow -->
      <h1 class="ns-hero" style="margin:0 0 24px;font-size:46px;font-weight:800;color:${TEXT_PRIMARY};line-height:1.05;letter-spacing:-0.04em;">
        Tu ecommerce<br/>
        <span style="color:${RED_HOT};text-shadow:${glow};font-weight:900;">pierde dinero</span> todos los meses.
      </h1>

      <!-- Subtítulo -->
      <p class="ns-sub" style="margin:0 0 44px;color:${TEXT_SECONDARY};font-size:17px;line-height:1.5;font-weight:400;max-width:460px;">
        Con <strong style="color:${TEXT_PRIMARY};font-weight:600;">inteligencia artificial</strong> y un <strong style="color:${TEXT_PRIMARY};font-weight:600;">píxel propio</strong>, NitroSales ve todo lo que pasa en tu negocio, potencia lo que funciona y te hace ganar más plata — rápido, sustentable y rentable.
      </p>

      <!-- CTA blanco sobre dark -->
      <a href="${onboardingUrl}" style="display:inline-block;padding:16px 36px;background:${TEXT_PRIMARY};color:${BRAND_BG};text-decoration:none;border-radius:12px;font-size:15px;font-weight:700;letter-spacing:0.01em;">
        Activar ${companyName} →
      </a>

      <!-- Fine print -->
      <p style="margin:40px 0 0;color:${TEXT_SECONDARY};font-size:12px;line-height:1.6;opacity:0.6;">
        Un formulario corto. Acceso inmediato al producto.
      </p>
    </div>
  `;

  return { subject, html: baseLayout(subject, preheader, content) };
}

// ──────────────────────────────────────────────────────────────
// Variante B — "Vas a ciegas"
// ──────────────────────────────────────────────────────────────

export function leadInviteVariantB(opts: {
  contactName: string | null;
  companyName: string;
}) {
  const { contactName, companyName } = opts;
  const onboardingUrl = `${appUrl()}/onboarding`;
  const subject = INVITE_SUBJECT;
  const preheader = `Hoy tu ecommerce opera a ciegas. Cambialo.`;

  const content = inviteHero({
    contactName,
    companyName,
    heroTop: "Tu ecommerce",
    heroAccent: "vuela a ciegas.",
    sub: "Campañas que no sabés si rinden, stock que no sabés qué rota, márgenes que no sabés dónde se escapan. Adentro se ve todo.",
    ctaLabel: `Activar ${companyName}`,
    onboardingUrl,
  });

  return { subject, html: baseLayout(subject, preheader, content) };
}

// ──────────────────────────────────────────────────────────────
// Variante C — "Dejá de decidir a ojo"
// ──────────────────────────────────────────────────────────────

export function leadInviteVariantC(opts: {
  contactName: string | null;
  companyName: string;
}) {
  const { contactName, companyName } = opts;
  const onboardingUrl = `${appUrl()}/onboarding`;
  const subject = INVITE_SUBJECT;
  const preheader = `Cada campaña, cada producto, cada peso — con data en tiempo real.`;

  const content = inviteHero({
    contactName,
    companyName,
    heroTop: "Dejá de decidir",
    heroAccent: "a ojo.",
    sub: "Cada campaña, cada producto, cada peso — con la data real en tus manos, en tiempo real. Así opera el ecommerce top de LATAM.",
    ctaLabel: `Activar ${companyName}`,
    onboardingUrl,
  });

  return { subject, html: baseLayout(subject, preheader, content) };
}

// ──────────────────────────────────────────────────────────────
// Variante D — "Operado por IA"
// ──────────────────────────────────────────────────────────────

export function leadInviteVariantD(opts: {
  contactName: string | null;
  companyName: string;
}) {
  const { contactName, companyName } = opts;
  const onboardingUrl = `${appUrl()}/onboarding`;
  const subject = INVITE_SUBJECT;
  const preheader = `Sin dashboards. Sin excel. Sin dudas. Tu ecommerce operado por IA.`;

  const content = inviteHero({
    contactName,
    companyName,
    heroTop: "Tu ecommerce,",
    heroAccent: "operado por IA.",
    sub: "Sin dashboards. Sin excel. Sin dudas. NitroSales conecta tus plataformas y te dice qué hacer en cada momento.",
    ctaLabel: `Activar ${companyName}`,
    onboardingUrl,
  });

  return { subject, html: baseLayout(subject, preheader, content) };
}

// ──────────────────────────────────────────────────────────────
// 6. Needs Info — falta algo en la solicitud
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
  const subject = `Falta un dato para activar ${companyName}`;
  const preheader = `Para completar la activación de ${companyName} falta confirmar algunos datos.`;

  const missingList = missingFields
    .map(
      (field) =>
        `<li style="margin-bottom:6px;">${field}</li>`
    )
    .join("");

  const content = `
    <div style="font-size:11px;font-weight:700;color:${ACCENT_AMBER};text-transform:uppercase;letter-spacing:0.12em;margin-bottom:12px;">
      ⏸ PAUSADO — FALTA INFO
    </div>
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:${TEXT_PRIMARY};line-height:1.3;letter-spacing:-0.02em;">
      ${greeting(contactName)}
    </h1>
    <p style="margin:0 0 20px;color:${TEXT_SECONDARY};font-size:15px;line-height:1.7;">
      Para completar la activación de <strong style="color:${TEXT_PRIMARY};">${companyName}</strong>, el equipo de NitroSales necesita confirmar lo siguiente:
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
      Respondé este email con los datos faltantes, o actualizá la solicitud desde acá:
    </p>
    ${button("Actualizar solicitud →", statusUrl)}
  `;

  return { subject, html: baseLayout(subject, preheader, content) };
}
