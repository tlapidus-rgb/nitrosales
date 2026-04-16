"use client";

// ═══════════════════════════════════════════════════════════════
// Aura — Pagos
// ───────────────────────────────────────────────────────────────
// Overview + listado + crear payout. Soporta estados Pendiente/Pagado/Cancelado.
// Múltiples modelos de compensación via Deals (comisión %, flat fee, bonus,
// tiered, CPM, gifting, híbrido).
// ═══════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import {
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  Plus,
  Search,
  Filter,
  Upload,
  MoreHorizontal,
  Sparkles,
  Wallet,
  X,
  Copy,
  Check,
} from "lucide-react";

const THEME = {
  bgPage: "#0a0a14",
  bgCard: "rgba(255, 255, 255, 0.03)",
  bgSoft: "rgba(255, 255, 255, 0.02)",
  border: "rgba(255, 255, 255, 0.06)",
  borderStrong: "rgba(255, 255, 255, 0.12)",
  textPrimary: "#f5f5f7",
  textSecondary: "rgba(245, 245, 247, 0.62)",
  textTertiary: "rgba(245, 245, 247, 0.42)",
  textMuted: "rgba(245, 245, 247, 0.32)",
  pink: "#ff0080",
  purple: "#a855f7",
  cyan: "#00d4ff",
  green: "#4ade80",
  yellow: "#fbbf24",
  rose: "#ff6b8a",
  gradient: "linear-gradient(135deg, #ff0080 0%, #7928ca 50%, #00d4ff 100%)",
  gradientText: "linear-gradient(90deg, #ff0080 0%, #a855f7 50%, #00d4ff 100%)",
};

type Influencer = { id: string; name: string; code: string; profileImage?: string | null };
type Deal = { id: string; name: string; type: string };
type Campaign = { id: string; name: string };
type Payout = {
  id: string;
  concept: string;
  amount: number | string;
  currency: string;
  status: "PENDING" | "PAID" | "CANCELLED";
  method: string | null;
  paidAt: string | null;
  reference: string | null;
  proofUrl: string | null;
  notes: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string;
  influencer: Influencer;
  deal: Deal | null;
  campaign: Campaign | null;
};
type Totals = {
  pendingCount: number;
  pendingAmount: number;
  paidCount: number;
  paidAmount: number;
  cancelledCount: number;
};

const fmtAR = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("es-AR") : "—");

export default function PagosPage() {
  const [items, setItems] = useState<Payout[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"all" | "PENDING" | "PAID" | "CANCELLED">("PENDING");
  const [q, setQ] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showAutoGen, setShowAutoGen] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [payModal, setPayModal] = useState<Payout | null>(null);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("status", status);
      if (q) params.set("q", q);
      const res = await fetch(`/api/aura/payouts/list?${params.toString()}`);
      const data = await res.json();
      setItems(data.items || []);
      setTotals(data.totals || null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function cancelPayout(id: string) {
    if (!confirm("¿Cancelar este pago?")) return;
    setActingId(id);
    try {
      await fetch(`/api/aura/payouts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      await load();
    } finally {
      setActingId(null);
    }
  }

  async function deletePayout(id: string) {
    if (!confirm("Eliminar este pago definitivamente?")) return;
    setActingId(id);
    try {
      await fetch(`/api/aura/payouts/${id}`, { method: "DELETE" });
      await load();
    } finally {
      setActingId(null);
    }
  }

  async function restorePayout(id: string) {
    setActingId(id);
    try {
      await fetch(`/api/aura/payouts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PENDING" }),
      });
      await load();
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: THEME.bgPage, color: THEME.textPrimary }}>
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Wallet size={20} style={{ color: THEME.purple }} />
              <span
                className="text-xs font-mono tracking-widest uppercase"
                style={{ background: THEME.gradientText, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
              >
                Aura · Pagos
              </span>
            </div>
            <h1 className="text-3xl font-semibold mb-1">Pagos a creadores</h1>
            <p className="text-sm" style={{ color: THEME.textSecondary }}>
              Comisiones, flat fees, bonus y gifting. Todo lo que le debés (o ya pagaste) a tu red.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAutoGen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
              style={{ background: THEME.bgCard, border: `1px solid ${THEME.borderStrong}`, color: THEME.textPrimary }}
            >
              <Sparkles size={16} style={{ color: THEME.purple }} />
              Auto-generar
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02]"
              style={{ background: THEME.gradient, color: "#fff", boxShadow: "0 0 24px rgba(168,85,247,0.35)" }}
            >
              <Plus size={16} />
              Registrar pago
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <KpiCard
            icon={<Clock size={18} />}
            label="Pendiente"
            value={totals ? fmtAR(totals.pendingAmount) : "—"}
            sub={totals ? `${totals.pendingCount} pagos` : ""}
            color={THEME.yellow}
          />
          <KpiCard
            icon={<CheckCircle2 size={18} />}
            label="Pagado (histórico)"
            value={totals ? fmtAR(totals.paidAmount) : "—"}
            sub={totals ? `${totals.paidCount} pagos` : ""}
            color={THEME.green}
          />
          <KpiCard
            icon={<DollarSign size={18} />}
            label="Total comprometido"
            value={totals ? fmtAR(totals.pendingAmount + totals.paidAmount) : "—"}
            sub=""
            color={THEME.purple}
          />
          <KpiCard
            icon={<XCircle size={18} />}
            label="Cancelados"
            value={totals ? String(totals.cancelledCount) : "—"}
            sub=""
            color={THEME.rose}
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}` }}>
            {(["PENDING", "PAID", "CANCELLED", "all"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className="px-3 py-1.5 text-xs font-medium rounded-md transition-all"
                style={{
                  background: status === s ? "rgba(168,85,247,0.18)" : "transparent",
                  color: status === s ? THEME.textPrimary : THEME.textSecondary,
                }}
              >
                {s === "all" ? "Todos" : s === "PENDING" ? "Pendientes" : s === "PAID" ? "Pagados" : "Cancelados"}
              </button>
            ))}
          </div>
          <div className="flex-1 min-w-[200px] relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: THEME.textTertiary }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              placeholder="Buscar por concepto, creador, referencia..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg outline-none"
              style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
            />
          </div>
          <button
            onClick={load}
            className="px-3 py-2 text-xs font-medium rounded-lg transition-all"
            style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}`, color: THEME.textSecondary }}
          >
            <Filter size={14} />
          </button>
        </div>

        {/* Lista */}
        <div className="rounded-xl overflow-hidden" style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}` }}>
          {loading ? (
            <div className="p-12 text-center text-sm" style={{ color: THEME.textTertiary }}>
              Cargando...
            </div>
          ) : items.length === 0 ? (
            <div className="p-16 text-center">
              <Wallet size={32} className="mx-auto mb-3" style={{ color: THEME.textMuted }} />
              <p className="text-sm mb-1" style={{ color: THEME.textSecondary }}>
                {status === "PENDING" ? "No hay pagos pendientes." : "No hay pagos en esta vista."}
              </p>
              <p className="text-xs" style={{ color: THEME.textMuted }}>
                Registrá el primer pago con el botón de arriba.
              </p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: THEME.border }}>
              {items.map((p) => (
                <PayoutRow
                  key={p.id}
                  payout={p}
                  busy={actingId === p.id}
                  onPay={() => setPayModal(p)}
                  onCancel={() => cancelPayout(p.id)}
                  onDelete={() => deletePayout(p.id)}
                  onRestore={() => restorePayout(p.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Nota migración */}
        <p className="text-[11px] mt-6 text-center" style={{ color: THEME.textMuted }}>
          <Sparkles size={10} className="inline mr-1" />
          Tip: antes de usar Pagos por primera vez, corré{" "}
          <code style={{ color: THEME.textTertiary }}>/api/admin/migrate-aura-payouts?key=…</code> para crear las tablas.
        </p>
      </div>

      {showCreate && (
        <CreatePayoutModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}

      {showAutoGen && (
        <AutoGenerateModal
          onClose={() => setShowAutoGen(false)}
          onGenerated={() => {
            setShowAutoGen(false);
            load();
          }}
        />
      )}

      {payModal && (
        <MarkPaidModal
          payout={payModal}
          onClose={() => setPayModal(null)}
          onDone={() => {
            setPayModal(null);
            load();
          }}
        />
      )}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────
function KpiCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div
      className="p-4 rounded-xl"
      style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}` }}
    >
      <div className="flex items-center gap-2 mb-2" style={{ color }}>
        {icon}
        <span className="text-[11px] font-mono tracking-widest uppercase">{label}</span>
      </div>
      <div className="text-2xl font-semibold">{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: THEME.textMuted }}>{sub}</div>}
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────
function PayoutRow({
  payout,
  busy,
  onPay,
  onCancel,
  onDelete,
  onRestore,
}: {
  payout: Payout;
  busy: boolean;
  onPay: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onRestore: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const amount = Number(payout.amount);
  const statusColor =
    payout.status === "PAID" ? THEME.green : payout.status === "CANCELLED" ? THEME.rose : THEME.yellow;
  const statusLabel =
    payout.status === "PAID" ? "Pagado" : payout.status === "CANCELLED" ? "Cancelado" : "Pendiente";

  return (
    <div className="p-4 hover:bg-white/[0.02] transition-colors">
      <div className="flex items-center gap-4">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold"
          style={{
            background: "linear-gradient(135deg, rgba(255,0,128,0.18), rgba(168,85,247,0.18), rgba(0,212,255,0.18))",
            color: "#fff",
          }}
        >
          {payout.influencer.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium truncate">{payout.influencer.name}</span>
            <span className="text-xs" style={{ color: THEME.textMuted }}>
              @{payout.influencer.code}
            </span>
            {payout.deal && (
              <span
                className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase"
                style={{ background: "rgba(168,85,247,0.14)", color: THEME.purple }}
              >
                {payout.deal.type.replace("_", " ")}
              </span>
            )}
          </div>
          <div className="text-xs truncate" style={{ color: THEME.textSecondary }}>
            {payout.concept}
            {payout.campaign && <span style={{ color: THEME.textMuted }}> · {payout.campaign.name}</span>}
          </div>
          {payout.status === "PAID" && (
            <div className="text-[10px] mt-0.5" style={{ color: THEME.textMuted }}>
              Pagado el {fmtDate(payout.paidAt)}
              {payout.method && ` · ${payout.method}`}
              {payout.reference && ` · ${payout.reference}`}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-base font-semibold">{fmtAR(amount)}</div>
          <div className="flex items-center gap-1 justify-end mt-1">
            <span
              className="px-2 py-0.5 rounded text-[10px] font-medium"
              style={{ background: `${statusColor}1a`, color: statusColor }}
            >
              {statusLabel}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {payout.status === "PENDING" && (
            <button
              disabled={busy}
              onClick={onPay}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-all hover:scale-[1.03] disabled:opacity-50"
              style={{ background: "rgba(74,222,128,0.14)", color: THEME.green, border: `1px solid ${THEME.green}33` }}
            >
              Marcar pagado
            </button>
          )}
          {payout.status === "CANCELLED" && (
            <button
              disabled={busy}
              onClick={onRestore}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-all hover:scale-[1.03] disabled:opacity-50"
              style={{ background: "rgba(251,191,36,0.14)", color: THEME.yellow, border: `1px solid ${THEME.yellow}33` }}
            >
              Restaurar
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setMenu((v) => !v)}
              className="p-1.5 rounded-lg transition-all"
              style={{ background: "transparent", color: THEME.textSecondary }}
            >
              <MoreHorizontal size={16} />
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
                <div
                  className="absolute right-0 mt-1 w-40 rounded-lg overflow-hidden z-50 text-xs"
                  style={{ background: "#14141e", border: `1px solid ${THEME.borderStrong}` }}
                >
                  {payout.status === "PENDING" && (
                    <button
                      onClick={() => {
                        setMenu(false);
                        onCancel();
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-white/5"
                      style={{ color: THEME.textSecondary }}
                    >
                      Cancelar pago
                    </button>
                  )}
                  {payout.status !== "PAID" && (
                    <button
                      onClick={() => {
                        setMenu(false);
                        onDelete();
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-white/5"
                      style={{ color: THEME.rose }}
                    >
                      Eliminar
                    </button>
                  )}
                  {payout.proofUrl && (
                    <a
                      href={payout.proofUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block w-full px-3 py-2 text-left hover:bg-white/5"
                      style={{ color: THEME.textSecondary }}
                    >
                      Ver comprobante
                    </a>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Create modal ─────────────────────────────────────────────
function CreatePayoutModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [influencerId, setInfluencerId] = useState("");
  const [dealId, setDealId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/influencers")
      .then((r) => r.json())
      .then((d) => setInfluencers(d.items || d.influencers || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!influencerId) {
      setDeals([]);
      return;
    }
    fetch(`/api/aura/deals/list?influencerId=${influencerId}&status=ACTIVE`)
      .then((r) => r.json())
      .then((d) => setDeals(d.items || []))
      .catch(() => {});
    // Campaigns del influencer
    fetch(`/api/influencers/${influencerId}/campaigns`)
      .then((r) => r.json())
      .then((d) => setCampaigns(d.campaigns || d.items || []))
      .catch(() => {});
  }, [influencerId]);

  async function submit() {
    setErr(null);
    if (!influencerId || !concept.trim() || !amount || Number(amount) <= 0) {
      setErr("Completá creador, concepto y monto válido.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/aura/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          influencerId,
          concept,
          amount: Number(amount),
          dealId: dealId || null,
          campaignId: campaignId || null,
          periodStart: periodStart || null,
          periodEnd: periodEnd || null,
          notes: notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al crear");
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.8)" }}>
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden"
        style={{ background: "#0f0f1a", border: `1px solid ${THEME.borderStrong}` }}
      >
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: THEME.border }}>
          <div>
            <div className="text-[10px] font-mono tracking-widest uppercase mb-1" style={{ color: THEME.purple }}>
              Nuevo pago
            </div>
            <h2 className="text-lg font-semibold">Registrar pago</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5">
            <X size={16} style={{ color: THEME.textSecondary }} />
          </button>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <Field label="Creador *">
            <select
              value={influencerId}
              onChange={(e) => setInfluencerId(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg outline-none"
              style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
            >
              <option value="">Seleccionar...</option>
              {influencers.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} (@{i.code})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Concepto *" hint="Ej: Comisión marzo, Reel Día del Niño, Fee campaña Q1...">
            <input
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="Comisión marzo 2026"
              className="w-full px-3 py-2 text-sm rounded-lg outline-none"
              style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Monto (ARS) *">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="50000"
                className="w-full px-3 py-2 text-sm rounded-lg outline-none"
                style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
              />
            </Field>
            <Field label="Deal (opcional)">
              <select
                value={dealId}
                onChange={(e) => setDealId(e.target.value)}
                disabled={!influencerId}
                className="w-full px-3 py-2 text-sm rounded-lg outline-none disabled:opacity-50"
                style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
              >
                <option value="">— Sin deal asociado —</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.type})
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Campaña (opcional)">
            <select
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              disabled={!influencerId}
              className="w-full px-3 py-2 text-sm rounded-lg outline-none disabled:opacity-50"
              style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
            >
              <option value="">—</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Periodo desde">
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg outline-none"
                style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
              />
            </Field>
            <Field label="Periodo hasta">
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg outline-none"
                style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
              />
            </Field>
          </div>

          <Field label="Notas (interno)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm rounded-lg outline-none resize-none"
              style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
            />
          </Field>

          {err && <div className="text-xs" style={{ color: THEME.rose }}>{err}</div>}
        </div>
        <div className="flex items-center justify-end gap-2 p-4 border-t" style={{ borderColor: THEME.border }}>
          <button
            onClick={onClose}
            className="px-3 py-2 text-xs font-medium rounded-lg"
            style={{ background: THEME.bgCard, color: THEME.textSecondary }}
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-4 py-2 text-xs font-semibold rounded-lg disabled:opacity-50"
            style={{ background: THEME.gradient, color: "#fff" }}
          >
            {saving ? "Creando..." : "Crear payout"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Mark paid modal ──────────────────────────────────────────
function MarkPaidModal({
  payout,
  onClose,
  onDone,
}: {
  payout: Payout;
  onClose: () => void;
  onDone: () => void;
}) {
  const [method, setMethod] = useState<string>("TRANSFER");
  const [reference, setReference] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [paidAt, setPaidAt] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/aura/payouts/${payout.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "PAID",
          method,
          reference: reference || null,
          proofUrl: proofUrl || null,
          paidAt: paidAt ? new Date(paidAt).toISOString() : null,
          notes: notes || null,
        }),
      });
      onDone();
    } finally {
      setSaving(false);
    }
  }

  const methods = [
    { v: "TRANSFER", l: "Transferencia" },
    { v: "CASH", l: "Efectivo" },
    { v: "MERCADOPAGO", l: "MercadoPago" },
    { v: "CRYPTO", l: "Crypto" },
    { v: "PRODUCT", l: "Producto (gifting)" },
    { v: "OTHER", l: "Otro" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.8)" }}>
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: "#0f0f1a", border: `1px solid ${THEME.borderStrong}` }}
      >
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: THEME.border }}>
          <div>
            <div className="text-[10px] font-mono tracking-widest uppercase mb-1" style={{ color: THEME.green }}>
              Marcar como pagado
            </div>
            <h2 className="text-lg font-semibold">
              {fmtAR(Number(payout.amount))} → {payout.influencer.name}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: THEME.textMuted }}>
              {payout.concept}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5">
            <X size={16} style={{ color: THEME.textSecondary }} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <Field label="Método de pago">
            <div className="grid grid-cols-3 gap-2">
              {methods.map((m) => (
                <button
                  key={m.v}
                  onClick={() => setMethod(m.v)}
                  className="px-2 py-2 text-xs rounded-lg transition-all"
                  style={{
                    background: method === m.v ? "rgba(74,222,128,0.14)" : THEME.bgCard,
                    border: `1px solid ${method === m.v ? THEME.green + "55" : THEME.border}`,
                    color: method === m.v ? THEME.green : THEME.textSecondary,
                  }}
                >
                  {m.l}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Referencia (opcional)" hint="Nro de transferencia, ID MP, etc.">
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Ej: Transf MP #12345"
              className="w-full px-3 py-2 text-sm rounded-lg outline-none"
              style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
            />
          </Field>
          <Field label="Fecha del pago">
            <input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg outline-none"
              style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
            />
          </Field>
          <Field label="Comprobante (opcional)" hint="URL de imagen/PDF del comprobante. No es obligatorio.">
            <input
              value={proofUrl}
              onChange={(e) => setProofUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 text-sm rounded-lg outline-none"
              style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
            />
          </Field>
          <Field label="Notas (opcional)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm rounded-lg outline-none resize-none"
              style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
            />
          </Field>
        </div>
        <div className="flex items-center justify-end gap-2 p-4 border-t" style={{ borderColor: THEME.border }}>
          <button
            onClick={onClose}
            className="px-3 py-2 text-xs font-medium rounded-lg"
            style={{ background: THEME.bgCard, color: THEME.textSecondary }}
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 text-xs font-semibold rounded-lg disabled:opacity-50 flex items-center gap-1.5"
            style={{ background: "rgba(74,222,128,0.18)", color: THEME.green, border: `1px solid ${THEME.green}55` }}
          >
            <Check size={14} />
            {saving ? "Guardando..." : "Confirmar pago"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AutoGenerateModal ────────────────────────────────────────
function AutoGenerateModal({ onClose, onGenerated }: { onClose: () => void; onGenerated: () => void }) {
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  firstOfMonth.setHours(0, 0, 0, 0);
  const endOfMonth = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() + 1, 0, 23, 59, 59);

  const [periodStart, setPeriodStart] = useState(firstOfMonth.toISOString().slice(0, 10));
  const [periodEnd, setPeriodEnd] = useState(endOfMonth.toISOString().slice(0, 10));
  const [preview, setPreview] = useState<any[] | null>(null);
  const [totalAmount, setTotalAmount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [committing, setCommitting] = useState(false);

  async function runPreview() {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/aura/payouts/auto-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodStart: new Date(periodStart).toISOString(),
          periodEnd: new Date(periodEnd + "T23:59:59").toISOString(),
          dryRun: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Error en preview");
        return;
      }
      setPreview(data.results || []);
      setTotalAmount(data.results.filter((r: any) => !r.skipped).reduce((s: number, r: any) => s + r.amount, 0));
    } finally {
      setLoading(false);
    }
  }

  async function commit() {
    setCommitting(true);
    setErr("");
    try {
      const res = await fetch("/api/aura/payouts/auto-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodStart: new Date(periodStart).toISOString(),
          periodEnd: new Date(periodEnd + "T23:59:59").toISOString(),
          dryRun: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Error al generar");
        return;
      }
      onGenerated();
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
        style={{ background: "#12121c", border: `1px solid ${THEME.borderStrong}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={14} style={{ color: THEME.purple }} />
              <span className="text-[11px] uppercase tracking-wider" style={{ color: THEME.textTertiary }}>
                Auto-generar payouts
              </span>
            </div>
            <h3 className="text-xl font-semibold tracking-tight">Calcular comisiones del período</h3>
            <p className="text-xs mt-1" style={{ color: THEME.textSecondary }}>
              Procesa todos los deals activos y genera payouts pendientes según las ventas atribuidas.
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10">
            <X size={18} style={{ color: THEME.textSecondary }} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <Field label="Desde">
            <input
              type="date"
              value={periodStart}
              onChange={(e) => {
                setPeriodStart(e.target.value);
                setPreview(null);
              }}
              className="w-full px-3 py-2 rounded-xl outline-none text-sm"
              style={{ background: THEME.bgSoft, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
            />
          </Field>
          <Field label="Hasta">
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => {
                setPeriodEnd(e.target.value);
                setPreview(null);
              }}
              className="w-full px-3 py-2 rounded-xl outline-none text-sm"
              style={{ background: THEME.bgSoft, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
            />
          </Field>
        </div>

        {!preview && (
          <button
            onClick={runPreview}
            disabled={loading}
            className="w-full px-4 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50"
            style={{ background: THEME.gradient }}
          >
            {loading ? "Calculando..." : "Ver preview"}
          </button>
        )}

        {preview && (
          <>
            <div
              className="rounded-xl p-4 mb-3"
              style={{ background: "rgba(168, 85, 247, 0.08)", border: `1px solid rgba(168, 85, 247, 0.2)` }}
            >
              <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: THEME.textTertiary }}>
                Total a generar
              </div>
              <div className="text-2xl font-bold tabular-nums">{fmtAR(totalAmount)}</div>
              <div className="text-xs mt-1" style={{ color: THEME.textSecondary }}>
                {preview.filter((r) => !r.skipped).length} payout(s) pendiente(s) ·{" "}
                {preview.filter((r) => r.skipped).length} omitidos
              </div>
            </div>

            <div
              className="rounded-xl max-h-80 overflow-y-auto mb-3"
              style={{ background: THEME.bgSoft, border: `1px solid ${THEME.border}` }}
            >
              {preview.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-4 py-3"
                  style={{ borderBottom: i === preview.length - 1 ? "none" : `1px solid ${THEME.border}` }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.influencer}</div>
                    <div className="text-[11px] truncate" style={{ color: THEME.textSecondary }}>
                      {r.dealName} · {r.type}
                    </div>
                    {r.skipped && (
                      <div className="text-[10px] mt-0.5" style={{ color: THEME.textMuted }}>
                        {r.skipped}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {r.skipped ? (
                      <span className="text-xs" style={{ color: THEME.textMuted }}>
                        —
                      </span>
                    ) : (
                      <span className="text-sm font-semibold tabular-nums" style={{ color: THEME.cyan }}>
                        {fmtAR(r.amount)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {err && <p className="text-xs mb-3" style={{ color: "#f87171" }}>{err}</p>}

            <div className="flex gap-2">
              <button
                onClick={() => setPreview(null)}
                className="px-4 py-2.5 rounded-xl text-sm"
                style={{ background: THEME.bgSoft, border: `1px solid ${THEME.border}`, color: THEME.textSecondary }}
              >
                Cambiar período
              </button>
              <button
                onClick={commit}
                disabled={committing || preview.filter((r) => !r.skipped).length === 0}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                style={{ background: THEME.gradient }}
              >
                {committing
                  ? "Generando..."
                  : `Generar ${preview.filter((r) => !r.skipped).length} payout(s) pendiente(s)`}
              </button>
            </div>
          </>
        )}

        {err && !preview && <p className="text-xs mt-3" style={{ color: "#f87171" }}>{err}</p>}
      </div>
    </div>
  );
}

// ─── Field ────────────────────────────────────────────────────
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium mb-1.5" style={{ color: THEME.textSecondary }}>
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-[10px] mt-1" style={{ color: THEME.textMuted }}>
          {hint}
        </p>
      )}
    </div>
  );
}
