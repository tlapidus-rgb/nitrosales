"use client";

// ══════════════════════════════════════════════════════════════
// NitroPixel · Setup Checklist
// ══════════════════════════════════════════════════════════════
// Variante "checklist" del NitroScore. Mismo endpoint, mismo dato,
// distinto framing: en vez de un score 0-100 (que el cliente lee
// como una nota de colegio), mostrar progreso de implementación
// como una lista de pasos.
//
// Semántica: PROGRESO, no JUICIO.
// "Te faltan 2 pasos" motiva. "Sacaste 62" frustra.
//
// Ver docs/nitropixel-score-rollout.md (Fase 2)
// ══════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import Link from "next/link";

type LeverKey =
  | "click_coverage"
  | "identity_richness"
  | "capi_match"
  | "signal_freshness"
  | "webhook_reliability";

type LeverStatus = "perfect" | "great" | "good" | "opportunity" | "collecting";

interface Lever {
  key: LeverKey;
  name: string;
  description: string;
  current: number;
  target: number;
  weight: number;
  status: LeverStatus;
  sampleSize: number;
  minSampleNeeded: number;
  moneyAtRiskArs: number;
  unlockTitle: string;
  unlockSteps: string[];
}

interface QualityResponse {
  ok: boolean;
  windowDays: number;
  effectiveDays: number;
  score: number | null;
  leversWithData: number;
  totalLevers: number;
  levers: Lever[];
  measurementStartAt: string;
  daysSinceMeasurementStart: number;
  isCollectingState: boolean;
  computedAt: string;
}

// ──────────────────────────────────────────────────────────────
// Mapeo: status → step state
// ──────────────────────────────────────────────────────────────
//   done       → palanca arriba del target (perfect/great)
//   in_progress→ palanca con data pero debajo del target (good/opportunity)
//   collecting → palanca sin muestras suficientes
type StepState = "done" | "in_progress" | "collecting";

function statusToStepState(status: LeverStatus): StepState {
  switch (status) {
    case "perfect":
    case "great":
      return "done";
    case "good":
    case "opportunity":
      return "in_progress";
    case "collecting":
      return "collecting";
  }
}

// ──────────────────────────────────────────────────────────────
// Copy: nombres "humanos" para cada palanca en framing checklist
// ──────────────────────────────────────────────────────────────
const STEP_LABELS: Record<LeverKey, { title: string; subtitle: string }> = {
  click_coverage: {
    title: "Click IDs llegando al pixel",
    subtitle: "fbclid, gclid, ttclid se capturan en cada visita desde ads",
  },
  identity_richness: {
    title: "Identidad enriquecida",
    subtitle: "Visitors con email + teléfono para deduplicación entre canales",
  },
  capi_match: {
    title: "Conversion API conectada",
    subtitle: "Compras enviadas a Meta con _fbc/_fbp para Event Match Quality",
  },
  signal_freshness: {
    title: "Touchpoints frescos en atribución",
    subtitle: "Las atribuciones usan touchpoints recientes (no caché viejo)",
  },
  webhook_reliability: {
    title: "Webhook de órdenes confiable",
    subtitle: "Cada compra real llega con su fecha y datos completos",
  },
};

// ──────────────────────────────────────────────────────────────
// Página
// ──────────────────────────────────────────────────────────────
export default function SetupChecklistPage() {
  const [data, setData] = useState<QualityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/nitropixel/data-quality-score?window=7d", {
          cache: "no-store",
        });
        const json = await res.json();
        if (!alive) return;
        if (!json.ok) throw new Error(json.error || "Error de carga");
        setData(json);
        setErr(null);
      } catch (e) {
        if (!alive) return;
        setErr((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  const totalSteps = data?.levers.length ?? 5;
  const doneSteps = data?.levers.filter((l) => statusToStepState(l.status) === "done").length ?? 0;
  const inProgressSteps =
    data?.levers.filter((l) => statusToStepState(l.status) === "in_progress").length ?? 0;
  const collectingSteps =
    data?.levers.filter((l) => statusToStepState(l.status) === "collecting").length ?? 0;
  const progressPct = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#05070d] text-white">
      <style jsx global>{`
        @keyframes pixelFadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pixelHeartbeat {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes pixelShimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes checkPop {
          0% { transform: scale(0.8); opacity: 0; }
          50% { transform: scale(1.15); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      <main className="max-w-5xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="mb-8" style={{ animation: "pixelFadeUp 0.6s ease-out" }}>
          <div className="text-[10px] font-mono tracking-[0.25em] text-cyan-400/70 uppercase mb-2">
            NitroPixel · Setup
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
            Tu checklist de implementación
          </h1>
          <p className="text-white/60 mt-2 max-w-2xl">
            En vez de un puntaje, te mostramos exactamente qué pasos tiene tu pixel completos
            y cuáles están en progreso. Cada paso desbloqueado mejora la atribución de tus campañas.
          </p>

          <div className="mt-3 text-xs text-white/40">
            <Link href="/nitropixel" className="hover:text-cyan-300 transition">
              ← Volver a NitroPixel
            </Link>
          </div>
        </div>

        {/* Loading state */}
        {loading && !data && (
          <div className="border border-white/10 rounded-2xl p-8 bg-white/[0.02]">
            <div className="text-white/50 text-sm" style={{ animation: "pixelHeartbeat 1.6s ease-in-out infinite" }}>
              Cargando tu checklist...
            </div>
          </div>
        )}

        {/* Error state */}
        {err && (
          <div className="border border-violet-500/20 rounded-2xl p-6 bg-violet-500/5">
            <div className="text-violet-300 text-sm">No pudimos cargar tu checklist: {err}</div>
          </div>
        )}

        {/* Main content */}
        {data && (
          <>
            {/* Progress summary */}
            <div
              className="border border-cyan-500/20 rounded-2xl p-6 bg-gradient-to-br from-cyan-500/[0.03] to-transparent mb-6"
              style={{ animation: "pixelFadeUp 0.7s ease-out" }}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-[10px] font-mono tracking-[0.2em] text-cyan-300/70 uppercase mb-1">
                    Tu progreso
                  </div>
                  <div className="text-2xl font-semibold">
                    {doneSteps} de {totalSteps} pasos completos
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold tabular-nums text-emerald-300">
                    {progressPct}%
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-2 rounded-full overflow-hidden bg-white/5 relative">
                <div
                  className="h-full rounded-full transition-all duration-1000 ease-out"
                  style={{
                    width: `${progressPct}%`,
                    background: "linear-gradient(90deg, #10b981, #06b6d4, #8b5cf6)",
                  }}
                />
              </div>

              {/* Mini stats */}
              <div className="flex items-center gap-4 mt-4 text-xs text-white/60">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>{doneSteps} listos</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-violet-400" />
                  <span>{inProgressSteps} en progreso</span>
                </div>
                {collectingSteps > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full bg-cyan-400"
                      style={{ animation: "pixelHeartbeat 1.6s ease-in-out infinite" }}
                    />
                    <span>{collectingSteps} recopilando datos</span>
                  </div>
                )}
              </div>
            </div>

            {/* Checklist */}
            <div className="space-y-3">
              {data.levers.map((lever, idx) => {
                const state = statusToStepState(lever.status);
                const labels = STEP_LABELS[lever.key];
                return (
                  <ChecklistItem
                    key={lever.key}
                    index={idx + 1}
                    state={state}
                    title={labels.title}
                    subtitle={labels.subtitle}
                    lever={lever}
                  />
                );
              })}
            </div>

            {/* Footer note */}
            <div className="mt-8 text-[11px] text-white/40 text-center font-mono">
              Datos calculados desde {new Date(data.measurementStartAt).toLocaleDateString("es-AR")} ·
              {" "}Ventana de los últimos {data.effectiveDays} días
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// ChecklistItem
// ──────────────────────────────────────────────────────────────
function ChecklistItem({
  index,
  state,
  title,
  subtitle,
  lever,
}: {
  index: number;
  state: StepState;
  title: string;
  subtitle: string;
  lever: Lever;
}) {
  const [open, setOpen] = useState(false);

  const stateConfig = {
    done: {
      borderColor: "border-emerald-500/30",
      bgColor: "bg-emerald-500/[0.04]",
      iconBg: "bg-emerald-500/20 border-emerald-400/40",
      iconColor: "text-emerald-300",
      label: "Listo",
      labelColor: "text-emerald-300",
    },
    in_progress: {
      borderColor: "border-violet-500/30",
      bgColor: "bg-violet-500/[0.03]",
      iconBg: "bg-violet-500/15 border-violet-400/40",
      iconColor: "text-violet-300",
      label: "En progreso",
      labelColor: "text-violet-300",
    },
    collecting: {
      borderColor: "border-cyan-500/30",
      bgColor: "bg-cyan-500/[0.03]",
      iconBg: "bg-cyan-500/15 border-cyan-400/40",
      iconColor: "text-cyan-300",
      label: "Recopilando datos",
      labelColor: "text-cyan-300",
    },
  }[state];

  const samplePct =
    lever.minSampleNeeded > 0
      ? Math.min(100, Math.round((lever.sampleSize / lever.minSampleNeeded) * 100))
      : 0;

  return (
    <div
      className={`border ${stateConfig.borderColor} rounded-xl ${stateConfig.bgColor} overflow-hidden transition-all`}
      style={{ animation: `pixelFadeUp 0.5s ease-out ${index * 0.05}s both` }}
    >
      {/* Header row */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-4 p-5 text-left hover:bg-white/[0.02] transition"
      >
        {/* Icon */}
        <div
          className={`w-10 h-10 rounded-full border-2 ${stateConfig.iconBg} flex items-center justify-center flex-shrink-0`}
          style={state === "done" ? { animation: "checkPop 0.5s ease-out" } : undefined}
        >
          {state === "done" && (
            <svg
              className={`w-5 h-5 ${stateConfig.iconColor}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
          {state === "in_progress" && (
            <span className={`text-xs font-mono ${stateConfig.iconColor}`}>{index}</span>
          )}
          {state === "collecting" && (
            <div
              className="w-3 h-3 rounded-full bg-cyan-400"
              style={{ animation: "pixelHeartbeat 1.6s ease-in-out infinite" }}
            />
          )}
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-medium">{title}</span>
            <span
              className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border ${stateConfig.borderColor} ${stateConfig.labelColor}`}
            >
              {stateConfig.label}
            </span>
          </div>
          <div className="text-xs text-white/50 mt-0.5">{subtitle}</div>

          {/* Sample progress bar (collecting only) */}
          {state === "collecting" && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full bg-cyan-400 transition-all duration-1000"
                  style={{ width: `${samplePct}%` }}
                />
              </div>
              <span className="text-[10px] font-mono text-cyan-300/60 tabular-nums">
                {lever.sampleSize}/{lever.minSampleNeeded}
              </span>
            </div>
          )}

          {/* Progress percentage (in_progress only) */}
          {state === "in_progress" && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full bg-violet-400 transition-all duration-1000"
                  style={{
                    width: `${Math.min(100, Math.round((lever.current / lever.target) * 100))}%`,
                  }}
                />
              </div>
              <span className="text-[10px] font-mono text-violet-300/60 tabular-nums">
                {Math.round(lever.current * 100)}% / {Math.round(lever.target * 100)}%
              </span>
            </div>
          )}
        </div>

        {/* Chevron */}
        <svg
          className={`w-4 h-4 text-white/40 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded detail */}
      {open && (
        <div
          className="px-5 pb-5 pt-1 border-t border-white/5 ml-14"
          style={{ animation: "pixelFadeUp 0.3s ease-out" }}
        >
          <div className="text-xs text-white/60 mb-3">{lever.description}</div>

          {state !== "done" && lever.unlockSteps.length > 0 && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-white/40 mb-2">
                {lever.unlockTitle}
              </div>
              <ul className="space-y-1.5">
                {lever.unlockSteps.map((step, i) => (
                  <li key={i} className="text-xs text-white/70 flex gap-2">
                    <span className="text-cyan-400/60">→</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {state === "done" && (
            <div className="text-xs text-emerald-300/80">
              ✓ Este paso está funcionando perfecto. No requiere acción.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
