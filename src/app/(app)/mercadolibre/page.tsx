// @ts-nocheck
"use client";

/**
 * /mercadolibre — Dashboard premium (Fase 9)
 * ─────────────────────────────────────────────────────────────
 * Read-only sobre data importada desde MELI (NUNCA toca producción).
 * Look estilo Linear/Vercel con aurora amarilla MELI + accent bars +
 * KPIs premium con sparklines + cards clickeables a sub-páginas +
 * banner de salud general del seller.
 */

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { formatARS, formatCompact } from "@/lib/utils/format";
import { DateRangeFilter } from "@/components/dashboard";
import {
  DollarSign, ShoppingCart, Package, MessageSquare, Tag,
  Award, RefreshCw, ArrowRight, Activity, AlertTriangle,
  CheckCircle2, ShieldCheck, Loader2, ThumbsUp, Minus, ThumbsDown,
} from "lucide-react";

// ════════════════════════════════════════════════════════════════
// Constantes ML
// ════════════════════════════════════════════════════════════════

const ML_GRADIENT = "linear-gradient(135deg, #fbbf24, #f97316)";
const ML_PRIMARY = "#f59e0b";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente", APPROVED: "Aprobado", SHIPPED: "Enviado",
  DELIVERED: "Entregado", CANCELLED: "Cancelado",
};
const STATUS_COLORS: Record<string, string> = {
  PENDING: "#f59e0b", APPROVED: "#3b82f6", SHIPPED: "#06b6d4",
  DELIVERED: "#10b981", CANCELLED: "#ef4444",
};
const PIE_COLORS = ["#f59e0b", "#10b981", "#6366f1", "#ef4444", "#06b6d4", "#8b5cf6"];

const LEVEL_INFO: Record<string, { label: string; color: string }> = {
  "5_green": { label: "Excelente", color: "#10b981" },
  "4_light_green": { label: "Muy bueno", color: "#34d399" },
  "3_yellow": { label: "Bueno", color: "#f59e0b" },
  "2_orange": { label: "Regular", color: "#f97316" },
  "1_red": { label: "Malo", color: "#ef4444" },
};

interface DashboardData {
  kpis: {
    totalOrders: number; totalRevenue: number; avgTicket: number; totalItems: number;
    cancelledOrders: number; cancellationRate: string;
    listingsActive: number; listingsTotal: number; listingsPaused: number;
    unansweredQuestions: number;
  };
  reputation: {
    level: string; levelLabel: string; powerSeller: boolean;
    totalSales: number; completedSales: number;
    claimsRate: number; delayedRate: number; cancellationRate: number;
    positiveRatings: number; negativeRatings: number; neutralRatings: number;
  } | null;
  dailySales: Array<{ day: string; revenue: number; orders: number }>;
  statusBreakdown: Array<{ status: string; count: number }>;
  paymentMethods: Array<{ method: string; orders: number; revenue: number }>;
  lastSync: string | null;
  daysInPeriod: number;
}

export default function MLDashboardPage() {
  const toDateStr = (d: Date) => d.toISOString().split("T")[0];
  const defaultTo = new Date();
  const defaultFrom = new Date(Date.now() - 29 * 86400000);
  const [dateFrom, setDateFrom] = useState(toDateStr(defaultFrom));
  const [dateTo, setDateTo] = useState(toDateStr(defaultTo));
  const [activeQuickRange, setActiveQuickRange] = useState<number | null>(30);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const ML_QUICK_RANGES = [
    { label: "7 dias", days: 7 },
    { label: "30 dias", days: 30 },
    { label: "90 dias", days: 90 },
  ];

  const handleMLQuickRange = (days: number) => {
    const to = new Date();
    const from = new Date(Date.now() - (days - 1) * 86400000);
    setDateTo(toDateStr(to));
    setDateFrom(toDateStr(from));
    setActiveQuickRange(days);
  };

  const handleMLDateChange = (type: "from" | "to", value: string) => {
    if (type === "from") setDateFrom(value);
    else setDateTo(value);
    setActiveQuickRange(null);
  };

  useEffect(() => {
    setLoading(true);
    fetch(`/api/mercadolibre/dashboard?from=${dateFrom}&to=${dateTo}`)
      .then((r) => r.json())
      .then(setData)
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo]);

  const handleSync = () => {
    setSyncing(true);
    setSyncMsg(null);
    fetch("/api/sync/mercadolibre")
      .then((r) => r.json())
      .then((res) => {
        setSyncMsg(res.ok ? "Sincronizado ✓" : `Error: ${res.errors?.join(", ") || res.error}`);
        fetch(`/api/mercadolibre/dashboard?from=${dateFrom}&to=${dateTo}`)
          .then((r) => r.json())
          .then(setData);
        setTimeout(() => setSyncMsg(null), 5000);
      })
      .catch(() => setSyncMsg("Error de red"))
      .finally(() => setSyncing(false));
  };

  // ── Cálculos de salud + sparklines ──
  const health = useMemo(() => {
    if (!data) return null;
    const issues: string[] = [];
    let score = 100;
    if (data.reputation?.cancellationRate && data.reputation.cancellationRate > 0.04) {
      issues.push(`Cancelaciones altas (${(data.reputation.cancellationRate * 100).toFixed(1)}%)`);
      score -= 25;
    }
    if (data.reputation?.delayedRate && data.reputation.delayedRate > 0.06) {
      issues.push(`Envíos tardíos (${(data.reputation.delayedRate * 100).toFixed(1)}%)`);
      score -= 25;
    }
    if (data.reputation?.claimsRate && data.reputation.claimsRate > 0.03) {
      issues.push(`Reclamos (${(data.reputation.claimsRate * 100).toFixed(1)}%)`);
      score -= 20;
    }
    if (data.kpis.unansweredQuestions > 10) {
      issues.push(`${data.kpis.unansweredQuestions} preguntas sin responder`);
      score -= 15;
    }
    let status: "ok" | "warning" | "critical" = "ok";
    if (score < 50) status = "critical";
    else if (score < 80) status = "warning";
    return { score, status, issues };
  }, [data]);

  const revenueSpark = useMemo(
    () => (data?.dailySales || []).slice(-7).map((d) => ({ v: d.revenue })),
    [data]
  );
  const ordersSpark = useMemo(
    () => (data?.dailySales || []).slice(-7).map((d) => ({ v: d.orders })),
    [data]
  );

  if (loading && !data) {
    return <PageShell><LoadingState /></PageShell>;
  }
  if (!data) return null;
  const { kpis, reputation } = data;
  const levelInfo = reputation?.level ? LEVEL_INFO[reputation.level] : null;

  return (
    <PageShell>
      {/* ── HERO HEADER ── */}
      <div
        style={{
          background: "white",
          borderRadius: 18,
          border: "1px solid rgba(15, 23, 42, 0.05)",
          padding: "26px 30px",
          marginBottom: 16,
          boxShadow: "0 1px 3px rgba(15,23,42,.02), 0 8px 24px rgba(15,23,42,.04)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18, flex: 1, minWidth: 280 }}>
          <div
            style={{
              width: 56, height: 56, borderRadius: 14,
              background: ML_GRADIENT,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              color: "white", flexShrink: 0,
              boxShadow: "0 6px 20px rgba(245, 158, 11, 0.35)",
              fontSize: 26, fontWeight: 700, letterSpacing: "-0.03em",
            }}
          >
            ML
          </div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", color: "#0f172a", margin: 0, marginBottom: 4 }}>
              MercadoLibre
            </h1>
            <div style={{ fontSize: 13, color: "#64748b", display: "flex", alignItems: "center", gap: 10 }}>
              Dashboard de tu seller en MercadoLibre
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", background: "rgba(16,185,129,.08)", borderRadius: 999, fontSize: 11, fontWeight: 600, color: "#059669" }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: "#10b981", animation: "pulseDot 2s infinite" }} />
                Tiempo real
              </span>
            </div>
          </div>
        </div>

        {/* Sync button premium */}
        <button
          onClick={handleSync}
          disabled={syncing}
          style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            padding: "10px 16px",
            background: syncing ? "#f1f5f9" : syncMsg?.startsWith("Sincronizado") ? "linear-gradient(135deg,#10b981,#14b8a6)" : "white",
            color: syncing ? "#94a3b8" : syncMsg?.startsWith("Sincronizado") ? "white" : ML_PRIMARY,
            border: syncing ? "1px solid #e2e8f0" : `1px solid ${ML_PRIMARY}30`,
            borderRadius: 10,
            cursor: syncing ? "not-allowed" : "pointer",
            fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
            boxShadow: syncing ? "none" : "0 2px 10px rgba(245,158,11,.15)",
            transition: "all 0.15s cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          <RefreshCw size={14} className={syncing ? "spin" : ""} />
          {syncing ? "Sincronizando…" : syncMsg || "Sync ML"}
        </button>
      </div>

      {/* ── BANNER DE SALUD GENERAL ── */}
      {health && <HealthBanner health={health} />}

      {/* ── PERIOD SELECTOR ── */}
      <div style={{ marginBottom: 20 }}>
        <DateRangeFilter
          dateFrom={dateFrom} dateTo={dateTo} activeQuickRange={activeQuickRange}
          quickRanges={ML_QUICK_RANGES} onQuickRange={handleMLQuickRange}
          onDateChange={handleMLDateChange} loading={loading}
        />
      </div>

      {/* ── REPUTATION BANNER PREMIUM ── */}
      {reputation && levelInfo && (
        <Link
          href="/mercadolibre/reputacion"
          style={{
            display: "block",
            background: "white",
            borderRadius: 16,
            border: "1px solid rgba(15,23,42,.05)",
            padding: 22,
            marginBottom: 24,
            position: "relative",
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(15,23,42,.02), 0 4px 14px rgba(15,23,42,.03)",
            textDecoration: "none",
            transition: "all 0.15s cubic-bezier(0.16,1,0.3,1)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = "0 1px 3px rgba(15,23,42,.04), 0 8px 24px rgba(15,23,42,.06)";
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "0 1px 3px rgba(15,23,42,.02), 0 4px 14px rgba(15,23,42,.03)";
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          {/* Accent bar lateral del color del nivel */}
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: levelInfo.color }} />

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 24, paddingLeft: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: `${levelInfo.color}12`,
                  color: levelInfo.color,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Award size={22} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>
                  Reputación del seller
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.01em" }}>
                  Nivel <span style={{ color: levelInfo.color }}>{levelInfo.label}</span>
                  {reputation.powerSeller && (
                    <span style={{ marginLeft: 8, padding: "2px 8px", background: "linear-gradient(135deg,#fbbf24,#f97316)", color: "white", fontSize: 10, fontWeight: 700, borderRadius: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      ⚡ MercadoLíder
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                  {reputation.totalSales.toLocaleString("es-AR")} ventas totales · {reputation.completedSales.toLocaleString("es-AR")} completadas
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 18, marginLeft: "auto", alignItems: "center", flexWrap: "wrap" }}>
              <RatingMetric Icon={ThumbsUp} value={reputation.positiveRatings} label="Positivas" tone="#10b981" />
              <RatingMetric Icon={Minus} value={reputation.neutralRatings} label="Neutras" tone="#94a3b8" />
              <RatingMetric Icon={ThumbsDown} value={reputation.negativeRatings} label="Negativas" tone="#ef4444" />
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#94a3b8", fontSize: 12, fontWeight: 600 }}>
                Ver detalle <ArrowRight size={13} />
              </div>
            </div>
          </div>
        </Link>
      )}

      {/* ── KPIs PREMIUM con sparklines ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 24 }}>
        <KpiPremium
          label="Ventas"
          value={formatCompact(kpis.totalRevenue)}
          sub={`${data.daysInPeriod} días`}
          tone="#10b981"
          Icon={DollarSign}
          spark={revenueSpark}
        />
        <KpiPremium
          label="Órdenes"
          value={kpis.totalOrders.toLocaleString("es-AR")}
          sub={`${kpis.totalItems.toLocaleString("es-AR")} items`}
          tone="#3b82f6"
          Icon={ShoppingCart}
          spark={ordersSpark}
        />
        <KpiPremium
          label="Ticket promedio"
          value={formatARS(kpis.avgTicket)}
          sub="por orden"
          tone="#8b5cf6"
          Icon={Tag}
        />
        <KpiPremium
          label="Publicaciones activas"
          value={kpis.listingsActive.toLocaleString("es-AR")}
          sub={`${kpis.listingsTotal.toLocaleString("es-AR")} total`}
          tone={ML_PRIMARY}
          Icon={Package}
          link="/mercadolibre/publicaciones"
        />
        <KpiPremium
          label="Preguntas sin responder"
          value={kpis.unansweredQuestions.toLocaleString("es-AR")}
          sub={kpis.unansweredQuestions > 0 ? "requieren atención" : "todo al día"}
          tone={kpis.unansweredQuestions > 10 ? "#ef4444" : kpis.unansweredQuestions > 0 ? "#f59e0b" : "#10b981"}
          Icon={MessageSquare}
          link="/mercadolibre/preguntas"
        />
      </div>

      {/* ── DAILY SALES CHART premium ── */}
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
            Ventas diarias
          </h2>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data.dailySales}>
            <defs>
              <linearGradient id="mlGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={ML_PRIMARY} stopOpacity={0.25} />
                <stop offset="95%" stopColor={ML_PRIMARY} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="day"
              tickFormatter={(d) => { try { const date = new Date(d + "T12:00:00"); return `${date.getDate()}/${date.getMonth() + 1}`; } catch { return d; } }}
              tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false}
            />
            <YAxis tickFormatter={(v) => formatCompact(v)} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={60} />
            <Tooltip
              formatter={(value: number) => [formatARS(value), "Facturación"]}
              labelFormatter={(d) => { try { return new Date(d + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "short" }); } catch { return d; } }}
              contentStyle={{ borderRadius: "10px", border: "1px solid #e2e8f0", fontSize: "12px", boxShadow: "0 4px 14px rgba(15,23,42,.08)" }}
            />
            <Area type="monotone" dataKey="revenue" stroke={ML_PRIMARY} strokeWidth={2.5} fill="url(#mlGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── STATUS + PAYMENT side by side ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        {/* Status breakdown premium */}
        <div style={{ background: "white", borderRadius: 14, border: "1px solid rgba(15,23,42,.05)", padding: 22, boxShadow: "0 1px 3px rgba(15,23,42,.02), 0 4px 14px rgba(15,23,42,.03)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(99,102,241,.12)", color: "#6366f1", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <CheckCircle2 size={14} />
            </div>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.01em", margin: 0 }}>
              Estado de órdenes
            </h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {data.statusBreakdown.map((s) => {
              const total = data.statusBreakdown.reduce((acc, x) => acc + x.count, 0) || 1;
              const pct = (s.count / total) * 100;
              const color = STATUS_COLORS[s.status] || "#94a3b8";
              return (
                <div key={s.status}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5, fontSize: 12 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#475569", fontWeight: 600 }}>
                      <span style={{ width: 7, height: 7, borderRadius: 2, background: color }} />
                      {STATUS_LABELS[s.status] || s.status}
                    </span>
                    <span style={{ color: "#0f172a", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {s.count.toLocaleString("es-AR")} <span style={{ color: "#94a3b8", fontWeight: 600, marginLeft: 4 }}>{pct.toFixed(0)}%</span>
                    </span>
                  </div>
                  <div style={{ background: "#f1f5f9", borderRadius: 999, height: 6, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 999, width: `${pct}%`, background: color, transition: "width 0.4s cubic-bezier(0.16,1,0.3,1)" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Payment methods premium */}
        <div style={{ background: "white", borderRadius: 14, border: "1px solid rgba(15,23,42,.05)", padding: 22, boxShadow: "0 1px 3px rgba(15,23,42,.02), 0 4px 14px rgba(15,23,42,.03)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(16,185,129,.12)", color: "#10b981", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <DollarSign size={14} />
            </div>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.01em", margin: 0 }}>
              Métodos de pago
            </h2>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ width: "50%" }}>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={data.paymentMethods} dataKey="orders" nameKey="method" cx="50%" cy="50%" innerRadius={42} outerRadius={75} paddingAngle={3}>
                    {data.paymentMethods.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => v.toLocaleString("es-AR")}
                    contentStyle={{ borderRadius: "10px", border: "1px solid #e2e8f0", fontSize: "12px", boxShadow: "0 4px 14px rgba(15,23,42,.08)" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ width: "50%", display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 }}>
              {data.paymentMethods.slice(0, 5).map((pm, i) => (
                <div key={pm.method} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                  <span style={{ color: "#475569", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>
                    {pm.method}
                  </span>
                  <span style={{ color: "#0f172a", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{pm.orders}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── SYNC STATUS footer ── */}
      <div
        style={{
          background: "white", borderRadius: 12, border: "1px solid rgba(15,23,42,.05)",
          padding: "14px 18px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
          boxShadow: "0 1px 3px rgba(15,23,42,.02)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: "#10b981", animation: "pulseDot 2s infinite" }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: "#059669" }}>Webhook activo</span>
          </span>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>
            Órdenes, publicaciones y preguntas se actualizan en tiempo real vía MELI
          </span>
        </div>
        <div style={{ textAlign: "right", fontSize: 11, color: "#94a3b8", fontVariantNumeric: "tabular-nums" }}>
          {data.lastSync && (
            <div>Última actualización: {new Date(data.lastSync).toLocaleString("es-AR")}</div>
          )}
          <div>Cron de respaldo: cada 4 horas</div>
        </div>
      </div>

      <style jsx>{`
        @keyframes pulseDot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </PageShell>
  );
}

// ════════════════════════════════════════════════════════════════
// Subcomponents
// ════════════════════════════════════════════════════════════════

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "relative",
        minHeight: "100%",
        padding: "32px 40px 64px",
        background: "#fafafa",
      }}
    >
      {/* Aurora premium 3 capas amarilla MELI */}
      <div
        style={{
          position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
          background:
            "radial-gradient(900px 500px at 85% -10%, rgba(245,158,11,.08), transparent 60%)," +
            "radial-gradient(700px 400px at 5% 30%, rgba(251,191,36,.05), transparent 60%)," +
            "radial-gradient(600px 400px at 50% 110%, rgba(249,115,22,.04), transparent 60%)",
        }}
      />
      <div style={{ position: "relative", zIndex: 1, maxWidth: 1240, margin: "0 auto" }}>
        {children}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 60, justifyContent: "center", color: "#94a3b8" }}>
      <Loader2 size={18} className="spin" style={{ color: ML_PRIMARY }} />
      <span style={{ fontSize: 14 }}>Cargando dashboard MercadoLibre…</span>
      <style jsx>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function HealthBanner({ health }: { health: { score: number; status: "ok" | "warning" | "critical"; issues: string[] } }) {
  const config = {
    ok: { color: "#10b981", bg: "rgba(16,185,129,.06)", border: "rgba(16,185,129,.25)", label: "Saludable", Icon: ShieldCheck },
    warning: { color: "#f59e0b", bg: "rgba(245,158,11,.06)", border: "rgba(245,158,11,.3)", label: "Atención", Icon: AlertTriangle },
    critical: { color: "#ef4444", bg: "rgba(239,68,68,.06)", border: "rgba(239,68,68,.3)", label: "Crítico", Icon: AlertTriangle },
  }[health.status];

  return (
    <div
      style={{
        background: config.bg,
        border: `1px solid ${config.border}`,
        borderRadius: 12,
        padding: "14px 18px",
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
      }}
    >
      <div
        style={{
          width: 38, height: 38, borderRadius: 10,
          background: config.color, color: "white",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <config.Icon size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: config.color, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>
          Salud del seller · {config.label}
        </div>
        <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
          {health.issues.length === 0
            ? "Todas las métricas dentro de rangos saludables. Seguí así."
            : `Detectamos ${health.issues.length} ${health.issues.length === 1 ? "área" : "áreas"} para atender: ${health.issues.join(" · ")}`}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: config.color, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", lineHeight: 1 }}>
          {health.score}
        </div>
        <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, marginTop: 2 }}>SCORE / 100</div>
      </div>
    </div>
  );
}

function KpiPremium({
  label, value, sub, tone, Icon, spark, link,
}: {
  label: string; value: string; sub?: string; tone: string; Icon: any;
  spark?: Array<{ v: number }>; link?: string;
}) {
  const inner = (
    <div
      style={{
        padding: "20px 22px",
        background: "white",
        borderRadius: 14,
        border: "1px solid rgba(15,23,42,.05)",
        boxShadow: "0 1px 3px rgba(15,23,42,.02), 0 4px 14px rgba(15,23,42,.03)",
        position: "relative",
        overflow: "hidden",
        height: "100%",
        transition: "all 0.15s cubic-bezier(0.16,1,0.3,1)",
      }}
      onMouseEnter={(e) => {
        if (link) {
          e.currentTarget.style.boxShadow = "0 1px 3px rgba(15,23,42,.04), 0 8px 24px rgba(15,23,42,.06)";
          e.currentTarget.style.transform = "translateY(-1px)";
        }
      }}
      onMouseLeave={(e) => {
        if (link) {
          e.currentTarget.style.boxShadow = "0 1px 3px rgba(15,23,42,.02), 0 4px 14px rgba(15,23,42,.03)";
          e.currentTarget.style.transform = "translateY(0)";
        }
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${tone}, ${tone}40)` }} />
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: spark ? 6 : 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
            {label}
          </div>
          <div
            style={{
              fontSize: 24, fontWeight: 700, color: "#0f172a",
              fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em", lineHeight: 1,
            }}
          >
            {value}
          </div>
          {sub && <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>{sub}</div>}
        </div>
        <div
          style={{
            width: 34, height: 34, borderRadius: 9,
            background: `${tone}12`, color: tone,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon size={15} />
        </div>
      </div>

      {/* Sparkline mini-chart */}
      {spark && spark.length > 1 && (
        <div style={{ marginTop: 10, height: 28 }}>
          <ResponsiveContainer width="100%" height={28}>
            <AreaChart data={spark}>
              <defs>
                <linearGradient id={`spark-${tone.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={tone} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={tone} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={tone} strokeWidth={1.5} fill={`url(#spark-${tone.replace("#", "")})`} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {link && (
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 4, color: tone, fontSize: 11, fontWeight: 600 }}>
          Ver detalle <ArrowRight size={11} />
        </div>
      )}
    </div>
  );

  return link ? <Link href={link} style={{ textDecoration: "none" }}>{inner}</Link> : inner;
}

function RatingMetric({ Icon, value, label, tone }: { Icon: any; value: number; label: string; tone: string }) {
  return (
    <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 5, color: tone }}>
        <Icon size={13} />
        <span style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>
          {value.toLocaleString("es-AR")}
        </span>
      </div>
      <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
    </div>
  );
}
