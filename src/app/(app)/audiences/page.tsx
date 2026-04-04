"use client";

import { useEffect, useState, useCallback } from "react";

// ══════════════════════════════════════════════════════════════
// AUDIENCE SYNC — Admin UI
// ══════════════════════════════════════════════════════════════
// Basado en patrones de Triple Whale, Klaviyo, Hightouch
// Features:
// - Lista de audiencias con status, health metrics, last sync
// - Audience builder con segment criteria
// - Preview en tiempo real (customer count, data completeness)
// - Sync manual con feedback visual
// - Platform badges (Meta/Google/Both)

// ─── Types ───

interface Audience {
  id: string;
  name: string;
  description: string | null;
  platform: string;
  status: string;
  segmentType: string;
  segmentCriteria: any;
  customerCount: number;
  lastSyncedCount: number;
  metaAudienceId: string | null;
  googleListId: string | null;
  metaMatchRate: number | null;
  googleMatchRate: number | null;
  autoSync: boolean;
  syncFrequency: string;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  nextSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastSync: any | null;
}

interface AudiencePreview {
  totalCustomers: number;
  withEmail: number;
  withPhone: number;
  withName: number;
  withCity: number;
  estimatedMetaMatch: number;
  estimatedGoogleMatch: number;
  segmentBreakdown: Record<string, number>;
  topCities: Array<{ city: string; count: number }>;
  avgOrderValue: number;
  avgLifetimeOrders: number;
}

interface Summary {
  totalAudiences: number;
  activeAudiences: number;
  totalCustomersSynced: number;
  platformBreakdown: { meta: number; google: number };
  syncEnabled: boolean;
}

// ─── RFM Segment Options ───

const RFM_SEGMENTS = [
  { id: "Champions", label: "Champions", color: "#22c55e", desc: "Alta frecuencia, compra reciente" },
  { id: "Leales", label: "Leales", color: "#3b82f6", desc: "Alta frecuencia, no tan reciente" },
  { id: "Potenciales", label: "Potenciales", color: "#a855f7", desc: "Buen potencial de crecimiento" },
  { id: "Nuevos", label: "Nuevos", color: "#06b6d4", desc: "Primera compra reciente" },
  { id: "Ocasionales", label: "Ocasionales", color: "#eab308", desc: "Compra esporádica" },
  { id: "En riesgo", label: "En riesgo", color: "#f97316", desc: "Antes activos, ahora inactivos" },
  { id: "Perdidos", label: "Perdidos", color: "#ef4444", desc: "Sin actividad hace 6+ meses" },
];

const LTV_BUCKETS = [
  { id: "high_value", label: "Alto Valor", color: "#22c55e" },
  { id: "medium_value", label: "Valor Medio", color: "#eab308" },
  { id: "low_value", label: "Bajo Valor", color: "#ef4444" },
];

const PLATFORM_OPTIONS = [
  { id: "META", label: "Meta Ads", icon: "📘" },
  { id: "GOOGLE", label: "Google Ads", icon: "🔍" },
  { id: "BOTH", label: "Ambos", icon: "🔗" },
];

const SYNC_FREQUENCIES = [
  { id: "MANUAL", label: "Manual" },
  { id: "DAILY", label: "Diario" },
  { id: "WEEKLY", label: "Semanal" },
];

// ─── Component ───

export default function AudienceSyncPage() {
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

  // Builder state
  const [builderName, setBuilderName] = useState("");
  const [builderDesc, setBuilderDesc] = useState("");
  const [builderPlatform, setBuilderPlatform] = useState("BOTH");
  const [builderSegmentType, setBuilderSegmentType] = useState("RFM");
  const [builderRfmSegments, setBuilderRfmSegments] = useState<string[]>([]);
  const [builderLtvBuckets, setBuilderLtvBuckets] = useState<string[]>([]);
  const [builderMinOrders, setBuilderMinOrders] = useState<string>("");
  const [builderMinSpent, setBuilderMinSpent] = useState<string>("");
  const [builderRecencyMax, setBuilderRecencyMax] = useState<string>("");
  const [builderAutoSync, setBuilderAutoSync] = useState(false);
  const [builderSyncFreq, setBuilderSyncFreq] = useState("DAILY");
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // ─── Fetch audiences ───

  const fetchAudiences = useCallback(async () => {
    try {
      const res = await fetch("/api/audiences");
      const data = await res.json();
      setAudiences(data.audiences || []);
      setSummary(data.summary || null);
    } catch (e) {
      console.error("Failed to fetch audiences:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAudiences();
  }, [fetchAudiences]);

  // ─── Build criteria from builder state ───

  const buildCriteria = useCallback(() => {
    const criteria: any = {};
    if (builderSegmentType === "RFM" && builderRfmSegments.length > 0) {
      criteria.rfmSegments = builderRfmSegments;
    }
    if ((builderSegmentType === "LTV" || builderSegmentType === "CUSTOM") && builderLtvBuckets.length > 0) {
      criteria.ltvBuckets = builderLtvBuckets;
    }
    if (builderMinOrders) criteria.minOrders = parseInt(builderMinOrders);
    if (builderMinSpent) criteria.minSpent = parseInt(builderMinSpent);
    if (builderRecencyMax) criteria.recencyDaysMax = parseInt(builderRecencyMax);
    return criteria;
  }, [builderSegmentType, builderRfmSegments, builderLtvBuckets, builderMinOrders, builderMinSpent, builderRecencyMax]);

  // ─── Preview ───

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const criteria = buildCriteria();
      const res = await fetch("/api/audiences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", segmentCriteria: criteria }),
      });
      const data = await res.json();
      setPreview(data.preview || null);
    } catch (e) {
      console.error("Preview failed:", e);
    } finally {
      setPreviewLoading(false);
    }
  }, [buildCriteria]);

  // Auto-preview when criteria change
  useEffect(() => {
    if (showBuilder) {
      const timer = setTimeout(loadPreview, 500);
      return () => clearTimeout(timer);
    }
  }, [showBuilder, builderRfmSegments, builderLtvBuckets, builderMinOrders, builderMinSpent, builderRecencyMax, builderSegmentType, loadPreview]);

  // ─── Save audience ───

  const saveAudience = async () => {
    if (!builderName.trim()) return;
    setSaving(true);
    try {
      const criteria = buildCriteria();
      const res = await fetch("/api/audiences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: builderName,
          description: builderDesc || null,
          platform: builderPlatform,
          segmentType: builderSegmentType,
          segmentCriteria: criteria,
          autoSync: builderAutoSync,
          syncFrequency: builderSyncFreq,
        }),
      });
      if (res.ok) {
        setShowBuilder(false);
        resetBuilder();
        fetchAudiences();
      }
    } catch (e) {
      console.error("Save failed:", e);
    } finally {
      setSaving(false);
    }
  };

  const resetBuilder = () => {
    setBuilderName("");
    setBuilderDesc("");
    setBuilderPlatform("BOTH");
    setBuilderSegmentType("RFM");
    setBuilderRfmSegments([]);
    setBuilderLtvBuckets([]);
    setBuilderMinOrders("");
    setBuilderMinSpent("");
    setBuilderRecencyMax("");
    setBuilderAutoSync(false);
    setBuilderSyncFreq("DAILY");
    setPreview(null);
  };

  // ─── Sync audience ───

  const syncAudience = async (audienceId: string) => {
    setSyncing(audienceId);
    try {
      const res = await fetch("/api/audiences/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audienceId }),
      });
      const data = await res.json();
      if (!data.success) {
        console.error("Sync result:", data);
      }
      fetchAudiences();
    } catch (e) {
      console.error("Sync failed:", e);
    } finally {
      setSyncing(null);
    }
  };

  // ─── Delete audience ───

  const deleteAudience = async (id: string) => {
    try {
      await fetch(`/api/audiences?id=${id}`, { method: "DELETE" });
      fetchAudiences();
    } catch (e) {
      console.error("Delete failed:", e);
    }
  };

  // ─── Toggle segment selection ───

  const toggleRfmSegment = (id: string) => {
    setBuilderRfmSegments((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleLtvBucket = (id: string) => {
    setBuilderLtvBuckets((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // ─── Helpers ───

  const formatDate = (d: string | null) => {
    if (!d) return "Nunca";
    return new Date(d).toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "ACTIVE": return "#22c55e";
      case "SYNCING": return "#3b82f6";
      case "DRAFT": return "#6b7280";
      case "PAUSED": return "#eab308";
      case "ERROR": return "#ef4444";
      default: return "#6b7280";
    }
  };

  const platformLabel = (p: string) => {
    switch (p) {
      case "META": return "Meta";
      case "GOOGLE": return "Google";
      case "BOTH": return "Meta + Google";
      default: return p;
    }
  };

  // ─── Render ───

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-400 text-sm">Cargando audiencias...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <span className="text-3xl">📡</span>
            Audience Sync
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Sincroniza segmentos de clientes con Meta Custom Audiences y Google Customer Match
          </p>
        </div>
        <button
          onClick={() => setShowBuilder(!showBuilder)}
          className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
          style={{
            background: showBuilder ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg, #8b5cf6, #6366f1)",
            color: "#fff",
          }}
        >
          {showBuilder ? "✕ Cerrar" : "+ Nueva Audiencia"}
        </button>
      </div>

      {/* ─── Summary Cards ─── */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Audiencias", value: summary.totalAudiences, icon: "📊" },
            { label: "Activas", value: summary.activeAudiences, icon: "✅" },
            { label: "Clientes sincronizados", value: summary.totalCustomersSynced.toLocaleString(), icon: "👥" },
            { label: "Sync habilitado", value: summary.syncEnabled ? "Sí" : "No (env)", icon: summary.syncEnabled ? "🟢" : "🔴" },
          ].map((card, i) => (
            <div
              key={i}
              className="rounded-xl p-4"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <span>{card.icon}</span> {card.label}
              </div>
              <div className="text-2xl font-bold text-white mt-1">{card.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Audience Builder ─── */}
      {showBuilder && (
        <div
          className="rounded-xl p-6 space-y-5"
          style={{ background: "rgba(139,92,246,0.05)", border: "1px solid rgba(139,92,246,0.2)" }}
        >
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <span>🎯</span> Crear Audiencia
          </h2>

          {/* Row 1: Name + Platform */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1.5">Nombre</label>
              <input
                type="text"
                value={builderName}
                onChange={(e) => setBuilderName(e.target.value)}
                placeholder="Ej: Champions para Lookalike"
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1.5">Plataforma destino</label>
              <div className="flex gap-2">
                {PLATFORM_OPTIONS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setBuilderPlatform(p.id)}
                    className="flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all"
                    style={{
                      background: builderPlatform === p.id ? "rgba(139,92,246,0.3)" : "rgba(255,255,255,0.04)",
                      border: builderPlatform === p.id ? "1px solid rgba(139,92,246,0.5)" : "1px solid rgba(255,255,255,0.08)",
                      color: builderPlatform === p.id ? "#c4b5fd" : "#9ca3af",
                    }}
                  >
                    {p.icon} {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1.5">Descripción (opcional)</label>
            <input
              type="text"
              value={builderDesc}
              onChange={(e) => setBuilderDesc(e.target.value)}
              placeholder="Ej: Mejores clientes para crear audiencia lookalike en Meta"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}
            />
          </div>

          {/* Segment Type Tabs */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider block mb-2">Tipo de segmento</label>
            <div className="flex gap-2">
              {[
                { id: "RFM", label: "Segmentos RFM" },
                { id: "LTV", label: "Valor de Vida" },
                { id: "CUSTOM", label: "Personalizado" },
                { id: "ALL_CUSTOMERS", label: "Todos" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setBuilderSegmentType(t.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: builderSegmentType === t.id ? "rgba(139,92,246,0.3)" : "rgba(255,255,255,0.04)",
                    border: builderSegmentType === t.id ? "1px solid rgba(139,92,246,0.5)" : "1px solid rgba(255,255,255,0.08)",
                    color: builderSegmentType === t.id ? "#c4b5fd" : "#9ca3af",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* RFM Segment Picker */}
          {builderSegmentType === "RFM" && (
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider block mb-2">Seleccionar segmentos RFM</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {RFM_SEGMENTS.map((seg) => {
                  const selected = builderRfmSegments.includes(seg.id);
                  return (
                    <button
                      key={seg.id}
                      onClick={() => toggleRfmSegment(seg.id)}
                      className="p-3 rounded-lg text-left transition-all"
                      style={{
                        background: selected ? `${seg.color}15` : "rgba(255,255,255,0.03)",
                        border: selected ? `1px solid ${seg.color}50` : "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: seg.color }} />
                        <span className="text-sm font-medium" style={{ color: selected ? seg.color : "#d1d5db" }}>
                          {seg.label}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-1">{seg.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* LTV Bucket Picker */}
          {(builderSegmentType === "LTV" || builderSegmentType === "CUSTOM") && (
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider block mb-2">Segmentos de valor</label>
              <div className="grid grid-cols-3 gap-2">
                {LTV_BUCKETS.map((b) => {
                  const selected = builderLtvBuckets.includes(b.id);
                  return (
                    <button
                      key={b.id}
                      onClick={() => toggleLtvBucket(b.id)}
                      className="p-3 rounded-lg text-center transition-all"
                      style={{
                        background: selected ? `${b.color}15` : "rgba(255,255,255,0.03)",
                        border: selected ? `1px solid ${b.color}50` : "1px solid rgba(255,255,255,0.06)",
                        color: selected ? b.color : "#9ca3af",
                      }}
                    >
                      <span className="text-sm font-medium">{b.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Custom Filters (shown for CUSTOM and as additional for RFM/LTV) */}
          {builderSegmentType !== "ALL_CUSTOMERS" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1.5">Min. órdenes</label>
                <input
                  type="number"
                  value={builderMinOrders}
                  onChange={(e) => setBuilderMinOrders(e.target.value)}
                  placeholder="Ej: 2"
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1.5">Min. gasto total (ARS)</label>
                <input
                  type="number"
                  value={builderMinSpent}
                  onChange={(e) => setBuilderMinSpent(e.target.value)}
                  placeholder="Ej: 50000"
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1.5">Última compra (máx. días)</label>
                <input
                  type="number"
                  value={builderRecencyMax}
                  onChange={(e) => setBuilderRecencyMax(e.target.value)}
                  placeholder="Ej: 90"
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}
                />
              </div>
            </div>
          )}

          {/* Sync Config */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setBuilderAutoSync(!builderAutoSync)}
                className="w-10 h-5 rounded-full transition-all relative"
                style={{ background: builderAutoSync ? "#8b5cf6" : "rgba(255,255,255,0.15)" }}
              >
                <div
                  className="w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all"
                  style={{ left: builderAutoSync ? "22px" : "2px" }}
                />
              </button>
              <span className="text-sm text-gray-300">Auto-sync</span>
            </div>
            {builderAutoSync && (
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1.5">Frecuencia</label>
                <div className="flex gap-2">
                  {SYNC_FREQUENCIES.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setBuilderSyncFreq(f.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{
                        background: builderSyncFreq === f.id ? "rgba(139,92,246,0.3)" : "rgba(255,255,255,0.04)",
                        border: builderSyncFreq === f.id ? "1px solid rgba(139,92,246,0.5)" : "1px solid rgba(255,255,255,0.08)",
                        color: builderSyncFreq === f.id ? "#c4b5fd" : "#9ca3af",
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ─── Preview Panel ─── */}
          {preview && (
            <div
              className="rounded-lg p-4 space-y-3"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <span>👁</span> Preview
                </h3>
                {previewLoading && <span className="text-xs text-gray-500">Actualizando...</span>}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <div className="text-2xl font-bold text-white">{preview.totalCustomers.toLocaleString()}</div>
                  <div className="text-[10px] text-gray-500 uppercase">Clientes</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{preview.withEmail.toLocaleString()}</div>
                  <div className="text-[10px] text-gray-500 uppercase">Con email</div>
                </div>
                <div>
                  <div className="text-2xl font-bold" style={{ color: "#1877f2" }}>~{preview.estimatedMetaMatch.toLocaleString()}</div>
                  <div className="text-[10px] text-gray-500 uppercase">Est. match Meta</div>
                </div>
                <div>
                  <div className="text-2xl font-bold" style={{ color: "#4285f4" }}>~{preview.estimatedGoogleMatch.toLocaleString()}</div>
                  <div className="text-[10px] text-gray-500 uppercase">Est. match Google</div>
                </div>
              </div>

              {/* Segment breakdown */}
              {Object.keys(preview.segmentBreakdown).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(preview.segmentBreakdown).map(([seg, count]) => {
                    const segDef = RFM_SEGMENTS.find((s) => s.id === seg);
                    return (
                      <span
                        key={seg}
                        className="px-2 py-0.5 rounded text-[10px] font-medium"
                        style={{
                          background: `${segDef?.color || "#6b7280"}20`,
                          color: segDef?.color || "#9ca3af",
                          border: `1px solid ${segDef?.color || "#6b7280"}30`,
                        }}
                      >
                        {seg}: {count}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Data completeness */}
              <div className="flex gap-4 text-[10px] text-gray-500">
                <span>AOV: ${preview.avgOrderValue.toLocaleString()}</span>
                <span>Avg. órdenes: {preview.avgLifetimeOrders}</span>
                <span>Con nombre: {preview.withName} ({preview.totalCustomers > 0 ? Math.round(preview.withName / preview.totalCustomers * 100) : 0}%)</span>
                <span>Con ciudad: {preview.withCity} ({preview.totalCustomers > 0 ? Math.round(preview.withCity / preview.totalCustomers * 100) : 0}%)</span>
              </div>
            </div>
          )}

          {/* Save Button */}
          <div className="flex justify-end gap-3">
            <button
              onClick={() => { setShowBuilder(false); resetBuilder(); }}
              className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={saveAudience}
              disabled={!builderName.trim() || saving}
              className="px-6 py-2 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #8b5cf6, #6366f1)" }}
            >
              {saving ? "Guardando..." : "Crear Audiencia"}
            </button>
          </div>
        </div>
      )}

      {/* ─── Audience List ─── */}
      {audiences.length === 0 && !showBuilder ? (
        <div
          className="rounded-xl p-12 text-center"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="text-5xl mb-4">📡</div>
          <h3 className="text-lg font-semibold text-white">No hay audiencias creadas</h3>
          <p className="text-gray-400 text-sm mt-2 max-w-md mx-auto">
            Crea tu primera audiencia para sincronizar segmentos de clientes con Meta Custom Audiences o Google Customer Match.
          </p>
          <button
            onClick={() => setShowBuilder(true)}
            className="mt-4 px-6 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #8b5cf6, #6366f1)" }}
          >
            + Crear primera audiencia
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {audiences.map((audience) => (
            <div
              key={audience.id}
              className="rounded-xl p-4 transition-all hover:border-opacity-20"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {/* Name + Status + Platform */}
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-sm font-semibold text-white">{audience.name}</h3>
                    <span
                      className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                      style={{
                        background: `${statusColor(audience.status)}20`,
                        color: statusColor(audience.status),
                        border: `1px solid ${statusColor(audience.status)}30`,
                      }}
                    >
                      {audience.status}
                    </span>
                    <span
                      className="px-1.5 py-0.5 rounded text-[9px] font-medium uppercase"
                      style={{ background: "rgba(255,255,255,0.06)", color: "#9ca3af" }}
                    >
                      {platformLabel(audience.platform)}
                    </span>
                    {audience.autoSync && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-medium" style={{ background: "rgba(139,92,246,0.15)", color: "#a78bfa" }}>
                        AUTO {audience.syncFrequency}
                      </span>
                    )}
                  </div>
                  {audience.description && (
                    <p className="text-xs text-gray-500 mt-1">{audience.description}</p>
                  )}

                  {/* Metrics Row */}
                  <div className="flex items-center gap-5 mt-2 text-xs text-gray-400">
                    <span>👥 {audience.customerCount.toLocaleString()} clientes</span>
                    <span>📤 {audience.lastSyncedCount.toLocaleString()} enviados</span>
                    {audience.metaMatchRate !== null && (
                      <span style={{ color: "#1877f2" }}>Meta: {audience.metaMatchRate.toFixed(0)}%</span>
                    )}
                    {audience.googleMatchRate !== null && (
                      <span style={{ color: "#4285f4" }}>Google: {audience.googleMatchRate.toFixed(0)}%</span>
                    )}
                    <span>🕐 {formatDate(audience.lastSyncAt)}</span>
                  </div>
                  {audience.lastSyncError && (
                    <p className="text-[10px] text-red-400 mt-1">⚠ {audience.lastSyncError}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => syncAudience(audience.id)}
                    disabled={syncing === audience.id || audience.status === "SYNCING"}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-40"
                    style={{ background: "linear-gradient(135deg, #8b5cf6, #6366f1)" }}
                  >
                    {syncing === audience.id || audience.status === "SYNCING" ? "⟳ Sincronizando..." : "⚡ Sync"}
                  </button>
                  <button
                    onClick={() => deleteAudience(audience.id)}
                    className="px-2 py-1.5 rounded-lg text-xs text-gray-500 hover:text-red-400 transition-colors"
                    style={{ background: "rgba(255,255,255,0.04)" }}
                  >
                    🗑
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Info Banner ─── */}
      {summary && !summary.syncEnabled && (
        <div
          className="rounded-xl p-4 flex items-start gap-3"
          style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.2)" }}
        >
          <span className="text-lg">⚠️</span>
          <div>
            <p className="text-sm text-yellow-200 font-medium">Sync deshabilitado</p>
            <p className="text-xs text-yellow-200/60 mt-0.5">
              Para activar la sincronización real con Meta y Google, configurar <code className="text-yellow-300">AUDIENCE_SYNC_ENABLED=true</code> en las variables de entorno de Vercel, junto con las credenciales de Meta Ads y Google Ads.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
