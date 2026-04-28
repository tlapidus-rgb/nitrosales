// @ts-nocheck
"use client";

/**
 * /settings/integraciones — Fase 7e
 * ─────────────────────────────────────────────────────────────
 * Lista de conectores con status premium, mensajes de error en
 * castellano, indicador de freshness de data, y CTA de reconexion
 * cuando hay un error conocido.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  Plug,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Loader2,
  Clock,
  RefreshCw,
  ExternalLink,
  Info,
} from "lucide-react";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";

type Status = "CONNECTED" | "SYNCING" | "ERROR" | "PENDING" | "DISCONNECTED";

interface Connector {
  platform: string;
  label: string;
  status: Status;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  latestDataAt: string | null;
}

const PLATFORM_META: Record<
  string,
  {
    label: string;
    description: string;
    color: string;
    docsHref?: string;
    connectHref?: string;
  }
> = {
  VTEX: {
    label: "VTEX",
    description: "Órdenes, productos y stock de tu tienda VTEX.",
    color: "#ff3366",
  },
  // S58 BP-S58-001: GA4 eliminado. Analytics se hacen via NitroPixel.
  GOOGLE_ADS: {
    label: "Google Ads",
    description: "Spend, impresiones y conversiones de campañas Google.",
    color: "#4285f4",
  },
  META_ADS: {
    label: "Meta Ads",
    description: "Spend, reach y performance de Facebook/Instagram Ads.",
    color: "#1877f2",
  },
  GOOGLE_SEARCH_CONSOLE: {
    label: "Google Search Console",
    description: "Queries, impresiones y posición orgánica.",
    color: "#5f6368",
  },
  MERCADOLIBRE: {
    label: "MercadoLibre",
    description: "Órdenes, comisiones, retenciones y reputación.",
    color: "#fed100",
  },
  NITROPIXEL: {
    label: "NitroPixel",
    description: "Analytics propio: sesiones, conversiones y atribución.",
    color: "#06b6d4",
  },
};

const STATUS_META: Record<
  Status,
  {
    label: string;
    color: string;
    bg: string;
    border: string;
    icon: React.ComponentType<any>;
  }
> = {
  CONNECTED: {
    label: "Conectado",
    color: "#10b981",
    bg: "rgba(16,185,129,0.08)",
    border: "rgba(16,185,129,0.25)",
    icon: CheckCircle2,
  },
  SYNCING: {
    label: "Sincronizando",
    color: "#0ea5e9",
    bg: "rgba(14,165,233,0.08)",
    border: "rgba(14,165,233,0.25)",
    icon: Loader2,
  },
  ERROR: {
    label: "Error",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.08)",
    border: "rgba(239,68,68,0.25)",
    icon: AlertCircle,
  },
  PENDING: {
    label: "Pendiente",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.08)",
    border: "rgba(245,158,11,0.25)",
    icon: Clock,
  },
  DISCONNECTED: {
    label: "Desconectado",
    color: "#64748b",
    bg: "rgba(148,163,184,0.1)",
    border: "rgba(148,163,184,0.22)",
    icon: XCircle,
  },
};

function humanizeError(raw: string | null): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.includes("401") || lower.includes("unauthoriz")) {
    return "Token expirado. Hace falta reconectar la cuenta.";
  }
  if (lower.includes("403") || lower.includes("forbidden")) {
    return "Sin permisos suficientes. Verificá los scopes al reconectar.";
  }
  if (lower.includes("429") || lower.includes("rate limit")) {
    return "Límite de API alcanzado. Se reintenta automáticamente en 1 hora.";
  }
  if (
    lower.includes("network") ||
    lower.includes("timeout") ||
    lower.includes("econnreset")
  ) {
    return "Error de red. Se reintenta en el próximo sync programado.";
  }
  if (lower.includes("not found") || lower.includes("404")) {
    return "Recurso no encontrado. ¿Se renombró la cuenta o propiedad?";
  }
  if (lower.includes("refresh token")) {
    return "Refresh token inválido. Necesita reconexión manual.";
  }
  if (raw.length > 140) return `${raw.slice(0, 140)}…`;
  return raw;
}

function formatRelativeDate(iso: string | null): string {
  if (!iso) return "Nunca";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "Hace instantes";
  if (mins < 60) return `Hace ${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `Hace ${days}d`;
  return d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function IntegracionesPage() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/connectors");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setConnectors(json.connectors ?? []);
    } catch (e: any) {
      setError(e.message ?? "Error cargando integraciones");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const summary = useMemo(() => {
    const acc = { connected: 0, error: 0, pending: 0 };
    for (const c of connectors) {
      if (c.status === "CONNECTED") acc.connected++;
      else if (c.status === "ERROR") acc.error++;
      else if (c.status === "PENDING" || c.status === "DISCONNECTED")
        acc.pending++;
    }
    return acc;
  }, [connectors]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-slate-100/50" />
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-2xl border border-slate-200 bg-slate-100/50"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header + summary */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Plug className="h-4 w-4 text-emerald-600" />
              <h2 className="text-sm font-semibold tracking-tight text-slate-900">
                Integraciones
              </h2>
            </div>
            <p className="mt-1 text-[12px] text-slate-500">
              Conectá VTEX, MercadoLibre, Google Ads, Meta Ads y más para que
              NitroSales sincronice tu data automáticamente.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            style={{ transition: `all 160ms ${ES}` }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refrescar
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
          <SummaryChip
            label="Conectadas"
            value={summary.connected}
            color="#10b981"
          />
          <SummaryChip label="Con error" value={summary.error} color="#ef4444" />
          <SummaryChip
            label="Pendientes"
            value={summary.pending}
            color="#64748b"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600" />
            <div className="text-sm font-semibold text-rose-900">
              No se pudieron cargar las integraciones
            </div>
          </div>
          <div className="mt-1 text-[12px] text-rose-700">{error}</div>
        </div>
      )}

      <div className="space-y-2">
        {connectors.map((c) => (
          <ConnectorRow key={c.platform} connector={c} />
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <div className="text-[11px] text-slate-600 leading-relaxed">
            <strong className="text-slate-700">Sync automático:</strong> VTEX y
            MercadoLibre vía webhooks en tiempo real con cron de seguridad 1×/día.
            Google/Meta Ads on-demand al abrir sus dashboards. GA4 y GSC cron
            diario.
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryChip({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-xl border bg-white px-3 py-2"
      style={{ borderColor: `${color}30` }}
    >
      <div
        className="flex h-7 w-7 items-center justify-center rounded-lg text-[12px] font-semibold tabular-nums"
        style={{
          background: `${color}10`,
          color,
          border: `1px solid ${color}22`,
        }}
      >
        {value}
      </div>
      <div className="text-[11px] font-medium text-slate-600">{label}</div>
    </div>
  );
}

function ConnectorRow({ connector }: { connector: Connector }) {
  const meta = PLATFORM_META[connector.platform] ?? {
    label: connector.platform,
    description: "Sin descripción",
    color: "#64748b",
  };
  const statusMeta = STATUS_META[connector.status] ?? STATUS_META.DISCONNECTED;
  const StatusIcon = statusMeta.icon;
  const humanError = humanizeError(connector.lastSyncError);
  const isError = connector.status === "ERROR";
  const isDisconnected =
    connector.status === "DISCONNECTED" || connector.status === "PENDING";

  return (
    <div
      className="rounded-2xl border bg-white p-4 transition"
      style={{
        borderColor: isError ? "rgba(239,68,68,0.25)" : "rgba(226,232,240,1)",
        boxShadow: isError
          ? "0 1px 2px rgba(239,68,68,0.05), 0 4px 12px rgba(239,68,68,0.03)"
          : "0 1px 2px rgba(15,23,42,0.03)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold"
            style={{
              background: `${meta.color}15`,
              color: meta.color,
              border: `1px solid ${meta.color}30`,
            }}
          >
            {meta.label[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold tracking-tight text-slate-900">
                {meta.label}
              </span>
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em]"
                style={{
                  background: statusMeta.bg,
                  color: statusMeta.color,
                  border: `1px solid ${statusMeta.border}`,
                }}
              >
                <StatusIcon
                  className={`h-2.5 w-2.5 ${
                    connector.status === "SYNCING" ? "animate-spin" : ""
                  }`}
                />
                {statusMeta.label}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500 leading-relaxed">
              {meta.description}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-500">
              <span>
                Último sync:{" "}
                <span className="font-medium text-slate-700">
                  {formatRelativeDate(connector.lastSyncAt)}
                </span>
              </span>
              {connector.latestDataAt && (
                <span>
                  Datos al:{" "}
                  <span className="font-medium text-slate-700">
                    {formatRelativeDate(connector.latestDataAt)}
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* S58: link a página dedicada para las 4 plataformas principales. */}
          {connector.platform === "META_ADS" && (
            <a
              href="/settings/integraciones/meta"
              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              {connector.status === "CONNECTED" ? "Gestionar" : "Conectar"}
            </a>
          )}
          {connector.platform === "GOOGLE_ADS" && (
            <a
              href="/settings/integraciones/google-ads"
              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              {connector.status === "CONNECTED" ? "Gestionar" : "Conectar"}
            </a>
          )}
          {connector.platform === "VTEX" && (
            <a
              href="/settings/integraciones/vtex"
              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              {connector.status === "CONNECTED" ? "Gestionar" : "Conectar"}
            </a>
          )}
          {connector.platform === "MERCADOLIBRE" && (
            <a
              href="/settings/integraciones/mercadolibre"
              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              {connector.status === "CONNECTED" ? "Gestionar" : "Conectar"}
            </a>
          )}
          {connector.platform === "GOOGLE_SEARCH_CONSOLE" && (
            <a
              href="/settings/integraciones/google-search-console"
              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              {connector.status === "CONNECTED" ? "Gestionar" : "Conectar"}
            </a>
          )}
          {connector.platform === "NITROPIXEL" && (
            <a
              href="/settings/integraciones/nitropixel"
              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              {connector.status === "CONNECTED" ? "Gestionar" : "Configurar"}
            </a>
          )}
          {!["META_ADS", "GOOGLE_ADS", "VTEX", "MERCADOLIBRE", "GOOGLE_SEARCH_CONSOLE", "NITROPIXEL"].includes(connector.platform) && (isError || isDisconnected) && (
            <a
              href={
                meta.connectHref ??
                `/api/auth/connect/${connector.platform.toLowerCase()}`
              }
              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              <RefreshCw className="h-3 w-3" />
              {isError ? "Reconectar" : "Conectar"}
            </a>
          )}
        </div>
      </div>

      {isError && humanError && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50/60 p-2.5">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold text-rose-900">
              Qué pasó
            </div>
            <div className="mt-0.5 text-[11px] text-rose-700 leading-relaxed">
              {humanError}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
