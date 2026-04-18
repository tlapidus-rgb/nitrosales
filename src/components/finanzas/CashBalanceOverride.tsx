// ═══════════════════════════════════════════════════════════════════
// CashBalanceOverride — modal para ajustar el saldo real del banco
// ═══════════════════════════════════════════════════════════════════
// Le permite a Tomy corregir el cálculo automático de caja del Pulso
// con su saldo real. Muestra preview inmediato del impacto en meses
// de runway recalculando con el burn rate actual (lado cliente).
//
// Flujo:
//   1. Abre modal → lee GET /api/finanzas/cash-balance/override
//   2. Muestra input ARS + nota opcional + preview
//   3. Guardar   → POST /api/finanzas/cash-balance/override
//   4. Volver a auto → DELETE /api/finanzas/cash-balance/override
//   5. onSuccess notifica al padre para refetch del Pulso
//
// NO usa ningún model de Prisma — los endpoints trabajan vía
// $queryRaw contra la tabla creada en la migración de 1e.
// ═══════════════════════════════════════════════════════════════════

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RunwayData } from "@/types/finanzas";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";

interface CashBalanceOverrideProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  runway: RunwayData | null;
}

interface OverrideRow {
  id: string;
  month: string;
  amount: number;
  currency: string;
  note: string | null;
  updatedAt: string;
}

function currentMonthHuman(): string {
  const d = new Date();
  const months = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function formatArs(v: number): string {
  if (!Number.isFinite(v)) return "0";
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 0,
  }).format(Math.round(v));
}

export default function CashBalanceOverride({
  open,
  onClose,
  onSuccess,
  runway,
}: CashBalanceOverrideProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [existing, setExisting] = useState<OverrideRow | null>(null);
  const [amountStr, setAmountStr] = useState<string>("");
  const [note, setNote] = useState<string>("");

  // ── Bloquear scroll del body mientras el modal está abierto
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ── Cargar override existente al abrir
  useEffect(() => {
    if (!open) return;
    let active = true;
    setError(null);
    setLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/finanzas/cash-balance/override", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as {
          override: OverrideRow | null;
        };
        if (!active) return;
        if (json.override) {
          setExisting(json.override);
          setAmountStr(String(Math.round(json.override.amount)));
          setNote(json.override.note ?? "");
        } else {
          // Pre-cargar con el cashBalanceAuto como sugerencia inicial
          setExisting(null);
          const suggested = runway?.cashBalanceAuto ?? 0;
          setAmountStr(
            Number.isFinite(suggested) && suggested > 0
              ? String(Math.round(suggested))
              : ""
          );
          setNote("");
        }
      } catch (e: unknown) {
        if (!active) return;
        setError(
          e instanceof Error ? e.message : "Error cargando override actual"
        );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [open, runway?.cashBalanceAuto]);

  // ── Parse del input a número
  const amountNum = useMemo(() => {
    if (!amountStr) return NaN;
    const cleaned = amountStr.replace(/[^\d.-]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : NaN;
  }, [amountStr]);

  const isValidAmount = Number.isFinite(amountNum);

  // ── Preview del impacto en runway (client-side, burn rate conocido)
  const preview = useMemo(() => {
    if (!runway || !isValidAmount) return null;
    const burn = runway.burnRate30d;
    let months: number;
    if (burn <= 0) months = amountNum > 0 ? 999 : 0;
    else months = amountNum / burn;
    if (months > 999) months = 999;
    if (months < 0) months = 0;
    const status: "safe" | "warn" | "critical" =
      months >= 6 ? "safe" : months >= 3 ? "warn" : "critical";
    return { months, status };
  }, [runway, isValidAmount, amountNum]);

  // ── Save
  const handleSave = useCallback(async () => {
    if (!isValidAmount) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/finanzas/cash-balance/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amountNum,
          note: note.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || `HTTP ${res.status}`);
      }
      onSuccess();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error guardando override");
    } finally {
      setSaving(false);
    }
  }, [amountNum, isValidAmount, note, onClose, onSuccess]);

  // ── Volver a automático
  const handleRemove = useCallback(async () => {
    setError(null);
    setRemoving(true);
    try {
      const res = await fetch("/api/finanzas/cash-balance/override", {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || `HTTP ${res.status}`);
      }
      onSuccess();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error volviendo a automático");
    } finally {
      setRemoving(false);
    }
  }, [onClose, onSuccess]);

  // ── Close con Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const statusColor =
    preview?.status === "safe"
      ? { fg: "#065f46", bg: "rgba(16,185,129,0.1)" }
      : preview?.status === "warn"
        ? { fg: "#9a3412", bg: "rgba(249,115,22,0.1)" }
        : { fg: "#991b1b", bg: "rgba(239,68,68,0.1)" };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cash-override-title"
    >
      {/* Backdrop */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: "rgba(15,23,42,0.45)",
          backdropFilter: "blur(4px)",
          animation: "cboFadeIn 180ms ease",
        }}
        onClick={onClose}
      />

      {/* Card */}
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl border bg-white"
        style={{
          borderColor: "rgba(15,23,42,0.08)",
          boxShadow:
            "0 10px 40px rgba(15,23,42,0.18), 0 2px 6px rgba(15,23,42,0.08)",
          animation: "cboScaleIn 220ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4" style={{ borderColor: "rgba(15,23,42,0.06)" }}>
          <div>
            <div
              className="text-[10px] font-semibold uppercase tracking-[0.16em]"
              style={{ color: "rgba(15,23,42,0.5)" }}
            >
              Ajustar saldo real · {currentMonthHuman()}
            </div>
            <h3
              id="cash-override-title"
              className="mt-1 text-lg font-bold tracking-tight text-slate-900"
              style={{ letterSpacing: "-0.02em" }}
            >
              Override manual de caja
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            style={{ transition: `all 160ms ${ES}` }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-5">
          {/* Explainer */}
          <p className="text-[12.5px] leading-relaxed text-slate-600">
            El cálculo automático (revenue − costos YTD) no contempla inventario
            comprado, impuestos ni retiros. Cargá acá tu{" "}
            <span className="font-semibold text-slate-800">
              saldo real de banco
            </span>{" "}
            (ARS) para que el runway refleje el cash que tenés.
          </p>

          {/* Loading de la lectura inicial */}
          {loading && (
            <div
              className="h-24 w-full rounded-lg"
              style={{
                background:
                  "linear-gradient(90deg, rgba(15,23,42,0.04) 0%, rgba(15,23,42,0.08) 50%, rgba(15,23,42,0.04) 100%)",
                backgroundSize: "200% 100%",
                animation: "cboShimmer 1.4s ease-in-out infinite",
              }}
            />
          )}

          {!loading && (
            <>
              {/* Amount input */}
              <div>
                <label
                  htmlFor="cbo-amount"
                  className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                >
                  Saldo real (ARS)
                </label>
                <div
                  className="mt-1 flex items-center overflow-hidden rounded-lg border bg-white"
                  style={{
                    borderColor: "rgba(15,23,42,0.12)",
                    transition: `border-color 160ms ${ES}`,
                  }}
                >
                  <span className="px-3 text-sm font-semibold text-slate-400">
                    $
                  </span>
                  <input
                    id="cbo-amount"
                    type="text"
                    inputMode="decimal"
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                    placeholder="0"
                    className="flex-1 bg-transparent py-2.5 text-sm font-semibold tabular-nums text-slate-900 outline-none"
                    autoFocus
                  />
                  <span className="pr-3 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    ARS
                  </span>
                </div>
                {isValidAmount && amountStr && (
                  <div className="mt-1 text-[11px] text-slate-500 tabular-nums">
                    ≈ $ {formatArs(amountNum)}
                  </div>
                )}
              </div>

              {/* Nota */}
              <div>
                <label
                  htmlFor="cbo-note"
                  className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                >
                  Nota (opcional)
                </label>
                <textarea
                  id="cbo-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 500))}
                  rows={2}
                  placeholder="Ej: saldo Santander + Mercado Pago al 18/4"
                  className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-800 outline-none"
                  style={{
                    borderColor: "rgba(15,23,42,0.12)",
                    resize: "vertical",
                    maxHeight: 140,
                  }}
                />
              </div>

              {/* Preview del impacto */}
              {preview && runway && (
                <div
                  className="rounded-xl border p-3"
                  style={{
                    borderColor: "rgba(15,23,42,0.06)",
                    background: "rgba(15,23,42,0.02)",
                  }}
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Impacto en runway
                  </div>
                  <div className="mt-1 flex items-baseline gap-3">
                    <span
                      className="text-2xl font-bold tabular-nums tracking-tight"
                      style={{
                        color: statusColor.fg,
                        letterSpacing: "-0.02em",
                      }}
                    >
                      {preview.months >= 999
                        ? "∞"
                        : preview.months.toFixed(1)}
                    </span>
                    <span className="text-xs font-medium text-slate-500">
                      meses con burn $ {formatArs(runway.burnRate30d)}/mes
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500 tabular-nums">
                    Auto hoy:{" "}
                    <span className="text-slate-700">
                      {runway.monthsRemaining >= 999
                        ? "∞"
                        : runway.monthsRemaining.toFixed(1)}{" "}
                      meses
                    </span>{" "}
                    ·{" "}
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase"
                      style={{ background: statusColor.bg, color: statusColor.fg }}
                    >
                      {preview.status === "safe"
                        ? "Saludable"
                        : preview.status === "warn"
                          ? "Atención"
                          : "Crítico"}
                    </span>
                  </div>
                </div>
              )}

              {/* Info del override existente */}
              {existing && (
                <div
                  className="rounded-lg border border-dashed px-3 py-2 text-[11px]"
                  style={{
                    borderColor: "rgba(15,23,42,0.12)",
                    color: "rgba(15,23,42,0.6)",
                  }}
                >
                  Override actual del mes desde{" "}
                  {new Date(existing.updatedAt).toLocaleDateString("es-AR", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                  . Si guardás un nuevo valor, se reemplaza.
                </div>
              )}
            </>
          )}

          {/* Error */}
          {error && (
            <div
              className="rounded-lg border px-3 py-2 text-xs"
              style={{
                borderColor: "rgba(239,68,68,0.25)",
                background: "rgba(239,68,68,0.05)",
                color: "#991b1b",
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between gap-2 border-t px-5 py-3"
          style={{
            borderColor: "rgba(15,23,42,0.06)",
            background: "rgba(15,23,42,0.015)",
          }}
        >
          <button
            type="button"
            onClick={handleRemove}
            disabled={!existing || saving || removing || loading}
            className="text-[12px] font-semibold text-slate-500 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ transition: `color 160ms ${ES}` }}
          >
            {removing ? "Volviendo…" : "Volver a automático"}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving || removing}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40"
              style={{ transition: `all 160ms ${ES}` }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!isValidAmount || saving || removing || loading}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                background:
                  "linear-gradient(135deg, #fbbf24 0%, #d97706 100%)",
                boxShadow:
                  "0 1px 2px rgba(217,119,6,0.25), 0 6px 16px -8px rgba(217,119,6,0.45)",
                transition: `transform 160ms ${ES}, box-shadow 160ms ${ES}`,
              }}
            >
              {saving ? "Guardando…" : existing ? "Actualizar" : "Guardar"}
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes cboFadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes cboScaleIn {
          from {
            opacity: 0;
            transform: scale(0.96) translateY(4px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        @keyframes cboShimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
      `}</style>
    </div>
  );
}
