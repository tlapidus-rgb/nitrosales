"use client";

// ═══════════════════════════════════════════════════════════════
// Aura — Nueva campaña
// ───────────────────────────────────────────────────────────────
// Formulario para crear una InfluencerCampaign.
// Campos: nombre, creador (dropdown), descripción (opcional),
// fecha inicio, fecha fin (opcional), bonus target (opcional),
// bonus amount (opcional).
//
// Theme: Dark · Creator Gradient
// ═══════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Target,
  Gift,
  Users,
  Check,
  Rocket,
  AlertCircle,
  Search,
} from "lucide-react";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";

const THEME = {
  bgPage: "#0a0a14",
  bgCard: "rgba(255, 255, 255, 0.03)",
  bgSoft: "rgba(255, 255, 255, 0.02)",
  border: "rgba(255, 255, 255, 0.06)",
  borderStrong: "rgba(255, 255, 255, 0.12)",
  textPrimary: "#f5f5f7",
  textSecondary: "rgba(245, 245, 247, 0.62)",
  textTertiary: "rgba(245, 245, 247, 0.42)",
  textMuted: "rgba(245, 245, 247, 0.32)",
  gold: "#ff0080",
  goldSoft: "rgba(255, 0, 128, 0.10)",
  goldBorder: "rgba(255, 0, 128, 0.28)",
  rose: "#ff6b8a",
  roseSoft: "rgba(255, 107, 138, 0.10)",
  roseBorder: "rgba(255, 107, 138, 0.28)",
  gradient: "linear-gradient(135deg, #ff0080 0%, #7928ca 50%, #00d4ff 100%)",
  gradientText: "linear-gradient(90deg, #ff0080 0%, #a855f7 50%, #00d4ff 100%)",
};

type Creator = {
  id: string;
  name: string;
  code: string;
  avatarUrl: string | null;
  status: string;
  commissionPercent: number;
};

function Avatar({
  name,
  url,
  size = 28,
}: {
  name: string;
  url: string | null;
  size?: number;
}) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .filter(Boolean)
    .join("")
    .toUpperCase();
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center font-semibold flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: THEME.goldSoft,
        color: THEME.gold,
        fontSize: size * 0.38,
        border: `1px solid ${THEME.goldBorder}`,
      }}
    >
      {initials}
    </div>
  );
}

function Field({
  label,
  children,
  hint,
  required,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label
        className="block text-[12px] tracking-tight font-medium mb-1.5"
        style={{ color: THEME.textSecondary }}
      >
        {label}
        {required ? (
          <span style={{ color: THEME.gold }}> *</span>
        ) : null}
      </label>
      {children}
      {hint ? (
        <div
          className="text-[11px] tracking-tight mt-1"
          style={{ color: THEME.textTertiary }}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}

const INPUT_STYLE = {
  background: THEME.bgCard,
  border: `1px solid ${THEME.border}`,
  color: THEME.textPrimary,
};

export default function NuevaCampanaPage() {
  const router = useRouter();

  const [creators, setCreators] = useState<Creator[]>([]);
  const [loadingCreators, setLoadingCreators] = useState(true);
  const [creatorQ, setCreatorQ] = useState("");
  const [selectedCreator, setSelectedCreator] = useState<Creator | null>(null);
  const [showCreatorList, setShowCreatorList] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [endDate, setEndDate] = useState("");
  const [bonusTarget, setBonusTarget] = useState("");
  const [bonusAmount, setBonusAmount] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/aura/creators/simple", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("No se pudieron cargar los creadores");
        const data = await res.json();
        setCreators(data.rows || []);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoadingCreators(false);
      }
    }
    load();
  }, []);

  const filteredCreators = useMemo(() => {
    const q = creatorQ.trim().toLowerCase();
    if (!q) return creators;
    return creators.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q),
    );
  }, [creators, creatorQ]);

  const canSubmit =
    name.trim().length > 0 &&
    !!selectedCreator &&
    !!startDate &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !selectedCreator) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/aura/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          influencerId: selectedCreator.id,
          startDate,
          endDate: endDate || null,
          bonusTarget: bonusTarget || null,
          bonusAmount: bonusAmount || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "No se pudo crear la campaña");
      }
      router.push(`/aura/campanas/${data.campaign.id}`);
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: THEME.bgPage }}>
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        input[type="date"]::-webkit-calendar-picker-indicator {
          filter: invert(0.6);
          cursor: pointer;
        }
      `}</style>

      <div className="max-w-[780px] mx-auto px-6 md:px-10 py-8 md:py-10">
        <Link
          href="/aura/campanas"
          className="inline-flex items-center gap-1.5 text-[12.5px] tracking-tight mb-5"
          style={{ color: THEME.textSecondary }}
        >
          <ArrowLeft size={14} strokeWidth={2.2} />
          Campañas
        </Link>

        <header className="mb-8">
          <div
            className="text-[11px] tracking-[0.18em] uppercase font-medium mb-2"
            style={{ color: THEME.textMuted }}
          >
            Aura · Nueva campaña
          </div>
          <h1
            className="text-[30px] font-semibold tracking-tight leading-none"
            style={{
              background: THEME.gradientText,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            Armá una campaña
          </h1>
          <p
            className="mt-2 text-[14px] tracking-tight"
            style={{ color: THEME.textSecondary }}
          >
            Asignale a un creador un objetivo, un período y un bono para desbloquear.
          </p>
        </header>

        {error ? (
          <div
            className="p-3 rounded-xl text-[12.5px] mb-5 flex items-start gap-2"
            style={{
              background: THEME.roseSoft,
              border: `1px solid ${THEME.roseBorder}`,
              color: THEME.rose,
            }}
          >
            <AlertCircle size={14} strokeWidth={2.2} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl p-6 space-y-5"
          style={{
            background: THEME.bgCard,
            border: `1px solid ${THEME.border}`,
            animation: `fadeIn 420ms ${ES}`,
          }}
        >
          {/* Nombre */}
          <Field
            label="Nombre de la campaña"
            required
            hint="Ej: Día del Niño · Sofía M. · Lanzamiento colección verano"
          >
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Día del Niño · Agosto 2026"
              className="w-full px-3 py-2.5 rounded-lg outline-none text-[13.5px] tracking-tight"
              style={INPUT_STYLE}
              maxLength={120}
            />
          </Field>

          {/* Creador selector */}
          <Field label="Creador" required>
            {selectedCreator ? (
              <div
                className="flex items-center gap-3 p-2.5 rounded-lg"
                style={{
                  background: THEME.goldSoft,
                  border: `1px solid ${THEME.goldBorder}`,
                }}
              >
                <Avatar
                  name={selectedCreator.name}
                  url={selectedCreator.avatarUrl}
                  size={32}
                />
                <div className="flex-1 min-w-0">
                  <div
                    className="text-[13.5px] font-semibold truncate"
                    style={{ color: THEME.textPrimary }}
                  >
                    {selectedCreator.name}
                  </div>
                  <div
                    className="text-[11px] tracking-tight font-mono"
                    style={{ color: THEME.textSecondary }}
                  >
                    {selectedCreator.code} · {selectedCreator.commissionPercent}% comisión
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCreator(null);
                    setShowCreatorList(true);
                  }}
                  className="text-[11.5px] tracking-tight px-2.5 py-1 rounded-md"
                  style={{
                    color: THEME.gold,
                    background: "rgba(255, 0, 128, 0.12)",
                  }}
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <>
                <div
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg mb-2"
                  style={INPUT_STYLE}
                >
                  <Search size={14} strokeWidth={2.2} color={THEME.textTertiary} />
                  <input
                    type="text"
                    value={creatorQ}
                    onChange={(e) => {
                      setCreatorQ(e.target.value);
                      setShowCreatorList(true);
                    }}
                    onFocus={() => setShowCreatorList(true)}
                    placeholder={
                      loadingCreators
                        ? "Cargando creadores..."
                        : "Buscar creador por nombre o código..."
                    }
                    className="flex-1 bg-transparent outline-none text-[13px] tracking-tight"
                    style={{ color: THEME.textPrimary }}
                    disabled={loadingCreators}
                  />
                </div>
                {showCreatorList && !loadingCreators ? (
                  <div
                    className="rounded-lg max-h-[280px] overflow-y-auto"
                    style={{
                      background: THEME.bgSoft,
                      border: `1px solid ${THEME.border}`,
                    }}
                  >
                    {filteredCreators.length === 0 ? (
                      <div
                        className="p-4 text-center text-[12.5px]"
                        style={{ color: THEME.textTertiary }}
                      >
                        No hay creadores que coincidan
                      </div>
                    ) : (
                      filteredCreators.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setSelectedCreator(c);
                            setShowCreatorList(false);
                            setCreatorQ("");
                          }}
                          className="w-full flex items-center gap-3 p-2.5 transition-colors text-left hover:bg-white/5"
                          style={{
                            borderBottom: `1px solid ${THEME.border}`,
                          }}
                        >
                          <Avatar name={c.name} url={c.avatarUrl} size={28} />
                          <div className="flex-1 min-w-0">
                            <div
                              className="text-[13px] font-medium truncate"
                              style={{ color: THEME.textPrimary }}
                            >
                              {c.name}
                            </div>
                            <div
                              className="text-[10.5px] tracking-tight font-mono"
                              style={{ color: THEME.textTertiary }}
                            >
                              {c.code} · {c.commissionPercent}%
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </>
            )}
          </Field>

          {/* Descripción */}
          <Field
            label="Descripción"
            hint="Objetivo de la campaña, producto destacado, restricciones, etc."
          >
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Ej: Promocionar la nueva línea de juguetes didácticos para el Día del Niño con foco en kids 4-8 años."
              className="w-full px-3 py-2.5 rounded-lg outline-none text-[13px] tracking-tight resize-none"
              style={INPUT_STYLE}
            />
          </Field>

          {/* Fechas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Fecha de inicio" required>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg outline-none text-[13px]"
                style={INPUT_STYLE}
              />
            </Field>
            <Field label="Fecha de fin" hint="Vacío = campaña abierta">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                className="w-full px-3 py-2.5 rounded-lg outline-none text-[13px]"
                style={INPUT_STYLE}
              />
            </Field>
          </div>

          {/* Bono */}
          <div
            className="rounded-xl p-4"
            style={{
              background: THEME.bgSoft,
              border: `1px dashed ${THEME.border}`,
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Gift size={14} color={THEME.gold} strokeWidth={2.2} />
              <span
                className="text-[12px] font-semibold tracking-tight"
                style={{ color: THEME.textPrimary }}
              >
                Bono por objetivo (opcional)
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field
                label="Target de revenue"
                hint="Revenue que debe alcanzar para desbloquear el bono"
              >
                <div className="relative">
                  <span
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] pointer-events-none"
                    style={{ color: THEME.textTertiary }}
                  >
                    $
                  </span>
                  <input
                    type="number"
                    value={bonusTarget}
                    onChange={(e) => setBonusTarget(e.target.value)}
                    placeholder="500000"
                    min="0"
                    step="1000"
                    className="w-full pl-7 pr-3 py-2.5 rounded-lg outline-none text-[13px] tabular-nums"
                    style={INPUT_STYLE}
                  />
                </div>
              </Field>
              <Field
                label="Monto del bono"
                hint="Se paga al alcanzar el target"
              >
                <div className="relative">
                  <span
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] pointer-events-none"
                    style={{ color: THEME.textTertiary }}
                  >
                    $
                  </span>
                  <input
                    type="number"
                    value={bonusAmount}
                    onChange={(e) => setBonusAmount(e.target.value)}
                    placeholder="50000"
                    min="0"
                    step="1000"
                    className="w-full pl-7 pr-3 py-2.5 rounded-lg outline-none text-[13px] tabular-nums"
                    style={INPUT_STYLE}
                  />
                </div>
              </Field>
            </div>
          </div>

          {/* Actions */}
          <div
            className="flex items-center justify-end gap-3 pt-4"
            style={{ borderTop: `1px solid ${THEME.border}` }}
          >
            <Link
              href="/aura/campanas"
              className="px-4 py-2.5 rounded-xl text-[13px] font-medium tracking-tight"
              style={{
                background: THEME.bgSoft,
                border: `1px solid ${THEME.border}`,
                color: THEME.textSecondary,
              }}
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold tracking-tight transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: THEME.gradient,
                color: "#fff",
              }}
            >
              {submitting ? (
                <>Creando...</>
              ) : (
                <>
                  <Rocket size={14} strokeWidth={2.4} />
                  Lanzar campaña
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
