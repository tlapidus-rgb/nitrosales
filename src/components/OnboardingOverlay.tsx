// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// OnboardingOverlay
// ══════════════════════════════════════════════════════════════
// Overlay full-screen que bloquea la plataforma del cliente mientras
// no esté completo el onboarding. 4 fases:
//   - wizard:     cliente debe completar plataformas + credenciales
//   - validating: cliente envió wizard, esperando aprobación de Tomy
//   - backfilling: backfill corriendo (con %)
//   - done:       overlay desaparece (devuelve null)
//
// Background: blur sobre la plataforma + aurora premium.
// ══════════════════════════════════════════════════════════════

import React, { useEffect, useState } from "react";
import {
  Sparkles,
  ShieldCheck,
  Loader2,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
} from "lucide-react";

const BRAND_ORANGE = "#FF5E1A";
const CARD_BG = "rgba(20,20,25,0.95)";
const BORDER = "rgba(255,255,255,0.08)";
const TEXT_PRIMARY = "#FFFFFF";
const TEXT_SECONDARY = "#9CA3AF";
const ACCENT_GREEN = "#22C55E";

type Phase = "wizard" | "validating" | "backfilling" | "done";

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
    // Refresca cada 30s para detectar cambios de estado
    const t = setInterval(fetchState, 30000);
    return () => clearInterval(t);
  }, []);

  if (!loaded || !state || !state.locked) return null;

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
          maxWidth: 720,
          maxHeight: "90vh",
          overflow: "auto",
          background: CARD_BG,
          border: `1px solid ${BORDER}`,
          borderRadius: 20,
          boxShadow: "0 30px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.02) inset",
          padding: 32,
          color: TEXT_PRIMARY,
        }}
      >
        {state.phase === "wizard" && <WizardPhase onSubmitted={fetchState} />}
        {state.phase === "validating" && <ValidatingPhase />}
        {state.phase === "backfilling" && <BackfillingPhase progress={state.backfillProgress} />}
      </div>
    </div>
  );
}

// ─── Phase: validating (esperando aprobación de Tomy) ──────────
function ValidatingPhase() {
  return (
    <div style={{ textAlign: "center", padding: "20px 0" }}>
      <div style={{ display: "inline-flex", marginBottom: 18 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "rgba(255,94,26,0.1)",
            border: "1px solid rgba(255,94,26,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Clock size={28} color={BRAND_ORANGE} />
        </div>
      </div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: BRAND_ORANGE,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          marginBottom: 12,
        }}
      >
        Validando tus datos
      </div>
      <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 14px" }}>
        Estamos revisando tu configuración
      </h1>
      <p style={{ color: TEXT_SECONDARY, fontSize: 14, lineHeight: 1.7, margin: "0 0 20px", maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
        Nuestro equipo está validando las credenciales que cargaste. Te avisamos por email apenas
        aprobemos el backfill de tu data histórica. <strong style={{ color: TEXT_PRIMARY }}>Esto suele tomar entre 2 y 24 hs hábiles.</strong>
      </p>
      <p style={{ color: TEXT_SECONDARY, fontSize: 12, marginTop: 24 }}>
        Podés cerrar esta ventana — te llega un email cuando esté listo.
      </p>
    </div>
  );
}

// ─── Phase: backfilling (jobs corriendo) ───────────────────────
function BackfillingPhase({ progress }: { progress: any }) {
  const overallPct = progress?.overallPct || 0;
  const jobs = progress?.jobs || [];

  return (
    <div style={{ padding: "10px 0" }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ display: "inline-flex", marginBottom: 18 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "rgba(255,94,26,0.1)",
              border: "1px solid rgba(255,94,26,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Loader2 size={28} color={BRAND_ORANGE} style={{ animation: "spin 2s linear infinite" }} />
          </div>
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: BRAND_ORANGE,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            marginBottom: 12,
          }}
        >
          Procesando data histórica · {overallPct}%
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 14px" }}>
          Estamos trayendo tu historia
        </h1>
        <p style={{ color: TEXT_SECONDARY, fontSize: 14, lineHeight: 1.7, margin: 0, maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
          Cuando termine, todo el producto se desbloquea automáticamente. Podés cerrar la pestaña
          o esperar acá — te avisamos por email también.
        </p>
      </div>

      {/* Overall progress */}
      <div
        style={{
          height: 8,
          background: "rgba(255,255,255,0.05)",
          borderRadius: 99,
          overflow: "hidden",
          marginBottom: 18,
        }}
      >
        <div
          style={{
            width: `${overallPct}%`,
            height: "100%",
            background: `linear-gradient(90deg, ${BRAND_ORANGE}, #FF8C4A)`,
            transition: "width 600ms ease",
          }}
        />
      </div>

      {/* Per-platform jobs */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {jobs.map((j: any) => (
          <div
            key={j.platform}
            style={{
              padding: "10px 14px",
              background: "rgba(255,255,255,0.02)",
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_PRIMARY, flex: 1 }}>
                {j.platform}
              </div>
              <div style={{ fontSize: 11, color: TEXT_SECONDARY, fontWeight: 600 }}>
                {j.progressPct}%
              </div>
            </div>
            <div
              style={{
                height: 4,
                background: "rgba(255,255,255,0.05)",
                borderRadius: 99,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${j.progressPct}%`,
                  height: "100%",
                  background: BRAND_ORANGE,
                  transition: "width 600ms ease",
                }}
              />
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

      <style jsx global>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Phase: wizard (form de plataformas + credenciales) ────────
const PLATFORMS = [
  { key: "VTEX", name: "VTEX", color: "#FF0080", description: "Pedidos, productos, stock en tiempo real.", historyKey: "VTEX" },
  { key: "MERCADOLIBRE", name: "MercadoLibre", color: "#FFE600", description: "Cuenta vendedor. OAuth después.", historyKey: "MERCADOLIBRE" },
  { key: "META_ADS", name: "Meta Ads", color: "#1877F2", description: "Facebook + Instagram Ads.", historyKey: "META_ADS" },
  { key: "META_PIXEL", name: "Meta Pixel (CAPI)", color: "#1877F2", description: "Conversiones server-side." },
  { key: "GOOGLE_ADS", name: "Google Ads", color: "#4285F4", description: "Search, Shopping, PMax. OAuth después.", historyKey: "GOOGLE_ADS" },
];

function WizardPhase({ onSubmitted }: { onSubmitted: () => void }) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [creds, setCreds] = useState<Record<string, any>>({});
  const [history, setHistory] = useState<Record<string, number>>({
    VTEX: 12,
    MERCADOLIBRE: 12,
    META_ADS: 6,
    GOOGLE_ADS: 6,
  });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleSelected = (key: string) => {
    setSelected((s) => ({ ...s, [key]: !s[key] }));
    if (!selected[key]) {
      setExpanded(key);
      if (!creds[key]) setCreds((c) => ({ ...c, [key]: {} }));
    }
  };

  const updateCred = (platformKey: string, field: string, value: string) => {
    setCreds((c) => ({ ...c, [platformKey]: { ...(c[platformKey] || {}), [field]: value } }));
  };

  const submit = async () => {
    const platformsArr = Object.keys(selected)
      .filter((k) => selected[k])
      .map((k) => ({ platform: k, credentials: creds[k] || {} }));

    if (platformsArr.length === 0) {
      setError("Seleccioná al menos una plataforma para continuar");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/me/onboarding/submit-wizard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platforms: platformsArr,
          historyMonths: history,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Error");
        setSubmitting(false);
        return;
      }
      // Refrescar estado del overlay → debería pasar a 'validating'
      onSubmitted();
    } catch (err: any) {
      setError(err?.message || "Error de red");
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 12px",
            background: "rgba(255,94,26,0.1)",
            border: "1px solid rgba(255,94,26,0.25)",
            borderRadius: 99,
            fontSize: 11,
            fontWeight: 600,
            color: BRAND_ORANGE,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: 14,
          }}
        >
          <Sparkles size={12} />
          Onboarding · Paso final
        </div>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            margin: "0 0 10px",
            background: "linear-gradient(135deg, #fff 0%, #9CA3AF 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Conectá tus plataformas
        </h1>
        <p style={{ color: TEXT_SECONDARY, fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          Marcá las que usás y cargá las credenciales. Todo encriptado AES-256.
          <br />
          NitroSales valida y arranca el backfill cuando esté listo.
        </p>
      </div>

      {/* Trust banner */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          padding: "10px 14px",
          background: "rgba(34,197,94,0.06)",
          border: "1px solid rgba(34,197,94,0.2)",
          borderRadius: 8,
          marginBottom: 20,
        }}
      >
        <ShieldCheck size={14} color={ACCENT_GREEN} style={{ flexShrink: 0, marginTop: 2 }} />
        <span style={{ fontSize: 11, color: TEXT_SECONDARY, lineHeight: 1.6 }}>
          Las credenciales se encriptan antes de guardarse. Solo nuestro equipo de soporte puede
          desencriptarlas para ayudarte si hay problemas.
        </span>
      </div>

      {/* Platforms */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {PLATFORMS.map((p) => {
          const isSelected = !!selected[p.key];
          const isExpanded = expanded === p.key && isSelected;
          return (
            <div
              key={p.key}
              style={{
                background: isSelected ? `${p.color}0D` : "rgba(255,255,255,0.02)",
                border: `1px solid ${isSelected ? `${p.color}44` : BORDER}`,
                borderRadius: 12,
                overflow: "hidden",
                transition: "all 160ms",
              }}
            >
              {/* Row header */}
              <div
                onClick={() => toggleSelected(p.key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 16px",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 5,
                    border: `2px solid ${isSelected ? p.color : "#3F3F46"}`,
                    background: isSelected ? p.color : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    transition: "all 120ms",
                  }}
                >
                  {isSelected && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? "#fff" : TEXT_PRIMARY }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 2 }}>{p.description}</div>
                </div>
                {isSelected && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpanded(isExpanded ? null : p.key);
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: TEXT_SECONDARY,
                      cursor: "pointer",
                      padding: 4,
                    }}
                  >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                )}
              </div>

              {/* Expanded form */}
              {isExpanded && (
                <div onClick={(e) => e.stopPropagation()} style={{ padding: "0 16px 16px", borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
                  {p.key === "VTEX" && (
                    <>
                      <FormField label="Account Name" tutorial={{
                        title: "¿Cuál es mi Account Name?",
                        steps: [
                          "Es el subdomain de tu admin VTEX.",
                          "Si tu admin es 'miempresa.myvtex.com', tu account name es 'miempresa'.",
                        ],
                      }}>
                        <Input value={creds[p.key]?.accountName || ""} onChange={(v) => updateCred(p.key, "accountName", v)} placeholder="miempresa" maxLength={60} />
                      </FormField>
                      <FormField label="App Key" tutorial={{
                        title: "¿Cómo genero App Key + Token?",
                        steps: [
                          "VTEX Admin → Cuenta → Gestión de usuarios → App Keys.",
                          "Click 'Crear key' (nombre: NitroSales).",
                          "Roles mínimos: Order Viewer, Catalog Read, Product Viewer.",
                          "Copiar App Key y App Token (solo se muestran una vez).",
                        ],
                        docUrl: "https://developers.vtex.com/docs/guides/api-authentication-using-application-keys",
                      }}>
                        <Input value={creds[p.key]?.appKey || ""} onChange={(v) => updateCred(p.key, "appKey", v)} placeholder="vtexappkey-..." mono />
                      </FormField>
                      <FormField label="App Token">
                        <Input value={creds[p.key]?.appToken || ""} onChange={(v) => updateCred(p.key, "appToken", v)} placeholder="Token largo alfanumérico" mono />
                      </FormField>
                    </>
                  )}
                  {p.key === "MERCADOLIBRE" && (
                    <FormField label="Nombre de usuario ML" hint="Después conectamos via OAuth." tutorial={{
                      title: "¿Dónde veo mi usuario ML?",
                      steps: ["mercadolibre.com.ar logueado", "Click en tu nombre arriba a la derecha", "Pegá tu usuario sin la @"],
                    }}>
                      <Input value={creds[p.key]?.username || ""} onChange={(v) => updateCred(p.key, "username", v)} placeholder="tuusuario" maxLength={60} />
                    </FormField>
                  )}
                  {p.key === "META_ADS" && (
                    <>
                      <FormField label="Ad Account ID" tutorial={{
                        title: "¿Cómo encuentro mi Ad Account ID?",
                        steps: [
                          "business.facebook.com",
                          "Configuración del negocio → Cuentas → Cuentas publicitarias",
                          "Copiá el ID (empieza con 'act_')",
                        ],
                      }}>
                        <Input value={creds[p.key]?.adAccountId || ""} onChange={(v) => updateCred(p.key, "adAccountId", v)} placeholder="act_123456789" mono />
                      </FormField>
                      <FormField label="Access Token (System User)" tutorial={{
                        title: "¿Cómo genero el Access Token?",
                        steps: [
                          "Business Manager → Usuarios del sistema → Agregar (rol Admin)",
                          "Asignar tu Ad Account",
                          "Generar token con: ads_management, ads_read, business_management",
                          "Usar System User, NO personal",
                        ],
                      }}>
                        <Input value={creds[p.key]?.accessToken || ""} onChange={(v) => updateCred(p.key, "accessToken", v)} placeholder="Token largo" mono />
                      </FormField>
                    </>
                  )}
                  {p.key === "META_PIXEL" && (
                    <>
                      <FormField label="Pixel ID" tutorial={{
                        title: "¿Qué es el Pixel ID?",
                        steps: [
                          "Distinto del Ad Account ID — identifica el pixel de conversiones",
                          "business.facebook.com/events_manager",
                          "Tu pixel → Configuración → ID del pixel (15-16 dígitos)",
                        ],
                      }}>
                        <Input value={creds[p.key]?.pixelId || ""} onChange={(v) => updateCred(p.key, "pixelId", v.replace(/[^0-9]/g, ""))} placeholder="1234567890123456" mono maxLength={20} />
                      </FormField>
                      <FormField label="Access Token CAPI" hint="Puede ser el mismo de Meta Ads si tiene ads_management.">
                        <Input value={creds[p.key]?.accessToken || ""} onChange={(v) => updateCred(p.key, "accessToken", v)} placeholder="Token de acceso" mono />
                      </FormField>
                    </>
                  )}
                  {p.key === "GOOGLE_ADS" && (
                    <FormField label="Customer ID" hint="Después conectamos via OAuth." tutorial={{
                      title: "¿Cómo encuentro mi Customer ID?",
                      steps: [
                        "ads.google.com logueado",
                        "Arriba a la derecha, número con formato 123-456-7890",
                        "Pegalo SIN guiones (10 dígitos)",
                      ],
                    }}>
                      <Input value={creds[p.key]?.customerId || ""} onChange={(v) => updateCred(p.key, "customerId", v.replace(/[^0-9]/g, ""))} placeholder="1234567890" mono maxLength={10} />
                    </FormField>
                  )}

                  {/* History range */}
                  {p.historyKey && (
                    <HistoryPicker
                      value={history[p.historyKey] || 12}
                      onChange={(v) => setHistory((h) => ({ ...h, [p.historyKey!]: v }))}
                      color={p.color}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <div style={{ marginTop: 16, padding: "10px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#F87171", fontSize: 12 }}>
          {error}
        </div>
      )}

      <button
        onClick={submit}
        disabled={submitting}
        style={{
          marginTop: 24,
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
          <>
            <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
            Enviando…
          </>
        ) : (
          <>
            Enviar para validación <ArrowRight size={14} />
          </>
        )}
      </button>
    </div>
  );
}

function FormField({ label, children, tutorial, hint }: any) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: TEXT_PRIMARY }}>{label}</label>
        {tutorial && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            style={{
              fontSize: 10,
              padding: "2px 7px",
              background: "rgba(255,255,255,0.05)",
              border: `1px solid ${BORDER}`,
              borderRadius: 5,
              color: TEXT_SECONDARY,
              cursor: "pointer",
            }}
          >
            {show ? "Ocultar tutorial" : "¿Cómo lo obtengo?"}
          </button>
        )}
      </div>
      {children}
      {hint && <div style={{ fontSize: 10, color: TEXT_SECONDARY, marginTop: 4 }}>{hint}</div>}
      {tutorial && show && (
        <div style={{ marginTop: 8, padding: "10px 12px", background: "rgba(255,255,255,0.02)", border: `1px dashed ${BORDER}`, borderRadius: 7 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: TEXT_PRIMARY, marginBottom: 6 }}>
            {tutorial.title}
          </div>
          <ol style={{ margin: 0, paddingLeft: 16, fontSize: 10, color: TEXT_SECONDARY, lineHeight: 1.7 }}>
            {tutorial.steps.map((s: string, i: number) => <li key={i}>{s}</li>)}
          </ol>
          {tutorial.docUrl && (
            <a href={tutorial.docUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 3, marginTop: 6, fontSize: 10, color: BRAND_ORANGE, textDecoration: "none" }}>
              Ver doc oficial <ExternalLink size={9} />
            </a>
          )}
        </div>
      )}
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
        padding: "9px 11px",
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${BORDER}`,
        borderRadius: 7,
        color: "#fff",
        fontSize: 12,
        outline: "none",
        fontFamily: mono ? "'SF Mono', Menlo, Consolas, monospace" : undefined,
        boxSizing: "border-box",
      }}
    />
  );
}

function HistoryPicker({ value, onChange, color }: { value: number; onChange: (v: number) => void; color: string }) {
  const options = [
    { months: 3, label: "3m", eta: "min" },
    { months: 6, label: "6m", eta: "30 min" },
    { months: 12, label: "1 año", eta: "1-2h" },
    { months: 24, label: "2 años", eta: "3-6h" },
    { months: -1, label: "Todo", eta: "1 día" },
  ];
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px dashed ${BORDER}` }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: TEXT_PRIMARY, marginBottom: 4 }}>
        Cuánta historia querés
      </div>
      <div style={{ fontSize: 10, color: TEXT_SECONDARY, marginBottom: 8 }}>
        Más tiempo = backfill más lento, pero más data desde día 1.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 5 }}>
        {options.map((opt) => {
          const active = value === opt.months;
          return (
            <button
              key={opt.months}
              type="button"
              onClick={() => onChange(opt.months)}
              style={{
                padding: "7px 4px",
                background: active ? `${color}1A` : "rgba(255,255,255,0.03)",
                border: `1px solid ${active ? color : BORDER}`,
                borderRadius: 6,
                color: active ? "#fff" : TEXT_SECONDARY,
                cursor: "pointer",
                textAlign: "center",
                fontSize: 11,
              }}
            >
              <div style={{ fontWeight: active ? 700 : 500 }}>{opt.label}</div>
              <div style={{ fontSize: 9, color: active ? color : TEXT_SECONDARY, marginTop: 2 }}>{opt.eta}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
