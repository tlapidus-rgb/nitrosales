// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { formatARS, formatCompact } from "@/lib/utils/format";
import NitroInsightsPanel from "@/components/NitroInsightsPanel";

interface Customer {
  id: string;
  name: string;
  email: string;
  city: string;
  state: string;
  totalOrders: number;
  totalSpent: number;
  avgTicket: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
}

interface CustomerData {
  summary: {
    totalCustomers: number;
    identifiedCustomers: number;
    identifiedWithCity: number;
    repeatCustomers: number;
    repeatRate: number;
    totalRevenue: number;
    totalOrders: number;
    avgOrdersPerCustomer: number;
    avgSpentPerCustomer: number;
    paretoConcentration: number;
    newCustomers30d: number;
    activeCustomers30d: number;
  };
  frequency: {
    oneOrder: number;
    twoToThree: number;
    fourToSix: number;
    sevenPlus: number;
  };
  tiers: {
    vip: number;
    high: number;
    medium: number;
    low: number;
  };
  topCities: { city: string; count: number }[];
  topCustomers: Customer[];
}

export default function CustomersPage() {
  const [data, setData] = useState<CustomerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<string>("totalSpent");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    fetch("/api/metrics/customers")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleSort(field: string) {
    if (sortField === field) setSortAsc(!sortAsc);
    else {
      setSortField(field);
      setSortAsc(false);
    }
  }

  function SortIcon({ field }: { field: string }) {
    if (sortField !== field) return null;
    return <span>{sortAsc ? " \u25B2" : " \u25BC"}</span>;
  }

  function formatDate(d: string | null) {
    if (!d) return "-";
    return new Date(d).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
    });
  }

  if (loading)
    return <p className="text-gray-400 p-8">Cargando clientes...</p>;
  if (!data || !data.summary)
    return (
      <div className="p-8 text-center text-gray-500">
        No hay datos de clientes disponibles.
      </div>
    );

  const s = data.summary;

  const sortedCustomers = [...(data.topCustomers || [])].sort((a, b) => {
    const aVal = (a as any)[sortField] || 0;
    const bVal = (b as any)[sortField] || 0;
    if (typeof aVal === "string")
      return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    return sortAsc ? aVal - bVal : bVal - aVal;
  });

  const maxFreq = Math.max(
    data.frequency.oneOrder,
    data.frequency.twoToThree,
    data.frequency.fourToSix,
    data.frequency.sevenPlus,
    1
  );

  return (
    <div className="light-canvas min-h-screen">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Clientes</h2>
        <p className="text-gray-500">
          Basado en {s.totalOrders.toLocaleString("es-AR")} pedidos facturados
          &middot; Revenue {formatARS(s.totalRevenue)}
        </p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-4 border">
          <p className="text-xs text-gray-500 uppercase">
            Clientes unicos
          </p>
          <p className="text-xl font-bold text-gray-800 mt-1">
            {s.totalCustomers.toLocaleString("es-AR")}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {s.identifiedCustomers.toLocaleString("es-AR")} identificados
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 border">
          <p className="text-xs text-gray-500 uppercase">Tasa recompra</p>
          <p className="text-xl font-bold text-gray-800 mt-1">
            {s.repeatRate}%
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {s.repeatCustomers.toLocaleString("es-AR")} repiten
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 border">
          <p className="text-xs text-gray-500 uppercase">Ticket promedio</p>
          <p className="text-xl font-bold text-gray-800 mt-1">
            {formatARS(s.avgSpentPerCustomer)}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {s.avgOrdersPerCustomer} pedidos/cliente
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 border">
          <p className="text-xs text-gray-500 uppercase">Pareto 20/80</p>
          <p className="text-xl font-bold text-gray-800 mt-1">
            {s.paretoConcentration}%
          </p>
          <p className="text-xs text-gray-400 mt-1">
            top 20% = {s.paretoConcentration}% revenue
          </p>
        </div>
      </div>

      {/* Second row: frequency + tiers + cities */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Frequency distribution */}
        <div className="bg-white rounded-xl shadow-sm p-5 border">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Frecuencia de compra
          </h3>
          <div className="space-y-3">
            {[
              { label: "1 orden", value: data.frequency.oneOrder },
              { label: "2-3 ordenes", value: data.frequency.twoToThree },
              { label: "4-6 ordenes", value: data.frequency.fourToSix },
              { label: "7+ ordenes", value: data.frequency.sevenPlus },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>{item.label}</span>
                  <span className="font-medium">{item.value}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className="bg-indigo-500 h-2 rounded-full transition-all"
                    style={{
                      width:
                        Math.max(2, (item.value / maxFreq) * 100) + "%",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Spending tiers */}
        <div className="bg-white rounded-xl shadow-sm p-5 border">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Segmentos por gasto
          </h3>
          <div className="space-y-3">
            {[
              {
                label: "VIP ($200k+)",
                value: data.tiers.vip,
                color: "bg-purple-500",
              },
              {
                label: "Alto ($50k-200k)",
                value: data.tiers.high,
                color: "bg-indigo-500",
              },
              {
                label: "Medio ($10k-50k)",
                value: data.tiers.medium,
                color: "bg-blue-400",
              },
              {
                label: "Bajo (<$10k)",
                value: data.tiers.low,
                color: "bg-gray-400",
              },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <div className={"w-3 h-3 rounded-full " + item.color} />
                <span className="text-xs text-gray-600 flex-1">
                  {item.label}
                </span>
                <span className="text-sm font-semibold text-gray-800">
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top cities */}
        <div className="bg-white rounded-xl shadow-sm p-5 border">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Top ciudades
          </h3>
          <div className="space-y-2">
            {data.topCities.length > 0 ? (
              data.topCities.slice(0, 6).map((c, i) => (
                <div
                  key={c.city}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-gray-600">
                    <span className="text-gray-400 mr-1">{i + 1}.</span>
                    {c.city}
                  </span>
                  <span className="font-medium text-gray-800">
                    {c.count}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-gray-400">
                Datos de ciudad no disponibles
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Top customers table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden mb-6">
        <div className="px-5 py-4 border-b">
          <h3 className="text-sm font-semibold text-gray-700">
            Top 20 clientes por facturacion
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                  Cliente
                </th>
                <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase">
                  Ciudad
                </th>
                <th
                  className="px-3 py-3 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                  onClick={() => handleSort("totalOrders")}
                >
                  Pedidos
                  <SortIcon field="totalOrders" />
                </th>
                <th
                  className="px-3 py-3 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                  onClick={() => handleSort("totalSpent")}
                >
                  Total gastado <SortIcon field="totalSpent" />
                </th>
                <th
                  className="px-3 py-3 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                  onClick={() => handleSort("avgTicket")}
                >
                  Ticket prom. <SortIcon field="avgTicket" />
                </th>
                <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase">
                  Primera compra
                </th>
                <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase">
                  Ultima compra
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedCustomers.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{c.name}</div>
                    {c.email !== "-" && (
                      <div className="text-xs text-gray-400">{c.email}</div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-gray-600 text-xs">
                    {c.city}
                    {c.state !== "-" ? ", " + c.state : ""}
                  </td>
                  <td className="px-3 py-3 text-gray-700">
                    {c.totalOrders}
                  </td>
                  <td className="px-3 py-3 font-medium text-gray-800">
                    {formatARS(c.totalSpent)}
                  </td>
                  <td className="px-3 py-3 text-gray-700">
                    {formatARS(c.avgTicket)}
                  </td>
                  <td className="px-3 py-3 text-gray-500 text-xs">
                    {formatDate(c.firstOrderAt)}
                  </td>
                  <td className="px-3 py-3 text-gray-500 text-xs">
                    {formatDate(c.lastOrderAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <NitroInsightsPanel section="customers" />
    </div>
  );
}
