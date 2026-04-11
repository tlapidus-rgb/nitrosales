"use client";

// ══════════════════════════════════════════════════════════════
// OrderFlagBadge — Badge inline para anomalías en tabla de pedidos
// ══════════════════════════════════════════════════════════════
// Muestra un chip pequeño por cada flag, con tooltip explicativo
// en palabras simples. Agrupa múltiples flags en un solo row.
// ══════════════════════════════════════════════════════════════

import {
  TrendingDown,
  Percent,
  Clock3,
  DollarSign,
  Package,
  Truck,
} from "lucide-react";
import type { AnomalyFlag } from "./types";

const FLAG_META: Record<
  AnomalyFlag,
  {
    label: string;
    tooltip: string;
    icon: typeof TrendingDown;
    tone: "negative" | "warning";
  }
> = {
  negative_margin: {
    label: "Pérdida",
    tooltip: "Se vendió con margen negativo (costo mayor al precio).",
    icon: TrendingDown,
    tone: "negative",
  },
  high_discount: {
    label: "−50%+",
    tooltip: "Descuento mayor al 50% sobre el precio de lista.",
    icon: Percent,
    tone: "warning",
  },
  stale_price: {
    label: "Precio viejo",
    tooltip: "El costo del producto no se actualiza hace más de 60 días.",
    icon: Clock3,
    tone: "warning",
  },
  high_ticket: {
    label: "Ticket alto",
    tooltip: "Pedido mucho más grande que el promedio del período.",
    icon: DollarSign,
    tone: "warning",
  },
  high_qty: {
    label: "Muchas uds",
    tooltip: "Cantidad de unidades muy por encima del promedio.",
    icon: Package,
    tone: "warning",
  },
  shipping_gap: {
    label: "Envío mal",
    tooltip: "Lo que cobramos de envío no cubre lo que pagamos al courier.",
    icon: Truck,
    tone: "warning",
  },
};

interface OrderFlagBadgeProps {
  flag: AnomalyFlag;
  compact?: boolean;
}

export default function OrderFlagBadge({
  flag,
  compact = false,
}: OrderFlagBadgeProps) {
  const meta = FLAG_META[flag];
  if (!meta) return null;
  const Icon = meta.icon;

  const toneClasses =
    meta.tone === "negative"
      ? "bg-rose-50 border-rose-200 text-rose-700"
      : "bg-amber-50 border-amber-200 text-amber-700";

  return (
    <span
      title={meta.tooltip}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${toneClasses} cursor-help`}
    >
      <Icon className="w-2.5 h-2.5" />
      {!compact && <span>{meta.label}</span>}
    </span>
  );
}

// Helper para mostrar múltiples flags en una sola celda
export function OrderFlagBadgeGroup({
  flags,
  max = 3,
  compact = false,
}: {
  flags: AnomalyFlag[];
  max?: number;
  compact?: boolean;
}) {
  if (!flags || flags.length === 0) return null;
  const visible = flags.slice(0, max);
  const hidden = flags.length - visible.length;
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {visible.map((f) => (
        <OrderFlagBadge key={f} flag={f} compact={compact} />
      ))}
      {hidden > 0 && (
        <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
          +{hidden}
        </span>
      )}
    </span>
  );
}
