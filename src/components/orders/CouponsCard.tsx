"use client";

// ══════════════════════════════════════════════════════════════
// CouponsCard — Top cupones por facturación
// ══════════════════════════════════════════════════════════════

import { Ticket } from "lucide-react";
import { formatARS } from "@/lib/utils/format";
import type { CouponsData, SourceCounts } from "./types";
import PlatformScopeBanner from "./PlatformScopeBanner";

interface CouponsCardProps {
  data: CouponsData | null | undefined;
  loading?: boolean;
  source?: string;
  sourceCounts?: SourceCounts;
}

export default function CouponsCard({
  data,
  loading,
  source,
  sourceCounts,
}: CouponsCardProps) {
  if (loading || !data) {
    return (
      <section className="dash-card dash-fade-up p-5">
        <div className="h-56 dash-skeleton rounded-lg" />
      </section>
    );
  }

  const coupons = data.topCoupons ?? [];
  const isMeliFilter = source === "MELI";

  return (
    <section className="dash-card dash-fade-up p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center">
            <Ticket className="w-4.5 h-4.5 text-slate-700" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Cupones más usados
            </h3>
            <p className="text-[11px] text-slate-500">
              Qué códigos trajeron pedidos y cuánto descuento hicieron.
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">
            Descuento total
          </p>
          <p className="text-sm font-semibold tabular-nums text-rose-600">
            −{formatARS(data.totalCouponDiscount ?? 0)}
          </p>
        </div>
      </div>

      <PlatformScopeBanner
        source={source}
        sourceCounts={sourceCounts}
        reason="ML tiene su propio sistema de cupones que no registramos acá."
      />

      {/* Table */}
      {isMeliFilter ? (
        <div className="py-6 text-center">
          <p className="text-xs text-slate-500">
            Filtrando por MercadoLibre — no hay datos de cupones para mostrar.
          </p>
        </div>
      ) : coupons.length === 0 ? (
        <p className="text-xs text-slate-400">
          No se usaron cupones en este período.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-100">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2 text-right">Pedidos</th>
                <th className="px-3 py-2 text-right">Facturación</th>
                <th className="px-3 py-2 text-right">Descuento</th>
              </tr>
            </thead>
            <tbody>
              {coupons.slice(0, 10).map((c, i) => (
                <tr
                  key={c.code}
                  className={`border-t border-slate-100 ${
                    i % 2 === 1 ? "bg-slate-50/40" : "bg-white"
                  } hover:bg-slate-50 transition-colors`}
                >
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center rounded-md bg-orange-50 border border-orange-100 px-1.5 py-0.5 text-[11px] font-mono font-semibold text-orange-700">
                      {c.code}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700">
                    {c.orders.toLocaleString("es-AR")}
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums font-semibold text-slate-900">
                    {formatARS(c.revenue)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums text-rose-600">
                    −{formatARS(c.discountTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
