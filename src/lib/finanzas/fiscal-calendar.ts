// ═══════════════════════════════════════════════════════════════════
// fiscal-calendar.ts — Fase 6 Fiscal
// ═══════════════════════════════════════════════════════════════════
// Puro TS. Sin DB, sin React. Define los defaults del calendario fiscal
// argentino y la logica de expansion a fechas concretas.
//
// El endpoint /api/finance/fiscal/calendar combina:
//   1. `buildDefaultObligations(fiscalProfile)` — defaults derivados.
//   2. `expandObligations(obligations, monthsAhead)` — expande a fechas.
//   3. Overrides de la tabla `fiscal_obligation_overrides`.
//
// Regla: las fechas base (dia 18-22 IVA, dia 20 Monotributo, etc.) son
// estables hace 15+ años. Los montos (categorias Monotributo, IIBB) los
// actualiza NitroSales via endpoint admin cuando AFIP los cambie — no
// requieren que el usuario haga nada.
// ═══════════════════════════════════════════════════════════════════

export type FiscalRegime = "MONOTRIBUTO" | "RESPONSABLE_INSCRIPTO";
export type ObligationCategory =
  | "MONOTRIBUTO"
  | "IVA"
  | "IIBB"
  | "GANANCIAS"
  | "PERCEPCION_ML"
  | "CUSTOM";
export type ObligationFrequency =
  | "MONTHLY"
  | "BIMONTHLY"
  | "QUARTERLY"
  | "SEMIANNUAL"
  | "YEARLY";

export interface FiscalProfileInput {
  taxRegime: FiscalRegime;
  monotributoCategory?: string; // A-K
  province?: string;
  hasConvenioMultilateral?: boolean;
  additionalProvinces?: string[];
  sellsOnMarketplace?: boolean;
  cuitLastDigit?: number; // 0..9 — define dia exacto IVA y Monotributo
}

export interface BaseObligation {
  defaultKey: string;                  // ID estable (para overrides)
  name: string;                        // display name
  category: ObligationCategory;
  frequency: ObligationFrequency;
  dueDay: number;                      // 1..31, 99 = ultimo
  yearlyMonth?: number;                // 1..12 si YEARLY
  amount: number | null;               // null = a calcular on-the-fly
  amountSource: "MANUAL" | "AUTO_MONOTRIBUTO" | "AUTO_PROFILE";
  note?: string;
  regime: FiscalRegime | "BOTH";
}

// ─────────────────────────────────────────────────────────────────
// 1. Tablas de montos (sincronizado con fiscal-profile/route.ts)
//    Se puede updatear via endpoint admin cuando cambian categorias.
// ─────────────────────────────────────────────────────────────────
export const MONOTRIBUTO_AMOUNTS: Record<string, number> = {
  A: 14415,
  B: 16344,
  C: 18799,
  D: 23646,
  E: 31557,
  F: 38276,
  G: 45454,
  H: 78042,
  I: 105765,
  J: 121818,
  K: 138233,
};

export const MONOTRIBUTO_LIMITS: Record<string, number> = {
  A: 2108288,
  B: 3133941,
  C: 4387518,
  D: 5449094,
  E: 6416528,
  F: 8020660,
  G: 9624792,
  H: 11916410,
  I: 13337213,
  J: 15285088,
  K: 16957968,
};

// IIBB primary rate por provincia (% sobre ventas)
export const IIBB_RATES: Record<string, number> = {
  CABA: 3.0,
  BUENOS_AIRES: 2.5,
  CORDOBA: 4.75,
  SANTA_FE: 3.6,
  MENDOZA: 2.5,
  TUCUMAN: 3.5,
  ENTRE_RIOS: 3.0,
  SALTA: 3.0,
  MISIONES: 3.0,
  CORRIENTES: 2.0,
  CHACO: 3.5,
  SAN_JUAN: 2.5,
  SAN_LUIS: 2.5,
  SANTIAGO_DEL_ESTERO: 3.0,
  JUJUY: 4.0,
  RIO_NEGRO: 2.0,
  NEUQUEN: 3.0,
  FORMOSA: 1.0,
  CHUBUT: 3.0,
  LA_PAMPA: 2.5,
  CATAMARCA: 3.0,
  LA_RIOJA: 2.5,
  SANTA_CRUZ: 2.0,
  TIERRA_DEL_FUEGO: 1.5,
};

export const PROVINCE_NAMES: Record<string, string> = {
  CABA: "Ciudad de Buenos Aires",
  BUENOS_AIRES: "Buenos Aires",
  CORDOBA: "Córdoba",
  SANTA_FE: "Santa Fe",
  MENDOZA: "Mendoza",
  TUCUMAN: "Tucumán",
  ENTRE_RIOS: "Entre Ríos",
  SALTA: "Salta",
  MISIONES: "Misiones",
  CORRIENTES: "Corrientes",
  CHACO: "Chaco",
  SAN_JUAN: "San Juan",
  SAN_LUIS: "San Luis",
  SANTIAGO_DEL_ESTERO: "Santiago del Estero",
  JUJUY: "Jujuy",
  RIO_NEGRO: "Río Negro",
  NEUQUEN: "Neuquén",
  FORMOSA: "Formosa",
  CHUBUT: "Chubut",
  LA_PAMPA: "La Pampa",
  CATAMARCA: "Catamarca",
  LA_RIOJA: "La Rioja",
  SANTA_CRUZ: "Santa Cruz",
  TIERRA_DEL_FUEGO: "Tierra del Fuego",
};

// ─────────────────────────────────────────────────────────────────
// 2. Dia de vencimiento IVA segun terminacion CUIT (AFIP RG)
//    Monotributo: dia 20 sin importar CUIT.
//    IVA RI: escalonado 18-22 segun terminacion.
// ─────────────────────────────────────────────────────────────────
export function ivaDueDayByCuit(lastDigit: number | undefined): number {
  // Si no sabemos, default 20 (medio del rango).
  if (lastDigit === undefined) return 20;
  if (lastDigit >= 0 && lastDigit <= 1) return 18;
  if (lastDigit >= 2 && lastDigit <= 3) return 19;
  if (lastDigit >= 4 && lastDigit <= 5) return 20;
  if (lastDigit >= 6 && lastDigit <= 7) return 21;
  return 22;
}

// Dia de vencimiento Monotributo: siempre 20.
export const MONOTRIBUTO_DUE_DAY = 20;

// ─────────────────────────────────────────────────────────────────
// 3. buildDefaultObligations — core logica de derivacion
// ─────────────────────────────────────────────────────────────────
export function buildDefaultObligations(
  profile: FiscalProfileInput | null
): BaseObligation[] {
  const out: BaseObligation[] = [];
  if (!profile) return out;

  if (profile.taxRegime === "MONOTRIBUTO") {
    const cat = profile.monotributoCategory || "A";
    const amount = MONOTRIBUTO_AMOUNTS[cat] ?? MONOTRIBUTO_AMOUNTS.A;

    // Cuota mensual
    out.push({
      defaultKey: "MONOTRIBUTO",
      name: `Monotributo Cat. ${cat}`,
      category: "MONOTRIBUTO",
      frequency: "MONTHLY",
      dueDay: MONOTRIBUTO_DUE_DAY,
      amount,
      amountSource: "AUTO_MONOTRIBUTO",
      note: `Cuota unificada (IVA + Ganancias + IIBB simplificado + obra social). Limite anual cat. ${cat}: $${MONOTRIBUTO_LIMITS[cat]?.toLocaleString("es-AR") ?? "—"}.`,
      regime: "MONOTRIBUTO",
    });

    // Recategorizacion cuatrimestral (enero, mayo, septiembre — dia 20)
    out.push({
      defaultKey: "MONOTRIBUTO_RECAT_ENE",
      name: "Recategorización Monotributo (enero)",
      category: "MONOTRIBUTO",
      frequency: "YEARLY",
      yearlyMonth: 1,
      dueDay: 20,
      amount: null,
      amountSource: "AUTO_MONOTRIBUTO",
      note: "Evaluar facturación del cuatrimestre sep-dic. Si corresponde, recategorizar.",
      regime: "MONOTRIBUTO",
    });
    out.push({
      defaultKey: "MONOTRIBUTO_RECAT_MAY",
      name: "Recategorización Monotributo (mayo)",
      category: "MONOTRIBUTO",
      frequency: "YEARLY",
      yearlyMonth: 5,
      dueDay: 20,
      amount: null,
      amountSource: "AUTO_MONOTRIBUTO",
      note: "Evaluar facturación del cuatrimestre ene-abr. Si corresponde, recategorizar.",
      regime: "MONOTRIBUTO",
    });
    out.push({
      defaultKey: "MONOTRIBUTO_RECAT_SEP",
      name: "Recategorización Monotributo (septiembre)",
      category: "MONOTRIBUTO",
      frequency: "YEARLY",
      yearlyMonth: 9,
      dueDay: 20,
      amount: null,
      amountSource: "AUTO_MONOTRIBUTO",
      note: "Evaluar facturación del cuatrimestre may-ago. Si corresponde, recategorizar.",
      regime: "MONOTRIBUTO",
    });
  }

  if (profile.taxRegime === "RESPONSABLE_INSCRIPTO") {
    const ivaDay = ivaDueDayByCuit(profile.cuitLastDigit);

    // IVA mensual — DDJJ + pago
    out.push({
      defaultKey: "IVA_RI_MENSUAL",
      name: "IVA mensual (DDJJ + pago)",
      category: "IVA",
      frequency: "MONTHLY",
      dueDay: ivaDay,
      amount: null,
      amountSource: "AUTO_PROFILE",
      note: `Presentación DDJJ F.2002 y pago del saldo. Día según terminación CUIT (${ivaDay}).`,
      regime: "RESPONSABLE_INSCRIPTO",
    });

    // IIBB provincial (primario)
    if (profile.province && IIBB_RATES[profile.province]) {
      const rate = IIBB_RATES[profile.province];
      const provName = PROVINCE_NAMES[profile.province] ?? profile.province;
      out.push({
        defaultKey: "IIBB_PRIMARY",
        name: `IIBB mensual ${provName}`,
        category: "IIBB",
        frequency: "MONTHLY",
        dueDay: 18, // aprox — varia por provincia, usamos medio
        amount: null,
        amountSource: "AUTO_PROFILE",
        note: `Alícuota base ${rate}% sobre ventas brutas. Pago según agenda provincial.`,
        regime: "RESPONSABLE_INSCRIPTO",
      });
    }

    // Convenio multilateral — una obligacion adicional por provincia
    if (profile.hasConvenioMultilateral && profile.additionalProvinces) {
      for (const prov of profile.additionalProvinces) {
        if (!IIBB_RATES[prov] || prov === profile.province) continue;
        const rate = IIBB_RATES[prov];
        const provName = PROVINCE_NAMES[prov] ?? prov;
        out.push({
          defaultKey: `IIBB_CM_${prov}`,
          name: `IIBB CM ${provName}`,
          category: "IIBB",
          frequency: "MONTHLY",
          dueDay: 18,
          amount: null,
          amountSource: "AUTO_PROFILE",
          note: `Convenio Multilateral - ${provName}: ${rate}%. Ajustar coeficiente según distribución.`,
          regime: "RESPONSABLE_INSCRIPTO",
        });
      }
    }

    // Ganancias anticipos bimestrales (solo RI)
    out.push({
      defaultKey: "GANANCIAS_ANTICIPO_1",
      name: "Ganancias — Anticipo 1",
      category: "GANANCIAS",
      frequency: "YEARLY",
      yearlyMonth: 8,
      dueDay: 10,
      amount: null,
      amountSource: "AUTO_PROFILE",
      note: "Primer anticipo impuesto a las Ganancias (personas humanas / empresas).",
      regime: "RESPONSABLE_INSCRIPTO",
    });
    out.push({
      defaultKey: "GANANCIAS_ANTICIPO_2",
      name: "Ganancias — Anticipo 2",
      category: "GANANCIAS",
      frequency: "YEARLY",
      yearlyMonth: 10,
      dueDay: 10,
      amount: null,
      amountSource: "AUTO_PROFILE",
      note: "Segundo anticipo impuesto a las Ganancias.",
      regime: "RESPONSABLE_INSCRIPTO",
    });

    // Ganancias DDJJ anual (junio para personas humanas)
    out.push({
      defaultKey: "GANANCIAS_ANUAL",
      name: "Ganancias — DDJJ anual",
      category: "GANANCIAS",
      frequency: "YEARLY",
      yearlyMonth: 6,
      dueDay: 10,
      amount: null,
      amountSource: "AUTO_PROFILE",
      note: "Presentación DDJJ Ganancias del ejercicio anterior. Día varía por CUIT.",
      regime: "RESPONSABLE_INSCRIPTO",
    });
  }

  // MercadoLibre percepciones (cualquier régimen que venda en marketplace)
  if (profile.sellsOnMarketplace) {
    out.push({
      defaultKey: "PERCEPCION_MELI_IIBB",
      name: "Percepción IIBB MercadoLibre",
      category: "PERCEPCION_ML",
      frequency: "MONTHLY",
      dueDay: 99, // auto-retenido, no vence — marcar como informativo
      amount: null,
      amountSource: "AUTO_PROFILE",
      note: "MercadoLibre retiene 2% sobre ventas como percepción IIBB. Recuperable como crédito provincial.",
      regime: "BOTH",
    });
    out.push({
      defaultKey: "PERCEPCION_MELI_IVA",
      name: "Percepción IVA MercadoLibre",
      category: "PERCEPCION_ML",
      frequency: "MONTHLY",
      dueDay: 99,
      amount: null,
      amountSource: "AUTO_PROFILE",
      note: "~1% sobre ventas. Computable como crédito fiscal IVA para RI.",
      regime: "BOTH",
    });
    if (profile.taxRegime === "RESPONSABLE_INSCRIPTO") {
      out.push({
        defaultKey: "RETENCION_MELI_GANANCIAS",
        name: "Retención Ganancias MercadoLibre",
        category: "PERCEPCION_ML",
        frequency: "MONTHLY",
        dueDay: 99,
        amount: null,
        amountSource: "AUTO_PROFILE",
        note: "0.5%-1% según medio de pago. Se computa contra Ganancias anual.",
        regime: "RESPONSABLE_INSCRIPTO",
      });
    }
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────
// 4. expandObligations — convierte obligaciones en fechas concretas
//    dentro de una ventana [from, from + monthsAhead]
// ─────────────────────────────────────────────────────────────────
export interface ExpandedObligation {
  defaultKey: string;
  name: string;
  category: ObligationCategory;
  frequency: ObligationFrequency;
  dueDate: string;    // YYYY-MM-DD
  dueDay: number;
  amount: number | null;
  amountSource: string;
  note?: string;
  isInformative: boolean; // true si dueDay = 99 (auto-retenido)
}

function isoDate(y: number, m: number, d: number): string {
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

function lastDayOfMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate(); // m aqui 1-12, pasa a 0-11 internamente
}

function clampDayToMonth(y: number, m: number, d: number): number {
  const last = lastDayOfMonth(y, m);
  if (d === 99) return last;
  return Math.min(d, last);
}

export function expandObligations(
  obligations: BaseObligation[],
  from: Date,
  monthsAhead: number = 12
): ExpandedObligation[] {
  const out: ExpandedObligation[] = [];
  const startY = from.getUTCFullYear();
  const startM = from.getUTCMonth() + 1; // 1-12

  for (let i = 0; i < monthsAhead; i++) {
    // Mes actual que estamos evaluando
    const monthZero = (startM - 1) + i;
    const y = startY + Math.floor(monthZero / 12);
    const m = (monthZero % 12) + 1;

    for (const ob of obligations) {
      let shouldEmit = false;
      switch (ob.frequency) {
        case "MONTHLY":
          shouldEmit = true;
          break;
        case "BIMONTHLY":
          shouldEmit = m % 2 === 0;
          break;
        case "QUARTERLY":
          shouldEmit = m % 3 === 0;
          break;
        case "SEMIANNUAL":
          shouldEmit = m === 6 || m === 12;
          break;
        case "YEARLY":
          shouldEmit = ob.yearlyMonth === m;
          break;
      }
      if (!shouldEmit) continue;

      const day = clampDayToMonth(y, m, ob.dueDay);
      out.push({
        defaultKey: ob.defaultKey,
        name: ob.name,
        category: ob.category,
        frequency: ob.frequency,
        dueDate: isoDate(y, m, day),
        dueDay: ob.dueDay,
        amount: ob.amount,
        amountSource: ob.amountSource,
        note: ob.note,
        isInformative: ob.dueDay === 99,
      });
    }
  }

  // Ordenar por fecha
  out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return out;
}

// ─────────────────────────────────────────────────────────────────
// 5. applyOverrides — aplica overrides de la DB sobre los defaults
// ─────────────────────────────────────────────────────────────────
export interface OverrideRow {
  id: string;
  kind: string;                // CUSTOM | OVERRIDE_DEFAULT
  defaultKey: string | null;
  name: string;
  category: string;
  dueDay: number;
  frequency: string;
  yearlyMonth: number | null;
  amount: number | null;
  amountSource: string;
  isActive: boolean;
  hideDefault: boolean;
  note: string | null;
  startMonth: string | null;
  endMonth: string | null;
}

export interface MergedObligation extends BaseObligation {
  overrideId?: string;         // si viene de un override
  isCustom?: boolean;          // CUSTOM totalmente
  isOverridden?: boolean;      // default con amount/day editado
}

export function applyOverrides(
  defaults: BaseObligation[],
  overrides: OverrideRow[]
): MergedObligation[] {
  const overrideByDefaultKey = new Map<string, OverrideRow>();
  const customs: OverrideRow[] = [];

  for (const ov of overrides) {
    if (!ov.isActive) continue;
    if (ov.kind === "OVERRIDE_DEFAULT" && ov.defaultKey) {
      overrideByDefaultKey.set(ov.defaultKey, ov);
    } else if (ov.kind === "CUSTOM") {
      customs.push(ov);
    }
  }

  // Merge defaults con overrides
  const merged: MergedObligation[] = [];
  for (const def of defaults) {
    const ov = overrideByDefaultKey.get(def.defaultKey);
    if (ov?.hideDefault) continue; // oculto, skip
    if (ov) {
      merged.push({
        ...def,
        dueDay: ov.dueDay || def.dueDay,
        frequency: (ov.frequency as ObligationFrequency) || def.frequency,
        yearlyMonth: ov.yearlyMonth ?? def.yearlyMonth,
        amount: ov.amount ?? def.amount,
        note: ov.note ?? def.note,
        overrideId: ov.id,
        isOverridden: true,
      });
    } else {
      merged.push(def);
    }
  }

  // Agregar customs
  for (const c of customs) {
    merged.push({
      defaultKey: `CUSTOM_${c.id}`,
      name: c.name,
      category: (c.category as ObligationCategory) || "CUSTOM",
      frequency: (c.frequency as ObligationFrequency) || "MONTHLY",
      dueDay: c.dueDay,
      yearlyMonth: c.yearlyMonth ?? undefined,
      amount: c.amount,
      amountSource: (c.amountSource as BaseObligation["amountSource"]) || "MANUAL",
      note: c.note ?? undefined,
      regime: "BOTH",
      overrideId: c.id,
      isCustom: true,
    });
  }

  return merged;
}

// ─────────────────────────────────────────────────────────────────
// 6. Helpers de presentacion
// ─────────────────────────────────────────────────────────────────
export function categoryLabel(cat: ObligationCategory): string {
  switch (cat) {
    case "MONOTRIBUTO": return "Monotributo";
    case "IVA":         return "IVA";
    case "IIBB":        return "IIBB";
    case "GANANCIAS":   return "Ganancias";
    case "PERCEPCION_ML": return "Retenciones ML";
    case "CUSTOM":      return "Custom";
    default:            return cat;
  }
}

export function frequencyLabel(f: ObligationFrequency): string {
  switch (f) {
    case "MONTHLY":    return "Mensual";
    case "BIMONTHLY":  return "Bimestral";
    case "QUARTERLY":  return "Trimestral";
    case "SEMIANNUAL": return "Semestral";
    case "YEARLY":     return "Anual";
    default:           return f;
  }
}
