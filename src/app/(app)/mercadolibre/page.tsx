// @ts-nocheck
"use client";

import React, { useState, useEffect } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { formatARS, formatCompact } from "@/lib/utils/format";
import {
  DollarSign, ShoppingCart, Package, XCircle, Star,
  MessageSquare, Tag, TrendingUp, Award, Zap, RefreshCw,
} from "lucide-react";
import { KpiCard } from "@/components/dashboard";

interface DashboardData {
  kpis: {
    totalOrders: number; totalRevenue: number; avgTicket: number; totalItems: number;
    cancelledOrders: number; cancellationRate: string;
    listingsActive: number; listingsTotal: number; listingsPaused: number;
    unansweredQuestions: number;
  };
  reputation: {
    level: string; levelLabel: string; powerSeller: boolean;
    totalSales: number; completedSales: number;
    claimsRate: number; delayedRate: number; cancellationRate: number;
    positiveRatings: number; negativeRatings: number; neutralRatings: number;
  } | null;
  dailySales: Array<{ day: string; revenue: number; orders: number }>;
  statusBreakdown: Array<{ status: string; count: number }>;
  paymentMethods: Array<{ method: string; orders: number; revenue: number }>;
  lastSync: string | null;
  daysInPeriod: number;
}

const QUICK_RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente", APPROVED: "Aprobado", SHIPPED: "Enviado",
  DELIVERED: "Entregado", CANCELLED: "Cancelado",
};
const STATUS_COLORS: Record<string, string> = {
  PENDING: "#f59e0b", APPROVED: "#3b82f6", SHIPPED: "#06b6d4",
  DELIVERED: "#10b981", CANCELLED: "#ef4444",
};
const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#8b5cf6"];

const LEVEL_INFO: Record<string, { label: string; color: string; emoji: string }> = {
  "5_green": { label: "Excelente", color: "#10b981", emoji: "🟢" },
  "4_light_green": { label: "Muy bueno", color: "#34d399", emoji: "🟡" },
  "3_yellow": { label: "Bueno", color: "#f59e0b", emoji: "🟡" },
  "2_orange": { label: "Regular", color: "#f97316", emoji: "🟠" },
  "1_red": { label: "Malo", color: "#ef4444", emoji: "🔴" },
};

export default function MLDashboardPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/mercadolibre/dashboard?days=${days}`)
      .then((r) => r.json())
      .then(setData)
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [days]);

  const handleSync = () => {
    setSyncing(true);
    setSyncMsg(null);
    fetch("/api/sync/mercadolibre")
      .then((r) => r.json())
      .then((res) => {
        setSyncMsg(res.ok ? "Sincronizado" : `Error: ${res.errors?.join(", ") || res.error}`);
        // Refresh data
        fetch(`/api/mercadolibre/dashboard?days=${days}`)
          .then((r) => r.json())
          .then(setData);
        setTimeout(() => setSyncMsg(null), 5000);
      })
      .catch(() => setSyncMsg("Error de red"))
      .finally(() => setSyncing(false));
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500 mx-auto mb-3" />
          <p className="text-gray-500">Cargando dashboard MercadoLibre...</p>
        </div>
      </div>
    );
  }

  if (!data) return null;
  const { kpis, reputation } = data;
  const levelInfo = reputation?.level ? LEVEL_INFO[reputation.level] : null;

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">MercadoLibre</h1>
            <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">ELMUNDODELJUG</span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            Dashboard del seller —
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-emerald-600 font-medium">datos en tiempo real</span>
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Quick range */}
          <div className="flex gap-1.5 bg-gray-100 rounded-lg p-1">
            {QUICK_RANGES.map((r) => (
              <button key={r.days} onClick={() => setDays(r.days)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${days === r.days ? "bg-white text-yellow-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                {r.label}
              </button>
            ))}
          </div>
          {/* Sync button */}
          <button onClick={handleSync} disabled={syncing}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
              syncing ? "bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200"
              : syncMsg === "Sincronizado" ? "bg-emerald-50 text-emerald-600 border-emerald-200"
              : "bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100"
            }`}>
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Sincronizando..." : syncMsg || "Sync ML"}
          </button>
        </div>
      </div>

      {/* REPUTATION BANNER */}
      {reputation && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg"
                style={{ backgroundColor: `${levelInfo?.color || "#94a3b8"}15` }}>
                <Award size={24} style={{ color: levelInfo?.color || "#94a3b8" }} />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">Nivel: <span style={{ color: levelInfo?.color }}>{levelInfo?.label || reputation.level}</span></p>
                <p className="text-xs text-gray-500">
                  {reputation.powerSeller && <span className="text-yellow-600 font-medium">⚡ MercadoLider </span>}
                  {reputation.totalSales.toLocaleString("es-AR")} ventas totales
                </p>
              </div>
            </div>
            <div className="flex gap-6 ml-auto">
              <div className="text-center">
                <p className="text-lg font-bold text-emerald-600">{reputation.positiveRatings}</p>
                <p className="text-[10px] text-gray-500">Positivas</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-400">{reputation.neutralRatings}</p>
                <p className="text-[10px] text-gray-500">Neutras</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-red-500">{reputation.negativeRatings}</p>
                <p className="text-[10px] text-gray-500">Negativas</p>
              </div>
              <div className="border-l pl-6">
                <p className="text-xs text-gray-500">Reclamos</p>
                <p className="text-sm font-semibold">{reputation.claimsRate != null ? `${(reputation.claimsRate * 100).toFixed(2)}%` : "--"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Envios tardios</p>
                <p className="text-sm font-semibold">{reputation.delayedRate != null ? `${(reputation.delayedRate * 100).toFixed(2)}%` : "--"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Cancelaciones</p>
                <p className="text-sm font-semibold">{reputation.cancellationRate != null ? `${(reputation.cancellationRate * 100).toFixed(2)}%` : "--"}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI CARDS — Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 lg:gap-4">
        <KpiCard icon={<DollarSign size={16} className="text-emerald-600" />} iconBg="bg-emerald-50"
          label={`Ventas ${days}d`} value={formatCompact(kpis.totalRevenue)} />
        <KpiCard icon={<ShoppingCart size={16} className="text-blue-600" />} iconBg="bg-blue-50"
          label="Ordenes" value={kpis.totalOrders.toLocaleString("es-AR")}
          subtitle={`${kpis.totalItems} items`} />
        <KpiCard icon={<Tag size={16} className="text-purple-600" />} iconBg="bg-purple-50"
          label="Ticket promedio" value={formatARS(kpis.avgTicket)} />
        <KpiCard icon={<Package size={16} className="text-yellow-600" />} iconBg="bg-yellow-50"
          label="Publicaciones activas" value={kpis.listingsActive.toLocaleString("es-AR")}
          subtitle={`${kpis.listingsTotal} total`} />
        <KpiCard icon={<MessageSquare size={16} className="text-orange-600" />} iconBg="bg-orange-50"
          label="Preguntas sin responder" value={kpis.unansweredQuestions.toLocaleString("es-AR")} />
      </div>

      {/* DAILY SALES CHART */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-800 mb-4">Ventas diarias MercadoLibre</h2>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data.dailySales}>
            <defs>
              <linearGradient id="mlGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="day"
              tickFormatter={(d) => { try { const date = new Date(d + "T12:00:00"); return `${date.getDate()}/${date.getMonth() + 1}`; } catch { return d; } }}
              tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v) => formatCompact(v)}
              tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={60} />
            <Tooltip
              formatter={(value: number) => [formatARS(value), "Facturacion"]}
              labelFormatter={(d) => { try { return new Date(d + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "short" }); } catch { return d; } }}
              contentStyle={{ borderRadius: "0.5rem", border: "1px solid #e2e8f0", fontSize: "0.8rem" }} />
            <Area type="monotone" dataKey="revenue" stroke="#f59e0b" strokeWidth={2} fill="url(#mlGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* STATUS + PAYMENT */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status breakdown */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Estado de ordenes</h2>
          <div className="space-y-3">
            {data.statusBreakdown.map((s) => {
              const maxCount = Math.max(...data.statusBreakdown.map((x) => x.count), 1);
              const pct = (s.count / maxCount) * 100;
              return (
                <div key={s.status} className="flex items-center gap-3">
                  <span className="text-xs font-medium text-gray-600 w-24">{STATUS_LABELS[s.status] || s.status}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2.5">
                    <div className="h-2.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: STATUS_COLORS[s.status] || "#94a3b8" }} />
                  </div>
                  <span className="text-xs font-semibold text-gray-800 w-12 text-right">{s.count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Payment methods */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Metodos de pago</h2>
          <div className="flex gap-4">
            <div className="w-1/2">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={data.paymentMethods} dataKey="orders" nameKey="method" cx="50%" cy="50%" innerRadius={40} outerRadius={75} paddingAngle={2}>
                    {data.paymentMethods.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
                  </Pie>
                  <Tooltip formatter={(v: number) => v.toLocaleString("es-AR")}
                    contentStyle={{ borderRadius: "0.5rem", border: "1px solid #e2e8f0", fontSize: "0.8rem" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-1/2 flex flex-col justify-center gap-2">
              {data.paymentMethods.slice(0, 5).map((pm, i) => (
                <div key={pm.method} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-xs text-gray-600 truncate flex-1">{pm.method}</span>
                  <span className="text-xs font-medium text-gray-800">{pm.orders}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* SYNC STATUS */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-medium text-emerald-600">Webhook activo</span>
            </div>
            <span className="text-[10px] text-gray-400">
              Ordenes, publicaciones y preguntas se actualizan automaticamente via notificaciones ML
            </span>
          </div>
          <div className="text-right">
            {data.lastSync && (
              <p className="text-[10px] text-gray-400">
                Ultima actualizacion: {new Date(data.lastSync).toLocaleString("es-AR")}
              </p>
            )}
            <p className="text-[10px] text-gray-400">Cron de respaldo: cada 4 horas</p>
          </div>
        </div>
      </div>
    </div>
  );
}
