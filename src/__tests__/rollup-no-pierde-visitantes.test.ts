import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ══════════════════════════════════════════════════════════════════════════
// GUARD ESTRUCTURAL — el rollup por canal NO puede perder visitantes.
// ══════════════════════════════════════════════════════════════════════════
// `pixel_daily_source` y `pixel_daily_funnel_by_source` cruzan contra
// `pixel_visitor_first_source`. Con un INNER JOIN, un visitante sin fila en esa
// dimensión no cae en un bucket "sin clasificar": DESAPARECE de la tabla.
//
// Consecuencia real (2026-07-21): la columna "Visitantes" de /pixel/analytics no
// podía cerrar contra el total y nada en la UI lo aclaraba. El cliente lo
// reportó como "aparecen más de 100.000 visitas pero la separación por canales
// no se acerca a ese número". Tomy pidió explícitamente que las visitas sumen
// el 100%.
//
// ⚠️ POR QUÉ ES UN TEST DE TEXTO Y NO DE EJECUCIÓN:
// estos rollups usan la extensión `hll`, que no está disponible en PGlite (el
// harness con Postgres real del repo). No se puede ejecutar el SQL en un test.
// Lo que SÍ se puede fijar es la invariante estructural: que nunca vuelva a ser
// un INNER JOIN. Es un guard de regresión, no una prueba de resultados — y así
// está declarado para que nadie lo lea como más de lo que es.
// ══════════════════════════════════════════════════════════════════════════

const SRC = readFileSync(
  join(process.cwd(), "src/lib/pixel/rollup-backfill.ts"),
  "utf8"
);

// ⚠️ EL SERVE TAMBIÉN (agregado 2026-07-22, actualizado 2026-09-17).
//
// Este guard existía y NO atrapó el bug gemelo porque sólo leía el rollup. El
// El cálculo de CR vive ahora en `metrics/pixel/rate-summary` y lee dos datasets
// Gold ya agregados. Ya no necesita cruzar visitantes con la dimensión en vivo,
// pero ambos lados deben normalizar una fuente nula al mismo bucket antes de
// combinarlos; de otro modo visitas o compras vuelven a desaparecer de la tabla.
//
// La lección no es "faltaba un test": es que un guard que cubre UN archivo de
// una invariante que vive en DOS da una sensación de protección que no tiene.
const SERVE = readFileSync(
  join(process.cwd(), "src/app/api/metrics/pixel/rate-summary/route.ts"),
  "utf8"
);

/** Quita comentarios: un `// antes era JOIN ...` no es un JOIN. */
function code(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("rollups por canal — ningún visitante puede quedar afuera", () => {
  const body = code(SRC);

  it("el cruce con la dimensión de first-source es LEFT JOIN, nunca INNER", () => {
    // Un INNER JOIN acá hace desaparecer visitantes en silencio.
    expect(body).not.toMatch(/\n\s*JOIN pixel_visitor_first_source/);
    const lefts = body.match(/LEFT JOIN pixel_visitor_first_source/g) ?? [];
    // Dos rollups lo usan: pixel_daily_source y pixel_daily_funnel_by_source.
    expect(lefts).toHaveLength(2);
  });

  it("los visitantes sin canal caen en un bucket explícito, no en NULL", () => {
    const coalesces = body.match(/COALESCE\(d\.first_source, 'sin_clasificar'\)/g) ?? [];
    expect(coalesces).toHaveLength(2);
  });

  it("el bucket tiene label en la UI (si no, se ve como un canal gris sin nombre)", () => {
    const analytics = readFileSync(
      join(process.cwd(), "src/app/(app)/pixel/analytics/page.tsx"),
      "utf8"
    );
    expect(analytics).toContain("sin_clasificar");
    // A propósito NO se fija el texto: el fundador va a renombrar esta etiqueta
    // y un test que exija "Sin clasificar" convertiría un cambio de copy en un
    // build roto. Lo que importa es que la clave TENGA label, no cuál sea.
    const label = analytics.match(/sin_clasificar:\s*\{[^}]*label:\s*"([^"]+)"/);
    expect(label?.[1]?.trim()).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// El SERVE tampoco puede perder visitantes
// ══════════════════════════════════════════════════════════════════════════
describe("metrics/pixel/rate-summary — el desglose no descarta fuentes sin canal", () => {
  const body = code(SERVE);

  it("lee los dos lados agregados sin volver a cruzar la dimensión en vivo", () => {
    expect(body).toContain("FROM pixel_daily_source");
    expect(body).toContain("FROM gold_attribution_source");
    expect(body).not.toContain("pixel_visitor_first_source");
  });

  it("visitas y compras nulas caen en el mismo bucket antes de combinarse", () => {
    const fallbacks = body.match(/row\.source \|\| "sin_clasificar"/g) ?? [];
    expect(fallbacks).toHaveLength(2);
    expect(body).toContain("channelMap.get(source)");
    expect(body).toContain("channelMap.set(source, current)");
  });
});
