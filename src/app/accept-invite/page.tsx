// @ts-nocheck
"use client";

/**
 * /accept-invite?token=XYZ — Fase 7 fix
 * ─────────────────────────────────────────────────────────────
 * Pagina publica (fuera del route group `(app)` — no requiere login)
 * donde el invitado completa su cuenta:
 *   1. GET /api/settings/team/invitations/accept?token=... → preview
 *   2. Form: name + password
 *   3. POST → crea user + marca invitation ACCEPTED → redirect a /login
 */

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Mail,
  UserPlus,
  Check,
  X,
  Shield,
  ShieldCheck,
  User,
  AlertTriangle,
} from "lucide-react";

interface InvitationPreview {
  email: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  organizationName: string;
  expiresAt: string;
  note: string | null;
}

const ROLE_LABELS = {
  OWNER: "Owner (acceso total)",
  ADMIN: "Admin (casi todo)",
  MEMBER: "Editor (ver y editar)",
};

const ROLE_ICONS = {
  OWNER: ShieldCheck,
  ADMIN: Shield,
  MEMBER: User,
};

function AcceptInviteInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");

  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadError("Falta el token de la invitación");
      setLoadingPreview(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `/api/settings/team/invitations/accept?token=${encodeURIComponent(token)}`
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        setPreview(json);
      } catch (e: any) {
        setLoadError(e.message ?? "Error cargando invitación");
      } finally {
        setLoadingPreview(false);
      }
    })();
  }, [token]);

  const submit = async () => {
    setError(null);
    if (password.length < 8) {
      setError("El password debe tener al menos 8 caracteres");
      return;
    }
    if (password !== passwordConfirm) {
      setError("Los passwords no coinciden");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/settings/team/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setSuccess(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch (e: any) {
      setError(e.message ?? "Error creando cuenta");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingPreview) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-sm text-slate-500">Cargando invitación…</div>
      </div>
    );
  }

  if (loadError || !preview) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 shadow-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-rose-600" />
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">
              Invitación no válida
            </h1>
          </div>
          <p className="mt-2 text-sm text-rose-700">
            {loadError ?? "La invitación no existe o expiró."}
          </p>
          <a
            href="/login"
            className="mt-6 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Ir a login
          </a>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-emerald-200 bg-white p-8 shadow-sm">
          <div className="flex items-center gap-2">
            <Check className="h-5 w-5 text-emerald-600" />
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">
              Cuenta creada
            </h1>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Te redirigimos al login para que entres con tu email y password.
          </p>
        </div>
      </div>
    );
  }

  const RoleIcon = ROLE_ICONS[preview.role];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
          {/* Aurora header */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-32"
            style={{
              background:
                "radial-gradient(ellipse at 50% 0%, rgba(139,92,246,0.12) 0%, transparent 60%)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, rgba(139,92,246,0.4) 50%, transparent 100%)",
            }}
          />

          <div className="relative p-8">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-200 bg-violet-50 text-violet-600">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-700">
                  Invitación
                </div>
                <h1 className="text-lg font-semibold tracking-tight text-slate-900">
                  Sumate a {preview.organizationName}
                </h1>
              </div>
            </div>

            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              Te invitaron a <strong>{preview.organizationName}</strong> en
              NitroSales. Completá tu cuenta abajo.
            </p>

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-1.5 text-[12px]">
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-slate-400" />
                <span className="font-semibold text-slate-700">{preview.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <RoleIcon className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-slate-600">{ROLE_LABELS[preview.role]}</span>
              </div>
            </div>

            {preview.note && (
              <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/40 p-3 text-[12px] text-violet-800 italic">
                "{preview.note}"
              </div>
            )}

            <div className="mt-6 space-y-4">
              <div>
                <label className="block text-[12px] font-semibold text-slate-700">
                  Tu nombre{" "}
                  <span className="text-[10px] font-normal text-slate-400">
                    (opcional)
                  </span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                  placeholder="Juan Pérez"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-slate-700">
                  Password (mínimo 8 caracteres)
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-slate-700">
                  Confirmá tu password
                </label>
                <input
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  minLength={8}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[11px] text-rose-700">
                  {error}
                </div>
              )}

              <button
                type="button"
                disabled={!password || !passwordConfirm || submitting}
                onClick={submit}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <UserPlus className="h-4 w-4" />
                {submitting ? "Creando cuenta…" : "Aceptar y crear cuenta"}
              </button>

              <p className="text-center text-[10px] text-slate-400">
                Al aceptar aceptás los Términos de Servicio de NitroSales.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <AcceptInviteInner />
    </Suspense>
  );
}
