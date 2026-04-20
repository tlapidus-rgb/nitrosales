// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// /onboarding — Formulario público multi-step premium
// ══════════════════════════════════════════════════════════════
// 4 steps: Empresa · Contacto · Plataformas · Confirmar
// Dark theme, animaciones suaves, progreso visual, mobile responsive.
// ══════════════════════════════════════════════════════════════

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  User,
  Plug,
  Check,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  Clock,
  Sparkles,
  Info,
  HelpCircle,
  ChevronDown,
} from "lucide-react";

// ─── Brand & Theme ──────────────────────────────────────────
const BRAND_ORANGE = "#FF5E1A";
const BRAND_BG = "#0A0A0F";
const CARD_BG = "#141419";
const BORDER = "#1F1F2E";
const TEXT_PRIMARY = "#FFFFFF";
const TEXT_SECONDARY = "#9CA3AF";
const TEXT_MUTED = "#6B7280";
const ACCENT_GREEN = "#22C55E";
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

const INDUSTRIES = [
  "Juguetería",
  "Indumentaria",
  "Hogar y decoración",
  "Electrónica",
  "Belleza y cuidado personal",
  "Alimentos y bebidas",
  "Deportes",
  "Libros y papelería",
  "Salud",
  "Pet",
  "Otro",
];

const STEPS = [
  { id: 1, label: "Empresa", icon: Building2 },
  { id: 2, label: "Contacto", icon: User },
  { id: 3, label: "Plataformas", icon: Plug },
  { id: 4, label: "Confirmar", icon: Check },
] as const;

interface FormData {
  // Step 1
  companyName: string;
  proposedSlug: string;
  storeUrl: string;
  industry: string;
  cuit: string;
  timezone: string;
  currency: string;
  fiscalCondition: string;
  // Step 2
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactWhatsapp: string;
  // Step 3
  vtexAccountName: string;
  vtexAppKey: string;
  vtexAppToken: string;
  mlUsername: string;
  metaAdAccountId: string;
  metaAccessToken: string;
  metaPixelId: string;
  metaPixelToken: string;
  googleAdsCustomerId: string;
}

const initialData: FormData = {
  companyName: "",
  proposedSlug: "",
  storeUrl: "",
  industry: "",
  cuit: "",
  timezone: "America/Argentina/Buenos_Aires",
  currency: "ARS",
  fiscalCondition: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  contactWhatsapp: "",
  vtexAccountName: "",
  vtexAppKey: "",
  vtexAppToken: "",
  mlUsername: "",
  metaAdAccountId: "",
  metaAccessToken: "",
  metaPixelId: "",
  metaPixelToken: "",
  googleAdsCustomerId: "",
};

// Auto-slugify
function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<FormData>(initialData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);

  const update = (patch: Partial<FormData>) => {
    setData((d) => {
      const next = { ...d, ...patch };
      // Auto-slug si el user no lo tocó manualmente
      if (patch.companyName !== undefined && !slugTouched) {
        next.proposedSlug = slugify(patch.companyName);
      }
      return next;
    });
    // Clear error del campo tocado
    const key = Object.keys(patch)[0];
    if (errors[key]) {
      setErrors((e) => {
        const copy = { ...e };
        delete copy[key];
        return copy;
      });
    }
  };

  // ── Validaciones por step ──
  const validateStep = (s: number): Record<string, string> => {
    const e: Record<string, string> = {};
    if (s === 1) {
      if (!data.companyName.trim() || data.companyName.trim().length < 2)
        e.companyName = "Nombre requerido (mín 2 caracteres)";
      if (!data.proposedSlug.trim()) e.proposedSlug = "Slug requerido";
      else if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(data.proposedSlug))
        e.proposedSlug = "Solo letras minúsculas, números y guiones";
      if (!data.storeUrl.trim()) e.storeUrl = "URL de tu tienda requerida";
      else if (!/^https?:\/\/.+\..+/.test(data.storeUrl.trim()))
        e.storeUrl = "Debe empezar con https:// y ser una URL válida";
    }
    if (s === 2) {
      if (!data.contactName.trim() || data.contactName.trim().length < 2)
        e.contactName = "Nombre requerido";
      if (!data.contactEmail.trim()) e.contactEmail = "Email requerido";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contactEmail))
        e.contactEmail = "Email inválido";
    }
    if (s === 3) {
      // Al menos una plataforma debe estar (si no, la activación no tiene sentido)
      const hasVtex = data.vtexAccountName && data.vtexAppKey && data.vtexAppToken;
      const hasMl = !!data.mlUsername;
      const hasMeta = data.metaAdAccountId && data.metaAccessToken;
      const hasGoogle = !!data.googleAdsCustomerId;
      if (!hasVtex && !hasMl && !hasMeta && !hasGoogle) {
        e._global = "Conectá al menos una plataforma para poder activar tu cuenta";
      }
      // Si llenó parcial de VTEX, pedir completar
      if (
        (data.vtexAccountName || data.vtexAppKey || data.vtexAppToken) &&
        !(data.vtexAccountName && data.vtexAppKey && data.vtexAppToken)
      ) {
        e.vtexAccountName = "Completá los 3 campos de VTEX o dejalos vacíos";
      }
      if (
        (data.metaAdAccountId || data.metaAccessToken) &&
        !(data.metaAdAccountId && data.metaAccessToken)
      ) {
        e.metaAdAccountId = "Completá los 2 campos de Meta Ads o dejalos vacíos";
      }
    }
    return e;
  };

  const next = () => {
    const e = validateStep(step);
    setErrors(e);
    if (Object.keys(e).length === 0) {
      setStep((s) => Math.min(4, s + 1));
      setServerError(null);
    }
  };
  const back = () => {
    setStep((s) => Math.max(1, s - 1));
    setServerError(null);
  };

  const submit = async () => {
    // Validar steps 1 y 2 (por si saltaron)
    const e1 = validateStep(1);
    const e2 = validateStep(2);
    const e3 = validateStep(3);
    const allErrors = { ...e1, ...e2, ...e3 };
    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      // Volver al primer step con error
      if (Object.keys(e1).length > 0) setStep(1);
      else if (Object.keys(e2).length > 0) setStep(2);
      else if (Object.keys(e3).length > 0) setStep(3);
      return;
    }

    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch("/api/public/onboarding/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: data.companyName.trim(),
          proposedSlug: data.proposedSlug.trim().toLowerCase(),
          cuit: data.cuit.trim() || undefined,
          industry: data.industry || undefined,
          storeUrl: data.storeUrl.trim().replace(/\/+$/, ""),
          timezone: data.timezone,
          currency: data.currency,
          fiscalCondition: data.fiscalCondition || undefined,
          contactName: data.contactName.trim(),
          contactEmail: data.contactEmail.trim().toLowerCase(),
          contactPhone: data.contactPhone.trim() || undefined,
          contactWhatsapp: data.contactWhatsapp.trim() || undefined,
          vtexAccountName: data.vtexAccountName.trim() || undefined,
          vtexAppKey: data.vtexAppKey.trim() || undefined,
          vtexAppToken: data.vtexAppToken.trim() || undefined,
          mlUsername: data.mlUsername.trim() || undefined,
          metaAdAccountId: data.metaAdAccountId.trim() || undefined,
          metaAccessToken: data.metaAccessToken.trim() || undefined,
          metaPixelId: data.metaPixelId.trim() || undefined,
          metaPixelToken: data.metaPixelToken.trim() || undefined,
          googleAdsCustomerId: data.googleAdsCustomerId.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setServerError(json.error || `Error ${res.status}`);
        setSubmitting(false);
        return;
      }
      // Redirect a status page
      router.push(`/onboarding/status/${json.statusToken}`);
    } catch (err: any) {
      setServerError(err?.message || "Error de red");
      setSubmitting(false);
    }
  };

  const progress = useMemo(() => ((step - 1) / 3) * 100, [step]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", position: "relative", overflow: "hidden" }}>
      {/* Aura background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 20% 30%, rgba(255,94,26,0.08) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(168,85,247,0.06) 0%, transparent 50%)",
          pointerEvents: "none",
        }}
      />

      {/* Sidebar — desktop only */}
      <aside
        style={{
          width: 340,
          minHeight: "100vh",
          borderRight: `1px solid ${BORDER}`,
          padding: "40px 32px",
          display: "none",
          flexDirection: "column",
          position: "relative",
          zIndex: 1,
        }}
        className="sidebar-desktop"
      >
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px", marginBottom: 56 }}>
          NITRO<span style={{ color: BRAND_ORANGE }}>SALES</span>
        </div>

        <div style={{ fontSize: 12, fontWeight: 600, color: TEXT_SECONDARY, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 14 }}>
          Onboarding
        </div>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            lineHeight: 1.25,
            letterSpacing: "-0.02em",
            margin: "0 0 16px",
          }}
        >
          Activamos tu cuenta en 48-72 hs
        </h1>
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.6,
            color: TEXT_SECONDARY,
            margin: "0 0 40px",
          }}
        >
          Completá este formulario con los datos de tu empresa y las credenciales de tus plataformas. Nuestro equipo de implementación hace el resto.
        </p>

        {/* Steps progress */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {STEPS.map((s) => {
            const Icon = s.icon;
            const isActive = step === s.id;
            const isDone = step > s.id;
            return (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: isActive ? "rgba(255,94,26,0.08)" : "transparent",
                  border: isActive ? `1px solid rgba(255,94,26,0.3)` : "1px solid transparent",
                  transition: `all 200ms ${EASE}`,
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: isDone
                      ? ACCENT_GREEN
                      : isActive
                      ? BRAND_ORANGE
                      : "rgba(255,255,255,0.04)",
                    color: isDone || isActive ? "#fff" : TEXT_MUTED,
                    border: isDone || isActive ? "none" : `1px solid ${BORDER}`,
                    transition: `all 200ms ${EASE}`,
                    flexShrink: 0,
                  }}
                >
                  {isDone ? <Check size={16} /> : <Icon size={16} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>
                    Paso {s.id}
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: isActive ? 600 : 500,
                      color: isDone ? TEXT_SECONDARY : isActive ? TEXT_PRIMARY : TEXT_SECONDARY,
                    }}
                  >
                    {s.label}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Trust signals */}
        <div style={{ marginTop: "auto", paddingTop: 40 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, color: TEXT_SECONDARY, fontSize: 12 }}>
            <ShieldCheck size={14} color={ACCENT_GREEN} />
            <span>Credenciales encriptadas AES-256</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, color: TEXT_SECONDARY, fontSize: 12 }}>
            <Clock size={14} color={ACCENT_GREEN} />
            <span>Activación en 48-72 hs hábiles</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: TEXT_SECONDARY, fontSize: 12 }}>
            <Sparkles size={14} color={ACCENT_GREEN} />
            <span>Sin costo de implementación</span>
          </div>
        </div>
      </aside>

      {/* Main form */}
      <main
        style={{
          flex: 1,
          minHeight: "100vh",
          padding: "40px 32px",
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {/* Mobile branding */}
        <div
          className="mobile-branding"
          style={{
            width: "100%",
            maxWidth: 640,
            fontSize: 20,
            fontWeight: 800,
            letterSpacing: "-0.5px",
            marginBottom: 32,
            display: "none",
          }}
        >
          NITRO<span style={{ color: BRAND_ORANGE }}>SALES</span>
        </div>

        {/* Progress bar top */}
        <div style={{ width: "100%", maxWidth: 640, marginBottom: 40 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <div style={{ fontSize: 12, color: TEXT_SECONDARY, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Paso {step} de 4
            </div>
            <div style={{ fontSize: 12, color: TEXT_MUTED }}>{Math.round(progress)}%</div>
          </div>
          <div
            style={{
              height: 4,
              background: "rgba(255,255,255,0.06)",
              borderRadius: 99,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progress + 25}%`,
                background: `linear-gradient(90deg, ${BRAND_ORANGE}, #FF8C4A)`,
                borderRadius: 99,
                transition: `width 400ms ${EASE}`,
              }}
            />
          </div>
        </div>

        {/* Step content */}
        <div
          key={step}
          style={{
            width: "100%",
            maxWidth: 640,
            animation: `slideIn 400ms ${EASE}`,
          }}
        >
          {step === 1 && <Step1 data={data} update={update} errors={errors} setSlugTouched={setSlugTouched} />}
          {step === 2 && <Step2 data={data} update={update} errors={errors} />}
          {step === 3 && <Step3 data={data} update={update} errors={errors} />}
          {step === 4 && <Step4 data={data} />}

          {/* Global error */}
          {errors._global && (
            <div
              style={{
                marginTop: 20,
                padding: "14px 18px",
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: 10,
                color: "#FCA5A5",
                fontSize: 14,
              }}
            >
              {errors._global}
            </div>
          )}

          {/* Server error */}
          {serverError && (
            <div
              style={{
                marginTop: 20,
                padding: "14px 18px",
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: 10,
                color: "#FCA5A5",
                fontSize: 14,
              }}
            >
              {serverError}
            </div>
          )}

          {/* Navigation */}
          <div
            style={{
              marginTop: 40,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 16,
            }}
          >
            <button
              onClick={back}
              disabled={step === 1 || submitting}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "12px 20px",
                background: "transparent",
                border: `1px solid ${BORDER}`,
                borderRadius: 10,
                color: step === 1 ? TEXT_MUTED : TEXT_SECONDARY,
                fontSize: 14,
                fontWeight: 500,
                cursor: step === 1 ? "not-allowed" : "pointer",
                opacity: step === 1 ? 0.4 : 1,
                transition: `all 200ms ${EASE}`,
              }}
            >
              <ArrowLeft size={16} /> Atrás
            </button>

            {step < 4 ? (
              <button
                onClick={next}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "14px 26px",
                  background: BRAND_ORANGE,
                  border: "none",
                  borderRadius: 10,
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: `all 200ms ${EASE}`,
                  boxShadow: "0 4px 16px rgba(255,94,26,0.25)",
                }}
              >
                Continuar <ArrowRight size={16} />
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={submitting}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "14px 28px",
                  background: submitting ? "rgba(255,94,26,0.5)" : BRAND_ORANGE,
                  border: "none",
                  borderRadius: 10,
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: submitting ? "wait" : "pointer",
                  transition: `all 200ms ${EASE}`,
                  boxShadow: "0 4px 16px rgba(255,94,26,0.3)",
                }}
              >
                {submitting ? "Enviando..." : "Enviar solicitud"} <Check size={16} />
              </button>
            )}
          </div>
        </div>
      </main>

      <style jsx global>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (min-width: 900px) {
          .sidebar-desktop { display: flex !important; }
          .mobile-branding { display: none !important; }
        }
        @media (max-width: 899px) {
          .mobile-branding { display: block !important; }
        }
      `}</style>
    </div>
  );
}

// ─── Reusable form field ────────────────────────────────────
function Field({
  label,
  hint,
  required,
  error,
  tutorial,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  tutorial?: { title: string; steps: string[]; docUrl?: string };
  children: React.ReactNode;
}) {
  const [tutorialOpen, setTutorialOpen] = useState(false);
  return (
    <div style={{ marginBottom: 20 }}>
      <label
        style={{
          display: "block",
          fontSize: 13,
          fontWeight: 600,
          color: TEXT_PRIMARY,
          marginBottom: 6,
        }}
      >
        {label}
        {required && <span style={{ color: BRAND_ORANGE, marginLeft: 4 }}>*</span>}
      </label>
      {hint && (
        <p style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 0, marginBottom: 10, lineHeight: 1.5 }}>{hint}</p>
      )}
      {children}
      {error && (
        <div style={{ marginTop: 6, fontSize: 12, color: "#FCA5A5" }}>{error}</div>
      )}
      {tutorial && (
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            onClick={() => setTutorialOpen((o) => !o)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
              background: tutorialOpen ? "rgba(255,94,26,0.08)" : "transparent",
              border: `1px solid ${tutorialOpen ? "rgba(255,94,26,0.3)" : BORDER}`,
              borderRadius: 8,
              color: tutorialOpen ? BRAND_ORANGE : TEXT_SECONDARY,
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              transition: `all 160ms ${EASE}`,
            }}
          >
            <HelpCircle size={12} />
            {tutorial.title}
            <ChevronDown
              size={12}
              style={{
                transform: tutorialOpen ? "rotate(180deg)" : "rotate(0)",
                transition: `transform 200ms ${EASE}`,
              }}
            />
          </button>
          {tutorialOpen && (
            <div
              style={{
                marginTop: 10,
                padding: 16,
                background: CARD_BG,
                border: `1px solid ${BORDER}`,
                borderLeft: `3px solid ${BRAND_ORANGE}`,
                borderRadius: 8,
                animation: `slideIn 200ms ${EASE}`,
              }}
            >
              <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: TEXT_SECONDARY, lineHeight: 1.7 }}>
                {tutorial.steps.map((s, i) => (
                  <li key={i} style={{ marginBottom: 6 }}>{s}</li>
                ))}
              </ol>
              {tutorial.docUrl && (
                <a
                  href={tutorial.docUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-block",
                    marginTop: 10,
                    fontSize: 12,
                    color: BRAND_ORANGE,
                    textDecoration: "none",
                    fontWeight: 500,
                  }}
                >
                  📄 Ver documentación oficial →
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  background: CARD_BG,
  border: `1px solid ${BORDER}`,
  borderRadius: 10,
  color: TEXT_PRIMARY,
  fontSize: 14,
  fontFamily: "inherit",
  outline: "none",
  transition: `border-color 160ms ${EASE}, box-shadow 160ms ${EASE}`,
  boxSizing: "border-box",
};

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  maxLength,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  maxLength?: number;
  mono?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        ...inputStyle,
        borderColor: focused ? BRAND_ORANGE : BORDER,
        boxShadow: focused ? "0 0 0 3px rgba(255,94,26,0.15)" : "none",
        fontFamily: mono ? "'SF Mono', Menlo, Consolas, monospace" : "inherit",
      }}
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
  options: string[];
  placeholder: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        ...inputStyle,
        borderColor: focused ? BRAND_ORANGE : BORDER,
        boxShadow: focused ? "0 0 0 3px rgba(255,94,26,0.15)" : "none",
        cursor: "pointer",
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

// ─── Step 1 — Empresa ───────────────────────────────────────
const TIMEZONES = [
  { value: "America/Argentina/Buenos_Aires", label: "Argentina (Buenos Aires)" },
  { value: "America/Argentina/Cordoba", label: "Argentina (Córdoba)" },
  { value: "America/Santiago", label: "Chile (Santiago)" },
  { value: "America/Montevideo", label: "Uruguay (Montevideo)" },
  { value: "America/Sao_Paulo", label: "Brasil (São Paulo)" },
  { value: "America/Mexico_City", label: "México (CDMX)" },
  { value: "America/Lima", label: "Perú (Lima)" },
  { value: "America/Bogota", label: "Colombia (Bogotá)" },
];

const FISCAL_OPTIONS = [
  { value: "MONOTRIBUTO", label: "Monotributista" },
  { value: "RESPONSABLE_INSCRIPTO", label: "Responsable Inscripto" },
  { value: "EXENTO", label: "Exento" },
  { value: "OTRO", label: "Otro / No sé" },
];

function Step1({ data, update, errors, setSlugTouched }: any) {
  return (
    <div>
      <h2 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 8 }}>Tu empresa</h2>
      <p style={{ color: TEXT_SECONDARY, fontSize: 14, marginBottom: 32, lineHeight: 1.6 }}>
        Contanos los datos básicos. Son públicos y se muestran en tu panel.
      </p>

      <Field label="Nombre de la empresa" required error={errors.companyName}>
        <TextInput
          value={data.companyName}
          onChange={(v) => update({ companyName: v })}
          placeholder="Ej: Arredo"
          maxLength={120}
        />
      </Field>

      <Field
        label="Slug (URL interna)"
        hint="Se usa en tus URLs. Solo minúsculas, números y guiones."
        required
        error={errors.proposedSlug}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: TEXT_MUTED, whiteSpace: "nowrap" }}>nitrosales.app/</span>
          <TextInput
            value={data.proposedSlug}
            onChange={(v) => {
              setSlugTouched(true);
              update({ proposedSlug: v.toLowerCase().replace(/[^a-z0-9-]/g, "") });
            }}
            placeholder="arredo"
            maxLength={50}
          />
        </div>
      </Field>

      <Field
        label="URL de tu tienda"
        hint="Dominio público donde compran tus clientes. Usamos esto para tracking y links."
        required
        error={errors.storeUrl}
      >
        <TextInput
          value={data.storeUrl}
          onChange={(v) => update({ storeUrl: v })}
          placeholder="https://mitienda.com"
          type="url"
          maxLength={200}
        />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="Industria" hint="Para recomendaciones específicas.">
          <Select
            value={data.industry}
            onChange={(v) => update({ industry: v })}
            options={INDUSTRIES}
            placeholder="Seleccionar…"
          />
        </Field>

        <Field
          label="CUIT"
          hint="Opcional. Para facturación."
          tutorial={{
            title: "¿Cómo encuentro mi CUIT?",
            steps: [
              "Es el número de identificación tributaria de tu empresa.",
              "11 dígitos, sin guiones ni espacios.",
              "Si no lo tenés a mano, lo podés consultar en AFIP con tu clave fiscal.",
            ],
          }}
        >
          <TextInput
            value={data.cuit}
            onChange={(v) => update({ cuit: v.replace(/[^0-9]/g, "") })}
            placeholder="30712345678"
            maxLength={11}
          />
        </Field>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field
          label="Zona horaria"
          hint="Usamos esto para reportes, alertas y crones."
        >
          <select
            value={data.timezone}
            onChange={(e) => update({ timezone: e.target.value })}
            style={{
              width: "100%",
              padding: "12px 14px",
              background: CARD_BG,
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              color: TEXT_PRIMARY,
              fontSize: 14,
              fontFamily: "inherit",
              outline: "none",
              cursor: "pointer",
              boxSizing: "border-box",
            }}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Moneda principal"
          hint="En qué moneda operás tu negocio."
        >
          <select
            value={data.currency}
            onChange={(e) => update({ currency: e.target.value })}
            style={{
              width: "100%",
              padding: "12px 14px",
              background: CARD_BG,
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              color: TEXT_PRIMARY,
              fontSize: 14,
              fontFamily: "inherit",
              outline: "none",
              cursor: "pointer",
              boxSizing: "border-box",
            }}
          >
            <option value="ARS">ARS (Peso Argentino)</option>
            <option value="USD">USD (Dólar)</option>
          </select>
        </Field>
      </div>

      <Field
        label="Condición fiscal"
        hint="Opcional. Lo usamos en el módulo de Finanzas para calcular IVA correctamente."
        tutorial={{
          title: "¿Qué pongo si no sé?",
          steps: [
            "Monotributista: si facturás como monotributo.",
            "Responsable Inscripto: si facturás IVA 21%.",
            "Exento: si tu actividad está exenta de IVA.",
            'Si no estás seguro, elegí "Otro / No sé" y lo configuramos después.',
          ],
        }}
      >
        <select
          value={data.fiscalCondition}
          onChange={(e) => update({ fiscalCondition: e.target.value })}
          style={{
            width: "100%",
            maxWidth: 400,
            padding: "12px 14px",
            background: CARD_BG,
            border: `1px solid ${BORDER}`,
            borderRadius: 10,
            color: TEXT_PRIMARY,
            fontSize: 14,
            fontFamily: "inherit",
            outline: "none",
            cursor: "pointer",
            boxSizing: "border-box",
          }}
        >
          <option value="">Seleccionar…</option>
          {FISCAL_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

// ─── Step 2 — Contacto ──────────────────────────────────────
function Step2({ data, update, errors }: any) {
  return (
    <div>
      <h2 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 8 }}>Tus datos de contacto</h2>
      <p style={{ color: TEXT_SECONDARY, fontSize: 14, marginBottom: 32, lineHeight: 1.6 }}>
        Te vamos a mandar las credenciales de acceso al email que completes. El teléfono es opcional.
      </p>

      <Field label="Nombre completo" required error={errors.contactName}>
        <TextInput
          value={data.contactName}
          onChange={(v) => update({ contactName: v })}
          placeholder="Ej: Ana Pérez"
          maxLength={120}
        />
      </Field>

      <Field
        label="Email"
        hint="Tus credenciales de acceso se enviarán a este email. Va a ser tu email de login."
        required
        error={errors.contactEmail}
      >
        <TextInput
          value={data.contactEmail}
          onChange={(v) => update({ contactEmail: v.toLowerCase() })}
          placeholder="ana@arredo.com"
          type="email"
          maxLength={120}
        />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="Teléfono" hint="Opcional">
          <TextInput
            value={data.contactPhone}
            onChange={(v) => update({ contactPhone: v })}
            placeholder="+54 11 5555-5555"
            maxLength={40}
          />
        </Field>

        <Field label="WhatsApp" hint="Opcional">
          <TextInput
            value={data.contactWhatsapp}
            onChange={(v) => update({ contactWhatsapp: v })}
            placeholder="+54 9 11 5555-5555"
            maxLength={40}
          />
        </Field>
      </div>
    </div>
  );
}

// ─── Step 3 — Plataformas ───────────────────────────────────
function Step3({ data, update, errors }: any) {
  return (
    <div>
      <h2 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 8 }}>Tus plataformas</h2>
      <p style={{ color: TEXT_SECONDARY, fontSize: 14, marginBottom: 12, lineHeight: 1.6 }}>
        Conectá las plataformas que usa tu negocio. Podés agregar más después desde el panel.
      </p>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 14px",
          background: "rgba(34,197,94,0.06)",
          border: "1px solid rgba(34,197,94,0.2)",
          borderRadius: 10,
          marginBottom: 28,
        }}
      >
        <ShieldCheck size={14} color={ACCENT_GREEN} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: TEXT_SECONDARY, lineHeight: 1.5 }}>
          Todas tus credenciales se encriptan con AES-256 antes de guardarse. Nadie las puede ver sin la clave.
        </span>
      </div>

      {/* VTEX */}
      <PlatformCard
        name="VTEX"
        color="#FF0080"
        description="Sincroniza pedidos, productos y stock en tiempo real via webhooks."
      >
        <Field
          label="VTEX Account Name"
          error={errors.vtexAccountName}
          tutorial={{
            title: "¿Cuál es mi Account Name?",
            steps: [
              "Es el subdomain de tu admin VTEX.",
              'Ejemplo: si tu admin es "arredo.myvtex.com", tu account name es "arredo".',
              'Si es "miempresa.vtexcommercestable.com.br", es "miempresa".',
            ],
          }}
        >
          <TextInput
            value={data.vtexAccountName}
            onChange={(v) => update({ vtexAccountName: v })}
            placeholder="arredo (el subdomain de tu tienda)"
            maxLength={60}
          />
        </Field>
        <Field
          label="App Key"
          tutorial={{
            title: "¿Cómo genero App Key + Token?",
            steps: [
              "Ingresá a tu VTEX Admin.",
              "Ir a: Cuenta → Gestión de usuarios → App Keys.",
              'Click en "Crear key" (nombre sugerido: "NitroSales").',
              "Asignar estos roles mínimos: Order Viewer, Catalog Read, Product Viewer.",
              "Copiar el App Key y el App Token que se generan.",
              "Pegarlos en los campos de abajo.",
            ],
            docUrl: "https://developers.vtex.com/docs/guides/api-authentication-using-application-keys",
          }}
        >
          <TextInput
            value={data.vtexAppKey}
            onChange={(v) => update({ vtexAppKey: v })}
            placeholder="vtexappkey-..."
            mono
          />
        </Field>
        <Field label="App Token">
          <TextInput
            value={data.vtexAppToken}
            onChange={(v) => update({ vtexAppToken: v })}
            placeholder="Token largo alfanumérico"
            mono
          />
        </Field>
      </PlatformCard>

      {/* MercadoLibre */}
      <PlatformCard
        name="MercadoLibre"
        color="#FFE600"
        description="Conectamos tu cuenta de vendedor MELI via OAuth seguro al activar."
      >
        <Field
          label="Nombre de usuario ML"
          hint="Te contactaremos para que autorices el OAuth (login de MELI)."
          tutorial={{
            title: "¿Dónde veo mi usuario ML?",
            steps: [
              "Entrá a mercadolibre.com.ar logueado con tu cuenta vendedor.",
              "Arriba a la derecha, hacé click en tu nombre.",
              'Tu usuario aparece en el menú (empieza con una "@" o es alfanumérico).',
              "Pegalo acá sin la @.",
            ],
          }}
        >
          <TextInput
            value={data.mlUsername}
            onChange={(v) => update({ mlUsername: v })}
            placeholder="tuusuario"
            maxLength={60}
          />
        </Field>
      </PlatformCard>

      {/* Meta Ads */}
      <PlatformCard
        name="Meta Ads (Facebook e Instagram)"
        color="#1877F2"
        description="Opcional. Sincroniza campañas y métricas de Facebook e Instagram Ads."
      >
        <Field
          label="Ad Account ID"
          error={errors.metaAdAccountId}
          tutorial={{
            title: "¿Cómo encuentro mi Ad Account ID?",
            steps: [
              "Entrá a business.facebook.com logueado.",
              "Arriba a la izquierda: Configuración del negocio.",
              "Cuentas → Cuentas publicitarias.",
              'Copiá el ID de la cuenta que querés conectar (empieza con "act_").',
            ],
            docUrl: "https://www.facebook.com/business/help/1492627900875762",
          }}
        >
          <TextInput
            value={data.metaAdAccountId}
            onChange={(v) => update({ metaAdAccountId: v })}
            placeholder="act_123456789"
            mono
          />
        </Field>
        <Field
          label="Access Token (System User)"
          tutorial={{
            title: "¿Cómo genero el Access Token?",
            steps: [
              "En Business Manager: Configuración del negocio → Usuarios del sistema.",
              'Click en "Agregar" → crear usuario con rol "Admin".',
              "Asignar tu Ad Account al nuevo usuario.",
              'Click en "Generar token" → seleccionar permisos: ads_management, ads_read, business_management.',
              "Copiar el token (solo se muestra una vez).",
              "Importante: usar System User, NO un token personal (los personales expiran).",
            ],
            docUrl: "https://developers.facebook.com/docs/marketing-api/system-users",
          }}
        >
          <TextInput
            value={data.metaAccessToken}
            onChange={(v) => update({ metaAccessToken: v })}
            placeholder="Token de System User"
            mono
          />
        </Field>
      </PlatformCard>

      {/* Meta Pixel — separado de Meta Ads, para CAPI */}
      <PlatformCard
        name="Meta Pixel (Conversiones API)"
        color="#1877F2"
        description="Opcional. Enviamos eventos de compra server-side a Meta para mejor match quality. Separado de Meta Ads Business."
      >
        <Field
          label="Pixel ID"
          tutorial={{
            title: "¿Qué es el Pixel ID y cómo lo encuentro?",
            steps: [
              "Es distinto del Ad Account ID — es un identificador del pixel de conversiones.",
              "Entrá a Events Manager: business.facebook.com/events_manager.",
              'Seleccioná tu pixel en la lista (o creá uno nuevo con "+ Conectar fuente de datos").',
              'En "Configuración", copiá el "ID del pixel" (15-16 dígitos).',
            ],
            docUrl: "https://www.facebook.com/business/help/952192354843755",
          }}
        >
          <TextInput
            value={data.metaPixelId}
            onChange={(v) => update({ metaPixelId: v.replace(/[^0-9]/g, "") })}
            placeholder="1234567890123456"
            mono
            maxLength={20}
          />
        </Field>
        <Field
          label="Access Token para CAPI"
          hint="Puede ser el mismo del System User de arriba, o uno específico con permiso ads_management."
          tutorial={{
            title: "¿Puedo usar el mismo token que Meta Ads?",
            steps: [
              "Sí. Si el System User tiene permiso ads_management, sirve para ambos.",
              'Si no, generá uno nuevo en Events Manager → tu pixel → Configuración → "Configurar" CAPI → Generar token.',
              "Pegá el token que obtengas en este campo.",
            ],
          }}
        >
          <TextInput
            value={data.metaPixelToken}
            onChange={(v) => update({ metaPixelToken: v })}
            placeholder="Token de acceso"
            mono
          />
        </Field>
      </PlatformCard>

      {/* Google Ads */}
      <PlatformCard
        name="Google Ads"
        color="#4285F4"
        description="Opcional. Conectamos via OAuth al activar la cuenta."
      >
        <Field
          label="Customer ID"
          tutorial={{
            title: "¿Cómo encuentro mi Customer ID?",
            steps: [
              "Entrá a ads.google.com logueado con tu cuenta.",
              "Arriba a la derecha, al costado del menú de cuentas, ves un número con formato 123-456-7890.",
              "Ese es tu Customer ID.",
              "Pegalo acá SIN los guiones (solo los 10 dígitos).",
            ],
            docUrl: "https://support.google.com/google-ads/answer/1704344",
          }}
        >
          <TextInput
            value={data.googleAdsCustomerId}
            onChange={(v) => update({ googleAdsCustomerId: v.replace(/[^0-9]/g, "") })}
            placeholder="1234567890"
            mono
            maxLength={10}
          />
        </Field>
      </PlatformCard>
    </div>
  );
}

function PlatformCard({
  name,
  color,
  description,
  children,
}: {
  name: string;
  color: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: 22,
        background: CARD_BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 14,
        marginBottom: 20,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: color,
            boxShadow: `0 0 8px ${color}`,
          }}
        />
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" }}>{name}</h3>
      </div>
      <p style={{ color: TEXT_SECONDARY, fontSize: 13, margin: "0 0 18px", lineHeight: 1.5 }}>{description}</p>
      {children}
    </div>
  );
}

// ─── Step 4 — Confirmar ─────────────────────────────────────
function Step4({ data }: { data: FormData }) {
  const platforms: string[] = [];
  if (data.vtexAccountName && data.vtexAppKey && data.vtexAppToken) platforms.push("VTEX");
  if (data.mlUsername) platforms.push("MercadoLibre");
  if (data.metaAdAccountId && data.metaAccessToken) platforms.push("Meta Ads");
  if (data.metaPixelId && data.metaPixelToken) platforms.push("Meta Pixel (CAPI)");
  if (data.googleAdsCustomerId) platforms.push("Google Ads");

  return (
    <div>
      <h2 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 8 }}>Confirmá tus datos</h2>
      <p style={{ color: TEXT_SECONDARY, fontSize: 14, marginBottom: 32, lineHeight: 1.6 }}>
        Al enviar, nuestro equipo recibe tu solicitud y empieza a configurar tu cuenta. Recibís un email de confirmación en el momento.
      </p>

      <SummarySection title="Empresa">
        <SummaryRow label="Nombre" value={data.companyName} />
        <SummaryRow label="Slug" value={`nitrosales.app/${data.proposedSlug}`} />
        <SummaryRow label="Tienda" value={data.storeUrl} />
        {data.industry && <SummaryRow label="Industria" value={data.industry} />}
        {data.cuit && <SummaryRow label="CUIT" value={data.cuit} />}
        <SummaryRow
          label="Zona horaria"
          value={TIMEZONES.find((tz) => tz.value === data.timezone)?.label || data.timezone}
        />
        <SummaryRow label="Moneda" value={data.currency} />
        {data.fiscalCondition && (
          <SummaryRow
            label="Condición fiscal"
            value={FISCAL_OPTIONS.find((f) => f.value === data.fiscalCondition)?.label || data.fiscalCondition}
          />
        )}
      </SummarySection>

      <SummarySection title="Contacto">
        <SummaryRow label="Nombre" value={data.contactName} />
        <SummaryRow label="Email" value={data.contactEmail} />
        {data.contactPhone && <SummaryRow label="Teléfono" value={data.contactPhone} />}
        {data.contactWhatsapp && <SummaryRow label="WhatsApp" value={data.contactWhatsapp} />}
      </SummarySection>

      <SummarySection title="Plataformas a activar">
        {platforms.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {platforms.map((p) => (
              <span
                key={p}
                style={{
                  padding: "6px 12px",
                  background: "rgba(34,197,94,0.1)",
                  border: "1px solid rgba(34,197,94,0.3)",
                  borderRadius: 99,
                  fontSize: 12,
                  fontWeight: 600,
                  color: ACCENT_GREEN,
                }}
              >
                ✓ {p}
              </span>
            ))}
          </div>
        ) : (
          <div style={{ color: "#FCA5A5", fontSize: 13 }}>
            No configuraste ninguna plataforma. Volvé al paso 3.
          </div>
        )}
      </SummarySection>

      <div
        style={{
          marginTop: 28,
          padding: "16px 18px",
          background: "rgba(255,94,26,0.05)",
          border: "1px solid rgba(255,94,26,0.2)",
          borderRadius: 12,
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <Info size={16} color={BRAND_ORANGE} style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY, marginBottom: 4 }}>
            Qué pasa después del envío
          </div>
          <div style={{ fontSize: 12, color: TEXT_SECONDARY, lineHeight: 1.6 }}>
            Recibís un email de confirmación. Nuestro equipo valida los datos y activa tu cuenta en{" "}
            <strong style={{ color: TEXT_PRIMARY }}>48 a 72 hs hábiles</strong>. Te enviamos las credenciales de login apenas esté lista.
          </div>
        </div>
      </div>
    </div>
  );
}

function SummarySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 20,
        background: CARD_BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 14,
        marginBottom: 14,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: TEXT_SECONDARY,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom: 14,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px 0",
        borderBottom: `1px solid ${BORDER}`,
      }}
    >
      <div style={{ fontSize: 13, color: TEXT_SECONDARY }}>{label}</div>
      <div
        style={{
          fontSize: 13,
          color: TEXT_PRIMARY,
          fontWeight: 500,
          textAlign: "right",
          maxWidth: "60%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}
