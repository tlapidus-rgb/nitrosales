"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

// ══════════════════════════════════════════════════════════════
// Influencer Marketing — Overview Dashboard
// ══════════════════════════════════════════════════════════════

const fmtARS = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
const fmt = (n: number) => n.toLocaleString("es-AR");

interface Influencer {
  id: string;
  code: string;
  name: string;
  email: string | null;
  commissionPercent: number;
  status: string;
  totalRevenue: number;
  totalCommission: number;
  totalConversions: number;
  _count: { attributions: number; campaigns: number; coupons: number };
}

export default function InfluencerOverviewPage() {
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/influencers")
      .then((r) => r.json())
      .then((data) => {
        setInfluencers(data.influencers || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const activeInfluencers = influencers.filter((i) => i.status === "ACTIVE");
  const totalRevenue = influencers.reduce((sum, i) => sum + Number(i.totalRevenue), 0);
  const totalCommission = influencers.reduce((sum, i) => sum + Number(i.totalCommission), 0);
  const totalConversions = influencers.reduce((sum, i) => sum + i.totalConversions, 0);
  const topPerformers = [...influencers]
    .sort((a, b) => Number(b.totalRevenue) - Number(a.totalRevenue))
    .slice(0, 5);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
          <p className="text-gray-500 font-mono text-sm">Cargando influencers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Influencer Marketing</h1>
          <p className="text-sm text-gray-500 mt-1">
            Medí las conversiones de tus campañas con influencers
          </p>
        </div>
        <Link
          href="/influencers/manage"
          className="px-4 py-2 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 transition-colors"
        >
          + Nuevo Influencer
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Influencers Activos", value: fmt(activeInfluencers.length), icon: "👤" },
          { label: "Revenue Atribuido", value: fmtARS(totalRevenue), icon: "💰" },
          { label: "Comisiones Totales", value: fmtARS(totalCommission), icon: "📊" },
          { label: "Conversiones", value: fmt(totalConversions), icon: "🛒" },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm"
          >
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              {kpi.label}
            </p>
            <p className="text-2xl font-bold text-gray-900 mt-2">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Top Performers */}
      {topPerformers.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Top Influencers</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-6 py-3 font-medium text-gray-500">Influencer</th>
                  <th className="px-6 py-3 font-medium text-gray-500 text-right">Revenue</th>
                  <th className="px-6 py-3 font-medium text-gray-500 text-right">Conversiones</th>
                  <th className="px-6 py-3 font-medium text-gray-500 text-right">Comision %</th>
                  <th className="px-6 py-3 font-medium text-gray-500 text-right">Comision $</th>
                  <th className="px-6 py-3 font-medium text-gray-500 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {topPerformers.map((inf) => (
                  <tr key={inf.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <Link
                        href={`/influencers/${inf.id}`}
                        className="flex items-center gap-3 group"
                      >
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white text-sm font-bold">
                          {inf.name[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 group-hover:text-orange-600 transition-colors">
                            {inf.name}
                          </p>
                          <p className="text-xs text-gray-400">@{inf.code}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-gray-900">
                      {fmtARS(Number(inf.totalRevenue))}
                    </td>
                    <td className="px-6 py-4 text-right text-gray-600">
                      {fmt(inf.totalConversions)}
                    </td>
                    <td className="px-6 py-4 text-right text-gray-600">
                      {Number(inf.commissionPercent)}%
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-orange-600">
                      {fmtARS(Number(inf.totalCommission))}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          inf.status === "ACTIVE"
                            ? "bg-green-50 text-green-700"
                            : inf.status === "PAUSED"
                            ? "bg-yellow-50 text-yellow-700"
                            : "bg-gray-50 text-gray-500"
                        }`}
                      >
                        {inf.status === "ACTIVE" ? "Activo" : inf.status === "PAUSED" ? "Pausado" : "Inactivo"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {influencers.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <div className="text-5xl mb-4">🤝</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Empeza a trackear tus influencers
          </h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Agrega influencers, genera links de tracking con UTMs automaticos, y medi cuanto vende cada uno en tiempo real.
          </p>
          <Link
            href="/influencers/manage"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 transition-colors"
          >
            + Crear primer influencer
          </Link>
        </div>
      )}
    </div>
  );
}
