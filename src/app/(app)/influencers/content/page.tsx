"use client";

import { useState, useEffect } from "react";

// ══════════════════════════════════════════════════════════════
// Content Review & Approval Page
// ══════════════════════════════════════════════════════════════

const STATUS_TABS = [
  { value: "", label: "Todos" },
  { value: "PENDING", label: "Pendientes" },
  { value: "APPROVED", label: "Aprobados" },
  { value: "REVISION", label: "Revision" },
  { value: "REJECTED", label: "Rechazados" },
];

const PLATFORM_ICONS: Record<string, string> = {
  INSTAGRAM: "📸",
  TIKTOK: "🎵",
  YOUTUBE: "▶️",
  OTHER: "🔗",
};

interface Submission {
  id: string;
  type: string;
  platform: string;
  contentUrl: string;
  caption: string | null;
  thumbnailUrl: string | null;
  notes: string | null;
  status: string;
  reviewNotes: string | null;
  reviewedAt: string | null;
  publishedAt: string | null;
  isUGC: boolean;
  createdAt: string;
  influencer: { id: string; name: string; code: string; profileImage: string | null };
  briefing: { id: string; title: string } | null;
}

export default function ContentPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const fetchData = (status?: string) => {
    const qs = status ? `?status=${status}` : "";
    fetch(`/api/influencers/content${qs}`)
      .then((r) => r.json())
      .then((d) => setSubmissions(d.submissions || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData(statusFilter);
  }, [statusFilter]);

  const handleReview = async (id: string, status: string) => {
    await fetch("/api/influencers/content", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, reviewNotes: reviewNotes || null }),
    });
    setReviewingId(null);
    setReviewNotes("");
    fetchData(statusFilter);
  };

  const toggleUGC = async (id: string, isUGC: boolean) => {
    await fetch("/api/influencers/content", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isUGC }),
    });
    setSubmissions(submissions.map((s) =>
      s.id === id ? { ...s, isUGC } : s
    ));
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      PENDING: "bg-yellow-50 text-yellow-700",
      APPROVED: "bg-green-50 text-green-700",
      REVISION: "bg-orange-50 text-orange-700",
      REJECTED: "bg-red-50 text-red-700",
    };
    return map[status] || "bg-gray-50 text-gray-700";
  };

  const inputStyle = { color: "#111827", backgroundColor: "#ffffff" };
  const pendingCount = submissions.filter((s) => s.status === "PENDING").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
          <p className="text-gray-500 font-mono text-sm">Cargando contenido...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Contenido y Aprobaciones</h1>
        <p className="text-sm text-gray-500 mt-1">
          Revisá y aprobá el contenido que suben tus influencers
          {pendingCount > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
              {pendingCount} pendiente{pendingCount !== 1 ? "s" : ""}
            </span>
          )}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === tab.value
                ? "bg-orange-500 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {submissions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <p className="text-4xl mb-3">📹</p>
          <p className="text-gray-900 font-medium">No hay contenido {statusFilter ? `con estado ${statusFilter}` : "todavia"}</p>
          <p className="text-gray-500 text-sm mt-1">Cuando tus influencers suban contenido desde su dashboard, vas a verlo aca para revisar y aprobar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {submissions.map((s) => (
            <div key={s.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Header */}
              <div className="p-4 border-b border-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {s.influencer.profileImage ? (
                      <img src={s.influencer.profileImage} alt="" className="w-7 h-7 rounded-full" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 text-xs font-bold">
                        {s.influencer.name[0]?.toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-medium" style={{ color: "#111827" }}>{s.influencer.name}</p>
                      <p className="text-[10px] text-gray-400">@{s.influencer.code}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusBadge(s.status)}`}>
                    {s.status}
                  </span>
                </div>
              </div>

              {/* Content */}
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{PLATFORM_ICONS[s.platform] || "🔗"}</span>
                  <span className="text-xs font-medium text-gray-500">{s.platform} · {s.type}</span>
                  {s.briefing && (
                    <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">
                      Brief: {s.briefing.title}
                    </span>
                  )}
                </div>

                <a
                  href={s.contentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs text-orange-500 hover:text-orange-600 truncate font-mono"
                >
                  {s.contentUrl}
                </a>

                {s.caption && (
                  <p className="text-xs text-gray-600 line-clamp-3">{s.caption}</p>
                )}

                {s.notes && (
                  <p className="text-xs text-gray-400 italic">Nota: {s.notes}</p>
                )}

                <p className="text-[10px] text-gray-400">
                  Enviado {new Date(s.createdAt).toLocaleDateString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>

                {/* Review feedback */}
                {s.reviewNotes && (
                  <div className={`p-2 rounded-lg text-xs ${
                    s.status === "APPROVED" ? "bg-green-50 text-green-700" :
                    s.status === "REJECTED" ? "bg-red-50 text-red-700" :
                    "bg-orange-50 text-orange-700"
                  }`}>
                    Feedback: {s.reviewNotes}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="p-4 border-t border-gray-50 space-y-2">
                {reviewingId === s.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      placeholder="Feedback para el influencer (opcional)..."
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs resize-none"
                      style={{ ...inputStyle, minHeight: "60px" }}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReview(s.id, "APPROVED")}
                        className="flex-1 px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-medium hover:bg-green-600"
                      >
                        Aprobar
                      </button>
                      <button
                        onClick={() => handleReview(s.id, "REVISION")}
                        className="flex-1 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-medium hover:bg-orange-600"
                      >
                        Pedir revision
                      </button>
                      <button
                        onClick={() => handleReview(s.id, "REJECTED")}
                        className="flex-1 px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600"
                      >
                        Rechazar
                      </button>
                    </div>
                    <button
                      onClick={() => { setReviewingId(null); setReviewNotes(""); }}
                      className="w-full px-3 py-1.5 text-gray-400 text-xs hover:text-gray-600"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    {s.status === "PENDING" || s.status === "REVISION" ? (
                      <button
                        onClick={() => setReviewingId(s.id)}
                        className="px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-medium hover:bg-orange-600"
                      >
                        Revisar
                      </button>
                    ) : (
                      <div />
                    )}
                    {s.status === "APPROVED" && (
                      <button
                        onClick={() => toggleUGC(s.id, !s.isUGC)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          s.isUGC
                            ? "bg-purple-100 text-purple-700 hover:bg-purple-200"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {s.isUGC ? "✓ Marcado UGC" : "Marcar como UGC"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
