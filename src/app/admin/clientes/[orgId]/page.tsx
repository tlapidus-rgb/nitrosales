"use client";

// ══════════════════════════════════════════════════════════════
// Admin · Detalle de Cliente
// ══════════════════════════════════════════════════════════════
// /admin/clientes/[orgId]
// Reusa /api/nitropixel/data-quality-score?orgId={orgId} (admin override)
// Vista interna y diagnóstica: muestra todos los datos crudos,
// no la versión "edulcorada" que veía el cliente.
// ══════════════════════════════════════════════════════════════

import { useEffect, useState, use } from "react";
import Link from "next/link";

type WindowKey = "24h" | "7d" | "30d";
type LeverStatus = "perfect" | "great" | "good" | "opportunity" | "collecting";

interface Lever {
  key: string;
  name: string;
  description: string;
  current: number;
  target: number;
  weight: number;
  status: LeverStatus;
  sampleSize: number;
  minSampleNeeded: number;
  moneyAtRiskArs: number;
  unlockTitle: string;
  unlockSteps: string[];
}

interface QualityResponse {
  ok: boolean;
  window: WindowKey;
  windowDays: number;
  effectiveDays: number;
  score: number | null;
  scoreLabel: string;
  scoreColor: string;
  trendDelta: number | null;
  attributedRevenue: number;
  totalPurchases: number;
  leversWithData: number;
  totalLevers: number;
  levers: Lever[];
  measurementStartAt: string;
  daysSinceMeasurementStart: number;
  isCollectingState: boolean;
  computedAt: string;
}

const STATUS_COLOR: Record<LeverStatus, string> = {
  perfect: "#10b981",
  great: "#06b6d4",
  good: "#8b5cf6",
  opportunity: "#a855f7",
  collecting: "#22d3ee",
};

const STATUS_LABEL: Record<LeverStatus, string> = {
  perfect: "PERFECT",
  great: "GREAT",
  good: "GOOD",
  opportunity: "OPPORTUNITY",
  collecting: "COLLECTING",
};

interface ClienteMeta {
  id: string;
  name: string;
  slug: string;
  plan: string;
  createdAt: string;
  users: number;
  lastEventAt: string | null;
  events7d: number;
  events24h: number;
  totalVisitors: number;
  identifiedVisitors: number;
  totalPurchases7d: number;
}

export default function ClienteDetailPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const [data, setData] = useState<QualityResponse | null>(null);
  const [meta, setMeta] = useState<ClienteMeta | null>(null);
  const [windowKey, setWindowKey] = useState<WindowKey>("7d");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/clientes/${orgId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (!j.ok) throw new Error(j.error || "Error");
        setMeta(j.cliente);
      })
      .catch((e) => alive && setErr((e as Error).message));
    return () => {
      alive = false;
    };
  }, [orgId]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/nitropixel/data-quality-score?window=${windowKey}&orgId=${orgId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (!j.ok) throw new Error(j.error || "Error");
        setData(j);
        setErr(null);
      })
      .catch((e) => alive && setErr((e as Error).message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [orgId, windowKey]);

  return (
    <div style={{ animation: "adminFadeIn 0.5s ease-out" }}>
      {/* Breadcrumb */}
      <Link href="/admin/clientes" className="text-xs text-white/40 hover:text-cyan-300 transition mb-4 inline-block">
        ← Volver al listado
      </Link>

      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="text-[10px] font-mono tracking-[0.2em] text-cyan-400/70 uppercase mb-1">
            Cliente · NitroScore interno
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {meta?.name ?? "Cargando..."}
          </h1>
          {meta && (
            <div className="flex items-center gap-3 text-xs text-white/50 mt-1 font-mono">
              <span>{meta.slug}</span>
              <span className="text-white/30">·</span>
              <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 uppercase">{meta.plan}</span>
              <span className="text-white/30">·</span>
              <span>{meta.users} {meta.users === 1 ? "user" : "users"}</span>
              <span className="text-white/30">·</span>
              <span>creado {new Date(meta.createdAt).toLocaleDateString("es-AR")}</span>
            </div>
          )}
        </div>

        {/* Window selector */}
        <div className="flex items-center gap-1 bg-white/[0.03] border border-white/10 rounded-lg p-1">
          {(["24h", "7d", "30d"] as WindowKey[]).map((w) => (
            <button
              key={w}
              onClick={() => setWindowKey(w)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                windowKey === w ? "bg-cyan-500/15 text-cyan-100" : "text-white/50 hover:text-white"
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {err && (
        <div className="border border-red-500/20 bg-red-500/5 rounded-xl p-4 text-red-300 text-sm mb-6">
          {err}
        </div>
      )}

      {loading && !data && (
        <div className="text-white/40 text-sm py-12 text-center" style={{ animation: "adminPulse 1.6s infinite" }}>
          Cargando NitroScore...
        </div>
      )}

      {data && (
        <>
          {/* Score row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="border border-cyan-500/20 bg-gradient-to-br from-cyan-500/[0.04] to-transparent rounded-2xl p-6">
              <div className="text-[10px] font-mono tracking-[0.2em] text-white/50 uppercase mb-2">
                NitroScore
              </div>
              <div className="flex items-baseline gap-3">
                <div className="text-5xl font-bold tabular-nums" style={{ color: data.scoreColor }}>
                  {data.score === null ? "—" : data.score}
                </div>
                {data.score !== null && <div className="text-sm text-white/50">/100</div>}
              </div>
              <div className="text-xs text-white/60 mt-2">{data.scoreLabel}</div>
              {data.trendDelta !== null && data.trendDelta !== 0 && (
                <div className={`text-[10px] font-mono mt-1 ${data.trendDelta > 0 ? "text-emerald-400" : "text-violet-400"}`}>
                  {data.trendDelta > 0 ? "↑" : "↓"} {Math.abs(data.trendDelta)} vs. periodo anterior
                </div>
              )}
            </div>

            <div className="border border-white/5 rounded-2xl p-6 bg-white/[0.01]">
              <div className="text-[10px] font-mono tracking-[0.2em] text-white/50 uppercase mb-2">
                Palancas con datos
              </div>
              <div className="text-5xl font-bold tabular-nums">
                {data.leversWithData}<span className="text-white/30 text-2xl">/{data.totalLevers}</span>
              </div>
              <div className="text-xs text-white/50 mt-2">{data.totalLevers - data.leversWithData} en collecting</div>
            </div>

            <div className="border border-white/5 rounded-2xl p-6 bg-white/[0.01]">
              <div className="text-[10px] font-mono tracking-[0.2em] text-white/50 uppercase mb-2">
                Compras tracked
              </div>
              <div className="text-5xl font-bold tabular-nums">{data.totalPurchases}</div>
              <div className="text-xs text-white/50 mt-2">
                {data.attributedRevenue > 0
                  ? new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(data.attributedRevenue)
                  : "Sin revenue atribuido"}
              </div>
            </div>
          </div>

          {/* Measurement metadata */}
          <div className="border border-white/5 rounded-xl p-4 mb-6 bg-white/[0.01] text-xs text-white/50 font-mono flex flex-wrap items-center gap-4">
            <div>
              <span className="text-white/30">measurementStart:</span>{" "}
              <span className="text-cyan-300/80">{new Date(data.measurementStartAt).toLocaleString("es-AR")}</span>
            </div>
            <div>
              <span className="text-white/30">effectiveDays:</span>{" "}
              <span className="text-cyan-300/80">{data.effectiveDays.toFixed(1)}</span> / {data.windowDays}
            </div>
            <div>
              <span className="text-white/30">days since fix:</span>{" "}
              <span className="text-cyan-300/80">{data.daysSinceMeasurementStart}</span>
            </div>
          </div>

          {/* Levers detail */}
          <div className="text-[10px] font-mono tracking-[0.2em] text-white/40 uppercase mb-3">
            Palancas (5 totales)
          </div>
          <div className="space-y-3">
            {data.levers.map((lever) => (
              <LeverRow key={lever.key} lever={lever} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function LeverRow({ lever }: { lever: Lever }) {
  const [open, setOpen] = useState(false);
  const color = STATUS_COLOR[lever.status];
  const isCollecting = lever.status === "collecting";
  const pct = lever.target > 0 ? Math.min(100, Math.round((lever.current / lever.target) * 100)) : 0;
  const samplePct = lever.minSampleNeeded > 0 ? Math.min(100, Math.round((lever.sampleSize / lever.minSampleNeeded) * 100)) : 0;

  return (
    <div className="border border-white/5 rounded-xl bg-white/[0.01] overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full p-4 text-left hover:bg-white/[0.02] transition">
        <div className="flex items-center gap-4">
          <div className="w-1 h-12 rounded-full" style={{ background: color }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-white">{lever.name}</span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border" style={{ color, borderColor: `${color}40` }}>
                {STATUS_LABEL[lever.status]}
              </span>
              <span className="text-[10px] font-mono text-white/30">peso {Math.round(lever.weight * 100)}%</span>
            </div>
            <div className="text-xs text-white/50 mt-0.5">{lever.description}</div>
          </div>
          <div className="text-right flex-shrink-0">
            {isCollecting ? (
              <>
                <div className="text-2xl font-bold tabular-nums" style={{ color }}>
                  {lever.sampleSize}
                </div>
                <div className="text-[10px] text-white/40">de {lever.minSampleNeeded} muestras</div>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold tabular-nums" style={{ color }}>
                  {Math.round(lever.current * 100)}%
                </div>
                <div className="text-[10px] text-white/40">target {Math.round(lever.target * 100)}%</div>
              </>
            )}
          </div>
        </div>
        {/* Bar */}
        <div className="mt-3 h-1 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full transition-all duration-700"
            style={{ width: `${isCollecting ? samplePct : pct}%`, background: color }}
          />
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-white/5">
          {lever.unlockSteps.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] font-mono uppercase tracking-wider text-white/40 mb-2">
                {lever.unlockTitle}
              </div>
              <ul className="space-y-1">
                {lever.unlockSteps.map((step, i) => (
                  <li key={i} className="text-xs text-white/70 flex gap-2">
                    <span className="text-cyan-400/60">→</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {lever.moneyAtRiskArs > 0 && (
            <div className="mt-3 text-[11px] font-mono text-violet-300/70">
              💰 Money at risk: {new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(lever.moneyAtRiskArs)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
