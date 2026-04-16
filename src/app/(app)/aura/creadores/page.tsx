"use client";

// ══════════════════════════════════════════════════════════════
// Aura — Creadores (lista)
// ══════════════════════════════════════════════════════════════
// Pantalla principal del módulo Creadores.
// Tema: CLARO (cream/ivory). Grid de cards premium con filtros de
// estado, búsqueda y ordenamiento. La idea es que esta pantalla
// pueda mostrar mucha info sin cansar la vista.
//
// Estados derivados:
//   champion → verde (celebrating), 5+ ventas en período
//   active   → gold (default)
//   new      → gold neutro, badge "Nuevo"
//   silent   → rose (alerta real), sin ventas 14 días
//   paused   → gris, pausado manualmente
// ══════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Search,
  Users,
  Plus,
  Inbox,
  ArrowUpRight,
  TrendingUp,
  ArrowDownRight,
  Sparkles,
  Trophy,
  Flame,
  AlertCircle,
  PauseCircle,
  CheckCircle2,
  SlidersHorizontal,
  Target,
} from "lucide-react";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";

// ───────────────────────── THEME (DARK · Creator Gradient) ──────
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
  // Gradient
  gradient: "linear-gradient(135deg, #ff0080 0%, #7928ca 50%, #00d4ff 100%)",
  gradientText: "linear-gradient(90deg, #ff0080, #00d4ff)",
};

// ───────────────────────────── UTILS ─────────────────────────────
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
function fmtNum(n: number) {
  return new Intl.NumberFormat("es-AR").format(Math.round(n));
}
function fmtDaysAgo(iso: string | null): string {
  if (!iso) return "sin ventas aún";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (d === 0) return "hoy";
  if (d === 1) return "hace 1 día";
  if (d < 30) return `hace ${d} días`;
  const months = Math.floor(d / 30);
  if (months === 1) return "hace 1 mes";
  return `hace ${months} meses`;
}

// ───────────────────────────── TYPES ─────────────────────────────
type CreatorState = "champion" | "active" | "new" | "silent" | "paused";
type Creator = {
  id: string;
  name: string;
  code: string;
  email: string | null;
  profileImage: string | null;
  status: string;
  commissionPercent: number;
  attributionWindowDays: number;
  revenue: number;
  orders: number;
  aov: number;
  commissionEarned: number;
  lastSaleAt: string | null;
  activeCampaigns: number;
  contentPieces: number;
  state: CreatorState;
  daysSinceLastSale: number | null;
  dashboardPasswordPlain: string | null;
};
type StateCounts = { all: number; champion: number; active: number; new: number; silent: number; paused: number };

// ─────────────────── STATE BADGES ─────────────────────────────
const STATE_CONFIG: Record<
  CreatorState,
  { label: string; color: string; bg: string; border: string; icon: React.ReactNode }
> = {
  champion: {
    label: "Campeón",
    color: THEME.green,
    bg: THEME.greenSoft,
    border: THEME.greenBorder,
    icon: <Trophy size={11} strokeWidth={2.4} />,
  },
  active: {
    label: "Activo",
    color: THEME.gold,
    bg: THEME.goldSoft,
    border: THEME.goldBorder,
    icon: <Flame size={11} strokeWidth={2.4} />,
  },
  new: {
    label: "Nuevo",
    color: THEME.gold,
    bg: THEME.goldSoft,
    border: THEME.goldBorder,
    icon: <Sparkles size={11} strokeWidth={2.4} />,
  },
  silent: {
    label: "Silencioso",
    color: THEME.rose,
    bg: THEME.roseSoft,
    border: THEME.roseBorder,
    icon: <AlertCircle size={11} strokeWidth={2.4} />,
  },
  paused: {
    label: "Pausado",
    color: THEME.gray,
    bg: THEME.graySoft,
    border: THEME.grayBorder,
    icon: <PauseCircle size={11} strokeWidth={2.4} />,
  },
};

// ─────────────────── INITIALS AVATAR ─────────────────────────────
function Avatar({
  name,
  url,
  size = 52,
}: {
  name: string;
  url: string | null;
  size?: number;
}) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="object-cover rounded-full"
        style={{ width: size, height: size, border: `1px solid ${THEME.border}` }}
      />
    );
  }
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: "linear-gradient(135deg, #ff99c7 0%, #ff0080 100%)",
        color: "#FFF",
        boxShadow: "0 4px 12px rgba(255, 0, 128, 0.25)",
      }}
    >
      {initials || "?"}
    </div>
  );
}

// ─────────────────── STATE BADGE ─────────────────────────────
function StateBadge({ state }: { state: CreatorState }) {
  const cfg = STATE_CONFIG[state];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10.5px] font-semibold tracking-tight"
      style={{
        color: cfg.color,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
      }}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ─────────────────── CREATOR CARD ─────────────────────────────
function CreatorCard({ creator, delay }: { creator: Creator; delay: number }) {
  return (
    <Link
      href={`/aura/creadores/${creator.id}`}
      className="group relative block rounded-2xl overflow-hidden transition-all"
      style={{
        background: THEME.bgCard,
        border: `1px solid ${THEME.border}`,
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.3)",
        animation: `cardIn 520ms ${ES} ${delay}ms both`,
      }}
    >
      {/* Hover halo sutil */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
        style={{
          background:
            "linear-gradient(135deg, rgba(255, 0, 128, 0.04) 0%, transparent 60%)",
          transition: `opacity 320ms ${ES}`,
        }}
      />

      {/* Header: avatar + name + state */}
      <div className="relative flex items-start gap-3 p-4 pb-3">
        <Avatar name={creator.name} url={creator.profileImage} size={48} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3
                className="text-[14.5px] font-semibold tracking-tight truncate"
                style={{ color: THEME.textPrimary }}
              >
                {creator.name}
              </h3>
              <p
                className="text-[11.5px] tracking-tight mt-0.5 truncate"
                style={{ color: THEME.textTertiary }}
              >
                @{creator.code} · {creator.commissionPercent}% comisión
              </p>
            </div>
            <StateBadge state={creator.state} />
          </div>
        </div>
      </div>

      {/* Separador sutil */}
      <div
        className="mx-4 h-px"
        style={{ background: THEME.border }}
      />

      {/* KPIs */}
      <div className="relative grid grid-cols-3 gap-0 p-4 pb-3">
        <div>
          <div
            className="text-[10px] tracking-[0.12em] uppercase font-medium mb-1"
            style={{ color: THEME.textMuted }}
          >
            Revenue
          </div>
          <div
            className="text-[15px] font-semibold tabular-nums tracking-tight"
            style={{ color: THEME.textPrimary }}
          >
            {fmtARSCompact(creator.revenue)}
          </div>
        </div>
        <div>
          <div
            className="text-[10px] tracking-[0.12em] uppercase font-medium mb-1"
            style={{ color: THEME.textMuted }}
          >
            Ventas
          </div>
          <div
            className="text-[15px] font-semibold tabular-nums tracking-tight"
            style={{ color: THEME.textPrimary }}
          >
            {fmtNum(creator.orders)}
          </div>
        </div>
        <div>
          <div
            className="text-[10px] tracking-[0.12em] uppercase font-medium mb-1"
            style={{ color: THEME.textMuted }}
          >
            AOV
          </div>
          <div
            className="text-[15px] font-semibold tabular-nums tracking-tight"
            style={{ color: THEME.textPrimary }}
          >
            {creator.orders > 0 ? fmtARSCompact(creator.aov) : "—"}
          </div>
        </div>
      </div>

      {/* Footer meta */}
      <div
        className="relative flex items-center justify-between px-4 py-2.5"
        style={{
          background: THEME.bgSoft,
          borderTop: `1px solid ${THEME.border}`,
        }}
      >
        <div
          className="text-[11px] tracking-tight flex items-center gap-3"
          style={{ color: THEME.textSecondary }}
        >
          <span className="inline-flex items-center gap-1">
            <Sparkles size={11} strokeWidth={2.2} style={{ color: THEME.gold }} />
            {creator.contentPieces} pieza{creator.contentPieces === 1 ? "" : "s"}
          </span>
          {creator.activeCampaigns > 0 ? (
            <span
              className="inline-flex items-center gap-1"
              style={{ color: THEME.textSecondary }}
            >
              · {creator.activeCampaigns} campaña{creator.activeCampaigns === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold tracking-tight"
            style={{
              background:
                "linear-gradient(135deg, rgba(255,0,128,0.10), rgba(168,85,247,0.08), rgba(0,212,255,0.10))",
              border: "1px solid rgba(168,85,247,0.28)",
            }}
            title={`Ventana de atribución personalizada: ${creator.attributionWindowDays} días (Powered by NitroPixel)`}
          >
            <Target size={10} strokeWidth={2.4} style={{ color: "#ff0080" }} />
            <span
              className="bg-clip-text text-transparent tabular-nums"
              style={{
                backgroundImage:
                  "linear-gradient(90deg,#ff0080,#a855f7,#00d4ff)",
              }}
            >
              {creator.attributionWindowDays}d
            </span>
          </span>
          <div className="text-[11px] tracking-tight" style={{ color: THEME.textTertiary }}>
            {fmtDaysAgo(creator.lastSaleAt)}
          </div>
        </div>
      </div>
    </Link>
  );
}

// ─────────────────── FILTER CHIPS ─────────────────────────────
function FilterChip({
  label,
  count,
  active,
  tone = "neutral",
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  tone?: "neutral" | "green" | "gold" | "rose" | "gray";
  onClick: () => void;
}) {
  const toneColors =
    tone === "green"
      ? { c: THEME.green, bg: THEME.greenSoft, b: THEME.greenBorder }
      : tone === "rose"
        ? { c: THEME.rose, bg: THEME.roseSoft, b: THEME.roseBorder }
        : tone === "gold"
          ? { c: THEME.gold, bg: THEME.goldSoft, b: THEME.goldBorder }
          : tone === "gray"
            ? { c: THEME.gray, bg: THEME.graySoft, b: THEME.grayBorder }
            : { c: THEME.textPrimary, bg: "transparent", b: THEME.border };

  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12.5px] font-medium tracking-tight transition-all"
      style={{
        background: active ? toneColors.bg : "transparent",
        border: `1px solid ${active ? toneColors.b : THEME.border}`,
        color: active ? toneColors.c : THEME.textSecondary,
      }}
    >
      {label}
      <span
        className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full text-[10.5px] font-semibold tabular-nums"
        style={{
          background: active ? "#151521" : THEME.bgSoft,
          color: active ? toneColors.c : THEME.textTertiary,
          border: `1px solid ${active ? toneColors.b : THEME.border}`,
        }}
      >
        {count}
      </span>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════
export default function CreadoresPage() {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [stateCounts, setStateCounts] = useState<StateCounts>({
    all: 0, champion: 0, active: 0, new: 0, silent: 0, paused: 0,
  });
  const [totals, setTotals] = useState({ count: 0, revenue: 0, orders: 0, commissionEarned: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [sort, setSort] = useState<"revenue" | "recent" | "name" | "orders">("revenue");
  const [applicationsCount, setApplicationsCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (stateFilter !== "all") params.set("state", stateFilter);
        if (sort) params.set("sort", sort);
        if (q) params.set("q", q);
        const r = await fetch(`/api/aura/creators/list?${params.toString()}`, {
          cache: "no-store",
        });
        const data = await r.json();
        if (cancelled) return;
        if (!r.ok) throw new Error(data.error || "Error");
        setCreators(data.creators ?? []);
        setStateCounts(data.stateCounts ?? {
          all: 0, champion: 0, active: 0, new: 0, silent: 0, paused: 0,
        });
        setTotals(data.totals ?? { count: 0, revenue: 0, orders: 0, commissionEarned: 0 });
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [q, stateFilter, sort]);

  // load applications count for top banner
  useEffect(() => {
    fetch("/api/aura/applications/list", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setApplicationsCount(d?.totals?.pending ?? 0))
      .catch(() => {});
  }, []);

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
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="max-w-[1400px] mx-auto px-8 py-10">
        {/* ─── HEADER ──────────────────────────────────────── */}
        <header
          className="mb-8"
          style={{ animation: `fadeInDown 520ms ${ES} both` }}
        >
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <div
                className="text-[11px] tracking-[0.18em] uppercase font-medium mb-2"
                style={{ color: THEME.textMuted }}
              >
                Aura · Programa de creadores
              </div>
              <h1
                className="text-[34px] font-semibold tracking-tight leading-none"
                style={{
                  background: "linear-gradient(90deg, #ff0080 0%, #a855f7 50%, #00d4ff 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                Creadores
              </h1>
              <p
                className="mt-2 text-[14px] tracking-tight"
                style={{ color: THEME.textSecondary }}
              >
                {loading
                  ? "Cargando..."
                  : `${totals.count} ${totals.count === 1 ? "creador" : "creadores"} · ${fmtARS(totals.revenue)} en revenue atribuido`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/aura/creadores/aplicaciones"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium tracking-tight transition-all"
                style={{
                  background: applicationsCount > 0 ? THEME.goldSoft : THEME.bgCard,
                  border: `1px solid ${applicationsCount > 0 ? THEME.goldBorder : THEME.border}`,
                  color: applicationsCount > 0 ? THEME.gold : THEME.textPrimary,
                }}
              >
                <Inbox size={14} strokeWidth={2.2} />
                Aplicaciones
                {applicationsCount > 0 ? (
                  <span
                    className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full text-[10.5px] font-semibold tabular-nums"
                    style={{
                      background: THEME.gold,
                      color: "#FFF",
                    }}
                  >
                    {applicationsCount}
                  </span>
                ) : null}
              </Link>
              <Link
                href="/influencers/new"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold tracking-tight transition-all hover:brightness-110"
                style={{
                  background:
                    "linear-gradient(135deg, #ff0080 0%, #a855f7 50%, #00d4ff 100%)",
                  color: "#FFF",
                  boxShadow:
                    "0 4px 20px rgba(244,114,182,0.35), inset 0 1px 0 rgba(255,255,255,0.18)",
                }}
              >
                <Plus size={14} strokeWidth={2.4} />
                Nuevo creador
              </Link>
            </div>
          </div>
        </header>

        {/* ─── SUMMARY BAR ──────────────────────────────────── */}
        <div
          className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-px rounded-2xl overflow-hidden"
          style={{
            background: THEME.border,
            border: `1px solid ${THEME.border}`,
            animation: `fadeInDown 560ms ${ES} 80ms both`,
          }}
        >
          <SummaryCell
            label="Revenue atribuido"
            value={fmtARS(totals.revenue)}
            icon={<TrendingUp size={14} strokeWidth={2.2} />}
          />
          <SummaryCell
            label="Órdenes"
            value={fmtNum(totals.orders)}
            icon={<ArrowUpRight size={14} strokeWidth={2.2} />}
          />
          <SummaryCell
            label="Comisión generada"
            value={fmtARS(totals.commissionEarned)}
            icon={<Sparkles size={14} strokeWidth={2.2} />}
          />
          <SummaryCell
            label="Creadores activos"
            value={fmtNum(stateCounts.champion + stateCounts.active + stateCounts.new)}
            icon={<Users size={14} strokeWidth={2.2} />}
          />
        </div>

        {/* ─── TOOLBAR: SEARCH + FILTERS + SORT ─────────────── */}
        <div
          className="mb-5 flex items-center gap-3 flex-wrap"
          style={{ animation: `fadeInDown 600ms ${ES} 120ms both` }}
        >
          {/* Search */}
          <div
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl w-full md:w-80"
            style={{
              background: THEME.bgCard,
              border: `1px solid ${THEME.border}`,
            }}
          >
            <Search size={15} strokeWidth={2} style={{ color: THEME.textMuted }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre, código o email..."
              className="flex-1 bg-transparent outline-none text-[13px] tracking-tight"
              style={{ color: THEME.textPrimary }}
            />
          </div>

          {/* Sort */}
          <div
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl"
            style={{
              background: THEME.bgCard,
              border: `1px solid ${THEME.border}`,
            }}
          >
            <SlidersHorizontal size={14} strokeWidth={2} style={{ color: THEME.textMuted }} />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as any)}
              className="bg-transparent outline-none text-[13px] tracking-tight"
              style={{ color: THEME.textPrimary }}
            >
              <option value="revenue">Ordenar: Mayor revenue</option>
              <option value="recent">Ordenar: Última venta</option>
              <option value="orders">Ordenar: Más órdenes</option>
              <option value="name">Ordenar: Nombre</option>
            </select>
          </div>
        </div>

        {/* ─── FILTER CHIPS ─────────────────────────────────── */}
        <div
          className="mb-6 flex items-center gap-2 flex-wrap"
          style={{ animation: `fadeInDown 640ms ${ES} 160ms both` }}
        >
          <FilterChip
            label="Todos"
            count={stateCounts.all}
            active={stateFilter === "all"}
            onClick={() => setStateFilter("all")}
          />
          <FilterChip
            label="Campeones"
            count={stateCounts.champion}
            active={stateFilter === "champion"}
            tone="green"
            onClick={() => setStateFilter("champion")}
          />
          <FilterChip
            label="Activos"
            count={stateCounts.active}
            active={stateFilter === "active"}
            tone="gold"
            onClick={() => setStateFilter("active")}
          />
          <FilterChip
            label="Nuevos"
            count={stateCounts.new}
            active={stateFilter === "new"}
            tone="gold"
            onClick={() => setStateFilter("new")}
          />
          <FilterChip
            label="Silenciosos"
            count={stateCounts.silent}
            active={stateFilter === "silent"}
            tone="rose"
            onClick={() => setStateFilter("silent")}
          />
          <FilterChip
            label="Pausados"
            count={stateCounts.paused}
            active={stateFilter === "paused"}
            tone="gray"
            onClick={() => setStateFilter("paused")}
          />
        </div>

        {/* ─── GRID ─────────────────────────────────────────── */}
        {error ? (
          <div
            className="rounded-2xl p-6 text-center"
            style={{ background: THEME.roseSoft, border: `1px solid ${THEME.roseBorder}`, color: THEME.rose }}
          >
            Error al cargar creadores: {error}
          </div>
        ) : loading ? (
          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl animate-pulse"
                style={{
                  background: THEME.bgCard,
                  border: `1px solid ${THEME.border}`,
                  height: 220,
                }}
              />
            ))}
          </div>
        ) : creators.length === 0 ? (
          <div
            className="rounded-2xl p-12 text-center"
            style={{
              background: THEME.bgCard,
              border: `1px solid ${THEME.border}`,
            }}
          >
            <Users
              size={36}
              strokeWidth={1.6}
              style={{ color: THEME.textMuted, margin: "0 auto 12px" }}
            />
            <h3
              className="text-[16px] font-semibold tracking-tight"
              style={{ color: THEME.textPrimary }}
            >
              No hay creadores que coincidan
            </h3>
            <p
              className="mt-1 text-[13px] tracking-tight"
              style={{ color: THEME.textSecondary }}
            >
              Probá ajustar los filtros o sumar nuevos creadores al programa.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {creators.map((c, i) => (
              <CreatorCard key={c.id} creator={c} delay={i * 40} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────── SUMMARY CELL ─────────────────────────────
function SummaryCell({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div style={{ background: THEME.bgCard, padding: "16px 18px" }}>
      <div
        className="flex items-center gap-1.5 text-[10.5px] tracking-[0.12em] uppercase font-medium mb-2"
        style={{ color: THEME.textMuted }}
      >
        <span style={{ color: THEME.gold }}>{icon}</span>
        {label}
      </div>
      <div
        className="text-[20px] font-semibold tabular-nums tracking-tight"
        style={{ color: THEME.textPrimary }}
      >
        {value}
      </div>
    </div>
  );
}
