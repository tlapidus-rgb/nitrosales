// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { formatARS, formatCompact, formatDateShort } from "@/lib/utils/format";

interface Summary {
  revenue: number; orders: number; cancelledOrders: number; cancelledRevenue: number;
  sessions: number; adSpend: number; googleSpend: number; metaSpend: number;
  roas: number; conversionRate: number; avgTicket: number;
  impressions: number; clicks: number; ctr: number; cpc: number;
}
interface Changes {
  revenue: number | null; orders: number | null; sessions: number | null;
  adSpend: number | null; roas: number | null; avgTicket: number | null;
  conversionRate: number | null; ctr: number | null; cpc: number | null;
}
interface TrendDay {
  date: string; revenue: number; orders: number; sessions: number;
  adSpend: number; googleSpend: number; metaSpend: number;
  impressions: number; clicks: number; roas: number;
}
interface KpiItem { label: string; value: string; sub: string; changeKey?: keyof Changes; inverse?: boolean; }

function ChangeIndicator({ value, inverse }: { value: number | null | undefined; inverse?: boolean }) {
  if (value === null || value === undefined) return null;
  const isPositive = inverse ? value < 0 : value > 0;
  const color = isPositive ? "text-green-600" : value === 0 ? "text-gray-400" : "text-red-500";
  const arrow = value > 0 ? "\u2191" : value < 0 ? "\u2193" : "";
  return <span className={`text-xs font-medium ${color}`}>{arrow}{Math.abs(value)}%</span>;
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [changes, setChanges] = useState<Changes | null>(null);
  const [trends, setTrends] = useState<TrendDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/metrics").then((r) => r.json()),
      fetch("/api/metrics/trends").then((r) => r.json()),
    ])
      .then(([metricsData, trendsData]) => {
        if (metricsData.summary) { setSummary(metricsData.summary); setChanges(metricsData.changes || null); }
        else setError("Error cargando metricas");
        if (trendsData.days) setTrends(trendsData.days);
      })
      .catch(() => setError("Error de conexion"))
      .finally(() => setLoading(false));
  }, []);

  const kpis: KpiItem[] = summary ? [
    { label: "Facturacion", value: formatARS(summary.revenue), sub: "Ordenes facturadas", changeKey: "revenue" },
    { label: "Pedidos", value: summary.orders.toLocaleString("es-AR"), sub: "Facturados/enviados", changeKey: "orders" },
    { label: "Ticket Promedio", value: formatARS(summary.avgTicket), sub: "Revenue / pedidos", changeKey: "avgTicket" },
    { label: "Sesiones", value: summary.sessions.toLocaleString("es-AR"), sub: "Trafico web (GA4)", changeKey: "sessions" },
    { label: "Inversion Ads", value: formatARS(summary.adSpend), sub: `Google: ${formatARS(summary.googleSpend)} | Meta: ${formatARS(summary.metaSpend)}`, changeKey: "adSpend", inverse: true },
    { label: "ROAS", value: summary.roas + "x", sub: "Retorno publicitario", changeKey: "roas" },
  ] : [];

  const kpis2: KpiItem[] = summary ? [
    { label: "CTR", value: summary.ctr + "%", sub: "Click-through rate", changeKey: "ctr" },
    { label: "CPC", value: formatARS(summary.cpc), sub: "Costo por click", changeKey: "cpc", inverse: true },
    { label: "Tasa Conversion", value: summary.conversionRate + "%", sub: "Pedidos / sesiones", changeKey: "conversionRate" },
    { label: "Impresiones", value: formatCompact(summary.impressions), sub: "Total ads" },
    { label: "Clicks", value: formatCompact(summary.clicks), sub: "Total ads" },
  ] : [];

  const tooltipStyle = { contentStyle: { backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "12px" } };

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-1">Dashboard</h2>
      <p className="text-gray-500 mb-6">Ultimos 30 dias &middot; El Mundo del Juguete</p>

      {loading ? <p className="text-gray-400">Cargando metricas...</p> : error ? <p className="text-red-500">{error}</p> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="bg-white rounded-xl shadow-sm p-4 border">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">{kpi.label}</p>
                  {changes && kpi.changeKey && <ChangeIndicator value={changes[kpi.changeKey]} inverse={kpi.inverse} />}
                </div>
                <p className="text-xl font-bold text-gray-800 mt-1">{kpi.value}</p>
                <p className="text-xs text-gray-400 mt-1">{kpi.sub}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
            {kpis2.map((kpi) => (
              <div key={kpi.label} className="bg-white rounded-xl shadow-sm p-3 border">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">{kpi.label}</p>
                  {changes && kpi.changeKey && <ChangeIndicator value={changes[kpi.changeKey]} inverse={kpi.inverse} />}
                </div>
                <p className="text-lg font-bold text-gray-800 mt-1">{kpi.value}</p>
                <p className="text-xs text-gray-400">{kpi.sub}</p>
              </div>
            ))}
          </div>

          {summary && summary.cancelledOrders > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-8 text-sm text-amber-800">
              {summary.cancelledOrders} ordenes canceladas ({formatARS(summary.cancelledRevenue)}) excluidas del calculo de facturacion.
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="bg-white rounded-xl shadow-sm p-6 border">
              <h3 className="font-semibold text-gray-700 mb-4">Facturacion diaria</h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tickFormatter={formatDateShort} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tickFormatter={(v) => "$" + formatCompact(v)} tick={{ fontSize: 11 }} width={70} />
                  <Tooltip formatter={(value: number) => [formatARS(value), "Revenue"]} labelFormatter={formatDateShort} {...tooltipStyle} />
                  <Line type="monotone" dataKey="revenue" stroke="#4f46e5" strokeWidth={2} dot={false} name="Revenue" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-6 border">
              <h3 className="font-semibold text-gray-700 mb-4">Inversion publicitaria por plataforma</h3>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={trends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tickFormatter={formatDateShort} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tickFormatter={(v) => "$" + formatCompact(v)} tick={{ fontSize: 11 }} width={70} />
                  <Tooltip formatter={(value: number, name: string) => [formatARS(value), name]} labelFormatter={formatDateShort} {...tooltipStyle} />
                  <Legend />
                  <Area type="monotone" dataKey="googleSpend" stackId="1" stroke="#4285f4" fill="#4285f4" fillOpacity={0.6} name="Google Ads" />
                  <Area type="monotone" dataKey="metaSpend" stackId="1" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.6} name="Meta Ads" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
