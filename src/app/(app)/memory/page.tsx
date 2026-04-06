"use client";

import { useEffect, useState, useCallback } from "react";
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
  { icon: string; color: string; bg: string; label: string; description: string }
> = {
  BUSINESS_RULE: {
    icon: "\u{1F4CB}",
    color: "text-blue-700",
    bg: "bg-blue-50 border-blue-200",
    label: "Regla de Negocio",
    description: "Directiva estrat\u00e9gica permanente",
  },
  CORRECTION: {
    icon: "\u{1F504}",
    color: "text-orange-700",
    bg: "bg-orange-50 border-orange-200",
    label: "Correcci\u00f3n",
    description: "Hecho que el bot debe recordar",
  },
  CONTEXT: {
    icon: "\u{1F4C5}",
    color: "text-purple-700",
    bg: "bg-purple-50 border-purple-200",
    label: "Contexto",
    description: "Informaci\u00f3n sobre el negocio",
  },
  PREFERENCE: {
    icon: "\u{2699}\u{FE0F}",
    color: "text-green-700",
    bg: "bg-green-50 border-green-200",
    label: "Preferencia",
    description: "C\u00f3mo mostrar los datos",
  },
};

const CATEGORIES = Object.keys(CATEGORY_INFO) as Memory["category"][];

export default function MemoryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("ALL");
  const [saving, setSaving] = useState(false);

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
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.content.trim()) return;

    setSaving(true);
    try {
      if (editingId) {
        await fetch(`/api/memory/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
      } else {
        await fetch("/api/memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
      }
      resetForm();
      loadMemories();
    } catch (err) {
      console.error("Error saving:", err);
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
    if (!confirm("¿Eliminar esta memoria? Esta acción no se puede deshacer.")) return;
    try {
      await fetch(`/api/memory/${id}`, { method: "DELETE" });
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

  const filtered =
    filterCategory === "ALL"
      ? memories
      : memories.filter((m) => m.category === filterCategory);

  const activeCount = memories.filter((m) => m.isActive).length;
  const totalUsage = memories.reduce((sum, m) => sum + m.usageCount, 0);

  if (status === "loading" || loading) {
    return (
      <div className="light-canvas min-h-screen flex items-center justify-center">
        <div className="text-gray-400 text-sm">Cargando memoria del bot...</div>
      </div>
    );
  }

  return (
    <div className="light-canvas min-h-screen" style={{ height: "calc(100vh - 64px)" }}>
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Memoria del Bot</h2>
          <p className="text-gray-500 text-sm mt-1">
            {activeCount} memorias activas &middot; {totalUsage} usos totales &middot; Todo
            lo que NitroBot recuerda entre conversaciones
          </p>
        </div>
        <button
          onClick={() => {
            if (showForm) resetForm();
            else setShowForm(true);
          }}
          className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm font-medium shrink-0"
        >
          {showForm ? "Cancelar" : "+ Nueva Memoria"}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <h3 className="font-bold text-gray-800 mb-4 text-lg">
            {editingId ? "Editar Memoria" : "Crear Nueva Memoria"}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Categoría
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {CATEGORIES.map((cat) => {
                  const info = CATEGORY_INFO[cat];
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setFormData({ ...formData, category: cat })}
                      className={`p-3 rounded-lg border text-left transition text-sm ${
                        formData.category === cat
                          ? `${info.bg} border-2 font-medium`
                          : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                      }`}
                    >
                      <span className="text-lg">{info.icon}</span>
                      <div className={`mt-1 font-medium ${formData.category === cat ? info.color : "text-gray-700"}`}>
                        {info.label}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{info.description}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Título
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Ej: Comparar ventas interanualmente"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>

            {/* Content */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contenido (lo que el bot debe recordar)
              </label>
              <textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="Describí el aprendizaje, regla o contexto que el bot debe tener en cuenta..."
                rows={4}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
              />
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Prioridad: <span className="font-bold text-indigo-600">{formData.priority}/10</span>
                <span className="text-gray-400 ml-2 font-normal">
                  {formData.priority >= 8
                    ? "(Crítica — siempre se inyecta)"
                    : formData.priority >= 5
                    ? "(Normal)"
                    : "(Baja — se inyecta si hay espacio)"}
                </span>
              </label>
              <input
                type="range"
                min="1"
                max="10"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                className="w-full accent-indigo-600"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={saving || !formData.title.trim() || !formData.content.trim()}
                className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm font-medium disabled:opacity-50"
              >
                {saving ? "Guardando..." : editingId ? "Actualizar" : "Crear Memoria"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition text-sm"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setFilterCategory("ALL")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            filterCategory === "ALL"
              ? "bg-gray-800 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Todas ({memories.length})
        </button>
        {CATEGORIES.map((cat) => {
          const info = CATEGORY_INFO[cat];
          const count = memories.filter((m) => m.category === cat).length;
          return (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                filterCategory === cat
                  ? "bg-gray-800 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {info.icon} {info.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Memory list */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border-2 border-dashed border-gray-200 p-12 text-center">
            <div className="text-4xl mb-3">{filterCategory === "ALL" ? "\u{1F9E0}" : CATEGORY_INFO[filterCategory as Memory["category"]]?.icon}</div>
            <p className="text-gray-500 font-medium">
              {filterCategory === "ALL"
                ? "No hay memorias todav\u00eda"
                : `No hay memorias de tipo ${CATEGORY_INFO[filterCategory as Memory["category"]]?.label}`}
            </p>
            <p className="text-gray-400 text-sm mt-1">
              Cre\u00e1 tu primera memoria para que NitroBot aprenda sobre tu negocio
            </p>
          </div>
        ) : (
          filtered.map((memory) => {
            const info = CATEGORY_INFO[memory.category];
            return (
              <div
                key={memory.id}
                className={`bg-white rounded-xl border shadow-sm p-5 transition ${
                  !memory.isActive ? "opacity-50" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Category + badges */}
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${info.bg} ${info.color}`}
                      >
                        {info.icon} {info.label}
                      </span>
                      {memory.priority >= 8 && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                          Alta prioridad
                        </span>
                      )}
                      {!memory.isActive && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">
                          Inactiva
                        </span>
                      )}
                      {memory.source === "AUTO_EXTRACTED" && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-200">
                          Auto-extra\u00edda
                        </span>
                      )}
                    </div>

                    {/* Title + content */}
                    <h4 className="font-semibold text-gray-800 mb-1">{memory.title}</h4>
                    <p className="text-sm text-gray-600 leading-relaxed">{memory.content}</p>

                    {/* Meta */}
                    <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                      <span>
                        Creada:{" "}
                        {new Date(memory.createdAt).toLocaleDateString("es-AR", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                      {memory.usageCount > 0 && (
                        <span>
                          Usada {memory.usageCount} {memory.usageCount === 1 ? "vez" : "veces"}
                        </span>
                      )}
                      {memory.lastUsedAt && (
                        <span>
                          \u00daltimo uso:{" "}
                          {new Date(memory.lastUsedAt).toLocaleDateString("es-AR", {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      )}
                      <span className="text-gray-300">Prioridad: {memory.priority}/10</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      onClick={() => handleToggle(memory.id, memory.isActive)}
                      className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition ${
                        memory.isActive
                          ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                          : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                      }`}
                    >
                      {memory.isActive ? "Activa" : "Inactiva"}
                    </button>
                    <button
                      onClick={() => startEdit(memory)}
                      className="px-3 py-1.5 text-xs rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 font-medium transition"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(memory.id)}
                      className="px-3 py-1.5 text-xs rounded-lg border border-red-200 text-red-500 hover:bg-red-50 font-medium transition"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
