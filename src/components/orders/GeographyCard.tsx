"use client";

// ══════════════════════════════════════════════════════════════
// GeographyCard — Top provincias + top códigos postales
// ══════════════════════════════════════════════════════════════

import { useState } from "react";
import { MapPin, Map } from "lucide-react";
import { formatARS } from "@/lib/utils/format";
import type { GeographyData, GeoBucket } from "./types";

interface GeographyCardProps {
  data: GeographyData | null | undefined;
  loading?: boolean;
}

type Tab = "province" | "postal";

export default function GeographyCard({ data, loading }: GeographyCardProps) {
  const [tab, setTab] = useState<Tab>("province");

  if (loading || !data) {
    return (
      <section className="dash-card dash-fade-up p-5">
        <div className="h-56 dash-skeleton rounded-lg" />
      </section>
    );
  }

  const buckets =
    tab === "province"
      ? (data.topProvinces ?? [])
      : (data.topPostalCodes ?? []);

  return (
    <section className="dash-card dash-fade-up p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center">
            <Map className="w-4.5 h-4.5 text-slate-700" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              De dónde compran
            </h3>
            <p className="text-[11px] text-slate-500">
              {tab === "province"
                ? "Provincias con más pedidos."
                : "Códigos postales con más pedidos."}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 p-0.5 bg-slate-50 border border-slate-100 rounded-lg w-fit">
        <TabButton
          active={tab === "province"}
          onClick={() => setTab("province")}
          label="Provincias"
        />
        <TabButton
          active={tab === "postal"}
          onClick={() => setTab("postal")}
          label="Códigos postales"
        />
      </div>

      {/* List */}
      <BucketList buckets={buckets} />
    </section>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
        active
          ? "bg-white text-slate-900 shadow-sm"
          : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {label}
    </button>
  );
}

function BucketList({ buckets }: { buckets: GeoBucket[] }) {
  if (buckets.length === 0) {
    return <p className="text-xs text-slate-400">Sin datos en el período.</p>;
  }
  const total = buckets.reduce((a, b) => a + b.orders, 0);
  const maxOrders = Math.max(...buckets.map((b) => b.orders), 1);

  return (
    <div className="space-y-2">
      {buckets.slice(0, 10).map((b, idx) => {
        const pct = total > 0 ? (b.orders / total) * 100 : 0;
        const barPct = (b.orders / maxOrders) * 100;
        return (
          <div key={`${b.value}-${idx}`}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <MapPin className="w-3 h-3 text-slate-400 flex-shrink-0" />
                <span className="text-xs font-medium text-slate-800 truncate">
                  {b.value || "Sin dato"}
                </span>
              </div>
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
            <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-slate-400 rounded-full transition-all duration-700"
                style={{ width: `${barPct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
