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

  // Shipping rates state
  const [shippingRates, setShippingRates] = useState([]);
  const [shippingByCarrier, setShippingByCarrier] = useState([]);
  const [shippingTotal, setShippingTotal] = useState(0);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingFilter, setShippingFilter] = useState("");
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [calculating, setCalculating] = useState(false);

  // Available carriers from orders (for dropdown)
  const [availableCarriers, setAvailableCarriers] = useState([]);
  const [selectedCarrier, setSelectedCarrier] = useState("");

  // Auto-calculated costs (ML commissions + merma)
  const [autoCosts, setAutoCosts] = useState(null);

  // Fiscal profile state
  const [fiscalProfile, setFiscalProfile] = useState(null);
  const [fiscalProvinces, setFiscalProvinces] = useState([]);
  const [monotributoCategories, setMonotributoCategories] = useState([]);
  const [fiscalLoading, setFiscalLoading] = useState(false);
  const [generatedTaxes, setGeneratedTaxes] = useState([]);
  const [constanciaParsing, setConstanciaParsing] = useState(false);
  const [constanciaResult, setConstanciaResult] = useState(null);
  const [fiscalForm, setFiscalForm] = useState({
    taxRegime: "",
    monotributoCategory: "A",
    province: "",
    hasConvenioMultilateral: false,
    additionalProvinces: [],
    sellsOnMarketplace: true,
  });

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

  const fetchAutoCosts = useCallback(async (month) => {
    try {
      const res = await fetch(`/api/finance/auto-costs?month=${month || costMonth}`);
      const json = await res.json();
      if (!json.error) setAutoCosts(json);
    } catch {}
  }, [costMonth]);

  useEffect(() => { fetchCosts(costMonth); fetchAutoCosts(costMonth); }, [costMonth]);

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

  // ── Shipping rates functions ────────────────
  const fetchShippingRates = useCallback(async () => {
    setShippingLoading(true);
    try {
      const res = await fetch("/api/finance/shipping-rates");
      const json = await res.json();
      setShippingRates(json.rates || []);
      setShippingByCarrier(json.byCarrier || []);
      setShippingTotal(json.totalRates || 0);
    } catch {}
    setShippingLoading(false);
  }, []);

  const fetchAvailableCarriers = useCallback(async () => {
    try {
      const res = await fetch("/api/finance/shipping-rates/carriers");
      const json = await res.json();
      setAvailableCarriers(json.carriers || []);
    } catch {}
  }, []);

  const fetchFiscalProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/finance/fiscal-profile");
      const json = await res.json();
      setFiscalProfile(json.fiscalProfile || null);
      setFiscalProvinces(json.provinces || []);
      setMonotributoCategories(json.monotributoCategories || []);
      if (json.fiscalProfile) {
        setFiscalForm({
          taxRegime: json.fiscalProfile.taxRegime || "",
          monotributoCategory: json.fiscalProfile.monotributoCategory || "A",
          province: json.fiscalProfile.province || "",
          hasConvenioMultilateral: json.fiscalProfile.hasConvenioMultilateral || false,
          additionalProvinces: json.fiscalProfile.additionalProvinces || [],
          sellsOnMarketplace: json.fiscalProfile.sellsOnMarketplace ?? true,
        });
      }
    } catch {}
  }, []);

  useEffect(() => { fetchShippingRates(); fetchAvailableCarriers(); fetchFiscalProfile(); }, []);

  async function saveFiscalProfile() {
    setFiscalLoading(true);
    try {
      const res = await fetch("/api/finance/fiscal-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fiscalForm),
      });
      const json = await res.json();
      if (json.saved) {
        setFiscalProfile(fiscalForm);
        setGeneratedTaxes(json.generatedTaxes || []);
        showToast("Perfil fiscal guardado");
      }
    } catch {
      showToast("Error al guardar perfil fiscal");
    }
    setFiscalLoading(false);
  }

  async function applyGeneratedTaxes() {
    if (generatedTaxes.length === 0) return;
    setFiscalLoading(true);
    try {
      const res = await fetch("/api/finance/fiscal-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taxes: generatedTaxes, month: costMonth }),
      });
      const json = await res.json();
      if (json.created > 0) {
        fetchCosts(costMonth);
        setGeneratedTaxes([]);
        showToast(`${json.created} impuestos aplicados a ${costMonth}`);
      }
    } catch {
      showToast("Error al aplicar impuestos");
    }
    setFiscalLoading(false);
  }

  async function handleConstanciaUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setConstanciaParsing(true);
    setConstanciaResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/finance/fiscal-profile/parse-constancia", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (json.parsed) {
        setConstanciaResult(json);
        // Auto-fill fiscal form with parsed data
        setFiscalForm(prev => ({
          ...prev,
          taxRegime: json.taxRegime || prev.taxRegime,
          monotributoCategory: json.monotributoCategory || prev.monotributoCategory,
          province: json.provinceCode || prev.province,
          hasConvenioMultilateral: json.hasConvenioMultilateral || prev.hasConvenioMultilateral,
          sellsOnMarketplace: prev.sellsOnMarketplace, // keep user's existing choice
        }));
        showToast("Constancia procesada — verifica los datos");
      } else {
        setConstanciaResult({ error: json.error });
        showToast(json.error || "No se pudo procesar la constancia");
      }
    } catch {
      showToast("Error al procesar el archivo");
    }
    setConstanciaParsing(false);
    e.target.value = "";
  }

  function getSelectedCarrierParts() {
    // selectedCarrier format: "carrier|||service"
    if (!selectedCarrier) return { carrier: "", service: "" };
    const [carrier, service] = selectedCarrier.split("|||");
    return { carrier, service };
  }

  async function downloadTemplate() {
    const { carrier, service } = getSelectedCarrierParts();
    if (!carrier || !service) {
      showToast("Selecciona un tipo de envio primero");
      return;
    }
    const params = new URLSearchParams({ carrier, service });
    const res = await fetch(`/api/finance/shipping-rates/template?${params}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tarifas-${carrier}-${service}.xlsx`.toLowerCase().replace(/\s+/g, "-");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const { carrier, service } = getSelectedCarrierParts();
    if (!carrier || !service) {
      showToast("Selecciona un tipo de envio primero");
      e.target.value = "";
      return;
    }
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("carrier", carrier);
      formData.append("service", service);
      const res = await fetch("/api/finance/shipping-rates/import", {
        method: "POST",
        body: formData,
      });
      const result = await res.json();
      setImportResult(result);
      if (result.imported > 0) {
        fetchShippingRates();
        showToast(`${result.imported} tarifas importadas para ${carrier} - ${service}`);
      }
    } catch {
      showToast("Error al importar archivo");
    }
    setImporting(false);
    e.target.value = "";
  }

  async function toggleShippingRate(id, isActive) {
    await fetch("/api/finance/shipping-rates", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isActive: !isActive }),
    });
    fetchShippingRates();
  }

  async function deleteShippingRate(id) {
    await fetch(`/api/finance/shipping-rates?id=${id}`, { method: "DELETE" });
    fetchShippingRates();
    showToast("Tarifa desactivada");
  }

  async function calculateRealCosts() {
    setCalculating(true);
    try {
      const res = await fetch("/api/finance/shipping-rates/calculate", { method: "POST" });
      const result = await res.json();
      showToast(`${result.matched} ordenes matcheadas, ${result.unmatched} sin match`);
    } catch {
      showToast("Error al calcular costos");
    }
    setCalculating(false);
  }

  const filteredRates = shippingFilter
    ? shippingRates.filter(r => r.carrier === shippingFilter)
    : shippingRates;

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
                  {cat.key === "PLATAFORMAS" && (
                    <span className="text-xs bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full border border-emerald-200" title="Comisiones, envios y retenciones de MercadoLibre se calculan automaticamente desde las ordenes sincronizadas">
                      Auto: Comisiones ML
                    </span>
                  )}
                  {cat.key === "MERMA" && (
                    <span className="text-xs bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full border border-emerald-200" title="Ordenes canceladas y devueltas se detectan automaticamente desde las ordenes sincronizadas">
                      Auto: Cancelaciones y devoluciones
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {(() => {
                    let autoTotal = 0;
                    if (autoCosts && cat.key === "PLATAFORMAS") {
                      autoTotal = (autoCosts.platform?.items || []).reduce((s, i) => s + i.amount, 0);
                    } else if (autoCosts && cat.key === "MERMA") {
                      autoTotal = (autoCosts.merma?.items || []).reduce((s, i) => s + i.amount, 0);
                    }
                    const displayTotal = total + autoTotal;
                    return displayTotal > 0 ? (
                      <span className="text-sm font-bold font-mono text-gray-700">{formatARS(displayTotal)}</span>
                    ) : null;
                  })()}
                  <span className="text-xs text-gray-400">{isExpanded ? "▲" : "▼"}</span>
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="border-t border-gray-100">
                  {/* Fiscal profile wizard — only for FISCAL category */}
                  {cat.key === "FISCAL" && (
                    <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50/50 to-transparent">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700">Perfil Fiscal</h4>
                          <p className="text-xs text-gray-400">
                            {fiscalProfile?.completedAt
                              ? "Configurado — los impuestos se generan automaticamente"
                              : "Subi tu constancia de AFIP y la IA detecta tus impuestos al instante"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className={`text-xs px-3 py-1.5 rounded-lg font-medium cursor-pointer transition-all ${
                            constanciaParsing
                              ? "bg-gray-100 text-gray-400"
                              : "bg-gradient-to-r from-indigo-500 to-violet-500 text-white hover:from-indigo-600 hover:to-violet-600 shadow-sm"
                          }`}>
                            {constanciaParsing ? "Analizando con IA..." : "Importar constancia AFIP"}
                            <input
                              type="file"
                              accept=".pdf"
                              onChange={handleConstanciaUpload}
                              className="hidden"
                              disabled={constanciaParsing}
                            />
                          </label>
                          {fiscalProfile && generatedTaxes.length === 0 && (
                            <button
                              onClick={saveFiscalProfile}
                              disabled={fiscalLoading}
                              className="text-xs px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                            >
                              {fiscalLoading ? "..." : "Recalcular"}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* AI info banner — only when no profile yet and no parse result */}
                      {!fiscalProfile?.completedAt && !constanciaResult && (
                        <div className="mb-3 p-3 rounded-lg bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-100">
                          <p className="text-xs text-indigo-700">
                            <span className="font-semibold">Importa tu constancia de AFIP</span> y nuestra IA extrae automaticamente tu regimen, provincia, categoria e impuestos inscriptos. Sin completar formularios.
                          </p>
                          <p className="text-xs text-indigo-400 mt-1">
                            Descargala desde <span className="font-medium">afip.gob.ar → Mis Servicios → Constancia de Inscripcion</span>
                          </p>
                        </div>
                      )}

                      {/* Constancia parse result */}
                      {constanciaResult && !constanciaResult.error && (
                        <div className="mb-3 p-3 bg-white rounded-lg border border-indigo-200">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-indigo-700">IA: Constancia analizada</span>
                              <span className="text-xs bg-indigo-50 text-indigo-500 px-2 py-0.5 rounded-full">
                                {constanciaResult.confidence}% confianza
                              </span>
                            </div>
                            <button onClick={() => setConstanciaResult(null)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                          </div>
                          {constanciaResult.cuit && (
                            <p className="text-xs text-gray-600 mb-1">
                              <span className="font-medium">CUIT:</span> {constanciaResult.cuit}
                              {constanciaResult.name && <span className="ml-2 text-gray-400">({constanciaResult.name})</span>}
                            </p>
                          )}
                          {constanciaResult.taxRegime && (
                            <p className="text-xs text-gray-600 mb-1">
                              <span className="font-medium">Regimen:</span>{" "}
                              {constanciaResult.taxRegime === "MONOTRIBUTO" ? "Monotributo" : "Responsable Inscripto"}
                              {constanciaResult.monotributoCategory && ` Cat. ${constanciaResult.monotributoCategory}`}
                            </p>
                          )}
                          {constanciaResult.provinceCode && (
                            <p className="text-xs text-gray-600 mb-1">
                              <span className="font-medium">Provincia:</span>{" "}
                              {fiscalProvinces.find(p => p.code === constanciaResult.provinceCode)?.name || constanciaResult.province}
                            </p>
                          )}
                          {constanciaResult.impuestos?.length > 0 && (
                            <div className="mt-1.5">
                              <span className="text-xs font-medium text-gray-500">Impuestos detectados:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {constanciaResult.impuestos.map((imp, i) => (
                                  <span key={i} className={`text-xs px-2 py-0.5 rounded-full ${
                                    imp.estado === "ACTIVO" ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-500"
                                  }`}>
                                    {imp.description?.substring(0, 40)}{imp.description?.length > 40 ? "..." : ""}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {constanciaResult.warnings?.length > 0 && (
                            <div className="mt-2 space-y-0.5">
                              {constanciaResult.warnings.map((w, i) => (
                                <p key={i} className="text-xs text-amber-600">⚠ {w}</p>
                              ))}
                            </div>
                          )}
                          <p className="text-xs text-gray-400 mt-2">
                            Datos extraidos y cargados automaticamente. Verifica, ajusta si es necesario, y dale a guardar.
                          </p>
                        </div>
                      )}

                      {constanciaResult?.error && (
                        <div className="mb-3 p-3 bg-red-50 rounded-lg border border-red-200">
                          <p className="text-xs text-red-600">{constanciaResult.error}</p>
                          <button onClick={() => setConstanciaResult(null)} className="text-xs text-red-400 hover:text-red-600 mt-1">Cerrar</button>
                        </div>
                      )}

                      {/* Divider between auto and manual */}
                      {!constanciaResult && !fiscalProfile?.completedAt && (
                        <div className="flex items-center gap-3 my-3">
                          <div className="flex-1 border-t border-gray-200" />
                          <span className="text-xs text-gray-400 whitespace-nowrap">o completa manualmente</span>
                          <div className="flex-1 border-t border-gray-200" />
                        </div>
                      )}

                      {/* Label when constancia was parsed */}
                      {constanciaResult && !constanciaResult.error && (
                        <p className="text-xs text-gray-400 mb-2">Verifica que los datos sean correctos antes de guardar:</p>
                      )}

                      {/* Fiscal form */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Regimen impositivo</label>
                          <select
                            value={fiscalForm.taxRegime}
                            onChange={e => setFiscalForm({ ...fiscalForm, taxRegime: e.target.value })}
                            className="text-sm border border-gray-200 rounded-lg px-3 py-2 w-full text-gray-600 focus:border-blue-400 focus:outline-none"
                          >
                            <option value="">Seleccionar...</option>
                            <option value="MONOTRIBUTO">Monotributo</option>
                            <option value="RESPONSABLE_INSCRIPTO">Responsable Inscripto</option>
                          </select>
                        </div>

                        {fiscalForm.taxRegime === "MONOTRIBUTO" && (
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">Categoria</label>
                            <select
                              value={fiscalForm.monotributoCategory}
                              onChange={e => setFiscalForm({ ...fiscalForm, monotributoCategory: e.target.value })}
                              className="text-sm border border-gray-200 rounded-lg px-3 py-2 w-full text-gray-600 focus:border-blue-400 focus:outline-none"
                            >
                              {monotributoCategories.map(c => (
                                <option key={c.category} value={c.category}>
                                  Cat. {c.category} — hasta {c.maxRevenue} (${c.monthlyAmount.toLocaleString()}/mes)
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Provincia (domicilio fiscal)</label>
                          <select
                            value={fiscalForm.province}
                            onChange={e => setFiscalForm({ ...fiscalForm, province: e.target.value })}
                            className="text-sm border border-gray-200 rounded-lg px-3 py-2 w-full text-gray-600 focus:border-blue-400 focus:outline-none"
                          >
                            <option value="">Seleccionar...</option>
                            {fiscalProvinces.map(p => (
                              <option key={p.code} value={p.code}>
                                {p.name} ({p.rate}%)
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex flex-col gap-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={fiscalForm.sellsOnMarketplace}
                              onChange={e => setFiscalForm({ ...fiscalForm, sellsOnMarketplace: e.target.checked })}
                              className="rounded border-gray-300 text-blue-500 focus:ring-blue-400"
                            />
                            <span className="text-xs text-gray-600">Vende en MercadoLibre</span>
                          </label>
                          {fiscalForm.taxRegime === "RESPONSABLE_INSCRIPTO" && (
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={fiscalForm.hasConvenioMultilateral}
                                onChange={e => setFiscalForm({ ...fiscalForm, hasConvenioMultilateral: e.target.checked })}
                                className="rounded border-gray-300 text-blue-500 focus:ring-blue-400"
                              />
                              <span className="text-xs text-gray-600">Convenio Multilateral</span>
                            </label>
                          )}
                        </div>
                      </div>

                      {/* Convenio Multilateral provinces */}
                      {fiscalForm.hasConvenioMultilateral && fiscalForm.taxRegime === "RESPONSABLE_INSCRIPTO" && (
                        <div className="mt-3">
                          <label className="text-xs text-gray-500 block mb-1.5">Provincias con nexo (ademas de {fiscalProvinces.find(p => p.code === fiscalForm.province)?.name || "la principal"})</label>
                          <div className="flex flex-wrap gap-1.5">
                            {fiscalProvinces.filter(p => p.code !== fiscalForm.province).map(p => (
                              <button
                                key={p.code}
                                onClick={() => {
                                  const current = fiscalForm.additionalProvinces || [];
                                  const updated = current.includes(p.code)
                                    ? current.filter(c => c !== p.code)
                                    : [...current, p.code];
                                  setFiscalForm({ ...fiscalForm, additionalProvinces: updated });
                                }}
                                className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                                  (fiscalForm.additionalProvinces || []).includes(p.code)
                                    ? "bg-blue-100 text-blue-700"
                                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                }`}
                              >
                                {p.name} ({p.rate}%)
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Save button */}
                      {fiscalForm.taxRegime && fiscalForm.province && (
                        <div className="mt-3 flex items-center gap-3">
                          <button
                            onClick={saveFiscalProfile}
                            disabled={fiscalLoading}
                            className="text-sm px-5 py-2 rounded-lg font-medium text-white disabled:opacity-50 transition-opacity"
                            style={{ background: "linear-gradient(135deg, #FF5E1A, #FF8A50)" }}
                          >
                            {fiscalLoading ? "Guardando..." : fiscalProfile ? "Actualizar y recalcular" : "Generar impuestos"}
                          </button>
                        </div>
                      )}

                      {/* Generated taxes preview */}
                      {generatedTaxes.length > 0 && (
                        <div className="mt-4 bg-white rounded-lg border border-blue-200 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-blue-700">
                              Impuestos generados ({generatedTaxes.length})
                            </span>
                            <button
                              onClick={applyGeneratedTaxes}
                              disabled={fiscalLoading}
                              className="text-xs px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors font-medium"
                            >
                              {fiscalLoading ? "Aplicando..." : `Aplicar a ${costMonth}`}
                            </button>
                          </div>
                          <div className="space-y-1.5">
                            {generatedTaxes.map((tax, i) => (
                              <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-gray-50 last:border-0">
                                <div>
                                  <span className="font-medium text-gray-700">{tax.name}</span>
                                  <span className={`ml-2 px-1.5 py-0.5 rounded-full ${
                                    tax.rateType === "PERCENTAGE" ? "bg-purple-50 text-purple-600" : "bg-gray-100 text-gray-600"
                                  }`}>
                                    {tax.rateType === "PERCENTAGE" ? `${tax.amount}%` : formatARS(tax.amount)}
                                  </span>
                                </div>
                                <span className="text-gray-400 max-w-xs truncate">{tax.notes.replace(" [auto-fiscal]", "")}</span>
                              </div>
                            ))}
                          </div>
                          <p className="text-xs text-gray-400 mt-2">
                            Podes modificar estos valores despues desde la tabla de abajo
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Auto-calculated costs for PLATAFORMAS and MERMA */}
                  {(cat.key === "PLATAFORMAS" || cat.key === "MERMA") && (
                    (() => {
                      const autoItems = cat.key === "PLATAFORMAS"
                        ? autoCosts?.platform?.items || []
                        : autoCosts?.merma?.items || [];
                      const autoTotal = autoItems.reduce((sum, i) => sum + i.amount, 0);

                      if (autoItems.length === 0) {
                        return (
                          <div className="px-5 py-3 border-b border-gray-100 bg-gradient-to-r from-gray-50/50 to-transparent">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-semibold text-gray-500">
                                {cat.key === "PLATAFORMAS" ? "Comisiones MercadoLibre" : "Cancelaciones y devoluciones"}
                              </span>
                              <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">
                                calculo automatico
                              </span>
                            </div>
                            <p className="text-xs text-gray-400">
                              {cat.key === "PLATAFORMAS"
                                ? "Se calculan automaticamente las comisiones, costos de envio y retenciones impositivas que MercadoLibre cobra por cada venta. Los demas costos de esta categoria (SaaS, ERP, etc.) se cargan manualmente abajo."
                                : "Se detectan automaticamente las ordenes canceladas y devueltas, sumando el valor perdido. Las demas perdidas (roturas, extravios, etc.) se cargan manualmente abajo."}
                            </p>
                            <p className="text-xs text-gray-300 mt-1">
                              {cat.key === "PLATAFORMAS"
                                ? "Sin datos para este mes — sincroniza ordenes de ML o selecciona un mes con ventas."
                                : "Sin datos para este mes — puede que no haya ordenes canceladas o devueltas en este periodo."}
                            </p>
                          </div>
                        );
                      }

                      return (
                        <div className="px-5 py-3 border-b border-gray-100 bg-gradient-to-r from-emerald-50/50 to-transparent">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold text-emerald-700">
                              {cat.key === "PLATAFORMAS" ? "Comisiones MercadoLibre" : "Cancelaciones y devoluciones"}
                            </span>
                            <span className="text-xs bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full">
                              calculo automatico — {costMonth}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 mb-2">
                            {cat.key === "PLATAFORMAS"
                              ? "Comisiones, costos de envio y retenciones que ML cobra por venta. Los demas costos de esta categoria se cargan manualmente."
                              : "Valor de ordenes canceladas y devueltas detectadas automaticamente. Las demas perdidas se cargan manualmente."}
                          </p>
                          <div className="space-y-1.5">
                            {autoItems.map((item, i) => (
                              <div key={i} className="flex items-center justify-between text-sm py-1.5">
                                <div>
                                  <span className="font-medium text-gray-700">{item.name}</span>
                                  {item.count !== undefined && (
                                    <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                                      {item.count} ordenes
                                    </span>
                                  )}
                                </div>
                                <div className="text-right">
                                  <span className="font-mono font-bold text-gray-800">{formatARS(item.amount)}</span>
                                  <p className="text-xs text-gray-400">{item.detail}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-emerald-200/50">
                            <span className="text-xs text-gray-500">Total automatico</span>
                            <span className="text-sm font-bold font-mono text-emerald-700">{formatARS(autoTotal)}</span>
                          </div>
                        </div>
                      );
                    })()
                  )}

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

      {/* ── Tarifas de Envío por CP ─── */}
      <div className="mt-8">
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <span>📦</span> Tarifas de Envio por Codigo Postal
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Carga tarifas por mensajeria y CP para calcular el costo real de envio de cada orden
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={selectedCarrier}
                  onChange={e => setSelectedCarrier(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-600 focus:border-blue-400 focus:outline-none min-w-[220px]"
                >
                  <option value="">Seleccionar tipo de envio...</option>
                  {availableCarriers.map(c => (
                    <option key={`${c.carrier}|||${c.service}`} value={`${c.carrier}|||${c.service}`}>
                      {c.carrier} — {c.service} ({c.orderCount} ordenes)
                    </option>
                  ))}
                </select>
                <button
                  onClick={downloadTemplate}
                  disabled={!selectedCarrier}
                  className="text-sm px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 rounded-lg text-gray-600 transition-colors flex items-center gap-1.5"
                >
                  <span>⬇</span> Plantilla
                </button>
                <label className={`text-sm px-4 py-2 rounded-lg font-medium text-white transition-opacity ${
                  !selectedCarrier || importing ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:opacity-90"
                }`}
                  style={{ background: "linear-gradient(135deg, #FF5E1A, #FF8A50)" }}
                >
                  <span>{importing ? "Importando..." : "⬆ Importar"}</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleImport}
                    className="hidden"
                    disabled={importing || !selectedCarrier}
                  />
                </label>
                <button
                  onClick={calculateRealCosts}
                  disabled={calculating || shippingTotal === 0}
                  className="text-sm px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 rounded-lg text-white font-medium transition-colors"
                >
                  {calculating ? "Calculando..." : "Calcular costos"}
                </button>
              </div>
            </div>
          </div>

          {/* Import result */}
          {importResult && (
            <div className={`px-5 py-3 border-b border-gray-100 ${importResult.errors?.length > 0 ? "bg-amber-50" : "bg-green-50"}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  {importResult.imported} tarifas importadas de {importResult.totalRows} filas
                </span>
                <button onClick={() => setImportResult(null)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
              </div>
              {importResult.errors?.length > 0 && (
                <div className="mt-2 space-y-1">
                  {importResult.errors.slice(0, 5).map((err, i) => (
                    <p key={i} className="text-xs text-amber-700">
                      Fila {err.row}: {err.field} — {err.message}
                    </p>
                  ))}
                  {importResult.errors.length > 5 && (
                    <p className="text-xs text-amber-500">...y {importResult.errors.length - 5} errores mas</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Summary by carrier */}
          {shippingByCarrier.length > 0 && (
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
              <button
                onClick={() => setShippingFilter("")}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                  !shippingFilter ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                Todas ({shippingTotal})
              </button>
              {shippingByCarrier.map(c => (
                <button
                  key={c.carrier}
                  onClick={() => setShippingFilter(c.carrier === shippingFilter ? "" : c.carrier)}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                    shippingFilter === c.carrier ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {c.carrier} ({c.totalRates})
                </button>
              ))}
            </div>
          )}

          {/* Rates table */}
          {shippingLoading ? (
            <div className="px-5 py-8 text-center text-gray-400 text-sm">Cargando tarifas...</div>
          ) : filteredRates.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-gray-400 text-sm">No hay tarifas cargadas</p>
              <p className="text-xs text-gray-300 mt-1">Descarga la plantilla Excel, completala con tus tarifas y subila</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Mensajeria</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Servicio</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Codigo</th>
                    <th className="text-center px-4 py-2 text-xs font-medium text-gray-500">CP Desde</th>
                    <th className="text-center px-4 py-2 text-xs font-medium text-gray-500">CP Hasta</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Costo</th>
                    <th className="text-center px-4 py-2 text-xs font-medium text-gray-500">Estado</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredRates.map(rate => (
                    <tr key={rate.id} className="group hover:bg-gray-50/50">
                      <td className="px-4 py-2.5 font-medium text-gray-800">{rate.carrier}</td>
                      <td className="px-4 py-2.5 text-gray-600">{rate.serviceType}</td>
                      <td className="px-4 py-2.5">
                        {rate.serviceCode ? (
                          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{rate.serviceCode}</code>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center font-mono text-gray-600">{rate.postalCodeFrom}</td>
                      <td className="px-4 py-2.5 text-center font-mono text-gray-600">
                        {rate.postalCodeTo || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-medium text-gray-800">
                        {formatARS(Number(rate.cost))}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          onClick={() => toggleShippingRate(rate.id, rate.isActive)}
                          className={`text-xs px-2 py-1 rounded-full ${
                            rate.isActive ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400"
                          }`}
                        >
                          {rate.isActive ? "Activa" : "Inactiva"}
                        </button>
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => deleteShippingRate(rate.id)}
                          className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
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
        </div>
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
