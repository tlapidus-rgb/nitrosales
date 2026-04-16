"use client";

import { useEffect, useState, useCallback } from "react";

// ══════════════════════════════════════════════════════════════
// AUDIENCE SYNC — UI World-Class v2
// ══════════════════════════════════════════════════════════════

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

// ─── Segment definitions with rich descriptions ───

const RFM_SEGMENTS = [
  {
    id: "Champions",
    label: "Champions",
    color: "#22c55e",
    icon: "🏆",
    desc: "Compran seguido y hace poco",
    detail: "Clientes que compraron 4+ veces y su ultima compra fue hace menos de 30 dias. Son tus mejores clientes.",
    useCase: "Ideales para Lookalike Audiences: Meta usa estos perfiles para encontrar personas similares que aun no te conocen.",
  },
  {
    id: "Leales",
    label: "Leales",
    color: "#3b82f6",
    icon: "💎",
    desc: "Compran mucho, pero no tan reciente",
    detail: "4+ compras totales, pero su ultima compra fue hace mas de 30 dias. Siguen fieles pero hay que reactivarlos.",
    useCase: "Perfectos para campanas de retargeting: 'Hace tiempo que no nos visitas, mira lo nuevo que tenemos'.",
  },
  {
    id: "Potenciales",
    label: "Potenciales",
    color: "#a855f7",
    icon: "🚀",
    desc: "2+ compras recientes, en crecimiento",
    detail: "Compraron 2+ veces en los ultimos 60 dias. Estan en camino a ser Champions si los nutris bien.",
    useCase: "Envialos a Meta/Google para campanas de cross-sell y upsell con productos complementarios.",
  },
  {
    id: "Nuevos",
    label: "Nuevos",
    color: "#06b6d4",
    icon: "✨",
    desc: "Primera compra reciente",
    detail: "Hicieron su primera (y unica) compra en los ultimos 30 dias. Primer contacto con tu marca.",
    useCase: "Excluirlos de campanas de adquisicion (ya compraron) y incluirlos en campanas de segunda compra.",
  },
  {
    id: "Ocasionales",
    label: "Ocasionales",
    color: "#eab308",
    icon: "🔄",
    desc: "Compra esporadica, sin patron claro",
    detail: "Compran de vez en cuando, sin frecuencia predecible. No son nuevos ni estan en riesgo.",
    useCase: "Buenos para campanas de incentivo: descuentos exclusivos, free shipping, o bundles especiales.",
  },
  {
    id: "En riesgo",
    label: "En riesgo",
    color: "#f97316",
    icon: "⚠️",
    desc: "Antes activos, ahora 90+ dias sin comprar",
    detail: "Compraron 2+ veces pero llevan mas de 90 dias sin actividad. Se estan yendo.",
    useCase: "Campanas de win-back urgentes: 'Te extranamos', con descuento agresivo para recuperarlos.",
  },
  {
    id: "Perdidos",
    label: "Perdidos",
    color: "#ef4444",
    icon: "💤",
    desc: "Sin actividad hace 6+ meses",
    detail: "Compraron alguna vez pero llevan mas de 180 dias sin volver. Muy dificil de recuperar.",
    useCase: "Usarlos como exclusion: no gastes plata en ads para gente que ya no va a volver.",
  },
];

const LTV_BUCKETS = [
  {
    id: "high_value",
    label: "Alto Valor",
    color: "#22c55e",
    icon: "💰",
    detail: "Clientes con mayor valor predicho a 1 ano. NitroSales predice cuanto van a gastar basado en su historial.",
    useCase: "Lookalike Audiences: 'Encontra gente parecida a mis mejores clientes'.",
  },
  {
    id: "medium_value",
    label: "Valor Medio",
    color: "#eab308",
    icon: "📊",
    detail: "Clientes con potencial moderado. Con la estrategia correcta pueden subir a Alto Valor.",
    useCase: "Cross-sell y upsell: mostrarles productos de mayor ticket o complementarios.",
  },
  {
    id: "low_value",
    label: "Bajo Valor",
    color: "#ef4444",
    icon: "📉",
    detail: "Clientes con poco valor predicho. Compraron poco o productos de bajo ticket.",
    useCase: "Exclusion: no gastes presupuesto en ads dirigidos a este segmento.",
  },
];

// ─── Component ───

export default function AudienceSyncPage() {
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);

  // Builder state
  const [builderStep, setBuilderStep] = useState(0); // 0=closed, 1=segment, 2=platform, 3=config
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
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);

  // ─── Fetch ───

  const fetchAudiences = useCallback(async () => {
    try {
      const res = await fetch("/api/audiences");
      const data = await res.json();
      setAudiences(data.audiences || []);
      setSummary(data.summary || null);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAudiences(); }, [fetchAudiences]);

  // ─── Build criteria ───

  const buildCriteria = useCallback(() => {
    const c: any = {};
    if (builderSegmentType === "RFM" && builderRfmSegments.length > 0) c.rfmSegments = builderRfmSegments;
    if ((builderSegmentType === "LTV" || builderSegmentType === "CUSTOM") && builderLtvBuckets.length > 0) c.ltvBuckets = builderLtvBuckets;
    if (builderMinOrders) c.minOrders = parseInt(builderMinOrders);
    if (builderMinSpent) c.minSpent = parseInt(builderMinSpent);
    if (builderRecencyMax) c.recencyDaysMax = parseInt(builderRecencyMax);
    return c;
  }, [builderSegmentType, builderRfmSegments, builderLtvBuckets, builderMinOrders, builderMinSpent, builderRecencyMax]);

  // ─── Preview ───

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/audiences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", segmentCriteria: buildCriteria() }),
      });
      const data = await res.json();
      setPreview(data.preview || null);
    } catch (e) { console.error(e); }
    finally { setPreviewLoading(false); }
  }, [buildCriteria]);

  useEffect(() => {
    if (builderStep >= 1) {
      const t = setTimeout(loadPreview, 600);
      return () => clearTimeout(t);
    }
  }, [builderStep, builderRfmSegments, builderLtvBuckets, builderMinOrders, builderMinSpent, builderRecencyMax, builderSegmentType, loadPreview]);

  // ─── Save ───

  const saveAudience = async () => {
    if (!builderName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/audiences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: builderName,
          description: builderDesc || null,
          platform: builderPlatform,
          segmentType: builderSegmentType,
          segmentCriteria: buildCriteria(),
          autoSync: builderAutoSync,
          syncFrequency: builderSyncFreq,
        }),
      });
      if (res.ok) {
        setBuilderStep(0);
        resetBuilder();
        fetchAudiences();
      }
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const resetBuilder = () => {
    setBuilderName(""); setBuilderDesc(""); setBuilderPlatform("BOTH");
    setBuilderSegmentType("RFM"); setBuilderRfmSegments([]); setBuilderLtvBuckets([]);
    setBuilderMinOrders(""); setBuilderMinSpent(""); setBuilderRecencyMax("");
    setBuilderAutoSync(false); setBuilderSyncFreq("DAILY"); setPreview(null);
  };

  // ─── Sync ───

  const syncAudience = async (id: string) => {
    setSyncing(id);
    try {
      await fetch("/api/audiences/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audienceId: id }),
      });
      fetchAudiences();
    } catch (e) { console.error(e); }
    finally { setSyncing(null); }
  };

  const deleteAudience = async (id: string) => {
    try { await fetch(`/api/audiences?id=${id}`, { method: "DELETE" }); fetchAudiences(); } catch (e) { console.error(e); }
  };

  const toggleRfm = (id: string) => setBuilderRfmSegments(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const toggleLtv = (id: string) => setBuilderLtvBuckets(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const formatDate = (d: string | null) => {
    if (!d) return "Nunca";
    return new Date(d).toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const statusBadge = (s: string) => {
    const map: Record<string, { color: string; label: string }> = {
      ACTIVE: { color: "#22c55e", label: "Activa" },
      SYNCING: { color: "#3b82f6", label: "Sincronizando" },
      DRAFT: { color: "#6b7280", label: "Borrador" },
      PAUSED: { color: "#eab308", label: "Pausada" },
      ERROR: { color: "#ef4444", label: "Error" },
    };
    return map[s] || { color: "#6b7280", label: s };
  };

  // ─── Reusable: Glassmorphism card ───
  const glassCard = (extra?: string) => ({
    background: "rgba(255,255,255,0.025)",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(255,255,255,0.07)",
    ...(extra ? {} : {}),
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
          <span className="text-gray-400 text-sm">Cargando Audience Sync...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">

      {/* ═══════════════════════════════════════════
          HERO SECTION — Explica que es Audience Sync
          ═══════════════════════════════════════════ */}
      <div className="relative rounded-2xl overflow-hidden" style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(99,102,241,0.05) 50%, rgba(59,130,246,0.04) 100%)", border: "1px solid rgba(139,92,246,0.2)" }}>
        {/* Animated grid pattern */}
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, #8b5cf6 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
        {/* Glow orb */}
        <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full opacity-10" style={{ background: "radial-gradient(circle, #8b5cf6 0%, transparent 70%)" }} />

        <div className="relative px-8 py-8">
          <div className="flex items-start justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #8b5cf6, #6366f1)", boxShadow: "0 0 20px rgba(139,92,246,0.3)" }}>
                  <svg className="w-5 h-5" style={{ color: "#fff" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                </div>
                <div>
                  <h1 className="text-2xl font-bold" style={{ color: "#111827" }}>Audience Sync</h1>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest" style={{ background: "rgba(139,92,246,0.15)", color: "#7c3aed", border: "1px solid rgba(139,92,246,0.3)" }}>SYNC</span>
                </div>
              </div>

              <p className="text-sm leading-relaxed mb-4" style={{ color: "#374151" }}>
                Envia automaticamente listas de tus clientes a <strong style={{ color: "#1d4ed8" }}>Meta Ads</strong> y <strong style={{ color: "#1a73e8" }}>Google Ads</strong>. Asi las plataformas pueden encontrar personas similares a tus mejores compradores (Lookalike) o impactar directamente a tus clientes existentes (Retargeting).
              </p>

              {/* Visual flow diagram */}
              <div className="flex items-center gap-2 text-[11px] flex-wrap">
                <span className="px-2.5 py-1 rounded-lg font-semibold" style={{ background: "rgba(139,92,246,0.12)", color: "#6d28d9", border: "1px solid rgba(139,92,246,0.25)" }}>
                  Tus clientes en NitroSales
                </span>
                <svg className="w-4 h-4" style={{ color: "#8b5cf6" }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                <span className="px-2.5 py-1 rounded-lg font-semibold" style={{ background: "rgba(139,92,246,0.1)", color: "#7c3aed", border: "1px solid rgba(139,92,246,0.2)" }}>
                  Seleccionas un segmento
                </span>
                <svg className="w-4 h-4" style={{ color: "#8b5cf6" }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                <span className="px-2.5 py-1 rounded-lg font-semibold" style={{ background: "rgba(37,99,235,0.1)", color: "#1d4ed8", border: "1px solid rgba(37,99,235,0.2)" }}>
                  Se sube a Meta / Google
                </span>
                <svg className="w-4 h-4" style={{ color: "#3b82f6" }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                <span className="px-2.5 py-1 rounded-lg font-semibold" style={{ background: "rgba(22,163,74,0.1)", color: "#15803d", border: "1px solid rgba(22,163,74,0.2)" }}>
                  Usas la audiencia en tus campanas
                </span>
              </div>
            </div>

            <button
              onClick={() => setBuilderStep(builderStep > 0 ? 0 : 1)}
              className="flex-shrink-0 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: builderStep > 0 ? "rgba(107,114,128,0.1)" : "linear-gradient(135deg, #8b5cf6, #6366f1)", color: builderStep > 0 ? "#374151" : "#fff", boxShadow: builderStep > 0 ? "none" : "0 4px 20px rgba(139,92,246,0.35)" }}
            >
              {builderStep > 0 ? "Cerrar" : "+ Nueva Audiencia"}
            </button>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          HOW IT WORKS — 3 cards explicativos
          ═══════════════════════════════════════════ */}
      {audiences.length === 0 && builderStep === 0 && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold" style={{ color: "#111827" }}>Como funciona</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                num: "1",
                title: "Elegis un segmento de clientes",
                desc: "NitroSales ya clasifica a tus clientes en segmentos automaticamente segun su comportamiento de compra. Vos elegis cual querés enviar.",
                color: "#8b5cf6",
                example: "Ej: 'Champions' = los que mas compran y mas reciente compraron",
              },
              {
                num: "2",
                title: "Se sincroniza con Meta o Google",
                desc: "NitroSales envia los emails de esos clientes (encriptados) a Meta y/o Google. Las plataformas los cruzan con sus usuarios.",
                color: "#3b82f6",
                example: "Solo se envian emails hasheados. Ni Meta ni Google ven los datos crudos.",
              },
              {
                num: "3",
                title: "Usas las audiencias en tus campanas",
                desc: "Las audiencias aparecen en Meta Ads Manager y Google Ads. Podes crear Lookalikes, retargeting, o excluir segmentos.",
                color: "#22c55e",
                example: "Ej: Lookalike 1% de tus Champions = encontrar clientes similares",
              },
            ].map((step, i) => (
              <div key={i} className="rounded-xl p-5 relative overflow-hidden group hover:border-opacity-30 transition-all" style={{ background: "rgba(255,255,255,0.6)", border: `1px solid ${step.color}25`, backdropFilter: "blur(12px)" }}>
                <div className="absolute top-0 left-0 w-full h-[2px] opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: `linear-gradient(90deg, ${step.color}, transparent)` }} />
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold" style={{ background: `${step.color}15`, color: step.color, border: `1px solid ${step.color}30` }}>
                    {step.num}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold mb-1" style={{ color: "#111827" }}>{step.title}</h3>
                    <p className="text-xs leading-relaxed" style={{ color: "#4b5563" }}>{step.desc}</p>
                    <p className="text-[10px] mt-2 font-mono leading-relaxed" style={{ color: step.color }}>{step.example}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* CTA empty state */}
          <div className="text-center pt-4">
            <button
              onClick={() => setBuilderStep(1)}
              className="px-8 py-3 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #8b5cf6, #6366f1)", color: "#fff", boxShadow: "0 4px 20px rgba(139,92,246,0.35)" }}
            >
              Crear mi primera audiencia
            </button>
            <p className="text-xs mt-2" style={{ color: "#6b7280" }}>No se envia nada hasta que vos lo actives</p>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════
          SUMMARY METRICS (si hay audiencias)
          ═══════════════════════════════════════════ */}
      {summary && audiences.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Audiencias creadas", value: summary.totalAudiences, sub: `${summary.activeAudiences} activas`, color: "#8b5cf6" },
            { label: "Clientes sincronizados", value: summary.totalCustomersSynced.toLocaleString(), sub: "total enviados", color: "#3b82f6" },
            { label: "En Meta Ads", value: summary.platformBreakdown.meta, sub: "audiencias", color: "#1877f2" },
            { label: "En Google Ads", value: summary.platformBreakdown.google, sub: "audiencias", color: "#4285f4" },
          ].map((card, i) => (
            <div key={i} className="rounded-xl p-4 relative overflow-hidden group" style={{ background: "rgba(255,255,255,0.6)", backdropFilter: "blur(12px)", border: `1px solid ${card.color}20` }}>
              <div className="absolute top-0 left-0 w-full h-[1px]" style={{ background: `linear-gradient(90deg, ${card.color}60, transparent)` }} />
              <p className="text-[10px] uppercase tracking-wider font-medium" style={{ color: "#6b7280" }}>{card.label}</p>
              <p className="text-2xl font-bold mt-1" style={{ color: "#111827" }}>{card.value}</p>
              <p className="text-[10px] mt-0.5" style={{ color: card.color }}>{card.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════════
          AUDIENCE BUILDER — Step Wizard
          ═══════════════════════════════════════════ */}
      {builderStep >= 1 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.6)", border: "1px solid rgba(139,92,246,0.2)", backdropFilter: "blur(12px)" }}>

          {/* Step indicators */}
          <div className="px-6 pt-5 pb-3 flex items-center gap-6">
            {[
              { n: 1, label: "Elegir clientes" },
              { n: 2, label: "Destino" },
              { n: 3, label: "Configurar y crear" },
            ].map((s) => (
              <button key={s.n} onClick={() => setBuilderStep(s.n)} className="flex items-center gap-2 group">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all"
                  style={{
                    background: builderStep >= s.n ? "linear-gradient(135deg, #8b5cf6, #6366f1)" : "rgba(107,114,128,0.1)",
                    color: builderStep >= s.n ? "#fff" : "#6b7280",
                    boxShadow: builderStep === s.n ? "0 0 12px rgba(139,92,246,0.4)" : "none",
                  }}
                >
                  {builderStep > s.n ? "✓" : s.n}
                </div>
                <span className="text-xs font-medium transition-colors" style={{ color: builderStep >= s.n ? "#111827" : "#9ca3af" }}>{s.label}</span>
                {s.n < 3 && <div className="w-12 h-[1px] ml-2" style={{ background: builderStep > s.n ? "#8b5cf6" : "rgba(0,0,0,0.1)" }} />}
              </button>
            ))}
          </div>

          <div className="px-6 pb-6 space-y-5">

            {/* ─── STEP 1: Choose segment ─── */}
            {builderStep === 1 && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-base font-semibold mb-1" style={{ color: "#111827" }}>Que clientes queres enviar?</h3>
                  <p className="text-xs" style={{ color: "#4b5563" }}>NitroSales clasifica automaticamente a tus clientes segun como compran. Elegi que grupo queres sincronizar con tus plataformas de publicidad.</p>
                </div>

                {/* Segment type selector */}
                <div className="flex gap-3">
                  {[
                    { id: "RFM", label: "Por comportamiento", desc: "Segun frecuencia y recencia de compra", icon: "📊" },
                    { id: "LTV", label: "Por valor predicho", desc: "Segun cuanto van a gastar (AI)", icon: "🤖" },
                    { id: "ALL_CUSTOMERS", label: "Todos los clientes", desc: "Enviar toda la base de datos", icon: "👥" },
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setBuilderSegmentType(t.id)}
                      className="flex-1 p-4 rounded-xl text-left transition-all hover:border-opacity-30"
                      style={{
                        background: builderSegmentType === t.id ? "rgba(139,92,246,0.08)" : "rgba(255,255,255,0.5)",
                        border: builderSegmentType === t.id ? "1px solid rgba(139,92,246,0.35)" : "1px solid rgba(0,0,0,0.08)",
                      }}
                    >
                      <div className="text-xl mb-2">{t.icon}</div>
                      <p className="text-sm font-semibold" style={{ color: builderSegmentType === t.id ? "#7c3aed" : "#1f2937" }}>{t.label}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: "#6b7280" }}>{t.desc}</p>
                    </button>
                  ))}
                </div>

                {/* RFM Segment Cards */}
                {builderSegmentType === "RFM" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs" style={{ color: "#4b5563" }}>Selecciona los segmentos que queres incluir en esta audiencia:</p>
                      <p className="text-[10px] font-mono" style={{ color: "#6b7280" }}>{builderRfmSegments.length} seleccionados</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {RFM_SEGMENTS.map((seg) => {
                        const sel = builderRfmSegments.includes(seg.id);
                        const hovered = hoveredSegment === seg.id;
                        return (
                          <button
                            key={seg.id}
                            onClick={() => toggleRfm(seg.id)}
                            onMouseEnter={() => setHoveredSegment(seg.id)}
                            onMouseLeave={() => setHoveredSegment(null)}
                            className="p-4 rounded-xl text-left transition-all relative overflow-hidden group"
                            style={{
                              background: sel ? `${seg.color}0a` : "rgba(255,255,255,0.5)",
                              border: sel ? `1px solid ${seg.color}40` : "1px solid rgba(0,0,0,0.08)",
                              boxShadow: sel ? `0 0 20px ${seg.color}10` : "none",
                            }}
                          >
                            {sel && <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: `linear-gradient(90deg, ${seg.color}, transparent)` }} />}
                            <div className="flex items-start gap-3">
                              {/* Checkbox */}
                              <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 transition-all" style={{ background: sel ? seg.color : "rgba(0,0,0,0.05)", border: sel ? "none" : "1px solid rgba(0,0,0,0.12)" }}>
                                {sel && <svg className="w-3 h-3" style={{ color: "#fff" }} fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-base">{seg.icon}</span>
                                  <span className="text-sm font-semibold" style={{ color: sel ? seg.color : "#1f2937" }}>{seg.label}</span>
                                </div>
                                <p className="text-xs mt-0.5" style={{ color: "#6b7280" }}>{seg.desc}</p>
                                {/* Expanded detail on hover or selection */}
                                {(sel || hovered) && (
                                  <div className="mt-2 space-y-1.5">
                                    <p className="text-[11px] leading-relaxed" style={{ color: "#374151" }}>{seg.detail}</p>
                                    <div className="flex items-start gap-1.5">
                                      <span className="text-[10px] mt-[1px]">💡</span>
                                      <p className="text-[10px] leading-relaxed" style={{ color: seg.color }}>{seg.useCase}</p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* LTV Bucket Cards */}
                {builderSegmentType === "LTV" && (
                  <div className="space-y-3">
                    <p className="text-xs" style={{ color: "#4b5563" }}>NitroSales predice cuanto va a gastar cada cliente en el proximo ano usando inteligencia artificial. Selecciona que nivel de valor queres enviar:</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {LTV_BUCKETS.map((b) => {
                        const sel = builderLtvBuckets.includes(b.id);
                        return (
                          <button
                            key={b.id}
                            onClick={() => toggleLtv(b.id)}
                            className="p-4 rounded-xl text-left transition-all relative overflow-hidden"
                            style={{
                              background: sel ? `${b.color}0a` : "rgba(255,255,255,0.5)",
                              border: sel ? `1px solid ${b.color}40` : "1px solid rgba(0,0,0,0.08)",
                            }}
                          >
                            {sel && <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: `linear-gradient(90deg, ${b.color}, transparent)` }} />}
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: sel ? b.color : "rgba(0,0,0,0.05)", border: sel ? "none" : "1px solid rgba(0,0,0,0.12)" }}>
                                {sel && <svg className="w-3 h-3" style={{ color: "#fff" }} fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                              </div>
                              <span className="text-lg">{b.icon}</span>
                              <span className="text-sm font-semibold" style={{ color: sel ? b.color : "#1f2937" }}>{b.label}</span>
                            </div>
                            <p className="text-[11px] leading-relaxed" style={{ color: "#4b5563" }}>{b.detail}</p>
                            <div className="flex items-start gap-1.5 mt-2">
                              <span className="text-[10px] mt-[1px]">💡</span>
                              <p className="text-[10px] leading-relaxed" style={{ color: b.color }}>{b.useCase}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ALL_CUSTOMERS note */}
                {builderSegmentType === "ALL_CUSTOMERS" && (
                  <div className="rounded-xl p-4" style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)" }}>
                    <p className="text-sm" style={{ color: "#374151" }}>Se enviaran <strong style={{ color: "#111827" }}>todos tus clientes que tengan email</strong> (al menos 1 compra registrada). Esto es util para crear una audiencia de exclusion (no mostrar ads a gente que ya compro) o un Lookalike amplio.</p>
                  </div>
                )}

                {/* Optional filters */}
                {builderSegmentType !== "ALL_CUSTOMERS" && (
                  <div>
                    <p className="text-xs mb-3" style={{ color: "#6b7280" }}>Filtros adicionales (opcional) — para refinar mas tu audiencia:</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="text-[10px] block mb-1" style={{ color: "#6b7280" }}>Minimo de compras</label>
                        <input type="number" value={builderMinOrders} onChange={(e) => setBuilderMinOrders(e.target.value)} placeholder="Ej: 2" className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: "rgba(255,255,255,0.8)", border: "1px solid rgba(0,0,0,0.12)", color: "#111827" }} />
                        <p className="text-[9px] mt-1" style={{ color: "#9ca3af" }}>Solo clientes con X o mas ordenes</p>
                      </div>
                      <div>
                        <label className="text-[10px] block mb-1" style={{ color: "#6b7280" }}>Gasto minimo (ARS)</label>
                        <input type="number" value={builderMinSpent} onChange={(e) => setBuilderMinSpent(e.target.value)} placeholder="Ej: 50000" className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: "rgba(255,255,255,0.8)", border: "1px solid rgba(0,0,0,0.12)", color: "#111827" }} />
                        <p className="text-[9px] mt-1" style={{ color: "#9ca3af" }}>Solo clientes que gastaron mas de $X total</p>
                      </div>
                      <div>
                        <label className="text-[10px] block mb-1" style={{ color: "#6b7280" }}>Ultima compra (max dias)</label>
                        <input type="number" value={builderRecencyMax} onChange={(e) => setBuilderRecencyMax(e.target.value)} placeholder="Ej: 90" className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: "rgba(255,255,255,0.8)", border: "1px solid rgba(0,0,0,0.12)", color: "#111827" }} />
                        <p className="text-[9px] mt-1" style={{ color: "#9ca3af" }}>Solo clientes que compraron en los ultimos X dias</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Live preview panel */}
                {preview && (
                  <div className="rounded-xl p-4" style={{ background: "rgba(139,92,246,0.04)", border: "1px solid rgba(139,92,246,0.12)" }}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-xs font-semibold" style={{ color: "#111827" }}>Vista previa en tiempo real</span>
                      </div>
                      {previewLoading && <span className="text-[10px]" style={{ color: "#9ca3af" }}>Calculando...</span>}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-2xl font-bold" style={{ color: "#111827" }}>{preview.totalCustomers.toLocaleString()}</p>
                        <p className="text-[10px]" style={{ color: "#6b7280" }}>clientes en esta audiencia</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold" style={{ color: "#111827" }}>{preview.withEmail.toLocaleString()}</p>
                        <p className="text-[10px]" style={{ color: "#6b7280" }}>con email (enviables)</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold" style={{ color: "#1d4ed8" }}>~{preview.estimatedMetaMatch.toLocaleString()}</p>
                        <p className="text-[10px]" style={{ color: "#6b7280" }}>estimado match en Meta</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold" style={{ color: "#1a73e8" }}>~{preview.estimatedGoogleMatch.toLocaleString()}</p>
                        <p className="text-[10px]" style={{ color: "#6b7280" }}>estimado match en Google</p>
                      </div>
                    </div>
                    {Object.keys(preview.segmentBreakdown).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3 pt-3" style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                        {Object.entries(preview.segmentBreakdown).map(([seg, count]) => {
                          const def = RFM_SEGMENTS.find(s => s.id === seg);
                          return (
                            <span key={seg} className="px-2 py-0.5 rounded text-[10px] font-medium" style={{ background: `${def?.color || "#6b7280"}12`, color: def?.color || "#6b7280", border: `1px solid ${def?.color || "#6b7280"}25` }}>
                              {seg}: {count}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <p className="text-[9px] mt-2" style={{ color: "#9ca3af" }}>Match = cuantos emails Meta/Google logra cruzar con cuentas reales. Mas datos (nombre, ciudad) = mejor match rate.</p>
                  </div>
                )}

                <div className="flex justify-end">
                  <button onClick={() => setBuilderStep(2)} className="px-5 py-2 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02]" style={{ background: "linear-gradient(135deg, #8b5cf6, #6366f1)", color: "#fff" }}>
                    Siguiente: Elegir destino →
                  </button>
                </div>
              </div>
            )}

            {/* ─── STEP 2: Platform ─── */}
            {builderStep === 2 && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-base font-semibold mb-1" style={{ color: "#111827" }}>A donde queres enviar esta audiencia?</h3>
                  <p className="text-xs" style={{ color: "#4b5563" }}>La audiencia va a aparecer como &quot;Custom Audience&quot; en Meta Ads Manager o como &quot;Customer List&quot; en Google Ads, lista para usar en tus campanas.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    {
                      id: "META",
                      name: "Meta Ads",
                      color: "#1877f2",
                      desc: "Facebook e Instagram. La audiencia aparece en Audiences dentro de Meta Ads Manager.",
                      features: ["Lookalike Audiences (encontrar gente similar)", "Retargeting a clientes existentes", "Excluir clientes de campanas de adquisicion"],
                    },
                    {
                      id: "GOOGLE",
                      name: "Google Ads",
                      color: "#4285f4",
                      desc: "Search, Display, YouTube y Shopping. Aparece como Customer List en Audience Manager.",
                      features: ["Similar Audiences en Display y YouTube", "Ofertar mas por clientes conocidos en Search", "Excluir compradores de campanas Smart Shopping"],
                    },
                    {
                      id: "BOTH",
                      name: "Ambas plataformas",
                      color: "#8b5cf6",
                      desc: "Se sincroniza en Meta y Google al mismo tiempo. Ideal para tener audiencias consistentes en todos tus canales.",
                      features: ["Misma audiencia en Facebook, Instagram, Google y YouTube", "Un solo click para sincronizar todo", "Recomendado para la mayoria de los casos"],
                    },
                  ].map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setBuilderPlatform(p.id)}
                      className="p-5 rounded-xl text-left transition-all relative overflow-hidden group"
                      style={{
                        background: builderPlatform === p.id ? `${p.color}0a` : "rgba(255,255,255,0.5)",
                        border: builderPlatform === p.id ? `1px solid ${p.color}30` : "1px solid rgba(0,0,0,0.08)",
                      }}
                    >
                      {builderPlatform === p.id && <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: `linear-gradient(90deg, ${p.color}, transparent)` }} />}
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: builderPlatform === p.id ? p.color : "rgba(0,0,0,0.05)", border: builderPlatform === p.id ? "none" : "1px solid rgba(0,0,0,0.12)" }}>
                          {builderPlatform === p.id && <svg className="w-3 h-3" style={{ color: "#fff" }} fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                        </div>
                        <span className="text-sm font-semibold" style={{ color: builderPlatform === p.id ? p.color : "#1f2937" }}>{p.name}</span>
                        {p.id === "BOTH" && <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase" style={{ background: `${p.color}15`, color: p.color }}>Recomendado</span>}
                      </div>
                      <p className="text-[11px] mb-3" style={{ color: "#4b5563" }}>{p.desc}</p>
                      <ul className="space-y-1.5">
                        {p.features.map((f, fi) => (
                          <li key={fi} className="flex items-start gap-1.5 text-[10px]" style={{ color: "#6b7280" }}>
                            <span style={{ color: p.color }}>✓</span> {f}
                          </li>
                        ))}
                      </ul>
                    </button>
                  ))}
                </div>

                <div className="flex justify-between">
                  <button onClick={() => setBuilderStep(1)} className="text-sm transition-colors" style={{ color: "#6b7280" }}>← Volver</button>
                  <button onClick={() => setBuilderStep(3)} className="px-5 py-2 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02]" style={{ background: "linear-gradient(135deg, #8b5cf6, #6366f1)", color: "#fff" }}>
                    Siguiente: Configurar →
                  </button>
                </div>
              </div>
            )}

            {/* ─── STEP 3: Name + Config + Create ─── */}
            {builderStep === 3 && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-base font-semibold mb-1" style={{ color: "#111827" }}>Ponele nombre y configura la sincronizacion</h3>
                  <p className="text-xs" style={{ color: "#4b5563" }}>Este nombre va a aparecer en Meta Ads Manager / Google Ads como el nombre de la audiencia.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] block mb-1" style={{ color: "#6b7280" }}>Nombre de la audiencia *</label>
                    <input type="text" value={builderName} onChange={(e) => setBuilderName(e.target.value)} placeholder="Ej: Champions para Lookalike" className="w-full px-4 py-2.5 rounded-xl text-sm font-medium" style={{ background: "rgba(255,255,255,0.8)", border: "1px solid rgba(0,0,0,0.12)", color: "#111827" }} />
                    <p className="text-[9px] mt-1" style={{ color: "#9ca3af" }}>Tip: usa un nombre descriptivo. Va a aparecer asi en Meta/Google.</p>
                  </div>
                  <div>
                    <label className="text-[10px] block mb-1" style={{ color: "#6b7280" }}>Descripcion (opcional)</label>
                    <input type="text" value={builderDesc} onChange={(e) => setBuilderDesc(e.target.value)} placeholder="Ej: Top clientes para lookalike 1%" className="w-full px-4 py-2.5 rounded-xl text-sm" style={{ background: "rgba(255,255,255,0.8)", border: "1px solid rgba(0,0,0,0.12)", color: "#111827" }} />
                  </div>
                </div>

                {/* Auto sync */}
                <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.5)", backdropFilter: "blur(12px)", border: "1px solid rgba(0,0,0,0.08)" }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium" style={{ color: "#111827" }}>Sincronizacion automatica</p>
                      <p className="text-[10px] mt-0.5" style={{ color: "#6b7280" }}>Si lo activas, NitroSales actualiza la audiencia automaticamente segun la frecuencia que elijas. Los clientes nuevos se agregan y los que ya no cumplen los criterios se quitan.</p>
                    </div>
                    <button onClick={() => setBuilderAutoSync(!builderAutoSync)} className="w-11 h-6 rounded-full transition-all relative flex-shrink-0" style={{ background: builderAutoSync ? "linear-gradient(135deg, #8b5cf6, #6366f1)" : "rgba(0,0,0,0.1)" }}>
                      <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all shadow-sm" style={{ left: builderAutoSync ? "22px" : "2px" }} />
                    </button>
                  </div>
                  {builderAutoSync && (
                    <div className="mt-3 pt-3 flex gap-2" style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                      {[
                        { id: "DAILY", label: "Diario", desc: "Todos los dias" },
                        { id: "WEEKLY", label: "Semanal", desc: "Cada 7 dias" },
                        { id: "MANUAL", label: "Manual", desc: "Solo cuando vos quieras" },
                      ].map((f) => (
                        <button key={f.id} onClick={() => setBuilderSyncFreq(f.id)} className="flex-1 p-2.5 rounded-lg text-center transition-all" style={{ background: builderSyncFreq === f.id ? "rgba(139,92,246,0.1)" : "rgba(255,255,255,0.5)", border: builderSyncFreq === f.id ? "1px solid rgba(139,92,246,0.3)" : "1px solid rgba(0,0,0,0.06)" }}>
                          <p className="text-xs font-medium" style={{ color: builderSyncFreq === f.id ? "#7c3aed" : "#374151" }}>{f.label}</p>
                          <p className="text-[9px]" style={{ color: "#9ca3af" }}>{f.desc}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Summary card before creating */}
                <div className="rounded-xl p-4" style={{ background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.15)" }}>
                  <p className="text-xs font-semibold mb-2" style={{ color: "#111827" }}>Resumen de la audiencia</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div><span style={{ color: "#6b7280" }}>Clientes:</span> <span className="font-medium" style={{ color: "#111827" }}>{preview?.totalCustomers.toLocaleString() || "..."}</span></div>
                    <div><span style={{ color: "#6b7280" }}>Tipo:</span> <span className="font-medium" style={{ color: "#111827" }}>{builderSegmentType === "RFM" ? "Comportamiento" : builderSegmentType === "LTV" ? "Valor predicho" : "Todos"}</span></div>
                    <div><span style={{ color: "#6b7280" }}>Destino:</span> <span className="font-medium" style={{ color: "#111827" }}>{builderPlatform === "META" ? "Meta Ads" : builderPlatform === "GOOGLE" ? "Google Ads" : "Meta + Google"}</span></div>
                    <div><span style={{ color: "#6b7280" }}>Auto-sync:</span> <span className="font-medium" style={{ color: "#111827" }}>{builderAutoSync ? builderSyncFreq.toLowerCase() : "Manual"}</span></div>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <button onClick={() => setBuilderStep(2)} className="text-sm transition-colors" style={{ color: "#6b7280" }}>← Volver</button>
                  <div className="flex gap-3">
                    <button onClick={() => { setBuilderStep(0); resetBuilder(); }} className="px-4 py-2 rounded-xl text-sm transition-colors" style={{ color: "#6b7280" }}>Cancelar</button>
                    <button onClick={saveAudience} disabled={!builderName.trim() || saving} className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100" style={{ background: "linear-gradient(135deg, #8b5cf6, #6366f1)", color: "#fff", boxShadow: "0 4px 20px rgba(139,92,246,0.3)" }}>
                      {saving ? (
                        <span className="flex items-center gap-2">
                          <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                          Creando...
                        </span>
                      ) : "Crear Audiencia"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════
          AUDIENCE LIST
          ═══════════════════════════════════════════ */}
      {audiences.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold" style={{ color: "#111827" }}>Tus audiencias</h2>
          {audiences.map((a) => {
            const badge = statusBadge(a.status);
            const isSyncing = syncing === a.id || a.status === "SYNCING";
            return (
              <div key={a.id} className="rounded-xl overflow-hidden transition-all group" style={{ background: "rgba(255,255,255,0.6)", backdropFilter: "blur(12px)", border: "1px solid rgba(0,0,0,0.08)" }}>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h3 className="text-sm font-semibold" style={{ color: "#111827" }}>{a.name}</h3>
                        <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider" style={{ background: `${badge.color}12`, color: badge.color, border: `1px solid ${badge.color}25` }}>{badge.label}</span>
                        <span className="px-2 py-0.5 rounded-md text-[9px] font-medium uppercase" style={{ background: "rgba(0,0,0,0.04)", color: "#6b7280" }}>
                          {a.platform === "META" ? "Meta Ads" : a.platform === "GOOGLE" ? "Google Ads" : "Meta + Google"}
                        </span>
                        {a.autoSync && (
                          <span className="px-2 py-0.5 rounded-md text-[9px] font-medium" style={{ background: "rgba(139,92,246,0.08)", color: "#7c3aed" }}>
                            Auto-sync {a.syncFrequency.toLowerCase()}
                          </span>
                        )}
                      </div>
                      {a.description && <p className="text-xs mt-1" style={{ color: "#6b7280" }}>{a.description}</p>}

                      {/* Metrics */}
                      <div className="flex items-center gap-5 mt-3 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#8b5cf6" }} />
                          <span className="text-xs font-medium" style={{ color: "#1f2937" }}>{a.customerCount.toLocaleString()}</span>
                          <span className="text-[10px]" style={{ color: "#6b7280" }}>clientes</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#3b82f6" }} />
                          <span className="text-xs font-medium" style={{ color: "#1f2937" }}>{a.lastSyncedCount.toLocaleString()}</span>
                          <span className="text-[10px]" style={{ color: "#6b7280" }}>enviados</span>
                        </div>
                        {a.metaMatchRate !== null && (
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#1d4ed8" }} />
                            <span className="text-xs font-medium" style={{ color: "#1d4ed8" }}>{a.metaMatchRate.toFixed(0)}%</span>
                            <span className="text-[10px]" style={{ color: "#6b7280" }}>match Meta</span>
                          </div>
                        )}
                        {a.googleMatchRate !== null && (
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#1a73e8" }} />
                            <span className="text-xs font-medium" style={{ color: "#1a73e8" }}>{a.googleMatchRate.toFixed(0)}%</span>
                            <span className="text-[10px]" style={{ color: "#6b7280" }}>match Google</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px]" style={{ color: "#9ca3af" }}>Ultimo sync: {formatDate(a.lastSyncAt)}</span>
                        </div>
                      </div>
                      {a.lastSyncError && (
                        <p className="text-[10px] mt-1.5 flex items-center gap-1" style={{ color: "#dc2626" }}>
                          <span>⚠</span> {a.lastSyncError}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => syncAudience(a.id)}
                        disabled={isSyncing}
                        className="px-4 py-2 rounded-xl text-xs font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
                        style={{ background: "linear-gradient(135deg, #8b5cf6, #6366f1)", color: "#fff", boxShadow: "0 2px 12px rgba(139,92,246,0.25)" }}
                      >
                        {isSyncing ? (
                          <span className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                            Sincronizando
                          </span>
                        ) : "Sincronizar"}
                      </button>
                      <button onClick={() => deleteAudience(a.id)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-50 transition-all" style={{ color: "#9ca3af" }} title="Eliminar">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════════════════════════════════════════
          ENV WARNING
          ═══════════════════════════════════════════ */}
      {summary && !summary.syncEnabled && (
        <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: "rgba(234,179,8,0.06)", border: "1px solid rgba(234,179,8,0.2)" }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(234,179,8,0.15)" }}>
            <svg className="w-4 h-4" style={{ color: "#d97706" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
          </div>
          <div>
            <p className="text-sm font-medium" style={{ color: "#92400e" }}>Modo vista previa</p>
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "#78350f" }}>
              Podes crear audiencias y ver previews, pero la sincronizacion real con Meta y Google esta desactivada. Para activarla, necesitas configurar las credenciales de Meta Ads y Google Ads en el entorno de produccion.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
