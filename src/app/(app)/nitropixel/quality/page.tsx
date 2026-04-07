"use client";

// ══════════════════════════════════════════════════════════════
// NitroPixel · Calidad de Atribución (NitroScore)
// ══════════════════════════════════════════════════════════════
// Página complementaria a /nitropixel — muestra la salud del pixel
// como un único score 0-100 + 5 palancas que el cliente puede
// desbloquear con instrucciones concretas. Lenguaje 100% positivo.
// Read-only — consume /api/nitropixel/data-quality-score.
// ══════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

type LeverKey =
  | "click_coverage"
  | "identity_richness"
  | "capi_match"
  | "signal_freshness"
  | "webhook_reliability";

type LeverStatus = "perfect" | "great" | "good" | "opportunity";

interface Lever {
  key: LeverKey;
  name: string;
  description: string;
  current: number;
  target: number;
  weight: number;
  status: LeverStatus;
  moneyAtRiskArs: number;
  unlockTitle: string;
  unlockSteps: string[];
}

interface Opportunity {
  id: string;
  title: string;
  description: string;
  action: string;
  metric: string | null;
  metricValue: number | null;
  createdAt: string;
}

type WindowKey = "24h" | "7d" | "30d";

interface QualityResponse {
  ok: boolean;
  window: WindowKey;
  windowLabel: string;
  windowDays: number;
  score: number;
  scoreLabel: string;
  scoreColor: string;
  priorScore: number | null;
  trendDelta: number | null;
  attributedRevenue: number;
  totalPurchases: number;
  levers: Lever[];
  opportunities: Opportunity[];
  fixAppliedAt: string;
  daysSinceFix: number;
  historicalDragWarning: boolean;
  computedAt: string;
}

// ──────────────────────────────────────────────────────────────
// Utilidades
// ──────────────────────────────────────────────────────────────
function formatARS(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);
}

function statusToColor(status: LeverStatus): string {
  // NUNCA rojo. Verde > cyan > violet > violet-claro
  switch (status) {
    case "perfect":
      return "#10b981";
    case "great":
      return "#06b6d4";
    case "good":
      return "#8b5cf6";
    case "opportunity":
      return "#a855f7";
  }
}

function statusToLabel(status: LeverStatus): string {
  switch (status) {
    case "perfect":
      return "En su mejor momento";
    case "great":
      return "Funcionando muy bien";
    case "good":
      return "Espacio para crecer";
    case "opportunity":
      return "Oportunidad para desbloquear";
  }
}

function timeAgoEs(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "hace instantes";
  if (ms < 3_600_000) return `hace ${Math.floor(ms / 60_000)} min`;
  if (ms < 86_400_000) return `hace ${Math.floor(ms / 3_600_000)} h`;
  return `hace ${Math.floor(ms / 86_400_000)} d`;
}

function useAnimatedNumber(target: number, duration = 1400): number {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    fromRef.current = value;
    startRef.current = null;
    let raf = 0;
    const tick = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = fromRef.current + (target - fromRef.current) * eased;
      setValue(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return Math.round(value);
}

// ──────────────────────────────────────────────────────────────
// Página principal
// ──────────────────────────────────────────────────────────────
export default function NitroPixelQualityPage() {
  const [data, setData] = useState<QualityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeLever, setActiveLever] = useState<Lever | null>(null);
  const [windowKey, setWindowKey] = useState<WindowKey>("7d");

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const r = await fetch(`/api/nitropixel/data-quality-score?window=${windowKey}`, {
          cache: "no-store",
        });
        const j = (await r.json()) as QualityResponse;
        if (!alive) return;
        if (!j.ok) throw new Error("API error");
        setData(j);
        setError(null);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Error desconocido");
      } finally {
        if (alive) setLoading(false);
      }
    }
    setLoading(true);
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [windowKey]);

  const score = data?.score ?? 0;
  const animScore = useAnimatedNumber(score, 1800);
  const scoreColor = data?.scoreColor ?? "#06b6d4";
  const totalAtRisk = useMemo(() => {
    if (!data) return 0;
    return data.levers.reduce((acc, l) => acc + l.moneyAtRiskArs, 0);
  }, [data]);

  return (
    <div
      className="relative w-full h-full overflow-y-auto"
      style={{
        background: "radial-gradient(ellipse at top, #0c1424 0%, #05060a 60%, #02030a 100%)",
      }}
    >
      {/* ── Animated grid backdrop ── */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(6,182,212,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.25) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          animation: "pixelGridShift 8s linear infinite",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 80%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at center, rgba(6,182,212,0.10) 0%, transparent 60%)",
        }}
      />

      <div className="relative max-w-6xl mx-auto px-6 lg:px-10 py-10">
        {/* ═══ HEADER ═══ */}
        <div
          className="flex items-center justify-between mb-8"
          style={{ animation: "pixelFadeUp 600ms ease-out both" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-2 h-2 rounded-full"
              style={{
                background: scoreColor,
                boxShadow: `0 0 12px ${scoreColor}E6`,
                animation: "pixelHeartbeat 1.6s ease-in-out infinite",
              }}
            />
            <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-cyan-300/80">
              NitroPixel · Calidad de Atribución
            </span>
          </div>
          <Link
            href="/nitropixel"
            className="text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-300/60 hover:text-cyan-200 transition flex items-center gap-2 px-3 py-1.5 rounded-lg border border-cyan-500/20 hover:border-cyan-400/40"
          >
            <span>←</span>
            Volver al Activo
          </Link>
        </div>

        {/* ═══ BANNER EXPLICATIVO (historical drag) ═══ */}
        {data?.historicalDragWarning && (
          <HistoricalDragBanner
            daysSinceFix={data.daysSinceFix}
            windowDays={data.windowDays}
            windowKey={data.window}
            onSwitchTo24h={() => setWindowKey("24h")}
          />
        )}

        {/* ═══ WINDOW SELECTOR ═══ */}
        <div
          className="flex items-center justify-center mb-6"
          style={{ animation: "pixelFadeUp 700ms ease-out both" }}
        >
          <WindowSelector value={windowKey} onChange={setWindowKey} />
        </div>

        {/* ═══ HERO SCORE ═══ */}
        <div
          className="relative flex flex-col items-center justify-center mb-12"
          style={{ animation: "pixelFadeUp 800ms ease-out both" }}
        >
          <ScoreGauge value={animScore} color={scoreColor} loading={loading} />

          <div className="text-center mt-2">
            <div
              className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.4em]"
              style={{ color: scoreColor, textShadow: `0 0 12px ${scoreColor}80` }}
            >
              <span
                className="w-1 h-1 rounded-full"
                style={{
                  background: scoreColor,
                  boxShadow: `0 0 6px ${scoreColor}`,
                  animation: "pixelHeartbeat 1.4s ease-in-out infinite",
                }}
              />
              <span>NITROSCORE</span>
              <span className="opacity-30">·</span>
              <span>{data?.scoreLabel ?? "Calculando…"}</span>
              {data?.windowLabel && (
                <>
                  <span className="opacity-30">·</span>
                  <span>{data.windowLabel}</span>
                </>
              )}
            </div>
            <div className="text-base lg:text-lg font-medium mt-2 tracking-wide text-cyan-50/80 max-w-xl">
              NitroPixel está capturando el {animScore}% del valor real de tu publicidad
            </div>

            {/* Trend delta */}
            {data && data.trendDelta !== null && (
              <div className="mt-3 inline-flex items-center gap-2 text-[11px] font-mono">
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full"
                  style={{
                    background:
                      data.trendDelta >= 0
                        ? "rgba(16,185,129,0.12)"
                        : "rgba(139,92,246,0.10)",
                    border:
                      data.trendDelta >= 0
                        ? "1px solid rgba(16,185,129,0.4)"
                        : "1px solid rgba(139,92,246,0.4)",
                    color: data.trendDelta >= 0 ? "#10b981" : "#a855f7",
                  }}
                >
                  <span>{data.trendDelta >= 0 ? "↑" : "↓"}</span>
                  <span>
                    {data.trendDelta >= 0 ? "+" : ""}
                    {data.trendDelta} pts vs período anterior
                  </span>
                </span>
              </div>
            )}

            {data && totalAtRisk > 0 && (
              <div className="text-xs text-cyan-300/50 font-mono mt-3">
                Subir al 100% desbloquea ~{formatARS(totalAtRisk)} de revenue atribuido
              </div>
            )}
          </div>
        </div>

        {/* ═══ HEADLINE STATS ═══ */}
        {data && (
          <div
            className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10"
            style={{ animation: "pixelFadeUp 900ms ease-out both" }}
          >
            <HeadlineCard
              label={`REVENUE ATRIBUIDO · ${data.window.toUpperCase()}`}
              value={formatARS(data.attributedRevenue)}
              accent="#06b6d4"
              sub="Modelo NITRO · multi-touch"
            />
            <HeadlineCard
              label={`COMPRAS RASTREADAS · ${data.window.toUpperCase()}`}
              value={new Intl.NumberFormat("es-AR").format(data.totalPurchases)}
              accent="#22d3ee"
              sub="Eventos PURCHASE de NitroPixel"
            />
            <HeadlineCard
              label="PALANCAS ACTIVAS"
              value={`${data.levers.filter((l) => l.status === "perfect").length}/${data.levers.length}`}
              accent="#8b5cf6"
              sub="En su mejor momento"
            />
          </div>
        )}

        {/* ═══ LEVER GRID ═══ */}
        <div className="mb-12" style={{ animation: "pixelFadeUp 1000ms ease-out both" }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[9px] font-mono uppercase tracking-[0.3em] text-cyan-300/70">
                LAS 5 PALANCAS
              </div>
              <div className="text-lg font-semibold text-white mt-1">
                Cada una suma a tu NitroScore
              </div>
            </div>
            <div className="text-[10px] font-mono text-cyan-300/50">
              Cliquéa para desbloquear →
            </div>
          </div>

          {loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl p-6 h-44"
                  style={{
                    background: "rgba(6,182,212,0.04)",
                    border: "1px solid rgba(6,182,212,0.18)",
                    animation: "pixelBreath 2.2s ease-in-out infinite",
                  }}
                />
              ))}
            </div>
          )}

          {error && (
            <div
              className="rounded-2xl p-6 text-cyan-100/70 text-sm font-mono"
              style={{
                background: "rgba(139,92,246,0.06)",
                border: "1px solid rgba(139,92,246,0.25)",
              }}
            >
              No pudimos calcular el score ahora mismo. NitroPixel sigue recibiendo eventos
              normalmente, esto solo afecta esta vista. Reintentando…
            </div>
          )}

          {data && !loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.levers.map((lever) => (
                <LeverCard key={lever.key} lever={lever} onUnlock={() => setActiveLever(lever)} />
              ))}
            </div>
          )}
        </div>

        {/* ═══ OPORTUNIDADES (feed del cron) ═══ */}
        {data && (
          <div
            className="rounded-2xl p-6 mb-10"
            style={{
              background: "rgba(139,92,246,0.04)",
              border: "1px solid rgba(139,92,246,0.18)",
              animation: "pixelFadeUp 1100ms ease-out both",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[9px] font-mono uppercase tracking-[0.3em] text-violet-300/70">
                  OPORTUNIDADES DETECTADAS
                </div>
                <div className="text-lg font-semibold text-white mt-1">
                  NitroPixel encontró estas mejoras esta semana
                </div>
              </div>
              <div className="text-[10px] font-mono text-violet-300/50">
                Auto-detectado · daily
              </div>
            </div>

            {data.opportunities.length === 0 ? (
              <div className="flex items-center gap-3 py-6">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
                  style={{
                    background: "linear-gradient(135deg, rgba(16,185,129,0.18), rgba(6,182,212,0.10))",
                    border: "1px solid rgba(16,185,129,0.4)",
                  }}
                >
                  🦄
                </div>
                <div>
                  <div className="text-sm font-medium text-emerald-200/90">
                    Todo en orden por ahora
                  </div>
                  <div className="text-xs text-emerald-300/50 font-mono mt-0.5">
                    NitroPixel está capturando todo lo que puede capturar
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {data.opportunities.map((op) => (
                  <OpportunityCard key={op.id} opportunity={op} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ FOOTNOTE ═══ */}
        {data && (
          <div className="text-[10px] font-mono text-cyan-300/30 text-center mb-8">
            Calculado {timeAgoEs(data.computedAt)} · Actualiza cada 60s
          </div>
        )}
      </div>

      {/* ═══ MODAL DESBLOQUEAR ═══ */}
      {activeLever && <UnlockModal lever={activeLever} onClose={() => setActiveLever(null)} />}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Window Selector — pills 24h / 7d / 30d
// ──────────────────────────────────────────────────────────────
function WindowSelector({
  value,
  onChange,
}: {
  value: WindowKey;
  onChange: (w: WindowKey) => void;
}) {
  const options: Array<{ key: WindowKey; label: string; sub: string }> = [
    { key: "24h", label: "24 H", sub: "post-fixes" },
    { key: "7d", label: "7 D", sub: "semanal" },
    { key: "30d", label: "30 D", sub: "mensual" },
  ];
  return (
    <div
      className="inline-flex items-center gap-1 p-1 rounded-2xl"
      style={{
        background: "rgba(6,182,212,0.05)",
        border: "1px solid rgba(6,182,212,0.20)",
        boxShadow: "inset 0 0 24px rgba(6,182,212,0.05)",
      }}
    >
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            className="relative px-5 py-2.5 rounded-xl transition-all"
            style={{
              background: active
                ? "linear-gradient(135deg, rgba(6,182,212,0.20), rgba(168,85,247,0.18))"
                : "transparent",
              border: active ? "1px solid rgba(6,182,212,0.45)" : "1px solid transparent",
              boxShadow: active ? "0 0 18px rgba(6,182,212,0.25)" : "none",
            }}
          >
            <div
              className="text-[11px] font-mono font-bold uppercase tracking-[0.25em]"
              style={{ color: active ? "#67e8f9" : "rgba(165,243,252,0.4)" }}
            >
              {opt.label}
            </div>
            <div
              className="text-[8px] font-mono uppercase tracking-[0.2em] mt-0.5"
              style={{ color: active ? "rgba(165,243,252,0.7)" : "rgba(165,243,252,0.25)" }}
            >
              {opt.sub}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Historical Drag Banner — explicación clara y honesta
// ──────────────────────────────────────────────────────────────
function HistoricalDragBanner({
  daysSinceFix,
  windowDays,
  windowKey,
  onSwitchTo24h,
}: {
  daysSinceFix: number;
  windowDays: number;
  windowKey: WindowKey;
  onSwitchTo24h: () => void;
}) {
  // Si ya está mirando 24h no mostramos banner
  if (windowKey === "24h") return null;

  const daysOfClean = Math.min(daysSinceFix, windowDays);
  const daysOfOld = Math.max(0, windowDays - daysOfClean);

  return (
    <div
      className="relative mb-6 rounded-2xl overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, rgba(168,85,247,0.10), rgba(6,182,212,0.06) 60%, rgba(16,185,129,0.06))",
        border: "1px solid rgba(168,85,247,0.35)",
        boxShadow: "0 0 32px rgba(168,85,247,0.12)",
        animation: "pixelFadeUp 650ms ease-out both",
      }}
    >
      {/* Shimmer accent */}
      <div
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(6,182,212,0.08) 50%, transparent 100%)",
          animation: "pixelShimmer 4s ease-in-out infinite",
        }}
      />
      <div className="relative p-5 lg:p-6 flex items-start gap-4">
        <div
          className="flex-none w-11 h-11 rounded-xl flex items-center justify-center text-xl"
          style={{
            background: "linear-gradient(135deg, rgba(168,85,247,0.25), rgba(6,182,212,0.15))",
            border: "1px solid rgba(168,85,247,0.5)",
            boxShadow: "0 0 16px rgba(168,85,247,0.35)",
          }}
        >
          💡
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[9px] font-mono uppercase tracking-[0.3em] text-violet-300/80 mb-1">
            POR QUÉ TU SCORE PUEDE VERSE BAJO HOY
          </div>
          <div className="text-sm lg:text-base font-semibold text-white leading-snug">
            Tu pixel está midiendo perfecto — el score histórico todavía arrastra data vieja
          </div>
          <div className="text-[12px] text-cyan-100/70 mt-2 leading-relaxed">
            Aplicamos mejoras importantes al pixel hace{" "}
            <strong className="text-white">
              {daysSinceFix === 0 ? "menos de 24 horas" : `${daysSinceFix} día${daysSinceFix === 1 ? "" : "s"}`}
            </strong>
            . Estás viendo la ventana de los <strong className="text-white">{windowDays} días</strong>,
            que mezcla{" "}
            <span style={{ color: "#a855f7" }}>{daysOfOld} días con data vieja</span> +{" "}
            <span style={{ color: "#10b981" }}>{daysOfClean} día{daysOfClean === 1 ? "" : "s"} con data limpia</span>.
            El número va a subir solo a medida que pasen los días.
          </div>
          <div className="text-[11px] text-cyan-200/60 mt-2 leading-relaxed">
            ¿Querés ver el score real de cómo está midiendo <strong className="text-white">ahora mismo</strong>?
            Cambiá a la ventana de 24 h.
          </div>
          <button
            onClick={onSwitchTo24h}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-mono uppercase tracking-[0.2em] transition-all hover:scale-[1.02]"
            style={{
              background: "linear-gradient(135deg, rgba(16,185,129,0.20), rgba(6,182,212,0.15))",
              border: "1px solid rgba(16,185,129,0.5)",
              color: "#6ee7b7",
              boxShadow: "0 0 14px rgba(16,185,129,0.25)",
            }}
          >
            Ver score real (24 h)
            <span>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Score Gauge — circular SVG con animación
// ──────────────────────────────────────────────────────────────
function ScoreGauge({ value, color, loading }: { value: number; color: string; loading: boolean }) {
  const size = 240;
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="50%" stopColor={color} />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
          <filter id="scoreGlow">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(6,182,212,0.10)"
          strokeWidth={stroke}
        />
        {/* Progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#scoreGrad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={loading ? circumference : offset}
          style={{
            transition: "stroke-dashoffset 1.6s cubic-bezier(0.22, 1, 0.36, 1)",
            transform: `rotate(-90deg)`,
            transformOrigin: "center",
            filter: "url(#scoreGlow)",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div
          className="text-6xl font-bold tabular-nums"
          style={{
            background: "linear-gradient(135deg, #06b6d4, #a855f7)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {value}
        </div>
        <div className="text-[9px] font-mono uppercase tracking-[0.3em] text-cyan-300/50 mt-1">
          DE 100
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Headline Card — top stats
// ──────────────────────────────────────────────────────────────
function HeadlineCard({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: string;
  accent: string;
  sub: string;
}) {
  return (
    <div
      className="relative p-5 rounded-2xl overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${accent}1A, rgba(139,92,246,0.04))`,
        border: `1px solid ${accent}4D`,
      }}
    >
      <div
        className="text-[9px] font-mono uppercase tracking-[0.3em] mb-2"
        style={{ color: `${accent}B3` }}
      >
        {label}
      </div>
      <div className="text-2xl font-bold text-white tabular-nums">{value}</div>
      <div className="text-[10px] font-mono mt-1.5" style={{ color: `${accent}80` }}>
        {sub}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Lever Card
// ──────────────────────────────────────────────────────────────
function LeverCard({ lever, onUnlock }: { lever: Lever; onUnlock: () => void }) {
  const color = statusToColor(lever.status);
  const animPct = useAnimatedNumber(lever.current, 1400);

  return (
    <div
      className="relative p-5 rounded-2xl overflow-hidden flex flex-col gap-3 transition-all hover:scale-[1.015] cursor-pointer"
      style={{
        background: `linear-gradient(135deg, ${color}10, rgba(139,92,246,0.04))`,
        border: `1px solid ${color}40`,
      }}
      onClick={onUnlock}
    >
      {/* Status pill */}
      <div className="flex items-center justify-between">
        <div
          className="text-[9px] font-mono uppercase tracking-[0.25em]"
          style={{ color: `${color}CC` }}
        >
          {lever.name}
        </div>
        <div
          className="text-[8px] font-mono uppercase tracking-[0.2em] px-2 py-0.5 rounded-full"
          style={{
            background: `${color}1A`,
            border: `1px solid ${color}40`,
            color: color,
          }}
        >
          {statusToLabel(lever.status)}
        </div>
      </div>

      {/* Big % + target */}
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-bold text-white tabular-nums">{animPct}%</span>
        <span className="text-[10px] font-mono text-cyan-300/40">/ {lever.target}% target</span>
      </div>

      {/* Mini bar */}
      <div className="h-1.5 rounded-full overflow-hidden bg-white/5 relative">
        <div
          className="h-full rounded-full transition-all duration-1000 ease-out"
          style={{
            width: `${Math.min(100, lever.current)}%`,
            background: `linear-gradient(90deg, ${color}, ${color}DD)`,
            boxShadow: `0 0 12px ${color}80`,
          }}
        />
      </div>

      {/* Description */}
      <div className="text-[11px] text-cyan-100/60 leading-snug">{lever.description}</div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-2">
        {lever.moneyAtRiskArs > 0 ? (
          <div className="text-[10px] font-mono" style={{ color: `${color}B3` }}>
            +{formatARS(lever.moneyAtRiskArs)} disponibles
          </div>
        ) : (
          <div className="text-[10px] font-mono text-emerald-300/70">Maximizado 🦄</div>
        )}
        <div
          className="text-[10px] font-mono uppercase tracking-[0.2em]"
          style={{ color: color }}
        >
          Desbloquear →
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Opportunity Card (cron insights)
// ──────────────────────────────────────────────────────────────
function OpportunityCard({ opportunity }: { opportunity: Opportunity }) {
  return (
    <div
      className="relative p-4 rounded-xl"
      style={{
        background: "rgba(139,92,246,0.06)",
        border: "1px solid rgba(139,92,246,0.25)",
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-violet-100">{opportunity.title}</div>
          <div className="text-[11px] text-violet-200/60 mt-1 leading-snug">
            {opportunity.description}
          </div>
          <div className="text-[10px] font-mono text-violet-300/50 mt-2">
            💡 {opportunity.action}
          </div>
        </div>
        <div className="text-[9px] font-mono text-violet-300/40 whitespace-nowrap">
          {timeAgoEs(opportunity.createdAt)}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Unlock Modal
// ──────────────────────────────────────────────────────────────
function UnlockModal({ lever, onClose }: { lever: Lever; onClose: () => void }) {
  const color = statusToColor(lever.status);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(2,3,10,0.85)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="relative max-w-lg w-full rounded-2xl p-7 max-h-[90vh] overflow-y-auto"
        style={{
          background: "linear-gradient(135deg, #0c1424, #05060a)",
          border: `1px solid ${color}66`,
          boxShadow: `0 0 60px ${color}40`,
          animation: "pixelFadeUp 400ms ease-out both",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-cyan-300/40 hover:text-cyan-200 text-xl leading-none"
        >
          ×
        </button>
        <div
          className="text-[9px] font-mono uppercase tracking-[0.3em] mb-1"
          style={{ color: `${color}CC` }}
        >
          DESBLOQUEAR · {lever.name}
        </div>
        <div className="text-xl font-semibold text-white mb-4">{lever.unlockTitle}</div>

        <div className="text-[12px] text-cyan-100/70 leading-relaxed mb-5">
          {lever.description}
        </div>

        {lever.moneyAtRiskArs > 0 && (
          <div
            className="rounded-xl p-3 mb-5 text-center"
            style={{
              background: `${color}14`,
              border: `1px solid ${color}40`,
            }}
          >
            <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-cyan-300/60">
              VALOR ESTIMADO POR DESBLOQUEAR
            </div>
            <div className="text-2xl font-bold mt-1" style={{ color }}>
              +{formatARS(lever.moneyAtRiskArs)}
            </div>
            <div className="text-[10px] font-mono text-cyan-300/40 mt-0.5">
              de revenue atribuido en los próximos 30 días
            </div>
          </div>
        )}

        <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-cyan-300/60 mb-3">
          PASOS PARA DESBLOQUEAR
        </div>
        <ol className="space-y-2.5">
          {lever.unlockSteps.map((step, i) => (
            <li key={i} className="flex gap-3 text-[12px] text-cyan-100/80 leading-snug">
              <span
                className="flex-none w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold mt-0.5"
                style={{
                  background: `${color}22`,
                  border: `1px solid ${color}66`,
                  color: color,
                }}
              >
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>

        <button
          onClick={onClose}
          className="w-full mt-6 py-3 rounded-xl text-[11px] font-mono uppercase tracking-[0.25em] transition-all hover:scale-[1.02]"
          style={{
            background: `linear-gradient(135deg, ${color}33, ${color}1A)`,
            border: `1px solid ${color}66`,
            color: color,
          }}
        >
          Entendido →
        </button>
      </div>
    </div>
  );
}
