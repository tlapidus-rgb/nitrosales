"use client";

// ═══════════════════════════════════════════════════════════════
// Aura — Deals (Acuerdos de Compensación)
// ───────────────────────────────────────────────────────────────
// Listado + creación de deals. 7 modelos: COMMISSION, FLAT_FEE,
// PERFORMANCE_BONUS, TIERED_COMMISSION, CPM, GIFTING, HYBRID.
// Cada influencer puede tener múltiples deals (uno por campaña o general).
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import {
  Handshake,
  Plus,
  Search,
  X,
  Sparkles,
  Percent,
  DollarSign,
  Trophy,
  Layers,
  Eye,
  Gift,
  Shuffle,
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
  gradient: "linear-gradient(135deg, #ff0080 0%, #7928ca 50%, #00d4ff 100%)",
  gradientText: "linear-gradient(90deg, #ff0080 0%, #a855f7 50%, #00d4ff 100%)",
};

const DEAL_TYPES = [
  { value: "COMMISSION", label: "Comisión %", icon: Percent, desc: "Porcentaje sobre ventas atribuidas" },
  { value: "FLAT_FEE", label: "Monto fijo", icon: DollarSign, desc: "Pago fijo por publicación/mes/campaña" },
  { value: "PERFORMANCE_BONUS", label: "Bono por objetivo", icon: Trophy, desc: "Bono al alcanzar una meta de ventas" },
  { value: "TIERED_COMMISSION", label: "Comisión escalonada", icon: Layers, desc: "Distintos % según nivel de ventas" },
  { value: "CPM", label: "CPM", icon: Eye, desc: "Pago por cada 1000 impresiones/views" },
  { value: "GIFTING", label: "Gifting", icon: Gift, desc: "Compensación en producto" },
  { value: "HYBRID", label: "Híbrido", icon: Shuffle, desc: "Combinación de varios modelos" },
];

type Influencer = { id: string; name: string; code: string; profileImage?: string | null };
type Campaign = { id: string; name: string };
type Deal = {
  id: string;
  name: string;
  type: string;
  status: string;
  currency: string;
  commissionPercent?: number | null;
  flatAmount?: number | null;
  flatUnit?: string | null;
  bonusAmount?: number | null;
  bonusMetric?: string | null;
  bonusTarget?: number | null;
  cpmRate?: number | null;
  productValue?: number | null;
  productDescription?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
  createdAt: string;
  influencer: Influencer;
  campaign: Campaign | null;
  _count?: { payouts: number };
};

const fmtAR = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);

export default function DealsPage() {
  const [items, setItems] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (typeFilter) params.set("type", typeFilter);
      const res = await fetch(`/api/aura/deals/list?${params.toString()}`);
      const data = await res.json();
      setItems(data.items || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter]);

  const filtered = items.filter((d) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      d.name.toLowerCase().includes(s) ||
      d.influencer.name.toLowerCase().includes(s) ||
      d.influencer.code.toLowerCase().includes(s) ||
      (d.campaign?.name.toLowerCase().includes(s) ?? false)
    );
  });

  const totals = {
    active: items.filter((d) => d.status === "ACTIVE").length,
    byType: DEAL_TYPES.map((t) => ({ ...t, count: items.filter((d) => d.type === t.value).length })),
  };

  return (
    <div className="min-h-screen px-6 py-8" style={{ background: THEME.bgPage, color: THEME.textPrimary }}>
      {/* Aurora radial accent */}
      <div
        className="pointer-events-none fixed inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(60% 40% at 20% 0%, rgba(255,0,128,0.10), transparent), radial-gradient(50% 40% at 80% 10%, rgba(0,212,255,0.08), transparent)",
        }}
      />
      <div className="relative max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={14} style={{ color: THEME.pink }} />
              <span className="text-[11px] uppercase tracking-[0.2em]" style={{ color: THEME.textTertiary }}>
                Aura · Compensación
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight tabular-nums">Deals</h1>
            <p className="text-sm mt-1" style={{ color: THEME.textSecondary }}>
              Acuerdos de compensación con tus creadores. Múltiples modelos disponibles.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-all hover:brightness-110"
            style={{ background: THEME.gradient, transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }}
          >
            <Plus size={16} />
            Nuevo deal
          </button>
        </div>

        {/* Type cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          {totals.byType.map((t) => {
            const Icon = t.icon;
            const active = typeFilter === t.value;
            return (
              <button
                key={t.value}
                onClick={() => setTypeFilter(active ? "" : t.value)}
                className="text-left p-3 rounded-2xl transition-all hover:scale-[1.02]"
                style={{
                  background: active ? "rgba(168, 85, 247, 0.12)" : THEME.bgCard,
                  border: `1px solid ${active ? "rgba(168, 85, 247, 0.35)" : THEME.border}`,
                  transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              >
                <Icon size={16} style={{ color: active ? THEME.purple : THEME.textTertiary }} className="mb-2" />
                <div className="text-[11px] uppercase tracking-wider" style={{ color: THEME.textTertiary }}>
                  {t.label}
                </div>
                <div className="text-lg font-semibold tabular-nums mt-0.5">{t.count}</div>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl mb-4"
          style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}` }}
        >
          <Search size={16} style={{ color: THEME.textTertiary }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por deal, creador, campaña..."
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: THEME.textPrimary }}
          />
        </div>

        {/* List */}
        <div className="rounded-2xl overflow-hidden" style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}` }}>
          {loading ? (
            <div className="p-12 text-center text-sm" style={{ color: THEME.textSecondary }}>
              Cargando deals...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <Handshake size={32} style={{ color: THEME.textMuted }} className="mx-auto mb-3" />
              <p className="text-sm" style={{ color: THEME.textSecondary }}>
                {q || typeFilter ? "No hay deals que coincidan con el filtro" : "Todavía no hay deals creados"}
              </p>
              <button
                onClick={() => setShowCreate(true)}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white"
                style={{ background: THEME.gradient }}
              >
                <Plus size={14} />
                Crear el primero
              </button>
            </div>
          ) : (
            <div>
              {filtered.map((d, i) => (
                <DealRow key={d.id} deal={d} last={i === filtered.length - 1} />
              ))}
            </div>
          )}
        </div>
      </div>

      {showCreate && <CreateDealModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />}
    </div>
  );
}

function DealRow({ deal, last }: { deal: Deal; last: boolean }) {
  const typeMeta = DEAL_TYPES.find((t) => t.value === deal.type);
  const Icon = typeMeta?.icon || Handshake;

  const primary = (() => {
    switch (deal.type) {
      case "COMMISSION":
        return deal.commissionPercent != null ? `${deal.commissionPercent}%` : "—";
      case "FLAT_FEE":
        return deal.flatAmount != null ? `${fmtAR(deal.flatAmount)}${deal.flatUnit ? ` / ${deal.flatUnit.toLowerCase()}` : ""}` : "—";
      case "PERFORMANCE_BONUS":
        return deal.bonusAmount != null ? `${fmtAR(deal.bonusAmount)} @ ${deal.bonusTarget ? fmtAR(deal.bonusTarget) : "—"}` : "—";
      case "CPM":
        return deal.cpmRate != null ? `${fmtAR(deal.cpmRate)} CPM` : "—";
      case "GIFTING":
        return deal.productValue != null ? fmtAR(deal.productValue) : (deal.productDescription || "—");
      case "TIERED_COMMISSION":
        return "Escalonado";
      case "HYBRID":
        return "Híbrido";
      default:
        return "—";
    }
  })();

  return (
    <div
      className="flex items-center gap-4 px-5 py-4"
      style={{ borderBottom: last ? "none" : `1px solid ${THEME.border}` }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: "rgba(168, 85, 247, 0.12)", border: "1px solid rgba(168, 85, 247, 0.2)" }}
      >
        <Icon size={16} style={{ color: THEME.purple }} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{deal.name}</span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider"
            style={{ background: "rgba(255,255,255,0.06)", color: THEME.textTertiary }}
          >
            {typeMeta?.label || deal.type}
          </span>
        </div>
        <div className="text-xs mt-0.5 truncate" style={{ color: THEME.textSecondary }}>
          {deal.influencer.name} · {deal.influencer.code}
          {deal.campaign && <span> · {deal.campaign.name}</span>}
        </div>
      </div>

      <div className="text-right shrink-0">
        <div className="text-sm font-semibold tabular-nums" style={{ color: THEME.cyan }}>
          {primary}
        </div>
        {deal._count && (
          <div className="text-[10px]" style={{ color: THEME.textMuted }}>
            {deal._count.payouts} payout{deal._count.payouts === 1 ? "" : "s"}
          </div>
        )}
      </div>

      <div
        className="text-[10px] px-2 py-0.5 rounded-full shrink-0"
        style={{
          background: deal.status === "ACTIVE" ? "rgba(74, 222, 128, 0.12)" : "rgba(255,255,255,0.06)",
          color: deal.status === "ACTIVE" ? "#4ade80" : THEME.textTertiary,
        }}
      >
        {deal.status}
      </div>
    </div>
  );
}

function CreateDealModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState<"type" | "details">("type");
  const [type, setType] = useState<string>("");
  const [name, setName] = useState("");
  const [influencerId, setInfluencerId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [commissionPercent, setCommissionPercent] = useState("");
  const [flatAmount, setFlatAmount] = useState("");
  const [flatUnit, setFlatUnit] = useState("MONTH");
  const [bonusAmount, setBonusAmount] = useState("");
  const [bonusTarget, setBonusTarget] = useState("");
  const [bonusMetric, setBonusMetric] = useState("REVENUE");
  const [cpmRate, setCpmRate] = useState("");
  const [productValue, setProductValue] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  useEffect(() => {
    fetch("/api/aura/creators/simple")
      .then((r) => r.json())
      .then((d) =>
        setInfluencers(
          (d.rows || []).map((r: any) => ({
            id: r.id,
            name: r.name,
            code: r.code,
            profileImage: r.avatarUrl || null,
          })),
        ),
      )
      .catch(() => {});
    fetch("/api/aura/campaigns/list")
      .then((r) => r.json())
      .then((d) => setCampaigns((d.rows || d.items || []).map((c: any) => ({ id: c.id, name: c.name }))))
      .catch(() => {});
  }, []);

  async function submit() {
    if (!name || !type || !influencerId) {
      setErr("Completá nombre, tipo e influencer");
      return;
    }
    setSubmitting(true);
    setErr("");
    try {
      const body: any = {
        name,
        type,
        influencerId,
        campaignId: campaignId || null,
        notes: notes || null,
      };
      if (type === "COMMISSION" && commissionPercent) body.commissionPercent = Number(commissionPercent);
      if (type === "FLAT_FEE") {
        if (flatAmount) body.flatAmount = Number(flatAmount);
        if (flatUnit) body.flatUnit = flatUnit;
      }
      if (type === "PERFORMANCE_BONUS") {
        if (bonusAmount) body.bonusAmount = Number(bonusAmount);
        if (bonusTarget) body.bonusTarget = Number(bonusTarget);
        if (bonusMetric) body.bonusMetric = bonusMetric;
      }
      if (type === "CPM" && cpmRate) body.cpmRate = Number(cpmRate);
      if (type === "GIFTING") {
        if (productValue) body.productValue = Number(productValue);
        if (productDescription) body.productDescription = productDescription;
      }
      if (type === "HYBRID") {
        if (commissionPercent) body.commissionPercent = Number(commissionPercent);
        if (flatAmount) body.flatAmount = Number(flatAmount);
        if (bonusAmount) body.bonusAmount = Number(bonusAmount);
        if (bonusTarget) body.bonusTarget = Number(bonusTarget);
      }
      const res = await fetch("/api/aura/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Error al crear el deal");
        return;
      }
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
        style={{ background: "#12121c", border: `1px solid ${THEME.borderStrong}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-xl font-semibold tracking-tight">Nuevo deal</h3>
            <p className="text-xs mt-0.5" style={{ color: THEME.textSecondary }}>
              {step === "type" ? "Elegí el modelo de compensación" : "Completá los detalles del acuerdo"}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10">
            <X size={18} style={{ color: THEME.textSecondary }} />
          </button>
        </div>

        {step === "type" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {DEAL_TYPES.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.value}
                  onClick={() => {
                    setType(t.value);
                    setStep("details");
                  }}
                  className="text-left p-4 rounded-xl transition-all hover:scale-[1.02]"
                  style={{
                    background: THEME.bgSoft,
                    border: `1px solid ${THEME.border}`,
                    transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
                  }}
                >
                  <Icon size={18} style={{ color: THEME.purple }} className="mb-2" />
                  <div className="text-sm font-medium">{t.label}</div>
                  <div className="text-xs mt-1" style={{ color: THEME.textSecondary }}>
                    {t.desc}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-4">
            <button
              onClick={() => setStep("type")}
              className="text-xs"
              style={{ color: THEME.textTertiary }}
            >
              ← Cambiar tipo ({DEAL_TYPES.find((t) => t.value === type)?.label})
            </button>

            <Field label="Nombre del deal *">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Comisión mensual Juan — Campaña verano"
                className="w-full px-3 py-2 rounded-xl outline-none text-sm"
                style={{ background: THEME.bgSoft, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
              />
            </Field>

            <Field label="Creador *">
              <select
                value={influencerId}
                onChange={(e) => setInfluencerId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl outline-none text-sm"
                style={{ background: THEME.bgSoft, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
              >
                <option value="">Seleccionar creador...</option>
                {influencers.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.code})
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Campaña (opcional)">
              <select
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl outline-none text-sm"
                style={{ background: THEME.bgSoft, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
              >
                <option value="">Sin campaña específica</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>

            {/* Type-specific */}
            {(type === "COMMISSION" || type === "HYBRID") && (
              <Field label="Comisión %">
                <input
                  type="number"
                  value={commissionPercent}
                  onChange={(e) => setCommissionPercent(e.target.value)}
                  placeholder="10"
                  className="w-full px-3 py-2 rounded-xl outline-none text-sm"
                  style={{ background: THEME.bgSoft, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
                />
              </Field>
            )}
            {(type === "FLAT_FEE" || type === "HYBRID") && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Monto fijo (ARS)">
                  <input
                    type="number"
                    value={flatAmount}
                    onChange={(e) => setFlatAmount(e.target.value)}
                    placeholder="150000"
                    className="w-full px-3 py-2 rounded-xl outline-none text-sm"
                    style={{ background: THEME.bgSoft, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
                  />
                </Field>
                <Field label="Por">
                  <select
                    value={flatUnit}
                    onChange={(e) => setFlatUnit(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl outline-none text-sm"
                    style={{ background: THEME.bgSoft, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
                  >
                    <option value="POST">Publicación</option>
                    <option value="MONTH">Mes</option>
                    <option value="CAMPAIGN">Campaña</option>
                  </select>
                </Field>
              </div>
            )}
            {(type === "PERFORMANCE_BONUS" || type === "HYBRID") && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Bono (ARS)">
                    <input
                      type="number"
                      value={bonusAmount}
                      onChange={(e) => setBonusAmount(e.target.value)}
                      placeholder="50000"
                      className="w-full px-3 py-2 rounded-xl outline-none text-sm"
                      style={{ background: THEME.bgSoft, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
                    />
                  </Field>
                  <Field label="Al alcanzar">
                    <input
                      type="number"
                      value={bonusTarget}
                      onChange={(e) => setBonusTarget(e.target.value)}
                      placeholder="500000"
                      className="w-full px-3 py-2 rounded-xl outline-none text-sm"
                      style={{ background: THEME.bgSoft, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
                    />
                  </Field>
                </div>
                <Field label="Métrica">
                  <select
                    value={bonusMetric}
                    onChange={(e) => setBonusMetric(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl outline-none text-sm"
                    style={{ background: THEME.bgSoft, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
                  >
                    <option value="REVENUE">Revenue generado</option>
                    <option value="ORDERS">Cantidad de órdenes</option>
                    <option value="VIEWS">Views/impresiones</option>
                  </select>
                </Field>
              </div>
            )}
            {type === "CPM" && (
              <Field label="CPM (ARS por 1000 views)">
                <input
                  type="number"
                  value={cpmRate}
                  onChange={(e) => setCpmRate(e.target.value)}
                  placeholder="2500"
                  className="w-full px-3 py-2 rounded-xl outline-none text-sm"
                  style={{ background: THEME.bgSoft, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
                />
              </Field>
            )}
            {type === "GIFTING" && (
              <div className="space-y-3">
                <Field label="Descripción del producto">
                  <input
                    value={productDescription}
                    onChange={(e) => setProductDescription(e.target.value)}
                    placeholder="Kit Paw Patrol + peluche"
                    className="w-full px-3 py-2 rounded-xl outline-none text-sm"
                    style={{ background: THEME.bgSoft, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
                  />
                </Field>
                <Field label="Valor estimado (ARS)">
                  <input
                    type="number"
                    value={productValue}
                    onChange={(e) => setProductValue(e.target.value)}
                    placeholder="30000"
                    className="w-full px-3 py-2 rounded-xl outline-none text-sm"
                    style={{ background: THEME.bgSoft, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
                  />
                </Field>
              </div>
            )}

            <Field label="Notas (opcional)">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Cualquier detalle extra sobre el acuerdo..."
                rows={2}
                className="w-full px-3 py-2 rounded-xl outline-none text-sm resize-none"
                style={{ background: THEME.bgSoft, border: `1px solid ${THEME.border}`, color: THEME.textPrimary }}
              />
            </Field>

            {err && <p className="text-xs" style={{ color: "#f87171" }}>{err}</p>}

            <div className="flex gap-2 pt-2">
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-sm"
                style={{ background: THEME.bgSoft, border: `1px solid ${THEME.border}`, color: THEME.textSecondary }}
              >
                Cancelar
              </button>
              <button
                onClick={submit}
                disabled={submitting}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                style={{ background: THEME.gradient }}
              >
                {submitting ? "Creando..." : "Crear deal"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider mb-1.5" style={{ color: THEME.textTertiary }}>
        {label}
      </div>
      {children}
    </div>
  );
}
