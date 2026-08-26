"use client";

import { useState, useEffect } from "react";

// ══════════════════════════════════════════════════════════════
// Product Seeding — Track products sent to influencers
// ══════════════════════════════════════════════════════════════

const STATUS_FLOW = [
  { value: "PENDING", label: "Pendiente", color: "bg-yellow-50 text-yellow-700" },
  { value: "SHIPPED", label: "Enviado", color: "bg-surface-2 text-ink-60" },
  { value: "DELIVERED", label: "Entregado", color: "bg-green-50 text-green-700" },
  { value: "CONTENT_RECEIVED", label: "Contenido recibido", color: "bg-surface-2 text-ink-60" },
];

interface Influencer { id: string; name: string; code: string; }
interface Product { id: string; name: string; imageUrl: string | null; price: number | null; }
interface Seeding {
  id: string;
  status: string;
  trackingNumber: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  notes: string | null;
  estimatedValue: number | null;
  createdAt: string;
  influencer: { id: string; name: string; code: string };
  product: { id: string; name: string; imageUrl: string | null; price: number | null } | null;
  briefing: { id: string; title: string } | null;
}

interface Stats { status: string; _count: { id: number }; _sum: { estimatedValue: number | null } }

const fmtARS = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);

export default function SeedingPage() {
  const [seedings, setSeedings] = useState<Seeding[]>([]);
  const [stats, setStats] = useState<Stats[]>([]);
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    influencerId: "", productId: "", estimatedValue: "", notes: "", trackingNumber: "",
  });

  const fetchData = () => {
    Promise.all([
      fetch("/api/influencers/seeding").then((r) => r.json()),
      fetch("/api/influencers").then((r) => r.json()),
    ]).then(([sData, iData]) => {
      setSeedings(sData.seedings || []);
      setStats(sData.stats || []);
      const inf = iData.influencers || iData || [];
      setInfluencers(inf.map((i: any) => ({ id: i.id, name: i.name, code: i.code })));
    }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async () => {
    if (!form.influencerId) return;
    setSaving(true);
    try {
      await fetch("/api/influencers/seeding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          influencerId: form.influencerId,
          productId: form.productId || null,
          estimatedValue: form.estimatedValue ? parseFloat(form.estimatedValue) : null,
          notes: form.notes || null,
          trackingNumber: form.trackingNumber || null,
          status: form.trackingNumber ? "SHIPPED" : "PENDING",
        }),
      });
      setShowForm(false);
      setForm({ influencerId: "", productId: "", estimatedValue: "", notes: "", trackingNumber: "" });
      fetchData();
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    await fetch("/api/influencers/seeding", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    fetchData();
  };

  const totalValue = stats.reduce((acc, s) => acc + (Number(s._sum.estimatedValue) || 0), 0);
  const totalCount = stats.reduce((acc, s) => acc + s._count.id, 0);

  const inputStyle = { color: "var(--ent-ink)", backgroundColor: "var(--ent-elevated)" };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-ink-40 animate-pulse" />
          <p className="text-ink-40 font-mono text-sm">Cargando seedings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Product Seeding</h1>
          <p className="text-sm text-ink-40 mt-1">Productos enviados a influencers para crear contenido</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-ink text-white rounded-xl text-sm font-medium hover:bg-ink/90 transition-colors"
        >
          {showForm ? "Cancelar" : "+ Nuevo envio"}
        </button>
      </div>

      {/* Stats */}
      {totalCount > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {STATUS_FLOW.map((sf) => {
            const stat = stats.find((s) => s.status === sf.value);
            return (
              <div key={sf.value} className="bg-elevated rounded-2xl border border-hairline p-4 shadow-sm">
                <p className="text-[10px] font-medium text-ink-40 uppercase tracking-wider">{sf.label}</p>
                <p className="text-xl font-bold text-ink mt-1">{stat?._count.id || 0}</p>
              </div>
            );
          })}
        </div>
      )}

      {totalValue > 0 && (
        <div className="bg-elevated rounded-2xl border border-hairline p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-medium text-ink-40 uppercase tracking-wider">Inversion total en seeding</p>
              <p className="text-xl font-bold text-ink mt-1">{fmtARS(totalValue)}</p>
            </div>
            <p className="text-sm text-ink-40">{totalCount} envios totales</p>
          </div>
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <div className="bg-elevated rounded-2xl border border-hairline shadow-sm p-6 space-y-4">
          <h3 className="text-sm font-semibold text-ink">Nuevo envio de producto</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink-40 mb-1">Influencer *</label>
              <select
                value={form.influencerId}
                onChange={(e) => setForm({ ...form, influencerId: e.target.value })}
                className="w-full px-3 py-2 border border-hairline rounded-xl text-sm"
                style={inputStyle}
              >
                <option value="">Seleccionar influencer</option>
                {influencers.map((i) => <option key={i.id} value={i.id}>{i.name} (@{i.code})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-40 mb-1">Valor estimado</label>
              <input
                type="number"
                value={form.estimatedValue}
                onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })}
                placeholder="Ej: 15000"
                className="w-full px-3 py-2 border border-hairline rounded-xl text-sm"
                style={inputStyle}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink-40 mb-1">Nro de seguimiento</label>
              <input
                value={form.trackingNumber}
                onChange={(e) => setForm({ ...form, trackingNumber: e.target.value })}
                placeholder="Ej: OCA-123456789"
                className="w-full px-3 py-2 border border-hairline rounded-xl text-sm"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-40 mb-1">Notas</label>
              <input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Ej: Kit especial Día del Niño"
                className="w-full px-3 py-2 border border-hairline rounded-xl text-sm"
                style={inputStyle}
              />
            </div>
          </div>
          <button
            onClick={handleCreate}
            disabled={saving || !form.influencerId}
            className="px-6 py-2 bg-ink text-white rounded-xl text-sm font-medium hover:bg-ink/90 transition-colors disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Registrar envio"}
          </button>
        </div>
      )}

      {/* Seedings List */}
      {seedings.length === 0 ? (
        <div className="bg-elevated rounded-2xl border border-hairline shadow-sm p-12 text-center">
          <p className="text-4xl mb-3">📦</p>
          <p className="text-ink font-medium">No hay envios de productos todavia</p>
          <p className="text-ink-40 text-sm mt-1">Registrá los productos que envias a tus influencers para trackear el proceso de seeding completo</p>
        </div>
      ) : (
        <div className="space-y-3">
          {seedings.map((s) => (
            <div key={s.id} className="bg-elevated rounded-2xl border border-hairline shadow-sm p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {s.product?.imageUrl ? (
                    <img src={s.product.imageUrl} alt="" className="w-12 h-12 rounded-xl object-cover border border-hairline" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-surface flex items-center justify-center text-lg">📦</div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {s.product?.name || "Producto sin especificar"}
                      <span className="text-ink-40 ml-2">→ {s.influencer.name}</span>
                    </p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {s.estimatedValue && <span className="text-xs text-ink-40">Valor: {fmtARS(Number(s.estimatedValue))}</span>}
                      {s.trackingNumber && <span className="text-xs text-ink-40 font-mono">Tracking: {s.trackingNumber}</span>}
                      {s.briefing && <span className="text-[10px] px-2 py-0.5 bg-surface-2 text-ink-60 rounded-full">Brief: {s.briefing.title}</span>}
                    </div>
                    {s.notes && <p className="text-xs text-ink-40 mt-0.5">{s.notes}</p>}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Status progression buttons */}
                  {s.status === "PENDING" && (
                    <button onClick={() => updateStatus(s.id, "SHIPPED")} className="px-3 py-1.5 bg-ink text-white rounded-lg text-xs font-medium hover:bg-ink/90">
                      Marcar enviado
                    </button>
                  )}
                  {s.status === "SHIPPED" && (
                    <button onClick={() => updateStatus(s.id, "DELIVERED")} className="px-3 py-1.5 bg-ink text-white rounded-lg text-xs font-medium hover:bg-ink/90">
                      Marcar entregado
                    </button>
                  )}
                  {s.status === "DELIVERED" && (
                    <button onClick={() => updateStatus(s.id, "CONTENT_RECEIVED")} className="px-3 py-1.5 bg-ink text-white rounded-lg text-xs font-medium hover:bg-ink/90">
                      Contenido recibido
                    </button>
                  )}

                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    STATUS_FLOW.find((sf) => sf.value === s.status)?.color || "bg-surface text-ink-40"
                  }`}>{STATUS_FLOW.find((sf) => sf.value === s.status)?.label || s.status}</span>

                  <span className="text-[10px] text-ink-40">
                    {new Date(s.createdAt).toLocaleDateString("es-AR")}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
