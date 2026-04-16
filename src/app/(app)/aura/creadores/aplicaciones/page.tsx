"use client";

// ══════════════════════════════════════════════════════════════
// Aura — Pipeline de aplicaciones
// ══════════════════════════════════════════════════════════════
// Pantalla /aura/creadores/aplicaciones — kanban de aplicaciones
// (PENDING / APPROVED / REJECTED). Tema CLARO.
// Aprobar → crea un Influencer automáticamente.
// ══════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Instagram,
  Music2,
  Youtube,
  Check,
  X,
  Clock,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Users,
  Inbox,
  Percent,
  DollarSign,
  Trophy,
  Eye,
  Gift,
  Shuffle,
  Layers,
  Sparkles,
} from "lucide-react";

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
  green: "#4ade80",
  greenSoft: "rgba(74, 222, 128, 0.10)",
  greenBorder: "rgba(74, 222, 128, 0.28)",
  rose: "#ff6b8a",
  roseSoft: "rgba(255, 107, 138, 0.10)",
  roseBorder: "rgba(255, 107, 138, 0.28)",
  gray: "#9ca3af",
  graySoft: "rgba(156, 163, 175, 0.08)",
  grayBorder: "rgba(156, 163, 175, 0.22)",
  gradient: "linear-gradient(135deg, #ff0080 0%, #7928ca 50%, #00d4ff 100%)",
  gradientText: "linear-gradient(90deg, #ff0080, #00d4ff)",
};

type Application = {
  id: string;
  name: string;
  email: string;
  instagram: string | null;
  tiktok: string | null;
  youtube: string | null;
  followers: string | null;
  message: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  notes: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

type Groups = {
  PENDING: Application[];
  APPROVED: Application[];
  REJECTED: Application[];
};

function fmtRelative(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (d === 0) return "hoy";
  if (d === 1) return "ayer";
  if (d < 30) return `hace ${d} días`;
  const m = Math.floor(d / 30);
  return `hace ${m} mes${m === 1 ? "" : "es"}`;
}

export default function AplicacionesPage() {
  const [groups, setGroups] = useState<Groups>({ PENDING: [], APPROVED: [], REJECTED: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [approvalApp, setApprovalApp] = useState<Application | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await fetch("/api/aura/applications/list", { cache: "no-store" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Error");
      setGroups(data.groups);
    } catch (e: any) {
      setError(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const decide = async (id: string, status: "APPROVED" | "REJECTED" | "PENDING") => {
    setActingId(id);
    try {
      const r = await fetch(`/api/aura/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.error || "Error");
      }
      await load();
    } catch (e: any) {
      alert(e?.message || "Error");
    } finally {
      setActingId(null);
    }
  };

  const approveWithDeal = async (appId: string, deal: any) => {
    setActingId(appId);
    try {
      const r = await fetch(`/api/aura/applications/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "APPROVED", deal }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Error");
      setApprovalApp(null);
      setToast("Postulación aprobada. Deal registrado.");
      await load();
    } catch (e: any) {
      alert(e?.message || "Error");
    } finally {
      setActingId(null);
    }
  };

  return (
    <div
      className="min-h-screen"
      style={{
        background: THEME.bgPage,
        color: THEME.textPrimary,
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Inter, sans-serif",
      }}
    >
      <style>{`
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="max-w-[1400px] mx-auto px-8 py-8">
        <Link
          href="/aura/creadores"
          className="inline-flex items-center gap-1.5 text-[12.5px] tracking-tight mb-5"
          style={{ color: THEME.textSecondary }}
        >
          <ArrowLeft size={14} strokeWidth={2.2} />
          Creadores
        </Link>

        <header className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div
              className="text-[11px] tracking-[0.18em] uppercase font-medium mb-2"
              style={{ color: THEME.textMuted }}
            >
              Aura · Pipeline
            </div>
            <h1
              className="text-[32px] font-semibold tracking-tight leading-none"
              style={{
                background: "linear-gradient(90deg, #ff0080 0%, #a855f7 50%, #00d4ff 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Aplicaciones
            </h1>
            <p className="mt-2 text-[13.5px] tracking-tight" style={{ color: THEME.textSecondary }}>
              {groups.PENDING.length > 0
                ? `${groups.PENDING.length} ${groups.PENDING.length === 1 ? "aplicación pendiente" : "aplicaciones pendientes"} de revisar`
                : "Todas las aplicaciones están revisadas"}
            </p>
          </div>
        </header>

        {error ? (
          <div
            className="rounded-2xl p-4 text-center"
            style={{ background: THEME.roseSoft, border: `1px solid ${THEME.roseBorder}`, color: THEME.rose }}
          >
            {error}
          </div>
        ) : loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl animate-pulse"
                style={{
                  background: THEME.bgCard,
                  border: `1px solid ${THEME.border}`,
                  height: 300,
                }}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KanbanColumn
              title="Pendientes"
              subtitle="Requieren tu decisión"
              count={groups.PENDING.length}
              tone="gold"
              icon={<Clock size={14} strokeWidth={2.2} />}
            >
              {groups.PENDING.length === 0 ? (
                <ColumnEmpty message="No hay aplicaciones pendientes" />
              ) : (
                groups.PENDING.map((a, i) => (
                  <ApplicationCard
                    key={a.id}
                    app={a}
                    delay={i * 40}
                    acting={actingId === a.id}
                    onApprove={() => setApprovalApp(a)}
                    onReject={() => decide(a.id, "REJECTED")}
                  />
                ))
              )}
            </KanbanColumn>

            <KanbanColumn
              title="Aprobadas"
              subtitle="Ya son creadores activos"
              count={groups.APPROVED.length}
              tone="green"
              icon={<CheckCircle2 size={14} strokeWidth={2.2} />}
            >
              {groups.APPROVED.length === 0 ? (
                <ColumnEmpty message="Aún no hay aprobadas" />
              ) : (
                groups.APPROVED.map((a, i) => (
                  <ApplicationCard key={a.id} app={a} delay={i * 40} acting={false} />
                ))
              )}
            </KanbanColumn>

            <KanbanColumn
              title="Rechazadas"
              subtitle="No encajaron con el programa"
              count={groups.REJECTED.length}
              tone="gray"
              icon={<XCircle size={14} strokeWidth={2.2} />}
            >
              {groups.REJECTED.length === 0 ? (
                <ColumnEmpty message="Ninguna rechazada aún" />
              ) : (
                groups.REJECTED.map((a, i) => (
                  <ApplicationCard
                    key={a.id}
                    app={a}
                    delay={i * 40}
                    acting={actingId === a.id}
                    onReopen={() => decide(a.id, "PENDING")}
                  />
                ))
              )}
            </KanbanColumn>
          </div>
        )}
      </div>

      {approvalApp ? (
        <ApprovalModal
          app={approvalApp}
          busy={actingId === approvalApp.id}
          onClose={() => setApprovalApp(null)}
          onSubmit={(deal) => approveWithDeal(approvalApp.id, deal)}
        />
      ) : null}

      {toast ? (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-xl text-[12.5px] font-medium tracking-tight"
          style={{
            background: "rgba(20, 20, 28, 0.95)",
            border: `1px solid ${THEME.greenBorder}`,
            color: THEME.green,
            backdropFilter: "blur(12px)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
          }}
        >
          <div className="inline-flex items-center gap-2">
            <CheckCircle2 size={14} strokeWidth={2.4} />
            {toast}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────── KANBAN COLUMN ───────────────────
function KanbanColumn({
  title,
  subtitle,
  count,
  tone,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  count: number;
  tone: "gold" | "green" | "gray";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const toneColors =
    tone === "green"
      ? { c: THEME.green, bg: THEME.greenSoft, b: THEME.greenBorder }
      : tone === "gray"
        ? { c: THEME.gray, bg: THEME.graySoft, b: THEME.grayBorder }
        : { c: THEME.gold, bg: THEME.goldSoft, b: THEME.goldBorder };

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: THEME.bgCard,
        border: `1px solid ${THEME.border}`,
      }}
    >
      <div
        className="flex items-center justify-between pb-3 mb-3"
        style={{ borderBottom: `1px solid ${THEME.border}` }}
      >
        <div>
          <div className="flex items-center gap-2">
            <span style={{ color: toneColors.c }}>{icon}</span>
            <h3
              className="text-[14px] font-semibold tracking-tight"
              style={{ color: THEME.textPrimary }}
            >
              {title}
            </h3>
            <span
              className="inline-flex items-center justify-center min-w-[22px] h-[20px] px-1.5 rounded-full text-[10.5px] font-bold tabular-nums"
              style={{
                background: toneColors.bg,
                color: toneColors.c,
                border: `1px solid ${toneColors.b}`,
              }}
            >
              {count}
            </span>
          </div>
          <p
            className="text-[11px] tracking-tight mt-0.5"
            style={{ color: THEME.textTertiary }}
          >
            {subtitle}
          </p>
        </div>
      </div>
      <div className="space-y-2.5 max-h-[70vh] overflow-y-auto pr-1">
        {children}
      </div>
    </div>
  );
}

function ColumnEmpty({ message }: { message: string }) {
  return (
    <div
      className="rounded-xl p-6 text-center text-[12px] tracking-tight"
      style={{
        background: THEME.bgSoft,
        border: `1px dashed ${THEME.borderStrong}`,
        color: THEME.textTertiary,
      }}
    >
      {message}
    </div>
  );
}

// ─────────────────── APPLICATION CARD ───────────────────
function ApplicationCard({
  app,
  delay,
  acting,
  onApprove,
  onReject,
  onReopen,
}: {
  app: Application;
  delay: number;
  acting: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  onReopen?: () => void;
}) {
  const initials = app.name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div
      className="rounded-xl p-3.5"
      style={{
        background: THEME.bgSoft,
        border: `1px solid ${THEME.border}`,
        animation: `cardIn 480ms ${ES} ${delay}ms both`,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="rounded-full flex items-center justify-center font-bold flex-shrink-0"
          style={{
            width: 36,
            height: 36,
            fontSize: 13,
            background: "linear-gradient(135deg, #ff99c7 0%, #ff0080 100%)",
            color: "#FFF",
          }}
        >
          {initials || "?"}
        </div>
        <div className="min-w-0 flex-1">
          <h4
            className="text-[13.5px] font-semibold tracking-tight truncate"
            style={{ color: THEME.textPrimary }}
          >
            {app.name}
          </h4>
          <p
            className="text-[11.5px] tracking-tight truncate"
            style={{ color: THEME.textTertiary }}
          >
            {app.email}
          </p>
        </div>
      </div>

      {/* Redes */}
      <div className="mt-3 flex items-center gap-1.5 flex-wrap">
        {app.instagram ? (
          <SocialPill platform="instagram" handle={app.instagram} />
        ) : null}
        {app.tiktok ? <SocialPill platform="tiktok" handle={app.tiktok} /> : null}
        {app.youtube ? <SocialPill platform="youtube" handle={app.youtube} /> : null}
      </div>

      {app.followers ? (
        <div
          className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10.5px] font-medium"
          style={{
            background: THEME.bgCard,
            color: THEME.textSecondary,
            border: `1px solid ${THEME.border}`,
          }}
        >
          <Users size={10} strokeWidth={2.2} />
          {app.followers} seguidores
        </div>
      ) : null}

      {app.message ? (
        <p
          className="mt-2 text-[11.5px] tracking-tight line-clamp-3"
          style={{ color: THEME.textSecondary }}
        >
          "{app.message}"
        </p>
      ) : null}

      <div
        className="mt-2 text-[10.5px] tracking-tight"
        style={{ color: THEME.textMuted }}
      >
        {app.status === "PENDING"
          ? `Aplicó ${fmtRelative(app.createdAt)}`
          : `${app.status === "APPROVED" ? "Aprobado" : "Rechazado"} ${app.reviewedAt ? fmtRelative(app.reviewedAt) : ""}`}
      </div>

      {/* Acciones */}
      {app.status === "PENDING" && onApprove && onReject ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={onReject}
            disabled={acting}
            className="inline-flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11.5px] font-semibold tracking-tight transition"
            style={{
              background: THEME.bgCard,
              color: THEME.rose,
              border: `1px solid ${THEME.roseBorder}`,
              opacity: acting ? 0.5 : 1,
            }}
          >
            <X size={11} strokeWidth={2.4} />
            Rechazar
          </button>
          <button
            onClick={onApprove}
            disabled={acting}
            className="inline-flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11.5px] font-semibold tracking-tight transition"
            style={{
              background: THEME.green,
              color: "#FFF",
              opacity: acting ? 0.5 : 1,
            }}
          >
            <Check size={11} strokeWidth={2.8} />
            Aprobar
          </button>
        </div>
      ) : null}

      {app.status === "REJECTED" && onReopen ? (
        <button
          onClick={onReopen}
          disabled={acting}
          className="mt-3 w-full inline-flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11.5px] font-semibold tracking-tight transition"
          style={{
            background: THEME.bgCard,
            color: THEME.textPrimary,
            border: `1px solid ${THEME.border}`,
            opacity: acting ? 0.5 : 1,
          }}
        >
          Reabrir
        </button>
      ) : null}
    </div>
  );
}

function SocialPill({
  platform,
  handle,
}: {
  platform: "instagram" | "tiktok" | "youtube";
  handle: string;
}) {
  const cfg = {
    instagram: { icon: <Instagram size={10} strokeWidth={2.2} />, color: "#E1306C" },
    tiktok: { icon: <Music2 size={10} strokeWidth={2.2} />, color: "#00838F" },
    youtube: { icon: <Youtube size={10} strokeWidth={2.2} />, color: "#FF0000" },
  }[platform];

  const cleanHandle = handle.replace(/^@/, "").replace(/^https?:\/\/.*?\//, "");

  return (
    <a
      href={handle.startsWith("http") ? handle : `https://${platform}.com/${cleanHandle}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10.5px] font-medium tracking-tight transition"
      style={{
        background: THEME.bgCard,
        color: cfg.color,
        border: `1px solid ${THEME.border}`,
      }}
    >
      {cfg.icon}
      @{cleanHandle.slice(0, 20)}
    </a>
  );
}

// ─────────────────── APPROVAL MODAL ───────────────────
type DealType =
  | "COMMISSION"
  | "FLAT_FEE"
  | "PERFORMANCE_BONUS"
  | "CPM"
  | "GIFTING"
  | "HYBRID"
  | "TIERED_COMMISSION";

const DEAL_TYPE_META: Record<
  DealType,
  { label: string; Icon: any; hint: string; color: string }
> = {
  COMMISSION: {
    label: "Comisión %",
    Icon: Percent,
    hint: "Le pagás un % de las ventas que genere. Ideal para performance puro.",
    color: "#22d3ee",
  },
  FLAT_FEE: {
    label: "Fee fijo",
    Icon: DollarSign,
    hint: "Monto fijo por colaboración. Ideal para contenido sin exigir conversión.",
    color: "#60a5fa",
  },
  PERFORMANCE_BONUS: {
    label: "Bonus por objetivo",
    Icon: Trophy,
    hint: "Pagás si alcanza un target. Mezcla fee + incentivo.",
    color: "#facc15",
  },
  CPM: {
    label: "CPM",
    Icon: Eye,
    hint: "Pagás por cada 1.000 views. Ideal para creadores de alcance.",
    color: "#a78bfa",
  },
  GIFTING: {
    label: "Gifting",
    Icon: Gift,
    hint: "Sin pago en efectivo, solo producto. Ideal para nanos.",
    color: "#f472b6",
  },
  HYBRID: {
    label: "Híbrido",
    Icon: Shuffle,
    hint: "Combina fee fijo + comisión. Ideal para creadores top.",
    color: "#fb7185",
  },
  TIERED_COMMISSION: {
    label: "Comisión por tramos",
    Icon: Layers,
    hint: "Comisión que sube según el volumen vendido.",
    color: "#34d399",
  },
};

function ApprovalModal({
  app,
  busy,
  onClose,
  onSubmit,
}: {
  app: Application;
  busy: boolean;
  onClose: () => void;
  onSubmit: (deal: any) => void;
}) {
  const [type, setType] = useState<DealType | null>(null);
  // Campos
  const [commissionPercent, setCommissionPercent] = useState("");
  const [flatAmount, setFlatAmount] = useState("");
  const [flatUnit, setFlatUnit] = useState("PER_POST");
  const [bonusAmount, setBonusAmount] = useState("");
  const [bonusMetric, setBonusMetric] = useState("REVENUE");
  const [bonusTarget, setBonusTarget] = useState("");
  const [cpmRate, setCpmRate] = useState("");
  const [productValue, setProductValue] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [tier1Threshold, setTier1Threshold] = useState("");
  const [tier1Percent, setTier1Percent] = useState("");
  const [tier2Threshold, setTier2Threshold] = useState("");
  const [tier2Percent, setTier2Percent] = useState("");
  const [tier3Threshold, setTier3Threshold] = useState("");
  const [tier3Percent, setTier3Percent] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const canSubmit =
    type !== null &&
    (() => {
      if (type === "COMMISSION") return Boolean(commissionPercent);
      if (type === "FLAT_FEE") return Boolean(flatAmount);
      if (type === "PERFORMANCE_BONUS") return Boolean(bonusAmount && bonusTarget);
      if (type === "CPM") return Boolean(cpmRate);
      if (type === "GIFTING") return Boolean(productValue);
      if (type === "HYBRID") return Boolean(flatAmount || commissionPercent);
      if (type === "TIERED_COMMISSION") return Boolean(tier1Threshold && tier1Percent);
      return false;
    })();

  const handleSubmit = () => {
    if (!type) return;
    const base: any = {
      type,
      name: `Deal inicial · ${app.name}`,
      notes: notes.trim() || null,
      startDate: new Date().toISOString(),
    };
    if (type === "COMMISSION") base.commissionPercent = commissionPercent;
    if (type === "FLAT_FEE") {
      base.flatAmount = flatAmount;
      base.flatUnit = flatUnit;
    }
    if (type === "PERFORMANCE_BONUS") {
      base.bonusAmount = bonusAmount;
      base.bonusMetric = bonusMetric;
      base.bonusTarget = bonusTarget;
    }
    if (type === "CPM") base.cpmRate = cpmRate;
    if (type === "GIFTING") {
      base.productValue = productValue;
      base.productDescription = productDescription || null;
    }
    if (type === "HYBRID") {
      if (flatAmount) base.flatAmount = flatAmount;
      if (flatAmount) base.flatUnit = flatUnit;
      if (commissionPercent) base.commissionPercent = commissionPercent;
    }
    if (type === "TIERED_COMMISSION") {
      const tiers: any[] = [];
      if (tier1Threshold && tier1Percent)
        tiers.push({ threshold: Number(tier1Threshold), percent: Number(tier1Percent) });
      if (tier2Threshold && tier2Percent)
        tiers.push({ threshold: Number(tier2Threshold), percent: Number(tier2Percent) });
      if (tier3Threshold && tier3Percent)
        tiers.push({ threshold: Number(tier3Threshold), percent: Number(tier3Percent) });
      base.tiers = tiers;
    }
    try {
      onSubmit(base);
    } catch (e: any) {
      setErr(e?.message || "Error");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0, 0, 0, 0.72)", backdropFilter: "blur(8px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="rounded-2xl w-full max-w-[720px] max-h-[92vh] overflow-y-auto"
        style={{
          background: "#0e0e18",
          border: `1px solid ${THEME.borderStrong}`,
          boxShadow: "0 40px 120px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 px-6 py-4 flex items-start justify-between gap-3"
          style={{
            background: "rgba(14, 14, 24, 0.96)",
            borderBottom: `1px solid ${THEME.border}`,
            backdropFilter: "blur(8px)",
          }}
        >
          <div className="min-w-0">
            <div
              className="text-[10.5px] tracking-[0.18em] uppercase font-medium mb-1"
              style={{ color: THEME.textMuted }}
            >
              Aprobar postulación
            </div>
            <h2
              className="text-[18px] font-semibold tracking-tight truncate"
              style={{ color: THEME.textPrimary }}
            >
              {app.name}
            </h2>
            <p
              className="text-[12px] tracking-tight truncate"
              style={{ color: THEME.textTertiary }}
            >
              {app.email}
              {app.followers ? ` · ${app.followers} seguidores` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-shrink-0 p-1.5 rounded-lg transition"
            style={{
              background: THEME.bgCard,
              border: `1px solid ${THEME.border}`,
              color: THEME.textSecondary,
              opacity: busy ? 0.5 : 1,
            }}
            aria-label="Cerrar"
          >
            <X size={14} strokeWidth={2.2} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Redes sociales como referencia */}
          {app.instagram || app.tiktok || app.youtube ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              {app.instagram ? <SocialPill platform="instagram" handle={app.instagram} /> : null}
              {app.tiktok ? <SocialPill platform="tiktok" handle={app.tiktok} /> : null}
              {app.youtube ? <SocialPill platform="youtube" handle={app.youtube} /> : null}
            </div>
          ) : null}

          {/* Paso 1: ¿Cómo le vas a pagar? */}
          <div>
            <label
              className="block text-[13px] font-semibold tracking-tight mb-1.5"
              style={{ color: THEME.textPrimary }}
            >
              ¿Cómo le vas a pagar?
            </label>
            <p
              className="text-[11.5px] tracking-tight mb-3"
              style={{ color: THEME.textTertiary }}
            >
              Elegí el modelo de compensación que mejor encaje con este creador.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {(Object.keys(DEAL_TYPE_META) as DealType[]).map((k) => {
                const meta = DEAL_TYPE_META[k];
                const Icon = meta.Icon;
                const selected = type === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setType(k)}
                    className="text-left rounded-xl p-3 transition"
                    style={{
                      background: selected ? "rgba(255, 0, 128, 0.08)" : THEME.bgSoft,
                      border: selected
                        ? `1px solid ${THEME.goldBorder}`
                        : `1px solid ${THEME.border}`,
                    }}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span style={{ color: meta.color }}>
                        <Icon size={13} strokeWidth={2.2} />
                      </span>
                      <span
                        className="text-[12.5px] font-semibold tracking-tight"
                        style={{ color: THEME.textPrimary }}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <p
                      className="text-[10.5px] tracking-tight leading-snug"
                      style={{ color: THEME.textTertiary }}
                    >
                      {meta.hint}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Paso 2: campos dinámicos */}
          {type ? (
            <div
              className="rounded-xl p-4 space-y-3"
              style={{
                background: THEME.bgSoft,
                border: `1px solid ${THEME.border}`,
              }}
            >
              {type === "COMMISSION" ? (
                <Field label="Comisión (%)">
                  <NumInput value={commissionPercent} onChange={setCommissionPercent} placeholder="Ej: 10" />
                </Field>
              ) : null}

              {type === "FLAT_FEE" ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Monto (ARS)">
                    <NumInput value={flatAmount} onChange={setFlatAmount} placeholder="Ej: 50000" />
                  </Field>
                  <Field label="Frecuencia">
                    <Select
                      value={flatUnit}
                      onChange={setFlatUnit}
                      options={[
                        { v: "PER_POST", l: "Por post" },
                        { v: "PER_MONTH", l: "Por mes" },
                        { v: "PER_CAMPAIGN", l: "Por campaña" },
                      ]}
                    />
                  </Field>
                </div>
              ) : null}

              {type === "PERFORMANCE_BONUS" ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Bonus (ARS)">
                      <NumInput value={bonusAmount} onChange={setBonusAmount} placeholder="Ej: 100000" />
                    </Field>
                    <Field label="Métrica objetivo">
                      <Select
                        value={bonusMetric}
                        onChange={setBonusMetric}
                        options={[
                          { v: "REVENUE", l: "Ventas (ARS)" },
                          { v: "ORDERS", l: "Cantidad de ventas" },
                          { v: "VIEWS", l: "Views" },
                          { v: "FOLLOWERS", l: "Seguidores ganados" },
                        ]}
                      />
                    </Field>
                  </div>
                  <Field label="Target a alcanzar">
                    <NumInput value={bonusTarget} onChange={setBonusTarget} placeholder="Ej: 500000" />
                  </Field>
                </>
              ) : null}

              {type === "CPM" ? (
                <Field label="Tarifa CPM (ARS por 1.000 views)">
                  <NumInput value={cpmRate} onChange={setCpmRate} placeholder="Ej: 8000" />
                </Field>
              ) : null}

              {type === "GIFTING" ? (
                <>
                  <Field label="Valor del producto (ARS)">
                    <NumInput value={productValue} onChange={setProductValue} placeholder="Ej: 25000" />
                  </Field>
                  <Field label="Descripción del producto (opcional)">
                    <TextArea
                      value={productDescription}
                      onChange={setProductDescription}
                      placeholder="Ej: Set Barbie Dreamhouse edición limitada"
                      rows={2}
                    />
                  </Field>
                </>
              ) : null}

              {type === "HYBRID" ? (
                <>
                  <p className="text-[11px] tracking-tight" style={{ color: THEME.textTertiary }}>
                    Combinación de fee fijo + comisión. Podés cargar ambos o solo uno.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Fee fijo (ARS)">
                      <NumInput value={flatAmount} onChange={setFlatAmount} placeholder="Ej: 30000" />
                    </Field>
                    <Field label="Frecuencia del fee">
                      <Select
                        value={flatUnit}
                        onChange={setFlatUnit}
                        options={[
                          { v: "PER_POST", l: "Por post" },
                          { v: "PER_MONTH", l: "Por mes" },
                          { v: "PER_CAMPAIGN", l: "Por campaña" },
                        ]}
                      />
                    </Field>
                  </div>
                  <Field label="Comisión adicional (%)">
                    <NumInput
                      value={commissionPercent}
                      onChange={setCommissionPercent}
                      placeholder="Ej: 5"
                    />
                  </Field>
                </>
              ) : null}

              {type === "TIERED_COMMISSION" ? (
                <>
                  <p className="text-[11px] tracking-tight" style={{ color: THEME.textTertiary }}>
                    La comisión sube a medida que el creador genera más ventas. Cargá los tramos.
                  </p>
                  <TierRow
                    idx={1}
                    threshold={tier1Threshold}
                    percent={tier1Percent}
                    onThreshold={setTier1Threshold}
                    onPercent={setTier1Percent}
                  />
                  <TierRow
                    idx={2}
                    threshold={tier2Threshold}
                    percent={tier2Percent}
                    onThreshold={setTier2Threshold}
                    onPercent={setTier2Percent}
                  />
                  <TierRow
                    idx={3}
                    threshold={tier3Threshold}
                    percent={tier3Percent}
                    onThreshold={setTier3Threshold}
                    onPercent={setTier3Percent}
                  />
                </>
              ) : null}

              <Field label="Notas (opcional)">
                <TextArea
                  value={notes}
                  onChange={setNotes}
                  placeholder="Contexto adicional del acuerdo, exclusividad, entregables..."
                  rows={2}
                />
              </Field>
            </div>
          ) : null}

          {err ? (
            <div
              className="rounded-lg p-2.5 text-[12px] tracking-tight"
              style={{
                background: THEME.roseSoft,
                color: THEME.rose,
                border: `1px solid ${THEME.roseBorder}`,
              }}
            >
              {err}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div
          className="sticky bottom-0 px-6 py-4 flex items-center justify-between gap-3"
          style={{
            background: "rgba(14, 14, 24, 0.96)",
            borderTop: `1px solid ${THEME.border}`,
            backdropFilter: "blur(8px)",
          }}
        >
          <button
            onClick={onClose}
            disabled={busy}
            className="text-[12.5px] tracking-tight font-medium transition"
            style={{ color: THEME.textTertiary, opacity: busy ? 0.5 : 1 }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold tracking-tight transition"
            style={{
              background: canSubmit && !busy ? THEME.gradient : "rgba(255,255,255,0.08)",
              color: canSubmit && !busy ? "#fff" : THEME.textMuted,
              opacity: busy ? 0.6 : 1,
              cursor: canSubmit && !busy ? "pointer" : "not-allowed",
            }}
          >
            <Sparkles size={13} strokeWidth={2.4} />
            {busy ? "Aprobando..." : "Aprobar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── helpers del modal ───
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span
        className="block text-[11px] tracking-tight font-medium mb-1"
        style={{ color: THEME.textSecondary }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function NumInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg px-3 py-2 text-[13px] tracking-tight outline-none"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: `1px solid ${THEME.border}`,
        color: THEME.textPrimary,
      }}
    />
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 2,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full rounded-lg px-3 py-2 text-[13px] tracking-tight outline-none resize-none"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: `1px solid ${THEME.border}`,
        color: THEME.textPrimary,
      }}
    />
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { v: string; l: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg px-3 py-2 text-[13px] tracking-tight outline-none"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: `1px solid ${THEME.border}`,
        color: THEME.textPrimary,
      }}
    >
      {options.map((o) => (
        <option key={o.v} value={o.v} style={{ background: "#0e0e18" }}>
          {o.l}
        </option>
      ))}
    </select>
  );
}

function TierRow({
  idx,
  threshold,
  percent,
  onThreshold,
  onPercent,
}: {
  idx: number;
  threshold: string;
  percent: string;
  onThreshold: (v: string) => void;
  onPercent: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-[32px,1fr,1fr] gap-2 items-end">
      <div
        className="text-[11px] tracking-tight font-semibold pb-2"
        style={{ color: THEME.textTertiary }}
      >
        T{idx}
      </div>
      <Field label={`Desde ventas (ARS)`}>
        <NumInput value={threshold} onChange={onThreshold} placeholder={idx === 1 ? "Ej: 0" : "Ej: 500000"} />
      </Field>
      <Field label="Comisión (%)">
        <NumInput value={percent} onChange={onPercent} placeholder={`Ej: ${5 + idx * 2}`} />
      </Field>
    </div>
  );
}
