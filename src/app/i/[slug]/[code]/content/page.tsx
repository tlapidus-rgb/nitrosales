"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

// ══════════════════════════════════════════════════════════════
// Public Content Portal — Influencer submits content & sees briefs
// ══════════════════════════════════════════════════════════════

const TYPES = [
  { value: "REEL", label: "Reel" },
  { value: "STORY", label: "Story" },
  { value: "POST", label: "Post" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "YOUTUBE", label: "YouTube" },
  { value: "OTHER", label: "Otro" },
];

const PLATFORMS = [
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "YOUTUBE", label: "YouTube" },
  { value: "OTHER", label: "Otro" },
];

interface Briefing {
  id: string;
  title: string;
  description: string;
  type: string;
  deadline: string | null;
  requirements: string | null;
  hashtags: string | null;
  mentions: string | null;
  dos: string | null;
  donts: string | null;
  referenceUrls: string | null;
  campaign: { name: string } | null;
  _count: { submissions: number };
}

interface Submission {
  id: string;
  type: string;
  platform: string;
  contentUrl: string;
  caption: string | null;
  status: string;
  reviewNotes: string | null;
  publishedAt: string | null;
  createdAt: string;
  briefing: { id: string; title: string } | null;
}

interface Seeding {
  id: string;
  status: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  product: { name: string; imageUrl: string | null } | null;
  briefing: { title: string } | null;
}

export default function PublicContentPage() {
  const params = useParams();
  const slug = params.slug as string;
  const code = params.code as string;

  const [darkMode, setDarkMode] = useState(true);
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [seedings, setSeedings] = useState<Seeding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Password state
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [authenticatedPassword, setAuthenticatedPassword] = useState<string | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [expandedBriefId, setExpandedBriefId] = useState<string | null>(null);
  const [form, setForm] = useState({
    contentUrl: "", type: "REEL", platform: "INSTAGRAM", caption: "", notes: "", briefingId: "",
  });

  const fetchData = useCallback(() => {
    const passQs = authenticatedPassword ? `?password=${encodeURIComponent(authenticatedPassword)}` : "";
    fetch(`/api/public/influencers/${slug}/${code}/content${passQs}`)
      .then((r) => {
        if (r.status === 401) {
          setRequiresPassword(true);
          setLoading(false);
          return null;
        }
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => {
        if (!d) return;
        setBriefings(d.briefings || []);
        setSubmissions(d.submissions || []);
        setSeedings(d.seedings || []);
        setRequiresPassword(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [slug, code, authenticatedPassword]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    try {
      const res = await fetch(`/api/public/influencers/${slug}/${code}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = await res.json();
      if (result.valid) {
        setLoading(true);
        setAuthenticatedPassword(password);
        setRequiresPassword(false);
      } else {
        setPasswordError(true);
      }
    } catch {
      setPasswordError(true);
    }
  };

  const handleSubmit = async () => {
    if (!form.contentUrl) return;
    setSubmitting(true);
    try {
      await fetch(`/api/public/influencers/${slug}/${code}/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          password: authenticatedPassword,
          briefingId: form.briefingId || null,
        }),
      });
      setSubmitted(true);
      setForm({ contentUrl: "", type: "REEL", platform: "INSTAGRAM", caption: "", notes: "", briefingId: "" });
      setTimeout(() => { setSubmitted(false); setShowForm(false); fetchData(); }, 2000);
    } finally {
      setSubmitting(false);
    }
  };

  // Theme
  const bg = darkMode ? "bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950" : "bg-gradient-to-br from-gray-50 via-white to-gray-100";
  const textPrimary = darkMode ? "text-white" : "text-gray-900";
  const textSecondary = darkMode ? "text-gray-400" : "text-gray-500";
  const textMuted = darkMode ? "text-gray-500" : "text-gray-400";
  const card = darkMode ? "bg-white/5 backdrop-blur-sm border border-white/10" : "bg-white border border-gray-200 shadow-sm";
  const inputBg = darkMode ? "bg-white/5 border-white/10 text-white placeholder-gray-500" : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400";

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      PENDING: darkMode ? "bg-yellow-500/20 text-yellow-400" : "bg-yellow-50 text-yellow-700",
      APPROVED: darkMode ? "bg-green-500/20 text-green-400" : "bg-green-50 text-green-700",
      REVISION: darkMode ? "bg-orange-500/20 text-orange-400" : "bg-orange-50 text-orange-700",
      REJECTED: darkMode ? "bg-red-500/20 text-red-400" : "bg-red-50 text-red-700",
    };
    return map[status] || (darkMode ? "bg-white/10 text-gray-400" : "bg-gray-50 text-gray-500");
  };

  const seedingStatus = (status: string) => {
    const map: Record<string, { label: string; color: string }> = {
      PENDING: { label: "Preparando", color: "text-yellow-400" },
      SHIPPED: { label: "En camino", color: "text-blue-400" },
      DELIVERED: { label: "Entregado", color: "text-green-400" },
      CONTENT_RECEIVED: { label: "Completado", color: "text-purple-400" },
    };
    return map[status] || { label: status, color: "text-gray-400" };
  };

  if (loading) {
    return (
      <div className={`min-h-screen ${bg} flex items-center justify-center`}>
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
          <p className={`${textSecondary} text-sm font-mono`}>Cargando...</p>
        </div>
      </div>
    );
  }

  if (requiresPassword) {
    return (
      <div className={`min-h-screen ${bg} flex items-center justify-center px-4`}>
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <p className="text-3xl mb-2">📋</p>
            <h1 className={`text-lg font-bold ${textPrimary}`}>Portal de Contenido</h1>
            <p className={`text-sm ${textMuted} mt-1`}>Ingresa tu contraseña para continuar</p>
          </div>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setPasswordError(false); }}
              placeholder="Contraseña"
              className={`w-full px-4 py-3 ${inputBg} border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30`}
              autoFocus
            />
            {passwordError && <p className="text-red-400 text-xs text-center">Contraseña incorrecta</p>}
            <button type="submit" className="w-full py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl text-sm font-medium">
              Ingresar
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`min-h-screen ${bg} flex items-center justify-center`}>
        <p className={`${textSecondary}`}>No pudimos cargar el portal. Verifica el link.</p>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${bg} ${textPrimary}`}>
      <header className="px-4 pt-6 pb-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Mi Contenido</h1>
            <p className={`text-xs ${textMuted}`}>Briefs, envios y contenido</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/i/${slug}/${code}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${darkMode ? "bg-white/10 text-white hover:bg-white/20" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
            >
              Dashboard
            </Link>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${darkMode ? "bg-white/10 hover:bg-white/20" : "bg-gray-100 hover:bg-gray-200"}`}
            >
              {darkMode ? "☀️" : "🌙"}
            </button>
          </div>
        </div>
      </header>

      <main className="px-4 pb-8">
        <div className="max-w-lg mx-auto space-y-4">

          {/* ── Active Briefings ── */}
          {briefings.length > 0 && (
            <div className={`${card} rounded-2xl p-5`}>
              <p className={`text-xs ${textSecondary} uppercase tracking-wider font-medium mb-3`}>Briefs activos</p>
              <div className="space-y-3">
                {briefings.map((b) => (
                  <div key={b.id}>
                    <div
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => setExpandedBriefId(expandedBriefId === b.id ? null : b.id)}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          darkMode ? "bg-orange-500/20 text-orange-400" : "bg-orange-50 text-orange-700"
                        }`}>{b.type}</span>
                        <span className="text-sm font-medium">{b.title}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {b.deadline && (
                          <span className={`text-[10px] ${textMuted} font-mono`}>
                            {new Date(b.deadline).toLocaleDateString("es-AR")}
                          </span>
                        )}
                        <svg className={`w-3.5 h-3.5 ${textMuted} transition-transform ${expandedBriefId === b.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </div>
                    </div>

                    {expandedBriefId === b.id && (
                      <div className={`mt-3 pl-2 border-l-2 ${darkMode ? "border-orange-500/30" : "border-orange-200"} space-y-2`}>
                        <p className={`text-xs ${textSecondary} whitespace-pre-wrap`}>{b.description}</p>
                        {b.dos && <p className="text-xs text-green-400">✓ {b.dos}</p>}
                        {b.donts && <p className="text-xs text-red-400">✗ {b.donts}</p>}
                        {b.hashtags && <p className="text-xs text-orange-400">{b.hashtags}</p>}
                        {b.mentions && <p className="text-xs text-blue-400">{b.mentions}</p>}
                        {b.requirements && <p className={`text-[10px] ${textMuted}`}>Req: {b.requirements}</p>}
                        {b.referenceUrls && (
                          <div>
                            <p className={`text-[10px] ${textMuted} mb-1`}>Referencias:</p>
                            {b.referenceUrls.split("\n").filter(Boolean).map((url, i) => (
                              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block text-[10px] text-orange-400 hover:text-orange-300 truncate">
                                {url}
                              </a>
                            ))}
                          </div>
                        )}
                        <button
                          onClick={() => { setForm({ ...form, briefingId: b.id }); setShowForm(true); }}
                          className="mt-2 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-medium hover:bg-orange-600"
                        >
                          Subir contenido para este brief
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Product Seedings ── */}
          {seedings.length > 0 && (
            <div className={`${card} rounded-2xl p-5`}>
              <p className={`text-xs ${textSecondary} uppercase tracking-wider font-medium mb-3`}>Productos recibidos</p>
              <div className="space-y-3">
                {seedings.map((s) => (
                  <div key={s.id} className="flex items-center gap-3">
                    {s.product?.imageUrl ? (
                      <img src={s.product.imageUrl} alt="" className="w-9 h-9 rounded-lg object-cover" />
                    ) : (
                      <div className={`w-9 h-9 rounded-lg ${darkMode ? "bg-white/10" : "bg-gray-100"} flex items-center justify-center text-xs`}>📦</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.product?.name || "Producto"}</p>
                      {s.briefing && <p className={`text-[10px] ${textMuted}`}>Brief: {s.briefing.title}</p>}
                    </div>
                    <span className={`text-xs font-medium ${seedingStatus(s.status).color}`}>
                      {seedingStatus(s.status).label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Submit Content Button ── */}
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="w-full py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-2xl text-sm font-medium hover:from-orange-600 hover:to-orange-700 transition-all"
            >
              + Subir contenido
            </button>
          )}

          {/* ── Submit Form ── */}
          {showForm && (
            <div className={`${card} rounded-2xl p-5 space-y-3`}>
              <p className={`text-xs ${textSecondary} uppercase tracking-wider font-medium`}>Subir contenido</p>

              {submitted ? (
                <div className="text-center py-6">
                  <p className="text-3xl mb-2">✓</p>
                  <p className="text-sm font-medium text-green-400">Contenido enviado!</p>
                  <p className={`text-xs ${textMuted} mt-1`}>El equipo lo va a revisar pronto</p>
                </div>
              ) : (
                <>
                  <input
                    value={form.contentUrl}
                    onChange={(e) => setForm({ ...form, contentUrl: e.target.value })}
                    placeholder="URL del contenido publicado *"
                    className={`w-full px-3 py-2 ${inputBg} border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30`}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <select
                      value={form.type}
                      onChange={(e) => setForm({ ...form, type: e.target.value })}
                      className={`w-full px-3 py-2 ${inputBg} border rounded-xl text-sm`}
                    >
                      {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <select
                      value={form.platform}
                      onChange={(e) => setForm({ ...form, platform: e.target.value })}
                      className={`w-full px-3 py-2 ${inputBg} border rounded-xl text-sm`}
                    >
                      {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                  <textarea
                    value={form.caption}
                    onChange={(e) => setForm({ ...form, caption: e.target.value })}
                    placeholder="Caption que usaste (opcional)"
                    className={`w-full px-3 py-2 ${inputBg} border rounded-xl text-sm resize-none`}
                    style={{ minHeight: "60px" }}
                  />
                  <input
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Notas para el equipo (opcional)"
                    className={`w-full px-3 py-2 ${inputBg} border rounded-xl text-sm`}
                  />

                  {briefings.length > 0 && !form.briefingId && (
                    <select
                      value={form.briefingId}
                      onChange={(e) => setForm({ ...form, briefingId: e.target.value })}
                      className={`w-full px-3 py-2 ${inputBg} border rounded-xl text-sm`}
                    >
                      <option value="">Sin brief asociado</option>
                      {briefings.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
                    </select>
                  )}

                  {form.briefingId && (
                    <p className={`text-xs ${textMuted}`}>
                      Brief: {briefings.find((b) => b.id === form.briefingId)?.title}
                      <button onClick={() => setForm({ ...form, briefingId: "" })} className="ml-2 text-orange-400">cambiar</button>
                    </p>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={handleSubmit}
                      disabled={submitting || !form.contentUrl}
                      className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 disabled:opacity-50"
                    >
                      {submitting ? "Enviando..." : "Enviar contenido"}
                    </button>
                    <button
                      onClick={() => { setShowForm(false); setForm({ contentUrl: "", type: "REEL", platform: "INSTAGRAM", caption: "", notes: "", briefingId: "" }); }}
                      className={`px-4 py-2.5 rounded-xl text-sm ${darkMode ? "bg-white/10 text-gray-300" : "bg-gray-100 text-gray-600"}`}
                    >
                      Cancelar
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Submission History ── */}
          {submissions.length > 0 && (
            <div className={`${card} rounded-2xl p-5`}>
              <p className={`text-xs ${textSecondary} uppercase tracking-wider font-medium mb-3`}>Mis envios</p>
              <div className="space-y-3">
                {submissions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] ${textMuted}`}>{s.platform} · {s.type}</span>
                        {s.briefing && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${darkMode ? "bg-blue-500/20 text-blue-400" : "bg-blue-50 text-blue-600"}`}>
                            {s.briefing.title}
                          </span>
                        )}
                      </div>
                      <a href={s.contentUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-orange-400 truncate block mt-0.5">
                        {s.contentUrl}
                      </a>
                      {s.reviewNotes && (
                        <p className={`text-[10px] mt-1 ${
                          s.status === "APPROVED" ? "text-green-400" :
                          s.status === "REVISION" ? "text-orange-400" :
                          s.status === "REJECTED" ? "text-red-400" : textMuted
                        }`}>Feedback: {s.reviewNotes}</p>
                      )}
                    </div>
                    <span className={`ml-3 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${statusBadge(s.status)}`}>
                      {s.status === "PENDING" ? "En revision" :
                       s.status === "APPROVED" ? "Aprobado" :
                       s.status === "REVISION" ? "Ajustar" :
                       s.status === "REJECTED" ? "Rechazado" : s.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {briefings.length === 0 && submissions.length === 0 && seedings.length === 0 && !showForm && (
            <div className={`${card} rounded-2xl p-8 text-center`}>
              <p className="text-3xl mb-2">📋</p>
              <p className={`text-sm ${textSecondary}`}>Todavia no hay briefs ni contenido</p>
              <p className={`text-xs ${textMuted} mt-1`}>Cuando el equipo te asigne un brief o quieras subir contenido, todo va a aparecer aca</p>
            </div>
          )}

          {/* Footer */}
          <div className="text-center pt-4">
            <p className={`text-[10px] ${darkMode ? "text-gray-700" : "text-gray-400"}`}>
              Powered by <span className="text-orange-500 font-medium">NitroSales</span>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
