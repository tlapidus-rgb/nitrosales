"use client";

// ══════════════════════════════════════════════════════════════
// Aura — Card de pagos por mes (Lote 2B · Pieza 2)
// ══════════════════════════════════════════════════════════════
// Muestra, por mes y SIN saldo acumulado:
//   "corresponde $X" (comisión del mes, calculada) vs lo registrado (pagos PAID).
// Registrar un pago es libre (podés pagar menos) y nace PAID asociado al mes.
// NO hay saldo arrastrado: cada mes es su propio cálculo independiente.
// ══════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from "react";
import { Wallet, Plus, Check } from "lucide-react";

const THEME = {
  bgCard: "rgba(255, 255, 255, 0.03)",
  bgSoft: "rgba(255, 255, 255, 0.02)",
  border: "rgba(255, 255, 255, 0.06)",
  borderStrong: "rgba(255, 255, 255, 0.12)",
  textPrimary: "#f5f5f7",
  textSecondary: "rgba(245, 245, 247, 0.62)",
  textTertiary: "rgba(245, 245, 247, 0.42)",
  green: "#4ade80",
  cyan: "#00d4ff",
  gradient: "linear-gradient(135deg, #ff0080 0%, #7928ca 50%, #00d4ff 100%)",
};

const METHODS = ["TRANSFER", "MERCADOPAGO", "CASH", "CRYPTO", "OTHER"] as const;

type MonthRow = {
  periodMonth: string;
  label: string;
  owed: number;
  revenue: number;
  orders: number;
  paid: number;
  payouts: { id: string; amount: number; concept: string; method: string | null; paidAt: string | null }[];
};

function fmtARS(n: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);
}

export function PaymentsCard({ creatorId }: { creatorId: string }) {
  const [months, setMonths] = useState<MonthRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openMonth, setOpenMonth] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/aura/creators/${creatorId}/payments?months=6`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Error");
      setMonths(d.months || []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar pagos");
    }
  }, [creatorId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section
      className="rounded-2xl p-5"
      style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}` }}
    >
      <div className="flex items-center gap-2 mb-1">
        <Wallet size={16} style={{ color: THEME.cyan }} />
        <h2 className="text-[15px] font-semibold tracking-tight">Pagos por mes</h2>
      </div>
      <p className="text-[12px] mb-4" style={{ color: THEME.textSecondary }}>
        Lo que corresponde cada mes (comisión calculada) vs lo que registraste como pagado.
        Cada mes es independiente — no hay saldo acumulado.
      </p>

      {error && (
        <p className="text-xs mb-2" style={{ color: "#f87171" }}>
          {error}
        </p>
      )}

      {months === null ? (
        <p className="text-[13px]" style={{ color: THEME.textTertiary }}>
          Cargando…
        </p>
      ) : months.length === 0 ? (
        <p className="text-[13px]" style={{ color: THEME.textTertiary }}>
          Sin datos de pagos.
        </p>
      ) : (
        <div className="flex flex-col gap-px rounded-xl overflow-hidden" style={{ background: THEME.border }}>
          {months.map((m) => {
            const pending = Math.max(0, Math.round((m.owed - m.paid) * 100) / 100);
            return (
              <div key={m.periodMonth} style={{ background: "#12121c" }}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium">{m.label}</div>
                    <div className="text-[11px]" style={{ color: THEME.textTertiary }}>
                      {m.orders} ventas · {fmtARS(m.revenue)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[11px]" style={{ color: THEME.textTertiary }}>
                      corresponde
                    </div>
                    <div className="text-[13px] font-semibold tabular-nums">{fmtARS(m.owed)}</div>
                  </div>
                  <div className="text-right shrink-0 w-24">
                    <div className="text-[11px]" style={{ color: THEME.textTertiary }}>
                      pagado
                    </div>
                    <div
                      className="text-[13px] font-semibold tabular-nums"
                      style={{ color: m.paid > 0 ? THEME.green : THEME.textTertiary }}
                    >
                      {fmtARS(m.paid)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpenMonth(openMonth === m.periodMonth ? null : m.periodMonth)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium text-white shrink-0 transition-all hover:brightness-110"
                    style={{ background: THEME.gradient }}
                  >
                    <Plus size={13} strokeWidth={2.4} />
                    Registrar
                  </button>
                </div>

                {pending > 0 && (
                  <div className="px-4 pb-2 -mt-1">
                    <span className="text-[11px]" style={{ color: THEME.textTertiary }}>
                      sin registrar: {fmtARS(pending)} (referencia — podés pagar otro monto)
                    </span>
                  </div>
                )}

                {openMonth === m.periodMonth && (
                  <RegisterPaymentForm
                    creatorId={creatorId}
                    periodMonth={m.periodMonth}
                    label={m.label}
                    suggested={pending > 0 ? pending : m.owed}
                    onDone={() => {
                      setOpenMonth(null);
                      load();
                    }}
                  />
                )}

                {m.payouts.length > 0 && (
                  <div className="px-4 pb-3 flex flex-col gap-1">
                    {m.payouts.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-2 text-[11px]"
                        style={{ color: THEME.textSecondary }}
                      >
                        <Check size={12} style={{ color: THEME.green }} />
                        <span className="tabular-nums">{fmtARS(p.amount)}</span>
                        <span style={{ color: THEME.textTertiary }}>
                          {p.method || "—"}
                          {p.paidAt ? ` · ${new Date(p.paidAt).toLocaleDateString("es-AR")}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function RegisterPaymentForm({
  creatorId,
  periodMonth,
  label,
  suggested,
  onDone,
}: {
  creatorId: string;
  periodMonth: string;
  label: string;
  suggested: number;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(suggested > 0 ? String(Math.round(suggested)) : "");
  const [method, setMethod] = useState<string>("TRANSFER");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const amt = parseFloat(amount);
  const canSubmit = Number.isFinite(amt) && amt > 0 && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch("/api/aura/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          influencerId: creatorId,
          concept: `Comisión ${label}`,
          amount: amt,
          periodMonth,
          method,
          reference: reference.trim() || null,
          markPaid: true,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Error al registrar el pago");
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
      setSaving(false);
    }
  };

  return (
    <div
      className="px-4 py-3 flex flex-col gap-2"
      style={{ background: THEME.bgSoft, borderTop: `1px solid ${THEME.border}` }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px]" style={{ color: THEME.textTertiary }}>
            Monto pagado
          </span>
          <input
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-32 px-2.5 py-2 rounded-lg outline-none text-[13px] tabular-nums"
            style={{ background: "#12121c", border: `1px solid ${THEME.borderStrong}`, color: THEME.textPrimary }}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px]" style={{ color: THEME.textTertiary }}>
            Método
          </span>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="px-2.5 py-2 rounded-lg outline-none text-[13px]"
            style={{ background: "#12121c", border: `1px solid ${THEME.borderStrong}`, color: THEME.textPrimary }}
          >
            {METHODS.map((mt) => (
              <option key={mt} value={mt}>
                {mt}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 flex-1 min-w-[120px]">
          <span className="text-[10px]" style={{ color: THEME.textTertiary }}>
            Referencia (opcional)
          </span>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Nº transferencia, ID MP…"
            className="w-full px-2.5 py-2 rounded-lg outline-none text-[13px]"
            style={{ background: "#12121c", border: `1px solid ${THEME.borderStrong}`, color: THEME.textPrimary }}
          />
        </label>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white transition-all hover:brightness-110 disabled:opacity-40"
          style={{ background: THEME.gradient }}
        >
          {saving ? "Registrando…" : "Registrar pago"}
        </button>
      </div>
      {err && (
        <span className="text-[11px]" style={{ color: "#f87171" }}>
          {err}
        </span>
      )}
    </div>
  );
}
