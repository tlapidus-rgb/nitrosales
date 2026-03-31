// @ts-nocheck
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { formatARS, formatCompact } from "@/lib/utils/format";
import {
  Package, Search, Tag, TrendingUp, Truck, Star,
  ExternalLink, ChevronLeft, ChevronRight, Eye, EyeOff,
} from "lucide-react";
import { KpiCard } from "@/components/dashboard";

interface PublicacionesData {
  kpis: {
    total: number; active: number; paused: number; closed: number;
    avgPrice: number; totalStock: number; totalSold: number;
    freeShipping: number; freeShippingPct: string;
    catalog: number; catalogPct: string;
    fulfillment: number; fulfillmentPct: string;
  };
  listingTypes: Array<{ type: string; count: number }>;
  listings: Array<{
    id: string; mlItemId: string; title: string; status: string;
    price: number; originalPrice: number | null; currencyId: string;
    availableQty: number; soldQty: number; listingType: string;
    condition: string; permalink: string; thumbnailUrl: string;
    freeShipping: boolean; fulfillment: string; catalogListing: boolean;
  }>;
  pagination: { page: number; pageSize: number; totalCount: number; totalPages: number };
}

const STATUS_COLORS: Record<string, string> = {
  active: "#10b981", paused: "#f59e0b", closed: "#94a3b8", under_review: "#8b5cf6",
};
const STATUS_LABELS: Record<string, string> = {
  active: "Activa", paused: "Pausada", closed: "Cerrada", under_review: "En revision",
};

const LISTING_TYPE_LABELS: Record<string, string> = {
  gold_special: "Premium", gold_pro: "Oro Pro", gold: "Oro", silver: "Plata", bronze: "Bronce", free: "Gratis",
};

export default function PublicacionesPage() {
  const [data, setData] = useState<PublicacionesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ status, page: String(page) });
    if (search) params.set("search", search);
    fetch(`/api/mercadolibre/publicaciones?${params}`)
      .then((r) => r.json())
      .then(setData)
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [status, search, page]);

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500 mx-auto mb-3" />
          <p className="text-gray-500">Cargando publicaciones...</p>
        </div>
      </div>
    );
  }

  if (!data) return null;
  const { kpis, listings, pagination } = data;

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Publicaciones MercadoLibre</h1>
        <p className="text-sm text-gray-500 mt-0.5">Catalogo de publicaciones del seller ELMUNDODELJUG</p>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={<Eye size={16} className="text-emerald-600" />} iconBg="bg-emerald-50"
          label="Activas" value={kpis.active.toLocaleString("es-AR")} />
        <KpiCard icon={<EyeOff size={16} className="text-yellow-600" />} iconBg="bg-yellow-50"
          label="Pausadas" value={kpis.paused.toLocaleString("es-AR")} />
        <KpiCard icon={<Tag size={16} className="text-purple-600" />} iconBg="bg-purple-50"
          label="Precio promedio" value={formatARS(kpis.avgPrice)} />
        <KpiCard icon={<Package size={16} className="text-blue-600" />} iconBg="bg-blue-50"
          label="Stock total" value={formatCompact(kpis.totalStock)} />
        <KpiCard icon={<Truck size={16} className="text-cyan-600" />} iconBg="bg-cyan-50"
          label="Envio gratis" value={`${kpis.freeShippingPct}%`}
          subtitle={`${kpis.freeShipping} pubs`} />
        <KpiCard icon={<Star size={16} className="text-orange-600" />} iconBg="bg-orange-50"
          label="Full / Catalogo" value={`${kpis.fulfillmentPct}%`}
          subtitle={`${kpis.fulfillment} full · ${kpis.catalog} cat`} />
      </div>

      {/* LISTING TYPES */}
      {data.listingTypes.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <h3 className="text-xs font-semibold text-gray-600 mb-3">Tipo de publicacion (activas)</h3>
          <div className="flex gap-3 flex-wrap">
            {data.listingTypes.map((lt) => (
              <div key={lt.type} className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg">
                <span className="text-xs font-medium text-gray-700">{LISTING_TYPE_LABELS[lt.type] || lt.type}</span>
                <span className="text-xs font-bold text-indigo-600">{lt.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FILTERS + SEARCH */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex gap-1.5 bg-gray-100 rounded-lg p-1">
          {[
            { value: "all", label: "Todas" },
            { value: "active", label: "Activas" },
            { value: "paused", label: "Pausadas" },
            { value: "closed", label: "Cerradas" },
          ].map((s) => (
            <button key={s.value} onClick={() => { setStatus(s.value); setPage(1); }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${status === s.value ? "bg-white text-yellow-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Buscar por titulo o MLA..."
              value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 bg-white w-64" />
          </div>
          <button onClick={handleSearch} className="px-3 py-1.5 bg-yellow-100 text-yellow-700 rounded-lg text-xs font-medium hover:bg-yellow-200 transition-all">
            Buscar
          </button>
        </div>
      </div>

      {/* LISTINGS TABLE */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left text-[11px] font-medium text-gray-500 py-3 px-4">Producto</th>
                <th className="text-right text-[11px] font-medium text-gray-500 py-3 px-3">Precio</th>
                <th className="text-center text-[11px] font-medium text-gray-500 py-3 px-3">Stock</th>
                <th className="text-center text-[11px] font-medium text-gray-500 py-3 px-3">Vendidos</th>
                <th className="text-center text-[11px] font-medium text-gray-500 py-3 px-3">Tipo</th>
                <th className="text-center text-[11px] font-medium text-gray-500 py-3 px-3">Estado</th>
                <th className="text-center text-[11px] font-medium text-gray-500 py-3 px-3">Envio</th>
                <th className="text-center text-[11px] font-medium text-gray-500 py-3 px-3">Link</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((l) => (
                <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                        {l.thumbnailUrl ? <img src={l.thumbnailUrl} alt="" className="w-full h-full object-cover" /> : <Package size={16} className="text-gray-400 m-auto mt-3" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-800 truncate max-w-[300px]">{l.title}</p>
                        <p className="text-[10px] text-gray-400 font-mono">{l.mlItemId}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <p className="text-xs font-semibold text-gray-800">{formatARS(l.price)}</p>
                    {l.originalPrice && l.originalPrice > l.price && (
                      <p className="text-[10px] text-gray-400 line-through">{formatARS(l.originalPrice)}</p>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span className={`text-xs font-medium ${l.availableQty <= 3 ? "text-red-500" : l.availableQty <= 10 ? "text-yellow-600" : "text-gray-700"}`}>
                      {l.availableQty}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span className="text-xs text-gray-700">{l.soldQty.toLocaleString("es-AR")}</span>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span className="text-[10px] text-gray-600">{LISTING_TYPE_LABELS[l.listingType] || l.listingType || "--"}</span>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium"
                      style={{ backgroundColor: `${STATUS_COLORS[l.status] || "#94a3b8"}15`, color: STATUS_COLORS[l.status] || "#94a3b8" }}>
                      {STATUS_LABELS[l.status] || l.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {l.freeShipping && <span className="text-[10px] text-emerald-600 font-medium">Gratis</span>}
                      {l.fulfillment === "fulfillment" && <span className="text-[10px] text-blue-600 font-medium">Full</span>}
                      {l.catalogListing && <span className="text-[10px] text-purple-600 font-medium">Cat</span>}
                      {!l.freeShipping && l.fulfillment !== "fulfillment" && !l.catalogListing && <span className="text-[10px] text-gray-400">--</span>}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    {l.permalink && (
                      <a href={l.permalink} target="_blank" rel="noopener noreferrer"
                        className="text-gray-400 hover:text-yellow-600 transition-colors">
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
              {listings.length === 0 && (
                <tr><td colSpan={8} className="text-center py-12 text-sm text-gray-400">
                  {kpis.total === 0 ? "Sin publicaciones sincronizadas. Presiona 'Sync ML' en el Dashboard." : "No se encontraron resultados"}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              Pagina {pagination.page} de {pagination.totalPages} ({pagination.totalCount} publicaciones)
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 hover:bg-gray-50 disabled:opacity-50 transition-all">
                <ChevronLeft size={12} /> Anterior
              </button>
              <button onClick={() => setPage(page + 1)} disabled={page >= pagination.totalPages}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 hover:bg-gray-50 disabled:opacity-50 transition-all">
                Siguiente <ChevronRight size={12} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
