"use client";

// ══════════════════════════════════════════════════════════════
// Admin · Alertas
// ══════════════════════════════════════════════════════════════
// Lista clientes que requieren intervención. Datos reales de
// /api/admin/alertas. Las alertas vienen ordenadas por severidad.
// ══════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import Link from "next/link";

type Severity = "critical" | "warning" | "info";

interface Alerta {
  id: string;
  severity: Severity;
  category: string;
  title: string;
  description: string;
  orgId: string;
  orgName: string;
  orgSlug: string;
  detectedAt: string;
  metric: string | null;
}

interface AlertasResponse {
  ok: boolean;
  summary: { total: number; critical: number; warning: number; info: number };
  alertas: Alerta[];
}

const SEV_CONFIG: Record<Severity, { color: string; bg: string; border: string; label: string; dot: string }> = {
  critical: {
    color: "text-red-300",
    bg: "bg-red-500/[0.04]",
    border: "border-red-500/30",
    label: "CRÍTICO",
    dot: "bg-red-400",
  },
  warning: {
    color: "text-yellow-300",
    bg: "bg-yellow-500/[0.04]",
    border: "border-yellow-500/30",
    label: "WARNING",
    dot: "bg-yellow-400",
  },
  info: {
    color: "text-cyan-300",
    bg: "bg-cyan-500/[0.04]",
    border: "border-cyan-500/30",
    label: "INFO",
    dot: "bg-cyan-400",
  },
};

export default function AlertasPage() {
  const [data, setData] = useState<AlertasResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | Severity>("all");

  useEffect(() => {
    fetch("/api/admin/alertas", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) throw new Error(j.error || "Error");
        setData(j);
      })
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = data ? (filter === "all" ? data.alertas : data.alertas.filter((a) => a.severity === filter)) : [];

  return (
    <div style={{ animation: "adminFadeIn 0.5s ease-out" }}>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight mb-1">Alertas</h1>
          <p className="text-white/50 text-sm">
            {data?.summary.total ?? "—"} alertas activas · ordenadas por severidad
          </p>
        </div>
      </div>

      {/* Filter pills */}
      {data && (
        <div className="flex items-center gap-1 mb-6">
          <FilterPill active={filter === "all"} onClick={() => setFilter("all")} label="Todas" count={data.summary.total} />
          <FilterPill active={filter === "critical"} onClick={() => setFilter("critical")} label="Críticas" count={data.summary.critical} sev="critical" />
          <FilterPill active={filter === "warning"} onClick={() => setFilter("warning")} label="Warnings" count={data.summary.warning} sev="warning" />
          <FilterPill active={filter === "info"} onClick={() => setFilter("info")} label="Info" count={data.summary.info} sev="info" />
        </div>
      )}

      {err && (
        <div className="border border-red-500/20 bg-red-500/5 rounded-xl p-4 text-red-300 text-sm">
          {err}
        </div>
      )}

      {loading && !data && (
        <div className="text-white/40 text-sm py-12 text-center" style={{ animation: "adminPulse 1.6s infinite" }}>
          Cargando alertas...
        </div>
      )}

      {data && filtered.length === 0 && (
        <div className="border border-emerald-500/20 bg-emerald-500/[0.03] rounded-2xl p-8 text-center">
          <div className="text-emerald-300 text-lg mb-1">✓ Todo en orden</div>
          <div className="text-xs text-white/50">No hay alertas en esta categoría.</div>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((alerta) => {
          const cfg = SEV_CONFIG[alerta.severity];
          return (
            <div
              key={alerta.id}
              className={`border ${cfg.border} ${cfg.bg} rounded-xl p-5`}
            >
              <div className="flex items-start gap-4">
                <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-1">
                  <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                  <span className={`text-[8px] font-mono tracking-wider ${cfg.color}`}>
                    {cfg.label}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-white">{alerta.title}</span>
                    <span className="text-[9px] font-mono text-white/40">{alerta.category}</span>
                    {alerta.metric && (
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${cfg.border} ${cfg.color}`}>
                        {alerta.metric}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-white/60 mt-1">{alerta.description}</div>
                  <div className="mt-2 flex items-center gap-3 text-[10px] font-mono text-white/40">
                    <Link
                      href={`/admin/clientes/${alerta.orgId}`}
                      className="text-cyan-300/80 hover:text-cyan-300 transition"
                    >
                      → {alerta.orgName}
                    </Link>
                    <span>{alerta.orgSlug}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  label,
  count,
  sev,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  sev?: Severity;
}) {
  const dot = sev ? SEV_CONFIG[sev].dot : null;
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 border ${
        active
          ? "bg-cyan-500/10 text-cyan-100 border-cyan-500/30"
          : "text-white/60 hover:text-white border-transparent hover:bg-white/5"
      }`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
      <span>{label}</span>
      {count !== undefined && <span className="text-white/40 tabular-nums">{count}</span>}
    </button>
  );
}
