"use client";

// ══════════════════════════════════════════════════════════════
// SegmentationCard — Device / Channel / Traffic source
// ══════════════════════════════════════════════════════════════
// Tres tabs simples con barras horizontales.
// ══════════════════════════════════════════════════════════════

import { useState } from "react";
import { Smartphone, Megaphone, Compass, Info } from "lucide-react";
import { formatARS } from "@/lib/utils/format";
import type { SegmentationData, SegmentationBucket, SourceCounts } from "./types";

interface SegmentationCardProps {
  data: SegmentationData | null | undefined;
  loading?: boolean;
  source?: string;
  sourceCounts?: SourceCounts;
}

type Tab = "device" | "channel" | "traffic";

export default function SegmentationCard({
  data,
  loading,
  source,
  sourceCounts,
}: SegmentationCardProps) {
  const [tab, setTab] = useState<Tab>("device");
  const isMeliFilter = source === "MELI";
  const isVtexOnlyTab = tab === "device" || tab === "traffic";

  if (loading) {
    return (
      <section className="dash-card dash-fade-up p-5">
        <div className="h-56 dash-skeleton rounded-lg" />
      </section>
    );
  }
  if (!data) return null;

  const tabs: Array<{
    key: Tab;
    label: string;
    icon: typeof Smartphone;
    buckets: SegmentationBucket[];
    hint: string;
  }> = [
    {
      key: "device",
      label: "Dispositivo",
      icon: Smartphone,
      buckets: data.byDevice ?? [],
      hint: "Desde qué equipo compraron.",
    },
    {
      key: "channel",
      label: "Canal",
      icon: Megaphone,
      buckets: data.byChannel ?? [],
      hint: "Web propia, marketplace, etc.",
    },
    {
      key: "traffic",
      label: "Fuente de tráfico",
      icon: Compass,
      buckets: data.byTrafficSource ?? [],
      hint: "Cómo llegaron al sitio.",
    },
  ];

  const active = tabs.find((t) => t.key === tab)!;

  return (
    <section className="dash-card dash-fade-up p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Segmentación de pedidos
          </h3>
          <p className="text-[11px] text-slate-500">{active.hint}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 p-0.5 bg-slate-50 border border-slate-100 rounded-lg w-fit">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                isActive
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon className="w-3 h-3" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* VTEX-only note for device / traffic tabs */}
      {isVtexOnlyTab && (
        <div className="mb-3 inline-flex items-center gap-1 rounded-md bg-slate-50 border border-slate-100 px-2 py-0.5">
          <Info className="w-3 h-3 text-slate-400" />
          <span className="text-[10px] text-slate-500">
            Solo pedidos de VTEX — ML no abre estos datos
            {sourceCounts?.meli
              ? ` · ${sourceCounts.meli.toLocaleString("es-AR")} de ML excluidos`
              : ""}
          </span>
        </div>
      )}

      {/* Buckets */}
      {isVtexOnlyTab && isMeliFilter ? (
        <div className="py-6 text-center">
          <p className="text-xs text-slate-500">
            Filtrando por MercadoLibre — {tab === "device" ? "dispositivo" : "fuente de tráfico"} no está disponible.
          </p>
        </div>
      ) : (
        <BucketBars buckets={active.buckets} />
      )}
    </section>
  );
}

function BucketBars({ buckets }: { buckets: SegmentationBucket[] }) {
  if (buckets.length === 0) {
    return <p className="text-xs text-slate-400">Sin datos en el período.</p>;
  }
  const total = buckets.reduce((a, b) => a + b.orders, 0);
  const maxRev = Math.max(...buckets.map((b) => b.revenue), 1);

  return (
    <div className="space-y-2">
      {buckets.slice(0, 8).map((b) => {
        const pct = total > 0 ? (b.orders / total) * 100 : 0;
        const revPct = (b.revenue / maxRev) * 100;
        return (
          <div key={b.bucket} className="group">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs font-medium text-slate-800 truncate">
                {b.bucket || "Sin asignar"}
              </span>
              <div className="flex items-center gap-3 text-[11px] tabular-nums flex-shrink-0">
                <span className="text-slate-500">
                  {b.orders.toLocaleString("es-AR")}
                </span>
                <span className="text-slate-400">{pct.toFixed(0)}%</span>
                <span className="text-slate-700 font-semibold w-24 text-right">
                  {formatARS(b.revenue)}
                </span>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-violet-500 rounded-full transition-all duration-700"
                style={{ width: `${revPct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
