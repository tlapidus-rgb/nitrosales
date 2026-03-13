// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { formatARS, formatCompact } from "@/lib/utils/format";
import NitroInsightsPanel from "@/components/NitroInsightsPanel";

interface Campaign {
  id: string;
  name: string;
  platform: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  conversions: number;
  conversionValue: number;
  roas: number;
}

type PlatformFilter = "ALL" | "GOOGLE" | "META";

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<string>("spend");
  const [sortAsc, setSortAsc] = useState(false);
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("ALL");

  useEffect(() => {
    fetch("/api/metrics/campaigns")
      .then((r) => r.json())
      .then((data) => {
        if (data.campaigns) setCampaigns(data.campaigns);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filteredCampaigns =
    platformFilter === "ALL"
      ? campaigns
      : campaigns.filter((c) => c.platform === platformFilter);

  const sortedCampaigns = [...filteredCampaigns].sort((a, b) => {
    const aVal = (a as any)[sortField] || 0;
    const bVal = (b as any)[sortField] || 0;
    return sortAsc ? aVal - bVal : bVal - aVal;
  });

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

  if (loading)
    return <p className="text-gray-400 p-8">Cargando campanas...</p>;

  const totalSpend = filteredCampaigns.reduce((s, c) => s + c.spend, 0);
  const totalConversions = filteredCampaigns.reduce(
    (s, c) => s + c.conversions,
    0
  );
  const totalRevenue = filteredCampaigns.reduce(
    (s, c) => s + c.conversionValue,
    0
  );
  const totalImpressions = filteredCampaigns.reduce(
    (s, c) => s + c.impressions,
    0
  );
  const totalClicks = filteredCampaigns.reduce((s, c) => s + c.clicks, 0);

  const googleCount = campaigns.filter((c) => c.platform === "GOOGLE").length;
  const metaCount = campaigns.filter((c) => c.platform === "META").length;

  return (
    <div className="light-canvas min-h-screen">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Campanas</h2>
          <p className="text-gray-500">
            Performance por campana &middot; Ultimos 30 dias
          </p>
        </div>

        {/* Platform filter */}
        <div className="flex items-center bg-white rounded-lg border shadow-sm p-1 gap-1">
          {[
            {
              key: "ALL" as PlatformFilter,
              label: "Ambas",
              count: campaigns.length,
            },
            {
              key: "GOOGLE" as PlatformFilter,
              label: "Google",
              count: googleCount,
            },
            {
              key: "META" as PlatformFilter,
              label: "Meta",
              count: metaCount,
            },
          ].map((opt) => (
            <button
              key={opt.key}
              onClick={() => setPlatformFilter(opt.key)}
              className={
                "px-3 py-1.5 rounded-md text-sm font-medium transition-all " +
                (platformFilter === opt.key
                  ? opt.key === "GOOGLE"
                    ? "bg-blue-600 text-gray-900 shadow-sm"
                    : opt.key === "META"
                    ? "bg-purple-600 text-gray-900 shadow-sm"
                    : "bg-indigo-600 text-gray-900 shadow-sm"
                  : "text-gray-600 hover:bg-gray-100")
              }
            >
              {opt.key === "GOOGLE" && (
                <span className="mr-1">
                  <svg
                    className="inline w-3.5 h-3.5 -mt-0.5"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                </span>
              )}
              {opt.key === "META" && (
                <span className="mr-1">
                  <svg
                    className="inline w-3.5 h-3.5 -mt-0.5"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z" />
                  </svg>
                </span>
              )}
              {opt.label}
              <span className="ml-1 text-xs opacity-70">({opt.count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-4 border">
          <p className="text-xs text-gray-500 uppercase">Campanas</p>
          <p className="text-xl font-bold text-gray-800 mt-1">
            {filteredCampaigns.length}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 border">
          <p className="text-xs text-gray-500 uppercase">Inversion total</p>
          <p className="text-xl font-bold text-gray-800 mt-1">
            {formatARS(totalSpend)}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 border">
          <p className="text-xs text-gray-500 uppercase">Conversiones</p>
          <p className="text-xl font-bold text-gray-800 mt-1">
            {totalConversions.toLocaleString("es-AR")}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 border">
          <p className="text-xs text-gray-500 uppercase">ROAS global</p>
          <p className="text-xl font-bold text-gray-800 mt-1">
            {totalSpend > 0 ? (totalRevenue / totalSpend).toFixed(1) : 0}x
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 border">
          <p className="text-xs text-gray-500 uppercase">CTR promedio</p>
          <p className="text-xl font-bold text-gray-800 mt-1">
            {totalImpressions > 0
              ? ((totalClicks / totalImpressions) * 100).toFixed(2)
              : 0}
            %
          </p>
        </div>
      </div>

      {sortedCampaigns.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
          <p className="text-gray-400">
            {platformFilter === "ALL"
              ? "No hay campanas activas."
              : "No hay campanas de " +
                (platformFilter === "GOOGLE" ? "Google" : "Meta") +
                " activas."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                    Campana
                  </th>
                  {platformFilter === "ALL" && (
                    <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase">
                      Plataforma
                    </th>
                  )}
                  <th
                    className="px-3 py-3 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                    onClick={() => handleSort("spend")}
                  >
                    Gasto
                    <SortIcon field="spend" />
                  </th>
                  <th
                    className="px-3 py-3 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                    onClick={() => handleSort("impressions")}
                  >
                    Impr.
                    <SortIcon field="impressions" />
                  </th>
                  <th
                    className="px-3 py-3 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                    onClick={() => handleSort("clicks")}
                  >
                    Clicks
                    <SortIcon field="clicks" />
                  </th>
                  <th
                    className="px-3 py-3 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                    onClick={() => handleSort("ctr")}
                  >
                    CTR
                    <SortIcon field="ctr" />
                  </th>
                  <th
                    className="px-3 py-3 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                    onClick={() => handleSort("cpc")}
                  >
                    CPC
                    <SortIcon field="cpc" />
                  </th>
                  <th
                    className="px-3 py-3 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                    onClick={() => handleSort("conversions")}
                  >
                    Conv.
                    <SortIcon field="conversions" />
                  </th>
                  <th
                    className="px-3 py-3 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                    onClick={() => handleSort("roas")}
                  >
                    ROAS
                    <SortIcon field="roas" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedCampaigns.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800 truncate max-w-[200px]">
                        {c.name}
                      </div>
                    </td>
                    {platformFilter === "ALL" && (
                      <td className="px-3 py-3">
                        <span
                          className={
                            "text-xs px-2 py-0.5 rounded-full font-medium " +
                            (c.platform === "GOOGLE"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-purple-100 text-purple-700")
                          }
                        >
                          {c.platform === "GOOGLE" ? "Google" : "Meta"}
                        </span>
                      </td>
                    )}
                    <td className="px-3 py-3 text-gray-700">
                      {formatARS(c.spend)}
                    </td>
                    <td className="px-3 py-3 text-gray-700">
                      {formatCompact(c.impressions)}
                    </td>
                    <td className="px-3 py-3 text-gray-700">
                      {formatCompact(c.clicks)}
                    </td>
                    <td className="px-3 py-3 text-gray-700">{c.ctr}%</td>
                    <td className="px-3 py-3 text-gray-700">
                      {formatARS(c.cpc)}
                    </td>
                    <td className="px-3 py-3 text-gray-700">
                      {c.conversions}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={
                          "font-medium " +
                          (c.roas >= 3
                            ? "text-green-600"
                            : c.roas >= 1
                            ? "text-yellow-600"
                            : "text-red-500")
                        }
                      >
                        {c.roas}x
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <NitroInsightsPanel section="campaigns" />
    </div>
  );
}
