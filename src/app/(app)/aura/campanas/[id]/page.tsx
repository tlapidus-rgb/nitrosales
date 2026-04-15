"use client";

// ═══════════════════════════════════════════════════════════════
// Aura — Detalle de campaña
// ───────────────────────────────────────────────────────────────
// Pantalla completa de una campaña individual con:
//   - Header hero con gradient (nombre + status + creator)
//   - KPIs grandes (revenue, conversiones, comisión, bono)
//   - Barra de progreso gigante con target y tiempo
//   - Sparkline de revenue diario
//   - Lista de últimas atribuciones (ventas)
//   - Brief asociado
//   - Contenido publicado
//   - Acciones: pausar/activar/completar, editar, eliminar
//
// Theme: Dark · Creator Gradient
// ═══════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Target,
  Gift,
  Rocket,
  Trophy,
  AlertTriangle,
  Clock,
  Pause,
  Play,
  CheckCircle2,
  Pencil,
  Trash2,
  Instagram,
  Youtube,
  Music2,
  ExternalLink,
  TrendingUp,
  Hourglass,
  ShoppingBag,
  FileText,
  Flame,
  X,
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
  purple: "#a855f7",
  purpleSoft: "rgba(168, 85, 247, 0.10)",
  purpleBorder: "rgba(168, 85, 247, 0.28)",
  cyan: "#00d4ff",
  cyanSoft: "rgba(0, 212, 255, 0.10)",
  cyanBorder: "rgba(0, 212, 255, 0.28)",
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
  gradientText: "linear-gradient(90deg, #ff0080 0%, #a855f7 50%, #00d4ff 100%)",
};

type ProgressStatus =
  | "unlocked"
  | "ahead"
  | "on_track"
  | "behind"
  | "at_risk"
  | "no_target"
  | "no_time_limit";

type CampaignDetail = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  startDate: string;
  endDate: string | null;
  bonusTarget: number | null;
  bonusAmount: number | null;
  createdAt: string;
  revenue: number;
  commission: number;
  conversions: number;
  revenuePct: number | null;
  timePct: number | null;
  totalDays: number | null;
  daysElapsed: number;
  daysRemaining: number | null;
  progressStatus: ProgressStatus;
  creator: {
    id: string;
    name: string;
    code: string;
    email: string | null;
    avatarUrl: string | null;
    commissionPercent: number;
    status: string;
  } | null;
  briefings: {
    id: string;
    title: string;
    type: string;
    status: string;
    deadline: string | null;
    hashtags: string | null;
    createdAt: string;
  }[];
  recentAttributions: {
    id: string;
    attributedValue: number;
    commissionAmount: number;
    attributionSource: string;
    createdAt: string;
    order: {
      id: string;
      source: string;
      orderNumber: string | null;
    } | null;
  }[];
  submissions: {
    id: string;
    type: string;
    platform: string;
    contentUrl: string;
    thumbnailUrl: string | null;
    caption: string | null;
    status: string;
    publishedAt: string | null;
    metrics: any;
    createdAt: string;
  }[];
  series: { date: string; revenue: number; count: number }[];
};

function fmtARS(n: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);
}
function fmtARSCompact(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
  });
}
function fmtRelative(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (d === 0) return "hoy";
  if (d === 1) return "ayer";
  if (d < 30) return `hace ${d}d`;
  const m = Math.floor(d / 30);
  return `hace ${m}m`;
}

const PROGRESS_CONFIG: Record<
  ProgressStatus,
  { label: string; color: string; bg: string; border: string; icon: React.ReactNode }
> = {
  unlocked: {
    label: "Bono desbloqueado",
    color: THEME.green,
    bg: THEME.greenSoft,
    border: THEME.greenBorder,
    icon: <Trophy size={12} strokeWidth={2.4} />,
  },
  ahead: {
    label: "Adelante del ritmo",
    color: THEME.cyan,
    bg: THEME.cyanSoft,
    border: THEME.cyanBorder,
    icon: <Rocket size={12} strokeWidth={2.4} />,
  },
  on_track: {
    label: "En ritmo",
    color: THEME.purple,
    bg: THEME.purpleSoft,
    border: THEME.purpleBorder,
    icon: <TrendingUp size={12} strokeWidth={2.4} />,
  },
  behind: {
    label: "Atrás del ritmo",
    color: THEME.rose,
    bg: THEME.roseSoft,
    border: THEME.roseBorder,
    icon: <Hourglass size={12} strokeWidth={2.4} />,
  },
  at_risk: {
    label: "En riesgo",
    color: THEME.gold,
    bg: THEME.goldSoft,
    border: THEME.goldBorder,
    icon: <AlertTriangle size={12} strokeWidth={2.4} />,
  },
  no_target: {
    label: "Sin target",
    color: THEME.gray,
    bg: THEME.graySoft,
    border: THEME.grayBorder,
    icon: <Target size={12} strokeWidth={2.4} />,
  },
  no_time_limit: {
    label: "Sin fecha fin",
    color: THEME.gray,
    bg: THEME.graySoft,
    border: THEME.grayBorder,
    icon: <Clock size={12} strokeWidth={2.4} />,
  },
};

const STATUS_DB_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; border: string }
> = {
  ACTIVE: {
    label: "Activa",
    color: THEME.green,
    bg: THEME.greenSoft,
    border: THEME.greenBorder,
  },
  PAUSED: {
    label: "Pausada",
    color: THEME.gray,
    bg: THEME.graySoft,
    border: THEME.grayBorder,
  },
  COMPLETED: {
    label: "Completada",
    color: THEME.purple,
    bg: THEME.purpleSoft,
    border: THEME.purpleBorder,
  },
};

function Avatar({
  name,
  url,
  size = 48,
}: {
  name: string;
  url: string | null;
  size?: number;
}) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .filter(Boolean)
    .join("")
    .toUpperCase();
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover flex-shrink-0"
        style={{
          width: size,
          height: size,
          border: `2px solid ${THEME.borderStrong}`,
        }}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center font-semibold flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: THEME.goldSoft,
        color: THEME.gold,
        fontSize: size * 0.36,
        border: `2px solid ${THEME.goldBorder}`,
      }}
    >
      {initials}
    </div>
  );
}

function Sparkline({
  series,
  height = 60,
}: {
  series: { date: string; revenue: number }[];
  height?: number;
}) {
  if (!series.length) return null;
  const max = Math.max(...series.map((s) => s.revenue), 1);
  const w = 100;
  const h = height;
  const stepX = w / Math.max(1, series.length - 1);
  const points = series
    .map((s, i) => `${(i * stepX).toFixed(2)},${(h - (s.revenue / max) * h).toFixed(2)}`)
    .join(" ");
  const area = `M 0,${h} L ${points} L ${w},${h} Z`;
  return (
    <svg
      width="100%"
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ff0080" />
          <stop offset="50%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#00d4ff" />
        </linearGradient>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff0080" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#00d4ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sparkFill)" />
      <polyline
        points={points}
        fill="none"
        stroke="url(#sparkGrad)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function PlatformIcon({ p }: { p: string }) {
  const style = { color: THEME.textSecondary };
  if (p === "INSTAGRAM") return <Instagram size={12} style={style} strokeWidth={2.2} />;
  if (p === "TIKTOK") return <Music2 size={12} style={style} strokeWidth={2.2} />;
  if (p === "YOUTUBE") return <Youtube size={12} style={style} strokeWidth={2.2} />;
  return <ExternalLink size={12} style={style} strokeWidth={2.2} />;
}

export default function CampaignDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const [data, setData] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  async function load() {
    try {
      const res = await fetch(`/api/aura/campaigns/${params.id}`, {
        cache: "no-store",
      });
      if (res.status === 404) {
        setError("Campaña no encontrada");
        return;
      }
      if (!res.ok) throw new Error("Error al cargar la campaña");
      const d = await res.json();
      setData(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function updateStatus(newStatus: "ACTIVE" | "PAUSED" | "COMPLETED") {
    if (!data) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/aura/campaigns/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message || "No se pudo actualizar");
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete() {
    if (!data) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/aura/campaigns/${data.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message || "No se pudo eliminar");
      }
      router.push("/aura/campanas");
    } catch (e) {
      setError((e as Error).message);
      setActionLoading(false);
      setShowDelete(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: THEME.bgPage }}>
        <div className="max-w-[1120px] mx-auto px-6 md:px-10 py-8 md:py-10">
          <div
            className="h-[160px] rounded-2xl mb-4"
            style={{ background: THEME.bgSoft }}
          />
          <div
            className="grid grid-cols-4 gap-3 mb-4"
          >
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-[100px] rounded-2xl"
                style={{ background: THEME.bgSoft }}
              />
            ))}
          </div>
          <div
            className="h-[240px] rounded-2xl"
            style={{ background: THEME.bgSoft }}
          />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen" style={{ background: THEME.bgPage }}>
        <div className="max-w-[1120px] mx-auto px-6 md:px-10 py-10">
          <Link
            href="/aura/campanas"
            className="inline-flex items-center gap-1.5 text-[12.5px] mb-5"
            style={{ color: THEME.textSecondary }}
          >
            <ArrowLeft size={14} strokeWidth={2.2} />
            Campañas
          </Link>
          <div
            className="p-6 rounded-2xl"
            style={{
              background: THEME.roseSoft,
              border: `1px solid ${THEME.roseBorder}`,
              color: THEME.rose,
            }}
          >
            {error || "No se pudo cargar la campaña"}
          </div>
        </div>
      </div>
    );
  }

  const progressCfg = PROGRESS_CONFIG[data.progressStatus];
  const statusDbCfg = STATUS_DB_CONFIG[data.status] || STATUS_DB_CONFIG.ACTIVE;
  const urgent =
    data.daysRemaining !== null &&
    data.daysRemaining <= 7 &&
    data.status === "ACTIVE";

  return (
    <div className="min-h-screen" style={{ background: THEME.bgPage }}>
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      <div className="max-w-[1120px] mx-auto px-6 md:px-10 py-8 md:py-10">
        <Link
          href="/aura/campanas"
          className="inline-flex items-center gap-1.5 text-[12.5px] tracking-tight mb-5"
          style={{ color: THEME.textSecondary }}
        >
          <ArrowLeft size={14} strokeWidth={2.2} />
          Campañas
        </Link>

        {/* ─── HEADER HERO ─── */}
        <section
          className="rounded-2xl p-6 mb-5 relative overflow-hidden"
          style={{
            background: THEME.bgCard,
            border: `1px solid ${THEME.border}`,
            animation: `fadeIn 460ms ${ES}`,
          }}
        >
          {/* Halo decorativo */}
          <div
            aria-hidden
            className="absolute -top-24 -right-24 w-80 h-80 pointer-events-none"
            style={{
              background:
                "radial-gradient(circle at 30% 30%, rgba(255, 0, 128, 0.22) 0%, rgba(121, 40, 202, 0.12) 35%, transparent 70%)",
            }}
          />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span
                className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10.5px] font-semibold"
                style={{
                  color: statusDbCfg.color,
                  background: statusDbCfg.bg,
                  border: `1px solid ${statusDbCfg.border}`,
                }}
              >
                {statusDbCfg.label}
              </span>
              <span
                className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10.5px] font-semibold"
                style={{
                  color: progressCfg.color,
                  background: progressCfg.bg,
                  border: `1px solid ${progressCfg.border}`,
                }}
              >
                {progressCfg.icon}
                {progressCfg.label}
              </span>
              {urgent ? (
                <span
                  className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10.5px] font-semibold"
                  style={{
                    color: THEME.rose,
                    background: THEME.roseSoft,
                    border: `1px solid ${THEME.roseBorder}`,
                  }}
                >
                  <Flame size={10} strokeWidth={2.4} />
                  {data.daysRemaining}d restantes
                </span>
              ) : null}
            </div>

            <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
              <div className="flex-1 min-w-0">
                <h1
                  className="text-[26px] md:text-[30px] font-semibold tracking-tight leading-tight mb-1"
                  style={{
                    background: THEME.gradientText,
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  {data.name}
                </h1>
                {data.description ? (
                  <p
                    className="text-[13.5px] tracking-tight leading-relaxed max-w-2xl"
                    style={{ color: THEME.textSecondary }}
                  >
                    {data.description}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {data.status === "ACTIVE" ? (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => updateStatus("PAUSED")}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-[12.5px] font-medium tracking-tight disabled:opacity-50"
                    style={{
                      background: THEME.bgSoft,
                      border: `1px solid ${THEME.border}`,
                      color: THEME.textPrimary,
                    }}
                  >
                    <Pause size={13} strokeWidth={2.2} />
                    Pausar
                  </button>
                ) : data.status === "PAUSED" ? (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => updateStatus("ACTIVE")}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-[12.5px] font-medium tracking-tight disabled:opacity-50"
                    style={{
                      background: THEME.greenSoft,
                      border: `1px solid ${THEME.greenBorder}`,
                      color: THEME.green,
                    }}
                  >
                    <Play size={13} strokeWidth={2.2} />
                    Reactivar
                  </button>
                ) : null}

                {data.status !== "COMPLETED" ? (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => updateStatus("COMPLETED")}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-[12.5px] font-medium tracking-tight disabled:opacity-50"
                    style={{
                      background: THEME.purpleSoft,
                      border: `1px solid ${THEME.purpleBorder}`,
                      color: THEME.purple,
                    }}
                  >
                    <CheckCircle2 size={13} strokeWidth={2.2} />
                    Completar
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => setShowDelete(true)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-[12.5px] font-medium tracking-tight"
                  style={{
                    background: THEME.bgSoft,
                    border: `1px solid ${THEME.border}`,
                    color: THEME.textSecondary,
                  }}
                >
                  <Trash2 size={13} strokeWidth={2.2} />
                </button>
              </div>
            </div>

            {/* Creator + fechas */}
            <div
              className="flex items-center justify-between gap-4 flex-wrap pt-4"
              style={{ borderTop: `1px solid ${THEME.border}` }}
            >
              {data.creator ? (
                <Link
                  href={`/aura/creadores/${data.creator.id}`}
                  className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                >
                  <Avatar
                    name={data.creator.name}
                    url={data.creator.avatarUrl}
                    size={40}
                  />
                  <div>
                    <div
                      className="text-[13.5px] font-semibold tracking-tight"
                      style={{ color: THEME.textPrimary }}
                    >
                      {data.creator.name}
                    </div>
                    <div
                      className="text-[11px] tracking-tight font-mono"
                      style={{ color: THEME.textTertiary }}
                    >
                      {data.creator.code} · {data.creator.commissionPercent}% comisión
                    </div>
                  </div>
                </Link>
              ) : null}

              <div
                className="flex items-center gap-2 text-[11.5px] tracking-tight"
                style={{ color: THEME.textSecondary }}
              >
                <Calendar size={12} strokeWidth={2.2} />
                {fmtDate(data.startDate)}
                {data.endDate ? ` → ${fmtDate(data.endDate)}` : " · sin fin"}
              </div>
            </div>
          </div>
        </section>

        {/* ─── KPI ROW ─── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <KpiCell
            label="Revenue generado"
            value={fmtARSCompact(data.revenue)}
            sub={fmtARS(data.revenue)}
            accent={THEME.textPrimary}
            icon={<ShoppingBag size={13} strokeWidth={2.2} color={THEME.textTertiary} />}
          />
          <KpiCell
            label="Conversiones"
            value={String(data.conversions)}
            sub={`${data.conversions} ${data.conversions === 1 ? "orden" : "órdenes"}`}
            accent={THEME.textPrimary}
            icon={<Target size={13} strokeWidth={2.2} color={THEME.textTertiary} />}
          />
          <KpiCell
            label="Comisión"
            value={fmtARSCompact(data.commission)}
            sub={data.creator ? `${data.creator.commissionPercent}% por orden` : ""}
            accent={THEME.textPrimary}
            icon={<TrendingUp size={13} strokeWidth={2.2} color={THEME.textTertiary} />}
          />
          <KpiCell
            label={data.bonusTarget ? "Target" : "Bono"}
            value={
              data.bonusTarget
                ? fmtARSCompact(data.bonusTarget)
                : data.bonusAmount
                  ? fmtARSCompact(data.bonusAmount)
                  : "—"
            }
            sub={
              data.bonusTarget && data.bonusAmount
                ? `Bono ${fmtARSCompact(data.bonusAmount)}`
                : data.bonusAmount
                  ? "Sin target"
                  : "Sin bono"
            }
            accent={data.progressStatus === "unlocked" ? THEME.green : THEME.textPrimary}
            icon={<Gift size={13} strokeWidth={2.2} color={THEME.textTertiary} />}
          />
        </div>

        {/* ─── PROGRESS + SPARKLINE ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4 mb-5">
          <section
            className="rounded-2xl p-5"
            style={{
              background: THEME.bgCard,
              border: `1px solid ${THEME.border}`,
            }}
          >
            <div
              className="text-[11px] tracking-[0.18em] uppercase font-medium mb-3"
              style={{ color: THEME.textMuted }}
            >
              Progreso hacia el bono
            </div>

            {data.bonusTarget ? (
              <>
                <div className="flex items-baseline justify-between mb-2">
                  <div>
                    <span
                      className="text-[22px] font-semibold tabular-nums tracking-tight"
                      style={{ color: THEME.textPrimary }}
                    >
                      {fmtARSCompact(data.revenue)}
                    </span>
                    <span
                      className="text-[13px] ml-2"
                      style={{ color: THEME.textTertiary }}
                    >
                      de {fmtARSCompact(data.bonusTarget)}
                    </span>
                  </div>
                  <span
                    className="text-[14px] font-semibold tabular-nums tracking-tight"
                    style={{ color: progressCfg.color }}
                  >
                    {Math.round((data.revenuePct || 0) * 100)}%
                  </span>
                </div>
                <div className="relative">
                  <div
                    className="w-full h-2.5 rounded-full overflow-hidden"
                    style={{ background: "rgba(255, 255, 255, 0.05)" }}
                  >
                    <div
                      className="h-full"
                      style={{
                        width: `${Math.max(0.5, (data.revenuePct || 0) * 100)}%`,
                        background:
                          data.progressStatus === "unlocked"
                            ? THEME.green
                            : THEME.gradient,
                        transition: `width 800ms ${ES}`,
                      }}
                    />
                  </div>
                  {data.timePct !== null ? (
                    <div
                      className="absolute top-[-3px] bottom-[-3px] w-[2px]"
                      style={{
                        left: `${data.timePct * 100}%`,
                        background: "rgba(255, 255, 255, 0.4)",
                      }}
                      title="Progreso de tiempo"
                    />
                  ) : null}
                </div>
                <div
                  className="mt-2 flex items-center justify-between text-[11px]"
                  style={{ color: THEME.textTertiary }}
                >
                  <span>
                    {data.timePct !== null
                      ? `${data.daysElapsed} de ${data.totalDays} días`
                      : `Día ${data.daysElapsed}`}
                  </span>
                  {data.daysRemaining !== null ? (
                    <span>{data.daysRemaining} días restantes</span>
                  ) : null}
                </div>
                {data.bonusAmount ? (
                  <div
                    className="mt-4 p-3 rounded-xl flex items-center gap-3"
                    style={{
                      background: THEME.goldSoft,
                      border: `1px solid ${THEME.goldBorder}`,
                    }}
                  >
                    <Gift size={16} color={THEME.gold} strokeWidth={2.2} />
                    <div className="flex-1">
                      <div
                        className="text-[12.5px] font-semibold tracking-tight"
                        style={{ color: THEME.textPrimary }}
                      >
                        Bono a desbloquear: {fmtARS(data.bonusAmount)}
                      </div>
                      <div
                        className="text-[11px] tracking-tight"
                        style={{ color: THEME.textSecondary }}
                      >
                        {data.progressStatus === "unlocked"
                          ? "✓ Ya alcanzó el target"
                          : `Falta ${fmtARSCompact(Math.max(0, data.bonusTarget - data.revenue))}`}
                      </div>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div
                className="text-[13px] tracking-tight"
                style={{ color: THEME.textTertiary }}
              >
                Esta campaña no tiene bono configurado. Podés editarla para sumar un target.
              </div>
            )}
          </section>

          <section
            className="rounded-2xl p-5"
            style={{
              background: THEME.bgCard,
              border: `1px solid ${THEME.border}`,
            }}
          >
            <div
              className="text-[11px] tracking-[0.18em] uppercase font-medium mb-3"
              style={{ color: THEME.textMuted }}
            >
              Revenue diario (últimos {data.series.length}d)
            </div>
            {data.series.length > 1 && data.revenue > 0 ? (
              <>
                <Sparkline series={data.series} height={80} />
                <div
                  className="mt-2 flex items-center justify-between text-[10.5px]"
                  style={{ color: THEME.textTertiary }}
                >
                  <span>{fmtDateShort(data.series[0].date)}</span>
                  <span>
                    {fmtDateShort(data.series[data.series.length - 1].date)}
                  </span>
                </div>
              </>
            ) : (
              <div
                className="h-[80px] flex items-center justify-center text-[12px] tracking-tight"
                style={{ color: THEME.textTertiary }}
              >
                Sin ventas todavía en el período
              </div>
            )}
          </section>
        </div>

        {/* ─── BODY GRID: submissions + attributions ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4 mb-5">
          {/* Content submissions */}
          <section
            className="rounded-2xl p-5"
            style={{
              background: THEME.bgCard,
              border: `1px solid ${THEME.border}`,
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div
                className="text-[11px] tracking-[0.18em] uppercase font-medium"
                style={{ color: THEME.textMuted }}
              >
                Contenido publicado
              </div>
              {data.submissions.length > 0 ? (
                <span
                  className="text-[11px] font-medium"
                  style={{ color: THEME.textTertiary }}
                >
                  {data.submissions.length}
                </span>
              ) : null}
            </div>
            {data.submissions.length === 0 ? (
              <div
                className="text-[13px] tracking-tight py-6 text-center"
                style={{ color: THEME.textTertiary }}
              >
                Todavía no hay contenido publicado para esta campaña.
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {data.submissions.map((s) => (
                  <a
                    key={s.id}
                    href={s.contentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-lg overflow-hidden relative group"
                    style={{
                      background: THEME.bgSoft,
                      border: `1px solid ${THEME.border}`,
                      aspectRatio: "9 / 12",
                    }}
                  >
                    {s.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.thumbnailUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <PlatformIcon p={s.platform} />
                      </div>
                    )}
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background:
                          "linear-gradient(180deg, transparent 55%, rgba(0,0,0,0.85) 100%)",
                      }}
                    />
                    <div className="absolute top-2 left-2">
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-[2px] rounded-full text-[9.5px] font-semibold"
                        style={{
                          background: "rgba(0, 0, 0, 0.6)",
                          color: "#fff",
                          backdropFilter: "blur(8px)",
                        }}
                      >
                        <PlatformIcon p={s.platform} />
                        {s.type}
                      </span>
                    </div>
                    <div className="absolute bottom-2 left-2 right-2">
                      <div
                        className="text-[10px] font-semibold truncate"
                        style={{ color: "#fff" }}
                      >
                        {s.publishedAt ? fmtRelative(s.publishedAt) : "Sin publicar"}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </section>

          {/* Recent attributions */}
          <section
            className="rounded-2xl p-5"
            style={{
              background: THEME.bgCard,
              border: `1px solid ${THEME.border}`,
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div
                className="text-[11px] tracking-[0.18em] uppercase font-medium"
                style={{ color: THEME.textMuted }}
              >
                Últimas ventas atribuidas
              </div>
              {data.recentAttributions.length > 0 ? (
                <span
                  className="text-[11px] font-medium"
                  style={{ color: THEME.textTertiary }}
                >
                  {data.conversions}
                </span>
              ) : null}
            </div>
            {data.recentAttributions.length === 0 ? (
              <div
                className="text-[13px] tracking-tight py-6 text-center"
                style={{ color: THEME.textTertiary }}
              >
                Todavía no hay ventas atribuidas a esta campaña.
              </div>
            ) : (
              <div className="space-y-2">
                {data.recentAttributions.slice(0, 12).map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-lg"
                    style={{
                      background: THEME.bgSoft,
                      border: `1px solid ${THEME.border}`,
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div
                        className="text-[12.5px] font-semibold tabular-nums"
                        style={{ color: THEME.textPrimary }}
                      >
                        {fmtARS(a.attributedValue)}
                      </div>
                      <div
                        className="text-[10.5px] tracking-tight"
                        style={{ color: THEME.textTertiary }}
                      >
                        {a.order?.orderNumber || "s/n"} · {a.attributionSource} ·{" "}
                        {fmtRelative(a.createdAt)}
                      </div>
                    </div>
                    <div
                      className="text-[11px] font-medium tabular-nums"
                      style={{ color: THEME.gold }}
                    >
                      +{fmtARSCompact(a.commissionAmount)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ─── BRIEFINGS ─── */}
        {data.briefings.length > 0 ? (
          <section
            className="rounded-2xl p-5 mb-5"
            style={{
              background: THEME.bgCard,
              border: `1px solid ${THEME.border}`,
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div
                className="text-[11px] tracking-[0.18em] uppercase font-medium"
                style={{ color: THEME.textMuted }}
              >
                Briefs ({data.briefings.length})
              </div>
            </div>
            <div className="space-y-2">
              {data.briefings.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg"
                  style={{
                    background: THEME.bgSoft,
                    border: `1px solid ${THEME.border}`,
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <FileText size={11} color={THEME.textTertiary} strokeWidth={2.2} />
                      <span
                        className="text-[10px] font-semibold tracking-[0.08em] uppercase"
                        style={{ color: THEME.textMuted }}
                      >
                        {b.type}
                      </span>
                    </div>
                    <div
                      className="text-[13px] font-medium tracking-tight"
                      style={{ color: THEME.textPrimary }}
                    >
                      {b.title}
                    </div>
                  </div>
                  {b.deadline ? (
                    <div
                      className="text-[10.5px] tracking-tight"
                      style={{ color: THEME.textTertiary }}
                    >
                      {fmtDateShort(b.deadline)}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {/* ─── DELETE MODAL ─── */}
      {showDelete ? (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{ background: "rgba(0, 0, 0, 0.7)", backdropFilter: "blur(6px)" }}
        >
          <div
            className="max-w-md w-full rounded-2xl p-6"
            style={{
              background: "#18182a",
              border: `1px solid ${THEME.borderStrong}`,
            }}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
              style={{ background: THEME.roseSoft }}
            >
              <AlertTriangle size={22} color={THEME.rose} strokeWidth={2.2} />
            </div>
            <h3
              className="text-[18px] font-semibold tracking-tight mb-2"
              style={{ color: THEME.textPrimary }}
            >
              Eliminar campaña
            </h3>
            <p
              className="text-[13px] tracking-tight leading-relaxed mb-5"
              style={{ color: THEME.textSecondary }}
            >
              Estás por eliminar{" "}
              <strong style={{ color: THEME.textPrimary }}>{data.name}</strong>.
              Esta acción no se puede deshacer. Si tiene ventas atribuidas,
              no se podrá eliminar.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDelete(false)}
                disabled={actionLoading}
                className="px-4 py-2 rounded-xl text-[12.5px] font-medium tracking-tight"
                style={{
                  background: THEME.bgSoft,
                  border: `1px solid ${THEME.border}`,
                  color: THEME.textSecondary,
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={actionLoading}
                className="px-4 py-2 rounded-xl text-[12.5px] font-semibold tracking-tight disabled:opacity-50"
                style={{
                  background: THEME.rose,
                  color: "#fff",
                }}
              >
                {actionLoading ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function KpiCell({
  label,
  value,
  sub,
  accent,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: THEME.bgCard,
        border: `1px solid ${THEME.border}`,
      }}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon}
        <div
          className="text-[10.5px] tracking-[0.12em] uppercase font-medium"
          style={{ color: THEME.textMuted }}
        >
          {label}
        </div>
      </div>
      <div
        className="text-[22px] font-semibold tabular-nums tracking-tight leading-none"
        style={{ color: accent || THEME.textPrimary }}
      >
        {value}
      </div>
      {sub ? (
        <div
          className="text-[10.5px] tracking-tight mt-1.5"
          style={{ color: THEME.textTertiary }}
        >
          {sub}
        </div>
      ) : null}
    </div>
  );
}
