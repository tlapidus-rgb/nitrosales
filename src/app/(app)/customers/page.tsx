// @ts-nocheck
"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { formatARS, formatCompact } from "@/lib/utils/format";
import {
  Users, Search, Calendar, ArrowUpRight, ArrowDownRight, XCircle,
  TrendingUp, MapPin, Star, AlertTriangle, Heart, UserPlus,
} from "lucide-react";

const COLORS = ["#6366f1","#10b981","#f59e0b","#ef4444","#06b6d4","#8b5cf6","#f97316"];

const SEGMENT_COLORS: Record<string, string> = {
  Champions: "#10b981",
  Leales: "#6366f1",
  Nuevos: "#06b6d4",
  Potenciales: "#f59e0b",
  Ocasionales: "#94a3b8",
  "En riesgo": "#ef4444",
  Perdidos: "#9ca3af",
};

const SEGMENT_ICONS: Record<string, any> = {
  Champions: Star,
  Leales: Heart,
  Nuevos: UserPlus,
  Potenciales: TrendingUp,
  Ocasionales: Users,
  "En riesgo": AlertTriangle,
  Perdidos: XCircle,
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

  const filteredCustomers = useMemo(() => {
    if (!data) return [];
    let customers = [...data.customers];
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      customers = customers.filter(
        (c: any) => c.name.toLowerCase().includes(term) || c.email.toLowerCase().includes(term)
      );
    }
    return customers;
  }, [data, searchTerm]);

  const ChangeBadge = ({ value }: { value: number }) => {
    if (value === 0) return <span className="text-xs text-gray-400">--</span>;
    const isPositive = value > 0;
    return (
      <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isPositive ? "text-emerald-600" : "text-red-500"}`}>
        {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
        {Math.abs(value).toFixed(1)}%
      </span>
    );
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-3"></div>
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
            <p className="text-sm text-gray-500 mt-0.5">Segmentacion y comportamiento de compra</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">Canal:</span>
            {["ALL", "VTEX", "MELI"].map((s) => (
              <button key={s} onClick={() => { setSource(s); setCurrentPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${source === s ? "bg-indigo-600 text-white shadow-sm" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}>
                {s === "ALL" ? "Todos" : s}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            {QUICK_RANGES.map((r) => (
              <button key={r.days} onClick={() => handleQuickRange(r.days)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${activeQuickRange === r.days ? "bg-gray-900 text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}>
                {r.label}
              </button>
            ))}
          </div>
          <div className="w-px h-6 bg-gray-200" />
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-gray-400" />
            <input type="date" value={dateFrom} onChange={(e) => handleDateChange("from", e.target.value)}
              className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 bg-white" />
            <span className="text-xs text-gray-400">a</span>
            <input type="date" value={dateTo} onChange={(e) => handleDateChange("to", e.target.value)}
              className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 bg-white" />
          </div>
          {loading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600" />}
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-emerald-50 rounded-lg"><Users size={16} className="text-emerald-600" /></div>
            <span className="text-xs text-gray-500 font-medium">Clientes unicos</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{kpis.totalCustomers.toLocaleString("es-AR")}</p>
          <div className="mt-1"><ChangeBadge value={kpis.changes.customers} /><span className="text-[10px] text-gray-400 ml-1">vs periodo anterior</span></div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-indigo-50 rounded-lg"><TrendingUp size={16} className="text-indigo-600" /></div>
            <span className="text-xs text-gray-500 font-medium">Tasa de recompra</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{kpis.repeatRate}%</p>
          <div className="mt-1"><span className="text-[10px] text-gray-400">{kpis.avgOrdersPerCustomer} ordenes/cliente promedio</span></div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-purple-50 rounded-lg"><Users size={16} className="text-purple-600" /></div>
            <span className="text-xs text-gray-500 font-medium">Gasto promedio/cliente</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatARS(kpis.avgSpentPerCustomer)}</p>
          <div className="mt-1"><ChangeBadge value={kpis.changes.avgSpent} /><span className="text-[10px] text-gray-400 ml-1">vs periodo anterior</span></div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-blue-50 rounded-lg"><UserPlus size={16} className="text-blue-600" /></div>
            <span className="text-xs text-gray-500 font-medium">Clientes nuevos</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{kpis.newCustomers.toLocaleString("es-AR")}</p>
          <div className="mt-1"><span className="text-[10px] text-gray-400">primera compra en el periodo</span></div>
        </div>
      </div>

      {/* ROW: RFM SEGMENTS PIE + FREQUENCY BAR */}
      <div className="grid grid-cols-2 gap-4">
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
                  <div key={s.segment} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: SEGMENT_COLORS[s.segment] || "#94a3b8" }} />
                    <Icon size={12} className="text-gray-400" />
                    <span className="text-xs text-gray-600 flex-1">{s.segment}</span>
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

      {/* TOP CITIES */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-800 mb-4">Top ciudades</h2>
        <div className="space-y-2.5">
          {data.topCities.map((c: any) => {
            const maxCustomers = data.topCities[0]?.customers || 1;
            const pct = (c.customers / maxCustomers) * 100;
            return (
              <div key={c.city} className="flex items-center gap-3">
                <div className="flex items-center gap-2 w-48">
                  <MapPin size={12} className="text-gray-400" />
                  <span className="text-xs text-gray-700 truncate">{c.city}</span>
                </div>
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div className="h-2 rounded-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs font-medium text-gray-800 w-16 text-right">{c.customers} cl.</span>
                <span className="text-xs text-gray-400 w-20 text-right">{formatCompact(c.revenue)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* CUSTOMERS TABLE */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-800">Listado de clientes</h2>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Buscar por nombre o email..." value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 bg-white w-64" />
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
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="py-2.5 px-2"><span className="text-xs text-gray-700 font-medium">{c.name}</span></td>
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
              Pagina {currentPage} de {data.pagination.totalPages || 0}{" . "}{data.pagination.totalCustomers} clientes en total
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
