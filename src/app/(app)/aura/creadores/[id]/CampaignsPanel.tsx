"use client";

// ══════════════════════════════════════════════════════════════
// Aura — Panel de Campañas + Pagos del creador (Bloque D · D2)
// ══════════════════════════════════════════════════════════════
// Reemplaza la vieja "Pagos por mes" (PaymentsCard) y consolida el pedido de
// Tomy (reunión 08/07/26):
//   - "Campaña activa" (item 11): solo la campaña vigente. Si no hay ninguna,
//     botón grande "Comenzar campaña" (item 13). Botón "Finalizar campaña"
//     (item 12) → al finalizar, sus datos pasan al histórico (item 16).
//   - "Pendiente a pagar" (item 14): total ganado − pagado de TODAS las
//     campañas (activa + finalizadas). Botón "Registrar pago" → modal FIFO
//     (items 15/24): se paga de campaña más vieja a más nueva.
//   - "Historial de campañas" (item 12): las campañas no activas con su saldo.
//
// Los datos salen de GET /api/aura/creators/[id]/balance y el pago de
// POST /api/aura/creators/[id]/settle. Ver src/lib/aura/campaign-balance.ts.
// ══════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Wallet, Plus, Flag, History, Check, X } from "lucide-react";

const THEME = {
  bgCard: "rgba(255, 255, 255, 0.03)",
  bgSoft: "rgba(255, 255, 255, 0.02)",
  border: "rgba(255, 255, 255, 0.06)",
  borderStrong: "rgba(255, 255, 255, 0.12)",
  textPrimary: "#f5f5f7",
  textSecondary: "rgba(245, 245, 247, 0.62)",
  textTertiary: "rgba(245, 245, 247, 0.42)",
  textMuted: "rgba(245, 245, 247, 0.32)",
  gold: "#ff0080",
  green: "#4ade80",
  yellow: "#fbbf24",
  cyan: "#00d4ff",
  gradient: "linear-gradient(135deg, #ff0080 0%, #7928ca 50%, #00d4ff 100%)",
};

const METHODS = ["TRANSFER", "MERCADOPAGO", "CASH", "CRYPTO", "OTHER"] as const;

type CampaignBalance = {
  campaignId: string;
  name: string;
  status: string;
  isAlwaysOn: boolean;
  startDate: string;
  endDate: string | null;
  earned: number;
  paid: number;
  pending: number;
};

type Balances = {
  status: string;
  campaigns: CampaignBalance[];
  totalEarned: number;
  totalPaid: number;
  totalPending: number;
};

function fmtARS(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("es-AR") : "—";
}

export function CampaignsPanel({ creatorId }: { creatorId: string }) {
  const [data, setData] = useState<Balances | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/aura/creators/${creatorId}/balance`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Error");
      setData(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar campañas");
    }
  }, [creatorId]);

  useEffect(() => {
    load();
  }, [load]);

  const active = data?.campaigns.find((c) => c.status === "ACTIVE") || null;
  const history = (data?.campaigns || []).filter((c) => c.status !== "ACTIVE").sort((a, b) => b.startDate.localeCompare(a.startDate));

  const finalizeActive = async () => {
    if (!active) return;
    if (!confirm(`¿Finalizar la campaña "${active.name}"? Sus datos pasan al histórico y no se podrá reactivar.`)) return;
    setFinalizing(true);
    try {
      const r = await fetch(`/api/aura/campaigns/${active.campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED", endDate: new Date().toISOString() }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || d.message || `Error ${r.status}`);
      }
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo finalizar la campaña");
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-xl p-3 text-[12px]" style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", color: "#f87171" }}>
          {error}
        </div>
      )}

      {/* ─── Campaña activa (item 11/13) ─── */}
      <section className="rounded-2xl p-5" style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}` }}>
        <h2 className="text-[15px] font-semibold tracking-tight mb-3" style={{ color: THEME.textPrimary }}>
          Campaña activa
        </h2>
        {data === null ? (
          <p className="text-[13px]" style={{ color: THEME.textTertiary }}>Cargando…</p>
        ) : active ? (
          <div className="rounded-xl p-4" style={{ background: THEME.bgSoft, border: `1px solid ${THEME.border}` }}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <div className="text-[14px] font-semibold truncate" style={{ color: THEME.textPrimary }}>{active.name}</div>
                <div className="text-[11px]" style={{ color: THEME.textTertiary }}>
                  Desde {fmtDate(active.startDate)}{active.isAlwaysOn ? " · Always-On" : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={finalizeActive}
                disabled={finalizing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold shrink-0 transition-all hover:brightness-110 disabled:opacity-50"
                style={{ background: "rgba(251,191,36,0.14)", color: THEME.yellow, border: `1px solid ${THEME.yellow}44` }}
              >
                <Flag size={13} strokeWidth={2.2} />
                {finalizing ? "Finalizando…" : "Finalizar campaña"}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Ganado" value={fmtARS(active.earned)} />
              <Stat label="Pagado" value={fmtARS(active.paid)} color={active.paid > 0 ? THEME.green : undefined} />
              <Stat label="Pendiente" value={fmtARS(active.pending)} color={active.pending > 0 ? THEME.yellow : undefined} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 gap-3">
            <p className="text-[13px] text-center" style={{ color: THEME.textTertiary }}>
              Este creador no tiene una campaña activa.
            </p>
            <Link
              href={`/aura/campanas/nueva?creatorId=${creatorId}`}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-[14px] font-semibold text-white transition-all hover:brightness-110"
              style={{ background: THEME.gradient, boxShadow: "0 4px 20px rgba(168,85,247,0.35)" }}
            >
              <Plus size={16} strokeWidth={2.4} />
              Comenzar campaña
            </Link>
          </div>
        )}
      </section>

      {/* ─── Pendiente a pagar (item 14) + Registrar pago (item 15/24) ─── */}
      <section className="rounded-2xl p-5" style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}` }}>
        <div className="flex items-center gap-2 mb-3">
          <Wallet size={16} style={{ color: THEME.cyan }} />
          <h2 className="text-[15px] font-semibold tracking-tight" style={{ color: THEME.textPrimary }}>
            Pagos y comisiones
          </h2>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider font-semibold mb-1" style={{ color: THEME.textMuted }}>
              Pendiente a pagar
            </div>
            <div className="text-[26px] font-semibold tabular-nums leading-none" style={{ color: data && data.totalPending > 0 ? THEME.yellow : THEME.textPrimary }}>
              {data ? fmtARS(data.totalPending) : "—"}
            </div>
            {data ? (
              <div className="text-[11px] mt-1.5" style={{ color: THEME.textTertiary }}>
                {fmtARS(data.totalEarned)} ganado · {fmtARS(data.totalPaid)} pagado (histórico)
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setSettleOpen(true)}
            disabled={!data || data.totalPending <= 0}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[13px] font-semibold text-white shrink-0 transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: THEME.gradient }}
          >
            <Plus size={14} strokeWidth={2.4} />
            Registrar pago
          </button>
        </div>
      </section>

      {/* ─── Historial de campañas (item 12) ─── */}
      <section className="rounded-2xl p-5" style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}` }}>
        <div className="flex items-center gap-2 mb-3">
          <History size={16} style={{ color: THEME.textSecondary }} />
          <h2 className="text-[15px] font-semibold tracking-tight" style={{ color: THEME.textPrimary }}>
            Historial de campañas
          </h2>
        </div>
        {data === null ? (
          <p className="text-[13px]" style={{ color: THEME.textTertiary }}>Cargando…</p>
        ) : history.length === 0 ? (
          <p className="text-[13px]" style={{ color: THEME.textTertiary }}>
            Todavía no hay campañas finalizadas.
          </p>
        ) : (
          <div className="flex flex-col gap-px rounded-xl overflow-hidden" style={{ background: THEME.border }}>
            {history.map((c) => (
              <div key={c.campaignId} className="flex items-center gap-3 px-4 py-3" style={{ background: "#12121c" }}>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate" style={{ color: THEME.textPrimary }}>{c.name}</div>
                  <div className="text-[11px]" style={{ color: THEME.textTertiary }}>
                    {fmtDate(c.startDate)} → {fmtDate(c.endDate)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[11px]" style={{ color: THEME.textTertiary }}>ganado</div>
                  <div className="text-[13px] font-semibold tabular-nums">{fmtARS(c.earned)}</div>
                </div>
                <div className="text-right shrink-0 w-24">
                  <div className="text-[11px]" style={{ color: THEME.textTertiary }}>pendiente</div>
                  <div className="text-[13px] font-semibold tabular-nums" style={{ color: c.pending > 0 ? THEME.yellow : THEME.green }}>
                    {c.pending > 0 ? fmtARS(c.pending) : "saldada"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {settleOpen && data ? (
        <SettlePaymentModal
          creatorId={creatorId}
          pendingCampaigns={data.campaigns.filter((c) => c.pending > 0)}
          totalPending={data.totalPending}
          onClose={() => setSettleOpen(false)}
          onDone={() => {
            setSettleOpen(false);
            load();
          }}
        />
      ) : null}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: THEME.textMuted }}>{label}</div>
      <div className="text-[15px] font-semibold tabular-nums" style={{ color: color || THEME.textPrimary }}>{value}</div>
    </div>
  );
}

// ─── Modal de registrar pago con FIFO (items 15/24) ───
function SettlePaymentModal({
  creatorId,
  pendingCampaigns,
  totalPending,
  onClose,
  onDone,
}: {
  creatorId: string;
  pendingCampaigns: CampaignBalance[];
  totalPending: number;
  onClose: () => void;
  onDone: () => void;
}) {
  // Selección de campañas a saldar. Por defecto: todas.
  const [selected, setSelected] = useState<Set<string>>(new Set(pendingCampaigns.map((c) => c.campaignId)));
  const [amount, setAmount] = useState<string>(String(Math.round(totalPending)));
  const [method, setMethod] = useState<string>("TRANSFER");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const allSelected = selected.size === pendingCampaigns.length;
  const selectedPending = pendingCampaigns
    .filter((c) => selected.has(c.campaignId))
    .reduce((s, c) => s + c.pending, 0);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(pendingCampaigns.map((c) => c.campaignId)));
  };

  const amt = parseFloat(amount);
  const canSubmit = Number.isFinite(amt) && amt > 0 && selected.size > 0 && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch(`/api/aura/creators/${creatorId}/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amt,
          method,
          reference: reference.trim() || null,
          campaignIds: allSelected ? undefined : Array.from(selected),
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }} onClick={onClose}>
      <div className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl" style={{ background: "#0f0f1a", border: `1px solid ${THEME.borderStrong}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: THEME.border }}>
          <div>
            <div className="text-[10px] font-mono tracking-widest uppercase mb-1" style={{ color: THEME.cyan }}>Pendiente a pagar</div>
            <h2 className="text-lg font-semibold" style={{ color: THEME.textPrimary }}>Registrar pago</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5" style={{ color: THEME.textSecondary }}><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-[12px]" style={{ color: THEME.textSecondary }}>
            Elegí qué campañas saldar y poné el monto que pagaste. Se descuenta de la más
            vieja a la más nueva (FIFO). Si pagás menos que el total, queda saldo pendiente.
          </p>

          {/* Lista de campañas pendientes con checkboxes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: THEME.textMuted }}>
                Campañas con saldo
              </span>
              <button type="button" onClick={toggleAll} className="text-[11px] font-semibold" style={{ color: THEME.cyan }}>
                {allSelected ? "Deseleccionar todas" : "Seleccionar todas"}
              </button>
            </div>
            <div className="flex flex-col gap-px rounded-xl overflow-hidden" style={{ background: THEME.border }}>
              {pendingCampaigns.map((c) => {
                const on = selected.has(c.campaignId);
                return (
                  <button
                    key={c.campaignId}
                    type="button"
                    onClick={() => toggle(c.campaignId)}
                    className="flex items-center gap-3 px-3 py-2.5 text-left transition-colors"
                    style={{ background: on ? "rgba(0,212,255,0.06)" : "#12121c" }}
                  >
                    <span
                      className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                      style={{ background: on ? THEME.cyan : "transparent", border: `1.5px solid ${on ? THEME.cyan : THEME.borderStrong}` }}
                    >
                      {on ? <Check size={11} strokeWidth={3} color="#0f0f1a" /> : null}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-medium truncate" style={{ color: THEME.textPrimary }}>{c.name}</div>
                      <div className="text-[10.5px]" style={{ color: THEME.textTertiary }}>desde {fmtDate(c.startDate)}</div>
                    </div>
                    <div className="text-[12.5px] font-semibold tabular-nums shrink-0" style={{ color: THEME.yellow }}>{fmtARS(c.pending)}</div>
                  </button>
                );
              })}
            </div>
            <div className="text-[11px] mt-1.5 text-right" style={{ color: THEME.textTertiary }}>
              Seleccionado: <span className="tabular-nums" style={{ color: THEME.textSecondary }}>{fmtARS(selectedPending)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px]" style={{ color: THEME.textTertiary }}>Monto pagado</span>
              <input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="px-3 py-2 rounded-lg outline-none text-[13px] tabular-nums"
                style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px]" style={{ color: THEME.textTertiary }}>Método</span>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="px-3 py-2 rounded-lg outline-none text-[13px]"
                style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
              >
                {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[11px]" style={{ color: THEME.textTertiary }}>Referencia (opcional)</span>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Nº transferencia, ID MP…"
              className="px-3 py-2 rounded-lg outline-none text-[13px]"
              style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
            />
          </label>

          {amt > selectedPending ? (
            <div className="text-[11px]" style={{ color: THEME.yellow }}>
              El monto supera el saldo seleccionado ({fmtARS(selectedPending)}). Se saldan esas campañas y el resto no se aplica.
            </div>
          ) : null}
          {err ? <div className="text-[12px]" style={{ color: "#f87171" }}>{err}</div> : null}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t" style={{ borderColor: THEME.border }}>
          <button onClick={onClose} className="px-3 py-2 text-[12px] font-medium rounded-lg" style={{ background: THEME.bgCard, color: THEME.textSecondary }}>Cancelar</button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="px-4 py-2 text-[12px] font-semibold rounded-lg text-white disabled:opacity-40 flex items-center gap-1.5"
            style={{ background: THEME.gradient }}
          >
            <Check size={14} />
            {saving ? "Registrando…" : "Registrar pago"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Wrapper reutilizable: trae el saldo del creador y abre el modal FIFO ───
// Lo usa la página de Pagos (D3) tras elegir un afiliado en el selector.
export function SettleForCreator({
  creatorId,
  onClose,
  onDone,
}: {
  creatorId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [data, setData] = useState<Balances | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/aura/creators/${creatorId}/balance`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Error");
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error");
      });
    return () => {
      cancelled = true;
    };
  }, [creatorId]);

  if (error) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose}>
        <div className="rounded-2xl p-6 max-w-sm text-[13px]" style={{ background: "#0f0f1a", border: `1px solid ${THEME.borderStrong}`, color: "#f87171" }} onClick={(e) => e.stopPropagation()}>
          No se pudo cargar el saldo: {error}
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
        <div className="rounded-2xl p-6 text-[13px]" style={{ background: "#0f0f1a", border: `1px solid ${THEME.borderStrong}`, color: THEME.textTertiary }}>
          Cargando saldo…
        </div>
      </div>
    );
  }
  const pending = data.campaigns.filter((c) => c.pending > 0);
  if (pending.length === 0) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose}>
        <div className="rounded-2xl p-6 max-w-sm text-center" style={{ background: "#0f0f1a", border: `1px solid ${THEME.borderStrong}` }} onClick={(e) => e.stopPropagation()}>
          <div className="text-[14px] font-semibold mb-1" style={{ color: THEME.textPrimary }}>Sin saldo pendiente</div>
          <p className="text-[12px]" style={{ color: THEME.textTertiary }}>Este afiliado no tiene comisiones pendientes de pago.</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 rounded-lg text-[12px] font-semibold text-white" style={{ background: THEME.gradient }}>Cerrar</button>
        </div>
      </div>
    );
  }
  return (
    <SettlePaymentModal
      creatorId={creatorId}
      pendingCampaigns={pending}
      totalPending={data.totalPending}
      onClose={onClose}
      onDone={onDone}
    />
  );
}
