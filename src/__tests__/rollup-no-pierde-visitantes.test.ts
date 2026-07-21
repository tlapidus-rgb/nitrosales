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
    expect(analytics).toContain("Sin clasificar");
  });
});
