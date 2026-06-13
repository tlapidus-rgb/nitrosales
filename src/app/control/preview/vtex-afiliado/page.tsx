// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// /control/preview/vtex-afiliado
// ══════════════════════════════════════════════════════════════
// Preview admin del paso "afiliado VTEX" que el cliente ve durante
// el onboarding. Reusa el componente compartido con datos mock para
// que el founder pueda revisar visualmente sin necesidad de un
// cliente real en IN_PROGRESS.
// ══════════════════════════════════════════════════════════════

import VtexAffiliateInstructions, { type AffiliateInfo } from "@/components/onboarding/VtexAffiliateInstructions";

const MOCK_INFO: AffiliateInfo = {
  affiliateId: "NSL",
  affiliateName: "NitroSales",
  notificationEmail: "webhooks@nitrosales.ai",
  // Preview/mock: placeholders, NO la key real (esto es código cliente → se bundlea al
  // browser; nunca exponer el secreto acá). La URL real la arma server-side /api/me/vtex-affiliate-info. BP-M1.
  webhookUrl:
    "https://nitrosales.vercel.app/api/webhooks/vtex/orders?key=TU_KEY_AQUI&org=cmoXXXXXXXXXXXX_TU_ORG_AQUI",
};

const TEXT_MUTED = "#6B7280";

export default function VtexAfiliadoPreview() {
  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", padding: 40 }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <h1 style={{ color: "#fff", fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
          Preview: Paso afiliado VTEX
        </h1>
        <p style={{ color: "#9CA3AF", fontSize: 13, marginBottom: 32 }}>
          Las dos versiones del bloque que ve el cliente. Datos mock — el orgId real se inyecta server-side
          via <code>/api/me/vtex-affiliate-info</code>.
        </p>

        <SectionLabel color="#FF5E1A" label="Wizard de onboarding" sub="OnboardingOverlay.tsx · DARK theme" />
        <div
          style={{
            background: "#0F0F0F",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16,
            padding: 28,
            marginBottom: 60,
          }}
        >
          <VtexAffiliateInstructions info={MOCK_INFO} theme="dark" />
        </div>

        <SectionLabel color="#10b981" label="Settings post-activación" sub="/settings/integraciones/vtex · LIGHT theme" />
        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 28,
          }}
        >
          <VtexAffiliateInstructions info={MOCK_INFO} theme="light" />
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ color, label, sub }: { color: string; label: string; sub: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
      <div
        style={{
          background: color,
          color: "#000",
          padding: "2px 10px",
          borderRadius: 4,
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <span style={{ color: TEXT_MUTED, fontSize: 12 }}>{sub}</span>
    </div>
  );
}
