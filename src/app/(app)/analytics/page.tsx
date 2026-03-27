"use client";

import { useState, useEffect, useMemo, Fragment } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  BarChart, Bar,
} from "recharts";

// ══════════════════════════════════════════════════════════════
// Analytics Dashboard — GA4 Ecommerce Intelligence
// ══════════════════════════════════════════════════════════════

const MS_PER_DAY = 86400000;
const fmt = (n: number) => n.toLocaleString("es-AR");
const fmtARS = (n: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
const COLORS = ["#6366F1", "#06b6d4", "#a855f7", "#22c55e", "#eab308", "#ec4899", "#f97316", "#14b8a6"];

const EVENT_LABELS: Record<string, string> = {
  PAGE_VIEW: "Vistas de Pagina", VIEW_PRODUCT: "Vista Producto",
  ADD_TO_CART: "Agregar al Carrito", PURCHASE: "Compra",
  IDENTIFY: "Identificacion", CUSTOM: "Custom",
};

type PixelData = {
  kpis: { totalVisitors: number; totalSessions: number; totalPageViews: number; pagesPerSession: number; changes: { visitors: number; sessions: number; pageViews: number } };
  funnel: { pageView: number; viewProduct: number; addToCart: number; checkoutStart: number; purchase: number };
  dailyVisitors: Array<{ day: string; visitors: number; sessions: number; pageViews: number }>;
  deviceBreakdown: Array<{ device: string; count: number; percentage: number }>;
  eventTypes: Array<{ type: string; count: number; uniqueVisitors: number; percentage: number }>;
  popularPages: Array<{ url: string; pageViews: number; uniqueVisitors: number }>;
  businessKpis: { webOrders: number; webRevenue: number; totalOrders: number };
};

type GA4Data = {
  geographic: Array<{ region: string; city: string; sessions: number; purchases: number; revenue: number; users: number }>;
  products: Array<{ name: string; id: string; category: string; brand: string; views: number; purchases: number; revenue: number; viewToPurchaseRate: number; imageUrl: string | null }>;
  searches: Array<{ term: string; count: number }>;
  trafficRevenue: Array<{ source: string; medium: string; sessions: number; users: number; purchases: number; revenue: number; revenuePerSession: number; conversionRate: number }>;
  landingPages: Array<{ path: string; sessions: number; bounceRate: number; purchases: number; revenue: number }>;
  hourly: Array<{ hour: number; sessions: number; purchases: number }>;
  dayOfWeek: Array<{ day: number; dayName: string; sessions: number; purchases: number }>;
  newVsReturning: Array<{ type: string; sessions: number; users: number; purchases: number; revenue: number }>;
  abandonment: { cartAbandonmentRate: number; checkoutAbandonmentRate: number; totalAddToCarts: number; totalCheckouts: number; totalPurchases: number };
  categories: Array<{ category: string; views: number; purchases: number; revenue: number; conversionRate: number }>;
  brands: Array<{ brand: string; views: number; purchases: number; revenue: number; conversionRate: number }>;
  salesByZone: Array<{ zone: string; orders: number; revenue: number; avgTicket: number; avgShipping: number | null; shippingPct: number | null; ordersWithShipping: number }>;
};

function KpiCard({ label, value, sub, change, color }: { label: string; value: string; sub?: string; change?: number; color: string }) {
  const cm: Record<string, string> = {
    indigo: "from-indigo-50 to-indigo-100/50 border-indigo-200",
    cyan: "from-cyan-50 to-cyan-100/50 border-cyan-200",
    purple: "from-purple-50 to-purple-100/50 border-purple-200",
    orange: "from-orange-50 to-orange-100/50 border-orange-200",
    emerald: "from-emerald-50 to-emerald-100/50 border-emerald-200",
    red: "from-red-50 to-red-100/50 border-red-200",
  };
  return (
    <div className={`rounded-xl border bg-gradient-to-br ${cm[color] || cm.indigo} p-3`}>
      <p className="text-[11px] text-gray-500 mb-1">{label}</p>
      <p className="text-lg font-bold text-gray-800">{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
      {change !== undefined && change !== 0 && (
        <span className={`text-[10px] font-medium ${change > 0 ? "text-emerald-600" : "text-red-500"}`}>
          {change > 0 ? "+" : ""}{change}% vs anterior
        </span>
      )}
    </div>
  );
}

function SectionCard({ title, children, badge, maxH }: { title: string; children: React.ReactNode; badge?: string; maxH?: string }) {
  return (
    <div className="rounded-2xl bg-white border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        {badge && <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{badge}</span>}
      </div>
      {maxH ? (
        <div className="overflow-y-auto" style={{ maxHeight: maxH }}>
          {children}
        </div>
      ) : children}
    </div>
  );
}

function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="relative max-w-lg max-h-[80vh] p-2" onClick={e => e.stopPropagation()}>
        <img src={src} alt={alt} className="max-w-full max-h-[75vh] rounded-xl shadow-2xl bg-white object-contain" />
        <button onClick={onClose}
          className="absolute -top-2 -right-2 w-7 h-7 bg-white rounded-full shadow-lg flex items-center justify-center text-gray-500 hover:text-gray-800 text-sm font-bold">×</button>
        <p className="text-center text-white text-xs mt-2 truncate max-w-[400px] mx-auto">{alt}</p>
      </div>
    </div>
  );
}

function cleanUrl(url: string) {
  try { const u = new URL(url); return u.pathname + (u.search || ""); }
  catch { return url.replace(/https?:\/\/[^/]+/, "").replace(/\?.*/, ""); }
}

export default function AnalyticsPage() {
  const [d, setD] = useState<PixelData | null>(null);
  const [ga4, setGa4] = useState<GA4Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [range, setRange] = useState(() => {
    const to = new Date(); to.setHours(23, 59, 59, 999);
    const from = new Date(to.getTime() - 6 * MS_PER_DAY); from.setHours(0, 0, 0, 0);
    return { from, to };
  });

  const dateLabel = (d: Date) => d.toISOString().split("T")[0];

  useEffect(() => {
    setLoading(true); setError(null);
    const from = dateLabel(range.from), to = dateLabel(range.to);
    Promise.all([
      fetch(`/api/metrics/pixel?from=${from}&to=${to}&model=NITRO`).then(r => r.json()),
      fetch(`/api/metrics/analytics?from=${from}&to=${to}`).then(r => r.json()),
    ]).then(([pixelData, analyticsData]) => {
      setD(pixelData);
      setGa4(analyticsData?.error ? null : analyticsData);
      setLoading(false);
    }).catch(e => { setError(e.message); setLoading(false); });
  }, [range]);

  const setPreset = (days: number) => {
    const to = new Date(); to.setHours(23, 59, 59, 999);
    const from = new Date(to.getTime() - (days - 1) * MS_PER_DAY); from.setHours(0, 0, 0, 0);
    setRange({ from, to });
  };

  const setCustomDate = (field: "from" | "to", value: string) => {
    const dt = new Date(value + "T00:00:00");
    if (isNaN(dt.getTime())) return;
    if (field === "from") { dt.setHours(0, 0, 0, 0); setRange(r => ({ ...r, from: dt })); }
    else { dt.setHours(23, 59, 59, 999); setRange(r => ({ ...r, to: dt })); }
  };

  // ── Product lightbox & pagination ──
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  const PRODUCTS_PER_PAGE = 50;
  const [prodPage, setProdPage] = useState(1);

  // ── Product filters & sorting ──
  const [prodSearch, setProdSearch] = useState("");
  const [prodCatFilter, setProdCatFilter] = useState("");
  const [prodBrandFilter, setProdBrandFilter] = useState("");
  const [prodSort, setProdSort] = useState<{ col: "views" | "purchases" | "revenue" | "viewToPurchaseRate"; dir: "asc" | "desc" }>({ col: "views", dir: "desc" });

  const filteredProducts = useMemo(() => {
    if (!ga4?.products) return [];
    let list = ga4.products;
    if (prodSearch) {
      const q = prodSearch.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q));
    }
    if (prodCatFilter) list = list.filter(p => p.category === prodCatFilter);
    if (prodBrandFilter) list = list.filter(p => p.brand === prodBrandFilter);
    return [...list].sort((a, b) => {
      const av = a[prodSort.col], bv = b[prodSort.col];
      return prodSort.dir === "desc" ? bv - av : av - bv;
    });
  }, [ga4?.products, prodSearch, prodCatFilter, prodBrandFilter, prodSort]);

  // Reset page when filters change
  useEffect(() => { setProdPage(1); }, [prodSearch, prodCatFilter, prodBrandFilter, prodSort]);

  const totalProdPages = Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE);
  const paginatedProducts = filteredProducts.slice((prodPage - 1) * PRODUCTS_PER_PAGE, prodPage * PRODUCTS_PER_PAGE);

  const productCategories = useMemo(() => {
    if (!ga4?.products) return [];
    const set = new Set(ga4.products.map(p => p.category).filter(Boolean).filter(c => c !== "(not set)"));
    return Array.from(set).sort();
  }, [ga4?.products]);

  const productBrands = useMemo(() => {
    if (!ga4?.products) return [];
    const set = new Set(ga4.products.map(p => p.brand).filter(Boolean).filter(b => b !== "(not set)"));
    return Array.from(set).sort();
  }, [ga4?.products]);

  const toggleSort = (col: typeof prodSort.col) => {
    setProdSort(prev => prev.col === col ? { col, dir: prev.dir === "desc" ? "asc" : "desc" } : { col, dir: "desc" });
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        <p className="text-sm text-gray-400">Cargando analytics...</p>
      </div>
    </div>
  );

  if (error || !d) return (
    <div className="p-8 text-center"><p className="text-red-500 text-sm">{error || "Error cargando datos"}</p></div>
  );

  const conversionRate = d.funnel?.pageView > 0 ? ((d.funnel.purchase / d.funnel.pageView) * 100).toFixed(2) : "0";
  const diff = Math.round((range.to.getTime() - range.from.getTime()) / MS_PER_DAY);

  return (
    <div className="space-y-4 pb-12">
      {/* ═══ HEADER + DATE SELECTOR ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sticky top-0 z-20 bg-gray-50/95 backdrop-blur-sm py-3 -mx-1 px-1">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Analytics</h1>
          <p className="text-xs text-gray-500 mt-0.5">Fuente: Google Analytics 4</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-0.5">
            {[{ label: "7D", days: 7 }, { label: "14D", days: 14 }, { label: "30D", days: 30 }].map(p => (
              <button key={p.days} onClick={() => setPreset(p.days)}
                className={`px-3 py-1.5 text-xs rounded-md transition-all ${diff === p.days || diff === p.days - 1 ? "bg-indigo-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}
              >{p.label}</button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 bg-white rounded-lg border border-gray-200 px-2 py-1">
            <input type="date" value={dateLabel(range.from)} onChange={e => setCustomDate("from", e.target.value)}
              className="text-xs text-gray-600 bg-transparent border-none outline-none w-[110px]" />
            <span className="text-xs text-gray-400">—</span>
            <input type="date" value={dateLabel(range.to)} onChange={e => setCustomDate("to", e.target.value)}
              className="text-xs text-gray-600 bg-transparent border-none outline-none w-[110px]" />
          </div>
        </div>
      </div>

      {/* ═══ TRAFFIC KPIs ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Visitantes" value={fmt(d.kpis.totalVisitors)} change={d.kpis.changes.visitors} color="indigo" />
        <KpiCard label="Sesiones" value={fmt(d.kpis.totalSessions)} change={d.kpis.changes.sessions} color="cyan" />
        <KpiCard label="Page Views" value={fmt(d.kpis.totalPageViews)} change={d.kpis.changes.pageViews} color="purple" />
        <KpiCard label="Pags/Sesion" value={String(d.kpis.pagesPerSession)} color="orange" />
        <KpiCard label="Tasa Conversion" value={`${conversionRate}%`} color="emerald" />
      </div>

      {/* ═══ FUNNEL ═══ */}
      {d.funnel?.pageView > 0 && (() => {
        const steps = [
          { label: "Visitantes", value: d.funnel.pageView, color: "#6366F1", bg: "rgba(99,102,241,0.15)" },
          { label: "Vieron Producto", value: d.funnel.viewProduct, color: "#8B5CF6", bg: "rgba(139,92,246,0.15)" },
          { label: "Agregaron al Carrito", value: d.funnel.addToCart, color: "#A855F7", bg: "rgba(168,85,247,0.15)" },
          { label: "Iniciaron Checkout", value: d.funnel.checkoutStart, color: "#F59E0B", bg: "rgba(245,158,11,0.15)" },
          { label: "Compraron", value: d.funnel.purchase, color: "#22C55E", bg: "rgba(34,197,94,0.15)" },
        ];
        const mx = steps[0].value || 1;
        return (
          <SectionCard title="Funnel de Conversión" badge="Google Analytics 4">
            <div className="flex flex-col gap-1">
              {steps.map((s, i) => {
                const w = Math.max((s.value / mx) * 100, 8);
                let prev = 0; for (let j = i - 1; j >= 0; j--) { if (steps[j].value > 0) { prev = steps[j].value; break; } }
                const sr = i > 0 && prev > 0 && s.value > 0 ? ((s.value / prev) * 100).toFixed(1) : null;
                const or2 = i > 0 && s.value > 0 ? ((s.value / mx) * 100).toFixed(1) : null;
                return (
                  <Fragment key={s.label}>
                    {i > 0 && sr && (
                      <div className="flex items-center gap-2 pl-2 -my-0.5">
                        <svg width="12" height="12" viewBox="0 0 12 12" className="text-gray-500"><path d="M6 2 L6 10 M3 7 L6 10 L9 7" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        <span className="text-[10px] text-gray-500">{sr}%</span>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 relative" style={{ minHeight: 32 }}>
                        <div className="absolute inset-y-0 left-0 rounded-lg" style={{ width: `${w}%`, backgroundColor: s.bg, borderLeft: `3px solid ${s.color}` }} />
                        <div className="relative flex items-center justify-between px-3 py-1.5" style={{ width: `${Math.max(w, 40)}%` }}>
                          <span className="text-[11px] text-gray-700 font-medium truncate">{s.label}</span>
                          <span className="text-[11px] text-gray-800 font-semibold ml-2">{fmt(s.value)}</span>
                        </div>
                      </div>
                      {or2 && <span className="text-[10px] text-gray-500 w-12 text-right">{or2}%</span>}
                    </div>
                  </Fragment>
                );
              })}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between">
              <span className="text-[10px] text-gray-500">Tasa de conversión general</span>
              <span className="text-sm font-semibold text-emerald-500">{conversionRate}%</span>
            </div>
            <div className="mt-2 flex items-start gap-1.5">
              <svg className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" /></svg>
              <p className="text-[10px] text-gray-400 leading-relaxed">
                Datos provenientes de <b className="text-gray-500">Google Analytics 4</b>. GA4 generalmente registra menos compras que el ecommerce (VTEX) porque depende de que el navegador del usuario ejecute el evento de tracking. Bloqueadores de anuncios, conexiones lentas o cierres prematuros del navegador pueden impedir el registro.
              </p>
            </div>
          </SectionCard>
        );
      })()}

      {/* ═══ NUEVOS VS RECURRENTES + ABANDONO ═══ */}
      {ga4 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {ga4.newVsReturning.length > 0 && (() => {
            const total = ga4.newVsReturning.reduce((s, x) => s + x.revenue, 0);
            return (
              <SectionCard title="Nuevos vs Recurrentes">
                <div className="grid grid-cols-2 gap-3">
                  {ga4.newVsReturning.map(nv => {
                    const pct = total > 0 ? Math.round((nv.revenue / total) * 100) : 0;
                    const convRate = nv.sessions > 0 ? Math.round((nv.purchases / nv.sessions) * 10000) / 100 : 0;
                    return (
                      <div key={nv.type} className={`rounded-xl border p-3 ${nv.type === "Nuevos" ? "bg-indigo-50/50 border-indigo-200" : "bg-emerald-50/50 border-emerald-200"}`}>
                        <p className="text-xs text-gray-500 mb-1">{nv.type}</p>
                        <p className="text-lg font-bold text-gray-800">{fmt(nv.users)} <span className="text-[10px] font-normal text-gray-400">usuarios</span></p>
                        <div className="mt-2 space-y-1 text-[11px] text-gray-600">
                          <div className="flex justify-between"><span>Sesiones</span><span className="font-medium">{fmt(nv.sessions)}</span></div>
                          <div className="flex justify-between"><span>Compras</span><span className="font-medium">{fmt(nv.purchases)}</span></div>
                          <div className="flex justify-between"><span>Revenue</span><span className="font-medium">{fmtARS(nv.revenue)}</span></div>
                          <div className="flex justify-between"><span>% del revenue</span><span className="font-medium">{pct}%</span></div>
                          <div className="flex justify-between"><span>Tasa conv.</span><span className={`font-medium ${convRate > 1 ? "text-emerald-600" : "text-gray-500"}`}>{convRate}%</span></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 pt-2 border-t border-gray-100 flex items-start gap-1.5">
                  <svg className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" /></svg>
                  <p className="text-[10px] text-gray-400 leading-relaxed">
                    <b className="text-gray-500">Nuevos</b> = primera visita al sitio. <b className="text-gray-500">Recurrentes</b> = ya visitaron antes. % del revenue muestra cuánto factura cada grupo. Tasa conv. = compras / sesiones.
                  </p>
                </div>
              </SectionCard>
            );
          })()}

          {ga4.abandonment && (
            <SectionCard title="Abandono de Carrito" badge="Usuarios únicos">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-red-200 bg-red-50/50 p-3 text-center">
                  <p className="text-[11px] text-gray-500">Abandono Carrito</p>
                  <p className="text-2xl font-bold text-red-600">{ga4.abandonment.cartAbandonmentRate}%</p>
                  <p className="text-[10px] text-gray-400">{fmt(ga4.abandonment.totalAddToCarts)} usuarios agregaron, {fmt(ga4.abandonment.totalPurchases)} compraron</p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-center">
                  <p className="text-[11px] text-gray-500">Abandono Checkout</p>
                  <p className="text-2xl font-bold text-amber-600">{ga4.abandonment.checkoutAbandonmentRate}%</p>
                  <p className="text-[10px] text-gray-400">{fmt(ga4.abandonment.totalCheckouts)} usuarios iniciaron, {fmt(ga4.abandonment.totalPurchases)} compraron</p>
                </div>
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {/* ═══ FUENTES DE TRÁFICO + LANDING PAGES (side by side, scrollable) ═══ */}
      {ga4 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {ga4.trafficRevenue?.length > 0 && (
            <SectionCard title="Fuentes de Tráfico" badge="Revenue por canal" maxH="320px">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-gray-500 text-xs border-b border-gray-200">
                      <th className="text-left pb-2 font-medium">Fuente / Medio</th>
                      <th className="text-right pb-2 font-medium">Sesiones</th>
                      <th className="text-right pb-2 font-medium">Revenue</th>
                      <th className="text-right pb-2 font-medium">Conv. %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ga4.trafficRevenue.slice(0, 15).map((t, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-1.5 text-gray-700 text-xs truncate max-w-[140px]">{t.source} / <span className="text-gray-400">{t.medium}</span></td>
                        <td className="py-1.5 text-right text-gray-600 text-xs">{fmt(t.sessions)}</td>
                        <td className="py-1.5 text-right text-gray-800 text-xs font-medium">{fmtARS(t.revenue)}</td>
                        <td className="py-1.5 text-right text-xs">
                          <span className={t.conversionRate > 1 ? "text-emerald-600 font-medium" : "text-gray-400"}>{t.conversionRate}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {ga4.landingPages?.length > 0 && (
            <SectionCard title="Landing Pages" badge="Páginas de entrada" maxH="320px">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-gray-500 text-xs border-b border-gray-200">
                      <th className="text-left pb-2 font-medium">Página</th>
                      <th className="text-right pb-2 font-medium">Sesiones</th>
                      <th className="text-right pb-2 font-medium">Bounce</th>
                      <th className="text-right pb-2 font-medium">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ga4.landingPages.map((lp, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-1.5 text-gray-700 text-xs max-w-[180px] truncate">{cleanUrl(lp.path)}</td>
                        <td className="py-1.5 text-right text-gray-600 text-xs">{fmt(lp.sessions)}</td>
                        <td className="py-1.5 text-right text-xs">
                          <span className={lp.bounceRate > 70 ? "text-red-500" : lp.bounceRate > 50 ? "text-amber-600" : "text-emerald-600"}>{lp.bounceRate}%</span>
                        </td>
                        <td className="py-1.5 text-right text-gray-800 text-xs font-medium">{fmtARS(lp.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {/* ═══ PRODUCTOS: CATÁLOGO COMPLETO ═══ */}
      {ga4?.products && ga4.products.length > 0 && (
        <SectionCard title="Productos: Vistos vs Vendidos" badge={`${filteredProducts.length} productos`}>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <input type="text" value={prodSearch} onChange={e => setProdSearch(e.target.value)}
              placeholder="Buscar por nombre o SKU..."
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-600 outline-none focus:border-indigo-300 w-48" />
            <select value={prodCatFilter} onChange={e => setProdCatFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 outline-none focus:border-indigo-300">
              <option value="">Todas las categorías</option>
              {productCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={prodBrandFilter} onChange={e => setProdBrandFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 outline-none focus:border-indigo-300">
              <option value="">Todas las marcas</option>
              {productBrands.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            {(prodSearch || prodCatFilter || prodBrandFilter) && (
              <button onClick={() => { setProdSearch(""); setProdCatFilter(""); setProdBrandFilter(""); }}
                className="text-[10px] text-indigo-600 hover:text-indigo-800 underline">Limpiar filtros</button>
            )}
          </div>
          {/* Table */}
          <div className="overflow-y-auto" style={{ maxHeight: "420px" }}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="text-gray-500 text-xs border-b border-gray-200">
                  <th className="text-left pb-2 font-medium pl-1">Producto</th>
                  <th className="text-right pb-2 font-medium cursor-pointer select-none hover:text-indigo-600" onClick={() => toggleSort("views")}>
                    Vistas {prodSort.col === "views" ? (prodSort.dir === "desc" ? "↓" : "↑") : ""}
                  </th>
                  <th className="text-right pb-2 font-medium cursor-pointer select-none hover:text-indigo-600" onClick={() => toggleSort("purchases")}>
                    Ventas {prodSort.col === "purchases" ? (prodSort.dir === "desc" ? "↓" : "↑") : ""}
                  </th>
                  <th className="text-right pb-2 font-medium cursor-pointer select-none hover:text-indigo-600" onClick={() => toggleSort("revenue")}>
                    Revenue {prodSort.col === "revenue" ? (prodSort.dir === "desc" ? "↓" : "↑") : ""}
                  </th>
                  <th className="text-right pb-2 font-medium cursor-pointer select-none hover:text-indigo-600" onClick={() => toggleSort("viewToPurchaseRate")}>
                    Conv. % {prodSort.col === "viewToPurchaseRate" ? (prodSort.dir === "desc" ? "↓" : "↑") : ""}
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedProducts.map((p, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="py-1.5 pl-1">
                      <div className="flex items-center gap-2">
                        {p.imageUrl ? (
                          <img src={p.imageUrl} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0 bg-gray-100 cursor-pointer hover:ring-2 hover:ring-indigo-300 transition-all"
                            loading="lazy" onClick={() => setLightbox({ src: p.imageUrl!, alt: p.name })} />
                        ) : (
                          <div className="w-8 h-8 rounded bg-gray-100 flex-shrink-0 flex items-center justify-center">
                            <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs text-gray-700 truncate max-w-[180px]">{p.name}</p>
                          {(p.category || p.brand) && (
                            <p className="text-[10px] text-gray-400 truncate max-w-[180px]">
                              {[p.category, p.brand].filter(Boolean).filter(v => v !== "(not set)").join(" · ")}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-1.5 text-right text-gray-600 text-xs">{fmt(p.views)}</td>
                    <td className="py-1.5 text-right text-gray-600 text-xs">{fmt(p.purchases)}</td>
                    <td className="py-1.5 text-right text-gray-800 text-xs font-medium">{fmtARS(p.revenue)}</td>
                    <td className="py-1.5 text-right text-xs">
                      <span className={p.viewToPurchaseRate > 2 ? "text-emerald-600 font-medium" : p.viewToPurchaseRate > 0 ? "text-amber-600" : "text-gray-400"}>
                        {p.viewToPurchaseRate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          {totalProdPages > 1 && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
              <span className="text-[10px] text-gray-400">
                {((prodPage - 1) * PRODUCTS_PER_PAGE) + 1}–{Math.min(prodPage * PRODUCTS_PER_PAGE, filteredProducts.length)} de {filteredProducts.length}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setProdPage(p => Math.max(1, p - 1))} disabled={prodPage === 1}
                  className="px-2 py-1 text-xs rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">←</button>
                {Array.from({ length: Math.min(totalProdPages, 7) }, (_, i) => {
                  let page: number;
                  if (totalProdPages <= 7) { page = i + 1; }
                  else if (prodPage <= 4) { page = i + 1; }
                  else if (prodPage >= totalProdPages - 3) { page = totalProdPages - 6 + i; }
                  else { page = prodPage - 3 + i; }
                  return (
                    <button key={page} onClick={() => setProdPage(page)}
                      className={`w-7 h-7 text-xs rounded-md ${page === prodPage ? "bg-indigo-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}>{page}</button>
                  );
                })}
                <button onClick={() => setProdPage(p => Math.min(totalProdPages, p + 1))} disabled={prodPage === totalProdPages}
                  className="px-2 py-1 text-xs rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">→</button>
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {/* Image Lightbox */}
      {lightbox && <ImageLightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />}

      {/* ═══ CONVERSIÓN POR CATEGORÍA + MARCA ═══ */}
      {ga4 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {ga4.categories?.length > 0 && (
            <SectionCard title="Conversión por Categoría" badge="Productos vistos vs vendidos" maxH="320px">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-gray-500 text-xs border-b border-gray-200">
                      <th className="text-left pb-2 font-medium">Categoría</th>
                      <th className="text-right pb-2 font-medium">Vistas</th>
                      <th className="text-right pb-2 font-medium">Ventas</th>
                      <th className="text-right pb-2 font-medium">Revenue</th>
                      <th className="text-right pb-2 font-medium">Conv. %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ga4.categories.map((c, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-1.5 text-gray-700 text-xs max-w-[150px] truncate">{c.category}</td>
                        <td className="py-1.5 text-right text-gray-600 text-xs">{fmt(c.views)}</td>
                        <td className="py-1.5 text-right text-gray-600 text-xs">{fmt(c.purchases)}</td>
                        <td className="py-1.5 text-right text-gray-800 text-xs font-medium">{fmtARS(c.revenue)}</td>
                        <td className="py-1.5 text-right text-xs">
                          <span className={c.conversionRate > 2 ? "text-emerald-600 font-medium" : c.conversionRate > 0 ? "text-amber-600" : "text-gray-400"}>
                            {c.conversionRate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {ga4.brands?.length > 0 && (
            <SectionCard title="Conversión por Marca" badge="Productos vistos vs vendidos" maxH="320px">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-gray-500 text-xs border-b border-gray-200">
                      <th className="text-left pb-2 font-medium">Marca</th>
                      <th className="text-right pb-2 font-medium">Vistas</th>
                      <th className="text-right pb-2 font-medium">Ventas</th>
                      <th className="text-right pb-2 font-medium">Revenue</th>
                      <th className="text-right pb-2 font-medium">Conv. %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ga4.brands.map((b, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-1.5 text-gray-700 text-xs max-w-[150px] truncate">{b.brand}</td>
                        <td className="py-1.5 text-right text-gray-600 text-xs">{fmt(b.views)}</td>
                        <td className="py-1.5 text-right text-gray-600 text-xs">{fmt(b.purchases)}</td>
                        <td className="py-1.5 text-right text-gray-800 text-xs font-medium">{fmtARS(b.revenue)}</td>
                        <td className="py-1.5 text-right text-xs">
                          <span className={b.conversionRate > 2 ? "text-emerald-600 font-medium" : b.conversionRate > 0 ? "text-amber-600" : "text-gray-400"}>
                            {b.conversionRate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {/* ═══ BÚSQUEDAS INTERNAS + VENTAS POR ZONA ═══ */}
      {ga4 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {ga4.searches?.length > 0 && (
            <SectionCard title="Búsquedas Internas" badge="Qué buscan tus clientes" maxH="300px">
              <div className="space-y-2">
                {ga4.searches.map((s, i) => {
                  const max = ga4.searches[0]?.count || 1;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-32 text-xs text-gray-700 truncate font-medium">{s.term}</div>
                      <div className="flex-1 h-5 bg-gray-100 rounded-lg overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-indigo-400 to-indigo-200 rounded-lg flex items-center px-2"
                          style={{ width: `${Math.max((s.count / max) * 100, 5)}%` }}>
                          <span className="text-[10px] text-white font-medium">{fmt(s.count)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}

          {ga4.salesByZone?.length > 0 && (
            <SectionCard title="Ventas por Zona" badge="Datos VTEX" maxH="360px">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-gray-500 text-xs border-b border-gray-200">
                      <th className="text-left pb-2 font-medium">Provincia</th>
                      <th className="text-right pb-2 font-medium">Órdenes</th>
                      <th className="text-right pb-2 font-medium">Revenue</th>
                      <th className="text-right pb-2 font-medium">Ticket Prom.</th>
                      <th className="text-right pb-2 font-medium">Envío Prom.</th>
                      <th className="text-right pb-2 font-medium">Envío / Ticket</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ga4.salesByZone.map((z, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-1.5 text-gray-700 text-xs truncate max-w-[140px] capitalize">{z.zone?.toLowerCase() || "(sin datos)"}</td>
                        <td className="py-1.5 text-right text-gray-600 text-xs">{fmt(z.orders)}</td>
                        <td className="py-1.5 text-right text-gray-800 text-xs font-medium">{fmtARS(z.revenue)}</td>
                        <td className="py-1.5 text-right text-gray-600 text-xs">{fmtARS(z.avgTicket)}</td>
                        <td className="py-1.5 text-right text-gray-600 text-xs">{z.avgShipping != null ? fmtARS(z.avgShipping) : <span className="text-gray-400">—</span>}</td>
                        <td className="py-1.5 text-right text-xs font-medium">
                          {z.shippingPct != null
                            ? <span className={z.shippingPct > 15 ? "text-red-500" : z.shippingPct > 10 ? "text-amber-500" : "text-emerald-500"}>{z.shippingPct}%</span>
                            : <span className="text-gray-400">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 flex items-start gap-1.5">
                <svg className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" /></svg>
                <p className="text-[10px] text-gray-400 leading-relaxed">
                  Datos de órdenes VTEX. Envío promedio se calcula solo con órdenes que tienen costo de envío registrado. <b className="text-gray-500">Rojo</b> {">"}15%, <b className="text-gray-500">Ámbar</b> 10-15%, <b className="text-gray-500">Verde</b> {"<"}10% del ticket.
                </p>
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {/* ═══ HORARIOS Y DÍAS PICO ═══ */}
      {ga4 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {ga4.hourly.length > 0 && (
            <SectionCard title="Horarios de Mayor Actividad" badge="Sesiones por hora">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ga4.hourly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="hour" tickFormatter={v => `${v}h`} tick={{ fontSize: 10, fill: "#9ca3af" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} width={35} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                      formatter={(v: number, name: string) => [fmt(v), name === "sessions" ? "Sesiones" : "Compras"]} />
                    <Bar dataKey="sessions" fill="#6366F1" radius={[3, 3, 0, 0]} name="sessions" />
                    <Bar dataKey="purchases" fill="#22C55E" radius={[3, 3, 0, 0]} name="purchases" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>
          )}

          {ga4.dayOfWeek.length > 0 && (
            <SectionCard title="Días de Mayor Actividad" badge="Sesiones por día">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ga4.dayOfWeek}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="dayName" tick={{ fontSize: 10, fill: "#9ca3af" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} width={35} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                      formatter={(v: number, name: string) => [fmt(v), name === "sessions" ? "Sesiones" : "Compras"]} />
                    <Bar dataKey="sessions" fill="#6366F1" radius={[3, 3, 0, 0]} name="sessions" />
                    <Bar dataKey="purchases" fill="#22C55E" radius={[3, 3, 0, 0]} name="purchases" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {/* ═══ DAILY VISITORS TREND ═══ */}
      {d.dailyVisitors?.length > 1 && (
        <SectionCard title="Visitantes Diarios">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d.dailyVisitors}>
                <defs>
                  <linearGradient id="gradV" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tickFormatter={v => v.slice(5)} tick={{ fontSize: 10, fill: "#9ca3af" }} />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} width={40} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
                <Area type="monotone" dataKey="visitors" stroke="#6366F1" fill="url(#gradV)" strokeWidth={2} name="Visitantes" />
                <Area type="monotone" dataKey="sessions" stroke="#06b6d4" fill="none" strokeWidth={1.5} strokeDasharray="4 2" name="Sesiones" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      )}

      {/* ═══ DEVICES + EVENTS ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Dispositivos">
          {d.deviceBreakdown.length > 0 ? (
            <div className="flex items-center gap-6">
              <div className="w-32 h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={d.deviceBreakdown} dataKey="count" nameKey="device" cx="50%" cy="50%" outerRadius={55} strokeWidth={0}>
                      {d.deviceBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2">
                {d.deviceBreakdown.map((dev, i) => (
                  <div key={dev.device} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-sm text-gray-700 capitalize">{dev.device}</span>
                    </div>
                    <span className="text-sm text-gray-400">{dev.percentage}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="text-xs text-gray-400">Sin datos</p>}
        </SectionCard>

        <SectionCard title="Tipos de Eventos">
          {d.eventTypes.length > 0 ? (
            <div className="space-y-2">
              {d.eventTypes.map(evt => (
                <div key={evt.type} className="flex items-center gap-3">
                  <div className="w-24 text-xs text-gray-400 truncate">{EVENT_LABELS[evt.type] || evt.type}</div>
                  <div className="flex-1 h-5 bg-gray-100 rounded-lg overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-indigo-400 to-indigo-200 rounded-lg flex items-center px-2" style={{ width: `${Math.max(evt.percentage, 3)}%` }}>
                      <span className="text-[10px] text-white font-medium">{fmt(evt.count)}</span>
                    </div>
                  </div>
                  <div className="w-10 text-right text-xs text-gray-500">{evt.percentage}%</div>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-gray-400">Sin eventos</p>}
        </SectionCard>
      </div>

      {/* ═══ POPULAR PAGES ═══ */}
      {d.popularPages.length > 0 && (
        <SectionCard title="Páginas Populares" maxH="300px">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-gray-500 text-xs border-b border-gray-200">
                <th className="text-left pb-2 font-medium">URL</th>
                <th className="text-right pb-2 font-medium">Views</th>
                <th className="text-right pb-2 font-medium">Visitantes</th>
              </tr>
            </thead>
            <tbody>
              {d.popularPages.map((p, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-1.5 text-gray-700 max-w-md truncate text-xs">{cleanUrl(p.url)}</td>
                  <td className="py-1.5 text-right text-gray-400 text-xs">{fmt(p.pageViews)}</td>
                  <td className="py-1.5 text-right text-gray-400 text-xs">{fmt(p.uniqueVisitors)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      )}
    </div>
  );
}
