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

        {/* ─── Placeholder para próximas zonas ───────────────────── */}
        <section className="mt-10">
          <div
            className="rounded-3xl p-8 text-center"
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px dashed rgba(255,255,255,0.08)",
            }}
          >
            <p className="text-[12px] uppercase tracking-[0.25em] text-white/35 font-bold">
              Próxima zona
            </p>
            <p className="mt-2 text-white/55 text-[14px] tracking-tight">
              Hero metrics — 4 KPIs vivos (revenue atribuido, creators activos,
              contenido publicado, EMV estimado).
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
