"use client";

// ══════════════════════════════════════════════════════════════
// CohortsCard — Nuevos / Recurrentes / VIP / Anónimos
// ══════════════════════════════════════════════════════════════
// UI MUY SIMPLE. El criterio VIP (5+ compras O $500k+) se
// muestra explícito para que cualquier analista entienda.
// ══════════════════════════════════════════════════════════════

import { Users, Sparkles, Repeat, UserPlus, UserX, Info, AlertTriangle, Store, ShoppingBag } from "lucide-react";
import { formatARS } from "@/lib/utils/format";
import type { CohortsData, CohortStats, SourceCounts } from "./types";

interface CohortsCardProps {
  data: CohortsData | null | undefined;
  loading?: boolean;
  source?: "ALL" | "VTEX" | "MELI";
  sourceCounts?: SourceCounts;
}

export default function CohortsCard({ data, loading, source, sourceCounts }: CohortsCardProps) {
  if (loading) {
    return (
      <section className="dash-card dash-fade-up p-5">
        <div className="h-56 dash-skeleton rounded-lg" />
      </section>
    );
  }
  if (!data) return null;

  const total =
    (data.new?.orders ?? 0) +
    (data.returning?.orders ?? 0) +
    (data.vip?.orders ?? 0) +
    (data.anonymous?.orders ?? 0);

  const rows: Array<{
    key: string;
    label: string;
    sublabel: string;
    stats: CohortStats;
    icon: typeof Users;
    tone: "cyan" | "violet" | "orange" | "slate";
  }> = [
    {
      key: "new",
      label: "Clientes nuevos",
      sublabel: "Primera vez comprando",
      stats: data.new,
      icon: UserPlus,
      tone: "cyan",
    },
    {
      key: "returning",
      label: "Recurrentes",
      sublabel: "Ya habían comprado antes",
      stats: data.returning,
      icon: Repeat,
      tone: "violet",
    },
    {
      key: "vip",
      label: "VIP",
      sublabel: `5+ compras o ${formatARS(data.vipCriteria?.minSpentArs ?? 500000)}+ gastado`,
      stats: data.vip,
      icon: Sparkles,
      tone: "orange",
    },
    {
      key: "anonymous",
      label: "Sin identificar",
      sublabel: "No pudimos asociarlos a un cliente",
      stats: data.anonymous,
      icon: UserX,
      tone: "slate",
    },
  ];

  return (
    <section className="dash-card dash-fade-up p-5">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-1">
        <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center">
          <Users className="w-4.5 h-4.5 text-slate-700" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Tipos de cliente
          </h3>
          <p className="text-[11px] text-slate-500">
            Quién compró en este período.
          </p>
        </div>
      </div>

      {/* Tanda 7.7 \u2014 ML privacy note (esperado) + VTEX data quality warning (bug) */}
      {(data.anonymousMeli?.orders ?? 0) > 0 && (
        <div className="mt-3 rounded-md bg-slate-50 border border-slate-100 px-2.5 py-1.5 flex items-start gap-1.5">
          <Info className="w-3 h-3 text-slate-400 flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-slate-500 leading-snug">
            <span className="font-semibold">ML (privacidad):</span>{" "}
            {(data.anonymousMeli?.orders ?? 0).toLocaleString("es-AR")} pedidos
            de MercadoLibre figuran como "Sin identificar" porque ML no
            comparte el email real. Es esperado.
          </p>
        </div>
      )}
      {(data.anonymousVtex?.orders ?? 0) > 0 && (
        <div className="mt-2 rounded-md bg-amber-50 border border-amber-100 px-2.5 py-1.5 flex items-start gap-1.5">
          <AlertTriangle className="w-3 h-3 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-amber-900 leading-snug">
            <span className="font-semibold">VTEX (posible bug):</span>{" "}
            {(data.anonymousVtex?.orders ?? 0).toLocaleString("es-AR")} pedidos
            de VTEX sin cliente asociado. En VTEX deber\u00edan tener email \u2014 revisar
            el sync o el matching de clientes.
          </p>
        </div>
      )}

      {/* Tanda 9 — Resumen VTEX vs MELI por cantidad de pedidos (solo tab "Todos") */}
      {source === "ALL" && sourceCounts && (sourceCounts.vtex > 0 || sourceCounts.meli > 0) && (
        <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Pedidos por fuente</p>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-indigo-50 flex items-center justify-center flex-shrink-0">
                <Store className="w-3 h-3 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm font-bold tabular-nums text-slate-900">{sourceCounts.vtex.toLocaleString("es-AR")}</p>
                <p className="text-[10px] text-slate-500">VTEX (con cliente)</p>
              </div>
            </div>
            <div className="h-8 w-px bg-slate-200" />
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-amber-50 flex items-center justify-center flex-shrink-0">
                <ShoppingBag className="w-3 h-3 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-bold tabular-nums text-slate-900">{sourceCounts.meli.toLocaleString("es-AR")}</p>
                <p className="text-[10px] text-slate-500">MELI (anónimos)</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rows */}
      <div className="mt-4 space-y-2.5">
        {rows.map((row) => {
          const Icon = row.icon;
          const pct = total > 0 ? (row.stats.orders / total) * 100 : 0;
          const toneStyles = TONE[row.tone];
          return (
            <div
              key={row.key}
              className="rounded-lg border border-slate-100 bg-white px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div
                    className={`flex-shrink-0 w-8 h-8 rounded-lg ${toneStyles.iconBg} flex items-center justify-center`}
                  >
                    <Icon className={`w-4 h-4 ${toneStyles.iconColor}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {row.label}
                    </p>
                    <p className="text-[11px] text-slate-500 leading-snug">
                      {row.sublabel}
                    </p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold tabular-nums text-slate-900">
                    {row.stats.customers.toLocaleString("es-AR")}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {row.stats.orders.toLocaleString("es-AR")} pedidos
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full ${toneStyles.bar} rounded-full transition-all duration-700`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-[10px] font-semibold tabular-nums text-slate-500 w-10 text-right">
                  {pct.toFixed(0)}%
                </span>
              </div>

              {/* Revenue */}
              <p className="mt-1.5 text-[11px] text-slate-500">
                Facturación:{" "}
                <span className="font-semibold tabular-nums text-slate-700">
                  {formatARS(row.stats.revenue)}
                </span>
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const TONE = {
  cyan: {
    iconBg: "bg-cyan-50",
    iconColor: "text-cyan-600",
    bar: "bg-cyan-500",
  },
  violet: {
    iconBg: "bg-violet-50",
    iconColor: "text-violet-600",
    bar: "bg-violet-500",
  },
  orange: {
    iconBg: "bg-orange-50",
    iconColor: "text-orange-600",
    bar: "bg-orange-500",
  },
  slate: {
    iconBg: "bg-slate-100",
    iconColor: "text-slate-600",
    bar: "bg-slate-400",
  },
} as const;
