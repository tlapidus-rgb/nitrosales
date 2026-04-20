// @ts-nocheck
"use client";

/**
 * /alertas — Fase 8e (rediseño jerarquizado + favoritas)
 * ─────────────────────────────────────────────────────────────
 * Layout 3-columnas tipo inbox Linear:
 *   - Sidebar (categorías + módulos + productos coming-soon)
 *   - Lista filtrable (severidad segmented + only-unread toggle)
 *   - Detalle (título + meta + body + metrics + actions + callout regla)
 *
 * Favoritas: siempre aparecen primero. Persisten en DB por user.
 * Read state: localStorage-based (session).
 */

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell,
  Inbox,
  DollarSign,
  Receipt,
  CalendarClock,
  Target,
  ShoppingBag,
  RefreshCw,
  Package,
  Sparkles,
  Heart,
  Wand2,
  Zap,
  TrendingUp,
  Star,
  CheckCheck,
  Settings2,
  Archive,
  BellOff,
  ChevronRight,
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  ArrowRight,
  Lightbulb,
} from "lucide-react";

type AlertSource =
  | "finanzas_narrative"
  | "finanzas_predictive"
  | "fiscal_monotributo"
  | "fiscal_calendar"
  | "marketing_cac_ltv"
  | "mercadolibre"
  | "system_sync"
  | "inventory"
  | "aurum"
  | "bondly"
  | "aura"
  | "nitropixel"
  | "custom";

type AlertSeverity = "critical" | "warning" | "info";
type AlertPriority = "HIGH" | "MEDIUM" | "LOW";
type AlertCategory =
  | "finanzas"
  | "fiscal"
  | "marketing"
  | "operaciones"
  | "ventas"
  | "sistema"
  | "asistente";

interface UnifiedAlert {
  id: string;
  source: AlertSource;
  category: AlertCategory;
  severity: AlertSeverity;
  priority: AlertPriority;
  title: string;
  body: string;
  cta?: string | null;
  ctaHref?: string | null;
  metadata?: Record<string, any>;
  createdAt: string;
  favorited?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Módulos del sidebar (orden jerárquico)
// ─────────────────────────────────────────────────────────────
const MODULES: Array<{
  key: string;                              // clave de filtro (source o category)
  filterType: "all" | "favorites" | "source" | "category";
  filterValue?: string;
  label: string;
  Icon: any;
  color: string;
  bg: string;
  comingSoon?: boolean;
}> = [
  { key: "all",            filterType: "all",        label: "Todas",          Icon: Inbox,         color: "#475569", bg: "#f1f5f9" },
  { key: "favorites",      filterType: "favorites",  label: "Favoritas",      Icon: Star,          color: "#d97706", bg: "#fef3c7" },
  // Separador
  { key: "finanzas",       filterType: "category",   filterValue: "finanzas",    label: "Finanzas",       Icon: DollarSign,    color: "#1d4ed8", bg: "#dbeafe" },
  { key: "fiscal",         filterType: "category",   filterValue: "fiscal",      label: "Fiscal",         Icon: Receipt,       color: "#6d28d9", bg: "#ede9fe" },
  { key: "sistema",        filterType: "category",   filterValue: "sistema",     label: "Sistema",        Icon: RefreshCw,     color: "#475569", bg: "#f1f5f9" },
  { key: "mercadolibre",   filterType: "source",     filterValue: "mercadolibre",label: "MercadoLibre",   Icon: ShoppingBag,   color: "#a16207", bg: "#fef3c7" },
  { key: "ventas",         filterType: "category",   filterValue: "ventas",      label: "Ventas",         Icon: Target,        color: "#047857", bg: "#d1fae5" },
  { key: "marketing",      filterType: "category",   filterValue: "marketing",   label: "Marketing",      Icon: TrendingUp,    color: "#be185d", bg: "#fce7f3" },
  { key: "operaciones",    filterType: "category",   filterValue: "operaciones", label: "Operaciones",    Icon: Package,       color: "#c2410c", bg: "#fed7aa" },
  // Productos
  { key: "aurum",          filterType: "source",     filterValue: "aurum",       label: "Aurum",          Icon: Sparkles,      color: "#0284c7", bg: "#e0f2fe" },
  { key: "bondly",         filterType: "source",     filterValue: "bondly",      label: "Bondly",         Icon: Heart,         color: "#9333ea", bg: "#f3e8ff", comingSoon: true },
  { key: "aura",           filterType: "source",     filterValue: "aura",        label: "Aura",           Icon: Wand2,         color: "#be123c", bg: "#ffe4e6", comingSoon: true },
  { key: "nitropixel",     filterType: "source",     filterValue: "nitropixel",  label: "Nitropixel",     Icon: Zap,           color: "#4f46e5", bg: "#e0e7ff", comingSoon: true },
];

const SEV_META: Record<AlertSeverity, { label: string; color: string; bg: string; Icon: any }> = {
  critical: { label: "Crítica",  color: "#b91c1c", bg: "#fef2f2", Icon: AlertCircle },
  warning:  { label: "Atención", color: "#a16207", bg: "#fef3c7", Icon: AlertTriangle },
  info:     { label: "Info",     color: "#1d4ed8", bg: "#eff6ff", Icon: Info },
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `hace ${days} día${days > 1 ? "s" : ""}`;
  const wk = Math.floor(days / 7);
  if (wk < 4) return `hace ${wk} sem`;
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

function groupByTimeframe(alerts: UnifiedAlert[]): Array<{
  label: string;
  items: UnifiedAlert[];
}> {
  const now = Date.now();
  const DAY = 86400000;
  const today: UnifiedAlert[] = [];
  const week: UnifiedAlert[] = [];
  const older: UnifiedAlert[] = [];
  for (const a of alerts) {
    const age = now - new Date(a.createdAt).getTime();
    if (age < DAY) today.push(a);
    else if (age < 7 * DAY) week.push(a);
    else older.push(a);
  }
  const out: Array<{ label: string; items: UnifiedAlert[] }> = [];
  if (today.length) out.push({ label: "Hoy", items: today });
  if (week.length) out.push({ label: "Esta semana", items: week });
  if (older.length) out.push({ label: "Más viejas", items: older });
  return out;
}

const READ_KEY = "nitro_alerts_read_ids_v1";
function loadReadIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(READ_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}
function saveReadIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(READ_KEY, JSON.stringify(Array.from(ids)));
  } catch {}
}

// ═══════════════════════════════════════════════════════════════
// Página
// ═══════════════════════════════════════════════════════════════
export default function AlertasPage() {
  const [alerts, setAlerts] = useState<UnifiedAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<{
    bySource: Record<string, number>;
    bySeverity: Record<string, number>;
    byCategory: Record<string, number>;
    favorites: number;
  }>({ bySource: {}, bySeverity: {}, byCategory: {}, favorites: 0 });

  // Filtros
  const [moduleKey, setModuleKey] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<"all" | AlertSeverity>("all");
  const [onlyUnread, setOnlyUnread] = useState(false);

  // Selection / read
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  // Carga
  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/alerts", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setAlerts(json.alerts ?? []);
      setCounts({
        bySource: json.countsBySource ?? {},
        bySeverity: json.countsBySeverity ?? {},
        byCategory: json.countsByCategory ?? {},
        favorites: json.favoriteCount ?? 0,
      });
      // Autoselect primero si ninguno está seleccionado
      if (!selectedId && json.alerts?.length > 0) {
        setSelectedId(json.alerts[0].id);
      }
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setReadIds(loadReadIds());
    load();
    // eslint-disable-next-line
  }, []);

  // Toggle favorito
  const toggleFavorite = async (alert: UnifiedAlert) => {
    const wasFav = !!alert.favorited;
    // Optimistic
    setAlerts((prev) =>
      prev.map((a) => (a.id === alert.id ? { ...a, favorited: !wasFav } : a))
    );
    setCounts((c) => ({ ...c, favorites: c.favorites + (wasFav ? -1 : 1) }));
    try {
      if (wasFav) {
        await fetch(
          `/api/alerts/favorite?alertId=${encodeURIComponent(alert.id)}`,
          { method: "DELETE" }
        );
      } else {
        await fetch(`/api/alerts/favorite`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ alertId: alert.id }),
        });
      }
    } catch {
      // rollback
      setAlerts((prev) =>
        prev.map((a) => (a.id === alert.id ? { ...a, favorited: wasFav } : a))
      );
      setCounts((c) => ({ ...c, favorites: c.favorites - (wasFav ? -1 : 1) }));
    }
  };

  // Marcar todas leídas
  const markAllRead = () => {
    const next = new Set(readIds);
    for (const a of alerts) next.add(a.id);
    setReadIds(next);
    saveReadIds(next);
  };

  // Click en row -> seleccionar + marcar leída
  const selectAlert = (id: string) => {
    setSelectedId(id);
    if (!readIds.has(id)) {
      const next = new Set(readIds);
      next.add(id);
      setReadIds(next);
      saveReadIds(next);
    }
  };

  // Filtrado
  const filteredAlerts = useMemo(() => {
    let arr = alerts;
    const mod = MODULES.find((m) => m.key === moduleKey);
    if (mod) {
      if (mod.filterType === "favorites") {
        arr = arr.filter((a) => a.favorited);
      } else if (mod.filterType === "source") {
        arr = arr.filter((a) => a.source === mod.filterValue);
      } else if (mod.filterType === "category") {
        arr = arr.filter((a) => a.category === mod.filterValue);
      }
    }
    if (severityFilter !== "all") {
      arr = arr.filter((a) => a.severity === severityFilter);
    }
    if (onlyUnread) {
      arr = arr.filter((a) => !readIds.has(a.id));
    }
    return arr;
  }, [alerts, moduleKey, severityFilter, onlyUnread, readIds]);

  // Alerta seleccionada
  const selected = useMemo(
    () => filteredAlerts.find((a) => a.id === selectedId) ?? filteredAlerts[0] ?? null,
    [filteredAlerts, selectedId]
  );

  // Unread count global
  const unreadCount = useMemo(
    () => alerts.filter((a) => !readIds.has(a.id)).length,
    [alerts, readIds]
  );

  // Count por módulo
  const moduleCount = (m: typeof MODULES[0]): number => {
    if (m.comingSoon) return 0;
    if (m.filterType === "all") return alerts.length;
    if (m.filterType === "favorites") return counts.favorites;
    if (m.filterType === "source") return counts.bySource[m.filterValue!] ?? 0;
    if (m.filterType === "category") return counts.byCategory[m.filterValue!] ?? 0;
    return 0;
  };

  const moduleHasCritical = (m: typeof MODULES[0]): boolean => {
    if (m.comingSoon) return false;
    if (m.filterType === "all") return (counts.bySeverity.critical ?? 0) > 0;
    if (m.filterType === "favorites") {
      return alerts.some((a) => a.favorited && a.severity === "critical");
    }
    if (m.filterType === "source") {
      return alerts.some(
        (a) => a.source === m.filterValue && a.severity === "critical"
      );
    }
    if (m.filterType === "category") {
      return alerts.some(
        (a) => a.category === m.filterValue && a.severity === "critical"
      );
    }
    return false;
  };

  const groupedList = useMemo(
    () => groupByTimeframe(filteredAlerts),
    [filteredAlerts]
  );

  // ═══════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#fafafa",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Aurora subtle */}
      <div
        style={{
          position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
          background:
            "radial-gradient(800px 400px at 80% -10%, rgba(244, 63, 94, 0.05), transparent 60%)," +
            "radial-gradient(700px 400px at 10% 110%, rgba(245, 158, 11, 0.04), transparent 60%)",
        }}
      />

      {/* Header */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          padding: "16px 24px",
          borderBottom: "1px solid rgba(15, 23, 42, 0.06)",
          background: "rgba(255, 255, 255, 0.75)",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            background: "linear-gradient(90deg, #f43f5e, #f59e0b)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Alertas
        </div>
        <div style={{ fontSize: 13, color: "#64748b" }}>
          {loading ? "Cargando…" : `${alerts.length} · ${unreadCount} sin leer`}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          <button
            onClick={load}
            style={{
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 8,
              border: "1px solid rgba(15, 23, 42, 0.1)",
              background: "white",
              color: "#475569",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            <RefreshCw size={14} /> Actualizar
          </button>
          <button
            onClick={markAllRead}
            style={{
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 8,
              border: "1px solid rgba(15, 23, 42, 0.1)",
              background: "white",
              color: "#475569",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            <CheckCheck size={14} /> Marcar todas leídas
          </button>
          <Link
            href="/alertas/reglas"
            style={{
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 8,
              background: "#0f172a",
              color: "white",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              textDecoration: "none",
            }}
          >
            <Settings2 size={14} /> Configurar reglas
          </Link>
        </div>
      </div>

      {/* Main 3-col */}
      <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", overflow: "hidden" }}>
        {/* ─── SIDEBAR CATEGORÍAS ─── */}
        <aside
          style={{
            width: 230,
            padding: "20px 10px",
            borderRight: "1px solid rgba(15, 23, 42, 0.06)",
            background: "rgba(255, 255, 255, 0.5)",
            overflowY: "auto",
          }}
        >
          <div
            style={{
              padding: "0 12px 10px",
              fontSize: 10,
              fontWeight: 700,
              color: "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Ver por módulo
          </div>

          {MODULES.slice(0, 2).map((m) => (
            <ModuleButton
              key={m.key}
              m={m}
              active={moduleKey === m.key}
              count={moduleCount(m)}
              hasCritical={moduleHasCritical(m)}
              onClick={() => setModuleKey(m.key)}
            />
          ))}

          <div
            style={{
              height: 1,
              background: "rgba(15, 23, 42, 0.06)",
              margin: "12px 12px",
            }}
          />

          <div
            style={{
              padding: "0 12px 10px",
              fontSize: 10,
              fontWeight: 700,
              color: "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Secciones
          </div>

          {MODULES.slice(2, 9).map((m) => (
            <ModuleButton
              key={m.key}
              m={m}
              active={moduleKey === m.key}
              count={moduleCount(m)}
              hasCritical={moduleHasCritical(m)}
              onClick={() => setModuleKey(m.key)}
            />
          ))}

          <div
            style={{
              height: 1,
              background: "rgba(15, 23, 42, 0.06)",
              margin: "12px 12px",
            }}
          />

          <div
            style={{
              padding: "0 12px 10px",
              fontSize: 10,
              fontWeight: 700,
              color: "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Productos
          </div>

          {MODULES.slice(9).map((m) => (
            <ModuleButton
              key={m.key}
              m={m}
              active={moduleKey === m.key}
              count={moduleCount(m)}
              hasCritical={moduleHasCritical(m)}
              onClick={() => !m.comingSoon && setModuleKey(m.key)}
            />
          ))}
        </aside>

        {/* ─── COLUMNA LISTA ─── */}
        <div
          style={{
            width: 440,
            borderRight: "1px solid rgba(15, 23, 42, 0.06)",
            background: "white",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Filter bar */}
          <div
            style={{
              padding: "14px 18px 12px",
              borderBottom: "1px solid rgba(15, 23, 42, 0.06)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#94a3b8",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 8,
              }}
            >
              Filtrar por prioridad
            </div>

            <div
              style={{
                display: "flex",
                background: "#f1f5f9",
                borderRadius: 8,
                padding: 3,
                gap: 2,
              }}
            >
              {(["all", "critical", "warning", "info"] as const).map((s) => {
                const isActive = severityFilter === s;
                const label =
                  s === "all"
                    ? "Todas"
                    : s === "critical"
                    ? "Crítica"
                    : s === "warning"
                    ? "Atención"
                    : "Info";
                const count =
                  s === "all"
                    ? alerts.length
                    : counts.bySeverity[s] ?? 0;
                const dotColor =
                  s === "critical" ? "#dc2626" : s === "warning" ? "#f59e0b" : s === "info" ? "#3b82f6" : null;
                return (
                  <button
                    key={s}
                    onClick={() => setSeverityFilter(s)}
                    style={{
                      flex: 1,
                      padding: "6px 8px",
                      fontSize: 12,
                      fontWeight: isActive ? 600 : 500,
                      borderRadius: 6,
                      cursor: "pointer",
                      background: isActive ? "white" : "transparent",
                      color: isActive ? "#0f172a" : "#64748b",
                      boxShadow: isActive
                        ? "0 1px 2px rgba(15, 23, 42, 0.08)"
                        : "none",
                      border: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 5,
                    }}
                  >
                    {dotColor && (
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: dotColor,
                        }}
                      />
                    )}
                    {label}
                    <span
                      style={{
                        fontSize: 10,
                        color: isActive ? "#64748b" : "#94a3b8",
                      }}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: 10,
                fontSize: 12,
              }}
            >
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  color: "#64748b",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={onlyUnread}
                  onChange={(e) => setOnlyUnread(e.target.checked)}
                  style={{ cursor: "pointer" }}
                />
                Solo no leídas ({unreadCount})
              </label>
            </div>
          </div>

          {/* Lista */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                Cargando…
              </div>
            ) : error ? (
              <div style={{ padding: 40, textAlign: "center", color: "#dc2626", fontSize: 13 }}>
                {error}
              </div>
            ) : filteredAlerts.length === 0 ? (
              <EmptyList />
            ) : (
              groupedList.map((group) => (
                <div key={group.label}>
                  <div
                    style={{
                      padding: "14px 18px 6px",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      background: "#fafafa",
                      position: "sticky",
                      top: 0,
                      zIndex: 1,
                      borderBottom: "1px solid rgba(15, 23, 42, 0.04)",
                    }}
                  >
                    {group.label}
                  </div>
                  {group.items.map((a) => (
                    <AlertRow
                      key={a.id}
                      alert={a}
                      selected={selected?.id === a.id}
                      isRead={readIds.has(a.id)}
                      onClick={() => selectAlert(a.id)}
                      onToggleFavorite={() => toggleFavorite(a)}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

        {/* ─── COLUMNA DETALLE ─── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "32px 40px" }}>
          {selected ? (
            <AlertDetail alert={selected} onToggleFavorite={() => toggleFavorite(selected)} />
          ) : (
            <EmptyDetail />
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Subcomponentes
// ─────────────────────────────────────────────────────────────
function ModuleButton({
  m,
  active,
  count,
  hasCritical,
  onClick,
}: {
  m: typeof MODULES[0];
  active: boolean;
  count: number;
  hasCritical: boolean;
  onClick: () => void;
}) {
  const { Icon } = m;
  const isComingSoon = !!m.comingSoon;
  return (
    <button
      onClick={onClick}
      disabled={isComingSoon}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 12px",
        borderRadius: 8,
        fontSize: 13,
        color: active ? "white" : isComingSoon ? "#cbd5e1" : "#475569",
        marginBottom: 2,
        background: active ? "#0f172a" : "transparent",
        border: "none",
        cursor: isComingSoon ? "not-allowed" : "pointer",
        textAlign: "left",
        opacity: isComingSoon ? 0.6 : 1,
      }}
      onMouseEnter={(e) => {
        if (!active && !isComingSoon) {
          (e.currentTarget as HTMLElement).style.background = "rgba(15, 23, 42, 0.04)";
          (e.currentTarget as HTMLElement).style.color = "#0f172a";
        }
      }}
      onMouseLeave={(e) => {
        if (!active && !isComingSoon) {
          (e.currentTarget as HTMLElement).style.background = "transparent";
          (e.currentTarget as HTMLElement).style.color = "#475569";
        }
      }}
    >
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: 7,
          background: active ? "rgba(255, 255, 255, 0.15)" : m.bg,
          color: active ? "white" : m.color,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={14} />
      </span>
      <span style={{ flex: 1 }}>{m.label}</span>
      {isComingSoon ? (
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            padding: "2px 6px",
            borderRadius: 10,
            background: "#f1f5f9",
            color: "#94a3b8",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          Pronto
        </span>
      ) : (
        <>
          {hasCritical && (
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#dc2626",
                boxShadow: "0 0 4px rgba(220, 38, 38, 0.5)",
              }}
            />
          )}
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: active ? "rgba(255, 255, 255, 0.8)" : "#94a3b8",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {count}
          </span>
        </>
      )}
    </button>
  );
}

function AlertRow({
  alert,
  selected,
  isRead,
  onClick,
  onToggleFavorite,
}: {
  alert: UnifiedAlert;
  selected: boolean;
  isRead: boolean;
  onClick: () => void;
  onToggleFavorite: () => void;
}) {
  const sev = SEV_META[alert.severity];
  return (
    <div
      onClick={onClick}
      style={{
        padding: "14px 18px",
        borderBottom: "1px solid rgba(15, 23, 42, 0.04)",
        cursor: "pointer",
        position: "relative",
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        background: selected ? "#fef2f2" : "transparent",
        transition: "background .1s",
      }}
      onMouseEnter={(e) => {
        if (!selected) (e.currentTarget as HTMLElement).style.background = "#f8fafc";
      }}
      onMouseLeave={(e) => {
        if (!selected) (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      {selected && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            background: "linear-gradient(180deg, #dc2626, #f59e0b)",
          }}
        />
      )}
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: sev.color,
          marginTop: 6,
          flexShrink: 0,
          boxShadow:
            alert.severity === "critical"
              ? "0 0 6px rgba(220, 38, 38, 0.5)"
              : "none",
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            lineHeight: 1.4,
            marginBottom: 4,
            fontWeight: isRead ? 400 : 600,
            color: isRead ? "#64748b" : "#0f172a",
            display: "flex",
            alignItems: "flex-start",
            gap: 6,
          }}
        >
          {alert.favorited && (
            <Star
              size={12}
              fill="#f59e0b"
              color="#f59e0b"
              style={{ flexShrink: 0, marginTop: 2 }}
            />
          )}
          <span>{alert.title}</span>
        </div>
        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            fontSize: 11,
            color: "#94a3b8",
          }}
        >
          <span
            style={{
              padding: "2px 7px",
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 500,
              background: "#f1f5f9",
              color: "#475569",
            }}
          >
            {alert.category}
          </span>
          <span style={{ marginLeft: "auto" }}>{timeAgo(alert.createdAt)}</span>
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        title={alert.favorited ? "Quitar favorita" : "Marcar favorita"}
        style={{
          border: "none",
          background: "transparent",
          cursor: "pointer",
          color: alert.favorited ? "#f59e0b" : "#cbd5e1",
          padding: 4,
          borderRadius: 4,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Star size={16} fill={alert.favorited ? "#f59e0b" : "none"} />
      </button>
    </div>
  );
}

function AlertDetail({
  alert,
  onToggleFavorite,
}: {
  alert: UnifiedAlert;
  onToggleFavorite: () => void;
}) {
  const sev = SEV_META[alert.severity];
  const SevIcon = sev.Icon;
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flex: 1 }}>
          <button
            onClick={onToggleFavorite}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: alert.favorited ? "#f59e0b" : "#cbd5e1",
              padding: 4,
              marginTop: 2,
            }}
            title={alert.favorited ? "Quitar favorita" : "Marcar favorita"}
          >
            <Star size={20} fill={alert.favorited ? "#f59e0b" : "none"} />
          </button>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "-0.01em",
              lineHeight: 1.3,
              color: "#0f172a",
              margin: 0,
              flex: 1,
            }}
          >
            {alert.title}
          </h1>
        </div>
        <span
          style={{
            padding: "4px 10px",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            background: sev.bg,
            color: sev.color,
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <SevIcon size={12} />
          {sev.label}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          gap: 16,
          fontSize: 13,
          color: "#64748b",
          marginBottom: 24,
          paddingBottom: 20,
          borderBottom: "1px solid rgba(15, 23, 42, 0.06)",
          flexWrap: "wrap",
        }}
      >
        <span>
          <b style={{ color: "#0f172a", fontWeight: 500 }}>Origen:</b>{" "}
          {alert.source.replace(/_/g, " ")}
        </span>
        <span>
          <b style={{ color: "#0f172a", fontWeight: 500 }}>Detectado:</b>{" "}
          {timeAgo(alert.createdAt)}
        </span>
        <span>
          <b style={{ color: "#0f172a", fontWeight: 500 }}>Categoría:</b>{" "}
          {alert.category}
        </span>
      </div>

      <div
        style={{
          fontSize: 14,
          lineHeight: 1.7,
          color: "#334155",
          marginBottom: 28,
          whiteSpace: "pre-wrap",
        }}
      >
        {alert.body}
      </div>

      {alert.metadata && Object.keys(alert.metadata).length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 10,
            marginBottom: 28,
          }}
        >
          {Object.entries(alert.metadata)
            .slice(0, 6)
            .map(([k, v]) => (
              <div
                key={k}
                style={{
                  padding: 14,
                  background: "white",
                  border: "1px solid rgba(15, 23, 42, 0.06)",
                  borderRadius: 10,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: "#94a3b8",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: 6,
                  }}
                >
                  {k}
                </div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: "#0f172a",
                    wordBreak: "break-all",
                  }}
                >
                  {String(v).slice(0, 60)}
                </div>
              </div>
            ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {alert.ctaHref && (
          <Link
            href={alert.ctaHref}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              background: "#0f172a",
              color: "white",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {alert.cta ?? "Ver detalle"} <ArrowRight size={14} />
          </Link>
        )}
      </div>

      {/* Callout crear regla */}
      <div
        style={{
          marginTop: 32,
          padding: 16,
          background:
            "linear-gradient(135deg, rgba(244, 63, 94, 0.04), rgba(245, 158, 11, 0.04))",
          border: "1px dashed rgba(244, 63, 94, 0.3)",
          borderRadius: 10,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 6,
            color: "#0f172a",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Lightbulb size={14} />
          ¿Querés que te avisemos antes la próxima vez?
        </div>
        <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
          Crear una regla personalizada para esta situación y recibir
          notificación por mail o in-app.{" "}
          <Link
            href="/alertas/reglas"
            style={{ color: "#f43f5e", fontWeight: 500, textDecoration: "none" }}
          >
            Configurar regla →
          </Link>
        </div>
      </div>
    </div>
  );
}

function EmptyList() {
  return (
    <div
      style={{
        padding: 40,
        textAlign: "center",
        color: "#94a3b8",
        fontSize: 13,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
      }}
    >
      <CheckCircle2 size={40} color="#10b981" />
      <div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "#0f172a",
            marginBottom: 4,
          }}
        >
          Sin alertas en este filtro
        </div>
        <div>Todo bajo control.</div>
      </div>
    </div>
  );
}

function EmptyDetail() {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "#94a3b8",
        fontSize: 13,
        gap: 10,
      }}
    >
      <Bell size={36} />
      <div>Elegí una alerta de la lista para ver detalles</div>
    </div>
  );
}
