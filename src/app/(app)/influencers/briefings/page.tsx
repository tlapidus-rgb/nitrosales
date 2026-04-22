"use client";

import { useState, useEffect } from "react";

// ══════════════════════════════════════════════════════════════
// Influencer Briefings Manager
// ══════════════════════════════════════════════════════════════

const TYPES = [
  { value: "GENERAL", label: "General" },
  { value: "REEL", label: "Reel" },
  { value: "STORY", label: "Story" },
  { value: "POST", label: "Post" },
  { value: "UNBOXING", label: "Unboxing" },
  { value: "REVIEW", label: "Review" },
];

interface Influencer {
  id: string;
  name: string;
  code: string;
}

interface Briefing {
  id: string;
  title: string;
  description: string;
  type: string;
  deadline: string | null;
  status: string;
  requirements: string | null;
  hashtags: string | null;
  mentions: string | null;
  dos: string | null;
  donts: string | null;
  referenceUrls: string | null;
  influencer: Influencer | null;
  campaign: { id: string; name: string } | null;
  _count: { submissions: number; seedings: number };
  createdAt: string;
}

export default function BriefingsPage() {
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", type: "GENERAL", deadline: "",
    requirements: "", hashtags: "", mentions: "", dos: "", donts: "",
    referenceUrls: "", influencerId: "", campaignId: "",
  });

  useEffect(() => {
    Promise.all([
      fetch("/api/influencers/briefings").then((r) => r.json()),
      fetch("/api/influencers").then((r) => r.json()),
    ]).then(([bData, iData]) => {
      setBriefings(bData.briefings || []);
      setInfluencers((iData.influencers || iData || []).map((i: any) => ({ id: i.id, name: i.name, code: i.code })));
    }).finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    if (!form.title || !form.description) return;
    setSaving(true);
    try {
      const res = await fetch("/api/influencers/briefings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          influencerId: form.influencerId || null,
          campaignId: form.campaignId || null,
        }),
      });
      const data = await res.json();
      if (data.briefing) {
        // Refresh list
        const refreshed = await fetch("/api/influencers/briefings").then((r) => r.json());
        setBriefings(refreshed.briefings || []);
        setShowForm(false);
        setForm({ title: "", description: "", type: "GENERAL", deadline: "", requirements: "", hashtags: "", mentions: "", dos: "", donts: "", referenceUrls: "", influencerId: "", campaignId: "" });
      }
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    await fetch("/api/influencers/briefings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    setBriefings(briefings.map((b) => (b.id === id ? { ...b, status } : b)));
  };

  const inputStyle = { color: "#111827", backgroundColor: "#ffffff" };
  const textareaStyle = { ...inputStyle, minHeight: "80px" };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
          <p className="text-gray-500 font-mono text-sm">Cargando briefings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Briefings de Contenido</h1>
          <p className="text-sm text-gray-500 mt-1">Creá y asigná briefs a tus influencers</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 transition-colors"
        >
          {showForm ? "Cancelar" : "+ Nuevo Brief"}
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h3 className="text-sm font-semibold" style={inputStyle}>Nuevo Briefing</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Titulo *</label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Ej: Reel para Día del Niño"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                style={inputStyle}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Tipo</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                  style={inputStyle}
                >
                  {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Fecha limite</label>
                <input
                  type="date"
                  value={form.deadline}
                  onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Descripcion / Instrucciones *</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Describí en detalle qué necesitás del influencer..."
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm resize-y"
              style={textareaStyle}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Lo que SI hacer</label>
              <textarea
                value={form.dos}
                onChange={(e) => setForm({ ...form, dos: e.target.value })}
                placeholder="- Mostrar el producto en uso&#10;- Mencionar el código de descuento"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm resize-y"
                style={textareaStyle}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Lo que NO hacer</label>
              <textarea
                value={form.donts}
                onChange={(e) => setForm({ ...form, donts: e.target.value })}
                placeholder="- No mencionar a la competencia&#10;- No hacer claims sobre seguridad"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm resize-y"
                style={textareaStyle}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Hashtags</label>
              <input
                value={form.hashtags}
                onChange={(e) => setForm({ ...form, hashtags: e.target.value })}
                placeholder="#juguetes #diadelnino"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Menciones</label>
              <input
                value={form.mentions}
                onChange={(e) => setForm({ ...form, mentions: e.target.value })}
                placeholder="@tumarca"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Asignar a</label>
              <select
                value={form.influencerId}
                onChange={(e) => setForm({ ...form, influencerId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                style={inputStyle}
              >
                <option value="">Todos los influencers</option>
                {influencers.map((i) => <option key={i.id} value={i.id}>{i.name} (@{i.code})</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Requerimientos tecnicos</label>
            <input
              value={form.requirements}
              onChange={(e) => setForm({ ...form, requirements: e.target.value })}
              placeholder="Ej: Vertical 9:16, min 15s, max 60s, resolución mín 1080p"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
              style={inputStyle}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Links de referencia (uno por linea)</label>
            <textarea
              value={form.referenceUrls}
              onChange={(e) => setForm({ ...form, referenceUrls: e.target.value })}
              placeholder="https://instagram.com/reel/ejemplo1&#10;https://tiktok.com/@ejemplo/video/123"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm resize-y"
              style={{ ...inputStyle, minHeight: "60px" }}
            />
          </div>

          <button
            onClick={handleCreate}
            disabled={saving || !form.title || !form.description}
            className="px-6 py-2 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 transition-colors disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Crear Briefing"}
          </button>
        </div>
      )}

      {/* Briefings List */}
      {briefings.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-gray-900 font-medium">No hay briefings todavia</p>
          <p className="text-gray-500 text-sm mt-1">Creá tu primer brief para guiar a tus influencers sobre qué contenido crear</p>
        </div>
      ) : (
        <div className="space-y-3">
          {briefings.map((b) => (
            <div key={b.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div
                className="p-5 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setExpandedId(expandedId === b.id ? null : b.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-medium uppercase ${
                      b.type === "REEL" ? "bg-purple-50 text-purple-700" :
                      b.type === "STORY" ? "bg-blue-50 text-blue-700" :
                      b.type === "UNBOXING" ? "bg-amber-50 text-amber-700" :
                      b.type === "REVIEW" ? "bg-green-50 text-green-700" :
                      "bg-gray-50 text-gray-700"
                    }`}>{b.type}</span>
                    <h3 className="text-sm font-semibold" style={{ color: "#111827" }}>{b.title}</h3>
                    {b.influencer ? (
                      <span className="text-xs text-gray-400">→ {b.influencer.name}</span>
                    ) : (
                      <span className="text-xs text-gray-400">→ Todos</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">{b._count.submissions} envios</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      b.status === "ACTIVE" ? "bg-green-50 text-green-700" :
                      b.status === "COMPLETED" ? "bg-blue-50 text-blue-700" :
                      "bg-gray-50 text-gray-500"
                    }`}>{b.status}</span>
                    {b.deadline && (
                      <span className="text-[10px] text-gray-400 font-mono">
                        Deadline: {new Date(b.deadline).toLocaleDateString("es-AR")}
                      </span>
                    )}
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${expandedId === b.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>
              </div>

              {expandedId === b.id && (
                <div className="px-5 pb-5 border-t border-gray-100 pt-4 space-y-3">
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{b.description}</p>

                  {b.dos && (
                    <div>
                      <p className="text-xs font-medium text-green-700 mb-1">Lo que SI hacer:</p>
                      <p className="text-xs text-gray-600 whitespace-pre-wrap">{b.dos}</p>
                    </div>
                  )}
                  {b.donts && (
                    <div>
                      <p className="text-xs font-medium text-red-700 mb-1">Lo que NO hacer:</p>
                      <p className="text-xs text-gray-600 whitespace-pre-wrap">{b.donts}</p>
                    </div>
                  )}
                  {b.hashtags && <p className="text-xs text-orange-500">{b.hashtags}</p>}
                  {b.mentions && <p className="text-xs text-blue-500">{b.mentions}</p>}
                  {b.requirements && <p className="text-xs text-gray-500">Req. técnicos: {b.requirements}</p>}

                  <div className="flex gap-2 pt-2">
                    {b.status === "ACTIVE" && (
                      <button
                        onClick={() => updateStatus(b.id, "COMPLETED")}
                        className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-medium hover:bg-blue-600"
                      >
                        Marcar completado
                      </button>
                    )}
                    {b.status !== "CANCELLED" && (
                      <button
                        onClick={() => updateStatus(b.id, "CANCELLED")}
                        className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200"
                      >
                        Cancelar brief
                      </button>
                    )}
                    {b.status === "CANCELLED" && (
                      <button
                        onClick={() => updateStatus(b.id, "ACTIVE")}
                        className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-medium hover:bg-green-600"
                      >
                        Reactivar
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
