"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";

// ══════════════════════════════════════════════════════════════
// Public Influencer Dashboard — NO LOGIN REQUIRED
// ══════════════════════════════════════════════════════════════
// Mobile-first, beautiful, auto-refreshes every 30 seconds.
// Shows only aggregated data — NO customer PII.
// URL: /i/[org_slug]/[influencer_code]
// ══════════════════════════════════════════════════════════════

const fmtARS = (n: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);
const fmt = (n: number) => n.toLocaleString("es-AR");

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Hace segundos";
  if (mins < 60) return `Hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days}d`;
}

interface DashboardData {
  influencer: { name: string; profileImage: string | null; commissionPercent: number };
  organization: { name: string };
  today: { sales: number; conversions: number; commission: number };
  thisMonth: { sales: number; conversions: number; commission: number };
  allTime: { sales: number; conversions: number; commission: number };
  stats: { conversionRate: number; avgOrderValue: number; uniqueVisitors: number };
  recentSales: Array<{ timestamp: string; amount: number; commission: number }>;
  dailyChart: Array<{ date: string; sales: number; conversions: number }>;
  updatedAt: string;
}

export default function PublicInfluencerDashboard() {
  const params = useParams();
  const slug = params.slug as string;
  const code = params.code as string;

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchData = useCallback(() => {
    fetch(`/api/public/influencers/${slug}/${code}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((d) => {
        setData(d);
        setLastUpdate(new Date());
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [slug, code]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
          <p className="text-gray-400 text-sm font-mono">Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-6xl mb-4">🔒</p>
          <p className="text-gray-400 text-lg">Dashboard no disponible</p>
        </div>
      </div>
    );
  }

  const maxSale = Math.max(...data.dailyChart.map((d) => d.sales), 1);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-white">
      {/* Header */}
      <header className="px-4 pt-6 pb-4 sm:px-6">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-3">
              {data.influencer.profileImage ? (
                <img
                  src={data.influencer.profileImage}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover border-2 border-orange-500/30"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white font-bold text-lg">
                  {data.influencer.name[0]?.toUpperCase()}
                </div>
              )}
              <div>
                <h1 className="text-lg font-bold">{data.influencer.name}</h1>
                <p className="text-xs text-gray-500">{data.organization.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[10px] text-gray-500 font-mono uppercase tracking-wider">Live</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-4 pb-8 sm:px-6">
        <div className="max-w-lg mx-auto space-y-4">
          {/* Today Card */}
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-5 border border-white/10">
            <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1">Ventas de hoy</p>
            <p className="text-3xl font-bold text-white">{fmtARS(data.today.sales)}</p>
            <p className="text-sm text-gray-400 mt-1">{fmt(data.today.conversions)} compras</p>
          </div>

          {/* Month Card */}
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-5 border border-white/10">
            <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1">Este mes</p>
            <p className="text-3xl font-bold text-white">{fmtARS(data.thisMonth.sales)}</p>
            <p className="text-sm text-gray-400 mt-1">{fmt(data.thisMonth.conversions)} compras</p>
          </div>

          {/* Commission Card — Highlighted */}
          <div className="bg-gradient-to-br from-orange-500/20 to-orange-600/10 backdrop-blur-sm rounded-2xl p-5 border border-orange-500/20">
            <p className="text-xs text-orange-300/70 uppercase tracking-wider font-medium mb-1">Mi comision</p>
            <p className="text-3xl font-bold text-orange-400">{fmtARS(data.thisMonth.commission)}</p>
            <p className="text-sm text-orange-300/50 mt-1">
              {data.influencer.commissionPercent}% de {fmtARS(data.thisMonth.sales)}
            </p>
          </div>

          {/* Mini Chart — Last 30 days */}
          {data.dailyChart.length > 0 && (
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-5 border border-white/10">
              <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-4">Ultimos 30 dias</p>
              <div className="flex items-end gap-[2px] h-24">
                {data.dailyChart.map((d, i) => {
                  const height = (d.sales / maxSale) * 100;
                  return (
                    <div
                      key={i}
                      className="flex-1 bg-orange-500/60 rounded-t-sm transition-all duration-300 hover:bg-orange-400"
                      style={{ height: `${Math.max(height, 2)}%` }}
                      title={`${new Date(d.date).toLocaleDateString("es-AR")}: ${fmtARS(d.sales)}`}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-[10px] text-gray-600">30 dias atras</span>
                <span className="text-[10px] text-gray-600">Hoy</span>
              </div>
            </div>
          )}

          {/* Recent Sales Feed */}
          {data.recentSales.length > 0 && (
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-5 border border-white/10">
              <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-3">Actividad reciente</p>
              <div className="space-y-3">
                {data.recentSales.slice(0, 10).map((sale, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-green-400" />
                      <span className="text-xs text-gray-500">{timeAgo(sale.timestamp)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-medium text-white">{fmtARS(sale.amount)}</span>
                      <span className="text-xs text-orange-400 ml-2">+{fmtARS(sale.commission)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stats Footer */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Conversion", value: `${data.stats.conversionRate.toFixed(1)}%` },
              { label: "Ticket prom", value: fmtARS(data.stats.avgOrderValue) },
              { label: "Visitantes", value: fmt(data.stats.uniqueVisitors) },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-white/5 backdrop-blur-sm rounded-xl p-3 border border-white/5 text-center"
              >
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">{stat.label}</p>
                <p className="text-sm font-bold text-white mt-1">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* All-time totals */}
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-5 border border-white/10">
            <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-3">Total historico</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-lg font-bold text-white">{fmtARS(data.allTime.sales)}</p>
                <p className="text-[10px] text-gray-500">Revenue</p>
              </div>
              <div>
                <p className="text-lg font-bold text-orange-400">{fmtARS(data.allTime.commission)}</p>
                <p className="text-[10px] text-gray-500">Comision</p>
              </div>
              <div>
                <p className="text-lg font-bold text-white">{fmt(data.allTime.conversions)}</p>
                <p className="text-[10px] text-gray-500">Ventas</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center pt-4">
            <p className="text-[10px] text-gray-600">
              Actualizado {lastUpdate.toLocaleTimeString("es-AR")} · Se refresca cada 30s
            </p>
            <p className="text-[10px] text-gray-700 mt-1">
              Powered by <span className="text-orange-500 font-medium">NitroSales</span>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
