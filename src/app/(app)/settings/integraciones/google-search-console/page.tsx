// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// /settings/integraciones/google-search-console
// ══════════════════════════════════════════════════════════════
// Cliente carga la URL de su propiedad GSC + recibe instrucciones
// para invitar al service account de NitroSales como Owner.
// ══════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, AlertCircle, Loader2, Copy, Check } from "lucide-react";

interface GscStatus {
  connected: boolean;
  propertyUrl: string | null;
  daysWithData: number;
  status: string;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  serviceAccountEmail: string | null;
}

export default function GscIntegrationPage() {
  const [status, setStatus] = useState<GscStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [propertyUrl, setPropertyUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/me/gsc-status").then((x) => x.json());
      if (r?.ok) {
        setStatus(r);
        setPropertyUrl(r.propertyUrl || "");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStatus(); }, []);

  const handleSave = async () => {
    setError(null);
    setSavedFlash(false);
    if (!propertyUrl) {
      setError("Cargá la URL de tu propiedad");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/me/gsc-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyUrl }),
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

  const copyServiceAccount = () => {
    if (!status?.serviceAccountEmail) return;
    navigator.clipboard.writeText(status.serviceAccountEmail);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 1500);
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
          style={{ background: "rgba(95,99,104,0.10)", color: "#5f6368", border: "1px solid rgba(95,99,104,0.25)" }}>
          GSC
        </div>
        <div>
          <h1 className="text-[20px] font-bold text-slate-900">Google Search Console</h1>
          <p className="text-[13px] text-slate-500">Queries, impresiones, clicks y posición orgánica.</p>
        </div>
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Cargando…
        </div>
      )}

      {!loading && status && (
        <>
          <div className={`rounded-xl border p-4 mb-4 ${status.connected ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
            <div className="flex items-center gap-2">
              {status.connected ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertCircle className="h-5 w-5 text-slate-500" />}
              <div className={`text-[14px] font-semibold ${status.connected ? "text-emerald-900" : "text-slate-700"}`}>
                {status.connected ? "Conectado y sincronizando" : "No conectado"}
              </div>
            </div>
            <div className={`mt-2 text-[12px] leading-relaxed ${status.connected ? "text-emerald-800" : "text-slate-600"}`}>
              {status.connected ? (
                <>
                  <strong>{status.daysWithData}</strong> días de datos sincronizados.
                  {status.lastSyncAt && <span className="ml-2">Último sync: {new Date(status.lastSyncAt).toLocaleString("es-AR")}</span>}
                </>
              ) : (
                "Cargá la URL de tu propiedad y seguí los pasos abajo."
              )}
            </div>
            {status.lastSyncError && (
              <div className="mt-2 text-[11px] text-rose-700 bg-rose-50 px-2 py-1 rounded border border-rose-200">
                ⚠ Último error: {status.lastSyncError}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 mb-4">
            <div className="text-[14px] font-semibold text-slate-900 mb-1">URL de tu propiedad</div>
            <div className="text-[11px] text-slate-500 mb-3">
              La URL exacta como aparece en Search Console. Puede ser un dominio (ej: <code className="bg-slate-100 px-1 rounded text-[10px]">sc-domain:tutienda.com</code>) o una URL con prefijo (ej: <code className="bg-slate-100 px-1 rounded text-[10px]">https://www.tutienda.com/</code>).
            </div>
            <div className="flex gap-2 flex-wrap">
              <input
                value={propertyUrl}
                onChange={(e) => { setPropertyUrl(e.target.value); setError(null); }}
                placeholder="https://www.tutienda.com/"
                className="flex-1 min-w-[200px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] font-mono"
              />
              <button
                onClick={handleSave}
                disabled={saving || propertyUrl === (status.propertyUrl || "")}
                className="rounded-lg bg-slate-900 px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
            {error && (
              <div className="flex items-center gap-1.5 text-[11px] text-rose-600 mt-2">
                <AlertCircle className="h-3.5 w-3.5" /> {error}
              </div>
            )}
            {savedFlash && (
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 mt-2">
                <CheckCircle2 className="h-3.5 w-3.5" /> Guardado.
              </div>
            )}
          </div>

          {/* Instrucciones de invitación al service account */}
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 text-[12px] text-blue-900 leading-relaxed">
            <div className="font-semibold text-[13px] mb-2">Paso 2: invitá a NitroSales como Owner</div>
            <p className="mb-2">
              Para que podamos leer tus datos de GSC, necesitamos acceso. <strong>Solo lectura</strong>, no modificamos nada.
            </p>
            <ol className="list-decimal ml-5 space-y-1.5">
              <li>Andá a <a href="https://search.google.com/search-console" target="_blank" rel="noopener" className="underline font-semibold">search.google.com/search-console</a>.</li>
              <li>Elegí tu propiedad arriba a la izquierda.</li>
              <li>Click en <strong>Configuración</strong> (engranaje) → <strong>Usuarios y permisos</strong>.</li>
              <li>Click <strong>"Agregar usuario"</strong> → permiso <strong>"Propietario"</strong> (full).</li>
              <li>
                Pegá este email:
                {status.serviceAccountEmail ? (
                  <div className="mt-2 flex gap-2 items-center">
                    <code className="bg-white px-2 py-1 rounded border border-blue-300 font-mono text-[11px]">{status.serviceAccountEmail}</code>
                    <button
                      onClick={copyServiceAccount}
                      className="inline-flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-blue-700"
                    >
                      {copiedEmail ? <><Check className="h-3 w-3" /> Copiado</> : <><Copy className="h-3 w-3" /> Copiar</>}
                    </button>
                  </div>
                ) : (
                  <span className="ml-2 text-amber-700">(falta env GSC_SERVICE_ACCOUNT_EMAIL en el server)</span>
                )}
              </li>
              <li>Listo. En el próximo sync diario (3am UTC) vas a empezar a ver datos.</li>
            </ol>
          </div>
        </>
      )}
    </div>
  );
}
