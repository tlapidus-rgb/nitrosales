"use client";

import { useState, useEffect, useCallback } from "react";
import { formatARS, formatCompact } from "@/lib/utils/format";

// ── Types ──────────────────────────────────

interface Insight {
  id: string;
  type: "ALERT" | "OPPORTUNITY" | "TREND" | "RECOMMENDATION";
  priority: "HIGH" | "MEDIUM" | "LOW";
  title: string;
  description: string;
  action: string;
  metric: string | null;
  metricValue: number | null;
  metricDelta: number | null;
  isRead: boolean;
  isDismissed: boolean;
  createdAt: string;
}

// ── Config ──────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  ALERT: { label: "Alerta", icon: "🚨", color: "text-red-500", bg: "bg-red-500/10 border-red-500/20" },
  OPPORTUNITY: { label: "Oportunidad", icon: "💡", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  TREND: { label: "Tendencia", icon: "📈", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  RECOMMENDATION: { label: "Recomendacion", icon: "🎯", color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string; dotColor: string }> = {
  HIGH: { label: "Urgente", color: "text-red-400", dotColor: "bg-red-400" },
  MEDIUM: { label: "Importante", color: "text-amber-400", dotColor: "bg-amber-400" },
  LOW: { label: "Info", color: "text-gray-400", dotColor: "bg-gray-400" },
};

type FilterType = "ALL" | "ALERT" | "OPPORTUNITY" | "TREND" | "RECOMMENDATION";
type FilterPriority = "ALL" | "HIGH" | "MEDIUM" | "LOW";

export default function AlertasPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [filterType, setFilterType] = useState<FilterType>("ALL");
  const [filterPriority, setFilterPriority] = useState<FilterPriority>("ALL");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const fetchInsights = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (showUnreadOnly) params.set("unread", "true");
      if (filterPriority !== "ALL") params.set("priority", filterPriority);
      const res = await fetch(`/api/alertas?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      setInsights(data.insights || []);
      setUnreadCount(data.unreadCount || 0);
      setTotal(data.total || 0);
    } catch (e) {
      console.error("Failed to fetch insights:", e);
    } finally {
      setLoading(false);
    }
  }, [showUnreadOnly, filterPriority]);

  useEffect(() => { fetchInsights(); }, [fetchInsights]);

  const handleMarkRead = async (id: string) => {
    await fetch("/api/alertas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isRead: true }),
    });
    setInsights(prev => prev.map(i => i.id === id ? { ...i, isRead: true } : i));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const handleDismiss = async (id: string) => {
    await fetch("/api/alertas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isDismissed: true }),
    });
    setInsights(prev => prev.filter(i => i.id !== id));
    setTotal(prev => prev - 1);
  };

  const handleMarkAllRead = async () => {
    const unread = insights.filter(i => !i.isRead);
    await Promise.all(unread.map(i =>
      fetch("/api/alertas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: i.id, isRead: true }),
      })
    ));
    setInsights(prev => prev.map(i => ({ ...i, isRead: true })));
    setUnreadCount(0);
  };

  // Apply type filter client-side
  const filtered = insights.filter(i => filterType === "ALL" || i.type === filterType);

  // Group by date
  const grouped = new Map<string, Insight[]>();
  for (const insight of filtered) {
    const date = new Date(insight.createdAt).toLocaleDateString("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date)!.push(insight);
  }

  // Stats
  const alertCount = insights.filter(i => i.type === "ALERT").length;
  const opportunityCount = insights.filter(i => i.type === "OPPORTUNITY").length;
  const trendCount = insights.filter(i => i.type === "TREND").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alertas e Insights</h1>
          <p className="text-sm text-gray-500 mt-1">
            Anomalias detectadas automaticamente por reglas + IA
          </p>
        </div>
        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
            >
              Marcar todo como leido
            </button>
          )}
          {unreadCount > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded-full text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              {unreadCount} sin leer
            </span>
          )}
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🚨</span>
            <span className="text-xs text-gray-500 font-medium">Alertas</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{alertCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">💡</span>
            <span className="text-xs text-gray-500 font-medium">Oportunidades</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{opportunityCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">📈</span>
            <span className="text-xs text-gray-500 font-medium">Tendencias</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{trendCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">📬</span>
            <span className="text-xs text-gray-500 font-medium">Total</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{total}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-100 p-1">
          {(["ALL", "ALERT", "OPPORTUNITY", "TREND", "RECOMMENDATION"] as FilterType[]).map(t => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filterType === t
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
              }`}
            >
              {t === "ALL" ? "Todas" : TYPE_CONFIG[t]?.label || t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-100 p-1">
          {(["ALL", "HIGH", "MEDIUM", "LOW"] as FilterPriority[]).map(p => (
            <button
              key={p}
              onClick={() => setFilterPriority(p)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filterPriority === p
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
              }`}
            >
              {p === "ALL" ? "Todas" : PRIORITY_CONFIG[p]?.label || p}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer ml-2">
          <input
            type="checkbox"
            checked={showUnreadOnly}
            onChange={e => setShowUnreadOnly(e.target.checked)}
            className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
          />
          Solo sin leer
        </label>
      </div>

      {/* Insights List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
            <span className="text-gray-500 text-sm">Cargando alertas...</span>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <p className="text-4xl mb-3">✨</p>
          <p className="text-gray-900 font-semibold mb-1">Todo en orden</p>
          <p className="text-gray-500 text-sm">
            No hay alertas activas. Las anomalias se detectan automaticamente todos los dias.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([date, items]) => (
            <div key={date}>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">
                {date}
              </h3>
              <div className="space-y-3">
                {items.map(insight => {
                  const typeConf = TYPE_CONFIG[insight.type] || TYPE_CONFIG.TREND;
                  const prioConf = PRIORITY_CONFIG[insight.priority] || PRIORITY_CONFIG.LOW;
                  return (
                    <div
                      key={insight.id}
                      className={`bg-white rounded-xl border p-4 transition-all duration-200 hover:shadow-sm ${
                        !insight.isRead ? "border-l-4 border-l-orange-400 border-gray-100" : "border-gray-100 opacity-80"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Icon */}
                        <span className="text-xl mt-0.5">{typeConf.icon}</span>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${typeConf.bg}`}>
                              <span className={typeConf.color}>{typeConf.label}</span>
                            </span>
                            <span className="inline-flex items-center gap-1 text-[10px]">
                              <span className={`w-1.5 h-1.5 rounded-full ${prioConf.dotColor}`} />
                              <span className={prioConf.color}>{prioConf.label}</span>
                            </span>
                            <span className="text-[10px] text-gray-400">
                              {new Date(insight.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>

                          <h4 className="text-sm font-semibold text-gray-900 mb-1">
                            {insight.title}
                          </h4>
                          <p className="text-xs text-gray-600 leading-relaxed mb-2">
                            {insight.description}
                          </p>

                          {/* Metric badge */}
                          {insight.metricDelta !== null && insight.metricDelta !== undefined && (
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold ${
                              insight.metricDelta > 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                            }`}>
                              {insight.metricDelta > 0 ? "↑" : "↓"} {Math.abs(insight.metricDelta)}%
                              {insight.metric && <span className="text-gray-400 font-normal ml-1">{insight.metric}</span>}
                            </span>
                          )}

                          {/* Action */}
                          <div className="mt-3 bg-gray-50 rounded-lg px-3 py-2">
                            <p className="text-xs text-gray-700">
                              <span className="text-orange-500 font-semibold">→</span> {insight.action}
                            </p>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-1 ml-2">
                          {!insight.isRead && (
                            <button
                              onClick={() => handleMarkRead(insight.id)}
                              title="Marcar como leido"
                              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </button>
                          )}
                          <button
                            onClick={() => handleDismiss(insight.id)}
                            title="Descartar"
                            className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-gray-400 hover:text-red-500"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
