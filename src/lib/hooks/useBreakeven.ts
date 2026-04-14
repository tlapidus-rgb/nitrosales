"use client";

import { useEffect, useState } from "react";

/**
 * useBreakeven
 *
 * Calcula el ROAS de break-even a partir del P&L real.
 *
 * Break-even ROAS = 1 / margen de contribucion pre-ads
 *
 * Margen de contribucion = (Revenue - COGS - Shipping - PlatformFees - PaymentFees) / Revenue
 *
 * Interpretacion:
 *   - Si ROAS actual >= breakevenRoas × 1.5  -> rentable con margen (verde)
 *   - Si ROAS actual >= breakevenRoas        -> en equilibrio (amber)
 *   - Si ROAS actual <  breakevenRoas        -> perdiendo plata (rojo)
 */
export function useBreakeven(dateFrom: string, dateTo: string) {
  const [data, setData] = useState<{
    breakevenRoas: number;
    contributionMargin: number;
    realRevenue: number;
    loading: boolean;
  }>({
    breakevenRoas: 0,
    contributionMargin: 0,
    realRevenue: 0,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    setData((d) => ({ ...d, loading: true }));

    fetch(`/api/metrics/pnl?from=${dateFrom}&to=${dateTo}`)
      .then((r) => r.json())
      .then((pnl) => {
        if (cancelled) return;
        const s = pnl?.summary || {};
        const revenue = Number(s.revenue || 0);
        const cogs = Number(s.cogs || 0);
        const shipping = Number(s.shipping || 0);
        const platformFees = Number(s.platformFees || 0);
        const paymentFees = Number(s.paymentFees || 0);
        const contribProfit = revenue - cogs - shipping - platformFees - paymentFees;
        const contribMargin = revenue > 0 ? contribProfit / revenue : 0;
        const breakevenRoas = contribMargin > 0 ? 1 / contribMargin : 0;
        setData({
          breakevenRoas,
          contributionMargin: contribMargin,
          realRevenue: revenue,
          loading: false,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setData({ breakevenRoas: 0, contributionMargin: 0, realRevenue: 0, loading: false });
      });

    return () => {
      cancelled = true;
    };
  }, [dateFrom, dateTo]);

  return data;
}

/** Devuelve estado de salud del ROAS actual vs break-even. */
export function getRoasHealth(currentRoas: number, breakevenRoas: number): {
  status: "green" | "amber" | "red" | "gray";
  label: string;
} {
  if (!breakevenRoas || breakevenRoas <= 0) return { status: "gray", label: "Sin datos" };
  if (currentRoas >= breakevenRoas * 1.5) return { status: "green", label: "Rentable" };
  if (currentRoas >= breakevenRoas) return { status: "amber", label: "Equilibrio" };
  if (currentRoas > 0) return { status: "red", label: "Perdiendo" };
  return { status: "gray", label: "Sin datos" };
}
