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

// ⚠️ EL SERVE TAMBIÉN (agregado 2026-07-22).
//
// Este guard existía y NO atrapó el bug gemelo porque sólo leía el rollup. El
// mismo INNER JOIN seguía vivo en `metrics/pixel` q23, en el CTE `src_purchases`:
// el rollup mandaba a los visitantes sin canal a 'sin_clasificar', y el serve
// los descartaba al contar compras. El cliente veía 21.139 visitas y CERO
// compras en ese bucket.
//
// La lección no es "faltaba un test": es que un guard que cubre UN archivo de
// una invariante que vive en DOS da una sensación de protección que no tiene.
const SERVE = readFileSync(
  join(process.cwd(), "src/app/api/metrics/pixel/route.ts"),
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
describe("metrics/pixel — el desglose por canal no descarta al bucket sin canal", () => {
  const body = code(SERVE);

  it("el cruce con la dimensión de first-source es LEFT JOIN, nunca INNER", () => {
    // Con INNER, las COMPRAS de los visitantes sin canal desaparecen mientras
    // sus VISITAS siguen apareciendo vía el COALESCE del rollup. El bucket
    // queda con tráfico y sin ventas, y se lee como basura.
    expect(body).not.toMatch(/\n\s*JOIN pixel_visitor_first_source/);
    expect(body).toMatch(/LEFT JOIN pixel_visitor_first_source/);
  });

  it("los visitantes sin canal caen en el mismo bucket que usa el rollup", () => {
    // Tiene que ser la MISMA cadena que rollup-backfill: si el serve dijera
    // 'otros' y el rollup 'sin_clasificar', el FULL OUTER JOIN de q23 los
    // mostraría como dos filas distintas — visitas en una, compras en la otra.
    expect(body).toMatch(/COALESCE\(d\.first_source, 'sin_clasificar'\)/);
  });
});
