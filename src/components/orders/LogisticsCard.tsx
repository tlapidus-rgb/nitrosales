"use client";

// ══════════════════════════════════════════════════════════════
// LogisticsCard — Envíos: tipo, carrier, shipping gap
// ══════════════════════════════════════════════════════════════
// El "shipping gap" se explica BIEN SIMPLE:
//   "Lo que te cobraste de envío vs lo que realmente pagaste"
// Gap positivo = pérdida (cobraste menos de lo que te costó).
// ══════════════════════════════════════════════════════════════

import { Truck, AlertTriangle, Info } from "lucide-react";
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
        <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-surface border border-hairline flex items-center justify-center">
          <Truck className="w-4.5 h-4.5 text-ink-60" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink">
            Envíos y logística
          </h3>
          <p className="text-[11px] text-ink-40">
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
          <p className="text-xs text-ink-40">
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
              ? "bg-surface border-hairline"
              : "bg-accent-soft border-accent/20"
        }`}
      >
        <div className="flex items-start gap-2.5">
          <AlertTriangle
            className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
              isLoss
                ? "text-rose-600"
                : gapTotal === 0
                  ? "text-ink-40"
                  : "text-accent"
            }`}
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-ink">
              {isLoss
                ? "Estás perdiendo plata en envíos"
                : gapTotal === 0
                  ? "Envíos en equilibrio"
                  : "Estás ganando en envíos"}
            </p>
            <p className="text-[11px] text-ink-60 leading-snug mt-0.5">
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

      {/* Missing data note for logistics */}
      {(data.byDeliveryType ?? []).some(b => b.bucket === "Sin dato" && b.orders > 0) && (
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-amber-50 border border-amber-100 px-2.5 py-1">
          <Info className="w-3 h-3 text-amber-400 flex-shrink-0" />
          <span className="text-[10px] text-amber-600 leading-snug">
            "Sin dato" = pedidos importados antes de activar el detalle de envío. Se puede corregir con un resync.
          </span>
        </div>
      )}

      {/* Delivery type */}
      <div className="mb-4">
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-40 mb-2">
          Por tipo de entrega
        </h4>
        <BucketList buckets={data.byDeliveryType ?? []} />
      </div>

      {/* Carrier */}
      <div>
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-40 mb-2">
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
    return <p className="text-xs text-ink-40">Sin datos en el período.</p>;
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
            className="rounded-md border border-hairline bg-white px-2.5 py-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink truncate">
                {b.bucket || "Sin asignar"}
              </span>
              <div className="flex items-center gap-3 text-[11px] tabular-nums flex-shrink-0">
                <span className="text-ink-40">
                  {b.orders.toLocaleString("es-AR")} ·{" "}
                  <span className="text-ink-40">{pct.toFixed(0)}%</span>
                </span>
                {b.shippingGap !== 0 && (
                  <span
                    className={
                      gapPositive ? "text-rose-600" : "text-accent"
                    }
                  >
                    {gapPositive ? "−" : "+"}
                    {formatARS(Math.abs(b.shippingGap))}
                  </span>
                )}
              </div>
            </div>
            <div className="mt-1 h-1 rounded-full bg-surface-2 overflow-hidden">
              <div
                className="h-full bg-ink rounded-full transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
