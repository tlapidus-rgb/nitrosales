// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// OnboardingOverlay v4 — layout scroll continuo
// ══════════════════════════════════════════════════════════════
// Wizard: sidebar sticky izquierdo con checkboxes de plataformas +
// progress bar por cada una, panel derecho scrolleable con todas
// las secciones (una por plataforma marcada) + rango historico +
// boton enviar al final. Sin navegacion entre "pasos".
//
// Fases: wizard | validating | backfilling | done
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
} from "lucide-react";
import { BrandLogo, type BrandKey } from "./BrandLogo";

const BRAND_ORANGE = "#FF5E1A";
const CARD_BG = "rgba(20,20,25,0.95)";
const BORDER = "rgba(255,255,255,0.08)";
const TEXT_PRIMARY = "#FFFFFF";
const TEXT_SECONDARY = "#9CA3AF";
const TEXT_MUTED = "#6B7280";
const ACCENT_GREEN = "#22C55E";

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
        backdropFilter: "blur(20px) saturate(140%)",
        WebkitBackdropFilter: "blur(20px) saturate(140%)",
        background:
          "radial-gradient(circle at 20% 30%, rgba(255,94,26,0.12) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(168,85,247,0.08) 0%, transparent 50%), rgba(10,10,15,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        overflow: "hidden",
      }}
    >
      <div
        style={{
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
      <style jsx global>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
        aprobemos el backfill de tu data histórica.{" "}
        <strong style={{ color: TEXT_PRIMARY }}>Esto suele tomar entre 2 y 24 hs hábiles.</strong>
      </p>
      <p style={{ color: TEXT_MUTED, fontSize: 12, marginTop: 24 }}>
        Podés cerrar esta ventana — te llega un email cuando esté listo.
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
            {j.processed > 0 && (
              <div style={{ fontSize: 10, color: TEXT_SECONDARY, marginTop: 4 }}>
                {j.processed.toLocaleString("es-AR")} procesadas
                {j.totalEstimate && ` / ${j.totalEstimate.toLocaleString("es-AR")} estimadas`}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Wizard Scroll (layout nuevo)
// ═══════════════════════════════════════════════════════════════

interface Platform {
  key: BrandKey;
  name: string;
  subtitle: string;
  requiredFields: string[];
  hasHistory: boolean;
}

const ALL_PLATFORMS: Platform[] = [
  { key: "VTEX", name: "VTEX", subtitle: "Ecommerce — pedidos, productos, stock", requiredFields: ["accountName", "appKey", "appToken"], hasHistory: true },
  { key: "MERCADOLIBRE", name: "MercadoLibre", subtitle: "Marketplace — OAuth después", requiredFields: ["username"], hasHistory: true },
  { key: "META_ADS", name: "Meta Ads", subtitle: "Facebook + Instagram Ads", requiredFields: ["adAccountId", "accessToken"], hasHistory: true },
  { key: "META_PIXEL", name: "Meta Pixel", subtitle: "Conversiones API server-side", requiredFields: ["pixelId", "accessToken"], hasHistory: false },
  { key: "GOOGLE_ADS", name: "Google Ads", subtitle: "Search, Shopping, PMax — OAuth después", requiredFields: ["customerId"], hasHistory: true },
  { key: "GSC", name: "Search Console", subtitle: "SEO — OAuth después", requiredFields: ["propertyUrl"], hasHistory: false },
];

function calcCompletion(platformKey: BrandKey, creds: any): number {
  const p = ALL_PLATFORMS.find((pl) => pl.key === platformKey);
  if (!p) return 0;
  const total = p.requiredFields.length;
  const filled = p.requiredFields.filter((f) => !!(creds?.[f] || "").trim()).length;
  return total === 0 ? 0 : Math.round((filled / total) * 100);
}

function WizardScroll({ onSubmitted }: { onSubmitted: () => void }) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [creds, setCreds] = useState<Record<string, any>>({});
  const [history, setHistory] = useState<Record<string, number>>({
    VTEX: 12,
    MERCADOLIBRE: 12,
    META_ADS: 6,
    GOOGLE_ADS: 6,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const toggleSelected = (k: string) => {
    setSelected((s) => ({ ...s, [k]: !s[k] }));
    if (!creds[k]) setCreds((c) => ({ ...c, [k]: {} }));
    setError(null);
    // Scroll a la seccion recien marcada
    setTimeout(() => {
      const el = sectionRefs.current[k];
      if (el && scrollRef.current) {
        const containerTop = scrollRef.current.getBoundingClientRect().top;
        const elTop = el.getBoundingClientRect().top;
        scrollRef.current.scrollTo({
          top: scrollRef.current.scrollTop + (elTop - containerTop) - 20,
          behavior: "smooth",
        });
      }
    }, 60);
  };
  const updateCred = (p: string, field: string, value: string) =>
    setCreds((c) => ({ ...c, [p]: { ...(c[p] || {}), [field]: value } }));

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

  const activePlatforms = ALL_PLATFORMS.filter((p) => selected[p.key]);

  const submit = async () => {
    if (activePlatforms.length === 0) {
      setError("Marcá al menos una plataforma");
      return;
    }
    // Validar required por plataforma
    for (const p of activePlatforms) {
      const c = creds[p.key] || {};
      for (const field of p.requiredFields) {
        if (!(c[field] || "").trim()) {
          setError(`Falta completar "${field}" en ${p.name}`);
          scrollToSection(p.key);
          return;
        }
      }
    }

    setSubmitting(true);
    setError(null);
    try {
      const platformsArr = activePlatforms.map((p) => ({
        platform: p.key,
        credentials: creds[p.key] || {},
      }));
      const res = await fetch("/api/me/onboarding/submit-wizard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platforms: platformsArr, historyMonths: history }),
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

  const globalCompletion = useMemo(() => {
    const count = activePlatforms.length;
    if (count === 0) return 0;
    const total = activePlatforms.reduce((a, p) => a + calcCompletion(p.key, creds[p.key]), 0);
    return Math.round(total / count);
  }, [activePlatforms, creds]);

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      {/* ─── Sidebar izquierdo (sticky) ─── */}
      <div
        style={{
          width: 320,
          flexShrink: 0,
          background: "rgba(0,0,0,0.2)",
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
          Tus plataformas
        </h2>
        <p style={{ fontSize: 12, color: TEXT_SECONDARY, margin: "0 0 18px", lineHeight: 1.5 }}>
          Marcá las que usás. A la derecha vas a ver cómo completar cada una paso a paso.
        </p>

        {/* Progress global */}
        {activePlatforms.length > 0 && (
          <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px dashed ${BORDER}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
              Completitud general
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ width: `${globalCompletion}%`, height: "100%", background: `linear-gradient(90deg, ${BRAND_ORANGE}, #FF8C4A)`, transition: "width 300ms ease" }} />
              </div>
              <div style={{ fontSize: 11, color: globalCompletion === 100 ? ACCENT_GREEN : TEXT_SECONDARY, fontWeight: 700, minWidth: 30, textAlign: "right" }}>
                {globalCompletion}%
              </div>
            </div>
          </div>
        )}

        {/* Lista de plataformas */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {ALL_PLATFORMS.map((p) => {
            const isSelected = !!selected[p.key];
            const completion = calcCompletion(p.key, creds[p.key]);
            return (
              <div
                key={p.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 11px",
                  background: isSelected ? "rgba(255,94,26,0.06)" : "transparent",
                  border: `1px solid ${isSelected ? "rgba(255,94,26,0.2)" : "transparent"}`,
                  borderRadius: 10,
                  cursor: "pointer",
                  transition: "all 160ms",
                }}
                onClick={() => {
                  if (!isSelected) toggleSelected(p.key);
                  else scrollToSection(p.key);
                }}
              >
                {/* Checkbox */}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelected(p.key);
                  }}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 5,
                    border: `2px solid ${isSelected ? BRAND_ORANGE : "#3F3F46"}`,
                    background: isSelected ? BRAND_ORANGE : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {isSelected && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                {/* Logo */}
                <div style={{ flexShrink: 0, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <BrandLogo brand={p.key} size={24} />
                </div>
                {/* Nombre + progress */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: isSelected ? "#fff" : TEXT_PRIMARY, marginBottom: isSelected ? 4 : 0 }}>
                    {p.name}
                  </div>
                  {isSelected && (
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
                </div>
              </div>
            );
          })}
        </div>

        {activePlatforms.length > 0 && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px dashed ${BORDER}` }}>
            <button
              onClick={() => scrollToSection("__history__")}
              style={{
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
              }}
            >
              <span style={{ marginRight: 10 }}>📅</span>
              Rango histórico
            </button>
            <button
              onClick={() => scrollToSection("__confirm__")}
              style={{
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
              }}
            >
              <span style={{ marginRight: 10 }}>✓</span>
              Confirmar y enviar
            </button>
          </div>
        )}
      </div>

      {/* ─── Panel derecho scrolleable ─── */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "32px 36px 100px" }}>
        {/* Hero si no hay nada marcado */}
        {activePlatforms.length === 0 ? (
          <EmptyHero />
        ) : (
          <>
            {/* Header */}
            <div style={{ marginBottom: 24 }}>
              <Pretitle tone={BRAND_ORANGE}>Paso 1 · Conectá tus plataformas</Pretitle>
              <Title>Bienvenido a NitroSales</Title>
              <p style={{ color: TEXT_SECONDARY, fontSize: 13, lineHeight: 1.7, margin: 0 }}>
                Vas a ver abajo una sección por cada plataforma que marcaste a la izquierda, con
                tutorial detallado y los campos para completar. Cuando termines, abajo del todo
                hay un botón para enviar a validación.
              </p>
            </div>

            {/* Secciones por plataforma */}
            {activePlatforms.map((p) => (
              <div
                key={p.key}
                ref={(el) => {
                  sectionRefs.current[p.key] = el;
                }}
                style={{ marginBottom: 32, paddingBottom: 32, borderBottom: `1px solid ${BORDER}` }}
              >
                <PlatformSection
                  platformKey={p.key}
                  creds={creds[p.key] || {}}
                  onChange={(field, value) => updateCred(p.key, field, value)}
                />
              </div>
            ))}

            {/* Rango histórico */}
            {activePlatforms.some((p) => p.hasHistory) && (
              <div
                ref={(el) => { sectionRefs.current["__history__"] = el; }}
                style={{ marginBottom: 32, paddingBottom: 32, borderBottom: `1px solid ${BORDER}` }}
              >
                <HistorySection
                  active={activePlatforms.filter((p) => p.hasHistory).map((p) => p.key)}
                  history={history}
                  onChange={(k, v) => setHistory((h) => ({ ...h, [k]: v }))}
                />
              </div>
            )}

            {/* Confirmar y enviar */}
            <div ref={(el) => { sectionRefs.current["__confirm__"] = el; }}>
              <ConfirmSection activePlatforms={activePlatforms} history={history} creds={creds} />

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
                disabled={submitting}
                style={{
                  marginTop: 20,
                  width: "100%",
                  padding: "14px 24px",
                  background: submitting ? "#27272A" : `linear-gradient(135deg, ${BRAND_ORANGE}, #FF8C4A)`,
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: submitting ? "wait" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  boxShadow: submitting ? "none" : "0 4px 16px rgba(255,94,26,0.3)",
                }}
              >
                {submitting ? (
                  <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Enviando…</>
                ) : (
                  <>Enviar para validación <ArrowRight size={14} /></>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function EmptyHero() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100%", textAlign: "center", padding: "40px 20px" }}>
      <div style={iconCircle(BRAND_ORANGE)}>
        <Sparkles size={28} color={BRAND_ORANGE} />
      </div>
      <Pretitle tone={BRAND_ORANGE}>Empezá marcando plataformas</Pretitle>
      <Title>Bienvenido a NitroSales</Title>
      <p style={{ color: TEXT_SECONDARY, fontSize: 14, lineHeight: 1.7, margin: "0 auto", maxWidth: 440 }}>
        A la izquierda vas a ver la lista de plataformas que NitroSales integra. Marcá las que usás
        y acá van a aparecer los tutoriales y campos para conectar cada una.
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Platform Section (tutorial + inputs)
// ═══════════════════════════════════════════════════════════════

function PlatformSection({ platformKey, creds, onChange }: any) {
  if (platformKey === "VTEX") return <VtexSection creds={creds} onChange={onChange} />;
  if (platformKey === "MERCADOLIBRE") return <MlSection creds={creds} onChange={onChange} />;
  if (platformKey === "META_ADS") return <MetaAdsSection creds={creds} onChange={onChange} />;
  if (platformKey === "META_PIXEL") return <MetaPixelSection creds={creds} onChange={onChange} />;
  if (platformKey === "GOOGLE_ADS") return <GoogleAdsSection creds={creds} onChange={onChange} />;
  if (platformKey === "GSC") return <GscSection creds={creds} onChange={onChange} />;
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
        title="Cómo crear la App Key en VTEX (5 min)"
        steps={[
          { text: "Abrí tu admin VTEX", detail: "https://{tu-cuenta}.myvtex.com/admin — reemplazá {tu-cuenta} por tu subdomain." },
          { text: "Menú lateral → ícono de Apps → Application Keys", detail: "Si no ves 'Application Keys', andá a: Cuenta → Gestión de usuarios → App Keys." },
          { text: "Click en 'Manage my keys' → 'Generate New'", detail: "" },
          { text: "Label: escribí 'NitroSales'", detail: "Es solo un nombre interno para identificarlo." },
          { text: "Asignar Roles → seleccioná 'Owner (Admin Super)'", detail: "Es el rol recomendado por VTEX para integraciones." },
          { text: "Click 'Generate' → copiá AHORA el App Key y el App Token", detail: "El Token solo se muestra UNA VEZ. Si se pierde, tenés que regenerarlo." },
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
      <SectionHeader brand="MERCADOLIBRE" name="MercadoLibre" description="Para conectar MELI vamos a usar OAuth (el método seguro oficial). Acá solo necesitamos tu usuario de vendedor." />
      <Tutorial
        title="Dónde ves tu usuario de MercadoLibre"
        steps={[
          { text: "Entrá a mercadolibre.com.ar logueado con tu cuenta vendedor", detail: "" },
          { text: "Arriba a la derecha, click en tu nombre", detail: "Se abre un menú desplegable." },
          { text: "Tu usuario aparece en el menú", detail: "Es alfanumérico, a veces empieza con '@'." },
          { text: "Pegalo acá sin la '@'", detail: "" },
        ]}
      />
      <InfoBox>
        <strong style={{ color: TEXT_PRIMARY }}>Después del wizard</strong>, te vamos a pedir que autorices a NitroSales desde MELI vía login oficial. No pedimos tu contraseña.
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
      <SectionHeader brand="META_ADS" name="Meta Ads" description="Necesitamos un System User token de tu Business Manager (dura para siempre, no vence)." />
      <Tutorial
        title="Parte 1: Ad Account ID"
        steps={[
          { text: "Abrí business.facebook.com logueado", detail: "" },
          { text: "Engranaje arriba izquierda → 'Configuración del negocio'", detail: "" },
          { text: "Menú izquierdo: Cuentas → Cuentas publicitarias", detail: "" },
          { text: "Copiá el ID de la cuenta (solo números, ignorá 'act_')", detail: "" },
        ]}
      />
      <Tutorial
        title="Parte 2: System User + Access Token"
        steps={[
          { text: "Business Manager → Configuración → Usuarios → Usuarios del sistema", detail: "" },
          { text: "Agregar → Nombre 'NitroSales' → rol 'Administrador'", detail: "" },
          { text: "Agregar activos → Cuentas publicitarias → tu cuenta → 'Acceso completo'", detail: "" },
          { text: "Generar token → permisos: ads_read, ads_management, business_management", detail: "No marques otros, solo esos 3." },
          { text: "Copialo AHORA (empieza con 'EAA...')", detail: "Solo se muestra una vez." },
        ]}
        docUrl="https://developers.facebook.com/docs/marketing-api/system-users"
      />
      <Field label="Ad Account ID" hint="Solo los números (sin 'act_').">
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
          { text: "Abrí business.facebook.com/events_manager", detail: "" },
          { text: "Seleccioná tu pixel", detail: "Si no tenés, '+ Conectar fuente de datos' → Web → Pixel de Meta." },
          { text: "Tab 'Configuración'", detail: "" },
          { text: "Copiá el 'ID del pixel' (15-16 dígitos)", detail: "" },
        ]}
      />
      <Tutorial
        title="Parte 2: Access Token CAPI"
        steps={[
          { text: "Mismo pixel → Configuración → Conversions API → 'Configurar manualmente'", detail: "" },
          { text: "Click 'Generar token de acceso'", detail: "" },
          { text: "Copialo AHORA — solo se muestra una vez", detail: "" },
        ]}
      />
      <Field label="Pixel ID" hint="15-16 dígitos, solo números.">
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
      <SectionHeader brand="GOOGLE_ADS" name="Google Ads" description="Usamos OAuth oficial. Acá solo necesitamos tu Customer ID." />
      <Tutorial
        title="Dónde está el Customer ID"
        steps={[
          { text: "Abrí ads.google.com logueado", detail: "" },
          { text: "Arriba a la derecha ves un número 123-456-7890", detail: "Puede aparecer como 'CID: 1234567890'." },
          { text: "Copialo SIN los guiones (10 dígitos)", detail: "" },
        ]}
        docUrl="https://support.google.com/google-ads/answer/1704344"
      />
      <InfoBox>
        <strong style={{ color: TEXT_PRIMARY }}>Después del wizard</strong>, te llevamos a login oficial de Google para autorizar.
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
      <SectionHeader brand="GSC" name="Google Search Console" description="Para Search Console usamos OAuth oficial. Acá solo necesitamos la URL de tu propiedad." />
      <Tutorial
        title="Dónde está la URL de tu propiedad"
        steps={[
          { text: "Abrí search.google.com/search-console logueado", detail: "" },
          { text: "Arriba a la izquierda, selector de propiedades", detail: "Ves la lista de sitios verificados en tu cuenta." },
          { text: "Copiá la URL exacta", detail: "Ej: https://www.tutienda.com/ (con https y barra final si corresponde)." },
        ]}
        docUrl="https://support.google.com/webmasters/answer/34592"
      />
      <InfoBox>
        <strong style={{ color: TEXT_PRIMARY }}>Después del wizard</strong>, te llevamos a login oficial de Google para autorizar acceso a Search Console.
      </InfoBox>
      <Field label="URL de tu propiedad">
        <Input value={creds.propertyUrl || ""} onChange={(v) => onChange("propertyUrl", v)} placeholder="https://www.tutienda.com/" mono />
      </Field>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// History + Confirm sections
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

function ConfirmSection({ activePlatforms, history, creds }: any) {
  const HIST_LABEL = (m: number) => (m === -1 ? "Todo" : `${m} meses`);
  return (
    <div>
      <Title>Revisá antes de enviar</Title>
      <p style={{ color: TEXT_SECONDARY, fontSize: 13, lineHeight: 1.7, margin: "0 0 20px" }}>
        Cuando envíes, NitroSales valida los datos y aprueba el backfill (2-24 hs). Recibís email cuando esté listo.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {activePlatforms.map((p: any) => {
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
// Shared components
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
