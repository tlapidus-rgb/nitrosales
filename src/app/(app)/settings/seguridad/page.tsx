// @ts-nocheck
"use client";

/**
 * /settings/seguridad — Fase 7 QA productivo
 * ─────────────────────────────────────────────────────────────
 * Dos cards:
 *   1. Cambiar password (form con current + new + confirm)
 *   2. Historial de logins (tabla con eventos success/failure)
 *
 * 2FA queda como placeholder interno (proxima iteracion).
 */

import React, { useEffect, useState } from "react";
import {
  Lock,
  History,
  ShieldAlert,
  Check,
  X,
  Save,
  CheckCircle2,
  XCircle,
} from "lucide-react";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";

interface LoginEvent {
  id: string;
  success: boolean;
  ip: string | null;
  userAgent: string | null;
  location: string | null;
  failureReason: string | null;
  createdAt: string;
}

export default function SeguridadPage() {
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);

  const [events, setEvents] = useState<LoginEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  const loadEvents = async () => {
    setLoadingEvents(true);
    try {
      const res = await fetch("/api/settings/security/login-history?limit=30");
      const json = await res.json();
      if (res.ok) setEvents(json.events ?? []);
    } finally {
      setLoadingEvents(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const showToast = (msg: string, kind: "ok" | "err" = "ok") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3500);
  };

  const validateForm = (): string | null => {
    if (!currentPwd) return "Ingresá tu password actual";
    if (newPwd.length < 8) return "El password nuevo debe tener al menos 8 caracteres";
    if (newPwd !== confirmPwd) return "Los passwords no coinciden";
    if (newPwd === currentPwd) return "El password nuevo debe ser distinto al actual";
    return null;
  };

  const submit = async () => {
    const err = validateForm();
    if (err) return showToast(err, "err");
    setSaving(true);
    try {
      const res = await fetch("/api/settings/security/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: currentPwd,
          newPassword: newPwd,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      showToast("Password actualizado");
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
      loadEvents();
    } catch (e: any) {
      showToast(e.message, "err");
    } finally {
      setSaving(false);
    }
  };

  const fmtRelative = (iso: string): string => {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const mins = Math.round(diff / 60000);
    if (mins < 1) return "Hace instantes";
    if (mins < 60) return `Hace ${mins}m`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `Hace ${hrs}h`;
    const days = Math.round(hrs / 24);
    if (days < 30) return `Hace ${days}d`;
    return d.toLocaleDateString("es-AR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const shortUA = (ua: string | null): string => {
    if (!ua) return "—";
    const browser =
      ua.includes("Chrome") && !ua.includes("Edg")
        ? "Chrome"
        : ua.includes("Firefox")
        ? "Firefox"
        : ua.includes("Safari") && !ua.includes("Chrome")
        ? "Safari"
        : ua.includes("Edg")
        ? "Edge"
        : "Browser";
    const os = ua.includes("Windows")
      ? "Windows"
      : ua.includes("Mac")
      ? "macOS"
      : ua.includes("iPhone")
      ? "iOS"
      : ua.includes("Android")
      ? "Android"
      : ua.includes("Linux")
      ? "Linux"
      : "";
    return os ? `${browser} · ${os}` : browser;
  };

  return (
    <div className="space-y-5">
      {/* Card 1 — Cambiar password */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-rose-600" />
          <h2 className="text-sm font-semibold tracking-tight text-slate-900">
            Cambiar password
          </h2>
        </div>
        <p className="mt-1 text-[12px] text-slate-500">
          Usá al menos 8 caracteres. Ideal: mezcla de letras, números y símbolos.
        </p>

        <div className="mt-4 space-y-4 max-w-md">
          <FormField label="Password actual">
            <input
              type="password"
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </FormField>
          <FormField label="Password nuevo">
            <input
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              minLength={8}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </FormField>
          <FormField label="Confirmá el nuevo">
            <input
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              minLength={8}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </FormField>
        </div>

        <div className="mt-5 flex items-center justify-end">
          <button
            type="button"
            disabled={!currentPwd || !newPwd || !confirmPwd || saving}
            onClick={submit}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ transition: `all 160ms ${ES}` }}
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Guardando…" : "Actualizar password"}
          </button>
        </div>
      </div>

      {/* Card 2 — Historial de logins */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-6 py-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-slate-600" />
            <h2 className="text-sm font-semibold tracking-tight text-slate-900">
              Historial de logins
            </h2>
          </div>
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
            Últimos {events.length} eventos
          </span>
        </div>
        {loadingEvents ? (
          <div className="p-6 text-sm text-slate-400">Cargando historial…</div>
        ) : events.length === 0 ? (
          <div className="p-8 text-center">
            <History className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">
              Sin historial todavía. Los próximos logins aparecerán aquí.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {events.map((e) => {
              const Icon = e.success ? CheckCircle2 : XCircle;
              const color = e.success ? "#10b981" : "#ef4444";
              return (
                <div
                  key={e.id}
                  className="flex items-center justify-between gap-4 px-6 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className="h-4 w-4 shrink-0" style={{ color }} />
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold text-slate-900">
                        {e.success ? "Login exitoso" : "Login fallido"}
                        {e.failureReason && (
                          <span
                            className="ml-2 text-[10px] font-normal"
                            style={{ color: e.success ? "#64748b" : "#ef4444" }}
                          >
                            ({e.failureReason})
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-500">
                        {shortUA(e.userAgent)}
                        {e.ip && ` · ${e.ip}`}
                        {e.location && ` · ${e.location}`}
                      </div>
                    </div>
                  </div>
                  <div className="text-[10px] tabular-nums text-slate-500">
                    {fmtRelative(e.createdAt)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2FA — placeholder interno */}
      <div className="relative overflow-hidden rounded-2xl border border-amber-200 bg-white p-5">
        <div className="flex items-start gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{
              background: "rgba(245,158,11,0.10)",
              color: "#f59e0b",
              border: "1px solid rgba(245,158,11,0.22)",
            }}
          >
            <ShieldAlert className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold tracking-tight text-slate-900">
                Two-Factor Authentication
              </h3>
              <span
                className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-700"
                style={{ border: "1px solid rgba(245,158,11,0.22)" }}
              >
                Próximamente
              </span>
            </div>
            <p className="mt-1 text-[12px] text-slate-500">
              Agregar una segunda capa de protección con apps como Google
              Authenticator o 1Password. Te avisamos cuando lo activemos.
            </p>
          </div>
        </div>
      </div>

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
              animation: "pulseDotSec 1.4s ease-in-out infinite",
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
        @keyframes pulseDotSec {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.55; transform: scale(1.4); }
        }
      `}</style>
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-slate-700">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
