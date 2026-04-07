"use client";

// ══════════════════════════════════════════════════════════════
// NitroPixel — Activo Digital Vivo
// ══════════════════════════════════════════════════════════════
// Hero experience que muestra el pixel como un activo digital
// que crece, se alimenta y aumenta su valor con el tiempo.
// Read-only — solo consume /api/nitropixel/asset-stats.
// ══════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

type AssetStats = {
  ok: boolean;
  asset: {
    totalEvents: number;
    totalVisitors: number;
    identifiedVisitors: number;
    eventsLast24h: number;
    eventsLast7d: number;
    attributedRevenue: number;
    daysAlive: number;
    level: number;
    stage: { key: string; name: string; tagline: string; index: number; total: number };
    estimatedAssetValueUsd: number;
    firstSeenAt: string | null;
  };
  last10Events: Array<{
    id: string;
    type: string;
    pageUrl: string | null;
    receivedAt: string;
    country: string | null;
    deviceType: string | null;
  }>;
  timeline: Array<{ day: string; count: number }>;
  topSources: Array<{ source: string; count: number }>;
};

const STAGES = [
  { key: "GENESIS", name: "Génesis", color: "#06b6d4", min: 0 },
  { key: "AWAKENING", name: "Awakening", color: "#22d3ee", min: 20 },
  { key: "SENTIENT", name: "Sentient", color: "#0ea5e9", min: 40 },
  { key: "EVOLVED", name: "Evolved", color: "#8b5cf6", min: 60 },
  { key: "SINGULARITY", name: "Singularity", color: "#a855f7", min: 80 },
];

function formatNumber(n: number): string {
  return new Intl.NumberFormat("es-AR").format(n);
}

function formatUSD(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatARS(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}

// ── Counter that animates from 0 to target ──
function useAnimatedCounter(target: number, duration = 1400): number {
  const [value, setValue] = useState(0);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);

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
  return Math.floor(value);
}

export default function NitroPixelPage() {
  const [data, setData] = useState<AssetStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // Fetch initial + refresh every 20s
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const r = await fetch("/api/nitropixel/asset-stats", { cache: "no-store" });
        const j = (await r.json()) as AssetStats;
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
    load();
    const id = setInterval(load, 20_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // Heartbeat global tick (cada segundo)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const events = data?.asset.totalEvents ?? 0;
  const visitors = data?.asset.totalVisitors ?? 0;
  const identified = data?.asset.identifiedVisitors ?? 0;
  const revenue = data?.asset.attributedRevenue ?? 0;
  const valueUsd = data?.asset.estimatedAssetValueUsd ?? 0;
  const level = data?.asset.level ?? 0;
  const daysAlive = data?.asset.daysAlive ?? 0;
  const stage = data?.asset.stage;

  const animEvents = useAnimatedCounter(events);
  const animVisitors = useAnimatedCounter(visitors);
  const animIdentified = useAnimatedCounter(identified);
  const animValue = useAnimatedCounter(valueUsd);
  const animLevel = useAnimatedCounter(level, 1800);

  const stageColor = useMemo(() => {
    if (!stage) return "#06b6d4";
    return STAGES[stage.index]?.color ?? "#06b6d4";
  }, [stage]);

  // Mini sparkline path
  const sparkline = useMemo(() => {
    if (!data?.timeline?.length) return "";
    const max = Math.max(1, ...data.timeline.map((d) => d.count));
    const W = 600;
    const H = 60;
    const step = W / (data.timeline.length - 1 || 1);
    return data.timeline
      .map((d, i) => {
        const x = i * step;
        const y = H - (d.count / max) * H;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [data]);

  return (
    <div
      className="relative w-full h-full overflow-y-auto"
      style={{
        background:
          "radial-gradient(ellipse at top, #0c1424 0%, #05060a 60%, #02030a 100%)",
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

      {/* ── Vignette glow ── */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(6,182,212,0.10) 0%, transparent 60%)",
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
                background: "#06b6d4",
                boxShadow: "0 0 12px rgba(6,182,212,0.9)",
                animation: "pixelHeartbeat 1.6s ease-in-out infinite",
              }}
            />
            <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-cyan-300/80">
              NitroPixel · Activo Vivo
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/pixel/journeys"
              className="text-[10px] font-mono uppercase tracking-[0.2em] text-violet-300/70 hover:text-violet-200 transition flex items-center gap-2 px-3 py-1.5 rounded-lg border border-violet-500/30 hover:border-violet-400/60"
              style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.10), rgba(6,182,212,0.04))" }}
            >
              <span>◇</span>
              Customer Journeys
              <span>→</span>
            </Link>
            <Link
              href="/pixel"
              className="text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-300/60 hover:text-cyan-200 transition flex items-center gap-2 px-3 py-1.5 rounded-lg border border-cyan-500/20 hover:border-cyan-400/40"
            >
              Analytics detallado
              <span>→</span>
            </Link>
          </div>
        </div>

        {/* ═══ HERO PIXEL BRAIN ═══ */}
        <div
          className="relative flex flex-col items-center justify-center mb-12"
          style={{ animation: "pixelFadeUp 800ms ease-out both" }}
        >
          <PixelBrain
            level={level}
            stage={stage?.key ?? "GENESIS"}
            color={stageColor}
            heartbeat={tick}
          />

          {/* Stage label */}
          <div className="text-center mt-2">
            <div
              className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.4em]"
              style={{ color: stageColor, textShadow: `0 0 12px ${stageColor}80` }}
            >
              <span
                className="w-1 h-1 rounded-full"
                style={{ background: stageColor, boxShadow: `0 0 6px ${stageColor}`, animation: "pixelHeartbeat 1.4s ease-in-out infinite" }}
              />
              <span>STAGE</span>
              <span className="opacity-30">·</span>
              <span>{stage?.key ?? "GENESIS"}</span>
              <span className="opacity-30">·</span>
              <span style={{ animation: "pixelBreath 2.8s ease-in-out infinite" }}>EVOLVING</span>
            </div>
            <div
              className="text-base lg:text-lg font-medium mt-2 tracking-wide text-cyan-50/80"
            >
              {stage?.tagline ?? "El núcleo despierta"}
            </div>
            <div className="flex items-center justify-center gap-2 mt-3">
              <span className="text-[9px] font-mono uppercase tracking-[0.3em] text-cyan-300/40">
                Próxima evolución
              </span>
              <span className="text-[9px] font-mono text-cyan-300/60">
                {stage?.key === "SINGULARITY" ? "∞ infinita" : "en proceso →"}
              </span>
            </div>
          </div>
        </div>

        {/* ═══ DUAL VALUATION ═══ */}
        <div
          className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10"
          style={{ animation: "pixelFadeUp 900ms ease-out both" }}
        >
          {/* Plata */}
          <div
            className="relative p-6 rounded-2xl overflow-hidden"
            style={{
              background:
                "linear-gradient(135deg, rgba(6,182,212,0.10), rgba(139,92,246,0.04))",
              border: "1px solid rgba(6,182,212,0.30)",
              animation: "pixelGlow 4s ease-in-out infinite",
            }}
          >
            <div className="text-[9px] font-mono uppercase tracking-[0.3em] text-cyan-300/70 mb-2">
              VALORACIÓN ESTIMADA
            </div>
            <div
              className="text-4xl lg:text-5xl font-bold"
              style={{
                background: "linear-gradient(135deg, #06b6d4, #a855f7)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              {formatUSD(animValue)}
            </div>
            <div className="text-xs text-cyan-100/40 font-mono mt-2">
              First-party data + revenue atribuido + comportamiento
            </div>
          </div>

          {/* Nivel */}
          <div
            className="relative p-6 rounded-2xl overflow-hidden"
            style={{
              background:
                "linear-gradient(135deg, rgba(139,92,246,0.10), rgba(6,182,212,0.04))",
              border: "1px solid rgba(139,92,246,0.30)",
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-[9px] font-mono uppercase tracking-[0.3em] text-violet-300/70">
                NIVEL DEL ACTIVO
              </div>
              <div
                className="flex items-center gap-1.5 text-[8px] font-mono uppercase tracking-[0.25em] text-violet-300/60"
              >
                <span
                  className="w-1 h-1 rounded-full bg-violet-300"
                  style={{ boxShadow: "0 0 6px rgba(167,139,250,0.9)", animation: "pixelHeartbeat 1.4s ease-in-out infinite" }}
                />
                <span style={{ animation: "pixelBreath 2.6s ease-in-out infinite" }}>EVOLVING</span>
                <span className="text-base leading-none -mt-0.5">∞</span>
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl lg:text-5xl font-bold text-white tabular-nums">
                {animLevel}
              </span>
              <span className="text-xs font-mono text-violet-300/50 mb-1">XP</span>
            </div>
            {/* Level bar — siempre activa con shimmer continuo, nunca "tope" visual */}
            <div className="mt-3 h-1.5 rounded-full overflow-hidden bg-white/5 relative">
              <div
                className="h-full rounded-full transition-all duration-1000 ease-out relative"
                style={{
                  width: `${Math.max(8, level)}%`,
                  background: `linear-gradient(90deg, #06b6d4, #8b5cf6, #a855f7)`,
                  boxShadow: "0 0 12px rgba(139,92,246,0.6)",
                }}
              >
                {/* shimmer perpetuo: hace ver que sigue creciendo aunque visualmente este al tope */}
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)",
                    animation: "pixelShimmer 2.4s linear infinite",
                  }}
                />
              </div>
            </div>
            <div className="text-xs text-violet-100/40 font-mono mt-2">
              Cada evento, cada identificación, cada conversión lo hace más inteligente.
            </div>
          </div>
        </div>

        {/* ═══ LIVE COUNTERS ═══ */}
        <div
          className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10"
          style={{ animation: "pixelFadeUp 1000ms ease-out both" }}
        >
          <Counter label="Eventos totales" value={formatNumber(animEvents)} accent="#06b6d4" sub={`+${formatNumber(data?.asset.eventsLast24h ?? 0)} en 24h`} />
          <Counter label="Visitantes" value={formatNumber(animVisitors)} accent="#22d3ee" sub={`${formatNumber(data?.asset.eventsLast7d ?? 0)} eventos · 7d`} />
          <Counter label="Identificados" value={formatNumber(animIdentified)} accent="#8b5cf6" sub={`${visitors > 0 ? Math.round((identified / visitors) * 100) : 0}% del total`} />
          <Counter label="Días vivo" value={String(daysAlive)} accent="#a855f7" sub={`Revenue: ${formatARS(revenue)}`} />
        </div>

        {/* ═══ TIMELINE SPARKLINE ═══ */}
        <div
          className="rounded-2xl p-6 mb-10"
          style={{
            background: "rgba(6,182,212,0.04)",
            border: "1px solid rgba(6,182,212,0.18)",
            animation: "pixelFadeUp 1100ms ease-out both",
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[9px] font-mono uppercase tracking-[0.3em] text-cyan-300/70">
                CRECIMIENTO · 30 DÍAS
              </div>
              <div className="text-lg font-semibold text-white mt-1">
                Eventos capturados día a día
              </div>
            </div>
            <div className="text-[10px] font-mono text-cyan-300/50">
              Auto-refresh 20s
            </div>
          </div>
          {sparkline ? (
            <svg viewBox="0 0 600 60" className="w-full h-16">
              <defs>
                <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={`${sparkline} L 600 60 L 0 60 Z`} fill="url(#sparkGrad)" />
              <path d={sparkline} fill="none" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 6px rgba(6,182,212,0.7))" }} />
            </svg>
          ) : (
            <div className="text-cyan-300/40 text-sm font-mono">Esperando datos…</div>
          )}
        </div>

        {/* ═══ LIVE EVENT FEED + TOP SOURCES ═══ */}
        <div
          className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-10"
          style={{ animation: "pixelFadeUp 1200ms ease-out both" }}
        >
          {/* Live feed */}
          <div
            className="lg:col-span-2 rounded-2xl p-5"
            style={{
              background: "rgba(6,182,212,0.04)",
              border: "1px solid rgba(6,182,212,0.18)",
            }}
          >
            <div className="flex items-center gap-2 mb-4">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: "#22c55e",
                  boxShadow: "0 0 8px #22c55e",
                  animation: "pixelHeartbeat 1.6s ease-in-out infinite",
                }}
              />
              <div className="text-[9px] font-mono uppercase tracking-[0.3em] text-cyan-300/70">
                STREAM EN VIVO
              </div>
            </div>
            <div className="space-y-2">
              {data?.last10Events?.length ? (
                data.last10Events.map((e, i) => (
                  <div
                    key={e.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs"
                    style={{
                      background: "rgba(6,182,212,0.04)",
                      border: "1px solid rgba(6,182,212,0.10)",
                      animation: `pixelFadeUp 500ms ease-out ${i * 50}ms both`,
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: "#06b6d4", boxShadow: "0 0 6px #06b6d4" }}
                    />
                    <span className="font-mono text-cyan-300 font-semibold uppercase text-[10px] tracking-wider w-24 truncate">
                      {e.type}
                    </span>
                    <span className="text-cyan-100/50 font-mono text-[10px] flex-1 truncate">
                      {e.pageUrl ?? "—"}
                    </span>
                    <span className="text-cyan-100/30 font-mono text-[10px]">
                      {e.country ?? "··"}
                    </span>
                    <span className="text-cyan-200/40 font-mono text-[10px] w-10 text-right">
                      {timeAgo(e.receivedAt)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-cyan-300/40 text-xs font-mono py-6 text-center">
                  Esperando primer evento…
                </div>
              )}
            </div>
          </div>

          {/* Top sources */}
          <div
            className="rounded-2xl p-5"
            style={{
              background: "rgba(139,92,246,0.04)",
              border: "1px solid rgba(139,92,246,0.18)",
            }}
          >
            <div className="text-[9px] font-mono uppercase tracking-[0.3em] text-violet-300/70 mb-4">
              FUENTES · 7 DÍAS
            </div>
            <div className="space-y-2">
              {data?.topSources?.length ? (
                (() => {
                  const total = data.topSources.reduce((s, x) => s + x.count, 0) || 1;
                  return data.topSources.map((s, i) => {
                    const pct = (s.count / total) * 100;
                    return (
                      <div key={s.source + i}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-violet-100/80 font-mono truncate max-w-[140px]">
                            {s.source}
                          </span>
                          <span className="text-[10px] text-violet-100/40 font-mono">
                            {formatNumber(s.count)}
                          </span>
                        </div>
                        <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              background: `linear-gradient(90deg, #06b6d4, #8b5cf6)`,
                              boxShadow: "0 0 6px rgba(139,92,246,0.5)",
                            }}
                          />
                        </div>
                      </div>
                    );
                  });
                })()
              ) : (
                <div className="text-violet-300/40 text-xs font-mono">Sin datos aún</div>
              )}
            </div>
          </div>
        </div>

        {/* ═══ EMOTIONAL FOOTER ═══ */}
        <div
          className="text-center py-8"
          style={{ animation: "pixelFadeUp 1300ms ease-out both" }}
        >
          <div
            className="inline-block px-5 py-3 rounded-xl"
            style={{
              background: "rgba(6,182,212,0.06)",
              border: "1px solid rgba(6,182,212,0.20)",
            }}
          >
            <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-cyan-300/60 mb-1">
              Tu pixel lleva
            </div>
            <div className="text-2xl font-bold text-white">
              {daysAlive} {daysAlive === 1 ? "día" : "días"} vivo
            </div>
            <div className="text-xs text-cyan-100/50 font-mono mt-1">
              Cada evento lo hace más fuerte. Cada conversión, más valioso.
            </div>
          </div>
        </div>

        {error && (
          <div className="text-center text-xs text-red-400/70 font-mono mt-4">
            ⚠ {error}
          </div>
        )}
        {loading && !data && (
          <div className="text-center text-xs text-cyan-300/40 font-mono mt-4">
            Cargando activo…
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// PixelBrain — Híbrido data+arte
// ──────────────────────────────────────────────────────────────
// Núcleo con orbits SVG, neuronas pulsantes, sinapsis animadas.
// Crece visualmente con el nivel.
// ══════════════════════════════════════════════════════════════
function PixelBrain({
  level,
  color,
  heartbeat,
}: {
  level: number;
  stage: string;
  color: string;
  heartbeat: number;
}) {
  // Neuronas distribuidas en círculo
  const neurons = useMemo(() => {
    const count = 8 + Math.floor(level / 10); // 8 a 18 neuronas
    const arr = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const radius = 90 + (i % 3) * 10;
      arr.push({
        id: i,
        x: 150 + Math.cos(angle) * radius,
        y: 150 + Math.sin(angle) * radius,
        delay: (i * 120) % 2000,
      });
    }
    return arr;
  }, [level]);

  // Sinapsis: líneas entre neurona i y la siguiente
  const synapses = useMemo(() => {
    const arr: Array<{ x1: number; y1: number; x2: number; y2: number; delay: number }> = [];
    for (let i = 0; i < neurons.length; i++) {
      const a = neurons[i];
      const b = neurons[(i + 2) % neurons.length];
      arr.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, delay: i * 200 });
    }
    return arr;
  }, [neurons]);

  const coreScale = 1 + (level / 100) * 0.4;
  const pulse = heartbeat % 2 === 0 ? 1 : 1.04;

  return (
    <div className="relative" style={{ width: 320, height: 320 }}>
      <svg viewBox="0 0 300 300" className="absolute inset-0 w-full h-full">
        <defs>
          <radialGradient id="coreGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#a5f3fc" stopOpacity="1" />
            <stop offset="35%" stopColor={color} stopOpacity="0.95" />
            <stop offset="70%" stopColor="#0891b2" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#0c1424" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="haloGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={color} stopOpacity="0" />
            <stop offset="60%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </radialGradient>
          <filter id="blur1">
            <feGaussianBlur stdDeviation="2" />
          </filter>
        </defs>

        {/* Halo glow */}
        <circle cx="150" cy="150" r="140" fill="url(#haloGrad)" />

        {/* Outer orbit (counter-clockwise) */}
        <g style={{ transformOrigin: "150px 150px", animation: "pixelOrbitReverse 28s linear infinite" }}>
          <circle cx="150" cy="150" r="120" fill="none" stroke={color} strokeOpacity="0.18" strokeWidth="0.8" strokeDasharray="3 6" />
          <circle cx="270" cy="150" r="2" fill={color} style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
        </g>

        {/* Mid orbit (clockwise) */}
        <g style={{ transformOrigin: "150px 150px", animation: "pixelOrbit 18s linear infinite" }}>
          <circle cx="150" cy="150" r="100" fill="none" stroke="#8b5cf6" strokeOpacity="0.25" strokeWidth="0.8" strokeDasharray="2 5" />
          <circle cx="50" cy="150" r="2" fill="#a855f7" style={{ filter: `drop-shadow(0 0 4px #a855f7)` }} />
        </g>

        {/* Sinapsis lines */}
        {synapses.map((s, i) => (
          <line
            key={i}
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            stroke={color}
            strokeOpacity="0.35"
            strokeWidth="0.6"
            strokeDasharray="100"
            style={{
              animation: `pixelSynapseFlow 3s ease-in-out infinite ${s.delay}ms`,
            }}
          />
        ))}

        {/* Neurons */}
        {neurons.map((n) => (
          <circle
            key={n.id}
            cx={n.x}
            cy={n.y}
            r="2.5"
            fill={color}
            style={{
              transformOrigin: `${n.x}px ${n.y}px`,
              animation: `pixelNeuronPulse 2.4s ease-in-out infinite ${n.delay}ms`,
              filter: `drop-shadow(0 0 4px ${color})`,
            }}
          />
        ))}

        {/* Core */}
        <g
          style={{
            transformOrigin: "150px 150px",
            transform: `scale(${(coreScale * pulse).toFixed(3)})`,
            transition: "transform 400ms ease-out",
          }}
        >
          <circle cx="150" cy="150" r="55" fill="url(#coreGrad)" filter="url(#blur1)" />
          <circle cx="150" cy="150" r="32" fill="#a5f3fc" opacity="0.85" />
          <circle cx="150" cy="150" r="20" fill="#ffffff" opacity="0.9" />
        </g>
      </svg>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Counter Card
// ══════════════════════════════════════════════════════════════
function Counter({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent: string;
}) {
  return (
    <div
      className="relative rounded-xl p-4 overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${accent}10, rgba(255,255,255,0.01))`,
        border: `1px solid ${accent}30`,
      }}
    >
      <div
        className="absolute top-0 left-2 right-2 h-[1px] opacity-50"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
      />
      <div className="text-[9px] font-mono uppercase tracking-[0.25em]" style={{ color: `${accent}cc` }}>
        {label}
      </div>
      <div className="text-2xl lg:text-3xl font-bold text-white tabular-nums mt-1">
        {value}
      </div>
      <div className="text-[10px] font-mono mt-1" style={{ color: `${accent}80` }}>
        {sub}
      </div>
    </div>
  );
}
