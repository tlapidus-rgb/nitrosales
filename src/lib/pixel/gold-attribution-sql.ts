// ══════════════════════════════════════════════════════════════════════════
// Expresiones SQL para reconstruir revenue de atribución por modelo desde
// gold_attribution_source (serve-time). Espejo EXACTO de la lógica JS de
// attribution-weights.ts, en SQL, para que las queries del endpoint devuelvan
// el MISMO shape que las versiones Bronze (JSONB) que reemplazan.
//
// Como los pesos son lineales, SUM(componente) y luego ponderar == ponderar y
// luego SUMar → se puede envolver cada columna con `col()` (identidad para
// lectura por-fila #20, o `SUM(...)` para agregado por-source #9/#29).
// ══════════════════════════════════════════════════════════════════════════

/** Devuelve la expresión SQL de revenue para un modelo dado, sobre columnas
 *  del rollup envueltas por `col` (ej. (n)=>`SUM(${n})` o (n)=>n).
 *  wF/wM/wL son los pesos NITRO (números, ya validados en el endpoint). */
export function goldModelRevenueSql(
  model: string,
  wF: number,
  wM: number,
  wL: number,
  col: (name: string) => string,
): string {
  switch (model.toUpperCase()) {
    case "LAST_CLICK":
      return `${col("last_click_revenue")}`;
    case "FIRST_CLICK":
      return `${col("first_click_revenue")}`;
    case "LINEAR":
      return `${col("linear_revenue")}`;
    case "NITRO":
    case "CUSTOM":
    default: {
      const denom = wF + wL;
      const twoTouch =
        denom > 0
          ? `+ ${col("nitro_first2")} * ${wF} / ${denom} + ${col("nitro_last2")} * ${wL} / ${denom}`
          : ""; // wF+wL=0 → los componentes de 2-touch no aportan
      return `(${col("nitro_single")} ${twoTouch}
        + ${col("nitro_first_n")} * ${wF} / 100.0
        + ${col("nitro_last_n")} * ${wL} / 100.0
        + ${col("nitro_middle_n")} * ${wM} / 100.0)`;
    }
  }
}

/** Los 4 modelos que muestra la comparación (query #29). */
export const ATTRIBUTION_MODELS = ["LAST_CLICK", "FIRST_CLICK", "LINEAR", "NITRO"] as const;
