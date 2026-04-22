// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// OnboardingOverlay v6 — pantalla entera, 3 columnas
// ══════════════════════════════════════════════════════════════
// Layout nuevo:
//   - Full viewport (100vw x 100vh) — no modal
//   - Columna izquierda: sidebar plataformas con tri-state (pending/use/skip)
//   - Columna centro: tutorial de texto + inputs de credenciales
//   - Columna derecha: tutorial VISUAL con screenshots (placeholder por ahora)
//
// Cambios vs v5:
//   - Full screen en vez de modal centrado
//   - 3 columnas en vez de 2
//   - "VTEX" ahora es "Plataforma Ecommerce" con dropdown aspiracional
//     (VTEX activo, Tiendanube/Shopify/WooCommerce/Magento "en desarrollo")
//   - NitroPixel lee orgId del endpoint state (ahora lo devuelve)
//   - Columna derecha con placeholder para screenshots (Parte 2)
// ══════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Loader2,
  CheckCircle2,
  Clock,
  ExternalLink,
  Info,
  ShieldCheck,
  Sparkles,
  Copy,
  Check,
  Ban,
  Image as ImageIcon,
  Lock,
} from "lucide-react";
import { BrandLogo, type BrandKey } from "./BrandLogo";
import { VisualTutorial } from "./VisualTutorials";

const BRAND_ORANGE = "#FF5E1A";
const BORDER = "rgba(255,255,255,0.08)";
const TEXT_PRIMARY = "#FFFFFF";
const TEXT_SECONDARY = "#9CA3AF";
const TEXT_MUTED = "#6B7280";
const ACCENT_GREEN = "#22C55E";
const ACCENT_RED = "#EF4444";

// ═══════════════════════════════════════════════════════════════
// Overlay container
// ═══════════════════════════════════════════════════════════════

export default function OnboardingOverlay() {
  const [state, setState] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);

  const fetchState = async () => {
    try {
      const res = await fetch("/api/me/onboarding/state", { cache: "no-store" });
      if (!res.ok) {
        setState(null);
        return;
      }
      const json = await res.json();
      setState(json);
    } catch {
      setState(null);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    fetchState();
    const t = setInterval(fetchState, 30000);
    return () => clearInterval(t);
  }, []);

  if (!loaded || !state || !state.locked) return null;

  const isWizard = state.phase === "wizard";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#0A0A0F",
        overflow: "hidden",
      }}
    >
      {/* Aurora de fondo */}
      <AuroraBackground />

      {/* Contenido */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          width: "100vw",
          height: "100vh",
          color: TEXT_PRIMARY,
          overflow: "hidden",
        }}
      >
        {isWizard && <WizardFullscreen orgId={state.orgId} onSubmitted={fetchState} />}
        {!isWizard && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: 24 }}>
            <div
              style={{
                width: "100%",
                maxWidth: 680,
                maxHeight: "92vh",
                background: "rgba(20,20,25,0.92)",
                border: `1px solid ${BORDER}`,
                borderRadius: 20,
                boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
                padding: 36,
                overflow: "auto",
                backdropFilter: "blur(40px)",
                WebkitBackdropFilter: "blur(40px)",
              }}
            >
              {state.phase === "validating" && <ValidatingPhase />}
              {state.phase === "backfilling" && <BackfillingPhase progress={state.backfillProgress} />}
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes auroraBlob1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(20vw, 15vh) scale(1.2); }
          66% { transform: translate(-10vw, 25vh) scale(0.9); }
        }
        @keyframes auroraBlob2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-25vw, -20vh) scale(1.3); }
          66% { transform: translate(15vw, -10vh) scale(0.85); }
        }
        @keyframes auroraBlob3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-15vw, 20vh) scale(1.15); }
        }
        @keyframes pixelBreath {
          0%, 100% { transform: scale(1); opacity: 0.9; filter: brightness(1); }
          50% { transform: scale(1.05); opacity: 1; filter: brightness(1.15); }
        }
        @keyframes pixelOrbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pixelOrbitReverse { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
      `}</style>
    </div>
  );
}

function AuroraBackground() {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 1 }}>
      <div style={{
        position: "absolute", top: "20%", left: "15%",
        width: "50vw", height: "50vw", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(255,94,26,0.30) 0%, transparent 60%)",
        filter: "blur(100px)",
        animation: "auroraBlob1 22s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute", top: "30%", right: "10%",
        width: "55vw", height: "55vw", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(168,85,247,0.25) 0%, transparent 60%)",
        filter: "blur(110px)",
        animation: "auroraBlob2 28s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute", bottom: "10%", left: "30%",
        width: "45vw", height: "45vw", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(236,72,153,0.18) 0%, transparent 60%)",
        filter: "blur(120px)",
        animation: "auroraBlob3 30s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(circle at 50% 50%, transparent 0%, rgba(0,0,0,0.5) 100%)",
      }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Validating + Backfilling
// ═══════════════════════════════════════════════════════════════

function ValidatingPhase() {
  return (
    <div style={{ textAlign: "center", padding: "20px 0" }}>
      <div style={{ display: "inline-flex", marginBottom: 18 }}>
        <div style={iconCircle(BRAND_ORANGE)}>
          <Clock size={28} color={BRAND_ORANGE} />
        </div>
      </div>
      <Pretitle tone={BRAND_ORANGE}>Validando tus datos</Pretitle>
      <Title>Estamos revisando tu configuración</Title>
      <p style={{ color: TEXT_SECONDARY, fontSize: 14, lineHeight: 1.7, margin: "0 0 20px", maxWidth: 480, marginInline: "auto" }}>
        Nuestro equipo está validando las credenciales que cargaste. Te avisamos por email apenas
        aprobemos el backfill de tu data histórica.
      </p>
    </div>
  );
}

function BackfillingPhase({ progress }: { progress: any }) {
  const overallPct = progress?.overallPct || 0;
  const jobs = progress?.jobs || [];
  return (
    <div style={{ padding: "10px 0" }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ display: "inline-flex", marginBottom: 18 }}>
          <div style={iconCircle(BRAND_ORANGE)}>
            <Loader2 size={28} color={BRAND_ORANGE} style={{ animation: "spin 2s linear infinite" }} />
          </div>
        </div>
        <Pretitle tone={BRAND_ORANGE}>Procesando data histórica · {overallPct}%</Pretitle>
        <Title>Estamos trayendo tu historia</Title>
      </div>
      <div style={{ height: 8, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden", marginBottom: 18 }}>
        <div style={{ width: `${overallPct}%`, height: "100%", background: `linear-gradient(90deg, ${BRAND_ORANGE}, #FF8C4A)`, transition: "width 600ms ease" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {jobs.map((j: any) => (
          <div key={j.platform} style={{ padding: "10px 14px", background: "rgba(255,255,255,0.02)", border: `1px solid ${BORDER}`, borderRadius: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_PRIMARY, flex: 1 }}>{j.platform}</div>
              <div style={{ fontSize: 11, color: TEXT_SECONDARY, fontWeight: 600 }}>{j.progressPct}%</div>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden" }}>
              <div style={{ width: `${j.progressPct}%`, height: "100%", background: BRAND_ORANGE, transition: "width 600ms ease" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Wizard Fullscreen — 3 columnas
// ═══════════════════════════════════════════════════════════════

type Decision = "pending" | "use" | "skip";

interface Platform {
  key: BrandKey;
  name: string;
  subtitle: string;
  requiredFields: string[];
  hasHistory: boolean;
  missFeatures: string[];
  essential?: boolean;
  isEcommerce?: boolean; // VTEX es ecommerce, tiene dropdown de selección
}

const ALL_PLATFORMS: Platform[] = [
  {
    key: "VTEX", name: "Plataforma Ecommerce",
    subtitle: "VTEX · Tiendanube · Shopify · …",
    requiredFields: ["provider", "accountName", "appKey", "appToken"],
    hasHistory: true,
    isEcommerce: true,
    missFeatures: [
      "Sincronización de pedidos en tiempo real",
      "Análisis de ventas, AOV, conversión",
      "Gestión de stock y productos",
      "Atribución a campañas de marketing",
    ],
  },
  {
    key: "MERCADOLIBRE", name: "MercadoLibre",
    subtitle: "Marketplace — OAuth después",
    requiredFields: ["username"],
    hasHistory: true,
    missFeatures: [
      "Ventas de marketplace integradas",
      "Gestión de preguntas y claims",
      "Análisis de reputación y comisiones",
      "Atribución multi-canal",
    ],
  },
  {
    key: "META_ADS", name: "Meta Ads",
    subtitle: "Facebook + Instagram Ads",
    requiredFields: ["adAccountId", "accessToken"],
    hasHistory: true,
    missFeatures: [
      "ROAS y CPA de Meta Ads",
      "Análisis de creatividades",
      "Detección de fatigue creative",
      "Optimización de presupuesto entre campañas",
    ],
  },
  {
    key: "META_PIXEL", name: "Meta Pixel",
    subtitle: "Conversiones API server-side",
    requiredFields: ["pixelId", "accessToken"],
    hasHistory: false,
    missFeatures: [
      "Match quality mejorado hacia Meta",
      "Tracking sin depender del navegador",
      "Recuperación de eventos bloqueados por iOS14+",
    ],
  },
  {
    key: "GOOGLE_ADS", name: "Google Ads",
    subtitle: "Search, Shopping, PMax — OAuth después",
    requiredFields: ["customerId"],
    hasHistory: true,
    missFeatures: [
      "ROAS y CPA de Google Ads",
      "Análisis Search + Shopping + PMax",
      "Detección de keywords perdidas",
    ],
  },
  {
    key: "GSC", name: "Search Console",
    subtitle: "SEO — OAuth después",
    requiredFields: ["propertyUrl"],
    hasHistory: false,
    missFeatures: [
      "Tráfico orgánico desde Google",
      "Keywords ranking y CTR",
      "Detección de problemas de indexación",
    ],
  },
  {
    key: "NITROPIXEL", name: "NitroPixel",
    subtitle: "Tracking first-party — requerido",
    requiredFields: ["confirmedInstalled"],
    hasHistory: false,
    essential: true,
    missFeatures: [
      "Analytics propias de NitroSales",
      "NitroScore de calidad de tracking",
      "Atribución multi-touch",
    ],
  },
];

// Proveedores ecommerce soportados
const ECOMMERCE_PROVIDERS = [
  { key: "vtex", name: "VTEX", active: true },
  { key: "tiendanube", name: "Tiendanube", active: false },
  { key: "shopify", name: "Shopify", active: false },
  { key: "woocommerce", name: "WooCommerce", active: false },
  { key: "magento", name: "Magento", active: false },
];

function calcCompletion(platformKey: BrandKey, creds: any): number {
  const p = ALL_PLATFORMS.find((pl) => pl.key === platformKey);
  if (!p) return 0;
  let fields = p.requiredFields;
  // Para ecommerce: si no seleccionó provider o no es "vtex", solo cuenta "provider"
  if (p.isEcommerce && creds?.provider !== "vtex") {
    fields = ["provider"];
  }
  const total = fields.length;
  const filled = fields.filter((f) => {
    const v = creds?.[f];
    return typeof v === "boolean" ? v === true : !!(v || "").toString().trim();
  }).length;
  return total === 0 ? 0 : Math.round((filled / total) * 100);
}

function WizardFullscreen({ orgId, onSubmitted }: { orgId: string | null; onSubmitted: () => void }) {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [creds, setCreds] = useState<Record<string, any>>({});
  const [history, setHistory] = useState<Record<string, number>>({
    VTEX: 12, MERCADOLIBRE: 12, META_ADS: 6, GOOGLE_ADS: 6,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipModalFor, setSkipModalFor] = useState<BrandKey | null>(null);
  const [focusedPlatform, setFocusedPlatform] = useState<BrandKey | null>(null);

  const setDecision = (k: string, d: Decision) => {
    setDecisions((s) => ({ ...s, [k]: d }));
    setError(null);
    if (d === "use" && !creds[k]) setCreds((c) => ({ ...c, [k]: {} }));
    if (d === "use") setFocusedPlatform(k as BrandKey);
  };

  const updateCred = (p: string, field: string, value: string | boolean) =>
    setCreds((c) => ({ ...c, [p]: { ...(c[p] || {}), [field]: value } }));

  const usePlatforms = ALL_PLATFORMS.filter((p) => decisions[p.key] === "use");

  // La plataforma que se muestra en centro + derecha
  const displayed = focusedPlatform || (usePlatforms[0]?.key ?? null);

  const globalCompletion = useMemo(() => {
    const total = ALL_PLATFORMS.length;
    let decided = 0;
    for (const p of ALL_PLATFORMS) {
      const d = decisions[p.key] || "pending";
      if (d === "skip") decided += 1;
      else if (d === "use" && calcCompletion(p.key, creds[p.key]) === 100) decided += 1;
    }
    return Math.round((decided / total) * 100);
  }, [decisions, creds]);

  const submit = async () => {
    for (const p of ALL_PLATFORMS) {
      const d = decisions[p.key] || "pending";
      if (d === "pending") {
        setError(`Falta decidir sobre "${p.name}"`);
        return;
      }
      if (d === "use") {
        const completion = calcCompletion(p.key, creds[p.key]);
        if (completion < 100) {
          setError(`Completá todos los campos de "${p.name}"`);
          setFocusedPlatform(p.key);
          return;
        }
      }
    }

    setSubmitting(true);
    setError(null);
    try {
      const platformsArr = usePlatforms
        .filter((p) => p.key !== "NITROPIXEL")
        .map((p) => ({
          platform: p.key,
          credentials: creds[p.key] || {},
        }));
      const res = await fetch("/api/me/onboarding/submit-wizard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platforms: platformsArr,
          historyMonths: history,
          skipped: ALL_PLATFORMS.filter((p) => decisions[p.key] === "skip").map((p) => p.key),
          pixelInstalled: !!creds.NITROPIXEL?.confirmedInstalled,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Error");
        setSubmitting(false);
        return;
      }
      onSubmitted();
    } catch (e: any) {
      setError(e.message);
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", width: "100vw", height: "100vh" }}>
      {/* ─── COLUMNA IZQUIERDA: plataformas ─── */}
      <aside
        style={{
          width: 340,
          flexShrink: 0,
          background: "rgba(8,8,12,0.7)",
          borderRight: `1px solid ${BORDER}`,
          overflowY: "auto",
          padding: "28px 20px 28px",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "rgba(255,94,26,0.1)", border: "1px solid rgba(255,94,26,0.25)", borderRadius: 99, marginBottom: 14 }}>
          <Sparkles size={10} color={BRAND_ORANGE} />
          <span style={{ fontSize: 10, fontWeight: 700, color: BRAND_ORANGE, textTransform: "uppercase", letterSpacing: "0.1em" }}>Onboarding</span>
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: "0 0 6px", letterSpacing: "-0.01em" }}>
          Tu stack
        </h2>
        <p style={{ fontSize: 12, color: TEXT_SECONDARY, margin: "0 0 18px", lineHeight: 1.5 }}>
          Decidí cada plataforma: "la uso" o "no la uso".
        </p>

        {/* Progress global */}
        <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px dashed ${BORDER}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
            Completitud general
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden" }}>
              <div style={{
                width: `${globalCompletion}%`, height: "100%",
                background: globalCompletion === 100 ? ACCENT_GREEN : `linear-gradient(90deg, ${BRAND_ORANGE}, #FF8C4A)`,
                transition: "width 300ms ease",
              }} />
            </div>
            <div style={{ fontSize: 11, color: globalCompletion === 100 ? ACCENT_GREEN : TEXT_SECONDARY, fontWeight: 700, minWidth: 30, textAlign: "right" }}>
              {globalCompletion}%
            </div>
          </div>
        </div>

        {/* Lista de plataformas */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {ALL_PLATFORMS.map((p) => {
            const d = decisions[p.key] || "pending";
            const isUse = d === "use";
            const isSkip = d === "skip";
            const isFocused = displayed === p.key && isUse;
            const completion = isUse ? calcCompletion(p.key, creds[p.key]) : (isSkip ? 100 : 0);

            return (
              <div
                key={p.key}
                onClick={() => {
                  if (d === "pending") setDecision(p.key, "use");
                  else if (isUse) setFocusedPlatform(p.key);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 11px",
                  background: isFocused ? "rgba(255,94,26,0.10)" : isUse ? "rgba(255,94,26,0.04)" : isSkip ? "rgba(255,255,255,0.02)" : "transparent",
                  border: `1px solid ${isFocused ? "rgba(255,94,26,0.4)" : isUse ? "rgba(255,94,26,0.15)" : "transparent"}`,
                  borderRadius: 10,
                  cursor: "pointer",
                  transition: "all 160ms",
                  opacity: isSkip ? 0.55 : 1,
                }}
              >
                {/* Checkbox */}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    if (d === "pending") setDecision(p.key, "use");
                    else if (isUse) setDecision(p.key, "pending");
                  }}
                  style={{
                    width: 18, height: 18, borderRadius: 5,
                    border: `2px solid ${isUse ? BRAND_ORANGE : "#3F3F46"}`,
                    background: isUse ? BRAND_ORANGE : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {isUse && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  {isSkip && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="3">
                      <line x1="5" y1="5" x2="19" y2="19" />
                      <line x1="19" y1="5" x2="5" y2="19" />
                    </svg>
                  )}
                </div>
                {/* Logo */}
                <div style={{ flexShrink: 0, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", filter: isSkip ? "grayscale(100%)" : "none" }}>
                  <BrandLogo brand={p.key} size={24} />
                </div>
                {/* Nombre + progress */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 600,
                    color: isUse ? "#fff" : isSkip ? TEXT_MUTED : TEXT_PRIMARY,
                    marginBottom: isUse ? 4 : 0,
                    textDecoration: isSkip ? "line-through" : "none",
                  }}>
                    {p.name}
                  </div>
                  {isUse && (
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden" }}>
                        <div style={{
                          width: `${completion}%`, height: "100%",
                          background: completion === 100 ? ACCENT_GREEN : BRAND_ORANGE,
                          transition: "width 300ms ease",
                        }} />
                      </div>
                      <div style={{ fontSize: 9, color: completion === 100 ? ACCENT_GREEN : TEXT_MUTED, fontWeight: 700, minWidth: 22, textAlign: "right" }}>
                        {completion === 100 ? "✓" : `${completion}%`}
                      </div>
                    </div>
                  )}
                  {isSkip && <div style={{ fontSize: 9, color: TEXT_MUTED, fontWeight: 500 }}>No la uso</div>}
                  {d !== "skip" && !p.essential && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSkipModalFor(p.key);
                      }}
                      style={{
                        fontSize: 9, color: TEXT_MUTED,
                        background: "transparent", border: "none", padding: 0,
                        cursor: "pointer", textDecoration: "underline",
                        marginTop: 2,
                      }}
                    >
                      No la uso
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Send button al final del sidebar */}
        <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px dashed ${BORDER}` }}>
          {error && (
            <div style={{
              marginBottom: 10, padding: "8px 10px",
              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 6, color: "#F87171", fontSize: 11,
            }}>
              {error}
            </div>
          )}
          <button
            onClick={submit}
            disabled={submitting || globalCompletion < 100}
            style={{
              width: "100%", padding: "11px 16px",
              background: submitting || globalCompletion < 100 ? "#27272A" : `linear-gradient(135deg, ${BRAND_ORANGE}, #FF8C4A)`,
              color: "#fff", border: "none", borderRadius: 9,
              fontSize: 13, fontWeight: 600,
              cursor: submitting ? "wait" : globalCompletion < 100 ? "not-allowed" : "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              opacity: globalCompletion < 100 ? 0.5 : 1,
            }}
          >
            {submitting ? (
              <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Enviando…</>
            ) : (
              <>Enviar para validación <ArrowRight size={13} /></>
            )}
          </button>
          {globalCompletion < 100 && (
            <div style={{ fontSize: 10, color: TEXT_MUTED, textAlign: "center", marginTop: 6 }}>
              {100 - globalCompletion}% faltante
            </div>
          )}
        </div>
      </aside>

      {/* ─── COLUMNA CENTRAL: tutorial texto + inputs ─── */}
      <main
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "36px 40px 60px",
          background: "rgba(10,10,15,0.55)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          maxWidth: "calc(100vw - 340px - 480px)",
        }}
      >
        {!displayed ? (
          <EmptyCenter />
        ) : (
          <PlatformCenterPanel
            platformKey={displayed}
            creds={creds[displayed] || {}}
            onChange={(field, value) => updateCred(displayed, field, value)}
            orgId={orgId}
            history={history[displayed]}
            onHistoryChange={(v) => setHistory((h) => ({ ...h, [displayed]: v }))}
          />
        )}
      </main>

      {/* ─── COLUMNA DERECHA: tutorial visual ─── */}
      <aside
        style={{
          width: 480,
          flexShrink: 0,
          background: "rgba(8,8,12,0.5)",
          borderLeft: `1px solid ${BORDER}`,
          overflowY: "auto",
          padding: "36px 28px",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        {displayed ? (
          <VisualTutorialPanel platformKey={displayed} />
        ) : (
          <EmptyRightPanel />
        )}
      </aside>

      {skipModalFor && (
        <SkipModal
          platform={ALL_PLATFORMS.find((p) => p.key === skipModalFor)!}
          onCancel={() => setSkipModalFor(null)}
          onConfirm={() => {
            setDecision(skipModalFor, "skip");
            setSkipModalFor(null);
            if (focusedPlatform === skipModalFor) setFocusedPlatform(null);
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Center panel (inputs + tutorial texto)
// ═══════════════════════════════════════════════════════════════

function EmptyCenter() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100%", textAlign: "center", padding: "40px 20px" }}>
      <div style={iconCircle(BRAND_ORANGE)}>
        <Sparkles size={28} color={BRAND_ORANGE} />
      </div>
      <div style={{ height: 18 }} />
      <Pretitle tone={BRAND_ORANGE}>Bienvenido</Pretitle>
      <Title>Empezá decidiendo tu stack</Title>
      <p style={{ color: TEXT_SECONDARY, fontSize: 14, lineHeight: 1.7, margin: "0 auto", maxWidth: 460 }}>
        A la izquierda decidís cada plataforma. Acá en el centro vas a ver los campos a completar,
        y a la derecha el tutorial visual con capturas de las plataformas reales.
      </p>
    </div>
  );
}

function PlatformCenterPanel({ platformKey, creds, onChange, orgId, history, onHistoryChange }: any) {
  const p = ALL_PLATFORMS.find((pl) => pl.key === platformKey)!;
  return (
    <div style={{ maxWidth: 640 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
        <BrandLogo brand={platformKey} size={40} />
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", margin: 0, color: "#fff" }}>
            {p.name}
          </h2>
          <div style={{ fontSize: 12, color: TEXT_SECONDARY, marginTop: 3 }}>{p.subtitle}</div>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        {platformKey === "VTEX" && <EcommerceInputs creds={creds} onChange={onChange} />}
        {platformKey === "MERCADOLIBRE" && <MlInputs creds={creds} onChange={onChange} />}
        {platformKey === "META_ADS" && <MetaAdsInputs creds={creds} onChange={onChange} />}
        {platformKey === "META_PIXEL" && <MetaPixelInputs creds={creds} onChange={onChange} />}
        {platformKey === "GOOGLE_ADS" && <GoogleAdsInputs creds={creds} onChange={onChange} />}
        {platformKey === "GSC" && <GscInputs creds={creds} onChange={onChange} />}
        {platformKey === "NITROPIXEL" && <NitroPixelInputs creds={creds} onChange={onChange} orgId={orgId} />}
      </div>

      {/* Rango histórico inline si aplica */}
      {p.hasHistory && (
        <div style={{ marginTop: 26, paddingTop: 20, borderTop: `1px dashed ${BORDER}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: BRAND_ORANGE, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
            Rango histórico
          </div>
          <p style={{ fontSize: 12, color: TEXT_SECONDARY, margin: "0 0 10px", lineHeight: 1.6 }}>
            Cuánta historia querés traer de esta plataforma. Más tiempo = más data pero activación más lenta.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
            {[
              { months: 3, label: "3 meses", eta: "min" },
              { months: 6, label: "6 meses", eta: "~30 min" },
              { months: 12, label: "1 año", eta: "1-2 hs" },
              { months: 24, label: "2 años", eta: "3-6 hs" },
              { months: -1, label: "Todo", eta: "~1 día" },
            ].map((opt) => {
              const isActive = history === opt.months;
              return (
                <button key={opt.months} onClick={() => onHistoryChange(opt.months)} style={{
                  padding: "8px 4px",
                  background: isActive ? "rgba(255,94,26,0.12)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${isActive ? BRAND_ORANGE : BORDER}`,
                  borderRadius: 7,
                  color: isActive ? "#fff" : TEXT_SECONDARY,
                  cursor: "pointer", textAlign: "center", fontSize: 11,
                }}>
                  <div style={{ fontWeight: isActive ? 700 : 500 }}>{opt.label}</div>
                  <div style={{ fontSize: 9, color: isActive ? BRAND_ORANGE : TEXT_MUTED, marginTop: 2 }}>{opt.eta}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Inputs per platform
// ═══════════════════════════════════════════════════════════════

function EcommerceInputs({ creds, onChange }: any) {
  const provider = creds.provider || "";
  return (
    <>
      <Field label="¿Qué plataforma ecommerce usás?" hint="Seleccioná la plataforma donde operás tu tienda online.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8 }}>
          {ECOMMERCE_PROVIDERS.map((pv) => {
            const selected = provider === pv.key;
            return (
              <button
                key={pv.key}
                onClick={() => pv.active && onChange("provider", pv.key)}
                disabled={!pv.active}
                style={{
                  padding: "10px 12px",
                  background: selected ? "rgba(255,94,26,0.12)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${selected ? BRAND_ORANGE : BORDER}`,
                  borderRadius: 9,
                  color: !pv.active ? TEXT_MUTED : selected ? "#fff" : TEXT_PRIMARY,
                  cursor: pv.active ? "pointer" : "not-allowed",
                  fontSize: 12,
                  fontWeight: selected ? 700 : 500,
                  opacity: pv.active ? 1 : 0.5,
                  textAlign: "center",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                }}
              >
                {pv.name}
                {!pv.active && (
                  <span style={{ fontSize: 9, color: TEXT_MUTED, display: "inline-flex", alignItems: "center", gap: 3 }}>
                    <Lock size={8} /> En desarrollo
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Field>

      {provider === "vtex" && (
        <>
          <div style={{ marginTop: 16 }}>
            <Field label="Account Name" hint="Es el subdomain de tu tienda VTEX.">
              <Input value={creds.accountName || ""} onChange={(v) => onChange("accountName", v)} placeholder="arredo" maxLength={60} />
            </Field>
            <Field label="App Key" hint="Empieza con 'vtexappkey-'.">
              <Input value={creds.appKey || ""} onChange={(v) => onChange("appKey", v)} placeholder="vtexappkey-xxxxx-XXXXXX" mono />
            </Field>
            <Field label="App Token">
              <Input value={creds.appToken || ""} onChange={(v) => onChange("appToken", v)} placeholder="ABCD1234..." mono />
            </Field>
          </div>
        </>
      )}

      {provider && provider !== "vtex" && (
        <div style={{ marginTop: 18, padding: "14px 16px", background: "rgba(255,94,26,0.08)", border: "1px solid rgba(255,94,26,0.25)", borderRadius: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: BRAND_ORANGE, marginBottom: 6 }}>
            Integración en desarrollo
          </div>
          <div style={{ fontSize: 12, color: TEXT_SECONDARY, lineHeight: 1.6 }}>
            Estamos desarrollando la integración con {ECOMMERCE_PROVIDERS.find((pv) => pv.key === provider)?.name}.
            Si confirmás tu interés ahora, te priorizamos y te avisamos en cuanto esté lista.
          </div>
        </div>
      )}
    </>
  );
}

function MlInputs({ creds, onChange }: any) {
  return (
    <>
      <Field label="Usuario MercadoLibre" hint="Tu usuario de vendedor, sin la '@'.">
        <Input value={creds.username || ""} onChange={(v) => onChange("username", v)} placeholder="tuusuario" maxLength={60} />
      </Field>
      <InfoBox>
        <strong style={{ color: TEXT_PRIMARY }}>Después del wizard</strong>, te vamos a pedir que autorices NitroSales desde MELI vía login oficial.
      </InfoBox>
    </>
  );
}

function MetaAdsInputs({ creds, onChange }: any) {
  return (
    <>
      <Field label="Ad Account ID" hint="Solo los números, sin 'act_'.">
        <Input value={creds.adAccountId || ""} onChange={(v) => onChange("adAccountId", v.replace(/[^0-9]/g, ""))} placeholder="123456789" mono maxLength={30} />
      </Field>
      <Field label="Access Token (System User)">
        <Input value={creds.accessToken || ""} onChange={(v) => onChange("accessToken", v)} placeholder="EAA..." mono />
      </Field>
    </>
  );
}

function MetaPixelInputs({ creds, onChange }: any) {
  return (
    <>
      <Field label="Pixel ID" hint="15-16 dígitos.">
        <Input value={creds.pixelId || ""} onChange={(v) => onChange("pixelId", v.replace(/[^0-9]/g, ""))} placeholder="1234567890123456" mono maxLength={20} />
      </Field>
      <Field label="Access Token CAPI">
        <Input value={creds.accessToken || ""} onChange={(v) => onChange("accessToken", v)} placeholder="EAA..." mono />
      </Field>
    </>
  );
}

function GoogleAdsInputs({ creds, onChange }: any) {
  return (
    <>
      <Field label="Customer ID" hint="10 dígitos sin guiones.">
        <Input value={creds.customerId || ""} onChange={(v) => onChange("customerId", v.replace(/[^0-9]/g, ""))} placeholder="1234567890" mono maxLength={10} />
      </Field>
      <InfoBox>
        <strong style={{ color: TEXT_PRIMARY }}>Después del wizard</strong>, te llevamos a login oficial de Google para autorizar.
      </InfoBox>
    </>
  );
}

function GscInputs({ creds, onChange }: any) {
  return (
    <>
      <Field label="URL de tu propiedad" hint="La URL exacta como aparece en Search Console.">
        <Input value={creds.propertyUrl || ""} onChange={(v) => onChange("propertyUrl", v)} placeholder="https://www.tutienda.com/" mono />
      </Field>
      <InfoBox>
        <strong style={{ color: TEXT_PRIMARY }}>Después del wizard</strong>, te llevamos a login oficial de Google.
      </InfoBox>
    </>
  );
}

function NitroPixelInputs({ creds, onChange, orgId }: any) {
  const [copied, setCopied] = useState(false);
  const appUrl = typeof window !== "undefined" ? window.location.origin : "https://nitrosales.vercel.app";
  const snippet = orgId
    ? `<!-- NitroPixel -->\n<script src="${appUrl}/api/pixel/script?org=${orgId}" async></script>`
    : `<!-- Cargando ID de tu organización... -->`;

  const copy = () => {
    if (!orgId) return;
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <div style={{
        padding: "14px 16px",
        background: "linear-gradient(135deg, rgba(6,182,212,0.08), rgba(139,92,246,0.06))",
        border: "1px solid rgba(6,182,212,0.25)",
        borderRadius: 10,
        marginBottom: 18,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#a5f3fc", marginBottom: 4 }}>
          Por qué es importante
        </div>
        <div style={{ fontSize: 11, color: TEXT_SECONDARY, lineHeight: 1.6 }}>
          NitroPixel es nuestra fuente de verdad para analytics. Captura sesiones, visitas,
          conversiones y atribución multi-touch sin depender de GA4.
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: TEXT_PRIMARY, marginBottom: 6 }}>
          Tu snippet personalizado
        </div>
        <div style={{
          position: "relative",
          background: "rgba(0,0,0,0.45)",
          border: `1px solid ${BORDER}`,
          borderRadius: 10,
          padding: "12px 14px",
          fontFamily: "'SF Mono', Menlo, Consolas, monospace",
          fontSize: 11,
          color: "#a5f3fc",
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
        }}>
          {snippet}
          {orgId && (
            <button
              onClick={copy}
              style={{
                position: "absolute", top: 10, right: 10,
                padding: "5px 10px",
                background: copied ? `${ACCENT_GREEN}20` : "rgba(255,255,255,0.08)",
                border: `1px solid ${copied ? ACCENT_GREEN : BORDER}`,
                borderRadius: 6,
                color: copied ? ACCENT_GREEN : TEXT_SECONDARY,
                fontSize: 10, fontWeight: 600, cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 4,
              }}
            >
              {copied ? <><Check size={10} /> Copiado</> : <><Copy size={10} /> Copiar</>}
            </button>
          )}
        </div>
      </div>

      <label style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        padding: "12px 14px",
        background: creds.confirmedInstalled ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.02)",
        border: `1px solid ${creds.confirmedInstalled ? "rgba(34,197,94,0.3)" : BORDER}`,
        borderRadius: 10, cursor: "pointer",
      }}>
        <div
          style={{
            width: 18, height: 18, borderRadius: 5,
            border: `2px solid ${creds.confirmedInstalled ? ACCENT_GREEN : "#3F3F46"}`,
            background: creds.confirmedInstalled ? ACCENT_GREEN : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2,
          }}
          onClick={() => onChange("confirmedInstalled", !creds.confirmedInstalled)}
        >
          {creds.confirmedInstalled && (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
        <input type="checkbox" checked={!!creds.confirmedInstalled}
          onChange={(e) => onChange("confirmedInstalled", e.target.checked)}
          style={{ display: "none" }} />
        <div style={{ flex: 1, fontSize: 13, color: "#fff", fontWeight: 500 }}>
          Ya pegué el snippet en mi sitio (head o GTM)
          <div style={{ fontSize: 11, color: TEXT_SECONDARY, fontWeight: 400, marginTop: 2 }}>
            NitroSales validará que recibimos pings antes de aprobar tu cuenta.
          </div>
        </div>
      </label>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// Right column — tutorial visual (Parte 2, placeholder por ahora)
// ═══════════════════════════════════════════════════════════════

function EmptyRightPanel() {
  return (
    <div style={{ textAlign: "center", paddingTop: 60 }}>
      <div style={{ display: "inline-flex", marginBottom: 18, opacity: 0.5 }}>
        <div style={iconCircle("#6366F1")}>
          <ImageIcon size={28} color="#818CF8" />
        </div>
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#818CF8", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 10 }}>
        Tutorial visual
      </div>
      <div style={{ fontSize: 14, color: TEXT_PRIMARY, fontWeight: 600, marginBottom: 8 }}>
        Capturas paso a paso
      </div>
      <p style={{ color: TEXT_SECONDARY, fontSize: 12, lineHeight: 1.7, margin: "0 20px", maxWidth: 320, marginInline: "auto" }}>
        Cuando selecciones una plataforma en el centro, acá vas a ver el tutorial visual con
        capturas de pantalla reales para que encuentres cada dato rápido.
      </p>
    </div>
  );
}

function VisualTutorialPanel({ platformKey }: { platformKey: BrandKey }) {
  return <VisualTutorial platformKey={platformKey} />;
}


// ═══════════════════════════════════════════════════════════════
// Skip modal
// ═══════════════════════════════════════════════════════════════

function SkipModal({ platform, onCancel, onConfirm }: { platform: Platform; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 460, width: "100%",
          background: "#141419",
          border: `1px solid ${BORDER}`,
          borderRadius: 16,
          padding: 28,
          boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div style={{ width: 38, height: 38, borderRadius: "50%", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Ban size={18} color={ACCENT_RED} />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: ACCENT_RED, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Atención
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: "2px 0 0" }}>
              ¿Seguro que no usás {platform.name}?
            </h3>
          </div>
        </div>

        <p style={{ color: TEXT_SECONDARY, fontSize: 13, lineHeight: 1.6, margin: "0 0 14px" }}>
          Si marcás que no usás esta plataforma, vas a perder estas funcionalidades en NitroSales:
        </p>

        <ul style={{ margin: 0, paddingLeft: 18, color: TEXT_PRIMARY, fontSize: 12, lineHeight: 1.9 }}>
          {platform.missFeatures.map((f, i) => (
            <li key={i}>
              <span style={{ color: ACCENT_RED, marginRight: 4 }}>✕</span> {f}
            </li>
          ))}
        </ul>

        <div style={{ marginTop: 14, padding: "10px 12px", background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 8, fontSize: 11, color: TEXT_SECONDARY, lineHeight: 1.5 }}>
          Siempre podés conectarla después desde <strong style={{ color: TEXT_PRIMARY }}>Settings → Integraciones</strong>.
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: "11px 16px",
            background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 9,
            color: TEXT_SECONDARY, fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>
            Volver atrás
          </button>
          <button onClick={onConfirm} style={{
            flex: 1, padding: "11px 16px",
            background: "rgba(239,68,68,0.12)", border: `1px solid rgba(239,68,68,0.4)`, borderRadius: 9,
            color: "#FCA5A5", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>
            Confirmar, no la uso
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Shared
// ═══════════════════════════════════════════════════════════════

function InfoBox({ children }: any) {
  return (
    <div style={{ marginTop: 14, padding: "10px 12px", background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 8 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <Info size={14} color="#60A5FA" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 11, color: TEXT_SECONDARY, lineHeight: 1.6 }}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: any) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ marginBottom: 5 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: TEXT_PRIMARY }}>{label}</label>
      </div>
      {children}
      {hint && <div style={{ fontSize: 10, color: TEXT_MUTED, marginTop: 5 }}>{hint}</div>}
    </div>
  );
}

function Input({ value, onChange, placeholder, mono, maxLength }: any) {
  return (
    <input
      value={value} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder} maxLength={maxLength}
      style={{
        width: "100%", padding: "10px 12px",
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${BORDER}`, borderRadius: 8,
        color: "#fff", fontSize: 12, outline: "none",
        fontFamily: mono ? "'SF Mono', Menlo, Consolas, monospace" : undefined,
        boxSizing: "border-box", transition: "border-color 120ms",
      }}
      onFocus={(e) => (e.currentTarget.style.borderColor = BRAND_ORANGE)}
      onBlur={(e) => (e.currentTarget.style.borderColor = BORDER)}
    />
  );
}

function Title({ children }: any) {
  return (
    <h1 style={{
      fontSize: 26, fontWeight: 700,
      letterSpacing: "-0.02em", margin: "0 0 14px",
      background: "linear-gradient(135deg, #fff 0%, #9CA3AF 100%)",
      WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
    }}>
      {children}
    </h1>
  );
}

function Pretitle({ children, tone }: any) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: tone,
      textTransform: "uppercase", letterSpacing: "0.12em",
      marginBottom: 12,
    }}>
      {children}
    </div>
  );
}

function iconCircle(color: string) {
  return {
    width: 64, height: 64, borderRadius: "50%",
    background: `${color}1A`, border: `1px solid ${color}4D`,
    display: "flex", alignItems: "center", justifyContent: "center",
  } as React.CSSProperties;
}
