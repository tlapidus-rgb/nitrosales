// ══════════════════════════════════════════════════════════════════════════
// src/lib/analytics/cobertura.ts — ¿el análisis miró todo, o miró una parte?
// ══════════════════════════════════════════════════════════════════════════
// E-26. Dos paneles de Bondly puntúan sobre una muestra y muestran el
// resultado como si fuera el total:
//
//   · LTV behavioral analiza los **500 visitantes más recientes**;
//   · Churn risk analiza los **200 clientes que más gastaron**.
//
// Ninguno de los dos lo dice. La respuesta trae un campo `total` que es, como
// mucho, el techo — y en pantalla se lee como "tus clientes", no como "200 de
// tus clientes". **Truncado silencioso en un producto de analytics**, que es
// justo el lugar donde no se puede hacer.
//
// El patrón correcto ya existía en `/api/metrics/conversion`
// (`productUniverseTruncated`), pero ningún componente leía el flag. Acá se
// generaliza y, sobre todo, se le agrega el dato que faltaba: **por qué
// criterio se recortó**. Saber que faltan filas sirve poco; saber que las que
// faltan son las menos recientes cambia cómo se lee la pantalla.
//
// ── POR QUÉ EL CRITERIO IMPORTA MÁS QUE EL NÚMERO ───────────────────────
// Las dos muestras están **sesgadas a propósito**, y el sesgo es defendible:
// mirar a los que más gastaron es una priorización comercial razonable. Lo que
// no es defendible es que el sesgo sea invisible. "Ningún cliente en riesgo
// crítico" significa una cosa muy distinta si abajo dice *"analizados: los 200
// que más gastaron"*.
// ══════════════════════════════════════════════════════════════════════════

/** Por qué criterio se quedó con unos y descartó otros. */
export type CriterioDeCorte = "mas-recientes" | "mayor-gasto";

const COMO_SE_ELIGIERON: Record<CriterioDeCorte, string> = {
  "mas-recientes": "los más recientes",
  "mayor-gasto": "los que más gastaron",
};

/** Qué queda afuera cuando se corta, dicho desde la pérdida y no desde el corte. */
const QUE_NO_SE_VE: Record<CriterioDeCorte, string> = {
  "mas-recientes":
    "Los visitantes que no volvieron hace rato no están en este análisis, aunque hayan mostrado mucha intención.",
  "mayor-gasto":
    "Los clientes de ticket más chico no están en este análisis, así que su riesgo de fuga no se está midiendo.",
};

export type Cobertura = {
  /** `true` si se analizó todo lo que había; `false` si se llegó al techo. */
  completa: boolean;
  /** Cuántos entraron efectivamente al scoring. */
  analizados: number;
  /** El techo del query. */
  techo: number;
  criterio: CriterioDeCorte;
  /**
   * Texto listo para mostrar, o `null` si no hay nada que aclarar.
   *
   * Se redacta acá y no en el componente a propósito: si cada pantalla lo
   * escribe por su cuenta, dentro de dos meses dicen cosas distintas sobre el
   * mismo hecho.
   */
  aviso: string | null;
  /**
   * Cosas que quedaron afuera y **no son truncado** — filtros del propio query.
   * Se reportan aparte porque no desaparecen al subir el techo.
   */
  exclusiones: string[];
};

export function describirCobertura(args: {
  analizados: number;
  techo: number;
  criterio: CriterioDeCorte;
  exclusiones?: string[];
}): Cobertura {
  const { analizados, techo, criterio } = args;
  const exclusiones = args.exclusiones ?? [];

  // `>=` y no `>`: con exactamente `techo` filas no se puede distinguir "había
  // justo esa cantidad" de "había más y se cortó". La asimetría manda —
  // un falso positivo dice "puede estar recortado" (molesto pero honesto);
  // un falso negativo dice "completo" cuando no lo está, que es el bug que
  // esto viene a arreglar.
  const completa = analizados < techo;

  const aviso = completa
    ? null
    : `Mostrando ${analizados.toLocaleString("es-AR")} de un total mayor: se analizaron ` +
      `${COMO_SE_ELIGIERON[criterio]}. ${QUE_NO_SE_VE[criterio]}`;

  return { completa, analizados, techo, criterio, aviso, exclusiones };
}
