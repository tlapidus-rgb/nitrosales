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

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<string>("spend");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    fetch("/api/metrics/campaigns")
      .then((r) => r.json())
      .then((data) => {
        if (data.campaigns) setCampaigns(data.campaigns);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const sortedCampaigns = [...campaigns].sort((a, b) => {
    const aVal = (a as any)[sortField] || 0;
    const bVal = (b as any)[sortField] || 0;
    return sortAsc ? aVal - bVal : bVal - aVal;
  });

  function handleSort(field: string) {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  }

  function SortIcon({ field }: { field: string }) {
    if (sortField !== field) return null;
    return <span>{sortAsc ? " \u25B2" : " \u25BC"}</span>;
  }

  if (loading) return <p className="text-gray-400 p-8">Cargando campanas...</p>;

  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
  const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);
  const totalRevenue = campaigns.reduce((s, c) => s + c.conversionValue, 0);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Campanas</h2>
        <p className="text-gray-500">Performance por campana &middot; Ultimos 30 dias</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-4 border">
          <p className="text-xs text-gray-500 uppercase">Campanas</p>
          <p className="text-xl font-bold text-gray-800 mt-1">{campaigns.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 border">
          <p className="text-xs text-gray-500 uppercase">Inversion total</p>
          <p className="text-xl font-bold text-gray-800 mt-1">{formatARS(totalSpend)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 border">
          <p className="text-xs text-gray-500 uppercase">Conversiones</p>
          <p className="text-xl font-bold text-gray-800 mt-1">{totalConversions.toLocaleString("es-AR")}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 border">
          <p className="text-xs text-gray-500 uppercase">ROAS global</p>
          <p className="text-xl font-bold text-gray-800 mt-1">{totalSpend > 0 ? (totalRevenue / totalSpend).toFixed(1) : 0}x</p>
        </div>
      </div>

      {sortedCampaigns.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
          <p className="text-gray-400">No hay campanas activas.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Campana</th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase">Plataforma</th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700" onClick={() => handleSort("spend")}>Gasto<SortIcon field="spend" /></th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700" onClick={() => handleSort("impressions")}>Impr.<SortIcon field="impressions" /></th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700" onClick={() => handleSort("clicks")}>Clicks<SortIcon field="clicks" /></th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700" onClick={() => handleSort("ctr")}>CTR<SortIcon field="ctr" /></th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700" onClick={() => handleSort("cpc")}>CPC<SortIcon field="cpc" /></th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700" onClick={() => handleSort("conversions")}>Conv.<SortIcon field="conversions" /></th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700" onClick={() => handleSort("roas")}>ROAS<SortIcon field="roas" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedCampaigns.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800 truncate max-w-[200px]">{c.name}</div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.platform === "GOOGLE" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                        {c.platform === "GOOGLE" ? "Google" : "Meta"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-gray-700">{formatARS(c.spend)}</td>
                    <td className="px-3 py-3 text-gray-700">{formatCompact(c.impressions)}</td>
                    <td className="px-3 py-3 text-gray-700">{formatCompact(c.clicks)}</td>
                    <td className="px-3 py-3 text-gray-700">{c.ctr}%</td>
                    <td className="px-3 py-3 text-gray-700">{formatARS(c.cpc)}</td>
                    <td className="px-3 py-3 text-gray-700">{c.conversions}</td>
                    <td className="px-3 py-3">
                      <span className={`font-medium ${c.roas >= 3 ? "text-green-600" : c.roas >= 1 ? "text-yellow-600" : "text-red-500"}`}>
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