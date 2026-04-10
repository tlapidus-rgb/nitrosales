// @ts-nocheck
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
} from "recharts";
import { formatARS, formatCompact } from "@/lib/utils/format";
import {
  DollarSign, ShoppingCart, CreditCard, XCircle, Package, Users,
  Search, ChevronDown, ArrowUpRight, ArrowDownRight, Clock,
  Percent, Truck, Tag, ExternalLink,
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
  }>;
  pagination?: { page: number; pageSize: number; totalCount: number; totalPages: number };
  meta: { dateFrom: string; dateTo: string; source: string; daysInPeriod: number };
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
  const [showComparison, setShowComparison] = useState(false);
  const [flagFilter, setFlagFilter] = useState<AnomalyFlag | null>(null);

  // Reset pagination cuando cambia source (tab) o fechas
  useEffect(() => {
    setCurrentPage(1);
  }, [source, dateFrom, dateTo]);

  // -- Single fetch (fixed: no duplicate) --
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ from: dateFrom, to: dateTo, page: currentPage.toString() });
        if (source !== "ALL") params.set("source", source);
        const res = await fetch(`/api/metrics/orders?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setData(await res.json());
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [dateFrom, dateTo, source, currentPage]);

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

  // -- Filtered recent orders (search + status filter + flag filter) --
  const filteredOrders = useMemo(() => {
    if (!data) return [];
    let orders = [...data.recentOrders];
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
  }, [data, searchTerm, statusFilter, flagFilter, orderFlagsMap]);

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

  if (!data) return null;
  const { kpis } = data;
  const avgRevenuePerDay = kpis.totalRevenue / Math.max(kpis.daysInPeriod || 1, 1);
  const avgOrdersPerDay = kpis.totalOrders / Math.max(kpis.daysInPeriod || 1, 1);
  const avgItemsPerOrder = kpis.totalOrders > 0 ? kpis.totalItems / kpis.totalOrders : 0;
  const avgDiscountPerOrder = kpis.totalOrders > 0 ? kpis.totalDiscounts / kpis.totalOrders : 0;
  const avgShippingPerOrder = kpis.totalOrders > 0 ? kpis.totalShipping / kpis.totalOrders : 0;

  return (
    <div
      className="space-y-6 dash-stagger"
      style={{ fontVariantNumeric: "tabular-nums" }}
      key={source}
    >
      <DashboardStyles />
      {/* HEADER + TABS + DATE FILTERS (Tanda 8.1) */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Pedidos</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {source === "ALL" && "Consolidado VTEX + Mercado Libre"}
              {source === "VTEX" && "Solo órdenes de VTEX"}
              {source === "MELI" && "Solo órdenes de Mercado Libre"}
            </p>
          </div>
          <SourceTabs
            source={source}
            onSourceChange={setSource}
            sourceCounts={data?.sourceCounts ?? null}
          />
        </div>
        <DateRangeFilter
          dateFrom={dateFrom} dateTo={dateTo} activeQuickRange={activeQuickRange}
          quickRanges={QUICK_RANGES} onQuickRange={handleQuickRange}
          onDateChange={handleDateChange} loading={loading}
        />
      </div>

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
          label="Envio promedio" value={formatARS(avgShippingPerOrder)}
          subtitle={`${formatCompact(kpis.totalShipping)} total`} />
        <KpiCard icon={<Tag size={16} className="text-pink-600" />} iconBg="bg-pink-50"
          label="Descuento promedio" value={formatARS(avgDiscountPerOrder)}
          subtitle={`${formatCompact(kpis.totalDiscounts)} total`} />
        <KpiCard icon={<Percent size={16} className="text-amber-600" />} iconBg="bg-amber-50"
          label="Margen envio/ticket" value={`${kpis.avgTicket > 0 ? ((avgShippingPerOrder / kpis.avgTicket) * 100).toFixed(1) : 0}%`}
          subtitle="costo envio sobre ticket" />
      </div>

      {/* ML CASCADE (Tanda 8.4) — exclusiva de la tab Mercado Libre */}
      {source === "MELI" && (
        <MercadoLibreCascadeCard
          grossRevenue={kpis.totalRevenue}
          marketplaceFee={data.profitability?.totalMarketplaceFee ?? (kpis as any).totalMarketplaceFee ?? 0}
          shippingCost={kpis.totalShipping ?? 0}
          ordersCount={kpis.totalOrders}
          feeCoveragePct={data.profitability?.feeCoveragePct}
        />
      )}

      {/* PROFITABILITY + COHORTS (Tanda 4 + 8.2)
          - VTEX: muestra ambos (margen real con COGS)
          - Todos/ML: solo cohorts (margen requiere COGS que solo VTEX tiene) */}
      {source === "VTEX" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ProfitabilityCard data={data.profitability} loading={loading} />
          <CohortsCard data={data.cohorts} loading={loading} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          <CohortsCard data={data.cohorts} loading={loading} />
        </div>
      )}

      {/* DAILY SALES CHART + COMPARISON */}
      <div className="dash-card dash-chart-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-800 tracking-tight">Ventas por dia</h2>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={showComparison} onChange={(e) => setShowComparison(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5" />
              <span className="text-xs text-slate-500">vs periodo anterior</span>
            </label>
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

      {/* STATUS FUNNEL — Waterfall visual */}
      <div className="dash-card p-6">
        <h2 className="text-sm font-semibold text-slate-800 tracking-tight mb-5">Flujo operativo de ordenes</h2>
        <div className="flex items-end gap-3 overflow-x-auto pb-2">
          {funnelData.map((step, i) => {
            const maxCount = Math.max(...funnelData.map((s) => s.count), 1);
            const heightPct = Math.max((step.count / maxCount) * 100, 20);
            const total = funnelData.reduce((acc, s) => acc + s.count, 0);
            const pct = total > 0 ? ((step.count / total) * 100).toFixed(0) : "0";
            return (
              <React.Fragment key={step.status}>
                <div className="flex-1 min-w-[90px] group">
                  <div className="text-center mb-3">
                    <p className="text-2xl font-bold tabular-nums tracking-tight" style={{ color: step.color }}>{step.count.toLocaleString("es-AR")}</p>
                    <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">{step.label}</p>
                    <p className="text-[9px] text-slate-400 mt-0.5 opacity-0 group-hover:opacity-100" style={{ transition: "opacity 180ms cubic-bezier(0.16, 1, 0.3, 1)" }}>{pct}% del total</p>
                  </div>
                  <div className="relative w-full bg-slate-50 rounded-xl overflow-hidden" style={{ height: "48px" }}>
                    <div className="absolute bottom-0 left-0 right-0 rounded-xl" style={{ height: `${heightPct}%`, backgroundColor: step.color, opacity: 0.85, transition: "height 600ms cubic-bezier(0.16, 1, 0.3, 1)" }} />
                  </div>
                </div>
                {i < funnelData.length - 1 && (
                  <div className="text-slate-300 flex-shrink-0 text-sm mb-6">→</div>
                )}
              </React.Fragment>
            );
          })}
          {/* Cancelled / returned — separated */}
          {data.statusBreakdown.filter((s) => s.status === "CANCELLED" || s.status === "RETURNED").map((s) => (
            <div key={s.status} className="min-w-[80px] opacity-50 ml-3 pl-3 border-l border-slate-200/60">
              <div className="text-center mb-3">
                <p className="text-xl font-bold tabular-nums" style={{ color: STATUS_COLORS[s.status] }}>{s.count.toLocaleString("es-AR")}</p>
                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">{STATUS_LABELS[s.status]}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

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

        {data.promotionBreakdown && data.promotionBreakdown.length > 0 && (
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

      {/* TOP PRODUCTS + CUSTOMERS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
      </div>

      {/* RECENT ORDERS TABLE */}
      <div className="dash-card p-6">
        <div className="flex flex-col gap-3 mb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800 tracking-tight">Ultimas ordenes</h2>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Buscar por ID, cliente o pago..."
                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-700 bg-white w-80 focus:outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 transition-all" style={{ transitionDuration: "220ms", transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }} />
            </div>
          </div>
          {/* Flag filter active chip (Tanda 4) */}
          {flagFilter && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500">Filtrando por señal:</span>
              <button
                type="button"
                onClick={() => setFlagFilter(null)}
                className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-100"
              >
                {flagFilter}
                <span className="ml-1 text-amber-500">×</span>
              </button>
            </div>
          )}

          {/* Status filter chips */}
          <StatusFilter
            statuses={data.statusBreakdown}
            activeStatus={statusFilter}
            onStatusChange={setStatusFilter}
            statusLabels={STATUS_LABELS}
            statusColors={STATUS_COLORS}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left text-[11px] font-medium text-slate-500 uppercase tracking-wide pb-3 px-3">ID</th>
                <th className="text-left text-[11px] font-medium text-slate-500 uppercase tracking-wide pb-3 px-3">Fecha</th>
                <th className="text-left text-[11px] font-medium text-slate-500 uppercase tracking-wide pb-3 px-3">Cliente</th>
                <th className="text-right text-[11px] font-medium text-slate-500 uppercase tracking-wide pb-3 px-3">Monto</th>
                <th className="text-center text-[11px] font-medium text-slate-500 uppercase tracking-wide pb-3 px-3">Items</th>
                <th className="text-left text-[11px] font-medium text-slate-500 uppercase tracking-wide pb-3 px-3">Pago</th>
                <th className="text-center text-[11px] font-medium text-slate-500 uppercase tracking-wide pb-3 px-3">Canal</th>
                <th className="text-center text-[11px] font-medium text-slate-500 uppercase tracking-wide pb-3 px-3">Estado</th>
                <th className="text-left text-[11px] font-medium text-slate-500 uppercase tracking-wide pb-3 px-3">Señales</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <React.Fragment key={order.id}>
                  <tr className="border-b border-slate-100/60 hover:bg-slate-50/60 cursor-pointer"
                    style={{ transition: "background-color 180ms cubic-bezier(0.16, 1, 0.3, 1)" }}
                    onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        <ChevronDown size={12} className={`text-slate-400 transition-transform ${expandedOrderId === order.id ? "rotate-180" : ""}`} style={{ transitionDuration: "280ms", transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }} />
                        <span className="text-xs font-mono text-indigo-600">
                          {order.externalId.length > 15 ? `...${order.externalId.slice(-12)}` : order.externalId}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-2"><span className="text-xs text-slate-600">{order.orderDate}</span></td>
                    <td className="py-2.5 px-2">
                      <span className="text-xs text-slate-700 truncate max-w-[150px] block">{order.customerName}</span>
                      {order.customerEmail && <span className="text-[10px] text-slate-400 truncate max-w-[150px] block">{order.customerEmail}</span>}
                    </td>
                    <td className="py-2.5 px-2 text-right"><span className="text-xs font-medium text-slate-800">{formatARS(order.totalValue)}</span></td>
                    <td className="py-2.5 px-2 text-center"><span className="text-xs text-slate-600">{order.itemCount}</span></td>
                    <td className="py-2.5 px-2"><span className="text-xs text-slate-600 truncate max-w-[100px] block">{order.paymentMethod}</span></td>
                    <td className="py-2.5 px-2 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${order.source === "MELI" ? "bg-yellow-100 text-yellow-700" : "bg-indigo-50 text-indigo-600"}`}>
                        {order.source}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium"
                        style={{ backgroundColor: `${STATUS_COLORS[order.status] || "#94a3b8"}15`, color: STATUS_COLORS[order.status] || "#94a3b8" }}>
                        {STATUS_LABELS[order.status] || order.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-2">
                      <OrderFlagBadgeGroup flags={orderFlagsMap.get(order.id) ?? []} max={3} compact />
                    </td>
                  </tr>
                  {expandedOrderId === order.id && (
                    <tr className="bg-slate-50/60">
                      <td colSpan={9} className="px-6 py-4">
                        <div className="text-[10px] text-slate-600 mb-3 font-semibold uppercase tracking-wide">Productos de esta orden</div>
                        {order.items && order.items.length > 0 ? (
                          <div className="space-y-2">
                            {order.items.map((item: any, idx: number) => (
                              <div key={idx} className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-slate-200/60" style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.04)", animationDelay: `${idx * 60}ms` }}>
                                <div className="flex items-center gap-2 flex-1">
                                  <div className="w-8 h-8 rounded flex-shrink-0 overflow-hidden bg-slate-100 cursor-pointer" onClick={() => item.imageUrl && setZoomedImage(item.imageUrl)}>
                                    {item.imageUrl ? <img src={item.imageUrl} alt="" className="w-full h-full object-cover" /> : <Package size={14} className="text-slate-400" />}
                                  </div>
                                  <span className="text-xs text-slate-800">{item.name || "Producto sin nombre"}</span>
                                </div>
                                <div className="flex items-center gap-4 text-xs text-slate-500">
                                  <span>{item.quantity} x {formatARS(item.unitPrice)}</span>
                                  <span className="font-medium text-slate-800">{formatARS(item.totalPrice)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400">Sin detalle de productos disponible</p>
                        )}
                        <div className="mt-2 flex gap-4 text-[10px] text-slate-400">
                          <span>ID: {order.externalId}</span>
                          <span>Pago: {order.paymentMethod}</span>
                          <span>Canal: {order.source}</span>
                          {order.promotionNames && <span>Promo: {order.promotionNames}</span>}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {filteredOrders.length === 0 && (
                <tr><td colSpan={9} className="text-center py-8 text-xs text-slate-400">No se encontraron ordenes</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination — footer bar */}
        {data.pagination && (
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100/80 bg-slate-50/40 -mx-6 -mb-6 px-6 py-3 rounded-b-2xl">
            <div className="text-xs text-slate-500 tabular-nums">
              Pagina {currentPage} de {data.pagination.totalPages || 0} · {data.pagination.totalCount.toLocaleString("es-AR")} ordenes
            </div>
            <div className="flex gap-2">
              <button onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-white hover:shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ transition: "all 220ms cubic-bezier(0.16, 1, 0.3, 1)" }}>
                Anterior
              </button>
              <button onClick={() => setCurrentPage(currentPage + 1)} disabled={currentPage >= (data.pagination?.totalPages || 1)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-white hover:shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ transition: "all 220ms cubic-bezier(0.16, 1, 0.3, 1)" }}>
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* IMAGE ZOOM MODAL */}
      {zoomedImage && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4 dash-filter-backdrop" onClick={() => setZoomedImage(null)}>
          <div className="dash-sheet dash-sheet--centered max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-800 tracking-tight">Imagen ampliada</h3>
              <button onClick={() => setZoomedImage(null)} className="text-slate-400 hover:text-slate-900 text-lg" style={{ transition: "color 180ms cubic-bezier(0.16, 1, 0.3, 1)" }}>&times;</button>
            </div>
            <div className="bg-slate-50 rounded-xl w-full aspect-square flex items-center justify-center overflow-hidden">
              <img src={zoomedImage} alt="" className="w-full h-full object-contain" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
