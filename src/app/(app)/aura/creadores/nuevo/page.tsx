"use client";

// ══════════════════════════════════════════════════════════════
// Aura — Alta MANUAL de creador (Lote 2B · Pieza 3)
// ══════════════════════════════════════════════════════════════
// Form mínimo: nombre + email + % de comisión. Postea a /api/aura/creators,
// que crea creador + campaña Always-On + deal de comisión OBLIGATORIA, atómico.
// La comisión NO es opcional: un creador siempre nace con su comisión.
// ══════════════════════════════════════════════════════════════

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";

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
  const [commissionPercent, setCommissionPercent] = useState("10");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pct = parseFloat(commissionPercent);
  const canSubmit =
    name.trim().length > 0 && Number.isFinite(pct) && pct >= 0 && pct <= 100 && !saving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/aura/creators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || null,
          // Comisión obligatoria: deal base de tipo COMMISSION con el % ingresado.
          deal: { type: "COMMISSION", commissionPercent: pct },
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
            Se crea con su campaña base y su comisión. La comisión es obligatoria —
            un creador nunca queda sin ella.
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

          <Field label="Email (opcional)">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="sofia@email.com"
              className="w-full px-3 py-2.5 rounded-xl outline-none text-sm"
              style={{ background: THEME.bgSoft, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
            />
          </Field>

          <Field label="Comisión (%)" required hint="Porcentaje sobre las ventas atribuidas. 0 a 100.">
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={commissionPercent}
              onChange={(e) => setCommissionPercent(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl outline-none text-sm"
              style={{ background: THEME.bgSoft, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
            />
          </Field>

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
