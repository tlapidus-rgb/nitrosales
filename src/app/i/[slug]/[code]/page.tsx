"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";

// ══════════════════════════════════════════════════════════════
// Public Influencer Dashboard v2 — NO LOGIN REQUIRED
// ══════════════════════════════════════════════════════════════
// Mobile-first, dark/light toggle, auto-refreshes every 30s.
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

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

interface Campaign {
  name: string;
  revenue: number;
  bonusTarget: number | null;
  bonusAmount: number | null;
  progress: number | null;
}

interface Coupon {
  code: string;
  discountPercent: number | null;
  discountFixed: number | null;
}

interface Tier {
  label: string | null;
  commissionPercent: number;
  minRevenue: number;
  maxRevenue: number | null;
}

interface DashboardData {
  influencer: { name: string; profileImage: string | null; commissionPercent: number };
  organization: { name: string };
  trackingUrl: string;
  today: { sales: number; conversions: number; commission: number };
  thisMonth: { sales: number; conversions: number; commission: number };
  allTime: { sales: number; conversions: number; commission: number };
  comparison: { salesChange: number; commissionChange: number };
  stats: { conversionRate: number; avgOrderValue: number; uniqueVisitors: number };
  tier: Tier | null;
  campaigns: Campaign[];
  coupons: Coupon[];
  bestDays: Array<{ date: string; sales: number }>;
  recentSales: Array<{ timestamp: string; amount: number; commission: number }>;
  dailyChart: Array<{ date: string; sales: number; conversions: number }>;
  topProducts?: Array<{ name: string; imageUrl: string | null; units: number; revenue: number }>;
  updatedAt: string;
}

// ── Toast notification component ──
function SaleToast({ amount, onDone }: { amount: number; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 4000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-[slideDown_0.3s_ease-out]">
      <div className="bg-green-500 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-sm font-medium">
        <span className="text-lg">🎉</span>
        Nueva venta: {fmtARS(amount)}
      </div>
    </div>
  );
}

// ── Change indicator ──
function ChangeArrow({ value, dark }: { value: number; dark: boolean }) {
  if (value === 0) return null;
  const isUp = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isUp ? "text-green-400" : "text-red-400"}`}>
      {isUp ? "↑" : "↓"} {Math.abs(value).toFixed(0)}%
    </span>
  );
}

export default function PublicInfluencerDashboard() {
  const params = useParams();
  const slug = params.slug as string;
  const code = params.code as string;

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [darkMode, setDarkMode] = useState(true);

  // Password protection state
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [authenticatedPassword, setAuthenticatedPassword] = useState<string | null>(null);
  const [lockedInfo, setLockedInfo] = useState<{ name: string; profileImage: string | null; orgName: string } | null>(null);

  // Toast state
  const [toast, setToast] = useState<number | null>(null);
  const prevSalesCount = useRef<number | null>(null);

  // Tooltip state for chart
  const [tooltip, setTooltip] = useState<{ x: number; date: string; sales: number } | null>(null);

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
        // Check for new sales (toast notification)
        const newCount = d.recentSales?.length || 0;
        if (prevSalesCount.current !== null && newCount > prevSalesCount.current && d.recentSales[0]) {
          setToast(d.recentSales[0].amount);
        }
        prevSalesCount.current = newCount;

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
    try {
      const res = await fetch(`/api/public/influencers/${slug}/${code}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = await res.json();
      if (result.valid) {
        setLoading(true);
        setAuthenticatedPassword(password);
        setRequiresPassword(false);
      } else {
        setPasswordError(true);
      }
    } catch {
      setPasswordError(true);
    }
  };

  // ── Theme classes ──
  const bg = darkMode
    ? "bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950"
    : "bg-gradient-to-br from-gray-50 via-white to-gray-100";
  const textPrimary = darkMode ? "text-white" : "text-gray-900";
  const textSecondary = darkMode ? "text-gray-400" : "text-gray-500";
  const textMuted = darkMode ? "text-gray-500" : "text-gray-400";
  const textFooter = darkMode ? "text-gray-600" : "text-gray-400";
  const textFooterBrand = darkMode ? "text-gray-700" : "text-gray-500";
  const card = darkMode
    ? "bg-white/5 backdrop-blur-sm border border-white/10"
    : "bg-white border border-gray-200 shadow-sm";
  const inputBg = darkMode
    ? "bg-white/5 border-white/10 text-white placeholder-gray-500"
    : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400";

  // ── Loading state ──
  if (loading) {
    return (
      <div className={`min-h-screen ${bg} flex items-center justify-center`}>
        <div className="flex flex-col items-center gap-6">
          {/* Animated bars */}
          <div className="flex items-end gap-1.5 h-10">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-1.5 bg-orange-500 rounded-full"
                style={{
                  animation: `pulse 1.2s ease-in-out ${i * 0.15}s infinite`,
                  height: "40%",
                }}
              />
            ))}
          </div>
          <div className="text-center">
            <p className={`${textSecondary} text-sm font-medium`}>Preparando tu dashboard</p>
            <p className={`${textMuted} text-xs mt-1 font-mono`}>Conectando datos en tiempo real...</p>
          </div>
          <style>{`
            @keyframes pulse {
              0%, 100% { height: 20%; opacity: 0.4; }
              50% { height: 100%; opacity: 1; }
            }
          `}</style>
        </div>
      </div>
    );
  }

  // ── Password gate ──
  if (requiresPassword) {
    return (
      <div className={`min-h-screen ${bg} flex items-center justify-center px-4`}>
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
            <h1 className={`text-xl font-bold ${textPrimary}`}>{lockedInfo?.name}</h1>
            <p className={`text-sm ${textMuted} mt-1`}>{lockedInfo?.orgName}</p>
          </div>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className={`${card} rounded-2xl p-6`}>
              <p className={`text-sm ${textSecondary} mb-4 text-center`}>
                Este dashboard esta protegido con contraseña
              </p>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setPasswordError(false); }}
                placeholder="Ingresa la contraseña"
                className={`w-full px-4 py-3 ${inputBg} border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500/50`}
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
          <p className={`text-[10px] ${textFooterBrand} text-center mt-6`}>
            Powered by <span className="text-orange-500 font-medium">NitroSales</span>
          </p>
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error || !data) {
    return (
      <div className={`min-h-screen ${bg} flex items-center justify-center`}>
        <div className="text-center">
          <p className="text-4xl mb-4">⚠️</p>
          <p className={`${textPrimary} text-lg font-medium`}>No pudimos cargar el dashboard</p>
          <p className={`${textSecondary} text-sm mt-2`}>Verificá el link o intentá de nuevo en unos segundos</p>
          <button
            onClick={() => { setError(false); setLoading(true); fetchData(); }}
            className="mt-4 px-6 py-2 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 transition-all"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const maxSale = Math.max(...data.dailyChart.map((d) => d.sales), 1);

  return (
    <div className={`min-h-screen ${bg} ${textPrimary} transition-colors duration-300`}>
      {/* Sale toast notification */}
      {toast !== null && <SaleToast amount={toast} onDone={() => setToast(null)} />}

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
                <div className="flex items-center gap-2">
                  <p className={`text-xs ${textMuted}`}>{data.organization.name}</p>
                  {data.tier && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 font-medium">
                      {data.tier.label || `Tier ${data.tier.commissionPercent}%`} — {data.tier.commissionPercent}%
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Dark/Light toggle */}
              <button
                onClick={() => setDarkMode(!darkMode)}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all ${
                  darkMode ? "bg-white/10 hover:bg-white/20" : "bg-gray-100 hover:bg-gray-200"
                }`}
                title={darkMode ? "Modo claro" : "Modo oscuro"}
              >
                {darkMode ? "☀️" : "🌙"}
              </button>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className={`text-[10px] ${textMuted} font-mono uppercase tracking-wider`}>Live</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-4 pb-8 sm:px-6">
        <div className="max-w-lg mx-auto space-y-4">

          {/* ── KPI Grid: Today + Month ── */}
          <div className="grid grid-cols-2 gap-3">
            {/* Today Sales */}
            <div className={`${card} rounded-2xl p-4`}>
              <p className={`text-[10px] ${textMuted} uppercase tracking-wider font-medium mb-1`}>Ventas hoy</p>
              <p className="text-2xl font-bold">{fmtARS(data.today.sales)}</p>
              <p className={`text-xs ${textSecondary} mt-0.5`}>{fmt(data.today.conversions)} ventas</p>
            </div>
            {/* Today Commission */}
            <div className={`${card} rounded-2xl p-4`}>
              <p className={`text-[10px] ${textMuted} uppercase tracking-wider font-medium mb-1`}>Comision hoy</p>
              <p className="text-2xl font-bold text-orange-400">{fmtARS(data.today.commission)}</p>
              <p className={`text-xs ${textSecondary} mt-0.5`}>{data.influencer.commissionPercent}%</p>
            </div>
          </div>

          {/* Month KPIs with comparison */}
          <div className="grid grid-cols-2 gap-3">
            {/* Month Sales */}
            <div className={`${card} rounded-2xl p-4`}>
              <div className="flex items-center justify-between mb-1">
                <p className={`text-[10px] ${textMuted} uppercase tracking-wider font-medium`}>Mes actual</p>
                <ChangeArrow value={data.comparison.salesChange} dark={darkMode} />
              </div>
              <p className="text-2xl font-bold">{fmtARS(data.thisMonth.sales)}</p>
              <p className={`text-xs ${textSecondary} mt-0.5`}>{fmt(data.thisMonth.conversions)} ventas</p>
            </div>
            {/* Month Commission */}
            <div className="bg-gradient-to-br from-orange-500/20 to-orange-600/10 backdrop-blur-sm rounded-2xl p-4 border border-orange-500/20">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] text-orange-300/70 uppercase tracking-wider font-medium">Mi comision</p>
                <ChangeArrow value={data.comparison.commissionChange} dark={darkMode} />
              </div>
              <p className="text-2xl font-bold text-orange-400">{fmtARS(data.thisMonth.commission)}</p>
              <p className="text-xs text-orange-300/50 mt-0.5">
                {data.influencer.commissionPercent}% de {fmtARS(data.thisMonth.sales)}
              </p>
            </div>
          </div>

          {/* ── Chart — Last 30 days ── */}
          {data.dailyChart.length > 0 && (
            <div className={`${card} rounded-2xl p-5`}>
              <p className={`text-xs ${textSecondary} uppercase tracking-wider font-medium mb-4`}>Ultimos 30 dias</p>
              <div
                className="relative flex items-end gap-[2px] h-28"
                onMouseLeave={() => setTooltip(null)}
              >
                {data.dailyChart.map((d, i) => {
                  const height = (d.sales / maxSale) * 100;
                  return (
                    <div
                      key={i}
                      className="flex-1 bg-orange-500/60 rounded-t-sm transition-all duration-200 hover:bg-orange-400 cursor-pointer"
                      style={{ height: `${Math.max(height, 2)}%` }}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const parent = e.currentTarget.parentElement?.getBoundingClientRect();
                        setTooltip({
                          x: rect.left - (parent?.left || 0) + rect.width / 2,
                          date: formatDate(d.date),
                          sales: d.sales,
                        });
                      }}
                    />
                  );
                })}
                {/* Tooltip */}
                {tooltip && (
                  <div
                    className="absolute -top-10 pointer-events-none z-10 transform -translate-x-1/2"
                    style={{ left: tooltip.x }}
                  >
                    <div className={`${darkMode ? "bg-gray-800" : "bg-gray-900"} text-white text-[10px] px-2 py-1 rounded-lg shadow-lg whitespace-nowrap`}>
                      {tooltip.date}: {fmtARS(tooltip.sales)}
                    </div>
                  </div>
                )}
              </div>
              {/* X-axis labels */}
              <div className="flex justify-between mt-2">
                {data.dailyChart.length > 0 && (
                  <>
                    <span className={`text-[10px] ${textFooter}`}>{formatDate(data.dailyChart[0].date)}</span>
                    {data.dailyChart.length > 14 && (
                      <span className={`text-[10px] ${textFooter}`}>
                        {formatDate(data.dailyChart[Math.floor(data.dailyChart.length / 2)].date)}
                      </span>
                    )}
                    <span className={`text-[10px] ${textFooter}`}>
                      {formatDate(data.dailyChart[data.dailyChart.length - 1].date)}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Active Campaigns ── */}
          {data.campaigns.length > 0 && (
            <div className={`${card} rounded-2xl p-5`}>
              <p className={`text-xs ${textSecondary} uppercase tracking-wider font-medium mb-3`}>Campañas activas</p>
              <div className="space-y-3">
                {data.campaigns.map((c, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{c.name}</span>
                      <span className="text-sm font-bold text-orange-400">{fmtARS(c.revenue)}</span>
                    </div>
                    {c.bonusTarget && c.bonusAmount && c.progress !== null && (
                      <div>
                        <div className={`h-2 rounded-full ${darkMode ? "bg-white/10" : "bg-gray-100"} overflow-hidden`}>
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              c.progress >= 100
                                ? "bg-green-400"
                                : "bg-gradient-to-r from-orange-500 to-orange-400"
                            }`}
                            style={{ width: `${c.progress}%` }}
                          />
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className={`text-[10px] ${textMuted}`}>
                            {c.progress >= 100 ? "🎉 Bono alcanzado!" : `${c.progress.toFixed(0)}% del objetivo`}
                          </span>
                          <span className={`text-[10px] ${textMuted}`}>
                            Bono: {fmtARS(c.bonusAmount)} al llegar a {fmtARS(c.bonusTarget)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Active Coupons ── */}
          {data.coupons.length > 0 && (
            <div className={`${card} rounded-2xl p-5`}>
              <p className={`text-xs ${textSecondary} uppercase tracking-wider font-medium mb-3`}>Mis cupones</p>
              <div className="flex flex-wrap gap-2">
                {data.coupons.map((c, i) => (
                  <div
                    key={i}
                    className={`${darkMode ? "bg-white/10" : "bg-orange-50 border-orange-200"} border ${darkMode ? "border-white/10" : ""} rounded-xl px-3 py-2 flex items-center gap-2`}
                  >
                    <span className="text-sm font-bold font-mono text-orange-400">{c.code}</span>
                    <span className={`text-[10px] ${textMuted}`}>
                      {c.discountPercent ? `${c.discountPercent}% off` : c.discountFixed ? `${fmtARS(c.discountFixed)} off` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Tracking Link ── */}
          {data.trackingUrl && (
            <div className={`${card} rounded-2xl p-5`}>
              <p className={`text-xs ${textSecondary} uppercase tracking-wider font-medium mb-2`}>Mi link de tracking</p>
              <div className="flex items-center gap-2">
                <div className={`flex-1 min-w-0 ${darkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200"} border rounded-xl px-3 py-2`}>
                  <p className={`text-xs font-mono truncate ${darkMode ? "text-orange-400" : "text-orange-600"}`}>{data.trackingUrl}</p>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(data.trackingUrl);
                    setLinkCopied(true);
                    setTimeout(() => setLinkCopied(false), 2000);
                  }}
                  className={`px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                    linkCopied
                      ? "bg-green-500 text-white"
                      : "bg-orange-500 text-white hover:bg-orange-600"
                  }`}
                >
                  {linkCopied ? "Copiado!" : "Copiar"}
                </button>
              </div>
            </div>
          )}

          {/* ── Stats Grid ── */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Conversion", value: `${data.stats.conversionRate.toFixed(1)}%` },
              { label: "Ticket prom", value: fmtARS(data.stats.avgOrderValue) },
              { label: "Visitantes", value: fmt(data.stats.uniqueVisitors) },
            ].map((stat) => (
              <div
                key={stat.label}
                className={`${card} rounded-xl p-3 text-center`}
              >
                <p className={`text-[10px] ${textMuted} uppercase tracking-wider`}>{stat.label}</p>
                <p className="text-sm font-bold mt-1">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* ── Top Products (only if enabled by the company) ── */}
          {data.topProducts !== undefined && (
            <div className={`${card} rounded-2xl p-5`}>
              <p className={`text-xs ${textSecondary} uppercase tracking-wider font-medium mb-3`}>Productos vendidos (este mes)</p>
              {data.topProducts.length > 0 ? (
                <div className="space-y-3">
                  {data.topProducts.map((p, i) => (
                    <div key={i} className="flex items-center gap-3">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt="" className="w-9 h-9 rounded-lg object-cover border border-white/10" />
                      ) : (
                        <div className={`w-9 h-9 rounded-lg ${darkMode ? "bg-white/10" : "bg-gray-100"} flex items-center justify-center text-xs`}>
                          📦
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className={`text-[10px] ${textMuted}`}>{p.units} {p.units === 1 ? "unidad" : "unidades"}</p>
                      </div>
                      <p className="text-sm font-bold text-orange-400">{fmtARS(p.revenue)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className={`text-2xl mb-2`}>📦</p>
                  <p className={`text-sm ${textSecondary}`}>Todavia no hay ventas este mes</p>
                  <p className={`text-xs ${textMuted} mt-1`}>Cuando generes ventas con tu link, vas a ver aca que productos se vendieron y cuantas unidades</p>
                </div>
              )}
            </div>
          )}

          {/* ── Best Days ── */}
          {data.bestDays && data.bestDays.length > 0 && (
            <div className={`${card} rounded-2xl p-5`}>
              <p className={`text-xs ${textSecondary} uppercase tracking-wider font-medium mb-3`}>Mejores dias (30d)</p>
              <div className="space-y-2">
                {data.bestDays.map((d, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}</span>
                      <span className={`text-sm ${textSecondary}`}>{formatDate(d.date)}</span>
                    </div>
                    <span className="text-sm font-bold">{fmtARS(d.sales)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Recent Sales Feed ── */}
          {data.recentSales.length > 0 && (
            <div className={`${card} rounded-2xl p-5`}>
              <p className={`text-xs ${textSecondary} uppercase tracking-wider font-medium mb-3`}>Actividad reciente</p>
              <div className="space-y-3">
                {data.recentSales.slice(0, 10).map((sale, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-green-400" />
                      <span className={`text-xs ${textMuted}`}>{timeAgo(sale.timestamp)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-medium">{fmtARS(sale.amount)}</span>
                      <span className="text-xs text-orange-400 ml-2">+{fmtARS(sale.commission)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── All-time totals ── */}
          <div className={`${card} rounded-2xl p-5`}>
            <p className={`text-xs ${textSecondary} uppercase tracking-wider font-medium mb-3`}>Total historico</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-lg font-bold">{fmtARS(data.allTime.sales)}</p>
                <p className={`text-[10px] ${textMuted}`}>Revenue</p>
              </div>
              <div>
                <p className="text-lg font-bold text-orange-400">{fmtARS(data.allTime.commission)}</p>
                <p className={`text-[10px] ${textMuted}`}>Comision</p>
              </div>
              <div>
                <p className="text-lg font-bold">{fmt(data.allTime.conversions)}</p>
                <p className={`text-[10px] ${textMuted}`}>Ventas</p>
              </div>
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="text-center pt-4">
            <p className={`text-[10px] ${textFooter}`}>
              Actualizado {lastUpdate.toLocaleTimeString("es-AR")} · Se refresca cada 30s
            </p>
            <p className={`text-[10px] ${textFooterBrand} mt-1`}>
              Powered by <span className="text-orange-500 font-medium">NitroSales</span>
            </p>
          </div>
        </div>
      </main>

      {/* Toast animation keyframes */}
      <style jsx global>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
