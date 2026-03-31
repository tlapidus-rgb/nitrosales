// @ts-nocheck
"use client";

import React, { useState, useEffect } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from "recharts";
import {
  Award, Star, TrendingUp, AlertTriangle, Clock, ShieldCheck,
  ThumbsUp, ThumbsDown, Minus,
} from "lucide-react";
import { KpiCard } from "@/components/dashboard";

interface ReputacionData {
  current: {
    level: string; levelLabel: string; levelColor: string; powerSeller: boolean;
    totalSales: number; completedSales: number; cancelledSales: number;
    claimsRate: number; delayedRate: number; cancellationRate: number;
    positiveRatings: number; negativeRatings: number; neutralRatings: number;
    totalRatings: number; positiveRate: string; date: string;
  } | null;
  history: Array<{
    date: string; level: string; totalSales: number;
    claimsRate: number; delayedRate: number; cancellationRate: number;
    positiveRatings: number; negativeRatings: number; neutralRatings: number;
  }>;
}

export default function ReputacionPage() {
  const [data, setData] = useState<ReputacionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(90);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/mercadolibre/reputacion?days=${days}`)
      .then((r) => r.json())
      .then(setData)
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [days]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500 mx-auto mb-3" />
          <p className="text-gray-500">Cargando reputacion...</p>
        </div>
      </div>
    );
  }

  if (!data || !data.current) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Award size={32} className="text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500">Sin datos de reputacion. Sincroniza desde el Dashboard ML.</p>
        </div>
      </div>
    );
  }

  const { current } = data;
  const completionRate = current.totalSales > 0
    ? ((current.completedSales / current.totalSales) * 100).toFixed(1)
    : "0";

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reputacion MercadoLibre</h1>
        <p className="text-sm text-gray-500 mt-0.5">Metricas del seller ELMUNDODELJUG</p>
      </div>

      {/* LEVEL BANNER */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-8">
          {/* Level indicator */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: `${current.levelColor}15` }}>
              <Award size={32} style={{ color: current.levelColor }} />
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: current.levelColor }}>{current.levelLabel}</p>
              <p className="text-sm text-gray-500">
                {current.powerSeller && <span className="text-yellow-600 font-semibold">MercadoLider · </span>}
                {current.totalSales.toLocaleString("es-AR")} ventas totales
              </p>
            </div>
          </div>

          {/* Ratings breakdown */}
          <div className="flex gap-8 ml-auto">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <ThumbsUp size={14} className="text-emerald-500" />
                <span className="text-2xl font-bold text-emerald-600">{current.positiveRatings.toLocaleString("es-AR")}</span>
              </div>
              <p className="text-xs text-gray-500">Positivas ({current.positiveRate}%)</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Minus size={14} className="text-gray-400" />
                <span className="text-2xl font-bold text-gray-400">{current.neutralRatings.toLocaleString("es-AR")}</span>
              </div>
              <p className="text-xs text-gray-500">Neutras</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <ThumbsDown size={14} className="text-red-500" />
                <span className="text-2xl font-bold text-red-500">{current.negativeRatings.toLocaleString("es-AR")}</span>
              </div>
              <p className="text-xs text-gray-500">Negativas</p>
            </div>
          </div>
        </div>
      </div>

      {/* METRIC CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={<ShieldCheck size={16} className="text-emerald-600" />} iconBg="bg-emerald-50"
          label="Ventas completadas" value={current.completedSales.toLocaleString("es-AR")}
          subtitle={`${completionRate}% completion`} />
        <KpiCard icon={<TrendingUp size={16} className="text-blue-600" />} iconBg="bg-blue-50"
          label="Ventas totales" value={current.totalSales.toLocaleString("es-AR")} />
        <KpiCard icon={<AlertTriangle size={16} className="text-yellow-600" />} iconBg="bg-yellow-50"
          label="Canceladas" value={current.cancelledSales.toLocaleString("es-AR")} />
        <KpiCard icon={<AlertTriangle size={16} className="text-red-600" />} iconBg="bg-red-50"
          label="Tasa reclamos" value={current.claimsRate != null ? `${(current.claimsRate * 100).toFixed(2)}%` : "--"} />
        <KpiCard icon={<Clock size={16} className="text-orange-600" />} iconBg="bg-orange-50"
          label="Envios tardios" value={current.delayedRate != null ? `${(current.delayedRate * 100).toFixed(2)}%` : "--"} />
        <KpiCard icon={<AlertTriangle size={16} className="text-purple-600" />} iconBg="bg-purple-50"
          label="Tasa cancelacion" value={current.cancellationRate != null ? `${(current.cancellationRate * 100).toFixed(2)}%` : "--"} />
      </div>

      {/* ML THERMOMETER — visual scale */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-800 mb-4">Termometro de reputacion</h2>
        <div className="flex items-center gap-1 h-8 rounded-full overflow-hidden">
          {[
            { level: "1_red", color: "#ef4444", label: "Malo" },
            { level: "2_orange", color: "#f97316", label: "Regular" },
            { level: "3_yellow", color: "#f59e0b", label: "Bueno" },
            { level: "4_light_green", color: "#34d399", label: "Muy bueno" },
            { level: "5_green", color: "#10b981", label: "Excelente" },
          ].map((seg) => (
            <div key={seg.level} className="flex-1 h-full relative flex items-center justify-center"
              style={{ backgroundColor: current.level === seg.level ? seg.color : `${seg.color}30` }}>
              <span className={`text-[10px] font-medium ${current.level === seg.level ? "text-white" : "text-gray-500"}`}>
                {seg.label}
              </span>
              {current.level === seg.level && (
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-transparent border-t-gray-800" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* PERFORMANCE METRICS — bars */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-800 mb-4">Metricas de performance (umbrales ML)</h2>
        <div className="space-y-4">
          {[
            { label: "Reclamos", value: current.claimsRate ? current.claimsRate * 100 : 0, threshold: 2, unit: "%" },
            { label: "Envios tardios", value: current.delayedRate ? current.delayedRate * 100 : 0, threshold: 15, unit: "%" },
            { label: "Cancelaciones", value: current.cancellationRate ? current.cancellationRate * 100 : 0, threshold: 5, unit: "%" },
          ].map((m) => {
            const isGood = m.value < m.threshold;
            const pct = Math.min((m.value / (m.threshold * 2)) * 100, 100);
            return (
              <div key={m.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-600">{m.label}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold ${isGood ? "text-emerald-600" : "text-red-500"}`}>
                      {m.value.toFixed(2)}{m.unit}
                    </span>
                    <span className="text-[10px] text-gray-400">umbral: {m.threshold}{m.unit}</span>
                  </div>
                </div>
                <div className="relative w-full bg-gray-100 rounded-full h-3">
                  <div className="h-3 rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: isGood ? "#10b981" : "#ef4444" }} />
                  {/* Threshold marker */}
                  <div className="absolute top-0 h-3 w-0.5 bg-gray-400"
                    style={{ left: `${(m.threshold / (m.threshold * 2)) * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-gray-400 mt-3">Los umbrales son los maximos recomendados por MercadoLibre para mantener buena reputacion</p>
      </div>

      {/* NOTE ABOUT HISTORY */}
      {data.history.length <= 1 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
          <p className="text-xs text-yellow-700">
            Los graficos historicos se construiran a medida que se sincronicen datos diariamente.
            Por ahora se muestra el snapshot de hoy.
          </p>
        </div>
      )}

      {/* HISTORY CHARTS (only if >1 data points) */}
      {data.history.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Evolucion de metricas</h2>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={data.history}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date"
                tickFormatter={(d) => { try { return new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "short" }); } catch { return d; } }}
                tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={50} />
              <Tooltip contentStyle={{ borderRadius: "0.5rem", border: "1px solid #e2e8f0", fontSize: "0.8rem" }} />
              <Area type="monotone" dataKey="totalSales" stroke="#6366f1" strokeWidth={2} fill="#6366f115" name="Ventas acumuladas" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
