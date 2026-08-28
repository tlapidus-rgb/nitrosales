"use client";

import React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatCompact } from "@/lib/utils/format";

interface WeeklySummaryProps {
  totalRevenue: number;
  totalOrders: number;
  revenueChange: number;
  ordersChange: number;
  daysInPeriod: number;
  bestDay?: { day: string; orders: number } | null;
  cancelledOrders: number;
  cancellationRate: number;
}

export default function WeeklySummary({
  totalRevenue,
  totalOrders,
  revenueChange,
  ordersChange,
  daysInPeriod,
  bestDay,
  cancelledOrders,
  cancellationRate,
}: WeeklySummaryProps) {
  const avgRevenuePerDay = totalRevenue / Math.max(daysInPeriod, 1);
  const avgOrdersPerDay = totalOrders / Math.max(daysInPeriod, 1);

  const revenueIcon =
    revenueChange > 2 ? (
      <TrendingUp size={14} className="text-emerald-500" />
    ) : revenueChange < -2 ? (
      <TrendingDown size={14} className="text-red-500" />
    ) : (
      <Minus size={14} className="text-ink-40" />
    );

  const revenueColor =
    revenueChange > 2
      ? "text-emerald-600"
      : revenueChange < -2
      ? "text-red-500"
      : "text-ink-40";

  // Format best day name
  let bestDayLabel = "";
  if (bestDay?.day) {
    try {
      const d = new Date(bestDay.day + "T12:00:00");
      bestDayLabel = d.toLocaleDateString("es-AR", {
        weekday: "long",
        day: "numeric",
        month: "short",
      });
    } catch {
      bestDayLabel = bestDay.day;
    }
  }

  return (
    <div className="bg-surface rounded-xl border border-hairline p-4 shadow-ent-xs">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-sm text-ink-60 leading-relaxed">
            En los ultimos <strong>{daysInPeriod} dias</strong> facturaste{" "}
            <strong className="text-ink">{formatCompact(totalRevenue)}</strong> en{" "}
            <strong className="text-ink">{totalOrders.toLocaleString("es-AR")}</strong>{" "}
            ordenes.{" "}
            <span className={`inline-flex items-center gap-1 font-medium ${revenueColor}`}>
              {revenueIcon}
              {revenueChange > 0 ? "+" : ""}
              {revenueChange.toFixed(1)}% vs periodo anterior
            </span>
            .{" "}
            {bestDay && bestDay.orders > 0 && (
              <>
                Tu mejor dia fue el{" "}
                <strong>{bestDayLabel}</strong> con{" "}
                {bestDay.orders} ordenes.{" "}
              </>
            )}
            {cancellationRate > 5 && (
              <span className="text-amber-600">
                Ojo: tasa de cancelacion del {cancellationRate.toFixed(1)}% ({cancelledOrders} ordenes).
              </span>
            )}
          </p>
        </div>
        <div className="flex-shrink-0 text-right hidden md:block">
          <p className="text-[10px] text-ink-40 uppercase tracking-wide">Promedio diario</p>
          <p className="text-sm font-bold text-ink">{formatCompact(avgRevenuePerDay)}/dia</p>
          <p className="text-xs text-ink-60">{avgOrdersPerDay.toFixed(1)} ordenes/dia</p>
        </div>
      </div>
    </div>
  );
}
