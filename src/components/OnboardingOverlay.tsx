// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// OnboardingOverlay v3 — split view (sidebar izquierdo + panel derecho)
// ══════════════════════════════════════════════════════════════
// 4 fases:
//   - wizard:     split view con sidebar de plataformas + % completitud
//                 por cada una, panel derecho con tutorial + inputs
//   - validating: esperando aprobacion admin del backfill
//   - backfilling: jobs corriendo, overlay muestra progreso
//   - done:       null (desbloqueado)
//
// Plataformas (5, sin GA4 — los analytics salen de NitroPixel):
//   VTEX, MercadoLibre, Meta Ads, Meta Pixel, Google Ads, Google Search Console
// ══════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Clock,
  ExternalLink,
  Info,
  ShieldCheck,
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
        padding: 24,
        overflow: "auto",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: isWizard ? 1040 : 680,
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
        {state.phase === "wizard" && <WizardFlow onSubmitted={fetchState} />}
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
// Validating + Backfilling (centered, single-column)
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
          Cuando termine, todo el producto se desbloquea automáticamente. Podés cerrar la pestaña
          o esperar acá — te avisamos por email también.
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
// Wizard (split view)
// ═══════════════════════════════════════════════════════════════

interface Platform {
  key: BrandKey;
  name: string;
  subtitle: string;
  requiredFields: string[];
  oauth: boolean;
}

const ALL_PLATFORMS: Platform[] = [
  { key: "VTEX", name: "VTEX", subtitle: "Ecommerce — pedidos, productos, stock", requiredFields: ["accountName", "appKey", "appToken"], oauth: false },
  { key: "MERCADOLIBRE", name: "MercadoLibre", subtitle: "Marketplace — OAuth después", requiredFields: ["username"], oauth: true },
  { key: "META_ADS", name: "Meta Ads", subtitle: "Facebook + Instagram Ads", requiredFields: ["adAccountId", "accessToken"], oauth: false },
  { key: "META_PIXEL", name: "Meta Pixel", subtitle: "Conversiones API server-side", requiredFields: ["pixelId", "accessToken"], oauth: false },
  { key: "GOOGLE_ADS", name: "Google Ads", subtitle: "Search, Shopping, PMax — OAuth después", requiredFields: ["customerId"], oauth: true },
  { key: "GSC", name: "Search Console", subtitle: "SEO — OAuth después", requiredFields: ["propertyUrl"], oauth: true },
];

function calcCompletion(platformKey: BrandKey, creds: any): number {
  const p = ALL_PLATFORMS.find((pl) => pl.key === platformKey);
  if (!p) return 0;
  const total = p.requiredFields.length;
  const filled = p.requiredFields.filter((f) => !!(creds?.[f] || "").trim()).length;
  return total === 0 ? 0 : Math.round((filled / total) * 100);
}

function WizardFlow({ onSubmitted }: { onSubmitted: () => void }) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [creds, setCreds] = useState<Record<string, any>>({});
  const [history, setHistory] = useState<Record<string, number>>({
    VTEX: 12,
    MERCADOLIBRE: 12,
    META_ADS: 6,
    GOOGLE_ADS: 6,
    GSC: 6,
  });
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activePlatforms = ALL_PLATFORMS.filter((p) => selected[p.key]);
  const steps = useMemo(() => {
    const s: Array<{ id: string; label: string; kind: string; platform?: BrandKey }> = [
      { id: "intro", label: "Plataformas", kind: "intro" },
    ];
    for (const p of activePlatforms) {
      s.push({ id: `platform:${p.key}`, label: p.name, kind: "platform", platform: p.key });
    }
    if (activePlatforms.length > 0) {
      s.push({ id: "history", label: "Histórico", kind: "history" });
      s.push({ id: "confirm", label: "Confirmar", kind: "confirm" });
    }
    return s;
  }, [activePlatforms.map((p) => p.key).join(",")]);

  const currentStep = steps[step] || steps[0];

  const toggleSelected = (k: string) => {
    setSelected((s) => ({ ...s, [k]: !s[k] }));
    if (!creds[k]) setCreds((c) => ({ ...c, [k]: {} }));
  };
  const updateCred = (p: string, field: string, value: string) =>
    setCreds((c) => ({ ...c, [p]: { ...(c[p] || {}), [field]: value } }));

  const handleNext = () => {
    setError(null);
    if (currentStep.kind === "intro" && activePlatforms.length === 0) {
      setError("Seleccioná al menos una plataforma para continuar");
      return;
    }
    setStep(step + 1);
  };
  const handleBack = () => {
    setError(null);
    if (step > 0) setStep(step - 1);
  };

  // Click en sidebar para saltar
  const jumpToStep = (targetIdx: number) => {
    setError(null);
    setStep(targetIdx);
  };

  const submit = async () => {
    // Validar que todas las plataformas seleccionadas tengan los required
    for (const p of activePlatforms) {
      const c = creds[p.key] || {};
      for (const field of p.requiredFields) {
        if (!(c[field] || "").trim()) {
          setError(`Falta completar "${field}" en ${p.name}`);
          // Saltar al step de esa plataforma
          const idx = steps.findIndex((s) => s.platform === p.key);
          if (idx >= 0) setStep(idx);
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

  const isIntro = currentStep.kind === "intro";
  const isLast = step === steps.length - 1;

  // Cuando es intro, layout full-width. Cuando ya arrancó con plataformas, split view.
  if (isIntro) {
    return (
      <div style={{ padding: 36, overflow: "auto", maxHeight: "92vh" }}>
        <IntroStep selected={selected} onToggle={toggleSelected} />
        {error && (
          <div style={errorBoxStyle}>{error}</div>
        )}
        <NavBar
          showBack={false}
          canSubmit={false}
          isLast={false}
          submitting={submitting}
          onBack={handleBack}
          onNext={handleNext}
          onSubmit={submit}
        />
      </div>
    );
  }

  // Split view: sidebar izquierdo + panel derecho
  return (
    <div style={{ display: "flex", minHeight: 560, maxHeight: "92vh" }}>
      {/* Sidebar izquierdo */}
      <div
        style={{
          width: 320,
          flexShrink: 0,
          background: "rgba(0,0,0,0.15)",
          borderRight: `1px solid ${BORDER}`,
          overflowY: "auto",
          padding: "28px 20px",
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 700, color: BRAND_ORANGE, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 16 }}>
          Tu onboarding
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: "0 0 20px", letterSpacing: "-0.01em" }}>
          Plataformas a conectar
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {activePlatforms.map((p) => {
            const idx = steps.findIndex((s) => s.platform === p.key);
            const isCurrent = idx === step;
            const completion = calcCompletion(p.key, creds[p.key]);
            return (
              <button
                key={p.key}
                onClick={() => jumpToStep(idx)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  background: isCurrent ? "rgba(255,94,26,0.08)" : "transparent",
                  border: `1px solid ${isCurrent ? "rgba(255,94,26,0.3)" : "transparent"}`,
                  borderRadius: 10,
                  cursor: "pointer",
                  textAlign: "left",
                  color: "inherit",
                  transition: "all 160ms",
                  width: "100%",
                }}
              >
                <div style={{ flexShrink: 0, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <BrandLogo brand={p.key} size={24} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: isCurrent ? "#fff" : TEXT_PRIMARY, marginBottom: 4 }}>
                    {p.name}
                  </div>
                  {/* Progress bar */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{
                      flex: 1,
                      height: 3,
                      background: "rgba(255,255,255,0.06)",
                      borderRadius: 99,
                      overflow: "hidden",
                    }}>
                      <div style={{
                        width: `${completion}%`,
                        height: "100%",
                        background: completion === 100 ? ACCENT_GREEN : BRAND_ORANGE,
                        transition: "width 300ms ease",
                      }} />
                    </div>
                    <div style={{ fontSize: 10, color: completion === 100 ? ACCENT_GREEN : TEXT_MUTED, fontWeight: 600, minWidth: 26, textAlign: "right" }}>
                      {completion === 100 ? "✓" : `${completion}%`}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Steps finales (Historico + Confirmar) */}
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px dashed ${BORDER}` }}>
          {steps.slice(1 + activePlatforms.length).map((s, i) => {
            const realIdx = 1 + activePlatforms.length + i;
            const isCurrent = realIdx === step;
            return (
              <button
                key={s.id}
                onClick={() => jumpToStep(realIdx)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  background: isCurrent ? "rgba(255,94,26,0.08)" : "transparent",
                  border: `1px solid ${isCurrent ? "rgba(255,94,26,0.3)" : "transparent"}`,
                  borderRadius: 10,
                  cursor: "pointer",
                  textAlign: "left",
                  color: isCurrent ? "#fff" : TEXT_SECONDARY,
                  transition: "all 160ms",
                  width: "100%",
                  fontSize: 13,
                  fontWeight: 500,
                  marginBottom: 4,
                }}
              >
                <div style={{
                  width: 22, height: 22, borderRadius: "50%",
                  background: isCurrent ? BRAND_ORANGE : "rgba(255,255,255,0.06)",
                  color: isCurrent ? "#fff" : TEXT_SECONDARY,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700, flexShrink: 0,
                }}>
                  {i + 1}
                </div>
                {s.kind === "history" ? "Rango histórico" : "Revisar y enviar"}
              </button>
            );
          })}
        </div>

        {/* Back to intro */}
        <div style={{ marginTop: 20 }}>
          <button
            onClick={() => jumpToStep(0)}
            style={{
              fontSize: 11,
              color: TEXT_MUTED,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
              textDecoration: "underline",
            }}
          >
            ← Cambiar plataformas
          </button>
        </div>
      </div>

      {/* Panel derecho */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ flex: 1, overflowY: "auto", padding: "32px 36px" }}>
          {currentStep.kind === "platform" && (
            <PlatformStep
              platformKey={currentStep.platform!}
              creds={creds[currentStep.platform!] || {}}
              onChange={(field, value) => updateCred(currentStep.platform!, field, value)}
            />
          )}
          {currentStep.kind === "history" && (
            <HistoryStep
              active={activePlatforms.map((p) => p.key)}
              history={history}
              onChange={(k, v) => setHistory((h) => ({ ...h, [k]: v }))}
            />
          )}
          {currentStep.kind === "confirm" && (
            <ConfirmStep activePlatforms={activePlatforms} history={history} creds={creds} />
          )}
          {error && <div style={errorBoxStyle}>{error}</div>}
        </div>
        <div style={{ borderTop: `1px solid ${BORDER}`, padding: "16px 28px" }}>
          <NavBar
            showBack={true}
            canSubmit={true}
            isLast={isLast}
            submitting={submitting}
            onBack={handleBack}
            onNext={handleNext}
            onSubmit={submit}
          />
        </div>
      </div>
    </div>
  );
}

// ─── NavBar (Atras/Continuar o Atras/Enviar) ──────────────────
function NavBar({ showBack, canSubmit, isLast, submitting, onBack, onNext, onSubmit }: any) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
      {showBack ? (
        <button onClick={onBack} disabled={submitting} style={secondaryBtn(submitting)}>
          <ArrowLeft size={14} /> Atrás
        </button>
      ) : (
        <div />
      )}
      {isLast && canSubmit ? (
        <button onClick={onSubmit} disabled={submitting} style={primaryBtn(submitting)}>
          {submitting ? (
            <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Enviando…</>
          ) : (
            <>Enviar para validación <ArrowRight size={14} /></>
          )}
        </button>
      ) : (
        <button onClick={onNext} style={primaryBtn(false)}>
          Continuar <ArrowRight size={14} />
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Intro — checkboxes plataformas
// ═══════════════════════════════════════════════════════════════

function IntroStep({ selected, onToggle }: { selected: Record<string, boolean>; onToggle: (k: string) => void }) {
  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <Pretitle tone={BRAND_ORANGE}>Paso 1 de 1 · Plataformas</Pretitle>
        <Title>Bienvenido a NitroSales</Title>
        <p style={{ color: TEXT_SECONDARY, fontSize: 14, lineHeight: 1.7, margin: "0 auto", maxWidth: 520 }}>
          Vamos a conectar tus plataformas paso a paso. Marcá las que usás — el orden y el detalle
          de cada una lo vamos a ir viendo juntos en las pantallas siguientes.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 520, marginInline: "auto" }}>
        {ALL_PLATFORMS.map((p) => {
          const isSelected = !!selected[p.key];
          return (
            <button
              key={p.key}
              onClick={() => onToggle(p.key)}
              style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "14px 16px",
                background: isSelected ? "rgba(255,94,26,0.06)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${isSelected ? "rgba(255,94,26,0.3)" : BORDER}`,
                borderRadius: 12,
                cursor: "pointer",
                transition: "all 160ms",
                textAlign: "left",
                color: "inherit",
                width: "100%",
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: 5,
                border: `2px solid ${isSelected ? BRAND_ORANGE : "#3F3F46"}`,
                background: isSelected ? BRAND_ORANGE : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                {isSelected && (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
              <div style={{ flexShrink: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <BrandLogo brand={p.key} size={28} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: isSelected ? "#fff" : TEXT_PRIMARY }}>
                  {p.name}
                </div>
                <div style={{ fontSize: 12, color: TEXT_SECONDARY, marginTop: 2 }}>{p.subtitle}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Platform step (tutorial + inputs)
// ═══════════════════════════════════════════════════════════════

function PlatformStep({ platformKey, creds, onChange }: any) {
  if (platformKey === "VTEX") return <VtexStep creds={creds} onChange={onChange} />;
  if (platformKey === "MERCADOLIBRE") return <MlStep creds={creds} onChange={onChange} />;
  if (platformKey === "META_ADS") return <MetaAdsStep creds={creds} onChange={onChange} />;
  if (platformKey === "META_PIXEL") return <MetaPixelStep creds={creds} onChange={onChange} />;
  if (platformKey === "GOOGLE_ADS") return <GoogleAdsStep creds={creds} onChange={onChange} />;
  if (platformKey === "GSC") return <GscStep creds={creds} onChange={onChange} />;
  return null;
}

function PlatformHeader({ brand, name, description, children }: any) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
        <BrandLogo brand={brand} size={36} />
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", margin: 0, color: "#fff" }}>{name}</h2>
      </div>
      <p style={{ color: TEXT_SECONDARY, fontSize: 13, lineHeight: 1.7, margin: "0 0 18px" }}>{description}</p>
      {children}
    </div>
  );
}

function VtexStep({ creds, onChange }: any) {
  return (
    <PlatformHeader brand="VTEX" name="VTEX" description="Vamos a crear una App Key con permisos de lectura para que NitroSales pueda traer tus pedidos, productos y stock.">
      <Tutorial
        title="Cómo crear la App Key en VTEX (5 min)"
        steps={[
          { text: "Abrí tu admin VTEX", detail: "https://{tu-cuenta}.myvtex.com/admin — reemplazá {tu-cuenta} por tu subdomain (ej. arredo)." },
          { text: "Menú lateral → ícono de Apps (puzzle piece) → Application Keys", detail: "Si no ves 'Application Keys', andá a: Cuenta → Gestión de usuarios → App Keys." },
          { text: "Click en 'Manage my keys' → 'Generate New'", detail: "" },
          { text: "Label: escribí 'NitroSales'", detail: "Es solo un nombre interno para identificarlo." },
          { text: "Asignar Roles → seleccioná 'Owner (Admin Super)'", detail: "Es el rol recomendado por VTEX para integraciones. Podés refinarlo después si querés permisos más granulares." },
          { text: "Click 'Generate' → copiá AHORA el App Key y el App Token", detail: "El Token solo se muestra UNA VEZ. Si se pierde, tenés que regenerarlo." },
        ]}
        docUrl="https://developers.vtex.com/docs/guides/api-authentication-using-application-keys"
      />
      <div style={{ marginTop: 20 }}>
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
    </PlatformHeader>
  );
}

function MlStep({ creds, onChange }: any) {
  return (
    <PlatformHeader brand="MERCADOLIBRE" name="MercadoLibre" description="Para conectar MELI vamos a usar OAuth (el método seguro oficial). Acá solo necesitamos tu usuario de vendedor para identificar la cuenta.">
      <Tutorial
        title="Dónde ves tu usuario de MercadoLibre"
        steps={[
          { text: "Entrá a mercadolibre.com.ar logueado con tu cuenta vendedor", detail: "" },
          { text: "Arriba a la derecha, click en tu nombre", detail: "Se abre un menú desplegable." },
          { text: "Tu usuario aparece en el menú", detail: "Es alfanumérico, a veces empieza con '@'." },
          { text: "Pegalo acá sin la '@'", detail: "" },
        ]}
      />
      <div style={{ marginTop: 18, padding: "12px 14px", background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 8 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <Info size={14} color="#60A5FA" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 11, color: TEXT_SECONDARY, lineHeight: 1.6 }}>
            <strong style={{ color: TEXT_PRIMARY }}>Después del wizard</strong>, te vamos a pedir que autorices a NitroSales desde MELI vía login oficial.
          </div>
        </div>
      </div>
      <div style={{ marginTop: 20 }}>
        <Field label="Usuario MercadoLibre">
          <Input value={creds.username || ""} onChange={(v) => onChange("username", v)} placeholder="tuusuario (sin @)" maxLength={60} />
        </Field>
      </div>
    </PlatformHeader>
  );
}

function MetaAdsStep({ creds, onChange }: any) {
  return (
    <PlatformHeader brand="META_ADS" name="Meta Ads" description="Necesitamos un System User token de tu Business Manager (dura para siempre, no vence).">
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
      <div style={{ marginTop: 20 }}>
        <Field label="Ad Account ID" hint="Solo los números (sin 'act_').">
          <Input value={creds.adAccountId || ""} onChange={(v) => onChange("adAccountId", v.replace(/[^0-9]/g, ""))} placeholder="123456789" mono maxLength={30} />
        </Field>
        <Field label="Access Token (System User)">
          <Input value={creds.accessToken || ""} onChange={(v) => onChange("accessToken", v)} placeholder="EAA..." mono />
        </Field>
      </div>
    </PlatformHeader>
  );
}

function MetaPixelStep({ creds, onChange }: any) {
  return (
    <PlatformHeader brand="META_PIXEL" name="Meta Pixel (CAPI)" description="El Pixel maneja tracking server-side de conversiones hacia Meta.">
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
      <div style={{ marginTop: 20 }}>
        <Field label="Pixel ID" hint="15-16 dígitos, solo números.">
          <Input value={creds.pixelId || ""} onChange={(v) => onChange("pixelId", v.replace(/[^0-9]/g, ""))} placeholder="1234567890123456" mono maxLength={20} />
        </Field>
        <Field label="Access Token CAPI">
          <Input value={creds.accessToken || ""} onChange={(v) => onChange("accessToken", v)} placeholder="EAA..." mono />
        </Field>
      </div>
    </PlatformHeader>
  );
}

function GoogleAdsStep({ creds, onChange }: any) {
  return (
    <PlatformHeader brand="GOOGLE_ADS" name="Google Ads" description="Usamos OAuth oficial. Acá solo necesitamos tu Customer ID.">
      <Tutorial
        title="Dónde está el Customer ID"
        steps={[
          { text: "Abrí ads.google.com logueado", detail: "" },
          { text: "Arriba a la derecha ves un número 123-456-7890", detail: "Puede aparecer como 'CID: 1234567890'." },
          { text: "Copialo SIN los guiones (10 dígitos)", detail: "" },
        ]}
        docUrl="https://support.google.com/google-ads/answer/1704344"
      />
      <div style={{ marginTop: 18, padding: "12px 14px", background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 8 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <Info size={14} color="#60A5FA" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 11, color: TEXT_SECONDARY, lineHeight: 1.6 }}>
            <strong style={{ color: TEXT_PRIMARY }}>Después del wizard</strong>, te llevamos a login oficial de Google para autorizar.
          </div>
        </div>
      </div>
      <div style={{ marginTop: 20 }}>
        <Field label="Customer ID" hint="10 dígitos sin guiones.">
          <Input value={creds.customerId || ""} onChange={(v) => onChange("customerId", v.replace(/[^0-9]/g, ""))} placeholder="1234567890" mono maxLength={10} />
        </Field>
      </div>
    </PlatformHeader>
  );
}

function GscStep({ creds, onChange }: any) {
  return (
    <PlatformHeader brand="GSC" name="Google Search Console" description="Para Search Console usamos OAuth oficial. Acá solo necesitamos la URL de tu propiedad.">
      <Tutorial
        title="Dónde está la URL de tu propiedad"
        steps={[
          { text: "Abrí search.google.com/search-console logueado", detail: "" },
          { text: "Arriba a la izquierda, selector de propiedades", detail: "Ves la lista de sitios verificados en tu cuenta." },
          { text: "Copiá la URL exacta de tu propiedad", detail: "Ej: https://www.tutienda.com/ (con https y barra final si corresponde)." },
        ]}
        docUrl="https://support.google.com/webmasters/answer/34592"
      />
      <div style={{ marginTop: 18, padding: "12px 14px", background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 8 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <Info size={14} color="#60A5FA" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 11, color: TEXT_SECONDARY, lineHeight: 1.6 }}>
            <strong style={{ color: TEXT_PRIMARY }}>Después del wizard</strong>, te llevamos a login oficial de Google para autorizar acceso a Search Console.
          </div>
        </div>
      </div>
      <div style={{ marginTop: 20 }}>
        <Field label="URL de tu propiedad" hint="La URL exacta como aparece en Search Console.">
          <Input value={creds.propertyUrl || ""} onChange={(v) => onChange("propertyUrl", v)} placeholder="https://www.tutienda.com/" mono />
        </Field>
      </div>
    </PlatformHeader>
  );
}

// ═══════════════════════════════════════════════════════════════
// History step
// ═══════════════════════════════════════════════════════════════

function HistoryStep({ active, history, onChange }: { active: BrandKey[]; history: Record<string, number>; onChange: (k: string, v: number) => void }) {
  const OPTIONS = [
    { months: 3, label: "3 meses", eta: "minutos" },
    { months: 6, label: "6 meses", eta: "~30 min" },
    { months: 12, label: "1 año", eta: "1-2 hs" },
    { months: 24, label: "2 años", eta: "3-6 hs" },
    { months: -1, label: "Todo", eta: "~1 día" },
  ];

  // GSC no tiene backfill historico (es SEO, no orders)
  const filtered = active.filter((k) => k !== "GSC" && k !== "META_PIXEL");

  return (
    <div>
      <Title>Cuánta historia querés traer</Title>
      <p style={{ color: TEXT_SECONDARY, fontSize: 14, lineHeight: 1.7, margin: "0 0 20px" }}>
        Más tiempo = más data histórica desde día 1, pero la activación tarda más. Podés elegir distinto por plataforma.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {filtered.map((k) => {
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

// ═══════════════════════════════════════════════════════════════
// Confirm step
// ═══════════════════════════════════════════════════════════════

function ConfirmStep({ activePlatforms, history, creds }: any) {
  const HIST_LABEL = (m: number) => {
    if (m === -1) return "Todo";
    if (m === 1) return "1 mes";
    return `${m} meses`;
  };

  return (
    <div>
      <Title>Revisá antes de enviar</Title>
      <p style={{ color: TEXT_SECONDARY, fontSize: 14, lineHeight: 1.7, margin: "0 0 20px" }}>
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
              {p.key !== "GSC" && p.key !== "META_PIXEL" && (
                <div style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 6, paddingLeft: 36 }}>
                  Historia: <strong style={{ color: TEXT_PRIMARY }}>{HIST_LABEL(history[p.key] ?? 12)}</strong>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 18, padding: "12px 14px", background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 8, display: "flex", gap: 8 }}>
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

function Field({ label, hint, children }: any) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
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

const errorBoxStyle: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 14px",
  background: "rgba(239,68,68,0.08)",
  border: "1px solid rgba(239,68,68,0.3)",
  borderRadius: 8,
  color: "#F87171",
  fontSize: 12,
};

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "11px 22px",
    background: disabled ? "#27272A" : `linear-gradient(135deg, ${BRAND_ORANGE}, #FF8C4A)`,
    color: "#fff",
    border: "none",
    borderRadius: 9,
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? "wait" : "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    boxShadow: disabled ? "none" : "0 4px 14px rgba(255,94,26,0.28)",
  };
}

function secondaryBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "10px 18px",
    background: "transparent",
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    color: disabled ? TEXT_MUTED : TEXT_SECONDARY,
    fontSize: 13,
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };
}
