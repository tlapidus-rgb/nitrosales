// @ts-nocheck
"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Users, Search, ArrowUpRight, ArrowDownRight, ArrowRight,
  TrendingUp, MapPin, Star, AlertTriangle, Heart, UserPlus,
  ChevronDown, DollarSign, ShoppingCart, RefreshCw, Zap, Flame,
  Crown, Sparkles, Clock, Activity, Filter as FilterIcon,
  Download, X, SlidersHorizontal, CheckCircle2, Globe, Repeat,
  MessageCircle, Mail, Copy, Check, Package, Eye, Hourglass, Moon,
} from "lucide-react";
import { formatARS, formatCompact } from "@/lib/utils/format";
import { SourceLogo, CHANNEL_LABEL, CHANNEL_TINT } from "@/components/bondly/SourceLogo";

// ═══════════════════════════════════════════════════════════════════
// Constantes visuales — biblia Bondly
// ═══════════════════════════════════════════════════════════════════
const ES = "cubic-bezier(0.16, 1, 0.3, 1)";
const BONDLY_GRAD = "linear-gradient(135deg, #10b981 0%, #06b6d4 50%, #6366f1 100%)";
const GOLD_GRAD = "linear-gradient(135deg, #fbbf24 0%, #f97316 100%)";
const VIP_GRAD = "linear-gradient(135deg, #a855f7 0%, #ec4899 50%, #f97316 100%)";

const TIER_CONFIG: Record<string, { icon: any; accent: string; glow: string; label: string }> = {
  VIP:     { icon: Crown,        accent: "#a855f7", glow: "rgba(168,85,247,0.35)",  label: "VIP" },
  Loyal:   { icon: Heart,        accent: "#ec4899", glow: "rgba(236,72,153,0.30)",  label: "LEAL" },
  Regular: { icon: Users,        accent: "#6366f1", glow: "rgba(99,102,241,0.25)",  label: "REGULAR" },
  New:     { icon: Sparkles,     accent: "#06b6d4", glow: "rgba(6,182,212,0.30)",   label: "NUEVO" },
  "At Risk": { icon: AlertTriangle, accent: "#f59e0b", glow: "rgba(245,158,11,0.35)", label: "EN RIESGO" },
  Dormant: { icon: Moon,         accent: "#94a3b8", glow: "rgba(148,163,184,0.25)", label: "DORMIDO" },
};

const QUICK_SEGMENT_CONFIG: Record<string, { icon: any; gradient: string; solid: string; label: string }> = {
  all:            { icon: Users,          gradient: "linear-gradient(135deg, #475569 0%, #1e293b 100%)", solid: "#1e293b", label: "Todos" },
  browsing_now:   { icon: Activity,       gradient: "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)", solid: "#06b6d4", label: "Navegando ahora" },
  new_7d:         { icon: Sparkles,       gradient: "linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)", solid: "#06b6d4", label: "Nuevos 7d" },
  vip:            { icon: Crown,          gradient: "linear-gradient(135deg, #a855f7 0%, #ec4899 100%)", solid: "#a855f7", label: "VIP" },
  champions:      { icon: Star,           gradient: "linear-gradient(135deg, #fbbf24 0%, #f97316 100%)", solid: "#f59e0b", label: "Champions" },
  cart_abandoned: { icon: ShoppingCart,   gradient: "linear-gradient(135deg, #f97316 0%, #ef4444 100%)", solid: "#f97316", label: "Carrito abandonado" },
  reappeared:     { icon: Repeat,         gradient: "linear-gradient(135deg, #10b981 0%, #06b6d4 100%)", solid: "#10b981", label: "Reaparecidos" },
  at_risk:        { icon: AlertTriangle,  gradient: "linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)", solid: "#f59e0b", label: "En riesgo" },
  dormant:        { icon: Moon,           gradient: "linear-gradient(135deg, #64748b 0%, #334155 100%)", solid: "#64748b", label: "Dormidos" },
};

const SORT_OPTIONS = [
  { value: "last_order",       label: "Última compra", hint: "Los que compraron más reciente" },
  { value: "last_visit",       label: "Última visita", hint: "Los más frescos en el sitio (NitroPixel)" },
  { value: "first_identified", label: "Primera compra", hint: "Contactos más nuevos" },
  { value: "ltv",              label: "Gastado total", hint: "Los que más plata dejaron" },
  { value: "orders",           label: "Cantidad de órdenes", hint: "Los más fieles" },
  { value: "aov",              label: "Ticket promedio", hint: "Los de compra más grande" },
  { value: "name",             label: "Alfabético", hint: "A-Z" },
];

const CHANNEL_OPTIONS = [
  { value: null, label: "Todos los canales" },
  { value: "meta", label: "Meta" },
  { value: "google", label: "Google" },
  { value: "tiktok", label: "TikTok" },
  { value: "organic", label: "Orgánico" },
  { value: "direct", label: "Directo" },
  { value: "referral", label: "Referral" },
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "other", label: "Otro" },
];

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function toDateInputValue(date: Date): string {
  return date.toISOString().split("T")[0];
}

function initialsFrom(name: string): string {
  if (!name) return "·";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "·";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Gradient colors deterministic from customer id
function avatarGradientFor(id: string): string {
  const GRADIENTS = [
    "linear-gradient(135deg, #06b6d4 0%, #6366f1 100%)",
    "linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)",
    "linear-gradient(135deg, #10b981 0%, #06b6d4 100%)",
    "linear-gradient(135deg, #a855f7 0%, #ec4899 100%)",
    "linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)",
    "linear-gradient(135deg, #ec4899 0%, #a855f7 100%)",
    "linear-gradient(135deg, #f97316 0%, #fbbf24 100%)",
    "linear-gradient(135deg, #14b8a6 0%, #0891b2 100%)",
    "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
    "linear-gradient(135deg, #0ea5e9 0%, #22d3ee 100%)",
  ];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return "ahora";
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min}m`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months}mes`;
  return `hace ${Math.floor(months / 12)}a`;
}

function formatDateShort(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, "0");
    const month = d.toLocaleString("es-AR", { month: "short" }).replace(".", "");
    const year = String(d.getFullYear()).slice(2);
    return `${day} ${month} ${year}`;
  } catch {
    return "—";
  }
}

// Count-up animation hook
function useCountUp(target: number, durationMs: number = 900): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const fromRef = useRef<number>(0);

  useEffect(() => {
    fromRef.current = value;
    startRef.current = performance.now();
    const animate = (now: number) => {
      const t = Math.min(1, (now - startRef.current) / durationMs);
      const eased = 1 - Math.pow(1 - t, 4);
      setValue(Math.round(fromRef.current + (target - fromRef.current) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return value;
}

// ═══════════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════════
export default function ClientesPage() {
  const router = useRouter();

  const defaultTo = new Date();
  const defaultFrom = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const [dateFrom, setDateFrom] = useState(toDateInputValue(defaultFrom));
  const [dateTo, setDateTo] = useState(toDateInputValue(defaultTo));

  const [quickSegment, setQuickSegment] = useState<string>("all");
  const [sort, setSort] = useState<string>("last_order");
  const [channel, setChannel] = useState<string | null>(null);
  const [segment, setSegment] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        from: dateFrom, to: dateTo,
        page: String(page),
        pageSize: "25",
        sort,
        quickSegment,
      });
      if (channel) params.set("channel", channel);
      if (segment) params.set("segment", segment);
      if (city) params.set("city", city);
      if (debouncedSearch) params.set("search", debouncedSearch);

      const res = await fetch(`/api/bondly/clientes?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "API error");
      setData(j);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, page, sort, quickSegment, channel, segment, city, debouncedSearch]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // reset page when filters change
  useEffect(() => { setPage(1); }, [sort, quickSegment, channel, segment, city]);

  const kpis = data?.kpis || { totalCustomers: 0, new7d: 0, activeNow: 0, vipCount: 0 };
  const customers = data?.customers || [];
  const quickSegments = data?.quickSegments || [];
  const pagination = data?.pagination;
  const filters = data?.filters || { cities: [] };

  const activeFiltersCount = (channel ? 1 : 0) + (segment ? 1 : 0) + (city ? 1 : 0);

  // Export CSV
  const exportCsv = useCallback(() => {
    if (!customers || customers.length === 0) return;
    const header = [
      "Nombre", "Email", "Teléfono", "Ciudad", "Tier", "Segmento",
      "Órdenes", "Gastado total", "Ticket promedio",
      "Primera compra", "Última compra", "Últ. visita",
      "Canal adquisición", "Activo ahora", "Flags",
    ];
    const rows = customers.map((c: any) => [
      c.name, c.email || "", c.phone || "", c.city || "",
      c.tier, c.segment, c.totalOrders, c.totalSpent, c.avgTicket,
      c.firstOrderAt || "", c.lastOrderAt || "", c.lastVisitAt || "",
      c.acquisitionChannel || "", c.isActiveNow ? "SI" : "NO", (c.flags || []).join("|"),
    ]);
    const csv = [header, ...rows].map(r => r.map(cell => {
      const s = String(cell ?? "");
      return s.includes(",") || s.includes("\"") || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bondly-clientes-${quickSegment}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [customers, quickSegment]);

  return (
    <div className="space-y-6 pb-12">
      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  HERO CON AURORAS + KPIs                                     */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div
        className="relative overflow-hidden rounded-3xl"
        style={{
          background: "linear-gradient(180deg, #ffffff 0%, #fafbfd 100%)",
          boxShadow:
            "0 1px 0 rgba(15,23,42,0.06), 0 14px 38px -18px rgba(15,23,42,0.18), 0 34px 60px -40px rgba(15,23,42,0.18)",
        }}
      >
        {/* Auroras */}
        <div className="absolute inset-0 pointer-events-none">
          <div style={{
            position: "absolute", top: "-30%", left: "-10%", width: "55%", height: "140%",
            background: "radial-gradient(circle, rgba(16,185,129,0.18) 0%, transparent 60%)",
            filter: "blur(50px)",
          }} />
          <div style={{
            position: "absolute", top: "-20%", right: "-10%", width: "55%", height: "140%",
            background: "radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 60%)",
            filter: "blur(60px)",
          }} />
          <div style={{
            position: "absolute", bottom: "-50%", left: "30%", width: "40%", height: "100%",
            background: "radial-gradient(circle, rgba(6,182,212,0.12) 0%, transparent 60%)",
            filter: "blur(60px)",
          }} />
        </div>

        {/* Prism delimiter bottom */}
        <div
          className="absolute bottom-0 left-0 right-0 h-[2px]"
          style={{ background: BONDLY_GRAD }}
        />

        <div className="relative px-6 md:px-8 pt-7 pb-8">
          {/* Breadcrumb / badge */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]"
                style={{
                  background: "linear-gradient(135deg, rgba(16,185,129,0.10), rgba(99,102,241,0.10))",
                  color: "#0f172a",
                  border: "1px solid rgba(15,23,42,0.08)",
                }}
              >
                <Heart size={11} style={{ color: "#10b981" }} />
                <span>BONDLY · CUSTOMER 360</span>
              </div>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium text-emerald-700"
                style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.18)" }}
                title="Bondly sólo usa datos de VTEX (tienda propia). Los marketplaces no comparten identidad del cliente."
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                VTEX · Tienda propia
              </span>
            </div>
            <span className="text-[10px] font-mono tracking-[0.2em] uppercase text-slate-400">
              UPDATED {data?.updatedAt ? new Date(data.updatedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : "—"}
            </span>
          </div>

          {/* Titulo */}
          <h1 className="text-3xl md:text-[40px] font-semibold tracking-tight text-slate-900 mb-2 leading-[1.05]">
            Clientes
          </h1>
          <p className="text-sm text-slate-500 max-w-2xl mb-7">
            Cada persona que compró o interactuó con tu tienda. Filtra, ordena y explora perfiles 360.
          </p>

          {/* KPI tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <KpiTile icon={Users}      iconBg="#eef2ff" iconColor="#6366f1"
              label="CLIENTES EN PERÍODO" value={kpis.totalCustomers} loading={loading && !data} />
            <KpiTile icon={Sparkles}   iconBg="#ecfeff" iconColor="#06b6d4"
              label="NUEVOS 7 DÍAS"      value={kpis.new7d}        loading={loading && !data} />
            <KpiTile icon={Activity}   iconBg="#ecfdf5" iconColor="#10b981"
              label="NAVEGANDO AHORA"   value={kpis.activeNow}    loading={loading && !data} live={kpis.activeNow > 0} />
            <KpiTile icon={Crown}      iconBg="#f5f3ff" iconColor="#a855f7"
              label="VIP (DECIL TOP)"   value={kpis.vipCount}     loading={loading && !data} />
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  QUICK SEGMENTS · chips con count                             */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="relative">
        <div
          className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1"
          style={{ scrollbarWidth: "thin" }}
        >
          {quickSegments.map((seg: any, idx: number) => {
            const cfg = QUICK_SEGMENT_CONFIG[seg.key] || QUICK_SEGMENT_CONFIG.all;
            const Icon = cfg.icon;
            const active = quickSegment === seg.key;
            return (
              <button
                key={seg.key}
                onClick={() => setQuickSegment(seg.key)}
                className="group relative flex items-center gap-2 rounded-xl px-3 py-2 whitespace-nowrap"
                style={{
                  background: active ? cfg.gradient : "#ffffff",
                  color: active ? "#ffffff" : "#0f172a",
                  border: active ? "1px solid transparent" : "1px solid rgba(15,23,42,0.08)",
                  boxShadow: active
                    ? `0 8px 24px -10px ${cfg.solid}80, 0 2px 0 rgba(255,255,255,0.2) inset`
                    : "0 1px 0 rgba(15,23,42,0.04)",
                  transition: `all 220ms ${ES}`,
                  animation: `bondlySlideIn 420ms ${ES} ${idx * 40}ms both`,
                }}
              >
                <Icon size={14} strokeWidth={2.2} />
                <span className="text-[12px] font-semibold tracking-tight">{seg.label}</span>
                <span
                  className="text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded-md"
                  style={{
                    background: active ? "rgba(255,255,255,0.22)" : "rgba(15,23,42,0.04)",
                    color: active ? "#ffffff" : "#475569",
                  }}
                >
                  {seg.count.toLocaleString("es-AR")}
                </span>
                {seg.key === "browsing_now" && seg.count > 0 && (
                  <span className="relative flex h-2 w-2 ml-0.5">
                    <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
                      style={{ background: active ? "#ffffff" : "#06b6d4" }} />
                    <span className="relative inline-flex rounded-full h-2 w-2"
                      style={{ background: active ? "#ffffff" : "#06b6d4" }} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  FILTER BAR                                                   */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div
        className="rounded-2xl bg-white p-3 flex flex-col md:flex-row md:items-center gap-3"
        style={{
          border: "1px solid rgba(15,23,42,0.06)",
          boxShadow: "0 1px 0 rgba(15,23,42,0.04), 0 12px 30px -18px rgba(15,23,42,0.12)",
        }}
      >
        {/* Search */}
        <div className="relative flex-1 min-w-0">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, email o teléfono…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-9 py-2.5 text-sm rounded-xl bg-slate-50 text-slate-900 placeholder-slate-400 outline-none"
            style={{
              border: "1px solid rgba(15,23,42,0.06)",
              transition: `all 200ms ${ES}`,
            }}
            onFocus={(e) => {
              e.currentTarget.style.background = "#ffffff";
              e.currentTarget.style.borderColor = "rgba(15,23,42,0.16)";
              e.currentTarget.style.boxShadow = "0 0 0 4px rgba(99,102,241,0.10)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.background = "#f8fafc";
              e.currentTarget.style.borderColor = "rgba(15,23,42,0.06)";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Sort dropdown */}
        <SelectDropdown
          icon={SlidersHorizontal}
          label="Ordenar"
          value={sort}
          options={SORT_OPTIONS.map(o => ({ value: o.value, label: o.label, hint: o.hint }))}
          onChange={setSort}
        />

        {/* Channel dropdown */}
        <SelectDropdown
          icon={Globe}
          label="Canal"
          value={channel || ""}
          options={CHANNEL_OPTIONS.map(o => ({
            value: o.value || "", label: o.label,
            leftIcon: o.value ? <SourceLogo channel={o.value as any} size={12} /> : null,
          }))}
          onChange={(v) => setChannel(v || null)}
        />

        {/* Filters toggle */}
        <button
          onClick={() => setIsFiltersOpen(!isFiltersOpen)}
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium"
          style={{
            background: activeFiltersCount > 0 ? "#0f172a" : "#ffffff",
            color: activeFiltersCount > 0 ? "#ffffff" : "#0f172a",
            border: "1px solid rgba(15,23,42,0.08)",
            transition: `all 200ms ${ES}`,
          }}
        >
          <FilterIcon size={14} />
          <span>Más filtros</span>
          {activeFiltersCount > 0 && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/20">
              {activeFiltersCount}
            </span>
          )}
        </button>

        {/* Export CSV */}
        <button
          onClick={exportCsv}
          disabled={!customers.length}
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
          style={{
            border: "1px solid rgba(15,23,42,0.08)",
            transition: `all 200ms ${ES}`,
          }}
          title="Exportar CSV de la vista filtrada"
        >
          <Download size={14} />
          <span>Exportar</span>
        </button>
      </div>

      {/* Expanded filters row */}
      {isFiltersOpen && (
        <div
          className="rounded-2xl bg-white p-4 grid grid-cols-1 md:grid-cols-3 gap-3"
          style={{
            border: "1px solid rgba(15,23,42,0.06)",
            boxShadow: "0 1px 0 rgba(15,23,42,0.04)",
            animation: `bondlyFadeSlideIn 260ms ${ES}`,
          }}
        >
          <FieldSelect
            label="Segmento RFM"
            value={segment || ""}
            onChange={(v) => setSegment(v || null)}
            options={[
              { value: "", label: "Todos los segmentos" },
              { value: "Champions", label: "Champions" },
              { value: "Leales", label: "Leales" },
              { value: "Nuevos", label: "Nuevos" },
              { value: "Potenciales", label: "Potenciales" },
              { value: "Ocasionales", label: "Ocasionales" },
              { value: "En riesgo", label: "En riesgo" },
              { value: "Perdidos", label: "Perdidos" },
            ]}
          />
          <FieldSelect
            label="Ciudad"
            value={city || ""}
            onChange={(v) => setCity(v || null)}
            options={[
              { value: "", label: "Todas las ciudades" },
              ...(filters.cities || []).map((c: any) => ({ value: c.city, label: `${c.city} · ${c.count}` })),
            ]}
          />
          <div className="flex items-end gap-2">
            <button
              onClick={() => { setChannel(null); setSegment(null); setCity(null); setSearch(""); setQuickSegment("all"); }}
              className="text-xs font-medium text-slate-500 hover:text-slate-900 underline underline-offset-2"
            >
              Limpiar filtros
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  RESULTS META                                                 */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-slate-500">
          {loading ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-slate-400 animate-pulse" />
              Cargando…
            </span>
          ) : (
            <>
              Mostrando <span className="font-semibold text-slate-900 tabular-nums">{customers.length.toLocaleString("es-AR")}</span>
              {pagination && (
                <>
                  {" "}de <span className="font-semibold text-slate-900 tabular-nums">{pagination.totalFiltered.toLocaleString("es-AR")}</span> clientes
                </>
              )}
              {quickSegment !== "all" && (
                <>
                  {" · "}
                  <span className="font-medium" style={{ color: QUICK_SEGMENT_CONFIG[quickSegment]?.solid }}>
                    {QUICK_SEGMENT_CONFIG[quickSegment]?.label}
                  </span>
                </>
              )}
            </>
          )}
        </p>
        <div className="flex items-center gap-1 text-[10px] font-mono tracking-[0.2em] uppercase text-slate-400">
          <span>SORT:</span>
          <span className="text-slate-700 font-medium normal-case tracking-normal">
            {SORT_OPTIONS.find(o => o.value === sort)?.label}
          </span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  CUSTOMER CARDS GRID                                          */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {loading && !data ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <CustomerSkeleton key={i} />)}
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-white p-10 text-center" style={{ border: "1px solid rgba(15,23,42,0.06)" }}>
          <AlertTriangle size={32} className="text-amber-500 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-900">Error al cargar clientes</p>
          <p className="text-xs text-slate-500 mt-1">{error}</p>
          <button onClick={() => fetchData()} className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800">
            <RefreshCw size={12} /> Reintentar
          </button>
        </div>
      ) : customers.length === 0 ? (
        <EmptyState quickSegment={quickSegment} onReset={() => { setQuickSegment("all"); setChannel(null); setSegment(null); setSearch(""); }} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {customers.map((c: any, idx: number) => (
            <CustomerCard key={c.id} customer={c} index={idx} onClick={() => router.push(`/bondly/clientes/${c.id}`)} />
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  PAGINATION                                                   */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {pagination && pagination.totalPages > 1 && (
        <div
          className="rounded-2xl bg-white px-4 py-3 flex items-center justify-between"
          style={{
            border: "1px solid rgba(15,23,42,0.06)",
            boxShadow: "0 1px 0 rgba(15,23,42,0.04)",
          }}
        >
          <p className="text-xs text-slate-500 tabular-nums">
            Página <span className="font-semibold text-slate-900">{page}</span> de <span className="font-semibold text-slate-900">{pagination.totalPages}</span>
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
              style={{ border: "1px solid rgba(15,23,42,0.08)", transition: `all 200ms ${ES}` }}
            >
              Anterior
            </button>
            <button
              onClick={() => setPage(Math.min(pagination.totalPages, page + 1))}
              disabled={page >= pagination.totalPages}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "#0f172a", transition: `all 200ms ${ES}` }}
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {/* Global styles */}
      <style jsx global>{`
        @keyframes bondlyFadeSlideIn {
          0% { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes bondlySlideIn {
          0% { opacity: 0; transform: translateY(4px) scale(0.98); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes bondlyShimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes bondlyLivePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(6,182,212,0.45); }
          50%      { box-shadow: 0 0 0 6px rgba(6,182,212,0.0); }
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// KpiTile
// ═══════════════════════════════════════════════════════════════════
function KpiTile({ icon: Icon, iconBg, iconColor, label, value, loading, live }: any) {
  const displayValue = useCountUp(value || 0, 800);
  return (
    <div
      className="relative rounded-2xl bg-white p-5 overflow-hidden"
      style={{
        border: "1px solid rgba(15,23,42,0.06)",
        boxShadow: "0 1px 0 rgba(15,23,42,0.04), 0 12px 30px -18px rgba(15,23,42,0.12)",
        animation: `bondlyFadeSlideIn 420ms ${ES}`,
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: iconBg }}>
          <Icon size={16} style={{ color: iconColor }} strokeWidth={2.2} />
        </div>
        {live && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono tracking-[0.15em] uppercase"
            style={{
              background: "rgba(6,182,212,0.10)",
              color: "#0891b2",
              animation: `bondlyLivePulse 2.4s ${ES} infinite`,
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
            LIVE
          </span>
        )}
      </div>
      <p className="text-[10px] font-mono tracking-[0.22em] uppercase text-slate-400 mb-1">{label}</p>
      {loading ? (
        <div className="h-10 w-24 rounded bg-slate-100" style={{
          backgroundImage: "linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%)",
          backgroundSize: "200% 100%",
          animation: `bondlyShimmer 1.6s ease-in-out infinite`,
        }} />
      ) : (
        <p className="text-[32px] font-semibold tabular-nums tracking-tight text-slate-900 leading-none">
          {displayValue.toLocaleString("es-AR")}
        </p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CustomerCard — la unidad visual premium
// ═══════════════════════════════════════════════════════════════════
function CustomerCard({ customer: c, index, onClick }: any) {
  const tier = TIER_CONFIG[c.tier] || TIER_CONFIG.Regular;
  const TierIcon = tier.icon;
  const avatarGrad = avatarGradientFor(c.id);

  const primaryFlag = c.flags?.find((f: string) => ["vip", "browsing_now", "cart_abandoned", "reappeared", "new_7d"].includes(f));

  return (
    <button
      onClick={onClick}
      className="group relative text-left w-full rounded-2xl bg-white p-4 overflow-hidden"
      style={{
        border: `1px solid rgba(15,23,42,0.06)`,
        boxShadow: "0 1px 0 rgba(15,23,42,0.04), 0 10px 30px -22px rgba(15,23,42,0.20)",
        transition: `all 220ms ${ES}`,
        animation: `bondlyFadeSlideIn 420ms ${ES} ${Math.min(index * 30, 400)}ms both`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = `0 1px 0 rgba(15,23,42,0.06), 0 20px 40px -18px ${tier.glow}, 0 30px 60px -30px rgba(15,23,42,0.20)`;
        e.currentTarget.style.borderColor = `${tier.accent}33`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.boxShadow = "0 1px 0 rgba(15,23,42,0.04), 0 10px 30px -22px rgba(15,23,42,0.20)";
        e.currentTarget.style.borderColor = "rgba(15,23,42,0.06)";
      }}
    >
      {/* Tier accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] opacity-70" style={{ background: tier.accent }} />

      {/* Active now pulse ring (top right) */}
      {c.isActiveNow && (
        <div
          className="absolute top-3 right-3 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-mono tracking-[0.15em] uppercase"
          style={{
            background: "rgba(6,182,212,0.10)",
            color: "#0891b2",
            border: "1px solid rgba(6,182,212,0.2)",
            animation: `bondlyLivePulse 2.4s ${ES} infinite`,
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
          ACTIVO
        </div>
      )}

      <div className="flex gap-3">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-semibold text-sm tracking-tight"
            style={{ background: avatarGrad, boxShadow: `0 6px 18px -8px ${tier.glow}` }}
          >
            {initialsFrom(c.name)}
          </div>
          {/* Tier badge corner */}
          <div
            className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white"
            style={{ background: tier.accent, boxShadow: `0 0 0 2px #ffffff` }}
            title={tier.label}
          >
            <TierIcon size={10} strokeWidth={2.4} />
          </div>
        </div>

        {/* Main column */}
        <div className="flex-1 min-w-0">
          {/* Name + segment chip */}
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-slate-900 truncate">{c.name}</h3>
            <span
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.12em] uppercase flex-shrink-0"
              style={{
                background: `${tier.accent}12`,
                color: tier.accent,
                border: `1px solid ${tier.accent}22`,
              }}
            >
              <TierIcon size={9} strokeWidth={2.4} />
              {tier.label}
            </span>
          </div>

          {/* Email + city */}
          <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-2.5">
            {c.email && <span className="truncate">{c.email}</span>}
            {c.city && (
              <>
                <span className="text-slate-300">·</span>
                <span className="inline-flex items-center gap-0.5 flex-shrink-0">
                  <MapPin size={10} />
                  {c.city}
                </span>
              </>
            )}
          </div>

          {/* Commerce metrics row */}
          <div className="grid grid-cols-3 gap-2 mb-2.5">
            <Metric label="Gastado" value={formatCompact(c.totalSpent)} accent="#10b981" />
            <Metric label="Órdenes" value={c.totalOrders.toString()} accent="#6366f1" />
            <Metric label="Ticket" value={formatCompact(c.avgTicket)} accent="#f59e0b" />
          </div>

          {/* Footer: dates + channel logo */}
          <div className="flex items-center justify-between gap-2 text-[10px]">
            <div className="flex items-center gap-3 text-slate-500">
              <span className="inline-flex items-center gap-1" title="Última compra">
                <ShoppingCart size={10} />
                <span className="font-medium text-slate-700">{formatRelative(c.lastOrderAt)}</span>
              </span>
              {c.lastVisitAt && (
                <span className="inline-flex items-center gap-1" title="Última visita al sitio">
                  <Eye size={10} />
                  <span className="font-medium text-slate-700">{formatRelative(c.lastVisitAt)}</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {c.acquisitionChannel && (
                <SourceLogo channel={c.acquisitionChannel} size={12} withLabel dense />
              )}
              <ArrowRight size={12} className="text-slate-300 group-hover:text-slate-600 group-hover:translate-x-0.5"
                style={{ transition: `all 220ms ${ES}` }} />
            </div>
          </div>

          {/* Flag chips row */}
          {c.flags && c.flags.length > 0 && (
            <div className="flex items-center gap-1 mt-2.5 flex-wrap">
              {c.flags.includes("cart_abandoned") && (
                <FlagChip icon={ShoppingCart} label="Carrito abierto" color="#f97316" />
              )}
              {c.flags.includes("reappeared") && (
                <FlagChip icon={Repeat} label="Reapareció" color="#10b981" />
              )}
              {c.flags.includes("new_7d") && (
                <FlagChip icon={Sparkles} label="Nuevo" color="#06b6d4" />
              )}
              {c.flags.includes("at_risk") && (
                <FlagChip icon={AlertTriangle} label="En riesgo" color="#f59e0b" />
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

function Metric({ label, value, accent }: any) {
  return (
    <div>
      <p className="text-[9px] font-mono tracking-[0.18em] uppercase text-slate-400 mb-0.5">{label}</p>
      <p className="text-sm font-semibold tabular-nums tracking-tight" style={{ color: accent }}>
        {value}
      </p>
    </div>
  );
}

function FlagChip({ icon: Icon, label, color }: any) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.08em] uppercase"
      style={{
        background: `${color}10`,
        color,
        border: `1px solid ${color}22`,
      }}
    >
      <Icon size={9} strokeWidth={2.4} />
      {label}
    </span>
  );
}

function CustomerSkeleton() {
  return (
    <div
      className="rounded-2xl bg-white p-4"
      style={{
        border: "1px solid rgba(15,23,42,0.06)",
        boxShadow: "0 1px 0 rgba(15,23,42,0.04)",
      }}
    >
      <div className="flex gap-3">
        <div className="w-12 h-12 rounded-xl" style={{
          backgroundImage: "linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%)",
          backgroundSize: "200% 100%",
          animation: `bondlyShimmer 1.6s ease-in-out infinite`,
        }} />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-1/2 rounded" style={{
            backgroundImage: "linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%)",
            backgroundSize: "200% 100%",
            animation: `bondlyShimmer 1.6s ease-in-out infinite`,
          }} />
          <div className="h-2.5 w-3/4 rounded" style={{
            backgroundImage: "linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%)",
            backgroundSize: "200% 100%",
            animation: `bondlyShimmer 1.6s ease-in-out infinite`,
          }} />
          <div className="grid grid-cols-3 gap-2 pt-1">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-5 rounded" style={{
                backgroundImage: "linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%)",
                backgroundSize: "200% 100%",
                animation: `bondlyShimmer 1.6s ease-in-out infinite`,
              }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ quickSegment, onReset }: any) {
  return (
    <div
      className="rounded-2xl bg-white p-12 text-center"
      style={{
        border: "1px solid rgba(15,23,42,0.06)",
        boxShadow: "0 1px 0 rgba(15,23,42,0.04)",
      }}
    >
      <div
        className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center"
        style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.10), rgba(6,182,212,0.10))" }}
      >
        <Users size={22} className="text-slate-400" />
      </div>
      <p className="text-sm font-semibold text-slate-900 mb-1">No encontramos clientes con estos filtros</p>
      <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
        Probá reducir los filtros o cambiar el segmento rápido. Bondly sólo trabaja con VTEX (tienda propia), los marketplaces no comparten identidad del cliente.
      </p>
      <button
        onClick={onReset}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 px-3 py-1.5 rounded-lg"
        style={{ transition: `all 200ms ${ES}` }}
      >
        <RefreshCw size={12} />
        Limpiar filtros
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Form primitives
// ═══════════════════════════════════════════════════════════════════
function SelectDropdown({ icon: Icon, label, value, options, onChange }: any) {
  return (
    <div className="relative">
      <Icon size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none pl-7 pr-7 py-2 rounded-xl text-sm font-medium text-slate-900 bg-white min-w-[160px] cursor-pointer"
        style={{
          border: "1px solid rgba(15,23,42,0.08)",
          transition: `all 200ms ${ES}`,
        }}
      >
        {options.map((o: any) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
    </div>
  );
}

function FieldSelect({ label, value, onChange, options }: any) {
  return (
    <div>
      <p className="text-[10px] font-mono tracking-[0.18em] uppercase text-slate-400 mb-1.5">{label}</p>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="appearance-none w-full px-3 pr-8 py-2 rounded-xl text-sm text-slate-900 bg-slate-50 cursor-pointer"
          style={{
            border: "1px solid rgba(15,23,42,0.06)",
            transition: `all 200ms ${ES}`,
          }}
        >
          {options.map((o: any) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      </div>
    </div>
  );
}
