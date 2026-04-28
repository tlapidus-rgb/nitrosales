// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// /settings/integraciones/nitropixel
// ══════════════════════════════════════════════════════════════
// Página dedicada de NitroPixel:
//   - Snippet copiable para instalar en el sitio
//   - Status (instalado / no instalado) basado en eventos recientes
//   - Tabla de últimos 10 eventos como verificación visual
// ══════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, AlertCircle, Loader2, Copy, Check, RefreshCw } from "lucide-react";

interface InstallStatus {
  isInstalled: boolean;
  eventsCount: number;
  visitorsCount: number;
  lastEventAt: string | null;
  snippetUrl: string;
  orgId: string;
}

interface PixelEvent {
  id: string;
  type: string;
  pageUrl: string | null;
  deviceType: string | null;
  country: string | null;
  receivedAt: string | null;
}

export default function NitroPixelIntegrationPage() {
  const [status, setStatus] = useState<InstallStatus | null>(null);
  const [events, setEvents] = useState<PixelEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [s, e] = await Promise.all([
        fetch("/api/nitropixel/install-status").then((r) => r.json()),
        fetch("/api/me/nitropixel-recent-events").then((r) => r.json()),
      ]);
      if (s?.ok) setStatus(s);
      if (e?.ok) setEvents(e.events || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const snippet = status
    ? `<!-- NitroPixel -->\n<script src="${status.snippetUrl}" async></script>`
    : "";

  const handleCopy = () => {
    if (!snippet) return;
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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
          style={{ background: "rgba(6,182,212,0.10)", color: "#06b6d4", border: "1px solid rgba(6,182,212,0.25)" }}>
          NP
        </div>
        <div>
          <h1 className="text-[20px] font-bold text-slate-900">NitroPixel</h1>
          <p className="text-[13px] text-slate-500">Analytics propio: sesiones, visitas, conversiones y atribución multi-touch.</p>
        </div>
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
          Cargando estado…
        </div>
      )}

      {!loading && status && (
        <>
          {/* Estado actual */}
          <div className={`rounded-xl border p-4 mb-4 ${status.isInstalled ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
            <div className="flex items-center gap-2">
              {status.isInstalled ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-amber-600" />
              )}
              <div className={`text-[14px] font-semibold ${status.isInstalled ? "text-emerald-900" : "text-amber-900"}`}>
                {status.isInstalled ? "Instalado y recibiendo eventos" : "No instalado"}
              </div>
            </div>
            <div className={`mt-2 text-[12px] leading-relaxed ${status.isInstalled ? "text-emerald-800" : "text-amber-800"}`}>
              {status.isInstalled ? (
                <>
                  <strong>{status.eventsCount.toLocaleString("es-AR")}</strong> eventos · <strong>{status.visitorsCount.toLocaleString("es-AR")}</strong> visitantes únicos
                  {status.lastEventAt && (
                    <span className="ml-3">Último evento: {new Date(status.lastEventAt).toLocaleString("es-AR")}</span>
                  )}
                </>
              ) : (
                "Pegá el snippet de abajo en el <head> de tu sitio para que NitroPixel empiece a recibir eventos."
              )}
            </div>
          </div>

          {/* Snippet de instalación */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[14px] font-semibold text-slate-900">Snippet de instalación</div>
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800"
              >
                {copied ? <><Check className="h-3.5 w-3.5" /> Copiado</> : <><Copy className="h-3.5 w-3.5" /> Copiar</>}
              </button>
            </div>
            <div className="text-[12px] text-slate-500 mb-3">
              Pegá este código en el <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">&lt;head&gt;</code> de todas las páginas de tu sitio.
              En Tienda Nube/Shopify/VTEX se carga desde el panel de admin → "Código personalizado" → "Head".
            </div>
            <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-[11px] font-mono leading-relaxed">
{snippet}
            </pre>
          </div>

          {/* Tabla de eventos recientes */}
          {events.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 mb-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-[14px] font-semibold text-slate-900">Eventos recientes</div>
                  <div className="text-[11px] text-slate-500">Últimos {events.length} eventos recibidos. Verificá que coincidan con tu navegación reciente.</div>
                </div>
                <button
                  onClick={loadAll}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Refrescar
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 text-[10px] uppercase tracking-wider">
                      <th className="text-left py-2">Evento</th>
                      <th className="text-left py-2">Página</th>
                      <th className="text-left py-2">Device</th>
                      <th className="text-left py-2">País</th>
                      <th className="text-right py-2">Cuándo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((ev) => (
                      <tr key={ev.id} className="border-b border-slate-100">
                        <td className="py-2">
                          <span className="font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded">{ev.type}</span>
                        </td>
                        <td className="py-2 text-slate-600 max-w-[200px] truncate" title={ev.pageUrl || ""}>
                          {ev.pageUrl ? new URL(ev.pageUrl).pathname : "—"}
                        </td>
                        <td className="py-2 text-slate-600">{ev.deviceType || "—"}</td>
                        <td className="py-2 text-slate-600">{ev.country || "—"}</td>
                        <td className="py-2 text-slate-600 text-right">
                          {ev.receivedAt ? new Date(ev.receivedAt).toLocaleString("es-AR") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tips de instalación */}
          {!status.isInstalled && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 text-[12px] text-blue-900 leading-relaxed">
              <div className="font-semibold mb-2">Cómo instalarlo</div>
              <ol className="list-decimal ml-5 space-y-1.5">
                <li>Copiá el snippet de arriba.</li>
                <li>Andá al admin de tu tienda (VTEX, Tienda Nube, Shopify, etc.).</li>
                <li>Buscá la sección "Código personalizado" o "Tags" del header.</li>
                <li>Pegá el snippet ahí y guardá.</li>
                <li>Volvé a esta página y refrescá. Si todo OK, vas a ver eventos arriba.</li>
              </ol>
            </div>
          )}
        </>
      )}
    </div>
  );
}
