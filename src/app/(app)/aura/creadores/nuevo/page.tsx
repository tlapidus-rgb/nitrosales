"use client";

// ══════════════════════════════════════════════════════════════
// Aura — Alta MANUAL de creador (Lote 2B · Pieza 3)
// ══════════════════════════════════════════════════════════════
// Form: nombre + email + teléfono (los 3 obligatorios; feedback 2026-07).
// Postea a /api/aura/creators. El creador nace SIN comisión: se asigna
// después por campaña ("Comenzar campaña").
// ══════════════════════════════════════════════════════════════

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { isValidCreatorPhone } from "@/lib/aura/validation";

const THEME = {
  bgPage: "#0a0a14",
  bgCard: "rgba(255, 255, 255, 0.03)",
  bgSoft: "rgba(255, 255, 255, 0.02)",
  border: "rgba(255, 255, 255, 0.06)",
  borderStrong: "rgba(255, 255, 255, 0.12)",
  textPrimary: "#f5f5f7",
  textSecondary: "rgba(245, 245, 247, 0.62)",
  textTertiary: "rgba(245, 245, 247, 0.42)",
  gradient: "linear-gradient(135deg, #ff0080 0%, #7928ca 50%, #00d4ff 100%)",
  gradientText: "linear-gradient(90deg, #ff0080, #00d4ff)",
};

export default function NuevoCreadorPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Email OBLIGATORIO: se le manda el acceso (link de set-password) por mail.
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  // Teléfono OBLIGATORIO (feedback 2026-07): regla única compartida con la API
  // (lib/aura/validation.ts) — así el form nunca habilita algo que la API rechaza.
  const phoneValid = isValidCreatorPhone(phone);
  const canSubmit = name.trim().length > 0 && emailValid && phoneValid && !saving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      // Item 9: el afiliado se crea SIN comisión. La comisión se asigna después
      // con "Comenzar campaña".
      const r = await fetch("/api/aura/creators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "No se pudo crear el creador");
      router.push(`/aura/creadores/${d.creator.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear el creador");
      setSaving(false);
    }
  };

  return (
    <div
      className="min-h-screen"
      style={{
        background: THEME.bgPage,
        color: THEME.textPrimary,
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Inter, sans-serif",
      }}
    >
      <div className="max-w-xl mx-auto px-6 py-10">
        <Link
          href="/aura/creadores"
          className="inline-flex items-center gap-1.5 text-[13px] mb-6 transition-opacity hover:opacity-80"
          style={{ color: THEME.textSecondary }}
        >
          <ArrowLeft size={15} strokeWidth={2.2} />
          Volver a Creadores
        </Link>

        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight mb-1">Nuevo creador</h1>
          <p className="text-[13px]" style={{ color: THEME.textSecondary }}>
            Se crea el afiliado y se le manda el acceso por mail. La comisión se
            asigna después, al comenzar una campaña.
          </p>
        </div>

        <div
          className="rounded-2xl p-6 flex flex-col gap-5"
          style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}` }}
        >
          <Field label="Nombre del creador" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Sofía Pérez"
              className="w-full px-3 py-2.5 rounded-xl outline-none text-sm"
              style={{ background: THEME.bgSoft, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
            />
          </Field>

          <Field label="Email" required hint="Se le manda su acceso al dashboard por mail.">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="sofia@email.com"
              className="w-full px-3 py-2.5 rounded-xl outline-none text-sm"
              style={{ background: THEME.bgSoft, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
            />
            {email.trim().length > 0 && !emailValid && (
              <span className="text-[11px]" style={{ color: "#ff6b9d" }}>
                Email inválido.
              </span>
            )}
          </Field>

          <Field label="Teléfono" required hint="Con código de país, ej: +54 9 11 1234 5678.">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+54 9 11 1234 5678"
              className="w-full px-3 py-2.5 rounded-xl outline-none text-sm"
              style={{ background: THEME.bgSoft, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
            />
            {phone.trim().length > 0 && !phoneValid && (
              <span className="text-[11px]" style={{ color: "#ff6b9d" }}>
                Teléfono inválido: mínimo 6 dígitos (se aceptan +, espacios, guiones y paréntesis).
              </span>
            )}
          </Field>

          {/* Comisión quitada del alta (item 9): se asigna por campaña. */}

          {error && (
            <p className="text-xs" style={{ color: "#f87171" }}>
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold tracking-tight text-white transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: THEME.gradient }}
          >
            <Plus size={15} strokeWidth={2.4} />
            {saving ? "Creando..." : "Crear creador"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium" style={{ color: THEME.textSecondary }}>
        {label}
        {required ? <span style={{ color: "#ff0080" }}> *</span> : null}
      </span>
      {children}
      {hint ? (
        <span className="text-[11px]" style={{ color: THEME.textTertiary }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}
