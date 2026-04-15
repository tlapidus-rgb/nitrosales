"use client";

// ══════════════════════════════════════════════════════════════════════
// Aura — Inicio (hub)
// ──────────────────────────────────────────────────────────────────────
// Primer "ladrillo" del módulo: Zona 1 (Saludo + Pulso Aurum + período).
// Dark mode + acento champagne dorado. Benchmark: Linear / Vercel /
// Stripe — nunca Tiendanube.
//
// Zonas siguientes (pendientes):
//   2. Hero metrics (4 KPIs vivos)
//   3. Hall of flame (3 creators del podio)
//   4. Action Inbox
//   5. Campañas en vuelo
//   6. Content radar
//   7. Insights rápidos
// ══════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Sparkles,
  Calendar,
  ChevronDown,
  RefreshCw,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  Users,
  Play,
  Eye,
  HelpCircle,
} from "lucide-react";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";

// ─── Helpers ──────────────────────────────────────────────────────────
function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 6) return "Buenas noches";
  if (h < 13) return "Buen día";
  if (h < 20) return "Buenas tardes";
  return "Buenas noches";
}

function firstName(full?: string | null) {
  if (!full) return null;
  return full.split(" ")[0];
}

function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

type RangeKey = "este_mes" | "esta_semana" | "ultimos_30" | "custom";

function computeRange(key: RangeKey): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now);
  if (key === "este_mes") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from, to };
  }
  if (key === "esta_semana") {
    const day = now.getDay(); // 0 dom, 1 lun ...
    const diff = (day + 6) % 7; // lun = 0
    const from = new Date(now);
    from.setDate(now.getDate() - diff);
    from.setHours(0, 0, 0, 0);
    return { from, to };
  }
  // ultimos_30
  const from = new Date(now);
  from.setDate(now.getDate() - 29);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

function fmtRangeLabel(key: RangeKey, from: Date, to: Date): string {
  if (key === "este_mes") {
    return from.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  }
  if (key === "esta_semana") return "Esta semana";
  if (key === "ultimos_30") return "Últimos 30 días";
  return `${from.toLocaleDateString("es-AR")} — ${to.toLocaleDateString("es-AR")}`;
}

// ─── AurumOrb mini reutilizable ───────────────────────────────────────
function AurumOrbMini({ size = 22, pulse = false }: { size?: number; pulse?: boolean }) {
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      {pulse && (
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(244,215,148,0.45) 0%, transparent 70%)",
            animation: "auraPulseRing 2.2s ease-in-out infinite",
          }}
        />
      )}
      <div
        className="absolute inset-[14%] rounded-full"
        style={{
          background:
            "radial-gradient(circle at 32% 28%, #fff8e6 0%, #f7e3b0 22%, #e6c27a 50%, #8a6622 100%)",
          boxShadow:
            "0 0 14px rgba(244,215,148,0.55), 0 0 26px rgba(244,215,148,0.25), inset -2px -3px 6px rgba(80,45,0,0.35), inset 1.5px 2px 5px rgba(255,250,230,0.6)",
          animation: "auraBreath 3.6s ease-in-out infinite",
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          top: "22%",
          left: "24%",
          width: "22%",
          height: "18%",
          background: "radial-gradient(circle, rgba(255,255,255,0.85) 0%, transparent 70%)",
          filter: "blur(0.4px)",
        }}
      />
    </div>
  );
}

// ─── Period selector ──────────────────────────────────────────────────
function PeriodSelector({
  value,
  onChange,
  from,
  to,
}: {
  value: RangeKey;
  onChange: (k: RangeKey) => void;
  from: Date;
  to: Date;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const options: { key: RangeKey; label: string }[] = [
    { key: "esta_semana", label: "Esta semana" },
    { key: "este_mes", label: "Este mes" },
    { key: "ultimos_30", label: "Últimos 30 días" },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-[12.5px] font-medium tracking-tight"
        style={{
          background: "rgba(255,255,255,0.035)",
          border: "1px solid rgba(244,215,148,0.18)",
          color: "rgba(255,255,255,0.92)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.04), 0 1px 2px rgba(0,0,0,0.3)",
          transition: `all 220ms ${ES}`,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background =
            "rgba(255,255,255,0.06)";
          (e.currentTarget as HTMLButtonElement).style.borderColor =
            "rgba(244,215,148,0.32)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background =
            "rgba(255,255,255,0.035)";
          (e.currentTarget as HTMLButtonElement).style.borderColor =
            "rgba(244,215,148,0.18)";
        }}
      >
        <Calendar size={13} strokeWidth={2} className="text-[#e6c27a]" />
        <span className="tabular-nums">{fmtRangeLabel(value, from, to)}</span>
        <ChevronDown
          size={13}
          strokeWidth={2.2}
          className="text-white/50"
          style={{
            transition: `transform 200ms ${ES}`,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-56 rounded-2xl p-1.5 z-40"
          style={{
            background: "rgba(12,14,22,0.96)",
            backdropFilter: "blur(14px)",
            border: "1px solid rgba(244,215,148,0.16)",
            boxShadow:
              "0 20px 60px -20px rgba(0,0,0,0.7), 0 8px 24px -12px rgba(244,215,148,0.08)",
            animation: `fadeInDown 180ms ${ES}`,
          }}
        >
          {options.map((o) => {
            const active = o.key === value;
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => {
                  onChange(o.key);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 rounded-xl text-[12.5px] font-medium tracking-tight flex items-center justify-between"
                style={{
                  color: active ? "#f7e3b0" : "rgba(255,255,255,0.82)",
                  background: active ? "rgba(244,215,148,0.08)" : "transparent",
                  transition: `all 160ms ${ES}`,
                }}
                onMouseEnter={(e) => {
                  if (!active)
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "rgba(255,255,255,0.04)";
                }}
                onMouseLeave={(e) => {
                  if (!active)
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "transparent";
                }}
              >
                <span>{o.label}</span>
                {active && (
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background: "#f4d794",
                      boxShadow: "0 0 8px rgba(244,215,148,0.65)",
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Tone → color map del Pulso ───────────────────────────────────────
const TONE_STYLE: Record<
  string,
  { dot: string; ring: string; label: string; labelBg: string }
> = {
  good: {
    dot: "#86efac",
    ring: "rgba(134,239,172,0.25)",
    label: "Verde",
    labelBg: "rgba(134,239,172,0.10)",
  },
  attention: {
    dot: "#f4d794",
    ring: "rgba(244,215,148,0.28)",
    label: "Atención",
    labelBg: "rgba(244,215,148,0.10)",
  },
  celebration: {
    dot: "#f9a8d4",
    ring: "rgba(249,168,212,0.28)",
    label: "Celebrar",
    labelBg: "rgba(249,168,212,0.10)",
  },
  neutral: {
    dot: "rgba(255,255,255,0.55)",
    ring: "rgba(255,255,255,0.14)",
    label: "Calma",
    labelBg: "rgba(255,255,255,0.05)",
  },
};

// ─── Pulso card ───────────────────────────────────────────────────────
type PulseState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      headline: string;
      tone: keyof typeof TONE_STYLE;
      generatedAt: string;
    };

function PulseCard({
  state,
  onRefresh,
}: {
  state: PulseState;
  onRefresh: () => void;
}) {
  const tone =
    state.status === "ready" ? TONE_STYLE[state.tone] ?? TONE_STYLE.neutral : TONE_STYLE.neutral;

  const generatedAgo =
    state.status === "ready"
      ? timeAgo(new Date(state.generatedAt))
      : null;

  return (
    <div
      className="relative rounded-3xl px-6 py-5 overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, rgba(244,215,148,0.055) 0%, rgba(244,215,148,0.02) 40%, rgba(255,255,255,0.02) 100%)",
        border: "1px solid rgba(244,215,148,0.16)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.04), 0 1px 2px rgba(0,0,0,0.3), 0 20px 60px -30px rgba(244,215,148,0.15)",
      }}
    >
      {/* aurora sutil */}
      <div
        aria-hidden
        className="absolute -top-24 -left-24 w-80 h-80 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(244,215,148,0.14) 0%, transparent 70%)",
          filter: "blur(28px)",
        }}
      />
      <div
        aria-hidden
        className="absolute -bottom-32 -right-16 w-80 h-80 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(134,239,172,0.06) 0%, transparent 70%)",
          filter: "blur(36px)",
        }}
      />

      <div className="relative flex items-start gap-4">
        <div className="mt-0.5">
          <AurumOrbMini size={32} pulse={state.status === "loading"} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="text-[9.5px] font-bold uppercase tracking-[0.22em]"
              style={{ color: "#e6c27a" }}
            >
              Pulso Aurum
            </span>
            {state.status === "ready" && (
              <span
                className="inline-flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full"
                style={{
                  background: tone.labelBg,
                  color: "rgba(255,255,255,0.78)",
                  border: `1px solid ${tone.ring}`,
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: tone.dot,
                    boxShadow: `0 0 8px ${tone.ring}`,
                  }}
                />
                {tone.label}
              </span>
            )}
          </div>

          <p
            className="mt-2 text-[15.5px] md:text-[16.5px] leading-relaxed tracking-tight"
            style={{
              color: "rgba(255,255,255,0.94)",
              fontWeight: 500,
              textWrap: "balance" as any,
            }}
          >
            {state.status === "loading" && (
              <span className="inline-flex items-center gap-2 text-white/60">
                <Sparkles
                  size={14}
                  strokeWidth={2}
                  className="text-[#f4d794]"
                  style={{ animation: "spin 2.4s linear infinite" }}
                />
                Aurum está leyendo tu programa…
              </span>
            )}
            {state.status === "error" && (
              <span className="inline-flex items-center gap-2 text-white/70">
                <AlertCircle size={15} className="text-rose-300" strokeWidth={2} />
                No pude leer el pulso ahora. {state.message}
              </span>
            )}
            {state.status === "ready" && state.headline}
          </p>

          {state.status === "ready" && (
            <div className="mt-3 flex items-center gap-3">
              <span className="text-[11px] text-white/35 tabular-nums">
                Actualizado {generatedAgo}
              </span>
              <button
                type="button"
                onClick={onRefresh}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-white/55 hover:text-[#f4d794]"
                style={{ transition: `color 160ms ${ES}` }}
              >
                <RefreshCw size={11} strokeWidth={2} />
                Refrescar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Count-up hook (easeOutQuart) ─────────────────────────────────────
function useCountUp(target: number, duration = 900) {
  const [v, setV] = useState(0);
  const raf = useRef<number | null>(null);
  const start = useRef<number | null>(null);
  const from = useRef(0);
  useEffect(() => {
    from.current = v;
    start.current = null;
    if (raf.current) cancelAnimationFrame(raf.current);
    const step = (t: number) => {
      if (!start.current) start.current = t;
      const p = Math.min((t - start.current) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 4);
      setV(from.current + (target - from.current) * eased);
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);
  return v;
}

// ─── Format helpers ───────────────────────────────────────────────────
function fmtARS(n: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);
}
function fmtARSCompact(n: number) {
  if (Math.abs(n) >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  if (Math.abs(n) >= 1_000) return "$" + (n / 1_000).toFixed(1) + "k";
  return fmtARS(n);
}
function fmtNum(n: number) {
  return Math.round(n).toLocaleString("es-AR");
}

// ─── Delta pill ───────────────────────────────────────────────────────
function DeltaPill({
  value,
  inverse = false,
}: {
  value: number | null;
  inverse?: boolean;
}) {
  if (value === null || !isFinite(value)) {
    return <span className="text-[11px] text-white/35 tabular-nums">sin datos previos</span>;
  }
  if (value === 0) {
    return <span className="text-[11px] text-white/45 tabular-nums">= estable</span>;
  }
  const good = inverse ? value < 0 : value > 0;
  const Icon = value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums"
      style={{ color: good ? "#86efac" : "#fda4af" }}
    >
      <Icon size={11} strokeWidth={2.5} />
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

// ─── Hero metrics types ───────────────────────────────────────────────
type Kpi = { current: number; previous: number; delta: number | null };
type Hero = {
  kpis: {
    revenue: Kpi;
    activeCreators: Kpi;
    publishedContent: Kpi;
    emv: Kpi & { totalViews: number };
  };
  topAvatars: { id: string; name: string; code: string; revenue: number }[];
};
type HeroState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | ({ status: "ready" } & Hero);

// ─── Tooltip mini ─────────────────────────────────────────────────────
function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <HelpCircle
        size={12}
        strokeWidth={2}
        className="text-white/30 hover:text-white/60 cursor-help"
        style={{ transition: `color 160ms ${ES}` }}
      />
      {open && (
        <span
          className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 pointer-events-none"
          style={{ minWidth: 220 }}
        >
          <span
            className="block text-[11px] leading-relaxed text-white/90 rounded-lg px-3 py-2 text-left font-normal normal-case tracking-normal"
            style={{
              background: "rgba(10,12,20,0.96)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 12px 30px -8px rgba(0,0,0,0.6)",
              animation: `fadeInUp 160ms ${ES}`,
            }}
          >
            {text}
          </span>
        </span>
      )}
    </span>
  );
}

// ─── KPI Card base ────────────────────────────────────────────────────
type KpiAccent = "green" | "pink" | "violet" | "gold";

const ACCENT: Record<
  KpiAccent,
  { text: string; glow: string; border: string; iconBg: string; ring: string }
> = {
  green: {
    text: "#86efac",
    glow: "rgba(134,239,172,0.28)",
    border: "rgba(134,239,172,0.18)",
    iconBg: "rgba(134,239,172,0.10)",
    ring: "rgba(134,239,172,0.25)",
  },
  pink: {
    text: "#f9a8d4",
    glow: "rgba(244,114,182,0.28)",
    border: "rgba(244,114,182,0.20)",
    iconBg: "rgba(244,114,182,0.12)",
    ring: "rgba(244,114,182,0.28)",
  },
  violet: {
    text: "#c4b5fd",
    glow: "rgba(167,139,250,0.28)",
    border: "rgba(167,139,250,0.18)",
    iconBg: "rgba(167,139,250,0.10)",
    ring: "rgba(167,139,250,0.24)",
  },
  gold: {
    text: "#f7e3b0",
    glow: "rgba(244,215,148,0.25)",
    border: "rgba(244,215,148,0.18)",
    iconBg: "rgba(244,215,148,0.10)",
    ring: "rgba(244,215,148,0.22)",
  },
};

function KpiShell({
  accent,
  label,
  icon,
  children,
  delay = 0,
  decoration,
}: {
  accent: KpiAccent;
  label: React.ReactNode;
  icon: React.ReactNode;
  children: React.ReactNode;
  delay?: number;
  decoration?: React.ReactNode;
}) {
  const c = ACCENT[accent];
  return (
    <div
      className="relative rounded-2xl p-5 overflow-hidden group"
      style={{
        background:
          "linear-gradient(160deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.01) 60%)",
        border: `1px solid ${c.border}`,
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.04), 0 1px 2px rgba(0,0,0,0.3), 0 14px 40px -20px rgba(0,0,0,0.5)",
        animation: `fadeInUp 420ms ${ES} ${delay}ms both`,
        transition: `border-color 240ms ${ES}, transform 240ms ${ES}`,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = c.glow;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = c.border;
      }}
    >
      {/* aurora accent */}
      <div
        aria-hidden
        className="absolute -top-24 -right-20 w-64 h-64 rounded-full pointer-events-none opacity-60 group-hover:opacity-100"
        style={{
          background: `radial-gradient(circle, ${c.glow} 0%, transparent 70%)`,
          filter: "blur(32px)",
          transition: `opacity 320ms ${ES}`,
        }}
      />
      {decoration}

      <div className="relative flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{
              background: c.iconBg,
              border: `1px solid ${c.ring}`,
            }}
          >
            {icon}
          </div>
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/50">
            {label}
          </span>
        </div>
      </div>

      <div className="relative mt-4">{children}</div>
    </div>
  );
}

// ─── KPI 1 — Revenue atribuido (green + upward sparkline) ─────────────
function RevenueKpi({ kpi, delay }: { kpi: Kpi; delay: number }) {
  const v = useCountUp(kpi.current, 900);
  return (
    <KpiShell
      accent="green"
      label="Revenue atribuido"
      icon={<TrendingUp size={13} strokeWidth={2.2} color={ACCENT.green.text} />}
      delay={delay}
      decoration={
        <svg
          aria-hidden
          className="absolute bottom-3 right-3 opacity-70 group-hover:opacity-100"
          width="72"
          height="28"
          viewBox="0 0 72 28"
          fill="none"
          style={{ transition: `opacity 260ms ${ES}` }}
        >
          <defs>
            <linearGradient id="revGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#86efac" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#86efac" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0 22 L10 20 L20 21 L30 16 L40 17 L50 11 L60 12 L72 4"
            stroke="#86efac"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: 140,
              strokeDashoffset: 140,
              animation: `dashDraw 1200ms ${ES} ${delay + 220}ms forwards`,
            }}
          />
          <path
            d="M0 22 L10 20 L20 21 L30 16 L40 17 L50 11 L60 12 L72 4 L72 28 L0 28 Z"
            fill="url(#revGrad)"
            opacity="0"
            style={{
              animation: `fadeIn 600ms ${ES} ${delay + 900}ms forwards`,
            }}
          />
        </svg>
      }
    >
      <div className="text-[28px] font-semibold text-white tabular-nums tracking-tight leading-none">
        {fmtARSCompact(v)}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <DeltaPill value={kpi.delta} />
        <span className="text-[10.5px] text-white/35">vs. período previo</span>
      </div>
    </KpiShell>
  );
}

// ─── KPI 2 — Creators activos (pink + avatar halo) ────────────────────
function CreatorsKpi({
  kpi,
  avatars,
  delay,
}: {
  kpi: Kpi;
  avatars: { id: string; name: string; code: string }[];
  delay: number;
}) {
  const v = useCountUp(kpi.current, 800);
  const shown = avatars.slice(0, 3);
  return (
    <KpiShell
      accent="pink"
      label="Creators activos"
      icon={<Users size={13} strokeWidth={2.2} color={ACCENT.pink.text} />}
      delay={delay}
    >
      <div className="flex items-end justify-between gap-2">
        <div className="text-[28px] font-semibold text-white tabular-nums tracking-tight leading-none">
          {fmtNum(v)}
        </div>
        {shown.length > 0 && (
          <div className="flex -space-x-2">
            {shown.map((a, i) => (
              <div
                key={a.id}
                className="relative w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                style={{
                  background:
                    "linear-gradient(135deg, #f472b6 0%, #db2777 55%, #9d174d 100%)",
                  border: "1.5px solid #05070d",
                  boxShadow: "0 2px 6px rgba(244,114,182,0.35)",
                  zIndex: 10 - i,
                  animation: `avatarIn 500ms ${ES} ${delay + 300 + i * 90}ms both`,
                }}
                title={a.name}
              >
                {a.name?.[0]?.toUpperCase() ?? "?"}
                {i === 0 && (
                  <span
                    aria-hidden
                    className="absolute inset-[-3px] rounded-full pointer-events-none"
                    style={{
                      border: "1.5px solid rgba(244,114,182,0.55)",
                      animation: "avatarHalo 2.4s ease-in-out infinite",
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <DeltaPill value={kpi.delta} />
        <span className="text-[10.5px] text-white/35">
          {shown.length > 0 ? `Top: ${shown[0].name}` : "Ningún creator vendió"}
        </span>
      </div>
    </KpiShell>
  );
}

// ─── KPI 3 — Contenido publicado (violet + play beat) ─────────────────
function ContentKpi({ kpi, delay }: { kpi: Kpi; delay: number }) {
  const v = useCountUp(kpi.current, 800);
  return (
    <KpiShell
      accent="violet"
      label="Contenido publicado"
      icon={<Play size={12} strokeWidth={2.4} color={ACCENT.violet.text} fill={ACCENT.violet.text} />}
      delay={delay}
      decoration={
        <div
          aria-hidden
          className="absolute bottom-3 right-4 pointer-events-none"
          style={{
            width: 34,
            height: 34,
            borderRadius: 999,
            background: "rgba(167,139,250,0.10)",
            border: "1px solid rgba(167,139,250,0.22)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: "reelBeat 2.6s ease-in-out infinite",
          }}
        >
          <span
            style={{
              width: 0,
              height: 0,
              borderLeft: "9px solid #c4b5fd",
              borderTop: "6px solid transparent",
              borderBottom: "6px solid transparent",
              marginLeft: 2,
            }}
          />
        </div>
      }
    >
      <div className="text-[28px] font-semibold text-white tabular-nums tracking-tight leading-none">
        {fmtNum(v)}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <DeltaPill value={kpi.delta} />
        <span className="text-[10.5px] text-white/35">piezas publicadas</span>
      </div>
    </KpiShell>
  );
}

// ─── KPI 4 — EMV estimado (gold + camera flash sweep) ─────────────────
function EmvKpi({
  kpi,
  delay,
}: {
  kpi: Kpi & { totalViews: number };
  delay: number;
}) {
  const v = useCountUp(kpi.current, 1000);
  return (
    <KpiShell
      accent="gold"
      label={
        <span className="inline-flex items-center gap-1.5">
          EMV estimado
          <InfoTip text="Earned Media Value: valor mediático ganado. Se estima como alcance total × CPM promedio LATAM (Meta + Google + TikTok). Aproximación." />
        </span>
      }
      icon={<Eye size={13} strokeWidth={2.2} color={ACCENT.gold.text} />}
      delay={delay}
      decoration={
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl"
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              width: "40%",
              left: "-40%",
              background:
                "linear-gradient(100deg, transparent 0%, rgba(244,215,148,0.09) 50%, transparent 100%)",
              animation: "flashSweep 4.8s ease-in-out infinite",
              animationDelay: `${delay + 400}ms`,
            }}
          />
        </div>
      }
    >
      <div className="text-[28px] font-semibold text-white tabular-nums tracking-tight leading-none">
        {fmtARSCompact(v)}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <DeltaPill value={kpi.delta} />
        <span className="text-[10.5px] text-white/35 tabular-nums">
          {fmtNum(kpi.totalViews)} views
        </span>
      </div>
    </KpiShell>
  );
}

// ─── Podium types ──────────────────────────────────────────────────────
type PodiumSlot = {
  rank: 1 | 2 | 3;
  id: string;
  name: string;
  code: string;
  avatarUrl: string | null;
  commissionPercent: number;
  revenue: number;
  conversions: number;
  avgTicket: number;
  vsAverage: number;
  campaignsCount: number;
};
type PodiumPayload = {
  podium: PodiumSlot[];
  stats: { creatorsWhoSold: number; averageRevenue: number };
};
type PodiumState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | ({ status: "ready" } & PodiumPayload);

// ─── Rank tokens ──────────────────────────────────────────────────────
type RankTheme = {
  label: string;
  medal: string;
  primary: string;
  ring: string;
  halo: string;
  gradient: string;
  nameGradient: string;
  cardBorder: string;
  cardGlow: string;
};

const RANK: Record<1 | 2 | 3, RankTheme> = {
  1: {
    label: "Rey del período",
    medal: "🥇",
    primary: "#f4d794",
    ring: "rgba(244,215,148,0.55)",
    halo: "rgba(244,215,148,0.35)",
    gradient:
      "linear-gradient(135deg, #fff8e6 0%, #f4d794 40%, #c9972f 100%)",
    nameGradient:
      "linear-gradient(120deg, #fff8e6 0%, #f4d794 50%, #e6c27a 100%)",
    cardBorder: "rgba(244,215,148,0.28)",
    cardGlow: "rgba(244,215,148,0.22)",
  },
  2: {
    label: "Segundo escalón",
    medal: "🥈",
    primary: "#e5e7eb",
    ring: "rgba(229,231,235,0.45)",
    halo: "rgba(229,231,235,0.22)",
    gradient:
      "linear-gradient(135deg, #f8fafc 0%, #e5e7eb 45%, #94a3b8 100%)",
    nameGradient:
      "linear-gradient(120deg, #f8fafc 0%, #e5e7eb 55%, #cbd5e1 100%)",
    cardBorder: "rgba(203,213,225,0.22)",
    cardGlow: "rgba(203,213,225,0.15)",
  },
  3: {
    label: "Tercer escalón",
    medal: "🥉",
    primary: "#fbc999",
    ring: "rgba(251,201,153,0.45)",
    halo: "rgba(251,146,60,0.22)",
    gradient:
      "linear-gradient(135deg, #fde4d1 0%, #fbc999 40%, #c2410c 100%)",
    nameGradient:
      "linear-gradient(120deg, #fde4d1 0%, #fbc999 55%, #fb923c 100%)",
    cardBorder: "rgba(251,146,60,0.22)",
    cardGlow: "rgba(251,146,60,0.18)",
  },
};

// ─── Avatar grande con halo ───────────────────────────────────────────
function PodiumAvatar({
  name,
  url,
  rank,
  size = 64,
}: {
  name: string;
  url: string | null;
  rank: 1 | 2 | 3;
  size?: number;
}) {
  const theme = RANK[rank];
  const initial = name?.[0]?.toUpperCase() ?? "?";
  return (
    <div
      className="relative flex-shrink-0"
      style={{ width: size, height: size }}
    >
      {/* halo anillo rotante (solo en #1) */}
      {rank === 1 && (
        <span
          aria-hidden
          className="absolute rounded-full pointer-events-none"
          style={{
            inset: -5,
            background: `conic-gradient(from 0deg, transparent 0deg, ${theme.ring} 120deg, transparent 240deg, ${theme.ring} 360deg)`,
            animation: "haloSpin 5.5s linear infinite",
            mask: "radial-gradient(circle, transparent 62%, black 64%)",
            WebkitMask: "radial-gradient(circle, transparent 62%, black 64%)",
          }}
        />
      )}
      {/* halo estático #2 y #3 */}
      {rank !== 1 && (
        <span
          aria-hidden
          className="absolute rounded-full pointer-events-none"
          style={{
            inset: -3,
            border: `1.5px solid ${theme.ring}`,
            boxShadow: `0 0 14px ${theme.halo}`,
          }}
        />
      )}
      {/* avatar */}
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={name}
          className="absolute inset-[3px] rounded-full object-cover"
          style={{
            border: `1.5px solid rgba(5,7,13,0.8)`,
            boxShadow: `0 4px 16px ${theme.halo}`,
          }}
        />
      ) : (
        <div
          className="absolute inset-[3px] rounded-full flex items-center justify-center font-semibold text-[#1a1406]"
          style={{
            fontSize: size * 0.42,
            background: theme.gradient,
            border: `1.5px solid rgba(5,7,13,0.8)`,
            boxShadow: `0 4px 16px ${theme.halo}`,
          }}
        >
          {initial}
        </div>
      )}
      {/* medalla flotante */}
      <span
        aria-hidden
        className="absolute -bottom-1 -right-1 flex items-center justify-center text-[14px]"
        style={{
          width: size * 0.42,
          height: size * 0.42,
          borderRadius: 999,
          background: "rgba(5,7,13,0.92)",
          border: `1px solid ${theme.ring}`,
          boxShadow: `0 2px 8px ${theme.halo}`,
        }}
      >
        {theme.medal}
      </span>
    </div>
  );
}

// ─── Trading card del podio ───────────────────────────────────────────
function PodiumCard({
  slot,
  delay,
  isChampion = false,
}: {
  slot: PodiumSlot;
  delay: number;
  isChampion?: boolean;
}) {
  const theme = RANK[slot.rank];
  const revenue = useCountUp(slot.revenue, isChampion ? 1200 : 900);
  const conversions = useCountUp(slot.conversions, 800);

  return (
    <div
      className="relative rounded-2xl overflow-hidden group"
      style={{
        padding: isChampion ? 22 : 18,
        background:
          "linear-gradient(165deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 55%, rgba(255,255,255,0.02) 100%)",
        border: `1px solid ${theme.cardBorder}`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.05), 0 1px 2px rgba(0,0,0,0.35), 0 20px 50px -22px ${theme.cardGlow}`,
        animation: `podiumIn 540ms ${ES} ${delay}ms both`,
        transition: `transform 260ms ${ES}, border-color 260ms ${ES}`,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
        (e.currentTarget as HTMLDivElement).style.borderColor = theme.ring;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
        (e.currentTarget as HTMLDivElement).style.borderColor = theme.cardBorder;
      }}
    >
      {/* aurora del rank en la esquina */}
      <div
        aria-hidden
        className="absolute -top-32 -right-20 w-80 h-80 rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${theme.cardGlow} 0%, transparent 68%)`,
          filter: "blur(38px)",
          opacity: isChampion ? 0.85 : 0.55,
        }}
      />
      {/* spotlight line top para #1 */}
      {isChampion && (
        <div
          aria-hidden
          className="absolute top-0 left-6 right-6 h-[1px] pointer-events-none"
          style={{
            background: `linear-gradient(90deg, transparent, ${theme.primary}, transparent)`,
            opacity: 0.7,
          }}
        />
      )}
      {/* sparkles sutiles para #1 */}
      {isChampion && (
        <>
          <span
            aria-hidden
            className="absolute pointer-events-none"
            style={{
              top: "18%",
              left: "32%",
              width: 3,
              height: 3,
              borderRadius: 999,
              background: theme.primary,
              boxShadow: `0 0 8px ${theme.primary}`,
              animation: `sparkleFloat 4.2s ease-in-out infinite`,
              animationDelay: `${delay + 200}ms`,
            }}
          />
          <span
            aria-hidden
            className="absolute pointer-events-none"
            style={{
              top: "30%",
              left: "18%",
              width: 2,
              height: 2,
              borderRadius: 999,
              background: theme.primary,
              boxShadow: `0 0 6px ${theme.primary}`,
              animation: `sparkleFloat 5s ease-in-out infinite`,
              animationDelay: `${delay + 1100}ms`,
            }}
          />
          <span
            aria-hidden
            className="absolute pointer-events-none"
            style={{
              top: "12%",
              right: "14%",
              width: 2,
              height: 2,
              borderRadius: 999,
              background: theme.primary,
              boxShadow: `0 0 6px ${theme.primary}`,
              animation: `sparkleFloat 4.6s ease-in-out infinite`,
              animationDelay: `${delay + 1900}ms`,
            }}
          />
        </>
      )}

      <div className="relative flex items-center gap-4">
        <PodiumAvatar
          name={slot.name}
          url={slot.avatarUrl}
          rank={slot.rank}
          size={isChampion ? 68 : 56}
        />
        <div className="flex-1 min-w-0">
          <div
            className="text-[9.5px] font-bold uppercase tracking-[0.22em]"
            style={{ color: theme.primary }}
          >
            #{slot.rank} · {theme.label}
          </div>
          <div
            className={`mt-1 truncate ${isChampion ? "text-[22px]" : "text-[18px]"} font-semibold tracking-tight`}
            style={{
              background: theme.nameGradient,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              letterSpacing: "-0.02em",
            }}
            title={slot.name}
          >
            {slot.name}
          </div>
          <div className="text-[11px] text-white/40 tabular-nums truncate">
            @{slot.code}
          </div>
        </div>
      </div>

      <div
        className="relative mt-5 pt-4"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="grid grid-cols-3 gap-2">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/35">
              Revenue
            </div>
            <div className="mt-0.5 text-white tabular-nums font-semibold tracking-tight text-[15.5px]">
              {fmtARSCompact(revenue)}
            </div>
          </div>
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/35">
              Convs.
            </div>
            <div className="mt-0.5 text-white tabular-nums font-semibold tracking-tight text-[15.5px]">
              {fmtNum(conversions)}
            </div>
          </div>
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/35">
              Ticket
            </div>
            <div className="mt-0.5 text-white tabular-nums font-semibold tracking-tight text-[15.5px]">
              {fmtARSCompact(slot.avgTicket)}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <span
            className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold tabular-nums px-2 py-0.5 rounded-full"
            style={{
              background:
                slot.vsAverage >= 0
                  ? "rgba(134,239,172,0.10)"
                  : "rgba(253,164,175,0.10)",
              color: slot.vsAverage >= 0 ? "#86efac" : "#fda4af",
              border: `1px solid ${slot.vsAverage >= 0 ? "rgba(134,239,172,0.22)" : "rgba(253,164,175,0.22)"}`,
            }}
          >
            {slot.vsAverage >= 0 ? (
              <ArrowUpRight size={10} strokeWidth={2.6} />
            ) : (
              <ArrowDownRight size={10} strokeWidth={2.6} />
            )}
            {Math.abs(slot.vsAverage).toFixed(0)}% vs. promedio
          </span>
          <div className="flex items-center gap-2 text-[10.5px] text-white/40 tabular-nums">
            {slot.campaignsCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <span
                  className="w-1 h-1 rounded-full"
                  style={{
                    background: theme.primary,
                    boxShadow: `0 0 6px ${theme.halo}`,
                  }}
                />
                {slot.campaignsCount} camp.
              </span>
            )}
            <span>{slot.commissionPercent.toFixed(1)}% com.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Zona 3 — Hall of flame ───────────────────────────────────────────
function HallOfFlameZone({ state }: { state: PodiumState }) {
  if (state.status === "loading") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-2xl h-[210px]"
            style={{
              background:
                "linear-gradient(160deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
              border: "1px solid rgba(255,255,255,0.05)",
              animation: `shimmerPulse 1.8s ease-in-out ${i * 140}ms infinite`,
            }}
          />
        ))}
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div
        className="rounded-2xl p-5 text-white/70 text-[13px]"
        style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(253,164,175,0.2)",
        }}
      >
        No pude cargar el podio. {state.message}
      </div>
    );
  }
  const { podium } = state;
  if (podium.length === 0) {
    return (
      <div
        className="rounded-2xl p-8 text-center"
        style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px dashed rgba(244,215,148,0.18)",
        }}
      >
        <p className="text-[14px] text-white/70 tracking-tight">
          Todavía nadie subió al podio este período.
        </p>
        <p className="mt-1 text-[12px] text-white/40">
          Cuando tus creators empiecen a convertir, el Hall of flame se enciende.
        </p>
      </div>
    );
  }

  // Orden visual: #2 izq · #1 centro · #3 der (estilo podio clásico)
  const champion = podium.find((p) => p.rank === 1);
  const second = podium.find((p) => p.rank === 2);
  const third = podium.find((p) => p.rank === 3);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
      <div className="md:order-1 order-2">
        {second && <PodiumCard slot={second} delay={120} />}
      </div>
      <div className="md:order-2 order-1 md:-mt-2">
        {champion && <PodiumCard slot={champion} delay={0} isChampion />}
      </div>
      <div className="md:order-3 order-3">
        {third && <PodiumCard slot={third} delay={220} />}
      </div>
    </div>
  );
}

// ─── Zona 2 ────────────────────────────────────────────────────────────
function HeroMetricsZone({ state }: { state: HeroState }) {
  if (state.status === "loading") {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-2xl h-[140px]"
            style={{
              background:
                "linear-gradient(160deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
              border: "1px solid rgba(255,255,255,0.05)",
              animation: `shimmerPulse 1.8s ease-in-out ${i * 120}ms infinite`,
            }}
          />
        ))}
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div
        className="rounded-2xl p-5 text-white/70 text-[13px]"
        style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(253,164,175,0.2)",
        }}
      >
        No pude cargar los hero metrics. {state.message}
      </div>
    );
  }
  const { kpis, topAvatars } = state;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <RevenueKpi kpi={kpis.revenue} delay={0} />
      <CreatorsKpi kpi={kpis.activeCreators} avatars={topAvatars} delay={80} />
      <ContentKpi kpi={kpis.publishedContent} delay={160} />
      <EmvKpi kpi={kpis.emv} delay={240} />
    </div>
  );
}

function timeAgo(d: Date) {
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return "hace unos segundos";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  return d.toLocaleDateString("es-AR");
}

// ─── Página ───────────────────────────────────────────────────────────
export default function AuraInicioPage() {
  const { data: session } = useSession();
  const user = firstName((session?.user as any)?.name as string | undefined);

  const [rangeKey, setRangeKey] = useState<RangeKey>("este_mes");
  const range = useMemo(() => computeRange(rangeKey), [rangeKey]);

  const [pulse, setPulse] = useState<PulseState>({ status: "loading" });
  const [hero, setHero] = useState<HeroState>({ status: "loading" });
  const [podium, setPodium] = useState<PodiumState>({ status: "loading" });

  async function loadPodium() {
    setPodium({ status: "loading" });
    try {
      const qs = new URLSearchParams({
        from: toInputDate(range.from),
        to: toInputDate(range.to),
      });
      const res = await fetch(`/api/aura/metrics/podium?${qs.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as PodiumPayload;
      setPodium({ status: "ready", ...data });
    } catch (e: any) {
      setPodium({ status: "error", message: e?.message || "error desconocido" });
    }
  }

  async function loadHero() {
    setHero({ status: "loading" });
    try {
      const qs = new URLSearchParams({
        from: toInputDate(range.from),
        to: toInputDate(range.to),
      });
      const res = await fetch(`/api/aura/metrics/hero?${qs.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setHero({ status: "ready", ...(data as Hero) });
    } catch (e: any) {
      setHero({ status: "error", message: e?.message || "error desconocido" });
    }
  }

  async function loadPulse(force = false) {
    setPulse({ status: "loading" });
    try {
      const qs = new URLSearchParams({
        from: toInputDate(range.from),
        to: toInputDate(range.to),
      });
      if (force) qs.set("force", "1");
      const res = await fetch(`/api/aura/pulse?${qs.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPulse({
        status: "ready",
        headline: data.headline,
        tone: data.tone,
        generatedAt: data.generatedAt,
      });
    } catch (e: any) {
      setPulse({ status: "error", message: e?.message || "error desconocido" });
    }
  }

  useEffect(() => {
    loadPulse(false);
    loadHero();
    loadPodium();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey]);

  return (
    <div
      className="relative min-h-[calc(100vh-0px)]"
      style={{
        background:
          "radial-gradient(1200px 600px at 15% -10%, rgba(244,215,148,0.06) 0%, transparent 60%), radial-gradient(900px 600px at 90% 10%, rgba(134,239,172,0.04) 0%, transparent 55%), #05070d",
      }}
    >
      {/* Estilos locales (animaciones Aura) */}
      <style jsx global>{`
        @keyframes auraBreath {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.03); filter: brightness(1.08); }
        }
        @keyframes auraPulseRing {
          0% { transform: scale(1); opacity: 0.75; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes dashDraw {
          to { stroke-dashoffset: 0; }
        }
        @keyframes avatarIn {
          from { opacity: 0; transform: scale(0.5) translateY(4px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes avatarHalo {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.15); opacity: 0.3; }
        }
        @keyframes reelBeat {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(167,139,250,0.35); }
          50% { transform: scale(1.06); box-shadow: 0 0 0 6px rgba(167,139,250,0); }
        }
        @keyframes flashSweep {
          0% { left: -40%; }
          55% { left: 120%; }
          100% { left: 120%; }
        }
        @keyframes shimmerPulse {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 0.9; }
        }
        @keyframes podiumIn {
          from { opacity: 0; transform: translateY(18px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes haloSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes sparkleFloat {
          0%, 100% { transform: translateY(0) scale(1); opacity: 0.55; }
          50% { transform: translateY(-6px) scale(1.18); opacity: 1; }
        }
      `}</style>

      <div
        className="px-6 md:px-10 pt-10 md:pt-12 pb-10 max-w-[1440px] mx-auto"
        style={{ animation: `fadeInUp 360ms ${ES}` }}
      >
        {/* ─── Zona 1: Saludo + período + Pulso ──────────────────── */}
        <section>
          <div className="flex items-start md:items-center justify-between gap-4 flex-col md:flex-row">
            <div>
              <div className="flex items-center gap-2.5">
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.28em]"
                  style={{ color: "#e6c27a" }}
                >
                  Aura · Inicio
                </span>
                <span
                  className="w-1 h-1 rounded-full"
                  style={{ background: "rgba(244,215,148,0.6)" }}
                />
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/40"
                >
                  Tu programa, en vivo
                </span>
              </div>
              <h1
                className="mt-2 text-[34px] md:text-[40px] leading-[1.05] tracking-tight text-white"
                style={{ fontWeight: 600, letterSpacing: "-0.025em" }}
              >
                {greeting()}
                {user ? (
                  <>
                    ,{" "}
                    <span
                      style={{
                        background:
                          "linear-gradient(120deg, #fff8e6 0%, #f4d794 45%, #e6c27a 100%)",
                        WebkitBackgroundClip: "text",
                        backgroundClip: "text",
                        color: "transparent",
                      }}
                    >
                      {user}
                    </span>
                  </>
                ) : null}
                <span className="text-white/35">.</span>
              </h1>
            </div>

            <PeriodSelector
              value={rangeKey}
              onChange={setRangeKey}
              from={range.from}
              to={range.to}
            />
          </div>

          <div className="mt-6">
            <PulseCard state={pulse} onRefresh={() => loadPulse(true)} />
          </div>
        </section>

        {/* ─── Zona 2: Hero metrics ──────────────────────────────── */}
        <section className="mt-8">
          <div className="flex items-center gap-2.5 mb-4">
            <span
              className="text-[10px] font-bold uppercase tracking-[0.26em]"
              style={{ color: "#e6c27a" }}
            >
              Pulso del programa
            </span>
            <span
              className="w-1 h-1 rounded-full"
              style={{ background: "rgba(244,215,148,0.55)" }}
            />
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">
              Hero metrics
            </span>
          </div>
          <HeroMetricsZone state={hero} />
        </section>

        {/* ─── Zona 3: Hall of flame ─────────────────────────────── */}
        <section className="mt-10">
          <div className="flex items-center gap-2.5 mb-4">
            <span
              className="text-[10px] font-bold uppercase tracking-[0.26em]"
              style={{ color: "#e6c27a" }}
            >
              Hall of flame
            </span>
            <span
              className="w-1 h-1 rounded-full"
              style={{ background: "rgba(244,215,148,0.55)" }}
            />
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">
              Podio del período
            </span>
          </div>
          <HallOfFlameZone state={podium} />
        </section>
      </div>
    </div>
  );
}
