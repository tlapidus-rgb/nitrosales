// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// /settings/integraciones/vtex
// ══════════════════════════════════════════════════════════════
// Página dedicada para conectar/gestionar VTEX.
// VTEX no tiene OAuth — el cliente carga manualmente accountName +
// appKey + appToken desde su admin VTEX.
//
// Estados:
//   NONE/DISCONNECTED → form para cargar credenciales
//   CONNECTED → muestra estado + opción de "Reemplazar credenciales"
//   ERROR → muestra error + opción de actualizar
// ══════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

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

  // Form state
  const [accountName, setAccountName] = useState("");
  const [appKey, setAppKey] = useState("");
  const [appToken, setAppToken] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const [salesChannelId, setSalesChannelId] = useState("1");
  const [editing, setEditing] = useState(false);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(null);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/me/vtex-status").then((x) => x.json());
      if (r?.ok) {
        setStatus(r);
        if (r.connected && r.accountName) {
          setAccountName(r.accountName);
          setStoreUrl(r.storeUrl || "");
          setSalesChannelId(r.salesChannelId || "1");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStatus(); }, []);

  const handleSave = async () => {
    setError(null);
    setTestResult(null);
    if (!accountName || !appKey || !appToken) {
      setError("Account Name, App Key y App Token son obligatorios");
      return;
    }
    if (appToken.length < 40) {
      setError(`App Token parece incompleto (${appToken.length} chars). Debería tener 60+.`);
      return;
    }
    if (appKey.length < 20) {
      setError(`App Key parece incompleta (${appKey.length} chars). Debería tener 30+.`);
      return;
    }

    setSaving(true);
    try {
      const r = await fetch("/api/me/vtex-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountName, appKey, appToken, storeUrl, salesChannelId }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data?.error || "Error guardando credenciales");
        return;
      }
      setEditing(false);
      setAppKey("");
      setAppToken("");
      await loadStatus();
    } catch (e: any) {
      setError(e?.message || "Error de red");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!accountName || !appKey || !appToken) {
      setError("Cargá las credenciales antes de probar");
      return;
    }
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const r = await fetch("/api/me/vtex-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountName, appKey, appToken }),
      });
      const data = await r.json();
      setTestResult({ ok: !!data?.ok, detail: data?.detail || data?.error || "Sin detalle" });
    } catch (e: any) {
      setTestResult({ ok: false, detail: e?.message || "Error de red" });
    } finally {
      setTesting(false);
    }
  };

  const isConnected = status?.connected && !editing;

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

      {!loading && isConnected && (
        <>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 mb-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <div className="text-[14px] font-semibold text-emerald-900">Conectado</div>
            </div>
            <div className="mt-2 text-[12px] text-emerald-800 leading-relaxed">
              Tienda: <code className="bg-white px-2 py-0.5 rounded border border-emerald-200">{status?.accountName}</code>
              {status?.lastSyncAt && (
                <span className="ml-3 text-emerald-700">
                  Último sync: {new Date(status.lastSyncAt).toLocaleString("es-AR")}
                </span>
              )}
            </div>
            {status?.lastSyncError && (
              <div className="mt-2 text-[11px] text-rose-700 bg-rose-50 px-2 py-1 rounded border border-rose-200">
                ⚠ Último error: {status.lastSyncError}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 mb-4">
            <div className="text-[13px] font-semibold text-slate-900 mb-3">Configuración actual</div>
            <dl className="space-y-2 text-[12px]">
              <div className="flex"><dt className="w-32 text-slate-500">Account name:</dt><dd className="text-slate-900 font-mono">{status?.accountName}</dd></div>
              <div className="flex"><dt className="w-32 text-slate-500">App Key:</dt><dd className="text-slate-900 font-mono">{status?.hasKey ? "•••••••• (configurado)" : "—"}</dd></div>
              <div className="flex"><dt className="w-32 text-slate-500">App Token:</dt><dd className="text-slate-900 font-mono">{status?.hasToken ? "•••••••• (configurado)" : "—"}</dd></div>
              <div className="flex"><dt className="w-32 text-slate-500">Store URL:</dt><dd className="text-slate-900 font-mono">{status?.storeUrl || "—"}</dd></div>
              <div className="flex"><dt className="w-32 text-slate-500">Sales channel:</dt><dd className="text-slate-900 font-mono">{status?.salesChannelId || "1"}</dd></div>
            </dl>
          </div>

          <button
            onClick={() => { setEditing(true); setAppKey(""); setAppToken(""); }}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            Reemplazar credenciales
          </button>
        </>
      )}

      {!loading && !isConnected && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-[14px] font-semibold text-slate-900 mb-1">
            {editing ? "Reemplazar credenciales VTEX" : "Conectar VTEX"}
          </div>
          <div className="text-[12px] text-slate-500 mb-4">
            En tu admin VTEX → Cuenta → Claves de aplicación, generá una App Key + App Token con los roles:
            OMS — orders viewer, Catalog — read, Logistics — viewer.
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[12px] font-semibold text-slate-700 mb-1">Account Name</label>
              <input
                value={accountName}
                onChange={(e) => { setAccountName(e.target.value.replace(/[^a-zA-Z0-9-]/g, "")); setError(null); }}
                placeholder="mitienda"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] font-mono"
              />
              <p className="mt-1 text-[10px] text-slate-500">Es el subdominio de tu admin: mitienda.vtexcommercestable.com.br</p>
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-slate-700 mb-1">App Key</label>
              <input
                value={appKey}
                onChange={(e) => { setAppKey(e.target.value); setError(null); }}
                placeholder="vtexappkey-mitienda-XXXXXX"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] font-mono"
              />
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-slate-700 mb-1">App Token</label>
              <input
                value={appToken}
                onChange={(e) => { setAppToken(e.target.value); setError(null); }}
                placeholder="60+ caracteres, NO lo cortes al copiar"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] font-mono"
              />
              {appToken && appToken.length < 40 && (
                <p className="mt-1 text-[10px] text-amber-700">
                  ⚠ Solo {appToken.length} chars — el token completo tiene 60+. Volvé al admin VTEX y copialo entero.
                </p>
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

          {testResult && (
            <div className={`mt-4 flex items-start gap-2 rounded-lg border p-3 ${testResult.ok ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
              {testResult.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />}
              <div className={`text-[11px] leading-relaxed ${testResult.ok ? "text-emerald-700" : "text-rose-700"}`}>
                <strong>Test {testResult.ok ? "OK" : "Falló"}:</strong> {testResult.detail}
              </div>
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button
              onClick={handleTest}
              disabled={testing || !accountName || !appKey || !appToken}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[12px] font-semibold text-slate-700 disabled:opacity-50"
            >
              {testing ? "Probando…" : "Probar credenciales"}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !accountName || !appKey || !appToken}
              className="rounded-lg bg-slate-900 px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Guardar conexión"}
            </button>
            {editing && (
              <button
                onClick={() => { setEditing(false); setError(null); setTestResult(null); }}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[12px] font-semibold text-slate-700"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
