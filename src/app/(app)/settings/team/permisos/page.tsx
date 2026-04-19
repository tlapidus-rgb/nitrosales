// @ts-nocheck
"use client";

/**
 * /settings/team/permisos — Fase 7 fix
 * ─────────────────────────────────────────────────────────────
 * Matriz editable role × section × access_level.
 * Agrupa secciones por categoría (Finanzas / Ventas / Marketing /
 * Operaciones / Config).
 * 4 niveles: none (gris) / read (azul) / write (violet) / admin (verde).
 * Owner siempre admin (read-only).
 */

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Shield,
  ShieldCheck,
  User,
  Save,
  RotateCcw,
  Check,
  X,
  ArrowLeft,
} from "lucide-react";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";

type Role = "OWNER" | "ADMIN" | "MEMBER";
type AccessLevel = "none" | "read" | "write" | "admin";
type Section =
  | "pulso" | "estado" | "costos" | "escenarios" | "fiscal"
  | "orders" | "products" | "mercadolibre"
  | "campaigns" | "bondly" | "aura" | "competencia"
  | "alertas"
  | "settings_org" | "settings_team" | "settings_integrations"
  | "settings_billing" | "settings_security" | "settings_api_keys";

interface SectionMeta {
  key: Section;
  label: string;
  category: "finanzas" | "ventas" | "marketing" | "operaciones" | "config";
}

const LEVELS: {
  value: AccessLevel;
  label: string;
  color: string;
  bg: string;
  hint: string;
}[] = [
  { value: "none", label: "Sin acceso", color: "#94a3b8", bg: "rgba(148,163,184,0.12)", hint: "El tab ni siquiera aparece" },
  { value: "read", label: "Solo ver", color: "#0ea5e9", bg: "rgba(14,165,233,0.10)", hint: "Ve pero no modifica" },
  { value: "write", label: "Editar", color: "#8b5cf6", bg: "rgba(139,92,246,0.10)", hint: "Ve + modifica existente" },
  { value: "admin", label: "Todo", color: "#10b981", bg: "rgba(16,185,129,0.10)", hint: "Crear + modificar + borrar" },
];

const ROLE_META: Record<Role, { label: string; icon: any; color: string }> = {
  OWNER: { label: "Owner", icon: ShieldCheck, color: "#8b5cf6" },
  ADMIN: { label: "Admin", icon: Shield, color: "#0ea5e9" },
  MEMBER: { label: "Editor", icon: User, color: "#64748b" },
};

const CATEGORY_META: Record<
  string,
  { label: string; color: string }
> = {
  finanzas: { label: "Finanzas", color: "#f59e0b" },
  ventas: { label: "Ventas", color: "#10b981" },
  marketing: { label: "Marketing", color: "#ec4899" },
  operaciones: { label: "Operaciones", color: "#0ea5e9" },
  config: { label: "Configuración", color: "#64748b" },
};

export default function PermisosPage() {
  const [matrix, setMatrix] = useState<Record<Role, Record<Section, AccessLevel>> | null>(null);
  const [original, setOriginal] = useState<Record<Role, Record<Section, AccessLevel>> | null>(null);
  const [defaults, setDefaults] = useState<Record<Role, Record<Section, AccessLevel>> | null>(null);
  const [sections, setSections] = useState<SectionMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/permissions");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setMatrix(json.matrix);
      setOriginal(JSON.parse(JSON.stringify(json.matrix)));
      setDefaults(json.defaults);
      setSections(json.sections ?? []);
    } catch (e: any) {
      setToast({ msg: e.message || "Error cargando permisos", kind: "err" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const showToast = (msg: string, kind: "ok" | "err" = "ok") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3000);
  };

  const handleChange = (role: Role, section: Section, level: AccessLevel) => {
    if (!matrix) return;
    if (role === "OWNER") return; // Owner fijo en admin
    setMatrix({
      ...matrix,
      [role]: {
        ...matrix[role],
        [section]: level,
      },
    });
  };

  const save = async () => {
    if (!matrix) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matrix }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setOriginal(JSON.parse(JSON.stringify(json.matrix)));
      setMatrix(json.matrix);
      showToast("Permisos guardados");
    } catch (e: any) {
      showToast(e.message, "err");
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = () => {
    if (!defaults) return;
    if (!confirm("¿Restablecer permisos a los valores por defecto?")) return;
    setMatrix(JSON.parse(JSON.stringify(defaults)));
  };

  const dirty = useMemo(() => {
    if (!matrix || !original) return false;
    return JSON.stringify(matrix) !== JSON.stringify(original);
  }, [matrix, original]);

  const groupedSections = useMemo(() => {
    const groups: Record<string, SectionMeta[]> = {};
    for (const s of sections) {
      if (!groups[s.category]) groups[s.category] = [];
      groups[s.category].push(s);
    }
    return groups;
  }, [sections]);

  if (loading || !matrix) {
    return (
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-slate-100/50" />
        <div className="h-96 animate-pulse rounded-2xl border border-slate-200 bg-slate-100/50" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link
              href="/settings/team"
              className="mb-2 inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-700"
            >
              <ArrowLeft className="h-3 w-3" />
              Volver a Miembros
            </Link>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-violet-600" />
              <h2 className="text-sm font-semibold tracking-tight text-slate-900">
                Permisos por rol
              </h2>
            </div>
            <p className="mt-1 text-[12px] text-slate-500">
              Configurá qué puede ver y modificar cada rol. El Owner siempre
              tiene acceso total.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={resetToDefaults}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restablecer defaults
            </button>
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={save}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>

        {/* Leyenda */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {LEVELS.map((l) => (
            <div
              key={l.value}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"
            >
              <div
                className="h-3 w-3 rounded"
                style={{ background: l.color }}
              />
              <div>
                <div className="text-[11px] font-semibold" style={{ color: l.color }}>
                  {l.label}
                </div>
                <div className="text-[9px] text-slate-500">{l.hint}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Matriz por categoria */}
      {Object.entries(groupedSections).map(([cat, catSections]) => {
        const catMeta = CATEGORY_META[cat] ?? { label: cat, color: "#64748b" };
        return (
          <div
            key={cat}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
          >
            <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/50 px-6 py-3">
              <div
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: catMeta.color }}
              />
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                {catMeta.label}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="border-b border-slate-100 bg-slate-50/30">
                  <tr>
                    <th className="px-6 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Sección
                    </th>
                    {(["OWNER", "ADMIN", "MEMBER"] as Role[]).map((role) => {
                      const RoleIcon = ROLE_META[role].icon;
                      return (
                        <th
                          key={role}
                          className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider"
                          style={{ color: ROLE_META[role].color }}
                        >
                          <span className="inline-flex items-center gap-1">
                            <RoleIcon className="h-3 w-3" />
                            {ROLE_META[role].label}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {catSections.map((s) => (
                    <tr key={s.key}>
                      <td className="px-6 py-2.5 font-medium text-slate-700">
                        {s.label}
                      </td>
                      {(["OWNER", "ADMIN", "MEMBER"] as Role[]).map((role) => {
                        const currentLevel = matrix[role][s.key];
                        const isOwner = role === "OWNER";
                        return (
                          <td key={role} className="px-3 py-2 text-center">
                            <select
                              disabled={isOwner}
                              value={currentLevel}
                              onChange={(e) =>
                                handleChange(role, s.key, e.target.value as AccessLevel)
                              }
                              className="w-full max-w-[120px] rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
                              style={{
                                color:
                                  LEVELS.find((l) => l.value === currentLevel)?.color ?? "#64748b",
                              }}
                            >
                              {LEVELS.map((l) => (
                                <option key={l.value} value={l.value}>
                                  {l.label}
                                </option>
                              ))}
                            </select>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-medium text-white shadow-lg"
          role="status"
          aria-live="polite"
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: toast.kind === "ok" ? "#10b981" : "#ef4444",
              boxShadow:
                toast.kind === "ok"
                  ? "0 0 8px rgba(16,185,129,0.7)"
                  : "0 0 8px rgba(239,68,68,0.7)",
              animation: "pulseDotPerm 1.4s ease-in-out infinite",
            }}
          />
          {toast.kind === "ok" ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <X className="h-3.5 w-3.5 text-rose-400" />
          )}
          {toast.msg}
        </div>
      )}

      <style jsx global>{`
        @keyframes pulseDotPerm {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.55; transform: scale(1.4); }
        }
      `}</style>
    </div>
  );
}
