// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// /settings/integraciones/mercadolibre
// ══════════════════════════════════════════════════════════════
// Página dedicada para conectar/gestionar MercadoLibre.
// Usa el OAuth flow oficial de ML (/api/auth/mercadolibre/connect)
// que ya estaba implementado.
// ══════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface MlStatus {
  connected: boolean;
  status: string;
  mlUserId: number | null;
  nickname: string | null;
  siteId: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
}

export default function MercadoLibreIntegrationPage() {
  const [status, setStatus] = useState<MlStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStatus = async () => {
    setLoading(true);
    try {
      // S58 unificacion: usamos el mismo endpoint que el wizard
      // (/api/me/connections/ml) en vez de /api/me/ml-status (duplicado).
      const r = await fetch("/api/me/connections/ml", { cache: "no-store" }).then((x) => x.json());
      if (r?.ok) {
        setStatus({
          connected: !!r.connected,
          status: r.status || "DISCONNECTED",
          mlUserId: r.mlUserId,
          nickname: r.nickname || null,
          siteId: r.siteId || null,
          lastSyncAt: r.lastSyncAt || null,
          lastSyncError: r.lastSyncError || null,
        } as any);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStatus(); }, []);

  const handleConnect = () => {
    const returnTo = "/settings/integraciones/mercadolibre";
    window.location.href = `/api/auth/mercadolibre/connect?returnTo=${encodeURIComponent(returnTo)}`;
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
          style={{ background: "rgba(255,209,0,0.15)", color: "#854d0e", border: "1px solid rgba(255,209,0,0.30)" }}>
          ML
        </div>
        <div>
          <h1 className="text-[20px] font-bold text-slate-900">MercadoLibre</h1>
          <p className="text-[13px] text-slate-500">Órdenes, comisiones, retenciones, reputación y publicaciones.</p>
        </div>
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
          Cargando estado…
        </div>
      )}

      {!loading && status?.connected && (
        <>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 mb-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <div className="text-[14px] font-semibold text-emerald-900">Conectado</div>
            </div>
            <div className="mt-2 text-[12px] text-emerald-800 leading-relaxed">
              ID de vendedor: <code className="bg-white px-2 py-0.5 rounded border border-emerald-200">{status.mlUserId}</code>
              {status.nickname && (
                <span className="ml-3">Nickname: <code className="bg-white px-2 py-0.5 rounded border border-emerald-200">{status.nickname}</code></span>
              )}
              {status.lastSyncAt && (
                <div className="mt-1.5 text-emerald-700">
                  Último sync: {new Date(status.lastSyncAt).toLocaleString("es-AR")}
                </div>
              )}
            </div>
            {status.lastSyncError && (
              <div className="mt-2 text-[11px] text-rose-700 bg-rose-50 px-2 py-1 rounded border border-rose-200">
                ⚠ Último error: {status.lastSyncError}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 mb-4">
            <div className="text-[13px] font-semibold text-slate-900 mb-2">Sobre la conexión</div>
            <ul className="text-[12px] text-slate-600 space-y-1.5 leading-relaxed">
              <li>• El token se renueva automáticamente cada 6 horas (refresh token).</li>
              <li>• Si cambiás permisos en tu cuenta ML, hacé "Reconectar" para que el token se actualice.</li>
              <li>• Solo lectura: NitroSales nunca modifica nada en tu cuenta MercadoLibre.</li>
            </ul>
          </div>

          <button
            onClick={handleConnect}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            Reconectar
          </button>
        </>
      )}

      {!loading && !status?.connected && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-[14px] font-semibold text-slate-900 mb-2">Conectar MercadoLibre</div>
          <div className="text-[12px] text-slate-600 leading-relaxed mb-4">
            Vas a entrar al login oficial de MercadoLibre para autorizar a NitroSales a leer tus órdenes,
            productos y métricas. <strong>Solo lectura</strong>, nunca modificamos nada en tu cuenta ML.
          </div>

          {status?.lastSyncError && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 mb-4">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <div className="text-[11px] text-rose-700 leading-relaxed">
                <strong>Último error:</strong> {status.lastSyncError}
              </div>
            </div>
          )}

          <button
            onClick={handleConnect}
            className="w-full rounded-lg px-4 py-3 font-bold text-[14px]"
            style={{
              background: "linear-gradient(135deg, #FFF159 0%, #FFE600 55%, #FFD100 100%)",
              color: "#1A1A1A",
              boxShadow: "0 4px 16px rgba(255,230,0,0.25)",
            }}
          >
            Ingresar con MercadoLibre
          </button>
          <p className="mt-3 text-[10px] text-slate-500 leading-relaxed">
            ML te va a pedir tu usuario/email y password de tu cuenta. NitroSales nunca ve esa información —
            solo recibe un token temporal con permisos de lectura.
          </p>
        </div>
      )}
    </div>
  );
}
