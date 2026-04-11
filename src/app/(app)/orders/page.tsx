// @ts-nocheck
"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
} from "recharts";
import { formatARS, formatCompact } from "@/lib/utils/format";
import {
  DollarSign, ShoppingCart, CreditCard, XCircle, Package, Users,
  Search, ChevronDown, ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight, Clock,
  Percent, Truck, Tag, ExternalLink, MapPin, Calendar, Info,
  LayoutDashboard, ListOrdered,
} from "lucide-react";
import {
  KpiCard, ChangeBadge, DateRangeFilter, WeeklySummary, StatusFilter,
} from "@/components/dashboard";
import DashboardStyles from "@/components/dashboard/DashboardStyles";
import {
  OrdersHero,
  AtencionHoyBlock,
  ProfitabilityCard,
  CohortsCard,
  LogisticsCard,
  SegmentationCard,
  CouponsCard,
  GeographyCard,
  OrderFlagBadgeGroup,
  SourceTabs,
  SourceSplitBar,
  MercadoLibreCascadeCard,
  MeliCatalogCard,
  OrdersMasterDetail,
  type AnomalyFlag,
  type OrdersV4Namespaces,
} from "@/components/orders";

// -- Types --
interface OrdersData extends OrdersV4Namespaces {
  kpis: {
    totalOrders: number; totalRevenue: number; avgTicket: number;
    totalItems: number; totalShipping: number; totalDiscounts: number;
    cancellationRate: number; cancelledOrders: number; daysInPeriod: number;
    // Tanda 2 extensions (optional for backward compat)
    marginPct?: number; netRevenue?: number; totalCogs?: number;
    changes: { orders: number; revenue: number; avgTicket: number };
  };
  dailySales: Array<{ day: string; orders: number; revenue: number; items: number }>;
  prevDailySales?: Array<{ day: string; orders: number; revenue: number }>;
  salesByDayOfWeek: Array<{ dayName: string; dayOfWeek: number; totalOrders: number; avgOrders: number; totalRevenue: number; avgRevenue: number }>;
  salesByHour: Array<{ hour: number; label: string; totalOrders: number; avgOrders: number; totalRevenue: number; avgRevenue: number }>;
  paymentMethods: Array<{ method: string; orders: number; revenue: number }>;
  statusBreakdown: Array<{ status: string; count: number }>;
  promotionBreakdown?: Array<{ promo: string; orders: number; revenue: number }>;
  topProducts: Array<{ id: string; name: string; brand: string; category: string; imageUrl?: string; unitsSold: number; revenue: number; orders: number }>;
  topCustomers: Array<{ id: string; name: string; email: string; totalOrders: number; totalSpent: number }>;
  recentOrders: Array<{
    id: string; externalId: string; status: string; totalValue: number; itemCount: number;
    paymentMethod: string; source: string; orderDate: string; customerName: string;
    customerEmail: string; items: Array<{ name: string | null; imageUrl?: string; quantity: number; unitPrice: number; totalPrice: number }>;
    promotionNames: string | null;
    discountValue?: number; shippingCost?: number; channel?: string | null;
    deliveryType?: string | null; shippingCarrier?: string | null;
  }>;
  pagination?: { page: number; pageSize: number; totalCount: number; totalPages: number };
  meta: { dateFrom: string; dateTo: string; source: string; daysInPeriod: number; compMode?: string; compOffset?: number; compFrom?: string; compTo?: string };
}

// -- Constants --
const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#8b5cf6", "#f97316", "#14b8a6", "#ec4899", "#94a3b8"];

const STATUS_COLORS: Record<string, string> = {
  PENDING: "#f59e0b", APPROVED: "#3b82f6", INVOICED: "#8b5cf6",
  SHIPPED: "#06b6d4", DELIVERED: "#10b981", CANCELLED: "#ef4444", RETURNED: "#f97316",
};
const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente", APPROVED: "En preparacion", INVOICED: "Facturado",
  SHIPPED: "Enviado", DELIVERED: "Entregado", CANCELLED: "Cancelado", RETURNED: "Devuelto",
};

const QUICK_RANGES = [
  { label: "7 dias", days: 7 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
  { label: "12 meses", days: 365 },
];

// Order status funnel (operational flow)
const STATUS_FUNNEL_ORDER = ["PENDING", "APPROVED", "INVOICED", "SHIPPED", "DELIVERED"];

function toDateInputValue(date: Date): string {
  return date.toISOString().split("T")[0];
}

type SourceValue = "ALL" | "VTEX" | "MELI";
const VALID_SOURCES: SourceValue[] = ["ALL", "VTEX", "MELI"];

function parseSourceParam(raw: string | null): SourceValue {
  if (!raw) return "ALL";
  const upper = raw.toUpperCase();
  return (VALID_SOURCES as string[]).includes(upper) ? (upper as SourceValue) : "ALL";
}

export default function OrdersPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const defaultTo = new Date();
  const defaultFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [dateFrom, setDateFrom] = useState(toDateInputValue(defaultFrom));
  const [dateTo, setDateTo] = useState(toDateInputValue(defaultTo));
  const [activeQuickRange, setActiveQuickRange] = useState<number | null>(30);

  // Source tab sincronizada con URL (?source=VTEX|MELI, omitido si ALL)
  const source: SourceValue = useMemo(
    () => parseSourceParam(searchParams?.get("source") ?? null),
    [searchParams]
  );
  const setSource = (next: SourceValue) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (next === "ALL") {
      params.delete("source");
    } else {
      params.set("source", next);
    }
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  };
  const [data, setData] = useState<OrdersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [dailyMetric, setDailyMetric] = useState<"revenue" | "orders">("revenue");
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [compMode, setCompMode] = useState<"off" | "yoy" | "mom" | "wow">("off");
  const [compOffset, setCompOffset] = useState(0);
  const [flagFilter, setFlagFilter] = useState<AnomalyFlag | null>(null);
  const [tableSourceFilter, setTableSourceFilter] = useState<"ALL" | "VTEX" | "MELI">("ALL");
  const [pageView, setPageView] = useState<"dashboard" | "pedidos">("pedidos");

  // Reset pagination + comparison offset cuando cambia source (tab) o fechas
  useEffect(() => {
    setCurrentPage(1);
    setCompOffset(0);
  }, [source, dateFrom, dateTo]);

  // -- Single fetch with automatic retry --
  useEffect(() => {
    let cancelled = false;

    const fetchOnce = async (signal: AbortSignal): Promise<Response> => {
      const params = new URLSearchParams({ from: dateFrom, to: dateTo, page: currentPage.toString() });
      const effectiveSource = pageView === "pedidos" ? "ALL" : source;
      if (effectiveSource !== "ALL") params.set("source", effectiveSource);
      if (compMode !== "off") {
        params.set("compMode", compMode);
        if (compOffset !== 0) params.set("compOffset", String(compOffset));
      }
      return fetch(`/api/metrics/orders?${params}`, { signal });
    };

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      const MAX_RETRIES = 2; // up to 3 total attempts
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (cancelled) return;
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 45000); // 45s timeout
          const res = await fetchOnce(controller.signal);
          clearTimeout(timeout);
          if (cancelled) return;
          if (!res.ok) {
            let detail = "";
            try { const body = await res.json(); detail = body?.detail || body?.error || ""; } catch {}
            // Retry on 500/502/503/504
            if (res.status >= 500 && attempt < MAX_RETRIES) continue;
            throw new Error(`HTTP ${res.status}${detail ? `: ${detail}` : ""}`);
          }
          setData(await res.json());
          return; // success
        } catch (e: any) {
          if (cancelled) return;
          if (e.name === "AbortError" && attempt < MAX_RETRIES) continue; // retry on timeout
          if (attempt >= MAX_RETRIES) {
            if (e.name === "AbortError") {
              setError("La carga tardó demasiado. Probá refrescar la página o cerrar otras pestañas que usen la app.");
            } else {
              setError(e.message);
            }
          }
        }
      }
      setLoading(false);
    };
    fetchData().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dateFrom, dateTo, source, currentPage, pageView, compMode, compOffset]);

  // -- Auto-enrich MELI orders missing items OR missing images (runs ONCE per data load) --
  const enrichAttemptedRef = useRef<string>("");
  useEffect(() => {
    if (!data) return;

    // Build a key so we only attempt enrichment once per unique data load
    const enrichKey = `${data.meta?.dateFrom}|${data.meta?.dateTo}|${data.meta?.source}|${currentPage}`;
    if (enrichAttemptedRef.current === enrichKey) return;

    const meliNeedsEnrich = data.recentOrders.filter((o) => {
      if (o.source !== "MELI") return false;
      if (!o.items || o.items.length === 0) return true;
      return o.items.some((item: any) => !item.imageUrl);
    });
    if (meliNeedsEnrich.length === 0) return;

    // Mark as attempted BEFORE the fetch to prevent re-triggers
    enrichAttemptedRef.current = enrichKey;

    const enrichOrders = async () => {
      try {
        const res = await fetch("/api/metrics/orders/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderIds: meliNeedsEnrich.map((o) => o.id) }),
        });
        if (!res.ok) return;
        const { enriched } = await res.json();
        if (!enriched || Object.keys(enriched).length === 0) return;

        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            recentOrders: prev.recentOrders.map((o) => {
              if (enriched[o.id]) {
                return { ...o, items: enriched[o.id] };
              }
              return o;
            }),
          };
        });
      } catch {
        // Silent fail — enrichment is best-effort
      }
    };
    enrichOrders();
  }, [data, currentPage]);

  const handleQuickRange = (days: number) => {
    const to = new Date();
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    setDateTo(toDateInputValue(to));
    setDateFrom(toDateInputValue(from));
    setActiveQuickRange(days);
    setCurrentPage(1);
  };

  const handleDateChange = (type: "from" | "to", value: string) => {
    if (type === "from") setDateFrom(value);
    else setDateTo(value);
    setActiveQuickRange(null);
    setCurrentPage(1);
  };

  // -- Map orderId -> flags (Tanda 2 anomalies) --
  const orderFlagsMap = useMemo(() => {
    const map = new Map<string, AnomalyFlag[]>();
    const list = data?.anomalies?.orderLevel ?? [];
    list.forEach((a: any) => {
      if (a?.orderId && Array.isArray(a.flags)) map.set(a.orderId, a.flags);
    });
    return map;
  }, [data?.anomalies?.orderLevel]);

  // -- Filtered recent orders (search + status filter + flag filter + local source) --
  const filteredOrders = useMemo(() => {
    if (!data) return [];
    let orders = [...data.recentOrders];
    if (tableSourceFilter !== "ALL") {
      orders = orders.filter((o) => o.source === tableSourceFilter);
    }
    if (statusFilter) {
      orders = orders.filter((o) => o.status === statusFilter);
    }
    if (flagFilter) {
      orders = orders.filter((o) => {
        const flags = orderFlagsMap.get(o.id);
        return flags && flags.includes(flagFilter);
      });
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      orders = orders.filter(
        (o) =>
          o.externalId.toLowerCase().includes(term) ||
          o.customerName.toLowerCase().includes(term) ||
          o.paymentMethod.toLowerCase().includes(term)
      );
    }
    return orders;
  }, [data, searchTerm, statusFilter, flagFilter, orderFlagsMap, tableSourceFilter]);

  const handleFilterByFlag = (flag: AnomalyFlag) => {
    setFlagFilter((cur) => (cur === flag ? null : flag));
    setCurrentPage(1);
  };

  // -- Best day calculation for summary --
  const bestDay = useMemo(() => {
    if (!data?.dailySales || data.dailySales.length === 0) return null;
    return data.dailySales.reduce((best, d) => (d.orders > best.orders ? d : best), data.dailySales[0]);
  }, [data?.dailySales]);

  // -- Comparison chart data --
  const showComparison = compMode !== "off";
  const comparisonData = useMemo(() => {
    if (!data?.dailySales) return [];
    const current = data.dailySales;
    const prev = data.prevDailySales || [];
    // Align by day index (not date)
    return current.map((d, i) => ({
      day: d.day,
      current: dailyMetric === "revenue" ? d.revenue : d.orders,
      previous: prev[i] ? (dailyMetric === "revenue" ? prev[i].revenue : prev[i].orders) : 0,
    }));
  }, [data, dailyMetric]);

  // -- Status funnel data --
  const funnelData = useMemo(() => {
    if (!data?.statusBreakdown) return [];
    const statusMap = new Map(data.statusBreakdown.map((s) => [s.status, s.count]));
    return STATUS_FUNNEL_ORDER.map((status) => ({
      status,
      label: STATUS_LABELS[status] || status,
      count: statusMap.get(status) || 0,
      color: STATUS_COLORS[status] || "#94a3b8",
    }));
  }, [data?.statusBreakdown]);

  // -- Loading --
  if (loading && !data) {
    return (
      <div className="space-y-6 dash-stagger">
        {/* Hero skeleton */}
        <div className="dash-hero rounded-2xl overflow-hidden">
          <div className="dash-hero-inner px-8 py-7">
            <div className="dash-skeleton h-4 w-32 mb-4" />
            <div className="dash-skeleton h-12 w-64 mb-3" />
            <div className="dash-skeleton h-4 w-48" />
          </div>
        </div>
        {/* KPI grid skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="dash-card p-5">
              <div className="dash-skeleton h-3 w-20 mb-3" />
              <div className="dash-skeleton h-7 w-28 mb-2" />
              <div className="dash-skeleton h-3 w-16" />
            </div>
          ))}
        </div>
        {/* Chart skeleton */}
        <div className="dash-card p-6">
          <div className="dash-skeleton h-3 w-32 mb-4" />
          <div className="dash-skeleton h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <XCircle size={32} className="text-red-400 mx-auto mb-2" />
          <p className="text-red-600">Error: {error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    // Fallback: show loading skeleton if somehow we got past the loading check
    return (
      <div className="space-y-6 dash-stagger">
        <div className="dash-hero rounded-2xl overflow-hidden">
          <div className="dash-hero-inner px-8 py-7">
            <div className="dash-skeleton h-4 w-32 mb-4" />
            <div className="dash-skeleton h-12 w-64 mb-3" />
            <div className="dash-skeleton h-4 w-48" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="dash-card p-5">
              <div className="dash-skeleton h-3 w-20 mb-3" />
              <div className="dash-skeleton h-7 w-28 mb-2" />
              <div className="dash-skeleton h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  const { kpis } = data;
  const avgRevenuePerDay = kpis.totalRevenue / Math.max(kpis.daysInPeriod || 1, 1);
  const avgOrdersPerDay = kpis.totalOrders / Math.max(kpis.daysInPeriod || 1, 1);
  const avgItemsPerOrder = kpis.totalOrders > 0 ? kpis.totalItems / kpis.totalOrders : 0;
  const avgDiscountPerOrder = kpis.totalOrders > 0 ? kpis.totalDiscounts / kpis.totalOrders : 0;
  const avgShippingPerOrder = kpis.totalOrders > 0 ? kpis.totalShipping / kpis.totalOrders : 0;

  return (
    <div
      className="space-y-3 dash-stagger"
      style={{ fontVariantNumeric: "tabular-nums" }}
      key={source}
    >
      <DashboardStyles />
      {/* HEADER — compact: title + view tabs + date on one strip */}
      <div className="flex flex-col gap-2">
        {/* Row 1: Title + View tabs + Source tabs (Resumen) + Date filters */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">Pedidos</h1>
            {/* View tabs — inline with title */}
            <div className="flex items-center gap-0.5 bg-slate-100/80 rounded-lg p-0.5">
              {([
                { key: "pedidos", label: "Pedidos", icon: <ListOrdered size={13} /> },
                { key: "dashboard", label: "Resumen", icon: <LayoutDashboard size={13} /> },
              ] as const).map(({ key, label, icon }) => (
                <button
                  key={key}
                  onClick={() => setPageView(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold tracking-wide ${
                    pageView === key
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                  style={{ transition: "all 180ms cubic-bezier(0.16, 1, 0.3, 1)" }}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
            {/* SourceTabs solo visible en Resumen */}
            {pageView === "dashboard" && (
              <SourceTabs
                source={source}
                onSourceChange={setSource}
                sourceCounts={data?.sourceCounts ?? null}
              />
            )}
          </div>
          <DateRangeFilter
            dateFrom={dateFrom} dateTo={dateTo} activeQuickRange={activeQuickRange}
            quickRanges={QUICK_RANGES} onQuickRange={handleQuickRange}
            onDateChange={handleDateChange} loading={loading}
          />
        </div>
      </div>

      {/* ═══ VIEW: PEDIDOS (Master-Detail) ═══ */}
      {pageView === "pedidos" && (
        <OrdersMasterDetail
          orders={filteredOrders}
          totalCount={data.pagination?.totalCount || 0}
          currentPage={currentPage}
          totalPages={data.pagination?.totalPages || 1}
          pageSize={data.pagination?.pageSize || 50}
          onPageChange={setCurrentPage}
          loading={loading}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          sourceFilter={tableSourceFilter}
          onSourceFilterChange={setTableSourceFilter}
          statusBreakdown={data.statusBreakdown}
          onImageZoom={setZoomedImage}
          billingKpis={{
            totalRevenue: kpis.totalRevenue,
            totalOrders: kpis.totalOrders,
            avgTicket: kpis.avgTicket,
            totalDiscounts: kpis.totalDiscounts,
            changes: kpis.changes,
          }}
        />
      )}

      {/* ═══ VIEW: DASHBOARD (existing analytics) ═══ */}
      {pageView === "dashboard" && (<>

      {/* ORDERS HERO (Tanda 4 + 7.6) \u2014 bruto / neto / ingreso real / margen / pedidos */}
      <OrdersHero
        orgName="NitroSales"
        grossRevenue={kpis.totalRevenue}
        netRevenue={data.profitability?.netRevenue ?? kpis.netRevenue ?? (kpis.totalRevenue / 1.21)}
        realNetRevenue={data.profitability?.realNetRevenue ?? (kpis as any).realNetRevenue}
        totalMarketplaceFee={data.profitability?.totalMarketplaceFee ?? (kpis as any).totalMarketplaceFee}
        marginPct={data.profitability?.marginPct ?? kpis.marginPct ?? 0}
        ordersCount={kpis.totalOrders}
        revenueChange={kpis.changes?.revenue}
      />

      {/* ATENCION HOY (Tanda 4) — bloque de anomalias */}
      <AtencionHoyBlock
        data={data.anomalies}
        onFilterByFlag={handleFilterByFlag}
      />

      {/* SOURCE SPLIT BAR (Tanda 8.5) — solo visible en tab Todos */}
      {source === "ALL" && data.sourceCounts && (data.sourceCounts.vtex > 0 || data.sourceCounts.meli > 0) && (
        <SourceSplitBar
          vtexOrders={data.sourceCounts.vtex}
          meliOrders={data.sourceCounts.meli}
          vtexRevenue={data.sourceCounts.vtexRevenue ?? 0}
          meliRevenue={data.sourceCounts.meliRevenue ?? 0}
        />
      )}

      {/* WEEKLY SUMMARY */}
      <WeeklySummary
        totalRevenue={kpis.totalRevenue} totalOrders={kpis.totalOrders}
        revenueChange={kpis.changes.revenue} ordersChange={kpis.changes.orders}
        daysInPeriod={kpis.daysInPeriod || 30} bestDay={bestDay}
        cancelledOrders={kpis.cancelledOrders} cancellationRate={kpis.cancellationRate}
      />

      {/* KPI CARDS - Row 1: Main metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 lg:gap-4">
        <KpiCard icon={<DollarSign size={16} className="text-emerald-600" />} iconBg="bg-emerald-50"
          label="Ventas totales" value={formatCompact(kpis.totalRevenue)} change={kpis.changes.revenue} />
        <KpiCard icon={<ShoppingCart size={16} className="text-blue-600" />} iconBg="bg-blue-50"
          label="Ordenes" value={kpis.totalOrders.toLocaleString("es-AR")} change={kpis.changes.orders} />
        <KpiCard icon={<CreditCard size={16} className="text-purple-600" />} iconBg="bg-purple-50"
          label="Ticket promedio" value={formatARS(kpis.avgTicket)} change={kpis.changes.avgTicket} />
        <KpiCard icon={<Package size={16} className="text-orange-600" />} iconBg="bg-orange-50"
          label="Unidades vendidas" value={kpis.totalItems.toLocaleString("es-AR")}
          subtitle={`${avgItemsPerOrder.toFixed(1)} items/orden`} />
        <KpiCard icon={<XCircle size={16} className="text-red-500" />} iconBg="bg-red-50"
          label="Cancelacion" value={`${kpis.cancellationRate}%`}
          subtitle={`${kpis.cancelledOrders} orden${kpis.cancelledOrders !== 1 ? "es" : ""}`} />
      </div>

      {/* KPI CARDS - Row 2: Secondary metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-4">
        <KpiCard icon={<Clock size={16} className="text-indigo-600" />} iconBg="bg-indigo-50"
          label="Venta promedio/dia" value={formatCompact(avgRevenuePerDay)}
          subtitle={`${avgOrdersPerDay.toFixed(1)} ordenes/dia`} />
        <KpiCard icon={<Truck size={16} className="text-cyan-600" />} iconBg="bg-cyan-50"
          label="Envio promedio" value={formatARS(Math.abs(avgShippingPerOrder))}
          subtitle={`${formatCompact(Math.abs(kpis.totalShipping))} total`} />
        <KpiCard icon={<Tag size={16} className="text-pink-600" />} iconBg="bg-pink-50"
          label="Descuento promedio" value={formatARS(avgDiscountPerOrder)}
          subtitle={`${formatCompact(kpis.totalDiscounts)} total`} />
        <KpiCard icon={<Percent size={16} className="text-amber-600" />} iconBg="bg-amber-50"
          label="Peso envío/ticket" value={`${kpis.avgTicket > 0 ? ((Math.abs(avgShippingPerOrder) / kpis.avgTicket) * 100).toFixed(1) : 0}%`}
          subtitle="Qué % del ticket se va en logística" />
      </div>

      {/* ML CASCADE (Tanda 8.4) — exclusiva de la tab Mercado Libre */}
      {source === "MELI" && (() => {
        const catRow = data.meliCatalog?.find((r: any) => r.type === "Catálogo");
        const nonCatRow = data.meliCatalog?.find((r: any) => r.type === "Fuera de catálogo");
        return (
          <MercadoLibreCascadeCard
            grossRevenue={kpis.totalRevenue}
            marketplaceFee={data.profitability?.totalMarketplaceFee ?? (kpis as any).totalMarketplaceFee ?? 0}
            shippingCost={kpis.totalShipping ?? 0}
            ordersCount={kpis.totalOrders}
            feeCoveragePct={data.profitability?.feeCoveragePct}
            totalCogs={data.profitability?.totalCogs ?? 0}
            catalogRevenue={catRow?.revenue ?? 0}
            nonCatalogRevenue={nonCatRow?.revenue ?? 0}
          />
        );
      })()}

      {/* PROFITABILITY + COHORTS (Tanda 4 + 8.2 + Tanda 9)
          - VTEX: muestra ambos (margen real con COGS + tipos de cliente)
          - Todos: solo cohorts (split VTEX/MELI)
          - MELI: ni profitability card ni cohorts (100% anónimo, inutil)
                  → se reemplaza por MeliCatalogCard */}
      {source === "VTEX" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ProfitabilityCard data={data.profitability} loading={loading} />
          <CohortsCard data={data.cohorts} loading={loading} source={source} sourceCounts={data.sourceCounts} />
        </div>
      ) : source === "ALL" ? (
        <div className="grid grid-cols-1 gap-4">
          <CohortsCard data={data.cohorts} loading={loading} source={source} sourceCounts={data.sourceCounts} />
        </div>
      ) : null}

      {/* DAILY SALES CHART + COMPARISON */}
      <div className="dash-card dash-chart-card p-6">
        <div className="flex flex-col gap-3 mb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800 tracking-tight">Ventas por dia</h2>
            <div className="flex gap-1.5">
              {(["revenue", "orders"] as const).map((m) => (
                <button key={m} onClick={() => setDailyMetric(m)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium ${dailyMetric === m ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"}`}
                  style={{ transition: "all 220ms cubic-bezier(0.16, 1, 0.3, 1)" }}>
                  {m === "revenue" ? "Facturacion" : "Ordenes"}
                </button>
              ))}
            </div>
          </div>
          {/* Comparison mode selector */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-500 mr-1">Comparar:</span>
              {([
                { key: "off", label: "Sin" },
                { key: "wow", label: "Semanal" },
                { key: "mom", label: "Mensual" },
                { key: "yoy", label: "Anual" },
              ] as const).map(({ key, label }) => (
                <button key={key}
                  onClick={() => { setCompMode(key); setCompOffset(0); }}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all duration-200 ${
                    compMode === key
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-100 border border-slate-200"
                  }`}>
                  {label}
                </button>
              ))}
            </div>
            {/* Shift arrows — only visible when comparison is active */}
            {showComparison && (
              <div className="flex items-center gap-1">
                <button onClick={() => setCompOffset(o => o - 1)}
                  className="w-7 h-7 rounded-md flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-700 border border-slate-200 transition-colors"
                  title="Mover período atrás">
                  <ChevronLeft size={14} />
                </button>
                {compOffset !== 0 && (
                  <button onClick={() => setCompOffset(0)}
                    className="px-2 py-1 rounded-md text-[10px] font-medium text-indigo-600 hover:bg-indigo-50 border border-indigo-200 transition-colors">
                    Reset
                  </button>
                )}
                <button onClick={() => setCompOffset(o => o + 1)}
                  className="w-7 h-7 rounded-md flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-700 border border-slate-200 transition-colors"
                  title="Mover período adelante">
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
          {/* Show comparison date range when active */}
          {showComparison && data?.meta?.compFrom && (
            <p className="text-[10px] text-slate-400">
              Comparando con: {new Date(data.meta.compFrom).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}
              {" — "}
              {new Date(data.meta.compTo!).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}
              {compOffset !== 0 && <span className="ml-1 text-indigo-500 font-medium">({compOffset > 0 ? "+" : ""}{compOffset} sem)</span>}
            </p>
          )}
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={showComparison ? comparisonData : data.dailySales}>
            <defs>
              <linearGradient id="colorCurrent" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.28} />
                <stop offset="40%" stopColor="#8b5cf6" stopOpacity={0.12} />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorPrevious" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.12} />
                <stop offset="100%" stopColor="#94a3b8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" strokeOpacity={0.6} />
            <XAxis
              dataKey="day"
              tickFormatter={(d) => { try { const date = new Date(d + "T12:00:00"); return `${date.getDate()}/${date.getMonth() + 1}`; } catch { return d; } }}
              tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => dailyMetric === "revenue" ? formatCompact(v) : v.toLocaleString()}
              tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={60}
            />
            <Tooltip
              formatter={(value: number, name: string) => [
                dailyMetric === "revenue" ? formatARS(value) : value.toLocaleString("es-AR"),
                showComparison ? (name === "current" ? "Actual" : "Anterior") : (dailyMetric === "revenue" ? "Facturacion" : "Ordenes"),
              ]}
              labelFormatter={(d) => { try { const date = new Date(d + "T12:00:00"); return date.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "short" }); } catch { return d; } }}
              contentStyle={{
                background: "rgba(15, 23, 42, 0.95)",
                border: "1px solid rgba(99, 102, 241, 0.3)",
                borderRadius: "12px",
                fontSize: "12px",
                color: "#ffffff",
                boxShadow: "0 12px 32px -12px rgba(15, 23, 42, 0.5)",
                backdropFilter: "blur(10px)",
              }}
              labelStyle={{ color: "rgba(255,255,255,0.6)", fontSize: "10px", fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: "4px" }}
              itemStyle={{ color: "#ffffff", fontWeight: 600, fontFeatureSettings: '"tnum"' }}
            />
            {showComparison ? (
              <>
                <Area type="monotone" dataKey="previous" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 5" fill="url(#colorPrevious)" name="previous" />
                <Area type="monotone" dataKey="current" stroke="#6366f1" strokeWidth={2.5} fill="url(#colorCurrent)" name="current" />
              </>
            ) : (
              <Area type="monotone" dataKey={dailyMetric} stroke="#6366f1" strokeWidth={2.5} fill="url(#colorCurrent)"
                name={dailyMetric === "revenue" ? "Facturacion" : "Ordenes"} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* STATUS FUNNEL removed (Tanda 10) — Tomy: "no suma" */}

      {/* DAY OF WEEK + HOUR CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="dash-card dash-chart-card p-6">
          <h2 className="text-sm font-semibold text-slate-800 tracking-tight mb-4">Promedio de ordenes por dia de la semana</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.salesByDayOfWeek}>
              <defs>
                <linearGradient id="barGradientIndigo" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" />
                  <stop offset="100%" stopColor="#818cf8" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" strokeOpacity={0.6} />
              <XAxis dataKey="dayName" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={40} />
              <Tooltip formatter={(value: number) => [value.toLocaleString("es-AR"), "Prom. ordenes/dia"]}
                contentStyle={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: "12px", fontSize: "12px", color: "#fff", boxShadow: "0 12px 32px -12px rgba(15,23,42,0.5)" }}
                labelStyle={{ color: "rgba(255,255,255,0.6)", fontSize: "10px", fontWeight: 500 }}
                itemStyle={{ color: "#ffffff", fontWeight: 600 }} />
              <Bar dataKey="avgOrders" fill="url(#barGradientIndigo)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-slate-400 mt-2 text-center">Promedio diario - util para saber cuando pautar ads</p>
        </div>

        <div className="dash-card dash-chart-card p-6">
          <h2 className="text-sm font-semibold text-slate-800 tracking-tight mb-4">Promedio de ordenes por hora del dia</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.salesByHour}>
              <defs>
                <linearGradient id="barGradientEmerald" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#34d399" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" strokeOpacity={0.6} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} interval={2} />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={40} />
              <Tooltip formatter={(value: number) => [value.toLocaleString("es-AR"), "Prom. ordenes/dia"]}
                contentStyle={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: "12px", fontSize: "12px", color: "#fff", boxShadow: "0 12px 32px -12px rgba(15,23,42,0.5)" }}
                labelStyle={{ color: "rgba(255,255,255,0.6)", fontSize: "10px", fontWeight: 500 }}
                itemStyle={{ color: "#ffffff", fontWeight: 600 }} />
              <Bar dataKey="avgOrders" fill="url(#barGradientEmerald)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-slate-400 mt-2 text-center">Horas pico para WhatsApp, emails y ofertas</p>
        </div>
      </div>

      {/* LOGISTICS + SEGMENTATION (Tanda 4 + 8.2) — solo en tab VTEX */}
      {source === "VTEX" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <LogisticsCard data={data.logistics} loading={loading} source={source} sourceCounts={data.sourceCounts} />
          <SegmentationCard data={data.segmentation} loading={loading} source={source} sourceCounts={data.sourceCounts} />
        </div>
      )}

      {/* PAYMENT + PROMOTIONS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="dash-card dash-chart-card p-6">
          <h2 className="text-sm font-semibold text-slate-800 tracking-tight mb-4">Metodos de pago</h2>
          <div className="flex gap-4">
            <div className="w-1/2">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={data.paymentMethods} dataKey="revenue" nameKey="method" cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2}>
                    {data.paymentMethods.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatARS(value)} contentStyle={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", fontSize: "12px", color: "#fff", boxShadow: "0 12px 32px -12px rgba(15,23,42,0.5)" }} itemStyle={{ color: "#ffffff", fontWeight: 600 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-1/2 flex flex-col justify-center gap-2">
              {data.paymentMethods.slice(0, 5).map((pm, i) => (
                <div key={pm.method} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-xs text-slate-600 truncate flex-1">{pm.method}</span>
                  <span className="text-xs font-medium text-slate-800">{pm.orders.toLocaleString("es-AR")}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* MELI: Catálogo vs Individual al lado de Métodos de pago */}
        {source === "MELI" && (
          <MeliCatalogCard data={data.meliCatalog} loading={loading} />
        )}

        {/* Non-MELI: Promotion breakdown */}
        {data.promotionBreakdown && data.promotionBreakdown.length > 0 && source !== "MELI" && (
          <div className="dash-card dash-chart-card p-6">
            <h2 className="text-sm font-semibold text-slate-800 tracking-tight mb-4">Ventas por promocion</h2>
            <div className="flex gap-4">
              <div className="w-1/2">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={data.promotionBreakdown} dataKey="revenue" nameKey="promo" cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2}>
                      {data.promotionBreakdown.map((_: any, i: number) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatARS(value)} contentStyle={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", fontSize: "12px", color: "#fff", boxShadow: "0 12px 32px -12px rgba(15,23,42,0.5)" }} itemStyle={{ color: "#ffffff", fontWeight: 600 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-1/2 flex flex-col justify-center gap-2 max-h-[200px] overflow-y-auto">
                {data.promotionBreakdown.map((p: any, i: number) => (
                  <div key={p.promo} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-xs text-slate-600 truncate flex-1">{p.promo}</span>
                    <span className="text-xs font-medium text-slate-800">{p.orders.toLocaleString("es-AR")}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* COUPONS + GEOGRAPHY (Tanda 4 + 8.2) — solo en tab VTEX */}
      {source === "VTEX" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CouponsCard data={data.coupons} loading={loading} source={source} sourceCounts={data.sourceCounts} />
          <GeographyCard data={data.geography} loading={loading} source={source} sourceCounts={data.sourceCounts} />
        </div>
      )}

      {/* TOP PRODUCTS + CUSTOMERS (Tanda 9: Top Clientes oculto para MELI — no hay datos de clientes) */}
      <div className={`grid grid-cols-1 ${source !== "MELI" ? "lg:grid-cols-2" : ""} gap-4`}>
        <div className="dash-card p-6">
          <h2 className="text-sm font-semibold text-slate-800 tracking-tight mb-4">Top productos vendidos</h2>
          <div className="space-y-2.5 max-h-[320px] overflow-y-auto">
            {data.topProducts.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 py-1.5">
                <span className="text-xs font-bold text-slate-400 w-5 text-right">{i + 1}</span>
                <div className="w-8 h-8 rounded flex-shrink-0 cursor-pointer overflow-hidden bg-slate-100" onClick={() => p.imageUrl && setZoomedImage(p.imageUrl)}>
                  {p.imageUrl ? <img src={p.imageUrl} alt="" className="w-full h-full object-cover" /> : <Package size={14} className="text-slate-400 m-auto mt-2" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-800 truncate">{p.name}</p>
                  <p className="text-[10px] text-slate-400">{p.brand} - {p.category}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-slate-800">{formatARS(p.revenue)}</p>
                  <p className="text-[10px] text-slate-400">{p.unitsSold} uds - {p.orders} ord</p>
                </div>
              </div>
            ))}
            {data.topProducts.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-4">Sin datos para este periodo</p>
            )}
          </div>
        </div>

        {source !== "MELI" && (
        <div className="dash-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users size={14} className="text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-800 tracking-tight">Top clientes</h2>
          </div>
          <div className="space-y-2.5 max-h-[320px] overflow-y-auto">
            {data.topCustomers.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 py-1.5">
                <span className="text-xs font-bold text-slate-400 w-5 text-right">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-800 truncate">{c.name}</p>
                  <p className="text-[10px] text-slate-400 truncate">{c.email}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-slate-800">{formatARS(c.totalSpent)}</p>
                  <p className="text-[10px] text-slate-400">{c.totalOrders} orden{c.totalOrders !== 1 ? "es" : ""}</p>
                </div>
              </div>
            ))}
            {data.topCustomers.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-4">Sin datos para este periodo</p>
            )}
          </div>
        </div>
        )}
      </div>

      </>)}

      {/* ═══ OLD RECENT ORDERS — replaced by master-detail, kept but hidden ═══ */}
      {false && (<div className="space-y-4">
        {/* Header bar — filters + search */}
        <div className="dash-card px-6 py-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Pedidos recientes</h2>
                {data.pagination && (
                  <span className="text-xs text-slate-400 tabular-nums">{data.pagination.totalCount.toLocaleString("es-AR")} ordenes</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {/* Source filter pills */}
                <div className="flex items-center bg-slate-100/80 rounded-xl p-0.5">
                  {(["ALL", "VTEX", "MELI"] as const).map((s) => (
                    <button key={s} onClick={() => setTableSourceFilter(s)}
                      className={`px-3.5 py-1.5 rounded-lg text-[11px] font-semibold tracking-wide ${tableSourceFilter === s ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                      style={{ transition: "all 180ms cubic-bezier(0.16, 1, 0.3, 1)" }}>
                      {s === "ALL" ? "Todos" : s}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" placeholder="Buscar orden, cliente o pago..."
                    value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs text-slate-700 bg-white/80 w-72 focus:outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    style={{ transition: "all 220ms cubic-bezier(0.16, 1, 0.3, 1)" }} />
                </div>
              </div>
            </div>

            {/* Active filters row */}
            <div className="flex items-center gap-2 flex-wrap">
              <StatusFilter
                statuses={data.statusBreakdown}
                activeStatus={statusFilter}
                onStatusChange={setStatusFilter}
                statusLabels={STATUS_LABELS}
                statusColors={STATUS_COLORS}
              />
              {flagFilter && (
                <button type="button" onClick={() => setFlagFilter(null)}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-[10px] font-semibold text-amber-700 hover:bg-amber-100"
                  style={{ transition: "all 180ms cubic-bezier(0.16, 1, 0.3, 1)" }}>
                  {flagFilter}
                  <span className="ml-0.5 text-amber-500">×</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Order cards feed */}
        <div className="space-y-3">
          {filteredOrders.map((order, orderIdx) => {
            const isExpanded = expandedOrderId === order.id;
            const isMeli = order.source === "MELI";
            const isMeliAnon = isMeli && (order.customerName === "Cliente MercadoLibre" || order.customerName === "Cliente sin datos");
            const flags = orderFlagsMap.get(order.id) ?? [];
            const accentColor = isMeli ? "#eab308" : "#6366f1";
            const dateFormatted = (() => { try { const d = new Date(order.orderDate); return d.toLocaleDateString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return order.orderDate; } })();

            return (
              <div key={order.id}
                className="group relative rounded-2xl bg-white overflow-hidden cursor-pointer"
                style={{
                  boxShadow: isExpanded
                    ? "0 1px 0 rgba(15,23,42,0.06), 0 12px 32px -8px rgba(15,23,42,0.14), 0 24px 48px -16px rgba(15,23,42,0.1)"
                    : "0 1px 0 rgba(15,23,42,0.04), 0 4px 12px -6px rgba(15,23,42,0.08)",
                  border: "1px solid rgba(15,23,42,0.06)",
                  transition: "box-shadow 280ms cubic-bezier(0.16, 1, 0.3, 1), transform 280ms cubic-bezier(0.16, 1, 0.3, 1)",
                  animationDelay: `${orderIdx * 40}ms`,
                }}
                onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}>

                {/* Left accent bar */}
                <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ backgroundColor: accentColor, opacity: isExpanded ? 1 : 0.5, transition: "opacity 280ms cubic-bezier(0.16, 1, 0.3, 1)" }} />

                {/* ─── Main card row — PRODUCT-FIRST layout ─── */}
                <div className="flex items-center gap-4 pl-5 pr-5 py-4">
                  {/* Product image (hero) — first product or source badge */}
                  {order.items && order.items.length > 0 && order.items[0].imageUrl ? (
                    <div className="w-12 h-12 rounded-xl flex-shrink-0 overflow-hidden bg-slate-50 border border-slate-100"
                      style={{ boxShadow: "0 1px 4px rgba(15,23,42,0.06)" }}>
                      <img src={order.items[0].imageUrl} alt="" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${isMeli ? "bg-yellow-50 border border-yellow-200/60" : "bg-indigo-50 border border-indigo-200/60"}`}>
                      {isMeli ? (
                        <span className="text-xs font-bold text-yellow-600">ML</span>
                      ) : (
                        <span className="text-xs font-bold text-indigo-600">VTX</span>
                      )}
                    </div>
                  )}

                  {/* Product name + sale details (hero info) */}
                  <div className="flex-1 min-w-0">
                    {order.items && order.items.length > 0 ? (
                      <>
                        <p className="text-sm font-semibold text-slate-800 truncate leading-tight tracking-tight">
                          {order.items[0].name || "Producto sin nombre"}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-xs text-slate-500 tabular-nums">
                            {order.items[0].quantity} × {formatARS(order.items[0].unitPrice)}
                          </span>
                          {order.items.length > 1 && (
                            <>
                              <span className="text-slate-300">·</span>
                              <span className="text-[11px] text-slate-400">
                                +{order.items.length - 1} producto{order.items.length - 1 > 1 ? "s" : ""}
                              </span>
                            </>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-slate-500 italic truncate">Sin detalle de productos</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{order.itemCount} item{order.itemCount !== 1 ? "s" : ""}</p>
                      </>
                    )}
                    {/* Secondary metadata row */}
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-400">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold ${isMeli ? "bg-yellow-50 text-yellow-600" : "bg-indigo-50 text-indigo-500"}`}>
                        {isMeli ? "ML" : "VTX"}
                      </span>
                      <span className="tabular-nums">{dateFormatted}</span>
                      <span className="text-slate-200">·</span>
                      <span className="truncate max-w-[120px]">
                        {isMeliAnon ? "Cliente ML" : order.customerName}
                      </span>
                      {flags.length > 0 && (
                        <OrderFlagBadgeGroup flags={flags} max={2} compact />
                      )}
                    </div>
                  </div>

                  {/* Amount — hero number */}
                  <div className="text-right flex-shrink-0 mr-3">
                    <p className="text-lg font-bold text-slate-900 tabular-nums tracking-tight">{formatARS(order.totalValue)}</p>
                    {order.promotionNames && (
                      <p className="text-[10px] text-purple-500 font-medium truncate max-w-[120px] text-right">{order.promotionNames}</p>
                    )}
                  </div>

                  {/* Status pill */}
                  <div className="flex-shrink-0">
                    <span className="inline-flex px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide"
                      style={{ backgroundColor: `${STATUS_COLORS[order.status] || "#94a3b8"}10`, color: STATUS_COLORS[order.status] || "#94a3b8", border: `1px solid ${STATUS_COLORS[order.status] || "#94a3b8"}20` }}>
                      {STATUS_LABELS[order.status] || order.status}
                    </span>
                  </div>

                  {/* Chevron */}
                  <ChevronDown size={16} className={`text-slate-300 group-hover:text-slate-500 flex-shrink-0 ${isExpanded ? "rotate-180" : ""}`}
                    style={{ transition: "transform 280ms cubic-bezier(0.16, 1, 0.3, 1), color 180ms cubic-bezier(0.16, 1, 0.3, 1)" }} />
                </div>

                {/* ─── Additional product thumbnails (collapsed, multi-product orders) ─── */}
                {!isExpanded && order.items && order.items.length > 1 && (
                  <div className="flex items-center gap-1.5 pl-5 pb-3 -mt-1">
                    <div className="flex -space-x-1.5">
                      {order.items.slice(1, 6).map((item: any, idx: number) => (
                        <div key={idx} className="w-7 h-7 rounded-lg overflow-hidden bg-slate-100 border-2 border-white flex-shrink-0"
                          style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.08)" }}>
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package size={10} className="text-slate-300" />
                            </div>
                          )}
                        </div>
                      ))}
                      {order.items.length > 6 && (
                        <div className="w-7 h-7 rounded-lg bg-slate-100 border-2 border-white flex items-center justify-center flex-shrink-0">
                          <span className="text-[9px] font-semibold text-slate-400">+{order.items.length - 6}</span>
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 ml-1">
                      {order.items.slice(1, 3).map((it: any) => it.name?.split(" ").slice(0, 3).join(" ") || "").filter(Boolean).join(", ")}
                      {order.items.length > 3 ? ` y ${order.items.length - 3} mas` : ""}
                    </span>
                  </div>
                )}

                {/* ─── Expanded detail panel ─── */}
                {isExpanded && (
                  <div className="border-t border-slate-100/80" onClick={(e) => e.stopPropagation()}>
                    <div className="bg-gradient-to-b from-slate-50/50 to-white px-6 py-5">

                      {/* ─── PRODUCTS FIRST (hero section of expanded card) ─── */}
                      <div className="space-y-3 mb-6">
                        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Package size={10} />
                          Productos ({order.items?.length || 0})
                          {order.items && order.items.length > 0 && (
                            <span className="ml-auto text-xs font-bold text-slate-800 tabular-nums tracking-tight normal-case">
                              Total: {formatARS(order.totalValue)}
                            </span>
                          )}
                        </div>
                        {order.items && order.items.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                            {order.items.map((item: any, idx: number) => (
                              <div key={idx} className="flex items-center gap-3 bg-white rounded-xl px-3.5 py-3 border border-slate-200/60 hover:border-slate-300/80 group/item"
                                style={{ boxShadow: "0 1px 4px rgba(15,23,42,0.04)", transition: "all 180ms cubic-bezier(0.16, 1, 0.3, 1)" }}>
                                <div className="w-14 h-14 rounded-xl flex-shrink-0 overflow-hidden bg-slate-50 cursor-pointer border border-slate-100"
                                  onClick={(e) => { e.stopPropagation(); item.imageUrl && setZoomedImage(item.imageUrl); }}>
                                  {item.imageUrl ? <img src={item.imageUrl} alt="" className="w-full h-full object-cover" /> : <Package size={20} className="text-slate-300 m-auto mt-4" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs text-slate-800 font-semibold truncate leading-tight">{item.name || "Producto sin nombre"}</p>
                                  <div className="flex items-center gap-2 mt-1.5">
                                    <span className="text-[11px] text-slate-500 tabular-nums">{item.quantity} × {formatARS(item.unitPrice)}</span>
                                  </div>
                                  <p className="text-sm font-bold text-slate-900 tabular-nums tracking-tight mt-1">{formatARS(item.totalPrice)}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="bg-slate-50/80 rounded-xl px-4 py-4 border border-slate-200/40 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                              <Package size={14} className="text-slate-300" />
                            </div>
                            <div>
                              <p className="text-xs text-slate-500 font-medium">Sin detalle de productos</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">El detalle se genera en la proxima sincronizacion</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* ─── SECONDARY: Order details (collapsed by default feel — compact) ─── */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Col 1: Financiero (most important secondary) */}
                        <div className="space-y-3">
                          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                            <DollarSign size={10} />
                            Financiero
                          </div>
                          <div className="bg-white rounded-xl border border-slate-200/60 p-3.5 space-y-2.5" style={{ boxShadow: "0 1px 4px rgba(15,23,42,0.04)" }}>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-slate-400 font-medium">Pago</span>
                              <span className="text-xs text-slate-700 font-medium">{order.paymentMethod}</span>
                            </div>
                            {(order.discountValue ?? 0) > 0 && (
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-slate-400 font-medium">Descuento</span>
                                <span className="text-xs text-emerald-600 font-semibold tabular-nums">-{formatARS(order.discountValue || 0)}</span>
                              </div>
                            )}
                            {(order.shippingCost ?? 0) > 0 && (
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-slate-400 font-medium">Envio</span>
                                <span className="text-xs text-slate-700 tabular-nums">{formatARS(order.shippingCost || 0)}</span>
                              </div>
                            )}
                            {order.promotionNames && (
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-slate-400 font-medium">Promo</span>
                                <span className="text-xs text-purple-600 font-medium truncate max-w-[150px]">{order.promotionNames}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Col 2: Cliente */}
                        <div className="space-y-3">
                          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Users size={10} />
                            Cliente
                          </div>
                          {isMeliAnon ? (
                            <div className="bg-gradient-to-br from-yellow-50 to-amber-50/60 border border-yellow-200/60 rounded-xl px-4 py-3.5">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center border border-yellow-200/60">
                                  <span className="text-[10px] font-bold text-yellow-600">ML</span>
                                </div>
                                <div>
                                  <p className="text-xs font-medium text-yellow-800">Cliente MercadoLibre</p>
                                  <p className="text-[10px] text-yellow-600/70">Datos de comprador protegidos</p>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-white rounded-xl border border-slate-200/60 p-3.5" style={{ boxShadow: "0 1px 4px rgba(15,23,42,0.04)" }}>
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200/60">
                                  <span className="text-[10px] font-bold text-slate-500">
                                    {order.customerName.charAt(0).toUpperCase()}
                                  </span>
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-medium text-slate-800 truncate">{order.customerName}</p>
                                  {order.customerEmail && <p className="text-[10px] text-slate-400 truncate">{order.customerEmail}</p>}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Col 3: Detalles del pedido */}
                        <div className="space-y-3">
                          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                            <ShoppingCart size={10} />
                            Pedido
                          </div>
                          <div className="bg-white rounded-xl border border-slate-200/60 p-3.5 space-y-2.5" style={{ boxShadow: "0 1px 4px rgba(15,23,42,0.04)" }}>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-slate-400 font-medium">ID</span>
                              <span className="text-xs font-mono text-indigo-600">{order.externalId}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-slate-400 font-medium">Fecha</span>
                              <span className="text-xs text-slate-700 tabular-nums">{order.orderDate}</span>
                            </div>
                            {order.deliveryType && (
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-slate-400 font-medium">Envio</span>
                                <span className="text-xs text-slate-600">{order.deliveryType}</span>
                              </div>
                            )}
                            {order.shippingCarrier && (
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-slate-400 font-medium">Transporte</span>
                                <span className="text-xs text-slate-600">{order.shippingCarrier}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Anomaly badges */}
                      {flags.length > 0 && (
                        <div className="mt-5 pt-4 border-t border-slate-100/80">
                          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                            <Info size={10} />
                            Señales detectadas
                          </div>
                          <OrderFlagBadgeGroup flags={flags} max={10} compact={false} />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Empty state */}
          {filteredOrders.length === 0 && (
            <div className="dash-card flex flex-col items-center justify-center py-16">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <Search size={20} className="text-slate-300" />
              </div>
              <p className="text-sm font-medium text-slate-500 mb-1">No se encontraron ordenes</p>
              <p className="text-xs text-slate-400">Intenta con otros filtros o un periodo distinto</p>
            </div>
          )}
        </div>

        {/* Pagination bar */}
        {data.pagination && data.pagination.totalPages > 1 && (
          <div className="dash-card px-6 py-3.5 flex items-center justify-between">
            <div className="text-xs text-slate-500 tabular-nums">
              Pagina {currentPage} de {data.pagination.totalPages || 0}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1}
                className="px-4 py-2 rounded-xl text-xs font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ transition: "all 220ms cubic-bezier(0.16, 1, 0.3, 1)" }}>
                Anterior
              </button>
              <button onClick={() => setCurrentPage(currentPage + 1)} disabled={currentPage >= (data.pagination?.totalPages || 1)}
                className="px-4 py-2 rounded-xl text-xs font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ transition: "all 220ms cubic-bezier(0.16, 1, 0.3, 1)" }}>
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>)}

      {/* IMAGE ZOOM MODAL — smooth fade-in, hi-res ML image */}
      {zoomedImage && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{
            backgroundColor: "rgba(15,23,42,0.4)",
            backdropFilter: "blur(8px)",
            animation: "fadeIn 180ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          onClick={() => setZoomedImage(null)}
        >
          <div
            className="dash-sheet dash-sheet--centered max-w-md w-full p-5"
            style={{ animation: "scaleIn 200ms cubic-bezier(0.16, 1, 0.3, 1)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-800 tracking-tight">Imagen ampliada</h3>
              <button onClick={() => setZoomedImage(null)} className="text-slate-400 hover:text-slate-900 text-lg" style={{ transition: "color 180ms cubic-bezier(0.16, 1, 0.3, 1)" }}>&times;</button>
            </div>
            <div className="bg-slate-50 rounded-xl w-full aspect-square flex items-center justify-center overflow-hidden relative">
              {/* Spinner while image loads */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-500 rounded-full" style={{ animation: "spin 0.8s linear infinite" }} />
              </div>
              <img
                src={(() => {
                  // Upgrade ML thumbnail to high-res: replace size suffix in URL
                  let url = zoomedImage;
                  if (url.includes("http.mlstatic.com") || url.includes("mla-")) {
                    url = url.replace(/-I\.jpg/, "-O.jpg").replace(/-S\.jpg/, "-O.jpg").replace(/-V\.jpg/, "-O.jpg");
                  }
                  return url;
                })()}
                alt=""
                className="w-full h-full object-contain relative z-10"
                style={{ opacity: 0, transition: "opacity 250ms ease" }}
                onLoad={(e) => { (e.target as HTMLImageElement).style.opacity = "1"; }}
              />
            </div>
          </div>
          <style>{`
            @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
            @keyframes scaleIn { from { opacity: 0; transform: scale(0.95) } to { opacity: 1; transform: scale(1) } }
            @keyframes spin { to { transform: rotate(360deg) } }
          `}</style>
        </div>
      )}
    </div>
  );
}
