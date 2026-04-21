// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// /onboarding — Form de POSTULACION publica (1 pantalla, ultra simple)
// ══════════════════════════════════════════════════════════════
// Solo 6 campos: empresa, tu nombre, email, telefono (opcional),
// referralSource, notas (opcional). El propósito es captar interés.
// Todo lo tecnico se completa adentro del producto post-aprobacion.
// ══════════════════════════════════════════════════════════════

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, CheckCircle2, Zap } from "lucide-react";

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

const initialData: FormData = {
  companyName: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  referralSource: "",
  notes: "",
};

export default function OnboardingPage() {
  const router = useRouter();
  const [data, setData] = useState<FormData>(initialData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

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
    if (!data.companyName.trim() || data.companyName.trim().length < 2) {
      e.companyName = "Nombre de empresa requerido";
    }
    if (!data.contactName.trim() || data.contactName.trim().length < 2) {
      e.contactName = "Tu nombre es requerido";
    }
    if (!data.contactEmail.trim()) {
      e.contactEmail = "Email requerido";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contactEmail)) {
      e.contactEmail = "Email inválido";
    }
    if (!data.referralSource) {
      e.referralSource = "Contanos por dónde nos conociste";
    }
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

  return (
    <div
      style={{
        minHeight: "100vh",
        background: BRAND_BG,
        color: TEXT_PRIMARY,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Aura background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 20% 20%, rgba(255,94,26,0.10) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(168,85,247,0.06) 0%, transparent 50%)",
          pointerEvents: "none",
        }}
      />

      {/* Top brand bar */}
      <div style={{ position: "relative", padding: "24px 28px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: `linear-gradient(135deg, ${BRAND_ORANGE}, #FF8C4A)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontWeight: 800,
              color: "#fff",
            }}
          >
            N
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em" }}>
            NitroSales
          </div>
        </div>
      </div>

      {/* Centered card */}
      <div
        style={{
          position: "relative",
          maxWidth: 540,
          margin: "20px auto 60px",
          padding: "0 24px",
        }}
      >
        {submitted ? (
          <SuccessCard onBack={() => router.push("/")} />
        ) : (
          <div
            style={{
              background: CARD_BG,
              border: `1px solid ${BORDER}`,
              borderRadius: 20,
              padding: 36,
              boxShadow: "0 30px 80px rgba(0,0,0,0.4)",
            }}
          >
            {/* Header */}
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 11px",
                  background: "rgba(255,94,26,0.1)",
                  border: "1px solid rgba(255,94,26,0.25)",
                  borderRadius: 99,
                  fontSize: 10,
                  fontWeight: 700,
                  color: BRAND_ORANGE,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  marginBottom: 16,
                }}
              >
                <Zap size={11} fill={BRAND_ORANGE} />
                Postulación
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
                Postulate para usar NitroSales
              </h1>
              <p
                style={{
                  color: TEXT_SECONDARY,
                  fontSize: 14,
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                La plataforma de operaciones más robusta de LATAM para ecommerce.
              </p>
            </div>

            {/* Form */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Field label="Empresa" error={errors.companyName} required>
                <Input
                  value={data.companyName}
                  onChange={(v) => update({ companyName: v })}
                  placeholder="Nombre de tu empresa"
                  maxLength={120}
                />
              </Field>

              <Field label="Tu nombre" error={errors.contactName} required>
                <Input
                  value={data.contactName}
                  onChange={(v) => update({ contactName: v })}
                  placeholder="Cómo te llamás"
                  maxLength={120}
                />
              </Field>

              <Field label="Email" error={errors.contactEmail} required>
                <Input
                  type="email"
                  value={data.contactEmail}
                  onChange={(v) => update({ contactEmail: v })}
                  placeholder="vos@empresa.com"
                  maxLength={120}
                />
              </Field>

              <Field label="Teléfono o WhatsApp" hint="Opcional">
                <Input
                  value={data.contactPhone}
                  onChange={(v) => update({ contactPhone: v })}
                  placeholder="+54 9 11 …"
                  maxLength={40}
                />
              </Field>

              <Field label="¿Por dónde nos conociste?" error={errors.referralSource} required>
                <Select
                  value={data.referralSource}
                  onChange={(v) => update({ referralSource: v })}
                  options={REFERRAL_OPTIONS}
                  placeholder="Elegí una opción"
                />
              </Field>

              <Field label="Contanos algo de tu negocio" hint="Opcional — qué vendés, dónde estás, etc.">
                <Textarea
                  value={data.notes}
                  onChange={(v) => update({ notes: v })}
                  placeholder="Lo que quieras compartir…"
                  maxLength={1000}
                />
              </Field>
            </div>

            {serverError && (
              <div
                style={{
                  marginTop: 18,
                  padding: "12px 14px",
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
                marginTop: 24,
                width: "100%",
                padding: "14px 22px",
                background: submitting
                  ? "#27272A"
                  : `linear-gradient(135deg, ${BRAND_ORANGE}, #FF8C4A)`,
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
                  Postular ahora
                  <ArrowRight size={14} />
                </>
              )}
            </button>

            <div style={{ textAlign: "center", marginTop: 18, fontSize: 11, color: TEXT_MUTED }}>
              Al postular, aceptás que evaluemos tu negocio para sumarte a NitroSales.
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ─── SuccessCard ─────────────────────────────────────────────
function SuccessCard({ onBack }: { onBack: () => void }) {
  return (
    <div
      style={{
        background: CARD_BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 20,
        padding: 40,
        textAlign: "center",
        boxShadow: "0 30px 80px rgba(0,0,0,0.4)",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: "rgba(34,197,94,0.1)",
          border: "1px solid rgba(34,197,94,0.3)",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 18,
        }}
      >
        <CheckCircle2 size={28} color="#22C55E" />
      </div>
      <h1
        style={{
          fontSize: 26,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          margin: "0 0 12px",
          color: "#fff",
        }}
      >
        Recibimos tu postulación
      </h1>
      <p
        style={{
          color: TEXT_SECONDARY,
          fontSize: 14,
          lineHeight: 1.7,
          margin: "0 0 24px",
        }}
      >
        Vamos a evaluar tu postulación y te contactamos pronto.
        <br />
        Si calificás, te enviamos las credenciales para entrar al producto.
      </p>
      <button
        onClick={onBack}
        style={{
          padding: "10px 20px",
          background: "transparent",
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          color: TEXT_SECONDARY,
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        Volver al inicio
      </button>
    </div>
  );
}

// ─── Inputs ──────────────────────────────────────────────────
function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: TEXT_PRIMARY }}>
          {label}
          {required && <span style={{ color: BRAND_ORANGE, marginLeft: 3 }}>*</span>}
        </label>
        {hint && !error && (
          <span style={{ fontSize: 10, color: TEXT_MUTED }}>{hint}</span>
        )}
        {error && (
          <span style={{ fontSize: 10, color: "#FCA5A5" }}>{error}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  maxLength?: number;
}) {
  return (
    <input
      type={type || "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      style={{
        width: "100%",
        padding: "11px 13px",
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${BORDER}`,
        borderRadius: 9,
        color: "#fff",
        fontSize: 13,
        outline: "none",
        boxSizing: "border-box",
        transition: "border-color 120ms",
      }}
      onFocus={(e) => (e.currentTarget.style.borderColor = BRAND_ORANGE)}
      onBlur={(e) => (e.currentTarget.style.borderColor = BORDER)}
    />
  );
}

function Textarea({
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
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
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${BORDER}`,
        borderRadius: 9,
        color: "#fff",
        fontSize: 13,
        outline: "none",
        boxSizing: "border-box",
        resize: "vertical",
        minHeight: 80,
        fontFamily: "inherit",
        transition: "border-color 120ms",
      }}
      onFocus={(e) => (e.currentTarget.style.borderColor = BRAND_ORANGE)}
      onBlur={(e) => (e.currentTarget.style.borderColor = BORDER)}
    />
  );
}

function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        padding: "11px 13px",
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${BORDER}`,
        borderRadius: 9,
        color: value ? "#fff" : TEXT_MUTED,
        fontSize: 13,
        outline: "none",
        boxSizing: "border-box",
        cursor: "pointer",
        appearance: "none",
        backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 12px center",
        paddingRight: 36,
      }}
    >
      <option value="" disabled style={{ background: CARD_BG }}>
        {placeholder || "Elegí una opción"}
      </option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} style={{ background: CARD_BG, color: "#fff" }}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
