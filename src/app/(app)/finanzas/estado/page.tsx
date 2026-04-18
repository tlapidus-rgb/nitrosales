// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { formatCompact, formatDateShort } from "@/lib/utils/format";
import { DateRangeFilter } from "@/components/dashboard";
import { CurrencyToggle } from "@/components/finanzas/CurrencyToggle";
import WaterfallHero from "@/components/finanzas/WaterfallHero";
import WaterfallDrillPanel, { DrillData, DrillRow } from "@/components/finanzas/WaterfallDrillPanel";
import { useCurrencyView } from "@/hooks/useCurrencyView";

/* ── Types ──────────────────────────────────── */
interface PnlSummary {
  revenue: number;
  orders: number;
  units: number;
  aov: number;
  cogs: number;
  cogsCoverage: number;
  grossProfit: number;
  grossMargin: number;
  adSpend: number;
  metaSpend: number;
  googleSpend: number;
  shipping: number;
  realShipping?: number;
  customerShipping?: number;
  hasRealShipping?: boolean;
  operatingProfit: number;
  operatingMargin: number;
  platformFees?: number;
  paymentFees?: number;
  discounts?: number;
  manualCostsTotal?: number;
  netOperatingProfit?: number;
  netOperatingMargin?: number;
  isRI?: boolean;
  ivaDebitoFiscal?: number;
  revenueNetoIVA?: number;
}
interface Changes {
  revenue: number | null;
  orders: number | null;
  grossProfit: number | null;
  adSpend: number | null;
  operatingProfit: number | null;
}
interface DailyTrend {
  date: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  adSpend: number;
  operatingProfit: number;
  orders: number;
}
interface CategoryMargin {
  category: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  units: number;
}
interface BrandMargin {
  brand: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  units: number;
}
interface SourceBreakdown {
  source: string;
  revenue: number;
  orders: number;
  units: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  shipping: number;
  platformFee: number;
  platformFeeLabel: string;
  mlCommission: number;
  mlTaxWithholdings: number;
  operatingProfit: number;
  operatingMargin: number;
  aov: number;
}
interface PaymentFeeDetail {
  method: string;
  source: string;
  revenue: number;
  feeRate: number;
  fee: number;
}

/* ── Helpers ────────────────────────────────── */

/** Tooltip informativo — icono "?" que al hacer hover muestra explicación */
function InfoTip({ text }: { text: string }) {
  return (
    <span className="relative group inline-flex ml-1 cursor-help">
      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[10px] font-bold leading-none hover:bg-gray-300 transition-colors">?</span>
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 px-3 py-2 text-xs text-white bg-gray-800 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none leading-relaxed">
        {text}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
      </span>
    </span>
  );
}

function ChangeIndicator({ value, inverse }: { value: number | null | undefined; inverse?: boolean }) {
  if (value === null || value === undefined) return null;
  const isPositive = inverse ? value < 0 : value > 0;
  const color = isPositive ? "text-green-600" : value === 0 ? "text-gray-400" : "text-red-500";
  const arrow = value > 0 ? "\u2191" : value < 0 ? "\u2193" : "";
  return <span className={`text-xs font-medium ${color}`}>{arrow}{Math.abs(value)}%</span>;
}

function MarginBar({ value, color }: { value: number; color: string }) {
  const width = Math.min(Math.max(value, 0), 100);
  return (
    <div className="w-full bg-gray-100 rounded-full h-2">
      <div className={`h-2 rounded-full ${color}`} style={{ width: `${width}%` }} />
    </div>
  );
}

/** Health status based on net margin */
function getHealthStatus(margin: number): { label: string; color: string; bgColor: string; dotColor: string } {
  if (margin >= 15) return { label: "Excelente", color: "text-green-700", bgColor: "bg-green-50 border-green-200", dotColor: "bg-green-500" };
  if (margin >= 10) return { label: "Saludable", color: "text-green-600", bgColor: "bg-green-50 border-green-200", dotColor: "bg-green-400" };
  if (margin >= 5) return { label: "Aceptable", color: "text-yellow-600", bgColor: "bg-yellow-50 border-yellow-200", dotColor: "bg-yellow-400" };
  if (margin >= 0) return { label: "Ajustado", color: "text-orange-600", bgColor: "bg-orange-50 border-orange-200", dotColor: "bg-orange-400" };
  return { label: "Negativo", color: "text-red-600", bgColor: "bg-red-50 border-red-200", dotColor: "bg-red-500" };
}

/* ── Cost categories ───────────────────────── */
const COST_CATEGORIES = [
  { key: "LOGISTICA", label: "Logistica y Envios", placeholder: "Ej: Andreani, OCA, packaging" },
  { key: "EQUIPO", label: "Equipo y RRHH", placeholder: "Ej: Sueldos, freelancers" },
  { key: "PLATAFORMAS", label: "Plataformas y Herramientas", placeholder: "Ej: VTEX fijo, ERP, email marketing" },
  { key: "FISCAL", label: "Fiscal e Impuestos", placeholder: "Ej: IIBB, contador, monotributo" },
  { key: "INFRAESTRUCTURA", label: "Infraestructura", placeholder: "Ej: Alquiler, servicios, seguros" },
  { key: "MARKETING", label: "Marketing y Contenido", placeholder: "Ej: Fotografia, produccion, ferias" },
  { key: "MERMA", label: "Merma y Perdidas", placeholder: "Ej: Roturas, devoluciones no recuperables" },
  { key: "OTROS", label: "Otros", placeholder: "Ej: Gastos varios" },
];

/* ══════════════════════════════════════════════
   VISTA EJECUTIVA — "¿Cómo voy?"
   ══════════════════════════════════════════════ */
function ExecutiveView({
  summary, changes, dailyTrend, bySource, midDate,
}: {
  summary: PnlSummary;
  changes: Changes | null;
  dailyTrend: DailyTrend[];
  bySource: SourceBreakdown[];
  midDate: string;
}) {
  // Currency conversion hook (USD / ARS / ARS_ADJ)
  // midDate = punto medio del periodo, usado para el ajuste IPC en ARS_ADJ.
  const { convert, format } = useCurrencyView();
  const fm = (v: number, d?: string) => format(convert(v, d ?? midDate));

  const netProfit = summary.netOperatingProfit ?? summary.operatingProfit;
  const netMargin = summary.netOperatingMargin ?? summary.operatingMargin;
  const health = getHealthStatus(netMargin);

  // Total costs
  const totalCosts = summary.cogs + summary.adSpend + summary.shipping
    + (summary.platformFees || 0) + (summary.paymentFees || 0)
    + (summary.manualCostsTotal || 0);
  const costPct = summary.revenue > 0 ? (totalCosts / summary.revenue) * 100 : 0;

  return (
    <>
      {/* COGS Coverage Warning */}
      {summary.cogsCoverage < 50 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-start gap-2">
          <span className="text-amber-500 text-lg">&#9888;</span>
          <div>
            <p className="text-sm font-medium text-amber-800">
              Cobertura de costos: {summary.cogsCoverage}%
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Solo {summary.cogsCoverage}% de los items tienen precio de costo. Los margenes pueden no ser precisos.
            </p>
          </div>
        </div>
      )}

      {/* ── Section 1: Score Card ─── */}
      <div className={`rounded-xl border p-6 mb-6 ${health.bgColor}`}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-3 h-3 rounded-full ${health.dotColor}`} />
              <span className={`text-sm font-semibold uppercase tracking-wide ${health.color}`}>
                {health.label}
              </span>
            </div>
            <p className="text-3xl font-bold text-gray-900 mt-2">
              {fm(netProfit)}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Beneficio neto — {netMargin}% de margen
              <InfoTip text="El beneficio neto es lo que te queda despues de restar TODOS los costos: mercaderia, publicidad, envios, comisiones y gastos operativos. El margen indica que porcentaje de cada peso facturado es ganancia real." />
            </p>
            <p className="text-xs text-gray-400 mt-2">
              De {fm(summary.revenue)} facturados, te quedan {fm(netProfit)} despues de todos los costos
            </p>
          </div>
          <div className="text-right">
            {changes && (
              <div className="flex items-center gap-1 justify-end">
                <span className="text-xs text-gray-400">vs periodo anterior</span>
                <ChangeIndicator value={changes.operatingProfit} />
              </div>
            )}
            <p className="text-xs text-gray-400 mt-1">{summary.orders.toLocaleString("es-AR")} ordenes</p>
          </div>
        </div>
      </div>

      {/* ── Section 2: Cascada simplificada (3 cards) ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Facturación */}
        <div className="bg-white rounded-xl p-5 shadow-sm border-l-4 border-blue-500">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Facturacion <InfoTip text="Total cobrado por tus ventas, incluyendo IVA. Es el dinero bruto que entra antes de descontar cualquier costo." /></span>
          <p className="text-2xl font-bold text-gray-900 mt-2">{fm(summary.revenue)}</p>
          <p className="text-sm text-gray-500 mt-1">{summary.orders.toLocaleString("es-AR")} ordenes</p>
          {changes && (
            <div className="mt-2">
              <ChangeIndicator value={changes.revenue} />
            </div>
          )}
        </div>

        {/* Costos totales */}
        <div className="bg-white rounded-xl p-5 shadow-sm border-l-4 border-red-400">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Costos Totales <InfoTip text="Suma de todo lo que gastas para operar: costo de productos (COGS), publicidad, envios, comisiones de plataformas, medios de pago y gastos fijos." /></span>
          <p className="text-2xl font-bold text-gray-900 mt-2">{fm(totalCosts)}</p>
          <p className="text-sm text-gray-500 mt-1">{costPct.toFixed(1)}% del revenue</p>
          <div className="mt-3 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">COGS <InfoTip text="Cost of Goods Sold: lo que te cuesta comprar o fabricar los productos que vendiste." /></span>
              <span className="text-gray-600 font-mono">{fm(summary.cogs)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Publicidad</span>
              <span className="text-gray-600 font-mono">{fm(summary.adSpend)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Envios + Comisiones + Otros</span>
              <span className="text-gray-600 font-mono">
                {fm(summary.shipping + (summary.platformFees || 0) + (summary.paymentFees || 0) + (summary.manualCostsTotal || 0))}
              </span>
            </div>
          </div>
        </div>

        {/* Resultado */}
        <div className={`bg-white rounded-xl p-5 shadow-sm border-l-4 ${netProfit >= 0 ? "border-green-500" : "border-red-500"}`}>
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Resultado <InfoTip text="Lo que realmente ganas (o perdes) despues de pagar todos los costos. Si es verde, tu negocio es rentable. Si es rojo, estas operando a perdida." /></span>
          <p className={`text-2xl font-bold mt-2 ${netProfit >= 0 ? "text-green-700" : "text-red-600"}`}>
            {fm(netProfit)}
          </p>
          <p className="text-sm text-gray-500 mt-1">{netMargin}% margen neto <InfoTip text="El porcentaje de cada peso de facturacion que queda como ganancia neta. Ej: 18% significa que de cada $100 facturados, te quedan $18." /></p>
          {changes && (
            <div className="mt-2">
              <ChangeIndicator value={changes.operatingProfit} />
            </div>
          )}
          <div className="mt-3 flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${health.dotColor}`} />
            <span className={`text-xs font-medium ${health.color}`}>{health.label}</span>
          </div>
        </div>
      </div>

      {/* ── Section 3: Mini sparkline ─── */}
      {dailyTrend.length > 2 && (
        <div className="bg-white rounded-xl p-4 shadow-sm mb-6">
          <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Tendencia del periodo</h3>
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={dailyTrend} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <Area
                type="monotone" dataKey="revenue" name="Revenue"
                stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.08} strokeWidth={1.5}
              />
              <Area
                type="monotone" dataKey="operatingProfit" name="Beneficio"
                stroke="#22c55e" fill="#22c55e" fillOpacity={0.08} strokeWidth={1.5}
              />
              <Tooltip
                contentStyle={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "11px" }}
                formatter={(value: number, name: string) => [fm(value), name]}
                labelFormatter={formatDateShort}
              />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-1">
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <span className="w-3 h-0.5 bg-blue-500 inline-block rounded" /> Revenue
            </span>
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <span className="w-3 h-0.5 bg-green-500 inline-block rounded" /> Beneficio
            </span>
          </div>
        </div>
      )}

      {/* ── Section 4: Canales de un vistazo ─── */}
      {bySource.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {bySource.map((s) => {
            const channelHealth = getHealthStatus(s.operatingMargin);
            const revPct = summary.revenue > 0 ? ((s.revenue / summary.revenue) * 100).toFixed(0) : 0;
            return (
              <div key={s.source} className="bg-white rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-gray-700">
                    {s.source === "MELI" ? "MercadoLibre" : s.source}
                  </h4>
                  <span className="text-xs text-gray-400">{revPct}% del total</span>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <span className="text-xs text-gray-400 block">Revenue</span>
                    <span className="text-sm font-bold text-gray-800">{fm(s.revenue)}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 block">Ordenes</span>
                    <span className="text-sm font-bold text-gray-800">{s.orders.toLocaleString("es-AR")}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 block">Margen Op. <InfoTip text="Margen operativo: porcentaje de ganancia del canal despues de descontar costos directos (COGS, envios, comisiones). Cuanto mas alto, mas rentable es ese canal." /></span>
                    <span className={`text-sm font-bold ${channelHealth.color}`}>{s.operatingMargin}%</span>
                  </div>
                </div>
                <MarginBar
                  value={Math.max(s.operatingMargin, 0)}
                  color={s.operatingMargin >= 15 ? "bg-green-400" : s.operatingMargin >= 5 ? "bg-yellow-400" : "bg-red-400"}
                />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════
   VISTA DETALLADA — Todo el detalle financiero
   ══════════════════════════════════════════════ */
function DetailedView({
  summary, changes, dailyTrend, categories, brands, bySource, manualCosts,
  paymentFeeDetails, chartMode, setChartMode, midDate,
}: {
  summary: PnlSummary;
  changes: Changes | null;
  dailyTrend: DailyTrend[];
  categories: CategoryMargin[];
  brands: BrandMargin[];
  bySource: SourceBreakdown[];
  manualCosts: { category: string; total: number }[];
  paymentFeeDetails: PaymentFeeDetail[];
  chartMode: "waterfall" | "trend";
  setChartMode: (m: "waterfall" | "trend") => void;
  midDate: string;
}) {
  // Currency conversion hook (USD / ARS / ARS_ADJ)
  // midDate = punto medio del periodo, usado para el ajuste IPC en ARS_ADJ.
  const { convert, format } = useCurrencyView();
  const fm = (v: number, d?: string) => format(convert(v, d ?? midDate));

  const netOp = summary.netOperatingProfit ?? summary.operatingProfit;

  // Sub-fase 2b: drill-down lateral state + builder
  const [drillData, setDrillData] = useState<DrillData | null>(null);
  const [drillOpen, setDrillOpen] = useState(false);
  // Sub-fase 2c: toggle $ vs % en waterfall
  const [displayMode, setDisplayMode] = useState<"abs" | "pct">("abs");

  const waterfallData = [
    { name: "Revenue", value: summary.revenue, kind: "positive" as const },
    { name: "COGS", value: -summary.cogs, kind: "negative" as const },
    { name: "Margen Bruto", value: summary.grossProfit, kind: "subtotal" as const },
    { name: "Ads", value: -summary.adSpend, kind: "negative" as const },
    { name: "Envios", value: -summary.shipping, kind: "negative" as const },
    ...(summary.platformFees ? [{ name: "Comisiones", value: -(summary.platformFees), kind: "negative" as const }] : []),
    ...(summary.paymentFees ? [{ name: "Medios Pago", value: -(summary.paymentFees), kind: "negative" as const }] : []),
    ...(summary.manualCostsTotal ? [{ name: "Otros", value: -(summary.manualCostsTotal), kind: "negative" as const }] : []),
    { name: "Neto", value: netOp, kind: "total" as const },
  ];

  const tooltipStyle = {
    contentStyle: { backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "12px" },
  };

  // Build the P&L statement rows
  const pnlRows = [
    { label: "Facturacion (Revenue)", value: summary.revenue, bold: true, color: "text-blue-600", tip: "Todo lo que cobraste por ventas en el periodo. Incluye IVA si sos Responsable Inscripto." },
    // IVA rows for Responsable Inscripto
    ...(summary.isRI && summary.ivaDebitoFiscal ? [
      { label: "    IVA Debito Fiscal (21%)", value: -(summary.ivaDebitoFiscal), color: "text-gray-400", indent: true, small: true, tip: "El IVA que cobras en tus ventas y debes pagar a AFIP. No es ingreso tuyo, sino un impuesto que el cliente paga a traves tuyo." },
      { label: "    Revenue Neto IVA", value: summary.revenueNetoIVA || 0, color: "text-blue-400", indent: true, small: true, tip: "Tu facturacion real sin el IVA. Este es el verdadero ingreso de tu negocio si sos Responsable Inscripto." },
    ] : []),
    { label: "(-) Costo de Mercaderia (COGS)", value: -summary.cogs, color: "text-red-500", tip: "Lo que te costo comprar todos los productos que vendiste. Es tu costo mas grande y el que mas impacta en la rentabilidad." },
    { label: "= Ganancia Bruta", value: summary.grossProfit, bold: true, color: summary.grossProfit >= 0 ? "text-green-600" : "text-red-600", pct: summary.grossMargin, tip: "Revenue menos COGS. Muestra cuanto ganas solo por la diferencia entre precio de venta y costo del producto, sin considerar otros gastos." },
    { label: "(-) Inversion Publicitaria", value: -summary.adSpend, color: "text-orange-500", indent: true, tip: "Lo que invertiste en publicidad paga (Meta Ads + Google Ads). Es un costo variable: mientras mas invertis, mas ventas generas (idealmente)." },
    { label: "    Meta Ads", value: -summary.metaSpend, color: "text-gray-400", indent: true, small: true },
    { label: "    Google Ads", value: -summary.googleSpend, color: "text-gray-400", indent: true, small: true },
    { label: "(-) Costos de Envio", value: -summary.shipping, color: "text-purple-500", indent: true, tip: "Lo que pagaste en logistica para enviar los pedidos. Incluye envios gratis que absorbes vos y el costo real del flete." },
    { label: "(-) Comisiones de Plataforma", value: -(summary.platformFees || 0), color: "text-indigo-500", indent: true, tip: "Lo que te cobran los marketplaces por vender ahi. MercadoLibre cobra un porcentaje por venta, y VTEX puede tener un fee fijo o variable." },
    ...(bySource.map(s => ({
      label: `    ${s.source === "MELI" ? "MercadoLibre" : s.source}: ${s.platformFeeLabel}`,
      value: -s.platformFee,
      color: "text-gray-400",
      indent: true,
      small: true,
    }))),
    // Payment fees (NEW)
    ...(summary.paymentFees ? [
      { label: "(-) Comisiones Medios de Pago", value: -(summary.paymentFees), color: "text-sky-500", indent: true, tip: "Lo que te cobran por procesar pagos: tarjetas de credito/debito, MercadoPago, transferencias. Cada medio tiene su porcentaje." },
      ...(paymentFeeDetails.filter(pf => pf.fee > 0).map(pf => ({
        label: `    ${pf.method} (${pf.source}): ${pf.feeRate}%`,
        value: -pf.fee,
        color: "text-gray-400",
        indent: true,
        small: true,
      }))),
    ] : []),
    // Discounts (NEW)
    ...(summary.discounts ? [
      { label: "(-) Descuentos y Promociones", value: -(summary.discounts), color: "text-pink-500", indent: true, tip: "Cupones, descuentos y promociones que aplicaste. Es plata que dejaste de cobrar para incentivar ventas." },
    ] : []),
    // Manual costs
    ...(summary.manualCostsTotal ? [
      { label: "(-) Otros Costos Operativos", value: -(summary.manualCostsTotal), color: "text-teal-600", indent: true, tip: "Gastos fijos y variables que cargaste manualmente: sueldos, alquileres, herramientas, impuestos, etc. Son los costos que no vienen automaticamente de las plataformas." },
      ...(manualCosts.filter(mc => mc.total > 0).map(mc => {
        const cat = COST_CATEGORIES.find(c => c.key === mc.category);
        return {
          label: `    ${cat?.label || mc.category}`,
          value: -mc.total,
          color: "text-gray-400",
          indent: true,
          small: true,
        };
      })),
    ] : []),
    // Bottom line
    { label: "= Beneficio Neto Operativo", value: netOp, bold: true, color: netOp >= 0 ? "text-green-700" : "text-red-700", pct: (summary.netOperatingMargin ?? summary.operatingMargin), highlight: true, tip: "LA LINEA FINAL. Lo que realmente gana tu negocio. Si es positivo (verde), tu operacion es rentable. Si es negativo (rojo), estas perdiendo plata y hay que actuar." },
  ];

  // ──────────────────────────────────────────────────────────────
  // Sub-fase 2b — builder de drill-down por nombre del item
  // ──────────────────────────────────────────────────────────────
  function buildDrillData(name: string, value: number, kind: "positive" | "negative" | "subtotal" | "total"): DrillData {
    const rev = summary.revenue || 0;
    const revenueShare = rev > 0 ? (Math.abs(value) / rev) * 100 : 0;
    const base: DrillData = { name, value, kind, revenueShare, rows: [] };

    if (name === "Revenue") {
      base.description = "Todo lo que cobraste por ventas en el período. Desglose por canal.";
      base.rows = bySource.map((s) => ({
        label: s.source === "MELI" ? "MercadoLibre" : s.source,
        value: s.revenue,
        hint: `${s.orders.toLocaleString("es-AR")} órdenes · AOV ${fm(s.aov)}`,
        pct: rev > 0 ? (s.revenue / rev) * 100 : 0,
        originIcon: "auto",
      }));
      return base;
    }

    if (name === "COGS") {
      base.description = `Costo de mercadería vendida. Cobertura actual: ${summary.cogsCoverage}% de las unidades tienen precio de costo cargado.`;
      const totalAbs = Math.abs(value) || 1;
      base.rows = bySource
        .filter((s) => s.cogs > 0)
        .map((s) => ({
          label: s.source === "MELI" ? "MercadoLibre" : s.source,
          value: -s.cogs,
          hint: `${s.orders.toLocaleString("es-AR")} órdenes · ${s.units.toLocaleString("es-AR")} unidades`,
          pct: (s.cogs / totalAbs) * 100,
          originIcon: "auto",
        }));
      return base;
    }

    if (name === "Margen Bruto") {
      base.description = `Revenue ${fm(summary.revenue)} − COGS ${fm(summary.cogs)} = ${fm(summary.grossProfit)} (${summary.grossMargin}% margen).`;
      base.rows = bySource.map((s) => ({
        label: s.source === "MELI" ? "MercadoLibre" : s.source,
        value: s.grossProfit,
        hint: `Margen ${s.grossMargin}% · Revenue ${fm(s.revenue)}`,
        pct: s.revenue > 0 ? (s.grossProfit / s.revenue) * 100 : 0,
        originIcon: "calc",
      }));
      return base;
    }

    if (name === "Ads") {
      base.description = "Inversión publicitaria total en Meta (Facebook + Instagram) y Google (Search, Shopping, Display, YouTube).";
      const total = (summary.metaSpend || 0) + (summary.googleSpend || 0) || 1;
      base.rows = [
        { label: "Meta Ads", value: -summary.metaSpend, hint: "Facebook + Instagram", pct: (summary.metaSpend / total) * 100, originIcon: "auto" },
        { label: "Google Ads", value: -summary.googleSpend, hint: "Search, Shopping, Display, YouTube", pct: (summary.googleSpend / total) * 100, originIcon: "auto" },
      ].filter((r) => Math.abs(r.value) > 0);
      return base;
    }

    if (name === "Envios") {
      if (summary.hasRealShipping && typeof summary.realShipping === "number") {
        const real = summary.realShipping || 0;
        const charged = summary.customerShipping || 0;
        const subsidy = real - charged;
        base.description = "Costo real de la logística menos lo que cobraste al cliente. El subsidio es lo que absorbés.";
        base.rows = [
          { label: "Costo real de envíos", value: -real, hint: "Lo que pagaste a couriers (Andreani, OCA, etc.)", originIcon: "auto" },
          { label: "Cobrado al cliente", value: charged, hint: "Revenue de envío capturado en el checkout", originIcon: "auto" },
          { label: "Subsidio neto", value: -Math.max(0, subsidy), hint: "Lo que vos absorbés (envío gratis, delta por promos)", originIcon: "calc" },
        ];
      } else {
        base.description = "Costo de logística por canal.";
        base.rows = bySource
          .filter((s) => s.shipping > 0)
          .map((s) => ({
            label: s.source === "MELI" ? "MercadoLibre" : s.source,
            value: -s.shipping,
            hint: `${s.orders.toLocaleString("es-AR")} órdenes`,
            originIcon: "auto",
          }));
      }
      return base;
    }

    if (name === "Comisiones") {
      base.description = "Lo que te cobran los marketplaces por vender en su plataforma.";
      const total = summary.platformFees || 1;
      base.rows = bySource
        .filter((s) => s.platformFee > 0)
        .map((s) => ({
          label: `${s.source === "MELI" ? "MercadoLibre" : s.source} (${s.platformFeeLabel})`,
          value: -s.platformFee,
          hint: `Revenue ${fm(s.revenue)}`,
          pct: (s.platformFee / total) * 100,
          originIcon: "calc",
        }));
      return base;
    }

    if (name === "Medios Pago") {
      base.description = "Comisiones de procesadores de pago: tarjetas, MercadoPago, transferencias.";
      const total = summary.paymentFees || 1;
      base.rows = (paymentFeeDetails || [])
        .filter((p) => p.fee > 0)
        .map((p) => ({
          label: `${p.method}`,
          value: -p.fee,
          hint: `${p.source} · ${p.feeRate}% sobre ${fm(p.revenue)}`,
          pct: (p.fee / total) * 100,
          originIcon: "calc",
        }));
      return base;
    }

    if (name === "Otros") {
      base.description = "Gastos operativos cargados manualmente: sueldos, alquileres, herramientas, impuestos, etc.";
      const total = summary.manualCostsTotal || 1;
      base.rows = (manualCosts || [])
        .filter((m) => m.total > 0)
        .map((m) => {
          const cat = COST_CATEGORIES.find((c) => c.key === m.category);
          return {
            label: cat?.label || m.category,
            value: -m.total,
            pct: (m.total / total) * 100,
            originIcon: "manual" as const,
          };
        });
      return base;
    }

    if (name === "Neto") {
      base.description = `Lo que realmente queda después de todos los costos. Margen neto ${summary.netOperatingMargin ?? summary.operatingMargin}%.`;
      base.rows = [
        { label: "Revenue", value: summary.revenue, originIcon: "auto" },
        { label: "− COGS", value: -summary.cogs, originIcon: "auto" },
        { label: "= Margen Bruto", value: summary.grossProfit, hint: `${summary.grossMargin}% margen`, originIcon: "calc" },
        { label: "− Publicidad", value: -summary.adSpend, originIcon: "auto" },
        { label: "− Envíos", value: -summary.shipping, originIcon: "auto" },
        ...(summary.platformFees ? [{ label: "− Comisiones plataforma", value: -summary.platformFees, originIcon: "calc" as const }] : []),
        ...(summary.paymentFees ? [{ label: "− Medios de pago", value: -summary.paymentFees, originIcon: "calc" as const }] : []),
        ...(summary.manualCostsTotal ? [{ label: "− Otros costos", value: -summary.manualCostsTotal, originIcon: "manual" as const }] : []),
        { label: "= Beneficio Neto Operativo", value: netOp, hint: `${summary.netOperatingMargin ?? summary.operatingMargin}% margen`, originIcon: "calc" },
      ] as DrillRow[];
      return base;
    }

    // Fallback
    base.rows = [];
    base.description = "Sin desglose adicional disponible para este ítem.";
    return base;
  }

  function handleWaterfallClick(item: { name: string; value: number; kind?: "positive" | "negative" | "subtotal" | "total" }) {
    const drill = buildDrillData(item.name, item.value, item.kind ?? "positive");
    setDrillData(drill);
    setDrillOpen(true);
  }

  return (
    <>
      {/* COGS Coverage Warning */}
      {summary.cogsCoverage < 50 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-start gap-2">
          <span className="text-amber-500 text-lg">&#9888;</span>
          <div>
            <p className="text-sm font-medium text-amber-800">
              Cobertura de costos: {summary.cogsCoverage}%
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Solo {summary.cogsCoverage}% de los items tienen precio de costo. Para un P&L preciso,
              carga los costos en la seccion de Productos.
            </p>
          </div>
        </div>
      )}

      {/* ── KPI Cards (5 consolidadas) ─── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {/* Revenue */}
        <div className="bg-white rounded-xl p-4 border-l-4 border-blue-500 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Revenue <InfoTip text="Facturacion total: todo lo que cobraste por tus ventas en el periodo seleccionado, incluyendo IVA." /></span>
            {changes && <ChangeIndicator value={changes.revenue} />}
          </div>
          <p className="text-lg font-bold text-gray-800">{fm(summary.revenue)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{summary.orders} ordenes | AOV {fm(summary.aov)} <InfoTip text="AOV (Average Order Value) es el ticket promedio: cuanto gasta en promedio cada cliente por pedido." /></p>
        </div>
        {/* COGS / Margen Bruto */}
        <div className="bg-white rounded-xl p-4 border-l-4 border-green-500 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Margen Bruto <InfoTip text="Lo que queda despues de restar solo el costo de la mercaderia (COGS). Es tu primer indicador de rentabilidad: si es bajo, estas vendiendo con poco margen sobre el costo del producto." /></span>
            {changes && <ChangeIndicator value={changes.grossProfit} />}
          </div>
          <p className="text-lg font-bold text-gray-800">{fm(summary.grossProfit)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{summary.grossMargin}% | COGS: {fm(summary.cogs)}</p>
        </div>
        {/* Ads */}
        <div className="bg-white rounded-xl p-4 border-l-4 border-orange-400 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Publicidad <InfoTip text="Inversion total en anuncios pagos: Meta (Facebook/Instagram) y Google (Search/Shopping/Display). A diferencia de otros costos, la flecha verde aca significa que gastaste MENOS." /></span>
            {changes && <ChangeIndicator value={changes.adSpend} inverse />}
          </div>
          <p className="text-lg font-bold text-gray-800">{fm(summary.adSpend)}</p>
          <p className="text-xs text-gray-400 mt-0.5 truncate">Meta {fm(summary.metaSpend)} | Google {fm(summary.googleSpend)}</p>
        </div>
        {/* Costos operativos (envíos + comisiones + payment + otros) */}
        <div className="bg-white rounded-xl p-4 border-l-4 border-indigo-400 shadow-sm">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Costos Operativos <InfoTip text="Todos los costos de operar ademas de productos y publicidad: envios, comisiones de MercadoLibre/VTEX, comisiones de medios de pago (tarjetas, MercadoPago), y gastos fijos que cargaste manualmente." /></span>
          <p className="text-lg font-bold text-gray-800 mt-1">
            {fm(summary.shipping + (summary.platformFees || 0) + (summary.paymentFees || 0) + (summary.manualCostsTotal || 0))}
          </p>
          <p className="text-xs text-gray-400 mt-0.5 truncate">
            Envios {fm(summary.shipping)} | Comis. {fm((summary.platformFees || 0) + (summary.paymentFees || 0))}
          </p>
        </div>
        {/* Beneficio Neto */}
        <div className={`bg-white rounded-xl p-4 border-l-4 shadow-sm ${netOp >= 0 ? "border-green-600" : "border-red-600"}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Beneficio Neto <InfoTip text="La linea final: lo que realmente te queda despues de TODOS los costos. Es el numero mas importante del P&L — indica si tu negocio es rentable o no." /></span>
            {changes && <ChangeIndicator value={changes.operatingProfit} />}
          </div>
          <p className={`text-lg font-bold ${netOp >= 0 ? "text-green-700" : "text-red-600"}`}>{fm(netOp)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{summary.netOperatingMargin ?? summary.operatingMargin}% margen neto</p>
        </div>
      </div>

      {/* ── Unit Economics ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <span className="text-xs font-medium text-gray-500 uppercase">Ticket Promedio <InfoTip text="Cuanto gasta en promedio cada cliente por pedido. Un ticket mas alto generalmente mejora tu rentabilidad porque los costos fijos se diluyen." /></span>
          <p className="text-lg font-bold text-gray-800 mt-1">{fm(summary.aov)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <span className="text-xs font-medium text-gray-500 uppercase">Unidades</span>
          <p className="text-lg font-bold text-gray-800 mt-1">{summary.units.toLocaleString("es-AR")}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <span className="text-xs font-medium text-gray-500 uppercase">Costo x Unidad <InfoTip text="Cuanto te cuesta en promedio cada producto vendido. Se calcula dividiendo el COGS total por la cantidad de unidades." /></span>
          <p className="text-lg font-bold text-gray-800 mt-1">
            {summary.units > 0 ? fm(summary.cogs / summary.units) : "\u2014"}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <span className="text-xs font-medium text-gray-500 uppercase">Margen x Unidad <InfoTip text="Cuanto ganas en promedio por cada unidad vendida (precio de venta menos costo del producto). Sirve para comparar rentabilidad entre productos." /></span>
          <p className="text-lg font-bold text-gray-800 mt-1">
            {summary.units > 0 ? fm(summary.grossProfit / summary.units) : "\u2014"}
          </p>
        </div>
      </div>

      {/* ── P&L Chart ─── */}
      <div className="bg-white rounded-xl p-5 shadow-sm mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700">Estado de Resultados <InfoTip text="Grafico visual del P&L. 'Cascada' muestra como cada costo reduce tu facturacion hasta llegar al beneficio neto. 'Tendencia' muestra la evolucion dia a dia." /></h3>
          <div className="flex items-center gap-3">
            {/* Sub-fase 2c: toggle $ vs % — solo visible en modo Cascada */}
            {chartMode === "waterfall" && (
              <div
                className="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs"
                role="group"
                aria-label="Tipo de visualización"
              >
                <button
                  type="button"
                  onClick={() => setDisplayMode("abs")}
                  className={`px-2.5 py-1 rounded-md font-medium transition ${
                    displayMode === "abs"
                      ? "bg-white text-gray-800 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                  aria-pressed={displayMode === "abs"}
                >$</button>
                <button
                  type="button"
                  onClick={() => setDisplayMode("pct")}
                  className={`px-2.5 py-1 rounded-md font-medium transition ${
                    displayMode === "pct"
                      ? "bg-white text-gray-800 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                  aria-pressed={displayMode === "pct"}
                >%</button>
              </div>
            )}
            <div className="flex gap-1">
              <button
                onClick={() => setChartMode("waterfall")}
                className={`px-3 py-1 rounded-lg text-xs font-medium ${
                  chartMode === "waterfall" ? "bg-blue-100 text-blue-700" : "text-gray-500 hover:bg-gray-100"
                }`}
              >Cascada</button>
              <button
                onClick={() => setChartMode("trend")}
                className={`px-3 py-1 rounded-lg text-xs font-medium ${
                  chartMode === "trend" ? "bg-blue-100 text-blue-700" : "text-gray-500 hover:bg-gray-100"
                }`}
              >Tendencia</button>
            </div>
          </div>
        </div>
        {chartMode === "waterfall" ? (
          <WaterfallHero
            data={waterfallData}
            format={fm}
            height={340}
            onItemClick={handleWaterfallClick}
            mode={displayMode}
            baseValue={summary.revenue}
          />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={dailyTrend} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={formatDateShort} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCompact(convert(v) ?? 0)} />
              <Tooltip {...tooltipStyle} formatter={(value: number, name: string) => [fm(value), name]} />
              <Legend />
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} strokeWidth={2} />
              <Area type="monotone" dataKey="grossProfit" name="Margen Bruto" stroke="#22c55e" fill="#22c55e" fillOpacity={0.1} strokeWidth={2} />
              <Area type="monotone" dataKey="operatingProfit" name="Beneficio Op." stroke="#f97316" fill="#f97316" fillOpacity={0.1} strokeWidth={1.5} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── P&L Table (Statement) ─── */}
      <div className="bg-white rounded-xl shadow-sm mb-6 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Estado de Resultados Detallado <InfoTip text="El P&L (Profit & Loss) muestra paso a paso como se compone tu resultado: arranca con lo que facturaste y va restando cada tipo de costo hasta llegar a lo que realmente ganas. Los numeros negativos (-) son costos." /></h3>
        </div>
        <div className="divide-y divide-gray-50">
          {pnlRows.map((row, i) => (
            <div
              key={i}
              className={`flex items-center justify-between px-5 py-2.5 ${
                row.highlight ? "bg-gray-50" : ""
              } ${row.indent ? "pl-8" : ""}`}
            >
              <span className={`${row.small ? "text-xs" : "text-sm"} ${row.bold ? "font-semibold text-gray-800" : "text-gray-600"}`}>
                {row.label}
                {row.tip && <InfoTip text={row.tip} />}
              </span>
              <div className="flex items-center gap-3">
                <span className={`${row.small ? "text-xs" : "text-sm"} font-mono ${row.bold ? "font-bold" : "font-medium"} ${row.color}`}>
                  {row.value < 0 ? "-" : ""}{fm(Math.abs(row.value))}
                </span>
                {row.pct !== undefined && (
                  <span className="text-xs text-gray-400 font-mono w-14 text-right">{row.pct}%</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── P&L por Canal ─── */}
      {bySource.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm mb-6 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">P&L por Canal <InfoTip text="Mismos numeros del P&L pero separados por canal de venta (VTEX = tu tienda online, MercadoLibre = marketplace). Te permite ver cual canal es mas rentable." /></h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-gray-500 uppercase">Concepto</th>
                  {bySource.map(s => (
                    <th key={s.source} className="text-right px-5 py-2.5 text-xs font-medium text-gray-500 uppercase">
                      {s.source === "MELI" ? "MercadoLibre" : s.source}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[
                  { label: "Revenue", key: "revenue", bold: true, color: "text-blue-600" },
                  { label: "Ordenes", key: "orders", format: "num" },
                  { label: "Ticket Promedio", key: "aov" },
                  { label: "COGS", key: "cogs", negative: true },
                  { label: "Margen Bruto", key: "grossProfit", bold: true },
                  { label: "Margen Bruto %", key: "grossMargin", format: "pct" },
                  { label: "Envios", key: "shipping", negative: true },
                  { label: "Comisiones Plataforma", key: "platformFee", negative: true, color: "text-indigo-500" },
                  { label: "Beneficio Operativo", key: "operatingProfit", bold: true },
                  { label: "Margen Operativo %", key: "operatingMargin", format: "pct", bold: true },
                ].map((row) => (
                  <tr key={row.key} className={row.bold ? "bg-gray-50/50" : ""}>
                    <td className={`px-5 py-2 ${row.bold ? "font-semibold text-gray-800" : "text-gray-600"}`}>
                      {row.label}
                    </td>
                    {bySource.map(s => {
                      const val = (s as any)[row.key];
                      let display = "";
                      if (row.format === "pct") display = `${val}%`;
                      else if (row.format === "num") display = val.toLocaleString("es-AR");
                      else display = fm(Math.abs(val));
                      const isNeg = row.negative && val > 0;
                      return (
                        <td key={s.source} className={`px-5 py-2 text-right font-mono ${row.bold ? "font-bold" : "font-medium"} ${
                          row.color || (row.bold && row.key === "operatingProfit"
                            ? (val >= 0 ? "text-green-600" : "text-red-600")
                            : "text-gray-700")
                        }`}>
                          {isNeg ? "-" : ""}{display}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {bySource.some(s => s.platformFeeLabel) && (
                  <tr>
                    <td className="px-5 py-1.5 text-xs text-gray-400 pl-8" colSpan={bySource.length + 1}>
                      {bySource.map(s => (
                        <span key={s.source} className="mr-6">
                          {s.source === "MELI" ? "ML" : s.source}: {s.platformFeeLabel}
                        </span>
                      ))}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Category + Brand Margins ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Margen por Categoria <InfoTip text="Muestra que tan rentable es cada categoria de productos. Un margen alto (verde) significa buena diferencia entre precio de venta y costo. Rojo indica categorias donde casi no ganas." /></h3>
          </div>
          <div className="divide-y divide-gray-50">
            {categories.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-400 text-sm">Sin datos de categorias</div>
            ) : (
              categories.slice(0, 10).map((cat, i) => (
                <div key={i} className="px-5 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-700 font-medium truncate max-w-[60%]">{cat.category}</span>
                    <span className="text-xs text-gray-500">{fm(cat.revenue)} | {cat.grossMargin}%</span>
                  </div>
                  <MarginBar value={cat.grossMargin} color={cat.grossMargin >= 40 ? "bg-green-400" : cat.grossMargin >= 25 ? "bg-yellow-400" : "bg-red-400"} />
                </div>
              ))
            )}
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Margen por Marca <InfoTip text="Rentabilidad de cada marca que vendes. Te ayuda a identificar que marcas te dejan mas ganancia y cuales conviene renegociar o dejar de vender." /></h3>
          </div>
          <div className="divide-y divide-gray-50">
            {brands.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-400 text-sm">Sin datos de marcas</div>
            ) : (
              brands.slice(0, 10).map((brand, i) => (
                <div key={i} className="px-5 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-700 font-medium truncate max-w-[60%]">{brand.brand}</span>
                    <span className="text-xs text-gray-500">{fm(brand.revenue)} | {brand.grossMargin}%</span>
                  </div>
                  <MarginBar value={brand.grossMargin} color={brand.grossMargin >= 40 ? "bg-green-400" : brand.grossMargin >= 25 ? "bg-yellow-400" : "bg-red-400"} />
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Sub-fase 2b: drill-down lateral */}
      <WaterfallDrillPanel
        open={drillOpen}
        data={drillData}
        format={fm}
        onClose={() => setDrillOpen(false)}
      />
    </>
  );
}

/* ══════════════════════════════════════════════
   MAIN PAGE COMPONENT
   ══════════════════════════════════════════════ */
export default function FinanzasPage() {
  const [summary, setSummary] = useState<PnlSummary | null>(null);
  const [changes, setChanges] = useState<Changes | null>(null);
  const [dailyTrend, setDailyTrend] = useState<DailyTrend[]>([]);
  const [categories, setCategories] = useState<CategoryMargin[]>([]);
  const [brands, setBrands] = useState<BrandMargin[]>([]);
  const [bySource, setBySource] = useState<SourceBreakdown[]>([]);
  const [manualCosts, setManualCosts] = useState<{ category: string; total: number }[]>([]);
  const [paymentFeeDetails, setPaymentFeeDetails] = useState<PaymentFeeDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<"executive" | "detailed">("executive");
  const [chartMode, setChartMode] = useState<"waterfall" | "trend">("waterfall");

  // Date state — default 30 days
  const defaultFrom = new Date();
  defaultFrom.setDate(defaultFrom.getDate() - 30);
  const [dateFrom, setDateFrom] = useState(defaultFrom.toISOString().split("T")[0]);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split("T")[0]);
  const [activeQuickRange, setActiveQuickRange] = useState<number | null>(30);

  const FIN_QUICK_RANGES = [
    { label: "7 dias", days: 7 },
    { label: "30 dias", days: 30 },
    { label: "90 dias", days: 90 },
  ];

  function fetchData(from?: string, to?: string) {
    setLoading(true);
    setError("");
    const f = from || dateFrom;
    const t = to || dateTo;

    const params = new URLSearchParams({ dateFrom: f, dateTo: t });
    fetch(`/api/metrics/pnl?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.summary) {
          setSummary(data.summary);
          setChanges(data.changes || null);
          setDailyTrend(data.dailyTrend || []);
          setCategories(data.categories || []);
          setBrands(data.brands || []);
          setBySource(data.bySource || []);
          setManualCosts(data.manualCosts || []);
          setPaymentFeeDetails(data.paymentFees || []);
        } else {
          setError(data.error || "Error cargando datos");
        }
      })
      .catch(() => setError("Error de conexion"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchData();
  }, []);

  function handleQuickRange(days: number) {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    const f = from.toISOString().split("T")[0];
    const t = to.toISOString().split("T")[0];
    setDateFrom(f);
    setDateTo(t);
    setActiveQuickRange(days);
    fetchData(f, t);
  }

  function handleDateChange(type: "from" | "to", value: string) {
    if (type === "from") setDateFrom(value);
    else setDateTo(value);
    const f = type === "from" ? value : dateFrom;
    const t = type === "to" ? value : dateTo;
    setActiveQuickRange(null);
    fetchData(f, t);
  }

  if (loading) {
    return (
      <div className="light-canvas min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <p className="text-gray-500 text-sm">Calculando P&L...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="light-canvas min-h-screen p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{error}</div>
      </div>
    );
  }

  if (!summary) return null;

  // midDate = punto medio del rango seleccionado, en formato "YYYY-MM-DD".
  // Lo usamos como "fecha de referencia" para el ajuste IPC cuando el usuario
  // ve el P&L en modo ARS_ADJ. Con un rango de 30 dias, el ajuste aplica al
  // mes central del periodo (ajuste razonable para un numero agregado).
  const midMs = (new Date(dateFrom).getTime() + new Date(dateTo).getTime()) / 2;
  const midDate = new Date(midMs).toISOString().split("T")[0];

  return (
    <div className="light-canvas min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Finanzas</h2>
            <p className="text-sm text-gray-500 mt-0.5">P&L — Estado de Resultados</p>
          </div>
          {/* View Mode Toggle */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("executive")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === "executive"
                  ? "bg-white text-gray-800 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Ejecutivo
            </button>
            <button
              onClick={() => setViewMode("detailed")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === "detailed"
                  ? "bg-white text-gray-800 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Detallado
            </button>
          </div>
        </div>
        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          activeQuickRange={activeQuickRange}
          quickRanges={FIN_QUICK_RANGES}
          onQuickRange={handleQuickRange}
          onDateChange={handleDateChange}
          loading={loading}
        />
      </div>

      {/* Currency toggle — convierte todos los montos de esta pagina (USD / ARS / ARS_ADJ) */}
      <div className="mb-6">
        <CurrencyToggle />
      </div>

      {/* Conditional View */}
      {viewMode === "executive" ? (
        <ExecutiveView
          summary={summary}
          changes={changes}
          dailyTrend={dailyTrend}
          bySource={bySource}
          midDate={midDate}
        />
      ) : (
        <DetailedView
          summary={summary}
          changes={changes}
          dailyTrend={dailyTrend}
          categories={categories}
          brands={brands}
          bySource={bySource}
          manualCosts={manualCosts}
          paymentFeeDetails={paymentFeeDetails}
          chartMode={chartMode}
          setChartMode={setChartMode}
          midDate={midDate}
        />
      )}
    </div>
  );
}
