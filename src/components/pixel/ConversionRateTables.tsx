"use client";

/* ══════════════════════════════════════════════════════════
   ConversionRateTables — CR por Categoría / Marca / Producto
   ══════════════════════════════════════════════════════════
   Movidas de /products (tab "Conversión") a /pixel/analytics
   (feedback 2026-07-15). Extraídas a componente compartido.

   - Data source: /api/metrics/conversion (endpoint liviano,
     rollups HLL — perf fix 2026-07).
   - Fetch lazy: se dispara al montar y al cambiar el rango.
   - Sin columna Revenue (feedback 2026-07-15): estas tablas
     miden conversión (visitantes → compras), no facturación.
═══════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useState } from "react";

const cardStyle = "bg-white rounded-2xl border border-gray-100 transition-all duration-[280ms]";
const cardShadow = { boxShadow: "0 1px 0 rgba(15,23,42,0.04), 0 8px 24px -12px rgba(15,23,42,0.12), 0 22px 40px -28px rgba(15,23,42,0.10)" };

const crFmt = (n: number) => n.toLocaleString("es-AR");
const crColor = (v: number) => v >= 5 ? "text-emerald-600" : v >= 2 ? "text-amber-600" : v > 0 ? "text-red-500" : "text-gray-300";

type CrSortDir = "asc" | "desc";

function CrSortTH<K extends string>({ label, field, sortKey, sortDir, onSort, className = "" }: {
  label: string; field: K; sortKey: K; sortDir: CrSortDir; onSort: (k: K) => void; className?: string;
}) {
  const active = sortKey === field;
  return (
    <th
      className={`text-[10px] font-medium uppercase tracking-wider pb-2 cursor-pointer select-none hover:text-gray-700 transition-colors whitespace-nowrap ${active ? "text-cyan-600" : "text-gray-400"} ${className}`}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {active && <span className="text-[8px]">{sortDir === "desc" ? "▼" : "▲"}</span>}
      </span>
    </th>
  );
}

function CrSearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 pl-7 focus:outline-none focus:ring-1 focus:ring-cyan-400 focus:border-cyan-400 bg-gray-50/50 placeholder-gray-400"
      />
      <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
    </div>
  );
}

// ── CR by Category ──
type CatRow = { category: string; viewers: number; buyers: number; cr: number };
type CatSortKey = "viewers" | "buyers" | "cr";

function CategoryCRTable({ categories }: { categories: CatRow[] }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<CatSortKey>("buyers");
  const [sortDir, setSortDir] = useState<CrSortDir>("desc");

  const toggle = (k: CatSortKey) => {
    if (sortKey === k) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const rows = q ? categories.filter(c => c.category.toLowerCase().includes(q)) : categories;
    return [...rows].sort((a, b) => {
      const diff = (a[sortKey] || 0) - (b[sortKey] || 0);
      return sortDir === "desc" ? -diff : diff;
    });
  }, [categories, search, sortKey, sortDir]);

  return (
    <div className={`${cardStyle} p-5 flex flex-col`} style={cardShadow}>
      <div className="flex items-center justify-between mb-3 gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">CR por Categoría</h2>
          <p className="text-[11px] text-gray-400 mt-0.5">Visitantes (pixel) vs compradores (VTEX)</p>
        </div>
        <span className="text-[10px] text-gray-300 whitespace-nowrap">{filtered.length} de {categories.length}</span>
      </div>
      <div className="mb-3">
        <CrSearchInput value={search} onChange={setSearch} placeholder="Buscar categoría..." />
      </div>
      <div className="overflow-y-auto overflow-x-auto flex-1" style={{ maxHeight: "320px" }}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="border-b border-gray-100">
              <th className="text-left text-[10px] font-medium text-gray-400 uppercase tracking-wider pb-2 pr-2">Categoría</th>
              <CrSortTH label="Visitantes" field="viewers" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="text-right px-2" />
              <CrSortTH label="Compras" field="buyers" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="text-right px-2" />
              <CrSortTH label="CR" field="cr" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="text-right pl-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map(cat => (
              <tr key={cat.category} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                <td className="py-1.5 pr-2 font-medium text-gray-700 truncate max-w-[160px]" title={cat.category}>{cat.category}</td>
                <td className="text-right text-gray-600 tabular-nums px-2 py-1.5">{crFmt(cat.viewers)}</td>
                <td className="text-right text-gray-600 tabular-nums px-2 py-1.5">{crFmt(cat.buyers)}</td>
                <td className="text-right pl-2 py-1.5"><span className={`font-bold tabular-nums ${crColor(cat.cr)}`}>{cat.cr > 0 ? `${cat.cr}%` : "—"}</span></td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={4} className="text-center text-gray-400 py-6">Sin resultados</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── CR by Brand ──
type BrandRow = { brand: string; viewers: number; buyers: number; cr: number };
type BrandSortKey = "viewers" | "buyers" | "cr";

function BrandCRTable({ brands }: { brands: BrandRow[] }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<BrandSortKey>("buyers");
  const [sortDir, setSortDir] = useState<CrSortDir>("desc");

  const toggle = (k: BrandSortKey) => {
    if (sortKey === k) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const rows = q ? brands.filter(b => b.brand.toLowerCase().includes(q)) : brands;
    return [...rows].sort((a, b) => {
      const diff = (a[sortKey] || 0) - (b[sortKey] || 0);
      return sortDir === "desc" ? -diff : diff;
    });
  }, [brands, search, sortKey, sortDir]);

  return (
    <div className={`${cardStyle} p-5 flex flex-col`} style={cardShadow}>
      <div className="flex items-center justify-between mb-3 gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">CR por Marca</h2>
          <p className="text-[11px] text-gray-400 mt-0.5">Visitantes (pixel) vs compradores (VTEX)</p>
        </div>
        <span className="text-[10px] text-gray-300 whitespace-nowrap">{filtered.length} de {brands.length}</span>
      </div>
      <div className="mb-3">
        <CrSearchInput value={search} onChange={setSearch} placeholder="Buscar marca..." />
      </div>
      <div className="overflow-y-auto overflow-x-auto flex-1" style={{ maxHeight: "320px" }}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="border-b border-gray-100">
              <th className="text-left text-[10px] font-medium text-gray-400 uppercase tracking-wider pb-2 pr-2">Marca</th>
              <CrSortTH label="Visitantes" field="viewers" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="text-right px-2" />
              <CrSortTH label="Compras" field="buyers" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="text-right px-2" />
              <CrSortTH label="CR" field="cr" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="text-right pl-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map(b => (
              <tr key={b.brand} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                <td className="py-1.5 pr-2 font-medium text-gray-700 truncate max-w-[160px]" title={b.brand}>{b.brand}</td>
                <td className="text-right text-gray-600 tabular-nums px-2 py-1.5">{crFmt(b.viewers)}</td>
                <td className="text-right text-gray-600 tabular-nums px-2 py-1.5">{crFmt(b.buyers)}</td>
                <td className="text-right pl-2 py-1.5"><span className={`font-bold tabular-nums ${crColor(b.cr)}`}>{b.cr > 0 ? `${b.cr}%` : "—"}</span></td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={4} className="text-center text-gray-400 py-6">Sin resultados</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── CR by Product ──
type ProductCRRow = { productExternalId: string; productName: string; category: string; brand: string; viewers: number; orders: number; units: number; cr: number };
type ProdSortKey = "orders" | "viewers" | "cr";
const CR_PRODUCTS_PER_PAGE = 20;

function ProductCRTable({ products }: { products: ProductCRRow[] }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<ProdSortKey>("orders");
  const [sortDir, setSortDir] = useState<CrSortDir>("desc");
  const [filterCat, setFilterCat] = useState("");
  const [filterBrand, setFilterBrand] = useState("");
  const [page, setPage] = useState(0);

  const allCategories = useMemo(() => [...new Set(products.map(p => p.category))].sort(), [products]);
  const allBrands = useMemo(() => [...new Set(products.map(p => p.brand))].sort(), [products]);

  const toggle = (k: ProdSortKey) => {
    if (sortKey === k) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(k); setSortDir("desc"); }
    setPage(0);
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    let rows = products;
    if (q) rows = rows.filter(p => p.productName.toLowerCase().includes(q) || p.productExternalId.includes(q));
    if (filterCat) rows = rows.filter(p => p.category === filterCat);
    if (filterBrand) rows = rows.filter(p => p.brand === filterBrand);
    return [...rows].sort((a, b) => {
      const diff = (a[sortKey] || 0) - (b[sortKey] || 0);
      return sortDir === "desc" ? -diff : diff;
    });
  }, [products, search, filterCat, filterBrand, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / CR_PRODUCTS_PER_PAGE);
  const pageRows = filtered.slice(page * CR_PRODUCTS_PER_PAGE, (page + 1) * CR_PRODUCTS_PER_PAGE);

  useEffect(() => { setPage(0); }, [search, filterCat, filterBrand]);

  const hasFilters = search || filterCat || filterBrand;

  return (
    <div className={`${cardStyle} p-5 flex flex-col`} style={cardShadow}>
      <div className="flex items-center justify-between mb-3 gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">CR por Producto</h2>
          <p className="text-[11px] text-gray-400 mt-0.5">Buscá, filtrá y ordená — visitantes del pixel vs compradores VTEX</p>
        </div>
        <span className="text-[10px] text-gray-300 whitespace-nowrap">{filtered.length} productos</span>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <div className="flex-1 min-w-[180px]">
          <CrSearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre o SKU..." />
        </div>
        <select
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50/50 focus:outline-none focus:ring-1 focus:ring-cyan-400 text-gray-600 max-w-[180px]"
        >
          <option value="">Todas las categorías</option>
          {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={filterBrand}
          onChange={e => setFilterBrand(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50/50 focus:outline-none focus:ring-1 focus:ring-cyan-400 text-gray-600 max-w-[180px]"
        >
          <option value="">Todas las marcas</option>
          {allBrands.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        {hasFilters && (
          <button
            onClick={() => { setSearch(""); setFilterCat(""); setFilterBrand(""); }}
            className="text-[10px] text-cyan-600 hover:text-cyan-800 font-medium px-2 py-1.5 rounded-lg hover:bg-cyan-50 transition-colors"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="overflow-y-auto overflow-x-auto flex-1" style={{ maxHeight: "400px" }}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="border-b border-gray-100">
              <th className="text-left text-[10px] font-medium text-gray-400 uppercase tracking-wider pb-2 pr-2">Producto</th>
              <th className="text-left text-[10px] font-medium text-gray-400 uppercase tracking-wider pb-2 px-2 hidden lg:table-cell">Categoría</th>
              <th className="text-left text-[10px] font-medium text-gray-400 uppercase tracking-wider pb-2 px-2 hidden xl:table-cell">Marca</th>
              <CrSortTH label="Visitantes" field="viewers" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="text-right px-2" />
              <CrSortTH label="Ventas" field="orders" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="text-right px-2" />
              <CrSortTH label="CR" field="cr" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="text-right pl-2" />
            </tr>
          </thead>
          <tbody>
            {pageRows.map((p, i) => (
              <tr key={p.productExternalId || i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                <td className="py-1.5 pr-2 max-w-[220px]">
                  <span className="font-medium text-gray-700 truncate block" title={p.productName}>{p.productName}</span>
                  <span className="text-[10px] text-gray-400 lg:hidden">{p.category}</span>
                </td>
                <td className="text-gray-500 px-2 py-1.5 truncate max-w-[120px] hidden lg:table-cell">{p.category}</td>
                <td className="text-gray-500 px-2 py-1.5 truncate max-w-[100px] hidden xl:table-cell">{p.brand}</td>
                <td className="text-right text-gray-600 tabular-nums px-2 py-1.5">{crFmt(p.viewers)}</td>
                <td className="text-right text-gray-600 tabular-nums px-2 py-1.5">{crFmt(p.orders)}</td>
                <td className="text-right pl-2 py-1.5"><span className={`font-bold tabular-nums ${crColor(p.cr)}`}>{p.cr > 0 ? `${p.cr}%` : "—"}</span></td>
              </tr>
            ))}
            {pageRows.length === 0 && <tr><td colSpan={6} className="text-center text-gray-400 py-6">Sin resultados</td></tr>}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="text-[11px] px-3 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ← Anterior
          </button>
          <span className="text-[11px] text-gray-400 tabular-nums">
            Página {page + 1} de {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="text-[11px] px-3 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Componente público — fetch + layout de las 3 tablas
═══════════════════════════════════════════════════════════ */

type ConversionData = {
  byCategory: CatRow[];
  byBrand: BrandRow[];
  byProduct: ProductCRRow[];
};

export default function ConversionRateTables({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [data, setData] = useState<ConversionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const fetchConversion = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/metrics/conversion?from=${dateFrom}&to=${dateTo}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        const cr = json?.conversionRates || {};
        setData({
          byCategory: (cr.byCategory || []) as CatRow[],
          byBrand: ((cr.byBrand || []) as BrandRow[]).filter(b => b.brand !== "Sin marca"),
          byProduct: ((cr.byProduct || []) as ProductCRRow[]).filter(p => p.productName !== "Producto desconocido"),
        });
      } catch (err) {
        if (cancelled) return;
        console.error("Error fetching conversion rates:", err);
        setError("No se pudieron cargar las tasas de conversión. Probá de nuevo.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchConversion();
    return () => { cancelled = true; };
  }, [dateFrom, dateTo, retryTick]);

  return (
    <div className="space-y-4">
      {/* Loading state */}
      {loading && !data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className={`${cardStyle} p-5 h-64 animate-pulse`} style={cardShadow} />
          <div className={`${cardStyle} p-5 h-64 animate-pulse`} style={cardShadow} />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200/60 rounded-xl px-4 py-3">
          <p className="text-[12px] text-red-700">{error}</p>
          <button
            onClick={() => { setData(null); setError(null); setRetryTick(t => t + 1); }}
            className="text-[11px] text-red-700 hover:text-red-900 font-semibold px-3 py-1 rounded-lg hover:bg-red-100 transition-colors"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Data rendered */}
      {data && !loading && (
        <>
          {/* Row 1: Category + Brand */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {data.byCategory.length > 0 && <CategoryCRTable categories={data.byCategory} />}
            {data.byBrand.length > 0 && <BrandCRTable brands={data.byBrand} />}
          </div>

          {/* Row 2: Product */}
          {data.byProduct.length > 0 && <ProductCRTable products={data.byProduct} />}

          {/* Empty state */}
          {data.byCategory.length === 0 && data.byBrand.length === 0 && data.byProduct.length === 0 && (
            <div className={`${cardStyle} p-8 text-center`} style={cardShadow}>
              <p className="text-sm text-gray-500">Sin datos de conversión en este rango de fechas.</p>
              <p className="text-[11px] text-gray-400 mt-1">Probá ampliar el rango o revisá que el pixel esté tracking eventos VIEW_PRODUCT.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
