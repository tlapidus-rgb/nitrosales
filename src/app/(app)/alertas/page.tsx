// @ts-nocheck
"use client";

/**
 * /alertas — Fase 8c
 * ─────────────────────────────────────────────────────────────
 * Hub central de alertas. Consume /api/alerts que agrega de todas
 * las fuentes activas (Finanzas narrative + predictive, Fiscal
 * Monotributo + calendario, Sistema sync, MercadoLibre).
 *
 * UI light theme siguiendo UI_VISION_NITROSALES: aurora radial,
 * lucide icons, filtros pill por categoria y severidad, empty state
 * con hero, cards con CTA accionable.
 */

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell,
  AlertTriangle,
  AlertCircle,
  Info,
  Filter,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  ArrowUpRight,
  X,
} from "lucide-react";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";

type AlertSource =
  | "finanzas_narrative"
  | "finanzas_predictive"
  | "fiscal_monotributo"
  | "fiscal_calendar"
  | "marketing_cac_ltv"
  | "mercadolibre"
  | "system_sync"
  | "inventory"
  | "custom";

type AlertSeverity = "critical" | "warning" | "info";
type AlertPriority = "HIGH" | "MEDIUM" | "LOW";
type AlertCategory =
  | "finanzas"
  | "fiscal"
  | "marketing"
  | "operaciones"
  | "ventas"
  | "sistema";

interface UnifiedAlert {
  id: string;
  source: AlertSource;
  category: AlertCategory;
  severity: AlertSeverity;
  priority: AlertPriority;
  title: string;
  body: string;
  cta?: string | null;
  metadata?: Record<string, any>;
  createdAt: string;
}

const SOURCE_META: Record<AlertSource, { label: string; color: string; ctaHref: string }> = {
  finanzas_narrative:   { label: "Narrativa",     color: "#f59e0b", ctaHref: "/finanzas/pulso" },
  finanzas_predictive:  { label: "Predictivas",   color: "#0ea5e9", ctaHref: "/finanzas/pulso" },
  fiscal_monotributo:   { label: "Monotributo",   color: "#10b981", ctaHref: "/finanzas/fiscal" },
  fiscal_calendar:      { label: "Vencimientos",  color: "#8b5cf6", ctaHref: "/finanzas/fiscal" },
  marketing_cac_ltv:    { label: "CAC / LTV",     color: "#ec4899", ctaHref: "/finanzas/pulso" },
  mercadolibre:         { label: "MercadoLibre",  color: "#d97706", ctaHref: "/mercadolibre" },
  system_sync:          { label: "Sincronización", color: "#64748b", ctaHref: "/settings/integraciones" },
  inventory:            { label: "Inventario",    color: "#f97316", ctaHref: "/products" },
  custom:               { label: "Custom",        color: "#6366f1", ctaHref: "#" },
};

const CATEGORY_META: Record<AlertCategory, { label: string; color: string }> = {
  finanzas:     { label: "Finanzas",     color: "#f59e0b" },
  fiscal:       { label: "Fiscal",       color: "#10b981" },
  marketing:    { label: "Marketing",    color: "#ec4899" },
  operaciones:  { label: "Operaciones",  color: "#0ea5e9" },
  ventas:       { label: "Ventas",       color: "#14b8a6" },
  sistema:      { label: "Sistema",      color: "#64748b" },
};

const SEVERITY_META: Record<
  AlertSeverity,
  { label: string; color: string; bg: string; border: string; icon: any }
> = {
  critical: {
    label: "Crítico",
    color: "#dc2626",
    bg: "rgba(239,68,68,0.06)",
    border: "rgba(239,68,68,0.25)",
    icon: AlertCircle,
  },
  warning: {
    label: "Atención",
    color: "#d97706",
    bg: "rgba(245,158,11,0.06)",
    border: "rgba(245,158,11,0.25)",
    icon: AlertTriangle,
  },
  info: {
    label: "Info",
    color: "#0ea5e9",
    bg: "rgba(14,165,233,0.05)",
    border: "rgba(14,165,233,0.22)",
    icon: Info,
  },
};

export default function AlertasPage() {
  const [alerts, setAlerts] = useState<UnifiedAlert[]>([]);
  const [countsBySource, setCountsBySource] = useState<Record<string, number>>({});
  const [countsBySeverity, setCountsBySeverity] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterCategory, setFilterCategory] = useState<AlertCategory | "all">("all");
  const [filterSeverity, setFilterSeverity] = useState<AlertSeverity | "all">("all");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/alerts", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setAlerts(json.alerts ?? []);
      setCountsBySource(json.countsBySource ?? {});
      setCountsBySeverity(json.countsBySeverity ?? {});
    } catch (e: any) {
      setError(e.message ?? "Error cargando alertas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      if (filterCategory !== "all" && a.category !== filterCategory) return false;
      if (filterSeverity !== "all" && a.severity !== filterSeverity) return false;
      return true;
    });
  }, [alerts, filterCategory, filterSeverity]);

  const totalCritical = countsBySeverity.critical ?? 0;
  const totalWarning = countsBySeverity.warning ?? 0;
  const totalInfo = countsBySeverity.info ?? 0;

  return (
    <div className="relative space-y-5">
      {/* HERO */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 85% 0%, rgba(239,68,68,0.06) 0%, transparent 55%), radial-gradient(ellipse at 0% 100%, rgba(245,158,11,0.05) 0%, transparent 55%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(239,68,68,0.3) 25%, rgba(245,158,11,0.3) 50%, rgba(14,165,233,0.3) 75%, transparent 100%)",
          }}
        />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1">
              <Bell className="h-3.5 w-3.5 text-rose-600" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-700">
                Alertas
              </span>
            </div>
            <h1 className="mt-5 text-[28px] font-semibold tracking-tight text-slate-900">
              Centro de alertas
            </h1>
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-slate-600">
              Todas las alertas del negocio en un solo lugar: Finanzas,
              Fiscal, MercadoLibre, sincronización y más. Filtralas por
              categoría o severidad.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            style={{ transition: `all 180ms ${ES}` }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refrescar
          </button>
        </div>

        {/* KPI strip */}
        <div className="relative mt-6 grid grid-cols-3 gap-3">
          <SeverityKPI label="Críticas" count={totalCritical} color="#dc2626" icon={AlertCircle} />
          <SeverityKPI label="Atención" count={totalWarning} color="#d97706" icon={AlertTriangle} />
          <SeverityKPI label="Info" count={totalInfo} color="#0ea5e9" icon={Info} />
        </div>
      </div>

      {/* FILTROS */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Filtrar
          </span>
        </div>

        <div className="space-y-2.5">
          {/* Por categoría */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-slate-500">Categoría:</span>
            <FilterPill
              label="Todas"
              active={filterCategory === "all"}
              onClick={() => setFilterCategory("all")}
              color="#64748b"
            />
            {(Object.keys(CATEGORY_META) as AlertCategory[]).map((c) => (
              <FilterPill
                key={c}
                label={CATEGORY_META[c].label}
                active={filterCategory === c}
                onClick={() => setFilterCategory(c)}
                color={CATEGORY_META[c].color}
              />
            ))}
          </div>

          {/* Por severidad */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-slate-500">Severidad:</span>
            <FilterPill
              label="Todas"
              active={filterSeverity === "all"}
              onClick={() => setFilterSeverity("all")}
              color="#64748b"
            />
            {(Object.keys(SEVERITY_META) as AlertSeverity[]).map((s) => (
              <FilterPill
                key={s}
                label={SEVERITY_META[s].label}
                active={filterSeverity === s}
                onClick={() => setFilterSeverity(s)}
                color={SEVERITY_META[s].color}
              />
            ))}
          </div>
        </div>
      </div>

      {/* LISTA DE ALERTAS */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-slate-100/50"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600" />
            <div className="text-sm font-semibold text-rose-900">{error}</div>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState hasAnyAlert={alerts.length > 0} />
      ) : (
        <div className="space-y-2">
          {filtered.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────────────────────
function SeverityKPI({
  label,
  count,
  color,
  icon: Icon,
}: {
  label: string;
  count: number;
  color: string;
  icon: React.ComponentType<any>;
}) {
  return (
    <div
      className="rounded-xl border bg-white/70 p-3 backdrop-blur-sm"
      style={{
        borderColor: `${color}30`,
        boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.03)",
      }}
    >
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          {label}
        </div>
        <Icon className="h-3.5 w-3.5" style={{ color }} />
      </div>
      <div
        className="mt-1 text-[22px] font-semibold tracking-tight tabular-nums"
        style={{ color: count > 0 ? color : "#94a3b8", lineHeight: 1.1 }}
      >
        {count}
      </div>
    </div>
  );
}

function FilterPill({
  label,
  active,
  onClick,
  color,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-2.5 py-1 text-[11px] font-semibold transition"
      style={{
        borderColor: active ? color : "rgba(226,232,240,1)",
        background: active ? `${color}0f` : "white",
        color: active ? color : "#64748b",
        transition: `all 140ms ${ES}`,
      }}
    >
      {label}
    </button>
  );
}

function AlertCard({ alert }: { alert: UnifiedAlert }) {
  const sev = SEVERITY_META[alert.severity];
  const SevIcon = sev.icon;
  const source = SOURCE_META[alert.source];
  const cat = CATEGORY_META[alert.category];

  return (
    <div
      className="relative overflow-hidden rounded-2xl border bg-white p-4 transition"
      style={{
        borderColor: sev.border,
        boxShadow:
          alert.severity === "critical"
            ? "0 1px 2px rgba(239,68,68,0.08), 0 4px 12px rgba(239,68,68,0.04)"
            : "0 1px 2px rgba(15,23,42,0.03)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-0.5"
        style={{ background: sev.color }}
      />

      <div className="flex items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: sev.bg,
            color: sev.color,
            border: `1px solid ${sev.border}`,
          }}
        >
          <SevIcon className="h-4 w-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em]"
              style={{ background: sev.bg, color: sev.color }}
            >
              {sev.label}
            </span>
            <span
              className="rounded-md px-1.5 py-0.5 text-[9px] font-medium"
              style={{
                background: `${cat.color}12`,
                color: cat.color,
              }}
            >
              {cat.label}
            </span>
            <span className="text-[10px] text-slate-400">·</span>
            <span className="text-[10px] text-slate-500">{source.label}</span>
          </div>

          <h3 className="mt-1 text-[14px] font-semibold tracking-tight text-slate-900">
            {alert.title}
          </h3>
          <p className="mt-0.5 text-[13px] leading-relaxed text-slate-600">
            {alert.body}
          </p>

          {alert.cta && source.ctaHref !== "#" && (
            <div className="mt-3">
              <Link
                href={source.ctaHref}
                className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition"
                style={{
                  borderColor: sev.border,
                  background: sev.bg,
                  color: sev.color,
                }}
              >
                <Sparkles className="h-3 w-3" />
                {alert.cta}
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ hasAnyAlert }: { hasAnyAlert: boolean }) {
  if (hasAnyAlert) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/30 p-10 text-center">
        <Filter className="mx-auto h-10 w-10 text-slate-300" />
        <h3 className="mt-3 text-sm font-semibold text-slate-700">
          Sin alertas con esos filtros
        </h3>
        <p className="mt-1 text-[12px] text-slate-500">
          Probá con otra categoría o severidad.
        </p>
      </div>
    );
  }
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-white p-10 text-center"
      style={{
        boxShadow: "0 1px 2px rgba(16,185,129,0.05), 0 4px 12px rgba(16,185,129,0.03)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(16,185,129,0.06) 0%, transparent 55%)",
        }}
      />
      <div className="relative">
        <div
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl"
          style={{
            background: "rgba(16,185,129,0.10)",
            color: "#10b981",
            border: "1px solid rgba(16,185,129,0.22)",
          }}
        >
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-lg font-semibold tracking-tight text-slate-900">
          Todo en orden
        </h3>
        <p className="mt-1 max-w-md mx-auto text-[13px] text-slate-500">
          No hay alertas activas en tu negocio. Tu sistema está sincronizado,
          tus finanzas no muestran señales negativas y tus vencimientos fiscales
          están bajo control.
        </p>
      </div>
    </div>
  );
}
