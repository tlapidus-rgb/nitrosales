// @ts-nocheck
"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, AreaChart, Area, Legend,
} from "recharts";
import { formatARS, formatCompact } from "@/lib/utils/format";
import {
  Users, Search, ArrowUpRight, ArrowDownRight, XCircle,
  TrendingUp, MapPin, Star, AlertTriangle, Heart, UserPlus,
  ChevronDown, DollarSign, ShoppingCart, RefreshCw,
} from "lucide-react";
import {
  KpiCard, ChangeBadge, DateRangeFilter, SourceFilter,
} from "@/components/dashboard";

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#8b5cf6", "#f97316"];

const SEGMENT_COLORS: Record<string, string> = {
  Champions: "#10b981", Leales: "#6366f1", Nuevos: "#06b6d4",
  Potenciales: "#f59e0b", Ocasionales: "#94a3b8", "En riesgo": "#ef4444", Perdidos: "#9ca3af",
};

const SEGMENT_ICONS: Record<string, any> = {
  Champions: Star, Leales: Heart, Nuevos: UserPlus,
  Potenciales: TrendingUp, Ocasionales: Users, "En riesgo": AlertTriangle, Perdidos: XCircle,
};

const QUICK_RANGES = [
  { label: "3 meses", days: 90 },
  { label: "6 meses", days: 180 },
  { label: "12 meses", days: 365 },
  { label: "Todo", days: 730 },
];

function toDateInputValue(date: Date): string {
  return date.toISOString().split("T")[0];
}

export default function CustomersPage() {
  const defaultTo = new Date();
  const defaultFrom = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const [dateFrom, setDateFrom] = useState(toDateInputValue(defaultFrom));
  const [dateTo, setDateTo] = useState(toDateInputValue(defaultTo));
  const [activeQuickRange, setActiveQuickRange] = useState<number | null>(365);
  const [source, setSource] = useState<string>("ALL");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [segmentFilter, setSegmentFilter] = useState<string | null>(null);
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ from: dateFrom, to: dateTo, page: currentPage.toString() });
        if (source !== "ALL") params.set("source", source);
        const res = await fetch(`/api/metrics/customers?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setData(await res.json());
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [dateFrom, dateTo, source, currentPage]);

  const handleQuickRange = (days: number) => {
    const to = new Date();
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    setDateTo(toDateInputValue(to));
    setDateFrom(toDateInputValue(from));
    setActiveQuickRange(days);
    setCurrentPage(1);
  };

  const handleDateChange = (type: "from" | "to", value: string) => {
    if (type === "from") setDateFrom(value);
    else setDateTo(value);
    setActiveQuickRange(null);
    setCurrentPage(1);
  };

  // Filtered customers (search + segment)
  const filteredCustomers = useMemo(() => {
    if (!data) return [];
    let customers = [...data.customers];
    if (segmentFilter) {
      customers = customers.filter((c: any) => c.segment === segmentFilter);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      customers = customers.filter(
        (c: any) => c.name.toLowerCase().includes(term) || c.email.toLowerCase().includes(term)
      );
    }
    return customers;
  }, [data, searchTerm, segmentFilter]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-3" />
          <p className="text-gray-500">Cargando clientes...</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <XCircle size={32} className="text-red-400 mx-auto mb-2" />
          <p className="text-red-600">Error: {error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;
  const { kpis } = data;

  return (
    <div className="space-y-6">
      {/* HEADER + FILTERS */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
            <p className="text-sm text-gray-500 mt-0.5">Segmentacion y comportamiento de compra</p>
          </div>
          <SourceFilter source={source} onSourceChange={(s) => { setSource(s); setCurrentPage(1); }} />
        </div>
        <DateRangeFilter
          dateFrom={dateFrom} dateTo={dateTo} activeQuickRange={activeQuickRange}
          quickRanges={QUICK_RANGES} onQuickRange={handleQuickRange}
          onDateChange={handleDateChange} loading={loading}
        />
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-4">
        <KpiCard icon={<Users size={16} className="text-emerald-600" />} iconBg="bg-emerald-50"
          label="Clientes unicos" value={kpis.totalCustomers.toLocaleString("es-AR")} change={kpis.changes.customers} />
        <KpiCard icon={<RefreshCw size={16} className="text-indigo-600" />} iconBg="bg-indigo-50"
          label="Tasa de recompra" value={`${kpis.repeatRate}%`}
          subtitle={`${kpis.avgOrdersPerCustomer} ordenes/cliente promedio`} />
        <KpiCard icon={<DollarSign size={16} className="text-purple-600" />} iconBg="bg-purple-50"
          label="Gasto promedio/cliente" value={formatARS(kpis.avgSpentPerCustomer)} change={kpis.changes.avgSpent} />
        <KpiCard icon={<UserPlus size={16} className="text-blue-600" />} iconBg="bg-blue-50"
          label="Clientes nuevos" value={kpis.newCustomers.toLocaleString("es-AR")}
          subtitle="primera compra en el periodo" />
      </div>

      {/* NEW VS RETURNING CHART */}
      {data.newVsReturning && data.newVsReturning.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Clientes nuevos vs recurrentes por mes</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.newVsReturning}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false}
                tickFormatter={(m) => { try { const [y, mo] = m.split("-"); return `${mo}/${y.slice(2)}`; } catch { return m; } }} />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={40} />
              <Tooltip contentStyle={{ borderRadius: "0.5rem", border: "1px solid #e2e8f0", fontSize: "0.8rem" }}
                formatter={(v: number, name: string) => [v, name === "newCustomers" ? "Nuevos" : "Recurrentes"]} />
              <Legend formatter={(name) => name === "newCustomers" ? "Nuevos" : "Recurrentes"} />
              <Bar dataKey="newCustomers" stackId="a" fill="#06b6d4" radius={[0, 0, 0, 0]} name="newCustomers" />
              <Bar dataKey="returningCustomers" stackId="a" fill="#6366f1" radius={[4, 4, 0, 0]} name="returningCustomers" />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-gray-400 mt-2 text-center">
            Si los nuevos bajan, hay problema de adquisicion. Si los recurrentes bajan, hay problema de retencion.
          </p>
        </div>
      )}

      {/* RFM SEGMENTS PIE + FREQUENCY BAR */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Segmentos de clientes</h2>
          <div className="flex gap-4">
            <div className="w-1/2">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={data.rfmSegments} dataKey="customers" nameKey="segment" cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2}>
                    {data.rfmSegments.map((s: any, i: number) => (
                      <Cell key={i} fill={SEGMENT_COLORS[s.segment] || COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => v.toLocaleString("es-AR")} contentStyle={{ borderRadius: "0.5rem", border: "1px solid #e2e8f0", fontSize: "0.8rem" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-1/2 flex flex-col justify-center gap-2">
              {data.rfmSegments.map((s: any) => {
                const Icon = SEGMENT_ICONS[s.segment] || Users;
                return (
                  <div key={s.segment} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5 -mx-1 transition-colors"
                    onClick={() => setSegmentFilter(segmentFilter === s.segment ? null : s.segment)}>
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: SEGMENT_COLORS[s.segment] || "#94a3b8" }} />
                    <Icon size={12} className="text-gray-400" />
                    <span className={`text-xs flex-1 ${segmentFilter === s.segment ? "text-gray-900 font-semibold" : "text-gray-600"}`}>{s.segment}</span>
                    <span className="text-xs font-medium text-gray-800">{s.customers}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Frecuencia de compra</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.frequencyDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={40} />
              <Tooltip formatter={(v: number) => v.toLocaleString("es-AR")} contentStyle={{ borderRadius: "0.5rem", border: "1px solid #e2e8f0", fontSize: "0.8rem" }} />
              <Bar dataKey="customers" fill="#6366f1" radius={[4, 4, 0, 0]} name="Clientes" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* CLV BY SEGMENT */}
      {data.clvBySegment && data.clvBySegment.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Valor estimado por segmento (CLV)</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {data.clvBySegment.map((s: any) => {
              const Icon = SEGMENT_ICONS[s.segment] || Users;
              return (
                <div key={s.segment} className="border border-gray-100 rounded-lg p-3 hover:shadow-sm transition-shadow">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: SEGMENT_COLORS[s.segment] || "#94a3b8" }} />
                    <Icon size={12} className="text-gray-400" />
                    <span className="text-xs font-medium text-gray-700">{s.segment}</span>
                  </div>
                  <p className="text-lg font-bold text-gray-900">{formatCompact(s.estimatedCLV)}</p>
                  <p className="text-[10px] text-gray-400">CLV estimado</p>
                  <div className="mt-2 flex gap-3 text-[10px] text-gray-500">
                    <span>Ticket: {formatCompact(s.avgTicket)}</span>
                    <span>{s.avgOrders} ord.</span>
                    <span>{s.customerCount} cl.</span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-gray-400 mt-3 text-center">
            CLV = Ticket promedio x Ordenes promedio. Usado para definir cuanto invertir en adquirir/retener cada segmento.
          </p>
        </div>
      )}

      {/* TOP CITIES (improved with ticket + repeat rate) */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-800 mb-4">Top ciudades</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-[11px] font-medium text-gray-500 pb-2 px-2">Ciudad</th>
                <th className="text-right text-[11px] font-medium text-gray-500 pb-2 px-2">Clientes</th>
                <th className="text-right text-[11px] font-medium text-gray-500 pb-2 px-2">Revenue</th>
                <th className="text-right text-[11px] font-medium text-gray-500 pb-2 px-2">Ticket prom.</th>
                <th className="text-right text-[11px] font-medium text-gray-500 pb-2 px-2">Recompra</th>
                <th className="text-left text-[11px] font-medium text-gray-500 pb-2 px-2 w-1/3"></th>
              </tr>
            </thead>
            <tbody>
              {data.topCities.map((c: any) => {
                const maxCustomers = data.topCities[0]?.customers || 1;
                const pct = (c.customers / maxCustomers) * 100;
                return (
                  <tr key={c.city} className="border-b border-gray-50">
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-2">
                        <MapPin size={12} className="text-gray-400" />
                        <span className="text-xs text-gray-700">{c.city}</span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-right"><span className="text-xs font-medium text-gray-800">{c.customers}</span></td>
                    <td className="py-2 px-2 text-right"><span className="text-xs text-gray-600">{formatCompact(c.revenue)}</span></td>
                    <td className="py-2 px-2 text-right"><span className="text-xs text-gray-600">{c.avgTicket ? formatCompact(c.avgTicket) : "-"}</span></td>
                    <td className="py-2 px-2 text-right">
                      <span className={`text-xs font-medium ${(c.repeatPct || 0) >= 20 ? "text-emerald-600" : "text-gray-600"}`}>
                        {c.repeatPct ? `${c.repeatPct}%` : "-"}
                      </span>
                    </td>
                    <td className="py-2 px-2">
                      <div className="bg-gray-100 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* CUSTOMERS TABLE with segment filter */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
        <div className="flex flex-col gap-3 mb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">Listado de clientes</h2>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Buscar por nombre o email..." value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 bg-white w-64" />
            </div>
          </div>
          {/* Segment filter chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button onClick={() => setSegmentFilter(null)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${!segmentFilter ? "bg-gray-900 text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}>
              Todos
            </button>
            {data.rfmSegments.map((s: any) => {
              const Icon = SEGMENT_ICONS[s.segment] || Users;
              return (
                <button key={s.segment} onClick={() => setSegmentFilter(segmentFilter === s.segment ? null : s.segment)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all inline-flex items-center gap-1.5 ${segmentFilter === s.segment ? "bg-gray-900 text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: segmentFilter === s.segment ? "#fff" : SEGMENT_COLORS[s.segment] || "#94a3b8" }} />
                  {s.segment} ({s.customers})
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-[11px] font-medium text-gray-500 pb-2 px-2">Nombre</th>
                <th className="text-left text-[11px] font-medium text-gray-500 pb-2 px-2">Email</th>
                <th className="text-left text-[11px] font-medium text-gray-500 pb-2 px-2">Ciudad</th>
                <th className="text-right text-[11px] font-medium text-gray-500 pb-2 px-2">Ordenes</th>
                <th className="text-right text-[11px] font-medium text-gray-500 pb-2 px-2">Total gastado</th>
                <th className="text-right text-[11px] font-medium text-gray-500 pb-2 px-2">Ticket prom.</th>
                <th className="text-left text-[11px] font-medium text-gray-500 pb-2 px-2">Ultima compra</th>
                <th className="text-center text-[11px] font-medium text-gray-500 pb-2 px-2">Segmento</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((c: any) => (
                <React.Fragment key={c.id}>
                  <tr className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer"
                    onClick={() => setExpandedCustomerId(expandedCustomerId === c.id ? null : c.id)}>
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-1">
                        <ChevronDown size={12} className={`text-gray-400 transition-transform ${expandedCustomerId === c.id ? "rotate-180" : ""}`} />
                        <span className="text-xs text-gray-700 font-medium">{c.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-2"><span className="text-[10px] text-gray-400 truncate max-w-[150px] block">{c.email}</span></td>
                    <td className="py-2.5 px-2"><span className="text-xs text-gray-600">{c.city || "-"}</span></td>
                    <td className="py-2.5 px-2 text-right"><span className="text-xs text-gray-600">{c.orders}</span></td>
                    <td className="py-2.5 px-2 text-right"><span className="text-xs font-medium text-gray-800">{formatARS(c.totalSpent)}</span></td>
                    <td className="py-2.5 px-2 text-right"><span className="text-xs text-gray-600">{formatARS(c.avgTicket)}</span></td>
                    <td className="py-2.5 px-2"><span className="text-xs text-gray-600">{c.lastOrder}</span></td>
                    <td className="py-2.5 px-2 text-center">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium"
                        style={{ backgroundColor: `${SEGMENT_COLORS[c.segment] || "#94a3b8"}15`, color: SEGMENT_COLORS[c.segment] || "#94a3b8" }}>
                        {c.segment}
                      </span>
                    </td>
                  </tr>
                  {/* Expanded customer detail */}
                  {expandedCustomerId === c.id && (
                    <tr className="bg-gray-50/80">
                      <td colSpan={8} className="px-6 py-3">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Primera compra</p>
                            <p className="text-xs font-medium text-gray-700">{c.firstOrder || "-"}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Ultima compra</p>
                            <p className="text-xs font-medium text-gray-700">{c.lastOrder || "-"}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Dias sin comprar</p>
                            <p className={`text-xs font-medium ${(c.recencyDays || 0) > 90 ? "text-red-600" : (c.recencyDays || 0) > 30 ? "text-amber-600" : "text-emerald-600"}`}>
                              {c.recencyDays || 0} dias
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Ordenes totales (lifetime)</p>
                            <p className="text-xs font-medium text-gray-700">{c.lifetimeOrders || c.orders}</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {filteredCustomers.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-xs text-gray-400">No se encontraron clientes</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data.pagination && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
            <div className="text-xs text-gray-500">
              Pagina {currentPage} de {data.pagination.totalPages || 0} - {data.pagination.totalCustomers} clientes en total
            </div>
            <div className="flex gap-2">
              <button onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-gray-700">
                Anterior
              </button>
              <button onClick={() => setCurrentPage(currentPage + 1)} disabled={currentPage >= (data.pagination.totalPages || 1)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-gray-700">
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
