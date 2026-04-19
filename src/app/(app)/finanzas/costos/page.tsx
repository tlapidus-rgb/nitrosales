// @ts-nocheck
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { formatARS } from "@/lib/utils/format";
import {
  buildDriverFormulaPayload,
  evaluateDriverFormula,
  type Driver,
  type DriverFormula,
} from "@/lib/finanzas/driver-formula";
import {
  Truck,
  Users,
  Wrench,
  FileText,
  Building2,
  Camera,
  TrendingDown,
  Package,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Copy,
} from "lucide-react";

// Fase 4c — Helpers para el custom month selector
function formatMonthLabel(monthStr: string): string {
  if (!monthStr) return "";
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(y, (m || 1) - 1, 1);
  // "abril de 2026"
  return d
    .toLocaleDateString("es-AR", { month: "long", year: "numeric" })
    .replace(/^\w/, (c) => c.toUpperCase());
}

function addMonthsToStr(monthStr: string, delta: number): string {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(y, (m || 1) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Fase 4b — Mapa de icons lucide por categoria (reemplaza emojis)
const CATEGORY_ICONS: Record<string, any> = {
  LOGISTICA: Truck,
  EQUIPO: Users,
  PLATAFORMAS: Wrench,
  FISCAL: FileText,
  INFRAESTRUCTURA: Building2,
  MARKETING: Camera,
  MERMA: TrendingDown,
  OTROS: Package,
};

// Colores de acento por categoria — prism delimiter + icon tint
const CATEGORY_ACCENTS: Record<string, { icon: string; bg: string; bar: string }> = {
  LOGISTICA:       { icon: "text-teal-600",   bg: "bg-teal-50",   bar: "#14b8a6" },
  EQUIPO:          { icon: "text-indigo-600", bg: "bg-indigo-50", bar: "#6366f1" },
  PLATAFORMAS:     { icon: "text-violet-600", bg: "bg-violet-50", bar: "#a855f7" },
  FISCAL:          { icon: "text-blue-600",   bg: "bg-blue-50",   bar: "#3b82f6" },
  INFRAESTRUCTURA: { icon: "text-slate-600",  bg: "bg-slate-50",  bar: "#64748b" },
  MARKETING:       { icon: "text-pink-600",   bg: "bg-pink-50",   bar: "#ec4899" },
  MERMA:           { icon: "text-amber-600",  bg: "bg-amber-50",  bar: "#f59e0b" },
  OTROS:           { icon: "text-gray-600",   bg: "bg-gray-50",   bar: "#6b7280" },
};

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
    rateTypes: ["FIXED_MONTHLY", "PERCENTAGE", "DRIVER_BASED"],
  },
  {
    key: "FISCAL",
    label: "Fiscal e Impuestos",
    description: "IIBB, percepciones, contador, monotributo",
    icon: "📋",
    hasSubcategory: false,
    rateTypes: ["FIXED_MONTHLY", "PERCENTAGE", "DRIVER_BASED"],
  },
  {
    key: "INFRAESTRUCTURA",
    label: "Infraestructura",
    description: "Alquiler, servicios, seguros",
    icon: "🏢",
    hasSubcategory: false,
    rateTypes: ["FIXED_MONTHLY", "DRIVER_BASED"],
  },
  {
    key: "MARKETING",
    label: "Marketing y Contenido",
    description: "Fotografia, produccion, eventos",
    icon: "📸",
    hasSubcategory: false,
    rateTypes: ["FIXED_MONTHLY", "DRIVER_BASED"],
  },
  {
    key: "MERMA",
    label: "Merma y Perdidas",
    description: "Roturas, devoluciones no recuperables",
    icon: "📉",
    hasSubcategory: false,
    rateTypes: ["FIXED_MONTHLY", "PERCENTAGE", "DRIVER_BASED"],
  },
  {
    key: "OTROS",
    label: "Otros",
    description: "Gastos varios",
    icon: "📦",
    hasSubcategory: false,
    rateTypes: ["FIXED_MONTHLY", "DRIVER_BASED"],
  },
];

const RATE_TYPE_LABELS = {
  FIXED_MONTHLY: "Fijo mensual",
  PER_SHIPMENT: "Por envio",
  PERCENTAGE: "Porcentaje",
  DRIVER_BASED: "Formula",
};

const RATE_BASE_OPTIONS = [
  { value: "GROSS_REVENUE", label: "Facturacion bruta total" },
  { value: "MELI_REVENUE", label: "Facturacion MercadoLibre" },
  { value: "VTEX_REVENUE", label: "Facturacion VTEX" },
  { value: "COGS", label: "Costo de mercaderia (COGS)" },
];

/* ── Fase 3 — taxonomia de comportamiento ────── */
// Etiquetas y clases de estilo por behavior. Si un item no tiene
// `behavior` cargado (null), caemos al campo `type` legacy: FIXED / VARIABLE.
// SEMI_FIXED es un valor nuevo que solo aparece cuando lo cargamos explicito.
const BEHAVIOR_LABELS = {
  FIXED: "Fijo",
  VARIABLE: "Variable",
  SEMI_FIXED: "Semi-fijo",
};

const BEHAVIOR_STYLES = {
  FIXED: "bg-teal-50 text-teal-700 border-teal-200",
  VARIABLE: "bg-amber-50 text-amber-700 border-amber-200",
  SEMI_FIXED: "bg-violet-50 text-violet-700 border-violet-200",
};

// Determina el behavior efectivo de un item. Orden de fallback:
//   1. behavior (nuevo — tiene precedencia).
//   2. type legacy (FIXED / VARIABLE).
//   3. FIXED por default.
function effectiveBehavior(item) {
  if (item?.behavior) return item.behavior;
  if (item?.type === "VARIABLE") return "VARIABLE";
  return "FIXED";
}

/* ── Fase 4a — CountUp premium ─────────────────
// Anima de 0 (o valor anterior) al valor nuevo con easing cubic-bezier.
// Respeta prefers-reduced-motion: si el user lo pide, mostramos el
// numero final sin animacion. Formatea con un render fn inyectable
// para soportar ARS ($X), % (X%) o texto plano.
*/
function CountUp({
  value,
  duration = 700,
  format = (n: number) => n.toLocaleString("es-AR"),
  className = "",
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const [displayed, setDisplayed] = useState(value);
  useEffect(() => {
    if (typeof window === "undefined") {
      setDisplayed(value);
      return;
    }
    // Respeta prefers-reduced-motion: salta directo al valor final
    const reduce =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || duration <= 0) {
      setDisplayed(value);
      return;
    }
    const start = performance.now();
    const from = displayed;
    const delta = value - from;
    let raf = 0;
    // cubic-bezier(0.16, 1, 0.3, 1) approx -> easeOutExpo friendly
    const ease = (t: number) => 1 - Math.pow(1 - t, 4);
    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      setDisplayed(from + delta * ease(t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);
  return <span className={className}>{format(displayed)}</span>;
}

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

  // Platform config state (VTEX rate, payment fees)
  const [platformConfig, setPlatformConfig] = useState({
    vtexConfig: { variableRate: 2.5, fixedMonthlyCost: 0 },
    paymentFeesConfig: {},
  });
  const [platformConfigLoading, setPlatformConfigLoading] = useState(false);

  // Fase 3f — Driver formula modal state
  // `formulaModal` vale null cuando el modal esta cerrado. Cuando esta
  // abierto, puede ser:
  //   { mode: "edit", itemId, categoryKey, drivers, formula }
  //   { mode: "create", categoryKey, formSnapshot, drivers, formula }
  // formSnapshot guarda los campos del add-form (name, subcategory, etc)
  // para poder hacer el POST completo al guardar la formula.
  const [formulaModal, setFormulaModal] = useState<any>(null);
  const [formulaSaving, setFormulaSaving] = useState(false);

  // Preview en vivo de la formula (se recalcula cuando cambian drivers/formula)
  const formulaPreview = useMemo(() => {
    if (!formulaModal) return null;
    const { drivers, formula } = formulaModal;
    if (!formula || !formula.trim()) {
      return { ok: false, error: "Escribi una formula para ver el resultado" };
    }
    return evaluateDriverFormula(formula, drivers);
  }, [formulaModal]);

  function openFormulaEditor(item: any, categoryKey: string) {
    const existing: DriverFormula | null = item.driverFormula || null;
    setFormulaModal({
      mode: "edit",
      itemId: item.id,
      categoryKey,
      drivers: existing?.drivers ? [...existing.drivers] : [
        { key: "driver_1", label: "Variable 1", value: 1, unit: "" },
      ],
      formula: existing?.formula || "",
    });
  }

  function openFormulaCreator(categoryKey: string) {
    // Snapshot del form actual (lo va a usar al guardar para hacer POST)
    setFormulaModal({
      mode: "create",
      categoryKey,
      formSnapshot: { ...form },
      drivers: [{ key: "driver_1", label: "Variable 1", value: 1, unit: "" }],
      formula: "",
    });
  }

  function closeFormulaEditor() {
    setFormulaModal(null);
    setFormulaSaving(false);
  }

  function updateFormulaDriver(idx: number, patch: Partial<Driver>) {
    setFormulaModal((prev: any) => {
      if (!prev) return prev;
      const drivers = prev.drivers.map((d: Driver, i: number) =>
        i === idx ? { ...d, ...patch } : d
      );
      return { ...prev, drivers };
    });
  }

  function addFormulaDriver() {
    setFormulaModal((prev: any) => {
      if (!prev) return prev;
      const nextKey = `driver_${prev.drivers.length + 1}`;
      return {
        ...prev,
        drivers: [
          ...prev.drivers,
          { key: nextKey, label: `Variable ${prev.drivers.length + 1}`, value: 0, unit: "" },
        ],
      };
    });
  }

  function removeFormulaDriver(idx: number) {
    setFormulaModal((prev: any) => {
      if (!prev) return prev;
      if (prev.drivers.length <= 1) return prev; // Al menos 1 driver
      const drivers = prev.drivers.filter((_: Driver, i: number) => i !== idx);
      return { ...prev, drivers };
    });
  }

  async function saveFormulaEditor() {
    if (!formulaModal) return;
    const { drivers, formula } = formulaModal;
    const built = buildDriverFormulaPayload(drivers, formula);
    if (!built.ok || !built.payload || built.amount === undefined) {
      showToast(built.error || "Formula invalida");
      return;
    }
    setFormulaSaving(true);
    try {
      if (formulaModal.mode === "edit") {
        // PUT al item existente con nueva formula + amount recalculado
        const res = await fetch("/api/finance/manual-costs", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: formulaModal.itemId,
            driverFormula: built.payload,
            amount: built.amount,
            rateType: "DRIVER_BASED",
          }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          showToast(json.error || "Error al guardar formula");
          setFormulaSaving(false);
          return;
        }
        showToast("Formula actualizada");
      } else {
        // POST nuevo item con los datos del formSnapshot + la formula
        const snap = formulaModal.formSnapshot;
        const legacyType = snap.behavior === "FIXED" ? "FIXED" : "VARIABLE";
        const res = await fetch("/api/finance/manual-costs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: formulaModal.categoryKey,
            subcategory: snap.subcategory || null,
            name: (snap.name || "").trim() || "Costo con formula",
            serviceCode: snap.serviceCode || null,
            amount: built.amount,
            rateType: "DRIVER_BASED",
            rateBase: null,
            socialCharges: snap.socialCharges ? parseFloat(snap.socialCharges) : null,
            type: legacyType,
            behavior: snap.behavior,
            autoInflationAdjust: snap.autoInflationAdjust,
            driverFormula: built.payload,
            month: costMonth,
          }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          showToast(json.error || "Error al crear costo con formula");
          setFormulaSaving(false);
          return;
        }
        showToast("Costo con formula creado");
        resetForm();
      }
      fetchCosts(costMonth);
      closeFormulaEditor();
    } catch {
      showToast("Error de red");
      setFormulaSaving(false);
    }
  }

  // Fase 3d — Bulk edit selection state
  // Guardamos Set<string> con IDs seleccionados. Limpiamos al cambiar de mes.
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkOp, setBulkOp] = useState("");     // "pct" | "behavior" | "fiscal"
  const [bulkValue, setBulkValue] = useState("");
  const [bulkRunning, setBulkRunning] = useState(false);

  function toggleSelection(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllInCategory(categoryItems) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const ids = categoryItems.map((i) => i.id);
      const allSelected = ids.every((id) => next.has(id));
      if (allSelected) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setBulkOp("");
    setBulkValue("");
  }

  async function runBulkOperation() {
    if (selectedIds.size === 0 || !bulkOp) return;
    const ids = Array.from(selectedIds);
    // Traducimos el op UI al shape que espera el endpoint
    let operation;
    if (bulkOp === "pct") {
      const pct = parseFloat(bulkValue);
      if (!Number.isFinite(pct)) {
        showToast("Ingresa un porcentaje valido");
        return;
      }
      operation = { type: "percentage_increase", value: pct };
    } else if (bulkOp === "behavior") {
      if (!bulkValue) {
        showToast("Elegi un comportamiento");
        return;
      }
      operation = { type: "set_behavior", value: bulkValue };
    } else if (bulkOp === "fiscal") {
      if (!bulkValue) {
        showToast("Elegi una clasificacion fiscal");
        return;
      }
      operation = { type: "set_fiscal_type", value: bulkValue };
    } else {
      return;
    }
    setBulkRunning(true);
    try {
      const res = await fetch("/api/finance/manual-costs/bulk-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, operation }),
      });
      const json = await res.json();
      if (res.ok) {
        showToast(`${json.updated} costos actualizados`);
        clearSelection();
        fetchCosts(costMonth);
      } else {
        showToast(json.error || "Error al aplicar bulk");
      }
    } catch {
      showToast("Error de red");
    }
    setBulkRunning(false);
  }

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
    behavior: "FIXED", // Fase 3 — default visible para el chip
    autoInflationAdjust: false, // Fase 3e — IPC auto al copiar al proximo mes
  });

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }

  const [showCopyBanner, setShowCopyBanner] = useState(false);
  const [autoCopying, setAutoCopying] = useState(false);

  const fetchCosts = useCallback(async (month) => {
    setLoading(true);
    setShowCopyBanner(false);
    try {
      const res = await fetch(`/api/finance/manual-costs?month=${month || costMonth}`);
      const json = await res.json();
      if (json.categories) {
        setData(json);
        // Check if month is empty (no manual costs at all)
        const totalItems = json.categories.reduce((sum, c) => sum + (c.items?.length || 0), 0);
        if (totalItems === 0 && month !== nowMonth) {
          // Empty month that isn't the current month — suggest copy
          setShowCopyBanner(true);
        }
      }
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

  const fetchPlatformConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/finance/platform-config");
      const json = await res.json();
      if (!json.error) setPlatformConfig(json);
    } catch {}
  }, []);

  const savePlatformConfig = async (update) => {
    setPlatformConfigLoading(true);
    try {
      const merged = { ...platformConfig, ...update };
      const res = await fetch("/api/finance/platform-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(merged),
      });
      if (res.ok) {
        setPlatformConfig(merged);
        showToast("Configuracion guardada");
      }
    } catch {}
    setPlatformConfigLoading(false);
  };

  useEffect(() => {
    fetchCosts(costMonth);
    fetchAutoCosts(costMonth);
    fetchPlatformConfig();
    // Al cambiar de mes, limpiamos seleccion activa — los IDs previos
    // no pertenecen al nuevo mes y podrian confundir al user.
    setSelectedIds(new Set());
  }, [costMonth]);

  function resetForm() {
    setForm({
      subcategory: "", name: "", serviceCode: "", amount: "",
      rateType: "FIXED_MONTHLY", rateBase: "", socialCharges: "", type: "FIXED",
      behavior: "FIXED", autoInflationAdjust: false,
    });
    setAddingTo(null);
  }

  async function addCost(categoryKey) {
    if (!form.name.trim() || !form.amount) return;
    // Fase 3 — behavior: mandamos siempre el que elige el user.
    // type (legacy) lo derivamos del behavior para que la clasificacion
    // FIXED/VARIABLE siga funcionando en reportes viejos:
    //   SEMI_FIXED -> VARIABLE (tratamos el costo mixto como variable
    //                           para el P&L legacy que solo entiende 2 buckets)
    const legacyType = form.behavior === "FIXED" ? "FIXED" : "VARIABLE";
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
        type: legacyType,
        behavior: form.behavior,
        autoInflationAdjust: form.autoInflationAdjust,
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

  // Fase 3e — toggle para ajustar por IPC al copiar del mes anterior
  const [adjustByInflation, setAdjustByInflation] = useState(true);

  async function copyPreviousMonth() {
    const [y, m] = costMonth.split("-").map(Number);
    const prevDate = new Date(y, m - 2, 1);
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
    const res = await fetch("/api/finance/manual-costs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        copyFrom: prevMonth,
        targetMonth: costMonth,
        adjustByInflation, // 3e — aplica factor IPC solo a items con autoInflationAdjust=true
      }),
    });
    const json = await res.json();
    if (json.copied) {
      fetchCosts(costMonth);
      // Si se aplico IPC, mostrar detalle del factor
      let msg = `${json.copied} costos copiados de ${prevMonth}`;
      if (json.ipcAdjusted && json.ipcAdjusted > 0 && json.ipcFactor) {
        const pct = ((json.ipcFactor - 1) * 100).toFixed(1);
        msg += ` · ${json.ipcAdjusted} ajustados +${pct}% por IPC`;
      } else if (json.ipcMessage) {
        msg += ` · ${json.ipcMessage}`;
      }
      showToast(msg);
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
    // Fase 4d — Skeleton shimmer que refleja la estructura final
    // (hero + KPIs + 3 category cards). Evita el flash de "nada" durante
    // la carga inicial y mantiene la sensacion de velocidad.
    const shimmer =
      "relative overflow-hidden bg-gray-100 before:absolute before:inset-0 before:-translate-x-full before:bg-[linear-gradient(90deg,transparent_0,rgba(255,255,255,0.6)_50%,transparent_100%)] before:animate-[shimmer_1.5s_infinite]";
    return (
      <div className="light-canvas min-h-screen">
        {/* Hero skeleton */}
        <div className="relative overflow-hidden rounded-3xl mb-6 bg-gradient-to-b from-white to-gray-50 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-2">
              <div className={`${shimmer} h-7 w-56 rounded-lg`} />
              <div className={`${shimmer} h-4 w-80 rounded-md`} />
            </div>
            <div className="flex items-center gap-2">
              <div className={`${shimmer} h-9 w-52 rounded-xl`} />
              <div className={`${shimmer} h-9 w-32 rounded-xl`} />
              <div className={`${shimmer} h-9 w-40 rounded-xl`} />
            </div>
          </div>
        </div>
        {/* KPI strip skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <div className={`${shimmer} h-3 w-20 rounded-md mb-3`} />
              <div className={`${shimmer} h-7 w-28 rounded-lg`} />
              <div className={`${shimmer} h-3 w-16 rounded-md mt-2`} />
            </div>
          ))}
        </div>
        {/* Category cards skeleton */}
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="bg-white rounded-2xl p-5 border border-gray-100/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className={`${shimmer} w-9 h-9 rounded-xl`} />
                <div>
                  <div className={`${shimmer} h-4 w-40 rounded-md mb-1.5`} />
                  <div className={`${shimmer} h-3 w-56 rounded-md`} />
                </div>
              </div>
              <div className={`${shimmer} h-5 w-20 rounded-md`} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="light-canvas min-h-screen">
      {/* Fase 4a — Premium hero con aurora radial + prism delimiter */}
      <div className="relative overflow-hidden rounded-3xl mb-6">
        {/* Aurora radial background — sutil, no estridente */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(1200px circle at 10% -10%, rgba(20,184,166,0.10), transparent 40%), radial-gradient(900px circle at 90% 110%, rgba(168,85,247,0.08), transparent 45%), linear-gradient(180deg, #ffffff 0%, #fafbfc 100%)",
          }}
        />
        {/* Prism delimiter — fina linea con gradient bajo */}
        <div
          aria-hidden
          className="absolute bottom-0 left-6 right-6 h-px pointer-events-none"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(20,184,166,0.35) 18%, rgba(99,102,241,0.45) 50%, rgba(168,85,247,0.35) 82%, transparent 100%)",
          }}
        />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6">
          <div>
            <h2 className="text-[28px] font-semibold tracking-tight text-gray-900 leading-tight">
              Costos Operativos
            </h2>
            <p className="text-sm text-gray-500 mt-1 max-w-xl">
              Costos que no vienen del ecommerce — mensajerias, sueldos, herramientas, impuestos.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Fase 4c — Custom month selector (chevron prev · label · chevron next · hidden native) */}
            <div className="flex items-center bg-white/80 backdrop-blur border border-gray-200 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_1px_1px_rgba(15,23,42,0.02)] hover:shadow-[0_2px_4px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.04)] transition-all overflow-hidden">
              <button
                type="button"
                onClick={() => setCostMonth(addMonthsToStr(costMonth, -1))}
                className="px-2 py-2 text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-colors"
                aria-label="Mes anterior"
                title="Mes anterior"
              >
                <ChevronLeft className="w-4 h-4" strokeWidth={2.2} />
              </button>
              {/* Label clickable que dispara el native picker */}
              <label className="relative text-sm font-medium tabular-nums text-gray-700 px-3 py-2 cursor-pointer select-none min-w-[148px] text-center hover:text-gray-900 transition-colors">
                {formatMonthLabel(costMonth)}
                <input
                  type="month"
                  value={costMonth}
                  onChange={(e) => setCostMonth(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  aria-label="Seleccionar mes"
                />
              </label>
              <button
                type="button"
                onClick={() => setCostMonth(addMonthsToStr(costMonth, 1))}
                disabled={costMonth >= nowMonth}
                className="px-2 py-2 text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Mes siguiente"
                title={costMonth >= nowMonth ? "Ya estas en el mes actual" : "Mes siguiente"}
              >
                <ChevronRight className="w-4 h-4" strokeWidth={2.2} />
              </button>
            </div>

            {/* Fase 4c — Pill toggle para "Ajustar por IPC" (reemplaza checkbox nativo) */}
            <button
              type="button"
              role="switch"
              aria-checked={adjustByInflation}
              onClick={() => setAdjustByInflation((v) => !v)}
              title="Si esta activo, los items con auto-ajuste IPC se copian con factor de inflacion aplicado"
              className={`group inline-flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-xl border backdrop-blur transition-all ${
                adjustByInflation
                  ? "bg-teal-50/80 border-teal-200 text-teal-700 shadow-[0_1px_2px_rgba(20,184,166,0.12),0_1px_1px_rgba(20,184,166,0.08)]"
                  : "bg-white/80 border-gray-200 text-gray-500 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:text-gray-700"
              }`}
            >
              <span
                className={`relative inline-flex w-8 h-4 rounded-full transition-colors ${
                  adjustByInflation ? "bg-teal-500" : "bg-gray-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-transform duration-200 ${
                    adjustByInflation ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </span>
              Ajustar por IPC
            </button>

            {/* Fase 4c — Copiar mes anterior con icono lucide */}
            <button
              onClick={copyPreviousMonth}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 bg-white/80 backdrop-blur border border-gray-200 rounded-xl text-gray-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-[0_4px_12px_rgba(15,23,42,0.08),0_2px_4px_rgba(15,23,42,0.04)] hover:-translate-y-[1px] active:translate-y-0 transition-all"
            >
              <Copy className="w-3.5 h-3.5" strokeWidth={2.2} />
              Copiar mes anterior
            </button>
          </div>
        </div>
      </div>

      {/* Auto-copy banner for empty months */}
      {showCopyBanner && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-amber-800">Este mes no tiene costos cargados</p>
            <p className="text-xs text-amber-600 mt-0.5">Podes copiar los costos fijos del mes anterior como base y ajustarlos.</p>
          </div>
          <button
            onClick={async () => {
              setAutoCopying(true);
              await copyPreviousMonth();
              setShowCopyBanner(false);
              setAutoCopying(false);
            }}
            disabled={autoCopying}
            className="text-sm bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 whitespace-nowrap ml-4"
          >
            {autoCopying ? "Copiando..." : "Copiar del mes anterior"}
          </button>
        </div>
      )}

      {/* Fase 4a — KPI strip premium (4 cards: Total, Fijo%, Variable%, Items con IPC) */}
      {data && (() => {
        const sFixed = data.summary?.fixed || 0;
        const sVar = data.summary?.variable || 0;
        const sSemi = data.summary?.semiFixed || 0;
        const sTot = sFixed + sVar + sSemi;
        const fixedPct = sTot > 0 ? Math.round((sFixed / sTot) * 100) : 0;
        const variablePct = sTot > 0 ? Math.round((sVar / sTot) * 100) : 0;
        // Items con autoInflationAdjust=true en el mes
        const ipcItems = (data.categories || []).reduce(
          (acc, c) => acc + (c.items || []).filter((i) => i.autoInflationAdjust).length,
          0
        );
        const totalItems = (data.categories || []).reduce(
          (acc, c) => acc + (c.items || []).length,
          0
        );

        const kpiCardBase =
          "relative overflow-hidden bg-white rounded-2xl p-5 border border-gray-100/80 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_1px_1px_rgba(15,23,42,0.02)] hover:shadow-[0_4px_16px_rgba(15,23,42,0.06),0_2px_4px_rgba(15,23,42,0.04)] hover:-translate-y-[1px] transition-all";

        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {/* KPI 1 — Total Mensual (accent teal) */}
            <div className={kpiCardBase}>
              <div
                aria-hidden
                className="absolute inset-x-0 top-0 h-[2px]"
                style={{
                  background:
                    "linear-gradient(90deg, transparent 0%, #14b8a6 35%, #14b8a6 65%, transparent 100%)",
                }}
              />
              <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">
                Total Mensual
              </span>
              <p className="text-2xl font-semibold tracking-tight text-gray-900 mt-1.5 tabular-nums">
                <CountUp
                  value={Number(data.grandTotal) || 0}
                  format={(n) => formatARS(Math.round(n))}
                />
              </p>
              <p className="text-[11px] text-gray-400 mt-1 tabular-nums">
                {costMonth} · {totalItems} items
              </p>
            </div>

            {/* KPI 2 — % Fijo (accent teal) */}
            <div className={kpiCardBase}>
              <div
                aria-hidden
                className="absolute inset-x-0 top-0 h-[2px]"
                style={{
                  background:
                    "linear-gradient(90deg, transparent 0%, #14b8a6 35%, #14b8a6 65%, transparent 100%)",
                }}
              />
              <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">
                % Fijo
              </span>
              <p className="text-2xl font-semibold tracking-tight text-gray-900 mt-1.5 tabular-nums">
                <CountUp
                  value={fixedPct}
                  format={(n) => `${Math.round(n)}%`}
                />
              </p>
              <p className="text-[11px] text-gray-400 mt-1 tabular-nums">
                {formatARS(sFixed)}
              </p>
            </div>

            {/* KPI 3 — % Variable (accent amber) */}
            <div className={kpiCardBase}>
              <div
                aria-hidden
                className="absolute inset-x-0 top-0 h-[2px]"
                style={{
                  background:
                    "linear-gradient(90deg, transparent 0%, #f59e0b 35%, #f59e0b 65%, transparent 100%)",
                }}
              />
              <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">
                % Variable
              </span>
              <p className="text-2xl font-semibold tracking-tight text-gray-900 mt-1.5 tabular-nums">
                <CountUp
                  value={variablePct}
                  format={(n) => `${Math.round(n)}%`}
                />
              </p>
              <p className="text-[11px] text-gray-400 mt-1 tabular-nums">
                {formatARS(sVar)}
              </p>
            </div>

            {/* KPI 4 — Items con IPC (accent violet) */}
            <div className={kpiCardBase}>
              <div
                aria-hidden
                className="absolute inset-x-0 top-0 h-[2px]"
                style={{
                  background:
                    "linear-gradient(90deg, transparent 0%, #a855f7 35%, #a855f7 65%, transparent 100%)",
                }}
              />
              <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">
                Con ajuste IPC
              </span>
              <p className="text-2xl font-semibold tracking-tight text-gray-900 mt-1.5 tabular-nums">
                <CountUp
                  value={ipcItems}
                  format={(n) => `${Math.round(n)}`}
                />
                <span className="text-sm font-normal text-gray-400 ml-1">
                  / {totalItems}
                </span>
              </p>
              <p className="text-[11px] text-gray-400 mt-1">
                {ipcItems === 0 ? "Ningun item auto-ajusta" : "Copiar aplica IPC"}
              </p>
            </div>
          </div>
        );
      })()}

      {/* Fase 3c — Ratio Fijo vs Variable vs Semi-fijo */}
      {data && data.summary && data.grandTotal > 0 && (() => {
        const { fixed = 0, variable = 0, semiFixed = 0 } = data.summary;
        const tot = fixed + variable + semiFixed;
        if (tot === 0) return null;
        const fixedPct = Math.round((fixed / tot) * 100);
        const variablePct = Math.round((variable / tot) * 100);
        const semiPct = Math.max(0, 100 - fixedPct - variablePct);
        // Racional del verdicto:
        //   fixedPct >= 70  -> demasiado fijo (poca flexibilidad, palanca baja)
        //   fixedPct <= 40  -> estructura flexible (buena palanca operativa)
        //   mid             -> mix saludable
        let verdict = "Mix saludable";
        let verdictColor = "text-gray-500";
        if (fixedPct >= 70) {
          verdict = "Demasiado fijo — poca flexibilidad ante bajas de venta";
          verdictColor = "text-amber-600";
        } else if (fixedPct <= 40) {
          verdict = "Estructura flexible — buena palanca operativa";
          verdictColor = "text-teal-600";
        }
        return (
          <div className="bg-white rounded-xl p-4 shadow-sm mb-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-xs font-medium text-gray-500 uppercase">Composicion Fijo vs Variable</span>
                <p className="text-xs text-gray-400 mt-0.5">Taxonomia — como se comportan tus costos cuando suben o bajan las ventas</p>
              </div>
              <span className={`text-xs font-medium ${verdictColor}`}>{verdict}</span>
            </div>
            {/* Barra de composicion */}
            <div className="w-full h-3 rounded-full overflow-hidden flex bg-gray-100">
              {fixedPct > 0 && (
                <div
                  className="bg-teal-500"
                  style={{ width: `${fixedPct}%` }}
                  title={`Fijos: ${formatARS(fixed)} (${fixedPct}%)`}
                />
              )}
              {semiPct > 0 && (
                <div
                  className="bg-violet-400"
                  style={{ width: `${semiPct}%` }}
                  title={`Semi-fijos: ${formatARS(semiFixed)} (${semiPct}%)`}
                />
              )}
              {variablePct > 0 && (
                <div
                  className="bg-amber-500"
                  style={{ width: `${variablePct}%` }}
                  title={`Variables: ${formatARS(variable)} (${variablePct}%)`}
                />
              )}
            </div>
            {/* Leyenda detallada */}
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-teal-500" />
                  <span className="text-xs font-medium text-gray-600">Fijos</span>
                  <span className="text-xs text-gray-400">{fixedPct}%</span>
                </div>
                <p className="text-sm font-mono font-semibold text-gray-800 mt-0.5">{formatARS(fixed)}</p>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-violet-400" />
                  <span className="text-xs font-medium text-gray-600">Semi-fijos</span>
                  <span className="text-xs text-gray-400">{semiPct}%</span>
                </div>
                <p className="text-sm font-mono font-semibold text-gray-800 mt-0.5">{formatARS(semiFixed)}</p>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-xs font-medium text-gray-600">Variables</span>
                  <span className="text-xs text-gray-400">{variablePct}%</span>
                </div>
                <p className="text-sm font-mono font-semibold text-gray-800 mt-0.5">{formatARS(variable)}</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Fase 4b — Category sections premium (lucide icons + multi-layer shadow + stagger) */}
      <div className="space-y-3">
        {CATEGORIES.map((cat, idx) => {
          const catData = data?.categories?.find(c => c.category === cat.key);
          const items = catData?.items || [];
          const total = catData?.total || 0;
          const isExpanded = expandedCat === cat.key;
          const grouped = cat.hasSubcategory ? groupBySubcategory(items) : null;
          const Icon = CATEGORY_ICONS[cat.key] || Package;
          const accent = CATEGORY_ACCENTS[cat.key] || CATEGORY_ACCENTS.OTROS;

          // Pre-resumen cuando esta collapsed: "N items · $X · Y% del total"
          const grandTotal = Number(data?.grandTotal) || 0;
          let autoTotalForCat = 0;
          if (autoCosts && cat.key === "PLATAFORMAS") {
            autoTotalForCat = (autoCosts.platform?.items || []).reduce((s, i) => s + i.amount, 0);
          } else if (autoCosts && cat.key === "MERMA") {
            autoTotalForCat = (autoCosts.merma?.items || []).reduce((s, i) => s + i.amount, 0);
          }
          const displayTotal = total + autoTotalForCat;
          const catPctOfTotal = grandTotal > 0 ? Math.round((displayTotal / grandTotal) * 100) : 0;

          return (
            <div
              key={cat.key}
              className="group relative overflow-hidden bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_1px_1px_rgba(15,23,42,0.02)] hover:shadow-[0_4px_16px_rgba(15,23,42,0.06),0_2px_4px_rgba(15,23,42,0.04)] transition-all animate-fade-in-up"
              style={{ animationDelay: `${idx * 45}ms`, animationDuration: "450ms" }}
            >
              {/* Prism delimiter arriba con color de categoria */}
              <div
                aria-hidden
                className="absolute inset-x-0 top-0 h-[2px] pointer-events-none opacity-70 group-hover:opacity-100 transition-opacity"
                style={{
                  background: `linear-gradient(90deg, transparent 0%, ${accent.bar} 30%, ${accent.bar} 70%, transparent 100%)`,
                }}
              />
              {/* Category header */}
              <button
                onClick={() => setExpandedCat(isExpanded ? null : cat.key)}
                className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50/60 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-xl ${accent.bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-4.5 h-4.5 ${accent.icon}`} strokeWidth={2} />
                  </div>
                  <div className="text-left min-w-0">
                    <span className="text-sm font-semibold text-gray-900 tracking-tight">{cat.label}</span>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{cat.description}</p>
                  </div>
                  {items.length > 0 && (
                    <span className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full tabular-nums shrink-0">
                      {items.length}
                    </span>
                  )}
                  {cat.key === "PLATAFORMAS" && (
                    <span
                      className="hidden md:inline-flex items-center gap-1 text-[11px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200 shrink-0"
                      title="Comisiones, envios y retenciones de MercadoLibre se calculan automaticamente desde las ordenes sincronizadas"
                    >
                      <Sparkles className="w-3 h-3" />
                      Auto: Comisiones ML
                    </span>
                  )}
                  {cat.key === "MERMA" && (
                    <span
                      className="hidden md:inline-flex items-center gap-1 text-[11px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200 shrink-0"
                      title="Ordenes canceladas y devueltas se detectan automaticamente desde las ordenes sincronizadas"
                    >
                      <Sparkles className="w-3 h-3" />
                      Auto: Devoluciones
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {displayTotal > 0 && (
                    <div className="flex flex-col items-end">
                      <span className="text-sm font-semibold text-gray-900 tabular-nums tracking-tight">
                        {formatARS(displayTotal)}
                      </span>
                      {!isExpanded && grandTotal > 0 && (
                        <span className="text-[10px] text-gray-400 tabular-nums">
                          {catPctOfTotal}% del total
                        </span>
                      )}
                    </div>
                  )}
                  <ChevronDown
                    className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                    strokeWidth={2.2}
                  />
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

                  {/* Shipping rates panel — inside LOGISTICA */}
                  {cat.key === "LOGISTICA" && (
                    <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50/50 to-transparent">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700">Tarifas de Envio por Codigo Postal</h4>
                          <p className="text-xs text-gray-400">
                            Carga tarifas por mensajeria y CP para calcular el costo real de cada envio
                          </p>
                        </div>
                      </div>

                      {/* Carrier selector + actions */}
                      <div className="flex items-center gap-2 flex-wrap mb-3">
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

                      {/* Import result */}
                      {importResult && (
                        <div className={`p-3 rounded-lg mb-3 ${importResult.errors?.length > 0 ? "bg-amber-50 border border-amber-200" : "bg-green-50 border border-green-200"}`}>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-700">
                              {importResult.imported} tarifas importadas de {importResult.totalRows} filas
                            </span>
                            <button onClick={() => setImportResult(null)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                          </div>
                          {importResult.errors?.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {importResult.errors.slice(0, 5).map((err, i) => (
                                <p key={i} className="text-xs text-amber-700">Fila {err.row}: {err.field} — {err.message}</p>
                              ))}
                              {importResult.errors.length > 5 && (
                                <p className="text-xs text-amber-500">...y {importResult.errors.length - 5} errores mas</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Filter by carrier */}
                      {shippingByCarrier.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap mb-3">
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
                        <div className="py-6 text-center text-gray-400 text-sm">Cargando tarifas...</div>
                      ) : filteredRates.length === 0 ? (
                        <div className="py-6 text-center">
                          <p className="text-gray-400 text-sm">No hay tarifas cargadas</p>
                          <p className="text-xs text-gray-300 mt-1">Selecciona un tipo de envio, descarga la plantilla, completala y subila</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border border-gray-200">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Mensajeria</th>
                                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Servicio</th>
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
                  )}

                  {/* VTEX Config + Payment Fees — only for PLATAFORMAS */}
                  {cat.key === "PLATAFORMAS" && (
                    <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50/30 to-transparent">
                      {/* VTEX Commission */}
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-semibold text-indigo-700">Comisiones de plataforma VTEX</span>
                        <span className="text-xs bg-indigo-100 text-indigo-500 px-2 py-0.5 rounded-full">configurable</span>
                      </div>
                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-500">Comision variable</label>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="20"
                              className="w-16 text-sm border border-gray-200 rounded px-2 py-1 text-right font-mono"
                              value={platformConfig.vtexConfig?.variableRate ?? 2.5}
                              onChange={(e) => setPlatformConfig((prev) => ({
                                ...prev,
                                vtexConfig: { ...prev.vtexConfig, variableRate: parseFloat(e.target.value) || 0 },
                              }))}
                            />
                            <span className="text-xs text-gray-400">%</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-500">Costo fijo mensual</label>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-400">$</span>
                            <input
                              type="number"
                              step="100"
                              min="0"
                              className="w-24 text-sm border border-gray-200 rounded px-2 py-1 text-right font-mono"
                              value={platformConfig.vtexConfig?.fixedMonthlyCost ?? 0}
                              onChange={(e) => setPlatformConfig((prev) => ({
                                ...prev,
                                vtexConfig: { ...prev.vtexConfig, fixedMonthlyCost: parseFloat(e.target.value) || 0 },
                              }))}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Payment Processing Fees */}
                      <div className="mt-5 pt-4 border-t border-indigo-100/50">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-indigo-700">Comisiones de medios de pago</span>
                          <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full border border-amber-200">valores estimados — ajustalos a tu acuerdo</span>
                        </div>
                        <p className="text-xs text-gray-400 mb-3">
                          Estos porcentajes son estimaciones de mercado. Si tenes un acuerdo especifico con tu procesador de pagos, modifica los valores para que el P&L refleje tu costo real.
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {[
                            { key: "CREDIT_CARD", label: "Tarjeta credito", defaultRate: 3.5 },
                            { key: "DEBIT_CARD", label: "Tarjeta debito", defaultRate: 2.0 },
                            { key: "BANK_TRANSFER", label: "Transferencia", defaultRate: 0.5 },
                            { key: "CASH", label: "Efectivo", defaultRate: 0 },
                          ].map((pm) => (
                            <div key={pm.key} className="flex items-center gap-1.5">
                              <label className="text-xs text-gray-500 w-24 truncate" title={pm.label}>{pm.label}</label>
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                max="20"
                                className="w-14 text-sm border border-gray-200 rounded px-1.5 py-1 text-right font-mono"
                                value={platformConfig.paymentFeesConfig?.[pm.key] ?? pm.defaultRate}
                                onChange={(e) => setPlatformConfig((prev) => ({
                                  ...prev,
                                  paymentFeesConfig: {
                                    ...prev.paymentFeesConfig,
                                    [pm.key]: parseFloat(e.target.value) || 0,
                                  },
                                }))}
                              />
                              <span className="text-xs text-gray-400">%</span>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-gray-300 mt-2">Las comisiones de MercadoLibre ya incluyen el costo de Mercado Pago, por lo que solo se aplican a ventas VTEX.</p>
                      </div>

                      {/* Single save button for all platform config */}
                      <div className="mt-4 flex items-center justify-between">
                        <p className="text-xs text-gray-300">Estos valores se usan en el P&L para calcular costos de plataforma y procesamiento de pagos.</p>
                        <button
                          onClick={() => savePlatformConfig({
                            vtexConfig: platformConfig.vtexConfig,
                            paymentFeesConfig: platformConfig.paymentFeesConfig,
                          })}
                          disabled={platformConfigLoading}
                          className="text-xs bg-indigo-600 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                        >
                          {platformConfigLoading ? "Guardando..." : "Guardar configuracion"}
                        </button>
                      </div>
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
                                  {item.impactType === "low" && (
                                    <span className="ml-1 text-xs bg-green-50 text-green-500 px-1.5 py-0.5 rounded-full">
                                      sin perdida
                                    </span>
                                  )}
                                  {item.impactType === "high" && (
                                    <span className="ml-1 text-xs bg-red-50 text-red-500 px-1.5 py-0.5 rounded-full">
                                      perdida real
                                    </span>
                                  )}
                                </div>
                                <div className="text-right">
                                  <span className={`font-mono font-bold ${item.impactType === "low" ? "text-gray-400 line-through" : "text-gray-800"}`}>{formatARS(item.amount)}</span>
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
                            {/* Fase 3d — checkbox "seleccionar todos" */}
                            <th className="px-3 py-2 w-8">
                              <input
                                type="checkbox"
                                className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                                checked={items.length > 0 && items.every((i) => selectedIds.has(i.id))}
                                onChange={() => selectAllInCategory(items)}
                                title="Seleccionar todos de esta categoria"
                              />
                            </th>
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
                            <tr
                              key={item.id}
                              className={`group hover:bg-gray-50/50 ${
                                selectedIds.has(item.id) ? "bg-teal-50/40" : ""
                              }`}
                            >
                              {/* Fase 3d — checkbox por fila */}
                              <td className="px-3 py-2.5">
                                <input
                                  type="checkbox"
                                  className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                                  checked={selectedIds.has(item.id)}
                                  onChange={() => toggleSelection(item.id)}
                                />
                              </td>
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
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                                    item.rateType === "PER_SHIPMENT"
                                      ? "bg-blue-50 text-blue-600"
                                      : item.rateType === "PERCENTAGE"
                                      ? "bg-purple-50 text-purple-600"
                                      : item.rateType === "DRIVER_BASED"
                                      ? "bg-indigo-50 text-indigo-600"
                                      : "bg-gray-100 text-gray-600"
                                  }`}>
                                    {RATE_TYPE_LABELS[item.rateType] || item.rateType}
                                    {item.rateType === "PERCENTAGE" && item.rateBase && (
                                      <span className="ml-1 text-gray-400">
                                        ({RATE_BASE_OPTIONS.find(o => o.value === item.rateBase)?.label || item.rateBase})
                                      </span>
                                    )}
                                  </span>
                                  {/* Fase 3 — chip de behavior (Fijo/Variable/Semi-fijo).
                                      Si no tiene behavior cargado, cae al mapeo desde `type` legacy. */}
                                  {(() => {
                                    const b = effectiveBehavior(item);
                                    return (
                                      <span
                                        className={`text-xs px-2 py-0.5 rounded-full border ${BEHAVIOR_STYLES[b]}`}
                                        title={item.behavior ? "Comportamiento configurado" : "Inferido desde tipo legacy"}
                                      >
                                        {BEHAVIOR_LABELS[b]}
                                      </span>
                                    );
                                  })()}
                                  {/* Fase 3e — badge IPC auto si esta activo */}
                                  {item.autoInflationAdjust && (
                                    <span
                                      className="text-xs px-2 py-0.5 rounded-full border bg-rose-50 text-rose-700 border-rose-200"
                                      title="Al copiar este mes al proximo, se ajustara por IPC automaticamente"
                                    >
                                      IPC auto
                                    </span>
                                  )}
                                </div>
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
                                <div className="flex items-center justify-end gap-2">
                                  {/* Fase 3f — boton de edicion de formula (solo si DRIVER_BASED) */}
                                  {item.rateType === "DRIVER_BASED" && (
                                    <button
                                      onClick={() => openFormulaEditor(item, cat.key)}
                                      className="text-xs px-2 py-0.5 rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                                      title="Editar drivers y formula"
                                    >
                                      ƒx
                                    </button>
                                  )}
                                  <button
                                    onClick={() => deleteCost(item.id)}
                                    className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                    title="Eliminar"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Fase 4d — Empty state premium con SVG ilustrativo */}
                  {items.length === 0 && addingTo !== cat.key && (
                    <div className="px-5 py-10 flex flex-col items-center text-center">
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
                        style={{
                          background: `linear-gradient(135deg, ${accent.bar}18 0%, ${accent.bar}08 100%)`,
                        }}
                      >
                        <Icon className={`w-5 h-5 ${accent.icon}`} strokeWidth={1.8} />
                      </div>
                      <p className="text-sm font-medium text-gray-700">
                        Sin costos en {cat.label.toLowerCase()}
                      </p>
                      <p className="text-xs text-gray-400 mt-1 max-w-xs">
                        Agrega tu primer costo o copia del mes anterior para arrancar.
                      </p>
                      <button
                        onClick={() => setAddingTo(cat.key)}
                        className="mt-3 text-xs font-medium text-teal-700 hover:text-teal-800 bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Agregar primer costo
                      </button>
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
                        {/* Fase 3 — behavior selector: clasifica el costo como
                            Fijo (no varia con ventas), Variable (escala con
                            ventas) o Semi-fijo (fijo hasta cierto volumen). */}
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Comportamiento</label>
                          <select
                            value={form.behavior}
                            onChange={e => setForm({ ...form, behavior: e.target.value })}
                            className="text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-600 focus:border-blue-400 focus:outline-none"
                          >
                            <option value="FIXED">{BEHAVIOR_LABELS.FIXED}</option>
                            <option value="VARIABLE">{BEHAVIOR_LABELS.VARIABLE}</option>
                            <option value="SEMI_FIXED">{BEHAVIOR_LABELS.SEMI_FIXED}</option>
                          </select>
                        </div>
                        {/* Fase 3e — marca el costo como auto-ajustable por IPC */}
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">IPC auto</label>
                          <label className="flex items-center h-[38px] gap-1.5 text-sm text-gray-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={form.autoInflationAdjust}
                              onChange={(e) => setForm({ ...form, autoInflationAdjust: e.target.checked })}
                              className="rounded border-gray-300 text-rose-600 focus:ring-rose-500"
                            />
                            <span className="text-xs">Ajusta por IPC</span>
                          </label>
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
                        {/* Fase 3f — cuando rateType es DRIVER_BASED, el monto
                            se calcula con la formula (no se ingresa aca). */}
                        {form.rateType !== "DRIVER_BASED" && (
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
                        )}
                        <div className="flex items-center gap-2">
                          {form.rateType === "DRIVER_BASED" ? (
                            <button
                              onClick={() => openFormulaCreator(cat.key)}
                              disabled={!form.name.trim()}
                              className="text-sm px-4 py-2 rounded-lg font-medium text-white disabled:opacity-50 transition-opacity"
                              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
                            >
                              Siguiente: configurar formula
                            </button>
                          ) : (
                            <button
                              onClick={() => addCost(cat.key)}
                              disabled={!form.name.trim() || !form.amount}
                              className="text-sm px-4 py-2 rounded-lg font-medium text-white disabled:opacity-50 transition-opacity"
                              style={{ background: "linear-gradient(135deg, #FF5E1A, #FF8A50)" }}
                            >
                              Guardar
                            </button>
                          )}
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
                          // Default de behavior segun categoria: LOGISTICA y MERMA
                          // tienden a ser VARIABLE (escalan con ventas), el resto FIXED.
                          const defaultBehavior = (cat.key === "LOGISTICA" || cat.key === "MERMA")
                            ? "VARIABLE"
                            : "FIXED";
                          setForm({
                            ...form,
                            rateType: cat.rateTypes[0] || "FIXED_MONTHLY",
                            subcategory: "",
                            name: "",
                            serviceCode: "",
                            amount: "",
                            socialCharges: "",
                            behavior: defaultBehavior,
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

      {/* Fase 3d — Bulk action bar (sticky flotante) */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-white border border-gray-200 shadow-xl rounded-2xl px-5 py-3 z-40 flex items-center gap-3 flex-wrap max-w-[95vw]">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full">
              {selectedIds.size} seleccionado{selectedIds.size === 1 ? "" : "s"}
            </span>
            <button
              onClick={clearSelection}
              className="text-xs text-gray-400 hover:text-gray-600"
              title="Limpiar seleccion"
            >
              Limpiar
            </button>
          </div>
          <div className="h-5 w-px bg-gray-200" />
          {/* Operacion */}
          <select
            value={bulkOp}
            onChange={(e) => {
              setBulkOp(e.target.value);
              setBulkValue("");
            }}
            className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 focus:border-teal-400 focus:outline-none"
          >
            <option value="">Elegir accion...</option>
            <option value="pct">Aumentar %</option>
            <option value="behavior">Cambiar comportamiento</option>
            <option value="fiscal">Cambiar tipo fiscal</option>
          </select>
          {/* Valor dinamico segun op */}
          {bulkOp === "pct" && (
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="0.5"
                placeholder="Ej: 30"
                value={bulkValue}
                onChange={(e) => setBulkValue(e.target.value)}
                className="w-20 text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-right font-mono focus:border-teal-400 focus:outline-none"
              />
              <span className="text-xs text-gray-400">%</span>
            </div>
          )}
          {bulkOp === "behavior" && (
            <select
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 focus:border-teal-400 focus:outline-none"
            >
              <option value="">Elegir...</option>
              <option value="FIXED">Fijo</option>
              <option value="VARIABLE">Variable</option>
              <option value="SEMI_FIXED">Semi-fijo</option>
            </select>
          )}
          {bulkOp === "fiscal" && (
            <select
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 focus:border-teal-400 focus:outline-none"
            >
              <option value="">Elegir...</option>
              <option value="DEDUCTIBLE_WITH_IVA">Deducible con IVA</option>
              <option value="DEDUCTIBLE_NO_IVA">Deducible sin IVA</option>
              <option value="NON_DEDUCTIBLE">No deducible</option>
            </select>
          )}
          <button
            onClick={runBulkOperation}
            disabled={!bulkOp || !bulkValue || bulkRunning}
            className="text-sm px-4 py-1.5 rounded-lg font-medium text-white disabled:opacity-50 transition-opacity"
            style={{ background: "linear-gradient(135deg, #FF5E1A, #FF8A50)" }}
          >
            {bulkRunning ? "Aplicando..." : "Aplicar"}
          </button>
        </div>
      )}

      {/* Fase 3f — Modal de editor de formula driver-based */}
      {formulaModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => {
            // click en el backdrop cierra el modal
            if (e.target === e.currentTarget) closeFormulaEditor();
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-[720px] max-w-[95vw] max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div
              className="px-6 py-4 border-b border-gray-100 flex items-center justify-between"
              style={{ background: "linear-gradient(135deg, #6366f110, #8b5cf610)" }}
            >
              <div>
                <h3 className="text-lg font-semibold text-gray-800">
                  {formulaModal.mode === "edit" ? "Editar formula" : "Nueva formula"}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Defini variables (drivers) y una expresion matematica para calcular el monto
                </p>
              </div>
              <button
                onClick={closeFormulaEditor}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                title="Cerrar"
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Drivers */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">
                    Drivers (variables)
                  </label>
                  <button
                    onClick={addFormulaDriver}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    + Agregar driver
                  </button>
                </div>
                <div className="space-y-2">
                  {formulaModal.drivers.map((d: Driver, idx: number) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="clave (ej: headcount)"
                        value={d.key}
                        onChange={(e) =>
                          updateFormulaDriver(idx, {
                            key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
                          })
                        }
                        className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 w-36 font-mono focus:border-indigo-400 focus:outline-none"
                      />
                      <input
                        type="text"
                        placeholder="etiqueta (ej: Headcount)"
                        value={d.label || ""}
                        onChange={(e) => updateFormulaDriver(idx, { label: e.target.value })}
                        className="flex-1 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:border-indigo-400 focus:outline-none"
                      />
                      <input
                        type="number"
                        placeholder="valor"
                        value={d.value}
                        onChange={(e) =>
                          updateFormulaDriver(idx, {
                            value: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 w-28 text-right font-mono focus:border-indigo-400 focus:outline-none"
                      />
                      <input
                        type="text"
                        placeholder="unidad"
                        value={d.unit || ""}
                        onChange={(e) => updateFormulaDriver(idx, { unit: e.target.value })}
                        className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 w-24 focus:border-indigo-400 focus:outline-none"
                      />
                      <button
                        onClick={() => removeFormulaDriver(idx)}
                        disabled={formulaModal.drivers.length <= 1}
                        className="text-gray-300 hover:text-red-500 disabled:opacity-20 disabled:cursor-not-allowed transition-colors px-1"
                        title="Eliminar driver"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Formula textarea */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">
                  Formula
                </label>
                <textarea
                  placeholder="Ej: headcount * salario * 1.30"
                  value={formulaModal.formula}
                  onChange={(e) =>
                    setFormulaModal((prev: any) => ({ ...prev, formula: e.target.value }))
                  }
                  rows={3}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-mono focus:border-indigo-400 focus:outline-none"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Operadores: + - * / ( ) · Funciones: min, max, abs, round, ceil, floor, sqrt, pow
                </p>
              </div>

              {/* Preview */}
              <div
                className={`rounded-xl p-4 border ${
                  formulaPreview?.ok
                    ? "bg-emerald-50 border-emerald-200"
                    : "bg-rose-50 border-rose-200"
                }`}
              >
                <div className="text-xs font-medium text-gray-600 mb-1">Preview</div>
                {formulaPreview?.ok ? (
                  <div className="text-2xl font-semibold text-emerald-700 font-mono">
                    {formatARS(Number(formulaPreview.value))}
                  </div>
                ) : (
                  <div className="text-sm text-rose-700">
                    {formulaPreview?.error || "Completa drivers y formula"}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-end gap-2">
              <button
                onClick={closeFormulaEditor}
                disabled={formulaSaving}
                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={saveFormulaEditor}
                disabled={!formulaPreview?.ok || formulaSaving}
                className="text-sm px-4 py-2 rounded-lg font-medium text-white disabled:opacity-40 transition-opacity"
                style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
              >
                {formulaSaving
                  ? "Guardando..."
                  : formulaModal.mode === "edit"
                  ? "Guardar cambios"
                  : "Crear costo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fase 4d — Toast premium: bottom-right, slide-in, multi-layer shadow */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 max-w-sm animate-fade-in-up"
          style={{ animationDuration: "260ms" }}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2.5 bg-gray-900 text-white pl-3 pr-4 py-2.5 rounded-xl text-sm font-medium shadow-[0_12px_40px_rgba(15,23,42,0.18),0_4px_12px_rgba(15,23,42,0.12)]">
            <div className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse-live shrink-0" />
            <span className="flex-1">{toast}</span>
          </div>
        </div>
      )}
    </div>
  );
}
