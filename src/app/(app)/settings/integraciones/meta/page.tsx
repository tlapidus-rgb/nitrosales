// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// /settings/integraciones/meta
// ══════════════════════════════════════════════════════════════
// Página dedicada para conectar/gestionar Meta Ads.
// Reusa el flow del wizard (auth-request + OAuth + selector de
// Ad Account) pero standalone — el cliente puede entrar acá en
// cualquier momento, sin pasar por el wizard de onboarding.
//
// 4 estados (igual que MetaAdsInputs en wizard):
//   NONE → form para pedir email FB
//   PENDING → cartel "esperando autorización"
//   APPROVED → botón "Conectar con Meta"
//   CONNECTED → dropdown de Ad Accounts + opciones avanzadas
// ══════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock, AlertCircle } from "lucide-react";

type AuthState = "NONE" | "PENDING" | "APPROVED" | "CONNECTED" | "LOADING";

interface AdAccount {
  id: string;
  name: string;
  status: number;
}

export default function MetaIntegrationPage() {
  const [authState, setAuthState] = useState<AuthState>("LOADING");
  const [fbEmail, setFbEmail] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [currentAdAccountId, setCurrentAdAccountId] = useState<string | null>(null);
  const [tokenExpiresAt, setTokenExpiresAt] = useState<string | null>(null);

  const [fbEmailInput, setFbEmailInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingAccount, setSavingAccount] = useState(false);

  const loadStatus = async () => {
    try {
      const [statusRes, accountsRes] = await Promise.all([
        fetch("/api/me/meta-auth-status").then((r) => r.json()),
        fetch("/api/me/meta-accounts").then((r) => r.json()),
      ]);
      setAuthState(statusRes?.state || "NONE");
      setFbEmail(statusRes?.fbEmail || null);
      if (accountsRes?.connected) {
        setAccounts(accountsRes.accounts || []);
        setCurrentAdAccountId(accountsRes.currentAdAccountId || null);
      }
    } catch (e) {
      setAuthState("NONE");
    }
  };

  useEffect(() => {
    loadStatus();
    // Si vuelve del OAuth callback con ?metaConnected=1, refresh.
    const params = new URLSearchParams(window.location.search);
    if (params.get("metaConnected") === "1") {
      const cleaned = new URL(window.location.href);
      cleaned.searchParams.delete("metaConnected");
      cleaned.searchParams.delete("metaAccounts");
      window.history.replaceState({}, "", cleaned.toString());
      // Reload status después del OAuth.
      setTimeout(loadStatus, 500);
    }
  }, []);

  const handleRequest = async () => {
    const email = fbEmailInput.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Email inválido");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/me/meta-auth-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fbEmail: email }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data?.error || "Error en la solicitud");
        return;
      }
      setAuthState("PENDING");
      setFbEmail(email);
    } catch (e: any) {
      setError(e?.message || "Error de red");
    } finally {
      setSubmitting(false);
    }
  };

  const handleConnect = () => {
    const returnTo = "/settings/integraciones/meta";
    window.location.href = `/api/oauth/meta/start?returnTo=${encodeURIComponent(returnTo)}`;
  };

  const handleSaveAccount = async (adAccountId: string) => {
    setSavingAccount(true);
    try {
      await fetch("/api/me/meta-set-ad-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adAccountId }),
      });
      setCurrentAdAccountId(adAccountId);
    } finally {
      setSavingAccount(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* Header */}
      <Link
        href="/settings/integraciones"
        className="inline-flex items-center gap-1.5 text-[12px] text-slate-600 hover:text-slate-900 mb-4"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Volver a integraciones
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl text-[16px] font-bold"
          style={{ background: "rgba(24,119,242,0.10)", color: "#1877F2", border: "1px solid rgba(24,119,242,0.25)" }}>
          M
        </div>
        <div>
          <h1 className="text-[20px] font-bold text-slate-900">Meta Ads</h1>
          <p className="text-[13px] text-slate-500">Conexión con Facebook + Instagram Ads y Conversions API.</p>
        </div>
      </div>

      {/* Estado actual */}
      {authState === "LOADING" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500">
          Cargando estado…
        </div>
      )}

      {authState === "CONNECTED" && (
        <>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 mb-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <div className="text-[14px] font-semibold text-emerald-900">Conectado</div>
            </div>
            <div className="mt-2 text-[12px] text-emerald-800 leading-relaxed">
              Tenés acceso a {accounts.length} cuenta{accounts.length === 1 ? "" : "s"} publicitaria{accounts.length === 1 ? "" : "s"}.
              {tokenExpiresAt && ` El token se renueva automáticamente cada 60 días.`}
            </div>
          </div>

          {accounts.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-[13px] font-semibold text-slate-900 mb-2">Cuenta publicitaria</div>
              <div className="text-[12px] text-slate-500 mb-3">
                Elegí cuál de tus cuentas usar para sync de campañas e insights.
              </div>
              <select
                value={currentAdAccountId || ""}
                onChange={(e) => handleSaveAccount(e.target.value)}
                disabled={savingAccount}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-900"
              >
                <option value="">Elegir cuenta…</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.id})
                  </option>
                ))}
              </select>
              {savingAccount && <div className="text-[11px] text-slate-500 mt-2">Guardando…</div>}
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button
              onClick={handleConnect}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              Reconectar
            </button>
          </div>
        </>
      )}

      {authState === "APPROVED" && (
        <>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 mb-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <div className="text-[14px] font-semibold text-emerald-900">Estás autorizado</div>
            </div>
            <div className="mt-2 text-[12px] text-emerald-800 leading-relaxed">
              Ya podés conectar con Meta. Asegurate de haber aceptado la invitación que te llegó al Facebook
              {fbEmail && ` (${fbEmail})`}.
            </div>
          </div>
          <button
            onClick={handleConnect}
            className="w-full rounded-lg px-4 py-3 text-white font-bold text-[14px]"
            style={{
              background: "linear-gradient(135deg, #1877F2, #166fe5)",
              boxShadow: "0 4px 12px rgba(24,119,242,0.30)",
            }}
          >
            Conectar con Meta
          </button>
        </>
      )}

      {authState === "PENDING" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-5 w-5 text-amber-600" />
            <div className="text-[14px] font-semibold text-amber-900">Solicitud pendiente</div>
          </div>
          <div className="text-[12px] text-amber-800 leading-relaxed">
            Te avisamos por mail cuando estés autorizado (~1 día hábil).
            {fbEmail && (
              <div className="mt-2">
                Email Facebook: <code className="bg-white px-2 py-0.5 rounded border border-amber-200">{fbEmail}</code>
              </div>
            )}
          </div>
        </div>
      )}

      {authState === "NONE" && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-[14px] font-semibold text-slate-900 mb-2">Antes de conectar Meta</div>
          <div className="text-[12px] text-slate-600 leading-relaxed mb-4">
            Necesitamos autorizarte como usuario de prueba (1 paso de nuestro lado, ~1 día).
            Pasanos el <strong>email con el que entrás a Facebook</strong> (no el del trabajo, el personal).
          </div>
          <label className="block text-[12px] font-semibold text-slate-700 mb-1">Email de Facebook</label>
          <input
            type="email"
            value={fbEmailInput}
            onChange={(e) => { setFbEmailInput(e.target.value); setError(null); }}
            placeholder="tu@email.com"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] mb-3"
          />
          {error && (
            <div className="flex items-center gap-1.5 text-[11px] text-rose-600 mb-3">
              <AlertCircle className="h-3.5 w-3.5" />
              {error}
            </div>
          )}
          <button
            onClick={handleRequest}
            disabled={submitting || !fbEmailInput}
            className="w-full rounded-lg px-4 py-2.5 text-white font-semibold text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: submitting || !fbEmailInput ? "#94a3b8" : "linear-gradient(135deg, #1877F2, #166fe5)" }}
          >
            {submitting ? "Enviando…" : "Pedir autorización"}
          </button>
          <p className="mt-3 text-[10px] text-slate-500 leading-relaxed">
            Lo encontrás en facebook.com → tu perfil → Configuración → Información personal.
          </p>
        </div>
      )}
    </div>
  );
}
