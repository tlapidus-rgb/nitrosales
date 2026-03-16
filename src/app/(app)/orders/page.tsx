// @ts-nocheck

"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { formatARS, formatCompact } from "@/lib/utils/format";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  CreditCard,
  XCircle,
  Package,
  Users,
  Calendar,
  Filter,
  Search,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
} from "lucide-react";

// ── Types ──
interface KPIs {
  totalOrders: number;
  totalRevenue: number;
  avgTicket: number;
  totalItems: number;
  totalShipping: number;
  totalDiscounts: number;
  cancellationRate: number;
  cancelledOrders: number;
  changes: {
    orders: number;
    revenue: number;
    avgTicket: number;
  };
}

interface DailySale {
  day: string;
  orders: number;
  revenue: number;
  items: number;
}

interface DayOfWeekSale {
  dayName: string;
  dayOfWeek: number;
  totalOrders: number;
  avgOrders: number;
  totalRevenue: number;
  avgRevenue: number;
  numDays: number;
}

interface HourSale {
  hour: number;
  label: string;
  totalOrders: number;
  avgOrders: number;
  totalRevenue: number;
  avgRevenue: number;
  numDays: number;
}

interface PaymentMethod {
  method: string;
  orders: number;
  revenue: number;
}

interface StatusItem {
  status: string;
  count: number;
}

interface TopProduct {
  id: string;
  name: string;
  brand: string;
  category: string;
  unitsSold: number;
  revenue: number;
  orders: number;
}

interface TopCustomer {
  id: string;
  name: string;
  email: string;
  totalOrders: number;
  totalSpent: number;
}

interface OrderItemDetail {
  name: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface RecentOrder {
  id: string;
  externalId: string;
  status: string;
  totalValue: number;
  itemCount: number;
  paymentMethod: string;
  source: string;
  orderDate: string;
  customerName: string;
  customerEmail: string;
  items: OrderItemDetail[];
}

interface OrdersData {
  kpis: KPIs;
  dailySales: DailySale[];
  salesByDayOfWeek: DayOfWeekSale[];
  salesByHour: HourSale[];
  paymentMethods: PaymentMethod[];
  statusBreakdown: StatusItem[];
  topProducts: TopProduct[];
  topCustomers: TopCustomer[];
  recentOrders: RecentOrder[];
  meta: { dateFrom: string; dateTo: string; source: string };
}

// ── Constants ──
const COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4",
  "#8b5cf6", "#f97316", "#14b8a6", "#ec4899", "#94a3b8",
];

const STATUS_COLORS: Record<string, string> = {
  PENDING: "#f59e0b",
  APPROVED: "#3b82f6",
  INVOICED: "#8b5cf6",
  SHIPPED: "#06b6d4",
  DELIVERED: "#10b981",
  CANCELLED: "#ef4444",
  RETURNED: "#f97316",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  APPROVED: "Aprobada",
  INVOICED: "Facturada",
  SHIPPED: "Enviada",
  DELIVERED: "Entregada",
  CANCELLED: "Cancelada",
  RETURNED: "Devuelta",
};

const QUICK_RANGES = [
  { label: "7 días", days: 7 },
  { label: "30 días", days: 30 },
  { label: "90 días", days: 90 },
  { label: "12 meses", days: 365 },
];

// ── Helper: format date for input ──
function toDateInputValue(date: Date): string {
  return date.toISOString().split("T")[0];
}

// ── Component ──
export default function OrdersPage() {
  // Date range state
  const defaultTo = new Date();
  const defaultFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [dateFrom, setDateFrom] = useState(toDateInputValue(defaultFrom));
  const [dateTo, setDateTo] = useState(toDateInputValue(defaultTo));
  const [activeQuickRange, setActiveQuickRange] = useState<number | null>(30);

  // Source filter
  const [source, setSource] = useState<string>("ALL");

  // Data
  const [data, setData] = useState<OrdersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Table
  const [searchTerm, setSearchTerm] = useState("");
  const [sortColumn, setSortColumn] = useState<string>("orderDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Active chart metric
  const [dailyMetric, setDailyMetric] = useState<"revenue" | "orders">("revenue");

  // Expanded orders
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // ── Fetch data ──
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          from: dateFrom,
          to: dateTo,
        });
        if (source !== "ALL") params.set("source", source);

        const res = await fetch(`/api/metrics/orders?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setData(json);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [dateFrom, dateTo, source]);

  // ── Quick range handler ──
  const handleQuickRange = (days: number) => {
    const to = new Date();
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    setDateTo(toDateInputValue(to));
    setDateFrom(toDateInputValue(from));
    setActiveQuickRange(days);
  };

  // ── Custom date handler ──
  const handleDateChange = (type: "from" | "to", value: string) => {
    if (type === "from") setDateFrom(value);
    else setDateTo(value);
    setActiveQuickRange(null);
  };

  // ── Filtered recent orders ──
  const filteredOrders = useMemo(() => {
    if (!data) return [];
    let orders = [...data.recentOrders];
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
  }, [data, searchTerm]);

  // ── Change badge ──
  const ChangeBadge = ({ value }: { value: number }) => {
    if (value === 0) return <span className="text-xs text-gray-400">—</span>;
    const isPositive = value > 0;
    return (
      <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isPositive ? "text-emerald-600" : "text-red-500"}`}>
        {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
        {Math.abs(value).toFixed(1)}%
      </span>
    );
  };

  // ── Loading state ──
  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-3"></div>
          <p className="text-gray-500">Cargando órdenes...</p>
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

  return (
    <div className="space-y-6">
      {/* ══ HEADER + FILTERS ══ */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Órdenes</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Análisis de ventas y rendimiento por período
            </p>
          </div>

          {/* Source filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">Canal:</span>
            {["ALL", "VTEX", "MELI"].map((s) => (
              <button
                key={s}
                onClick={() => setSource(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  source === s
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                }`}
              >
                {s === "ALL" ? "Todos" : s}
              </button>
            ))}
          </div>
        </div>

        {/* Date range */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Quick ranges */}
          <div className="flex items-center gap-1.5">
            {QUICK_RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => handleQuickRange(r.days)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeQuickRange === r.days
                    ? "bg-gray-900 text-white"
                    : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="w-px h-6 bg-gray-200" />

          {/* Custom date inputs */}
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-gray-400" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => handleDateChange("from", e.target.value)}
              className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 bg-white"
            />
            <span className="text-xs text-gray-400">→</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => handleDateChange("to", e.target.value)}
              className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 bg-white"
            />
          </div>

          {loading && (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600" />
          )}
        </div>
      </div>

      {/* ══ KPI CARDS ══ */}
      <div className="grid grid-cols-4 gap-4">
        {/* Revenue */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-emerald-50 rounded-lg">
              <DollarSign size={16} className="text-emerald-600" />
            </div>
            <span className="text-xs text-gray-500 font-medium">Ventas totales</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatCompact(kpis.totalRevenue)}</p>
          <div className="mt-1">
            <ChangeBadge value={kpis.changes.revenue} />
            <span className="text-[10px] text-gray-400 ml-1">vs período anterior</span>
          </div>
        </div>

        {/* Orders */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-blue-50 rounded-lg">
              <ShoppingCart size={16} className="text-blue-600" />
            </div>
            <span className="text-xs text-gray-500 font-medium">Órdenes</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{kpis.totalOrders.toLocaleString("es-AR")}</p>
          <div className="mt-1">
            <ChangeBadge value={kpis.changes.orders} />
            <span className="text-[10px] text-gray-400 ml-1">vs período anterior</span>
          </div>
        </div>

        {/* Avg Ticket */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-purple-50 rounded-lg">
              <CreditCard size={16} className="text-purple-600" />
            </div>
            <span className="text-xs text-gray-500 font-medium">Ticket promedio</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatARS(kpis.avgTicket)}</p>
          <div className="mt-1">
            <ChangeBadge value={kpis.changes.avgTicket} />
            <span className="text-[10px] text-gray-400 ml-1">vs período anterior</span>
          </div>
        </div>

        {/* Cancellation rate */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-red-50 rounded-lg">
              <XCircle size={16} className="text-red-500" />
            </div>
            <span className="text-xs text-gray-500 font-medium">Cancelación / Devolución</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{kpis.cancellationRate}%</p>
          <div className="mt-1">
            <span className="text-[10px] text-gray-400">
              {kpis.cancelledOrders} orden{kpis.cancelledOrders !== 1 ? "es" : ""}
            </span>
          </div>
        </div>
      </div>

      {/* ══ DAILY SALES CHART ══ */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-800">Ventas por día</h2>
          <div className="flex gap-1.5">
            <button
              onClick={() => setDailyMetric("revenue")}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                dailyMetric === "revenue"
                  ? "bg-indigo-100 text-indigo-700"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              Facturación
            </button>
            <button
              onClick={() => setDailyMetric("orders")}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                dailyMetric === "orders"
                  ? "bg-indigo-100 text-indigo-700"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              Órdenes
            </button>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data.dailySales}>
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="day"
              tickFormatter={(d) => {
                const date = new Date(d + "T12:00:00");
                return `${date.getDate()}/${date.getMonth() + 1}`;
              }}
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => dailyMetric === "revenue" ? formatCompact(v) : v.toLocaleString()}
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              width={60}
            />
            <Tooltip
              formatter={(value: number) =>
                dailyMetric === "revenue"
                  ? formatARS(value)
                  : value.toLocaleString("es-AR")
              }
              labelFormatter={(d) => {
                const date = new Date(d + "T12:00:00");
                return date.toLocaleDateString("es-AR", {
                  weekday: "long",
                  day: "numeric",
                  month: "short",
                });
              }}
              contentStyle={{
                borderRadius: "0.5rem",
                border: "1px solid #e2e8f0",
                fontSize: "0.8rem",
              }}
            />
            <Area
              type="monotone"
              dataKey={dailyMetric}
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#colorRevenue)"
              name={dailyMetric === "revenue" ? "Facturación" : "Órdenes"}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ══ ROW: DAY OF WEEK + HOUR HEATMAP ══ */}
      <div className="grid grid-cols-2 gap-4">
        {/* Sales by day of week — PROMEDIO */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Promedio de órdenes por día de la semana</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.salesByDayOfWeek}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="dayName"
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                formatter={(value: number) => [value.toLocaleString("es-AR"), "Promedio órdenes/día"]}
                contentStyle={{ borderRadius: "0.5rem", border: "1px solid #e2e8f0", fontSize: "0.8rem" }}
              />
              <Bar dataKey="avgOrders" fill="#6366f1" radius={[4, 4, 0, 0]} name="avgOrders" />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-gray-400 mt-2 text-center">
            Promedio diario — útil para saber cuándo pautar ads
          </p>
        </div>

        {/* Sales by hour — PROMEDIO */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Promedio de órdenes por hora del día</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.salesByHour}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
                interval={2}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                formatter={(value: number) => [value.toLocaleString("es-AR"), "Promedio órdenes/día"]}
                contentStyle={{ borderRadius: "0.5rem", border: "1px solid #e2e8f0", fontSize: "0.8rem" }}
              />
              <Bar dataKey="avgOrders" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-gray-400 mt-2 text-center">
            Promedio diario — horas pico ideales para WhatsApp, emails y ofertas
          </p>
        </div>
      </div>

      {/* ══ ROW: PAYMENT METHODS + STATUS BREAKDOWN ══ */}
      <div className="grid grid-cols-2 gap-4">
        {/* Payment methods */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Métodos de pago</h2>
          <div className="flex gap-4">
            <div className="w-1/2">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={data.paymentMethods}
                    dataKey="revenue"
                    nameKey="method"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {data.paymentMethods.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => formatARS(value)}
                    contentStyle={{ borderRadius: "0.5rem", border: "1px solid #e2e8f0", fontSize: "0.8rem" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-1/2 flex flex-col justify-center gap-2">
              {data.paymentMethods.slice(0, 5).map((pm, i) => (
                <div key={pm.method} className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  <span className="text-xs text-gray-600 truncate flex-1">{pm.method}</span>
                  <span className="text-xs font-medium text-gray-800">
                    {pm.orders.toLocaleString("es-AR")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Status breakdown */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Estado de las órdenes</h2>
          <div className="space-y-3">
            {data.statusBreakdown.map((s) => {
              const total = data.statusBreakdown.reduce((acc, x) => acc + x.count, 0);
              const pct = total > 0 ? (s.count / total) * 100 : 0;
              return (
                <div key={s.status}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: STATUS_COLORS[s.status] || "#94a3b8" }}
                      />
                      <span className="text-xs text-gray-700">
                        {STATUS_LABELS[s.status] || s.status}
                      </span>
                    </div>
                    <span className="text-xs font-medium text-gray-800">
                      {s.count.toLocaleString("es-AR")} ({pct.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: STATUS_COLORS[s.status] || "#94a3b8",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ══ ROW: TOP PRODUCTS + TOP CUSTOMERS ══ */}
      <div className="grid grid-cols-2 gap-4">
        {/* Top products */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Top productos vendidos</h2>
          <div className="space-y-2.5 max-h-[320px] overflow-y-auto">
            {data.topProducts.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 py-1.5">
                <span className="text-xs font-bold text-gray-400 w-5 text-right">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{p.name}</p>
                  <p className="text-[10px] text-gray-400">{p.brand} · {p.category}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-gray-800">{formatARS(p.revenue)}</p>
                  <p className="text-[10px] text-gray-400">{p.unitsSold} uds · {p.orders} ord</p>
                </div>
              </div>
            ))}
            {data.topProducts.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">Sin datos para este período</p>
            )}
          </div>
        </div>

        {/* Top customers */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Users size={14} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-800">Top clientes</h2>
          </div>
          <div className="space-y-2.5 max-h-[320px] overflow-y-auto">
            {data.topCustomers.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 py-1.5">
                <span className="text-xs font-bold text-gray-400 w-5 text-right">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{c.name}</p>
                  <p className="text-[10px] text-gray-400 truncate">{c.email}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-gray-800">{formatARS(c.totalSpent)}</p>
                  <p className="text-[10px] text-gray-400">{c.totalOrders} orden{c.totalOrders !== 1 ? "es" : ""}</p>
                </div>
              </div>
            ))}
            {data.topCustomers.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">Sin datos para este período</p>
            )}
          </div>
        </div>
      </div>

      {/* ══ RECENT ORDERS TABLE ══ */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-800">Últimas órdenes</h2>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por ID, cliente o pago..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 bg-white w-64"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-[11px] font-medium text-gray-500 pb-2 px-2">ID</th>
                <th className="text-left text-[11px] font-medium text-gray-500 pb-2 px-2">Fecha</th>
                <th className="text-left text-[11px] font-medium text-gray-500 pb-2 px-2">Cliente</th>
                <th className="text-right text-[11px] font-medium text-gray-500 pb-2 px-2">Monto</th>
                <th className="text-center text-[11px] font-medium text-gray-500 pb-2 px-2">Items</th>
                <th className="text-left text-[11px] font-medium text-gray-500 pb-2 px-2">Pago</th>
                <th className="text-center text-[11px] font-medium text-gray-500 pb-2 px-2">Canal</th>
                <th className="text-center text-[11px] font-medium text-gray-500 pb-2 px-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <React.Fragment key={order.id}>
                  <tr
                    className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer"
                    onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                  >
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-1">
                        <ChevronDown
                          size={12}
                          className={`text-gray-400 transition-transform ${expandedOrderId === order.id ? "rotate-180" : ""}`}
                        />
                        <span className="text-xs font-mono text-indigo-600">
                          {order.externalId.length > 15
                            ? `...${order.externalId.slice(-12)}`
                            : order.externalId}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-2">
                      <span className="text-xs text-gray-600">{order.orderDate}</span>
                    </td>
                    <td className="py-2.5 px-2">
                      <div>
                        <span className="text-xs text-gray-700 truncate max-w-[150px] block">
                          {order.customerName}
                        </span>
                        {order.customerEmail && (
                          <span className="text-[10px] text-gray-400 truncate max-w-[150px] block">
                            {order.customerEmail}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      <span className="text-xs font-medium text-gray-800">
                        {formatARS(order.totalValue)}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <span className="text-xs text-gray-600">{order.itemCount}</span>
                    </td>
                    <td className="py-2.5 px-2">
                      <span className="text-xs text-gray-600 truncate max-w-[100px] block">
                        {order.paymentMethod}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        order.source === "MELI"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-indigo-50 text-indigo-600"
                      }`}>
                        {order.source}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <span
                        className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium"
                        style={{
                          backgroundColor: `${STATUS_COLORS[order.status] || "#94a3b8"}15`,
                          color: STATUS_COLORS[order.status] || "#94a3b8",
                        }}
                      >
                        {STATUS_LABELS[order.status] || order.status}
                      </span>
                    </td>
                  </tr>
                  {/* Expanded detail */}
                  {expandedOrderId === order.id && (
                    <tr className="bg-gray-50/80">
                      <td colSpan={8} className="px-6 py-3">
                        <div className="text-xs text-gray-600 mb-2 font-medium">Productos de esta orden:</div>
                        {order.items && order.items.length > 0 ? (
                          <div className="space-y-1.5">
                            {order.items.map((item: any, idx: number) => (
                              <div key={idx} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-100">
                                <div className="flex-1">
                                  <span className="text-xs text-gray-800">{item.name || "Producto sin nombre"}</span>
                                </div>
                                <div className="flex items-center gap-4 text-xs text-gray-500">
                                  <span>{item.quantity} x {formatARS(item.unitPrice)}</span>
                                  <span className="font-medium text-gray-800">{formatARS(item.totalPrice)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400">Sin detalle de productos disponible</p>
                        )}
                        <div className="mt-2 flex gap-4 text-[10px] text-gray-400">
                          <span>ID: {order.externalId}</span>
                          <span>Pago: {order.paymentMethod}</span>
                          <span>Canal: {order.source}</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-xs text-gray-400">
                    No se encontraron órdenes
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
