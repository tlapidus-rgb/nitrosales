// @ts-nocheck
"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Package, Search, ChevronRight, X, Tag, CreditCard,
  Truck, MapPin, User, ShoppingBag, Receipt, TrendingUp,
  DollarSign, Percent, Gift, Clock, ExternalLink, Copy,
  ChevronDown, AlertTriangle, CheckCircle2, XCircle, Timer,
  Layers, Eye, ArrowUpRight, ArrowDownRight, Hash, Zap,
  BarChart3, ChevronLeft,
} from "lucide-react";
import { formatARS, formatCompact } from "@/lib/utils/format";

/* ═══════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════ */
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
  pickupStoreName?: string | null;
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

/* ═══════════════════════════════════════════════════════════════
   Design system constants
   ═══════════════════════════════════════════════════════════════ */
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const SHADOW_CARD = "0 1px 0 rgba(15,23,42,0.04), 0 4px 12px -6px rgba(15,23,42,0.06)";
const SHADOW_ELEVATED = "0 1px 0 rgba(15,23,42,0.06), 0 8px 24px -12px rgba(15,23,42,0.12), 0 22px 40px -28px rgba(15,23,42,0.10)";

/* ═══════════════════════════════════════════════════════════════
   Brand logos — inline SVGs for pixel-perfect rendering
   ═══════════════════════════════════════════════════════════════ */
/* MercadoLibre — official handshake icon on yellow */
function MeliLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="12" fill="#FFE600"/>
      <path d="M24 10C18.48 10 13.56 13.44 11 18.36C13.56 14.64 18.48 12 24 12C29.52 12 34.44 14.64 37 18.36C34.44 13.44 29.52 10 24 10Z" fill="#2D3277"/>
      <path d="M11 18.36C11 24.96 16.84 30.36 24 30.36C31.16 30.36 37 24.96 37 18.36" stroke="#2D3277" strokeWidth="2.4" strokeLinecap="round" fill="none"/>
      <ellipse cx="18.5" cy="21" rx="2.8" ry="3" fill="#2D3277"/>
      <ellipse cx="29.5" cy="21" rx="2.8" ry="3" fill="#2D3277"/>
      <path d="M14 34C14 34 18 31 24 31C30 31 34 34 34 34" stroke="#2D3277" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.5"/>
    </svg>
  );
}

/* VTEX — official pink wordmark */
function VtexLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="12" fill="#F71963" opacity="0.08"/>
      <g transform="translate(6,15)">
        <polygon points="0,0 5,0 9,10.5 13,0 18,0 11,18 7,18" fill="#F71963"/>
        <polygon points="16,0 28,0 28,3.5 21,3.5 21,7 27,7 27,10.5 21,10.5 21,14.5 28,14.5 28,18 16,18" fill="#F71963"/>
        <polygon points="30,0 36,0 36,5 33,5 33,0" fill="#F71963" opacity="0"/>
      </g>
    </svg>
  );
}

function SourceLogo({ source, size = 16 }: { source: string; size?: number }) {
  return source === "MELI" ? <MeliLogo size={size} /> : <VtexLogo size={size} />;
}

/* ═══════════════════════════════════════════════════════════════
   Status config — refined palette
   ═══════════════════════════════════════════════════════════════ */
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  PENDING:   { label: "Pendiente",      color: "#f59e0b", bg: "bg-amber-50",   icon: <Timer size={11} /> },
  APPROVED:  { label: "En preparación", color: "#3b82f6", bg: "bg-blue-50",    icon: <CheckCircle2 size={11} /> },
  INVOICED:  { label: "Facturado",      color: "#8b5cf6", bg: "bg-violet-50",  icon: <Receipt size={11} /> },
  SHIPPED:   { label: "Enviado",        color: "#06b6d4", bg: "bg-cyan-50",    icon: <Truck size={11} /> },
  DELIVERED: { label: "Entregado",      color: "#10b981", bg: "bg-emerald-50", icon: <CheckCircle2 size={11} /> },
  CANCELLED: { label: "Cancelado",      color: "#ef4444", bg: "bg-red-50",     icon: <XCircle size={11} /> },
  RETURNED:  { label: "Devuelto",       color: "#f97316", bg: "bg-orange-50",  icon: <AlertTriangle size={11} /> },
};

/* ═══════════════════════════════════════════════════════════════
   InlineChange — delta indicator
   ═══════════════════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════════════════
   ORDER LIST ITEM — Linear-grade compact row
   ═══════════════════════════════════════════════════════════════ */
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

  const dt = (order.deliveryType || "").toLowerCase();
  const isPickup = dt.includes("pickup") || dt.includes("retiro") || !!order.pickupStoreName;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left group relative"
      style={{ transition: `all 220ms ${EASE}` }}
    >
      <div
        className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
        style={{
          backgroundColor: isSelected ? (isMeli ? "#eab308" : "#F71963") : "transparent",
          transition: `all 280ms ${EASE}`,
          opacity: isSelected ? 1 : 0,
          transform: isSelected ? "scaleY(1)" : "scaleY(0.4)",
        }}
      />

      <div
        className={`flex items-start gap-3 pl-4 pr-3 py-3.5 mx-1.5 rounded-xl ${
          isSelected ? "" : "hover:bg-slate-50/80"
        }`}
        style={{
          transition: `all 180ms ${EASE}`,
          ...(isSelected ? {
            background: "linear-gradient(135deg, rgba(15,23,42,0.03) 0%, rgba(15,23,42,0.015) 100%)",
          } : {}),
        }}
      >
        {/* Product thumbnail with source logo overlay */}
        <div className="relative flex-shrink-0">
          {firstItem?.imageUrl ? (
            <div
              className="w-12 h-12 rounded-xl overflow-hidden bg-slate-50 mt-0.5"
              style={{
                border: "1px solid rgba(15,23,42,0.06)",
                boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
              }}
            >
              <img src={firstItem.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
            </div>
          ) : (
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mt-0.5"
              style={{
                background: isMeli
                  ? "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)"
                  : "linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%)",
                border: `1px solid ${isMeli ? "rgba(234,179,8,0.2)" : "rgba(247,25,99,0.15)"}`,
              }}
            >
              <Package size={16} className={isMeli ? "text-yellow-600" : "text-pink-500"} />
            </div>
          )}
          {/* Source logo badge — bottom-right corner */}
          <div
            className="absolute -bottom-1 -right-1 rounded-md overflow-hidden"
            style={{
              boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
              border: "2px solid white",
            }}
          >
            <SourceLogo source={order.source} size={16} />
          </div>
        </div>

        {/* Content — 3 rows */}
        <div className="flex-1 min-w-0 pt-0.5">
          {/* Row 1: Product name + total */}
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-semibold text-slate-800 truncate leading-tight tracking-tight">
              {firstItem?.name || "Sin detalle"}
            </p>
            <span className="text-[13px] font-bold text-slate-900 tabular-nums flex-shrink-0 tracking-tight">
              {formatARS(order.totalValue)}
            </span>
          </div>

          {/* Row 2: Status + items + pickup */}
          <div className="flex items-center gap-1.5 mt-2">
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-semibold leading-none"
              style={{
                backgroundColor: statusCfg.color + "12",
                color: statusCfg.color,
                border: `1px solid ${statusCfg.color}20`,
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: statusCfg.color }}
              />
              {statusCfg.label}
            </span>
            <span className="text-[10px] text-slate-400 tabular-nums">
              {order.itemCount} {order.itemCount > 1 ? "prod." : "prod."}
            </span>
            {isPickup && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-semibold leading-none bg-teal-50 text-teal-600 border border-teal-200/50">
                <MapPin size={8} /> Retiro
              </span>
            )}
          </div>

          {/* Row 3: Customer + date/time */}
          <div className="flex items-center justify-between gap-2 mt-1.5">
            <span className="text-[11px] text-slate-400 truncate">
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
          className="text-slate-300 flex-shrink-0 mt-2"
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

/* ═══════════════════════════════════════════════════════════════
   DETAIL SECTION — premium reusable wrapper
   ═══════════════════════════════════════════════════════════════ */
function DetailSection({ title, icon, children, className = "" }: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl bg-white overflow-hidden ${className}`}
      style={{
        border: "1px solid rgba(15,23,42,0.06)",
        boxShadow: SHADOW_CARD,
      }}
    >
      <div
        className="flex items-center gap-2 px-5 py-3"
        style={{
          borderBottom: "1px solid rgba(15,23,42,0.05)",
          background: "linear-gradient(180deg, #fafbfc 0%, #f8f9fb 100%)",
        }}
      >
        {icon && <span className="text-slate-400">{icon}</span>}
        <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{title}</h3>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   METRIC PILL — premium KPI display
   ═══════════════════════════════════════════════════════════════ */
function MetricPill({ label, value, sub, color }: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-lg font-bold tabular-nums tracking-tight ${color || "text-slate-900"}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ORDER DETAIL PANEL — Stripe-grade right panel
   ═══════════════════════════════════════════════════════════════ */
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

  const dateFormatted = (() => {
    try {
      const d = new Date(order.orderDate);
      return d.toLocaleDateString("es-AR", {
        weekday: "short", day: "numeric", month: "long", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    } catch { return order.orderDate; }
  })();

  const subtotal = order.items.reduce((s, i) => s + i.totalPrice, 0) || order.totalValue;
  const discount = order.discountValue || 0;
  const shipping = order.shippingCost || 0;
  const hasPromo = order.promotionNames && order.promotionNames.trim().length > 0;

  const netAfterIVA = order.totalValue / 1.21;
  const meliCommission = isMeli ? order.totalValue * 0.13 : 0;
  const estimatedNet = netAfterIVA - meliCommission - shipping;
  const estimatedMarginPct = order.totalValue > 0 ? (estimatedNet / order.totalValue) * 100 : 0;

  const [detailTab, setDetailTab] = useState<"comercial" | "rentabilidad">("comercial");

  const dt = (order.deliveryType || "").toLowerCase();
  const isPickup = dt.includes("pickup") || dt.includes("retiro") || dt.includes("store") || dt.includes("sucursal") || dt.includes("withdraw") || !!order.pickupStoreName;

  return (
    <div
      className="flex flex-col h-full"
      style={{ animation: `detailSlideIn 280ms ${EASE} both` }}
    >
      {/* ─── Sticky Header ─── */}
      <div
        className="flex-shrink-0 px-6 py-5"
        style={{
          background: "linear-gradient(180deg, #ffffff 0%, #fafbfc 100%)",
          borderBottom: "1px solid rgba(15,23,42,0.06)",
        }}
      >
        {/* Top row: source logo + status + close */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <SourceLogo source={order.source} size={28} />
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold"
              style={{
                backgroundColor: statusCfg.color + "10",
                color: statusCfg.color,
                border: `1px solid ${statusCfg.color}18`,
              }}
            >
              {statusCfg.icon}
              {statusCfg.label}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-300 hover:text-slate-500"
            style={{ transition: `all 180ms ${EASE}` }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Order ID + amount */}
        <div className="flex items-end justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Hash size={13} className="text-slate-300" />
              <h2 className="text-base font-bold text-slate-900 tracking-tight font-mono">
                {order.externalId}
              </h2>
            </div>
            <p className="text-[11px] text-slate-400 ml-[21px]">{dateFormatted}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-slate-900 tabular-nums tracking-tight">
              {formatARS(order.totalValue)}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5 tabular-nums">
              {order.itemCount} item{order.itemCount !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div
          className="flex items-center gap-1 mt-5 rounded-xl p-0.5"
          style={{
            background: "linear-gradient(135deg, #f1f5f9 0%, #e8ecf1 100%)",
          }}
        >
          {(["comercial", "rentabilidad"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setDetailTab(tab)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold tracking-wide ${
                detailTab === tab
                  ? "bg-white text-slate-900"
                  : "text-slate-500 hover:text-slate-700"
              }`}
              style={{
                transition: `all 180ms ${EASE}`,
                ...(detailTab === tab ? { boxShadow: "0 1px 3px rgba(15,23,42,0.08)" } : {}),
              }}
            >
              {tab === "comercial" ? (
                <><ShoppingBag size={12} /> Venta</>
              ) : (
                <><TrendingUp size={12} /> Rentabilidad</>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Scrollable Content ─── */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#e2e8f0 transparent" }}>

        {detailTab === "comercial" ? (
          <>
            {/* Products */}
            <DetailSection title="Productos" icon={<Package size={13} />}>
              <div className="space-y-3">
                {order.items.length > 0 ? order.items.map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div
                      className="w-14 h-14 rounded-xl flex-shrink-0 overflow-hidden cursor-pointer group"
                      style={{
                        border: "1px solid rgba(15,23,42,0.06)",
                        boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
                        background: "#fafbfc",
                        transition: `all 220ms ${EASE}`,
                      }}
                      onClick={() => item.imageUrl && onImageZoom(item.imageUrl)}
                    >
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl} alt=""
                          className="w-full h-full object-cover group-hover:scale-105"
                          style={{ transition: `transform 320ms ${EASE}` }}
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package size={16} className="text-slate-300" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <p className="text-[13px] font-semibold text-slate-800 leading-tight tracking-tight">
                        {item.name || "Producto sin nombre"}
                      </p>
                      <p className="text-xs text-slate-400 tabular-nums mt-1">
                        {item.quantity} × {formatARS(item.unitPrice)}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0 pt-0.5">
                      <p className="text-sm font-bold text-slate-900 tabular-nums tracking-tight">
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

                {order.items.length > 1 && (
                  <div
                    className="flex items-center justify-between pt-3"
                    style={{ borderTop: "1px solid rgba(15,23,42,0.05)" }}
                  >
                    <span className="text-xs font-medium text-slate-500">Subtotal ({order.items.length} productos)</span>
                    <span className="text-sm font-bold text-slate-900 tabular-nums tracking-tight">{formatARS(subtotal)}</span>
                  </div>
                )}
              </div>
            </DetailSection>

            {/* Promotions */}
            {(hasPromo || discount > 0) && (
              <DetailSection title="Promociones" icon={<Tag size={13} />}>
                <div className="space-y-2.5">
                  {hasPromo && (
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-pink-50 flex items-center justify-center flex-shrink-0">
                        <Gift size={13} className="text-pink-500" />
                      </div>
                      <span className="text-sm text-slate-700">{order.promotionNames}</span>
                    </div>
                  )}
                  {discount > 0 && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                          <Percent size={13} className="text-emerald-500" />
                        </div>
                        <span className="text-sm text-slate-700">Descuento</span>
                      </div>
                      <span className="text-sm font-bold text-emerald-600 tabular-nums tracking-tight">
                        -{formatARS(discount)}
                      </span>
                    </div>
                  )}
                </div>
              </DetailSection>
            )}

            {/* Customer */}
            <DetailSection title="Cliente" icon={<User size={13} />}>
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: "linear-gradient(135deg, #f1f5f9 0%, #e8ecf1 100%)",
                    border: "1px solid rgba(15,23,42,0.06)",
                  }}
                >
                  <span className="text-xs font-bold text-slate-500">
                    {order.customerName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate tracking-tight">{order.customerName}</p>
                  {order.customerEmail && order.customerEmail !== "" && (
                    <p className="text-xs text-slate-400 truncate mt-0.5">{order.customerEmail}</p>
                  )}
                </div>
              </div>
            </DetailSection>

            {/* Payment + Delivery */}
            <div className="grid grid-cols-2 gap-3">
              <DetailSection title="Pago" icon={<CreditCard size={13} />} className="col-span-1">
                <p className="text-sm font-semibold text-slate-800 tracking-tight">{order.paymentMethod}</p>
                {order.channel && (
                  <p className="text-xs text-slate-400 mt-1.5">Canal: {order.channel}</p>
                )}
              </DetailSection>

              {isPickup ? (
                <DetailSection title="Retiro" icon={<MapPin size={13} />} className="col-span-1">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0">
                      <MapPin size={12} className="text-teal-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800 tracking-tight">
                        {order.pickupStoreName || "Sucursal"}
                      </p>
                      <p className="text-[10px] text-teal-600 font-medium mt-0.5">Retiro en sucursal</p>
                    </div>
                  </div>
                </DetailSection>
              ) : (
                <DetailSection title="Envío" icon={<Truck size={13} />} className="col-span-1">
                  <p className="text-sm font-bold text-slate-800 tabular-nums tracking-tight">{formatARS(shipping)}</p>
                  {order.deliveryType && (
                    <p className="text-xs text-slate-400 mt-1">{order.deliveryType}</p>
                  )}
                  {order.shippingCarrier && (
                    <p className="text-xs text-slate-400">{order.shippingCarrier}</p>
                  )}
                </DetailSection>
              )}
            </div>
          </>
        ) : (
          /* ═══════ TAB: RENTABILIDAD ═══════ */
          <>
            {/* Key financial metrics */}
            <div
              className="rounded-2xl p-5"
              style={{
                background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
                border: "1px solid rgba(15,23,42,0.06)",
                boxShadow: SHADOW_CARD,
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
            <DetailSection title="Cascada de ingresos" icon={<BarChart3 size={13} />}>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Subtotal productos</span>
                  <span className="text-sm font-semibold text-slate-900 tabular-nums">{formatARS(subtotal)}</span>
                </div>
                {shipping > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">+ Envío cobrado</span>
                    <span className="text-sm font-medium text-slate-700 tabular-nums">+{formatARS(shipping)}</span>
                  </div>
                )}
                {discount > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">- Descuento</span>
                    <span className="text-sm font-medium text-emerald-600 tabular-nums">-{formatARS(discount)}</span>
                  </div>
                )}
                <div
                  className="flex items-center justify-between pt-2.5"
                  style={{ borderTop: "1px solid rgba(15,23,42,0.06)" }}
                >
                  <span className="text-sm font-semibold text-slate-800">Total facturado</span>
                  <span className="text-sm font-bold text-slate-900 tabular-nums">{formatARS(order.totalValue)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">- IVA 21%</span>
                  <span className="text-sm font-medium text-red-500 tabular-nums">-{formatARS(order.totalValue - netAfterIVA)}</span>
                </div>
                {isMeli && meliCommission > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">- Comisión ML (~13%)</span>
                    <span className="text-sm font-medium text-red-500 tabular-nums">-{formatARS(meliCommission)}</span>
                  </div>
                )}
                {shipping > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">- Costo envío</span>
                    <span className="text-sm font-medium text-red-500 tabular-nums">-{formatARS(shipping)}</span>
                  </div>
                )}
                <div
                  className="flex items-center justify-between pt-2.5"
                  style={{ borderTop: "2px dashed rgba(15,23,42,0.08)" }}
                >
                  <span className="text-sm font-bold text-slate-900">Ingreso neto estimado</span>
                  <span className={`text-base font-bold tabular-nums tracking-tight ${estimatedNet >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {formatARS(estimatedNet)}
                  </span>
                </div>
              </div>
            </DetailSection>

            {/* Margin bar */}
            <div
              className="rounded-2xl p-5"
              style={{
                border: "1px solid rgba(15,23,42,0.06)",
                boxShadow: SHADOW_CARD,
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Margen estimado</span>
                <span className={`text-lg font-bold tabular-nums tracking-tight ${
                  estimatedMarginPct > 20 ? "text-emerald-600" : estimatedMarginPct > 10 ? "text-amber-600" : "text-red-600"
                }`}>
                  {estimatedMarginPct.toFixed(1)}%
                </span>
              </div>
              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ background: "linear-gradient(90deg, #f1f5f9 0%, #e8ecf1 100%)" }}
              >
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
              <p className="text-[10px] text-slate-400 mt-2.5 leading-relaxed">
                {isMeli
                  ? "Estimación basada en comisión ML ~13% + IVA 21%. No incluye COGS."
                  : "Estimación basada en IVA 21%. Para margen real, cargar costos de producto."}
              </p>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes detailSlideIn {
          from { opacity: 0; transform: translateX(12px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   EMPTY STATE — premium placeholder
   ═══════════════════════════════════════════════════════════════ */
function EmptyDetailState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
        style={{
          background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
          border: "1px solid rgba(15,23,42,0.06)",
          boxShadow: SHADOW_CARD,
        }}
      >
        <Eye size={22} className="text-slate-300" />
      </div>
      <p className="text-sm font-semibold text-slate-500 mb-1 tracking-tight">Seleccioná un pedido</p>
      <p className="text-xs text-slate-400 max-w-[220px] leading-relaxed">
        Hacé clic en cualquier pedido de la lista para ver sus detalles completos
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MASTER-DETAIL LAYOUT — main export
   ═══════════════════════════════════════════════════════════════ */
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

  useEffect(() => {
    if (orders.length > 0 && !selectedOrderId) {
      setSelectedOrderId(orders[0].id);
    }
  }, [orders]);

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
        boxShadow: SHADOW_ELEVATED,
      }}
    >
      {/* ═══ TOP STRIP — Billing KPIs + Filters ═══ */}
      <div
        className="flex-shrink-0"
        style={{
          background: "linear-gradient(180deg, #ffffff 0%, #fafbfc 100%)",
          borderBottom: "1px solid rgba(15,23,42,0.06)",
        }}
      >
        {/* KPIs row */}
        {billingKpis && (
          <div
            className="px-5 pt-5 pb-4"
            style={{ borderBottom: "1px solid rgba(15,23,42,0.04)" }}
          >
            <div className="flex items-center gap-8">
              {/* Revenue KPI with accent icon */}
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
                    boxShadow: "0 2px 8px rgba(15,23,42,0.3)",
                  }}
                >
                  <DollarSign size={15} className="text-white" />
                </div>
                <div>
                  <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Facturación bruta</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xl font-bold text-slate-900 tabular-nums tracking-tight">
                      {formatCompact(billingKpis.totalRevenue)}
                    </p>
                    <InlineChange value={billingKpis.changes?.revenue} />
                  </div>
                </div>
              </div>

              <div className="w-px h-10 bg-slate-100" />

              {/* Orders */}
              <div>
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Órdenes</p>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-bold text-slate-900 tabular-nums tracking-tight">
                    {billingKpis.totalOrders.toLocaleString("es-AR")}
                  </p>
                  <InlineChange value={billingKpis.changes?.orders} />
                </div>
              </div>

              <div className="w-px h-10 bg-slate-100" />

              {/* Ticket */}
              <div>
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Ticket promedio</p>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-bold text-slate-900 tabular-nums tracking-tight">
                    {formatARS(billingKpis.avgTicket)}
                  </p>
                  <InlineChange value={billingKpis.changes?.avgTicket} />
                </div>
              </div>

              <div className="w-px h-10 bg-slate-100" />

              {/* Discounts */}
              <div>
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Descuentos</p>
                <p className="text-lg font-bold text-emerald-600 tabular-nums tracking-tight">
                  -{formatCompact(billingKpis.totalDiscounts)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Filters row */}
        <div className="px-5 py-3 flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative w-60">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar orden, cliente..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-700 bg-white/80 placeholder:text-slate-400 focus:outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              style={{ transition: `all 220ms ${EASE}` }}
            />
          </div>

          {/* Source filter with logos */}
          <div
            className="flex items-center rounded-xl p-0.5"
            style={{
              background: "linear-gradient(135deg, #f1f5f9 0%, #e8ecf1 100%)",
            }}
          >
            {(["ALL", "VTEX", "MELI"] as const).map((s) => (
              <button
                key={s}
                onClick={() => onSourceFilterChange(s)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold tracking-wide ${
                  sourceFilter === s
                    ? "bg-white text-slate-900"
                    : "text-slate-500 hover:text-slate-700"
                }`}
                style={{
                  transition: `all 180ms ${EASE}`,
                  ...(sourceFilter === s ? { boxShadow: "0 1px 3px rgba(15,23,42,0.08)" } : {}),
                }}
              >
                {s === "VTEX" && <VtexLogo size={14} />}
                {s === "MELI" && <MeliLogo size={14} />}
                {s === "ALL" ? "Todos" : s === "MELI" ? "Mercado Libre" : "VTEX"}
              </button>
            ))}
          </div>

          {/* Status pills */}
          <div className="flex items-center gap-1 flex-wrap">
            {statusOptions.slice(0, 6).map((s) => {
              const cfg = STATUS_CONFIG[s.status];
              if (!cfg) return null;
              const isActive = statusFilter === s.status;
              return (
                <button
                  key={s.status}
                  onClick={() => onStatusChange(isActive ? null : s.status)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold ${
                    isActive
                      ? "bg-slate-900 text-white"
                      : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                  }`}
                  style={{
                    transition: `all 180ms ${EASE}`,
                    border: isActive ? "none" : "1px solid transparent",
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: isActive ? "white" : cfg.color }}
                  />
                  {cfg.label}
                </button>
              );
            })}
          </div>

          {/* Count */}
          <div className="ml-auto text-[11px] text-slate-400 tabular-nums flex-shrink-0 font-medium">
            {totalCount.toLocaleString("es-AR")} órdenes
          </div>
        </div>
      </div>

      {/* ═══ SPLIT PANE ═══ */}
      <div className="flex flex-1 min-h-0">
        {/* Left — Order List */}
        <div
          className="w-[50%] min-w-[380px] flex flex-col bg-white"
          style={{ borderRight: "1px solid rgba(15,23,42,0.06)" }}
        >
          <div ref={listRef} className="flex-1 overflow-y-auto py-1"
            style={{ scrollbarWidth: "thin", scrollbarColor: "#e2e8f0 transparent" }}>
            {loading && orders.length === 0 ? (
              Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3.5 mx-1.5">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 animate-pulse" />
                  <div className="flex-1">
                    <div className="h-3.5 w-36 bg-slate-100 rounded-lg animate-pulse mb-2.5" />
                    <div className="h-2.5 w-24 bg-slate-50 rounded-lg animate-pulse" />
                  </div>
                </div>
              ))
            ) : orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div
                  className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center mb-3"
                  style={{ boxShadow: SHADOW_CARD }}
                >
                  <Package size={20} className="text-slate-300" />
                </div>
                <p className="text-sm font-medium text-slate-400">No hay pedidos</p>
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              className="flex-shrink-0 flex items-center justify-between px-5 py-3"
              style={{
                borderTop: "1px solid rgba(15,23,42,0.05)",
                background: "linear-gradient(180deg, #fafbfc 0%, #f8f9fb 100%)",
              }}
            >
              <button
                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ transition: `all 180ms ${EASE}` }}
              >
                <ChevronLeft size={14} />
                Anterior
              </button>
              <span className="text-[11px] text-slate-400 tabular-nums font-medium">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage >= totalPages}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ transition: `all 180ms ${EASE}` }}
              >
                Siguiente
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Right — Detail Panel */}
        <div
          className="flex-1 min-w-0"
          style={{
            background: "linear-gradient(180deg, #fafbfc 0%, #f6f7f9 100%)",
          }}
        >
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
