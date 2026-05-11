// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// /control/preview/vtex-afiliado
// ══════════════════════════════════════════════════════════════
// Preview admin del paso "afiliado VTEX" que el cliente ve durante
// el onboarding. Renderiza el componente del wizard overlay con
// datos mock para que el founder pueda revisar visualmente sin
// necesidad de un cliente real en IN_PROGRESS.
// ══════════════════════════════════════════════════════════════

import { useState } from "react";
import { Copy, Lock } from "lucide-react";

const BRAND_ORANGE = "#FF5E1A";
const BORDER = "rgba(255,255,255,0.08)";
const TEXT_SECONDARY = "#9CA3AF";
const TEXT_MUTED = "#6B7280";

const MOCK_INFO = {
  affiliateId: "NSL",
  affiliateName: "NitroSales",
  notificationEmail: "webhooks@nitrosales.ai",
  webhookUrl:
    "https://nitrosales.vercel.app/api/webhooks/vtex/orders?key=nitrosales-secret-key-2024-production&org=cmoXXXXXXXXXX_TU_ORG_AQUI",
};

export default function VtexAfiliadoPreview() {
  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", padding: 40 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <h1 style={{ color: "#fff", fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
          Preview: Paso afiliado VTEX
        </h1>
        <p style={{ color: TEXT_SECONDARY, fontSize: 13, marginBottom: 32 }}>
          Asi es como lo ve el cliente nuevo en el wizard de onboarding (overlay dark theme).
          Es el bloque que aparece debajo de los campos de credenciales VTEX.
        </p>

        {/* ════════════════ VERSION DARK (ONBOARDING WIZARD) ════════════════ */}
        <div style={{ marginBottom: 60 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div style={{ background: BRAND_ORANGE, color: "#000", padding: "2px 10px", borderRadius: 4, fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>
              Wizard onboarding
            </div>
            <span style={{ color: TEXT_MUTED, fontSize: 12 }}>OnboardingOverlay.tsx → EcommerceInputs</span>
          </div>

          <div style={{
            maxWidth: 720,
            background: "#0F0F0F",
            border: `1px solid ${BORDER}`,
            borderRadius: 16,
            padding: 28,
          }}>
            <DarkAfiliadoBlock info={MOCK_INFO} />
          </div>
        </div>

        {/* ════════════════ VERSION LIGHT (POST-ACTIVACION) ════════════════ */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div style={{ background: "#10b981", color: "#000", padding: "2px 10px", borderRadius: 4, fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>
              Settings · post-activacion
            </div>
            <span style={{ color: TEXT_MUTED, fontSize: 12 }}>/settings/integraciones/vtex</span>
          </div>

          <div style={{
            maxWidth: 720,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 28,
          }}>
            <LightAfiliadoBlock info={MOCK_INFO} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DarkAfiliadoBlock({ info }: any) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ paddingTop: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: BRAND_ORANGE, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
        <Lock size={12} /> Paso obligatorio — Configurar afiliado en tu VTEX
      </div>
      <div style={{ fontSize: 12, color: TEXT_SECONDARY, lineHeight: 1.6, marginBottom: 14 }}>
        Además de las credenciales, VTEX exige un paso manual en <strong style={{ color: "#fff" }}>tu panel de VTEX</strong> para que nos
        avise de cada venta en tiempo real. <strong style={{ color: "#fff" }}>Sin esto, la atribución de campañas se rompe.</strong>
      </div>

      <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: TEXT_SECONDARY, lineHeight: 1.7 }}>
        <li>Entrá a <strong style={{ color: "#fff" }}>VTEX Admin</strong> → Configuración tienda → Pedidos → Configuración → tab <strong style={{ color: "#fff" }}>Afiliados</strong>.</li>
        <li>Click en <strong style={{ color: "#fff" }}>Nuevo afiliado</strong> y cargá los siguientes datos:</li>
      </ol>

      <div style={{ marginTop: 12, padding: 14, background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`, borderRadius: 10 }}>
        <DarkField label="ID del afiliado" value={info.affiliateId} hint="3 letras. Si ya tenés un NSL, usá NSL2." />
        <DarkField label="Nombre" value={info.affiliateName} />
        <DarkField label="Email para notificaciones" value={info.notificationEmail} />
        <DarkField
          label="Endpoint de búsqueda (URL del webhook)"
          value={info.webhookUrl}
          copyable
          copied={copied}
          onCopy={() => {
            navigator.clipboard.writeText(info.webhookUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          hint="Pegá esta URL EXACTA, no la edites."
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${BORDER}` }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Política comercial</div>
            <div style={{ fontSize: 11, color: TEXT_SECONDARY }}>La de tu web propia (NO marketplaces externos)</div>
          </div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Versión endpoint</div>
            <div style={{ fontSize: 11, color: TEXT_SECONDARY, fontFamily: "monospace" }}>1.x.x</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 8, fontSize: 11, color: "#FCD34D", lineHeight: 1.6 }}>
        <strong>⚠ Importante:</strong> si ya tenés afiliados (Frávega, Banco Provincia, etc.), NO los toques. Solo agregá uno
        nuevo con el ID <strong>{info.affiliateId}</strong>.
      </div>
    </div>
  );
}

function DarkField({ label, value, hint, copyable, onCopy, copied }: any) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: TEXT_SECONDARY, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
        {copyable && (
          <button
            type="button"
            onClick={onCopy}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 10, color: "#fff", cursor: "pointer" }}
          >
            <Copy size={10} /> {copied ? "Copiado!" : "Copiar"}
          </button>
        )}
      </div>
      <div style={{ padding: "8px 10px", background: "rgba(0,0,0,0.3)", border: `1px solid ${BORDER}`, borderRadius: 7, fontSize: 11, color: "#fff", fontFamily: "monospace", wordBreak: "break-all" }}>
        {value}
      </div>
      {hint && <div style={{ fontSize: 10, color: TEXT_MUTED, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function LightAfiliadoBlock({ info }: any) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-5">
      <div className="flex items-center gap-2 mb-2">
        <span style={{ display: "inline-block", width: 20, height: 20, borderRadius: "50%", background: "#f59e0b" }} />
        <h2 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Paso 2 — Configurar afiliado en VTEX</h2>
      </div>
      <p style={{ fontSize: 12, color: "#334155", lineHeight: 1.6, marginBottom: 16 }}>
        <strong>Este paso es obligatorio y solo lo podés hacer vos desde tu VTEX Admin.</strong> Sin esto,
        VTEX no nos avisa de las órdenes en tiempo real y la atribución de campañas se rompe.
      </p>

      <ol style={{ paddingLeft: 0, margin: 0, marginBottom: 20, listStyle: "none" }}>
        <li style={{ fontSize: 12, color: "#334155", marginBottom: 12 }}>
          <span style={{ display: "inline-block", width: 20, height: 20, borderRadius: "50%", background: "#0f172a", color: "#fff", fontSize: 10, fontWeight: 700, textAlign: "center", lineHeight: "20px", marginRight: 8 }}>1</span>
          Entrá a <strong>VTEX Admin</strong> → <strong>Configuración de la tienda</strong> → <strong>Pedidos</strong> → <strong>Configuración</strong> → tab <strong>Afiliados</strong>.
        </li>
        <li style={{ fontSize: 12, color: "#334155", marginBottom: 12 }}>
          <span style={{ display: "inline-block", width: 20, height: 20, borderRadius: "50%", background: "#0f172a", color: "#fff", fontSize: 10, fontWeight: 700, textAlign: "center", lineHeight: "20px", marginRight: 8 }}>2</span>
          Click en <strong>Nuevo afiliado</strong> y cargá los siguientes datos:
        </li>
      </ol>

      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <LightField label="ID del afiliado" value={info.affiliateId} hint="3 letras. Si ya tenés un NSL, usá NSL2, NSL3, etc." />
        <LightField label="Nombre" value={info.affiliateName} />
        <LightField label="Email para notificaciones" value={info.notificationEmail} hint="VTEX manda emails si el webhook se cae." />
        <LightField
          label="Endpoint de búsqueda (URL del webhook)"
          value={info.webhookUrl}
          copyable
          copied={copied}
          onCopy={() => { navigator.clipboard.writeText(info.webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          hint="Pegá esta URL EXACTA. No la edites."
        />
      </div>

      <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: 12 }}>
        <p style={{ fontSize: 11, color: "#78350f", lineHeight: 1.6, margin: 0 }}>
          <strong>⚠ Importante:</strong> si ya tenés afiliados configurados (Frávega, Banco Provincia, etc.), NO los toques.
          Solo agregá uno nuevo con el ID <strong>{info.affiliateId}</strong> para nosotros.
        </p>
      </div>
    </div>
  );
}

function LightField({ label, value, hint, copyable, onCopy, copied }: any) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: "#334155" }}>{label}</label>
        {copyable && (
          <button
            type="button"
            onClick={onCopy}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", background: "#fff", border: "1px solid #cbd5e1", borderRadius: 4, fontSize: 10, fontWeight: 600, color: "#334155", cursor: "pointer" }}
          >
            <Copy size={10} /> {copied ? "Copiado!" : "Copiar"}
          </button>
        )}
      </div>
      <div style={{ padding: "8px 12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12, color: "#1e293b", fontFamily: "monospace", wordBreak: "break-all" }}>
        {value}
      </div>
      {hint && <p style={{ fontSize: 10, color: "#64748b", marginTop: 4, margin: 0 }}>{hint}</p>}
    </div>
  );
}
