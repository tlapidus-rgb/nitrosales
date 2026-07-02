// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// /control/preview-password-reset-emails
// ══════════════════════════════════════════════════════════════
// Preview lado a lado del email de recovery en español e inglés.
// Sirve para ver copy, spacing y CTA antes de mandar mails reales.
// ══════════════════════════════════════════════════════════════

import { passwordResetEmail } from "@/lib/email/templates";

export const dynamic = "force-dynamic";

const SAMPLE_NAME = "Juan";
const SAMPLE_LINK = "https://app.nitrosales.ai/reset-password?token=demo&locale=es";

const VARIANTS = [
  { key: "es", label: "Español", locale: "es" as const, color: "#FF5E1A" },
  { key: "en", label: "English", locale: "en" as const, color: "#22C55E" },
];

export default function PreviewPasswordResetEmailsPage() {
  const rendered = VARIANTS.map((variant) => ({
    ...variant,
    email: passwordResetEmail(SAMPLE_NAME, SAMPLE_LINK.replace("locale=es", `locale=${variant.locale}`), variant.locale),
  }));

  return (
    <div style={{ minHeight: "100vh", background: "#0A0A0F", padding: "88px 24px 48px" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto 32px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#FF5E1A", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 10 }}>
          Preview · Password reset emails
        </div>
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em", lineHeight: 1.2 }}>
          Recovery email en español e inglés
        </h1>
        <p style={{ margin: "10px 0 0", color: "#9CA3AF", fontSize: 14, lineHeight: 1.6, maxWidth: 760 }}>
          La idea es chequear el render antes de mandar un mail real. Si querés validar el cambio de contraseña, usá un usuario de prueba y el flujo <code style={{ color: "#FF5E1A" }}>/forgot-password</code> → email → <code style={{ color: "#FF5E1A" }}>/reset-password</code>.
        </p>
      </div>

      <div style={{ maxWidth: 1400, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(640px,1fr))", gap: 24 }}>
        {rendered.map((variant) => (
          <div key={variant.key} style={{ background: "#141419", border: "1px solid #1F1F2E", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #1F1F2E" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <div style={{ padding: "3px 10px", borderRadius: 6, background: `${variant.color}22`, border: `1px solid ${variant.color}55`, fontSize: 10, fontWeight: 700, color: variant.color, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                  {variant.label}
                </div>
                <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 500 }}>Locale: {variant.locale}</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 4, letterSpacing: "-0.01em" }}>{variant.email.subject}</div>
              <div style={{ fontSize: 12, color: "#9CA3AF", lineHeight: 1.5 }}>Visual preview del mail de recuperación.</div>
            </div>

            <iframe srcDoc={variant.email.html} title={variant.label} style={{ width: "100%", height: 720, border: 0, background: "#0A0A0F" }} />
          </div>
        ))}
      </div>

      <div style={{ maxWidth: 1400, margin: "40px auto 0", padding: "20px 24px", background: "#141419", border: "1px solid #1F1F2E", borderRadius: 14, color: "#9CA3AF", fontSize: 13, lineHeight: 1.6 }}>
        <div style={{ fontWeight: 700, color: "#fff", marginBottom: 6, fontSize: 13 }}>Cómo probarlo de verdad</div>
        1) Abrí el preview para revisar copy/CTA. 2) Usá un mail de prueba en <code style={{ color: "#FF5E1A" }}>/forgot-password</code>. 3) Abrí el link de <code style={{ color: "#FF5E1A" }}>/reset-password</code> y cambiá la contraseña. 4) Si el navegador está en inglés, el mail y la pantalla cambian a inglés.
      </div>
    </div>
  );
}