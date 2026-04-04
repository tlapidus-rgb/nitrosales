"use client";

import { useState, useEffect } from "react";

// ══════════════════════════════════════════════════════════════
// Influencer Leaderboard — Comparative Rankings
// ══════════════════════════════════════════════════════════════

interface LeaderboardEntry {
  id: string;
  name: string;
  code: string;
  profileImage: string | null;
  commissionPercent: number;
  revenue: number;
  commission: number;
  conversions: number;
  visitors: number;
  conversionRate: number;
  avgOrderValue: number;
  roi: number;
  revenueChange: number;
  prevRevenue: number;
  bestDay: { date: string; sales: number } | null;
}

interface Totals {
  revenue: number;
  commission: number;
  conversions: number;
  visitors: number;
  influencerCount: number;
}

const fmtARS = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
const fmt = (n: number) => n.toLocaleString("es-AR");

const PERIOD_OPTIONS = [
  { value: "month", label: "Este mes" },
  { value: "quarter", label: "Trimestre" },
  { value: "year", label: "Este año" },
  { value: "all", label: "Todo" },
];

const SORT_OPTIONS = [
  { value: "revenue", label: "Ventas" },
  { value: "conversions", label: "Conversiones" },
  { value: "commission", label: "Comisión" },
  { value: "roi", label: "ROI" },
  { value: "conversionRate", label: "Tasa conv." },
];

const MEDALS = ["🥇", "🥈", "🥉"];

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("month");
  const [sort, setSort] = useState("revenue");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/influencers/leaderboard?period=${period}&sort=${sort}`)
      .then((r) => r.json())
      .then((d) => {
        setLeaderboard(d.leaderboard || []);
        setTotals(d.totals || null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [period, sort]);

  const maxRevenue = Math.max(...leaderboard.map((l) => l.revenue), 1);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "#111827" }}>Leaderboard de Influencers</h1>
          <p className="text-sm mt-1" style={{ color: "#6B7280" }}>
            Ranking comparativo de rendimiento
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200"
            style={{ color: "#111827", backgroundColor: "#fff" }}
          >
            {PERIOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200"
            style={{ color: "#111827", backgroundColor: "#fff" }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>Ordenar: {o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Totals */}
      {totals && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          {[
            { label: "Ventas totales", value: fmtARS(totals.revenue) },
            { label: "Comisiones", value: fmtARS(totals.commission) },
            { label: "Conversiones", value: fmt(totals.conversions) },
            { label: "Visitantes", value: fmt(totals.visitors) },
            { label: "Influencers activos", value: fmt(totals.influencerCount) },
          ].map((t) => (
            <div key={t.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-[10px] uppercase tracking-wider font-medium mb-1" style={{ color: "#9CA3AF" }}>{t.label}</p>
              <p className="text-lg font-bold" style={{ color: "#111827" }}>{t.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Leaderboard Table */}
      {loading ? (
        <div className="text-center py-16" style={{ color: "#9CA3AF" }}>
          <div className="flex items-end gap-1.5 h-8 justify-center mb-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="w-1.5 bg-orange-500 rounded-full" style={{ animation: `lbPulse 1.2s ease-in-out ${i * 0.15}s infinite`, height: "40%" }} />
            ))}
          </div>
          <p className="text-sm">Cargando leaderboard...</p>
          <style>{`@keyframes lbPulse { 0%, 100% { height: 20%; opacity: 0.4; } 50% { height: 100%; opacity: 1; } }`}</style>
        </div>
      ) : leaderboard.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-4">🏆</p>
          <p className="text-lg font-medium mb-2" style={{ color: "#111827" }}>Todavía no hay datos para este período</p>
          <p className="text-sm max-w-md mx-auto" style={{ color: "#6B7280" }}>
            El leaderboard se completa automáticamente cuando los influencers generan ventas. Compartí los links de tracking para empezar a ver el ranking.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase" style={{ color: "#6B7280" }}>#</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase" style={{ color: "#6B7280" }}>Influencer</th>
                  <th className="text-right px-4 py-3 text-xs font-medium uppercase" style={{ color: "#6B7280" }}>Ventas</th>
                  <th className="text-right px-4 py-3 text-xs font-medium uppercase hidden sm:table-cell" style={{ color: "#6B7280" }}>Comisión</th>
                  <th className="text-right px-4 py-3 text-xs font-medium uppercase hidden md:table-cell" style={{ color: "#6B7280" }}>Conv.</th>
                  <th className="text-right px-4 py-3 text-xs font-medium uppercase hidden md:table-cell" style={{ color: "#6B7280" }}>Tasa</th>
                  <th className="text-right px-4 py-3 text-xs font-medium uppercase hidden lg:table-cell" style={{ color: "#6B7280" }}>Ticket</th>
                  <th className="text-right px-4 py-3 text-xs font-medium uppercase hidden lg:table-cell" style={{ color: "#6B7280" }}>ROI</th>
                  <th className="text-right px-4 py-3 text-xs font-medium uppercase" style={{ color: "#6B7280" }}>Cambio</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase hidden xl:table-cell" style={{ color: "#6B7280" }}>Barra</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry, idx) => (
                  <tr key={entry.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <span className="text-lg">{idx < 3 ? MEDALS[idx] : <span className="text-xs font-mono" style={{ color: "#9CA3AF" }}>{idx + 1}</span>}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {entry.profileImage ? (
                          <img src={entry.profileImage} alt="" className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white font-bold text-xs">
                            {entry.name[0]?.toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-sm" style={{ color: "#111827" }}>{entry.name}</p>
                          <p className="text-[10px] font-mono" style={{ color: "#9CA3AF" }}>{entry.commissionPercent}%</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums" style={{ color: "#111827" }}>
                      {fmtARS(entry.revenue)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell" style={{ color: "#F97316" }}>
                      {fmtARS(entry.commission)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell" style={{ color: "#111827" }}>
                      {fmt(entry.conversions)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell" style={{ color: "#111827" }}>
                      {entry.conversionRate.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums hidden lg:table-cell" style={{ color: "#111827" }}>
                      {fmtARS(entry.avgOrderValue)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums hidden lg:table-cell">
                      <span style={{ color: entry.roi > 500 ? "#22C55E" : entry.roi > 200 ? "#F97316" : "#EF4444" }}>
                        {entry.roi.toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {entry.revenueChange !== 0 && (
                        <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${entry.revenueChange > 0 ? "text-green-500" : "text-red-500"}`}>
                          {entry.revenueChange > 0 ? "↑" : "↓"} {Math.abs(entry.revenueChange).toFixed(0)}%
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-orange-500 to-orange-400 rounded-full transition-all"
                          style={{ width: `${(entry.revenue / maxRevenue) * 100}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
