// ═══════════════════════════════════════════════════════════════════
// BridgeStrip — CAC · LTV · Ratio · Payback (Fase 6e)
// ═══════════════════════════════════════════════════════════════════
// Strip horizontal compacto que se monta en /finanzas/estado para
// conectar el P&L con las metricas de marketing/customers. Es la
// version "headline" del MarketingFinanceCard de Pulso — diseñada
// para que el founder vea en un scan lo que el resto del P&L no
// muestra: cuanto cuesta cada cliente y cuanto tarda en pagar.
//
// Fetches /api/metrics/ltv (mismo endpoint que MarketingFinanceCard).
// Si no hay spend o no hay clientes, muestra empty state.
//
// Links: "Ver detalle en Pulso" y "Ver clientes en Bondly".
// ═══════════════════════════════════════════════════════════════════

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCurrencyView } from "@/hooks/useCurrencyView";
import {
  buildMarketingFinance,
  type LtvApiChannelRow,
  type LtvApiSummary,
} from "@/lib/finanzas/marketing";
import type { MarketingFinanceData } from "@/types/finanzas";
import {
  TrendingUp,
  Users,
  Clock,
  Target,
  ArrowUpRight,
  Activity,
} from "lucide-react";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";

interface BridgeStripProps {
  dateFrom: string;
  dateTo: string;
}

export default function BridgeStrip({ dateFrom, dateTo }: BridgeStripProps) {
  const { convert, format, ready } = useCurrencyView();
  const [data, setData] = useState<MarketingFinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const params = new URLSearchParams({ from: dateFrom, to: dateTo });
        const res = await fetch(`/api/metrics/ltv?${params}`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json();
        if (!active) return;

        const summary: LtvApiSummary = json.summary ?? {
          avgLtv: 0,
          globalCac: 0,
          globalLtvCac: 0,
        };
        const byChannel: LtvApiChannelRow[] = json.byChannel ?? [];
        const marketing = buildMarketingFinance({ summary, byChannel });
        setData(marketing);
      } catch (e: any) {
        if (!active) return;
        setError(e?.message ?? "Error");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [dateFrom, dateTo]);

  if (loading) {
    return <StripSkeleton />;
  }

  if (error || !data) {
    return null; // silent fail — es auxiliar
  }

  const blendedCac = data.summary.blendedCac;
  const blendedLtv = data.summary.blendedLtv;
  const blendedRatio =
    blendedCac != null && blendedLtv != null && blendedCac > 0
      ? Math.round((blendedLtv / blendedCac) * 100) / 100
      : null;
  const blendedPayback =
    blendedCac != null && blendedLtv != null && blendedLtv > 0
      ? Math.round(((12 * blendedCac) / blendedLtv) * 10) / 10
      : null;

  const fm = (v: number | null | undefined) => {
    if (v == null || !Number.isFinite(v)) return "—";
    return format(convert(v, dateTo));
  };

  // Health overall — peor de ratio y payback
  const ratioOk = blendedRatio != null && blendedRatio >= 3;
  const ratioWarn = blendedRatio != null && blendedRatio >= 1.5 && blendedRatio < 3;
  const ratioBad = blendedRatio != null && blendedRatio < 1.5;
  const paybackOk = blendedPayback != null && blendedPayback <= 6;
  const paybackWarn = blendedPayback != null && blendedPayback > 6 && blendedPayback <= 12;
  const paybackBad = blendedPayback != null && blendedPayback > 12;

  const healthColor = ratioBad || paybackBad
    ? "#ef4444"
    : ratioWarn || paybackWarn
    ? "#f59e0b"
    : "#10b981";

  const noSpend = (blendedCac ?? 0) <= 0;

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white"
      style={{
        boxShadow:
          "0 1px 2px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.03)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-0.5"
        style={{ background: `linear-gradient(90deg, ${healthColor}, #0ea5e9)` }}
      />

      <div className="flex flex-wrap items-center gap-4 p-5">
        <div className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-xl"
            style={{
              background: `${healthColor}12`,
              color: healthColor,
              border: `1px solid ${healthColor}33`,
            }}
          >
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Bridge
            </div>
            <div className="text-[13px] font-semibold tracking-tight text-slate-900">
              Marketing ↔ P&L
            </div>
          </div>
        </div>

        <div className="h-8 w-px bg-slate-200" />

        <MiniKPI
          icon={<Target className="h-3.5 w-3.5" />}
          label="CAC"
          value={noSpend ? "Sin spend" : fm(blendedCac)}
          color="#8b5cf6"
        />
        <MiniKPI
          icon={<Users className="h-3.5 w-3.5" />}
          label="LTV"
          value={fm(blendedLtv)}
          color="#0ea5e9"
        />
        <MiniKPI
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="LTV:CAC"
          value={
            blendedRatio != null && Number.isFinite(blendedRatio)
              ? `${blendedRatio.toFixed(2)}x`
              : "—"
          }
          color={ratioBad ? "#ef4444" : ratioWarn ? "#f59e0b" : "#10b981"}
        />
        <MiniKPI
          icon={<Clock className="h-3.5 w-3.5" />}
          label="Payback"
          value={
            blendedPayback != null && Number.isFinite(blendedPayback)
              ? `${blendedPayback.toFixed(1)}m`
              : "—"
          }
          color={paybackBad ? "#ef4444" : paybackWarn ? "#f59e0b" : "#10b981"}
        />

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/finanzas/pulso"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
            style={{ transition: `all 160ms ${ES}` }}
          >
            Detalle en Pulso
            <ArrowUpRight className="h-3 w-3" />
          </Link>
          <Link
            href="/bondly/clientes"
            className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 transition hover:border-violet-300 hover:bg-violet-100"
            style={{ transition: `all 160ms ${ES}` }}
          >
            Clientes en Bondly
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function MiniKPI({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="flex h-6 w-6 items-center justify-center rounded-lg"
        style={{ background: `${color}10`, color, border: `1px solid ${color}22` }}
      >
        {icon}
      </div>
      <div>
        <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          {label}
        </div>
        <div
          className="text-[13px] font-semibold tabular-nums tracking-tight"
          style={{ color: "#0f172a" }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function StripSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center gap-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="h-6 w-6 animate-pulse rounded-lg bg-slate-100" />
            <div>
              <div className="h-2.5 w-10 animate-pulse rounded bg-slate-100" />
              <div className="mt-1 h-3.5 w-14 animate-pulse rounded bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
