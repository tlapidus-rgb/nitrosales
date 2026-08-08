"use client";

// ═══════════════════════════════════════════════════════════════
// Aura — Campañas (lista)
// ───────────────────────────────────────────────────────────────
// Muestra todas las campañas con:
//   - Summary bar (activas, revenue total, conversiones, unlocked, at risk)
//   - Filtros por status + sort
//   - Tabla/grid de cards premium con progreso visible
//   - CTA para crear nueva campaña
//
// Theme: Dark · Creator Gradient
// ═══════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  Target,
  Calendar,
  TrendingUp,
  Trophy,
  AlertTriangle,
  Clock,
  Users,
  Rocket,
  Pause,
  CheckCircle2,
  ArrowUpRight,
  Flame,
  Hourglass,
  ChevronDown,
} from "lucide-react";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";

const THEME = {
  bgCard: "rgb(var(--ent-elevated))",
  bgSoft: "rgb(var(--ent-surface))",
  border: "rgb(var(--ent-hairline))",
  borderStrong: "rgb(var(--ent-hairline-2))",
  textPrimary: "rgb(var(--ent-ink))",
  textSecondary: "rgb(var(--ent-ink-60))",
  textTertiary: "rgb(var(--ent-ink-40))",
  textMuted: "rgb(var(--ent-ink-40))",
  ink: "rgb(var(--ent-ink))",
  inkSoft: "rgba(28,27,24,0.06)",
  inkBorder: "rgba(28,27,24,0.16)",
  accent: "rgb(var(--ent-accent))",
  accentSoft: "rgba(47,145,83,0.10)",
  accentBorder: "rgba(47,145,83,0.28)",
  amber: "rgb(var(--ent-amber))",
  amberSoft: "rgba(201,138,26,0.10)",
  amberBorder: "rgba(201,138,26,0.28)",
  danger: "#b91c1c",
  dangerSoft: "rgba(185,28,28,0.08)",
  dangerBorder: "rgba(185,28,28,0.24)",
  gray: "rgb(var(--ent-ink-40))",
  graySoft: "rgb(var(--ent-surface))",
  grayBorder: "rgb(var(--ent-hairline))",
};

// ────────────── TYPES ──────────────
type ProgressStatus =
  | "unlocked"
  | "ahead"
  | "on_track"
  | "behind"
  | "at_risk"
  | "no_target"
  | "no_time_limit";

type Campaign = {
  id: string;
  name: string;
  status: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
  createdAt: string;
  revenue: number;
  commission: number;
  conversions: number;
  bonusTarget: number | null;
  bonusAmount: number | null;
  revenuePct: number | null;
  timePct: number | null;
  totalDays: number | null;
  daysElapsed: number;
  daysRemaining: number | null;
  progressStatus: ProgressStatus;
  briefings: number;
  creator: {
    id: string;
    name: string;
    code: string;
    avatarUrl: string | null;
  } | null;
};

type Totals = {
  count: number;
  active: number;
  paused: number;
  completed: number;
  totalRevenue: number;
  totalCommission: number;
  totalConversions: number;
  unlocked: number;
  atRisk: number;
};

// ────────────── UTILS ──────────────
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
  });
}

// ────────────── STATUS CONFIG ──────────────
const PROGRESS_CONFIG: Record<
  ProgressStatus,
  { label: string; color: string; bg: string; border: string; icon: React.ReactNode }
> = {
  unlocked: {
    label: "Bono desbloqueado",
    color: THEME.accent,
    bg: THEME.accentSoft,
    border: THEME.accentBorder,
    icon: <Trophy size={11} strokeWidth={2.4} />,
  },
  ahead: {
    label: "Adelante del ritmo",
    color: THEME.textSecondary,
    bg: THEME.graySoft,
    border: THEME.grayBorder,
    icon: <Rocket size={11} strokeWidth={2.4} />,
  },
  on_track: {
    label: "En ritmo",
    color: THEME.textSecondary,
    bg: THEME.graySoft,
    border: THEME.grayBorder,
    icon: <TrendingUp size={11} strokeWidth={2.4} />,
  },
  behind: {
    label: "Atrás del ritmo",
    color: THEME.amber,
    bg: THEME.amberSoft,
    border: THEME.amberBorder,
    icon: <Hourglass size={11} strokeWidth={2.4} />,
  },
  at_risk: {
    label: "En riesgo",
    color: THEME.danger,
    bg: THEME.dangerSoft,
    border: THEME.dangerBorder,
    icon: <AlertTriangle size={11} strokeWidth={2.4} />,
  },
  no_target: {
    label: "Sin target",
    color: THEME.gray,
    bg: THEME.graySoft,
    border: THEME.grayBorder,
    icon: <Target size={11} strokeWidth={2.4} />,
  },
  no_time_limit: {
    label: "Sin fecha fin",
    color: THEME.gray,
    bg: THEME.graySoft,
    border: THEME.grayBorder,
    icon: <Clock size={11} strokeWidth={2.4} />,
  },
};

const STATUS_DB_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; border: string }
> = {
  ACTIVE: {
    label: "Activa",
    color: THEME.accent,
    bg: THEME.accentSoft,
    border: THEME.accentBorder,
  },
  PAUSED: {
    label: "Pausada",
    color: THEME.gray,
    bg: THEME.graySoft,
    border: THEME.grayBorder,
  },
  COMPLETED: {
    label: "Completada",
    color: THEME.textSecondary,
    bg: THEME.graySoft,
    border: THEME.grayBorder,
  },
};

// ────────────── COMPONENTS ──────────────
function Avatar({
  name,
  url,
  size = 36,
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
        className="rounded-full object-cover"
        style={{
          width: size,
          height: size,
          border: `1.5px solid ${THEME.border}`,
        }}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center font-semibold"
      style={{
        width: size,
        height: size,
        background: THEME.inkSoft,
        color: THEME.ink,
        fontSize: size * 0.38,
        border: `1.5px solid ${THEME.inkBorder}`,
      }}
    >
      {initials}
    </div>
  );
}

function ProgressBar({
  revenuePct,
  timePct,
  status,
}: {
  revenuePct: number | null;
  timePct: number | null;
  status: ProgressStatus;
}) {
  const cfg = PROGRESS_CONFIG[status];
  const pct = revenuePct !== null ? revenuePct : 0;
  const timeMark = timePct !== null ? timePct : null;
  return (
    <div className="relative">
      <div
        className="w-full h-[6px] rounded-full overflow-hidden"
        style={{ background: THEME.bgSoft }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.max(0.5, pct * 100)}%`,
            background: status === "unlocked" ? THEME.accent : THEME.ink,
            transition: `width 600ms ${ES}`,
          }}
        />
      </div>
      {timeMark !== null ? (
        <div
          className="absolute top-0 bottom-0 w-[2px]"
          style={{
            left: `${timeMark * 100}%`,
            background: THEME.borderStrong,
          }}
          title="Progreso de tiempo"
        />
      ) : null}
      <div className="mt-1.5 flex items-center justify-between text-[10.5px]">
        <span style={{ color: cfg.color }}>
          {revenuePct !== null
            ? `${Math.round(revenuePct * 100)}% del target`
            : "Sin target"}
        </span>
        <span style={{ color: THEME.textTertiary }}>
          {timePct !== null ? `${Math.round(timePct * 100)}% del tiempo` : ""}
        </span>
      </div>
    </div>
  );
}

function SummaryPill({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div
      className="px-4 py-3 rounded-xl"
      style={{
        background: THEME.bgCard,
        border: `1px solid ${THEME.border}`,
      }}
    >
      <div
        className="text-[10.5px] tracking-[0.12em] uppercase font-medium mb-1"
        style={{ color: THEME.textMuted }}
      >
        {label}
      </div>
      <div
        className="text-[18px] font-semibold tabular-nums tracking-tight"
        style={{ color: accent || THEME.textPrimary }}
      >
        {value}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12.5px] font-medium tracking-tight transition-all"
      style={{
        background: active ? THEME.bgCard : "transparent",
        border: `1px solid ${active ? THEME.borderStrong : THEME.border}`,
        color: active ? THEME.textPrimary : THEME.textSecondary,
      }}
    >
      {children}
      {count !== undefined ? (
        <span
          className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full text-[10.5px] font-semibold tabular-nums"
          style={{
            background: active ? THEME.inkSoft : THEME.bgSoft,
            color: active ? THEME.ink : THEME.textTertiary,
          }}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function CampaignCard({ c }: { c: Campaign }) {
  const progressCfg = PROGRESS_CONFIG[c.progressStatus];
  const statusDbCfg = STATUS_DB_CONFIG[c.status] || STATUS_DB_CONFIG.ACTIVE;
  const urgent =
    c.daysRemaining !== null && c.daysRemaining <= 7 && c.status === "ACTIVE";

  return (
    <Link
      href={`/aura/campanas/${c.id}`}
      className="block p-5 rounded-2xl transition-all hover:-translate-y-0.5"
      style={{
        background: THEME.bgCard,
        border: `1px solid ${THEME.border}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = THEME.borderStrong;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = THEME.border;
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span
              className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10px] font-semibold tracking-tight"
              style={{
                color: statusDbCfg.color,
                background: statusDbCfg.bg,
                border: `1px solid ${statusDbCfg.border}`,
              }}
            >
              {statusDbCfg.label}
            </span>
            <span
              className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10px] font-semibold tracking-tight"
              style={{
                color: progressCfg.color,
                background: progressCfg.bg,
                border: `1px solid ${progressCfg.border}`,
              }}
            >
              {progressCfg.icon}
              {progressCfg.label}
            </span>
          </div>
          <div
            className="text-[15px] font-semibold tracking-tight truncate"
            style={{ color: THEME.textPrimary }}
          >
            {c.name}
          </div>
        </div>
        {urgent ? (
          <div
            className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10px] font-semibold"
            style={{
              color: THEME.amber,
              background: THEME.amberSoft,
              border: `1px solid ${THEME.amberBorder}`,
            }}
          >
            <Flame size={10} strokeWidth={2.4} />
            {c.daysRemaining}d
          </div>
        ) : null}
      </div>

      {/* Creator row */}
      {c.creator ? (
        <div className="flex items-center gap-2 mb-4">
          <Avatar name={c.creator.name} url={c.creator.avatarUrl} size={26} />
          <div className="min-w-0 flex-1">
            <div
              className="text-[12.5px] font-medium truncate"
              style={{ color: THEME.textPrimary }}
            >
              {c.creator.name}
            </div>
            <div
              className="text-[10.5px] tracking-tight font-mono"
              style={{ color: THEME.textTertiary }}
            >
              {c.creator.code}
            </div>
          </div>
        </div>
      ) : null}

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <div
            className="text-[10px] tracking-[0.1em] uppercase font-medium mb-0.5"
            style={{ color: THEME.textMuted }}
          >
            Revenue
          </div>
          <div
            className="text-[14px] font-semibold tabular-nums tracking-tight"
            style={{ color: THEME.textPrimary }}
          >
            {fmtARSCompact(c.revenue)}
          </div>
        </div>
        <div>
          <div
            className="text-[10px] tracking-[0.1em] uppercase font-medium mb-0.5"
            style={{ color: THEME.textMuted }}
          >
            Órdenes
          </div>
          <div
            className="text-[14px] font-semibold tabular-nums tracking-tight"
            style={{ color: THEME.textPrimary }}
          >
            {c.conversions}
          </div>
        </div>
        <div>
          <div
            className="text-[10px] tracking-[0.1em] uppercase font-medium mb-0.5"
            style={{ color: THEME.textMuted }}
          >
            {c.bonusTarget ? "Target" : "Bono"}
          </div>
          <div
            className="text-[14px] font-semibold tabular-nums tracking-tight"
            style={{ color: THEME.textPrimary }}
          >
            {c.bonusTarget
              ? fmtARSCompact(c.bonusTarget)
              : c.bonusAmount
                ? fmtARSCompact(c.bonusAmount)
                : "—"}
          </div>
        </div>
      </div>

      {/* Progress */}
      {c.revenuePct !== null ? (
        <ProgressBar
          revenuePct={c.revenuePct}
          timePct={c.timePct}
          status={c.progressStatus}
        />
      ) : (
        <div
          className="text-[11px] tracking-tight"
          style={{ color: THEME.textTertiary }}
        >
          Sin bono configurado
        </div>
      )}

      {/* Footer meta */}
      <div
        className="mt-4 pt-3 flex items-center justify-between text-[10.5px]"
        style={{
          borderTop: `1px solid ${THEME.border}`,
          color: THEME.textTertiary,
        }}
      >
        <div className="flex items-center gap-1.5">
          <Calendar size={10} strokeWidth={2.2} />
          {fmtDate(c.startDate)}
          {c.endDate ? ` → ${fmtDate(c.endDate)}` : " · en curso"}
        </div>
        {c.briefings > 0 ? (
          <div className="flex items-center gap-1">
            <Users size={10} strokeWidth={2.2} />
            {c.briefings} brief{c.briefings === 1 ? "" : "s"}
          </div>
        ) : null}
      </div>
    </Link>
  );
}

// ────────────── MAIN ──────────────
export default function CampanasPage() {
  const [rows, setRows] = useState<Campaign[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "ACTIVE" | "PAUSED" | "COMPLETED"
  >("ACTIVE");
  const [sort, setSort] = useState<"urgency" | "revenue" | "recent" | "name">(
    "urgency",
  );

  useEffect(() => {
    let aborted = false;
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        params.set("status", statusFilter);
        params.set("sort", sort);
        const res = await fetch(`/api/aura/campaigns/list?${params}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("No se pudieron cargar las campañas");
        const data = await res.json();
        if (aborted) return;
        setRows(data.rows || []);
        setTotals(data.totals || null);
        setError(null);
      } catch (err) {
        if (!aborted) {
          setError((err as Error).message);
          setRows([]);
        }
      } finally {
        if (!aborted) setLoading(false);
      }
    }
    const t = setTimeout(load, 100);
    return () => {
      aborted = true;
      clearTimeout(t);
    };
  }, [q, statusFilter, sort]);

  const empty = !loading && rows.length === 0;

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-[1320px] mx-auto px-6 md:px-10 py-8 md:py-10">
        {/* ─── HEADER ─── */}
        <header className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div
              className="text-[11px] tracking-[0.18em] uppercase font-medium mb-2"
              style={{ color: THEME.textMuted }}
            >
              Aura · Campañas
            </div>
            <h1
              className="text-[34px] font-semibold tracking-tight leading-none text-ink"
            >
              Campañas
            </h1>
            <p
              className="mt-2 text-[14px] tracking-tight"
              style={{ color: THEME.textSecondary }}
            >
              {loading
                ? "Cargando..."
                : totals
                  ? `${totals.active} activas · ${fmtARS(totals.totalRevenue)} en revenue · ${totals.unlocked} bonos desbloqueados`
                  : ""}
            </p>
          </div>

          <Link
            href="/aura/campanas/nueva"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold tracking-tight transition-all bg-ink text-white"
          >
            <Plus size={15} strokeWidth={2.4} />
            Nueva campaña
          </Link>
        </header>

        {/* ─── SUMMARY BAR ─── */}
        {totals ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <SummaryPill label="Activas" value={totals.active} />
            <SummaryPill
              label="Revenue total"
              value={fmtARSCompact(totals.totalRevenue)}
            />
            <SummaryPill label="Conversiones" value={totals.totalConversions} />
            <SummaryPill
              label="Bonos desbloqueados"
              value={totals.unlocked}
              accent={THEME.accent}
            />
            <SummaryPill
              label="En riesgo"
              value={totals.atRisk}
              accent={totals.atRisk > 0 ? THEME.danger : undefined}
            />
          </div>
        ) : null}

        {/* ─── TOOLBAR ─── */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl flex-1 min-w-[240px]"
            style={{
              background: THEME.bgCard,
              border: `1px solid ${THEME.border}`,
            }}
          >
            <Search size={14} strokeWidth={2.2} color={THEME.textTertiary} />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar campaña o creador..."
              className="flex-1 bg-transparent outline-none text-[13px] tracking-tight"
              style={{ color: THEME.textPrimary }}
            />
          </div>
          <div className="relative">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              className="appearance-none pl-3 pr-9 py-2 rounded-xl text-[12.5px] font-medium tracking-tight outline-none cursor-pointer"
              style={{
                background: THEME.bgCard,
                border: `1px solid ${THEME.border}`,
                color: THEME.textPrimary,
              }}
            >
              <option value="urgency">Por urgencia</option>
              <option value="revenue">Mayor revenue</option>
              <option value="recent">Más recientes</option>
              <option value="name">Por nombre</option>
            </select>
            <ChevronDown
              size={13}
              strokeWidth={2.2}
              color={THEME.textTertiary}
              className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
            />
          </div>
        </div>

        {/* ─── FILTERS ─── */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <FilterChip
            active={statusFilter === "ACTIVE"}
            onClick={() => setStatusFilter("ACTIVE")}
            count={totals?.active}
          >
            Activas
          </FilterChip>
          <FilterChip
            active={statusFilter === "PAUSED"}
            onClick={() => setStatusFilter("PAUSED")}
            count={totals?.paused}
          >
            Pausadas
          </FilterChip>
          <FilterChip
            active={statusFilter === "COMPLETED"}
            onClick={() => setStatusFilter("COMPLETED")}
            count={totals?.completed}
          >
            Completadas
          </FilterChip>
          <FilterChip
            active={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
            count={totals?.count}
          >
            Todas
          </FilterChip>
        </div>

        {/* ─── CONTENT ─── */}
        {error ? (
          <div
            className="p-4 rounded-xl text-[13px] mb-4"
            style={{
              background: THEME.dangerSoft,
              border: `1px solid ${THEME.dangerBorder}`,
              color: THEME.danger,
            }}
          >
            {error}
          </div>
        ) : null}

        {loading ? (
          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[260px] rounded-2xl"
                style={{
                  background: THEME.bgSoft,
                  border: `1px solid ${THEME.border}`,
                }}
              />
            ))}
          </div>
        ) : empty ? (
          <div
            className="p-12 rounded-2xl text-center"
            style={{
              background: THEME.bgCard,
              border: `1px dashed ${THEME.borderStrong}`,
            }}
          >
            <div
              className="w-14 h-14 mx-auto rounded-2xl mb-4 flex items-center justify-center"
              style={{ background: THEME.inkSoft }}
            >
              <Rocket size={26} color={THEME.ink} strokeWidth={2} />
            </div>
            <div
              className="text-[16px] font-semibold tracking-tight mb-1"
              style={{ color: THEME.textPrimary }}
            >
              {statusFilter === "ACTIVE"
                ? "No tenés campañas activas"
                : "No hay campañas con este filtro"}
            </div>
            <p
              className="text-[13px] tracking-tight max-w-sm mx-auto mb-5"
              style={{ color: THEME.textSecondary }}
            >
              Armá una campaña para asignarle objetivos, tiempos y bonos a tus creadores.
            </p>
            <Link
              href="/aura/campanas/nueva"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[12.5px] font-semibold bg-ink text-white"
            >
              <Plus size={14} strokeWidth={2.4} />
              Crear primera campaña
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rows.map((c) => (
              <CampaignCard key={c.id} c={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
