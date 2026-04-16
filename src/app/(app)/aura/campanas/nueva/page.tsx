"use client";

// ═══════════════════════════════════════════════════════════════
// Aura — Nueva campaña (con deal integrado)
// ───────────────────────────────────────────────────────────────
// Formulario para crear una InfluencerCampaign + InfluencerDeal.
// Toda campaña tiene un deal que define cómo se compensa al creador.
// Theme: Dark · Creator Gradient
// ═══════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Target,
  Gift,
  Users,
  Check,
  Rocket,
  AlertCircle,
  Search,
  Percent,
  DollarSign,
  Trophy,
  Eye,
  Shuffle,
  Layers,
  Info,
} from "lucide-react";
import { Suspense } from "react";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";

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
  gold: "#ff0080",
  goldSoft: "rgba(255, 0, 128, 0.10)",
  goldBorder: "rgba(255, 0, 128, 0.28)",
  rose: "#ff6b8a",
  roseSoft: "rgba(255, 107, 138, 0.10)",
  roseBorder: "rgba(255, 107, 138, 0.28)",
  amber: "#f59e0b",
  amberSoft: "rgba(245, 158, 11, 0.10)",
  amberBorder: "rgba(245, 158, 11, 0.28)",
  gradient: "linear-gradient(135deg, #ff0080 0%, #7928ca 50%, #00d4ff 100%)",
  gradientText: "linear-gradient(90deg, #ff0080 0%, #a855f7 50%, #00d4ff 100%)",
};

type Creator = {
  id: string;
  name: string;
  code: string;
  avatarUrl: string | null;
  status: string;
  commissionPercent: number;
};

const DEAL_TYPES: Array<{
  value: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
}> = [
  { value: "COMMISSION", label: "Comisión %", desc: "Porcentaje sobre ventas atribuidas por UTM", icon: <Percent size={14} strokeWidth={2.2} /> },
  { value: "FLAT_FEE", label: "Monto fijo", desc: "Pago fijo por pieza / mes / campaña", icon: <DollarSign size={14} strokeWidth={2.2} /> },
  { value: "PERFORMANCE_BONUS", label: "Bono por objetivo", desc: "Bono al alcanzar meta de revenue / órdenes", icon: <Trophy size={14} strokeWidth={2.2} /> },
  { value: "TIERED_COMMISSION", label: "Tramos escalonados", desc: "Comisión que sube por volumen de ventas", icon: <Layers size={14} strokeWidth={2.2} /> },
  { value: "CPM", label: "CPM", desc: "Pago por cada 1.000 views / impresiones", icon: <Eye size={14} strokeWidth={2.2} /> },
  { value: "GIFTING", label: "Gifting", desc: "Compensación en producto (sin cash)", icon: <Gift size={14} strokeWidth={2.2} /> },
  { value: "HYBRID", label: "Híbrido", desc: "Combiná varios modelos en un solo deal", icon: <Shuffle size={14} strokeWidth={2.2} /> },
];

const COMMISSION_TYPES = ["COMMISSION", "TIERED_COMMISSION", "HYBRID"];

function Avatar({ name, url, size = 28 }: { name: string; url: string | null; size?: number }) {
  const initials = name.split(" ").slice(0, 2).map((w) => w[0]).filter(Boolean).join("").toUpperCase();
  if (url) {
    return <img src={url} alt={name} width={size} height={size} className="rounded-full object-cover flex-shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <div className="rounded-full flex items-center justify-center font-semibold flex-shrink-0" style={{ width: size, height: size, background: THEME.goldSoft, color: THEME.gold, fontSize: size * 0.38, border: `1px solid ${THEME.goldBorder}` }}>
      {initials}
    </div>
  );
}

function Field({ label, children, hint, required }: { label: string; children: React.ReactNode; hint?: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-[12px] tracking-tight font-medium mb-1.5" style={{ color: THEME.textSecondary }}>
        {label}
        {required ? <span style={{ color: THEME.gold }}> *</span> : null}
      </label>
      {children}
      {hint ? <div className="text-[11px] tracking-tight mt-1" style={{ color: THEME.textTertiary }}>{hint}</div> : null}
    </div>
  );
}

const INPUT_STYLE = {
  background: THEME.bgCard,
  border: `1px solid ${THEME.border}`,
  color: THEME.textPrimary,
};

function NuevaCampanaInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedCreatorId = searchParams.get("creatorId");

  const [creators, setCreators] = useState<Creator[]>([]);
  const [loadingCreators, setLoadingCreators] = useState(true);
  const [creatorQ, setCreatorQ] = useState("");
  const [selectedCreator, setSelectedCreator] = useState<Creator | null>(null);
  const [showCreatorList, setShowCreatorList] = useState(false);

  // Campaign fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [bonusTarget, setBonusTarget] = useState("");
  const [bonusAmount, setBonusAmount] = useState("");

  // Deal fields
  const [dealType, setDealType] = useState<string>("");
  const [dealName, setDealName] = useState("");
  const [commissionPercent, setCommissionPercent] = useState("");
  const [flatAmount, setFlatAmount] = useState("");
  const [flatUnit, setFlatUnit] = useState("CAMPAIGN");
  const [dealBonusAmount, setDealBonusAmount] = useState("");
  const [dealBonusMetric, setDealBonusMetric] = useState("REVENUE");
  const [dealBonusTarget, setDealBonusTarget] = useState("");
  const [cpmRate, setCpmRate] = useState("");
  const [productValue, setProductValue] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [tiers, setTiers] = useState<Array<{ min: string; max: string; pct: string }>>([{ min: "0", max: "", pct: "" }]);
  const [dealNotes, setDealNotes] = useState("");
  const [excludeFromCommission, setExcludeFromCommission] = useState(false);

  // State
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commissionConflict, setCommissionConflict] = useState(false);

  // Check if this creator already has active commission deal
  useEffect(() => {
    if (!selectedCreator || !dealType) { setCommissionConflict(false); return; }
    if (!COMMISSION_TYPES.includes(dealType)) { setCommissionConflict(false); return; }
    // Quick check via deals list API
    fetch(`/api/aura/deals/list?influencerId=${selectedCreator.id}&status=ACTIVE`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        const deals = data.deals || [];
        const hasCommission = deals.some((d: any) => COMMISSION_TYPES.includes(d.type) && d.status === "ACTIVE");
        setCommissionConflict(hasCommission);
      })
      .catch(() => setCommissionConflict(false));
  }, [selectedCreator, dealType]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/aura/creators/simple", { cache: "no-store" });
        if (!res.ok) throw new Error("No se pudieron cargar los creadores");
        const data = await res.json();
        const rows = data.rows || [];
        setCreators(rows);
        // Auto-select if preselected
        if (preselectedCreatorId) {
          const found = rows.find((c: Creator) => c.id === preselectedCreatorId);
          if (found) setSelectedCreator(found);
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoadingCreators(false);
      }
    }
    load();
  }, [preselectedCreatorId]);

  const filteredCreators = useMemo(() => {
    const q = creatorQ.trim().toLowerCase();
    if (!q) return creators;
    return creators.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q));
  }, [creators, creatorQ]);

  const needs = (t: string) => dealType === t || dealType === "HYBRID";

  const canSubmit = name.trim().length > 0 && !!selectedCreator && !!startDate && !!dealType && !submitting && !commissionConflict;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !selectedCreator) return;
    setSubmitting(true);
    setError(null);
    try {
      const deal: any = {
        type: dealType,
        name: dealName.trim() || undefined,
        notes: dealNotes.trim() || undefined,
        excludeFromCommission,
      };
      if (needs("COMMISSION") && commissionPercent) deal.commissionPercent = Number(commissionPercent);
      if (needs("FLAT_FEE")) { if (flatAmount) deal.flatAmount = Number(flatAmount); deal.flatUnit = flatUnit; }
      if (needs("PERFORMANCE_BONUS")) {
        if (dealBonusAmount) deal.bonusAmount = Number(dealBonusAmount);
        deal.bonusMetric = dealBonusMetric;
        if (dealBonusTarget) deal.bonusTarget = Number(dealBonusTarget);
      }
      if (needs("CPM") && cpmRate) deal.cpmRate = Number(cpmRate);
      if (needs("GIFTING")) {
        if (productValue) deal.productValue = Number(productValue);
        if (productDescription.trim()) deal.productDescription = productDescription.trim();
      }
      if (dealType === "TIERED_COMMISSION") {
        deal.tiers = tiers.filter((t) => t.pct).map((t) => ({ min: Number(t.min) || 0, max: Number(t.max) || null, pct: Number(t.pct) }));
      }

      const res = await fetch("/api/aura/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          influencerId: selectedCreator.id,
          startDate,
          endDate: endDate || null,
          bonusTarget: bonusTarget || null,
          bonusAmount: bonusAmount || null,
          deal,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "No se pudo crear la campaña");
      }
      router.push(`/aura/campanas/${data.campaign.id}`);
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  // Whether to show "exclude from commission" toggle
  const showExcludeToggle = selectedCreator && dealType && !COMMISSION_TYPES.includes(dealType);

  return (
    <div className="min-h-screen" style={{ background: THEME.bgPage }}>
      <style jsx>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.6); cursor: pointer; }
      `}</style>

      <div className="max-w-[780px] mx-auto px-6 md:px-10 py-8 md:py-10">
        <Link href="/aura/campanas" className="inline-flex items-center gap-1.5 text-[12.5px] tracking-tight mb-5" style={{ color: THEME.textSecondary }}>
          <ArrowLeft size={14} strokeWidth={2.2} />
          Campañas
        </Link>

        <header className="mb-8">
          <div className="text-[11px] tracking-[0.18em] uppercase font-medium mb-2" style={{ color: THEME.textMuted }}>
            Aura · Nueva campaña
          </div>
          <h1 className="text-[30px] font-semibold tracking-tight leading-none" style={{ background: THEME.gradientText, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
            Armá una campaña
          </h1>
          <p className="mt-2 text-[14px] tracking-tight" style={{ color: THEME.textSecondary }}>
            Definí las condiciones del acuerdo y cómo le vas a pagar al creador.
          </p>
        </header>

        {error ? (
          <div className="p-3 rounded-xl text-[12.5px] mb-5 flex items-start gap-2" style={{ background: THEME.roseSoft, border: `1px solid ${THEME.roseBorder}`, color: THEME.rose }}>
            <AlertCircle size={14} strokeWidth={2.2} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="rounded-2xl p-6 space-y-5" style={{ background: THEME.bgCard, border: `1px solid ${THEME.border}`, animation: `fadeIn 420ms ${ES}` }}>

          {/* ── Nombre ── */}
          <Field label="Nombre de la campaña" required hint="Ej: Día del Niño · Sofía M. · Lanzamiento verano">
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Día del Niño · Agosto 2026" className="w-full px-3 py-2.5 rounded-lg outline-none text-[13.5px] tracking-tight" style={INPUT_STYLE} maxLength={120} />
          </Field>

          {/* ── Creador selector ── */}
          <Field label="Creador" required>
            {selectedCreator ? (
              <div className="flex items-center gap-3 p-2.5 rounded-lg" style={{ background: THEME.goldSoft, border: `1px solid ${THEME.goldBorder}` }}>
                <Avatar name={selectedCreator.name} url={selectedCreator.avatarUrl} size={32} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold truncate" style={{ color: THEME.textPrimary }}>{selectedCreator.name}</div>
                  <div className="text-[11px] tracking-tight font-mono" style={{ color: THEME.textSecondary }}>{selectedCreator.code}</div>
                </div>
                <button type="button" onClick={() => { setSelectedCreator(null); setShowCreatorList(true); }} className="text-[11.5px] tracking-tight px-2.5 py-1 rounded-md" style={{ color: THEME.gold, background: "rgba(255, 0, 128, 0.12)" }}>
                  Cambiar
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg mb-2" style={INPUT_STYLE}>
                  <Search size={14} strokeWidth={2.2} color={THEME.textTertiary} />
                  <input type="text" value={creatorQ} onChange={(e) => { setCreatorQ(e.target.value); setShowCreatorList(true); }} onFocus={() => setShowCreatorList(true)} placeholder={loadingCreators ? "Cargando creadores..." : "Buscar creador por nombre o código..."} className="flex-1 bg-transparent outline-none text-[13px] tracking-tight" style={{ color: THEME.textPrimary }} disabled={loadingCreators} />
                </div>
                {showCreatorList && !loadingCreators ? (
                  <div className="rounded-lg max-h-[280px] overflow-y-auto" style={{ background: THEME.bgSoft, border: `1px solid ${THEME.border}` }}>
                    {filteredCreators.length === 0 ? (
                      <div className="p-4 text-center text-[12.5px]" style={{ color: THEME.textTertiary }}>No hay creadores que coincidan</div>
                    ) : (
                      filteredCreators.map((c) => (
                        <button key={c.id} type="button" onClick={() => { setSelectedCreator(c); setShowCreatorList(false); setCreatorQ(""); }} className="w-full flex items-center gap-3 p-2.5 transition-colors text-left hover:bg-white/5" style={{ borderBottom: `1px solid ${THEME.border}` }}>
                          <Avatar name={c.name} url={c.avatarUrl} size={28} />
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-medium truncate" style={{ color: THEME.textPrimary }}>{c.name}</div>
                            <div className="text-[10.5px] tracking-tight font-mono" style={{ color: THEME.textTertiary }}>{c.code}</div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </>
            )}
          </Field>

          {/* ── Descripción ── */}
          <Field label="Descripción" hint="Objetivo de la campaña, producto destacado, restricciones, etc.">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Ej: Promocionar la nueva línea de juguetes didácticos con foco en kids 4-8 años." className="w-full px-3 py-2.5 rounded-lg outline-none text-[13px] tracking-tight resize-none" style={INPUT_STYLE} />
          </Field>

          {/* ── Fechas ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Fecha de inicio" required>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-3 py-2.5 rounded-lg outline-none text-[13px]" style={INPUT_STYLE} />
            </Field>
            <Field label="Fecha de fin" hint="Vacío = campaña abierta">
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate} className="w-full px-3 py-2.5 rounded-lg outline-none text-[13px]" style={INPUT_STYLE} />
            </Field>
          </div>

          {/* ══════════════════════════════════════════════════════════
              DEAL TYPE — ¿Cómo le vas a pagar?
              ══════════════════════════════════════════════════════════ */}
          <div className="rounded-xl p-4 mt-2" style={{ background: THEME.bgSoft, border: `1px solid ${THEME.borderStrong}` }}>
            <div className="flex items-center gap-2 mb-3">
              <DollarSign size={14} color={THEME.gold} strokeWidth={2.2} />
              <span className="text-[13px] font-semibold tracking-tight" style={{ color: THEME.textPrimary }}>
                ¿Cómo le vas a pagar al creador? *
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
              {DEAL_TYPES.map((dt) => {
                const sel = dealType === dt.value;
                return (
                  <button key={dt.value} type="button" onClick={() => setDealType(dt.value)} className="text-left rounded-xl px-3 py-2.5 transition-all" style={{ background: sel ? THEME.goldSoft : "transparent", border: `1px solid ${sel ? THEME.goldBorder : THEME.border}`, color: sel ? THEME.gold : THEME.textPrimary }}>
                    <div className="flex items-center gap-1.5 text-[12px] font-semibold tracking-tight">{dt.icon} {dt.label}</div>
                    <div className="text-[10.5px] tracking-tight mt-0.5" style={{ color: sel ? THEME.gold : THEME.textTertiary }}>{dt.desc}</div>
                  </button>
                );
              })}
            </div>

            {/* Commission conflict warning */}
            {commissionConflict ? (
              <div className="p-3 rounded-xl text-[12px] mb-4 flex items-start gap-2" style={{ background: THEME.amberSoft, border: `1px solid ${THEME.amberBorder}`, color: THEME.amber }}>
                <AlertCircle size={14} strokeWidth={2.2} className="mt-0.5 flex-shrink-0" />
                <span>Este creador ya tiene un deal de comisión activo. No se puede tener dos comisiones activas a la vez (mismo UTM = atribución ambigua). Desactivá el existente o elegí otro tipo de compensación.</span>
              </div>
            ) : null}

            {/* Dynamic fields based on deal type */}
            {dealType ? (
              <div className="space-y-4 mt-3 pt-3" style={{ borderTop: `1px dashed ${THEME.border}` }}>

                <Field label="Nombre del deal" hint="Opcional — se genera automáticamente si lo dejás vacío">
                  <input type="text" value={dealName} onChange={(e) => setDealName(e.target.value)} placeholder={`Ej: ${name || "Campaña"} · ${selectedCreator?.name || "Creador"}`} className="w-full px-3 py-2 rounded-lg outline-none text-[13px] tracking-tight" style={INPUT_STYLE} />
                </Field>

                {needs("COMMISSION") ? (
                  <Field label="Comisión sobre ventas (%)" required>
                    <input type="number" step="0.5" min="0" max="100" value={commissionPercent} onChange={(e) => setCommissionPercent(e.target.value)} placeholder="10" className="w-full px-3 py-2 rounded-lg outline-none text-[13px] tabular-nums" style={INPUT_STYLE} />
                  </Field>
                ) : null}

                {needs("FLAT_FEE") ? (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Monto fijo ($)" required>
                      <input type="number" min="0" value={flatAmount} onChange={(e) => setFlatAmount(e.target.value)} placeholder="50000" className="w-full px-3 py-2 rounded-lg outline-none text-[13px] tabular-nums" style={INPUT_STYLE} />
                    </Field>
                    <Field label="Unidad">
                      <select value={flatUnit} onChange={(e) => setFlatUnit(e.target.value)} className="w-full px-3 py-2 rounded-lg outline-none text-[13px]" style={INPUT_STYLE}>
                        <option value="CAMPAIGN">Por campaña</option>
                        <option value="REEL">Por Reel</option>
                        <option value="POST">Por Post</option>
                        <option value="STORY">Por Story</option>
                        <option value="UGC">Por UGC</option>
                      </select>
                    </Field>
                  </div>
                ) : null}

                {needs("PERFORMANCE_BONUS") ? (
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Métrica">
                      <select value={dealBonusMetric} onChange={(e) => setDealBonusMetric(e.target.value)} className="w-full px-3 py-2 rounded-lg outline-none text-[13px]" style={INPUT_STYLE}>
                        <option value="REVENUE">Revenue</option>
                        <option value="ORDERS">Órdenes</option>
                        <option value="VIEWS">Views</option>
                        <option value="ENGAGEMENT">Engagement</option>
                      </select>
                    </Field>
                    <Field label="Target" required>
                      <input type="number" min="0" value={dealBonusTarget} onChange={(e) => setDealBonusTarget(e.target.value)} placeholder="500000" className="w-full px-3 py-2 rounded-lg outline-none text-[13px] tabular-nums" style={INPUT_STYLE} />
                    </Field>
                    <Field label="Bono ($)" required>
                      <input type="number" min="0" value={dealBonusAmount} onChange={(e) => setDealBonusAmount(e.target.value)} placeholder="50000" className="w-full px-3 py-2 rounded-lg outline-none text-[13px] tabular-nums" style={INPUT_STYLE} />
                    </Field>
                  </div>
                ) : null}

                {dealType === "TIERED_COMMISSION" ? (
                  <div>
                    <label className="block text-[12px] tracking-tight font-medium mb-2" style={{ color: THEME.textSecondary }}>
                      Tramos de comisión
                    </label>
                    <div className="space-y-2">
                      {tiers.map((tier, i) => (
                        <div key={i} className="grid grid-cols-3 gap-2">
                          <input type="number" min="0" value={tier.min} onChange={(e) => { const t = [...tiers]; t[i].min = e.target.value; setTiers(t); }} placeholder="Desde $" className="px-3 py-2 rounded-lg outline-none text-[12px] tabular-nums" style={INPUT_STYLE} />
                          <input type="number" min="0" value={tier.max} onChange={(e) => { const t = [...tiers]; t[i].max = e.target.value; setTiers(t); }} placeholder="Hasta $ (vacío=∞)" className="px-3 py-2 rounded-lg outline-none text-[12px] tabular-nums" style={INPUT_STYLE} />
                          <input type="number" min="0" max="100" step="0.5" value={tier.pct} onChange={(e) => { const t = [...tiers]; t[i].pct = e.target.value; setTiers(t); }} placeholder="% comisión" className="px-3 py-2 rounded-lg outline-none text-[12px] tabular-nums" style={INPUT_STYLE} />
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={() => setTiers([...tiers, { min: tiers.length > 0 ? tiers[tiers.length - 1].max || "" : "", max: "", pct: "" }])} className="mt-2 text-[11.5px] tracking-tight px-3 py-1.5 rounded-lg" style={{ color: THEME.gold, background: THEME.goldSoft, border: `1px solid ${THEME.goldBorder}` }}>
                      + Agregar tramo
                    </button>
                  </div>
                ) : null}

                {needs("CPM") ? (
                  <Field label="Tarifa CPM ($)" hint="Pago por cada 1.000 views / impresiones" required>
                    <input type="number" min="0" value={cpmRate} onChange={(e) => setCpmRate(e.target.value)} placeholder="1500" className="w-full px-3 py-2 rounded-lg outline-none text-[13px] tabular-nums" style={INPUT_STYLE} />
                  </Field>
                ) : null}

                {needs("GIFTING") ? (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Valor del producto ($)">
                      <input type="number" min="0" value={productValue} onChange={(e) => setProductValue(e.target.value)} placeholder="25000" className="w-full px-3 py-2 rounded-lg outline-none text-[13px] tabular-nums" style={INPUT_STYLE} />
                    </Field>
                    <Field label="Producto">
                      <input type="text" value={productDescription} onChange={(e) => setProductDescription(e.target.value)} placeholder="Ej: Kit juguetes didácticos" className="w-full px-3 py-2 rounded-lg outline-none text-[13px]" style={INPUT_STYLE} />
                    </Field>
                  </div>
                ) : null}

                {/* Exclude from commission toggle */}
                {showExcludeToggle ? (
                  <div className="flex items-start gap-3 p-3 rounded-xl" style={{ background: "rgba(245, 158, 11, 0.05)", border: `1px solid ${THEME.amberBorder}` }}>
                    <input type="checkbox" checked={excludeFromCommission} onChange={(e) => setExcludeFromCommission(e.target.checked)} className="mt-0.5 accent-amber-500" />
                    <div>
                      <div className="text-[12.5px] font-medium tracking-tight" style={{ color: THEME.textPrimary }}>
                        Excluir ventas de la comisión UTM
                      </div>
                      <div className="text-[11px] tracking-tight mt-0.5" style={{ color: THEME.textTertiary }}>
                        Si este creador tiene comisión por UTM, las ventas de esta campaña no sumarán a esa comisión. Evita pagar doble.
                      </div>
                    </div>
                  </div>
                ) : null}

                <Field label="Notas internas" hint="Visible solo para tu equipo">
                  <textarea value={dealNotes} onChange={(e) => setDealNotes(e.target.value)} rows={2} placeholder="Ej: Acordado por WhatsApp el 15/04. Primer mes de prueba." className="w-full px-3 py-2 rounded-lg outline-none text-[12.5px] tracking-tight resize-none" style={INPUT_STYLE} />
                </Field>
              </div>
            ) : null}
          </div>

          {/* ── Bono por objetivo (campaña) ── */}
          <div className="rounded-xl p-4" style={{ background: THEME.bgSoft, border: `1px dashed ${THEME.border}` }}>
            <div className="flex items-center gap-2 mb-3">
              <Gift size={14} color={THEME.gold} strokeWidth={2.2} />
              <span className="text-[12px] font-semibold tracking-tight" style={{ color: THEME.textPrimary }}>
                Bono de campaña (opcional)
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Target de revenue" hint="Revenue que debe alcanzar para desbloquear el bono">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] pointer-events-none" style={{ color: THEME.textTertiary }}>$</span>
                  <input type="number" value={bonusTarget} onChange={(e) => setBonusTarget(e.target.value)} placeholder="500000" min="0" step="1000" className="w-full pl-7 pr-3 py-2.5 rounded-lg outline-none text-[13px] tabular-nums" style={INPUT_STYLE} />
                </div>
              </Field>
              <Field label="Monto del bono" hint="Se paga al alcanzar el target">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] pointer-events-none" style={{ color: THEME.textTertiary }}>$</span>
                  <input type="number" value={bonusAmount} onChange={(e) => setBonusAmount(e.target.value)} placeholder="50000" min="0" step="1000" className="w-full pl-7 pr-3 py-2.5 rounded-lg outline-none text-[13px] tabular-nums" style={INPUT_STYLE} />
                </div>
              </Field>
            </div>
          </div>

          {/* ── Actions ── */}
          <div className="flex items-center justify-end gap-3 pt-4" style={{ borderTop: `1px solid ${THEME.border}` }}>
            <Link href="/aura/campanas" className="px-4 py-2.5 rounded-xl text-[13px] font-medium tracking-tight" style={{ background: THEME.bgSoft, border: `1px solid ${THEME.border}`, color: THEME.textSecondary }}>
              Cancelar
            </Link>
            <button type="submit" disabled={!canSubmit} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold tracking-tight transition-all disabled:opacity-50 disabled:cursor-not-allowed" style={{ background: THEME.gradient, color: "#fff" }}>
              {submitting ? <>Creando...</> : <><Rocket size={14} strokeWidth={2.4} />Lanzar campaña</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function NuevaCampanaPage() {
  return (
    <Suspense>
      <NuevaCampanaInner />
    </Suspense>
  );
}
