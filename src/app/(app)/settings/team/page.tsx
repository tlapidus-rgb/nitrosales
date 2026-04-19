// @ts-nocheck
"use client";

/**
 * /settings/team — Fase 7d
 * ─────────────────────────────────────────────────────────────
 * Lista miembros activos + invitaciones pendientes.
 * Acciones:
 *   - Invitar miembro por email con rol (modal compacto).
 *   - Cambiar rol de un miembro (dropdown inline, PATCH).
 *   - Remover miembro (con confirmacion, DELETE).
 *   - Revocar invitacion pendiente (DELETE).
 *   - Copiar link de invitacion (hasta que este el envio automatico).
 */

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Users,
  UserPlus,
  Trash2,
  Copy,
  Mail,
  Check,
  X,
  Shield,
  ShieldCheck,
  User,
  Clock,
  KeyRound,
} from "lucide-react";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";

type Role = "OWNER" | "ADMIN" | "MEMBER";

const ROLE_META: Record<Role, { label: string; color: string; icon: any }> = {
  OWNER: { label: "Owner", color: "#8b5cf6", icon: ShieldCheck },
  ADMIN: { label: "Admin", color: "#0ea5e9", icon: Shield },
  MEMBER: { label: "Editor", color: "#64748b", icon: User },
};

interface CustomRoleLite {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
}

interface Member {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  createdAt: string;
  customRoleId: string | null;
  customRole: CustomRoleLite | null;
}

interface Invitation {
  id: string;
  email: string;
  role: Role;
  status: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
  expiresAt: string;
  createdAt: string;
  note: string | null;
  token: string;
  customRoleId: string | null;
  customRole: CustomRoleLite | null;
}

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRoleLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const [lastInvite, setLastInvite] = useState<{
    url: string;
    emailSent: boolean;
    recipientEmail: string;
    errorMessage?: string;
  } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/team");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setMembers(json.members ?? []);
      setInvitations(json.invitations ?? []);
      setCustomRoles(json.customRoles ?? []);
    } catch (e: any) {
      showToast(e.message || "Error cargando team", "err");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const showToast = (msg: string, kind: "ok" | "err" = "ok") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3500);
  };

  const handleRoleChange = async (userId: string, value: string) => {
    // value es "base:OWNER" | "base:ADMIN" | "base:MEMBER" | "custom:<id>"
    let body: any;
    if (value.startsWith("base:")) {
      const role = value.slice(5) as Role;
      body = { role, customRoleId: null };
    } else if (value.startsWith("custom:")) {
      const customRoleId = value.slice(7);
      body = { customRoleId };
    } else {
      return;
    }
    try {
      const res = await fetch(`/api/settings/team/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      showToast("Rol actualizado");
      await load();
    } catch (e: any) {
      showToast(e.message, "err");
    }
  };

  const memberCurrentValue = (m: Member): string =>
    m.customRoleId ? `custom:${m.customRoleId}` : `base:${m.role}`;

  const handleRemoveMember = async (m: Member) => {
    if (!confirm(`¿Remover a ${m.email} de la organización?`)) return;
    try {
      const res = await fetch(`/api/settings/team/members/${m.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      showToast(`${m.email} removido`);
      await load();
    } catch (e: any) {
      showToast(e.message, "err");
    }
  };

  const handleRevokeInvite = async (inv: Invitation) => {
    if (!confirm(`¿Revocar invitación a ${inv.email}?`)) return;
    try {
      const res = await fetch(
        `/api/settings/team/invitations?id=${inv.id}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      showToast("Invitación revocada");
      await load();
    } catch (e: any) {
      showToast(e.message, "err");
    }
  };

  const pendingInvs = useMemo(
    () => invitations.filter((i) => i.status === "PENDING"),
    [invitations]
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-slate-100/50" />
        <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-slate-100/50" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header + Invite button */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-violet-600" />
              <h2 className="text-sm font-semibold tracking-tight text-slate-900">
                Miembros del equipo
              </h2>
            </div>
            <p className="mt-1 text-[12px] text-slate-500">
              {members.length} miembro{members.length !== 1 ? "s" : ""} activo
              {members.length !== 1 ? "s" : ""}
              {pendingInvs.length > 0 &&
                ` · ${pendingInvs.length} invitaci${
                  pendingInvs.length === 1 ? "ón" : "ones"
                } pendiente${pendingInvs.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/settings/team/permisos"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              style={{ transition: `all 160ms ${ES}` }}
            >
              <KeyRound className="h-3.5 w-3.5" />
              Configurar permisos
            </Link>
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700"
              style={{ transition: `all 160ms ${ES}` }}
            >
              <UserPlus className="h-3.5 w-3.5" />
              Invitar miembro
            </button>
          </div>
        </div>
      </div>

      {/* Lista de miembros */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Miembros activos
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between gap-4 px-6 py-4"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[12px] font-semibold uppercase text-white"
                  style={{
                    background: `linear-gradient(135deg, ${ROLE_META[m.role].color}, ${ROLE_META[m.role].color}cc)`,
                  }}
                >
                  {(m.name?.[0] ?? m.email[0]).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold tracking-tight text-slate-900">
                    {m.name ?? m.email.split("@")[0]}
                  </div>
                  <div className="truncate text-[11px] text-slate-500">{m.email}</div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {m.customRole && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{
                      background: `${m.customRole.color ?? "#64748b"}15`,
                      color: m.customRole.color ?? "#64748b",
                      border: `1px solid ${m.customRole.color ?? "#64748b"}30`,
                    }}
                    title={`Rol custom: ${m.customRole.name}`}
                  >
                    {m.customRole.name}
                  </span>
                )}
                <select
                  value={memberCurrentValue(m)}
                  onChange={(e) => handleRoleChange(m.id, e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                >
                  <optgroup label="Roles del sistema">
                    <option value="base:OWNER">Owner</option>
                    <option value="base:ADMIN">Admin</option>
                    <option value="base:MEMBER">Editor</option>
                  </optgroup>
                  {customRoles.length > 0 && (
                    <optgroup label="Roles custom de tu organización">
                      {customRoles.map((cr) => (
                        <option key={cr.id} value={`custom:${cr.id}`}>
                          {cr.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <button
                  type="button"
                  onClick={() => handleRemoveMember(m)}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 transition hover:border-rose-200 hover:text-rose-600"
                  title="Remover miembro"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Invitaciones pendientes */}
      {pendingInvs.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-3 flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-amber-600" />
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Invitaciones pendientes
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {pendingInvs.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between gap-4 px-6 py-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-dashed border-amber-300 bg-amber-50 text-amber-600">
                    <Mail className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-semibold text-slate-900">
                        {inv.email}
                      </span>
                      {inv.customRole && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                          style={{
                            background: `${inv.customRole.color ?? "#64748b"}15`,
                            color: inv.customRole.color ?? "#64748b",
                            border: `1px solid ${inv.customRole.color ?? "#64748b"}30`,
                          }}
                        >
                          {inv.customRole.name}
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[11px] text-slate-500">
                      {inv.customRole
                        ? `Custom · ${ROLE_META[inv.role].label} base`
                        : ROLE_META[inv.role].label}{" "}
                      · Expira{" "}
                      {new Date(inv.expiresAt).toLocaleDateString("es-AR", {
                        day: "numeric",
                        month: "short",
                      })}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const url = `${window.location.origin}/accept-invite?token=${inv.token}`;
                        await navigator.clipboard.writeText(url);
                        showToast("Link copiado");
                      } catch {
                        showToast("No se pudo copiar", "err");
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <Copy className="h-3 w-3" />
                    Copiar link
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRevokeInvite(inv)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-500 transition hover:border-rose-200 hover:text-rose-600"
                  >
                    <X className="h-3 w-3" />
                    Revocar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite modal */}
      {inviteOpen && (
        <InviteModal
          customRoles={customRoles}
          onClose={() => setInviteOpen(false)}
          onCreated={(result) => {
            setLastInvite(result);
            setInviteOpen(false);
            load();
            if (result.emailSent) {
              showToast(`Invitación enviada a ${result.recipientEmail}`);
            } else {
              showToast("Invitación creada (ver link abajo)", "err");
            }
          }}
        />
      )}

      {/* Feedback post-invite: verde si email OK, amber si hay que enviar manual */}
      {lastInvite && lastInvite.emailSent && (
        <div
          className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 flex items-center justify-between gap-3"
          role="status"
        >
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-600" />
            <div>
              <h3 className="text-sm font-semibold tracking-tight text-emerald-900">
                Invitación enviada por email
              </h3>
              <p className="text-[11px] text-emerald-700">
                Le llegó a <strong>{lastInvite.recipientEmail}</strong>. El link expira en 7 días.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setLastInvite(null)}
            className="rounded-lg p-1 text-emerald-500 hover:bg-emerald-100"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {lastInvite && !lastInvite.emailSent && (
        <div
          className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4"
          role="status"
        >
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-semibold tracking-tight text-amber-900">
              No se pudo enviar el email — copiá el link manualmente
            </h3>
          </div>
          {lastInvite.errorMessage && (
            <p className="mt-1 text-[11px] text-amber-700 font-mono">
              {lastInvite.errorMessage}
            </p>
          )}
          <p className="mt-1 text-[12px] text-amber-700">
            Mandale este link al invitado por WhatsApp o email manual:
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg border border-amber-200 bg-white px-3 py-2 font-mono text-[11px] text-amber-900">
              {lastInvite.url}
            </code>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(lastInvite.url);
                  showToast("Link copiado");
                } catch {}
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-2 text-[11px] font-semibold text-white shadow-sm hover:bg-amber-700"
            >
              <Copy className="h-3 w-3" />
              Copiar
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-medium text-white shadow-lg"
          role="status"
          aria-live="polite"
          style={{
            boxShadow:
              "0 10px 40px -10px rgba(15,23,42,0.35), 0 0 0 1px rgba(15,23,42,0.08)",
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: toast.kind === "ok" ? "#10b981" : "#ef4444",
              boxShadow:
                toast.kind === "ok"
                  ? "0 0 8px rgba(16,185,129,0.7)"
                  : "0 0 8px rgba(239,68,68,0.7)",
              animation: "pulseDotTeam 1.4s ease-in-out infinite",
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
        @keyframes pulseDotTeam {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.55; transform: scale(1.4); }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Modal: invitar miembro
// ─────────────────────────────────────────────────────────────
function InviteModal({
  onClose,
  onCreated,
  customRoles,
}: {
  onClose: () => void;
  onCreated: (result: {
    url: string;
    emailSent: boolean;
    recipientEmail: string;
    errorMessage?: string;
  }) => void;
  customRoles: CustomRoleLite[];
}) {
  const [email, setEmail] = useState("");
  // selection puede ser "base:OWNER" | "base:ADMIN" | "base:MEMBER" | "custom:<id>"
  const [selection, setSelection] = useState<string>("base:MEMBER");
  const [note, setNote] = useState("");
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
      // Derivar role + customRoleId del selection
      let role: Role = "MEMBER";
      let customRoleId: string | null = null;
      if (selection.startsWith("base:")) {
        role = selection.slice(5) as Role;
      } else if (selection.startsWith("custom:")) {
        customRoleId = selection.slice(7);
        // Cuando se asigna custom role, el base role queda en MEMBER
        // (los permisos efectivos los da el custom role)
        role = "MEMBER";
      }

      const res = await fetch("/api/settings/team/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          role,
          customRoleId,
          note: note || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      onCreated({
        url: json.acceptUrl,
        emailSent: Boolean(json.emailSent),
        recipientEmail: email,
        errorMessage: json.emailSent ? undefined : (json.emailError ?? json.message ?? undefined),
      });
    } catch (e: any) {
      setError(e.message ?? "Error creando invitación");
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
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 85% 0%, rgba(139,92,246,0.08) 0%, transparent 55%)",
          }}
        />
        <div className="relative p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-xl"
                style={{
                  background: "rgba(139,92,246,0.08)",
                  color: "#8b5cf6",
                  border: "1px solid rgba(139,92,246,0.22)",
                }}
              >
                <UserPlus className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-semibold tracking-tight text-slate-900">
                Invitar miembro
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <label className="block text-[12px] font-semibold text-slate-700">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="juan@empresa.com"
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-slate-700">
                Rol
              </label>

              {/* Base roles */}
              <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Roles del sistema
              </div>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {(["MEMBER", "ADMIN", "OWNER"] as Role[]).map((r) => {
                  const Icon = ROLE_META[r].icon;
                  const value = `base:${r}`;
                  const active = selection === value;
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setSelection(value)}
                      className="relative flex flex-col items-center gap-1 rounded-lg border px-3 py-2.5 transition"
                      style={{
                        borderColor: active
                          ? ROLE_META[r].color
                          : "rgba(226,232,240,1)",
                        background: active
                          ? `${ROLE_META[r].color}0f`
                          : "white",
                      }}
                    >
                      <Icon
                        className="h-4 w-4"
                        style={{ color: ROLE_META[r].color }}
                      />
                      <span
                        className="text-[11px] font-semibold"
                        style={{
                          color: active ? ROLE_META[r].color : "#334155",
                        }}
                      >
                        {ROLE_META[r].label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Custom roles */}
              {customRoles.length > 0 && (
                <>
                  <div className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Roles custom de tu organización
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    {customRoles.map((cr) => {
                      const value = `custom:${cr.id}`;
                      const active = selection === value;
                      const color = cr.color ?? "#64748b";
                      return (
                        <button
                          key={cr.id}
                          type="button"
                          onClick={() => setSelection(value)}
                          className="relative flex items-center gap-2 rounded-lg border px-3 py-2.5 transition"
                          style={{
                            borderColor: active
                              ? color
                              : "rgba(226,232,240,1)",
                            background: active ? `${color}0f` : "white",
                          }}
                        >
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ background: color }}
                          />
                          <span
                            className="truncate text-[11px] font-semibold"
                            style={{
                              color: active ? color : "#334155",
                            }}
                          >
                            {cr.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              <p className="mt-2 text-[10px] text-slate-500">
                Owner: todo · Admin: casi todo · Editor: ve y edita datos.
                Los roles custom overridean los permisos base.
              </p>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-slate-700">
                Mensaje{" "}
                <span className="text-[10px] font-normal text-slate-400">
                  (opcional)
                </span>
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Hola! Te invito a sumarte a nuestro NitroSales..."
                maxLength={280}
                rows={2}
                className="mt-1.5 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[11px] text-rose-700">
                {error}
              </div>
            )}
          </div>

          <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!email || submitting}
              onClick={submit}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UserPlus className="h-3.5 w-3.5" />
              {submitting ? "Creando…" : "Crear invitación"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
