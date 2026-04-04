"use client";

import { useState, useEffect } from "react";

// ══════════════════════════════════════════════════════════════
// Influencer Analytics — Cohort, ROI, Anomalies
// ══════════════════════════════════════════════════════════════

interface CohortMonth {
  month: string;
  total: number;
  totalCommission: number;
  totalConversions: number;
  influencers: Record<string, { revenue: number; conversions: number; commission: number }>;
}

interface CampaignROI {
  id: string;
  name: string;
  status: string;
  influencer: string;
  revenue: number;
  commission: number;
  conversions: number;
  totalCost: number;
  roi: number;
  bonusTarget: number | null;
  bonusAmount: number | null;
  progress: number | null;
}

interface Anomaly {
  influencer: string;
  type: "spike" | "drop";
  metric: string;
  change: number;
  current: number;
  previous: number;
}

interface KPIs {
  monthlyRevenue: number;
  monthlyCommission: number;
  monthlyConversions: number;
  prevMonthRevenue: number;
  prevMonthCommission: number;
  revenueShare: number;
  totalOrders: number;
  avgCommissionRate: number;
}

const fmtARS = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
const fmt = (n: number) => n.toLocaleString("es-AR");

function pctChange(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return ((curr - prev) / prev) * 100;
}

function ChangeBadge({ value }: { value: number }) {
  if (value === 0) return null;
  const isUp = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isUp ? "text-green-500" : "text-red-500"}`}>
      {isUp ? "↑" : "↓"} {Math.abs(value).toFixed(0)}%
    </span>
  );
}

const MONTH_NAMES: Record<string, string> = {
  "01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr",
  "05": "May", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dic",
};

function shortMonth(ym: string): string {
  const [, m] = ym.split("-");
  return MONTH_NAMES[m] || m;
}

export default function AnalyticsPage() {
  const [cohort, setCohort] = useState<CohortMonth[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignROI[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportLoading, setExportLoading] = useState(false);

  useEffect(() => {
    fetch("/api/influencers/analytics")
      .then((r) => r.json())
      .then((d) => {
        setCohort(d.cohort || []);
        setCampaigns(d.campaigns || []);
        setAnomalies(d.anomalies || []);
        setKpis(d.kpis || null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const res = await fetch("/api/influencers/export?format=csv");
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `influencers-report-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Export error:", err);
    }
    setExportLoading(false);
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="flex items-end gap-1.5 h-8">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="w-1.5 bg-orange-500 rounded-full" style={{ animation: `aPulse 1.2s ease-in-out ${i * 0.15}s infinite`, height: "40%" }} />
          ))}
        </div>
        <style>{`@keyframes aPulse { 0%, 100% { height: 20%; opacity: 0.4; } 50% { height: 100%; opacity: 1; } }`}</style>
      </div>
    );
  }

  const maxCohortRevenue = Math.max(...cohort.map((c) => c.total), 1);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "#111827" }}>Analytics del Programa</h1>
          <p className="text-sm mt-1" style={{ color: "#6B7280" }}>
            Cohorts, ROI por campaña y detección de anomalías
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exportLoading}
          className="px-4 py-2 bg-orange-500 text-white rounded-lg text-xs font-medium hover:bg-orange-600 transition-colors disabled:opacity-50"
        >
          {exportLoading ? "Exportando..." : "Exportar CSV"}
        </button>
      </div>

      {/* Empty state */}
      {!kpis && cohort.length === 0 && campaigns.length === 0 && anomalies.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-4xl mb-4">📊</p>
          <p className="text-lg font-medium mb-2" style={{ color: "#111827" }}>Todavía no hay datos de atribuciones</p>
          <p className="text-sm max-w-md mx-auto" style={{ color: "#6B7280" }}>
            Los analytics se van a llenar automáticamente cuando los influencers generen ventas a través de sus links de tracking o cupones. Compartí los links y empezá a ver resultados acá.
          </p>
        </div>
      )}

      {/* Program KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: "Ventas del programa",
              value: fmtARS(kpis.monthlyRevenue),
              change: pctChange(kpis.monthlyRevenue, kpis.prevMonthRevenue),
            },
            {
              label: "Comisiones del mes",
              value: fmtARS(kpis.monthlyCommission),
              change: pctChange(kpis.monthlyCommission, kpis.prevMonthCommission),
            },
            {
              label: "% de ventas totales",
              value: `${kpis.revenueShare.toFixed(1)}%`,
              sub: `${fmt(kpis.monthlyConversions)} de ${fmt(kpis.totalOrders)} pedidos`,
            },
            {
              label: "Comisión promedio",
              value: `${kpis.avgCommissionRate.toFixed(1)}%`,
              sub: "tasa efectiva",
            },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-[10px] uppercase tracking-wider font-medium mb-1" style={{ color: "#9CA3AF" }}>{kpi.label}</p>
              <div className="flex items-baseline gap-2">
                <p className="text-lg font-bold" style={{ color: "#111827" }}>{kpi.value}</p>
                {kpi.change !== undefined && <ChangeBadge value={kpi.change} />}
              </div>
              {kpi.sub && <p className="text-[10px] mt-1" style={{ color: "#9CA3AF" }}>{kpi.sub}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Anomalies */}
      {anomalies.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-bold mb-3" style={{ color: "#111827" }}>
            Alertas detectadas
          </h2>
          <div className="space-y-2">
            {anomalies.slice(0, 5).map((a, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm ${
                  a.type === "spike"
                    ? "bg-green-50 border-green-200"
                    : "bg-red-50 border-red-200"
                }`}
              >
                <span className="text-lg">{a.type === "spike" ? "🚀" : "⚠️"}</span>
                <div className="flex-1">
                  <p style={{ color: "#111827" }}>
                    <strong>{a.influencer}</strong>
                    {a.type === "spike" ? " — pico en " : " — caída en "}
                    {a.metric}
                  </p>
                  <p className="text-xs" style={{ color: "#6B7280" }}>
                    {fmtARS(a.previous)} → {fmtARS(a.current)} ({a.change > 0 ? "+" : ""}{a.change.toFixed(0)}%)
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Revenue Cohort (bar chart) */}
      {cohort.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-bold mb-4" style={{ color: "#111827" }}>
            Evolución mensual del programa
          </h2>
          <div className="flex items-end gap-2 h-40">
            {cohort.map((c) => (
              <div key={c.month} className="flex-1 flex flex-col items-center gap-1">
                <p className="text-[10px] font-medium" style={{ color: "#111827" }}>
                  {fmtARS(c.total).replace(/\s/g, "")}
                </p>
                <div className="w-full flex justify-center">
                  <div
                    className="w-8 sm:w-12 bg-gradient-to-t from-orange-500 to-orange-400 rounded-t-lg transition-all"
                    style={{ height: `${Math.max((c.total / maxCohortRevenue) * 120, 4)}px` }}
                  />
                </div>
                <p className="text-[10px] font-mono" style={{ color: "#9CA3AF" }}>
                  {shortMonth(c.month)}
                </p>
              </div>
            ))}
          </div>
          {/* Cohort details */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 pr-4 font-medium" style={{ color: "#6B7280" }}>Mes</th>
                  <th className="text-right py-2 px-2 font-medium" style={{ color: "#6B7280" }}>Ventas</th>
                  <th className="text-right py-2 px-2 font-medium" style={{ color: "#6B7280" }}>Comisión</th>
                  <th className="text-right py-2 px-2 font-medium" style={{ color: "#6B7280" }}>Conv.</th>
                  <th className="text-right py-2 px-2 font-medium" style={{ color: "#6B7280" }}>Influencers</th>
                </tr>
              </thead>
              <tbody>
                {cohort.map((c) => (
                  <tr key={c.month} className="border-b border-gray-100">
                    <td className="py-2 pr-4 font-medium" style={{ color: "#111827" }}>{shortMonth(c.month)} {c.month.slice(0, 4)}</td>
                    <td className="py-2 px-2 text-right tabular-nums" style={{ color: "#111827" }}>{fmtARS(c.total)}</td>
                    <td className="py-2 px-2 text-right tabular-nums" style={{ color: "#F97316" }}>{fmtARS(c.totalCommission)}</td>
                    <td className="py-2 px-2 text-right tabular-nums" style={{ color: "#111827" }}>{c.totalConversions}</td>
                    <td className="py-2 px-2 text-right tabular-nums" style={{ color: "#111827" }}>{Object.keys(c.influencers).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Campaign ROI */}
      {campaigns.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-bold mb-4" style={{ color: "#111827" }}>
            ROI por Campaña
          </h2>
          <div className="space-y-3">
            {campaigns.map((c) => (
              <div key={c.id} className="border border-gray-100 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium text-sm" style={{ color: "#111827" }}>{c.name}</p>
                    <p className="text-[10px]" style={{ color: "#9CA3AF" }}>
                      {c.influencer} · {c.status === "ACTIVE" ? "Activa" : c.status === "COMPLETED" ? "Completada" : "Pausada"}
                    </p>
                  </div>
                  <span
                    className="text-sm font-bold px-3 py-1 rounded-full"
                    style={{
                      color: c.roi > 500 ? "#22C55E" : c.roi > 200 ? "#F97316" : "#EF4444",
                      backgroundColor: c.roi > 500 ? "#22C55E15" : c.roi > 200 ? "#F9731615" : "#EF444415",
                    }}
                  >
                    ROI {c.roi.toFixed(0)}%
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-3 text-xs">
                  <div>
                    <p style={{ color: "#9CA3AF" }}>Ventas</p>
                    <p className="font-semibold" style={{ color: "#111827" }}>{fmtARS(c.revenue)}</p>
                  </div>
                  <div>
                    <p style={{ color: "#9CA3AF" }}>Comisión</p>
                    <p className="font-semibold" style={{ color: "#F97316" }}>{fmtARS(c.commission)}</p>
                  </div>
                  <div>
                    <p style={{ color: "#9CA3AF" }}>Costo total</p>
                    <p className="font-semibold" style={{ color: "#111827" }}>{fmtARS(c.totalCost)}</p>
                  </div>
                  <div>
                    <p style={{ color: "#9CA3AF" }}>Conversiones</p>
                    <p className="font-semibold" style={{ color: "#111827" }}>{fmt(c.conversions)}</p>
                  </div>
                </div>

                {c.progress !== null && (
                  <div className="mt-3">
                    <div className="flex justify-between text-[10px] mb-1">
                      <span style={{ color: "#9CA3AF" }}>Objetivo: {fmtARS(c.bonusTarget || 0)}</span>
                      <span style={{ color: c.progress >= 100 ? "#22C55E" : "#F97316" }}>{c.progress.toFixed(0)}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${c.progress}%`,
                          backgroundColor: c.progress >= 100 ? "#22C55E" : "#F97316",
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
