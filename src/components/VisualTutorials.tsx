// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// VisualTutorials v2 — highlights con refs dinámicos
// ══════════════════════════════════════════════════════════════
// Rediseño técnico: en vez de posicionar el HighlightRing con
// coordenadas hardcoded (que siempre quedaban mal alineadas), ahora cada
// elemento a destacar se envuelve en <HighlightTarget label="..."> y el
// ring se dibuja EXACTAMENTE sobre ese elemento usando position: absolute
// inset: -4px. Así siempre queda bien sin importar cambios de tamaño.
// ══════════════════════════════════════════════════════════════

import React, { useState, useEffect } from "react";
import { ChevronRight, ChevronLeft, MousePointer2, ExternalLink } from "lucide-react";
import type { BrandKey } from "./BrandLogo";

const BORDER = "rgba(255,255,255,0.08)";
const TEXT_PRIMARY = "#FFFFFF";
const TEXT_SECONDARY = "#9CA3AF";
const TEXT_MUTED = "#6B7280";
const BRAND_ORANGE = "#FF5E1A";

// ═══════════════════════════════════════════════════════════════
// Highlight component — se envuelve alrededor del elemento a destacar
// ═══════════════════════════════════════════════════════════════

function HighlightTarget({ children, label, labelPosition = "bottom" }: { children: React.ReactNode; label?: string; labelPosition?: "top" | "bottom" | "right" | "left" }) {
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      {children}
      {/* Ring pulsante que cubre exactamente el elemento */}
      <span
        style={{
          position: "absolute",
          inset: -4,
          border: `2px solid ${BRAND_ORANGE}`,
          borderRadius: 6,
          animation: "highlightPulse 1.8s ease-in-out infinite",
          pointerEvents: "none",
          zIndex: 3,
        }}
      />
      {/* Label tooltip */}
      {label && (
        <span
          style={{
            position: "absolute",
            ...(labelPosition === "bottom" && { top: "calc(100% + 8px)", left: 0 }),
            ...(labelPosition === "top" && { bottom: "calc(100% + 8px)", left: 0 }),
            ...(labelPosition === "right" && { top: "50%", left: "calc(100% + 8px)", transform: "translateY(-50%)" }),
            ...(labelPosition === "left" && { top: "50%", right: "calc(100% + 8px)", transform: "translateY(-50%)" }),
            padding: "3px 8px",
            background: BRAND_ORANGE,
            color: "#fff",
            fontSize: 9,
            fontWeight: 700,
            borderRadius: 5,
            whiteSpace: "nowrap",
            zIndex: 4,
            boxShadow: "0 4px 12px rgba(255,94,26,0.4)",
            pointerEvents: "none",
          }}
        >
          {label}
        </span>
      )}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════
// Browser frame
// ═══════════════════════════════════════════════════════════════

function BrowserFrame({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <div style={{
      borderRadius: 10,
      overflow: "hidden",
      border: `1px solid ${BORDER}`,
      background: "#1a1a22",
      boxShadow: "0 20px 50px rgba(0,0,0,0.4)",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        background: "#2a2a34",
        borderBottom: `1px solid ${BORDER}`,
      }}>
        <div style={{ display: "flex", gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#FF5F57" }} />
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#FEBC2E" }} />
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#28C840" }} />
        </div>
        <div style={{
          flex: 1,
          padding: "4px 10px",
          background: "#1a1a22",
          borderRadius: 6,
          fontSize: 10,
          color: "#71717A",
          fontFamily: "'SF Mono', Menlo, monospace",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          🔒 {url}
        </div>
      </div>
      <div style={{ position: "relative", minHeight: 200, background: "#ffffff", overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Main entry
// ═══════════════════════════════════════════════════════════════

export function VisualTutorial({ platformKey }: { platformKey: BrandKey }) {
  const [step, setStep] = useState(0);
  useEffect(() => { setStep(0); }, [platformKey]);

  const steps = TUTORIAL_STEPS[platformKey] || [];
  const total = steps.length;
  const current = steps[step];

  if (total === 0) return null;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#818CF8", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>
          Tutorial visual · paso {step + 1} de {total}
        </div>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: "#fff", margin: 0, letterSpacing: "-0.01em" }}>
          {current.title}
        </h3>
        {current.subtitle && (
          <p style={{ fontSize: 12, color: TEXT_SECONDARY, margin: "4px 0 0", lineHeight: 1.5 }}>
            {current.subtitle}
          </p>
        )}
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
        {steps.map((_, i) => (
          <div
            key={i}
            onClick={() => setStep(i)}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              background: i === step ? BRAND_ORANGE : i < step ? "rgba(255,94,26,0.35)" : "rgba(255,255,255,0.08)",
              cursor: "pointer",
              transition: "all 200ms",
            }}
          />
        ))}
      </div>

      <div style={{ marginBottom: 14 }}>
        {current.mockup}
      </div>

      {current.explanation && (
        <div style={{
          padding: "10px 12px",
          background: "rgba(129,140,248,0.06)",
          border: "1px solid rgba(129,140,248,0.2)",
          borderRadius: 8,
          fontSize: 11,
          color: TEXT_SECONDARY,
          lineHeight: 1.6,
          marginBottom: 12,
        }}>
          {current.explanation}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
          style={navBtnStyle(step === 0)}
        >
          <ChevronLeft size={14} />
          Atrás
        </button>
        <button
          onClick={() => setStep(Math.min(total - 1, step + 1))}
          disabled={step >= total - 1}
          style={navBtnStyle(step >= total - 1)}
        >
          Siguiente
          <ChevronRight size={14} />
        </button>
      </div>

      {current.docUrl && (
        <a
          href={current.docUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            marginTop: 14,
            fontSize: 11,
            color: "#A5B4FC",
            textDecoration: "none",
            padding: "8px 12px",
            background: "rgba(99,102,241,0.06)",
            border: "1px solid rgba(99,102,241,0.2)",
            borderRadius: 8,
            width: "100%",
            boxSizing: "border-box",
            justifyContent: "center",
          }}
        >
          Ver doc oficial <ExternalLink size={11} />
        </a>
      )}

      <style jsx global>{`
        @keyframes highlightPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,94,26,0.7), 0 0 0 0 rgba(255,94,26,0.4); }
          50% { box-shadow: 0 0 0 6px rgba(255,94,26,0), 0 0 0 14px rgba(255,94,26,0); }
        }
      `}</style>
    </div>
  );
}

function navBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: "8px 10px",
    background: "rgba(255,255,255,0.03)",
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    color: disabled ? TEXT_MUTED : TEXT_PRIMARY,
    fontSize: 11,
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  };
}

// ═══════════════════════════════════════════════════════════════
// Tutorial steps per platform
// ═══════════════════════════════════════════════════════════════

interface TutorialStep {
  title: string;
  subtitle?: string;
  mockup: React.ReactNode;
  explanation?: string;
  docUrl?: string;
}

const TUTORIAL_STEPS: Record<string, TutorialStep[]> = {

  // ─────────── VTEX ───────────
  VTEX: [
    {
      title: "Abrí tu admin VTEX",
      subtitle: "Buscá 'Account' en el menú lateral",
      mockup: (
        <BrowserFrame url="https://{tu-cuenta}.myvtex.com/admin">
          <div style={{ padding: 16, color: "#333" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ width: 24, height: 24, borderRadius: 5, background: "#FF3366" }} />
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>VTEX Admin</div>
            </div>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ width: 130, background: "#F5F5F7", borderRadius: 6, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "#888" }}>ORDERS</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: "#888" }}>CATALOG</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: "#888" }}>CUSTOMERS</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: "#888" }}>MARKETING</div>
                <HighlightTarget label="Click acá">
                  <span style={{ display: "inline-block", fontSize: 10, fontWeight: 700, color: "#FF3366", padding: "4px 8px", background: "rgba(255,51,102,0.08)", borderRadius: 4 }}>
                    ACCOUNT
                  </span>
                </HighlightTarget>
              </div>
              <div style={{ flex: 1, fontSize: 11, color: "#888" }}>
                <div style={{ marginBottom: 8 }}>Dashboard</div>
                <div style={{ padding: 12, background: "#F8F8FA", borderRadius: 6 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a" }}>247</div>
                  <div style={{ fontSize: 9 }}>Pedidos · 24hs</div>
                </div>
              </div>
            </div>
          </div>
        </BrowserFrame>
      ),
      explanation: "En el menú lateral izquierdo, buscá la sección 'Account' (Cuenta). Ahí vas a encontrar 'Application Keys'.",
    },
    {
      title: "Tu lista de App Keys",
      subtitle: "Screenshot oficial de la doc de VTEX",
      mockup: (
        <img
          src="https://cdn.statically.io/gh/vtexdocs/help-center-content@refs/heads/main/docs/en/tutorials/account-management/api-keys/api-keys_2.png"
          alt="VTEX App Keys management"
          style={{ width: "100%", display: "block", background: "#fff" }}
          onError={(e) => {
            const img = e.currentTarget as HTMLImageElement;
            img.style.display = "none";
            const fb = img.nextElementSibling as HTMLElement | null;
            if (fb) fb.style.display = "block";
          }}
        />
      ),
      explanation: "Esta es la pantalla oficial de 'API Keys' en VTEX. Click en 'Generate New' (arriba a la derecha) para crear una nueva.",
      docUrl: "https://help.vtex.com/en/tutorial/application-keys--2iffYzlvvz4BDMr6WGUtet",
    },
    {
      title: "Asignar rol y generar",
      subtitle: "Rol recomendado: Owner (Admin Super)",
      mockup: (
        <BrowserFrame url="{tu-cuenta}.myvtex.com/admin/account/api-keys">
          <div style={{ padding: 18, background: "#fff" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", marginBottom: 14 }}>
              Crear nueva App Key
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>Label</div>
              <div style={{ padding: "8px 10px", background: "#F5F5F7", borderRadius: 4, fontSize: 11, color: "#1a1a1a", border: "1px solid #E4E4E7" }}>
                NitroSales
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>Roles</div>
              <HighlightTarget label="Seleccioná Owner" labelPosition="bottom">
                <span style={{ display: "inline-block", padding: "8px 14px", background: "#fff", border: "1px solid #E4E4E7", borderRadius: 4, fontSize: 11, color: "#1a1a1a", fontWeight: 600 }}>
                  Owner (Admin Super) ✓
                </span>
              </HighlightTarget>
            </div>
            <div style={{ marginTop: 40 }}>
              <button style={{
                padding: "8px 18px",
                background: "#FF3366",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
              }}>
                Generate
              </button>
            </div>
          </div>
        </BrowserFrame>
      ),
      explanation: "Escribí 'NitroSales' como label. Asigná el rol 'Owner (Admin Super)'. Click 'Generate' y copiá las credenciales — el Token se muestra una sola vez.",
      docUrl: "https://developers.vtex.com/docs/guides/api-authentication-using-application-keys",
    },
  ],

  // ─────────── MERCADOLIBRE ───────────
  MERCADOLIBRE: [
    {
      title: "Tu usuario arriba a la derecha",
      subtitle: "Entrá a mercadolibre.com.ar logueado",
      mockup: (
        <BrowserFrame url="https://www.mercadolibre.com.ar">
          {/* Header amarillo de ML */}
          <div style={{ padding: 12, background: "#FFE600", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 40, height: 24, background: "#fff", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: "#2D3277" }}>
              ML
            </div>
            <div style={{ flex: 1, padding: "5px 10px", background: "#fff", borderRadius: 4, fontSize: 10, color: "#999" }}>
              Buscar productos…
            </div>
            <HighlightTarget label="Tu usuario acá">
              <span style={{ display: "inline-block", padding: "5px 12px", background: "#fff", borderRadius: 4, fontSize: 11, color: "#2D3277", fontWeight: 600 }}>
                @tuusuario
              </span>
            </HighlightTarget>
          </div>
          <div style={{ padding: 20, color: "#333" }}>
            <div style={{ fontSize: 11, color: "#999", marginBottom: 10 }}>Inicio</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
              {[0,1,2,3,4,5,6,7].map((i) => (
                <div key={i} style={{ aspectRatio: "1", background: "#F5F5F7", borderRadius: 4 }} />
              ))}
            </div>
          </div>
        </BrowserFrame>
      ),
      explanation: "Cuando estás logueado, arriba a la derecha ves tu usuario. Copialo sin la '@' (solo el texto).",
    },
  ],

  // ─────────── META ADS ───────────
  META_ADS: [
    {
      title: "Ad Account ID en Business Manager",
      subtitle: "Configuración → Cuentas publicitarias",
      mockup: (
        <BrowserFrame url="business.facebook.com/settings/ad-accounts">
          <div style={{ padding: 12, background: "#1877F2", color: "#fff", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>Meta Business</div>
          </div>
          <div style={{ display: "flex", minHeight: 220, background: "#F0F2F5" }}>
            <div style={{ width: 130, background: "#fff", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#65676B" }}>📊 Campañas</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#65676B" }}>💰 Facturación</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#65676B" }}>👥 Usuarios</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#1877F2", padding: "4px 6px", background: "rgba(24,119,242,0.08)", borderRadius: 4 }}>
                ⚙️ Configuración
              </div>
            </div>
            <div style={{ flex: 1, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>
                Cuentas publicitarias
              </div>
              <div style={{ padding: 12, background: "#fff", borderRadius: 6, border: "1px solid #E4E6EB" }}>
                <div style={{ fontSize: 11, color: "#1a1a1a", fontWeight: 600, marginBottom: 6 }}>Mi Ecommerce</div>
                <div style={{ fontSize: 10, color: "#65676B", marginBottom: 4 }}>ID de la cuenta:</div>
                <HighlightTarget label="Copiá este número">
                  <span style={{
                    display: "inline-block",
                    padding: "4px 10px",
                    background: "#F0F2F5",
                    borderRadius: 4,
                    fontFamily: "'SF Mono', Menlo, monospace",
                    fontSize: 11,
                    color: "#1877F2",
                    fontWeight: 600,
                  }}>
                    act_123456789
                  </span>
                </HighlightTarget>
              </div>
            </div>
          </div>
        </BrowserFrame>
      ),
      explanation: "Copiá solo los números (sin el prefijo 'act_'). Ejemplo: si dice 'act_123456789', pegás '123456789' en NitroSales.",
    },
    {
      title: "Generar System User Token",
      subtitle: "Configuración → Usuarios del sistema",
      mockup: (
        <BrowserFrame url="business.facebook.com/settings/system-users">
          <div style={{ padding: 18, background: "#fff" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", marginBottom: 14 }}>
              Usuarios del sistema
            </div>
            <div style={{ padding: 12, background: "#F0F2F5", borderRadius: 6, marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#1877F2", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>
                  NS
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#1a1a1a" }}>NitroSales</div>
                  <div style={{ fontSize: 9, color: "#65676B" }}>Administrador · Ad Account asignada</div>
                </div>
              </div>
            </div>
            <HighlightTarget label="Click acá">
              <span style={{
                display: "inline-block",
                padding: "8px 18px",
                background: "#1877F2",
                color: "#fff",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 700,
              }}>
                Generar token
              </span>
            </HighlightTarget>
          </div>
        </BrowserFrame>
      ),
      explanation: "Creá un System User 'NitroSales' con rol Admin, asignale tu Ad Account con Acceso completo, y generá el token con permisos: ads_read, ads_management, business_management.",
      docUrl: "https://developers.facebook.com/docs/marketing-api/system-users",
    },
  ],

  // ─────────── META PIXEL ───────────
  META_PIXEL: [
    {
      title: "Pixel ID en Events Manager",
      subtitle: "business.facebook.com/events_manager",
      mockup: (
        <BrowserFrame url="business.facebook.com/events_manager">
          <div style={{ display: "flex", minHeight: 220 }}>
            <div style={{ width: 130, background: "#F0F2F5", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>Fuentes de datos</div>
              <div style={{ padding: "6px 8px", background: "#fff", borderRadius: 4, fontSize: 10, color: "#1a1a1a", display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, background: "#1877F2" }} />
                Mi Pixel
              </div>
            </div>
            <div style={{ flex: 1, padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>Mi Pixel</div>
              <div style={{ fontSize: 10, color: "#65676B", marginBottom: 4 }}>ID del pixel:</div>
              <div style={{ marginBottom: 14 }}>
                <HighlightTarget label="15-16 dígitos">
                  <span style={{
                    display: "inline-block",
                    fontFamily: "'SF Mono', Menlo, monospace",
                    fontSize: 12,
                    color: "#1877F2",
                    fontWeight: 700,
                    padding: "2px 6px",
                    background: "#F0F2F5",
                    borderRadius: 4,
                  }}>
                    1234567890123456
                  </span>
                </HighlightTarget>
              </div>
              <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #E4E6EB", marginBottom: 10 }}>
                <div style={{ padding: "6px 10px", fontSize: 10, color: "#65676B" }}>Resumen</div>
                <div style={{ padding: "6px 10px", fontSize: 10, color: "#1877F2", borderBottom: "2px solid #1877F2", fontWeight: 700 }}>
                  Configuración
                </div>
              </div>
              <div style={{ fontSize: 11, color: "#1a1a1a", fontWeight: 600, marginBottom: 6 }}>
                Conversions API
              </div>
              <button style={{
                padding: "6px 12px",
                background: "#1877F2",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 700,
              }}>
                Generar token de acceso
              </button>
            </div>
          </div>
        </BrowserFrame>
      ),
      explanation: "Seleccioná tu pixel → copiá el ID (15-16 dígitos). Después: pestaña Configuración → Conversions API → Generar token de acceso.",
    },
  ],

  // ─────────── GOOGLE ADS ───────────
  GOOGLE_ADS: [
    {
      title: "Customer ID arriba a la derecha",
      subtitle: "Formato 123-456-7890",
      mockup: (
        <BrowserFrame url="https://ads.google.com">
          <div style={{ padding: 10, background: "#fff", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #E0E0E0" }}>
            <svg width="24" height="24" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M3.9998 22.9291C1.7908 22.9291 0 21.1383 0 18.9293s1.7908-3.9998 3.9998-3.9998 3.9998 1.7908 3.9998 3.9998-1.7908 3.9998-3.9998 3.9998z" />
              <path fill="#FBBC04" d="M23.4641 16.9287L15.4632 3.072C14.3586 1.1587 11.9121.5028 9.9988 1.6074S7.4295 5.1585 8.5341 7.0718l8.0009 13.8567c1.1046 1.9133 3.5511 2.5679 5.4644 1.4646 1.9134-1.1046 2.568-3.5511 1.4647-5.4644z" />
              <path fill="#34A853" d="M7.5137 4.8438L1.5645 15.1484A4.5 4.5 0 0 1 4 14.4297c2.5597-.0075 4.6248 2.1585 4.4941 4.7148l3.2168-5.5723-3.6094-6.25c-.4499-.7793-.6322-1.6394-.5878-2.4784z" />
            </svg>
            <div style={{ fontSize: 12, fontWeight: 500, color: "#3c4043", flex: 1 }}>Google Ads</div>
            <HighlightTarget label="Copiá estos 10 dígitos (sin guiones)">
              <span style={{
                display: "inline-block",
                padding: "5px 12px",
                background: "#E8F0FE",
                borderRadius: 4,
                fontSize: 11,
                color: "#1a73e8",
                fontWeight: 600,
                fontFamily: "'SF Mono', Menlo, monospace",
              }}>
                123-456-7890
              </span>
            </HighlightTarget>
          </div>
          <div style={{ padding: 20, color: "#3c4043" }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Campañas activas</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[1,2,3].map((i) => (
                <div key={i} style={{ padding: 10, background: "#f8f9fa", borderRadius: 6, fontSize: 11 }}>
                  Campaign {i}
                </div>
              ))}
            </div>
          </div>
        </BrowserFrame>
      ),
      explanation: "Arriba a la derecha de Google Ads ves el número en formato 123-456-7890. Copiá SOLO los dígitos (sin los guiones). Ejemplo: 1234567890.",
      docUrl: "https://support.google.com/google-ads/answer/1704344",
    },
  ],

  // ─────────── GSC ───────────
  GSC: [
    {
      title: "Selector de propiedades",
      subtitle: "Arriba a la izquierda en Search Console",
      mockup: (
        <BrowserFrame url="search.google.com/search-console">
          <div style={{ display: "flex", minHeight: 220, background: "#fff" }}>
            <div style={{ width: 56, background: "#202124" }} />
            <div style={{ flex: 1, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <svg width="22" height="22" viewBox="0 0 100 100">
                  <rect x="62" y="8" width="28" height="80" rx="14" fill="#4285F4" />
                  <rect x="36" y="22" width="26" height="66" rx="13" fill="#34A853" />
                  <circle cx="28" cy="54" r="20" fill="#FBBC04" />
                  <path d="M 28 54 L 48 54 A 20 20 0 0 1 28 74 Z" fill="#EA4335" />
                  <line x1="14" y1="68" x2="4" y2="86" stroke="#FBBC04" strokeWidth="9" strokeLinecap="round" />
                </svg>
                <div style={{ fontSize: 12, fontWeight: 500, color: "#3c4043" }}>Search Console</div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <HighlightTarget label="Copiá la URL completa">
                  <span style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 12px",
                    background: "#F8F9FA",
                    border: "1px solid #DADCE0",
                    borderRadius: 4,
                    fontSize: 11,
                    color: "#3c4043",
                    fontFamily: "'SF Mono', Menlo, monospace",
                    minWidth: 260,
                  }}>
                    <span style={{ flex: 1 }}>https://www.tutienda.com/</span>
                    <span style={{ fontSize: 9, color: "#5f6368" }}>▾</span>
                  </span>
                </HighlightTarget>
              </div>
              <div style={{ fontSize: 11, color: "#5f6368", marginBottom: 8 }}>Rendimiento · últimos 28 días</div>
              <div style={{ padding: 10, background: "#f8f9fa", borderRadius: 6, display: "inline-block" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#1a73e8" }}>8,234</div>
                <div style={{ fontSize: 10, color: "#5f6368" }}>Total clicks</div>
              </div>
            </div>
          </div>
        </BrowserFrame>
      ),
      explanation: "Arriba a la izquierda, el selector de propiedades. Abrilo y copiá la URL EXACTA de tu propiedad (con https:// y barra final si corresponde).",
      docUrl: "https://support.google.com/webmasters/answer/34592",
    },
  ],

  // ─────────── NITROPIXEL ───────────
  NITROPIXEL: [
    {
      title: "Pegá el snippet en GTM",
      subtitle: "Custom HTML tag con trigger All Pages",
      mockup: (
        <BrowserFrame url="tagmanager.google.com">
          <div style={{ padding: 14, background: "#fff", minHeight: 220 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 14, borderBottom: "1px solid #E0E0E0", paddingBottom: 10 }}>
              <div style={{ padding: "4px 10px", background: "#1A73E8", color: "#fff", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>Tags</div>
              <div style={{ padding: "4px 10px", fontSize: 10, color: "#5f6368" }}>Triggers</div>
              <div style={{ padding: "4px 10px", fontSize: 10, color: "#5f6368" }}>Variables</div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#202124", marginBottom: 12 }}>
              Configuración del tag
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 9, color: "#5f6368", marginBottom: 3 }}>Tipo de tag</div>
              <HighlightTarget label="Seleccioná Custom HTML">
                <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  background: "#F8F9FA",
                  border: "1px solid #DADCE0",
                  borderRadius: 4,
                  fontSize: 11,
                  color: "#202124",
                }}>
                  ⟨⟩ Custom HTML
                </span>
              </HighlightTarget>
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 9, color: "#5f6368", marginBottom: 3 }}>HTML</div>
              <div style={{
                padding: "8px 10px",
                background: "#202124",
                borderRadius: 4,
                fontSize: 9,
                color: "#8AB4F8",
                fontFamily: "'SF Mono', Menlo, monospace",
                lineHeight: 1.5,
              }}>
                {"<script src=\"...nitrosales.ai...\" async></script>"}
              </div>
            </div>
            <div style={{ fontSize: 10, color: "#5f6368", marginTop: 8 }}>
              Trigger: <strong style={{ color: "#202124" }}>All Pages</strong>
            </div>
          </div>
        </BrowserFrame>
      ),
      explanation: "En GTM: Tags → Nueva tag → Custom HTML → pegá el snippet que está en la columna del centro → Trigger: All Pages → Guardar y publicar.",
    },
    {
      title: "Nosotros validamos en tiempo real",
      subtitle: "Cuando tu sitio empiece a enviar pings",
      mockup: (
        <BrowserFrame url="nitrosales.ai/control/clientes">
          <div style={{ padding: 16, background: "#0F0F11", color: "#fff", minHeight: 220 }}>
            <div style={{ fontSize: 10, color: "#71717A", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
              Actividad NitroPixel · en vivo
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                { t: "hace 2s", e: "PageView" },
                { t: "hace 8s", e: "AddToCart" },
                { t: "hace 14s", e: "PageView" },
                { t: "hace 22s", e: "Purchase" },
              ].map((evt, i) => (
                <div key={i} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "6px 10px",
                  background: "rgba(34,197,94,0.06)",
                  border: "1px solid rgba(34,197,94,0.18)",
                  borderRadius: 6,
                }}>
                  <div style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#22C55E",
                    animation: "highlightPulse 1.5s ease-in-out infinite",
                  }} />
                  <div style={{ fontSize: 11, color: "#fff", flex: 1, fontWeight: 500 }}>{evt.e}</div>
                  <div style={{ fontSize: 9, color: "#71717A" }}>{evt.t}</div>
                </div>
              ))}
            </div>
          </div>
        </BrowserFrame>
      ),
      explanation: "Cuando tu sitio empiece a mandar pings, nosotros los vemos en tiempo real. Apenas vemos actividad válida, aprobamos tu cuenta automáticamente.",
    },
  ],
};
