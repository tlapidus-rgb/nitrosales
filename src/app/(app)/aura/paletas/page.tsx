"use client";

// ══════════════════════════════════════════════════════════════
// Aura — Comparador de paletas (experimento visual)
// ══════════════════════════════════════════════════════════════
// Esta pantalla existe para que Tomy compare 4 direcciones
// visuales distintas aplicadas al MISMO mini-mock del Inicio
// (hero card, 2 KPIs, podium compacto, 1 inbox card).
// Todas con ADN "creator economy" — más jóvenes, más energéticos.
//
// Paletas:
//   A) ELECTRIC VIOLET      → deep purple + lila brillante
//   B) NEO ACID             → black + lime neón + magenta
//   C) CREATOR GRADIENT     → dark + gradientes magenta→cyan
//   D) MONO + CORAL NEON    → black/gris + coral/rojo neón
// ══════════════════════════════════════════════════════════════

import { useState } from "react";
import {
  Sparkles,
  TrendingUp,
  Users,
  Trophy,
  Crown,
  Medal,
  Flame,
  ArrowUpRight,
  Play,
  Eye,
  ArrowRight,
  Zap,
} from "lucide-react";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";

// ─────────────── PALETAS ───────────────
type Palette = {
  id: string;
  name: string;
  tagline: string;
  mood: string;
  // colores base
  bgPage: string;      // fondo página (gradient posible)
  bgCard: string;      // bg card default
  bgCardSoft: string;  // bg decorado
  border: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textMuted: string;
  // accent principal
  accent: string;         // hex pleno
  accentSoft: string;     // 10% opacity
  accentBorder: string;   // 25% opacity
  accentGradient: string; // gradient string para hero/avatars
  // celebration (KPI up, bonus unlocked)
  positive: string;
  positiveSoft: string;
  // alerta
  alert: string;
  alertSoft: string;
};

const PALETTES: Palette[] = [
  {
    id: "violet",
    name: "Electric Violet",
    tagline: "Deep purple + lila brillante",
    mood: "Twitch / Rarible / creator platform premium",
    bgPage: "radial-gradient(ellipse at top, #1a0b2e 0%, #0a0514 100%)",
    bgCard: "rgba(255,255,255,0.04)",
    bgCardSoft: "rgba(167,139,250,0.06)",
    border: "rgba(167,139,250,0.14)",
    borderStrong: "rgba(167,139,250,0.28)",
    textPrimary: "#ffffff",
    textSecondary: "rgba(237,233,254,0.7)",
    textTertiary: "rgba(237,233,254,0.5)",
    textMuted: "rgba(237,233,254,0.35)",
    accent: "#a78bfa",
    accentSoft: "rgba(167,139,250,0.12)",
    accentBorder: "rgba(167,139,250,0.32)",
    accentGradient: "linear-gradient(135deg, #c4b5fd 0%, #8b5cf6 50%, #6d28d9 100%)",
    positive: "#86efac",
    positiveSoft: "rgba(134,239,172,0.12)",
    alert: "#fb7185",
    alertSoft: "rgba(251,113,133,0.12)",
  },
  {
    id: "acid",
    name: "Neo Acid",
    tagline: "Black + lime neón + magenta",
    mood: "Gen Z / Linear meets agresivo / high-energy",
    bgPage: "radial-gradient(ellipse at top, #0a0a0a 0%, #000000 100%)",
    bgCard: "rgba(255,255,255,0.03)",
    bgCardSoft: "rgba(217,255,0,0.04)",
    border: "rgba(255,255,255,0.08)",
    borderStrong: "rgba(217,255,0,0.25)",
    textPrimary: "#ffffff",
    textSecondary: "rgba(255,255,255,0.7)",
    textTertiary: "rgba(255,255,255,0.5)",
    textMuted: "rgba(255,255,255,0.35)",
    accent: "#d9ff00",
    accentSoft: "rgba(217,255,0,0.10)",
    accentBorder: "rgba(217,255,0,0.35)",
    accentGradient: "linear-gradient(135deg, #d9ff00 0%, #a3e635 50%, #65a30d 100%)",
    positive: "#d9ff00",
    positiveSoft: "rgba(217,255,0,0.12)",
    alert: "#ff3864",
    alertSoft: "rgba(255,56,100,0.12)",
  },
  {
    id: "gradient",
    name: "Creator Gradient",
    tagline: "Dark + gradientes magenta→cyan",
    mood: "TikTok / Instagram / creator feed",
    bgPage: "radial-gradient(ellipse at top, #1a0a2e 0%, #0a0a1e 100%)",
    bgCard: "rgba(255,255,255,0.03)",
    bgCardSoft: "rgba(255,107,222,0.05)",
    border: "rgba(255,255,255,0.08)",
    borderStrong: "rgba(255,107,222,0.25)",
    textPrimary: "#ffffff",
    textSecondary: "rgba(255,255,255,0.7)",
    textTertiary: "rgba(255,255,255,0.5)",
    textMuted: "rgba(255,255,255,0.35)",
    accent: "#ff6bde",
    accentSoft: "rgba(255,107,222,0.10)",
    accentBorder: "rgba(255,107,222,0.32)",
    accentGradient: "linear-gradient(135deg, #ff6bde 0%, #b33dff 50%, #00d9ff 100%)",
    positive: "#00d9ff",
    positiveSoft: "rgba(0,217,255,0.12)",
    alert: "#ff4f6b",
    alertSoft: "rgba(255,79,107,0.12)",
  },
  {
    id: "coral",
    name: "Mono + Coral",
    tagline: "Black/gris + coral neón",
    mood: "Arc Browser / Notion premium / sophisticated energy",
    bgPage: "linear-gradient(180deg, #0f0f10 0%, #060607 100%)",
    bgCard: "rgba(255,255,255,0.035)",
    bgCardSoft: "rgba(255,107,91,0.05)",
    border: "rgba(255,255,255,0.08)",
    borderStrong: "rgba(255,107,91,0.24)",
    textPrimary: "#ffffff",
    textSecondary: "rgba(255,255,255,0.7)",
    textTertiary: "rgba(255,255,255,0.5)",
    textMuted: "rgba(255,255,255,0.35)",
    accent: "#ff6b5b",
    accentSoft: "rgba(255,107,91,0.10)",
    accentBorder: "rgba(255,107,91,0.32)",
    accentGradient: "linear-gradient(135deg, #ffb4a8 0%, #ff6b5b 50%, #e53935 100%)",
    positive: "#4ade80",
    positiveSoft: "rgba(74,222,128,0.12)",
    alert: "#ff2d55",
    alertSoft: "rgba(255,45,85,0.12)",
  },
];

// ─────────────── UTILS ───────────────
function fmtARS(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
}
function fmtARSCompact(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

// ─────────────── MOCK MINI INICIO ───────────────
function MockInicio({ p }: { p: Palette }) {
  return (
    <div
      className="rounded-3xl p-6 relative overflow-hidden"
      style={{
        background: p.bgPage,
        color: p.textPrimary,
        border: `1px solid ${p.border}`,
        minHeight: 680,
      }}
    >
      {/* Ambient halos decorativos */}
      <div
        aria-hidden
        className="absolute -top-32 -left-32 w-64 h-64 pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${p.accent}35 0%, transparent 60%)`,
          filter: "blur(40px)",
        }}
      />
      <div
        aria-hidden
        className="absolute -bottom-32 -right-24 w-80 h-80 pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${p.accent}20 0%, transparent 60%)`,
          filter: "blur(50px)",
        }}
      />

      {/* Header */}
      <div className="relative mb-5">
        <div
          className="text-[10px] tracking-[0.2em] uppercase font-semibold mb-2"
          style={{ color: p.textMuted }}
        >
          Aura · hoy
        </div>
        <h1
          className="text-[22px] font-semibold tracking-tight leading-tight"
          style={{ color: p.textPrimary }}
        >
          Sofía rompe récord y 3 campañas llegan al cierre de mes.
        </h1>
      </div>

      {/* 2 KPIs */}
      <div className="relative grid grid-cols-2 gap-3 mb-5">
        <MockKpi
          p={p}
          label="Revenue atribuido"
          value={fmtARSCompact(2847000)}
          delta="+24%"
          positive
          icon={<TrendingUp size={12} strokeWidth={2.2} />}
        />
        <MockKpi
          p={p}
          label="Creators activos"
          value="14"
          delta="+2"
          positive
          icon={<Users size={12} strokeWidth={2.2} />}
        />
      </div>

      {/* Mini podium */}
      <div
        className="relative rounded-2xl p-4 mb-5"
        style={{
          background: p.bgCardSoft,
          border: `1px solid ${p.border}`,
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Trophy size={13} strokeWidth={2.4} style={{ color: p.accent }} />
          <h3
            className="text-[12px] font-semibold tracking-[0.08em] uppercase"
            style={{ color: p.textPrimary }}
          >
            Hall of Flame
          </h3>
        </div>
        <div className="grid grid-cols-3 gap-3 items-end">
          {/* 2nd */}
          <MockPodiumSlot p={p} rank={2} name="Juli" revenue={340000} height={60} />
          {/* 1st */}
          <MockPodiumSlot p={p} rank={1} name="Sofía" revenue={580000} height={80} />
          {/* 3rd */}
          <MockPodiumSlot p={p} rank={3} name="Matu" revenue={210000} height={46} />
        </div>
      </div>

      {/* 1 inbox card */}
      <MockInboxCard p={p} />
    </div>
  );
}

function MockKpi({
  p,
  label,
  value,
  delta,
  positive,
  icon,
}: {
  p: Palette;
  label: string;
  value: string;
  delta: string;
  positive: boolean;
  icon: React.ReactNode;
}) {
  return (
    <div
      className="relative rounded-2xl p-4 overflow-hidden"
      style={{
        background: p.bgCard,
        border: `1px solid ${p.border}`,
      }}
    >
      <div
        className="flex items-center gap-1.5 text-[10px] tracking-[0.14em] uppercase font-semibold mb-2"
        style={{ color: p.textMuted }}
      >
        <span style={{ color: p.accent }}>{icon}</span>
        {label}
      </div>
      <div
        className="text-[22px] font-semibold tabular-nums tracking-tight"
        style={{ color: p.textPrimary }}
      >
        {value}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <span
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold tabular-nums"
          style={{
            color: positive ? p.positive : p.alert,
            background: positive ? p.positiveSoft : p.alertSoft,
          }}
        >
          <ArrowUpRight size={10} strokeWidth={2.4} />
          {delta}
        </span>
        <span className="text-[10px] tracking-tight" style={{ color: p.textMuted }}>
          vs. ayer
        </span>
      </div>
    </div>
  );
}

function MockPodiumSlot({
  p,
  rank,
  name,
  revenue,
  height,
}: {
  p: Palette;
  rank: 1 | 2 | 3;
  name: string;
  revenue: number;
  height: number;
}) {
  const medal =
    rank === 1 ? <Crown size={12} strokeWidth={2.4} /> : <Medal size={11} strokeWidth={2.4} />;
  const isFirst = rank === 1;
  return (
    <div className="flex flex-col items-center">
      {/* Avatar */}
      <div
        className="rounded-full flex items-center justify-center font-bold relative"
        style={{
          width: isFirst ? 48 : 40,
          height: isFirst ? 48 : 40,
          fontSize: isFirst ? 18 : 14,
          background: isFirst ? p.accentGradient : `${p.accent}22`,
          color: isFirst ? "#fff" : p.accent,
          border: `2px solid ${isFirst ? p.accent : p.borderStrong}`,
          boxShadow: isFirst ? `0 6px 20px ${p.accent}55` : "none",
        }}
      >
        {name[0]}
        {isFirst ? (
          <div
            className="absolute -top-2 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full flex items-center justify-center"
            style={{ background: p.accent, color: "#0a0514" }}
          >
            {medal}
          </div>
        ) : null}
      </div>
      <div
        className="mt-2 text-[11px] font-semibold tracking-tight truncate max-w-full"
        style={{ color: p.textPrimary }}
      >
        {name}
      </div>
      <div
        className="text-[10px] tabular-nums tracking-tight"
        style={{ color: p.accent }}
      >
        {fmtARSCompact(revenue)}
      </div>
      {/* Podium bar */}
      <div
        className="mt-2 w-full rounded-t-lg"
        style={{
          height,
          background: isFirst
            ? p.accentGradient
            : `linear-gradient(180deg, ${p.accent}40 0%, ${p.accent}10 100%)`,
          opacity: isFirst ? 1 : 0.7,
          border: `1px solid ${isFirst ? p.accent : p.borderStrong}`,
          borderBottom: "none",
        }}
      />
    </div>
  );
}

function MockInboxCard({ p }: { p: Palette }) {
  return (
    <div
      className="relative rounded-2xl p-4 overflow-hidden"
      style={{
        background: p.accentSoft,
        border: `1px solid ${p.accentBorder}`,
      }}
    >
      <div
        aria-hidden
        className="absolute -top-10 -right-10 w-36 h-36 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 30% 30%, ${p.accent}35 0%, transparent 60%)`,
          filter: "blur(18px)",
        }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: `linear-gradient(145deg, ${p.accent}25, ${p.accent}08)`,
              border: `1px solid ${p.accentBorder}`,
            }}
          >
            <Sparkles size={15} strokeWidth={2} style={{ color: p.accent }} />
          </div>
          <div>
            <h4
              className="text-[13.5px] font-semibold tracking-tight"
              style={{ color: p.textPrimary }}
            >
              3 aplicaciones pendientes
            </h4>
            <p
              className="text-[11.5px] tracking-tight mt-0.5"
              style={{ color: p.textSecondary }}
            >
              Los más recientes con 10K+ seguidores
            </p>
          </div>
        </div>
        <div
          className="px-2.5 py-1 rounded-full text-[11px] font-bold tabular-nums"
          style={{
            background: `${p.accent}22`,
            color: p.accent,
            border: `1px solid ${p.accentBorder}`,
          }}
        >
          3
        </div>
      </div>
      <div
        className="mt-3 flex items-center gap-1 text-[11px] font-medium tracking-tight"
        style={{ color: p.accent }}
      >
        Revisar ahora
        <ArrowRight size={11} strokeWidth={2.4} />
      </div>
    </div>
  );
}

// ─────────────── PAGE ───────────────
export default function PaletasPage() {
  const [focused, setFocused] = useState<string | null>(null);

  return (
    <div
      className="min-h-screen p-8"
      style={{
        background: "#0a0a0a",
        color: "#fff",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Inter, sans-serif",
      }}
    >
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <header className="mb-8">
          <div
            className="text-[11px] tracking-[0.2em] uppercase font-semibold mb-2"
            style={{ color: "rgba(255,255,255,0.4)" }}
          >
            Aura · laboratorio visual
          </div>
          <h1 className="text-[32px] font-semibold tracking-tight">
            Elegí la dirección visual
          </h1>
          <p
            className="mt-2 text-[14px] tracking-tight max-w-2xl"
            style={{ color: "rgba(255,255,255,0.6)" }}
          >
            Mismo mock del Inicio aplicado en 4 direcciones distintas. Todas tienen ADN creator economy (más jóvenes, más energéticas). Click en una card para ver en grande.
          </p>
        </header>

        {/* Grid 2x2 con los 4 mocks */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {PALETTES.map((p) => (
            <div
              key={p.id}
              className="relative"
              onClick={() => setFocused(focused === p.id ? null : p.id)}
            >
              {/* Label arriba */}
              <div className="mb-3 flex items-end justify-between gap-2 flex-wrap">
                <div>
                  <div
                    className="text-[10px] tracking-[0.18em] uppercase font-semibold"
                    style={{ color: "rgba(255,255,255,0.42)" }}
                  >
                    Opción · {p.id.toUpperCase()}
                  </div>
                  <h3 className="text-[20px] font-semibold tracking-tight mt-0.5">
                    {p.name}
                  </h3>
                  <p
                    className="text-[12.5px] tracking-tight mt-0.5"
                    style={{ color: "rgba(255,255,255,0.55)" }}
                  >
                    {p.tagline} · <span style={{ color: p.accent }}>{p.mood}</span>
                  </p>
                </div>
                {/* Swatches */}
                <div className="flex items-center gap-1.5">
                  <Swatch color={p.accent} label="accent" />
                  <Swatch color={p.positive} label="positive" />
                  <Swatch color={p.alert} label="alert" />
                </div>
              </div>

              <MockInicio p={p} />
            </div>
          ))}
        </div>

        {/* Guía de decisión al pie */}
        <div
          className="mt-10 rounded-2xl p-6"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <h3 className="text-[14px] font-semibold tracking-tight mb-3">
            Ayuda para elegir
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.7)" }}>
            <div>
              <b style={{ color: "#a78bfa" }}>Electric Violet</b> — El más "premium tech creator". Elegí esta si querés balance entre sofisticado y joven. Funciona genial con fotos de creators.
            </div>
            <div>
              <b style={{ color: "#d9ff00" }}>Neo Acid</b> — La más agresiva, Gen Z puro. Alto impacto visual. Elegí esta si querés que se sienta como una plataforma-statement que se ve distinta a todo.
            </div>
            <div>
              <b style={{ color: "#ff6bde" }}>Creator Gradient</b> — Nativa al feed de TikTok/Instagram. Más emocional y juguetona. Elegí esta si querés que los creadores se sientan "en casa" visualmente.
            </div>
            <div>
              <b style={{ color: "#ff6b5b" }}>Mono + Coral</b> — La más sobria. Casi monocromática con un solo punch de color. Elegí esta si querés que los datos y las fotos sean protagonistas.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-mono tracking-tight"
      style={{
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.08)",
        color: "rgba(255,255,255,0.75)",
      }}
      title={label}
    >
      <span
        className="w-2.5 h-2.5 rounded-full"
        style={{ background: color, boxShadow: `0 0 8px ${color}88` }}
      />
      {color.toUpperCase()}
    </div>
  );
}
