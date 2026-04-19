// @ts-nocheck
"use client";

/**
 * /settings/integraciones — Fase 7b (shim) → Fase 7e upgrade premium.
 * Por ahora mantiene la UI legacy del /settings/page.tsx original
 * para no romper funcionalidad mientras 7e esta pendiente.
 */

import { useEffect, useState } from "react";

interface Connector {
  platform: string;
  label: string;
  status: string;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  latestDataAt: string | null;
}

const DEFAULT_CONNECTORS: Connector[] = [
  { platform: "VTEX", label: "VTEX - Ecommerce", status: "PENDING", lastSyncAt: null, lastSyncError: null, latestDataAt: null },
  { platform: "GA4", label: "Google Analytics 4", status: "PENDING", lastSyncAt: null, lastSyncError: null, latestDataAt: null },
  { platform: "GOOGLE_ADS", label: "Google Ads", status: "PENDING", lastSyncAt: null, lastSyncError: null, latestDataAt: null },
  { platform: "META_ADS", label: "Meta Ads", status: "PENDING", lastSyncAt: null, lastSyncError: null, latestDataAt: null },
  { platform: "GOOGLE_SEARCH_CONSOLE", label: "Google Search Console", status: "PENDING", lastSyncAt: null, lastSyncError: null, latestDataAt: null },
];

export default function IntegracionesPage() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/connectors")
      .then((r) => r.json())
      .then((data) => {
        if (data.connectors) setConnectors(data.connectors);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const displayConnectors = connectors.length > 0 ? connectors : DEFAULT_CONNECTORS;

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8">
        <p className="text-sm text-slate-400">Cargando integraciones…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">
          Integraciones
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Conectá tus plataformas externas. Cada conector sincroniza datos al Pulso y al P&L.
        </p>
      </div>

      <div className="space-y-2">
        {displayConnectors.map((c) => (
          <div
            key={c.platform}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4"
          >
            <div>
              <div className="text-sm font-semibold text-slate-900">{c.label}</div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                {c.lastSyncAt
                  ? `Último sync: ${new Date(c.lastSyncAt).toLocaleString("es-AR")}`
                  : "Sin sincronizar"}
              </div>
            </div>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{
                background:
                  c.status === "CONNECTED"
                    ? "rgba(16,185,129,0.1)"
                    : c.status === "ERROR"
                    ? "rgba(239,68,68,0.1)"
                    : "rgba(148,163,184,0.12)",
                color:
                  c.status === "CONNECTED"
                    ? "#10b981"
                    : c.status === "ERROR"
                    ? "#ef4444"
                    : "#64748b",
              }}
            >
              {c.status}
            </span>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-[11px] text-slate-500">
        <strong className="text-slate-700">Nota:</strong> esta vista recibe
        upgrade completo en Fase 7e (mensajes de error en castellano,
        reconexión con un click, estado más granular por plataforma).
      </div>
    </div>
  );
}
