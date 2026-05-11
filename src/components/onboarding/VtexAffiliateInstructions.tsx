// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// VtexAffiliateInstructions
// ══════════════════════════════════════════════════════════════
// Componente unico (DRY) que muestra las instrucciones del paso
// "configurar afiliado en VTEX Admin" — el paso manual obligatorio
// que el cliente tiene que hacer en SU panel VTEX.
//
// Usado en 3 lugares:
//   - OnboardingOverlay.tsx (wizard de onboarding dark)
//   - /settings/integraciones/vtex (settings post-activacion light)
//   - /control/preview/vtex-afiliado (preview admin)
//
// Imagen de referencia: /public/onboarding/vtex-afiliado.png
// (captura de la pantalla VTEX > Afiliados con los campos completados)
// ══════════════════════════════════════════════════════════════

import { useState } from "react";
import { Copy, Lock, AlertCircle } from "lucide-react";

export interface AffiliateInfo {
  webhookUrl: string;
  affiliateId: string;
  affiliateName: string;
  notificationEmail: string;
}

interface Props {
  info: AffiliateInfo | null;
  theme: "dark" | "light";
}

export default function VtexAffiliateInstructions({ info, theme }: Props) {
  const [copied, setCopied] = useState(false);

  if (!info) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(info.webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isDark = theme === "dark";

  // Palette
  const palette = isDark
    ? {
        accent: "#FF5E1A",
        bg: "transparent",
        cardBg: "rgba(255,255,255,0.03)",
        cardBorder: "rgba(255,255,255,0.08)",
        textPrimary: "#FFFFFF",
        textSecondary: "#9CA3AF",
        textMuted: "#6B7280",
        inputBg: "rgba(0,0,0,0.3)",
        warnBg: "rgba(245,158,11,0.08)",
        warnBorder: "rgba(245,158,11,0.3)",
        warnText: "#FCD34D",
        stepBg: "#0f172a",
        stepText: "#fff",
        copyBg: "rgba(255,255,255,0.05)",
      }
    : {
        accent: "#0f172a",
        bg: "#fffbeb",
        cardBg: "#fff",
        cardBorder: "#e2e8f0",
        textPrimary: "#0f172a",
        textSecondary: "#334155",
        textMuted: "#64748b",
        inputBg: "#f8fafc",
        warnBg: "#fffbeb",
        warnBorder: "#fde68a",
        warnText: "#78350f",
        stepBg: "#0f172a",
        stepText: "#fff",
        copyBg: "#fff",
      };

  return (
    <div
      style={{
        marginTop: isDark ? 24 : 16,
        paddingTop: isDark ? 18 : 0,
        borderTop: isDark ? `1px dashed ${palette.cardBorder}` : "none",
        background: isDark ? "transparent" : "rgba(245, 158, 11, 0.06)",
        border: isDark ? "none" : "1px solid #fde68a",
        borderRadius: isDark ? 0 : 16,
        padding: isDark ? "18px 0 0 0" : 24,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        {isDark ? <Lock size={12} color={palette.accent} /> : <AlertCircle size={20} color="#d97706" />}
        <div
          style={{
            fontSize: isDark ? 11 : 14,
            fontWeight: 700,
            color: isDark ? palette.accent : palette.textPrimary,
            textTransform: isDark ? "uppercase" : "none",
            letterSpacing: isDark ? "0.08em" : "normal",
          }}
        >
          Paso obligatorio — Configurar afiliado en tu VTEX
        </div>
      </div>

      {/* Por qué */}
      <p style={{ fontSize: 12, color: palette.textSecondary, lineHeight: 1.6, margin: "0 0 16px 0" }}>
        VTEX necesita que vos crees un <strong style={{ color: palette.textPrimary }}>"Afiliado"</strong> en
        tu panel para que nos avise de cada venta en tiempo real. Sin este paso, NitroSales no puede atribuir
        correctamente tus ventas a las campañas que las generaron.
      </p>

      {/* Layout: instrucciones a la izquierda + captura a la derecha */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "start" }}>
        {/* COLUMNA IZQ — pasos numerados + datos */}
        <div>
          <ol style={{ paddingLeft: 0, margin: 0, listStyle: "none" }}>
            <StepRow num={1} palette={palette}>
              Entrá a tu <strong style={{ color: palette.textPrimary }}>VTEX Admin</strong> → Configuración de la tienda → Pedidos → <strong style={{ color: palette.textPrimary }}>Configuración</strong> → tab <strong style={{ color: palette.textPrimary }}>Afiliados</strong>.
            </StepRow>
            <StepRow num={2} palette={palette}>
              Click en el botón verde <strong style={{ color: palette.textPrimary }}>"+ Nuevo afiliado"</strong> (arriba a la derecha).
            </StepRow>
            <StepRow num={3} palette={palette}>
              Completá los campos con estos datos exactos:
            </StepRow>
          </ol>

          {/* Datos del afiliado */}
          <div
            style={{
              marginTop: 12,
              padding: 14,
              background: palette.cardBg,
              border: `1px solid ${palette.cardBorder}`,
              borderRadius: 10,
            }}
          >
            <DataField palette={palette} label="Nombre" value={info.affiliateName} />
            <DataField palette={palette} label="ID" value={info.affiliateId} hint="3 letras (si ya tenés un NSL en tu cuenta, usá NSL2)." />
            <DataField palette={palette} label="Política comercial" value="1" hint="Generalmente es 1 (web propia)." />
            <DataField palette={palette} label="Email para notificaciones" value={info.notificationEmail} />
            <DataField
              palette={palette}
              label="Endpoint de busca"
              value={info.webhookUrl}
              copyable
              copied={copied}
              onCopy={handleCopy}
              hint="Pegá esta URL exacta, no la edites."
            />
            <DataField palette={palette} label="Versión del endpoint de busca" value="1.x.x" hint="Elegí esa opción del dropdown." />

            <div
              style={{
                marginTop: 10,
                paddingTop: 10,
                borderTop: `1px dashed ${palette.cardBorder}`,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: palette.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: 4,
                }}
              >
                Checkbox "Utilizar mi medio de pago"
              </div>
              <div style={{ fontSize: 11, color: palette.textSecondary, lineHeight: 1.5 }}>
                <strong style={{ color: palette.textPrimary }}>Dejalo SIN tildar.</strong> No es necesario para NitroSales.
              </div>
            </div>
          </div>

          <ol style={{ paddingLeft: 0, margin: "14px 0 0 0", listStyle: "none" }} start={4}>
            <StepRow num={4} palette={palette}>
              Apretá el botón azul <strong style={{ color: palette.textPrimary }}>"Guardar"</strong>.
            </StepRow>
            <StepRow num={5} palette={palette}>
              Listo. Desde la próxima venta, vas a ver la atribución completa en NitroSales.
            </StepRow>
          </ol>
        </div>

        {/* COLUMNA DER — captura visual */}
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: palette.textMuted,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 8,
            }}
          >
            Así debe quedar tu pantalla
          </div>
          <div
            style={{
              border: `1px solid ${palette.cardBorder}`,
              borderRadius: 10,
              overflow: "hidden",
              background: isDark ? "rgba(0,0,0,0.2)" : "#fff",
            }}
          >
            <img
              src="/onboarding/vtex-afiliado.png"
              alt="VTEX Admin - Configuración de afiliado NitroSales"
              style={{ width: "100%", height: "auto", display: "block" }}
              onError={(e: any) => {
                e.target.style.display = "none";
                const fallback = e.target.nextElementSibling;
                if (fallback) fallback.style.display = "flex";
              }}
            />
            <div
              style={{
                display: "none",
                padding: 24,
                textAlign: "center",
                fontSize: 11,
                color: palette.textMuted,
                background: isDark ? "rgba(0,0,0,0.2)" : "#f8fafc",
                minHeight: 220,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ fontSize: 24, opacity: 0.5 }}>📷</div>
              <div>Captura pendiente</div>
              <div style={{ fontSize: 10, opacity: 0.7 }}>
                Guardar imagen en <code>/public/onboarding/vtex-afiliado.png</code>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Warning final */}
      <div
        style={{
          marginTop: 16,
          padding: "10px 14px",
          background: palette.warnBg,
          border: `1px solid ${palette.warnBorder}`,
          borderRadius: 8,
          fontSize: 11,
          color: palette.warnText,
          lineHeight: 1.6,
        }}
      >
        <strong>⚠ Importante:</strong> si ya tenés afiliados configurados (Frávega, Banco Provincia, Google
        Shopping, etc.), NO los toques ni los borres. Solo agregá <strong>uno nuevo</strong> con el ID{" "}
        <strong>{info.affiliateId}</strong>.
      </div>
    </div>
  );
}

// ─── Helpers ───

function StepRow({ num, children, palette }: any) {
  return (
    <li style={{ fontSize: 12, color: palette.textSecondary, marginBottom: 10, lineHeight: 1.6 }}>
      <span
        style={{
          display: "inline-block",
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: palette.stepBg,
          color: palette.stepText,
          fontSize: 10,
          fontWeight: 700,
          textAlign: "center",
          lineHeight: "18px",
          marginRight: 8,
          verticalAlign: "middle",
        }}
      >
        {num}
      </span>
      {children}
    </li>
  );
}

function DataField({ palette, label, value, hint, copyable, onCopy, copied }: any) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 4,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: palette.textSecondary,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {label}
        </div>
        {copyable && (
          <button
            type="button"
            onClick={onCopy}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 8px",
              background: palette.copyBg,
              border: `1px solid ${palette.cardBorder}`,
              borderRadius: 6,
              fontSize: 10,
              fontWeight: 600,
              color: palette.textPrimary,
              cursor: "pointer",
            }}
          >
            <Copy size={10} /> {copied ? "Copiado!" : "Copiar"}
          </button>
        )}
      </div>
      <div
        style={{
          padding: "7px 10px",
          background: palette.inputBg,
          border: `1px solid ${palette.cardBorder}`,
          borderRadius: 7,
          fontSize: 11,
          color: palette.textPrimary,
          fontFamily: "monospace",
          wordBreak: "break-all",
        }}
      >
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: 10, color: palette.textMuted, marginTop: 3 }}>{hint}</div>
      )}
    </div>
  );
}
