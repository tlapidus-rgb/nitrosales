"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

// ══════════════════════════════════════════════════════════════
// Influencer Campaigns Management
// ══════════════════════════════════════════════════════════════

const fmtARS = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });

interface Influencer {
  id: string;
  name: string;
  code: string;
  status: string;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string | null;
  description: string | null;
  influencerId: string;
  totalRevenue: number;
  totalCommission: number;
  _count: { attributions: number };
}

export default function InfluencerCampaignsPage() {
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [campaigns, setCampaigns] = useState<Record<string, Campaign[]>>({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Form
  const [selInfluencer, setSelInfluencer] = useState("");
  const [formName, setFormName] = useState("");
  const [formStart, setFormStart] = useState(new Date().toISOString().slice(0, 10));
  const [formEnd, setFormEnd] = useState("");
  const [formDesc, setFormDesc] = useState("");

  useEffect(() => {
    fetch("/api/influencers")
      .then((r) => r.json())
      .then(async (data) => {
        const infs = (data.influencers || []).filter((i: Influencer) => i.status !== "INACTIVE");
        setInfluencers(infs);
        // Load campaigns per influencer
        const allCampaigns: Record<string, Campaign[]> = {};
        await Promise.all(
          infs.map(async (inf: Influencer) => {
            const res = await fetch(`/api/influencers/${inf.id}/campaigns`);
            const d = await res.json();
            allCampaigns[inf.id] = d.campaigns || [];
          })
        );
        setCampaigns(allCampaigns);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    if (!selInfluencer || !formName || !formStart) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/influencers/${selInfluencer}/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          startDate: formStart,
          endDate: formEnd || null,
          description: formDesc || null,
        }),
      });
      const data = await res.json();
      // Reload campaigns for this influencer
      const campRes = await fetch(`/api/influencers/${selInfluencer}/campaigns`);
      const campData = await campRes.json();
      setCampaigns((prev) => ({ ...prev, [selInfluencer]: campData.campaigns || [] }));
      // Copy tracking link
      if (data.trackingLink) {
        await navigator.clipboard.writeText(data.trackingLink);
        setCopied("new");
        setTimeout(() => setCopied(null), 3000);
      }
      setShowCreate(false);
      setFormName("");
      setFormDesc("");
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const allCampaigns = Object.entries(campaigns).flatMap(([infId, camps]) =>
    camps.map((c) => ({ ...c, influencer: influencers.find((i) => i.id === infId) }))
  );
  allCampaigns.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
          <p className="text-gray-500 font-mono text-sm">Cargando campañas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campañas de Influencers</h1>
          <p className="text-sm text-gray-500 mt-1">Cada campaña genera un link de tracking unico</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 transition-colors"
        >
          + Nueva Campaña
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Nueva Campaña</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Influencer *</label>
              <select
                value={selInfluencer}
                onChange={(e) => setSelInfluencer(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              >
                <option value="">Seleccionar...</option>
                {influencers.map((inf) => (
                  <option key={inf.id} value={inf.id}>{inf.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nombre de campaña *</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                placeholder="Ej: Dia del Niño 2026"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Fecha inicio *</label>
              <input
                type="date"
                value={formStart}
                onChange={(e) => setFormStart(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Fecha fin</label>
              <input
                type="date"
                value={formEnd}
                onChange={(e) => setFormEnd(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Descripcion</label>
              <input
                type="text"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                placeholder="Descripcion opcional de la campaña"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleCreate}
              disabled={saving || !selInfluencer || !formName}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors disabled:opacity-50"
            >
              {saving ? "Creando..." : "Crear Campaña"}
            </button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-gray-500 text-sm">
              Cancelar
            </button>
            {copied === "new" && (
              <span className="text-xs text-green-600 self-center">Link de tracking copiado!</span>
            )}
          </div>
        </div>
      )}

      {/* Campaigns Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-6 py-3 font-medium text-gray-500">Campaña</th>
                <th className="px-6 py-3 font-medium text-gray-500">Influencer</th>
                <th className="px-6 py-3 font-medium text-gray-500">Periodo</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-right">Revenue</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-right">Ventas</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {allCampaigns.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-900">{c.name}</p>
                    {c.description && <p className="text-xs text-gray-400 mt-0.5">{c.description}</p>}
                  </td>
                  <td className="px-6 py-4">
                    {c.influencer ? (
                      <Link
                        href={`/influencers/${c.influencer.id}`}
                        className="text-orange-600 hover:text-orange-700 font-medium"
                      >
                        {c.influencer.name}
                      </Link>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {fmtDate(c.startDate)}
                    {c.endDate && ` → ${fmtDate(c.endDate)}`}
                  </td>
                  <td className="px-6 py-4 text-right font-medium">
                    {fmtARS(Number(c.totalRevenue || 0))}
                  </td>
                  <td className="px-6 py-4 text-right">{c._count?.attributions || 0}</td>
                  <td className="px-6 py-4 text-center">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        c.status === "ACTIVE"
                          ? "bg-green-50 text-green-700"
                          : c.status === "COMPLETED"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-gray-50 text-gray-500"
                      }`}
                    >
                      {c.status === "ACTIVE" ? "Activa" : c.status === "COMPLETED" ? "Completada" : "Pausada"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {allCampaigns.length === 0 && (
          <div className="p-12 text-center text-gray-400">
            No hay campañas aun. Crea la primera!
          </div>
        )}
      </div>
    </div>
  );
}
