// ═══════════════════════════════════════════════════════════════════
// /finanzas/pulso — portada del módulo Finanzas (Fase 1)
// ═══════════════════════════════════════════════════════════════════
// En 10 segundos respondemos: "¿cómo estoy hoy?"
//
// Layout (Fase 1a):
//   [Header: título + CurrencyToggle]
//   [CashRunwayHero]
//
// Próximas sub-fases van completando:
//   1b → MarketingFinanceCard
//   1c → Revenue12mSparkline + costos YTD
//   1d → NarrativeHero + FinancialAlertsCard
//   1e → override manual + Aurum context
//
// Ver PROPUESTA_PNL_REORG.md §5.1 y plan linear-pondering-lemur.md
// ═══════════════════════════════════════════════════════════════════

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CashRunwayHero from "@/components/finanzas/CashRunwayHero";
import MarketingFinanceCard from "@/components/finanzas/MarketingFinanceCard";
import Revenue12mSparkline from "@/components/finanzas/Revenue12mSparkline";
import NarrativeHero from "@/components/finanzas/NarrativeHero";
import FinancialAlertsCard from "@/components/finanzas/FinancialAlertsCard";
import { CurrencyToggle } from "@/components/finanzas/CurrencyToggle";
import type { PulsoPageData } from "@/types/finanzas";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";

export default function PulsoPage() {
  const [data, setData] = useState<PulsoPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  }, []);

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
              Pulso · Fase 1d
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

      {/* ═══════ Cash Runway Hero ═══════ */}
      <CashRunwayHero
        runway={data?.runway ?? null}
        loading={loading}
        asOfDate={data?.meta.ytdTo}
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

      {/* ═══════ Placeholders de próximas sub-fases ═══════ */}
      <div className="grid grid-cols-1 gap-4">
        <PlaceholderCard
          label="Override manual + Aurum"
          sub="Fase 1e · cockpit completo"
        />
      </div>

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

function PlaceholderCard({ label, sub }: { label: string; sub: string }) {
  return (
    <div
      className="rounded-xl border border-dashed bg-white/60 p-5"
      style={{
        borderColor: "rgba(15,23,42,0.12)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.5), 0 1px 2px rgba(15,23,42,0.02)",
      }}
    >
      <div
        className="text-[10px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: "rgba(15,23,42,0.45)" }}
      >
        {label}
      </div>
      <div className="mt-1 text-xs" style={{ color: "rgba(15,23,42,0.4)" }}>
        {sub}
      </div>
      <div className="mt-6 flex h-16 items-end gap-1">
        {[38, 52, 31, 64, 48, 72, 46, 58].map((h, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${h}%`,
              background:
                "linear-gradient(180deg, rgba(15,23,42,0.08) 0%, rgba(15,23,42,0.02) 100%)",
              borderRadius: 2,
            }}
          />
        ))}
      </div>
    </div>
  );
}
