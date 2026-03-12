// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { formatARS, formatCompact } from "@/lib/utils/format";
import NitroInsightsPanel from "@/components/NitroInsightsPanel";

interface ProductItem {
  id: string;
  name: string;
  sku: string | null;
  imageUrl: string | null;
  category: string | null;
  unitsSold: number;
  revenue: number;
  orders: number;
  avgPrice: number;
}

interface ProductSummary {
  estimatedTotalUnits: number;
  estimatedTotalRevenue: number;
  totalOrders: number;
  detailedUnits: number;
  detailedRevenue: number;
  uniqueProducts: number;
  paretoConcentration: number;
  ordersWithItems: number;
  processedPct: number;
  isComplete: boolean;
}

export default function ProductsPage() {
  const [topProducts, setTopProducts] = useState<ProductItem[]>([]);
  const [summary, setSummary] = useState<ProductSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/metrics/products")
      .then((r) => r.json())
      .then((data) => {
        if (data.topProducts) setTopProducts(data.topProducts);
        if (data.summary) setSummary(data.summary);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-400 p-8">Cargando productos...</p>;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Productos</h2>
        <p className="text-gray-500">Top productos por facturacion &middot; Ultimos 30 dias</p>
      </div>

      {topProducts.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
          <p className="text-gray-400">No hay datos de productos aun.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="p-6 border-b">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-700">Top Productos por Facturacion</h3>
                <p className="text-xs text-gray-400 mt-1">
                  {summary?.uniqueProducts || 0} productos unicos
                </p>
              </div>
              {summary && (
                <div className="flex gap-4">
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Unidades vendidas</p>
                    <p className="text-sm font-bold text-gray-700">
                      {summary.estimatedTotalUnits.toLocaleString("es-AR")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Facturacion</p>
                    <p className="text-sm font-bold text-gray-700">
                      {formatARS(summary.estimatedTotalRevenue)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Pareto</p>
                    <p className="text-sm font-bold text-indigo-600">
                      Top 20% = {summary.paretoConcentration}% revenue
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {summary && !summary.isComplete && (
            <div className="px-6 py-3 bg-amber-50 border-b border-amber-100">
              <div className="flex items-center justify-between text-sm">
                <span className="text-amber-700">
                  Importando detalles de productos: {summary.ordersWithItems.toLocaleString("es-AR")} de{" "}
                  {summary.totalOrders.toLocaleString("es-AR")} ordenes procesadas ({summary.processedPct}%)
                </span>
              </div>
              <div className="w-full bg-amber-200 rounded-full h-1.5 mt-2">
                <div
                  className="bg-amber-500 h-1.5 rounded-full transition-all"
                  style={{ width: summary.processedPct + "%" }}
                />
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase w-10">#</th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase">Producto</th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase text-right">Unidades</th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase text-right">Pedidos</th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase text-right">Precio Prom.</th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase text-right">Facturacion</th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase text-right">% del Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {topProducts.map((p, idx) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        {p.imageUrl && (
                          <img
                            src={p.imageUrl}
                            alt={p.name}
                            className="w-10 h-10 rounded-lg object-cover border"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                        )}
                        <div>
                          <div className="font-medium text-gray-800 truncate max-w-[250px]">{p.name}</div>
                          {p.sku && <div className="text-xs text-gray-400">SKU: {p.sku}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-gray-700 text-right">{p.unitsSold.toLocaleString("es-AR")}</td>
                    <td className="px-3 py-3 text-gray-700 text-right">{p.orders.toLocaleString("es-AR")}</td>
                    <td className="px-3 py-3 text-gray-700 text-right">{formatARS(p.avgPrice)}</td>
                    <td className="px-3 py-3 font-medium text-gray-800 text-right">{formatARS(p.revenue)}</td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 bg-gray-100 rounded-full h-1.5">
                          <div
                            className="bg-indigo-500 h-1.5 rounded-full"
                            style={{
                              width: Math.min(100, Math.round((p.revenue / (summary?.estimatedTotalRevenue || 1)) * 100)) + "%",
                            }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-8">
                          {Math.round((p.revenue / (summary?.estimatedTotalRevenue || 1)) * 100)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    
      <NitroInsightsPanel section="products" />
    </div>
  );
}