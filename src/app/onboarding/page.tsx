// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// /onboarding — Form de activación publica
// ══════════════════════════════════════════════════════════════
// Layout split premium (Linear/Vercel style):
//  - Izquierda: hero con promesa + features + integraciones
//  - Derecha: form compacto con 6 campos
//  - Mobile: stack vertical (hero arriba, form abajo)
//
// Pre-llenado: lee query params ?company=X&contact=Y del link del
// invite email. Si vienen, los usa en el hero personalizado y en
// los campos iniciales del form.
// ══════════════════════════════════════════════════════════════

import React, { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2, CheckCircle2, Zap, Sparkles, TrendingUp, BarChart3 } from "lucide-react";

const BRAND_BG = "#0A0A0F";
const CARD_BG = "#141419";
const BRAND_ORANGE = "#FF5E1A";
const TEXT_PRIMARY = "#FFFFFF";
const TEXT_SECONDARY = "#9CA3AF";
const TEXT_MUTED = "#6B7280";
const BORDER = "#1F1F2E";

const REFERRAL_OPTIONS = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "instagram", label: "Instagram" },
  { value: "google", label: "Google / búsqueda" },
  { value: "referido", label: "Me lo recomendó alguien" },
  { value: "evento", label: "Un evento o charla" },
  { value: "podcast", label: "Podcast / contenido" },
  { value: "otro", label: "Otro" },
];

interface FormData {
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  referralSource: string;
  notes: string;
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<PageShell><div /></PageShell>}>
      <OnboardingPageInner />
    </Suspense>
  );
}

function OnboardingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Pre-llenar desde query params (vienen del link del invite email)
  const qpCompany = searchParams.get("company") || "";
  const qpContact = searchParams.get("contact") || "";

  const initialData: FormData = {
    companyName: qpCompany,
    contactName: qpContact,
    contactEmail: "",
    contactPhone: "",
    referralSource: "",
    notes: "",
  };

  const [data, setData] = useState<FormData>(initialData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const personalizedCompany = qpCompany.trim();

  const update = (patch: Partial<FormData>) => {
    setData((d) => ({ ...d, ...patch }));
    const cleared: Record<string, string> = {};
    Object.keys(patch).forEach((k) => {
      if (errors[k]) cleared[k] = "";
    });
    if (Object.keys(cleared).length > 0) {
      setErrors((e) => ({ ...e, ...cleared }));
    }
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!data.companyName.trim() || data.companyName.trim().length < 2) e.companyName = "Nombre de empresa requerido";
    if (!data.contactName.trim() || data.contactName.trim().length < 2) e.contactName = "Tu nombre es requerido";
    if (!data.contactEmail.trim()) e.contactEmail = "Email requerido";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contactEmail)) e.contactEmail = "Email inválido";
    if (!data.referralSource) e.referralSource = "Contanos por dónde nos conociste";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch("/api/public/onboarding/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: data.companyName.trim(),
          contactName: data.contactName.trim(),
          contactEmail: data.contactEmail.trim().toLowerCase(),
          contactPhone: data.contactPhone.trim() || undefined,
          referralSource: data.referralSource,
          notes: data.notes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setServerError(json.error || `Error ${res.status}`);
        setSubmitting(false);
        return;
      }
      setSubmitted(true);
    } catch (err: any) {
      setServerError(err?.message || "Error de red");
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <PageShell>
        <SuccessCard companyName={data.companyName} onBack={() => router.push("/")} />
      </PageShell>
    );
  }

  return (
    <PageShell>
      {/* Headline compacto arriba del split — visible en first fold junto al form */}
      <div className="top-hero">
        <div
          style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            padding: "5px 12px",
            background: "rgba(255,94,26,0.08)",
            border: "1px solid rgba(255,94,26,0.25)",
            borderRadius: 999,
            fontSize: 10.5, fontWeight: 700, color: BRAND_ORANGE,
            textTransform: "uppercase", letterSpacing: "0.16em",
            marginBottom: 16,
          }}
        >
          <Zap size={11} fill={BRAND_ORANGE} />
          Implementá AI commerce
        </div>
        <h1 className="hero-h1" style={{ fontSize: 36, fontWeight: 800, color: TEXT_PRIMARY, letterSpacing: "-0.03em", lineHeight: 1.12, margin: "0 0 12px" }}>
          {personalizedCompany ? (
            <>Activá NitroSales para <span style={{ color: BRAND_ORANGE }}>{personalizedCompany}</span></>
          ) : (
            <>Activá tu acceso <span style={{ color: BRAND_ORANGE }}>a NitroSales</span></>
          )}
        </h1>
        <p style={{ margin: "0 0 28px", fontSize: 15, lineHeight: 1.55, color: TEXT_SECONDARY, maxWidth: 640 }}>
          La plataforma de inteligencia comercial para ecommerce LATAM. Completá el formulario y habilitamos tu acceso.
        </p>
      </div>

      <div className="split-wrap">
        {/* ══════════ LEFT: FORM (aparece primero visualmente) ══════════ */}
        <div className="form-pane">
          <div
            style={{
              background: CARD_BG,
              border: `1px solid ${BORDER}`,
              borderRadius: 18,
              padding: 30,
              boxShadow: "0 30px 80px rgba(0,0,0,0.4)",
              maxWidth: 440,
              margin: "0 auto",
              width: "100%",
            }}
          >
            {/* Card header */}
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: TEXT_SECONDARY, textTransform: "uppercase", letterSpacing: "0.18em", marginBottom: 10, opacity: 0.85 }}>
                Completá tu acceso
              </div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: TEXT_PRIMARY, letterSpacing: "-0.01em", lineHeight: 1.25 }}>
                Un formulario, 2 minutos.
              </h2>
              <p style={{ margin: "8px 0 0", fontSize: 13, color: TEXT_SECONDARY, lineHeight: 1.5 }}>
                Con estos datos habilitamos tu cuenta para conectar tus plataformas.
              </p>
            </div>

            {/* Fields */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Field label="Empresa" error={errors.companyName} required>
                <Input value={data.companyName} onChange={(v) => update({ companyName: v })} placeholder="Nombre de tu empresa" maxLength={120} />
              </Field>

              <Field label="Tu nombre" error={errors.contactName} required>
                <Input value={data.contactName} onChange={(v) => update({ contactName: v })} placeholder="Cómo te llamás" maxLength={120} />
              </Field>

              <Field label="Email" error={errors.contactEmail} required>
                <Input type="email" value={data.contactEmail} onChange={(v) => update({ contactEmail: v })} placeholder="vos@empresa.com" maxLength={120} />
              </Field>

              <Field label="Teléfono o WhatsApp" hint="Opcional">
                <Input value={data.contactPhone} onChange={(v) => update({ contactPhone: v })} placeholder="+54 9 11 …" maxLength={40} />
              </Field>

              <Field label="¿Por dónde nos conociste?" error={errors.referralSource} required>
                <Select value={data.referralSource} onChange={(v) => update({ referralSource: v })} options={REFERRAL_OPTIONS} placeholder="Elegí una opción" />
              </Field>

              <Field label="Contanos algo de tu negocio" hint="Opcional — qué vendés, dónde estás, etc.">
                <Textarea value={data.notes} onChange={(v) => update({ notes: v })} placeholder="Lo que quieras compartir…" maxLength={1000} />
              </Field>
            </div>

            {serverError && (
              <div
                style={{
                  marginTop: 16,
                  padding: "11px 13px",
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: 8,
                  color: "#FCA5A5",
                  fontSize: 13,
                }}
              >
                {serverError}
              </div>
            )}

            <button
              onClick={submit}
              disabled={submitting}
              style={{
                marginTop: 22, width: "100%", padding: "14px 22px",
                background: submitting ? "#27272A" : `linear-gradient(135deg, ${BRAND_ORANGE}, #FF8C4A)`,
                color: "#fff", border: "none", borderRadius: 10,
                fontSize: 14, fontWeight: 700, cursor: submitting ? "wait" : "pointer",
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                boxShadow: submitting ? "none" : "0 8px 24px rgba(255,94,26,0.35)",
                letterSpacing: "0.005em",
              }}
            >
              {submitting ? (
                <>
                  <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                  Enviando…
                </>
              ) : (
                <>
                  Completar activación
                  <ArrowRight size={14} />
                </>
              )}
            </button>

            <div style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: TEXT_MUTED, lineHeight: 1.6 }}>
              El equipo revisa los datos y habilita el acceso al producto.
            </div>
          </div>
        </div>

        {/* ══════════ RIGHT: features + integraciones (refuerzo visual) ══════════ */}
        <div className="side-pane">
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 32 }}>
            <FeatureRow icon={<BarChart3 size={16} />} title="Atribución propia" desc="Nuestro píxel mide cada venta sin depender de Meta ni Google." />
            <FeatureRow icon={<TrendingUp size={16} />} title="P&L en tiempo real" desc="Rentabilidad por canal, producto y campaña." />
            <FeatureRow icon={<Sparkles size={16} />} title="Operado por IA" desc="Aurum analiza tus datos y te dice qué hacer." />
          </div>

          <div style={{ paddingTop: 22, borderTop: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.18em", marginBottom: 12 }}>
              Integrado nativamente con
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              <IntegrationChip label="VTEX" />
              <IntegrationChip label="MercadoLibre" />
              <IntegrationChip label="Meta Ads" />
              <IntegrationChip label="Google Ads" />
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes spin { to { transform: rotate(360deg); } }

        .top-hero {
          max-width: 1160px;
          margin: 8px auto 20px;
          padding: 0 40px;
          text-align: left;
        }

        .split-wrap {
          display: grid;
          grid-template-columns: 1fr 0.85fr;
          gap: 56px;
          max-width: 1160px;
          margin: 0 auto 80px;
          padding: 8px 40px;
          align-items: flex-start;
        }
        .form-pane { display: flex; justify-content: flex-start; }
        .side-pane { padding-top: 16px; }

        @media (max-width: 960px) {
          .top-hero { padding: 0 20px; margin-bottom: 16px; }
          .hero-h1 { font-size: 28px !important; line-height: 1.15 !important; }
          .split-wrap {
            grid-template-columns: 1fr;
            gap: 32px;
            padding: 0 20px;
          }
          .side-pane { padding-top: 0; }
        }
      `}</style>
    </PageShell>
  );
}

// ══════════════════════════════════════════════════════════════
// PageShell
// ══════════════════════════════════════════════════════════════

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: BRAND_BG,
        color: TEXT_PRIMARY,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Aura bg — más marcado */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 900px 500px at 15% 10%, rgba(255,94,26,0.18) 0%, transparent 55%), radial-gradient(ellipse 800px 600px at 85% 90%, rgba(168,85,247,0.12) 0%, transparent 55%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative", padding: "22px 32px", display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 32, height: 32, borderRadius: 8,
            background: `linear-gradient(135deg, ${BRAND_ORANGE}, #FF8C4A)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 800, color: "#fff",
          }}
        >
          N
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em" }}>NitroSales</div>
      </div>

      <div style={{ position: "relative" }}>{children}</div>
    </div>
  );
}

function FeatureRow({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
      <div
        style={{
          flexShrink: 0,
          width: 32, height: 32, borderRadius: 8,
          background: "rgba(255,94,26,0.1)",
          border: "1px solid rgba(255,94,26,0.25)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: BRAND_ORANGE,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, paddingTop: 2 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: TEXT_PRIMARY, marginBottom: 3, letterSpacing: "-0.005em" }}>{title}</div>
        <div style={{ fontSize: 13, color: TEXT_SECONDARY, lineHeight: 1.5 }}>{desc}</div>
      </div>
    </div>
  );
}

function IntegrationChip({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: "7px 13px",
        background: "rgba(255,255,255,0.04)",
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        fontSize: 12.5,
        fontWeight: 600,
        color: TEXT_SECONDARY,
        letterSpacing: "-0.003em",
      }}
    >
      {label}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// SuccessCard
// ══════════════════════════════════════════════════════════════

function SuccessCard({ companyName, onBack: _onBack }: { companyName: string; onBack: () => void }) {
  return (
    <div style={{ maxWidth: 540, margin: "40px auto 80px", padding: "0 24px" }}>
      <div
        style={{
          background: CARD_BG,
          border: `1px solid ${BORDER}`,
          borderRadius: 20,
          padding: 44,
          textAlign: "center",
          boxShadow: "0 30px 80px rgba(0,0,0,0.4)",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            width: 64, height: 64,
            borderRadius: "50%",
            background: "rgba(34,197,94,0.1)",
            border: "1px solid rgba(34,197,94,0.3)",
            alignItems: "center", justifyContent: "center",
            marginBottom: 22,
          }}
        >
          <CheckCircle2 size={28} color="#22C55E" />
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 14px", color: "#fff" }}>
          Recibimos tus datos
        </h1>
        <p style={{ color: TEXT_SECONDARY, fontSize: 15, lineHeight: 1.7, margin: "0 0 24px" }}>
          El equipo de NitroSales está revisando la activación de{" "}
          <strong style={{ color: "#fff" }}>{companyName || "tu cuenta"}</strong>.
        </p>

        {/* Next step clarísimo */}
        <div
          style={{
            padding: "18px 20px",
            background: "rgba(255,94,26,0.06)",
            border: "1px solid rgba(255,94,26,0.2)",
            borderRadius: 12,
            textAlign: "left",
            marginBottom: 8,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: BRAND_ORANGE, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>
            📧 Qué sigue ahora
          </div>
          <div style={{ fontSize: 14, color: TEXT_PRIMARY, lineHeight: 1.6, marginBottom: 6 }}>
            Vas a recibir un email con las credenciales para entrar al producto.
          </div>
          <div style={{ fontSize: 13, color: TEXT_SECONDARY, lineHeight: 1.6 }}>
            Cerrá esta ventana y esperá el correo. Si no lo ves en unos minutos, revisá spam.
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Inputs
// ══════════════════════════════════════════════════════════════

function Field({
  label, children, error, hint, required,
}: { label: string; children: React.ReactNode; error?: string; hint?: string; required?: boolean }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: TEXT_SECONDARY, letterSpacing: "0.005em" }}>
          {label} {required && <span style={{ color: BRAND_ORANGE }}>*</span>}
        </label>
        {hint && <span style={{ fontSize: 11, color: TEXT_MUTED }}>{hint}</span>}
      </div>
      {children}
      {error && (
        <div style={{ fontSize: 11.5, color: "#FCA5A5", marginTop: 5 }}>{error}</div>
      )}
    </div>
  );
}

function Input({
  value, onChange, placeholder, type = "text", maxLength,
}: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string; maxLength?: number }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      style={{
        width: "100%",
        padding: "11px 13px",
        background: BRAND_BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        color: TEXT_PRIMARY,
        fontSize: 14,
        fontFamily: "inherit",
        outline: "none",
        transition: "border-color 120ms",
        boxSizing: "border-box",
      }}
      onFocus={(e) => (e.currentTarget.style.borderColor = BRAND_ORANGE)}
      onBlur={(e) => (e.currentTarget.style.borderColor = BORDER)}
    />
  );
}

function Textarea({
  value, onChange, placeholder, maxLength,
}: { value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      rows={3}
      style={{
        width: "100%",
        padding: "11px 13px",
        background: BRAND_BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        color: TEXT_PRIMARY,
        fontSize: 14,
        fontFamily: "inherit",
        resize: "vertical",
        lineHeight: 1.5,
        outline: "none",
        boxSizing: "border-box",
      }}
      onFocus={(e) => (e.currentTarget.style.borderColor = BRAND_ORANGE)}
      onBlur={(e) => (e.currentTarget.style.borderColor = BORDER)}
    />
  );
}

function Select({
  value, onChange, options, placeholder,
}: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        padding: "11px 13px",
        background: BRAND_BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        color: value ? TEXT_PRIMARY : TEXT_MUTED,
        fontSize: 14,
        fontFamily: "inherit",
        appearance: "none",
        outline: "none",
        backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'/%3e%3c/svg%3e")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 13px center",
        paddingRight: 36,
        boxSizing: "border-box",
        cursor: "pointer",
      }}
    >
      <option value="" disabled>{placeholder || "Elegí una opción"}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
