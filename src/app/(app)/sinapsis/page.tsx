"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

type Memory = {
  id: string;
  category: "BUSINESS_RULE" | "CORRECTION" | "PREFERENCE" | "CONTEXT";
  title: string;
  content: string;
  priority: number;
  isActive: boolean;
  source: string;
  createdBy: string | null;
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// Colores de categoría: escala monocromo-ink (data-viz categórico sobrio,
// no rainbow). Distingue los 4 tipos de memoria por luminosidad, no por hue.
const CATEGORY_INFO: Record<
  Memory["category"],
  { label: string; short: string; color: string; description: string; angle: number }
> = {
  BUSINESS_RULE: {
    label: "Regla de Negocio",
    short: "Regla",
    color: "#1C1B18",
    description: "Directiva estratégica permanente",
    angle: -90,
  },
  CONTEXT: {
    label: "Contexto",
    short: "Contexto",
    color: "#4A4740",
    description: "Información sobre el negocio",
    angle: 0,
  },
  PREFERENCE: {
    label: "Preferencia",
    short: "Preferencia",
    color: "#6B685F",
    description: "Cómo mostrar los datos",
    angle: 90,
  },
  CORRECTION: {
    label: "Corrección",
    short: "Corrección",
    color: "#9A978D",
    description: "Hecho que Aurum debe recordar",
    angle: 180,
  },
};

const CATEGORIES = Object.keys(CATEGORY_INFO) as Memory["category"][];

type BusinessContext = {
  industry?: string;
  businessType?: string;
  country?: string;
  salesChannels?: string[];
  adChannels?: string[];
  businessStage?: string;
};

export default function SinapsisPage() {
  const { status } = useSession();
  const router = useRouter();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [businessContext, setBusinessContext] = useState<BusinessContext | null>(null);
  const [orgName, setOrgName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("ALL");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    category: "BUSINESS_RULE" as Memory["category"],
    title: "",
    content: "",
    priority: 5,
  });

  const loadMemories = useCallback(async () => {
    setLoading(true);
    try {
      const [memRes, onbRes] = await Promise.all([
        fetch("/api/memory?includeInactive=true"),
        fetch("/api/onboarding"),
      ]);
      const memData = await memRes.json();
      if (memData.memories) setMemories(memData.memories);
      if (onbRes.ok) {
        const onbData = await onbRes.json();
        setBusinessContext(onbData.businessContext || null);
        setOrgName(onbData.orgName || "");
      }
    } catch (err) {
      console.error("Error loading memories:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated") loadMemories();
  }, [status, router, loadMemories]);

  const resetForm = () => {
    setFormData({ category: "BUSINESS_RULE", title: "", content: "", priority: 5 });
    setShowForm(false);
    setEditingId(null);
    setSaveError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.content.trim()) return;

    setSaving(true);
    setSaveError("");
    try {
      const url = editingId ? `/api/memory/${editingId}` : "/api/memory";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `Error ${res.status}` }));
        setSaveError(errData.error || `Error del servidor (${res.status})`);
        setSaving(false);
        return;
      }
      resetForm();
      loadMemories();
    } catch (err) {
      console.error("Error saving:", err);
      setSaveError("Error de conexión. Intentá de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      await fetch(`/api/memory/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });
      loadMemories();
    } catch (err) {
      console.error("Error toggling:", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta conexión? Esta acción no se puede deshacer.")) return;
    try {
      await fetch(`/api/memory/${id}`, { method: "DELETE" });
      if (selectedId === id) setSelectedId(null);
      loadMemories();
    } catch (err) {
      console.error("Error deleting:", err);
    }
  };

  const startEdit = (m: Memory) => {
    setEditingId(m.id);
    setFormData({
      category: m.category,
      title: m.title,
      content: m.content,
      priority: m.priority,
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ═══ Metrics ═══
  const metrics = useMemo(() => {
    const active = memories.filter((m) => m.isActive);
    const firstDate = memories.length
      ? memories.reduce((min, m) => {
          const d = new Date(m.createdAt).getTime();
          return d < min ? d : min;
        }, Date.now())
      : Date.now();
    const daysLearning = Math.max(1, Math.floor((Date.now() - firstDate) / (1000 * 60 * 60 * 24)) + 1);

    // Cognitive density: 0-100 score based on active memories, category coverage, and total usage
    const coveredCategories = new Set(active.map((m) => m.category)).size;
    const coverageScore = (coveredCategories / CATEGORIES.length) * 30;
    const volumeScore = Math.min(40, active.length * 2);
    const usageScore = Math.min(30, memories.reduce((s, m) => s + m.usageCount, 0) * 0.5);
    const density = Math.round(coverageScore + volumeScore + usageScore);

    return {
      connections: active.length,
      totalConnections: memories.length,
      daysLearning,
      density,
      totalUsage: memories.reduce((s, m) => s + m.usageCount, 0),
      coveredCategories,
    };
  }, [memories]);

  // ═══ Filtered list for side panel ═══
  const filtered = useMemo(() => {
    const base =
      filterCategory === "ALL"
        ? memories
        : memories.filter((m) => m.category === filterCategory);
    return [...base].sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      if (a.priority !== b.priority) return b.priority - a.priority;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [memories, filterCategory]);

  // ═══ Neural network layout ═══
  // Place memories in concentric rings by category.
  type Node = { id: string; x: number; y: number; r: number; color: string; memory: Memory };
  const nodes: Node[] = useMemo(() => {
    const cx = 260;
    const cy = 260;
    const list: Node[] = [];
    const byCat: Record<string, Memory[]> = {};
    CATEGORIES.forEach((c) => (byCat[c] = []));
    memories.forEach((m) => {
      if (byCat[m.category]) byCat[m.category].push(m);
    });

    CATEGORIES.forEach((cat) => {
      const group = byCat[cat];
      if (group.length === 0) return;
      const info = CATEGORY_INFO[cat];
      const baseAngle = (info.angle * Math.PI) / 180;
      const arcSpan = Math.PI / 2.2; // how wide this category spans
      const startAngle = baseAngle - arcSpan / 2;
      // Rings: priority 8+ inner (r=90), 5-7 mid (r=150), <5 outer (r=210)
      group.forEach((m, i) => {
        const ring = m.priority >= 8 ? 100 : m.priority >= 5 ? 160 : 220;
        const offset = group.length === 1 ? 0 : (i / (group.length - 1)) * arcSpan;
        const angle = startAngle + offset;
        const jitter = (i % 2 === 0 ? -1 : 1) * (i * 2);
        const x = cx + Math.cos(angle) * (ring + jitter);
        const y = cy + Math.sin(angle) * (ring + jitter);
        const r = m.priority >= 8 ? 7 : m.priority >= 5 ? 5.5 : 4.5;
        list.push({ id: m.id, x, y, r, color: info.color, memory: m });
      });
    });
    return list;
  }, [memories]);

  // Connections: every node connects to the central core, plus inter-category near neighbors
  const connections = useMemo(() => {
    const cx = 260;
    const cy = 260;
    const lines: { x1: number; y1: number; x2: number; y2: number; opacity: number; active: boolean }[] = [];
    nodes.forEach((n) => {
      lines.push({
        x1: cx,
        y1: cy,
        x2: n.x,
        y2: n.y,
        opacity: n.memory.isActive ? 0.3 : 0.1,
        active: n.memory.isActive,
      });
    });
    // Add same-category links (visual texture)
    CATEGORIES.forEach((cat) => {
      const group = nodes.filter((n) => n.memory.category === cat);
      for (let i = 0; i < group.length - 1; i++) {
        const a = group[i];
        const b = group[i + 1];
        lines.push({
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          opacity: 0.16,
          active: a.memory.isActive && b.memory.isActive,
        });
      }
    });
    return lines;
  }, [nodes]);

  // ═══ Loading ═══
  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="flex flex-col items-center gap-4">
          <span className="w-2 h-2 rounded-full bg-ink-40 animate-pulse" />
          <p className="text-ink-60 text-xs font-geistmono tracking-[0.3em] uppercase">
            Despertando Sinapsis
          </p>
        </div>
      </div>
    );
  }

  // ═══ Main render ═══
  const hasMemories = memories.length > 0;

  return (
    <div className="min-h-screen -m-4 lg:-m-6 p-4 lg:p-8 relative overflow-hidden bg-canvas">
      {/* Header */}
      <header className="relative z-10 max-w-[1400px] mx-auto mb-8">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="px-2.5 py-1 rounded-md text-[9px] font-bold font-geistmono uppercase tracking-[0.25em] text-ink-60 bg-surface border border-hairline">
                Aurum · Memoria Viva
              </div>
            </div>
            <h1
              className="text-4xl lg:text-5xl font-medium tracking-tight text-ink"
              style={{ letterSpacing: "-0.02em" }}
            >
              Sinapsis
            </h1>
            <p className="text-ink-60 text-sm mt-2 max-w-xl leading-relaxed">
              Cada conversación refuerza una conexión. Cuanto más la usás, más te conoce.{" "}
              <span className="text-ink font-medium">Este cerebro es irreemplazable — es tuyo.</span>
            </p>
          </div>
          <button
            onClick={() => {
              if (showForm) resetForm();
              else setShowForm(true);
            }}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-150 ease-ent bg-ink text-white hover:bg-ink/90"
          >
            {showForm ? "Cancelar" : "+ Formar conexión"}
          </button>
        </div>

        {/* Metrics strip */}
        <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            label="Conexiones formadas"
            value={metrics.connections.toString()}
            sublabel={`${metrics.totalConnections} totales`}
          />
          <MetricCard
            label="Días aprendiendo"
            value={metrics.daysLearning.toString()}
            sublabel="sin interrupción"
          />
          <MetricCard
            label="Densidad cognitiva"
            value={`${metrics.density}`}
            sublabel="de 100"
            showBar
            barValue={metrics.density}
          />
          <MetricCard
            label="Activaciones"
            value={metrics.totalUsage.toString()}
            sublabel="usos acumulados"
          />
        </div>
      </header>

      {/* Perfil del negocio */}
      {businessContext && (
        <div className="relative z-10 max-w-[1400px] mx-auto mb-8">
          <div className="rounded-2xl p-5 bg-elevated border border-hairline shadow-ent-xs">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="text-[10px] font-geistmono uppercase tracking-[0.25em] text-ink-40 mb-1">
                  Perfil del negocio
                </div>
                <h3 className="text-ink text-lg font-semibold">
                  {orgName || "Tu negocio"}
                </h3>
                <p className="text-ink-60 text-xs mt-1">
                  Este es el contexto que Aurum usa para pensar como vos.
                </p>
              </div>
              <button
                onClick={() => router.push("/chat")}
                className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors duration-150 ease-ent bg-surface border border-hairline text-ink-60 hover:text-ink"
              >
                Rehacer onboarding
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
              <ProfileChip label="Rubro" value={businessContext.industry} />
              <ProfileChip label="Tipo" value={businessContext.businessType} />
              <ProfileChip label="País" value={businessContext.country} />
              <ProfileChip label="Etapa" value={businessContext.businessStage} />
              {businessContext.salesChannels && businessContext.salesChannels.length > 0 && (
                <ProfileChip
                  label="Venta"
                  value={businessContext.salesChannels.join(", ")}
                  wide
                />
              )}
              {businessContext.adChannels && businessContext.adChannels.length > 0 && (
                <ProfileChip
                  label="Publicidad"
                  value={businessContext.adChannels.join(", ")}
                  wide
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Form panel */}
      {showForm && (
        <div className="relative z-10 max-w-[1400px] mx-auto mb-8">
          <div className="rounded-2xl p-6 bg-elevated border border-hairline shadow-ent-xs">
            <h3 className="text-ink font-semibold text-lg mb-4">
              {editingId ? "Editar conexión" : "Formar nueva conexión"}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-geistmono uppercase tracking-wider text-ink-40 mb-2">
                  Tipo de conexión
                </label>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  {CATEGORIES.map((cat) => {
                    const info = CATEGORY_INFO[cat];
                    const active = formData.category === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setFormData({ ...formData, category: cat })}
                        className={cx(
                          "p-3 rounded-xl text-left border transition-colors duration-150 ease-ent",
                          active ? "bg-surface-2" : "bg-white border-hairline-2 hover:border-hairline"
                        )}
                        style={active ? { borderColor: info.color } : undefined}
                      >
                        <div
                          className="text-xs font-bold font-geistmono uppercase tracking-wider mb-1"
                          style={{ color: active ? info.color : "rgb(var(--ent-ink-40))" }}
                        >
                          {info.short}
                        </div>
                        <div className="text-[10px] text-ink-40 leading-snug">
                          {info.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-geistmono uppercase tracking-wider text-ink-40 mb-2">
                  Nombre de la conexión
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Ej: Comparar ventas interanualmente"
                  className="w-full rounded-xl px-4 py-3 text-sm text-ink outline-none transition-colors duration-150 ease-ent bg-surface border border-hairline-2 placeholder:text-ink-40 focus:border-hairline"
                />
              </div>

              <div>
                <label className="block text-xs font-geistmono uppercase tracking-wider text-ink-40 mb-2">
                  Qué debe recordar Aurum
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Describí el aprendizaje, regla o contexto que Aurum debe tener en cuenta..."
                  rows={4}
                  className="w-full rounded-xl px-4 py-3 text-sm text-ink outline-none resize-none transition-colors duration-150 ease-ent bg-surface border border-hairline-2 placeholder:text-ink-40 focus:border-hairline"
                />
              </div>

              <div>
                <label className="block text-xs font-geistmono uppercase tracking-wider text-ink-40 mb-2">
                  Intensidad:{" "}
                  <span className="text-ink font-bold">{formData.priority}/10</span>
                  <span className="text-ink-40 ml-2 normal-case tracking-normal">
                    {formData.priority >= 8
                      ? "· crítica, siempre activa"
                      : formData.priority >= 5
                      ? "· normal"
                      : "· baja, se activa con espacio"}
                  </span>
                </label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={formData.priority}
                  onChange={(e) =>
                    setFormData({ ...formData, priority: parseInt(e.target.value) })
                  }
                  className="w-full ent-range"
                />
              </div>

              {saveError && (
                <div className="p-3 rounded-xl text-sm bg-red-50 border border-red-200 text-red-700">
                  {saveError}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={saving || !formData.title.trim() || !formData.content.trim()}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-150 ease-ent disabled:opacity-40 bg-ink text-white hover:bg-ink/90"
                >
                  {saving ? "Formando..." : editingId ? "Actualizar conexión" : "Formar conexión"}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium transition-colors duration-150 ease-ent text-ink-60 hover:text-ink bg-white border border-hairline-2"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main two-column: Network + Side panel */}
      <div className="relative z-10 max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        {/* Left: Neural network */}
        <div
          className="rounded-2xl p-6 relative overflow-hidden bg-elevated border border-hairline shadow-ent-xs"
          style={{ minHeight: 560 }}
        >
          <div className="absolute top-4 left-6 right-6 flex items-center justify-between pointer-events-none">
            <div className="text-[10px] font-geistmono uppercase tracking-[0.3em] text-ink-40">
              Red neuronal · Aurum
            </div>
            <div className="text-[10px] font-geistmono uppercase tracking-[0.3em] text-ink-40">
              {metrics.coveredCategories}/{CATEGORIES.length} dominios
            </div>
          </div>

          {!hasMemories ? (
            <EmptyNetwork onCreate={() => setShowForm(true)} />
          ) : (
            <div className="w-full h-full flex items-center justify-center pt-8">
              <svg viewBox="0 0 520 520" className="w-full max-w-[520px] h-auto">
                {/* Orbit rings */}
                {[100, 160, 220].map((r) => (
                  <circle
                    key={r}
                    cx={260}
                    cy={260}
                    r={r}
                    fill="none"
                    stroke="rgb(var(--ent-hairline))"
                    strokeWidth={0.75}
                    strokeDasharray="2,4"
                  />
                ))}

                {/* Connection lines */}
                {connections.map((c, i) => (
                  <line
                    key={i}
                    x1={c.x1}
                    y1={c.y1}
                    x2={c.x2}
                    y2={c.y2}
                    stroke={c.active ? "rgb(var(--ent-ink-40))" : "rgb(var(--ent-hairline-2))"}
                    strokeWidth={0.7}
                    opacity={c.opacity}
                  />
                ))}

                {/* Category labels on orbit */}
                {CATEGORIES.map((cat) => {
                  const info = CATEGORY_INFO[cat];
                  const angle = (info.angle * Math.PI) / 180;
                  const lx = 260 + Math.cos(angle) * 250;
                  const ly = 260 + Math.sin(angle) * 250;
                  const count = memories.filter((m) => m.category === cat).length;
                  if (count === 0) return null;
                  return (
                    <text
                      key={cat}
                      x={lx}
                      y={ly}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={9}
                      fontFamily="var(--font-geist-mono), monospace"
                      fill={info.color}
                      opacity={0.75}
                      style={{ textTransform: "uppercase", letterSpacing: "0.2em" }}
                    >
                      {info.short} · {count}
                    </text>
                  );
                })}

                {/* Nodes */}
                {nodes.map((n) => {
                  const isHovered = hoveredId === n.id;
                  const isSelected = selectedId === n.id;
                  const highlight = isHovered || isSelected;
                  return (
                    <g
                      key={n.id}
                      style={{ cursor: "pointer" }}
                      onMouseEnter={() => setHoveredId(n.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onClick={() => setSelectedId(isSelected ? null : n.id)}
                    >
                      {highlight && (
                        <circle
                          cx={n.x}
                          cy={n.y}
                          r={n.r + 6}
                          fill={n.color}
                          opacity={0.15}
                        />
                      )}
                      <circle
                        cx={n.x}
                        cy={n.y}
                        r={n.r}
                        fill={n.color}
                        opacity={n.memory.isActive ? (highlight ? 1 : 0.85) : 0.3}
                        style={{ transition: "all 200ms ease" }}
                      />
                    </g>
                  );
                })}

                {/* Core: Aurum */}
                <g>
                  <circle cx={260} cy={260} r={28} fill="rgb(var(--ent-ink))" />
                  <text
                    x={260}
                    y={264}
                    textAnchor="middle"
                    fontSize={10}
                    fontFamily="var(--font-geist-mono), monospace"
                    fill="#FBFAF7"
                    fontWeight={700}
                    style={{ textTransform: "uppercase", letterSpacing: "0.15em" }}
                  >
                    AURUM
                  </text>
                </g>
              </svg>
            </div>
          )}

          {/* Hovered node tooltip */}
          {hoveredId && hasMemories && (() => {
            const m = memories.find((mm) => mm.id === hoveredId);
            if (!m) return null;
            return (
              <div className="absolute bottom-4 left-4 right-4 rounded-xl p-3 pointer-events-none bg-elevated border border-hairline shadow-ent-soft">
                <div
                  className="text-[9px] font-geistmono uppercase tracking-widest mb-1"
                  style={{ color: CATEGORY_INFO[m.category].color }}
                >
                  {CATEGORY_INFO[m.category].short} · prioridad {m.priority}
                </div>
                <div className="text-ink text-sm font-semibold">{m.title}</div>
                <div className="text-ink-60 text-xs mt-0.5 line-clamp-2">
                  {m.content}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Right: Side panel */}
        <div className="flex flex-col gap-3">
          {/* Filter chips */}
          <div className="flex gap-1.5 flex-wrap">
            <FilterChip
              label={`Todas (${memories.length})`}
              active={filterCategory === "ALL"}
              onClick={() => setFilterCategory("ALL")}
            />
            {CATEGORIES.map((cat) => {
              const count = memories.filter((m) => m.category === cat).length;
              if (count === 0) return null;
              return (
                <FilterChip
                  key={cat}
                  label={`${CATEGORY_INFO[cat].short} (${count})`}
                  active={filterCategory === cat}
                  onClick={() => setFilterCategory(cat)}
                  color={CATEGORY_INFO[cat].color}
                />
              );
            })}
          </div>

          {/* Memory cards */}
          <div
            className="rounded-2xl p-3 flex-1 overflow-y-auto bg-elevated border border-hairline"
            style={{ maxHeight: 560 }}
          >
            {filtered.length === 0 ? (
              <div className="text-center py-12 text-ink-40 text-sm">
                {hasMemories
                  ? "No hay conexiones en este filtro"
                  : "Tu primera conexión está por formarse"}
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((m) => (
                  <MemoryCard
                    key={m.id}
                    memory={m}
                    selected={selectedId === m.id || hoveredId === m.id}
                    onMouseEnter={() => setHoveredId(m.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onSelect={() => setSelectedId(selectedId === m.id ? null : m.id)}
                    onEdit={() => startEdit(m)}
                    onToggle={() => handleToggle(m.id, m.isActive)}
                    onDelete={() => handleDelete(m.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .ent-range {
          -webkit-appearance: none;
          height: 4px;
          background: linear-gradient(
            90deg,
            rgb(var(--ent-ink)) 0%,
            rgb(var(--ent-ink)) ${formData.priority * 10}%,
            rgb(var(--ent-hairline-2)) ${formData.priority * 10}%,
            rgb(var(--ent-hairline-2)) 100%
          );
          border-radius: 9999px;
          outline: none;
        }
        .ent-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #ffffff;
          cursor: pointer;
          box-shadow: 0 1px 2px rgba(28, 27, 24, 0.2);
          border: 1px solid rgb(var(--ent-ink));
        }
        .ent-range::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #ffffff;
          cursor: pointer;
          box-shadow: 0 1px 2px rgba(28, 27, 24, 0.2);
          border: 1px solid rgb(var(--ent-ink));
        }
      `}</style>
    </div>
  );
}

// ═══ Subcomponents ═══

function MetricCard({
  label,
  value,
  sublabel,
  showBar,
  barValue,
}: {
  label: string;
  value: string;
  sublabel: string;
  showBar?: boolean;
  barValue?: number;
}) {
  return (
    <div className="rounded-xl p-4 bg-elevated border border-hairline shadow-ent-xs">
      <div className="text-[9px] font-geistmono uppercase tracking-[0.2em] mb-2 text-ink-40">
        {label}
      </div>
      <div className="text-3xl font-medium tracking-tight text-ink tabular-nums">
        {value}
      </div>
      <div className="text-[10px] text-ink-40 mt-1 font-geistmono">
        {sublabel}
      </div>
      {showBar && typeof barValue === "number" && (
        <div className="mt-3 h-1 rounded-full overflow-hidden bg-surface-2">
          <div
            className="h-full rounded-full bg-accent transition-all duration-1000 ease-out"
            style={{ width: `${Math.min(100, barValue)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function ProfileChip({
  label,
  value,
  wide,
}: {
  label: string;
  value?: string;
  wide?: boolean;
}) {
  if (!value) return null;
  return (
    <div
      className={cx(
        "rounded-xl px-3 py-2 bg-surface border border-hairline",
        wide && "col-span-2 lg:col-span-4"
      )}
    >
      <div className="text-[9px] font-geistmono uppercase tracking-[0.25em] text-ink-40 mb-1">
        {label}
      </div>
      <div className="text-ink text-sm font-medium capitalize truncate">
        {value}
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  color,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "px-2.5 py-1 rounded-md text-[10px] font-geistmono uppercase tracking-wider border transition-colors duration-150 ease-ent",
        active && !color ? "bg-ink border-ink text-white" : !active ? "bg-white border-hairline-2 text-ink-40 hover:border-hairline" : ""
      )}
      style={active && color ? { background: `${color}14`, borderColor: `${color}55`, color } : undefined}
    >
      {label}
    </button>
  );
}

function MemoryCard({
  memory,
  selected,
  onMouseEnter,
  onMouseLeave,
  onSelect,
  onEdit,
  onToggle,
  onDelete,
}: {
  memory: Memory;
  selected: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onSelect: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const info = CATEGORY_INFO[memory.category];
  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onSelect}
      className={cx(
        "rounded-xl p-3 cursor-pointer border transition-colors duration-150 ease-ent",
        selected ? "bg-surface" : "bg-white border-hairline hover:border-hairline-2"
      )}
      style={{
        borderColor: selected ? info.color : undefined,
        opacity: memory.isActive ? 1 : 0.55,
      }}
    >
      <div className="flex items-start gap-2 mb-1">
        <div
          className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
          style={{ background: info.color }}
        />
        <div className="flex-1 min-w-0">
          <div className="text-[9px] font-geistmono uppercase tracking-wider mb-0.5" style={{ color: info.color }}>
            {info.short} · P{memory.priority}
            {!memory.isActive && " · dormida"}
          </div>
          <div className="text-ink text-xs font-semibold leading-tight">
            {memory.title}
          </div>
          <div className="text-ink-60 text-[11px] mt-1 line-clamp-2 leading-relaxed">
            {memory.content}
          </div>
        </div>
      </div>
      {selected && (
        <div className="flex gap-1.5 mt-2 pt-2 border-t border-hairline">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="flex-1 px-2 py-1 rounded-md text-[10px] font-geistmono uppercase tracking-wider transition-colors bg-surface border border-hairline-2 text-ink-60 hover:text-ink"
          >
            Editar
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className={cx(
              "flex-1 px-2 py-1 rounded-md text-[10px] font-geistmono uppercase tracking-wider transition-colors border",
              memory.isActive
                ? "bg-accent-soft border-accent/20 text-accent"
                : "bg-surface-2 border-hairline-2 text-ink-40"
            )}
          >
            {memory.isActive ? "Activa" : "Dormida"}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="flex-1 px-2 py-1 rounded-md text-[10px] font-geistmono uppercase tracking-wider transition-colors bg-red-50 border border-red-200 text-red-700"
          >
            Borrar
          </button>
        </div>
      )}
    </div>
  );
}

function EmptyNetwork({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-center px-6" style={{ minHeight: 480 }}>
      <div className="relative w-28 h-28 mb-6">
        <div className="absolute inset-0 rounded-2xl bg-surface-2 border border-hairline" />
        <div className="absolute inset-0 flex items-center justify-center">
          <svg className="w-12 h-12 text-ink-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <circle cx="12" cy="12" r="3" />
            <circle cx="5" cy="6" r="1.6" />
            <circle cx="19" cy="6" r="1.6" />
            <circle cx="5" cy="18" r="1.6" />
            <circle cx="19" cy="18" r="1.6" />
            <path strokeLinecap="round" d="M9.8 10.2 6.2 7M14.2 10.2 17.8 7M9.8 13.8 6.2 17M14.2 13.8 17.8 17" />
          </svg>
        </div>
      </div>
      <h2 className="text-2xl font-medium mb-2 text-ink">
        Sinapsis está por despertar
      </h2>
      <p className="text-ink-60 text-sm max-w-md leading-relaxed mb-6">
        Cada interacción con Aurum empieza a construir un cerebro personalizado de tu negocio.
        Formá tu primera conexión y mirá cómo empieza a crecer.
      </p>
      <button
        onClick={onCreate}
        className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-150 ease-ent bg-ink text-white hover:bg-ink/90"
      >
        + Formar primera conexión
      </button>
    </div>
  );
}
