// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// /settings/integraciones/vtex
// ══════════════════════════════════════════════════════════════
// Página dedicada para conectar/gestionar VTEX. UX patrón Stripe/Vercel:
//   - Si hay conexión activa: pre-rellena campos NO secretos (accountName,
//     storeUrl, salesChannelId). Secretos (appKey/appToken) se muestran
//     como "•••••••• (configurado)" con botón "Cambiar".
//   - Si NO hay conexión: form vacío para primera carga.
//   - Botón "Guardar cambios" siempre visible.
//   - Botón "Probar credenciales" reutiliza secretos guardados si no se
//     reemplazaron en el form.
// ══════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, AlertCircle, Loader2, Lock, Edit3 } from "lucide-react";

interface VtexStatus {
  connected: boolean;
  status: string;
  accountName: string | null;
  hasKey: boolean;
  hasToken: boolean;
  storeUrl: string | null;
  salesChannelId: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
}

export default function VtexIntegrationPage() {
  const [status, setStatus] = useState<VtexStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state — pre-rellenado con datos del status.
  const [accountName, setAccountName] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const [salesChannelId, setSalesChannelId] = useState("1");

  // Secretos: se pre-llenan vacíos. Si hay creds guardadas, mostramos
  // placeholder y dejamos vacío hasta que el cliente apriete "Cambiar".
  const [appKey, setAppKey] = useState("");
  const [appToken, setAppToken] = useState("");
  const [editingAppKey, setEditingAppKey] = useState(false);
  const [editingAppToken, setEditingAppToken] = useState(false);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(null);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/me/vtex-status").then((x) => x.json());
      if (r?.ok) {
        setStatus(r);
        // Pre-rellena campos no-secretos.
        setAccountName(r.accountName || "");
        setStoreUrl(r.storeUrl || "");
        setSalesChannelId(r.salesChannelId || "1");
        // Secretos: dejamos vacíos. Si ya hay guardados, el placeholder
        // del input lo indica con "•••••••• (configurado)".
        setAppKey("");
        setAppToken("");
        setEditingAppKey(false);
        setEditingAppToken(false);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStatus(); }, []);

  const handleSave = async () => {
    setError(null);
    setTestResult(null);
    setSavedFlash(false);

    if (!accountName) {
      setError("Account Name es obligatorio");
      return;
    }
    // Si vino editingAppKey y appKey no tiene 30+ chars → error.
    if (editingAppKey && appKey && appKey.length < 20) {
      setError(`App Key muy corta (${appKey.length} chars). Debería tener 30+.`);
      return;
    }
    if (editingAppToken && appToken && appToken.length < 40) {
      setError(`App Token muy corto (${appToken.length} chars). Debería tener 60+.`);
      return;
    }
    // Primera carga (no hay creds en DB): exige appKey + appToken.
    if (!status?.hasKey && !appKey) {
      setError("App Key requerida (primera carga)");
      return;
    }
    if (!status?.hasToken && !appToken) {
      setError("App Token requerido (primera carga)");
      return;
    }

    setSaving(true);
    try {
      const r = await fetch("/api/me/vtex-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountName,
          storeUrl,
          salesChannelId,
          // Solo mandamos los secretos si el cliente los reemplazó.
          ...(editingAppKey && appKey ? { appKey } : {}),
          ...(editingAppToken && appToken ? { appToken } : {}),
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data?.error || "Error guardando credenciales");
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

  const handleTest = async () => {
    if (!accountName) {
      setError("Cargá Account Name antes de probar");
      return;
    }
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const r = await fetch("/api/me/vtex-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountName,
          // Si el cliente está editando los secretos, mandamos los nuevos.
          // Si no, el endpoint los toma de la DB automáticamente.
          ...(editingAppKey && appKey ? { appKey } : {}),
          ...(editingAppToken && appToken ? { appToken } : {}),
        }),
      });
      const data = await r.json();
      setTestResult({ ok: !!data?.ok, detail: data?.detail || data?.error || "Sin detalle" });
    } catch (e: any) {
      setTestResult({ ok: false, detail: e?.message || "Error de red" });
    } finally {
      setTesting(false);
    }
  };

  const isConnected = !!status?.connected;

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
          style={{ background: "rgba(255,51,102,0.10)", color: "#ff3366", border: "1px solid rgba(255,51,102,0.25)" }}>
          V
        </div>
        <div>
          <h1 className="text-[20px] font-bold text-slate-900">VTEX</h1>
          <p className="text-[13px] text-slate-500">Órdenes, productos, stock y precios desde tu tienda VTEX.</p>
        </div>
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
          Cargando estado…
        </div>
      )}

      {!loading && (
        <>
          {/* Estado actual: badge arriba */}
          <div className={`rounded-xl border p-4 mb-4 ${isConnected ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
            <div className="flex items-center gap-2">
              {isConnected ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-slate-500" />
              )}
              <div className={`text-[14px] font-semibold ${isConnected ? "text-emerald-900" : "text-slate-700"}`}>
                {isConnected ? "Conectado" : "No conectado"}
              </div>
            </div>
            <div className={`mt-1.5 text-[12px] leading-relaxed ${isConnected ? "text-emerald-800" : "text-slate-600"}`}>
              {isConnected
                ? `Tienda: ${status?.accountName}.vtexcommercestable.com.br`
                : "Cargá las credenciales abajo para conectar tu tienda VTEX."}
              {status?.lastSyncAt && (
                <span className="ml-3">Último sync: {new Date(status.lastSyncAt).toLocaleString("es-AR")}</span>
              )}
            </div>
            {status?.lastSyncError && (
              <div className="mt-2 text-[11px] text-rose-700 bg-rose-50 px-2 py-1 rounded border border-rose-200">
                ⚠ Último error: {status.lastSyncError}
              </div>
            )}
          </div>

          {/* Form siempre editable, pre-rellenado */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="text-[14px] font-semibold text-slate-900 mb-4">Configuración</div>

            <div className="space-y-3">
              <div>
                <label className="block text-[12px] font-semibold text-slate-700 mb-1">Account Name</label>
                <input
                  value={accountName}
                  onChange={(e) => { setAccountName(e.target.value.replace(/[^a-zA-Z0-9-]/g, "")); setError(null); }}
                  placeholder="mitienda"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] font-mono"
                />
                <p className="mt-1 text-[10px] text-slate-500">El subdominio de tu admin: <strong>{accountName || "mitienda"}</strong>.vtexcommercestable.com.br</p>
              </div>

              {/* App Key: protegido si ya hay uno cargado */}
              <div>
                <label className="block text-[12px] font-semibold text-slate-700 mb-1">App Key</label>
                {status?.hasKey && !editingAppKey ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-[13px] font-mono text-slate-500 flex items-center gap-2">
                      <Lock className="h-3.5 w-3.5" /> •••••••••••••••••••••• (configurado)
                    </div>
                    <button
                      type="button"
                      onClick={() => { setEditingAppKey(true); setAppKey(""); }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Edit3 className="h-3.5 w-3.5" /> Cambiar
                    </button>
                  </div>
                ) : (
                  <input
                    value={appKey}
                    onChange={(e) => { setAppKey(e.target.value); setError(null); }}
                    placeholder="vtexappkey-mitienda-XXXXXX"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] font-mono"
                    autoFocus={editingAppKey}
                  />
                )}
              </div>

              {/* App Token: protegido si ya hay uno cargado */}
              <div>
                <label className="block text-[12px] font-semibold text-slate-700 mb-1">App Token</label>
                {status?.hasToken && !editingAppToken ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-[13px] font-mono text-slate-500 flex items-center gap-2">
                      <Lock className="h-3.5 w-3.5" /> •••••••••••••••••••••• (configurado)
                    </div>
                    <button
                      type="button"
                      onClick={() => { setEditingAppToken(true); setAppToken(""); }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Edit3 className="h-3.5 w-3.5" /> Cambiar
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      value={appToken}
                      onChange={(e) => { setAppToken(e.target.value); setError(null); }}
                      placeholder="60+ caracteres, NO lo cortes al copiar"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] font-mono"
                      autoFocus={editingAppToken}
                    />
                    {appToken && appToken.length < 40 && (
                      <p className="mt-1 text-[10px] text-amber-700">
                        ⚠ Solo {appToken.length} chars — el token completo tiene 60+. Volvé al admin VTEX y copialo entero.
                      </p>
                    )}
                  </>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-semibold text-slate-700 mb-1">Store URL (opcional)</label>
                  <input
                    value={storeUrl}
                    onChange={(e) => setStoreUrl(e.target.value)}
                    placeholder="https://www.mitienda.com.ar"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[12px]"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-slate-700 mb-1">Sales Channel</label>
                  <input
                    value={salesChannelId}
                    onChange={(e) => setSalesChannelId(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="1"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[12px] font-mono"
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                <div className="text-[11px] text-rose-700 leading-relaxed">{error}</div>
              </div>
            )}

            {savedFlash && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <div className="text-[11px] text-emerald-700 leading-relaxed">Guardado.</div>
              </div>
            )}

            {testResult && (
              <div className={`mt-4 flex items-start gap-2 rounded-lg border p-3 ${testResult.ok ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
                {testResult.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />}
                <div className={`text-[11px] leading-relaxed ${testResult.ok ? "text-emerald-700" : "text-rose-700"}`}>
                  <strong>Test {testResult.ok ? "OK" : "Falló"}:</strong> {testResult.detail}
                </div>
              </div>
            )}

            <div className="mt-4 flex gap-2 flex-wrap">
              <button
                onClick={handleTest}
                disabled={testing || !accountName}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[12px] font-semibold text-slate-700 disabled:opacity-50"
              >
                {testing ? "Probando…" : "Probar credenciales"}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !accountName}
                className="rounded-lg bg-slate-900 px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
              {(editingAppKey || editingAppToken) && (
                <button
                  onClick={() => { setEditingAppKey(false); setEditingAppToken(false); setAppKey(""); setAppToken(""); setError(null); }}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[12px] font-semibold text-slate-700"
                >
                  Cancelar cambio de secretos
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
