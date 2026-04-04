"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

// ══════════════════════════════════════════════════════════════
// Influencer Management — CRUD + Tracking Links
// ══════════════════════════════════════════════════════════════

const fmtARS = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);

interface Influencer {
  id: string;
  code: string;
  name: string;
  email: string | null;
  commissionPercent: number;
  status: string;
  publicName: string | null;
  isPublicDashboardEnabled: boolean;
  totalRevenue: number;
  totalCommission: number;
  totalConversions: number;
  createdAt: string;
}

export default function InfluencerManagePage() {
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formCommission, setFormCommission] = useState("10");
  const [formPublicName, setFormPublicName] = useState("");

  const loadInfluencers = () => {
    fetch("/api/influencers")
      .then((r) => r.json())
      .then((data) => setInfluencers(data.influencers || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadInfluencers();
  }, []);

  const resetForm = () => {
    setFormName("");
    setFormEmail("");
    setFormCommission("10");
    setFormPublicName("");
    setShowCreate(false);
    setEditId(null);
  };

  const handleCreate = async () => {
    if (!formName || !formCommission) return;
    setSaving(true);
    try {
      await fetch("/api/influencers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          email: formEmail || null,
          commissionPercent: parseFloat(formCommission),
          publicName: formPublicName || formName,
        }),
      });
      resetForm();
      loadInfluencers();
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const handleEdit = async (id: string) => {
    setSaving(true);
    try {
      await fetch(`/api/influencers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          email: formEmail || null,
          commissionPercent: parseFloat(formCommission),
          publicName: formPublicName || formName,
        }),
      });
      resetForm();
      loadInfluencers();
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const handleToggleStatus = async (inf: Influencer) => {
    const newStatus = inf.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    await fetch(`/api/influencers/${inf.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    loadInfluencers();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Seguro que queres desactivar este influencer?")) return;
    await fetch(`/api/influencers/${id}`, { method: "DELETE" });
    loadInfluencers();
  };

  const copyTrackingLink = async (inf: Influencer) => {
    const res = await fetch(`/api/influencers/${inf.id}/tracking-link`);
    const data = await res.json();
    await navigator.clipboard.writeText(data.trackingLink);
    setCopied(inf.id);
    setTimeout(() => setCopied(null), 2000);
  };

  const startEdit = (inf: Influencer) => {
    setEditId(inf.id);
    setFormName(inf.name);
    setFormEmail(inf.email || "");
    setFormCommission(String(inf.commissionPercent));
    setFormPublicName(inf.publicName || inf.name);
    setShowCreate(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
          <p className="text-gray-500 font-mono text-sm">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestionar Influencers</h1>
          <p className="text-sm text-gray-500 mt-1">
            Crea influencers, configura comisiones y genera links de tracking
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowCreate(true); }}
          className="px-4 py-2 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 transition-colors"
        >
          + Nuevo Influencer
        </button>
      </div>

      {/* Create / Edit Form */}
      {(showCreate || editId) && (
        <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-6">
          <h3 className="font-semibold text-gray-900 mb-4">
            {editId ? "Editar Influencer" : "Nuevo Influencer"}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nombre *</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                placeholder="Nombre del influencer"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
              <input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                placeholder="email@ejemplo.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Comision % *</label>
              <input
                type="number"
                value={formCommission}
                onChange={(e) => setFormCommission(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                placeholder="10"
                min="0"
                max="100"
                step="0.5"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nombre publico (dashboard)</label>
              <input
                type="text"
                value={formPublicName}
                onChange={(e) => setFormPublicName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                placeholder="@nombreinstagram"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => editId ? handleEdit(editId) : handleCreate()}
              disabled={saving || !formName || !formCommission}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors disabled:opacity-50"
            >
              {saving ? "Guardando..." : editId ? "Guardar Cambios" : "Crear Influencer"}
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 text-gray-500 hover:text-gray-700 text-sm"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Influencer Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-6 py-3 font-medium text-gray-500">Influencer</th>
                <th className="px-6 py-3 font-medium text-gray-500">Codigo</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-right">Comision %</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-right">Revenue</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-right">Comision $</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-right">Ventas</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-center">Estado</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {influencers.map((inf) => (
                <tr key={inf.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <Link href={`/influencers/${inf.id}`} className="group">
                      <p className="font-medium text-gray-900 group-hover:text-orange-600 transition-colors">
                        {inf.name}
                      </p>
                      {inf.email && <p className="text-xs text-gray-400">{inf.email}</p>}
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono">
                      inf_{inf.code}
                    </code>
                  </td>
                  <td className="px-6 py-4 text-right">{Number(inf.commissionPercent)}%</td>
                  <td className="px-6 py-4 text-right font-medium">
                    {fmtARS(Number(inf.totalRevenue))}
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-orange-600">
                    {fmtARS(Number(inf.totalCommission))}
                  </td>
                  <td className="px-6 py-4 text-right">{inf.totalConversions}</td>
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={() => handleToggleStatus(inf)}
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                        inf.status === "ACTIVE"
                          ? "bg-green-50 text-green-700 hover:bg-green-100"
                          : inf.status === "PAUSED"
                          ? "bg-yellow-50 text-yellow-700 hover:bg-yellow-100"
                          : "bg-gray-50 text-gray-500"
                      }`}
                    >
                      {inf.status === "ACTIVE" ? "Activo" : inf.status === "PAUSED" ? "Pausado" : "Inactivo"}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => copyTrackingLink(inf)}
                        className="text-xs text-orange-600 hover:text-orange-700 font-medium"
                        title="Copiar link de tracking"
                      >
                        {copied === inf.id ? "Copiado!" : "Link"}
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        onClick={() => startEdit(inf)}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Editar
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        onClick={() => handleDelete(inf.id)}
                        className="text-xs text-red-400 hover:text-red-600"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {influencers.length === 0 && (
          <div className="p-12 text-center text-gray-400">
            No hay influencers aun. Crea el primero!
          </div>
        )}
      </div>
    </div>
  );
}
