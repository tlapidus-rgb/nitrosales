// ═══════════════════════════════════════════════════════════════════
// /lib/finanzas/driver-formula.ts
// ═══════════════════════════════════════════════════════════════════
// Fase 3f — Evaluador seguro de formulas driver-based.
//
// Permite a Tomy definir un costo como expresion matematica sobre
// "drivers" (variables nombradas). Ejemplo:
//
//   drivers: [
//     { key: "headcount_atencion", label: "Headcount atencion", value: 2, unit: "personas" },
//     { key: "salario_promedio",   label: "Salario promedio",   value: 800000, unit: "ARS" }
//   ]
//   formula: "headcount_atencion * salario_promedio * 1.30"
//   // -> resultado: 2 * 800000 * 1.30 = 2,080,000
//
// Seguridad:
//   - Validamos que la formula solo contenga tokens seguros:
//     letras, digitos, _, +, -, *, /, (, ), ., espacios, y Math.*
//   - NO permitimos: identificadores desconocidos, [, ], {, }, ;,
//     comillas, ->, =, backticks, etc.
//   - Usamos new Function(...args, "return (expr)") en un contexto
//     limpio. No hay acceso a globals ya que pasamos solo los drivers.
// ═══════════════════════════════════════════════════════════════════

export type Driver = {
  key: string;
  label?: string;
  value: number;
  unit?: string;
};

export type DriverFormula = {
  drivers: Driver[];
  formula: string;
  lastComputedAmount?: number;
  lastComputedAt?: string;
};

// Regex que permite solo el subset de caracteres seguros de JS
// para expresiones matematicas simples.
//   \w           -> letras/digitos/_
//   \s           -> espacios
//   +-*/()%.,    -> operadores y separadores
//   Math.xxxx    -> funciones matematicas (lo permitimos explicitamente)
const SAFE_FORMULA_REGEX = /^[\w\s+\-*/()%.,]+$/;

// Lista blanca de identificadores globales que permitimos
const ALLOWED_GLOBALS = new Set([
  "Math",
  "min",
  "max",
  "abs",
  "round",
  "ceil",
  "floor",
  "sqrt",
  "pow",
]);

function validateDriverKey(key: string): boolean {
  // Solo letras minusculas, digitos y _ — evita confusion con Math.XXX
  return /^[a-z_][a-z0-9_]*$/.test(key);
}

export function validateFormulaSyntax(
  formula: string,
  drivers: Driver[]
): { ok: boolean; error?: string } {
  if (!formula || typeof formula !== "string") {
    return { ok: false, error: "Formula vacia" };
  }
  if (formula.length > 500) {
    return { ok: false, error: "Formula demasiado larga (max 500 chars)" };
  }
  if (!SAFE_FORMULA_REGEX.test(formula)) {
    return {
      ok: false,
      error:
        "Formula contiene caracteres no permitidos. Solo letras, digitos, espacios y + - * / ( ) . , %",
    };
  }
  // Extraer identificadores usados
  const identifiers = formula.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
  const driverKeys = new Set(drivers.map((d) => d.key));
  for (const id of identifiers) {
    if (driverKeys.has(id)) continue;
    if (ALLOWED_GLOBALS.has(id)) continue;
    return {
      ok: false,
      error: `Identificador desconocido: "${id}". Usa solo drivers definidos o Math.*`,
    };
  }
  return { ok: true };
}

export function evaluateDriverFormula(
  formula: string,
  drivers: Driver[]
): { ok: boolean; value?: number; error?: string } {
  const syntax = validateFormulaSyntax(formula, drivers);
  if (!syntax.ok) return syntax;

  // Validamos que todas las keys de driver son identificadores validos
  for (const d of drivers) {
    if (!validateDriverKey(d.key)) {
      return {
        ok: false,
        error: `Driver key invalida: "${d.key}" (usa solo [a-z_0-9])`,
      };
    }
    if (!Number.isFinite(d.value)) {
      return {
        ok: false,
        error: `Driver "${d.key}" no tiene valor numerico`,
      };
    }
  }

  try {
    // Construimos una Function con los drivers como argumentos.
    // En un contexto de Function(), identificadores no referenciados
    // se convierten en errores de ReferenceError al evaluar — pero
    // ya los validamos arriba. Math es accesible como global.
    const keys = drivers.map((d) => d.key);
    const values = drivers.map((d) => d.value);
    // Helpers alias para conveniencia (Math.min -> min, etc.)
    const fnBody = `
      const min = Math.min, max = Math.max, abs = Math.abs;
      const round = Math.round, ceil = Math.ceil, floor = Math.floor;
      const sqrt = Math.sqrt, pow = Math.pow;
      return (${formula});
    `;
    const fn = new Function(...keys, fnBody);
    const result = fn(...values);
    if (typeof result !== "number" || !Number.isFinite(result)) {
      return { ok: false, error: "La formula no devolvio un numero finito" };
    }
    return { ok: true, value: result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Error evaluando formula: ${msg}` };
  }
}

// Helper para la UI — devuelve un dto listo para guardar en DB
export function buildDriverFormulaPayload(
  drivers: Driver[],
  formula: string
): {
  ok: boolean;
  payload?: DriverFormula;
  amount?: number;
  error?: string;
} {
  const evalRes = evaluateDriverFormula(formula, drivers);
  if (!evalRes.ok) return { ok: false, error: evalRes.error };
  return {
    ok: true,
    amount: Number((evalRes.value as number).toFixed(2)),
    payload: {
      drivers,
      formula,
      lastComputedAmount: Number((evalRes.value as number).toFixed(2)),
      lastComputedAt: new Date().toISOString(),
    },
  };
}
