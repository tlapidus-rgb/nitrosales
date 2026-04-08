"use client";

// ══════════════════════════════════════════════════════════════
// AtencionHoyBlock — bloque de anomalías con copy MUY SIMPLE
// ══════════════════════════════════════════════════════════════
// Comunica en palabras de analista junior qué pedidos/eventos
// requieren atención. 11 familias de anomalías → mensaje corto.
// Estados:
//   - 0 anomalías → card verde "Todo en orden"
//   - 1-5         → mostrar todas
//   - >5          → mostrar top 5 + link "Ver todas"
// Clic en una anomalía → onFilterByFlag(flag) para filtrar tabla.
// ══════════════════════════════════════════════════════════════

import {
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  Percent,
  Clock3,
  DollarSign,
  Package,
  Truck,
  XCircle,
  Zap,
  Copy as CopyIcon,
  Flame,
} from "lucide-react";
import type { AnomaliesData, AnomalyFlag } from "./types";

// Copy MUY SIMPLE — máx ~12 palabras por mensaje. Analista junior friendly.
const FLAG_COPY: Record<
  AnomalyFlag,
  { title: string; message: string; icon: typeof AlertTriangle }
> = {
  negative_margin: {
    title: "Vendimos con pérdida",
    message: "Pedido con margen negativo: el costo fue mayor al precio.",
    icon: TrendingDown,
  },
  high_discount: {
    title: "Descuento muy alto",
    message: "Pedido con más de 50% de descuento sobre el precio de lista.",
    icon: Percent,
  },
  stale_price: {
    title: "Precio desactualizado",
    message: "El costo del producto no se actualiza hace más de 60 días.",
    icon: Clock3,
  },
  high_ticket: {
    title: "Ticket muy alto",
    message: "Pedido mucho más grande que el promedio del período.",
    icon: DollarSign,
  },
  high_qty: {
    title: "Cantidad inusual",
    message: "Pedido con muchas más unidades que el promedio.",
    icon: Package,
  },
  shipping_gap: {
    title: "Envío mal cobrado",
    message: "Lo que cobramos de envío no cubre lo que realmente pagamos.",
    icon: Truck,
  },
};

interface AtencionHoyBlockProps {
  data: AnomaliesData | null | undefined;
  onFilterByFlag?: (flag: AnomalyFlag) => void;
}

export default function AtencionHoyBlock({
  data,
  onFilterByFlag,
}: AtencionHoyBlockProps) {
  const counts = data?.counts ?? {};
  const period = data?.periodLevel;

  // Construimos la lista de alertas combinando order-level + period-level.
  type Alert = {
    key: string;
    title: string;
    message: string;
    count: number;
    icon: typeof AlertTriangle;
    flag?: AnomalyFlag;
    tone: "warning" | "negative";
  };

  const alerts: Alert[] = [];

  // Order-level: una entrada por flag con count > 0
  (Object.keys(FLAG_COPY) as AnomalyFlag[]).forEach((flag) => {
    const count = counts[flag] ?? 0;
    if (count > 0) {
      const copy = FLAG_COPY[flag];
      alerts.push({
        key: flag,
        title: copy.title,
        message: copy.message,
        count,
        icon: copy.icon,
        flag,
        tone: flag === "negative_margin" ? "negative" : "warning",
      });
    }
  });

  // Period-level: cancelaciones, velocity, duplicados, virales
  if (period?.cancelSpikeActive) {
    alerts.push({
      key: "cancel_spike",
      title: "Muchas cancelaciones hoy",
      message: `Hubo ${period.cancelLast24h} cancelaciones en 24hs (normal: ~${period.cancelDailyBaseline.toFixed(0)}).`,
      count: period.cancelLast24h,
      icon: XCircle,
      tone: "negative",
    });
  }
  if (period?.velocityAnomalyActive) {
    const isUp = period.velocityRatio >= 2;
    alerts.push({
      key: "velocity",
      title: isUp ? "Pico de ventas ahora" : "Bajón de ventas ahora",
      message: `Última hora: ${period.velocityLastHour} pedidos (normal: ~${period.velocityHourlyBaseline.toFixed(0)}).`,
      count: period.velocityLastHour,
      icon: Zap,
      tone: isUp ? "warning" : "negative",
    });
  }
  if ((period?.duplicateSuspectsCount ?? 0) > 0) {
    alerts.push({
      key: "duplicates",
      title: "Posibles pedidos duplicados",
      message: "Mismo cliente compró lo mismo en pocos minutos.",
      count: period!.duplicateSuspectsCount,
      icon: CopyIcon,
      tone: "warning",
    });
  }
  if ((period?.viralSkus?.length ?? 0) > 0) {
    const top = period!.viralSkus[0];
    alerts.push({
      key: "viral",
      title: "Producto viral",
      message: `"${top.name}" se vendió ${top.count}× en pocas horas.`,
      count: top.count,
      icon: Flame,
      tone: "warning",
    });
  }

  // Estado "todo en orden"
  if (alerts.length === 0) {
    return (
      <section className="dash-card dash-fade-up mb-5 p-5">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-cyan-50 border border-cyan-100 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-cyan-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Todo en orden
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              No encontramos pedidos ni eventos raros en este período.
            </p>
          </div>
        </div>
      </section>
    );
  }

  // Mostrar top 5, indicar si hay más.
  const MAX_VISIBLE = 5;
  const visible = alerts.slice(0, MAX_VISIBLE);
  const hidden = alerts.length - visible.length;
  const totalBadge = alerts.reduce((acc, a) => acc + a.count, 0);

  return (
    <section className="dash-card dash-fade-up mb-5 p-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Atención hoy
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {alerts.length} {alerts.length === 1 ? "situación" : "situaciones"}{" "}
              que conviene revisar.
            </p>
          </div>
        </div>
        <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-700 tabular-nums">
          {totalBadge} items
        </span>
      </div>

      {/* Alerts list */}
      <div className="dash-stagger grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {visible.map((alert) => {
          const Icon = alert.icon;
          const isNegative = alert.tone === "negative";
          const accent = isNegative
            ? "border-l-rose-400 hover:border-l-rose-500"
            : "border-l-amber-400 hover:border-l-amber-500";
          const iconBg = isNegative
            ? "bg-rose-50 text-rose-600"
            : "bg-amber-50 text-amber-600";
          const clickable = !!alert.flag && !!onFilterByFlag;
          return (
            <button
              key={alert.key}
              type="button"
              onClick={
                clickable ? () => onFilterByFlag!(alert.flag!) : undefined
              }
              disabled={!clickable}
              className={`group text-left flex items-start gap-3 rounded-lg border border-slate-100 border-l-[3px] ${accent} bg-white px-3 py-2.5 transition-all ${
                clickable
                  ? "hover:bg-slate-50 hover:shadow-sm cursor-pointer"
                  : "cursor-default"
              }`}
            >
              <div
                className={`flex-shrink-0 w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {alert.title}
                  </p>
                  <span className="flex-shrink-0 text-xs font-semibold tabular-nums text-slate-700">
                    {alert.count}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                  {alert.message}
                </p>
                {clickable && (
                  <span className="inline-block text-[10px] text-orange-600 font-medium mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    Clic para filtrar la tabla →
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {hidden > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          Y {hidden} {hidden === 1 ? "situación más" : "situaciones más"} en la
          tabla de pedidos.
        </p>
      )}
    </section>
  );
}
