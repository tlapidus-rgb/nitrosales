// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════════════
// /campaigns — Overview (sesión 21)
// ──────────────────────────────────────────────────────────────────────
// Landing simple que dirige a Meta o Google. Reemplaza la página
// anterior que crashaba con "Application error: a client-side
// exception has occurred". Esta versión es liviana, sin fetches
// pesados ni dependencias circulares. Sólo 3 KPIs globales y
// dos tarjetas de entrada a las sub-secciones.
// ══════════════════════════════════════════════════════════════════════

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { formatARS } from "@/lib/utils/format";
import {
  ArrowRight, DollarSign, Target, ShoppingCart,
  ChevronRight, Sparkles,
} from "lucide-react";

const ES_TRANSITION = "cubic-bezier(0.16, 1, 0.3, 1)";

function useCountUp(target: number, duration = 700) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  const fromRef = useRef(0);
  useEffect(() => {
    let start: number | null = null;
    fromRef.current = value;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const step = (t: number) => {
      if (!start) start = t;
      const p = Math.min((t - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 4);
      setValue(fromRef.current + (target - fromRef.current) * eased);
      if (p < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);
  return value;
}

export default function CampaignsOverviewPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    const qs = `from=${from.toISOString().split("T")[0]}&to=${to.toISOString().split("T")[0]}`;

    fetch(`/api/metrics/campaigns?${qs}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setData(d && typeof d === "object" ? d : null);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setData(null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const platformSummary = Array.isArray(data?.platformSummary) ? data.platformSummary : [];
  const meta = platformSummary.find((p: any) => p.platform === "META");
  const google = platformSummary.find((p: any) => p.platform === "GOOGLE");
  const totals = data?.totals || {};

  const totalSpend = Number(totals.spend || 0);
  const totalRevenue = Number(totals.conversionValue || 0);
  const totalConversions = Number(totals.conversions || 0);
  const blendedRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  const vSpend = useCountUp(totalSpend);
  const vRoas = useCountUp(blendedRoas);
  const vConv = useCountUp(totalConversions);

  return (
    <div className="min-h-screen bg-slate-50 relative overflow-x-hidden">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(1100px 600px at 15% -10%, rgba(59,130,246,0.12), transparent 60%), radial-gradient(900px 500px at 95% 10%, rgba(139,92,246,0.10), transparent 60%)",
        }}
      />

      <div className="max-w-[1200px] mx-auto p-5 lg:p-8 space-y-6">
        {/* Header */}
        <div style={{ animation: `overview-enter 500ms ${ES_TRANSITION}` }}>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">
            Campañas
          </h1>
          <p className="mt-1 text-sm text-slate-500 tracking-tight">
            Elegí una plataforma para explorar su performance detallada.
          </p>
        </div>

        {/* Totals */}
        <div
          className="grid grid-cols-1 sm:grid-cols-3 gap-4"
          style={{ animation: `overview-enter 500ms ${ES_TRANSITION} 100ms both` }}
        >
          <MiniKpi
            icon={<DollarSign size={15} className="text-slate-700" />}
            iconBg="bg-slate-100"
            label="Gasto 30d"
            value={loading ? "…" : formatARS(vSpend)}
          />
          <MiniKpi
            icon={<Target size={15} className="text-emerald-700" />}
            iconBg="bg-emerald-50"
            label="ROAS blended"
            value={loading ? "…" : `${vRoas.toFixed(2)}x`}
          />
          <MiniKpi
            icon={<ShoppingCart size={15} className="text-violet-700" />}
            iconBg="bg-violet-50"
            label="Conversiones"
            value={loading ? "…" : Math.round(vConv).toLocaleString("es-AR")}
          />
        </div>

        {/* Platform cards */}
        <div
          className="grid grid-cols-1 lg:grid-cols-2 gap-4"
          style={{ animation: `overview-enter 500ms ${ES_TRANSITION} 180ms both` }}
        >
          <PlatformCard
            href="/campaigns/meta"
            title="Meta Ads"
            subtitle="Facebook · Instagram"
            accent="from-blue-500/15 to-violet-500/5"
            accentBar="bg-gradient-to-r from-blue-500 to-violet-500"
            spend={meta?.spend}
            roas={meta?.roas}
            conversions={meta?.conversions}
            campaigns={meta?.campaigns}
            loading={loading}
          />
          <PlatformCard
            href="/campaigns/google"
            title="Google Ads"
            subtitle="Search · Shopping · PMax · Display"
            accent="from-amber-400/20 to-emerald-400/5"
            accentBar="bg-gradient-to-r from-amber-400 to-emerald-500"
            spend={google?.spend}
            roas={google?.roas}
            conversions={google?.conversions}
            campaigns={google?.campaigns}
            loading={loading}
          />
        </div>

        {/* Creativos Lab entry */}
        <Link
          href="/campaigns/creatives"
          className="group block rounded-2xl bg-white border border-slate-100 p-5 hover:shadow-md"
          style={{
            boxShadow:
              "0 1px 0 rgba(15,23,42,0.06), 0 8px 24px -12px rgba(15,23,42,0.10), 0 22px 40px -28px rgba(15,23,42,0.08)",
            transition: `box-shadow 220ms ${ES_TRANSITION}`,
            animation: `overview-enter 500ms ${ES_TRANSITION} 260ms both`,
          }}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-rose-50 to-amber-50">
                <Sparkles size={16} className="text-rose-600" />
              </div>
              <div>
                <div className="text-[14px] font-semibold text-slate-900 tracking-tight">
                  Creativos Lab
                </div>
                <div className="text-[11px] text-slate-500">
                  Análisis y diagnóstico visual de todos tus creativos
                </div>
              </div>
            </div>
            <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-500" />
          </div>
        </Link>
      </div>

      <style jsx global>{`
        @keyframes overview-enter {
          0% {
            opacity: 0;
            transform: translateY(8px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </div>
  );
}

function MiniKpi({
  icon,
  iconBg,
  label,
  value,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
}) {
  return (
    <div
      className="rounded-2xl bg-white p-4 border border-slate-100"
      style={{
        boxShadow:
          "0 1px 0 rgba(15,23,42,0.06), 0 8px 24px -12px rgba(15,23,42,0.10)",
      }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`p-1.5 rounded-lg ${iconBg}`}>{icon}</div>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          {label}
        </span>
      </div>
      <div className="text-xl font-bold text-slate-900 tabular-nums tracking-tight">
        {value}
      </div>
    </div>
  );
}

function PlatformCard({
  href,
  title,
  subtitle,
  accent,
  accentBar,
  spend,
  roas,
  conversions,
  campaigns,
  loading,
}: {
  href: string;
  title: string;
  subtitle: string;
  accent: string;
  accentBar: string;
  spend?: number;
  roas?: number;
  conversions?: number;
  campaigns?: number;
  loading: boolean;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-2xl bg-white border border-slate-100 overflow-hidden hover:shadow-lg"
      style={{
        boxShadow:
          "0 1px 0 rgba(15,23,42,0.06), 0 8px 24px -12px rgba(15,23,42,0.10), 0 22px 40px -28px rgba(15,23,42,0.08)",
        transition: `box-shadow 260ms ${ES_TRANSITION}, transform 260ms ${ES_TRANSITION}`,
      }}
    >
      <div className={`h-1 w-full ${accentBar}`} />
      <div className={`bg-gradient-to-br ${accent} p-5 lg:p-6 relative`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 tracking-tight">{title}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-white/70 px-2.5 py-1 rounded-lg ring-1 ring-slate-200 group-hover:bg-white">
            Abrir
            <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4">
          <StatBlock label="Gasto 30d" value={loading ? "…" : spend ? formatARS(spend) : "—"} />
          <StatBlock
            label="ROAS"
            value={loading ? "…" : roas ? `${Number(roas).toFixed(2)}x` : "—"}
          />
          <StatBlock
            label="Conversiones"
            value={loading ? "…" : conversions ? Math.round(conversions).toLocaleString("es-AR") : "—"}
          />
          <StatBlock
            label="Campañas"
            value={loading ? "…" : campaigns ? String(campaigns) : "—"}
          />
        </div>
      </div>
    </Link>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
        {label}
      </div>
      <div className="text-[17px] font-bold text-slate-900 tabular-nums tracking-tight mt-0.5">
        {value}
      </div>
    </div>
  );
}
