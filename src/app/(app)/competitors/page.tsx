// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// Competencia — Monitoreo de Precios de Competidores
// ══════════════════════════════════════════════════════════════

import { useEffect, useState, useMemo, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, Cell, PieChart, Pie } from "recharts";

const fmt = (n: number) => n?.toLocaleString("es-AR") ?? "0";
const fmtARS = (n: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
const COLORS = ["#FF5E1A", "#4285f4", "#8b5cf6", "#059669", "#d97706", "#ec4899", "#06b6d4"];

type Store = { id: string; name: string; website: string };
type CompItem = {
  store: string; storeId: string; price: number; diff: number;
  previousPrice: number | null; url: string; productName: string; imageUrl?: string;
  matchMethod?: string | null;
};
type PriceRow = {
  ownProduct: { id: string; name: string; sku: string; price: number; imageUrl?: string; priceStatus?: "ok" | "sin_stock" | "sin_precio"; category?: string | null; brand?: string | null };
  competitors: CompItem[];
  position: number;
  totalInComparison: number;
  bestPrice: CompItem | null;
};
type Change = { competitor: string; product: string; oldPrice: number; newPrice: number; change: number; date: string };
type Alert = { type: string; product: string; diff?: number; competitor?: string; drop?: number };

type Tab = "precios" | "inteligencia";

export default function CompetitorsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("precios");
  const [data, setData] = useState<any>(null);
  const [intelData, setIntelData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [intelLoading, setIntelLoading] = useState(false);
  const [error, setError] = useState("");
  const [storeFilter, setStoreFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");

  // Management modal state
  const [showManage, setShowManage] = useState(false);
  const [newStoreName, setNewStoreName] = useState("");
  const [newStoreUrl, setNewStoreUrl] = useState("");
  const [addingStore, setAddingStore] = useState(false);

  // Add product modal
  const [showAddProduct, setShowAddProduct] = useState<string | null>(null); // storeId
  const [newProductUrl, setNewProductUrl] = useState("");
  const [addingProduct, setAddingProduct] = useState(false);

  // Products list for mapping
  const [ownProducts, setOwnProducts] = useState<any[]>([]);

  // Price history modal
  const [historyProduct, setHistoryProduct] = useState<any>(null);

  // Auto-discovery state
  const [discovering, setDiscovering] = useState<string | null>(null); // storeId being discovered
  const [discoveryResult, setDiscoveryResult] = useState<any>(null);

  // Manage modal: collapsible stores + filter
  const [expandedStores, setExpandedStores] = useState<Set<string>>(new Set());
  const [storeProductFilter, setStoreProductFilter] = useState<Record<string, "all" | "connected" | "unmapped">>({});
  const [storeShowMore, setStoreShowMore] = useState<Record<string, boolean>>({});

  // Table filters: category + brand
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const loadData = async () => {
    setLoading(true);
    try {
      const [metricsRes, prodsRes] = await Promise.all([
        fetch("/api/metrics/competitors").then(r => r.json()),
        fetch("/api/products?limit=5000").then(r => r.json()).catch(() => ({ products: [] })),
      ]);
      setData(metricsRes);
      setOwnProducts(prodsRes.products || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadIntelData = useCallback(async () => {
    setIntelLoading(true);
    try {
      const res = await fetch("/api/metrics/intelligence").then(r => r.json());
      if (res.ok) setIntelData(res);
    } catch (e: any) {
      console.error("Intel load error:", e);
    } finally {
      setIntelLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, []);
  useEffect(() => {
    if (activeTab === "inteligencia" && !intelData && !intelLoading) loadIntelData();
  }, [activeTab, intelData, intelLoading, loadIntelData]);

  // Add competitor store
  const addStore = async () => {
    if (!newStoreName || !newStoreUrl) return;
    setAddingStore(true);
    try {
      await fetch("/api/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "store", name: newStoreName, website: newStoreUrl }),
      });
      setNewStoreName(""); setNewStoreUrl("");
      showToast("Competidor agregado");
      loadData();
    } catch { showToast("Error al agregar"); }
    finally { setAddingStore(false); }
  };

  // Add product URL
  const addProduct = async (storeId: string) => {
    if (!newProductUrl) return;
    setAddingProduct(true);
    try {
      const res = await fetch("/api/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "product", competitorId: storeId, productUrl: newProductUrl }),
      });
      const { price } = await res.json();
      // Auto-scrape
      if (price?.id) {
        showToast("Scrapeando precio...");
        await fetch("/api/competitors/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ competitorPriceId: price.id }),
        });
      }
      setNewProductUrl(""); setShowAddProduct(null);
      showToast("Producto agregado y scrapeado");
      loadData();
    } catch { showToast("Error al agregar producto"); }
    finally { setAddingProduct(false); }
  };

  // Map own product
  const mapProduct = async (competitorPriceId: string, ownProductId: string) => {
    try {
      await fetch("/api/competitors", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "product", id: competitorPriceId, ownProductId }),
      });
      showToast("Producto mapeado");
      loadData();
    } catch { showToast("Error al mapear"); }
  };

  // Delete
  const deleteItem = async (type: string, id: string) => {
    try {
      await fetch(`/api/competitors?type=${type}&id=${id}`, { method: "DELETE" });
      showToast(type === "store" ? "Competidor eliminado" : "Producto eliminado");
      loadData();
    } catch { showToast("Error al eliminar"); }
  };

  // Scrape single product
  const scrapeOne = async (id: string) => {
    showToast("Scrapeando...");
    try {
      const res = await fetch("/api/competitors/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitorPriceId: id }),
      });
      const result = await res.json();
      showToast(result.success ? `${fmtARS(result.price)} (${result.method})` : "Error al scrapear");
      loadData();
    } catch { showToast("Error"); }
  };

  // Auto-discover products — runs in background, closes modal
  const discoverProducts = async (storeId: string) => {
    setDiscovering(storeId);
    setDiscoveryResult(null);
    setShowManage(false); // Close modal so user can keep navigating

    // Run in background (non-blocking)
    fetch("/api/competitors/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ competitorStoreId: storeId }),
    })
      .then((res) => res.json())
      .then((result) => {
        if (result.error) {
          showToast(`Error: ${result.error}`);
        } else {
          setDiscoveryResult(result);
          loadData();
        }
      })
      .catch(() => showToast("Error en la busqueda automatica"))
      .finally(() => setDiscovering(null));
  };

  // Filtered comparison
  const comparison: PriceRow[] = useMemo(() => {
    if (!data?.priceComparison) return [];
    let rows = data.priceComparison;
    if (storeFilter !== "all") {
      rows = rows.filter((r: PriceRow) => r.competitors.some((c: CompItem) => c.storeId === storeFilter));
    }
    if (categoryFilter !== "all") {
      rows = rows.filter((r: PriceRow) => r.ownProduct.category === categoryFilter);
    }
    if (brandFilter !== "all") {
      rows = rows.filter((r: PriceRow) => r.ownProduct.brand === brandFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((r: PriceRow) => r.ownProduct.name.toLowerCase().includes(q) || r.ownProduct.sku?.toLowerCase().includes(q));
    }
    return rows;
  }, [data, storeFilter, categoryFilter, brandFilter, search]);

  // Extract unique categories and brands for filter dropdowns
  const { categories, brands } = useMemo(() => {
    if (!data?.priceComparison) return { categories: [], brands: [] };
    const catSet = new Set<string>();
    const brandSet = new Set<string>();
    for (const row of data.priceComparison) {
      if (row.ownProduct.category) catSet.add(row.ownProduct.category);
      if (row.ownProduct.brand) brandSet.add(row.ownProduct.brand);
    }
    return {
      categories: [...catSet].sort((a, b) => a.localeCompare(b, "es")),
      brands: [...brandSet].sort((a, b) => a.localeCompare(b, "es")),
    };
  }, [data]);

  const stores: Store[] = data?.stores || [];
  const summary = data?.summary || {};
  const alerts: Alert[] = data?.alerts || [];
  const changes: Change[] = data?.recentChanges || [];

  if (loading) return <div className="light-canvas min-h-screen"><p className="text-gray-400 p-8">Cargando datos de competencia...</p></div>;
  if (error) return <div className="light-canvas min-h-screen"><p className="text-red-500 p-8">{error}</p></div>;

  const hasData = stores.length > 0;

  return (
    <div className="light-canvas min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-start mb-5">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 mb-1">Competencia</h2>
          <p className="text-gray-500 text-sm">Monitoreo de precios, alertas y comparativas</p>
        </div>
        <button
          onClick={() => setShowManage(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all"
          style={{ background: "linear-gradient(135deg, #FF5E1A, #FF8A50)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Gestionar Competidores
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
        {([
          { key: "precios" as Tab, label: "Precios", icon: "💰" },
          { key: "inteligencia" as Tab, label: "Inteligencia Competitiva", icon: "🧠" },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === tab.key
                ? "bg-white text-gray-800 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <span className="text-base">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══ TAB: PRECIOS ═══ */}
      {activeTab === "precios" && <>
      {/* Discovery in-progress banner (shown outside modal so user can navigate) */}
      {discovering && (
        <div className="flex items-center gap-3 mb-5 px-5 py-4 bg-emerald-50 border border-emerald-200 rounded-xl animate-pulse">
          <svg className="animate-spin h-5 w-5 text-emerald-600" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          <div>
            <p className="text-sm font-semibold text-emerald-800">Buscando productos del competidor...</p>
            <p className="text-xs text-emerald-600">Detectando plataforma, leyendo catalogo y matcheando con tus productos. Podes seguir navegando.</p>
          </div>
        </div>
      )}

      {/* Discovery results banner (shown after discovery completes) */}
      {!discovering && discoveryResult && !showManage && (
        <div className="mb-5 px-5 py-4 bg-emerald-50 border border-emerald-200 rounded-xl">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-semibold text-emerald-800">
                Descubrimiento completado — {discoveryResult.created || 0} productos agregados
              </p>
              <p className="text-xs text-emerald-600 mt-0.5">
                {discoveryResult.platform && `Plataforma: ${discoveryResult.platform.toUpperCase()} · `}
                {discoveryResult.totalInCatalog || 0} productos en catalogo competidor · {discoveryResult.matched || 0} matcheados
              </p>
            </div>
            <button onClick={() => setDiscoveryResult(null)} className="text-emerald-400 hover:text-emerald-600 text-lg leading-none">&times;</button>
          </div>
          {discoveryResult.products?.length > 0 && (
            <div className="mt-3 flex gap-2 flex-wrap">
              {discoveryResult.products.slice(0, 5).map((p: any) => (
                <span key={p.id} className="text-[10px] bg-white border border-emerald-200 text-emerald-700 px-2 py-1 rounded-lg">
                  {p.name?.substring(0, 30)} → {fmtARS(p.price)}
                </span>
              ))}
              {discoveryResult.products.length > 5 && (
                <span className="text-[10px] text-emerald-500 px-2 py-1">+{discoveryResult.products.length - 5} mas</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Store filter chips */}
      {hasData && (
        <div className="flex gap-2 mb-5 flex-wrap">
          <button
            onClick={() => setStoreFilter("all")}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${storeFilter === "all" ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}
          >Todos</button>
          {stores.map((s: Store) => (
            <button
              key={s.id}
              onClick={() => setStoreFilter(s.id === storeFilter ? "all" : s.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${storeFilter === s.id ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}
            >{s.name}</button>
          ))}
        </div>
      )}

      {!hasData ? (
        /* Empty state */
        <div className="bg-white rounded-xl border p-12 text-center">
          <div className="text-5xl mb-4">🎯</div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">Agrega tu primer competidor</h3>
          <p className="text-gray-500 text-sm mb-6 max-w-md mx-auto">
            Agrega un competidor y el sistema busca automaticamente los productos en comun con tu catalogo, scrapea los precios y te muestra comparativas al instante.
          </p>
          <button
            onClick={() => setShowManage(true)}
            className="px-6 py-3 rounded-xl text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #FF5E1A, #FF8A50)" }}
          >Agregar Competidor</button>
        </div>
      ) : (
        <>
          {/* Alerts */}
          {alerts.length > 0 && (
            <div className="flex gap-3 mb-5 flex-wrap">
              {alerts.slice(0, 3).map((a, i) => (
                <div key={i} className={`flex-1 min-w-[200px] px-4 py-3 rounded-xl text-sm flex items-center gap-2 ${
                  a.type === "OVERPRICED" ? "bg-red-50 border border-red-200 text-red-800"
                  : "bg-amber-50 border border-amber-200 text-amber-800"
                }`}>
                  <span className="text-lg">{a.type === "OVERPRICED" ? "⚠️" : "📉"}</span>
                  <span>
                    {a.type === "OVERPRICED"
                      ? <><strong>{a.product}</strong>: estas {a.diff}% mas caro que {a.competitor}</>
                      : <><strong>{a.competitor}</strong> bajo {Math.abs(a.drop || 0)}% en {a.product}</>
                    }
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            <div className="bg-white rounded-xl shadow-sm p-4 border">
              <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Productos Monitoreados</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{summary.totalMonitored}</p>
              <p className="text-xs text-gray-400 mt-0.5">De {summary.competitorCount} competidores</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4 border">
              <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Precio vs Mercado</p>
              <p className={`text-2xl font-bold mt-1 ${summary.avgPriceDiff < 0 ? "text-green-600" : summary.avgPriceDiff > 0 ? "text-red-600" : "text-gray-800"}`}>
                {summary.avgPriceDiff > 0 ? "+" : ""}{summary.avgPriceDiff}%
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{summary.avgPriceDiff <= 0 ? "Estas por debajo" : "Estas por encima"}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4 border">
              <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Mejor Precio</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{summary.cheaperCount}</p>
              <p className="text-xs text-gray-400 mt-0.5">Productos donde sos el mas barato</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4 border">
              <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Matches Verificados</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{(summary.eanMatchCount || 0) + (summary.verifiedMatchCount || 0)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{summary.eanMatchCount > 0 ? `${summary.eanMatchCount} EAN + ${summary.verifiedMatchCount || 0} nombre` : "EAN + marca + nombre verificado"}</p>
            </div>
          </div>

          {/* Price Comparison Table */}
          <div className="bg-white rounded-xl shadow-sm border mb-5">
            <div className="flex justify-between items-center p-5 pb-3">
              <div className="flex items-center gap-3">
                <h3 className="font-bold text-gray-800">Comparativa de Precios</h3>
                <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded" style={{ background: "#fff7ed", color: "#c2410c" }}>PRECIOS</span>
              </div>
              <div className="flex items-center gap-2">
                {categories.length > 0 && (
                  <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
                    className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:border-indigo-400 bg-white max-w-[160px]">
                    <option value="all">Categoría</option>
                    {categories.map(c => <option key={c} value={c}>{c.length > 22 ? c.substring(0, 22) + "…" : c}</option>)}
                  </select>
                )}
                {brands.length > 0 && (
                  <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)}
                    className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:border-indigo-400 bg-white max-w-[140px]">
                    <option value="all">Marca</option>
                    {brands.map(b => <option key={b} value={b}>{b.length > 18 ? b.substring(0, 18) + "…" : b}</option>)}
                  </select>
                )}
                <input
                  type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar producto..."
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs w-48 outline-none focus:border-indigo-400"
                />
              </div>
            </div>
            <div className="overflow-x-auto" style={{ maxHeight: 480 }}>
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    <th className="text-left text-[11px] text-gray-400 uppercase tracking-wider font-semibold px-5 py-2.5 border-b">Producto</th>
                    <th className="text-left text-[11px] text-gray-400 uppercase tracking-wider font-semibold px-3 py-2.5 border-b">Tu Precio</th>
                    {stores.map((s: Store) => (
                      storeFilter === "all" || storeFilter === s.id
                        ? <th key={s.id} className="text-left text-[11px] text-gray-400 uppercase tracking-wider font-semibold px-3 py-2.5 border-b">{s.name}</th>
                        : null
                    ))}
                    <th className="text-center text-[11px] text-gray-400 uppercase tracking-wider font-semibold px-3 py-2.5 border-b">Posicion</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.length === 0 && (
                    <tr><td colSpan={99} className="px-5 py-8 text-center text-gray-400">No hay productos mapeados para comparar. Agrega productos y mapealos a los tuyos.</td></tr>
                  )}
                  {comparison.map((row: PriceRow) => (
                    <tr key={row.ownProduct.id} className="hover:bg-gray-50 border-b border-gray-50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          {row.ownProduct.imageUrl ? (
                            <img src={row.ownProduct.imageUrl} alt="" className="w-9 h-9 rounded-lg object-cover bg-gray-100"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden"); }}
                            />
                          ) : null}
                          <div className={`w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-gray-300 text-lg ${row.ownProduct.imageUrl ? "hidden" : ""}`}>📦</div>
                          <div>
                            <p className="font-semibold text-gray-800 text-[13px]">{row.ownProduct.name.substring(0, 50)}</p>
                            <p className="text-[11px] text-gray-400">{row.ownProduct.sku || "Sin SKU"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-bold tabular-nums">
                        {row.ownProduct.priceStatus === "sin_stock" ? (
                          <span className="text-[11px] font-semibold px-2 py-1 rounded bg-gray-100 text-gray-500">Sin stock</span>
                        ) : row.ownProduct.priceStatus === "sin_precio" ? (
                          <span className="text-[11px] font-semibold px-2 py-1 rounded bg-amber-50 text-amber-600">Sin stock</span>
                        ) : (
                          <span className="text-gray-800">{fmtARS(row.ownProduct.price)}</span>
                        )}
                      </td>
                      {stores.map((s: Store) => {
                        if (storeFilter !== "all" && storeFilter !== s.id) return null;
                        const comp = row.competitors.find((c: CompItem) => c.storeId === s.id);
                        if (!comp) return <td key={s.id} className="px-3 py-3 text-gray-300">—</td>;
                        const isMore = comp.diff > 0;
                        const isLess = comp.diff < 0;
                        return (
                          <td key={s.id} className="px-3 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className={`font-bold tabular-nums ${isMore ? "text-green-600" : isLess ? "text-red-600" : "text-gray-500"}`}>
                                {fmtARS(comp.price)}
                              </span>
                              <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                                isMore ? "bg-green-50 text-green-700" : isLess ? "bg-red-50 text-red-700" : "text-gray-400"
                              }`}>
                                {comp.diff > 0 ? "+" : ""}{comp.diff}%
                              </span>
                              {(comp.matchMethod === "EAN_EXACT" || comp.matchMethod === "EAN_SEARCH") && (
                                <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-indigo-50 text-indigo-600 tracking-wider" title="Match verificado por codigo de barras (EAN)">EAN</span>
                              )}
                              {comp.matchMethod === "NAME_VERIFIED" && (
                                <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-emerald-50 text-emerald-600 tracking-wider" title="Match verificado por marca + nombre">OK</span>
                              )}
                              {comp.matchMethod === "CATALOG_MATCH" && (
                                <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-violet-50 text-violet-600 tracking-wider" title="Match por catalogo del marketplace">CAT</span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-3 py-3 text-center">
                        {row.ownProduct.priceStatus && row.ownProduct.priceStatus !== "ok" ? (
                          <span className="text-gray-300">—</span>
                        ) : (
                          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold ${
                            row.position === 1 ? "bg-green-100 text-green-800"
                            : row.position === 2 ? "bg-amber-100 text-amber-800"
                            : "bg-red-100 text-red-800"
                          }`}>{row.position}°</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Changes */}
          {changes.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border p-5 mb-5">
              <h3 className="font-bold text-gray-800 mb-3">Cambios de Precio Recientes</h3>
              <div className="space-y-2">
                {changes.slice(0, 8).map((c: Change, i: number) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className={`text-lg ${c.change < 0 ? "text-green-500" : "text-red-500"}`}>
                        {c.change < 0 ? "📉" : "📈"}
                      </span>
                      <div>
                        <span className="text-sm font-semibold text-gray-800">{c.competitor}</span>
                        <span className="text-sm text-gray-500"> — {c.product?.substring(0, 40)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-gray-400 line-through">{fmtARS(c.oldPrice)}</span>
                      <span className="font-bold text-gray-800">{fmtARS(c.newPrice)}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${c.change < 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                        {c.change > 0 ? "+" : ""}{c.change}%
                      </span>
                      <span className="text-xs text-gray-400">{c.date}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Manage Competitors Modal ── */}
      {showManage && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowManage(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800">Gestionar Competidores</h3>
              <button onClick={() => setShowManage(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>

            {/* Add new store */}
            <div className="bg-gray-50 rounded-xl p-4 mb-5">
              <p className="text-sm font-semibold text-gray-700 mb-2">Agregar Competidor</p>
              <p className="text-xs text-gray-400 mb-3">Agrega la tienda y usa "Descubrir Productos" para que el sistema encuentre automaticamente los productos en comun con tu catalogo.</p>
              <div className="flex gap-2">
                <input value={newStoreName} onChange={e => setNewStoreName(e.target.value)}
                  placeholder="Nombre (ej: Jugueterias Cody)" className="flex-1 px-3 py-2 border rounded-lg text-sm outline-none focus:border-indigo-400" />
                <input value={newStoreUrl} onChange={e => setNewStoreUrl(e.target.value)}
                  placeholder="URL (ej: https://www.cody.com.ar)" className="flex-1 px-3 py-2 border rounded-lg text-sm outline-none focus:border-indigo-400" />
                <button onClick={addStore} disabled={addingStore || !newStoreName || !newStoreUrl}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50">
                  {addingStore ? "..." : "Agregar"}
                </button>
              </div>
            </div>

            {/* Existing stores + their products (collapsible) */}
            {stores.map((s: Store) => {
              const storeProducts = data?.unmappedProducts?.filter((p: any) => p.competitor === s.name) || [];
              const mappedProducts = data?.priceComparison?.flatMap((r: PriceRow) =>
                r.competitors.filter((c: CompItem) => c.storeId === s.id).map((c: CompItem) => ({ ...c, ownName: r.ownProduct.name }))
              ) || [];
              const isExpanded = expandedStores.has(s.id);
              const filter = storeProductFilter[s.id] || "all";
              const showAll = storeShowMore[s.id] || false;

              // Filtered list
              const filteredMapped = filter === "unmapped" ? [] : mappedProducts;
              const filteredUnmapped = filter === "connected" ? [] : storeProducts;
              const allFiltered = [
                ...filteredMapped.map((p: any, i: number) => ({ ...p, _type: "mapped" as const, _key: `m${i}` })),
                ...filteredUnmapped.map((p: any) => ({ ...p, _type: "unmapped" as const, _key: p.id })),
              ];
              const VISIBLE_LIMIT = 20;
              const visibleProducts = showAll ? allFiltered : allFiltered.slice(0, VISIBLE_LIMIT);
              const hiddenCount = allFiltered.length - VISIBLE_LIMIT;

              return (
                <div key={s.id} className="border rounded-xl mb-3 overflow-hidden">
                  {/* Collapsible header */}
                  <div
                    className="flex justify-between items-center p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setExpandedStores(prev => { const n = new Set(prev); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; })}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-gray-400 text-xs transition-transform ${isExpanded ? "rotate-90" : ""}`}>&#9654;</span>
                      <div>
                        <p className="font-semibold text-gray-800">{s.name}</p>
                        <p className="text-xs text-gray-400">
                          {s.website}
                          {(mappedProducts.length > 0 || storeProducts.length > 0) && (
                            <span className="ml-2">
                              — <span className="text-emerald-600 font-medium">{mappedProducts.length} conectados</span>
                              {storeProducts.length > 0 && <span className="text-amber-600 font-medium"> · {storeProducts.length} sin mapear</span>}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                      <button onClick={() => discoverProducts(s.id)} disabled={discovering === s.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5">
                        {discovering === s.id ? (
                          <><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Buscando...</>
                        ) : (
                          <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg> Descubrir</>
                        )}
                      </button>
                      <button onClick={() => { setShowAddProduct(s.id); setNewProductUrl(""); setExpandedStores(prev => new Set(prev).add(s.id)); }}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-600 border border-indigo-200 hover:bg-indigo-50">
                        + Manual
                      </button>
                      <button onClick={() => deleteItem("store", s.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50">
                        Eliminar
                      </button>
                    </div>
                  </div>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-100">
                      {/* Add product URL inline */}
                      {showAddProduct === s.id && (
                        <div className="flex gap-2 mt-3 mb-3 bg-indigo-50 p-3 rounded-lg">
                          <input value={newProductUrl} onChange={e => setNewProductUrl(e.target.value)}
                            placeholder="URL del producto (ej: https://www.cody.com.ar/lego-city-60320)"
                            className="flex-1 px-3 py-2 border rounded-lg text-xs outline-none" />
                          <button onClick={() => addProduct(s.id)} disabled={addingProduct || !newProductUrl}
                            className="px-3 py-2 rounded-lg text-xs font-semibold text-white bg-indigo-600 disabled:opacity-50">
                            {addingProduct ? "Agregando..." : "Agregar y Scrapear"}
                          </button>
                        </div>
                      )}

                      {/* Filter chips */}
                      {(mappedProducts.length > 0 || storeProducts.length > 0) && (
                        <div className="flex gap-1.5 mt-3 mb-2">
                          {(["all", "connected", "unmapped"] as const).map(f => (
                            <button key={f}
                              onClick={() => setStoreProductFilter(prev => ({ ...prev, [s.id]: f }))}
                              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                                filter === f
                                  ? "bg-indigo-100 text-indigo-700"
                                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                              }`}>
                              {f === "all" ? `Todos (${mappedProducts.length + storeProducts.length})`
                                : f === "connected" ? `Conectados (${mappedProducts.length})`
                                : `Sin mapear (${storeProducts.length})`}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Products list */}
                      {allFiltered.length > 0 ? (
                        <div className="space-y-1.5">
                          {visibleProducts.map((p: any) => (
                            p._type === "mapped" ? (
                              <div key={p._key} className="flex items-center justify-between text-xs py-1.5 px-2 bg-gray-50 rounded-lg">
                                <span className="text-gray-600 truncate flex-1">{p.productName?.substring(0, 40) || p.url}</span>
                                <span className="font-bold text-gray-800 ml-2">{fmtARS(p.price)}</span>
                                <span className="text-green-600 ml-2 text-[10px]">✓ {p.ownName?.substring(0, 20)}</span>
                              </div>
                            ) : (
                              <div key={p._key} className="flex items-center justify-between text-xs py-1.5 px-2 bg-amber-50 rounded-lg">
                                <span className="text-gray-600 truncate flex-1">{p.productName?.substring(0, 40) || "Sin nombre"}</span>
                                <span className="font-bold text-gray-800 ml-2">{p.price > 0 ? fmtARS(p.price) : "—"}</span>
                                <button onClick={() => scrapeOne(p.id)} className="ml-2 text-indigo-600 hover:underline">Scrapear</button>
                              </div>
                            )
                          ))}
                          {!showAll && hiddenCount > 0 && (
                            <button
                              onClick={() => setStoreShowMore(prev => ({ ...prev, [s.id]: true }))}
                              className="w-full text-center py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                              Ver más (+{hiddenCount})
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 py-2 px-3 mt-2 bg-emerald-50 rounded-lg">
                          <span className="text-emerald-500 text-lg">🔍</span>
                          <p className="text-xs text-emerald-700">Usa <strong>"Descubrir Productos"</strong> para buscar automaticamente productos en comun con tu catalogo.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {/* Discovery results panel */}
            {discoveryResult && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mt-3">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">Resultado del descubrimiento</p>
                    {discoveryResult.platform && (
                      <p className="text-[10px] text-emerald-600 mt-0.5">Plataforma detectada: <strong>{discoveryResult.platform.toUpperCase()}</strong></p>
                    )}
                  </div>
                  <button onClick={() => setDiscoveryResult(null)} className="text-emerald-400 hover:text-emerald-600 text-sm">&times;</button>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="bg-white rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-gray-800">{discoveryResult.totalInCatalog || discoveryResult.sitemap?.scraped || 0}</p>
                    <p className="text-[10px] text-gray-500">En catalogo competidor</p>
                  </div>
                  <div className="bg-white rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-emerald-600">{discoveryResult.created || 0}</p>
                    <p className="text-[10px] text-gray-500">Matcheados y agregados</p>
                  </div>
                  <div className="bg-white rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-gray-400">{discoveryResult.unmatched?.length || 0}</p>
                    <p className="text-[10px] text-gray-500">Sin match en tu catalogo</p>
                  </div>
                </div>
                {discoveryResult.products?.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-emerald-700 mb-1">Productos agregados:</p>
                    {discoveryResult.products.map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between text-xs py-1 px-2 bg-white rounded">
                        <span className="text-gray-700 truncate flex-1">{p.name?.substring(0, 45)}</span>
                        <span className="font-bold text-gray-800 ml-2">{fmtARS(p.price)}</span>
                        {p.matchedTo && <span className="text-emerald-600 ml-2 text-[10px]">→ {p.matchedTo.substring(0, 25)}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      )}

      </>}

      {/* ═══ TAB: INTELIGENCIA COMPETITIVA ═══ */}
      {activeTab === "inteligencia" && (
        <IntelligenceTab data={intelData} loading={intelLoading} />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Intelligence Tab Component
// ══════════════════════════════════════════════════════════════
const INTEL_COLORS = ["#FF5E1A", "#4285f4", "#8b5cf6", "#059669", "#d97706", "#ec4899"];

function IntelligenceTab({ data, loading }: { data: any; loading: boolean }) {
  if (loading) return <p className="text-gray-400 py-8">Cargando datos de inteligencia...</p>;
  if (!data) return <p className="text-gray-400 py-8">No hay datos disponibles.</p>;

  const { kpis, matchMethods, competitorProfiles, categories, priceDistribution, opportunities } = data;

  const opps = opportunities?.filter((o: any) => o.type === "oportunidad") || [];
  const risks = opportunities?.filter((o: any) => o.type === "riesgo") || [];

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Tu Catálogo" value={fmt(kpis.totalOwnProducts)} sub="productos activos" />
        <KpiCard label="Productos Competidores" value={fmt(kpis.totalCompetitorPrices)} sub={`de ${kpis.competitorCount} competidores`} />
        <KpiCard label="Coincidencias" value={fmt(kpis.matchedPrices)} sub={`${kpis.unmatchedPrices} sin match`} color="text-emerald-600" />
        <KpiCard label="Cobertura" value={`${kpis.coveragePercent}%`} sub={`${kpis.uniqueOwnMatched} de ${kpis.totalOwnProducts} productos`}
          color={kpis.coveragePercent >= 50 ? "text-emerald-600" : kpis.coveragePercent >= 20 ? "text-amber-600" : "text-red-600"} />
      </div>

      {/* Match Quality + Competitor Profiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Match Quality */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h3 className="font-bold text-gray-800 mb-4">Calidad del Matching</h3>
          <div className="space-y-3">
            {Object.entries(matchMethods || {}).map(([method, count]: [string, any]) => {
              const total = kpis.matchedPrices || 1;
              const pct = Math.round((count / total) * 100);
              const label = method === "EAN_EXACT" ? "EAN Exacto" : method === "SKU_MATCH" ? "SKU Match" : method === "FUZZY_TEXT" ? "Texto Fuzzy" : method;
              const color = method === "EAN_EXACT" ? "#059669" : method === "SKU_MATCH" ? "#4285f4" : "#d97706";
              return (
                <div key={method}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-700">{label}</span>
                    <span className="text-gray-500">{count} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                </div>
              );
            })}
            {Object.keys(matchMethods || {}).length === 0 && (
              <p className="text-sm text-gray-400">Sin datos de matching todavía</p>
            )}
          </div>
          <div className="mt-4 p-3 bg-amber-50 rounded-lg">
            <p className="text-xs text-amber-700">
              <strong>Tip:</strong> Cargando códigos EAN en tu catálogo el matching será 100% preciso por código de barras.
            </p>
          </div>
        </div>

        {/* Competitor Profiles */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h3 className="font-bold text-gray-800 mb-4">Perfil de Competidores</h3>
          <div className="space-y-3">
            {(competitorProfiles || []).map((cp: any) => (
              <div key={cp.id} className="border rounded-lg p-3">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">{cp.name}</p>
                    <p className="text-[11px] text-gray-400">{cp.totalProducts} productos descubiertos</p>
                  </div>
                  <span className={`text-sm font-bold ${cp.avgPriceDiff > 0 ? "text-green-600" : cp.avgPriceDiff < 0 ? "text-red-600" : "text-gray-500"}`}>
                    {cp.avgPriceDiff > 0 ? "+" : ""}{cp.avgPriceDiff}%
                  </span>
                </div>
                <div className="flex gap-3 text-[11px]">
                  <span className="text-green-600">{cp.cheaper} mas baratos</span>
                  <span className="text-gray-400">{cp.equal} iguales</span>
                  <span className="text-red-600">{cp.pricier} mas caros</span>
                </div>
              </div>
            ))}
            {(competitorProfiles || []).length === 0 && (
              <p className="text-sm text-gray-400">Agrega competidores para ver sus perfiles</p>
            )}
          </div>
        </div>
      </div>

      {/* Price Distribution Chart */}
      {priceDistribution && priceDistribution.some((d: any) => d.tuTienda > 0 || d.competidores > 0) && (
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h3 className="font-bold text-gray-800 mb-4">Distribución de Precios</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={priceDistribution} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="range" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value: any, name: string) => [value, name === "tuTienda" ? "Tu Tienda" : "Competidores"]}
                contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
              />
              <Legend formatter={(value: string) => value === "tuTienda" ? "Tu Tienda" : "Competidores"} />
              <Bar dataKey="tuTienda" fill="#FF5E1A" radius={[4, 4, 0, 0]} />
              <Bar dataKey="competidores" fill="#4285f4" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Category Analysis */}
      {categories && categories.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h3 className="font-bold text-gray-800 mb-4">Análisis por Categoría</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left text-[11px] text-gray-400 uppercase tracking-wider font-semibold px-4 py-2.5">Categoría</th>
                  <th className="text-center text-[11px] text-gray-400 uppercase tracking-wider font-semibold px-3 py-2.5">Tus Productos</th>
                  <th className="text-center text-[11px] text-gray-400 uppercase tracking-wider font-semibold px-3 py-2.5">Comparados</th>
                  <th className="text-center text-[11px] text-gray-400 uppercase tracking-wider font-semibold px-3 py-2.5">Cobertura</th>
                  <th className="text-center text-[11px] text-gray-400 uppercase tracking-wider font-semibold px-3 py-2.5">Dif. Precio Prom.</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat: any) => (
                  <tr key={cat.name} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-800">{cat.name}</td>
                    <td className="px-3 py-2.5 text-center text-gray-600">{cat.ownProducts}</td>
                    <td className="px-3 py-2.5 text-center text-gray-600">{cat.matchedProducts}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        cat.coverage >= 50 ? "bg-green-50 text-green-700"
                        : cat.coverage >= 20 ? "bg-amber-50 text-amber-700"
                        : "bg-red-50 text-red-700"
                      }`}>{cat.coverage}%</span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`font-semibold ${cat.avgPriceDiff > 0 ? "text-green-600" : cat.avgPriceDiff < 0 ? "text-red-600" : "text-gray-500"}`}>
                        {cat.avgPriceDiff > 0 ? "+" : ""}{cat.avgPriceDiff}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Opportunities & Risks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Opportunities */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">📈</span>
            <h3 className="font-bold text-gray-800">Oportunidades de Precio</h3>
            <span className="text-[10px] bg-green-50 text-green-700 font-semibold px-2 py-0.5 rounded">{opps.length}</span>
          </div>
          <p className="text-xs text-gray-400 mb-3">Competidores con precio mas alto que el tuyo (+10%)</p>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {opps.slice(0, 15).map((o: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-2 px-3 bg-green-50 rounded-lg text-xs">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 truncate">{o.ownProduct.substring(0, 40)}</p>
                  <p className="text-gray-500">{o.competitor}</p>
                </div>
                <div className="text-right ml-2">
                  <p className="font-bold text-green-700">+{o.diff}%</p>
                  <p className="text-gray-400">{fmtARS(o.competitorPrice)}</p>
                </div>
              </div>
            ))}
            {opps.length === 0 && <p className="text-sm text-gray-400 py-2">No hay oportunidades detectadas</p>}
          </div>
        </div>

        {/* Risks */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">⚠️</span>
            <h3 className="font-bold text-gray-800">Riesgos de Precio</h3>
            <span className="text-[10px] bg-red-50 text-red-700 font-semibold px-2 py-0.5 rounded">{risks.length}</span>
          </div>
          <p className="text-xs text-gray-400 mb-3">Competidores con precio mas bajo que el tuyo (-10%)</p>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {risks.slice(0, 15).map((o: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-2 px-3 bg-red-50 rounded-lg text-xs">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 truncate">{o.ownProduct.substring(0, 40)}</p>
                  <p className="text-gray-500">{o.competitor}</p>
                </div>
                <div className="text-right ml-2">
                  <p className="font-bold text-red-700">{o.diff}%</p>
                  <p className="text-gray-400">{fmtARS(o.competitorPrice)}</p>
                </div>
              </div>
            ))}
            {risks.length === 0 && <p className="text-sm text-gray-400 py-2">No hay riesgos detectados</p>}
          </div>
        </div>
      </div>

      {/* Coverage Gap Warning */}
      {kpis.ownWithoutCompetitor > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <span className="text-xl">🔍</span>
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {fmt(kpis.ownWithoutCompetitor)} productos sin competencia detectada
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Cargando los EAN (códigos de barra) en tu catálogo se pueden matchear automáticamente con competidores.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, sub, color = "text-gray-800" }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4 border">
      <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}
