// ═══════════════════════════════════════════════════════════════════
// /finanzas/pulso — portada del módulo Finanzas (Fase 1)
// ═══════════════════════════════════════════════════════════════════
// En 10 segundos respondemos: "¿cómo estoy hoy?"
//
// Layout final (Fase 1e):
//   [Header: título + CurrencyToggle]
//   [NarrativeHero]           ← Fase 1d · narrativa determinista
//   [CashRunwayHero]          ← Fase 1a · con override manual (1e)
//   [MarketingFinanceCard]    ← Fase 1b · CAC vs LTV por canal
//   [Revenue12mSparkline]     ← Fase 1c · sparkline + costos + margen
//   [FinancialAlertsCard]     ← Fase 1d · alertas accionables
//   + Modal CashBalanceOverride (abre desde el hero)
//   + useAurumPageContext     ← publica runway/alertas al bubble
//
// Ver PROPUESTA_PNL_REORG.md §5.1 y plan linear-pondering-lemur.md
// ═══════════════════════════════════════════════════════════════════

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import CashRunwayHero from "@/components/finanzas/CashRunwayHero";
import CashBalanceOverride from "@/components/finanzas/CashBalanceOverride";
import MarketingFinanceCard from "@/components/finanzas/MarketingFinanceCard";
import Revenue12mSparkline from "@/components/finanzas/Revenue12mSparkline";
import NarrativeHero from "@/components/finanzas/NarrativeHero";
import FinancialAlertsCard from "@/components/finanzas/FinancialAlertsCard";
import { CurrencyToggle } from "@/components/finanzas/CurrencyToggle";
import { useAurumPageContext } from "@/components/aurum/AurumContext";
import type { PulsoPageData } from "@/types/finanzas";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";

export default function PulsoPage() {
  const [data, setData] = useState<PulsoPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/finanzas/pulso", { cache: "no-store" });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.message || `HTTP ${res.status}`);
        }
        const json = (await res.json()) as PulsoPageData;
        if (!active) return;
        setData(json);
        setLoading(false);
      } catch (e: unknown) {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Error desconocido");
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshTick]);

  const handleOverrideSuccess = useCallback(() => {
    // Refetch del Pulso para que el runway recalcule con el override nuevo.
    setLoading(true);
    setRefreshTick((n) => n + 1);
  }, []);

  // ── Publicar contexto al bubble Aurum ────────────────────────────────
  // Snapshot JSON-serializable. Si está loading, publicamos null para que
  // Aurum no muestre contexto a medio cargar.
  useAurumPageContext(
    loading || !data
      ? null
      : {
          section: "finanzas.pulso",
          contextLabel: "Pulso financiero",
          contextData: {
            runway: {
              source: data.runway.source,
              monthsRemaining: data.runway.monthsRemaining,
              cashBalance: data.runway.cashBalance,
              cashBalanceAuto: data.runway.cashBalanceAuto,
              burnRate30d: data.runway.burnRate30d,
              status: data.runway.status,
              asOfDate: data.runway.asOfDate,
              breakdown: data.runway.breakdown,
            },
            sparkline12m: data.sparkline12m
              ? {
                  revenue12mTotal: data.sparkline12m.revenue12mTotal,
                  revenueDeltaPct: data.sparkline12m.revenueDeltaPct,
                  costosYTD: data.sparkline12m.costosYTD,
                  grossMarginYTD: data.sparkline12m.grossMarginYTD,
                }
              : null,
            narrative: data.narrative
              ? {
                  title: data.narrative.title,
                  body: data.narrative.body,
                  severity: data.narrative.severity,
                  rule: data.narrative.rule,
                }
              : null,
            alerts: (data.alerts ?? []).map((a) => ({
              id: a.id,
              priority: a.priority,
              type: a.type,
              title: a.title,
              body: a.body,
            })),
            meta: data.meta,
          },
          suggestions: [
            "¿Cuántos meses de runway tengo?",
            "¿Qué canal es menos rentable?",
            "¿Cómo mejoro mi margen?",
            "Dame el resumen del Pulso hoy",
          ],
        },
    [loading, data]
  );

  return (
    <div className="relative space-y-6">
      {/* ═══════ Header: título + moneda ═══════ */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: "linear-gradient(135deg, #fbbf24 0%, #d97706 100%)",
                boxShadow: "0 0 10px rgba(251,191,36,0.65)",
                animation: "pulsoHeaderDot 2s ease-in-out infinite",
              }}
            />
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">
              Pulso · Fase 1e
            </span>
          </div>

          <h1
            className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl"
            style={{ letterSpacing: "-0.025em" }}
          >
            Pulso
          </h1>
          <p className="mt-1 max-w-xl text-[14px] leading-relaxed text-slate-500">
            Cómo estás hoy. Cash runway, salud financiera, narrativa del negocio
            en 10 segundos.
          </p>
        </div>

        <CurrencyToggle />
      </header>

      {/* ═══════ Error state ═══════ */}
      {error && (
        <div
          className="rounded-xl border p-4 text-sm"
          style={{
            borderColor: "rgba(239,68,68,0.25)",
            background: "rgba(239,68,68,0.04)",
            color: "#991b1b",
          }}
        >
          <div className="font-semibold">No se pudieron cargar los datos del Pulso</div>
          <div className="mt-1 text-xs opacity-80">{error}</div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
            style={{ transition: `all 200ms ${ES}` }}
          >
            Reintentar
          </button>
        </div>
      )}

      {/* ═══════ Narrativa determinista (Fase 1d) ═══════ */}
      <NarrativeHero narrative={data?.narrative ?? null} loading={loading} />

      {/* ═══════ Cash Runway Hero (con override Fase 1e) ═══════ */}
      <CashRunwayHero
        runway={data?.runway ?? null}
        loading={loading}
        asOfDate={data?.meta.ytdTo}
        onAdjust={() => setOverrideOpen(true)}
      />

      {/* ═══════ Marketing Financiero (Fase 1b) ═══════ */}
      <MarketingFinanceCard
        ytdFrom={data?.meta.ytdFrom}
        ytdTo={data?.meta.ytdTo}
      />

      {/* ═══════ Revenue 12m + Costos YTD + Margen (Fase 1c) ═══════ */}
      <Revenue12mSparkline
        data={data?.sparkline12m ?? null}
        loading={loading}
        asOfDate={data?.meta.ytdTo}
      />

      {/* ═══════ Alertas financieras (Fase 1d) ═══════ */}
      <FinancialAlertsCard alerts={data?.alerts ?? null} loading={loading} />

      {/* ═══════ Modal de override del cash balance (Fase 1e) ═══════ */}
      <CashBalanceOverride
        open={overrideOpen}
        onClose={() => setOverrideOpen(false)}
        onSuccess={handleOverrideSuccess}
        runway={data?.runway ?? null}
      />

      {/* Atajos a otras tabs */}
      <div className="flex flex-wrap items-center gap-2 pt-2 text-sm text-slate-500">
        <span className="text-xs uppercase tracking-wider text-slate-400">
          Ir a
        </span>
        <Link
          href="/finanzas/estado"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:border-amber-300 hover:text-amber-700"
          style={{ transition: `all 220ms ${ES}` }}
        >
          Estado de Resultados
          <span aria-hidden>→</span>
        </Link>
        <Link
          href="/finanzas/costos"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:border-amber-300 hover:text-amber-700"
          style={{ transition: `all 220ms ${ES}` }}
        >
          Costos
          <span aria-hidden>→</span>
        </Link>
      </div>

      <style jsx global>{`
        @keyframes pulsoHeaderDot {
          0%,
          100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.5);
            opacity: 0.55;
          }
        }
      `}</style>
    </div>
  );
}

// Fase 1e — Pulso completo. Todos los placeholders removidos.
