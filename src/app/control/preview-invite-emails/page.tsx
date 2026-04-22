// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// /control/preview-invite-emails
// ══════════════════════════════════════════════════════════════
// Preview lado a lado de las 4 variantes de email de invitacion.
// Cada variante se renderiza en un iframe (srcDoc) para que sea
// fiel a como se ve en Gmail/Outlook.
// Tomy elige una y le avisa a Claude que la deje como default.
// ══════════════════════════════════════════════════════════════

import {
  leadInviteEmail,
  leadInviteVariantA,
  leadInviteVariantB,
  leadInviteVariantC,
  leadInviteVariantD,
} from "@/lib/onboarding/emails";

export const dynamic = "force-dynamic";

const SAMPLE = { contactName: "Juan", companyName: "Arredo" };

const VARIANTS = [
  {
    key: "current",
    label: "Actual (neutra)",
    tag: "En producción hoy",
    color: "#6B7280",
    angle: "Informativa. Correcta pero tibia.",
    render: leadInviteEmail,
  },
  {
    key: "A",
    label: "A — Dinero perdido",
    tag: "Pain directo",
    color: "#EF4444",
    angle: "\"Tu ecommerce pierde dinero todos los meses.\"",
    render: leadInviteVariantA,
  },
  {
    key: "B",
    label: "B — Vuela a ciegas",
    tag: "Falta de visibilidad",
    color: "#FF5E1A",
    angle: "\"Tu ecommerce vuela a ciegas.\"",
    render: leadInviteVariantB,
  },
  {
    key: "C",
    label: "C — Dejá de decidir a ojo",
    tag: "Operación con data",
    color: "#22C55E",
    angle: "\"Dejá de decidir a ojo.\" Cada decisión con data real.",
    render: leadInviteVariantC,
  },
  {
    key: "D",
    label: "D — Operado por IA",
    tag: "Promesa aspiracional",
    color: "#A855F7",
    angle: "\"Tu ecommerce, operado por IA.\" Sin dashboards ni excel.",
    render: leadInviteVariantD,
  },
];

export default function PreviewInviteEmailsPage() {
  const rendered = VARIANTS.map((v) => ({ ...v, email: v.render(SAMPLE) }));

  return (
    <div style={{ minHeight: "100vh", background: "#0A0A0F", padding: "88px 24px 48px" }}>
      {/* Hero */}
      <div style={{ maxWidth: 1400, margin: "0 auto 32px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#FF5E1A", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 10 }}>
          Preview · Invite emails
        </div>
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em", lineHeight: 1.2 }}>
          5 variantes lado a lado
        </h1>
        <p style={{ margin: "10px 0 0", color: "#9CA3AF", fontSize: 14, lineHeight: 1.6, maxWidth: 600 }}>
          Destinatario de ejemplo: <strong style={{ color: "#fff" }}>{SAMPLE.contactName}</strong> · Empresa: <strong style={{ color: "#fff" }}>{SAMPLE.companyName}</strong>. Scrolleá cada iframe. Cuando elijas, avisame y la dejo como default en producción.
        </p>
      </div>

      {/* Grid */}
      <div
        style={{
          maxWidth: 1400,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(420px,1fr))",
          gap: 20,
        }}
      >
        {rendered.map((v) => (
          <div
            key={v.key}
            style={{
              background: "#141419",
              border: "1px solid #1F1F2E",
              borderRadius: 16,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Header */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #1F1F2E" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <div
                  style={{
                    padding: "3px 10px",
                    borderRadius: 6,
                    background: `${v.color}22`,
                    border: `1px solid ${v.color}55`,
                    fontSize: 10,
                    fontWeight: 700,
                    color: v.color,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                  }}
                >
                  {v.key === "current" ? "Base" : `Variante ${v.key}`}
                </div>
                <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 500 }}>{v.tag}</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 4, letterSpacing: "-0.01em" }}>
                {v.label}
              </div>
              <div style={{ fontSize: 12, color: "#9CA3AF", lineHeight: 1.5 }}>{v.angle}</div>
              <div
                style={{
                  marginTop: 10,
                  padding: "8px 10px",
                  background: "#0A0A0F",
                  border: "1px solid #1F1F2E",
                  borderRadius: 6,
                  fontSize: 11,
                  color: "#FFFFFF",
                  fontFamily: "'SF Mono',Menlo,monospace",
                }}
              >
                <span style={{ color: "#71717A" }}>Subject: </span>
                {v.email.subject}
              </div>
            </div>

            {/* Iframe preview */}
            <iframe
              srcDoc={v.email.html}
              title={v.label}
              style={{
                width: "100%",
                height: 720,
                border: 0,
                background: "#0A0A0F",
              }}
            />
          </div>
        ))}
      </div>

      {/* Footer hint */}
      <div
        style={{
          maxWidth: 1400,
          margin: "40px auto 0",
          padding: "20px 24px",
          background: "#141419",
          border: "1px solid #1F1F2E",
          borderRadius: 14,
          color: "#9CA3AF",
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        <div style={{ fontWeight: 700, color: "#fff", marginBottom: 6, fontSize: 13 }}>
          ¿Cómo elegir?
        </div>
        Abrilas en mobile también (el grid colapsa a 1 columna). Mandate los 4 a tu propio email para ver cómo se ven en Gmail real — después me decís cuál va y en 30 segundos la dejo como default en <code style={{ color: "#FF5E1A" }}>leadInviteEmail()</code>.
      </div>
    </div>
  );
}
