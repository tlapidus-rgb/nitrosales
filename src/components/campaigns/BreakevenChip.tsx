"use client";

import React from "react";
import { ShieldCheck, Activity, AlertTriangle, Info, Gauge } from "lucide-react";
import { getRoasHealth } from "@/lib/hooks/useBreakeven";

/**
 * BreakevenChip — pill compacto para mostrar salud ROAS vs break-even.
 * Usado en Meta Overview y Google Overview (encabezado).
 */
export function BreakevenChip({
  currentRoas,
  breakevenRoas,
  contributionMargin,
}: {
  currentRoas: number;
  breakevenRoas: number;
  contributionMargin: number;
}) {
  const health = getRoasHealth(currentRoas, breakevenRoas);

  const styles: Record<string, { bg: string; text: string; ring: string; Icon: any }> = {
    green:  { bg: "bg-emerald-50",  text: "text-emerald-800", ring: "ring-emerald-200", Icon: ShieldCheck },
    amber:  { bg: "bg-amber-50",    text: "text-amber-800",   ring: "ring-amber-200",   Icon: Activity },
    red:    { bg: "bg-red-50",      text: "text-red-800",     ring: "ring-red-200",     Icon: AlertTriangle },
    gray:   { bg: "bg-slate-50",    text: "text-slate-600",   ring: "ring-slate-200",   Icon: Info },
  };
  const s = styles[health.status];

  if (health.status === "gray" || breakevenRoas <= 0) {
    return (
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${s.bg} ${s.text} ring-1 ${s.ring} text-xs`}>
        <Gauge size={14} />
        <span className="font-medium">Break-even no disponible</span>
        <span className="text-slate-500">Cargá COGS en Finanzas</span>
      </div>
    );
  }

  const ratio = currentRoas / breakevenRoas;

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${s.bg} ${s.text} ring-1 ${s.ring}`}>
      <s.Icon size={14} />
      <div className="flex items-center gap-2 text-xs">
        <span className="font-bold uppercase tracking-wider">{health.label}</span>
        <span className="opacity-60">·</span>
        <span>
          ROAS <span className="font-bold tabular-nums">{currentRoas.toFixed(2)}x</span>
        </span>
        <span className="opacity-60">vs</span>
        <span>
          BE <span className="font-bold tabular-nums">{breakevenRoas.toFixed(2)}x</span>
        </span>
        <span className="opacity-60">·</span>
        <span>
          CM <span className="font-bold tabular-nums">{(contributionMargin * 100).toFixed(0)}%</span>
        </span>
        <span className="opacity-60">·</span>
        <span className="font-bold tabular-nums">{ratio.toFixed(1)}× BE</span>
      </div>
    </div>
  );
}

/** Devuelve tailwind class para colorear un ROAS segun break-even. */
export function roasColorClass(roas: number, breakevenRoas: number): string {
  if (!breakevenRoas || breakevenRoas <= 0) {
    return roas >= 3 ? "text-green-600" : roas >= 1.5 ? "text-amber-600" : roas > 0 ? "text-red-600" : "text-gray-400";
  }
  if (roas >= breakevenRoas * 1.5) return "text-green-600";
  if (roas >= breakevenRoas) return "text-amber-600";
  if (roas > 0) return "text-red-600";
  return "text-gray-400";
}
