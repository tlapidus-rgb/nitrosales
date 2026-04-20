// @ts-nocheck
"use client";

/**
 * /mercadolibre/reputacion — Premium upgrade (Fase 9)
 * ─────────────────────────────────────────────────────────────
 * Read-only sobre data importada desde MELI (NUNCA toca producción).
 * Premium look + termómetro animado + distancia a próximo nivel +
 * performance bars con threshold marker + gráfico histórico premium.
 */

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Award, TrendingUp, AlertTriangle, Clock, ShieldCheck,
  ThumbsUp, ThumbsDown, Minus, ArrowLeft, Loader2, Activity, Target,
} from "lucide-react";

const ML_GRADIENT = "linear-gradient(135deg, #fbbf24, #f97316)";
const ML_PRIMARY = "#f59e0b";

interface ReputacionData {
  current: {
    level: string; levelLabel: string; levelColor: string; powerSeller: boolean;
    totalSales: number; completedSales: number; cancelledSales: number;
    claimsRate: number; delayedRate: number; cancellationRate: number;
    positiveRatings: number; negativeRatings: number; neutralRatings: number;
    totalRatings: number; positiveRate: string; date: string;
    thresholds: {
      claims: { percentage: number | null; fixed: number | null } | null;
      delayed: { percentage: number | null; fixed: number | null } | null;
      cancellations: { percentage: number | null; fixed: number | null } | null;
    } | null;
    thresholdsError: string | null;
  } | null;
  history: Array<{
    date: string; level: string; totalSales: number;
    claimsRate: number; delayedRate: number; cancellationRate: number;
    positiveRatings: number; negativeRatings: number; neutralRatings: number;
  }>;
}

const LEVELS = [
  { level: "1_red", color: "#ef4444", label: "Malo" },
  { level: "2_orange", color: "#f97316", label: "Regular" },
  { level: "3_yellow", color: "#f59e0b", label: "Bueno" },
  { level: "4_light_green", color: "#34d399", label: "Muy bueno" },
  { level: "5_green", color: "#10b981", label: "Excelente" },
];

export default function ReputacionPage() {
  const [data, setData] = useState<ReputacionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(90);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/mercadolibre/reputacion?days=${days}`)
      .then((r) => r.json())
      .then(setData)
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [days]);

  const nextLevelInfo = useMemo(() => {
    if (!data?.current) return null;
    const idx = LEVELS.findIndex((l) => l.level === data.current.level);
    if (idx === -1 || idx === LEVELS.length - 1) return null;
    const next = LEVELS[idx + 1];
    return { next, currentIdx: idx };
  }, [data]);

  if (loading && !data) return <PageShell><LoadingState text="Cargando reputación…" /></PageShell>;
  if (!data || !data.current) return (
    <PageShell>
      <Breadcrumb />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 80, color: "#94a3b8" }}>
        <Award size={36} style={{ marginBottom: 12, color: "#cbd5e1" }} />
        <div style={{ fontSize: 14 }}>Sin datos de reputación. Sincronizá MELI desde el dashboard.</div>
      </div>
    </PageShell>
  );

  const { current } = data;
  const completionRate = current.totalSales > 0 ? ((current.completedSales / current.totalSales) * 100).toFixed(1) : "0";

  return (
    <PageShell>
      <Breadcrumb />

      <HeroHeader title="Reputación" subtitle="Métricas oficiales de tu seller según MercadoLibre" Icon={Award} />

      {/* LEVEL BANNER PREMIUM */}
      <div
        style={{
          background: "white", borderRadius: 16, border: "1px solid rgba(15,23,42,.05)",
          padding: 24, marginBottom: 16, position: "relative", overflow: "hidden",
          boxShadow: "0 1px 3px rgba(15,23,42,.02), 0 4px 14px rgba(15,23,42,.03)",
        }}
      >
        {/* Accent bar lateral grande */}
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 5, background: current.levelColor }} />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 28, alignItems: "center", paddingLeft: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 64, height: 64, borderRadius: 16,
                background: `${current.levelColor}12`,
                color: current.levelColor,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Award size={32} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>
                Nivel actual
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: current.levelColor, letterSpacing: "-0.02em", lineHeight: 1 }}>
                {current.levelLabel}
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
                {current.powerSeller && (
                  <span style={{ marginRight: 8, padding: "2px 8px", background: ML_GRADIENT, color: "white", fontSize: 10, fontWeight: 700, borderRadius: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    ⚡ MercadoLíder
                  </span>
                )}
                {current.totalSales.toLocaleString("es-AR")} ventas totales
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 24, marginLeft: "auto", flexWrap: "wrap", alignItems: "center" }}>
            <RatingBlock Icon={ThumbsUp} value={current.positiveRatings} label={`Positivas · ${current.positiveRate}%`} tone="#10b981" />
            <RatingBlock Icon={Minus} value={current.neutralRatings} label="Neutras" tone="#94a3b8" />
            <RatingBlock Icon={ThumbsDown} value={current.negativeRatings} label="Negativas" tone="#ef4444" />
          </div>
        </div>
      </div>

      {/* DISTANCIA A PRÓXIMO NIVEL — banner motivacional */}
      {nextLevelInfo && (
        <div
          style={{
            background: `linear-gradient(135deg, ${nextLevelInfo.next.color}08, ${nextLevelInfo.next.color}03)`,
            border: `1px solid ${nextLevelInfo.next.color}25`,
            borderRadius: 12, padding: "14px 18px", marginBottom: 24,
            display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
          }}
        >
          <div
            style={{
              width: 38, height: 38, borderRadius: 10,
              background: nextLevelInfo.next.color, color: "white",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Target size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: nextLevelInfo.next.color, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>
              Próximo nivel
            </div>
            <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
              Para subir a <b style={{ color: nextLevelInfo.next.color }}>{nextLevelInfo.next.label}</b> tenés que mantener tasa de reclamos baja, envíos a tiempo y completar más ventas. Mantené el ritmo y revisá las métricas debajo para identificar qué mejorar primero.
            </div>
          </div>
        </div>
      )}

      {/* MÉTRICAS PRINCIPALES */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
        <KpiPremium label="Ventas completadas" value={current.completedSales.toLocaleString("es-AR")} sub={`${completionRate}% completion`} tone="#10b981" Icon={ShieldCheck} />
        <KpiPremium label="Ventas totales" value={current.totalSales.toLocaleString("es-AR")} sub="histórico del seller" tone="#3b82f6" Icon={TrendingUp} />
        <KpiPremium label="Canceladas" value={current.cancelledSales.toLocaleString("es-AR")} sub="del histórico" tone="#f59e0b" Icon={AlertTriangle} />
        <KpiPremium label="Tasa reclamos" value={current.claimsRate != null ? `${(current.claimsRate * 100).toFixed(2)}%` : "—"} sub={current.claimsRate < 0.02 ? "saludable" : "atender"} tone={current.claimsRate < 0.02 ? "#10b981" : "#ef4444"} Icon={AlertTriangle} />
        <KpiPremium label="Envíos tardíos" value={current.delayedRate != null ? `${(current.delayedRate * 100).toFixed(2)}%` : "—"} sub={current.delayedRate < 0.06 ? "saludable" : "atender"} tone={current.delayedRate < 0.06 ? "#10b981" : "#f59e0b"} Icon={Clock} />
        <KpiPremium label="Cancelaciones" value={current.cancellationRate != null ? `${(current.cancellationRate * 100).toFixed(2)}%` : "—"} sub={current.cancellationRate < 0.02 ? "saludable" : "atender"} tone={current.cancellationRate < 0.02 ? "#10b981" : "#ef4444"} Icon={AlertTriangle} />
      </div>

      {/* TERMÓMETRO PREMIUM */}
      <div
        style={{
          background: "white", borderRadius: 14, border: "1px solid rgba(15,23,42,.05)",
          padding: 22, marginBottom: 16,
          boxShadow: "0 1px 3px rgba(15,23,42,.02), 0 4px 14px rgba(15,23,42,.03)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: `${ML_PRIMARY}12`, color: ML_PRIMARY, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <Activity size={14} />
          </div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.01em", margin: 0 }}>
            Termómetro de reputación MercadoLibre
          </h2>
        </div>

        <div style={{ display: "flex", gap: 4, height: 40, borderRadius: 12, overflow: "hidden", position: "relative" }}>
          {LEVELS.map((seg) => {
            const isCurrent = current.level === seg.level;
            return (
              <div
                key={seg.level}
                style={{
                  flex: 1, position: "relative",
                  background: isCurrent ? seg.color : `${seg.color}25`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.4s cubic-bezier(0.16,1,0.3,1)",
                  boxShadow: isCurrent ? `0 4px 14px ${seg.color}40` : "none",
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: isCurrent ? "white" : "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {seg.label}
                </span>
                {isCurrent && (
                  <div style={{ position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "7px solid transparent", borderRight: "7px solid transparent", borderTop: "8px solid #0f172a" }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* PERFORMANCE BARS premium con thresholds REALES desde MELI live */}
      <div
        style={{
          background: "white", borderRadius: 14, border: "1px solid rgba(15,23,42,.05)",
          padding: 22, marginBottom: 16,
          boxShadow: "0 1px 3px rgba(15,23,42,.02), 0 4px 14px rgba(15,23,42,.03)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(99,102,241,.12)", color: "#6366f1", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <Target size={14} />
            </div>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.01em", margin: 0 }}>
              Performance vs umbrales actuales de MELI
            </h2>
          </div>
          {current.thresholds && !current.thresholdsError && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", background: "rgba(16,185,129,.08)", borderRadius: 999, fontSize: 10, fontWeight: 700, color: "#059669", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              <span style={{ width: 5, height: 5, borderRadius: 999, background: "#10b981" }} />
              Live · MELI
            </span>
          )}
          {current.thresholdsError && (
            <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600 }}>
              Umbrales no disponibles ahora
            </span>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {(() => {
            const t = current.thresholds;
            const items = [
              {
                label: "Reclamos",
                value: current.claimsRate ? current.claimsRate * 100 : 0,
                thresholdPct: t?.claims?.percentage != null ? t.claims.percentage * 100 : null,
              },
              {
                label: "Envíos tardíos",
                value: current.delayedRate ? current.delayedRate * 100 : 0,
                thresholdPct: t?.delayed?.percentage != null ? t.delayed.percentage * 100 : null,
              },
              {
                label: "Cancelaciones",
                value: current.cancellationRate ? current.cancellationRate * 100 : 0,
                thresholdPct: t?.cancellations?.percentage != null ? t.cancellations.percentage * 100 : null,
              },
            ];
            return items.map((m) => {
              const hasThreshold = m.thresholdPct != null;
              const isGood = hasThreshold ? m.value < (m.thresholdPct as number) : true;
              const tone = !hasThreshold ? "#94a3b8" : isGood ? "#10b981" : "#ef4444";
              // El bar va de 0 a 2x threshold (o, si no hay threshold, de 0 a max(value, 1))
              const range = hasThreshold ? (m.thresholdPct as number) * 2 : Math.max(m.value, 1);
              const pct = Math.min((m.value / range) * 100, 100);
              const thresholdPos = hasThreshold ? ((m.thresholdPct as number) / range) * 100 : null;
              return (
                <div key={m.label}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>{m.label}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: tone, fontVariantNumeric: "tabular-nums" }}>
                        {m.value.toFixed(2)}%
                      </span>
                      <span style={{ fontSize: 10, color: "#94a3b8", fontVariantNumeric: "tabular-nums" }}>
                        {hasThreshold ? `umbral ${(m.thresholdPct as number).toFixed(2)}%` : "umbral —"}
                      </span>
                    </div>
                  </div>
                  <div style={{ position: "relative", width: "100%", background: "#f1f5f9", borderRadius: 999, height: 8, overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%", borderRadius: 999, width: `${pct}%`,
                        background: tone,
                        transition: "width 0.5s cubic-bezier(0.16,1,0.3,1)",
                        boxShadow: `0 0 8px ${tone}40`,
                      }}
                    />
                  </div>
                  <div style={{ position: "relative", height: 6 }}>
                    {thresholdPos != null && (
                      <div
                        style={{
                          position: "absolute", top: -2,
                          left: `${thresholdPos}%`,
                          transform: "translateX(-50%)",
                          width: 0, height: 0,
                          borderLeft: "4px solid transparent",
                          borderRight: "4px solid transparent",
                          borderTop: "4px solid #94a3b8",
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            });
          })()}
        </div>
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 10, lineHeight: 1.5 }}>
          {current.thresholdsError
            ? `⚠ Los umbrales reales no se pudieron traer ahora (${current.thresholdsError}). Solo se muestran los valores actuales del seller.`
            : "▼ Umbrales oficiales de MELI traídos en vivo en cada carga. Si tu valor supera el umbral te bajan de nivel."}
        </div>
      </div>

      {/* HISTORY CHART o NOTE */}
      {data.history.length > 1 ? (
        <div
          style={{
            background: "white", borderRadius: 14, border: "1px solid rgba(15,23,42,.05)",
            padding: 22, marginBottom: 16,
            boxShadow: "0 1px 3px rgba(15,23,42,.02), 0 4px 14px rgba(15,23,42,.03)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(99,102,241,.12)", color: "#6366f1", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <TrendingUp size={14} />
            </div>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.01em", margin: 0 }}>
              Evolución histórica de ventas
            </h2>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data.history}>
              <defs>
                <linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => { try { return new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "short" }); } catch { return d; } }}
                tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false}
              />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={50} />
              <Tooltip contentStyle={{ borderRadius: "10px", border: "1px solid #e2e8f0", fontSize: "12px", boxShadow: "0 4px 14px rgba(15,23,42,.08)" }} />
              <Area type="monotone" dataKey="totalSales" stroke="#6366f1" strokeWidth={2.5} fill="url(#histGrad)" name="Ventas acumuladas" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div
          style={{
            background: "rgba(245,158,11,.06)",
            border: "1px solid rgba(245,158,11,.25)",
            borderRadius: 12, padding: "14px 18px", marginBottom: 16,
            display: "flex", alignItems: "center", gap: 12,
          }}
        >
          <div
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: ML_PRIMARY, color: "white",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Activity size={15} />
          </div>
          <div style={{ fontSize: 12, color: "#92400e", lineHeight: 1.5 }}>
            <b>Histórico en construcción.</b> Los gráficos de evolución se van a poblar a medida que MELI sincronice datos diariamente. Por ahora mostramos el snapshot actual.
          </div>
        </div>
      )}

      <SharedStyles />
    </PageShell>
  );
}

// ════════════════════════════════════════════════════════════════
// Subcomponents
// ════════════════════════════════════════════════════════════════

function RatingBlock({ Icon, value, label, tone }: { Icon: any; value: number; label: string; tone: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Icon size={15} style={{ color: tone }} />
        <span style={{ fontSize: 22, fontWeight: 700, color: tone, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
          {value.toLocaleString("es-AR")}
        </span>
      </div>
      <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
    </div>
  );
}

function KpiPremium({ label, value, sub, tone, Icon }: { label: string; value: string; sub?: string; tone: string; Icon: any }) {
  return (
    <div
      style={{
        padding: "20px 22px",
        background: "white",
        borderRadius: 14,
        border: "1px solid rgba(15,23,42,.05)",
        boxShadow: "0 1px 3px rgba(15,23,42,.02), 0 4px 14px rgba(15,23,42,.03)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${tone}, ${tone}40)` }} />
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em", lineHeight: 1 }}>
            {value}
          </div>
          {sub && <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>{sub}</div>}
        </div>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: `${tone}12`, color: tone, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={15} />
        </div>
      </div>
    </div>
  );
}

function HeroHeader({ title, subtitle, Icon }: { title: string; subtitle: string; Icon: any }) {
  return (
    <div
      style={{
        background: "white", borderRadius: 18, border: "1px solid rgba(15,23,42,.05)",
        padding: "26px 30px", marginBottom: 24,
        boxShadow: "0 1px 3px rgba(15,23,42,.02), 0 8px 24px rgba(15,23,42,.04)",
        display: "flex", alignItems: "center", gap: 18,
      }}
    >
      <div
        style={{
          width: 56, height: 56, borderRadius: 14,
          background: ML_GRADIENT, color: "white",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
          boxShadow: "0 6px 20px rgba(245,158,11,.35)",
        }}
      >
        <Icon size={26} />
      </div>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", color: "#0f172a", margin: 0, marginBottom: 4 }}>{title}</h1>
        <div style={{ fontSize: 13, color: "#64748b", maxWidth: 560, lineHeight: 1.5 }}>{subtitle}</div>
      </div>
    </div>
  );
}

function Breadcrumb() {
  return (
    <Link
      href="/mercadolibre"
      style={{ fontSize: 12, color: "#94a3b8", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5, marginBottom: 18, transition: "color 0.15s" }}
      onMouseEnter={(e) => (e.currentTarget.style.color = "#475569")}
      onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}
    >
      <ArrowLeft size={13} /> MercadoLibre
    </Link>
  );
}

function LoadingState({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 60, justifyContent: "center", color: "#94a3b8" }}>
      <Loader2 size={18} className="spin" style={{ color: ML_PRIMARY }} />
      <span style={{ fontSize: 14 }}>{text}</span>
      <style jsx>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "relative", minHeight: "100%", padding: "32px 40px 64px", background: "#fafafa" }}>
      <div
        style={{
          position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
          background:
            "radial-gradient(900px 500px at 85% -10%, rgba(245,158,11,.08), transparent 60%)," +
            "radial-gradient(700px 400px at 5% 30%, rgba(251,191,36,.05), transparent 60%)," +
            "radial-gradient(600px 400px at 50% 110%, rgba(249,115,22,.04), transparent 60%)",
        }}
      />
      <div style={{ position: "relative", zIndex: 1, maxWidth: 1240, margin: "0 auto" }}>{children}</div>
    </div>
  );
}

function SharedStyles() {
  return (
    <style jsx global>{`
      .spin { animation: spin 1s linear infinite; }
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    `}</style>
  );
}
