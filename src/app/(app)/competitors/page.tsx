// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// Competencia — Monitoreo de Precios de Competidores
// ══════════════════════════════════════════════════════════════

import { useEffect, useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

const fmt = (n: number) => n?.toLocaleString("es-AR") ?? "0";
const fmtARS = (n: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
const COLORS = ["#FF5E1A", "#4285f4", "#8b5cf6", "#059669", "#d97706", "#ec4899", "#06b6d4"];

type Store = { id: string; name: string; website: string };
type CompItem = {
  store: string; storeId: string; price: number; diff: number;
  previousPrice: number | null; url: string; productName: string; imageUrl?: string;
};
type PriceRow = {
  ownProduct: { id: string; name: string; sku: string; price: number; imageUrl?: string; priceStatus?: "ok" | "sin_stock" | "sin_precio" };
  competitors: CompItem[];
  position: number;
  totalInComparison: number;
  bestPrice: CompItem | null;
};
type Change = { competitor: string; product: string; oldPrice: number; newPrice: number; change: number; date: string };
type Alert = { type: string; product: string; diff?: number; competitor?: string; drop?: number };

export default function CompetitorsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => { loadData(); }, []);

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
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((r: PriceRow) => r.ownProduct.name.toLowerCase().includes(q) || r.ownProduct.sku?.toLowerCase().includes(q));
    }
    return rows;
  }, [data, storeFilter, search]);

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
              <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Tasa de Scraping</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{summary.successRate}%</p>
              <p className="text-xs text-gray-400 mt-0.5">Productos con precio exitoso</p>
            </div>
          </div>

          {/* Price Comparison Table */}
          <div className="bg-white rounded-xl shadow-sm border mb-5">
            <div className="flex justify-between items-center p-5 pb-3">
              <div className="flex items-center gap-3">
                <h3 className="font-bold text-gray-800">Comparativa de Precios</h3>
                <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded" style={{ background: "#fff7ed", color: "#c2410c" }}>PRECIOS</span>
              </div>
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar producto..."
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs w-48 outline-none focus:border-indigo-400"
              />
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
                            <img src={row.ownProduct.imageUrl} alt="" className="w-9 h-9 rounded-lg object-cover bg-gray-100" />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-gray-300 text-lg">📦</div>
                          )}
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
                          <span className="text-[11px] font-semibold px-2 py-1 rounded bg-amber-50 text-amber-600">Sin precio publicado</span>
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
                            <span className={`font-bold tabular-nums ${isMore ? "text-green-600" : isLess ? "text-red-600" : "text-gray-500"}`}>
                              {fmtARS(comp.price)}
                            </span>
                            <span className={`ml-1.5 text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                              isMore ? "bg-green-50 text-green-700" : isLess ? "bg-red-50 text-red-700" : "text-gray-400"
                            }`}>
                              {comp.diff > 0 ? "+" : ""}{comp.diff}%
                            </span>
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

            {/* Existing stores + their products */}
            {stores.map((s: Store) => {
              const storeProducts = data?.unmappedProducts?.filter((p: any) => p.competitor === s.name) || [];
              const mappedProducts = data?.priceComparison?.flatMap((r: PriceRow) =>
                r.competitors.filter((c: CompItem) => c.storeId === s.id).map((c: CompItem) => ({ ...c, ownName: r.ownProduct.name }))
              ) || [];

              return (
                <div key={s.id} className="border rounded-xl p-4 mb-3">
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <p className="font-semibold text-gray-800">{s.name}</p>
                      <p className="text-xs text-gray-400">{s.website}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => discoverProducts(s.id)} disabled={discovering === s.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5">
                        {discovering === s.id ? (
                          <><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Buscando...</>
                        ) : (
                          <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg> Descubrir Productos</>
                        )}
                      </button>
                      <button onClick={() => { setShowAddProduct(s.id); setNewProductUrl(""); }}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-600 border border-indigo-200 hover:bg-indigo-50">
                        + Manual
                      </button>
                      <button onClick={() => deleteItem("store", s.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50">
                        Eliminar
                      </button>
                    </div>
                  </div>

                  {/* Add product URL inline */}
                  {showAddProduct === s.id && (
                    <div className="flex gap-2 mb-3 bg-indigo-50 p-3 rounded-lg">
                      <input value={newProductUrl} onChange={e => setNewProductUrl(e.target.value)}
                        placeholder="URL del producto (ej: https://www.cody.com.ar/lego-city-60320)"
                        className="flex-1 px-3 py-2 border rounded-lg text-xs outline-none" />
                      <button onClick={() => addProduct(s.id)} disabled={addingProduct || !newProductUrl}
                        className="px-3 py-2 rounded-lg text-xs font-semibold text-white bg-indigo-600 disabled:opacity-50">
                        {addingProduct ? "Agregando..." : "Agregar y Scrapear"}
                      </button>
                    </div>
                  )}

                  {/* Products list */}
                  {(storeProducts.length > 0 || mappedProducts.length > 0) ? (
                    <div className="space-y-1.5">
                      {mappedProducts.map((p: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-xs py-1.5 px-2 bg-gray-50 rounded-lg">
                          <span className="text-gray-600 truncate flex-1">{p.productName?.substring(0, 40) || p.url}</span>
                          <span className="font-bold text-gray-800 ml-2">{fmtARS(p.price)}</span>
                          <span className="text-green-600 ml-2 text-[10px]">✓ {p.ownName?.substring(0, 20)}</span>
                        </div>
                      ))}
                      {storeProducts.map((p: any) => (
                        <div key={p.id} className="flex items-center justify-between text-xs py-1.5 px-2 bg-amber-50 rounded-lg">
                          <span className="text-gray-600 truncate flex-1">{p.productName?.substring(0, 40) || "Sin nombre"}</span>
                          <span className="font-bold text-gray-800 ml-2">{p.price > 0 ? fmtARS(p.price) : "—"}</span>
                          <button onClick={() => scrapeOne(p.id)} className="ml-2 text-indigo-600 hover:underline">Scrapear</button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 py-2 px-3 bg-emerald-50 rounded-lg">
                      <span className="text-emerald-500 text-lg">🔍</span>
                      <p className="text-xs text-emerald-700">Usa <strong>"Descubrir Productos"</strong> para buscar automaticamente productos en comun con tu catalogo.</p>
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

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
