// @ts-nocheck
"use client";

import { useEffect, useState, useCallback } from "react";
import { formatARS } from "@/lib/utils/format";

/* ── Category config ──────────────────────────── */
const CATEGORIES = [
  {
    key: "LOGISTICA",
    label: "Logistica y Envios",
    description: "Mensajerias, packaging, deposito, flete de reposicion",
    icon: "🚚",
    hasSubcategory: true,
    subcategoryLabel: "Mensajeria",
    hasServiceCode: true,
    rateTypes: ["PER_SHIPMENT", "FIXED_MONTHLY"],
  },
  {
    key: "EQUIPO",
    label: "Equipo y RRHH",
    description: "Sueldos, cargas sociales, freelancers",
    icon: "👥",
    hasSubcategory: true,
    subcategoryLabel: "Rol / Area",
    hasSocialCharges: true,
    rateTypes: ["FIXED_MONTHLY"],
  },
  {
    key: "PLATAFORMAS",
    label: "Plataformas y Herramientas",
    description: "VTEX, ERP, email marketing, SaaS",
    icon: "🔧",
    hasSubcategory: false,
    rateTypes: ["FIXED_MONTHLY", "PERCENTAGE"],
  },
  {
    key: "FISCAL",
    label: "Fiscal e Impuestos",
    description: "IIBB, percepciones, contador, monotributo",
    icon: "📋",
    hasSubcategory: false,
    rateTypes: ["FIXED_MONTHLY", "PERCENTAGE"],
  },
  {
    key: "INFRAESTRUCTURA",
    label: "Infraestructura",
    description: "Alquiler, servicios, seguros",
    icon: "🏢",
    hasSubcategory: false,
    rateTypes: ["FIXED_MONTHLY"],
  },
  {
    key: "MARKETING",
    label: "Marketing y Contenido",
    description: "Fotografia, produccion, eventos",
    icon: "📸",
    hasSubcategory: false,
    rateTypes: ["FIXED_MONTHLY"],
  },
  {
    key: "MERMA",
    label: "Merma y Perdidas",
    description: "Roturas, devoluciones no recuperables",
    icon: "📉",
    hasSubcategory: false,
    rateTypes: ["FIXED_MONTHLY", "PERCENTAGE"],
  },
  {
    key: "OTROS",
    label: "Otros",
    description: "Gastos varios",
    icon: "📦",
    hasSubcategory: false,
    rateTypes: ["FIXED_MONTHLY"],
  },
];

const RATE_TYPE_LABELS = {
  FIXED_MONTHLY: "Fijo mensual",
  PER_SHIPMENT: "Por envio",
  PERCENTAGE: "Porcentaje",
};

const RATE_BASE_OPTIONS = [
  { value: "GROSS_REVENUE", label: "Facturacion bruta total" },
  { value: "MELI_REVENUE", label: "Facturacion MercadoLibre" },
  { value: "VTEX_REVENUE", label: "Facturacion VTEX" },
  { value: "COGS", label: "Costo de mercaderia (COGS)" },
];

/* ── Main Component ──────────────────────────── */
export default function CostosPage() {
  const nowMonth = new Date().toISOString().substring(0, 7);
  const [costMonth, setCostMonth] = useState(nowMonth);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedCat, setExpandedCat] = useState(null);
  const [toast, setToast] = useState("");

  // Add form state
  const [addingTo, setAddingTo] = useState(null);
  const [form, setForm] = useState({
    subcategory: "",
    name: "",
    serviceCode: "",
    amount: "",
    rateType: "FIXED_MONTHLY",
    rateBase: "",
    socialCharges: "",
    type: "FIXED",
  });

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }

  const fetchCosts = useCallback(async (month) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/finance/manual-costs?month=${month || costMonth}`);
      const json = await res.json();
      if (json.categories) setData(json);
    } catch {}
    setLoading(false);
  }, [costMonth]);

  useEffect(() => { fetchCosts(costMonth); }, [costMonth]);

  function resetForm() {
    setForm({
      subcategory: "", name: "", serviceCode: "", amount: "",
      rateType: "FIXED_MONTHLY", rateBase: "", socialCharges: "", type: "FIXED",
    });
    setAddingTo(null);
  }

  async function addCost(categoryKey) {
    if (!form.name.trim() || !form.amount) return;
    await fetch("/api/finance/manual-costs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: categoryKey,
        subcategory: form.subcategory || null,
        name: form.name.trim(),
        serviceCode: form.serviceCode || null,
        amount: parseFloat(form.amount),
        rateType: form.rateType,
        rateBase: form.rateType === "PERCENTAGE" ? form.rateBase : null,
        socialCharges: form.socialCharges ? parseFloat(form.socialCharges) : null,
        type: form.type,
        month: costMonth,
      }),
    });
    resetForm();
    fetchCosts(costMonth);
    showToast("Costo agregado");
  }

  async function deleteCost(id) {
    await fetch(`/api/finance/manual-costs?id=${id}`, { method: "DELETE" });
    fetchCosts(costMonth);
    showToast("Costo eliminado");
  }

  async function updateField(id, field, value) {
    await fetch("/api/finance/manual-costs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, [field]: value }),
    });
    fetchCosts(costMonth);
  }

  async function copyPreviousMonth() {
    const [y, m] = costMonth.split("-").map(Number);
    const prevDate = new Date(y, m - 2, 1);
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
    const res = await fetch("/api/finance/manual-costs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ copyFrom: prevMonth, targetMonth: costMonth }),
    });
    const json = await res.json();
    if (json.copied) {
      fetchCosts(costMonth);
      showToast(`${json.copied} costos copiados de ${prevMonth}`);
    } else {
      showToast(json.error || "No se pudieron copiar costos");
    }
  }

  // Helper: compute effective cost for an item
  function effectiveCost(item) {
    const base = Number(item.amount);
    if (item.socialCharges) return base * (1 + item.socialCharges / 100);
    return base;
  }

  // Group items by subcategory for display
  function groupBySubcategory(items) {
    const groups = {};
    for (const item of items) {
      const key = item.subcategory || "_sin_grupo";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return groups;
  }

  if (loading && !data) {
    return (
      <div className="light-canvas min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <p className="text-gray-500 text-sm">Cargando costos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="light-canvas min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Costos Operativos</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Costos que no vienen del ecommerce — mensajerias, sueldos, herramientas, impuestos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={costMonth}
            onChange={e => setCostMonth(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-600 focus:border-blue-400 focus:outline-none"
          />
          <button
            onClick={copyPreviousMonth}
            className="text-sm px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors"
          >
            Copiar mes anterior
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-teal-500">
            <span className="text-xs font-medium text-gray-500 uppercase">Total Mensual</span>
            <p className="text-xl font-bold text-gray-800 mt-1">{formatARS(data.grandTotal)}</p>
            <p className="text-xs text-gray-400">{costMonth}</p>
          </div>
          {data.categories.filter(c => c.total > 0).slice(0, 3).map(c => (
            <div key={c.category} className="bg-white rounded-xl p-4 shadow-sm">
              <span className="text-xs font-medium text-gray-500 uppercase">{c.label}</span>
              <p className="text-lg font-bold text-gray-800 mt-1">{formatARS(c.total)}</p>
              <p className="text-xs text-gray-400">{c.items.length} items</p>
            </div>
          ))}
        </div>
      )}

      {/* Category sections */}
      <div className="space-y-3">
        {CATEGORIES.map(cat => {
          const catData = data?.categories?.find(c => c.category === cat.key);
          const items = catData?.items || [];
          const total = catData?.total || 0;
          const isExpanded = expandedCat === cat.key;
          const grouped = cat.hasSubcategory ? groupBySubcategory(items) : null;

          return (
            <div key={cat.key} className="bg-white rounded-xl shadow-sm overflow-hidden">
              {/* Category header */}
              <button
                onClick={() => setExpandedCat(isExpanded ? null : cat.key)}
                className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{cat.icon}</span>
                  <div className="text-left">
                    <span className="text-sm font-semibold text-gray-800">{cat.label}</span>
                    <p className="text-xs text-gray-400">{cat.description}</p>
                  </div>
                  {items.length > 0 && (
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{items.length}</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {total > 0 && (
                    <span className="text-sm font-bold font-mono text-gray-700">{formatARS(total)}</span>
                  )}
                  <span className="text-xs text-gray-400">{isExpanded ? "▲" : "▼"}</span>
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="border-t border-gray-100">
                  {/* Items table */}
                  {items.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100">
                            {cat.hasSubcategory && (
                              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">{cat.subcategoryLabel}</th>
                            )}
                            {cat.hasServiceCode && (
                              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Codigo</th>
                            )}
                            <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Nombre</th>
                            <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Tipo</th>
                            {cat.hasSocialCharges && (
                              <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Cargas %</th>
                            )}
                            <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">
                              {cat.key === "LOGISTICA" ? "Tarifa" : "Monto"}
                            </th>
                            {cat.hasSocialCharges && (
                              <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Costo total</th>
                            )}
                            <th className="w-10"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {items.map(item => (
                            <tr key={item.id} className="group hover:bg-gray-50/50">
                              {cat.hasSubcategory && (
                                <td className="px-4 py-2.5 text-gray-600">{item.subcategory || "—"}</td>
                              )}
                              {cat.hasServiceCode && (
                                <td className="px-4 py-2.5">
                                  <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
                                    {item.serviceCode || "—"}
                                  </code>
                                </td>
                              )}
                              <td className="px-4 py-2.5 text-gray-800 font-medium">{item.name}</td>
                              <td className="px-4 py-2.5">
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  item.rateType === "PER_SHIPMENT"
                                    ? "bg-blue-50 text-blue-600"
                                    : item.rateType === "PERCENTAGE"
                                    ? "bg-purple-50 text-purple-600"
                                    : "bg-gray-100 text-gray-600"
                                }`}>
                                  {RATE_TYPE_LABELS[item.rateType] || item.rateType}
                                  {item.rateType === "PERCENTAGE" && item.rateBase && (
                                    <span className="ml-1 text-gray-400">
                                      ({RATE_BASE_OPTIONS.find(o => o.value === item.rateBase)?.label || item.rateBase})
                                    </span>
                                  )}
                                </span>
                              </td>
                              {cat.hasSocialCharges && (
                                <td className="px-4 py-2.5 text-right">
                                  <input
                                    type="number"
                                    defaultValue={item.socialCharges || ""}
                                    placeholder="0"
                                    onBlur={e => {
                                      const val = e.target.value ? parseFloat(e.target.value) : null;
                                      if (val !== item.socialCharges) updateField(item.id, "socialCharges", val);
                                    }}
                                    className="w-16 text-right text-sm font-mono border border-gray-200 rounded px-1.5 py-1 focus:border-blue-400 focus:outline-none"
                                  />
                                  <span className="text-xs text-gray-400 ml-1">%</span>
                                </td>
                              )}
                              <td className="px-4 py-2.5 text-right">
                                <input
                                  type="number"
                                  defaultValue={Number(item.amount)}
                                  onBlur={e => {
                                    if (parseFloat(e.target.value) !== Number(item.amount)) {
                                      updateField(item.id, "amount", e.target.value);
                                    }
                                  }}
                                  className="w-28 text-right text-sm font-mono border border-gray-200 rounded px-2 py-1 focus:border-blue-400 focus:outline-none"
                                />
                                {item.rateType === "PERCENTAGE" && <span className="text-xs text-gray-400 ml-1">%</span>}
                              </td>
                              {cat.hasSocialCharges && (
                                <td className="px-4 py-2.5 text-right font-mono font-medium text-gray-700">
                                  {formatARS(effectiveCost(item))}
                                </td>
                              )}
                              <td className="px-4 py-2.5 text-right">
                                <button
                                  onClick={() => deleteCost(item.id)}
                                  className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                  title="Eliminar"
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Empty state */}
                  {items.length === 0 && addingTo !== cat.key && (
                    <div className="px-5 py-6 text-center text-gray-400 text-sm">
                      No hay costos cargados en {cat.label.toLowerCase()} para {costMonth}
                    </div>
                  )}

                  {/* Add form */}
                  {addingTo === cat.key ? (
                    <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/50">
                      <div className="flex flex-wrap items-end gap-3">
                        {cat.hasSubcategory && (
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">{cat.subcategoryLabel}</label>
                            <input
                              type="text"
                              placeholder={cat.key === "LOGISTICA" ? "Ej: Andreani" : "Ej: Operaciones"}
                              value={form.subcategory}
                              onChange={e => setForm({ ...form, subcategory: e.target.value })}
                              className="text-sm border border-gray-200 rounded-lg px-3 py-2 w-36 focus:border-blue-400 focus:outline-none"
                            />
                          </div>
                        )}
                        {cat.hasServiceCode && (
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">Codigo</label>
                            <input
                              type="text"
                              placeholder="AND-STD-AMBA"
                              value={form.serviceCode}
                              onChange={e => setForm({ ...form, serviceCode: e.target.value.toUpperCase() })}
                              className="text-sm border border-gray-200 rounded-lg px-3 py-2 w-36 font-mono focus:border-blue-400 focus:outline-none"
                            />
                          </div>
                        )}
                        <div className="flex-1 min-w-[150px]">
                          <label className="text-xs text-gray-500 block mb-1">Nombre</label>
                          <input
                            type="text"
                            placeholder={cat.key === "LOGISTICA" ? "Estandar AMBA" : cat.key === "EQUIPO" ? "Juan Perez" : "Nombre del costo"}
                            value={form.name}
                            onChange={e => setForm({ ...form, name: e.target.value })}
                            className="text-sm border border-gray-200 rounded-lg px-3 py-2 w-full focus:border-blue-400 focus:outline-none"
                            autoFocus
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Tipo</label>
                          <select
                            value={form.rateType}
                            onChange={e => setForm({ ...form, rateType: e.target.value })}
                            className="text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-600 focus:border-blue-400 focus:outline-none"
                          >
                            {cat.rateTypes.map(rt => (
                              <option key={rt} value={rt}>{RATE_TYPE_LABELS[rt]}</option>
                            ))}
                          </select>
                        </div>
                        {form.rateType === "PERCENTAGE" && (
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">Base</label>
                            <select
                              value={form.rateBase}
                              onChange={e => setForm({ ...form, rateBase: e.target.value })}
                              className="text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-600 focus:border-blue-400 focus:outline-none"
                            >
                              <option value="">Seleccionar...</option>
                              {RATE_BASE_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        {cat.hasSocialCharges && (
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">Cargas %</label>
                            <input
                              type="number"
                              placeholder="35"
                              value={form.socialCharges}
                              onChange={e => setForm({ ...form, socialCharges: e.target.value })}
                              className="text-sm border border-gray-200 rounded-lg px-3 py-2 w-20 text-right font-mono focus:border-blue-400 focus:outline-none"
                            />
                          </div>
                        )}
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">
                            {form.rateType === "PERCENTAGE" ? "%" : form.rateType === "PER_SHIPMENT" ? "$/envio" : "$/mes"}
                          </label>
                          <input
                            type="number"
                            placeholder="0"
                            value={form.amount}
                            onChange={e => setForm({ ...form, amount: e.target.value })}
                            className="text-sm border border-gray-200 rounded-lg px-3 py-2 w-28 text-right font-mono focus:border-blue-400 focus:outline-none"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => addCost(cat.key)}
                            disabled={!form.name.trim() || !form.amount}
                            className="text-sm px-4 py-2 rounded-lg font-medium text-white disabled:opacity-50 transition-opacity"
                            style={{ background: "linear-gradient(135deg, #FF5E1A, #FF8A50)" }}
                          >
                            Guardar
                          </button>
                          <button
                            onClick={resetForm}
                            className="text-sm text-gray-400 hover:text-gray-600 px-2 py-2"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="px-5 py-3 border-t border-gray-100">
                      <button
                        onClick={() => {
                          setAddingTo(cat.key);
                          setForm({
                            ...form,
                            rateType: cat.rateTypes[0] || "FIXED_MONTHLY",
                            subcategory: "",
                            name: "",
                            serviceCode: "",
                            amount: "",
                            socialCharges: "",
                          });
                        }}
                        className="text-sm text-blue-500 hover:text-blue-700 font-medium"
                      >
                        + Agregar {cat.key === "LOGISTICA" ? "tarifa" : cat.key === "EQUIPO" ? "persona" : "costo"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
