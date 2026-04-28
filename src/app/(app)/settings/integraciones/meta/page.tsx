// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// /settings/integraciones/meta
// ══════════════════════════════════════════════════════════════
// Página dedicada para conectar/gestionar Meta Ads + Pixel.
//
// 4 estados:
//   NONE → form para pedir email FB (autorización tester)
//   PENDING → cartel "esperando autorización"
//   APPROVED → botón "Conectar con Meta" (OAuth)
//   CONNECTED → form completo con datos pre-rellenados:
//     - Ad Account ID (dropdown si hay accounts del OAuth)
//     - Business ID (input)
//     - Pixel ID (input)
//     - Pixel Access Token (••••• con botón "Cambiar")
// ══════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock, AlertCircle, Lock, Edit3 } from "lucide-react";

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
  const [tokenExpiresAt, setTokenExpiresAt] = useState<string | null>(null);

  // Form state — pre-rellenado con datos del status.
  const [adAccountId, setAdAccountId] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [pixelId, setPixelId] = useState("");
  const [pixelAccessToken, setPixelAccessToken] = useState("");
  const [hasPixelAccessToken, setHasPixelAccessToken] = useState(false);
  const [editingPixelToken, setEditingPixelToken] = useState(false);

  // Auth request state (estado NONE).
  const [fbEmailInput, setFbEmailInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      const [statusRes, accountsRes] = await Promise.all([
        fetch("/api/me/meta-auth-status").then((r) => r.json()),
        fetch("/api/me/meta-accounts").then((r) => r.json()),
      ]);
      setAuthState(statusRes?.state || "NONE");
      setFbEmail(statusRes?.fbEmail || null);
      setTokenExpiresAt(statusRes?.tokenExpiresAt || null);

      // Pre-rellenar campos editables.
      setAdAccountId(statusRes?.adAccountId || "");
      setBusinessId(statusRes?.businessId || "");
      setPixelId(statusRes?.pixelId || "");
      setHasPixelAccessToken(!!statusRes?.hasPixelAccessToken);
      setPixelAccessToken("");
      setEditingPixelToken(false);

      if (accountsRes?.connected) {
        setAccounts(accountsRes.accounts || []);
      }
    } catch (e) {
      setAuthState("NONE");
    }
  };

  useEffect(() => {
    loadStatus();
    const params = new URLSearchParams(window.location.search);
    if (params.get("metaConnected") === "1") {
      const cleaned = new URL(window.location.href);
      cleaned.searchParams.delete("metaConnected");
      cleaned.searchParams.delete("metaAccounts");
      window.history.replaceState({}, "", cleaned.toString());
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

  const handleSave = async () => {
    setError(null);
    setSavedFlash(false);
    setSaving(true);
    try {
      const body: any = {};
      if (adAccountId) body.adAccountId = adAccountId;
      if (businessId !== "" || (businessId === "" && hasPixelAccessToken)) body.businessId = businessId;
      if (pixelId !== "") body.pixelId = pixelId;
      if (editingPixelToken && pixelAccessToken) body.pixelAccessToken = pixelAccessToken;

      const r = await fetch("/api/me/meta-save-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data?.error || "Error guardando");
        return;
      }
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
      await loadStatus();
    } catch (e: any) {
      setError(e?.message || "Error de red");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
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
          <h1 className="text-[20px] font-bold text-slate-900">Meta Ads + Pixel</h1>
          <p className="text-[13px] text-slate-500">Facebook + Instagram Ads y Conversions API.</p>
        </div>
      </div>

      {authState === "LOADING" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500">
          Cargando estado…
        </div>
      )}

      {/* CONNECTED: form completo con datos pre-rellenados */}
      {authState === "CONNECTED" && (
        <>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 mb-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <div className="text-[14px] font-semibold text-emerald-900">Conectado</div>
            </div>
            <div className="mt-2 text-[12px] text-emerald-800 leading-relaxed">
              {accounts.length > 0
                ? `Tenés acceso a ${accounts.length} cuenta${accounts.length === 1 ? "" : "s"} publicitaria${accounts.length === 1 ? "" : "s"}. `
                : ""}
              {fbEmail && `Cuenta autorizada: ${fbEmail}. `}
              {tokenExpiresAt && (
                <>El token se renueva automáticamente. Vence el {new Date(tokenExpiresAt).toLocaleDateString("es-AR")}.</>
              )}
            </div>
          </div>

          {/* Form Meta Ads */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 mb-4">
            <div className="text-[14px] font-semibold text-slate-900 mb-1">Meta Ads</div>
            <div className="text-[11px] text-slate-500 mb-4">Datos para sync de campañas, insights y audiencias.</div>

            <div className="space-y-3">
              <div>
                <label className="block text-[12px] font-semibold text-slate-700 mb-1">Ad Account</label>
                {accounts.length > 0 ? (
                  <select
                    value={adAccountId ? `act_${adAccountId}` : ""}
                    onChange={(e) => { setAdAccountId(e.target.value.replace(/^act_/, "")); setError(null); }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px]"
                  >
                    <option value="">Elegir cuenta…</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.id})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={adAccountId}
                    onChange={(e) => { setAdAccountId(e.target.value.replace(/[^0-9]/g, "")); setError(null); }}
                    placeholder="123456789"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] font-mono"
                  />
                )}
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-slate-700 mb-1">Business ID (opcional)</label>
                <input
                  value={businessId}
                  onChange={(e) => { setBusinessId(e.target.value.replace(/[^0-9]/g, "")); setError(null); }}
                  placeholder="1234567890123456"
                  maxLength={20}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] font-mono"
                />
                <p className="mt-1 text-[10px] text-slate-500">ID de tu Business Manager. Sirve para audiencias custom y conversiones avanzadas.</p>
              </div>
            </div>
          </div>

          {/* Form Meta Pixel + CAPI */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 mb-4">
            <div className="text-[14px] font-semibold text-slate-900 mb-1">Meta Pixel + Conversions API</div>
            <div className="text-[11px] text-slate-500 mb-4">
              Opcional. Para enviar conversiones server-side y mejorar la atribución post-iOS14.
              Si no usás Meta Pixel, dejá los campos vacíos.
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[12px] font-semibold text-slate-700 mb-1">Pixel ID</label>
                <input
                  value={pixelId}
                  onChange={(e) => { setPixelId(e.target.value.replace(/[^0-9]/g, "")); setError(null); }}
                  placeholder="1234567890123456"
                  maxLength={20}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] font-mono"
                />
                <p className="mt-1 text-[10px] text-slate-500">15-16 dígitos. Lo encontrás en business.facebook.com/events_manager.</p>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-slate-700 mb-1">Access Token CAPI (opcional)</label>
                {hasPixelAccessToken && !editingPixelToken ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-[13px] font-mono text-slate-500 flex items-center gap-2">
                      <Lock className="h-3.5 w-3.5" /> •••••••••••••••••••• (configurado)
                    </div>
                    <button
                      type="button"
                      onClick={() => { setEditingPixelToken(true); setPixelAccessToken(""); }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Edit3 className="h-3.5 w-3.5" /> Cambiar
                    </button>
                  </div>
                ) : (
                  <input
                    value={pixelAccessToken}
                    onChange={(e) => { setPixelAccessToken(e.target.value); setError(null); }}
                    placeholder="EAA... (opcional, dejá vacío para reusar el de Meta Ads)"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] font-mono"
                    autoFocus={editingPixelToken}
                  />
                )}
                <p className="mt-1 text-[10px] text-slate-500">
                  Si lo dejás vacío, NitroSales usa el token de Meta Ads (válido si tiene los permisos correctos y está asignado al pixel).
                </p>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <div className="text-[11px] text-rose-700 leading-relaxed">{error}</div>
            </div>
          )}

          {savedFlash && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <div className="text-[11px] text-emerald-700 leading-relaxed">Guardado.</div>
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-slate-900 px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
            <button
              onClick={handleConnect}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              Reconectar Meta
            </button>
            {editingPixelToken && (
              <button
                onClick={() => { setEditingPixelToken(false); setPixelAccessToken(""); setError(null); }}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[12px] font-semibold text-slate-700"
              >
                Cancelar cambio
              </button>
            )}
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
            className="w-full rounded-lg px-4 py-2.5 text-white font-semibold text-[13px] disabled:opacity-50"
            style={{ background: submitting || !fbEmailInput ? "#94a3b8" : "linear-gradient(135deg, #1877F2, #166fe5)" }}
          >
            {submitting ? "Enviando…" : "Pedir autorización"}
          </button>
        </div>
      )}
    </div>
  );
}
