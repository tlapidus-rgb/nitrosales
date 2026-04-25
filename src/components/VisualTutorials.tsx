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
  // Clamp step al rango valido. Sin esto: si venias de VTEX (4 pasos) en step=3
  // y cambias a Meta Pixel (1 paso), el primer render antes del useEffect reset
  // leeria steps[3] = undefined y crashearia al leer .title.
  const safeStep = total > 0 ? Math.min(step, total - 1) : 0;
  const current = steps[safeStep];

  if (total === 0 || !current) return null;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#818CF8", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>
          Tutorial visual · paso {safeStep + 1} de {total}
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
              background: i === safeStep ? BRAND_ORANGE : i < safeStep ? "rgba(255,94,26,0.35)" : "rgba(255,255,255,0.08)",
              cursor: "pointer",
              transition: "all 200ms",
            }}
          />
        ))}
      </div>

      <div style={{ marginBottom: 14 }}>
        {current.mockup}
      </div>

      {/* Instrucciones detalladas — jerarquia simple y clara */}
      {current.instructions && (
        <div style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#A5B4FC",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: 8,
          }}>
            {current.instructions.heading}
          </div>
          <ol style={{
            margin: 0,
            paddingLeft: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}>
            {current.instructions.steps.map((s, i) => (
              <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{
                  flexShrink: 0,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "rgba(129,140,248,0.15)",
                  border: "1px solid rgba(129,140,248,0.35)",
                  color: "#A5B4FC",
                  fontSize: 9,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 1,
                }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: TEXT_PRIMARY, lineHeight: 1.55, fontWeight: 500 }}>
                    {typeof s === "string" ? s : s.text}
                  </div>
                  {typeof s !== "string" && s.hint && (
                    <div style={{ fontSize: 11, color: TEXT_SECONDARY, lineHeight: 1.55, marginTop: 3 }}>
                      {s.hint}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {current.instructions.tip && (
            <div style={{
              marginTop: 10,
              padding: "8px 10px",
              background: "rgba(34,197,94,0.06)",
              border: "1px solid rgba(34,197,94,0.2)",
              borderRadius: 7,
              fontSize: 11,
              color: TEXT_SECONDARY,
              lineHeight: 1.55,
              display: "flex",
              gap: 6,
              alignItems: "flex-start",
            }}>
              <span style={{ color: "#22C55E", fontWeight: 700 }}>💡</span>
              <span>{current.instructions.tip}</span>
            </div>
          )}
        </div>
      )}

      {/* Fallback si no hay instructions pero hay explanation viejo */}
      {!current.instructions && current.explanation && (
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
          onClick={() => setStep(Math.max(0, safeStep - 1))}
          disabled={safeStep === 0}
          style={navBtnStyle(safeStep === 0)}
        >
          <ChevronLeft size={14} />
          Atrás
        </button>
        <button
          onClick={() => setStep(Math.min(total - 1, safeStep + 1))}
          disabled={safeStep >= total - 1}
          style={navBtnStyle(safeStep >= total - 1)}
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
  explanation?: string; // legacy — usar instructions
  instructions?: {
    heading: string;
    steps: Array<string | { text: string; hint?: string }>;
    tip?: string;
  };
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
      instructions: {
        heading: "Qué hacer",
        steps: [
          { text: "Abrí tu admin VTEX", hint: "La URL es https://{tu-cuenta}.myvtex.com/admin — reemplazá {tu-cuenta} por tu subdomain (ej: miempresa, tu-tienda)." },
          { text: "Buscá 'Account' en el menú lateral izquierdo", hint: "Puede aparecer como 'Cuenta' si tu admin está en español. Está cerca del final del menú." },
          { text: "Dentro de Account, click en 'Application Keys'", hint: "Si no ves esa opción directamente, andá a: Cuenta → Gestión de usuarios → App Keys." },
        ],
        tip: "Si nunca usaste App Keys, VTEX te puede pedir habilitar la feature con un click de confirmación.",
      },
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
          }}
        />
      ),
      instructions: {
        heading: "Qué hacer",
        steps: [
          { text: "Click en 'Manage my keys'", hint: "Botón que está arriba del listado." },
          { text: "Click en 'Generate New'", hint: "Te abre el formulario para crear una nueva key." },
        ],
      },
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
      instructions: {
        heading: "Qué hacer",
        steps: [
          { text: "Label: escribí 'NitroSales'", hint: "Es solo un nombre interno para identificar esta integración desde tu admin." },
          { text: "Asignar Roles → seleccioná 'Owner (Admin Super)'", hint: "Es el rol recomendado por VTEX para integraciones analíticas como NitroSales. Podés refinarlo después con permisos más granulares si querés." },
          { text: "Click 'Generate'", hint: "VTEX crea el par App Key + App Token." },
          { text: "Copiá AHORA las 3 credenciales (accountName, appKey, appToken)", hint: "El Token SOLO se muestra una vez. Si se pierde, hay que regenerar la key completa." },
        ],
        tip: "Pegalas directamente en los inputs de la columna central. Quedan encriptadas con AES-256 en nuestra base.",
      },
      docUrl: "https://developers.vtex.com/docs/guides/api-authentication-using-application-keys",
    },
    {
      title: "Datos opcionales: Sales Channel + URL pública",
      subtitle: "Solo si querés que los reportes salgan más afinados",
      mockup: (
        <BrowserFrame url="{tu-cuenta}.myvtex.com/admin/catalog/sales-channel">
          <div style={{ padding: 18, background: "#fff" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>
              Canales de venta
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <HighlightTarget label="Este número es el ID">
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: "#F5F5F7", borderRadius: 6, border: "1px solid #E4E4E7" }}>
                  <span style={{ fontFamily: "'SF Mono', Menlo, monospace", fontSize: 13, color: "#FF3366", fontWeight: 700, minWidth: 20 }}>1</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#1a1a1a" }}>Default — Tienda principal</div>
                    <div style={{ fontSize: 9, color: "#888" }}>Argentina · ARS</div>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, color: "#22C55E", padding: "2px 6px", background: "rgba(34,197,94,0.1)", borderRadius: 99 }}>ACTIVO</span>
                </div>
              </HighlightTarget>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: "#FAFAFA", borderRadius: 6, opacity: 0.6 }}>
                <span style={{ fontFamily: "'SF Mono', Menlo, monospace", fontSize: 13, color: "#888", fontWeight: 700, minWidth: 20 }}>2</span>
                <div style={{ flex: 1, fontSize: 11, color: "#666" }}>B2B — Mayoristas</div>
              </div>
            </div>
          </div>
        </BrowserFrame>
      ),
      instructions: {
        heading: "Los dos son OPCIONALES — si no sabés, dejalos vacíos",
        steps: [
          { text: "Sales Channel ID (1, 2, 3...)", hint: "Solo si operás multi-canal (B2B + B2C, marketplace, retail). Lo ves en tu admin VTEX → Catálogo → Canales de venta. El canal principal casi siempre es el ID '1'." },
          { text: "URL de tu tienda (opcional)", hint: "Ej: https://www.tutienda.com.ar. Es la URL pública donde venden. Si la dejás, podemos cruzar visitas del NitroPixel con ventas para ROI más preciso." },
        ],
        tip: "Estos dos campos NO bloquean el wizard. Si no los ponés, NitroSales asume el canal default y todo funciona igual — solo que algunas segmentaciones quedan menos precisas.",
      },
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
      instructions: {
        heading: "Qué hacer",
        steps: [
          { text: "Entrá a mercadolibre.com.ar logueado con tu cuenta vendedor", hint: "Asegurate de estar en la cuenta desde donde vendés, no una personal." },
          { text: "Click arriba a la derecha en tu nombre/usuario", hint: "Se despliega un menú con tu información." },
          { text: "Copiá tu usuario (solo el texto, sin la @)", hint: "Si dice '@MARIA123', pegás 'MARIA123' en NitroSales." },
        ],
        tip: "Después del wizard te vamos a llevar a MELI para autorizar NitroSales vía OAuth oficial — no te pedimos tu contraseña.",
      },
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
      instructions: {
        heading: "Cómo obtener el Ad Account ID",
        steps: [
          { text: "Abrí business.facebook.com logueado", hint: "Con la cuenta que tiene tu Business Manager." },
          { text: "Click en el engranaje ⚙ arriba izquierda", hint: "Se abre 'Configuración del negocio'." },
          { text: "Menú izquierdo: Cuentas → Cuentas publicitarias", hint: "Ves el listado de todas tus Ad Accounts." },
          { text: "Copiá el ID de la cuenta que querés conectar", hint: "Formato: 'act_123456789'. Copiá SOLO los números (sin 'act_'). En NitroSales pegás '123456789'." },
        ],
        tip: "Si tenés varias Ad Accounts, elegí la que realmente usás para vender — es desde donde vamos a traer las métricas.",
      },
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
      instructions: {
        heading: "Cómo generar el Access Token",
        steps: [
          { text: "Configuración del negocio → Usuarios → Usuarios del sistema", hint: "Menú lateral izquierdo, sección 'Usuarios'." },
          { text: "Click 'Agregar' → Nombre: 'NitroSales' → Rol: 'Administrador'", hint: "El nombre es solo para identificarlo. El rol 'Administrador' es necesario para generar el token." },
          { text: "Click sobre el nuevo usuario → 'Agregar activos' → Cuentas publicitarias", hint: "Asigná tu Ad Account al System User con permiso 'Acceso completo' (full access)." },
          { text: "Click 'Generar token'", hint: "Se abre un modal para seleccionar una app y los permisos." },
          { text: "Seleccioná permisos: ads_read, ads_management, business_management", hint: "Marcá EXACTAMENTE esos 3. No marques otros." },
          { text: "Copiá el token (empieza con 'EAA...')", hint: "Solo se muestra UNA vez. Si se pierde, tenés que regenerarlo." },
        ],
        tip: "Usamos System User (no token personal) porque dura para siempre. Los personales vencen a los 60 días y te obligarían a reconectar.",
      },
      docUrl: "https://developers.facebook.com/docs/marketing-api/system-users",
    },
    {
      title: "Dato opcional: Business ID",
      subtitle: "Solo si querés habilitar audiencias custom y conversiones avanzadas",
      mockup: (
        <BrowserFrame url="business.facebook.com/settings/info">
          <div style={{ padding: 12, background: "#1877F2", color: "#fff", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>Meta Business</div>
          </div>
          <div style={{ padding: 18, background: "#F0F2F5" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>
              Información del negocio
            </div>
            <div style={{ padding: 14, background: "#fff", borderRadius: 6, border: "1px solid #E4E6EB" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#1a1a1a", marginBottom: 8 }}>Mi Ecommerce SRL</div>
              <div style={{ fontSize: 10, color: "#65676B", marginBottom: 4 }}>ID de la empresa:</div>
              <HighlightTarget label="Copiá este número">
                <span style={{
                  display: "inline-block",
                  padding: "4px 10px",
                  background: "#F0F2F5",
                  borderRadius: 4,
                  fontFamily: "'SF Mono', Menlo, monospace",
                  fontSize: 11,
                  color: "#1877F2",
                  fontWeight: 700,
                }}>
                  1234567890123456
                </span>
              </HighlightTarget>
              <div style={{ marginTop: 12, fontSize: 10, color: "#65676B" }}>Propietario de la empresa:</div>
              <div style={{ fontSize: 11, color: "#1a1a1a", fontWeight: 500 }}>tu-email@empresa.com</div>
            </div>
          </div>
        </BrowserFrame>
      ),
      instructions: {
        heading: "Dónde encontrar el Business ID (opcional)",
        steps: [
          { text: "Abrí business.facebook.com/settings/info", hint: "Con la misma cuenta que usaste para obtener el Ad Account ID." },
          { text: "Mirá 'ID de la empresa' o 'Business ID'", hint: "Es un número de 15-16 dígitos (no confundir con el Ad Account ID)." },
          { text: "Copialo y pegalo en NitroSales", hint: "Si no ves Business Manager (solo tenés una cuenta publicitaria sola), dejá el campo vacío — no es obligatorio." },
        ],
        tip: "Sirve para habilitar en el futuro: Custom Audiences (audiencias propias), Custom Conversions (eventos de conversión personalizados), y Conversions API en modo 'avanzado'. Si lo dejás vacío, todo funciona igual — solo que esas features quedan bloqueadas hasta que lo cargues.",
      },
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
      instructions: {
        heading: "Pixel ID (obligatorio)",
        steps: [
          { text: "Abrí business.facebook.com/events_manager logueado", hint: "Es distinto de Business Manager — es el módulo de eventos y pixeles." },
          { text: "Seleccioná tu pixel en el sidebar", hint: "Si no tenés uno, '+ Conectar fuente de datos' → Web → Pixel de Meta." },
          { text: "Copiá el 'ID del pixel' (15-16 dígitos)", hint: "Aparece debajo del nombre del pixel. NO es el Ad Account ID — son distintos." },
        ],
        tip: "El Pixel ID es la parte fácil. El Access Token CAPI del paso siguiente tiene 2 caminos — leé con atención.",
      },
    },
    {
      title: "Access Token CAPI — 2 formas, elegí UNA",
      subtitle: "Si Meta te confunde con 'configurá con tu app', usá la Forma A",
      mockup: (
        <BrowserFrame url="business.facebook.com/settings/system-users">
          <div style={{ padding: 14, background: "#fff" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a", marginBottom: 8 }}>
              ✅ Forma A (recomendada): reusar System User de Meta Ads
            </div>
            <div style={{ padding: 10, background: "#E8F5E9", borderLeft: "3px solid #22C55E", borderRadius: 4, marginBottom: 12, fontSize: 10, color: "#1a1a1a", lineHeight: 1.5 }}>
              Si ya hiciste el paso 2 de Meta Ads y generaste el System User token, usá ese MISMO token.
              Antes asignale el Pixel como activo (<em>Agregar activos → Fuentes de datos</em>).
              <br /><br />
              <strong>Ventaja:</strong> 1 solo token para Meta Ads + CAPI. No vence nunca.
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a", marginBottom: 8 }}>
              ⚠ Forma B (alternativa): generar token del pixel directo
            </div>
            <div style={{ padding: 10, background: "#FFF3E0", borderLeft: "3px solid #F59E0B", borderRadius: 4, fontSize: 10, color: "#1a1a1a", lineHeight: 1.5 }}>
              Events Manager → tu Pixel → Configuración → Conversions API → <strong>"Configurar manualmente"</strong>.
              <br /><br />
              Si Meta solo te muestra "Configurar con partner" o "Hacelo con tu app", tocá <em>Más opciones</em> y
              buscá "Generar token de acceso" manual.
            </div>
          </div>
        </BrowserFrame>
      ),
      instructions: {
        heading: "Forma A (simplísima y robusta)",
        steps: [
          { text: "Andá a business.facebook.com/settings/system-users", hint: "Si hiciste el paso Meta Ads, ya tenés un System User llamado 'NitroSales'." },
          { text: "Click sobre el System User → 'Agregar activos' → 'Fuentes de datos' → seleccioná tu Pixel", hint: "Le damos al System User acceso al Pixel (antes solo tenía acceso a Meta Ads)." },
          { text: "Permiso 'Administrador' o 'Acceso completo'", hint: "Necesario para enviar eventos CAPI en nombre del pixel." },
          { text: "Pegá en el wizard el MISMO token que usaste para Meta Ads", hint: "Con los permisos correctos funciona para Meta Ads y CAPI. Meta recomienda uno dedicado para trazabilidad, pero no es obligatorio." },
        ],
        tip: "Si alguien (IA, doc, agencia) te dice 'hacelo con tu app', en realidad sí hace falta una app del Business Manager para vincular el token (paso 3 de este tutorial te explica). NO necesitás programar nada — es una app vacía dentro de tu BM.",
      },
      docUrl: "https://developers.facebook.com/docs/marketing-api/conversions-api/get-started",
    },
    {
      title: "¿Te trabaste? Casos comunes",
      subtitle: "Employee en vez de Admin · te pide elegir una app · permisos",
      mockup: (
        <BrowserFrame url="business.facebook.com/settings/system-users">
          <div style={{ padding: 14, background: "#fff" }}>
            {/* Caso 1: Employee */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 14 }}>👤</span>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a" }}>
                Caso 1: "Solo puedo crear System User Employee, no Admin"
              </div>
            </div>
            <div style={{ padding: 10, background: "#EFF6FF", borderLeft: "3px solid #3B82F6", borderRadius: 4, marginBottom: 14, fontSize: 10, color: "#1a1a1a", lineHeight: 1.5 }}>
              Meta limita a <strong>1 System User Admin por Business Manager</strong>. Si ya lo gastaste en otra
              integración (Klaviyo, Shopify, etc.), tenés que crear uno tipo <strong>Employee</strong>.
              <br /><br />
              <strong>Funciona perfecto.</strong> Solo hay que asignarle 2 activos:
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                <li><strong>Cuentas publicitarias</strong> → tu Ad Account → permiso "Acceso completo"</li>
                <li><strong>Fuentes de datos</strong> → tu Pixel → permiso "Administrador"</li>
              </ul>
            </div>

            {/* Caso 2: Elegir una app */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 14 }}>📦</span>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a" }}>
                Caso 2: "Al generar el token me pide elegir una app"
              </div>
            </div>
            <div style={{ padding: 10, background: "#FEF3C7", borderLeft: "3px solid #F59E0B", borderRadius: 4, fontSize: 10, color: "#1a1a1a", lineHeight: 1.5 }}>
              Meta exige vincular el token a una "app" de tu Business Manager. <strong>NO es una app que programás</strong> —
              es solo un identificador interno.
              <br /><br />
              Si nunca creaste una, hacelo así:
              <ol style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                <li>Configuración del negocio → <strong>Cuentas → Apps → "Agregar"</strong></li>
                <li>Tipo: "Negocios" (o el más simple disponible)</li>
                <li>Nombre: cualquiera, ej. <em>"NitroSales-Connector"</em></li>
                <li>Volvé a "Generar token" y elegí esa app</li>
              </ol>
            </div>
          </div>
        </BrowserFrame>
      ),
      instructions: {
        heading: "Cómo resolver los 2 problemas más comunes",
        steps: [
          { text: "Si solo podés crear System User Employee → CREALO", hint: "Funciona idéntico a Admin para CAPI, siempre que le des los activos correctos en el siguiente paso." },
          { text: "Asignale al Employee: Ad Account (Acceso completo) + Pixel (Administrador)", hint: "Click sobre el System User → 'Agregar activos' → seleccioná los 2 tipos por separado." },
          { text: "Si te pide elegir una app, creá una vacía en Configuración → Apps → Agregar", hint: "Tipo 'Negocios', nombre arbitrario (ej: NitroSales-Connector). Tarda 30 segundos. Después volvés a generar el token." },
          { text: "Permisos del token: ads_read, ads_management, business_management", hint: "Marcá esos 3 sí o sí. No marques ninguno extra que pueda dar problemas." },
        ],
        tip: "El cliente típico tarda ~10-15 minutos en este paso si nunca tocó Business Manager. Si después de eso seguís trabado, contactanos por chat — nosotros entramos al BM con vos para destrabarlo.",
      },
      docUrl: "https://developers.facebook.com/docs/marketing-api/system-users/create-retrieve-update#user-token",
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
      instructions: {
        heading: "Cómo encontrar el Customer ID",
        steps: [
          { text: "Abrí ads.google.com logueado", hint: "Con la cuenta que tiene acceso a tu Google Ads." },
          { text: "Mirá arriba a la derecha, al lado del selector de cuentas", hint: "Vas a ver un número con formato 123-456-7890 o 'CID: 1234567890'." },
          { text: "Copiá los 10 dígitos (SIN los guiones)", hint: "Ejemplo: si ves '123-456-7890', pegás '1234567890' en NitroSales." },
        ],
        tip: "Después del wizard te vamos a llevar a login oficial de Google para autorizar acceso a la API — no te pedimos tu contraseña.",
      },
      docUrl: "https://support.google.com/google-ads/answer/1704344",
    },
    {
      title: "Dato opcional: Login Customer ID",
      subtitle: "Solo si tu agencia usa cuenta administradora (MCC)",
      mockup: (
        <BrowserFrame url="ads.google.com">
          <div style={{ padding: 10, background: "#fff", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #E0E0E0" }}>
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M3.9998 22.9291C1.7908 22.9291 0 21.1383 0 18.9293s1.7908-3.9998 3.9998-3.9998 3.9998 1.7908 3.9998 3.9998-1.7908 3.9998-3.9998 3.9998z" />
              <path fill="#FBBC04" d="M23.4641 16.9287L15.4632 3.072C14.3586 1.1587 11.9121.5028 9.9988 1.6074S7.4295 5.1585 8.5341 7.0718l8.0009 13.8567c1.1046 1.9133 3.5511 2.5679 5.4644 1.4646 1.9134-1.1046 2.568-3.5511 1.4647-5.4644z" />
              <path fill="#34A853" d="M7.5137 4.8438L1.5645 15.1484A4.5 4.5 0 0 1 4 14.4297c2.5597-.0075 4.6248 2.1585 4.4941 4.7148l3.2168-5.5723-3.6094-6.25c-.4499-.7793-.6322-1.6394-.5878-2.4784z" />
            </svg>
            <div style={{ fontSize: 12, fontWeight: 500, color: "#3c4043", flex: 1 }}>Google Ads · MCC</div>
          </div>
          <div style={{ padding: 16, background: "#F8F9FA" }}>
            {/* MCC (manager) */}
            <HighlightTarget label="Este es el Login Customer ID">
              <div style={{ padding: 12, background: "#fff", borderRadius: 6, border: "2px solid #4285F4", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: "#4285F4", padding: "2px 6px", background: "rgba(66,133,244,0.1)", borderRadius: 4 }}>MCC</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#1a1a1a" }}>Mi Agencia</div>
                    <div style={{ fontSize: 10, color: "#5f6368", fontFamily: "monospace" }}>999-888-7777</div>
                  </div>
                </div>
              </div>
            </HighlightTarget>
            {/* Cuentas administradas */}
            <div style={{ fontSize: 9, color: "#5f6368", marginBottom: 6, paddingLeft: 8 }}>Cuentas administradas:</div>
            <div style={{ padding: 10, background: "#fff", borderRadius: 6, marginLeft: 16, marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: "#1a1a1a" }}>Cliente A</div>
              <div style={{ fontSize: 9, color: "#5f6368", fontFamily: "monospace" }}>123-456-7890 ← tu Customer ID</div>
            </div>
          </div>
        </BrowserFrame>
      ),
      instructions: {
        heading: "¿Tu cuenta está administrada por un MCC?",
        steps: [
          { text: "Fijate si al entrar a ads.google.com ves dos niveles de cuenta", hint: "MCC (administradora) → tu cuenta. Si solo ves TU cuenta sola, NO tenés MCC — dejá este campo vacío y listo." },
          { text: "Si tenés MCC: Copiá los 10 dígitos del MCC (sin guiones)", hint: "Está arriba a la derecha cuando estás viendo la cuenta del MCC (no la tuya). Típicamente son agencias que manejan varias cuentas de distintos clientes." },
          { text: "Pegá ese número en 'Login Customer ID'", hint: "Ejemplo: '9988887777'. El Customer ID normal sigue siendo el tuyo (el de la cuenta donde están tus campañas)." },
        ],
        tip: "Si no sabés si tenés MCC, no tenés. El 90% de los negocios directos no usan MCC — es más típico de agencias. Dejalo vacío y seguí.",
      },
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
      instructions: {
        heading: "Cómo obtener la URL de tu propiedad",
        steps: [
          { text: "Abrí search.google.com/search-console logueado", hint: "Con la cuenta que tiene verificada tu propiedad." },
          { text: "Click en el selector de propiedades (arriba a la izquierda)", hint: "Muestra el listado de todos tus sitios verificados." },
          { text: "Copiá la URL EXACTA (con https:// y barra final si corresponde)", hint: "Ejemplo: 'https://www.tutienda.com/' — respetá mayúsculas, prefijo y formato completo." },
        ],
        tip: "Si tu propiedad es de tipo 'dominio' (sin protocolo), copiala tal cual aparece — el formato se ajusta del lado de NitroSales.",
      },
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
      instructions: {
        heading: "Cómo pegar el snippet en GTM",
        steps: [
          { text: "Abrí Google Tag Manager (tagmanager.google.com)", hint: "Elegí el contenedor que tenés activo en tu sitio." },
          { text: "Workspace → Tags → 'Nueva'", hint: "Se abre el editor de tag." },
          { text: "Tipo de tag: 'Custom HTML'", hint: "Símbolo ⟨⟩. Es el tipo que permite pegar scripts directamente." },
          { text: "Pegá el snippet que está en la columna del centro", hint: "Lleva tu orgId ya incrustado — no necesitás editarlo." },
          { text: "Trigger: 'All Pages'", hint: "Para que el pixel se cargue en todas las páginas de tu sitio." },
          { text: "Guardar + PUBLICAR la nueva versión", hint: "Importante: guardar no basta — hay que publicar desde el botón arriba derecha." },
        ],
        tip: "Si no usás GTM, pegá el snippet directamente en el <head> de tu sitio antes del </head>.",
      },
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
      instructions: {
        heading: "Qué pasa después",
        steps: [
          { text: "Entrás a nuestro dashboard interno y vemos llegar los pings", hint: "PageViews, AddToCart, Purchase, etc. según los eventos que tu sitio dispare." },
          { text: "Validamos que el tracking sea correcto", hint: "Chequeamos que cada evento tenga los datos necesarios (producto, usuario, valor, etc.)." },
          { text: "Te aprobamos la cuenta automáticamente", hint: "Una vez que vemos actividad válida, disparamos el backfill y te desbloqueamos el producto." },
        ],
        tip: "El proceso suele tardar unos minutos desde que publicás en GTM hasta que recibimos el primer ping.",
      },
    },
  ],
};
