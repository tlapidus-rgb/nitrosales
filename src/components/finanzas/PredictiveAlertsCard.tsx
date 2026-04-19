// ═══════════════════════════════════════════════════════════════════
// PredictiveAlertsCard — Fase 6f
// ═══════════════════════════════════════════════════════════════════
// Card que fetchea /api/finance/alerts/predictive y renderiza las
// alertas de tendencia (MoM deltas + cross-module) en Pulso.
//
// Independiente de FinancialAlertsCard (Fase 1d) que muestra las
// alertas de estado actual. Aca van las de "algo esta cambiando".
// ═══════════════════════════════════════════════════════════════════

"use client";

import { useEffect, useState } from "react";
import type { FinancialAlert } from "@/types/finanzas";
import {
  Activity,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Truck,
  Package,
  Users,
  Calendar,
  Sparkles,
} from "lucide-react";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";

const TYPE_ICON: Record<string, React.ComponentType<any>> = {
  shipping: Truck,
  margin: TrendingDown,
  fiscal: Calendar,
  marketing: Users,
  runway: AlertTriangle,
};

function priorityMeta(p: "HIGH" | "MEDIUM" | "LOW") {
  if (p === "HIGH")
    return {
      color: "#dc2626",
      bg: "rgba(239,68,68,0.06)",
      border: "rgba(239,68,68,0.25)",
      label: "Alta",
    };
  if (p === "MEDIUM")
    return {
      color: "#d97706",
      bg: "rgba(245,158,11,0.06)",
      border: "rgba(245,158,11,0.25)",
      label: "Media",
    };
  return {
    color: "#0ea5e9",
    bg: "rgba(14,165,233,0.05)",
    border: "rgba(14,165,233,0.22)",
    label: "Baja",
  };
}

export default function PredictiveAlertsCard() {
  const [alerts, setAlerts] = useState<FinancialAlert[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/finance/alerts/predictive", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (active) setAlerts(json.alerts ?? []);
      } catch {
        if (active) setAlerts([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-4 w-48 animate-pulse rounded bg-slate-100" />
        </div>
        <div className="mt-4 space-y-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-50" />
          ))}
        </div>
      </div>
    );
  }

  if (!alerts || alerts.length === 0) {
    return (
      <div
        className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-white p-6"
        style={{
          boxShadow:
            "0 1px 2px rgba(16,185,129,0.05), 0 4px 12px rgba(16,185,129,0.03)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{
              background: "rgba(16,185,129,0.08)",
              color: "#10b981",
              border: "1px solid rgba(16,185,129,0.22)",
            }}
          >
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
              Tendencias sanas
            </div>
            <div className="mt-0.5 text-[15px] font-semibold tracking-tight text-slate-900">
              Sin señales de alerta predictiva
            </div>
            <div className="mt-0.5 text-[12px] text-slate-500">
              Envíos, COGS, CAC/LTV y fiscal dentro de rangos normales vs el
              mes anterior.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const highest = alerts[0]?.priority ?? "LOW";
  const m = priorityMeta(highest);

  return (
    <div
      className="relative overflow-hidden rounded-2xl border bg-white"
      style={{
        borderColor: m.border,
        boxShadow:
          "0 1px 2px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.03)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-0.5"
        style={{ background: m.color }}
      />
      <div className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-xl"
              style={{ background: m.bg, color: m.color, border: `1px solid ${m.border}` }}
            >
              <Activity className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Alertas predictivas
              </div>
              <div className="text-[15px] font-semibold tracking-tight text-slate-900">
                {alerts.length} señal{alerts.length !== 1 ? "es" : ""} de tendencia
              </div>
            </div>
          </div>
          <span
            className="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em]"
            style={{ background: m.bg, color: m.color }}
          >
            Prioridad {m.label}
          </span>
        </div>

        <div className="mt-4 space-y-2">
          {alerts.map((a) => {
            const Icon = TYPE_ICON[a.type] ?? AlertTriangle;
            const pm = priorityMeta(a.priority);
            return (
              <div
                key={a.id}
                className="flex items-start gap-3 rounded-xl border bg-white p-3"
                style={{
                  borderColor: pm.border,
                  background: pm.bg.replace("0.06", "0.03").replace("0.05", "0.02"),
                }}
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: pm.bg, color: pm.color, border: `1px solid ${pm.border}` }}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em]"
                      style={{ background: pm.bg, color: pm.color }}
                    >
                      {pm.label}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-slate-400">
                      {a.type}
                    </span>
                  </div>
                  <div className="mt-1 text-[13px] font-semibold tracking-tight text-slate-900">
                    {a.title}
                  </div>
                  <div className="mt-0.5 text-[12px] leading-relaxed text-slate-600">
                    {a.body}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
