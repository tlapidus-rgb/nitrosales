// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// VisualTutorials — mockups premium para cada plataforma
// ══════════════════════════════════════════════════════════════
// Para cada plataforma mostramos el "camino visual" que tiene que seguir
// el cliente para encontrar cada credencial. Mezclamos:
//   - Browser chrome realista (URL, tabs, botones)
//   - Contenido estilizado de la UI real (colores, layout, elementos clave)
//   - Highlight animado (ring pulsante) sobre el elemento que tiene que tocar
//   - Screenshots reales donde los tengo (VTEX doc oficial)
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
// Main entry
// ═══════════════════════════════════════════════════════════════

export function VisualTutorial({ platformKey }: { platformKey: BrandKey }) {
  const [step, setStep] = useState(0);

  // Reset step when platform changes
  useEffect(() => { setStep(0); }, [platformKey]);

  const steps = TUTORIAL_STEPS[platformKey] || [];
  const total = steps.length;
  const current = steps[step];

  if (total === 0) return null;

  return (
    <div>
      {/* Header */}
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

      {/* Progress dots */}
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

      {/* Mockup */}
      <div style={{ marginBottom: 14 }}>
        {current.mockup}
      </div>

      {/* Explanation */}
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

      {/* Nav buttons */}
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
        @keyframes arrowBob {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(-4px, 0); }
        }
        @keyframes cursorNudge {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(2px, 2px); }
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
// Browser frame wrapper
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
      {/* Chrome/top bar */}
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
          letterSpacing: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          🔒 {url}
        </div>
      </div>
      {/* Content */}
      <div style={{ position: "relative", minHeight: 180, background: "#ffffff" }}>
        {children}
      </div>
    </div>
  );
}

// ─── Highlight ring animated ───────────────────────────────────
function HighlightRing({ top, left, width, height, label }: { top: number; left: number; width: number; height: number; label?: string }) {
  return (
    <>
      <div
        style={{
          position: "absolute",
          top, left, width, height,
          border: `2px solid ${BRAND_ORANGE}`,
          borderRadius: 6,
          animation: "highlightPulse 1.8s ease-in-out infinite",
          pointerEvents: "none",
          zIndex: 3,
        }}
      />
      {label && (
        <div
          style={{
            position: "absolute",
            top: top + height + 6,
            left,
            padding: "3px 8px",
            background: BRAND_ORANGE,
            color: "#fff",
            fontSize: 9,
            fontWeight: 700,
            borderRadius: 5,
            whiteSpace: "nowrap",
            zIndex: 4,
            boxShadow: "0 4px 12px rgba(255,94,26,0.4)",
          }}
        >
          {label}
        </div>
      )}
    </>
  );
}

// ─── Cursor pointer flotante (bob animation) ──────────────────
function HoverCursor({ top, left }: { top: number; left: number }) {
  return (
    <div
      style={{
        position: "absolute",
        top, left,
        zIndex: 5,
        animation: "cursorNudge 1.2s ease-in-out infinite",
        pointerEvents: "none",
      }}
    >
      <MousePointer2 size={18} fill="#fff" color="#000" strokeWidth={1.5} />
    </div>
  );
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
  VTEX: [
    {
      title: "Abrí tu admin VTEX",
      subtitle: "Reemplazá {tu-cuenta} por tu subdomain",
      mockup: (
        <BrowserFrame url="https://arredo.myvtex.com/admin">
          <div style={{ padding: 20, color: "#333" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: "#FF3366" }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>VTEX Admin</div>
            </div>
            <div style={{ display: "flex", gap: 14 }}>
              <div style={{ width: 120, background: "#F5F5F7", borderRadius: 6, padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "#666" }}>ORDERS</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: "#666" }}>CATALOG</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: "#666" }}>CUSTOMERS</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: "#666" }}>MARKETING</div>
                <div style={{ position: "relative", fontSize: 10, fontWeight: 700, color: "#FF3366", padding: "4px 6px", background: "rgba(255,51,102,0.08)", borderRadius: 4 }}>
                  ACCOUNT
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>Dashboard · últimas 24hs</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div style={{ padding: 10, background: "#F8F8FA", borderRadius: 6 }}>
                    <div style={{ fontSize: 9, color: "#999" }}>Pedidos</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>247</div>
                  </div>
                  <div style={{ padding: 10, background: "#F8F8FA", borderRadius: 6 }}>
                    <div style={{ fontSize: 9, color: "#999" }}>GMV</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>$1.2M</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <HighlightRing top={75} left={24} width={92} height={28} label="Click acá" />
          <HoverCursor top={80} left={80} />
        </BrowserFrame>
      ),
      explanation: "En el menú lateral izquierdo, buscá la sección 'ACCOUNT' (a veces aparece como 'Cuenta').",
    },
    {
      title: "Gestión de usuarios → App Keys",
      mockup: (
        <img
          src="https://cdn.statically.io/gh/vtexdocs/help-center-content@refs/heads/main/docs/en/tutorials/account-management/api-keys/api-keys_2.png"
          alt="VTEX App Keys management"
          style={{ width: "100%", display: "block", background: "#fff" }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      ),
      explanation: "Esta es la pantalla oficial de 'API Keys' en VTEX Admin. Click en 'Generate New' o 'Crear key' para arrancar.",
      docUrl: "https://help.vtex.com/en/tutorial/application-keys--2iffYzlvvz4BDMr6WGUtet",
    },
    {
      title: "Asignar rol y generar",
      mockup: (
        <BrowserFrame url="https://arredo.myvtex.com/admin/account/api-keys">
          <div style={{ padding: 18, background: "#fff" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>
              Generar nueva App Key
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>Label</div>
              <div style={{ padding: "6px 10px", background: "#F5F5F7", borderRadius: 4, fontSize: 11, color: "#1a1a1a" }}>
                NitroSales
              </div>
            </div>
            <div style={{ marginBottom: 14, position: "relative" }}>
              <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>Roles</div>
              <div style={{ padding: "6px 10px", border: "2px solid #FF3366", borderRadius: 4, fontSize: 11, color: "#1a1a1a", background: "#fff" }}>
                Owner (Admin Super) ✓
              </div>
            </div>
            <button style={{
              padding: "8px 16px",
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
          <HighlightRing top={58} left={18} width={224} height={32} label="Seleccioná Owner" />
        </BrowserFrame>
      ),
      explanation: "Label: 'NitroSales'. Rol: 'Owner (Admin Super)' (recomendado por VTEX). Click 'Generate'. Copiá las credenciales — el Token solo se muestra una vez.",
      docUrl: "https://developers.vtex.com/docs/guides/api-authentication-using-application-keys",
    },
  ],

  MERCADOLIBRE: [
    {
      title: "Logueate en MercadoLibre",
      subtitle: "Con tu cuenta de vendedor",
      mockup: (
        <BrowserFrame url="https://www.mercadolibre.com.ar">
          <div style={{ padding: 14, background: "#FFE600", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 24, background: "#fff", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: "#2D3277" }}>ML</div>
            <div style={{ flex: 1, padding: "5px 10px", background: "#fff", borderRadius: 4, fontSize: 10, color: "#999" }}>Buscar productos, marcas y más...</div>
            <div style={{ padding: "5px 12px", background: "#fff", borderRadius: 4, fontSize: 10, color: "#2D3277", fontWeight: 600, position: "relative" }}>
              @tuusuario
            </div>
          </div>
          <div style={{ padding: 20, color: "#333" }}>
            <div style={{ fontSize: 11, color: "#999", marginBottom: 10 }}>Home</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
              {[0,1,2,3,4,5].map((i) => (
                <div key={i} style={{ aspectRatio: "1", background: "#F5F5F7", borderRadius: 4 }} />
              ))}
            </div>
          </div>
          <HighlightRing top={16} left={266} width={80} height={22} label="Tu usuario acá" />
        </BrowserFrame>
      ),
      explanation: "Arriba a la derecha ves tu nombre/usuario. Copialo sin la '@'.",
    },
  ],

  META_ADS: [
    {
      title: "Abrí Business Manager",
      subtitle: "Tu cuenta publicitaria de Facebook/Instagram",
      mockup: (
        <BrowserFrame url="https://business.facebook.com">
          <div style={{ padding: 14, background: "#1877F2", color: "#fff", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Meta Business</div>
            <div style={{ flex: 1 }} />
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#fff" }} />
          </div>
          <div style={{ display: "flex", height: 180, background: "#F0F2F5" }}>
            <div style={{ width: 140, background: "#fff", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#65676B" }}>📊 Campañas</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#65676B" }}>💰 Facturación</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#65676B" }}>👥 Usuarios</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#1877F2", padding: "4px 6px", background: "rgba(24,119,242,0.08)", borderRadius: 4, position: "relative" }}>
                ⚙️ Configuración
              </div>
            </div>
            <div style={{ flex: 1, padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a", marginBottom: 8 }}>Cuentas publicitarias</div>
              <div style={{ padding: 10, background: "#fff", borderRadius: 6, border: "1px solid #E4E6EB", position: "relative" }}>
                <div style={{ fontSize: 11, color: "#1a1a1a", fontWeight: 600 }}>Mi Ecommerce</div>
                <div style={{ fontSize: 10, color: "#65676B", marginTop: 2 }}>ID: act_123456789</div>
              </div>
            </div>
          </div>
          <HighlightRing top={130} left={158} width={196} height={44} label="Copiá el ID" />
        </BrowserFrame>
      ),
      explanation: "Configuración → Cuentas → Cuentas publicitarias. Copiá el ID sin el prefijo 'act_'.",
    },
    {
      title: "Crear System User",
      subtitle: "El token que dura para siempre",
      mockup: (
        <BrowserFrame url="business.facebook.com/settings/system-users">
          <div style={{ padding: 18, background: "#fff" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", marginBottom: 14 }}>
              Usuarios del sistema
            </div>
            <div style={{ padding: 12, background: "#F0F2F5", borderRadius: 6, marginBottom: 10, position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#1877F2", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>
                  NS
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#1a1a1a" }}>NitroSales</div>
                  <div style={{ fontSize: 9, color: "#65676B" }}>Administrador</div>
                </div>
              </div>
            </div>
            <button style={{
              padding: "8px 16px",
              background: "#1877F2",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              position: "relative",
            }}>
              Generar token
            </button>
          </div>
          <HighlightRing top={130} left={18} width={112} height={32} label="Click generar" />
        </BrowserFrame>
      ),
      explanation: "Agregar usuario con rol 'Administrador', asignar tu Ad Account con 'Acceso completo', generar token con permisos: ads_read, ads_management, business_management.",
      docUrl: "https://developers.facebook.com/docs/marketing-api/system-users",
    },
  ],

  META_PIXEL: [
    {
      title: "Events Manager",
      subtitle: "Donde viven tus pixels de conversión",
      mockup: (
        <BrowserFrame url="business.facebook.com/events_manager">
          <div style={{ display: "flex", height: 220 }}>
            <div style={{ width: 130, background: "#F0F2F5", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#1a1a1a" }}>Fuentes de datos</div>
              <div style={{ padding: 6, background: "#fff", borderRadius: 4, fontSize: 10, color: "#1a1a1a", display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, background: "#1877F2" }} />
                Mi Pixel
              </div>
            </div>
            <div style={{ flex: 1, padding: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>Mi Pixel</div>
              <div style={{ fontSize: 10, color: "#65676B", marginBottom: 14, fontFamily: "monospace", position: "relative" }}>
                ID del pixel: 1234567890123456
              </div>
              <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #E4E6EB", marginBottom: 10 }}>
                <div style={{ padding: "6px 10px", fontSize: 10, color: "#65676B" }}>Resumen</div>
                <div style={{ padding: "6px 10px", fontSize: 10, color: "#1877F2", borderBottom: "2px solid #1877F2", fontWeight: 700 }}>Configuración</div>
              </div>
              <div style={{ fontSize: 11, color: "#1a1a1a", fontWeight: 600, marginBottom: 6 }}>Conversions API</div>
              <button style={{
                padding: "6px 12px",
                background: "#1877F2",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 700,
                position: "relative",
              }}>
                Generar token de acceso
              </button>
            </div>
          </div>
          <HighlightRing top={58} left={146} width={180} height={18} label="Pixel ID (15-16 dígitos)" />
        </BrowserFrame>
      ),
      explanation: "Seleccioná tu pixel, copiá el ID (15-16 dígitos). Después: Configuración → Conversions API → Generar token de acceso.",
    },
  ],

  GOOGLE_ADS: [
    {
      title: "Customer ID en Google Ads",
      subtitle: "Está arriba a la derecha, formato 123-456-7890",
      mockup: (
        <BrowserFrame url="ads.google.com">
          <div style={{ padding: 10, background: "#fff", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #E0E0E0" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path fill="#4285F4" d="M3.9998 22.9291C1.7908 22.9291 0 21.1383 0 18.9293s1.7908-3.9998 3.9998-3.9998 3.9998 1.7908 3.9998 3.9998-1.7908 3.9998-3.9998 3.9998z" />
              <path fill="#FBBC04" d="M23.4641 16.9287L15.4632 3.072C14.3586 1.1587 11.9121.5028 9.9988 1.6074S7.4295 5.1585 8.5341 7.0718l8.0009 13.8567c1.1046 1.9133 3.5511 2.5679 5.4644 1.4646 1.9134-1.1046 2.568-3.5511 1.4647-5.4644z" />
              <path fill="#34A853" d="M7.5137 4.8438L1.5645 15.1484A4.5 4.5 0 0 1 4 14.4297c2.5597-.0075 4.6248 2.1585 4.4941 4.7148l3.2168-5.5723-3.6094-6.25c-.4499-.7793-.6322-1.6394-.5878-2.4784z" />
            </svg>
            <div style={{ fontSize: 12, fontWeight: 500, color: "#3c4043" }}>Google Ads</div>
            <div style={{ flex: 1 }} />
            <div style={{ padding: "5px 10px", background: "#E8F0FE", borderRadius: 4, fontSize: 10, color: "#1a73e8", fontWeight: 600, position: "relative", fontFamily: "'SF Mono', Menlo, monospace" }}>
              123-456-7890
            </div>
          </div>
          <div style={{ padding: 20, color: "#3c4043" }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Campañas activas</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[0,1,2].map((i) => (
                <div key={i} style={{ padding: 10, background: "#f8f9fa", borderRadius: 6, fontSize: 11 }}>
                  Campaign {i + 1}
                </div>
              ))}
            </div>
          </div>
          <HighlightRing top={10} left={274} width={84} height={22} label="10 dígitos sin guiones" />
        </BrowserFrame>
      ),
      explanation: "Arriba a la derecha, al lado del ícono de cuenta, ves el número formato 123-456-7890. Pegalo en NitroSales SIN los guiones (solo los 10 dígitos).",
      docUrl: "https://support.google.com/google-ads/answer/1704344",
    },
  ],

  GSC: [
    {
      title: "Selector de propiedades",
      subtitle: "Search Console arriba a la izquierda",
      mockup: (
        <BrowserFrame url="search.google.com/search-console">
          <div style={{ display: "flex", height: 220, background: "#fff" }}>
            <div style={{ width: 60, background: "#202124" }} />
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
              <div style={{ padding: "8px 12px", background: "#F8F9FA", border: "1px solid #DADCE0", borderRadius: 4, marginBottom: 12, display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
                <div style={{ fontSize: 11, color: "#3c4043", flex: 1, fontFamily: "'SF Mono', Menlo, monospace" }}>https://www.tutienda.com/</div>
                <div style={{ fontSize: 9, color: "#5f6368" }}>▾</div>
              </div>
              <div style={{ fontSize: 11, color: "#5f6368", marginBottom: 8 }}>Rendimiento · últimos 28 días</div>
              <div style={{ padding: 10, background: "#f8f9fa", borderRadius: 6 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#1a73e8" }}>8,234</div>
                <div style={{ fontSize: 10, color: "#5f6368" }}>Total clicks</div>
              </div>
            </div>
          </div>
          <HighlightRing top={52} left={84} width={270} height={30} label="Copiá esta URL" />
        </BrowserFrame>
      ),
      explanation: "Arriba a la izquierda, el selector de propiedades. Abrilo y copiá la URL EXACTA de tu propiedad (con https:// y barra final si corresponde).",
      docUrl: "https://support.google.com/webmasters/answer/34592",
    },
  ],

  NITROPIXEL: [
    {
      title: "Dónde pegar el snippet",
      subtitle: "En el <head> de tu sitio o como Custom HTML Tag en GTM",
      mockup: (
        <BrowserFrame url="tagmanager.google.com/#/container/XXX">
          <div style={{ padding: 14, background: "#fff", height: 220, overflow: "hidden" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <div style={{ padding: "4px 8px", background: "#1A73E8", color: "#fff", borderRadius: 4, fontSize: 9, fontWeight: 700 }}>Tags</div>
              <div style={{ padding: "4px 8px", fontSize: 9, color: "#5f6368" }}>Triggers</div>
              <div style={{ padding: "4px 8px", fontSize: 9, color: "#5f6368" }}>Variables</div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#202124", marginBottom: 10 }}>
              Configuración del tag
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: "#5f6368", marginBottom: 3 }}>Tipo de tag</div>
              <div style={{ padding: "6px 10px", background: "#F8F9FA", borderRadius: 4, fontSize: 11, color: "#202124", position: "relative" }}>
                ⟨⟩ Custom HTML
              </div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: "#5f6368", marginBottom: 3 }}>HTML</div>
              <div style={{ padding: "8px 10px", background: "#202124", borderRadius: 4, fontSize: 9, color: "#8AB4F8", fontFamily: "'SF Mono', Menlo, monospace", lineHeight: 1.5, overflow: "hidden" }}>
                {"<script src=\"nitrosales.app/api/pixel/script?org=..\" async></script>"}
              </div>
            </div>
            <div style={{ fontSize: 9, color: "#5f6368" }}>
              Trigger: <strong style={{ color: "#202124" }}>All Pages</strong>
            </div>
          </div>
          <HighlightRing top={76} left={18} width={332} height={36} label="Seleccioná Custom HTML" />
        </BrowserFrame>
      ),
      explanation: "En GTM: Tags → Nueva → Custom HTML → pegá el snippet → Trigger: All Pages → Guardar y publicar.",
    },
    {
      title: "Confirmación de pings",
      subtitle: "Cómo validamos nosotros",
      mockup: (
        <BrowserFrame url="nitrosales.vercel.app/control/clientes">
          <div style={{ padding: 16, background: "#0F0F11", color: "#fff", minHeight: 200 }}>
            <div style={{ fontSize: 10, color: "#71717A", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
              Actividad NitroPixel
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                { t: "hace 5s", e: "PageView" },
                { t: "hace 12s", e: "AddToCart" },
                { t: "hace 18s", e: "PageView" },
              ].map((evt, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E", animation: "highlightPulse 1.5s ease-in-out infinite" }} />
                  <div style={{ fontSize: 10, color: "#fff", flex: 1 }}>{evt.e}</div>
                  <div style={{ fontSize: 9, color: "#71717A" }}>{evt.t}</div>
                </div>
              ))}
            </div>
          </div>
        </BrowserFrame>
      ),
      explanation: "Cuando tu sitio empieza a mandar pings, nosotros los vemos en tiempo real y aprobamos tu cuenta automáticamente.",
    },
  ],
};
