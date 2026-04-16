"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";

// ══════════════════════════════════════════════════════════════
// Public Influencer Dashboard v3 — TWO TABS
// ══════════════════════════════════════════════════════════════
// Tab 1: "Mis Ganancias" — revenue, commissions, charts, etc.
// Tab 2: "Mi Contenido"  — briefs, content submission, seedings
// Single URL, single password, unified experience.
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

// ── Interfaces ──
interface Campaign { name: string; revenue: number; bonusTarget: number | null; bonusAmount: number | null; progress: number | null; }
interface Coupon { code: string; discountPercent: number | null; discountFixed: number | null; }
interface Tier { label: string | null; commissionPercent: number; minRevenue: number; maxRevenue: number | null; }

interface DashboardData {
  influencer: { name: string; profileImage: string | null; commissionPercent: number; attributionWindowDays: number };
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

interface Briefing {
  id: string; title: string; description: string; type: string; deadline: string | null;
  requirements: string | null; hashtags: string | null; mentions: string | null;
  dos: string | null; donts: string | null; referenceUrls: string | null;
  campaign: { name: string } | null; _count: { submissions: number };
}
interface ContentSubmission {
  id: string; type: string; platform: string; contentUrl: string; caption: string | null;
  status: string; reviewNotes: string | null; publishedAt: string | null; createdAt: string;
  briefing: { id: string; title: string } | null;
}
interface Seeding {
  id: string; status: string; shippedAt: string | null; deliveredAt: string | null;
  product: { name: string; imageUrl: string | null } | null;
  briefing: { title: string } | null;
}

const CONTENT_TYPES = [
  { value: "REEL", label: "Reel" }, { value: "STORY", label: "Story" },
  { value: "POST", label: "Post" }, { value: "TIKTOK", label: "TikTok" },
  { value: "YOUTUBE", label: "YouTube" }, { value: "OTHER", label: "Otro" },
];
const PLATFORMS = [
  { value: "INSTAGRAM", label: "Instagram" }, { value: "TIKTOK", label: "TikTok" },
  { value: "YOUTUBE", label: "YouTube" }, { value: "OTHER", label: "Otro" },
];

// ── Sub-components ──
function SaleToast({ amount, onDone }: { amount: number; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 4000); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-[slideDown_0.3s_ease-out]">
      <div className="bg-green-500 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-sm font-medium">
        <span className="text-lg">🎉</span> Nueva venta: {fmtARS(amount)}
      </div>
    </div>
  );
}

function ChangeArrow({ value }: { value: number }) {
  if (value === 0) return null;
  const isUp = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isUp ? "text-green-400" : "text-red-400"}`}>
      {isUp ? "↑" : "↓"} {Math.abs(value).toFixed(0)}%
    </span>
  );
}

// ══════════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════════
export default function PublicInfluencerDashboard() {
  const params = useParams();
  const slug = params.slug as string;
  const code = params.code as string;

  // ── Core state ──
  const [activeTab, setActiveTab] = useState<"ganancias" | "contenido">("ganancias");
  const [darkMode, setDarkMode] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // ── Password ──
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [authenticatedPassword, setAuthenticatedPassword] = useState<string | null>(null);
  const [lockedInfo, setLockedInfo] = useState<{ name: string; profileImage: string | null; orgName: string } | null>(null);

  // ── Ganancias state ──
  const [data, setData] = useState<DashboardData | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [linkCopied, setLinkCopied] = useState(false);
  const [toast, setToast] = useState<number | null>(null);
  const prevSalesCount = useRef<number | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; date: string; sales: number } | null>(null);

  // ── Contenido state ──
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [submissions, setSubmissions] = useState<ContentSubmission[]>([]);
  const [seedings, setSeedings] = useState<Seeding[]>([]);
  const [contentLoaded, setContentLoaded] = useState(false);
  const [expandedBriefId, setExpandedBriefId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [contentForm, setContentForm] = useState({
    contentUrl: "", type: "REEL", platform: "INSTAGRAM", caption: "", notes: "", briefingId: "",
  });

  // ── Fetch dashboard data ──
  const fetchDashboard = useCallback(() => {
    const url = authenticatedPassword
      ? `/api/public/influencers/${slug}/${code}?password=${encodeURIComponent(authenticatedPassword)}`
      : `/api/public/influencers/${slug}/${code}`;
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => {
        if (d.requiresPassword) {
          setRequiresPassword(true);
          setLockedInfo({ name: d.influencer?.name || "", profileImage: d.influencer?.profileImage || null, orgName: d.organization?.name || "" });
          setLoading(false);
          return;
        }
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

  // ── Fetch content data (lazy — only when tab is activated) ──
  const fetchContent = useCallback(() => {
    const passQs = authenticatedPassword ? `?password=${encodeURIComponent(authenticatedPassword)}` : "";
    fetch(`/api/public/influencers/${slug}/${code}/content${passQs}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => {
        setBriefings(d.briefings || []);
        setSubmissions(d.submissions || []);
        setSeedings(d.seedings || []);
        setContentLoaded(true);
      })
      .catch(() => {});
  }, [slug, code, authenticatedPassword]);

  useEffect(() => {
    fetchDashboard();
    if (!requiresPassword) {
      const interval = setInterval(fetchDashboard, 30000);
      return () => clearInterval(interval);
    }
  }, [fetchDashboard, requiresPassword]);

  // Lazy load content data when tab switches
  useEffect(() => {
    if (activeTab === "contenido" && !contentLoaded && authenticatedPassword !== undefined) {
      fetchContent();
    }
  }, [activeTab, contentLoaded, fetchContent, authenticatedPassword]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setPasswordError(false);
    try {
      const res = await fetch(`/api/public/influencers/${slug}/${code}/verify`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = await res.json();
      if (result.valid) {
        setLoading(true);
        setAuthenticatedPassword(password);
        setRequiresPassword(false);
      } else { setPasswordError(true); }
    } catch { setPasswordError(true); }
  };

  const handleContentSubmit = async () => {
    if (!contentForm.contentUrl) return;
    setSubmitting(true);
    try {
      await fetch(`/api/public/influencers/${slug}/${code}/content`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...contentForm, password: authenticatedPassword, briefingId: contentForm.briefingId || null }),
      });
      setSubmitted(true);
      setContentForm({ contentUrl: "", type: "REEL", platform: "INSTAGRAM", caption: "", notes: "", briefingId: "" });
      setTimeout(() => { setSubmitted(false); setShowForm(false); fetchContent(); }, 2000);
    } finally { setSubmitting(false); }
  };

  // ── Theme ──
  const bg = darkMode ? "bg-[#0a0714]" : "bg-gradient-to-br from-gray-50 via-white to-gray-100";
  const textPrimary = darkMode ? "text-white" : "text-gray-900";
  const textSecondary = darkMode ? "text-gray-400" : "text-gray-500";
  const textMuted = darkMode ? "text-gray-500" : "text-gray-400";
  const textFooter = darkMode ? "text-gray-600" : "text-gray-400";
  const textFooterBrand = darkMode ? "text-gray-700" : "text-gray-500";
  const card = darkMode ? "bg-white/5 backdrop-blur-sm border border-white/10" : "bg-white border border-gray-200 shadow-sm";
  const inputBg = darkMode ? "bg-white/5 border-white/10 text-white placeholder-gray-500" : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400";

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      PENDING: darkMode ? "bg-yellow-500/20 text-yellow-400" : "bg-yellow-50 text-yellow-700",
      APPROVED: darkMode ? "bg-green-500/20 text-green-400" : "bg-green-50 text-green-700",
      REVISION: darkMode ? "bg-fuchsia-500/20 text-fuchsia-400" : "bg-fuchsia-50 text-fuchsia-700",
      REJECTED: darkMode ? "bg-red-500/20 text-red-400" : "bg-red-50 text-red-700",
    };
    return map[status] || (darkMode ? "bg-white/10 text-gray-400" : "bg-gray-50 text-gray-500");
  };

  const seedingStatusMap: Record<string, { label: string; color: string }> = {
    PENDING: { label: "Preparando", color: "text-yellow-400" },
    SHIPPED: { label: "En camino", color: "text-blue-400" },
    DELIVERED: { label: "Entregado", color: "text-green-400" },
    CONTENT_RECEIVED: { label: "Completado", color: "text-purple-400" },
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className={`min-h-screen ${bg} flex items-center justify-center`}>
        <div className="flex flex-col items-center gap-6">
          <div className="flex items-end gap-1.5 h-10">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="w-1.5 rounded-full" style={{ animation: `pulse 1.2s ease-in-out ${i * 0.15}s infinite`, height: "40%", background: "linear-gradient(180deg,#ff0080,#a855f7,#00d4ff)" }} />
            ))}
          </div>
          <div className="text-center">
            <p className={`${textSecondary} text-sm font-medium`}>Preparando tu dashboard</p>
            <p className={`${textMuted} text-xs mt-1 font-mono`}>Conectando datos en tiempo real...</p>
          </div>
          <style>{`@keyframes pulse { 0%, 100% { height: 20%; opacity: 0.4; } 50% { height: 100%; opacity: 1; } }`}</style>
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
              <img src={lockedInfo.profileImage} alt="" className="w-16 h-16 rounded-full mx-auto mb-4 border-2 border-fuchsia-500/40" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#ff0080] via-[#a855f7] to-[#00d4ff] flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4">
                {lockedInfo?.name?.[0]?.toUpperCase() || "?"}
              </div>
            )}
            <h1 className={`text-xl font-bold ${textPrimary}`}>{lockedInfo?.name}</h1>
            <p className={`text-sm ${textMuted} mt-1`}>{lockedInfo?.orgName}</p>
          </div>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className={`${card} rounded-2xl p-6`}>
              <p className={`text-sm ${textSecondary} mb-4 text-center`}>Este dashboard esta protegido con contraseña</p>
              <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setPasswordError(false); }}
                placeholder="Ingresa la contraseña" className={`w-full px-4 py-3 ${inputBg} border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500/30 focus:border-fuchsia-500/60`} autoFocus />
              {passwordError && <p className="text-red-400 text-xs mt-2 text-center">Contraseña incorrecta</p>}
            </div>
            <button type="submit" className="w-full py-3 bg-gradient-to-r from-[#ff0080] via-[#a855f7] to-[#00d4ff] text-white rounded-xl text-sm font-medium hover:brightness-110 transition-all">Ingresar</button>
          </form>
          <p className={`text-[10px] ${textFooterBrand} text-center mt-6`}>Powered by <span className="text-fuchsia-500 font-medium">NitroSales</span></p>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error || !data) {
    return (
      <div className={`min-h-screen ${bg} flex items-center justify-center`}>
        <div className="text-center">
          <p className="text-4xl mb-4">⚠️</p>
          <p className={`${textPrimary} text-lg font-medium`}>No pudimos cargar el dashboard</p>
          <p className={`${textSecondary} text-sm mt-2`}>Verificá el link o intentá de nuevo en unos segundos</p>
          <button onClick={() => { setError(false); setLoading(true); fetchDashboard(); }}
            className="mt-4 px-6 py-2 bg-fuchsia-500 text-white rounded-xl text-sm font-medium hover:bg-fuchsia-600 transition-all">Reintentar</button>
        </div>
      </div>
    );
  }

  const maxSale = Math.max(...data.dailyChart.map((d) => d.sales), 1);

  return (
    <div className={`min-h-screen ${bg} ${textPrimary} transition-colors duration-300`}>
      {toast !== null && <SaleToast amount={toast} onDone={() => setToast(null)} />}

      {/* ── Header ── */}
      <header className="px-4 pt-6 pb-2 sm:px-6">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {data.influencer.profileImage ? (
                <img src={data.influencer.profileImage} alt="" className="w-10 h-10 rounded-full object-cover border-2 border-fuchsia-500/40" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#ff0080] via-[#a855f7] to-[#00d4ff] flex items-center justify-center text-white font-bold text-lg">
                  {data.influencer.name[0]?.toUpperCase()}
                </div>
              )}
              <div>
                <h1 className="text-lg font-bold">{data.influencer.name}</h1>
                <div className="flex items-center gap-2">
                  <p className={`text-xs ${textMuted}`}>{data.organization.name}</p>
                  {data.tier && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-fuchsia-500/20 text-fuchsia-400 font-medium">
                      {data.tier.label || `Tier ${data.tier.commissionPercent}%`} — {data.tier.commissionPercent}%
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setDarkMode(!darkMode)}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all ${darkMode ? "bg-white/10 hover:bg-white/20" : "bg-gray-100 hover:bg-gray-200"}`}
                title={darkMode ? "Modo claro" : "Modo oscuro"}>
                {darkMode ? "☀️" : "🌙"}
              </button>
              {activeTab === "ganancias" && (
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className={`text-[10px] ${textMuted} font-mono uppercase tracking-wider`}>Live</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Tab Switcher ── */}
          <div className={`flex rounded-xl ${darkMode ? "bg-white/5" : "bg-gray-100"} p-1`}>
            <button
              onClick={() => setActiveTab("ganancias")}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === "ganancias"
                  ? "bg-fuchsia-500 text-white shadow-sm"
                  : darkMode ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-900"
              }`}
            >
              Mis Ganancias
            </button>
            <button
              onClick={() => setActiveTab("contenido")}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === "contenido"
                  ? "bg-fuchsia-500 text-white shadow-sm"
                  : darkMode ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-900"
              }`}
            >
              Mi Contenido
            </button>
          </div>

          {/* ── Attribution window badge — trust signal ── */}
          <div className="mt-3">
            <div
              className="relative rounded-xl p-[1px] overflow-hidden"
              style={{
                background:
                  "linear-gradient(135deg, #ff0080 0%, #a855f7 50%, #00d4ff 100%)",
              }}
            >
              <div
                className={`rounded-[11px] px-3 py-2.5 flex items-center gap-3 ${
                  darkMode ? "bg-black/85" : "bg-white"
                }`}
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(255,0,128,0.18), rgba(0,212,255,0.18))",
                    border: "1px solid rgba(168,85,247,0.35)",
                  }}
                >
                  <span className="text-base">🎯</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className={`text-[10px] uppercase tracking-[0.14em] font-semibold ${
                      darkMode ? "text-white/55" : "text-gray-500"
                    }`}
                  >
                    Tu ventana de atribución
                  </div>
                  <div
                    className={`text-[13px] font-semibold leading-tight ${
                      darkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    <span
                      className="bg-clip-text text-transparent"
                      style={{
                        backgroundImage:
                          "linear-gradient(90deg,#ff0080,#a855f7,#00d4ff)",
                      }}
                    >
                      {data.influencer.attributionWindowDays} días
                    </span>{" "}
                    <span className={darkMode ? "text-white/70" : "text-gray-600"}>
                      de comisión garantizada
                    </span>
                  </div>
                  <div
                    className={`text-[10.5px] mt-0.5 leading-snug ${
                      darkMode ? "text-white/45" : "text-gray-500"
                    }`}
                  >
                    Tus fans compran hasta {data.influencer.attributionWindowDays}d después del click y la venta sigue siendo tuya. Powered by NitroPixel.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="px-4 pb-8 sm:px-6 pt-4">
        <div className="max-w-lg mx-auto space-y-4">

          {/* ═══════════════════════════════════════════════ */}
          {/* TAB 1: MIS GANANCIAS                           */}
          {/* ═══════════════════════════════════════════════ */}
          {activeTab === "ganancias" && (
            <>
              {/* KPI Grid: Today */}
              <div className="grid grid-cols-2 gap-3">
                <div className={`${card} rounded-2xl p-4`}>
                  <p className={`text-[10px] ${textMuted} uppercase tracking-wider font-medium mb-1`}>Ventas hoy</p>
                  <p className="text-2xl font-bold">{fmtARS(data.today.sales)}</p>
                  <p className={`text-xs ${textSecondary} mt-0.5`}>{fmt(data.today.conversions)} ventas</p>
                </div>
                <div className={`${card} rounded-2xl p-4`}>
                  <p className={`text-[10px] ${textMuted} uppercase tracking-wider font-medium mb-1`}>Comision hoy</p>
                  <p className="text-2xl font-bold text-fuchsia-400">{fmtARS(data.today.commission)}</p>
                  <p className={`text-xs ${textSecondary} mt-0.5`}>{data.influencer.commissionPercent}%</p>
                </div>
              </div>

              {/* Month KPIs */}
              <div className="grid grid-cols-2 gap-3">
                <div className={`${card} rounded-2xl p-4`}>
                  <div className="flex items-center justify-between mb-1">
                    <p className={`text-[10px] ${textMuted} uppercase tracking-wider font-medium`}>Mes actual</p>
                    <ChangeArrow value={data.comparison.salesChange} />
                  </div>
                  <p className="text-2xl font-bold">{fmtARS(data.thisMonth.sales)}</p>
                  <p className={`text-xs ${textSecondary} mt-0.5`}>{fmt(data.thisMonth.conversions)} ventas</p>
                </div>
                <div className="bg-gradient-to-br from-fuchsia-500/20 via-purple-500/10 to-cyan-500/10 backdrop-blur-sm rounded-2xl p-4 border border-fuchsia-500/25">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] text-fuchsia-300/80 uppercase tracking-wider font-medium">Mi comision</p>
                    <ChangeArrow value={data.comparison.commissionChange} />
                  </div>
                  <p className="text-2xl font-bold text-fuchsia-400">{fmtARS(data.thisMonth.commission)}</p>
                  <p className="text-xs text-fuchsia-300/60 mt-0.5">{data.influencer.commissionPercent}% de {fmtARS(data.thisMonth.sales)}</p>
                </div>
              </div>

              {/* Chart */}
              {data.dailyChart.length > 0 && (
                <div className={`${card} rounded-2xl p-5`}>
                  <p className={`text-xs ${textSecondary} uppercase tracking-wider font-medium mb-4`}>Ultimos 30 dias</p>
                  <div className="relative flex items-end gap-[2px] h-28" onMouseLeave={() => setTooltip(null)}>
                    {data.dailyChart.map((d, i) => {
                      const height = (d.sales / maxSale) * 100;
                      return (
                        <div key={i} className="flex-1 bg-fuchsia-500/60 rounded-t-sm transition-all duration-200 hover:bg-fuchsia-400 cursor-pointer"
                          style={{ height: `${Math.max(height, 2)}%` }}
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const parent = e.currentTarget.parentElement?.getBoundingClientRect();
                            setTooltip({ x: rect.left - (parent?.left || 0) + rect.width / 2, date: formatDate(d.date), sales: d.sales });
                          }} />
                      );
                    })}
                    {tooltip && (
                      <div className="absolute -top-10 pointer-events-none z-10 transform -translate-x-1/2" style={{ left: tooltip.x }}>
                        <div className={`${darkMode ? "bg-gray-800" : "bg-gray-900"} text-white text-[10px] px-2 py-1 rounded-lg shadow-lg whitespace-nowrap`}>
                          {tooltip.date}: {fmtARS(tooltip.sales)}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between mt-2">
                    {data.dailyChart.length > 0 && (
                      <>
                        <span className={`text-[10px] ${textFooter}`}>{formatDate(data.dailyChart[0].date)}</span>
                        {data.dailyChart.length > 14 && (
                          <span className={`text-[10px] ${textFooter}`}>{formatDate(data.dailyChart[Math.floor(data.dailyChart.length / 2)].date)}</span>
                        )}
                        <span className={`text-[10px] ${textFooter}`}>{formatDate(data.dailyChart[data.dailyChart.length - 1].date)}</span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Campaigns */}
              {data.campaigns.length > 0 && (
                <div className={`${card} rounded-2xl p-5`}>
                  <p className={`text-xs ${textSecondary} uppercase tracking-wider font-medium mb-3`}>Campañas activas</p>
                  <div className="space-y-3">
                    {data.campaigns.map((c, i) => (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">{c.name}</span>
                          <span className="text-sm font-bold text-fuchsia-400">{fmtARS(c.revenue)}</span>
                        </div>
                        {c.bonusTarget && c.bonusAmount && c.progress !== null && (
                          <div>
                            <div className={`h-2 rounded-full ${darkMode ? "bg-white/10" : "bg-gray-100"} overflow-hidden`}>
                              <div className={`h-full rounded-full transition-all duration-500 ${c.progress >= 100 ? "bg-green-400" : "bg-gradient-to-r from-fuchsia-500 via-purple-400 to-cyan-400"}`}
                                style={{ width: `${c.progress}%` }} />
                            </div>
                            <div className="flex justify-between mt-1">
                              <span className={`text-[10px] ${textMuted}`}>{c.progress >= 100 ? "🎉 Bono alcanzado!" : `${c.progress.toFixed(0)}% del objetivo`}</span>
                              <span className={`text-[10px] ${textMuted}`}>Bono: {fmtARS(c.bonusAmount)} al llegar a {fmtARS(c.bonusTarget)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Coupons */}
              {data.coupons.length > 0 && (
                <div className={`${card} rounded-2xl p-5`}>
                  <p className={`text-xs ${textSecondary} uppercase tracking-wider font-medium mb-3`}>Mis cupones</p>
                  <div className="flex flex-wrap gap-2">
                    {data.coupons.map((c, i) => (
                      <div key={i} className={`${darkMode ? "bg-white/10 border-white/10" : "bg-fuchsia-50 border-fuchsia-200"} border rounded-xl px-3 py-2 flex items-center gap-2`}>
                        <span className="text-sm font-bold font-mono text-fuchsia-400">{c.code}</span>
                        <span className={`text-[10px] ${textMuted}`}>
                          {c.discountPercent ? `${c.discountPercent}% off` : c.discountFixed ? `${fmtARS(c.discountFixed)} off` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tracking Link */}
              {data.trackingUrl && (
                <div className={`${card} rounded-2xl p-5`}>
                  <p className={`text-xs ${textSecondary} uppercase tracking-wider font-medium mb-2`}>Mi link de tracking</p>
                  <div className="flex items-center gap-2">
                    <div className={`flex-1 min-w-0 ${darkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200"} border rounded-xl px-3 py-2`}>
                      <p className={`text-xs font-mono truncate ${darkMode ? "text-fuchsia-400" : "text-fuchsia-500"}`}>{data.trackingUrl}</p>
                    </div>
                    <button onClick={() => { navigator.clipboard.writeText(data.trackingUrl); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }}
                      className={`px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${linkCopied ? "bg-green-500 text-white" : "bg-fuchsia-500 text-white hover:bg-fuchsia-600"}`}>
                      {linkCopied ? "Copiado!" : "Copiar"}
                    </button>
                  </div>
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Conversion", value: `${data.stats.conversionRate.toFixed(1)}%` },
                  { label: "Ticket prom", value: fmtARS(data.stats.avgOrderValue) },
                  { label: "Visitantes", value: fmt(data.stats.uniqueVisitors) },
                ].map((stat) => (
                  <div key={stat.label} className={`${card} rounded-xl p-3 text-center`}>
                    <p className={`text-[10px] ${textMuted} uppercase tracking-wider`}>{stat.label}</p>
                    <p className="text-sm font-bold mt-1">{stat.value}</p>
                  </div>
                ))}
              </div>

              {/* Top Products */}
              {data.topProducts !== undefined && (
                <div className={`${card} rounded-2xl p-5`}>
                  <p className={`text-xs ${textSecondary} uppercase tracking-wider font-medium mb-3`}>Productos vendidos (este mes)</p>
                  {data.topProducts.length > 0 ? (
                    <div className="space-y-3">
                      {data.topProducts.map((p, i) => {
                        const src = (p.imageUrl || "").trim();
                        const httpsSrc = src.startsWith("http://")
                          ? src.replace(/^http:\/\//i, "https://")
                          : src;
                        return (
                          <div key={i} className="flex items-center gap-3">
                            {httpsSrc ? (
                              <img
                                src={httpsSrc}
                                alt=""
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                className="w-9 h-9 rounded-lg object-cover border border-white/10 bg-white/5"
                                onError={(e) => {
                                  const img = e.currentTarget;
                                  img.style.display = "none";
                                  const fallback = img.nextElementSibling as HTMLElement | null;
                                  if (fallback) fallback.style.display = "flex";
                                }}
                              />
                            ) : null}
                            <div
                              className={`w-9 h-9 rounded-lg ${darkMode ? "bg-white/10" : "bg-gray-100"} items-center justify-center text-xs`}
                              style={{ display: httpsSrc ? "none" : "flex" }}
                            >
                              📦
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{p.name}</p>
                              <p className={`text-[10px] ${textMuted}`}>{p.units} {p.units === 1 ? "unidad" : "unidades"}</p>
                            </div>
                            <p className="text-sm font-bold text-fuchsia-400">{fmtARS(p.revenue)}</p>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-2xl mb-2">📦</p>
                      <p className={`text-sm ${textSecondary}`}>Todavia no hay ventas este mes</p>
                      <p className={`text-xs ${textMuted} mt-1`}>Cuando generes ventas con tu link, vas a ver aca que productos se vendieron y cuantas unidades</p>
                    </div>
                  )}
                </div>
              )}

              {/* Best Days */}
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

              {/* Recent Sales */}
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
                          <span className="text-xs text-fuchsia-400 ml-2">+{fmtARS(sale.commission)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* All-time */}
              <div className={`${card} rounded-2xl p-5`}>
                <p className={`text-xs ${textSecondary} uppercase tracking-wider font-medium mb-3`}>Total historico</p>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-lg font-bold">{fmtARS(data.allTime.sales)}</p>
                    <p className={`text-[10px] ${textMuted}`}>Revenue</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-fuchsia-400">{fmtARS(data.allTime.commission)}</p>
                    <p className={`text-[10px] ${textMuted}`}>Comision</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold">{fmt(data.allTime.conversions)}</p>
                    <p className={`text-[10px] ${textMuted}`}>Ventas</p>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="text-center pt-4">
                <p className={`text-[10px] ${textFooter}`}>Actualizado {lastUpdate.toLocaleTimeString("es-AR")} · Se refresca cada 30s</p>
                <p className={`text-[10px] ${textFooterBrand} mt-1`}>Powered by <span className="text-fuchsia-500 font-medium">NitroSales</span></p>
              </div>
            </>
          )}

          {/* ═══════════════════════════════════════════════ */}
          {/* TAB 2: MI CONTENIDO                            */}
          {/* ═══════════════════════════════════════════════ */}
          {activeTab === "contenido" && (
            <>
              {!contentLoaded ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-2 h-2 rounded-full bg-fuchsia-500 animate-pulse" />
                  <p className={`${textMuted} text-sm font-mono ml-3`}>Cargando contenido...</p>
                </div>
              ) : (
                <>
                  {/* Briefings */}
                  {briefings.length > 0 && (
                    <div className={`${card} rounded-2xl p-5`}>
                      <p className={`text-xs ${textSecondary} uppercase tracking-wider font-medium mb-3`}>Briefs activos</p>
                      <div className="space-y-3">
                        {briefings.map((b) => (
                          <div key={b.id}>
                            <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedBriefId(expandedBriefId === b.id ? null : b.id)}>
                              <div className="flex items-center gap-2">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${darkMode ? "bg-fuchsia-500/20 text-fuchsia-400" : "bg-fuchsia-50 text-fuchsia-700"}`}>{b.type}</span>
                                <span className="text-sm font-medium">{b.title}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {b.deadline && <span className={`text-[10px] ${textMuted} font-mono`}>{new Date(b.deadline).toLocaleDateString("es-AR")}</span>}
                                <svg className={`w-3.5 h-3.5 ${textMuted} transition-transform ${expandedBriefId === b.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                              </div>
                            </div>
                            {expandedBriefId === b.id && (
                              <div className={`mt-3 pl-2 border-l-2 ${darkMode ? "border-fuchsia-500/40" : "border-fuchsia-200"} space-y-2`}>
                                <p className={`text-xs ${textSecondary} whitespace-pre-wrap`}>{b.description}</p>
                                {b.dos && <p className="text-xs text-green-400">✓ {b.dos}</p>}
                                {b.donts && <p className="text-xs text-red-400">✗ {b.donts}</p>}
                                {b.hashtags && <p className="text-xs text-fuchsia-400">{b.hashtags}</p>}
                                {b.mentions && <p className="text-xs text-blue-400">{b.mentions}</p>}
                                {b.requirements && <p className={`text-[10px] ${textMuted}`}>Req: {b.requirements}</p>}
                                {b.referenceUrls && (
                                  <div>
                                    <p className={`text-[10px] ${textMuted} mb-1`}>Referencias:</p>
                                    {b.referenceUrls.split("\n").filter(Boolean).map((url, i) => (
                                      <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block text-[10px] text-fuchsia-400 hover:text-fuchsia-300 truncate">{url}</a>
                                    ))}
                                  </div>
                                )}
                                <button onClick={() => { setContentForm({ ...contentForm, briefingId: b.id }); setShowForm(true); }}
                                  className="mt-2 px-3 py-1.5 bg-fuchsia-500 text-white rounded-lg text-xs font-medium hover:bg-fuchsia-600">
                                  Subir contenido para este brief
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Seedings */}
                  {seedings.length > 0 && (
                    <div className={`${card} rounded-2xl p-5`}>
                      <p className={`text-xs ${textSecondary} uppercase tracking-wider font-medium mb-3`}>Productos recibidos</p>
                      <div className="space-y-3">
                        {seedings.map((s) => (
                          <div key={s.id} className="flex items-center gap-3">
                            {s.product?.imageUrl ? (
                              <img src={s.product.imageUrl} alt="" className="w-9 h-9 rounded-lg object-cover" />
                            ) : (
                              <div className={`w-9 h-9 rounded-lg ${darkMode ? "bg-white/10" : "bg-gray-100"} flex items-center justify-center text-xs`}>📦</div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{s.product?.name || "Producto"}</p>
                              {s.briefing && <p className={`text-[10px] ${textMuted}`}>Brief: {s.briefing.title}</p>}
                            </div>
                            <span className={`text-xs font-medium ${(seedingStatusMap[s.status] || { color: "text-gray-400" }).color}`}>
                              {(seedingStatusMap[s.status] || { label: s.status }).label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Submit button */}
                  {!showForm && (
                    <button onClick={() => setShowForm(true)}
                      className="w-full py-3 bg-gradient-to-r from-[#ff0080] via-[#a855f7] to-[#00d4ff] text-white rounded-2xl text-sm font-medium hover:brightness-110 transition-all">
                      + Subir contenido
                    </button>
                  )}

                  {/* Submit form */}
                  {showForm && (
                    <div className={`${card} rounded-2xl p-5 space-y-3`}>
                      <p className={`text-xs ${textSecondary} uppercase tracking-wider font-medium`}>Subir contenido</p>
                      {submitted ? (
                        <div className="text-center py-6">
                          <p className="text-3xl mb-2">✓</p>
                          <p className="text-sm font-medium text-green-400">Contenido enviado!</p>
                          <p className={`text-xs ${textMuted} mt-1`}>El equipo lo va a revisar pronto</p>
                        </div>
                      ) : (
                        <>
                          <input value={contentForm.contentUrl} onChange={(e) => setContentForm({ ...contentForm, contentUrl: e.target.value })}
                            placeholder="URL del contenido publicado *" className={`w-full px-3 py-2 ${inputBg} border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500/30`} />
                          <div className="grid grid-cols-2 gap-3">
                            <select value={contentForm.type} onChange={(e) => setContentForm({ ...contentForm, type: e.target.value })} className={`w-full px-3 py-2 ${inputBg} border rounded-xl text-sm`}>
                              {CONTENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                            <select value={contentForm.platform} onChange={(e) => setContentForm({ ...contentForm, platform: e.target.value })} className={`w-full px-3 py-2 ${inputBg} border rounded-xl text-sm`}>
                              {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                            </select>
                          </div>
                          <textarea value={contentForm.caption} onChange={(e) => setContentForm({ ...contentForm, caption: e.target.value })}
                            placeholder="Caption que usaste (opcional)" className={`w-full px-3 py-2 ${inputBg} border rounded-xl text-sm resize-none`} style={{ minHeight: "60px" }} />
                          <input value={contentForm.notes} onChange={(e) => setContentForm({ ...contentForm, notes: e.target.value })}
                            placeholder="Notas para el equipo (opcional)" className={`w-full px-3 py-2 ${inputBg} border rounded-xl text-sm`} />
                          {briefings.length > 0 && !contentForm.briefingId && (
                            <select value={contentForm.briefingId} onChange={(e) => setContentForm({ ...contentForm, briefingId: e.target.value })} className={`w-full px-3 py-2 ${inputBg} border rounded-xl text-sm`}>
                              <option value="">Sin brief asociado</option>
                              {briefings.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
                            </select>
                          )}
                          {contentForm.briefingId && (
                            <p className={`text-xs ${textMuted}`}>
                              Brief: {briefings.find((b) => b.id === contentForm.briefingId)?.title}
                              <button onClick={() => setContentForm({ ...contentForm, briefingId: "" })} className="ml-2 text-fuchsia-400">cambiar</button>
                            </p>
                          )}
                          <div className="flex gap-2">
                            <button onClick={handleContentSubmit} disabled={submitting || !contentForm.contentUrl}
                              className="flex-1 py-2.5 bg-fuchsia-500 text-white rounded-xl text-sm font-medium hover:bg-fuchsia-600 disabled:opacity-50">
                              {submitting ? "Enviando..." : "Enviar contenido"}
                            </button>
                            <button onClick={() => { setShowForm(false); setContentForm({ contentUrl: "", type: "REEL", platform: "INSTAGRAM", caption: "", notes: "", briefingId: "" }); }}
                              className={`px-4 py-2.5 rounded-xl text-sm ${darkMode ? "bg-white/10 text-gray-300" : "bg-gray-100 text-gray-600"}`}>
                              Cancelar
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Submission history */}
                  {submissions.length > 0 && (
                    <div className={`${card} rounded-2xl p-5`}>
                      <p className={`text-xs ${textSecondary} uppercase tracking-wider font-medium mb-3`}>Mis envios</p>
                      <div className="space-y-3">
                        {submissions.map((s) => (
                          <div key={s.id} className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] ${textMuted}`}>{s.platform} · {s.type}</span>
                                {s.briefing && (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${darkMode ? "bg-blue-500/20 text-blue-400" : "bg-blue-50 text-blue-600"}`}>{s.briefing.title}</span>
                                )}
                              </div>
                              <a href={s.contentUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-fuchsia-400 truncate block mt-0.5">{s.contentUrl}</a>
                              {s.reviewNotes && (
                                <p className={`text-[10px] mt-1 ${s.status === "APPROVED" ? "text-green-400" : s.status === "REVISION" ? "text-fuchsia-400" : s.status === "REJECTED" ? "text-red-400" : textMuted}`}>
                                  Feedback: {s.reviewNotes}
                                </p>
                              )}
                            </div>
                            <span className={`ml-3 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${statusBadge(s.status)}`}>
                              {s.status === "PENDING" ? "En revision" : s.status === "APPROVED" ? "Aprobado" : s.status === "REVISION" ? "Ajustar" : s.status === "REJECTED" ? "Rechazado" : s.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Empty state */}
                  {briefings.length === 0 && submissions.length === 0 && seedings.length === 0 && !showForm && (
                    <div className={`${card} rounded-2xl p-8 text-center`}>
                      <p className="text-3xl mb-2">📋</p>
                      <p className={`text-sm ${textSecondary}`}>Todavia no hay briefs ni contenido</p>
                      <p className={`text-xs ${textMuted} mt-1`}>Cuando el equipo te asigne un brief o quieras subir contenido, todo va a aparecer aca</p>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="text-center pt-4">
                    <p className={`text-[10px] ${textFooterBrand}`}>Powered by <span className="text-fuchsia-500 font-medium">NitroSales</span></p>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </main>

      <style jsx global>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}
