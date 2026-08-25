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
  UserX, Calendar, UserCheck,
} from "lucide-react";
import { formatARS, formatCompact } from "@/lib/utils/format";
import { SourceLogo, CHANNEL_LABEL, CHANNEL_TINT } from "@/components/bondly/SourceLogo";
import {
  ES,
  TIER_CONFIG,
  QUICK_SEGMENT_CONFIG,
} from "@/components/bondly/constants";
import {
  KpiTile,
  BondlyKeyframes,
} from "@/components/bondly/primitives";

const SORT_OPTIONS = [
  { value: "last_order",       label: "Última compra", hint: "Los que compraron más reciente" },
  { value: "last_visit",       label: "Última visita", hint: "Los más frescos en el sitio (NitroPixel)" },
  { value: "first_identified", label: "Primera compra", hint: "Contactos más nuevos" },
  { value: "ltv",              label: "Gastado total", hint: "Los que más plata dejaron" },
  { value: "orders",           label: "Cantidad de órdenes", hint: "Los más fieles" },
  { value: "aov",              label: "Ticket promedio", hint: "Los de compra más grande" },
  { value: "name",             label: "Alfabético", hint: "A-Z" },
];

const PERIOD_PRESETS: { key: string; label: string; days: number | null }[] = [
  { key: "today", label: "Hoy", days: 0 },
  { key: "7d",    label: "7 días",   days: 7 },
  { key: "30d",   label: "30 días",  days: 30 },
  { key: "90d",   label: "90 días",  days: 90 },
  { key: "12m",   label: "12 meses", days: 365 },
  { key: "all",   label: "Todo",     days: null },
  { key: "custom", label: "Custom",  days: -1 },
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

// Flat warm-ink avatar tone, deterministic from customer id. Enterprise-sober:
// no multicolor gradients — a subtle spread of near-black warm neutrals keeps
// per-customer variety while staying monochrome. White initials read on all.
function avatarToneFor(id: string): string {
  const TONES = ["#1C1B18", "#33312C", "#47443E", "#57544C", "#6B685F"];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
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

// ═══════════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════════
export default function ClientesPage() {
  const router = useRouter();

  const defaultTo = new Date();
  const defaultFrom = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const [dateFrom, setDateFrom] = useState(toDateInputValue(defaultFrom));
  const [dateTo, setDateTo] = useState(toDateInputValue(defaultTo));
  const [periodPreset, setPeriodPreset] = useState<string>("12m");

  const applyPreset = useCallback((key: string) => {
    const preset = PERIOD_PRESETS.find((p) => p.key === key);
    if (!preset) return;
    setPeriodPreset(key);
    if (preset.days === null) {
      // "Todo" → rango muy amplio para no filtrar (5 años)
      const from = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000);
      setDateFrom(toDateInputValue(from));
      setDateTo(toDateInputValue(new Date()));
    } else if (preset.days === -1) {
      // Custom → no toca fechas, el usuario elige abajo
      return;
    } else if (preset.days === 0) {
      // Hoy
      const today = new Date();
      setDateFrom(toDateInputValue(today));
      setDateTo(toDateInputValue(today));
    } else {
      const from = new Date(Date.now() - preset.days * 24 * 60 * 60 * 1000);
      setDateFrom(toDateInputValue(from));
      setDateTo(toDateInputValue(new Date()));
    }
  }, []);

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
        pageSize: "50",
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
          background: "linear-gradient(180deg, #ffffff 0%, #F5F3EE 100%)",
          boxShadow:
            "0 1px 2px rgba(28,27,24,0.04), 0 14px 38px -18px rgba(28,27,24,0.08), 0 34px 60px -40px rgba(28,27,24,0.06)",
        }}
      >
        <div className="relative px-6 md:px-8 pt-7 pb-8">
          {/* Breadcrumb / badge */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]"
                style={{
                  background: "linear-gradient(135deg, rgba(16,185,129,0.10), rgba(47,145,83,0.10))",
                  color: "#1C1B18",
                  border: "1px solid #E5E1D8",
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
            <span className="text-[10px] font-mono tracking-[0.2em] uppercase text-ink-40">
              UPDATED {data?.updatedAt ? new Date(data.updatedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : "—"}
            </span>
          </div>

          {/* Titulo */}
          <h1 className="text-3xl md:text-[40px] font-semibold tracking-tight text-ink mb-2 leading-[1.05]">
            Clientes
          </h1>
          <p className="text-sm text-ink-40 max-w-2xl mb-7">
            Cada persona que compró o interactuó con tu tienda. Filtra, ordena y explora perfiles 360.
          </p>

          {/* KPI tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <KpiTile icon={Users}      iconBg="#F5F3EE" iconColor="#83807A"
              label="PERSONAS EN PERÍODO" value={kpis.totalCustomers} loading={loading && !data} />
            <KpiTile icon={Sparkles}   iconBg="#F5F3EE" iconColor="#83807A"
              label="NUEVOS 7 DÍAS"      value={kpis.new7d}        loading={loading && !data} />
            <KpiTile icon={Activity}   iconBg="#EDF3EE" iconColor="#2F9153"
              label="NAVEGANDO AHORA"   value={kpis.activeNow}    loading={loading && !data} live={kpis.activeNow > 0} />
            <KpiTile icon={Crown}      iconBg="#F5F3EE" iconColor="#83807A"
              label="VIP (DECIL TOP)"   value={kpis.vipCount}     loading={loading && !data} />
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  PERIOD PICKER · presets + custom range                       */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div
        className="rounded-2xl bg-elevated px-3 py-2.5 flex flex-col lg:flex-row lg:items-center gap-3"
        style={{
          border: "1px solid #E5E1D8",
          boxShadow: "0 1px 2px rgba(28,27,24,0.04), 0 12px 30px -18px rgba(28,27,24,0.08)",
        }}
      >
        <div className="flex items-center gap-2 flex-shrink-0">
          <Calendar size={14} className="text-ink-40" />
          <span className="text-[10px] font-mono tracking-[0.2em] uppercase text-ink-40">
            PERÍODO · Última actividad
          </span>
        </div>
        <div
          className="flex gap-1.5 overflow-x-auto flex-1 min-w-0"
          style={{ scrollbarWidth: "thin" }}
        >
          {PERIOD_PRESETS.map((p) => {
            const active = periodPreset === p.key;
            return (
              <button
                key={p.key}
                onClick={() => applyPreset(p.key)}
                className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold whitespace-nowrap"
                style={{
                  background: active ? "#1C1B18" : "#F5F3EE",
                  color: active ? "#ffffff" : "#6B685F",
                  border: active ? "1px solid transparent" : "1px solid #E5E1D8",
                  transition: `all 200ms ${ES}`,
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        {periodPreset === "custom" && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <input
              type="date"
              value={dateFrom}
              max={dateTo}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg px-2 py-1.5 text-[12px] bg-surface text-ink outline-none"
              style={{ border: "1px solid #E5E1D8" }}
            />
            <span className="text-ink-40 text-xs">→</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom}
              max={toDateInputValue(new Date())}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg px-2 py-1.5 text-[12px] bg-surface text-ink outline-none"
              style={{ border: "1px solid #E5E1D8" }}
            />
          </div>
        )}
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
                  color: active ? "#ffffff" : "#1C1B18",
                  border: active ? "1px solid transparent" : "1px solid #E5E1D8",
                  boxShadow: active
                    ? `0 8px 24px -10px ${cfg.solid}80, 0 2px 0 rgba(255,255,255,0.2) inset`
                    : "0 1px 2px rgba(28,27,24,0.04)",
                  transition: `all 220ms ${ES}`,
                  animation: `bondlySlideIn 420ms ${ES} ${idx * 40}ms both`,
                }}
              >
                <Icon size={14} strokeWidth={2.2} />
                <span className="text-[12px] font-semibold tracking-tight">{seg.label}</span>
                <span
                  className="text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded-md"
                  style={{
                    background: active ? "rgba(255,255,255,0.22)" : "rgba(28,27,24,0.04)",
                    color: active ? "#ffffff" : "#6B685F",
                  }}
                >
                  {seg.count.toLocaleString("es-AR")}
                </span>
                {seg.key === "browsing_now" && seg.count > 0 && (
                  <span className="relative inline-flex h-1.5 w-1.5 ml-0.5">
                    <span className="inline-flex rounded-full h-1.5 w-1.5"
                      style={{ background: active ? "#ffffff" : "#2F9153" }} />
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
        className="rounded-2xl bg-elevated p-3 flex flex-col md:flex-row md:items-center gap-3"
        style={{
          border: "1px solid #E5E1D8",
          boxShadow: "0 1px 2px rgba(28,27,24,0.04), 0 12px 30px -18px rgba(28,27,24,0.08)",
        }}
      >
        {/* Search */}
        <div className="relative flex-1 min-w-0">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-40" />
          <input
            type="text"
            placeholder="Buscar por nombre, email o teléfono…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-9 py-2.5 text-sm rounded-xl bg-surface text-ink placeholder-ink-40 outline-none"
            style={{
              border: "1px solid #E5E1D8",
              transition: `all 200ms ${ES}`,
            }}
            onFocus={(e) => {
              e.currentTarget.style.background = "#ffffff";
              e.currentTarget.style.borderColor = "#DCD8CD";
              e.currentTarget.style.boxShadow = "0 0 0 4px rgba(47,145,83,0.10)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.background = "#F5F3EE";
              e.currentTarget.style.borderColor = "#E5E1D8";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-ink-40 hover:text-ink-60 hover:bg-surface-2"
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
            background: activeFiltersCount > 0 ? "#1C1B18" : "#ffffff",
            color: activeFiltersCount > 0 ? "#ffffff" : "#1C1B18",
            border: "1px solid #E5E1D8",
            transition: `all 200ms ${ES}`,
          }}
        >
          <FilterIcon size={14} />
          <span>Más filtros</span>
          {activeFiltersCount > 0 && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-elevated/20">
              {activeFiltersCount}
            </span>
          )}
        </button>

        {/* Export CSV */}
        <button
          onClick={exportCsv}
          disabled={!customers.length}
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-ink-60 bg-elevated disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface"
          style={{
            border: "1px solid #E5E1D8",
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
          className="rounded-2xl bg-elevated p-4 grid grid-cols-1 md:grid-cols-3 gap-3"
          style={{
            border: "1px solid #E5E1D8",
            boxShadow: "0 1px 2px rgba(28,27,24,0.04)",
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
              className="text-xs font-medium text-ink-40 hover:text-ink underline underline-offset-2"
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
        <p className="text-xs text-ink-40">
          {loading ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-ink-40 animate-pulse" />
              Cargando…
            </span>
          ) : (
            <>
              Mostrando <span className="font-semibold text-ink tabular-nums">{customers.length.toLocaleString("es-AR")}</span>
              {pagination && (
                <>
                  {" "}de <span className="font-semibold text-ink tabular-nums">{pagination.totalFiltered.toLocaleString("es-AR")}</span> clientes
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
        <div className="flex items-center gap-1 text-[10px] font-mono tracking-[0.2em] uppercase text-ink-40">
          <span>SORT:</span>
          <span className="text-ink-60 font-medium normal-case tracking-normal">
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
        <div className="rounded-2xl bg-elevated p-10 text-center" style={{ border: "1px solid #E5E1D8" }}>
          <AlertTriangle size={32} className="text-amber-500 mx-auto mb-2" />
          <p className="text-sm font-medium text-ink">Error al cargar clientes</p>
          <p className="text-xs text-ink-40 mt-1">{error}</p>
          <button onClick={() => fetchData()} className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800">
            <RefreshCw size={12} /> Reintentar
          </button>
        </div>
      ) : customers.length === 0 ? (
        <EmptyState quickSegment={quickSegment} onReset={() => { setQuickSegment("all"); setChannel(null); setSegment(null); setSearch(""); }} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {customers.map((c: any, idx: number) => (
            <CustomerCard
              key={c.id}
              customer={c}
              index={idx}
              onClick={() => {
                if (c.kind === "anonymous" || c.tier === "Anonymous") return;
                router.push(`/bondly/clientes/${c.id}`);
              }}
            />
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  PAGINATION                                                   */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {pagination && pagination.totalPages > 1 && (
        <div
          className="rounded-2xl bg-elevated px-4 py-3 flex items-center justify-between flex-wrap gap-3"
          style={{
            border: "1px solid #E5E1D8",
            boxShadow: "0 1px 2px rgba(28,27,24,0.04)",
          }}
        >
          <p className="text-xs text-ink-40 tabular-nums">
            Página <span className="font-semibold text-ink">{page}</span> de <span className="font-semibold text-ink">{pagination.totalPages}</span>
            <span className="hidden sm:inline"> · <span className="font-semibold text-ink">{pagination.totalFiltered.toLocaleString("es-AR")}</span> clientes</span>
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              aria-label="Página anterior"
              className="h-8 w-8 flex items-center justify-center rounded-lg text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface"
              style={{ border: "1px solid #E5E1D8", transition: `all 200ms ${ES}` }}
            >
              ‹
            </button>
            {(() => {
              const total = pagination.totalPages;
              const current = page;
              const pages: (number | "ellipsis")[] = [];
              // Algoritmo: siempre 1 y total; current ± 1; ellipsis en los gaps
              if (total <= 7) {
                for (let i = 1; i <= total; i++) pages.push(i);
              } else {
                pages.push(1);
                if (current <= 4) {
                  pages.push(2, 3, 4, 5, "ellipsis", total);
                } else if (current >= total - 3) {
                  pages.push("ellipsis", total - 4, total - 3, total - 2, total - 1, total);
                } else {
                  pages.push("ellipsis", current - 1, current, current + 1, "ellipsis", total);
                }
              }
              return pages.map((p, idx) => {
                if (p === "ellipsis") {
                  return (
                    <span key={`e-${idx}`} className="h-8 w-8 flex items-center justify-center text-xs text-ink-40 select-none">
                      …
                    </span>
                  );
                }
                const isActive = p === current;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    aria-label={`Ir a página ${p}`}
                    aria-current={isActive ? "page" : undefined}
                    className="h-8 min-w-[32px] px-2 flex items-center justify-center rounded-lg text-xs font-medium tabular-nums"
                    style={{
                      border: "1px solid #E5E1D8",
                      background: isActive ? "#1C1B18" : "transparent",
                      color: isActive ? "#ffffff" : "#1C1B18",
                      transition: `all 200ms ${ES}`,
                    }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "#F5F3EE"; }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                  >
                    {p}
                  </button>
                );
              });
            })()}
            <button
              onClick={() => setPage(Math.min(pagination.totalPages, page + 1))}
              disabled={page >= pagination.totalPages}
              aria-label="Página siguiente"
              className="h-8 w-8 flex items-center justify-center rounded-lg text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface"
              style={{ border: "1px solid #E5E1D8", transition: `all 200ms ${ES}` }}
            >
              ›
            </button>
          </div>
        </div>
      )}

      {/* Global styles (keyframes compartidos del módulo Bondly) */}
      <BondlyKeyframes />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CustomerCard — la unidad visual premium
// ═══════════════════════════════════════════════════════════════════
function CustomerCard({ customer: c, index, onClick }: any) {
  const isAnon = c.kind === "anonymous" || c.tier === "Anonymous";
  const tier = TIER_CONFIG[c.tier] || TIER_CONFIG.Regular;
  const TierIcon = tier.icon;
  const avatarGrad = isAnon ? "#83807A" : avatarToneFor(c.id);

  const primaryFlag = c.flags?.find((f: string) => ["vip", "browsing_now", "cart_abandoned", "reappeared", "new_7d"].includes(f));

  // Anon id short hash for display
  const anonTag = isAnon
    ? (() => {
        const raw = String(c.id || "").replace(/^anon:/, "");
        const short = raw.slice(-6).toUpperCase();
        return `#${short || "VISITOR"}`;
      })()
    : null;

  return (
    <button
      onClick={isAnon ? undefined : onClick}
      disabled={isAnon}
      className="group relative text-left w-full rounded-2xl bg-elevated p-4 overflow-hidden"
      style={{
        border: `1px solid #E5E1D8`,
        boxShadow: "0 1px 2px rgba(28,27,24,0.04), 0 10px 30px -22px rgba(28,27,24,0.10)",
        transition: `all 220ms ${ES}`,
        animation: `bondlyFadeSlideIn 420ms ${ES} ${Math.min(index * 30, 400)}ms both`,
        cursor: isAnon ? "default" : "pointer",
        opacity: isAnon ? 0.88 : 1,
      }}
      onMouseEnter={(e) => {
        if (isAnon) return;
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = `0 1px 2px rgba(28,27,24,0.05), 0 20px 40px -18px ${tier.glow}, 0 30px 60px -30px rgba(28,27,24,0.10)`;
        e.currentTarget.style.borderColor = `${tier.accent}33`;
      }}
      onMouseLeave={(e) => {
        if (isAnon) return;
        e.currentTarget.style.transform = "";
        e.currentTarget.style.boxShadow = "0 1px 2px rgba(28,27,24,0.04), 0 10px 30px -22px rgba(28,27,24,0.10)";
        e.currentTarget.style.borderColor = "#E5E1D8";
      }}
    >
      {/* Tier accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] opacity-70" style={{ background: tier.accent }} />

      {/* Active now pulse ring (top right) */}
      {c.isActiveNow && (
        <div
          className="absolute top-3 right-3 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-geistmono tracking-[0.15em] uppercase bg-accent-soft text-accent border border-accent/20"
          style={{ animation: `bondlyLivePulse 2.4s ${ES} infinite` }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-accent" />
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
            <h3 className="text-sm font-semibold text-ink truncate">
              {isAnon ? "Visitante anónimo" : c.name}
            </h3>
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

          {/* Email + city / anon tag */}
          <div className="flex items-center gap-2 text-[11px] text-ink-40 mb-2.5">
            {isAnon ? (
              <span className="inline-flex items-center gap-1 font-mono tracking-[0.12em] text-ink-40">
                <UserX size={10} />
                {anonTag}
                <span className="text-ink-40">·</span>
                <span className="normal-case tracking-normal text-ink-40">Sin identificar (sólo pixel)</span>
              </span>
            ) : (
              <>
                {c.email && <span className="truncate">{c.email}</span>}
                {c.city && (
                  <>
                    <span className="text-ink-40">·</span>
                    <span className="inline-flex items-center gap-0.5 flex-shrink-0">
                      <MapPin size={10} />
                      {c.city}
                    </span>
                  </>
                )}
              </>
            )}
          </div>

          {/* Commerce metrics row */}
          {isAnon ? (
            <div
              className="rounded-lg px-2.5 py-2 mb-2.5 text-[11px] text-ink-40"
              style={{
                background: "#F5F3EE",
                border: "1px dashed #DCD8CD",
              }}
            >
              <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-ink-40">COMMERCE</span>
              <span className="ml-2">Sin compras — sólo tracking de pixel</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 mb-2.5">
              <Metric label="Gastado" value={formatCompact(c.totalSpent)} accent="#10b981" />
              <Metric label="Órdenes" value={c.totalOrders.toString()} accent="#6366f1" />
              <Metric label="Ticket" value={formatCompact(c.avgTicket)} accent="#f59e0b" />
            </div>
          )}

          {/* Footer: dates + channel logo */}
          <div className="flex items-center justify-between gap-2 text-[10px]">
            <div className="flex items-center gap-3 text-ink-40">
              {!isAnon && (
                <span className="inline-flex items-center gap-1" title="Última compra">
                  <ShoppingCart size={10} />
                  <span className="font-medium text-ink-60">{formatRelative(c.lastOrderAt)}</span>
                </span>
              )}
              {c.lastVisitAt && (
                <span className="inline-flex items-center gap-1" title="Última visita al sitio">
                  <Eye size={10} />
                  <span className="font-medium text-ink-60">{formatRelative(c.lastVisitAt)}</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {c.acquisitionChannel && (
                <SourceLogo channel={c.acquisitionChannel} size={12} withLabel dense />
              )}
              {!isAnon && (
                <ArrowRight size={12} className="text-ink-40 group-hover:text-ink-60 group-hover:translate-x-0.5"
                  style={{ transition: `all 220ms ${ES}` }} />
              )}
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
                <FlagChip icon={Sparkles} label="Nuevo" color="#2F9153" />
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
      <p className="text-[9px] font-mono tracking-[0.18em] uppercase text-ink-40 mb-0.5">{label}</p>
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
      className="rounded-2xl bg-elevated p-4"
      style={{
        border: "1px solid #E5E1D8",
        boxShadow: "0 1px 2px rgba(28,27,24,0.04)",
      }}
    >
      <div className="flex gap-3">
        <div className="w-12 h-12 rounded-xl" style={{
          backgroundImage: "linear-gradient(90deg, #F5F3EE 0%, #EDEAE3 50%, #F5F3EE 100%)",
          backgroundSize: "200% 100%",
          animation: `bondlyShimmer 1.6s ease-in-out infinite`,
        }} />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-1/2 rounded" style={{
            backgroundImage: "linear-gradient(90deg, #F5F3EE 0%, #EDEAE3 50%, #F5F3EE 100%)",
            backgroundSize: "200% 100%",
            animation: `bondlyShimmer 1.6s ease-in-out infinite`,
          }} />
          <div className="h-2.5 w-3/4 rounded" style={{
            backgroundImage: "linear-gradient(90deg, #F5F3EE 0%, #EDEAE3 50%, #F5F3EE 100%)",
            backgroundSize: "200% 100%",
            animation: `bondlyShimmer 1.6s ease-in-out infinite`,
          }} />
          <div className="grid grid-cols-3 gap-2 pt-1">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-5 rounded" style={{
                backgroundImage: "linear-gradient(90deg, #F5F3EE 0%, #EDEAE3 50%, #F5F3EE 100%)",
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
      className="rounded-2xl bg-elevated p-12 text-center"
      style={{
        border: "1px solid #E5E1D8",
        boxShadow: "0 1px 2px rgba(28,27,24,0.04)",
      }}
    >
      <div
        className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center"
        style={{ background: "linear-gradient(135deg, rgba(47,145,83,0.10), rgba(229,225,216,0.10))" }}
      >
        <Users size={22} className="text-ink-40" />
      </div>
      <p className="text-sm font-semibold text-ink mb-1">No encontramos clientes con estos filtros</p>
      <p className="text-xs text-ink-40 max-w-sm mx-auto mb-4">
        Probá reducir los filtros o cambiar el segmento rápido. Bondly sólo trabaja con VTEX (tienda propia), los marketplaces no comparten identidad del cliente.
      </p>
      <button
        onClick={onReset}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-ink hover:bg-ink/90 px-3 py-1.5 rounded-lg"
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
      <Icon size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-40 pointer-events-none" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none pl-7 pr-7 py-2 rounded-xl text-sm font-medium text-ink bg-elevated min-w-[160px] cursor-pointer"
        style={{
          border: "1px solid #E5E1D8",
          transition: `all 200ms ${ES}`,
        }}
      >
        {options.map((o: any) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-40 pointer-events-none" />
    </div>
  );
}

function FieldSelect({ label, value, onChange, options }: any) {
  return (
    <div>
      <p className="text-[10px] font-mono tracking-[0.18em] uppercase text-ink-40 mb-1.5">{label}</p>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="appearance-none w-full px-3 pr-8 py-2 rounded-xl text-sm text-ink bg-surface cursor-pointer"
          style={{
            border: "1px solid #E5E1D8",
            transition: `all 200ms ${ES}`,
          }}
        >
          {options.map((o: any) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-40 pointer-events-none" />
      </div>
    </div>
  );
}
