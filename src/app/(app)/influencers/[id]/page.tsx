"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
} from "recharts";

// ══════════════════════════════════════════════════════════════
// Influencer Detail Page — Full Performance Dashboard
// ══════════════════════════════════════════════════════════════

const fmtARS = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
const fmt = (n: number) => n.toLocaleString("es-AR");

interface InfluencerDetail {
  id: string;
  code: string;
  name: string;
  email: string | null;
  commissionPercent: number;
  status: string;
  publicName: string | null;
  isPublicDashboardEnabled: boolean;
  totalRevenue: number;
  totalCommission: number;
  totalConversions: number;
  trackingLink: string;
  campaigns: Array<{ id: string; name: string; status: string; startDate: string }>;
}

interface Metrics {
  totalRevenue: number;
  totalCommission: number;
  totalConversions: number;
  avgOrderValue: number;
  conversionRate: number;
  uniqueVisitors: number;
  dailyMetrics: Array<{ date: string; sales: number; conversions: number; commission: number }>;
  campaignBreakdown: Array<{ campaignName: string; sales: number; conversions: number }>;
}

export default function InfluencerDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [influencer, setInfluencer] = useState<InfluencerDetail | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copiedPublic, setCopiedPublic] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/influencers/${id}`).then((r) => r.json()),
      fetch(`/api/influencers/${id}/metrics`).then((r) => r.json()),
    ])
      .then(([infData, metricsData]) => {
        setInfluencer(infData.influencer || null);
        setMetrics(metricsData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const copyLink = async () => {
    if (!influencer?.trackingLink) return;
    await navigator.clipboard.writeText(influencer.trackingLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyPublicLink = async () => {
    if (!influencer) return;
    const res = await fetch(`/api/influencers/${id}/tracking-link`);
    const data = await res.json();
    await navigator.clipboard.writeText(data.publicDashboardUrl);
    setCopiedPublic(true);
    setTimeout(() => setCopiedPublic(false), 2000);
  };

  if (loading || !influencer) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
          <p className="text-gray-500 font-mono text-sm">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/influencers" className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white text-lg font-bold">
            {influencer.name[0]?.toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{influencer.name}</h1>
            <p className="text-sm text-gray-500">
              @{influencer.code} · {Number(influencer.commissionPercent)}% comision
            </p>
          </div>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-xs font-medium ${
            influencer.status === "ACTIVE"
              ? "bg-green-50 text-green-700"
              : "bg-yellow-50 text-yellow-700"
          }`}
        >
          {influencer.status === "ACTIVE" ? "Activo" : "Pausado"}
        </span>
      </div>

      {/* Tracking Links */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Link de tracking</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-gray-50 px-3 py-2 rounded-lg font-mono text-gray-600 overflow-hidden text-ellipsis">
                {influencer.trackingLink}
              </code>
              <button
                onClick={copyLink}
                className="px-3 py-2 bg-orange-500 text-white rounded-lg text-xs font-medium hover:bg-orange-600 transition-colors whitespace-nowrap"
              >
                {copied ? "Copiado!" : "Copiar"}
              </button>
            </div>
          </div>
          <div className="sm:w-auto">
            <label className="block text-xs font-medium text-gray-500 mb-1">Dashboard publico</label>
            <button
              onClick={copyPublicLink}
              className="px-3 py-2 border border-orange-200 text-orange-600 rounded-lg text-xs font-medium hover:bg-orange-50 transition-colors whitespace-nowrap"
            >
              {copiedPublic ? "Link copiado!" : "Copiar link publico"}
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: "Revenue Total", value: fmtARS(metrics?.totalRevenue || 0) },
          { label: "Comision Total", value: fmtARS(metrics?.totalCommission || 0) },
          { label: "Conversiones", value: fmt(metrics?.totalConversions || 0) },
          { label: "Ticket Promedio", value: fmtARS(metrics?.avgOrderValue || 0) },
          { label: "Tasa Conversion", value: `${(metrics?.conversionRate || 0).toFixed(1)}%` },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">{kpi.label}</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      {metrics?.dailyMetrics && metrics.dailyMetrics.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Revenue Chart */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Revenue diario (ultimos 30 dias)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={metrics.dailyMetrics}>
                <defs>
                  <linearGradient id="infRevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                />
                <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 10, fill: "#9ca3af" }} />
                <Tooltip
                  formatter={(v: number) => [fmtARS(v), "Revenue"]}
                  labelFormatter={(d) => new Date(d).toLocaleDateString("es-AR")}
                />
                <Area type="monotone" dataKey="sales" stroke="#f97316" fill="url(#infRevGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Campaign Breakdown */}
          {metrics.campaignBreakdown && metrics.campaignBreakdown.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Revenue por campaña</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={metrics.campaignBreakdown} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="campaignName" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [fmtARS(v), "Revenue"]} />
                  <Bar dataKey="sales" fill="#f97316" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Campaigns list */}
      {influencer.campaigns && influencer.campaigns.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Campañas</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {influencer.campaigns.map((c) => (
              <div key={c.id} className="px-6 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{c.name}</p>
                  <p className="text-xs text-gray-400">
                    Desde {new Date(c.startDate).toLocaleDateString("es-AR")}
                  </p>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    c.status === "ACTIVE" ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-500"
                  }`}
                >
                  {c.status === "ACTIVE" ? "Activa" : c.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
