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

  // Password protection state
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [authenticatedPassword, setAuthenticatedPassword] = useState<string | null>(null);
  const [lockedInfo, setLockedInfo] = useState<{ name: string; profileImage: string | null; orgName: string } | null>(null);

  const fetchData = useCallback(() => {
    const url = authenticatedPassword
      ? `/api/public/influencers/${slug}/${code}?password=${encodeURIComponent(authenticatedPassword)}`
      : `/api/public/influencers/${slug}/${code}`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((d) => {
        if (d.requiresPassword) {
          setRequiresPassword(true);
          setLockedInfo({
            name: d.influencer?.name || "",
            profileImage: d.influencer?.profileImage || null,
            orgName: d.organization?.name || "",
          });
          setLoading(false);
          return;
        }
        setData(d);
        setRequiresPassword(false);
        setLastUpdate(new Date());
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [slug, code, authenticatedPassword]);

  useEffect(() => {
    fetchData();
    if (!requiresPassword) {
      const interval = setInterval(fetchData, 30000);
      return () => clearInterval(interval);
    }
  }, [fetchData, requiresPassword]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setPasswordError(false);
    // Verify password
    try {
      const res = await fetch(`/api/public/influencers/${slug}/${code}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = await res.json();
      if (result.valid) {
        setAuthenticatedPassword(password);
        setRequiresPassword(false);
      } else {
        setPasswordError(true);
      }
    } catch {
      setPasswordError(true);
    }
  };

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

  // Password gate
  if (requiresPassword) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            {lockedInfo?.profileImage ? (
              <img
                src={lockedInfo.profileImage}
                alt=""
                className="w-16 h-16 rounded-full mx-auto mb-4 border-2 border-orange-500/30"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4">
                {lockedInfo?.name?.[0]?.toUpperCase() || "?"}
              </div>
            )}
            <h1 className="text-xl font-bold text-white">{lockedInfo?.name}</h1>
            <p className="text-sm text-gray-500 mt-1">{lockedInfo?.orgName}</p>
          </div>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
              <p className="text-sm text-gray-400 mb-4 text-center">
                Este dashboard esta protegido con contraseña
              </p>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setPasswordError(false); }}
                placeholder="Ingresa la contraseña"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500/50"
                autoFocus
              />
              {passwordError && (
                <p className="text-red-400 text-xs mt-2 text-center">Contraseña incorrecta</p>
              )}
            </div>
            <button
              type="submit"
              className="w-full py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl text-sm font-medium hover:from-orange-600 hover:to-orange-700 transition-all"
            >
              Ingresar
            </button>
          </form>
          <p className="text-[10px] text-gray-700 text-center mt-6">
            Powered by <span className="text-orange-500 font-medium">NitroSales</span>
          </p>
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
