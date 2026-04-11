// ══════════════════════════════════════════════════════════════
// Orders — MercadoLibreCascadeCard (Tanda 8.4)
// ══════════════════════════════════════════════════════════════
// Cascada visual exclusiva de la tab ML: muestra cómo se descompone
// el ingreso bruto de ML en comisión, envío y el neto real que
// efectivamente cobrás. Cada paso con barra de magnitud, % del
// bruto y tone contextual.
// ══════════════════════════════════════════════════════════════

"use client";

import React from "react";
import { formatARS, formatCompact } from "@/lib/utils/format";
import { ArrowDownRight, TrendingDown, Wallet } from "lucide-react";

interface MercadoLibreCascadeCardProps {
  grossRevenue: number;
  marketplaceFee: number;
  shippingCost: number;
  ordersCount: number;
  feeCoveragePct?: number;
}

export default function MercadoLibreCascadeCard({
  grossRevenue,
  marketplaceFee,
  shippingCost,
  ordersCount,
  feeCoveragePct,
}: MercadoLibreCascadeCardProps) {
  const realNet = Math.max(grossRevenue - marketplaceFee - shippingCost, 0);
  const feePct = grossRevenue > 0 ? (marketplaceFee / grossRevenue) * 100 : 0;
  const shippingPct = grossRevenue > 0 ? (shippingCost / grossRevenue) * 100 : 0;
  const netPct = grossRevenue > 0 ? (realNet / grossRevenue) * 100 : 0;

  const Step = ({
    label,
    value,
    pct,
    widthPct,
    tone,
    icon,
    subtitle,
  }: {
    label: string;
    value: number;
    pct: number;
    widthPct: number;
    tone: "neutral" | "negative" | "positive";
    icon: React.ReactNode;
    subtitle?: string;
  }) => {
    const tones = {
      neutral: {
        bar: "bg-gradient-to-r from-slate-400 to-slate-500",
        text: "text-slate-900",
        iconBg: "bg-slate-100",
        iconColor: "text-slate-600",
      },
      negative: {
        bar: "bg-gradient-to-r from-rose-400 to-rose-500",
        text: "text-rose-700",
        iconBg: "bg-rose-50",
        iconColor: "text-rose-500",
      },
      positive: {
        bar: "bg-gradient-to-r from-emerald-400 to-emerald-500",
        text: "text-emerald-700",
        iconBg: "bg-emerald-50",
        iconColor: "text-emerald-600",
      },
    };
    const style = tones[tone];
    return (
      <div className="relative">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${style.iconBg}`}>
            <span className={style.iconColor}>{icon}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-end justify-between gap-2 mb-1">
              <div>
                <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{label}</p>
                {subtitle && <p className="text-[10px] text-slate-400 mt-0.5">{subtitle}</p>}
              </div>
              <div className="text-right">
                <p className={`text-lg font-bold ${style.text}`} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {tone === "negative" ? "−" : ""}
                  {formatARS(value)}
                </p>
                <p className="text-[10px] text-slate-400 tabular-nums">{pct.toFixed(1)}% del bruto</p>
              </div>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full ${style.bar}`}
                style={{
                  width: `${Math.min(widthPct, 100)}%`,
                  transition: "width 700ms cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (grossRevenue === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200/70 p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        <h2 className="text-sm font-semibold text-slate-800 mb-2">Cascada Mercado Libre</h2>
        <p className="text-xs text-slate-400 text-center py-8">
          Sin órdenes de Mercado Libre en el período seleccionado.
        </p>
      </div>
    );
  }

  return (
    <div
      className="bg-white rounded-xl border border-slate-200/70 p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Cascada Mercado Libre</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            De ingreso bruto a neto real en {ordersCount.toLocaleString("es-AR")} órden
            {ordersCount !== 1 ? "es" : ""}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200/70 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          MELI
        </span>
      </div>

      <div className="space-y-4">
        <Step
          label="Ingreso bruto"
          value={grossRevenue}
          pct={100}
          widthPct={100}
          tone="neutral"
          icon={<Wallet size={16} />}
          subtitle="Total facturado antes de deducciones"
        />
        <Step
          label="Comisión Mercado Libre"
          value={marketplaceFee}
          pct={feePct}
          widthPct={feePct}
          tone="negative"
          icon={<TrendingDown size={16} />}
          subtitle={
            feeCoveragePct !== undefined
              ? `Cobertura de datos: ${feeCoveragePct.toFixed(0)}% de órdenes con comisión registrada`
              : "Sale fee retenido por ML"
          }
        />
        <Step
          label="Costo de envío"
          value={shippingCost}
          pct={shippingPct}
          widthPct={shippingPct}
          tone="negative"
          icon={<ArrowDownRight size={16} />}
          subtitle="Costo logístico soportado en el envío"
        />
        <div className="pt-4 border-t border-slate-100">
          <Step
            label="Ingreso real (neto)"
            value={realNet}
            pct={netPct}
            widthPct={netPct}
            tone="positive"
            icon={<Wallet size={16} />}
            subtitle="Lo que efectivamente entra al negocio"
          />
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
        <span>Bruto → Neto</span>
        <span className="font-semibold text-emerald-700 tabular-nums">{formatCompact(realNet)}</span>
      </div>
    </div>
  );
}
