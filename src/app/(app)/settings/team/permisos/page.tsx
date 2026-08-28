// @ts-nocheck
"use client";

/**
 * /settings/team/permisos — Fase 7 QA (tabs Sistema | Custom)
 * ─────────────────────────────────────────────────────────────
 * Dos tabs superiores:
 *   - Sistema: matriz OWNER/ADMIN/MEMBER (como antes).
 *   - Custom: lista de roles custom + editor + boton Crear.
 *
 * 4 niveles por seccion: none/read/write/admin.
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
  Plus,
  Trash2,
  Briefcase,
  UsersRound,
  Palette,
  Info,
} from "lucide-react";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";

type Role = "OWNER" | "ADMIN" | "MEMBER";
type AccessLevel = "none" | "read" | "write" | "admin";
type Section = string;

interface SectionMeta {
  key: Section;
  label: string;
  category: "finanzas" | "ventas" | "marketing" | "operaciones" | "config";
}

interface CustomRole {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  permissions: Record<Section, AccessLevel>;
  createdAt: string;
  updatedAt?: string;
  _count?: { users: number };
}

const LEVELS: {
  value: AccessLevel;
  label: string;
  color: string;
  bg: string;
  hint: string;
}[] = [
  { value: "none", label: "Sin acceso", color: "#83807A", bg: "rgba(131,128,122,0.12)", hint: "El tab ni siquiera aparece" },
  { value: "read", label: "Solo ver", color: "#0ea5e9", bg: "rgba(14,165,233,0.10)", hint: "Ve pero no modifica" },
  { value: "write", label: "Editar", color: "#8b5cf6", bg: "rgba(139,92,246,0.10)", hint: "Ve + modifica existente" },
  { value: "admin", label: "Todo", color: "#10b981", bg: "rgba(16,185,129,0.10)", hint: "Crear + modificar + borrar" },
];

const ROLE_META: Record<Role, { label: string; icon: any; color: string }> = {
  OWNER: { label: "Owner", icon: ShieldCheck, color: "#8b5cf6" },
  ADMIN: { label: "Admin", icon: Shield, color: "#0ea5e9" },
  MEMBER: { label: "Editor", icon: User, color: "#6B685F" },
};

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  finanzas: { label: "Finanzas", color: "#f59e0b" },
  ventas: { label: "Ventas", color: "#10b981" },
  marketing: { label: "Marketing", color: "#ec4899" },
  operaciones: { label: "Operaciones", color: "#0ea5e9" },
  config: { label: "Configuración", color: "#6B685F" },
};

const COLOR_PALETTE = [
  "#0ea5e9", "#10b981", "#8b5cf6", "#f59e0b",
  "#ef4444", "#ec4899", "#14b8a6", "#6B685F",
];

export default function PermisosPage() {
  const [tab, setTab] = useState<"system" | "custom">("system");

  // System matrix
  const [matrix, setMatrix] = useState<Record<Role, Record<Section, AccessLevel>> | null>(null);
  const [originalMatrix, setOriginalMatrix] = useState<Record<Role, Record<Section, AccessLevel>> | null>(null);
  const [defaults, setDefaults] = useState<Record<Role, Record<Section, AccessLevel>> | null>(null);
  const [sections, setSections] = useState<SectionMeta[]>([]);

  // Custom roles
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [selectedCustomId, setSelectedCustomId] = useState<string | null>(null);
  const [editedCustom, setEditedCustom] = useState<CustomRole | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [permsRes, rolesRes] = await Promise.all([
        fetch("/api/settings/permissions"),
        fetch("/api/settings/custom-roles"),
      ]);
      const permsJson = await permsRes.json();
      const rolesJson = await rolesRes.json();
      if (!permsRes.ok) throw new Error(permsJson.error || "Error cargando permisos");
      if (!rolesRes.ok) throw new Error(rolesJson.error || "Error cargando roles custom");
      setMatrix(permsJson.matrix);
      setOriginalMatrix(JSON.parse(JSON.stringify(permsJson.matrix)));
      setDefaults(permsJson.defaults);
      setSections(permsJson.sections ?? []);
      setCustomRoles(rolesJson.roles ?? []);
    } catch (e: any) {
      showToast(e.message || "Error cargando", "err");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const showToast = (msg: string, kind: "ok" | "err" = "ok") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3000);
  };

  // System handlers
  const handleSystemChange = (role: Role, section: Section, level: AccessLevel) => {
    if (!matrix || role === "OWNER") return;
    setMatrix({ ...matrix, [role]: { ...matrix[role], [section]: level } });
  };

  const saveSystem = async () => {
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
      setOriginalMatrix(JSON.parse(JSON.stringify(json.matrix)));
      setMatrix(json.matrix);
      showToast("Permisos del sistema guardados");
    } catch (e: any) {
      showToast(e.message, "err");
    } finally {
      setSaving(false);
    }
  };

  const resetSystem = () => {
    if (!defaults) return;
    if (!confirm("¿Restablecer permisos del sistema a los valores por defecto?")) return;
    setMatrix(JSON.parse(JSON.stringify(defaults)));
  };

  const systemDirty = useMemo(() => {
    if (!matrix || !originalMatrix) return false;
    return JSON.stringify(matrix) !== JSON.stringify(originalMatrix);
  }, [matrix, originalMatrix]);

  // Custom handlers
  const selectCustom = (id: string) => {
    const r = customRoles.find((x) => x.id === id);
    if (!r) return;
    setSelectedCustomId(id);
    setEditedCustom(JSON.parse(JSON.stringify(r)));
  };

  const handleCustomChange = (section: Section, level: AccessLevel) => {
    if (!editedCustom) return;
    setEditedCustom({
      ...editedCustom,
      permissions: { ...editedCustom.permissions, [section]: level },
    });
  };

  const customDirty = useMemo(() => {
    if (!editedCustom || !selectedCustomId) return false;
    const original = customRoles.find((x) => x.id === selectedCustomId);
    if (!original) return false;
    return JSON.stringify(editedCustom) !== JSON.stringify(original);
  }, [editedCustom, selectedCustomId, customRoles]);

  const saveCustom = async () => {
    if (!editedCustom) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/settings/custom-roles/${editedCustom.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editedCustom.name,
          description: editedCustom.description,
          color: editedCustom.color,
          icon: editedCustom.icon,
          permissions: editedCustom.permissions,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      showToast("Rol actualizado");
      await loadAll();
      setSelectedCustomId(json.role.id);
      const fresh = await fetch("/api/settings/custom-roles").then((r) => r.json());
      const updated = fresh.roles.find((x: any) => x.id === json.role.id);
      if (updated) setEditedCustom(updated);
    } catch (e: any) {
      showToast(e.message, "err");
    } finally {
      setSaving(false);
    }
  };

  const deleteCustom = async (role: CustomRole) => {
    const msg =
      role._count && role._count.users > 0
        ? `¿Desactivar el rol "${role.name}"? ${role._count.users} miembro(s) quedarán con su rol base. Esto no se puede deshacer.`
        : `¿Desactivar el rol "${role.name}"?`;
    if (!confirm(msg)) return;
    try {
      const res = await fetch(`/api/settings/custom-roles/${role.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      showToast(json.message || "Rol desactivado");
      setSelectedCustomId(null);
      setEditedCustom(null);
      await loadAll();
    } catch (e: any) {
      showToast(e.message, "err");
    }
  };

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
        <div className="h-24 animate-pulse rounded-2xl border border-hairline bg-surface" />
        <div className="h-96 animate-pulse rounded-2xl border border-hairline bg-surface" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-hairline bg-elevated p-6">
        <Link
          href="/settings/team"
          className="mb-2 inline-flex items-center gap-1 text-[11px] font-medium text-ink-60 hover:text-ink"
        >
          <ArrowLeft className="h-3 w-3" />
          Volver a Miembros
        </Link>
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-ink-60" />
          <h2 className="text-sm font-semibold tracking-tight text-ink">
            Permisos por rol
          </h2>
        </div>
        <p className="mt-1 text-[12px] text-ink-60">
          Configurá qué puede ver y modificar cada rol. El Owner siempre tiene acceso total.
        </p>

        {/* Tabs switcher */}
        <div className="mt-4 inline-flex items-center rounded-xl border border-hairline bg-surface p-1">
          <button
            type="button"
            onClick={() => setTab("system")}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition"
            style={{
              background: tab === "system" ? "white" : "transparent",
              color: tab === "system" ? "#1C1B18" : "#6B685F",
              boxShadow:
                tab === "system"
                  ? "0 1px 2px rgba(28,27,24,0.05), 0 0 0 1px rgba(28,27,24,0.04)"
                  : "none",
              transition: `all 160ms ${ES}`,
            }}
          >
            <Shield className="h-3.5 w-3.5" />
            Roles del sistema
          </button>
          <button
            type="button"
            onClick={() => setTab("custom")}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition"
            style={{
              background: tab === "custom" ? "white" : "transparent",
              color: tab === "custom" ? "#1C1B18" : "#6B685F",
              boxShadow:
                tab === "custom"
                  ? "0 1px 2px rgba(28,27,24,0.05), 0 0 0 1px rgba(28,27,24,0.04)"
                  : "none",
              transition: `all 160ms ${ES}`,
            }}
          >
            <UsersRound className="h-3.5 w-3.5" />
            Roles custom
            {customRoles.length > 0 && (
              <span
                className="ml-1 rounded-full px-1.5 text-[9px] font-bold"
                style={{
                  background:
                    tab === "custom" ? "rgba(28,27,24,0.08)" : "rgba(131,128,122,0.15)",
                  color: tab === "custom" ? "#1C1B18" : "#6B685F",
                }}
              >
                {customRoles.length}
              </span>
            )}
          </button>
        </div>

        {/* Leyenda niveles */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {LEVELS.map((l) => (
            <div
              key={l.value}
              className="flex items-center gap-2 rounded-lg border border-hairline bg-elevated px-2.5 py-1.5"
            >
              <div className="h-3 w-3 rounded" style={{ background: l.color }} />
              <div>
                <div className="text-[11px] font-semibold" style={{ color: l.color }}>
                  {l.label}
                </div>
                <div className="text-[9px] text-ink-60">{l.hint}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── TAB SISTEMA ─── */}
      {tab === "system" && (
        <>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={resetSystem}
              className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-elevated px-3 py-1.5 text-xs font-medium text-ink shadow-sm transition hover:border-hairline-2 hover:bg-surface"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restablecer defaults
            </button>
            <button
              type="button"
              disabled={!systemDirty || saving}
              onClick={saveSystem}
              className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>

          {Object.entries(groupedSections).map(([cat, catSections]) => {
            const catMeta = CATEGORY_META[cat] ?? { label: cat, color: "#6B685F" };
            return (
              <div
                key={cat}
                className="overflow-hidden rounded-2xl border border-hairline bg-elevated"
              >
                <div className="flex items-center gap-2 border-b border-hairline bg-surface px-6 py-3">
                  <div className="h-1.5 w-1.5 rounded-full" style={{ background: catMeta.color }} />
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-60">
                    {catMeta.label}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead className="border-b border-hairline bg-surface">
                      <tr>
                        <th className="px-6 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-40">
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
                    <tbody className="divide-y divide-hairline">
                      {catSections.map((s) => (
                        <tr key={s.key}>
                          <td className="px-6 py-2.5 font-medium text-ink">{s.label}</td>
                          {(["OWNER", "ADMIN", "MEMBER"] as Role[]).map((role) => {
                            const currentLevel = matrix[role][s.key];
                            const isOwner = role === "OWNER";
                            return (
                              <td key={role} className="px-3 py-2 text-center">
                                <select
                                  disabled={isOwner}
                                  value={currentLevel}
                                  onChange={(e) => handleSystemChange(role, s.key, e.target.value as AccessLevel)}
                                  className="w-full max-w-[120px] rounded-md border border-hairline bg-elevated px-2 py-1 text-[11px] font-semibold outline-none focus:border-ink/30 focus:ring-2 focus:ring-ink/10 disabled:cursor-not-allowed disabled:opacity-60"
                                  style={{
                                    color: LEVELS.find((l) => l.value === currentLevel)?.color ?? "#6B685F",
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
        </>
      )}

      {/* ─── TAB CUSTOM ─── */}
      {tab === "custom" && (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="text-[12px] text-ink-60">
              {customRoles.length} rol{customRoles.length !== 1 ? "es" : ""} custom activo
              {customRoles.length !== 1 ? "s" : ""}
            </div>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-ink/90"
            >
              <Plus className="h-3.5 w-3.5" />
              Crear rol custom
            </button>
          </div>

          {customRoles.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-hairline-2 bg-surface p-10 text-center">
              <UsersRound className="mx-auto h-10 w-10 text-ink-40" />
              <h3 className="mt-4 text-sm font-semibold text-ink">
                Sin roles custom todavía
              </h3>
              <p className="mt-1 max-w-md mx-auto text-[12px] text-ink-60">
                Creá roles como "Contador", "Marketing Manager" u "Operaciones" con
                permisos específicos. Se asignan desde la pestaña Miembros.
              </p>
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-ink/90"
              >
                <Plus className="h-3.5 w-3.5" />
                Crear primer rol
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
              {/* Lista */}
              <aside className="space-y-2">
                {customRoles.map((r) => {
                  const active = selectedCustomId === r.id;
                  const color = r.color ?? "#6B685F";
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => selectCustom(r.id)}
                      className="w-full text-left rounded-xl border bg-elevated p-3 transition"
                      style={{
                        borderColor: active ? `${color}55` : "rgba(226,232,240,1)",
                        background: active ? `${color}08` : "white",
                        boxShadow: active
                          ? `0 1px 2px ${color}14, 0 4px 12px ${color}0a`
                          : "0 1px 2px rgba(28,27,24,0.03)",
                      }}
                    >
                      <div className="flex items-start gap-2">
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                          style={{
                            background: `${color}18`,
                            color,
                            border: `1px solid ${color}30`,
                          }}
                        >
                          <Briefcase className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-[13px] font-semibold text-ink">
                            {r.name}
                          </div>
                          {r.description && (
                            <div className="mt-0.5 line-clamp-2 text-[10px] text-ink-60">
                              {r.description}
                            </div>
                          )}
                          {r._count && (
                            <div className="mt-1 text-[10px] text-ink-40">
                              {r._count.users} miembro{r._count.users !== 1 ? "s" : ""}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </aside>

              {/* Editor */}
              <section>
                {!editedCustom ? (
                  <div className="rounded-2xl border border-dashed border-hairline-2 bg-surface p-10 text-center">
                    <Info className="mx-auto h-8 w-8 text-ink-40" />
                    <p className="mt-3 text-sm text-ink-60">
                      Seleccioná un rol de la izquierda para editarlo.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Metadata */}
                    <div className="rounded-2xl border border-hairline bg-elevated p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editedCustom.name}
                              maxLength={60}
                              onChange={(e) =>
                                setEditedCustom({ ...editedCustom, name: e.target.value })
                              }
                              className="w-full max-w-xs rounded-lg border border-hairline bg-elevated px-3 py-1.5 text-sm font-semibold text-ink placeholder:text-ink-40 outline-none focus:border-ink/30 focus:ring-2 focus:ring-ink/10"
                            />
                            <div className="flex items-center gap-1">
                              {COLOR_PALETTE.map((c) => (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() =>
                                    setEditedCustom({ ...editedCustom, color: c })
                                  }
                                  className="h-5 w-5 rounded-lg border-2 transition"
                                  style={{
                                    background: c,
                                    borderColor:
                                      (editedCustom.color ?? "").toLowerCase() === c
                                        ? c
                                        : "transparent",
                                    boxShadow:
                                      (editedCustom.color ?? "").toLowerCase() === c
                                        ? `0 0 0 2px ${c}33`
                                        : "none",
                                  }}
                                />
                              ))}
                            </div>
                          </div>
                          <input
                            type="text"
                            value={editedCustom.description ?? ""}
                            placeholder="Descripción corta (opcional)"
                            maxLength={280}
                            onChange={(e) =>
                              setEditedCustom({
                                ...editedCustom,
                                description: e.target.value,
                              })
                            }
                            className="mt-2 w-full rounded-lg border border-hairline bg-elevated px-3 py-1.5 text-xs text-ink outline-none focus:border-ink/30 focus:ring-2 focus:ring-ink/10"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteCustom(editedCustom)}
                          className="inline-flex items-center gap-1 rounded-lg border border-hairline bg-elevated px-2.5 py-1.5 text-[11px] font-medium text-ink-60 transition hover:border-rose-200 hover:text-rose-600"
                        >
                          <Trash2 className="h-3 w-3" />
                          Eliminar
                        </button>
                      </div>
                    </div>

                    {/* Matriz de permisos de este custom role */}
                    {Object.entries(groupedSections).map(([cat, catSections]) => {
                      const catMeta = CATEGORY_META[cat] ?? { label: cat, color: "#6B685F" };
                      return (
                        <div
                          key={cat}
                          className="overflow-hidden rounded-2xl border border-hairline bg-elevated"
                        >
                          <div className="flex items-center gap-2 border-b border-hairline bg-surface px-6 py-3">
                            <div
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: catMeta.color }}
                            />
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-60">
                              {catMeta.label}
                            </div>
                          </div>
                          <div className="divide-y divide-hairline">
                            {catSections.map((s) => {
                              const v = editedCustom.permissions[s.key] ?? "none";
                              return (
                                <div
                                  key={s.key}
                                  className="flex items-center justify-between gap-4 px-6 py-2.5"
                                >
                                  <span className="text-[13px] font-medium text-ink">
                                    {s.label}
                                  </span>
                                  <select
                                    value={v}
                                    onChange={(e) =>
                                      handleCustomChange(s.key, e.target.value as AccessLevel)
                                    }
                                    className="w-full max-w-[140px] rounded-md border border-hairline bg-elevated px-2 py-1 text-[11px] font-semibold outline-none focus:border-ink/30 focus:ring-2 focus:ring-ink/10"
                                    style={{
                                      color:
                                        LEVELS.find((l) => l.value === v)?.color ?? "#6B685F",
                                    }}
                                  >
                                    {LEVELS.map((l) => (
                                      <option key={l.value} value={l.value}>
                                        {l.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                    {/* Save bar */}
                    <div className="sticky bottom-4 flex items-center justify-end gap-2 rounded-xl border border-hairline bg-elevated p-3 shadow-lg">
                      <button
                        type="button"
                        onClick={() => selectCustom(editedCustom.id)}
                        disabled={!customDirty}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-elevated px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Descartar
                      </button>
                      <button
                        type="button"
                        disabled={!customDirty || saving}
                        onClick={saveCustom}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {saving ? "Guardando…" : "Guardar rol"}
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}
        </>
      )}

      {/* Modal crear rol custom */}
      {createOpen && (
        <CreateRoleModal
          sections={sections}
          groupedSections={groupedSections}
          defaults={defaults}
          onClose={() => setCreateOpen(false)}
          onCreated={async (newRole) => {
            setCreateOpen(false);
            showToast("Rol custom creado");
            await loadAll();
            setSelectedCustomId(newRole.id);
            setEditedCustom(newRole);
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-xs font-medium text-white shadow-lg"
          role="status"
          aria-live="polite"
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: toast.kind === "ok" ? "#10b981" : "#ef4444",
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

    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Modal: crear rol custom
// ─────────────────────────────────────────────────────────────
function CreateRoleModal({
  sections,
  groupedSections,
  defaults,
  onClose,
  onCreated,
}: {
  sections: SectionMeta[];
  groupedSections: Record<string, SectionMeta[]>;
  defaults: Record<Role, Record<Section, AccessLevel>> | null;
  onClose: () => void;
  onCreated: (role: CustomRole) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLOR_PALETTE[0]);
  const [copyFrom, setCopyFrom] = useState<"MEMBER" | "ADMIN" | "OWNER" | "blank">("MEMBER");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      // Armar permisos iniciales desde copyFrom
      let initial: Record<Section, AccessLevel> = {};
      if (copyFrom === "blank" || !defaults) {
        for (const s of sections) initial[s.key] = "none";
      } else {
        for (const s of sections) {
          initial[s.key] = defaults[copyFrom as Role]?.[s.key] ?? "none";
        }
      }

      const res = await fetch("/api/settings/custom-roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || null,
          color,
          permissions: initial,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      onCreated({
        ...json.role,
        permissions: initial,
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-hairline bg-elevated shadow-2xl">
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-ink-60" />
              <h3 className="text-sm font-semibold tracking-tight text-ink">
                Crear rol custom
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-ink-40 hover:bg-surface hover:text-ink-60"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <label className="block text-[12px] font-semibold text-ink">
                Nombre del rol
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                className="mt-1.5 w-full rounded-lg border border-hairline bg-elevated px-3 py-2 text-sm text-ink placeholder:text-ink-40 outline-none focus:border-ink/30 focus:ring-2 focus:ring-ink/10"
                placeholder="Ej: Contador, Marketing Manager, Operaciones"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-ink">
                Descripción{" "}
                <span className="text-[10px] font-normal text-ink-40">(opcional)</span>
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={280}
                className="mt-1.5 w-full rounded-lg border border-hairline bg-elevated px-3 py-2 text-sm text-ink placeholder:text-ink-40 outline-none focus:border-ink/30 focus:ring-2 focus:ring-ink/10"
                placeholder="Qué tipo de usuario usa este rol"
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-ink">
                <span className="inline-flex items-center gap-1.5">
                  <Palette className="h-3.5 w-3.5 text-ink-40" />
                  Color
                </span>
              </label>
              <div className="mt-1.5 flex items-center gap-1.5">
                {COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className="h-7 w-7 rounded-lg border-2 transition"
                    style={{
                      background: c,
                      borderColor: color === c ? c : "transparent",
                      boxShadow: color === c ? `0 0 0 2px ${c}33` : "none",
                    }}
                    aria-label={c}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-ink">
                Permisos iniciales
              </label>
              <select
                value={copyFrom}
                onChange={(e) => setCopyFrom(e.target.value as any)}
                className="mt-1.5 w-full rounded-lg border border-hairline bg-elevated px-3 py-2 text-sm text-ink outline-none focus:border-ink/30 focus:ring-2 focus:ring-ink/10"
              >
                <option value="blank">Empezar en blanco (Sin acceso en todo)</option>
                <option value="MEMBER">Copiar de Editor (default Member)</option>
                <option value="ADMIN">Copiar de Admin</option>
                <option value="OWNER">Copiar de Owner (admin en todo)</option>
              </select>
              <p className="mt-1.5 text-[10px] text-ink-60">
                Después podés ajustar sección por sección desde el editor.
              </p>
            </div>

            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[11px] text-rose-700">
                {error}
              </div>
            )}
          </div>

          <div className="mt-6 flex items-center justify-end gap-2 border-t border-hairline pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-hairline bg-elevated px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!name || submitting}
              onClick={submit}
              className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              {submitting ? "Creando…" : "Crear rol"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
