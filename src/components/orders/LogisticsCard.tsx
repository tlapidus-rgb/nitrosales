"use client";

// ══════════════════════════════════════════════════════════════
// LogisticsCard — Envíos: tipo, carrier, shipping gap
// ══════════════════════════════════════════════════════════════
// El "shipping gap" se explica BIEN SIMPLE:
//   "Lo que te cobraste de envío vs lo que realmente pagaste"
// Gap positivo = pérdida (cobraste menos de lo que te costó).
// ══════════════════════════════════════════════════════════════

import { Truck, AlertTriangle } from "lucide-react";
import { formatARS } from "@/lib/utils/format";
import { useAnimatedValue } from "@/lib/hooks/useAnimatedValue";
import type { LogisticsData, LogisticsBucket, SourceCounts } from "./types";
import PlatformScopeBanner from "./PlatformScopeBanner";

interface LogisticsCardProps {
  data: LogisticsData | null | undefined;
  loading?: boolean;
  source?: string;
  sourceCounts?: SourceCounts;
}

export default function LogisticsCard({
  data,
  loading,
  source,
  sourceCounts,
}: LogisticsCardProps) {
  if (loading) {
    return (
      <section className="dash-card dash-fade-up p-5">
        <div className="h-56 dash-skeleton rounded-lg" />
      </section>
    );
  }
  if (!data) return null;

  const gapTotal = data.shippingGapTotal ?? 0;
  const isLoss = gapTotal > 0;
  const animatedGap = useAnimatedValue(formatARS(Math.abs(gapTotal)), 900);
  const isMeliFilter = source === "MELI";

  return (
    <section className="dash-card dash-fade-up p-5">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-4">
        <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center">
          <Truck className="w-4.5 h-4.5 text-slate-700" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Envíos y logística
          </h3>
          <p className="text-[11px] text-slate-500">
            Cómo llegaron los pedidos y cuánto costaron.
          </p>
        </div>
      </div>

      <PlatformScopeBanner
        source={source}
        sourceCounts={sourceCounts}
        reason="ML maneja su propia logística (Full, Flex, Lugar) y no nos comparte el detalle del courier ni el costo real."
      />

      {isMeliFilter ? (
        <div className="py-6 text-center">
          <p className="text-xs text-slate-500">
            Filtrando por MercadoLibre — no hay datos de logística para mostrar.
          </p>
        </div>
      ) : (
        <>
      {/* Shipping gap banner — explicación BIEN SIMPLE */}
      <div
        className={`rounded-lg border px-3 py-2.5 mb-4 ${
          isLoss
            ? "bg-rose-50 border-rose-100"
            : gapTotal === 0
              ? "bg-slate-50 border-slate-100"
              : "bg-cyan-50 border-cyan-100"
        }`}
      >
        <div className="flex items-start gap-2.5">
          <AlertTriangle
            className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
              isLoss
                ? "text-rose-600"
                : gapTotal === 0
                  ? "text-slate-400"
                  : "text-cyan-600"
            }`}
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-900">
              {isLoss
                ? "Estás perdiendo plata en envíos"
                : gapTotal === 0
                  ? "Envíos en equilibrio"
                  : "Estás ganando en envíos"}
            </p>
            <p className="text-[11px] text-slate-600 leading-snug mt-0.5">
              Lo que cobraste a tus clientes por envío{" "}
              {isLoss ? "es" : gapTotal === 0 ? "coincide con" : "es"}{" "}
              {isLoss
                ? `menor a lo que le pagaste al courier en ${animatedGap}.`
                : gapTotal === 0
                  ? "lo que le pagaste al courier."
                  : `mayor a lo que le pagaste al courier por ${animatedGap}.`}
            </p>
          </div>
        </div>
      </div>

      {/* Delivery type */}
      <div className="mb-4">
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500 mb-2">
          Por tipo de entrega
        </h4>
        <BucketList buckets={data.byDeliveryType ?? []} />
      </div>

      {/* Carrier */}
      <div>
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500 mb-2">
          Por transportista
        </h4>
        <BucketList buckets={data.byCarrier ?? []} />
      </div>
        </>
      )}
    </section>
  );
}

function BucketList({ buckets }: { buckets: LogisticsBucket[] }) {
  if (buckets.length === 0) {
    return <p className="text-xs text-slate-400">Sin datos en el período.</p>;
  }
  const totalOrders = buckets.reduce((a, b) => a + b.orders, 0);
  return (
    <div className="space-y-1.5">
      {buckets.slice(0, 6).map((b) => {
        const pct = totalOrders > 0 ? (b.orders / totalOrders) * 100 : 0;
        const gapPositive = b.shippingGap > 0;
        return (
          <div
            key={b.bucket}
            className="rounded-md border border-slate-100 bg-white px-2.5 py-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-800 truncate">
                {b.bucket || "Sin asignar"}
              </span>
              <div className="flex items-center gap-3 text-[11px] tabular-nums flex-shrink-0">
                <span className="text-slate-500">
                  {b.orders.toLocaleString("es-AR")} ·{" "}
                  <span className="text-slate-400">{pct.toFixed(0)}%</span>
                </span>
                {b.shippingGap !== 0 && (
                  <span
                    className={
                      gapPositive ? "text-rose-600" : "text-cyan-600"
                    }
                  >
                    {gapPositive ? "−" : "+"}
                    {formatARS(Math.abs(b.shippingGap))}
                  </span>
                )}
              </div>
            </div>
            <div className="mt-1 h-1 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-slate-400 rounded-full transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
