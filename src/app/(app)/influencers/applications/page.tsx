"use client";

import { useState, useEffect } from "react";

// ══════════════════════════════════════════════════════════════
// Influencer Applications Management Page
// ══════════════════════════════════════════════════════════════

interface Application {
  id: string;
  name: string;
  email: string;
  instagram: string | null;
  tiktok: string | null;
  youtube: string | null;
  followers: string | null;
  message: string | null;
  status: string;
  notes: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  APPROVED: "bg-green-500/10 text-green-500 border-green-500/20",
  REJECTED: "bg-red-500/10 text-red-500 border-red-500/20",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
};

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("PENDING");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [commissionInput, setCommissionInput] = useState<Record<string, string>>({});
  const [notesInput, setNotesInput] = useState<Record<string, string>>({});
  const [applyUrl, setApplyUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadApplications();
  }, [filter]);

  const loadApplications = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/influencers/applications?status=${filter}`);
      if (res.ok) {
        const data = await res.json();
        setApplications(data.applications || data);
        if (data.applyUrl) setApplyUrl(data.applyUrl);
      }
    } catch (err) {
      console.error("Error loading applications:", err);
    }
    setLoading(false);
  };

  const handleAction = async (id: string, action: "approve" | "reject") => {
    setActionLoading(id);
    try {
      const res = await fetch("/api/influencers/applications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          action,
          commissionPercent: action === "approve" ? Number(commissionInput[id] || 10) : undefined,
          notes: notesInput[id] || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        loadApplications();
        if (action === "approve" && data.influencer) {
          alert(`Influencer creado: ${data.influencer.name} (código: ${data.influencer.code})`);
        }
      } else {
        alert(data.error || "Error");
      }
    } catch {
      alert("Error de conexión");
    }
    setActionLoading(null);
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("es-AR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Aplicaciones de Influencers</h1>
          <p className="text-sm text-gray-500 mt-1">Revisá y aprobá aplicaciones del formulario público</p>
        </div>
      </div>

      {/* Public form link */}
      {applyUrl && (
        <div className="mb-4 bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-orange-800 mb-1">Link del formulario público</p>
            <p className="text-xs text-orange-600 truncate">{applyUrl}</p>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(applyUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className={`px-4 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              copied
                ? "bg-green-500 text-white"
                : "bg-orange-500 text-white hover:bg-orange-600"
            }`}
          >
            {copied ? "Copiado!" : "Copiar link"}
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {["PENDING", "APPROVED", "REJECTED"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              filter === s
                ? "bg-orange-500 text-white border-orange-500"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            }`}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Cargando...</div>
      ) : applications.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 text-sm">No hay aplicaciones {STATUS_LABELS[filter]?.toLowerCase()}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Nombre</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Redes</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Seguidores</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Fecha</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => (
                <tr key={app.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setExpandedId(expandedId === app.id ? null : app.id)}
                      className="text-sm font-medium text-gray-900 hover:text-orange-500 transition-colors text-left"
                    >
                      {app.name}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{app.email}</td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <div className="flex gap-1">
                      {app.instagram && <span className="text-[10px] bg-pink-50 text-pink-500 px-1.5 py-0.5 rounded">IG</span>}
                      {app.tiktok && <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">TT</span>}
                      {app.youtube && <span className="text-[10px] bg-red-50 text-red-500 px-1.5 py-0.5 rounded">YT</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 hidden md:table-cell">{app.followers || "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{formatDate(app.createdAt)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] px-2 py-1 rounded-full border font-medium ${STATUS_COLORS[app.status]}`}>
                      {STATUS_LABELS[app.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {app.status === "PENDING" && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => setExpandedId(expandedId === app.id ? null : app.id)}
                          className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors"
                        >
                          Revisar
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Expanded review panel */}
          {expandedId && (
            <div className="border-t border-gray-200 bg-gray-50 p-4">
              {(() => {
                const app = applications.find((a) => a.id === expandedId);
                if (!app) return null;
                return (
                  <div className="max-w-2xl">
                    <h3 className="font-medium text-gray-900 mb-3">Detalle de {app.name}</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                      <div>
                        <p className="text-xs text-gray-500">Email</p>
                        <p className="text-gray-900">{app.email}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Seguidores</p>
                        <p className="text-gray-900">{app.followers || "No especificó"}</p>
                      </div>
                      {app.instagram && (
                        <div>
                          <p className="text-xs text-gray-500">Instagram</p>
                          <p className="text-gray-900">{app.instagram}</p>
                        </div>
                      )}
                      {app.tiktok && (
                        <div>
                          <p className="text-xs text-gray-500">TikTok</p>
                          <p className="text-gray-900">{app.tiktok}</p>
                        </div>
                      )}
                      {app.youtube && (
                        <div>
                          <p className="text-xs text-gray-500">YouTube</p>
                          <p className="text-gray-900">{app.youtube}</p>
                        </div>
                      )}
                    </div>
                    {app.message && (
                      <div className="mb-4">
                        <p className="text-xs text-gray-500 mb-1">Mensaje</p>
                        <p className="text-sm text-gray-700 bg-white p-3 rounded-lg border border-gray-200">
                          {app.message}
                        </p>
                      </div>
                    )}

                    {app.status === "PENDING" && (
                      <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-gray-200">
                        <div className="flex gap-4 items-end">
                          <div>
                            <label className="text-xs text-gray-500">Comision %</label>
                            <input
                              type="number"
                              min="1"
                              max="50"
                              value={commissionInput[app.id] || "10"}
                              onChange={(e) => setCommissionInput({ ...commissionInput, [app.id]: e.target.value })}
                              className="w-20 mt-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="text-xs text-gray-500">Notas internas</label>
                            <input
                              type="text"
                              value={notesInput[app.id] || ""}
                              onChange={(e) => setNotesInput({ ...notesInput, [app.id]: e.target.value })}
                              placeholder="Notas opcionales..."
                              className="w-full mt-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAction(app.id, "approve")}
                            disabled={actionLoading === app.id}
                            className="px-4 py-2 bg-green-500 text-white rounded-lg text-xs font-medium hover:bg-green-600 transition-colors disabled:opacity-50"
                          >
                            {actionLoading === app.id ? "..." : "Aprobar y crear influencer"}
                          </button>
                          <button
                            onClick={() => handleAction(app.id, "reject")}
                            disabled={actionLoading === app.id}
                            className="px-4 py-2 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                          >
                            Rechazar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
