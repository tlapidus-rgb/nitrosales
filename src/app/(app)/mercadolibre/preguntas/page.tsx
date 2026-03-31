// @ts-nocheck
"use client";

import React, { useState, useEffect } from "react";
import {
  MessageSquare, Clock, CheckCircle, AlertCircle, Search,
  ChevronLeft, ChevronRight, ExternalLink, User,
} from "lucide-react";
import { KpiCard } from "@/components/dashboard";

interface PreguntasData {
  kpis: {
    total: number; unanswered: number; answered: number;
    responseRate: string; avgResponseMinutes: number; avgResponseHours: string;
  };
  questionsByItem: Array<{
    mlItemId: string; count: number; title: string; thumbnail: string | null;
  }>;
  questions: Array<{
    id: string; mlQuestionId: string; text: string; status: string;
    dateCreated: string; answerText: string | null; answerDate: string | null;
    mlItemId: string; itemTitle: string; itemThumbnail: string | null;
    itemPermalink: string | null; fromBuyerId: string | null;
  }>;
  pagination: { page: number; pageSize: number; totalCount: number; totalPages: number };
}

const STATUS_COLORS: Record<string, string> = {
  UNANSWERED: "#f59e0b", ANSWERED: "#10b981", CLOSED_UNANSWERED: "#ef4444",
};
const STATUS_LABELS: Record<string, string> = {
  UNANSWERED: "Sin responder", ANSWERED: "Respondida", CLOSED_UNANSWERED: "Cerrada sin respuesta",
};

export default function PreguntasPage() {
  const [data, setData] = useState<PreguntasData | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ status, page: String(page) });
    if (search) params.set("search", search);
    fetch(`/api/mercadolibre/preguntas?${params}`)
      .then((r) => r.json())
      .then(setData)
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [status, search, page]);

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString("es-AR", {
        day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit",
      });
    } catch { return d; }
  };

  const formatResponseTime = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    if (minutes < 1440) return `${(minutes / 60).toFixed(1)} hs`;
    return `${(minutes / 1440).toFixed(1)} dias`;
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500 mx-auto mb-3" />
          <p className="text-gray-500">Cargando preguntas...</p>
        </div>
      </div>
    );
  }

  if (!data) return null;
  const { kpis, questions, pagination } = data;

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Preguntas MercadoLibre</h1>
        <p className="text-sm text-gray-500 mt-0.5">Preguntas de compradores en ELMUNDODELJUG</p>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={<AlertCircle size={16} className="text-yellow-600" />} iconBg="bg-yellow-50"
          label="Sin responder" value={kpis.unanswered.toLocaleString("es-AR")} />
        <KpiCard icon={<CheckCircle size={16} className="text-emerald-600" />} iconBg="bg-emerald-50"
          label="Respondidas" value={kpis.answered.toLocaleString("es-AR")}
          subtitle={`${kpis.responseRate}% tasa de respuesta`} />
        <KpiCard icon={<Clock size={16} className="text-blue-600" />} iconBg="bg-blue-50"
          label="Tiempo promedio respuesta" value={formatResponseTime(kpis.avgResponseMinutes)} />
        <KpiCard icon={<MessageSquare size={16} className="text-purple-600" />} iconBg="bg-purple-50"
          label="Total preguntas" value={kpis.total.toLocaleString("es-AR")} />
      </div>

      {/* TOP ITEMS WITH QUESTIONS */}
      {data.questionsByItem.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">Productos con mas preguntas</h2>
          <div className="space-y-2">
            {data.questionsByItem.map((item, i) => (
              <div key={item.mlItemId} className="flex items-center gap-3 py-1.5">
                <span className="text-xs font-bold text-gray-400 w-5 text-right">{i + 1}</span>
                <div className="w-8 h-8 rounded overflow-hidden bg-gray-100 flex-shrink-0">
                  {item.thumbnail ? <img src={item.thumbnail} alt="" className="w-full h-full object-cover" /> : <MessageSquare size={14} className="text-gray-400 m-auto mt-2" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{item.title}</p>
                  <p className="text-[10px] text-gray-400 font-mono">{item.mlItemId}</p>
                </div>
                <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                  {item.count} preguntas
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FILTERS */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex gap-1.5 bg-gray-100 rounded-lg p-1">
          {[
            { value: "all", label: "Todas" },
            { value: "UNANSWERED", label: "Sin responder" },
            { value: "ANSWERED", label: "Respondidas" },
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
            <input type="text" placeholder="Buscar en preguntas..."
              value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 bg-white w-64" />
          </div>
          <button onClick={handleSearch} className="px-3 py-1.5 bg-yellow-100 text-yellow-700 rounded-lg text-xs font-medium hover:bg-yellow-200 transition-all">
            Buscar
          </button>
        </div>
      </div>

      {/* QUESTIONS LIST */}
      <div className="space-y-3">
        {questions.map((q) => (
          <div key={q.id} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              {/* Item thumbnail */}
              <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                {q.itemThumbnail ? <img src={q.itemThumbnail} alt="" className="w-full h-full object-cover" /> : <MessageSquare size={18} className="text-gray-400 m-auto mt-3" />}
              </div>

              <div className="flex-1 min-w-0">
                {/* Item title + status */}
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-xs text-gray-500 truncate flex-1">{q.itemTitle}</p>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium"
                      style={{ backgroundColor: `${STATUS_COLORS[q.status] || "#94a3b8"}15`, color: STATUS_COLORS[q.status] || "#94a3b8" }}>
                      {STATUS_LABELS[q.status] || q.status}
                    </span>
                    {q.itemPermalink && (
                      <a href={q.itemPermalink} target="_blank" rel="noopener noreferrer"
                        className="text-gray-400 hover:text-yellow-600 transition-colors">
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                </div>

                {/* Question text */}
                <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-3 mb-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <User size={12} className="text-yellow-600" />
                    <span className="text-[10px] text-yellow-600 font-medium">Comprador</span>
                    <span className="text-[10px] text-gray-400 ml-auto">{formatDate(q.dateCreated)}</span>
                  </div>
                  <p className="text-sm text-gray-800">{q.text}</p>
                </div>

                {/* Answer */}
                {q.answerText && (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <CheckCircle size={12} className="text-emerald-600" />
                      <span className="text-[10px] text-emerald-600 font-medium">Tu respuesta</span>
                      {q.answerDate && (
                        <span className="text-[10px] text-gray-400 ml-auto">{formatDate(q.answerDate)}</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-800">{q.answerText}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {questions.length === 0 && (
          <div className="text-center py-12">
            <MessageSquare size={32} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">
              {kpis.total === 0 ? "Sin preguntas sincronizadas. Presiona 'Sync ML' en el Dashboard." : "No se encontraron preguntas con esos filtros."}
            </p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
            Pagina {pagination.page} de {pagination.totalPages} ({pagination.totalCount} preguntas)
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
  );
}
