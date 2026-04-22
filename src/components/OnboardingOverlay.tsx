// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// OnboardingOverlay v5 — fondo aurora animado + tri-state + NitroPixel
// ══════════════════════════════════════════════════════════════
// Mejoras:
//  - Fondo con blobs naranja/violeta animados (reemplaza al producto real
//    atras para que no pese ni se vea lo que hay detras)
//  - Progress general con denominador FIJO: 100% solo si todas las 7
//    plataformas fueron DECIDIDAS (usa o no usa)
//  - Tri-state por plataforma: pending / use / skip. "Skip" requiere
//    modal de confirmacion con lista de features que pierde
//  - NitroPixel como 7ma plataforma, con snippet + toggle "lo pegué"
//  - Logo oficial Google Search Console (multi-color, del SVG real)
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
  X,
  Copy,
  Check,
  Ban,
} from "lucide-react";
import { BrandLogo, type BrandKey } from "./BrandLogo";

const BRAND_ORANGE = "#FF5E1A";
const CARD_BG = "rgba(20,20,25,0.92)";
const BORDER = "rgba(255,255,255,0.08)";
const TEXT_PRIMARY = "#FFFFFF";
const TEXT_SECONDARY = "#9CA3AF";
const TEXT_MUTED = "#6B7280";
const ACCENT_GREEN = "#22C55E";
const ACCENT_VIOLET = "#A855F7";
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
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        overflow: "hidden",
        // Fondo base OPACO (nunca transparente, no muestra el producto detras)
        background: "#0A0A0F",
      }}
    >
      {/* Aurora animada (blobs de color moviendose) */}
      <AuroraBackground />

      <div
        style={{
          position: "relative",
          zIndex: 2,
          width: "100%",
          maxWidth: isWizard ? 1080 : 680,
          height: isWizard ? "92vh" : "auto",
          maxHeight: "92vh",
          background: CARD_BG,
          border: `1px solid ${BORDER}`,
          borderRadius: 20,
          boxShadow: "0 30px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.02) inset",
          color: TEXT_PRIMARY,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          backdropFilter: "blur(40px)",
          WebkitBackdropFilter: "blur(40px)",
        }}
      >
        {state.phase === "wizard" && <WizardScroll onSubmitted={fetchState} />}
        {state.phase === "validating" && (
          <div style={{ padding: 36, overflow: "auto" }}>
            <ValidatingPhase />
          </div>
        )}
        {state.phase === "backfilling" && (
          <div style={{ padding: 36, overflow: "auto" }}>
            <BackfillingPhase progress={state.backfillProgress} />
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
        @keyframes pixelOrbit {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pixelOrbitReverse {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Aurora Background (blobs naranja/violeta animados)
// ═══════════════════════════════════════════════════════════════

function AuroraBackground() {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 1 }}>
      {/* Blob naranja */}
      <div
        style={{
          position: "absolute",
          top: "20%",
          left: "15%",
          width: "50vw",
          height: "50vw",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,94,26,0.35) 0%, transparent 60%)",
          filter: "blur(80px)",
          animation: "auroraBlob1 22s ease-in-out infinite",
        }}
      />
      {/* Blob violeta */}
      <div
        style={{
          position: "absolute",
          top: "30%",
          right: "10%",
          width: "55vw",
          height: "55vw",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(168,85,247,0.30) 0%, transparent 60%)",
          filter: "blur(90px)",
          animation: "auroraBlob2 28s ease-in-out infinite",
        }}
      />
      {/* Blob magenta-rosado (transicion) */}
      <div
        style={{
          position: "absolute",
          bottom: "10%",
          left: "30%",
          width: "45vw",
          height: "45vw",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(236,72,153,0.20) 0%, transparent 60%)",
          filter: "blur(100px)",
          animation: "auroraBlob3 30s ease-in-out infinite",
        }}
      />
      {/* Grain/noise sutil para textura */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(circle at 50% 50%, transparent 0%, rgba(0,0,0,0.4) 100%)",
          opacity: 0.5,
        }}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Validating + Backfilling (sin cambios mayores, solo bg opaco)
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
        aprobemos el backfill de tu data histórica.{" "}
        <strong style={{ color: TEXT_PRIMARY }}>Esto suele tomar entre 2 y 24 hs hábiles.</strong>
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
        <p style={{ color: TEXT_SECONDARY, fontSize: 14, lineHeight: 1.7, margin: 0, maxWidth: 480, marginInline: "auto" }}>
          Cuando termine, todo el producto se desbloquea automáticamente.
        </p>
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
// Wizard Scroll (nuevo)
// ═══════════════════════════════════════════════════════════════

type Decision = "pending" | "use" | "skip";

interface Platform {
  key: BrandKey;
  name: string;
  subtitle: string;
  requiredFields: string[];
  hasHistory: boolean;
  missFeatures: string[]; // que pierde si SKIP
  essential?: boolean; // si essential=true no se puede SKIP
}

const ALL_PLATFORMS: Platform[] = [
  {
    key: "VTEX", name: "VTEX",
    subtitle: "Ecommerce — pedidos, productos, stock",
    requiredFields: ["accountName", "appKey", "appToken"],
    hasHistory: true,
    missFeatures: [
      "Sincronización automática de pedidos en tiempo real",
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
      "Tracking de conversiones sin depender del navegador",
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
      "Optimización cross-campaign",
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
      "Análisis de Core Web Vitals",
    ],
  },
  {
    key: "NITROPIXEL", name: "NitroPixel",
    subtitle: "Tracking first-party — recomendado",
    requiredFields: ["confirmedInstalled"],
    hasHistory: false,
    essential: true, // NitroPixel es el core del producto, no se puede skippear
    missFeatures: [
      "Analytics propias de NitroSales (no dependen de GA4)",
      "NitroScore de calidad de tracking",
      "Atribución multi-touch (first/last/middle)",
      "Data de sesiones, funnel, bounce",
    ],
  },
];

function calcCompletion(platformKey: BrandKey, creds: any): number {
  const p = ALL_PLATFORMS.find((pl) => pl.key === platformKey);
  if (!p) return 0;
  const total = p.requiredFields.length;
  const filled = p.requiredFields.filter((f) => !!(creds?.[f] || "").toString().trim()).length;
  return total === 0 ? 0 : Math.round((filled / total) * 100);
}

function WizardScroll({ onSubmitted }: { onSubmitted: () => void }) {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [creds, setCreds] = useState<Record<string, any>>({});
  const [history, setHistory] = useState<Record<string, number>>({
    VTEX: 12,
    MERCADOLIBRE: 12,
    META_ADS: 6,
    GOOGLE_ADS: 6,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipModalFor, setSkipModalFor] = useState<BrandKey | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Obtener orgId para incrustar en el snippet del pixel
  useEffect(() => {
    fetch("/api/me/onboarding/state", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setOrgId(j?.orgId || j?.organizationId || null))
      .catch(() => {});
  }, []);

  const setDecision = (k: string, d: Decision) => {
    setDecisions((s) => ({ ...s, [k]: d }));
    setError(null);
    if (d === "use" && !creds[k]) setCreds((c) => ({ ...c, [k]: {} }));
    if (d === "use") {
      setTimeout(() => scrollToSection(k), 60);
    }
  };

  const scrollToSection = (key: string) => {
    const el = sectionRefs.current[key];
    if (el && scrollRef.current) {
      const containerTop = scrollRef.current.getBoundingClientRect().top;
      const elTop = el.getBoundingClientRect().top;
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollTop + (elTop - containerTop) - 20,
        behavior: "smooth",
      });
    }
  };

  const updateCred = (p: string, field: string, value: string | boolean) =>
    setCreds((c) => ({ ...c, [p]: { ...(c[p] || {}), [field]: value } }));

  const usePlatforms = ALL_PLATFORMS.filter((p) => decisions[p.key] === "use");

  // Progress general: decididas / total (sin importar si es use o skip)
  // Una "use" cuenta como decidida solo si está al 100%. Una "skip" siempre decidida.
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
    // Todas las plataformas tienen que estar DECIDIDAS
    for (const p of ALL_PLATFORMS) {
      const d = decisions[p.key] || "pending";
      if (d === "pending") {
        setError(`Falta decidir si usás "${p.name}" (marcá "la uso" o "no la uso")`);
        return;
      }
      if (d === "use") {
        const c = creds[p.key] || {};
        for (const field of p.requiredFields) {
          const val = c[field];
          const ok = typeof val === "boolean" ? val === true : !!(val || "").toString().trim();
          if (!ok) {
            setError(`Falta completar "${field}" en ${p.name}`);
            scrollToSection(p.key);
            return;
          }
        }
      }
    }

    setSubmitting(true);
    setError(null);
    try {
      const platformsArr = usePlatforms.map((p) => ({
        platform: p.key,
        credentials: creds[p.key] || {},
      }));
      // NitroPixel no se manda al backend como conexion tradicional (no hay
      // Connection record). Lo filtramos.
      const platformsForApi = platformsArr.filter((x) => x.platform !== "NITROPIXEL");
      const res = await fetch("/api/me/onboarding/submit-wizard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platforms: platformsForApi,
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
    <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      {/* ─── Sidebar izquierdo ─── */}
      <div
        style={{
          width: 340,
          flexShrink: 0,
          background: "rgba(0,0,0,0.25)",
          borderRight: `1px solid ${BORDER}`,
          overflowY: "auto",
          padding: "28px 20px 24px",
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
          Decidí para cada plataforma: "la uso" (completás credenciales) o "no la uso" (tachada, cuenta como decidida).
        </p>

        {/* Progress global */}
        <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px dashed ${BORDER}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
            Completitud general
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden" }}>
              <div style={{
                width: `${globalCompletion}%`,
                height: "100%",
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
            const completion = isUse ? calcCompletion(p.key, creds[p.key]) : (isSkip ? 100 : 0);

            return (
              <div
                key={p.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 11px",
                  background: isUse ? "rgba(255,94,26,0.06)" : isSkip ? "rgba(255,255,255,0.02)" : "transparent",
                  border: `1px solid ${isUse ? "rgba(255,94,26,0.2)" : isSkip ? "rgba(255,255,255,0.04)" : "transparent"}`,
                  borderRadius: 10,
                  cursor: "pointer",
                  transition: "all 160ms",
                  opacity: isSkip ? 0.55 : 1,
                }}
                onClick={() => {
                  if (d === "pending") setDecision(p.key, "use");
                  else if (isUse) scrollToSection(p.key);
                }}
              >
                {/* Checkbox */}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    if (d === "pending") setDecision(p.key, "use");
                    else if (isUse) {
                      // toggle off → pending (no skip directo)
                      setDecision(p.key, "pending");
                    }
                  }}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 5,
                    border: `2px solid ${isUse ? BRAND_ORANGE : isSkip ? "#3F3F46" : "#3F3F46"}`,
                    background: isUse ? BRAND_ORANGE : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    position: "relative",
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
                    fontSize: 12,
                    fontWeight: 600,
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
                          width: `${completion}%`,
                          height: "100%",
                          background: completion === 100 ? ACCENT_GREEN : BRAND_ORANGE,
                          transition: "width 300ms ease",
                        }} />
                      </div>
                      <div style={{ fontSize: 9, color: completion === 100 ? ACCENT_GREEN : TEXT_MUTED, fontWeight: 700, minWidth: 22, textAlign: "right" }}>
                        {completion === 100 ? "✓" : `${completion}%`}
                      </div>
                    </div>
                  )}
                  {isSkip && (
                    <div style={{ fontSize: 9, color: TEXT_MUTED, fontWeight: 500 }}>No la uso</div>
                  )}
                  {/* Link "no la uso" solo si está en pending O en use Y no es essential */}
                  {d !== "skip" && !p.essential && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSkipModalFor(p.key);
                      }}
                      style={{
                        fontSize: 9,
                        color: TEXT_MUTED,
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        textDecoration: "underline",
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

        {usePlatforms.length > 0 && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px dashed ${BORDER}` }}>
            <button onClick={() => scrollToSection("__history__")} style={sidebarLinkStyle}>
              <span style={{ marginRight: 10 }}>📅</span> Rango histórico
            </button>
            <button onClick={() => scrollToSection("__confirm__")} style={sidebarLinkStyle}>
              <span style={{ marginRight: 10 }}>✓</span> Confirmar y enviar
            </button>
          </div>
        )}
      </div>

      {/* ─── Panel derecho scrolleable ─── */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "32px 36px 100px" }}>
        {usePlatforms.length === 0 && !Object.values(decisions).some((d) => d === "skip") ? (
          <EmptyHero />
        ) : (
          <>
            <div style={{ marginBottom: 24 }}>
              <Pretitle tone={BRAND_ORANGE}>Onboarding · Conectá tu stack</Pretitle>
              <Title>Bienvenido a NitroSales</Title>
              <p style={{ color: TEXT_SECONDARY, fontSize: 13, lineHeight: 1.7, margin: 0 }}>
                A la izquierda decidís qué plataformas usás. Abajo aparece una sección por cada una
                marcada, con tutorial y credenciales. Al final, rango histórico y botón para enviar.
              </p>
            </div>

            {usePlatforms.map((p) => (
              <div
                key={p.key}
                ref={(el) => { sectionRefs.current[p.key] = el; }}
                style={{ marginBottom: 32, paddingBottom: 32, borderBottom: `1px solid ${BORDER}` }}
              >
                <PlatformSection
                  platformKey={p.key}
                  creds={creds[p.key] || {}}
                  onChange={(field, value) => updateCred(p.key, field, value)}
                  orgId={orgId}
                />
              </div>
            ))}

            {usePlatforms.some((p) => p.hasHistory) && (
              <div
                ref={(el) => { sectionRefs.current["__history__"] = el; }}
                style={{ marginBottom: 32, paddingBottom: 32, borderBottom: `1px solid ${BORDER}` }}
              >
                <HistorySection
                  active={usePlatforms.filter((p) => p.hasHistory).map((p) => p.key)}
                  history={history}
                  onChange={(k, v) => setHistory((h) => ({ ...h, [k]: v }))}
                />
              </div>
            )}

            <div ref={(el) => { sectionRefs.current["__confirm__"] = el; }}>
              <ConfirmSection usePlatforms={usePlatforms} decisions={decisions} history={history} creds={creds} />

              {error && (
                <div style={{
                  marginTop: 16, padding: "10px 14px",
                  background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: 8, color: "#F87171", fontSize: 12,
                }}>
                  {error}
                </div>
              )}

              <button
                onClick={submit}
                disabled={submitting || globalCompletion < 100}
                title={globalCompletion < 100 ? "Completá o declará 'no la uso' en todas las plataformas" : ""}
                style={{
                  marginTop: 20,
                  width: "100%",
                  padding: "14px 24px",
                  background: submitting || globalCompletion < 100 ? "#27272A" : `linear-gradient(135deg, ${BRAND_ORANGE}, #FF8C4A)`,
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: submitting ? "wait" : globalCompletion < 100 ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  boxShadow: submitting || globalCompletion < 100 ? "none" : "0 4px 16px rgba(255,94,26,0.3)",
                  opacity: globalCompletion < 100 ? 0.5 : 1,
                }}
              >
                {submitting ? (
                  <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Enviando…</>
                ) : (
                  <>Enviar para validación <ArrowRight size={14} /></>
                )}
              </button>
              {globalCompletion < 100 && (
                <div style={{ fontSize: 10, color: TEXT_MUTED, textAlign: "center", marginTop: 8 }}>
                  El botón se habilita cuando todas las plataformas estén decididas (100%).
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modal "No la uso" */}
      {skipModalFor && (
        <SkipModal
          platform={ALL_PLATFORMS.find((p) => p.key === skipModalFor)!}
          onCancel={() => setSkipModalFor(null)}
          onConfirm={() => {
            setDecision(skipModalFor, "skip");
            setSkipModalFor(null);
          }}
        />
      )}
    </div>
  );
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
        background: "rgba(0,0,0,0.65)",
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
          Si marcás que no usás esta plataforma, vas a perder estas funcionalidades dentro de NitroSales:
        </p>

        <ul style={{ margin: 0, paddingLeft: 18, color: TEXT_PRIMARY, fontSize: 12, lineHeight: 1.9 }}>
          {platform.missFeatures.map((f, i) => (
            <li key={i} style={{ color: TEXT_PRIMARY }}>
              <span style={{ color: ACCENT_RED, marginRight: 4 }}>✕</span> {f}
            </li>
          ))}
        </ul>

        <div style={{ marginTop: 14, padding: "10px 12px", background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 8, fontSize: 11, color: TEXT_SECONDARY, lineHeight: 1.5 }}>
          Siempre podés conectarla después desde <strong style={{ color: TEXT_PRIMARY }}>Settings → Integraciones</strong>.
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: "11px 16px",
              background: "transparent",
              border: `1px solid ${BORDER}`,
              borderRadius: 9,
              color: TEXT_SECONDARY,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Volver atrás
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1,
              padding: "11px 16px",
              background: "rgba(239,68,68,0.12)",
              border: `1px solid rgba(239,68,68,0.4)`,
              borderRadius: 9,
              color: "#FCA5A5",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Confirmar, no la uso
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Empty hero
// ═══════════════════════════════════════════════════════════════

function EmptyHero() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100%", textAlign: "center", padding: "40px 20px" }}>
      <div style={iconCircle(BRAND_ORANGE)}>
        <Sparkles size={28} color={BRAND_ORANGE} />
      </div>
      <div style={{ height: 18 }} />
      <Pretitle tone={BRAND_ORANGE}>Empezá decidiendo</Pretitle>
      <Title>Bienvenido a NitroSales</Title>
      <p style={{ color: TEXT_SECONDARY, fontSize: 14, lineHeight: 1.7, margin: "0 auto", maxWidth: 460 }}>
        A la izquierda tenés todas las plataformas que NitroSales integra. Para cada una decidí
        si la usás (completás credenciales) o si no la usás (podés marcarla como tal). Cuando
        todas estén decididas, podés enviar.
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Platform sections
// ═══════════════════════════════════════════════════════════════

function PlatformSection({ platformKey, creds, onChange, orgId }: any) {
  if (platformKey === "VTEX") return <VtexSection creds={creds} onChange={onChange} />;
  if (platformKey === "MERCADOLIBRE") return <MlSection creds={creds} onChange={onChange} />;
  if (platformKey === "META_ADS") return <MetaAdsSection creds={creds} onChange={onChange} />;
  if (platformKey === "META_PIXEL") return <MetaPixelSection creds={creds} onChange={onChange} />;
  if (platformKey === "GOOGLE_ADS") return <GoogleAdsSection creds={creds} onChange={onChange} />;
  if (platformKey === "GSC") return <GscSection creds={creds} onChange={onChange} />;
  if (platformKey === "NITROPIXEL") return <NitroPixelSection creds={creds} onChange={onChange} orgId={orgId} />;
  return null;
}

function SectionHeader({ brand, name, description }: any) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
        <BrandLogo brand={brand} size={36} />
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", margin: 0, color: "#fff" }}>{name}</h2>
      </div>
      <p style={{ color: TEXT_SECONDARY, fontSize: 13, lineHeight: 1.7, margin: "0 0 18px" }}>{description}</p>
    </div>
  );
}

function VtexSection({ creds, onChange }: any) {
  return (
    <>
      <SectionHeader brand="VTEX" name="VTEX" description="Vamos a crear una App Key con permisos de lectura para que NitroSales pueda traer tus pedidos, productos y stock." />
      <Tutorial
        title="Cómo crear la App Key en VTEX"
        steps={[
          { text: "Abrí tu admin VTEX", detail: "https://{tu-cuenta}.myvtex.com/admin" },
          { text: "Menú lateral → ícono de Apps → Application Keys", detail: "Si no lo ves: Cuenta → Gestión de usuarios → App Keys." },
          { text: "'Manage my keys' → 'Generate New'", detail: "" },
          { text: "Label: 'NitroSales'", detail: "" },
          { text: "Roles: 'Owner (Admin Super)'", detail: "Rol recomendado por VTEX para integraciones." },
          { text: "Generate → copiá App Key y App Token", detail: "El Token solo se muestra UNA VEZ." },
        ]}
        docUrl="https://developers.vtex.com/docs/guides/api-authentication-using-application-keys"
      />
      <Field label="Account Name" hint="Es el subdomain de tu tienda VTEX.">
        <Input value={creds.accountName || ""} onChange={(v) => onChange("accountName", v)} placeholder="arredo" maxLength={60} />
      </Field>
      <Field label="App Key" hint="Empieza con 'vtexappkey-'.">
        <Input value={creds.appKey || ""} onChange={(v) => onChange("appKey", v)} placeholder="vtexappkey-xxxxx-XXXXXX" mono />
      </Field>
      <Field label="App Token">
        <Input value={creds.appToken || ""} onChange={(v) => onChange("appToken", v)} placeholder="ABCD1234..." mono />
      </Field>
    </>
  );
}

function MlSection({ creds, onChange }: any) {
  return (
    <>
      <SectionHeader brand="MERCADOLIBRE" name="MercadoLibre" description="Usamos OAuth oficial. Acá solo tu usuario de vendedor para identificar la cuenta." />
      <Tutorial
        title="Dónde ves tu usuario de MercadoLibre"
        steps={[
          { text: "Entrá a mercadolibre.com.ar logueado con tu cuenta vendedor", detail: "" },
          { text: "Arriba a la derecha, click en tu nombre", detail: "" },
          { text: "Tu usuario aparece en el menú", detail: "" },
          { text: "Pegalo acá sin '@'", detail: "" },
        ]}
      />
      <InfoBox>
        <strong style={{ color: TEXT_PRIMARY }}>Después del wizard</strong>, te vamos a pedir que autorices NitroSales desde MELI vía login oficial.
      </InfoBox>
      <Field label="Usuario MercadoLibre">
        <Input value={creds.username || ""} onChange={(v) => onChange("username", v)} placeholder="tuusuario (sin @)" maxLength={60} />
      </Field>
    </>
  );
}

function MetaAdsSection({ creds, onChange }: any) {
  return (
    <>
      <SectionHeader brand="META_ADS" name="Meta Ads" description="Necesitamos un System User token de tu Business Manager (dura para siempre)." />
      <Tutorial
        title="Parte 1: Ad Account ID"
        steps={[
          { text: "business.facebook.com logueado", detail: "" },
          { text: "Engranaje arriba izquierda → Configuración del negocio", detail: "" },
          { text: "Cuentas → Cuentas publicitarias", detail: "" },
          { text: "Copiá el ID (solo números, ignorá 'act_')", detail: "" },
        ]}
      />
      <Tutorial
        title="Parte 2: System User + Access Token"
        steps={[
          { text: "Configuración → Usuarios → Usuarios del sistema", detail: "" },
          { text: "Agregar → Nombre 'NitroSales' → rol Administrador", detail: "" },
          { text: "Agregar activos → Cuentas publicitarias → tu cuenta → Acceso completo", detail: "" },
          { text: "Generar token → permisos: ads_read, ads_management, business_management", detail: "" },
          { text: "Copialo (empieza con 'EAA...')", detail: "Solo se muestra una vez." },
        ]}
        docUrl="https://developers.facebook.com/docs/marketing-api/system-users"
      />
      <Field label="Ad Account ID" hint="Solo números, sin 'act_'.">
        <Input value={creds.adAccountId || ""} onChange={(v) => onChange("adAccountId", v.replace(/[^0-9]/g, ""))} placeholder="123456789" mono maxLength={30} />
      </Field>
      <Field label="Access Token (System User)">
        <Input value={creds.accessToken || ""} onChange={(v) => onChange("accessToken", v)} placeholder="EAA..." mono />
      </Field>
    </>
  );
}

function MetaPixelSection({ creds, onChange }: any) {
  return (
    <>
      <SectionHeader brand="META_PIXEL" name="Meta Pixel (CAPI)" description="El Pixel maneja tracking server-side de conversiones hacia Meta." />
      <Tutorial
        title="Parte 1: Pixel ID"
        steps={[
          { text: "business.facebook.com/events_manager", detail: "" },
          { text: "Seleccioná tu pixel", detail: "" },
          { text: "Configuración → 'ID del pixel' (15-16 dígitos)", detail: "" },
        ]}
      />
      <Tutorial
        title="Parte 2: Access Token CAPI"
        steps={[
          { text: "Mismo pixel → Configuración → Conversions API → Configurar manualmente", detail: "" },
          { text: "Generar token de acceso", detail: "" },
          { text: "Copialo (solo se muestra una vez)", detail: "" },
        ]}
      />
      <Field label="Pixel ID" hint="15-16 dígitos.">
        <Input value={creds.pixelId || ""} onChange={(v) => onChange("pixelId", v.replace(/[^0-9]/g, ""))} placeholder="1234567890123456" mono maxLength={20} />
      </Field>
      <Field label="Access Token CAPI">
        <Input value={creds.accessToken || ""} onChange={(v) => onChange("accessToken", v)} placeholder="EAA..." mono />
      </Field>
    </>
  );
}

function GoogleAdsSection({ creds, onChange }: any) {
  return (
    <>
      <SectionHeader brand="GOOGLE_ADS" name="Google Ads" description="OAuth oficial. Acá solo tu Customer ID." />
      <Tutorial
        title="Dónde está el Customer ID"
        steps={[
          { text: "ads.google.com logueado", detail: "" },
          { text: "Arriba a la derecha ves 123-456-7890", detail: "" },
          { text: "Copialo SIN guiones (10 dígitos)", detail: "" },
        ]}
      />
      <InfoBox>
        <strong style={{ color: TEXT_PRIMARY }}>Después del wizard</strong>, te llevamos a login oficial de Google.
      </InfoBox>
      <Field label="Customer ID" hint="10 dígitos sin guiones.">
        <Input value={creds.customerId || ""} onChange={(v) => onChange("customerId", v.replace(/[^0-9]/g, ""))} placeholder="1234567890" mono maxLength={10} />
      </Field>
    </>
  );
}

function GscSection({ creds, onChange }: any) {
  return (
    <>
      <SectionHeader brand="GSC" name="Google Search Console" description="OAuth oficial. Acá solo la URL de tu propiedad." />
      <Tutorial
        title="Dónde está la URL de tu propiedad"
        steps={[
          { text: "search.google.com/search-console logueado", detail: "" },
          { text: "Selector de propiedades arriba izquierda", detail: "" },
          { text: "Copiá la URL exacta (con https y barra final si corresponde)", detail: "" },
        ]}
      />
      <InfoBox>
        <strong style={{ color: TEXT_PRIMARY }}>Después del wizard</strong>, te llevamos a login oficial de Google.
      </InfoBox>
      <Field label="URL de tu propiedad">
        <Input value={creds.propertyUrl || ""} onChange={(v) => onChange("propertyUrl", v)} placeholder="https://www.tutienda.com/" mono />
      </Field>
    </>
  );
}

function NitroPixelSection({ creds, onChange, orgId }: any) {
  const [copied, setCopied] = useState(false);
  const appUrl = typeof window !== "undefined" ? window.location.origin : "https://nitrosales.vercel.app";
  const snippet = orgId
    ? `<!-- NitroPixel - pegá esto en el <head> de tu sitio (o como custom HTML tag en GTM) -->
<script src="${appUrl}/api/pixel/script?org=${orgId}" async></script>`
    : `<!-- Esperando ID de organización... -->`;

  const copy = () => {
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <SectionHeader
        brand="NITROPIXEL"
        name="NitroPixel"
        description="Es nuestro pixel propio de tracking. Es la fuente de verdad de NitroSales para analytics (no dependemos de GA4). Requerido para activar la cuenta."
      />

      <div style={{
        marginBottom: 14, padding: "14px 16px",
        background: "linear-gradient(135deg, rgba(6,182,212,0.08), rgba(139,92,246,0.06))",
        border: "1px solid rgba(6,182,212,0.25)",
        borderRadius: 10,
        display: "flex", gap: 12, alignItems: "flex-start",
      }}>
        <BrandLogo brand="NITROPIXEL" size={32} />
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#a5f3fc", marginBottom: 4 }}>
            Por qué es importante
          </div>
          <div style={{ fontSize: 11, color: TEXT_SECONDARY, lineHeight: 1.6 }}>
            NitroPixel captura sesiones, visitas, conversiones y atribución multi-touch directamente
            first-party. Sin él, perdés analytics propias, NitroScore, y atribución detallada.
          </div>
        </div>
      </div>

      <Tutorial
        title="Cómo instalarlo (5 min)"
        steps={[
          { text: "Copiá el snippet de abajo", detail: "Es un <script> que apunta a tu organización específica." },
          { text: "Pegalo en el <head> de tu sitio", detail: "O si usás Google Tag Manager (recomendado): Tags → Nueva tag → Custom HTML → pegá el snippet → Trigger: All Pages → Guardar y publicar." },
          { text: "Confirmá acá abajo que lo instalaste", detail: "Nosotros vamos a validar que recibimos pings antes de aprobar tu cuenta." },
        ]}
      />

      {/* Snippet box */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: TEXT_PRIMARY, marginBottom: 6 }}>
          Tu snippet personalizado
        </div>
        <div style={{
          position: "relative",
          background: "rgba(0,0,0,0.35)",
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
          <button
            onClick={copy}
            style={{
              position: "absolute",
              top: 10, right: 10,
              padding: "5px 10px",
              background: copied ? `${ACCENT_GREEN}20` : "rgba(255,255,255,0.08)",
              border: `1px solid ${copied ? ACCENT_GREEN : BORDER}`,
              borderRadius: 6,
              color: copied ? ACCENT_GREEN : TEXT_SECONDARY,
              fontSize: 10,
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {copied ? <><Check size={10} /> Copiado</> : <><Copy size={10} /> Copiar</>}
          </button>
        </div>
      </div>

      {/* Confirm checkbox */}
      <label style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 14px",
        background: creds.confirmedInstalled ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.02)",
        border: `1px solid ${creds.confirmedInstalled ? "rgba(34,197,94,0.3)" : BORDER}`,
        borderRadius: 10,
        cursor: "pointer",
        transition: "all 160ms",
      }}>
        <div
          style={{
            width: 18, height: 18, borderRadius: 5,
            border: `2px solid ${creds.confirmedInstalled ? ACCENT_GREEN : "#3F3F46"}`,
            background: creds.confirmedInstalled ? ACCENT_GREEN : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
          onClick={() => onChange("confirmedInstalled", !creds.confirmedInstalled)}
        >
          {creds.confirmedInstalled && (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
        <input
          type="checkbox"
          checked={!!creds.confirmedInstalled}
          onChange={(e) => onChange("confirmedInstalled", e.target.checked)}
          style={{ display: "none" }}
        />
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
// History + Confirm
// ═══════════════════════════════════════════════════════════════

function HistorySection({ active, history, onChange }: any) {
  const OPTIONS = [
    { months: 3, label: "3 meses", eta: "minutos" },
    { months: 6, label: "6 meses", eta: "~30 min" },
    { months: 12, label: "1 año", eta: "1-2 hs" },
    { months: 24, label: "2 años", eta: "3-6 hs" },
    { months: -1, label: "Todo", eta: "~1 día" },
  ];

  return (
    <div>
      <Title>Cuánta historia querés traer</Title>
      <p style={{ color: TEXT_SECONDARY, fontSize: 13, lineHeight: 1.7, margin: "0 0 20px" }}>
        Más tiempo = más data histórica desde día 1, pero la activación tarda más.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {active.map((k: BrandKey) => {
          const p = ALL_PLATFORMS.find((pl) => pl.key === k);
          if (!p) return null;
          const value = history[k] ?? 12;
          return (
            <div key={k} style={{ padding: "14px 16px", background: "rgba(255,255,255,0.02)", border: `1px solid ${BORDER}`, borderRadius: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <BrandLogo brand={k} size={20} />
                <div style={{ fontSize: 13, fontWeight: 700, color: TEXT_PRIMARY }}>{p.name}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
                {OPTIONS.map((opt) => {
                  const isActive = value === opt.months;
                  return (
                    <button key={opt.months} onClick={() => onChange(k, opt.months)} style={{
                      padding: "8px 4px",
                      background: isActive ? "rgba(255,94,26,0.12)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${isActive ? BRAND_ORANGE : BORDER}`,
                      borderRadius: 7,
                      color: isActive ? "#fff" : TEXT_SECONDARY,
                      cursor: "pointer",
                      textAlign: "center",
                      fontSize: 11,
                    }}>
                      <div style={{ fontWeight: isActive ? 700 : 500 }}>{opt.label}</div>
                      <div style={{ fontSize: 9, color: isActive ? BRAND_ORANGE : TEXT_MUTED, marginTop: 2 }}>{opt.eta}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConfirmSection({ usePlatforms, decisions, history, creds }: any) {
  const HIST_LABEL = (m: number) => (m === -1 ? "Todo" : `${m} meses`);
  const skippedPlatforms = ALL_PLATFORMS.filter((p) => decisions[p.key] === "skip");

  return (
    <div>
      <Title>Revisá antes de enviar</Title>
      <p style={{ color: TEXT_SECONDARY, fontSize: 13, lineHeight: 1.7, margin: "0 0 20px" }}>
        Cuando envíes, NitroSales valida los datos y aprueba el backfill (2-24 hs). Recibís email cuando esté listo.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {usePlatforms.map((p: any) => {
          const completion = calcCompletion(p.key, creds[p.key]);
          return (
            <div key={p.key} style={{ padding: "12px 14px", background: "rgba(255,255,255,0.02)", border: `1px solid ${BORDER}`, borderRadius: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <BrandLogo brand={p.key} size={24} />
                <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#fff" }}>{p.name}</div>
                {completion === 100 ? (
                  <CheckCircle2 size={16} color={ACCENT_GREEN} />
                ) : (
                  <span style={{ fontSize: 10, color: "#FCA5A5", fontWeight: 600 }}>{completion}%</span>
                )}
              </div>
              {p.hasHistory && (
                <div style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 6, paddingLeft: 36 }}>
                  Historia: <strong style={{ color: TEXT_PRIMARY }}>{HIST_LABEL(history[p.key] ?? 12)}</strong>
                </div>
              )}
            </div>
          );
        })}
        {skippedPlatforms.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px dashed ${BORDER}` }}>
            <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
              No las uso ({skippedPlatforms.length})
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {skippedPlatforms.map((p) => (
                <div key={p.key} style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "4px 8px",
                  background: "rgba(255,255,255,0.03)",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 6,
                  fontSize: 10,
                  color: TEXT_MUTED,
                  textDecoration: "line-through",
                }}>
                  <BrandLogo brand={p.key} size={12} />
                  {p.name}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div style={{ marginTop: 16, padding: "12px 14px", background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 8, display: "flex", gap: 8 }}>
        <ShieldCheck size={14} color={ACCENT_GREEN} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 11, color: TEXT_SECONDARY, lineHeight: 1.6 }}>
          Tus credenciales viajan encriptadas con TLS y se guardan cifradas con AES-256.
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Shared
// ═══════════════════════════════════════════════════════════════

function Tutorial({ title, steps, docUrl }: { title: string; steps: Array<{ text: string; detail?: string }>; docUrl?: string }) {
  return (
    <div style={{
      padding: "14px 16px",
      background: "rgba(255,94,26,0.04)",
      border: "1px solid rgba(255,94,26,0.18)",
      borderRadius: 10,
      marginBottom: 12,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: BRAND_ORANGE, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
        {title}
      </div>
      <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
        {steps.map((s, i) => (
          <li key={i} style={{ display: "flex", gap: 10, marginBottom: i === steps.length - 1 ? 0 : 10 }}>
            <div style={{
              minWidth: 18, height: 18, borderRadius: "50%",
              background: "rgba(255,94,26,0.15)",
              border: "1px solid rgba(255,94,26,0.35)",
              color: BRAND_ORANGE,
              fontSize: 10, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, marginTop: 1,
            }}>
              {i + 1}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: TEXT_PRIMARY, lineHeight: 1.6 }}>{s.text}</div>
              {s.detail && (
                <div style={{ fontSize: 11, color: TEXT_SECONDARY, lineHeight: 1.6, marginTop: 3 }}>{s.detail}</div>
              )}
            </div>
          </li>
        ))}
      </ol>
      {docUrl && (
        <a href={docUrl} target="_blank" rel="noopener noreferrer" style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          marginTop: 12, fontSize: 11, color: BRAND_ORANGE, textDecoration: "none",
          paddingTop: 8, borderTop: "1px dashed rgba(255,94,26,0.2)",
        }}>
          Ver doc oficial <ExternalLink size={10} />
        </a>
      )}
    </div>
  );
}

function InfoBox({ children }: any) {
  return (
    <div style={{ marginBottom: 14, padding: "10px 12px", background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 8 }}>
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
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      style={{
        width: "100%",
        padding: "10px 12px",
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        color: "#fff",
        fontSize: 12,
        outline: "none",
        fontFamily: mono ? "'SF Mono', Menlo, Consolas, monospace" : undefined,
        boxSizing: "border-box",
        transition: "border-color 120ms",
      }}
      onFocus={(e) => (e.currentTarget.style.borderColor = BRAND_ORANGE)}
      onBlur={(e) => (e.currentTarget.style.borderColor = BORDER)}
    />
  );
}

function Title({ children }: any) {
  return (
    <h1 style={{
      fontSize: 26,
      fontWeight: 700,
      letterSpacing: "-0.02em",
      margin: "0 0 14px",
      background: "linear-gradient(135deg, #fff 0%, #9CA3AF 100%)",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
    }}>
      {children}
    </h1>
  );
}

function Pretitle({ children, tone }: any) {
  return (
    <div style={{
      fontSize: 11,
      fontWeight: 700,
      color: tone,
      textTransform: "uppercase",
      letterSpacing: "0.12em",
      marginBottom: 12,
    }}>
      {children}
    </div>
  );
}

function iconCircle(color: string) {
  return {
    width: 64,
    height: 64,
    borderRadius: "50%",
    background: `${color}1A`,
    border: `1px solid ${color}4D`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  } as React.CSSProperties;
}

const sidebarLinkStyle: React.CSSProperties = {
  display: "flex",
  width: "100%",
  padding: "9px 12px",
  background: "transparent",
  border: "none",
  color: TEXT_SECONDARY,
  fontSize: 12,
  cursor: "pointer",
  textAlign: "left",
  borderRadius: 8,
};
