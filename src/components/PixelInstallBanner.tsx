// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// PixelInstallBanner — banner premium cuando el pixel no está instalado
// ══════════════════════════════════════════════════════════════
// Se muestra en el top del app si no detecta eventos del pixel para esta org.
// Usuario puede minimizarlo (persiste en localStorage con orgId como key).
// ══════════════════════════════════════════════════════════════

import React, { useEffect, useState } from "react";
import { Zap, X, Copy, Check, ChevronRight } from "lucide-react";

interface InstallStatus {
  isInstalled: boolean;
  eventsCount: number;
  orgId: string;
  snippetUrl: string;
}

export function PixelInstallBanner() {
  const [status, setStatus] = useState<InstallStatus | null>(null);
  const [dismissed, setDismissed] = useState(true); // default dismissed hasta saber
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/nitropixel/install-status")
      .then((r) => r.json())
      .then((json) => {
        if (json.ok) {
          setStatus(json);
          // Check if user dismissed it for this org
          const key = `nitropixel-banner-dismissed-${json.orgId}`;
          const isDismissedLocal = typeof window !== "undefined" && localStorage.getItem(key) === "true";
          setDismissed(isDismissedLocal || json.isInstalled);
        }
      })
      .catch(() => {});
  }, []);

  const dismiss = () => {
    if (status?.orgId) {
      localStorage.setItem(`nitropixel-banner-dismissed-${status.orgId}`, "true");
    }
    setDismissed(true);
  };

  const snippet = status ? `<script src="${status.snippetUrl}" async></script>` : "";

  const copySnippet = () => {
    if (!snippet) return;
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!status || status.isInstalled || dismissed) return null;

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "linear-gradient(90deg, #FF5E1A 0%, #FF8C4A 100%)",
        borderBottom: "1px solid rgba(255,94,26,0.3)",
        boxShadow: "0 4px 20px rgba(255,94,26,0.15)",
        animation: "slideDown 400ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <div
        style={{
          maxWidth: 1400,
          margin: "0 auto",
          padding: expanded ? "18px 24px" : "12px 24px",
          display: "flex",
          flexDirection: expanded ? "column" : "row",
          alignItems: expanded ? "stretch" : "center",
          justifyContent: "space-between",
          gap: 12,
          color: "#fff",
          transition: "padding 200ms ease",
        }}
      >
        {!expanded ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.25)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Zap size={16} fill="#fff" />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em" }}>
                  Instalá tu NitroPixel para empezar a capturar data
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "rgba(255,255,255,0.9)",
                    marginTop: 2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  Pegá un snippet en tu tienda y empezá a ver la atribución en tiempo real.
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <button
                onClick={() => setExpanded(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  background: "#fff",
                  color: "#FF5E1A",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Ver instrucciones <ChevronRight size={14} />
              </button>
              <button
                onClick={dismiss}
                title="Minimizar"
                style={{
                  width: 30,
                  height: 30,
                  background: "rgba(255,255,255,0.15)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={14} />
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Expanded header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Zap size={18} fill="#fff" />
                <div style={{ fontSize: 16, fontWeight: 700 }}>Instalá tu NitroPixel</div>
              </div>
              <button
                onClick={dismiss}
                title="Minimizar (podés volverlo a ver cuando quieras)"
                style={{
                  width: 30,
                  height: 30,
                  background: "rgba(255,255,255,0.15)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={14} />
              </button>
            </div>

            <p style={{ margin: "0 0 14px", fontSize: 13, color: "rgba(255,255,255,0.95)", lineHeight: 1.6 }}>
              Copiá este snippet y pegalo antes del <code style={{ background: "rgba(0,0,0,0.2)", padding: "1px 6px", borderRadius: 4 }}>&lt;/head&gt;</code> de tu tienda. Una vez instalado, verás los eventos acá en minutos.
            </p>

            {/* Snippet box */}
            <div
              style={{
                background: "rgba(0,0,0,0.25)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 10,
                padding: "14px 16px",
                fontFamily: "'SF Mono', Menlo, Consolas, monospace",
                fontSize: 12,
                color: "#fff",
                wordBreak: "break-all",
                lineHeight: 1.5,
                position: "relative",
                marginBottom: 12,
              }}
            >
              {snippet}
              <button
                onClick={copySnippet}
                style={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  background: copied ? "#22C55E" : "#fff",
                  color: copied ? "#fff" : "#FF5E1A",
                  border: "none",
                  borderRadius: 7,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {copied ? (
                  <>
                    <Check size={12} /> Copiado
                  </>
                ) : (
                  <>
                    <Copy size={12} /> Copiar snippet
                  </>
                )}
              </button>
            </div>

            {/* Quick tutorials 3-col */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 10,
                marginBottom: 4,
              }}
            >
              {[
                { title: "VTEX", steps: "Storefront → CMS → Templates → pegá antes de </head>" },
                { title: "Google Tag Manager", steps: "Nuevo tag → Custom HTML → trigger: All Pages" },
                { title: "Custom / otro CMS", steps: "Pegalo antes del </head> en tu layout principal" },
              ].map((t) => (
                <div
                  key={t.title}
                  style={{
                    background: "rgba(255,255,255,0.12)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: 10,
                    padding: "12px 14px",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{t.title}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", lineHeight: 1.5 }}>{t.steps}</div>
                </div>
              ))}
            </div>

            <p style={{ margin: "14px 0 0", fontSize: 11, color: "rgba(255,255,255,0.85)", textAlign: "center" }}>
              ¿Necesitás ayuda? Mandanos un email a soporte y te asistimos con la instalación.
            </p>
          </>
        )}
      </div>
      <style jsx global>{`
        @keyframes slideDown {
          from { transform: translateY(-100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
