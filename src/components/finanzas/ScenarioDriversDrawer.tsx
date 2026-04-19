// @ts-nocheck
"use client";

/**
 * ScenarioDriversDrawer — Fase 5d
 * ─────────────────────────────────────────────────────────────
 * Drawer lateral (slide-in desde la derecha) que edita los 10
 * drivers de un escenario con sliders + rangos (Causal pattern)
 * y recomputa el forecast EN VIVO con debounce.
 *
 * Props:
 *   - scenario: Scenario con drivers actuales
 *   - fm: formatter tri-moneda (viene de la page)
 *   - onClose(): cerrar sin guardar
 *   - onSaved(): avisa a la page que haga reload (cerrara el drawer)
 *
 * Flujo:
 *   1. Usuario mueve slider → debounce 280ms → POST ?action=compute
 *      con { drivers } en body. Como hay override, el engine NO
 *      guarda cache (dry-run). Devuelve forecast recalculado.
 *   2. Preview KPI card arriba se actualiza en vivo.
 *   3. "Guardar cambios" → PUT /api/finance/scenarios/:id con
 *      { drivers }. El engine invalida la cache y recomputa.
 *   4. "Descartar" → restaura snapshot inicial, cerramos drawer.
 *
 * UI:
 *   - Header con kind badge + nombre
 *   - Preview KPIs 2x2 (Revenue 12M / Margen / Runway / Net)
 *   - Lista de 10 drivers, agrupados: Comercial / Costo / Macro
 *   - Cada driver: label + unidad + slider + input numerico +
 *     (si rangeable) botones ±10% / ±20% / ±30% que setean min/max.
 *   - Footer sticky con "Descartar" + "Guardar cambios".
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DRIVER_META,
  DRIVER_KEYS,
  type DriverKey,
  type DriverValue,
  type ScenarioDrivers,
  type ForecastResult,
} from "@/lib/finanzas/scenario-engine";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";

type ScenarioKind = "BASE" | "OPTIMIST" | "CONSERVATIVE" | "CUSTOM";

type Scenario = {
  id: string;
  name: string;
  kind: ScenarioKind;
  color: string | null;
  description: string | null;
  isActive: boolean;
  drivers: Record<string, any>;
  horizonMonths: number;
  forecast: ForecastResult | null;
};

const KIND_COLORS: Record<ScenarioKind, string> = {
  CONSERVATIVE: "#ef4444",
  BASE: "#0ea5e9",
  OPTIMIST: "#10b981",
  CUSTOM: "#8b5cf6",
};

const KIND_LABELS: Record<ScenarioKind, string> = {
  CONSERVATIVE: "Conservador",
  BASE: "Base",
  OPTIMIST: "Optimista",
  CUSTOM: "Custom",
};

// Agrupacion visual de drivers
const DRIVER_GROUPS: Array<{ title: string; keys: DriverKey[] }> = [
  {
    title: "Comercial",
    keys: ["trafficPerDay", "conversionRate", "aov", "adSpendPerDay", "roas"],
  },
  {
    title: "Costos",
    keys: ["cogsPct", "opexBase", "headcount"],
  },
  {
    title: "Macro",
    keys: ["inflationMonthly", "fxMonthly"],
  },
];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function normalizeDrivers(raw: unknown): ScenarioDrivers {
  // Aseguramos que cada key conocida tenga shape { value, min?, max?, unit? }.
  const out: ScenarioDrivers = {};
  const src = (raw ?? {}) as Record<string, any>;
  for (const k of DRIVER_KEYS) {
    const meta = DRIVER_META[k];
    const existing = src[k];
    if (existing && typeof existing === "object" && typeof existing.value === "number") {
      out[k] = {
        value: existing.value,
        min:
          typeof existing.min === "number" && Number.isFinite(existing.min)
            ? existing.min
            : undefined,
        max:
          typeof existing.max === "number" && Number.isFinite(existing.max)
            ? existing.max
            : undefined,
        unit: typeof existing.unit === "string" ? existing.unit : meta.unit,
      };
    } else {
      out[k] = { value: meta.defaultValue, unit: meta.unit };
    }
  }
  return out;
}

function pct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}
function monthsText(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n <= 0) return "Crítico";
  if (n >= 99) return "> 99m";
  return `${n.toFixed(1)}m`;
}
function formatDriverValue(key: DriverKey, v: number): string {
  const meta = DRIVER_META[key];
  if (!Number.isFinite(v)) return "—";
  if (meta.unit === "%") return `${v.toFixed(meta.step && meta.step < 1 ? 2 : 1)}%`;
  if (meta.unit === "x") return `${v.toFixed(2)}x`;
  if (meta.unit === "ARS" || meta.unit === "ARS/mes") {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    }).format(v);
  }
  if (meta.unit === "visitas") return `${Math.round(v).toLocaleString("es-AR")}`;
  if (meta.unit === "personas") return `${Math.round(v)}`;
  return `${v}`;
}

function driversShallowEq(a: ScenarioDrivers, b: ScenarioDrivers): boolean {
  for (const k of DRIVER_KEYS) {
    const da = a[k];
    const db = b[k];
    if (!da || !db) {
      if (da !== db) return false;
      continue;
    }
    if (da.value !== db.value) return false;
    if ((da.min ?? null) !== (db.min ?? null)) return false;
    if ((da.max ?? null) !== (db.max ?? null)) return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────
// Drawer
// ─────────────────────────────────────────────────────────────
export default function ScenarioDriversDrawer({
  scenario,
  fm,
  onClose,
  onSaved,
}: {
  scenario: Scenario;
  fm: (v: number | null | undefined, d?: string) => string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const color = scenario.color ?? KIND_COLORS[scenario.kind];
  const initialDrivers = useMemo(() => normalizeDrivers(scenario.drivers), [
    scenario.drivers,
  ]);
  const [drivers, setDrivers] = useState<ScenarioDrivers>(initialDrivers);
  const [preview, setPreview] = useState<ForecastResult | null>(
    scenario.forecast ?? null
  );
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dirty = !driversShallowEq(drivers, initialDrivers);
  const debounceRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Debounced live recompute ────────────────────────────
  const triggerPreview = useCallback(
    (next: ScenarioDrivers) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        if (abortRef.current) abortRef.current.abort();
        const ac = new AbortController();
        abortRef.current = ac;
        setPreviewLoading(true);
        try {
          const res = await fetch(
            `/api/finance/scenarios/${scenario.id}?action=compute`,
            {
              method: "POST",
              signal: ac.signal,
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ drivers: next }),
            }
          );
          const js = await res.json();
          if (!res.ok || js?.ok === false) {
            throw new Error(js?.error ?? "Error al recomputar");
          }
          setPreview(js.forecast as ForecastResult);
          setErr(null);
        } catch (e: any) {
          if (e?.name !== "AbortError") {
            setErr(String(e?.message ?? e));
          }
        } finally {
          setPreviewLoading(false);
        }
      }, 280);
    },
    [scenario.id]
  );

  // Lock body scroll mientras drawer abierto
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [onClose, saving]);

  function updateDriver(key: DriverKey, patch: Partial<DriverValue>) {
    setDrivers((prev) => {
      const current = prev[key] ?? {
        value: DRIVER_META[key].defaultValue,
        unit: DRIVER_META[key].unit,
      };
      const nextVal: DriverValue = {
        ...current,
        ...patch,
      };
      // Clamp min/max rules si ambos presentes
      if (
        typeof nextVal.min === "number" &&
        typeof nextVal.max === "number" &&
        nextVal.min > nextVal.max
      ) {
        [nextVal.min, nextVal.max] = [nextVal.max, nextVal.min];
      }
      const next = { ...prev, [key]: nextVal };
      triggerPreview(next);
      return next;
    });
  }

  function setSpread(key: DriverKey, spreadPct: number) {
    // Aplica min = value * (1 - spread), max = value * (1 + spread)
    const current = drivers[key];
    if (!current) return;
    const v = current.value;
    const factor = spreadPct / 100;
    const min = Math.max(0, v * (1 - factor));
    const max = v * (1 + factor);
    updateDriver(key, { min, max });
  }
  function clearSpread(key: DriverKey) {
    updateDriver(key, { min: undefined, max: undefined });
  }

  async function handleSave() {
    if (!dirty) {
      onClose();
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/finance/scenarios/${scenario.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ drivers }),
      });
      const js = await res.json();
      if (!res.ok || js?.ok === false) {
        throw new Error(js?.error ?? "No se pudo guardar");
      }
      onSaved();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }
  function handleDiscard() {
    setDrivers(initialDrivers);
    onClose();
  }

  // ── KPIs del preview ────────────────────────────────────
  const totals = preview?.totals;
  const runway = preview?.runway;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={`Drivers de ${scenario.name}`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(15,23,42,0.45) 0%, rgba(15,23,42,0.55) 100%)",
          backdropFilter: "blur(4px)",
          animation: `fadeBg 240ms ${ES}`,
        }}
        onClick={() => !saving && onClose()}
      />

      {/* Drawer */}
      <aside
        className="relative flex w-full max-w-xl flex-col overflow-hidden bg-white shadow-2xl"
        style={{ animation: `slideIn 320ms ${ES}` }}
      >
        {/* Header */}
        <div
          className="relative px-6 py-5"
          style={{
            background: `linear-gradient(180deg, ${color}18 0%, transparent 100%)`,
            borderBottom: "1px solid rgba(226,232,240,0.9)",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: color, boxShadow: `0 0 8px ${color}66` }}
                />
                <span
                  className="text-[10px] font-semibold uppercase tracking-[0.14em]"
                  style={{ color }}
                >
                  {KIND_LABELS[scenario.kind] ?? "Escenario"}
                </span>
                {scenario.isActive && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em]"
                    style={{
                      background: `${color}18`,
                      color,
                    }}
                  >
                    Activo
                  </span>
                )}
              </div>
              <h2 className="mt-1.5 truncate text-2xl font-semibold tracking-tight text-slate-900">
                {scenario.name}
              </h2>
              <p className="mt-1 text-[13px] text-slate-500">
                Ajustá los drivers — el forecast se recalcula en vivo.
              </p>
            </div>
            <button
              onClick={() => !saving && onClose()}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700"
              style={{ transition: `all 180ms ${ES}` }}
              aria-label="Cerrar"
              disabled={saving}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M3 3l8 8M11 3l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          {/* Preview KPIs */}
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <PreviewKpi
              label="Revenue 12M"
              value={fm(totals?.revenue)}
              loading={previewLoading && !totals}
            />
            <PreviewKpi
              label="Margen neto"
              value={pct(totals?.marginPct)}
              loading={previewLoading && !totals}
            />
            <PreviewKpi
              label="Runway"
              value={monthsText(runway?.monthsRemaining)}
              loading={previewLoading && !totals}
              accent={
                runway?.status === "critical"
                  ? "#dc2626"
                  : runway?.status === "warn"
                  ? "#d97706"
                  : undefined
              }
            />
            <PreviewKpi
              label="Net 12M"
              value={fm(totals?.netProfit)}
              loading={previewLoading && !totals}
            />
          </div>
          {previewLoading && (
            <div
              className="absolute bottom-0 left-0 h-0.5"
              style={{
                width: "100%",
                background: `linear-gradient(90deg, transparent 0%, ${color} 50%, transparent 100%)`,
                backgroundSize: "200% 100%",
                animation: "progressSlide 1.2s ease-in-out infinite",
              }}
            />
          )}
        </div>

        {/* Body scroll */}
        <div className="relative flex-1 overflow-y-auto px-6 py-6">
          {DRIVER_GROUPS.map((g) => (
            <section key={g.title} className="mb-7 last:mb-0">
              <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                {g.title}
              </h3>
              <div className="space-y-4">
                {g.keys.map((k) => {
                  const meta = DRIVER_META[k];
                  const dv = drivers[k] ?? {
                    value: meta.defaultValue,
                    unit: meta.unit,
                  };
                  const hasRange =
                    typeof dv.min === "number" || typeof dv.max === "number";
                  return (
                    <DriverRow
                      key={k}
                      driverKey={k}
                      driver={dv}
                      accent={color}
                      onChange={(patch) => updateDriver(k, patch)}
                      onSpread={(pct) => setSpread(k, pct)}
                      onClearRange={() => clearSpread(k)}
                      hasRange={hasRange}
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        {/* Footer */}
        <div
          className="relative px-6 py-4"
          style={{
            borderTop: "1px solid rgba(226,232,240,0.9)",
            background: "rgba(248,250,252,0.6)",
          }}
        >
          {err && (
            <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs text-rose-800">
              {err}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] text-slate-500">
              {dirty ? (
                <span className="font-semibold text-slate-700">
                  Cambios sin guardar
                </span>
              ) : (
                "Sin cambios"
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDiscard}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                style={{ transition: `all 180ms ${ES}` }}
              >
                Descartar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !dirty}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                style={{
                  background: `linear-gradient(135deg, ${color} 0%, ${color}d0 100%)`,
                  boxShadow: `0 4px 14px -4px ${color}88`,
                  transition: `all 180ms ${ES}`,
                }}
              >
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      </aside>

      <style jsx global>{`
        @keyframes fadeBg {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes slideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        @keyframes progressSlide {
          0% {
            background-position: 100% 0;
          }
          100% {
            background-position: -100% 0;
          }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Row de un driver — slider + input + chips de rango
// ─────────────────────────────────────────────────────────────
function DriverRow({
  driverKey,
  driver,
  accent,
  onChange,
  onSpread,
  onClearRange,
  hasRange,
}: {
  driverKey: DriverKey;
  driver: DriverValue;
  accent: string;
  onChange: (patch: Partial<DriverValue>) => void;
  onSpread: (pct: number) => void;
  onClearRange: () => void;
  hasRange: boolean;
}) {
  const meta = DRIVER_META[driverKey];
  const [expanded, setExpanded] = useState(false);
  const min = meta.min ?? 0;
  const max = meta.max ?? driver.value * 2 + 100;
  const step = meta.step ?? 1;

  return (
    <div
      className="rounded-xl border bg-white p-3"
      style={{
        borderColor: hasRange
          ? `${accent}44`
          : "rgba(226,232,240,0.9)",
        transition: `border-color 220ms ${ES}`,
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-800">
            {meta.label}
          </div>
          {meta.sliderHint && (
            <div className="text-[11px] leading-snug text-slate-500">
              {meta.sliderHint}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div
            className="text-base font-semibold tabular-nums tracking-tight"
            style={{ color: "#0f172a" }}
          >
            {formatDriverValue(driverKey, driver.value)}
          </div>
          {hasRange && (
            <div className="text-[10px] tabular-nums text-slate-400">
              {driver.min !== undefined
                ? formatDriverValue(driverKey, driver.min)
                : "—"}{" "}
              →{" "}
              {driver.max !== undefined
                ? formatDriverValue(driverKey, driver.max)
                : "—"}
            </div>
          )}
        </div>
      </div>

      {/* Slider */}
      <div className="mt-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={driver.value}
          onChange={(e) =>
            onChange({ value: Number(e.target.value) })
          }
          className="w-full accent-current"
          style={{
            color: accent,
          }}
          aria-label={`${meta.label} slider`}
        />
        <div className="mt-0.5 flex items-center justify-between text-[10px] tabular-nums text-slate-400">
          <span>{formatDriverValue(driverKey, min)}</span>
          <span>{formatDriverValue(driverKey, max)}</span>
        </div>
      </div>

      {/* Input exacto + rango */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
          Exacto
          <input
            type="number"
            step={step}
            value={driver.value}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isFinite(v)) return;
              onChange({ value: v });
            }}
            className="w-28 rounded-md border border-slate-200 bg-white px-2 py-1 text-right text-sm font-medium tabular-nums text-slate-800 focus:border-slate-400 focus:outline-none"
          />
          <span className="text-[11px] text-slate-400">{meta.unit}</span>
        </label>

        {meta.rangeable && (
          <div className="ml-auto flex items-center gap-1">
            {!expanded && !hasRange && (
              <button
                onClick={() => setExpanded(true)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:border-slate-300"
                style={{ transition: `all 180ms ${ES}` }}
              >
                + rango
              </button>
            )}
            {(expanded || hasRange) && (
              <>
                {[10, 20, 30].map((p) => (
                  <button
                    key={p}
                    onClick={() => onSpread(p)}
                    className="rounded-md border px-2 py-1 text-[11px] font-medium"
                    style={{
                      borderColor: `${accent}55`,
                      color: accent,
                      background: `${accent}10`,
                      transition: `all 180ms ${ES}`,
                    }}
                  >
                    ±{p}%
                  </button>
                ))}
                {hasRange && (
                  <button
                    onClick={() => {
                      onClearRange();
                      setExpanded(false);
                    }}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-700"
                    style={{ transition: `all 180ms ${ES}` }}
                  >
                    Limpiar
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Min/max inputs expandidos */}
      {meta.rangeable && (expanded || hasRange) && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
            Min
            <input
              type="number"
              step={step}
              value={driver.min ?? ""}
              placeholder="—"
              onChange={(e) => {
                const raw = e.target.value;
                onChange({
                  min: raw === "" ? undefined : Number(raw),
                });
              }}
              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-right text-sm font-medium tabular-nums text-slate-800 focus:border-slate-400 focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
            Max
            <input
              type="number"
              step={step}
              value={driver.max ?? ""}
              placeholder="—"
              onChange={(e) => {
                const raw = e.target.value;
                onChange({
                  max: raw === "" ? undefined : Number(raw),
                });
              }}
              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-right text-sm font-medium tabular-nums text-slate-800 focus:border-slate-400 focus:outline-none"
            />
          </label>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Preview KPI small
// ─────────────────────────────────────────────────────────────
function PreviewKpi({
  label,
  value,
  accent,
  loading,
}: {
  label: string;
  value: string;
  accent?: string;
  loading?: boolean;
}) {
  return (
    <div
      className="rounded-lg border px-3 py-2"
      style={{
        borderColor: "rgba(226,232,240,0.9)",
        background: "rgba(255,255,255,0.8)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </div>
      <div
        className="mt-0.5 truncate text-[15px] font-semibold tabular-nums"
        style={{
          color: loading ? "#94a3b8" : accent ?? "#0f172a",
          opacity: loading ? 0.6 : 1,
          transition: "color 200ms, opacity 200ms",
        }}
      >
        {value}
      </div>
    </div>
  );
}
