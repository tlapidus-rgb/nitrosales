"use client";

import { useEffect, useState } from "react";

/**
 * useBreakeven
 *
 * Calcula el ROAS de break-even y el "revenue real" atribuible a los ads.
 *
 * IMPORTANTE: Solo contamos ventas de VTEX (tienda directa), NO de MELI.
 * Motivo: los ads de Meta/Google mandan trafico a la tienda propia.
 * MELI tiene su propio trafico organico del marketplace y no es atribuible
 * a estas plataformas de ads.
 *
 * Margen de contribucion (VTEX) = (Rev - COGS - Shipping - PlatformFees - PaymentFees) / Rev
 * Break-even ROAS = 1 / margen de contribucion
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
    realRevenue: number; // solo VTEX — ventas atribuibles a ads
    totalRevenue: number; // MELI + VTEX — para referencia
    loading: boolean;
  }>({
    breakevenRoas: 0,
    contributionMargin: 0,
    realRevenue: 0,
    totalRevenue: 0,
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
        const bySource: any[] = Array.isArray(pnl?.bySource) ? pnl.bySource : [];
        const totalRevenue = Number(s.revenue || 0);

        // Aislar fuente VTEX (tienda directa, destino de los ads)
        const vtex = bySource.find((x) => x.source === "VTEX");
        const vtexRevenue = Number(vtex?.revenue || 0);
        const vtexCogs = Number(vtex?.cogs || 0);
        const vtexShipping = Number(vtex?.shipping || 0);
        const vtexPlatformFees = Number(vtex?.platformFee || 0);

        // Fallback: si no hay bySource (org nueva) usar totales
        const useVtex = vtexRevenue > 0;
        const revenue = useVtex ? vtexRevenue : totalRevenue;
        const cogs = useVtex ? vtexCogs : Number(s.cogs || 0);
        const shipping = useVtex ? vtexShipping : Number(s.shipping || 0);
        const platformFees = useVtex ? vtexPlatformFees : Number(s.platformFees || 0);
        // payment fees se reportan a nivel global, escalar proporcional a VTEX
        const totalPaymentFees = Number(s.paymentFees || 0);
        const paymentFees = useVtex && totalRevenue > 0
          ? totalPaymentFees * (vtexRevenue / totalRevenue)
          : totalPaymentFees;

        const contribProfit = revenue - cogs - shipping - platformFees - paymentFees;
        const contribMargin = revenue > 0 ? contribProfit / revenue : 0;
        const breakevenRoas = contribMargin > 0 ? 1 / contribMargin : 0;

        setData({
          breakevenRoas,
          contributionMargin: contribMargin,
          realRevenue: revenue,
          totalRevenue,
          loading: false,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setData({ breakevenRoas: 0, contributionMargin: 0, realRevenue: 0, totalRevenue: 0, loading: false });
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
