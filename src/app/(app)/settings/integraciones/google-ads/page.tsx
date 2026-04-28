// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// /settings/integraciones/google-ads
// ══════════════════════════════════════════════════════════════
// Página dedicada para conectar/gestionar Google Ads.
// Mismo patrón que /settings/integraciones/meta (4 estados +
// reuso de endpoints existentes).
// ══════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock, AlertCircle } from "lucide-react";

type AuthState = "NONE" | "PENDING" | "APPROVED" | "CONNECTED" | "LOADING";

export default function GoogleAdsIntegrationPage() {
  const [authState, setAuthState] = useState<AuthState>("LOADING");
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);

  const [emailInput, setEmailInput] = useState("");
  const [customerIdInput, setCustomerIdInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingCustomer, setSavingCustomer] = useState(false);

  const loadStatus = async () => {
    try {
      const r = await fetch("/api/me/google-auth-status").then((x) => x.json());
      setAuthState(r?.state || "NONE");
      setGoogleEmail(r?.googleEmail || null);
      setCustomerId(r?.customerId || null);
      setCustomerIdInput(r?.customerId || "");
    } catch (e) {
      setAuthState("NONE");
    }
  };

  useEffect(() => {
    loadStatus();
    const params = new URLSearchParams(window.location.search);
    if (params.get("googleConnected") === "1") {
      const cleaned = new URL(window.location.href);
      cleaned.searchParams.delete("googleConnected");
      window.history.replaceState({}, "", cleaned.toString());
      setTimeout(loadStatus, 500);
    }
  }, []);

  const handleRequest = async () => {
    const email = emailInput.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Email inválido");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/me/google-auth-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ googleEmail: email }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data?.error || "Error en la solicitud");
        return;
      }
      setAuthState("PENDING");
      setGoogleEmail(email);
    } catch (e: any) {
      setError(e?.message || "Error de red");
    } finally {
      setSubmitting(false);
    }
  };

  const handleConnect = () => {
    const returnTo = "/settings/integraciones/google-ads";
    window.location.href = `/api/auth/google-ads?returnTo=${encodeURIComponent(returnTo)}`;
  };

  const handleSaveCustomerId = async () => {
    const cid = customerIdInput.replace(/[^0-9]/g, "");
    if (!cid || cid.length !== 10) {
      setError("Customer ID debe tener 10 dígitos");
      return;
    }
    setSavingCustomer(true);
    setError(null);
    try {
      await fetch("/api/me/google-set-customer-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: cid }),
      });
      setCustomerId(cid);
    } finally {
      setSavingCustomer(false);
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
          style={{ background: "rgba(66,133,244,0.10)", color: "#4285F4", border: "1px solid rgba(66,133,244,0.25)" }}>
          G
        </div>
        <div>
          <h1 className="text-[20px] font-bold text-slate-900">Google Ads</h1>
          <p className="text-[13px] text-slate-500">Spend, impresiones y conversiones de campañas Google.</p>
        </div>
      </div>

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
              <div className="text-[14px] font-semibold text-emerald-900">Conectado con Google Ads</div>
            </div>
            <div className="mt-2 text-[12px] text-emerald-800 leading-relaxed">
              Token OAuth guardado. {googleEmail && `Cuenta autorizada: ${googleEmail}`}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="text-[13px] font-semibold text-slate-900 mb-2">Customer ID</div>
            <div className="text-[12px] text-slate-500 mb-3">
              10 dígitos sin guiones. Lo encontrás arriba a la derecha en ads.google.com.
            </div>
            <div className="flex gap-2">
              <input
                value={customerIdInput}
                onChange={(e) => { setCustomerIdInput(e.target.value.replace(/[^0-9]/g, "")); setError(null); }}
                placeholder="1234567890"
                maxLength={10}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] font-mono"
              />
              <button
                onClick={handleSaveCustomerId}
                disabled={savingCustomer || customerIdInput === customerId}
                className="rounded-lg bg-slate-900 px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
              >
                {savingCustomer ? "Guardando…" : "Guardar"}
              </button>
            </div>
            {error && (
              <div className="flex items-center gap-1.5 text-[11px] text-rose-600 mt-2">
                <AlertCircle className="h-3.5 w-3.5" />
                {error}
              </div>
            )}
          </div>

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
              Ya podés conectar con Google Ads.
            </div>
          </div>
          <button
            onClick={handleConnect}
            className="w-full rounded-lg px-4 py-3 text-white font-bold text-[14px]"
            style={{
              background: "linear-gradient(135deg, #4285F4, #1a73e8)",
              boxShadow: "0 4px 12px rgba(66,133,244,0.30)",
            }}
          >
            Conectar con Google
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
            {googleEmail && (
              <div className="mt-2">
                Email Google: <code className="bg-white px-2 py-0.5 rounded border border-amber-200">{googleEmail}</code>
              </div>
            )}
          </div>
        </div>
      )}

      {authState === "NONE" && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-[14px] font-semibold text-slate-900 mb-2">Antes de conectar Google Ads</div>
          <div className="text-[12px] text-slate-600 leading-relaxed mb-4">
            Necesitamos autorizarte como usuario de prueba (1 paso de nuestro lado, ~1 día).
            Pasanos el <strong>email de Google</strong> con el que entrás a Google Ads.
          </div>
          <label className="block text-[12px] font-semibold text-slate-700 mb-1">Email de Google</label>
          <input
            type="email"
            value={emailInput}
            onChange={(e) => { setEmailInput(e.target.value); setError(null); }}
            placeholder="tu@gmail.com"
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
            disabled={submitting || !emailInput}
            className="w-full rounded-lg px-4 py-2.5 text-white font-semibold text-[13px] disabled:opacity-50"
            style={{ background: submitting || !emailInput ? "#94a3b8" : "linear-gradient(135deg, #4285F4, #1a73e8)" }}
          >
            {submitting ? "Enviando…" : "Pedir autorización"}
          </button>
        </div>
      )}
    </div>
  );
}
