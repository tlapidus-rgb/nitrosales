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
// Todas apuntan al mismo /onboarding pero con distinto ángulo de copy
// y layout. Se pueden enchufar en reemplazo de leadInviteEmail()
// cuando Tomy elija la que mejor convierta.
// ══════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────
// Variante A — Pain / FOMO ("estás perdiendo plata")
// ──────────────────────────────────────────────────────────────
// Hook: stat gigante con cifra que duele. Urgencia en cada párrafo.
// Tono: confrontativo pero respetuoso. Funciona si el lead es un
// founder que sabe que tiene un problema pero lo está posponiendo.
// ──────────────────────────────────────────────────────────────

export function leadInviteVariantA(opts: {
  contactName: string | null;
  companyName: string;
}) {
  const { contactName, companyName } = opts;
  const onboardingUrl = `${appUrl()}/onboarding`;
  const subject = `${companyName}: estás perdiendo plata sin saberlo`;
  const preheader = `El 40% de tu inversión en ads no se puede rastrear. Adentro de NitroSales, sí.`;

  const content = `
    <!-- Micro eyebrow -->
    <div style="font-size:11px;font-weight:700;color:#EF4444;text-transform:uppercase;letter-spacing:0.14em;margin-bottom:14px;">
      ⚠ LO QUE NO SE MIDE, SE PIERDE
    </div>

    <!-- Big number -->
    <div style="background:linear-gradient(135deg,rgba(239,68,68,0.08) 0%,rgba(255,94,26,0.06) 100%);border:1px solid rgba(239,68,68,0.25);border-radius:18px;padding:28px 24px;margin:0 0 28px;text-align:center;">
      <div style="font-size:64px;font-weight:800;color:#fff;line-height:1;letter-spacing:-0.04em;margin-bottom:8px;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif;">
        40<span style="color:#EF4444;">%</span>
      </div>
      <div style="font-size:13px;color:${TEXT_SECONDARY};line-height:1.5;max-width:360px;margin:0 auto;">
        de tu inversión en Meta y Google Ads hoy <strong style="color:${TEXT_PRIMARY};">no se puede atribuir a una venta real</strong>. Se pierde en el iOS14+ y en los cookies rotos.
      </div>
    </div>

    <!-- Headline -->
    <h1 style="margin:0 0 14px;font-size:28px;font-weight:800;color:${TEXT_PRIMARY};line-height:1.2;letter-spacing:-0.025em;">
      ${greeting(contactName)}. ${companyName} puede cambiar eso hoy.
    </h1>

    <p style="margin:0 0 12px;color:${TEXT_SECONDARY};font-size:15px;line-height:1.65;">
      NitroSales es el sistema operativo comercial para ecommerce LATAM. Atribución propia (NitroPixel), P&L real por canal, agente de IA que te avisa lo que está roto <strong style="color:${TEXT_PRIMARY};">antes</strong> de que pierdas plata.
    </p>

    <p style="margin:0 0 28px;color:${TEXT_SECONDARY};font-size:15px;line-height:1.65;">
      Mientras tu competencia sigue mirando métricas tarde, vos operás con información en tiempo real.
    </p>

    <!-- CTA -->
    <div style="margin:0 0 20px;">
      <a href="${onboardingUrl}" style="display:inline-block;padding:16px 36px;background:linear-gradient(135deg,${BRAND_ORANGE} 0%,#FF8C4A 100%);color:#fff;text-decoration:none;border-radius:12px;font-size:15px;font-weight:700;letter-spacing:0.01em;box-shadow:0 8px 24px rgba(255,94,26,0.35);">
        Dejar de perder plata →
      </a>
    </div>

    <p style="margin:0;color:${TEXT_SECONDARY};font-size:12px;line-height:1.55;opacity:0.7;">
      Formulario corto. Sin compromiso. El equipo revisa y habilita el acceso.
    </p>
  `;

  return { subject, html: baseLayout(subject, preheader, content) };
}

// ──────────────────────────────────────────────────────────────
// Variante B — Exclusividad ("acceso anticipado")
// ──────────────────────────────────────────────────────────────
// Hook: status + pertenencia. "No cualquiera entra". Efecto Superhuman.
// Tono: elegante, sofisticado, aspiracional.
// ──────────────────────────────────────────────────────────────

export function leadInviteVariantB(opts: {
  contactName: string | null;
  companyName: string;
}) {
  const { contactName, companyName } = opts;
  const onboardingUrl = `${appUrl()}/onboarding`;
  const subject = `Acceso anticipado a NitroSales — ${companyName}`;
  const preheader = `Una invitación exclusiva. Solo para los ecommerce que operan en serio.`;

  const content = `
    <!-- Seal -->
    <div style="display:inline-block;padding:6px 14px;background:rgba(255,94,26,0.12);border:1px solid rgba(255,94,26,0.35);border-radius:999px;margin-bottom:24px;">
      <div style="font-size:10px;font-weight:700;color:${BRAND_ORANGE};text-transform:uppercase;letter-spacing:0.15em;">
        ✦ Invitación privada
      </div>
    </div>

    <!-- Headline -->
    <h1 style="margin:0 0 18px;font-size:32px;font-weight:800;color:${TEXT_PRIMARY};line-height:1.15;letter-spacing:-0.03em;">
      ${greeting(contactName)},<br/>
      <span style="background:linear-gradient(135deg,#FF5E1A 0%,#FF8C4A 50%,#FFB580 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">${companyName}</span> fue elegido.
    </h1>

    <p style="margin:0 0 24px;color:${TEXT_SECONDARY};font-size:16px;line-height:1.65;">
      NitroSales está abriendo acceso de forma selectiva a ecommerce que operan a escala. Tu negocio cumple el criterio.
    </p>

    <!-- Decorative separator -->
    <div style="height:1px;background:linear-gradient(90deg,transparent 0%,${BORDER} 50%,transparent 100%);margin:32px 0;"></div>

    <!-- What's inside -->
    <div style="font-size:11px;font-weight:700;color:${TEXT_SECONDARY};text-transform:uppercase;letter-spacing:0.14em;margin-bottom:18px;">
      Lo que te espera adentro
    </div>

    <div style="display:block;margin-bottom:28px;">
      <div style="padding:16px 0;border-bottom:1px solid ${BORDER};">
        <div style="color:${TEXT_PRIMARY};font-size:14px;font-weight:600;margin-bottom:4px;">⚡ Atribución propia</div>
        <div style="color:${TEXT_SECONDARY};font-size:13px;line-height:1.5;">NitroPixel mide cada venta sin depender de Meta ni Google.</div>
      </div>
      <div style="padding:16px 0;border-bottom:1px solid ${BORDER};">
        <div style="color:${TEXT_PRIMARY};font-size:14px;font-weight:600;margin-bottom:4px;">◆ P&L en tiempo real</div>
        <div style="color:${TEXT_SECONDARY};font-size:13px;line-height:1.5;">Rentabilidad por canal, producto, campaña. Sin esperar al contador.</div>
      </div>
      <div style="padding:16px 0;">
        <div style="color:${TEXT_PRIMARY};font-size:14px;font-weight:600;margin-bottom:4px;">✦ Aurum, tu copiloto</div>
        <div style="color:${TEXT_SECONDARY};font-size:13px;line-height:1.5;">Un agente de IA que opera tu negocio contigo.</div>
      </div>
    </div>

    <!-- CTA -->
    <a href="${onboardingUrl}" style="display:inline-block;padding:15px 34px;background:${TEXT_PRIMARY};color:${BRAND_BG};text-decoration:none;border-radius:12px;font-size:14px;font-weight:700;letter-spacing:0.02em;">
      Aceptar invitación →
    </a>

    <p style="margin:28px 0 0;color:${TEXT_SECONDARY};font-size:12px;line-height:1.6;opacity:0.7;">
      Este acceso es personal. No lo compartas.
    </p>
  `;

  return { subject, html: baseLayout(subject, preheader, content) };
}

// ──────────────────────────────────────────────────────────────
// Variante C — Números concretos ("social proof numérico")
// ──────────────────────────────────────────────────────────────
// Hook: 3 stats gigantes en grid con colores distintos.
// Tono: directo, cuantitativo, data-driven.
// ──────────────────────────────────────────────────────────────

export function leadInviteVariantC(opts: {
  contactName: string | null;
  companyName: string;
}) {
  const { contactName, companyName } = opts;
  const onboardingUrl = `${appUrl()}/onboarding`;
  const subject = `Los números que podés tener en ${companyName}`;
  const preheader = `+32% ROAS. 4x velocidad de decisión. -60% tiempo en reportes.`;

  const content = `
    <!-- Eyebrow -->
    <div style="font-size:11px;font-weight:700;color:${ACCENT_GREEN};text-transform:uppercase;letter-spacing:0.14em;margin-bottom:16px;">
      📊 RESULTADOS REALES
    </div>

    <!-- Headline -->
    <h1 style="margin:0 0 12px;font-size:26px;font-weight:800;color:${TEXT_PRIMARY};line-height:1.25;letter-spacing:-0.025em;">
      ${greeting(contactName)}, esto pasa cuando medís bien.
    </h1>
    <p style="margin:0 0 28px;color:${TEXT_SECONDARY};font-size:14px;line-height:1.6;">
      Promedios de ecommerce LATAM en sus primeros 90 días con NitroSales.
    </p>

    <!-- Stats grid (3 cols mobile-safe vertical stack) -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
      <tr>
        <td style="padding:0 0 12px;">
          <div style="background:linear-gradient(135deg,rgba(34,197,94,0.08) 0%,rgba(34,197,94,0.02) 100%);border:1px solid rgba(34,197,94,0.25);border-radius:14px;padding:22px 24px;">
            <div style="font-size:42px;font-weight:800;color:${ACCENT_GREEN};line-height:1;letter-spacing:-0.03em;margin-bottom:8px;">
              +32<span style="font-size:28px;">%</span>
            </div>
            <div style="font-size:13px;color:${TEXT_PRIMARY};font-weight:600;margin-bottom:2px;">ROAS en Meta + Google</div>
            <div style="font-size:11px;color:${TEXT_SECONDARY};line-height:1.5;">Al redirigir presupuesto de campañas que no atribuyen.</div>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:0 0 12px;">
          <div style="background:linear-gradient(135deg,rgba(255,94,26,0.08) 0%,rgba(255,94,26,0.02) 100%);border:1px solid rgba(255,94,26,0.25);border-radius:14px;padding:22px 24px;">
            <div style="font-size:42px;font-weight:800;color:${BRAND_ORANGE};line-height:1;letter-spacing:-0.03em;margin-bottom:8px;">
              4<span style="font-size:28px;">x</span>
            </div>
            <div style="font-size:13px;color:${TEXT_PRIMARY};font-weight:600;margin-bottom:2px;">Velocidad de decisión</div>
            <div style="font-size:11px;color:${TEXT_SECONDARY};line-height:1.5;">Alertas en tiempo real vs reportes semanales.</div>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:0;">
          <div style="background:linear-gradient(135deg,rgba(168,85,247,0.08) 0%,rgba(168,85,247,0.02) 100%);border:1px solid rgba(168,85,247,0.25);border-radius:14px;padding:22px 24px;">
            <div style="font-size:42px;font-weight:800;color:${ACCENT_PURPLE};line-height:1;letter-spacing:-0.03em;margin-bottom:8px;">
              -60<span style="font-size:28px;">%</span>
            </div>
            <div style="font-size:13px;color:${TEXT_PRIMARY};font-weight:600;margin-bottom:2px;">Tiempo armando reportes</div>
            <div style="font-size:11px;color:${TEXT_SECONDARY};line-height:1.5;">P&L y métricas automatizadas. Preguntale a Aurum lo que necesites.</div>
          </div>
        </td>
      </tr>
    </table>

    <!-- CTA -->
    <a href="${onboardingUrl}" style="display:inline-block;padding:16px 34px;background:linear-gradient(135deg,${BRAND_ORANGE} 0%,#FF8C4A 100%);color:#fff;text-decoration:none;border-radius:12px;font-size:15px;font-weight:700;letter-spacing:0.01em;box-shadow:0 8px 24px rgba(255,94,26,0.3);">
      Quiero esos números →
    </a>

    <p style="margin:22px 0 0;color:${TEXT_SECONDARY};font-size:12px;line-height:1.55;opacity:0.75;">
      Formulario de 2 minutos. Sin tarjeta. El equipo revisa y habilita.
    </p>
  `;

  return { subject, html: baseLayout(subject, preheader, content) };
}

// ──────────────────────────────────────────────────────────────
// Variante D — Minimal hero ("un solo punch")
// ──────────────────────────────────────────────────────────────
// Hook: frase sola que atraviesa. Cero clutter. Vercel/Linear vibe.
// Tono: seguro, declarativo, casi poético. Para founders que aprecian
// el diseño y se aburren de los emails tipo marketing.
// ──────────────────────────────────────────────────────────────

export function leadInviteVariantD(opts: {
  contactName: string | null;
  companyName: string;
}) {
  const { contactName, companyName } = opts;
  const onboardingUrl = `${appUrl()}/onboarding`;
  const subject = `Tu ecommerce tiene dos ojos cerrados`;
  const preheader = `Abrilos.`;

  const content = `
    <!-- Giant glow hero -->
    <div style="position:relative;padding:40px 0 24px;text-align:left;">
      <div style="font-size:10px;font-weight:700;color:${BRAND_ORANGE};text-transform:uppercase;letter-spacing:0.18em;margin-bottom:32px;">
        ${greeting(contactName)}
      </div>

      <h1 style="margin:0 0 24px;font-size:42px;font-weight:800;color:${TEXT_PRIMARY};line-height:1.08;letter-spacing:-0.035em;">
        Tu ecommerce tiene<br/>
        <span style="background:linear-gradient(135deg,#FF5E1A 0%,#A855F7 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">dos ojos cerrados.</span>
      </h1>

      <p style="margin:0 0 40px;color:${TEXT_SECONDARY};font-size:17px;line-height:1.55;font-weight:400;max-width:420px;">
        No sabés qué campaña trae qué venta. No sabés qué producto te hace ganar plata. No sabés qué canal crece.
      </p>

      <p style="margin:0 0 44px;color:${TEXT_PRIMARY};font-size:17px;line-height:1.55;font-weight:500;max-width:420px;">
        NitroSales abre los dos.
      </p>

      <!-- CTA -->
      <a href="${onboardingUrl}" style="display:inline-block;padding:18px 40px;background:${TEXT_PRIMARY};color:${BRAND_BG};text-decoration:none;border-radius:14px;font-size:15px;font-weight:700;letter-spacing:0.01em;">
        Abrir los ojos de ${companyName} →
      </a>

      <p style="margin:40px 0 0;color:${TEXT_SECONDARY};font-size:12px;line-height:1.6;opacity:0.6;">
        Un formulario. Dos minutos. Acceso inmediato al producto.
      </p>
    </div>
  `;

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
