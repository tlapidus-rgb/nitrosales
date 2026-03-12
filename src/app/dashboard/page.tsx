"use client";

import { useSession, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface Summary {
  revenue: number;
  orders: number;
  cancelledOrders: number;
  cancelledRevenue: number;
  sessions: number;
  adSpend: number;
  googleSpend: number;
  metaSpend: number;
  roas: number;
  conversionRate: number;
  avgTicket: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
}

interface Changes {
  revenue: number | null;
  orders: number | null;
  sessions: number | null;
  adSpend: number | null;
  roas: number | null;
  avgTicket: number | null;
  conversionRate: number | null;
  ctr: number | null;
  cpc: number | null;
}

interface TrendDay {
  date: string;
  revenue: number;
  orders: number;
  sessions: number;
  adSpend: number;
  googleSpend: number;
  metaSpend: number;
  impressions: number;
  clicks: number;
  roas: number;
}

interface Campaign {
  id: string;
  name: string;
  platform: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  conversions: number;
  conversionValue: number;
  roas: number;
}

function formatARS(n: number) {
  return "$ " + Math.round(n).toLocaleString("es-AR");
}

function formatCompact(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString("es-AR");
}

function ChangeIndicator({ value, inverse }: { value: number | null | undefined; inverse?: boolean }) {
  if (value === null || value === undefined) return null;
  const isPositive = inverse ? value < 0 : value > 0;
  const color = isPositive ? "text-green-600" : value === 0 ? "text-gray-400" : "text-red-500";
  const arrow = value > 0 ? "\u2191" : value < 0 ? "\u2193" : "";
  return (
    <span className={`text-xs font-medium ${color}`}>
      {arrow}{Math.abs(value)}%
    </span>
  );
}

function formatDateShort(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

export default function Dashboard() {
  const { data: session } = useSession();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [changes, setChanges] = useState<Changes | null>(null);
  const [trends, setTrends] = useState<TrendDay[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortField, setSortField] = useState<string>("spend");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/metrics").then((r) => r.json()),
      fetch("/api/metrics/trends").then((r) => r.json()),
      fetch("/api/metrics/campaigns").then((r) => r.json()),
    ])
      .then(([metricsData, trendsData, campaignsData]) => {
        if (metricsData.summary) {
          setSummary(metricsData.summary);
          setChanges(metricsData.changes || null);
        } else {
          setError("Error cargando metricas");
        }
        if (trendsData.days) setTrends(trendsData.days);
        if (campaignsData.campaigns) setCampaigns(campaignsData.campaigns);
      })
      .catch(() => setError("Error de conexion"))
      .finally(() => setLoading(false));
  }, []);

  const sortedCampaigns = [...campaigns].sort((a, b) => {
    const aVal = (a as any)[sortField] || 0;
    const bVal = (b as any)[sortField] || 0;
    return sortAsc ? aVal - bVal : bVal - aVal;
  });

  function handleSort(field: string) {
    if (sortField === field) setSortAsc(!sortAsc);
    else {
      setSortField(field);
      setSortAsc(false);
    }
  }

  const kpis = summary
    ? [
        {
          label: "Facturacion",
          value: formatARS(summary.revenue),
          sub: "Ordenes facturadas",
          changeKey: "revenue" as keyof Changes,
        },
        {
          label: "Pedidos",
          value: summary.orders.toLocaleString("es-AR"),
          sub: "Facturados/enviados",
          changeKey: "orders" as keyof Changes,
        },
        {
          label: "Ticket Promedio",
          value: formatARS(summary.avgTicket),
          sub: "Revenue / pedidos",
          changeKey: "avgTicket" as keyof Changes,
        },
        {
          label: "Sesiones",
          value: summary.sessions.toLocaleString("es-AR"),
          sub: "Trafico web (GA4)",
          changeKey: "sessions" as keyof Changes,
        },
        {
          label: "Inversion Ads",
          value: formatARS(summary.adSpend),
          sub: `Google: ${formatARS(summary.googleSpend)} | Meta: ${formatARS(summary.metaSpend)}`,
          changeKey: "adSpend" as keyof Changes,
          inverse: true,
        },
        {
          label: "ROAS",
          value: summary.roas + "x",
          sub: "Retorno publicitario",
          changeKey: "roas" as keyof Changes,
        },
      ]
    : [];

  const kpis2 = summary
    ? [
        {
          label: "CTR",
          value: summary.ctr + "%",
          sub: "Click-through rate",
          changeKey: "ctr" as keyof Changes,
        },
        {
          label: "CPC",
          value: formatARS(summary.cpc),
          sub: "Costo por click",
          changeKey: "cpc" as keyof Changes,
          inverse: true,
        },
        {
          label: "Tasa Conversion",
          value: summary.conversionRate + "%",
          sub: "Pedidos / sesiones",
          changeKey: "conversionRate" as keyof Changes,
        },
        {
          label: "Impresiones",
          value: formatCompact(summary.impressions),
          sub: "Total ads",
        },
        {
          label: "Clicks",
          value: formatCompact(summary.clicks),
          sub: "Total ads",
        },
      ]
    : [];

  const tooltipStyle = {
    contentStyle: {
      backgroundColor: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: "8px",
      fontSize: "12px",
    },
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-indigo-600">NitroSales</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              {session?.user?.name || session?.user?.email}
            </span>
            <button
              onClick={() => signOut()}
              className="text-sm text-red-500 hover:text-red-700"
            >
              Salir
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-1">Dashboard</h2>
        <p className="text-gray-500 mb-6">
          Ultimos 30 dias &middot; El Mundo del Juguete
        </p>

        {loading ? (
          <p className="text-gray-400">Cargando metricas...</p>
        ) : error ? (
          <p className="text-red-500">{error}</p>
        ) : (
          <>
            {/* Primary KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
              {kpis.map((kpi) => (
                <div
                     key={kpi.label}
                  className="bg-white rounded-xl shadow-sm p-4 border"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">
                      {kpi.label}
                    </p>
                    {changes && (
                      <ChangeIndicator
                        value={changes[kpi.changeKey]}
                        inverse={kpi.inverse}
                      />
                    )}
                  </div>
                  <p className="text-xl font-bold text-gray-800 mt-1">
                    {kpi.value}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">{kpi.sub}</p>
                </div>
              ))}
            </div>

            {/* Secondary KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
              {kpis2.map((kpi) => (
                <div
                  key={kpi.label}
                  className="bg-white rounded-xl shadow-sm p-3 border"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">
                      {kpi.label}
                    </p>
                    {changes && kpi.changeKey && (
                      <ChangeIndicator
                        value={changes[kpi.changeKey]}
                        inverse={kpi.inverse}
                      />
                    )}
                  </div>
                  <p className="text-lg font-bold text-gray-800 mt-1">
                    {kpi.value}
                  </p>
                  <p className="text-xs text-gray-400">{kpi.sub}</p>
                </div>
              ))}
            </div>

            {summary && summary.cancelledOrders > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-8 text-sm text-amber-800">
                {summary.cancelledOrders} ordenes canceladas (
                {formatARS(summary.cancelledRevenue)}) excluidas del calculo de
                facturacion.
              </div>
            )}

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Revenue Trend */}
              <div className="bg-white rounded-xl shadow-sm p-6 border">
                <h3 className="font-semibold text-gray-700 mb-4">
                  Facturacion diaria
                </h3>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={trends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDateShort}
                      tick={{ fontSize: 11 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tickFormatter={(v) => "$" + formatCompact(v)}
                      tick={{ fontSize: 11 }}
                      width={70}
                    />
                    <Tooltip
                      formatter={(value: number) => [formatARS(value), "Revenue"]}
                      labelFormatter={formatDateShort}
                      {...tooltipStyle}
                    />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="#4f46e5"
                      strokeWidth={2}
                      dot={false}
                      name="Revenue"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Ad Spend by Platform */}
              <div className="bg-white rounded-xl shadow-sm p-6 border">
                <h3 className="font-semibold text-gray-700 mb-4">
                  Inversion publicitaria por plataforma
                </h3>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={trends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDateShort}
                      tick={{ fontSize: 11 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tickFormatter={(v) => "$" + formatCompact(v)}
                      tick={{ fontSize: 11 }}
                      width={70}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        formatARS(value),
                        name,
                      ]}
                      labelFormatter={formatDateShort}
                      {...tooltipStyle}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="googleSpend"
                      stackId="1"
                      stroke="#4285f4"
                      fill="#4285f4"
                      fillOpacity={0.6}
                      name="Google Ads"
                    />
                    <Area
                      type="monotone"
                      dataKey="metaSpend"
                      stackId="1"
                      stroke="#8b5cf6"
                      fill="#8b5cf6"
                      fillOpacity={0.6}
                      name="Meta Ads"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Campaign Performance Table */}
            {sortedCampaigns.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border mb-8 overflow-hidden">
                <div className="p-6 border-b">
                  <h3 className="font-semibold text-gray-700">
                    Performance por campana
                  </h3>
                  <p className="text-xs text-gray-400 mt-1">
                    {campaigns.length} campanas activas &middot; Ultimos 30 dias
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                          Campana
                        </th>
                        <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase">
                          Plataforma
                        </th>
                        <th
                          className="px-3 py-3 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                          onClick={() => handleSort("spend")}
                        >
                          Gasto {sortField === "spend" ? (sortAsc ? "\u25B2" : "\u25BC") : ""}
                        </th>
                        <th
                          className="px-3 py-3 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                          onClick={() => handleSort("impressions")}
                        >
                          Impr. {sortField === "impressions" ? (sortAsc ? "\u25B2" : "\u25BC") : ""}
                        </th>
                        <th
                          className="px-3 py-3 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                          onClick={() => handleSort("clicks")}
                        >
                          Clicks {sortField === "clicks" ? (sortAsc ? "\u25B2" : "\u25BC") : ""}
                        </th>
                        <th
                          className="px-3 py-3 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                          onClick={() => handleSort("ctr")}
                        >
                          CTR {sortField === "ctr" ? (sortAsc ? "\u25B2" : "\u25BC") : ""}
                        </th>
                        <th
                          className="px-3 py-3 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                          onClick={() => handleSort("cpc")}
                        >
                          CPC {sortField === "cpc" ? (sortAsc ? "\u25B2" : "\u25BC") : ""}
                        </th>
                        <th
                          className="px-3 py-3 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                          onClick={() => handleSort("conversions")}
                        >
                          Conv. {sortField === "conversions" ? (sortAsc ? "\u25B2" : "\u25BC") : ""}
                        </th>
                        <th
                          className="px-3 py-3 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                          onClick={() => handleSort("roas")}
                        >
                          ROAS {sortField === "roas" ? (sortAsc ? "\u25B2" : "\u25BC") : ""}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {sortedCampaigns.map((c) => (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-800 truncate max-w-[200px]">
                              {c.name}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                c.platform === "GOOGLE"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-purple-100 text-purple-700"
                              }`}
                            >
                              {c.platform === "GOOGLE" ? "Google" : "Meta"}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-gray-700">
                            {formatARS(c.spend)}
                          </td>
                          <td className="px-3 py-3 text-gray-700">
                            {formatCompact(c.impressions)}
                          </td>
                          <td className="px-3 py-3 text-gray-700">
                            {formatCompact(c.clicks)}
                          </td>
                          <td className="px-3 py-3 text-gray-700">
                            {c.ctr}%
                          </td>
                          <td className="px-3 py-3 text-gray-700">
                            {formatARS(c.cpc)}
                          </td>
                          <td className="px-3 py-3 text-gray-700">
                            {c.conversions}
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={`font-medium ${
                                c.roas >= 3
                                  ? "text-green-600"
                                  : c.roas >= 1
                                  ? "text-yellow-600"
                                  : "text-red-500"
                              }`}
                            >
                              {c.roas}x
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Bottom Row: Connectors + Bot */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="bg-white rounded-xl shadow-sm p-6 border">
                <h3 className="font-semibold text-gray-700 mb-3">
                  Conectores activos
                </h3>
                <div className="space-y-2">
                  {[
                    "VTEX - Ecommerce",
                    "Google Analytics 4",
                    "Google Ads",
                    "Meta Ads",
                  ].map((c) => (
                    <div
                      key={c}
                      className="flex items-center justify-between py-1"
                    >
                      <span className="text-sm text-gray-600">{c}</span>
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        Conectado
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6 border">
                <h3 className="font-semibold text-gray-700 mb-3">
                  Bot de IA
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  El bot de IA analiza tus metricas y te da insights
                  accionables. Proximamente vas a poder chatear directamente
                  desde aca.
                </p>
                <Link
                  href="/chat"
                  className="inline-block bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700"
                >
                  Abrir Chat con IA
                </Link>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
