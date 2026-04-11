// @ts-nocheck
"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Package, Search, ChevronRight, X, Tag, CreditCard,
  Truck, MapPin, User, ShoppingBag, Receipt, TrendingUp,
  DollarSign, Percent, Gift, Clock, ExternalLink, Copy,
  ChevronDown, AlertTriangle, CheckCircle2, XCircle, Timer,
  Layers, Eye, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { formatARS, formatCompact } from "@/lib/utils/format";

/* ──────────────────────────────────────────────
   Types
   ────────────────────────────────────────────── */
interface OrderItem {
  name: string | null;
  imageUrl?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface Order {
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
  items: OrderItem[];
  promotionNames: string | null;
  discountValue?: number;
  shippingCost?: number;
  channel?: string | null;
  deliveryType?: string | null;
  shippingCarrier?: string | null;
}

interface BillingKpis {
  totalRevenue: number;
  totalOrders: number;
  avgTicket: number;
  totalDiscounts: number;
  changes?: { revenue?: number; orders?: number; avgTicket?: number };
}

interface OrdersMasterDetailProps {
  orders: Order[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  loading: boolean;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  statusFilter: string | null;
  onStatusChange: (status: string | null) => void;
  sourceFilter: "ALL" | "VTEX" | "MELI";
  onSourceFilterChange: (s: "ALL" | "VTEX" | "MELI") => void;
  statusBreakdown: Array<{ status: string; count: number }>;
  onImageZoom: (url: string) => void;
  billingKpis?: BillingKpis;
}

/* ──────────────────────────────────────────────
   Status config
   ────────────────────────────────────────────── */
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  PENDING:   { label: "Pendiente",      color: "#f59e0b", bg: "bg-amber-50",   icon: <Timer size={12} /> },
  APPROVED:  { label: "En preparación", color: "#3b82f6", bg: "bg-blue-50",    icon: <CheckCircle2 size={12} /> },
  INVOICED:  { label: "Facturado",      color: "#8b5cf6", bg: "bg-violet-50",  icon: <Receipt size={12} /> },
  SHIPPED:   { label: "Enviado",        color: "#06b6d4", bg: "bg-cyan-50",    icon: <Truck size={12} /> },
  DELIVERED: { label: "Entregado",      color: "#10b981", bg: "bg-emerald-50", icon: <CheckCircle2 size={12} /> },
  CANCELLED: { label: "Cancelado",      color: "#ef4444", bg: "bg-red-50",     icon: <XCircle size={12} /> },
  RETURNED:  { label: "Devuelto",       color: "#f97316", bg: "bg-orange-50",  icon: <AlertTriangle size={12} /> },
};

/* ──────────────────────────────────────────────
   Easing + transitions (UI Vision NitroSales)
   ────────────────────────────────────────────── */
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

/* ──────────────────────────────────────────────
   CHANGE BADGE — inline delta indicator
   ────────────────────────────────────────────── */
function InlineChange({ value }: { value?: number }) {
  if (value === undefined || value === null || !isFinite(value)) return null;
  const isPositive = value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums ${
      isPositive ? "text-emerald-600" : "text-rose-500"
    }`}>
      {isPositive ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

/* ──────────────────────────────────────────────
   ORDER LIST ITEM (compact row — left panel)
   ────────────────────────────────────────────── */
function OrderListItem({
  order,
  isSelected,
  onClick,
}: {
  order: Order;
  isSelected: boolean;
  onClick: () => void;
}) {
  const isMeli = order.source === "MELI";
  const statusCfg = STATUS_CONFIG[order.status] || { label: order.status, color: "#94a3b8", bg: "bg-slate-50", icon: null };
  const firstItem = order.items?.[0];

  const dateShort = (() => {
    try {
      const d = new Date(order.orderDate);
      return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
    } catch { return order.orderDate; }
  })();
  const timeStr = (() => {
    try {
      return new Date(order.orderDate).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    } catch { return ""; }
  })();
  const itemCountLabel = order.itemCount > 1 ? `${order.itemCount} productos` : "1 producto";

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left group relative"
      style={{ transition: `all 220ms ${EASE}` }}
    >
      {/* Selection indicator — left accent bar */}
      <div
        className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
        style={{
          backgroundColor: isSelected ? (isMeli ? "#eab308" : "#6366f1") : "transparent",
          transition: `all 280ms ${EASE}`,
          opacity: isSelected ? 1 : 0,
          transform: isSelected ? "scaleY(1)" : "scaleY(0.5)",
        }}
      />

      <div
        className={`flex items-start gap-3 pl-4 pr-3 py-3 mx-1 rounded-xl ${
          isSelected
            ? "bg-slate-900/[0.04]"
            : "hover:bg-slate-50"
        }`}
        style={{ transition: `all 180ms ${EASE}` }}
      >
        {/* Product thumbnail */}
        {firstItem?.imageUrl ? (
          <div className="w-11 h-11 rounded-lg flex-shrink-0 overflow-hidden bg-slate-50 border border-slate-100/80 mt-0.5"
            style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
            <img src={firstItem.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
          </div>
        ) : (
          <div className={`w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
            isMeli ? "bg-yellow-50 border border-yellow-200/60" : "bg-indigo-50 border border-indigo-200/60"
          }`}>
            <Package size={16} className={isMeli ? "text-yellow-500" : "text-indigo-500"} />
          </div>
        )}

        {/* Content — 3 rows */}
        <div className="flex-1 min-w-0">
          {/* Row 1: Product name + total */}
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-semibold text-slate-800 truncate leading-tight tracking-tight">
              {firstItem?.name || "Sin detalle"}
            </p>
            <span className="text-[13px] font-bold text-slate-900 tabular-nums flex-shrink-0">
              {formatARS(order.totalValue)}
            </span>
          </div>
          {/* Row 2: Source + status + item count */}
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold leading-none ${
              isMeli
                ? "bg-yellow-50 text-yellow-700 border border-yellow-200/60"
                : "bg-indigo-50 text-indigo-600 border border-indigo-200/60"
            }`}>
              {isMeli ? "ML" : "VTEX"}
            </span>
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold leading-none"
              style={{
                backgroundColor: statusCfg.color + "14",
                color: statusCfg.color,
                border: `1px solid ${statusCfg.color}22`,
              }}
            >
              <span className="w-1 h-1 rounded-full" style={{ backgroundColor: statusCfg.color }} />
              {statusCfg.label}
            </span>
            <span className="text-[10px] text-slate-400">{itemCountLabel}</span>
          </div>
          {/* Row 3: Customer + date/time */}
          <div className="flex items-center justify-between gap-2 mt-1.5">
            <span className="text-[11px] text-slate-500 truncate">
              {order.customerName !== "Cliente sin datos" && order.customerName !== "Cliente MercadoLibre"
                ? order.customerName
                : order.paymentMethod}
            </span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-[10px] text-slate-400 tabular-nums">{dateShort}</span>
              <span className="text-[10px] text-slate-300 tabular-nums">{timeStr}</span>
            </div>
          </div>
        </div>

        {/* Chevron */}
        <ChevronRight
          size={14}
          className="text-slate-300 flex-shrink-0 mt-1"
          style={{
            opacity: isSelected ? 1 : 0,
            transform: isSelected ? "translateX(0)" : "translateX(-4px)",
            transition: `all 180ms ${EASE}`,
          }}
        />
      </div>
    </button>
  );
}

/* ──────────────────────────────────────────────
   DETAIL SECTION — reusable section wrapper
   ────────────────────────────────────────────── */
function DetailSection({ title, icon, children, className = "" }: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl bg-white border border-slate-100/80 overflow-hidden ${className}`}
      style={{ boxShadow: "0 1px 0 rgba(15,23,42,0.04), 0 4px 12px -6px rgba(15,23,42,0.06)" }}>
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100/80">
        {icon && <span className="text-slate-400">{icon}</span>}
        <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{title}</h3>
      </div>
      <div className="px-5 py-4">
        {children}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   METRIC PILL — small KPI display
   ────────────────────────────────────────────── */
function MetricPill({ label, value, sub, color }: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-lg font-bold tabular-nums tracking-tight ${color || "text-slate-900"}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

/* ──────────────────────────────────────────────
   ORDER DETAIL PANEL (right side)
   ────────────────────────────────────────────── */
function OrderDetailPanel({
  order,
  onImageZoom,
  onClose,
}: {
  order: Order;
  onImageZoom: (url: string) => void;
  onClose: () => void;
}) {
  const isMeli = order.source === "MELI";
  const statusCfg = STATUS_CONFIG[order.status] || { label: order.status, color: "#94a3b8", bg: "bg-slate-50", icon: null };
  const accentColor = isMeli ? "#eab308" : "#6366f1";

  const dateFormatted = (() => {
    try {
      const d = new Date(order.orderDate);
      return d.toLocaleDateString("es-AR", {
        weekday: "short", day: "numeric", month: "long", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    } catch { return order.orderDate; }
  })();

  // Calculate per-order economics
  const subtotal = order.items.reduce((s, i) => s + i.totalPrice, 0) || order.totalValue;
  const discount = order.discountValue || 0;
  const shipping = order.shippingCost || 0;
  const hasPromo = order.promotionNames && order.promotionNames.trim().length > 0;

  // Estimate margin (for VTEX with cost data we'd use real COGS, for now use net)
  const netAfterIVA = order.totalValue / 1.21;
  const meliCommission = isMeli ? order.totalValue * 0.13 : 0; // ~13% ML comisión promedio
  const estimatedNet = netAfterIVA - meliCommission - shipping;
  const estimatedMarginPct = order.totalValue > 0 ? (estimatedNet / order.totalValue) * 100 : 0;

  const [detailTab, setDetailTab] = useState<"comercial" | "rentabilidad">("comercial");

  return (
    <div
      className="flex flex-col h-full"
      style={{
        animation: `detailSlideIn 280ms ${EASE} both`,
      }}
    >
      {/* ─── Sticky Header ─── */}
      <div
        className="flex-shrink-0 px-6 py-4 border-b border-slate-100/80"
        style={{
          background: "linear-gradient(180deg, #ffffff 0%, #fbfbfd 100%)",
        }}
      >
        {/* Top row: source + status + close */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold ${
                isMeli ? "bg-yellow-50 text-yellow-700 border border-yellow-200/60" : "bg-indigo-50 text-indigo-600 border border-indigo-200/60"
              }`}
            >
              {isMeli ? "Mercado Libre" : "VTEX"}
            </span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold`}
              style={{
                backgroundColor: statusCfg.color + "14",
                color: statusCfg.color,
                border: `1px solid ${statusCfg.color}22`,
              }}
            >
              {statusCfg.icon}
              {statusCfg.label}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
            style={{ transition: `all 180ms ${EASE}` }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Order ID + date */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              #{order.externalId}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{dateFormatted}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-slate-900 tabular-nums tracking-tight">
              {formatARS(order.totalValue)}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {order.itemCount} item{order.itemCount !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Detail tabs — Comercial vs Rentabilidad */}
        <div className="flex items-center gap-1 mt-4 bg-slate-100/80 rounded-xl p-0.5">
          {(["comercial", "rentabilidad"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setDetailTab(tab)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold tracking-wide ${
                detailTab === tab
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
              style={{ transition: `all 180ms ${EASE}` }}
            >
              {tab === "comercial" ? (
                <>
                  <ShoppingBag size={12} />
                  Venta
                </>
              ) : (
                <>
                  <TrendingUp size={12} />
                  Rentabilidad
                </>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Scrollable Content ─── */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#e2e8f0 transparent" }}>

        {detailTab === "comercial" ? (
          /* ═══════ TAB: COMERCIAL ═══════ */
          <>
            {/* Products — hero section */}
            <DetailSection title="Productos" icon={<Package size={14} />}>
              <div className="space-y-3">
                {order.items.length > 0 ? order.items.map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    {/* Product image — large and clickable */}
                    <div
                      className="w-16 h-16 rounded-xl flex-shrink-0 overflow-hidden bg-slate-50 border border-slate-100/80 cursor-pointer hover:shadow-md group"
                      style={{ transition: `all 220ms ${EASE}` }}
                      onClick={() => item.imageUrl && onImageZoom(item.imageUrl)}
                    >
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-105"
                          style={{ transition: `transform 280ms ${EASE}` }} loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package size={18} className="text-slate-300" />
                        </div>
                      )}
                    </div>
                    {/* Product info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 leading-tight tracking-tight">
                        {item.name || "Producto sin nombre"}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-xs text-slate-500 tabular-nums">
                          {item.quantity} × {formatARS(item.unitPrice)}
                        </span>
                      </div>
                    </div>
                    {/* Line total */}
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-slate-900 tabular-nums">
                        {formatARS(item.totalPrice)}
                      </p>
                    </div>
                  </div>
                )) : (
                  <div className="flex items-center gap-2 py-3 text-slate-400">
                    <Package size={16} />
                    <span className="text-sm italic">Sin detalle de productos</span>
                  </div>
                )}

                {/* Subtotal line */}
                {order.items.length > 1 && (
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                    <span className="text-xs font-medium text-slate-500">Subtotal ({order.items.length} productos)</span>
                    <span className="text-sm font-bold text-slate-900 tabular-nums">{formatARS(subtotal)}</span>
                  </div>
                )}
              </div>
            </DetailSection>

            {/* Promotions & discounts */}
            {(hasPromo || discount > 0) && (
              <DetailSection title="Promociones y descuentos" icon={<Tag size={14} />}>
                <div className="space-y-2.5">
                  {hasPromo && (
                    <div className="flex items-center gap-2">
                      <Gift size={14} className="text-pink-500 flex-shrink-0" />
                      <span className="text-sm text-slate-700">{order.promotionNames}</span>
                    </div>
                  )}
                  {discount > 0 && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Percent size={14} className="text-emerald-500 flex-shrink-0" />
                        <span className="text-sm text-slate-700">Descuento aplicado</span>
                      </div>
                      <span className="text-sm font-semibold text-emerald-600 tabular-nums">
                        -{formatARS(discount)}
                      </span>
                    </div>
                  )}
                </div>
              </DetailSection>
            )}

            {/* Customer */}
            <DetailSection title="Cliente" icon={<User size={14} />}>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-slate-500">
                      {order.customerName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{order.customerName}</p>
                    {order.customerEmail && order.customerEmail !== "" && (
                      <p className="text-xs text-slate-400 truncate">{order.customerEmail}</p>
                    )}
                  </div>
                </div>
              </div>
            </DetailSection>

            {/* Payment + Shipping */}
            <div className="grid grid-cols-2 gap-3">
              <DetailSection title="Pago" icon={<CreditCard size={14} />} className="col-span-1">
                <p className="text-sm font-medium text-slate-800">{order.paymentMethod}</p>
                {order.channel && (
                  <p className="text-xs text-slate-400 mt-1">Canal: {order.channel}</p>
                )}
              </DetailSection>
              <DetailSection title="Envío" icon={<Truck size={14} />} className="col-span-1">
                <p className="text-sm font-medium text-slate-800 tabular-nums">{formatARS(shipping)}</p>
                {order.deliveryType && (
                  <p className="text-xs text-slate-400 mt-1">{order.deliveryType}</p>
                )}
                {order.shippingCarrier && (
                  <p className="text-xs text-slate-400">{order.shippingCarrier}</p>
                )}
              </DetailSection>
            </div>
          </>
        ) : (
          /* ═══════ TAB: RENTABILIDAD ═══════ */
          <>
            {/* Key financial metrics */}
            <div
              className="rounded-2xl border border-slate-100/80 p-5"
              style={{
                background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
                boxShadow: "0 1px 0 rgba(15,23,42,0.04), 0 4px 12px -6px rgba(15,23,42,0.06)",
              }}
            >
              <div className="grid grid-cols-3 gap-4">
                <MetricPill
                  label="Facturado"
                  value={formatARS(order.totalValue)}
                  sub="Precio final con IVA"
                />
                <MetricPill
                  label="Neto (sin IVA)"
                  value={formatARS(netAfterIVA)}
                  sub={`-${formatARS(order.totalValue - netAfterIVA)} IVA`}
                />
                <MetricPill
                  label="Estimado neto"
                  value={formatARS(estimatedNet)}
                  sub={`~${estimatedMarginPct.toFixed(0)}% margen`}
                  color={estimatedMarginPct > 20 ? "text-emerald-600" : estimatedMarginPct > 10 ? "text-amber-600" : "text-red-600"}
                />
              </div>
            </div>

            {/* Revenue waterfall */}
            <DetailSection title="Cascada de ingresos" icon={<DollarSign size={14} />}>
              <div className="space-y-2.5">
                {/* Subtotal */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Subtotal productos</span>
                  <span className="text-sm font-semibold text-slate-900 tabular-nums">{formatARS(subtotal)}</span>
                </div>
                {/* Shipping */}
                {shipping > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">+ Envío cobrado</span>
                    <span className="text-sm font-medium text-slate-700 tabular-nums">+{formatARS(shipping)}</span>
                  </div>
                )}
                {/* Discount */}
                {discount > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">- Descuento</span>
                    <span className="text-sm font-medium text-emerald-600 tabular-nums">-{formatARS(discount)}</span>
                  </div>
                )}
                {/* Total line */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <span className="text-sm font-semibold text-slate-800">Total facturado</span>
                  <span className="text-sm font-bold text-slate-900 tabular-nums">{formatARS(order.totalValue)}</span>
                </div>
                {/* IVA */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">- IVA 21%</span>
                  <span className="text-sm font-medium text-red-500 tabular-nums">-{formatARS(order.totalValue - netAfterIVA)}</span>
                </div>
                {/* ML Commission */}
                {isMeli && meliCommission > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">- Comisión ML (~13%)</span>
                    <span className="text-sm font-medium text-red-500 tabular-nums">-{formatARS(meliCommission)}</span>
                  </div>
                )}
                {/* Shipping cost */}
                {shipping > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">- Costo envío</span>
                    <span className="text-sm font-medium text-red-500 tabular-nums">-{formatARS(shipping)}</span>
                  </div>
                )}
                {/* Net result */}
                <div className="flex items-center justify-between pt-2 border-t border-dashed border-slate-200">
                  <span className="text-sm font-bold text-slate-900">Ingreso neto estimado</span>
                  <span className={`text-base font-bold tabular-nums ${estimatedNet >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {formatARS(estimatedNet)}
                  </span>
                </div>
              </div>
            </DetailSection>

            {/* Margin indicator */}
            <div className="rounded-2xl border border-slate-100/80 p-5"
              style={{ boxShadow: "0 1px 0 rgba(15,23,42,0.04), 0 4px 12px -6px rgba(15,23,42,0.06)" }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Margen estimado</span>
                <span className={`text-lg font-bold tabular-nums ${
                  estimatedMarginPct > 20 ? "text-emerald-600" : estimatedMarginPct > 10 ? "text-amber-600" : "text-red-600"
                }`}>
                  {estimatedMarginPct.toFixed(1)}%
                </span>
              </div>
              {/* Visual bar */}
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, Math.max(0, estimatedMarginPct))}%`,
                    background: estimatedMarginPct > 20
                      ? "linear-gradient(90deg, #10b981, #059669)"
                      : estimatedMarginPct > 10
                      ? "linear-gradient(90deg, #f59e0b, #d97706)"
                      : "linear-gradient(90deg, #ef4444, #dc2626)",
                    transition: `width 600ms ${EASE}`,
                  }}
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-2">
                {isMeli
                  ? "Estimación basada en comisión ML ~13% + IVA 21%. No incluye COGS."
                  : "Estimación basada en IVA 21%. Para margen real, cargar costos de producto."}
              </p>
            </div>
          </>
        )}
      </div>

      {/* CSS for animations */}
      <style>{`
        @keyframes detailSlideIn {
          from { opacity: 0; transform: translateX(12px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

/* ──────────────────────────────────────────────
   EMPTY STATE (no order selected)
   ────────────────────────────────────────────── */
function EmptyDetailState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div
        className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mb-4"
        style={{ boxShadow: "0 1px 0 rgba(15,23,42,0.04), 0 4px 12px -6px rgba(15,23,42,0.06)" }}
      >
        <Eye size={24} className="text-slate-300" />
      </div>
      <p className="text-sm font-medium text-slate-500 mb-1">Seleccioná un pedido</p>
      <p className="text-xs text-slate-400 max-w-[200px]">
        Hacé clic en cualquier pedido de la lista para ver todos los detalles
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────────
   MASTER-DETAIL LAYOUT (main export)
   ────────────────────────────────────────────── */
export default function OrdersMasterDetail({
  orders,
  totalCount,
  currentPage,
  totalPages,
  pageSize,
  onPageChange,
  loading,
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusChange,
  sourceFilter,
  onSourceFilterChange,
  statusBreakdown,
  onImageZoom,
  billingKpis,
}: OrdersMasterDetailProps) {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId) ?? null,
    [orders, selectedOrderId]
  );

  // Auto-select first order when data loads
  useEffect(() => {
    if (orders.length > 0 && !selectedOrderId) {
      setSelectedOrderId(orders[0].id);
    }
  }, [orders]);

  // Status filter pills from breakdown
  const statusOptions = useMemo(() => {
    return statusBreakdown
      .filter((s) => s.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [statusBreakdown]);

  return (
    <div
      className="flex flex-col rounded-2xl bg-white overflow-hidden"
      style={{
        height: "calc(100vh - 180px)",
        minHeight: "640px",
        border: "1px solid rgba(15,23,42,0.06)",
        boxShadow: "0 1px 0 rgba(15,23,42,0.04), 0 8px 24px -12px rgba(15,23,42,0.08)",
      }}
    >
      {/* ═══ TOP STRIP — Billing KPIs + Filters (all inside the block) ═══ */}
      <div
        className="flex-shrink-0 border-b border-slate-100/80"
        style={{ background: "linear-gradient(180deg, #ffffff 0%, #fbfbfd 100%)" }}
      >
        {/* Billing KPIs row */}
        {billingKpis && (
          <div className="px-5 pt-4 pb-3 border-b border-slate-100/60">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center flex-shrink-0">
                  <DollarSign size={14} className="text-white" />
                </div>
                <div>
                  <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Facturación bruta</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xl font-bold text-slate-900 tabular-nums tracking-tight">
                      {formatCompact(billingKpis.totalRevenue)}
                    </p>
                    <InlineChange value={billingKpis.changes?.revenue} />
                  </div>
                </div>
              </div>
              <div className="w-px h-8 bg-slate-100" />
              <div>
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Órdenes</p>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-bold text-slate-900 tabular-nums tracking-tight">
                    {billingKpis.totalOrders.toLocaleString("es-AR")}
                  </p>
                  <InlineChange value={billingKpis.changes?.orders} />
                </div>
              </div>
              <div className="w-px h-8 bg-slate-100" />
              <div>
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Ticket promedio</p>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-bold text-slate-900 tabular-nums tracking-tight">
                    {formatARS(billingKpis.avgTicket)}
                  </p>
                  <InlineChange value={billingKpis.changes?.avgTicket} />
                </div>
              </div>
              <div className="w-px h-8 bg-slate-100" />
              <div>
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Descuentos</p>
                <p className="text-lg font-bold text-emerald-600 tabular-nums tracking-tight">
                  -{formatCompact(billingKpis.totalDiscounts)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Filters row */}
        <div className="px-5 py-3 flex items-center gap-3 flex-wrap">
          <div className="relative w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar orden, cliente..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-700 bg-white/80 focus:outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              style={{ transition: `all 220ms ${EASE}` }}
            />
          </div>
          <div className="flex items-center bg-slate-100/80 rounded-lg p-0.5">
            {(["ALL", "VTEX", "MELI"] as const).map((s) => (
              <button
                key={s}
                onClick={() => onSourceFilterChange(s)}
                className={`px-2.5 py-1.5 rounded-md text-[10px] font-semibold tracking-wide ${
                  sourceFilter === s
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
                style={{ transition: `all 180ms ${EASE}` }}
              >
                {s === "ALL" ? "Todos" : s === "MELI" ? "Mercado Libre" : "VTEX"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {statusOptions.slice(0, 5).map((s) => {
              const cfg = STATUS_CONFIG[s.status];
              if (!cfg) return null;
              const isActive = statusFilter === s.status;
              return (
                <button
                  key={s.status}
                  onClick={() => onStatusChange(isActive ? null : s.status)}
                  className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold border ${
                    isActive
                      ? "border-slate-300 bg-slate-100 text-slate-800"
                      : "border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                  }`}
                  style={{ transition: `all 180ms ${EASE}` }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.color }} />
                  {cfg.label}
                </button>
              );
            })}
          </div>
          <div className="ml-auto text-xs text-slate-400 tabular-nums flex-shrink-0">
            {totalCount.toLocaleString("es-AR")} órdenes
          </div>
        </div>
      </div>

      {/* ═══ SPLIT PANE — List + Detail ═══ */}
      <div className="flex flex-1 min-h-0">
        {/* ═══ LEFT PANEL — Order List (50% width) ═══ */}
        <div className="w-[50%] min-w-[380px] flex flex-col border-r border-slate-100/80 bg-white">
          {/* Order list — scrollable */}
          <div ref={listRef} className="flex-1 overflow-y-auto py-1"
            style={{ scrollbarWidth: "thin", scrollbarColor: "#e2e8f0 transparent" }}>
            {loading && orders.length === 0 ? (
              // Skeleton
              Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 mx-1">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 dash-skeleton" />
                  <div className="flex-1">
                    <div className="h-3 w-32 bg-slate-100 rounded dash-skeleton mb-2" />
                    <div className="h-2.5 w-20 bg-slate-100 rounded dash-skeleton" />
                  </div>
                </div>
              ))
            ) : orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Package size={24} className="text-slate-300 mb-2" />
                <p className="text-sm text-slate-400">No hay pedidos</p>
              </div>
            ) : (
              orders.map((order) => (
                <OrderListItem
                  key={order.id}
                  order={order}
                  isSelected={selectedOrderId === order.id}
                  onClick={() => setSelectedOrderId(order.id)}
                />
              ))
            )}
          </div>

          {/* Pagination footer */}
          {totalPages > 1 && (
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-t border-slate-100/80 bg-slate-50/50">
              <button
                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ transition: `all 180ms ${EASE}` }}
              >
                ← Anterior
              </button>
              <span className="text-[11px] text-slate-400 tabular-nums">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage >= totalPages}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ transition: `all 180ms ${EASE}` }}
              >
                Siguiente →
              </button>
            </div>
          )}
        </div>

        {/* ═══ RIGHT PANEL — Order Detail ═══ */}
        <div className="flex-1 bg-slate-50/30 min-w-0">
          {selectedOrder ? (
            <OrderDetailPanel
              key={selectedOrder.id}
              order={selectedOrder}
              onImageZoom={onImageZoom}
              onClose={() => setSelectedOrderId(null)}
            />
          ) : (
            <EmptyDetailState />
          )}
        </div>
      </div>
    </div>
  );
}
