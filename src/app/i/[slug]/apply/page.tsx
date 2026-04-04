"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

// ══════════════════════════════════════════════════════════════
// Public Influencer Application Form — NO LOGIN REQUIRED
// ══════════════════════════════════════════════════════════════
// URL: /i/[org_slug]/apply
// ══════════════════════════════════════════════════════════════

const FOLLOWER_RANGES = [
  "1K - 10K",
  "10K - 50K",
  "50K - 100K",
  "100K - 500K",
  "500K+",
];

export default function InfluencerApplyPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [darkMode, setDarkMode] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    email: "",
    instagram: "",
    tiktok: "",
    youtube: "",
    followers: "",
    message: "",
  });

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email) {
      setError("Nombre y email son requeridos");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/public/influencers/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...form }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al enviar");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Error de conexion. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  // Theme classes
  const bg = darkMode
    ? "bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950"
    : "bg-gradient-to-br from-gray-50 via-white to-gray-100";
  const textPrimary = darkMode ? "text-white" : "text-gray-900";
  const textSecondary = darkMode ? "text-gray-400" : "text-gray-500";
  const textMuted = darkMode ? "text-gray-500" : "text-gray-400";
  const card = darkMode
    ? "bg-white/5 backdrop-blur-sm border border-white/10"
    : "bg-white border border-gray-200 shadow-sm";
  const inputClass = darkMode
    ? "bg-white/5 border-white/10 text-white placeholder-gray-500 focus:ring-orange-500/30 focus:border-orange-500/50"
    : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:ring-orange-500/30 focus:border-orange-500/50";

  // ── Success screen ──
  if (submitted) {
    return (
      <div className={`min-h-screen ${bg} ${textPrimary} flex items-center justify-center px-4 transition-colors duration-300`}>
        <div className="max-w-sm w-full text-center">
          <div className="text-6xl mb-6">🎉</div>
          <h1 className="text-2xl font-bold mb-3">Aplicacion enviada!</h1>
          <p className={`${textSecondary} text-sm mb-6`}>
            Gracias por tu interes. Vamos a revisar tu perfil y te contactamos pronto por email.
          </p>
          <div className={`${card} rounded-2xl p-4 text-left`}>
            <p className={`text-xs ${textMuted} mb-1`}>Enviaste tu aplicacion como:</p>
            <p className="text-sm font-medium">{form.name}</p>
            <p className={`text-xs ${textSecondary}`}>{form.email}</p>
          </div>
          <p className={`text-[10px] ${textMuted} mt-8`}>
            Powered by <span className="text-orange-500 font-medium">NitroSales</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${bg} ${textPrimary} transition-colors duration-300`}>
      {/* Header */}
      <header className="px-4 pt-6 pb-2 sm:px-6">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Quiero ser embajador/a</h1>
            <p className={`text-xs ${textMuted} mt-0.5`}>Completa el formulario para aplicar</p>
          </div>
          <button
            onClick={() => setDarkMode(!darkMode)}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all ${
              darkMode ? "bg-white/10 hover:bg-white/20" : "bg-gray-100 hover:bg-gray-200"
            }`}
          >
            {darkMode ? "☀️" : "🌙"}
          </button>
        </div>
      </header>

      {/* Form */}
      <main className="px-4 pb-8 sm:px-6">
        <div className="max-w-lg mx-auto">
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            {/* Name + Email */}
            <div className={`${card} rounded-2xl p-5 space-y-4`}>
              <div>
                <label className={`text-xs ${textMuted} uppercase tracking-wider font-medium`}>
                  Nombre *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                  placeholder="Tu nombre completo"
                  className={`w-full mt-1 px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 ${inputClass}`}
                  required
                />
              </div>
              <div>
                <label className={`text-xs ${textMuted} uppercase tracking-wider font-medium`}>
                  Email *
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => handleChange("email", e.target.value)}
                  placeholder="tu@email.com"
                  className={`w-full mt-1 px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 ${inputClass}`}
                  required
                />
              </div>
            </div>

            {/* Social Networks */}
            <div className={`${card} rounded-2xl p-5 space-y-4`}>
              <p className={`text-xs ${textMuted} uppercase tracking-wider font-medium`}>Redes sociales</p>
              <div>
                <label className={`text-xs ${textSecondary}`}>Instagram</label>
                <input
                  type="text"
                  value={form.instagram}
                  onChange={(e) => handleChange("instagram", e.target.value)}
                  placeholder="@tu_usuario"
                  className={`w-full mt-1 px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 ${inputClass}`}
                />
              </div>
              <div>
                <label className={`text-xs ${textSecondary}`}>TikTok</label>
                <input
                  type="text"
                  value={form.tiktok}
                  onChange={(e) => handleChange("tiktok", e.target.value)}
                  placeholder="@tu_usuario"
                  className={`w-full mt-1 px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 ${inputClass}`}
                />
              </div>
              <div>
                <label className={`text-xs ${textSecondary}`}>YouTube</label>
                <input
                  type="text"
                  value={form.youtube}
                  onChange={(e) => handleChange("youtube", e.target.value)}
                  placeholder="URL de tu canal"
                  className={`w-full mt-1 px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 ${inputClass}`}
                />
              </div>
            </div>

            {/* Followers + Message */}
            <div className={`${card} rounded-2xl p-5 space-y-4`}>
              <div>
                <label className={`text-xs ${textMuted} uppercase tracking-wider font-medium`}>
                  Seguidores totales
                </label>
                <select
                  value={form.followers}
                  onChange={(e) => handleChange("followers", e.target.value)}
                  className={`w-full mt-1 px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 ${inputClass} ${!form.followers ? (darkMode ? "text-gray-500" : "text-gray-400") : ""}`}
                >
                  <option value="">Selecciona un rango</option>
                  {FOLLOWER_RANGES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={`text-xs ${textMuted} uppercase tracking-wider font-medium`}>
                  Por que queres ser embajador/a?
                </label>
                <textarea
                  value={form.message}
                  onChange={(e) => handleChange("message", e.target.value)}
                  placeholder="Contanos por que te gustaria representar esta marca..."
                  rows={3}
                  className={`w-full mt-1 px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 resize-none ${inputClass}`}
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <p className="text-red-400 text-sm text-center">{error}</p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl text-sm font-medium hover:from-orange-600 hover:to-orange-700 transition-all disabled:opacity-50"
            >
              {loading ? "Enviando..." : "Enviar aplicacion"}
            </button>
          </form>

          {/* Footer */}
          <div className="text-center pt-6">
            <p className={`text-[10px] ${textMuted}`}>
              Powered by <span className="text-orange-500 font-medium">NitroSales</span>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
