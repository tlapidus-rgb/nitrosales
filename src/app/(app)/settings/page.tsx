// @ts-nocheck
"use client";

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

export default function SettingsPage() {
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

  if (loading) return <p className="text-gray-400 p-8">Cargando configuracion...</p>;

  return (
    <div className="light-canvas min-h-screen">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Configuracion</h2>
        <p className="text-gray-500">Conectores y estado de sincronizacion</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden max-w-2xl">
        <div className="p-6 border-b">
          <h3 className="font-semibold text-gray-700">Conectores</h3>
          <p className="text-xs text-gray-400 mt-1">Estado de cada fuente de datos</p>
        </div>
        <div className="divide-y">
          {displayConnectors.map((c) => (
            <div key={c.platform} className="px-6 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">{c.label}</p>
                {c.lastSyncAt && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Ultima sync: {new Date(c.lastSyncAt).toLocaleString("es-AR", {
                      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
                    })}
                  </p>
                )}
                {c.latestDataAt && (
                  <p className="text-xs text-gray-400">
                    Datos hasta: {new Date(c.latestDataAt).toLocaleString("es-AR", {
                      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
                    })}
                  </p>
                )}
                {c.status === "ERROR" && c.lastSyncError && (
                  <p className="text-xs text-red-400 mt-0.5 truncate max-w-[300px]">{c.lastSyncError}</p>
                )}
              </div>
              <span
                className={`text-xs px-3 py-1 rounded-full font-medium ${
                  c.status === "ACTIVE"
                    ? "bg-green-100 text-green-700"
                    : c.status === "ERROR"
                    ? "bg-red-100 text-red-600"
                    : c.status === "PENDING"
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {c.status === "ACTIVE"
                  ? "Activo"
                  : c.status === "ERROR"
                  ? "Error"
                  : c.status === "PENDING"
                  ? "Pendiente"
                  : "Desconectado"}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 bg-white rounded-xl shadow-sm border p-6 max-w-2xl">
        <h3 className="font-semibold text-gray-700 mb-2">Sincronizacion automatica</h3>
        <p className="text-sm text-gray-500">
          Los datos se sincronizan automaticamente todos los dias a las 9:00 AM (hora Argentina).
          Tambien podes sincronizar manualmente desde el boton en la barra superior.
        </p>
      </div>
    </div>
  );
}
