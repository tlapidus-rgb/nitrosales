// ══════════════════════════════════════════════════════════════
// Orders — SourceSplitBar (Tanda 8.5)
// ══════════════════════════════════════════════════════════════
// Barra horizontal que muestra la distribución VTEX vs ML en el
// período seleccionado. Solo se renderiza en la tab "Todos" para
// darle contexto al consolidado. Acepta métrica por órdenes o
// facturación.
// ══════════════════════════════════════════════════════════════

"use client";

import React from "react";
import { formatARS, formatCompact } from "@/lib/utils/format";

interface SourceSplitBarProps {
  vtexOrders: number;
  meliOrders: number;
  vtexRevenue: number;
  meliRevenue: number;
}

export default function SourceSplitBar({
  vtexOrders,
  meliOrders,
  vtexRevenue,
  meliRevenue,
}: SourceSplitBarProps) {
  const totalOrders = vtexOrders + meliOrders;
  const totalRevenue = vtexRevenue + meliRevenue;

  if (totalOrders === 0) return null;

  const vtexOrdersPct = totalOrders > 0 ? (vtexOrders / totalOrders) * 100 : 0;
  const meliOrdersPct = 100 - vtexOrdersPct;
  const vtexRevenuePct = totalRevenue > 0 ? (vtexRevenue / totalRevenue) * 100 : 0;
  const meliRevenuePct = 100 - vtexRevenuePct;

  const Bar = ({
    label,
    vtexPct,
    meliPct,
    vtexAbs,
    meliAbs,
    formatter,
  }: {
    label: string;
    vtexPct: number;
    meliPct: number;
    vtexAbs: string;
    meliAbs: string;
    formatter?: (n: number) => string;
  }) => (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{label}</span>
      </div>
      <div className="relative h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-l-full"
          style={{
            width: `${vtexPct}%`,
            transition: "width 500ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
        <div
          className="absolute inset-y-0 bg-gradient-to-r from-amber-400 to-amber-500 rounded-r-full"
          style={{
            left: `${vtexPct}%`,
            width: `${meliPct}%`,
            transition: "left 500ms cubic-bezier(0.16, 1, 0.3, 1), width 500ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
      </div>
      <div className="flex items-center justify-between mt-2 text-[11px]">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
          <span className="text-slate-600 font-medium">VTEX</span>
          <span className="text-slate-400 tabular-nums">{vtexPct.toFixed(1)}%</span>
          <span className="text-slate-500 tabular-nums">· {vtexAbs}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500 tabular-nums">{meliAbs} ·</span>
          <span className="text-slate-400 tabular-nums">{meliPct.toFixed(1)}%</span>
          <span className="text-slate-600 font-medium">Mercado Libre</span>
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="bg-white rounded-xl border border-slate-200/70 p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Distribución por plataforma</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Cómo se reparte el período entre VTEX y Mercado Libre
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Bar
          label="Por órdenes"
          vtexPct={vtexOrdersPct}
          meliPct={meliOrdersPct}
          vtexAbs={vtexOrders.toLocaleString("es-AR")}
          meliAbs={meliOrders.toLocaleString("es-AR")}
        />
        <Bar
          label="Por facturación"
          vtexPct={vtexRevenuePct}
          meliPct={meliRevenuePct}
          vtexAbs={formatCompact(vtexRevenue)}
          meliAbs={formatCompact(meliRevenue)}
        />
      </div>
    </div>
  );
}
