// ══════════════════════════════════════════════════════════════
// MeliCatalogCard — Catálogo vs Fuera de catálogo (MELI)
// ══════════════════════════════════════════════════════════════
// Muestra qué proporción de ventas MELI vienen de publicaciones
// en catálogo vs publicaciones individuales. Importante para
// entender competitividad y visibilidad en ML.
// ══════════════════════════════════════════════════════════════

"use client";

import React, { useState } from "react";
import { BookOpen, Package } from "lucide-react";
import { formatARS, formatCompact } from "@/lib/utils/format";
import type { MeliCatalogItem } from "./types";

interface MeliCatalogCardProps {
  data: MeliCatalogItem[] | null | undefined;
  loading?: boolean;
}

type CatalogMetric = "revenue" | "orders";

export default function MeliCatalogCard({ data, loading }: MeliCatalogCardProps) {
  const [metric, setMetric] = useState<CatalogMetric>("revenue");

  if (loading) {
    return (
      <section className="dash-card dash-fade-up p-5">
        <div className="h-40 dash-skeleton rounded-lg" />
      </section>
    );
  }

  if (!data || data.length === 0) return null;

  const catalog = data.find(d => d.type === "Catálogo");
  const nonCatalog = data.find(d => d.type === "Fuera de catálogo");

  const totalOrders = (catalog?.orders ?? 0) + (nonCatalog?.orders ?? 0);
  const totalRevenue = (catalog?.revenue ?? 0) + (nonCatalog?.revenue ?? 0);

  // Percentages depend on selected metric
  const total = metric === "revenue" ? totalRevenue : totalOrders;
  const catalogVal = metric === "revenue" ? (catalog?.revenue ?? 0) : (catalog?.orders ?? 0);
  const nonCatalogVal = metric === "revenue" ? (nonCatalog?.revenue ?? 0) : (nonCatalog?.orders ?? 0);
  const catalogPct = total > 0 ? (catalogVal / total) * 100 : 0;
  const nonCatalogPct = total > 0 ? (nonCatalogVal / total) * 100 : 0;

  return (
    <section className="dash-card dash-fade-up p-5" style={{ fontVariantNumeric: "tabular-nums" }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Catálogo vs Individual</h3>
            <p className="text-[11px] text-slate-500">Por tipo de publicación en ML</p>
          </div>
        </div>
        {/* Metric toggle */}
        <div className="flex gap-1">
          {([
            { key: "revenue" as const, label: "Facturación" },
            { key: "orders" as const, label: "Pedidos" },
          ]).map(({ key, label }) => (
            <button key={key} onClick={() => setMetric(key)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all duration-200 ${
                metric === key
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Stacked bar */}
      <div className="h-3 rounded-full bg-slate-100 overflow-hidden flex">
        <div
          className="h-full bg-indigo-500 transition-all duration-700"
          style={{ width: `${catalogPct}%` }}
        />
        <div
          className="h-full bg-slate-400 transition-all duration-700"
          style={{ width: `${nonCatalogPct}%` }}
        />
      </div>

      {/* Legend rows */}
      <div className="mt-4 space-y-3">
        <Row
          icon={<BookOpen className="w-3.5 h-3.5 text-indigo-600" />}
          label="Catálogo"
          sublabel="Publicaciones unificadas"
          color="bg-indigo-500"
          mainValue={catalogVal}
          metric={metric}
          orders={catalog?.orders ?? 0}
          units={catalog?.units ?? 0}
          pct={catalogPct}
        />
        <Row
          icon={<Package className="w-3.5 h-3.5 text-slate-500" />}
          label="Fuera de catálogo"
          sublabel="Publicaciones individuales"
          color="bg-slate-400"
          mainValue={nonCatalogVal}
          metric={metric}
          orders={nonCatalog?.orders ?? 0}
          units={nonCatalog?.units ?? 0}
          pct={nonCatalogPct}
        />
      </div>

      {/* Footer insight */}
      <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500">
        <span className="font-semibold text-indigo-600">{catalogPct.toFixed(0)}%</span>{" "}
        de {metric === "revenue" ? "la facturación" : "los pedidos"} MELI viene de publicaciones en catálogo.
      </div>
    </section>
  );
}

function Row({
  icon, label, sublabel, color, mainValue, metric, orders, units, pct,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  color: string;
  mainValue: number;
  metric: CatalogMetric;
  orders: number;
  units: number;
  pct: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div className={`w-2.5 h-2.5 rounded-full ${color} flex-shrink-0`} />
        {icon}
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-800">{label}</p>
          <p className="text-[10px] text-slate-400">{sublabel}</p>
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-xs font-semibold text-slate-900">
          {metric === "revenue" ? formatCompact(mainValue) : mainValue.toLocaleString("es-AR")}
        </p>
        <p className="text-[10px] text-slate-400">
          {metric === "revenue"
            ? `${orders.toLocaleString("es-AR")} órd · ${units.toLocaleString("es-AR")} uds · ${pct.toFixed(0)}%`
            : `${formatCompact(mainValue)} · ${units.toLocaleString("es-AR")} uds · ${pct.toFixed(0)}%`
          }
        </p>
      </div>
    </div>
  );
}
