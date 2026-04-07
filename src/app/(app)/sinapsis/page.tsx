"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

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

const CATEGORY_INFO: Record<
  Memory["category"],
  { label: string; short: string; color: string; description: string; angle: number }
> = {
  BUSINESS_RULE: {
    label: "Regla de Negocio",
    short: "Regla",
    color: "#fbbf24",
    description: "Directiva estratégica permanente",
    angle: -90,
  },
  CONTEXT: {
    label: "Contexto",
    short: "Contexto",
    color: "#fde68a",
    description: "Información sobre el negocio",
    angle: 0,
  },
  PREFERENCE: {
    label: "Preferencia",
    short: "Preferencia",
    color: "#f59e0b",
    description: "Cómo mostrar los datos",
    angle: 90,
  },
  CORRECTION: {
    label: "Corrección",
    short: "Corrección",
    color: "#d97706",
    description: "Hecho que Aurum debe recordar",
    angle: 180,
  },
};

const CATEGORIES = Object.keys(CATEGORY_INFO) as Memory["category"][];

export default function SinapsisPage() {
  const { status } = useSession();
  const router = useRouter();
  const [memories, setMemories] = useState<Memory[]>([]);
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
      const res = await fetch("/api/memory?includeInactive=true");
      const data = await res.json();
      if (data.memories) setMemories(data.memories);
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
        opacity: n.memory.isActive ? 0.22 : 0.08,
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
          opacity: 0.12,
          active: a.memory.isActive && b.memory.isActive,
        });
      }
    });
    return lines;
  }, [nodes]);

  // ═══ Loading ═══
  if (status === "loading" || loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "radial-gradient(ellipse at center, #0a0a0f 0%, #050508 100%)" }}
      >
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-12 h-12">
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(251,191,36,0.6), rgba(245,158,11,0.2) 60%, transparent 80%)",
                animation: "aurumBreath 2s ease-in-out infinite",
                boxShadow: "0 0 40px rgba(251,191,36,0.4)",
              }}
            />
          </div>
          <p className="text-[#fde68a]/70 text-xs font-mono tracking-[0.3em] uppercase">
            Despertando Sinapsis
          </p>
        </div>
      </div>
    );
  }

  // ═══ Main render ═══
  const hasMemories = memories.length > 0;

  return (
    <div
      className="min-h-screen -m-4 lg:-m-6 p-4 lg:p-8 relative overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at 30% 10%, rgba(251,191,36,0.06) 0%, transparent 50%), radial-gradient(ellipse at 70% 90%, rgba(245,158,11,0.04) 0%, transparent 50%), linear-gradient(180deg, #0a0a0f 0%, #050508 100%)",
      }}
    >
      {/* Ambient dust */}
      <div
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          background:
            "radial-gradient(2px 2px at 12% 30%, rgba(251,191,36,0.4), transparent), radial-gradient(1px 1px at 80% 20%, rgba(253,224,71,0.3), transparent), radial-gradient(1px 1px at 40% 70%, rgba(251,191,36,0.25), transparent), radial-gradient(2px 2px at 90% 60%, rgba(245,158,11,0.3), transparent)",
        }}
      />

      {/* Header */}
      <header className="relative z-10 max-w-[1400px] mx-auto mb-8">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div
                className="px-2.5 py-1 rounded-md text-[9px] font-bold font-mono uppercase tracking-[0.25em]"
                style={{
                  background: "rgba(251,191,36,0.12)",
                  color: "#fbbf24",
                  border: "1px solid rgba(251,191,36,0.3)",
                  textShadow: "0 0 10px rgba(251,191,36,0.5)",
                }}
              >
                Aurum · Memoria Viva
              </div>
            </div>
            <h1
              className="text-4xl lg:text-5xl font-bold tracking-tight"
              style={{
                background:
                  "linear-gradient(135deg, #fef3c7 0%, #fbbf24 40%, #f59e0b 70%, #d97706 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                letterSpacing: "-0.02em",
              }}
            >
              Sinapsis
            </h1>
            <p className="text-[#fde68a]/60 text-sm mt-2 max-w-xl leading-relaxed">
              Cada conversación refuerza una conexión. Cuanto más la usás, más te conoce.{" "}
              <span className="text-[#fbbf24]/80">Este cerebro es irreemplazable — es tuyo.</span>
            </p>
          </div>
          <button
            onClick={() => {
              if (showForm) resetForm();
              else setShowForm(true);
            }}
            className="group relative px-5 py-2.5 rounded-xl text-sm font-semibold overflow-hidden transition-all duration-300 hover:scale-[1.02]"
            style={{
              background:
                "linear-gradient(135deg, rgba(251,191,36,0.2), rgba(245,158,11,0.1))",
              border: "1px solid rgba(251,191,36,0.4)",
              color: "#fde68a",
              boxShadow: "0 0 24px rgba(251,191,36,0.15), inset 0 1px 0 rgba(253,224,71,0.2)",
            }}
          >
            <span
              className="absolute inset-0 pointer-events-none aurum-shimmer opacity-60"
              style={{
                background:
                  "linear-gradient(110deg, transparent 30%, rgba(253,224,71,0.15) 50%, transparent 70%)",
                backgroundSize: "200% 100%",
              }}
            />
            <span className="relative">{showForm ? "Cancelar" : "+ Formar conexión"}</span>
          </button>
        </div>

        {/* Metrics strip */}
        <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            label="Conexiones formadas"
            value={metrics.connections.toString()}
            sublabel={`${metrics.totalConnections} totales`}
            accent="#fbbf24"
          />
          <MetricCard
            label="Días aprendiendo"
            value={metrics.daysLearning.toString()}
            sublabel="sin interrupción"
            accent="#fde68a"
          />
          <MetricCard
            label="Densidad cognitiva"
            value={`${metrics.density}`}
            sublabel="de 100"
            accent="#f59e0b"
            showBar
            barValue={metrics.density}
          />
          <MetricCard
            label="Activaciones"
            value={metrics.totalUsage.toString()}
            sublabel="usos acumulados"
            accent="#d97706"
          />
        </div>
      </header>

      {/* Form panel */}
      {showForm && (
        <div className="relative z-10 max-w-[1400px] mx-auto mb-8">
          <div
            className="rounded-2xl p-6"
            style={{
              background:
                "linear-gradient(135deg, rgba(251,191,36,0.06), rgba(15,15,20,0.6))",
              border: "1px solid rgba(251,191,36,0.25)",
              backdropFilter: "blur(12px)",
              boxShadow: "0 0 40px rgba(251,191,36,0.08), inset 0 1px 0 rgba(253,224,71,0.1)",
            }}
          >
            <h3 className="text-[#fde68a] font-semibold text-lg mb-4">
              {editingId ? "Editar conexión" : "Formar nueva conexión"}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-[#fde68a]/60 mb-2">
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
                        className="p-3 rounded-xl text-left transition-all duration-300"
                        style={{
                          background: active
                            ? `linear-gradient(135deg, ${info.color}20, ${info.color}05)`
                            : "rgba(255,255,255,0.02)",
                          border: active
                            ? `1px solid ${info.color}60`
                            : "1px solid rgba(255,255,255,0.06)",
                          boxShadow: active ? `0 0 18px ${info.color}25` : "none",
                        }}
                      >
                        <div
                          className="text-xs font-bold font-mono uppercase tracking-wider mb-1"
                          style={{ color: active ? info.color : "rgba(253,230,138,0.6)" }}
                        >
                          {info.short}
                        </div>
                        <div className="text-[10px] text-[#fde68a]/50 leading-snug">
                          {info.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-[#fde68a]/60 mb-2">
                  Nombre de la conexión
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Ej: Comparar ventas interanualmente"
                  className="w-full rounded-xl px-4 py-3 text-sm text-[#fde68a] outline-none transition-all"
                  style={{
                    background: "rgba(0,0,0,0.4)",
                    border: "1px solid rgba(251,191,36,0.25)",
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-[#fde68a]/60 mb-2">
                  Qué debe recordar Aurum
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Describí el aprendizaje, regla o contexto que Aurum debe tener en cuenta..."
                  rows={4}
                  className="w-full rounded-xl px-4 py-3 text-sm text-[#fde68a] outline-none resize-none transition-all"
                  style={{
                    background: "rgba(0,0,0,0.4)",
                    border: "1px solid rgba(251,191,36,0.25)",
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-[#fde68a]/60 mb-2">
                  Intensidad:{" "}
                  <span className="text-[#fbbf24] font-bold">{formData.priority}/10</span>
                  <span className="text-[#fde68a]/40 ml-2 normal-case tracking-normal">
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
                  className="w-full aurum-range"
                />
              </div>

              {saveError && (
                <div
                  className="p-3 rounded-xl text-sm"
                  style={{
                    background: "rgba(239,68,68,0.1)",
                    border: "1px solid rgba(239,68,68,0.3)",
                    color: "#fca5a5",
                  }}
                >
                  {saveError}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={saving || !formData.title.trim() || !formData.content.trim()}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(251,191,36,0.3), rgba(245,158,11,0.2))",
                    border: "1px solid rgba(251,191,36,0.5)",
                    color: "#fef3c7",
                    boxShadow: "0 0 24px rgba(251,191,36,0.15)",
                  }}
                >
                  {saving ? "Formando..." : editingId ? "Actualizar conexión" : "Formar conexión"}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all text-[#fde68a]/70 hover:text-[#fde68a]"
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
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
          className="rounded-2xl p-6 relative overflow-hidden"
          style={{
            background:
              "linear-gradient(135deg, rgba(251,191,36,0.04), rgba(10,10,15,0.6))",
            border: "1px solid rgba(251,191,36,0.18)",
            backdropFilter: "blur(8px)",
            minHeight: 560,
          }}
        >
          <div className="absolute top-4 left-6 right-6 flex items-center justify-between pointer-events-none">
            <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#fde68a]/50">
              Red neuronal · Aurum
            </div>
            <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#fde68a]/50">
              {metrics.coveredCategories}/{CATEGORIES.length} dominios
            </div>
          </div>

          {!hasMemories ? (
            <EmptyNetwork onCreate={() => setShowForm(true)} />
          ) : (
            <div className="w-full h-full flex items-center justify-center pt-8">
              <svg
                viewBox="0 0 520 520"
                className="w-full max-w-[520px] h-auto"
                style={{ filter: "drop-shadow(0 0 40px rgba(251,191,36,0.08))" }}
              >
                {/* Orbit rings */}
                {[100, 160, 220].map((r) => (
                  <circle
                    key={r}
                    cx={260}
                    cy={260}
                    r={r}
                    fill="none"
                    stroke="rgba(251,191,36,0.06)"
                    strokeWidth={0.5}
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
                    stroke={c.active ? "#fbbf24" : "#fde68a"}
                    strokeWidth={0.6}
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
                      fontFamily="monospace"
                      fill={info.color}
                      opacity={0.55}
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
                        style={{
                          filter: highlight
                            ? `drop-shadow(0 0 8px ${n.color})`
                            : `drop-shadow(0 0 3px ${n.color}80)`,
                          transition: "all 300ms ease",
                        }}
                      />
                    </g>
                  );
                })}

                {/* Core: Aurum */}
                <g>
                  <circle
                    cx={260}
                    cy={260}
                    r={28}
                    fill="url(#aurumCoreGradient)"
                    style={{
                      filter: "drop-shadow(0 0 24px rgba(251,191,36,0.6))",
                    }}
                  />
                  <circle
                    cx={260}
                    cy={260}
                    r={16}
                    fill="#fef3c7"
                    opacity={0.9}
                  />
                  <text
                    x={260}
                    y={265}
                    textAnchor="middle"
                    fontSize={10}
                    fontFamily="monospace"
                    fill="#78350f"
                    fontWeight={700}
                    style={{ textTransform: "uppercase", letterSpacing: "0.15em" }}
                  >
                    AURUM
                  </text>
                </g>

                <defs>
                  <radialGradient id="aurumCoreGradient" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#fef3c7" stopOpacity="1" />
                    <stop offset="40%" stopColor="#fbbf24" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#d97706" stopOpacity="0.3" />
                  </radialGradient>
                </defs>
              </svg>
            </div>
          )}

          {/* Hovered node tooltip */}
          {hoveredId && hasMemories && (() => {
            const m = memories.find((mm) => mm.id === hoveredId);
            if (!m) return null;
            return (
              <div
                className="absolute bottom-4 left-4 right-4 rounded-xl p-3 pointer-events-none"
                style={{
                  background: "rgba(10,10,15,0.85)",
                  border: `1px solid ${CATEGORY_INFO[m.category].color}50`,
                  backdropFilter: "blur(12px)",
                  boxShadow: `0 0 20px ${CATEGORY_INFO[m.category].color}20`,
                  animation: "aurumFadeUp 200ms ease",
                }}
              >
                <div
                  className="text-[9px] font-mono uppercase tracking-widest mb-1"
                  style={{ color: CATEGORY_INFO[m.category].color }}
                >
                  {CATEGORY_INFO[m.category].short} · prioridad {m.priority}
                </div>
                <div className="text-[#fde68a] text-sm font-semibold">{m.title}</div>
                <div className="text-[#fde68a]/60 text-xs mt-0.5 line-clamp-2">
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
              color="#fbbf24"
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
            className="rounded-2xl p-3 flex-1 overflow-y-auto"
            style={{
              background:
                "linear-gradient(180deg, rgba(251,191,36,0.03), rgba(10,10,15,0.4))",
              border: "1px solid rgba(251,191,36,0.12)",
              maxHeight: 560,
            }}
          >
            {filtered.length === 0 ? (
              <div className="text-center py-12 text-[#fde68a]/40 text-sm">
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
        .aurum-range {
          -webkit-appearance: none;
          height: 4px;
          background: linear-gradient(
            90deg,
            #fbbf24 0%,
            #fbbf24 ${formData.priority * 10}%,
            rgba(251, 191, 36, 0.15) ${formData.priority * 10}%,
            rgba(251, 191, 36, 0.15) 100%
          );
          border-radius: 9999px;
          outline: none;
        }
        .aurum-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: radial-gradient(circle, #fef3c7 30%, #fbbf24 100%);
          cursor: pointer;
          box-shadow: 0 0 10px rgba(251, 191, 36, 0.6);
          border: 1px solid rgba(251, 191, 36, 0.8);
        }
        .aurum-range::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: radial-gradient(circle, #fef3c7 30%, #fbbf24 100%);
          cursor: pointer;
          box-shadow: 0 0 10px rgba(251, 191, 36, 0.6);
          border: 1px solid rgba(251, 191, 36, 0.8);
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
  accent,
  showBar,
  barValue,
}: {
  label: string;
  value: string;
  sublabel: string;
  accent: string;
  showBar?: boolean;
  barValue?: number;
}) {
  return (
    <div
      className="rounded-xl p-4 relative overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, rgba(251,191,36,0.06), rgba(10,10,15,0.4))",
        border: "1px solid rgba(251,191,36,0.15)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        className="text-[9px] font-mono uppercase tracking-[0.2em] mb-2"
        style={{ color: `${accent}aa` }}
      >
        {label}
      </div>
      <div
        className="text-3xl font-bold tracking-tight"
        style={{
          color: accent,
          textShadow: `0 0 20px ${accent}50`,
        }}
      >
        {value}
      </div>
      <div className="text-[10px] text-[#fde68a]/40 mt-1 font-mono">
        {sublabel}
      </div>
      {showBar && typeof barValue === "number" && (
        <div className="mt-3 h-1 rounded-full overflow-hidden" style={{ background: "rgba(251,191,36,0.1)" }}>
          <div
            className="h-full rounded-full transition-all duration-1000 ease-out"
            style={{
              width: `${Math.min(100, barValue)}%`,
              background: `linear-gradient(90deg, ${accent}, #fde68a)`,
              boxShadow: `0 0 8px ${accent}`,
            }}
          />
        </div>
      )}
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
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider transition-all"
      style={{
        background: active ? `${color}20` : "rgba(255,255,255,0.02)",
        border: active ? `1px solid ${color}50` : "1px solid rgba(255,255,255,0.06)",
        color: active ? color : "rgba(253,230,138,0.5)",
        boxShadow: active ? `0 0 12px ${color}30` : "none",
      }}
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
      className="rounded-xl p-3 cursor-pointer transition-all duration-300"
      style={{
        background: selected
          ? `linear-gradient(135deg, ${info.color}12, rgba(10,10,15,0.6))`
          : "rgba(255,255,255,0.02)",
        border: selected
          ? `1px solid ${info.color}60`
          : "1px solid rgba(255,255,255,0.05)",
        boxShadow: selected ? `0 0 18px ${info.color}20` : "none",
        opacity: memory.isActive ? 1 : 0.5,
      }}
    >
      <div className="flex items-start gap-2 mb-1">
        <div
          className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
          style={{
            background: info.color,
            boxShadow: `0 0 6px ${info.color}`,
          }}
        />
        <div className="flex-1 min-w-0">
          <div
            className="text-[9px] font-mono uppercase tracking-wider mb-0.5"
            style={{ color: `${info.color}cc` }}
          >
            {info.short} · P{memory.priority}
            {!memory.isActive && " · dormida"}
          </div>
          <div className="text-[#fde68a] text-xs font-semibold leading-tight">
            {memory.title}
          </div>
          <div className="text-[#fde68a]/50 text-[11px] mt-1 line-clamp-2 leading-relaxed">
            {memory.content}
          </div>
        </div>
      </div>
      {selected && (
        <div className="flex gap-1.5 mt-2 pt-2 border-t border-white/5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="flex-1 px-2 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider transition-colors"
            style={{
              background: "rgba(251,191,36,0.1)",
              border: "1px solid rgba(251,191,36,0.25)",
              color: "#fbbf24",
            }}
          >
            Editar
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="flex-1 px-2 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider transition-colors"
            style={{
              background: memory.isActive ? "rgba(34,197,94,0.1)" : "rgba(156,163,175,0.1)",
              border: memory.isActive
                ? "1px solid rgba(34,197,94,0.25)"
                : "1px solid rgba(156,163,175,0.25)",
              color: memory.isActive ? "#22c55e" : "#9ca3af",
            }}
          >
            {memory.isActive ? "Activa" : "Dormida"}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="flex-1 px-2 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider transition-colors"
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
              color: "#fca5a5",
            }}
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
      <div className="relative w-32 h-32 mb-6">
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(251,191,36,0.5) 0%, rgba(245,158,11,0.2) 40%, transparent 70%)",
            animation: "aurumBreath 3s ease-in-out infinite",
            boxShadow: "0 0 80px rgba(251,191,36,0.3)",
          }}
        />
        <div
          className="absolute inset-8 rounded-full"
          style={{
            background: "radial-gradient(circle, #fef3c7 30%, #fbbf24 100%)",
            boxShadow: "0 0 30px rgba(251,191,36,0.8)",
          }}
        />
      </div>
      <h2
        className="text-2xl font-bold mb-2"
        style={{
          background: "linear-gradient(135deg, #fef3c7, #fbbf24 50%, #d97706)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        Sinapsis está por despertar
      </h2>
      <p className="text-[#fde68a]/60 text-sm max-w-md leading-relaxed mb-6">
        Cada interacción con Aurum empieza a construir un cerebro personalizado de tu negocio.
        Formá tu primera conexión y mirá cómo empieza a crecer.
      </p>
      <button
        onClick={onCreate}
        className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-105"
        style={{
          background: "linear-gradient(135deg, rgba(251,191,36,0.25), rgba(245,158,11,0.15))",
          border: "1px solid rgba(251,191,36,0.5)",
          color: "#fef3c7",
          boxShadow: "0 0 30px rgba(251,191,36,0.25)",
        }}
      >
        + Formar primera conexión
      </button>
    </div>
  );
}
