import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ══════════════════════════════════════════════════════════════════════════
// GUARD — el checkout / retorno de pasarela NO cuenta como visita
// ══════════════════════════════════════════════════════════════════════════
// Decisión del fundador (2026-07-22, sobre el fix de GoCuotas): un retorno de
// pasarela "no es una visita, es parte del proceso de la compra". Así que un
// PAGE_VIEW cuenta como visita SALVO que sea una página de checkout / retorno.
//
// Esto vive en filtros HLL (`hll_add_agg`) que PGlite no puede ejecutar (no
// tiene la extensión hll). No se puede testear el resultado; sí se puede fijar
// el invariante estructural: que ningún contador de VISITA use un
// `type='PAGE_VIEW'` pelado, y que las etapas de EMBUDO (checkout/purchase)
// sigan contando eventos de compra (si no, se rompe el funnel).
//
// Es un guard de regresión, igual que rollup-no-pierde-visitantes.test.ts.
// ══════════════════════════════════════════════════════════════════════════

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const ROLLUP = read("src/lib/pixel/rollup-backfill.ts");
const FUNNEL = read("src/lib/metrics/pixel-funnel.ts");

/** Quita comentarios para no matchear un `// ...type='PAGE_VIEW'...` explicativo. */
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("visita excluye checkout — el proceso de compra no infla las visitas", () => {
  it("NINGÚN contador de visita usa un PAGE_VIEW pelado (sin excluir checkout)", () => {
    // Todos los PAGE_VIEW-como-visita pasan por VISIT_PAGEVIEW, que trae la
    // exclusión. Un filtro pelado sería un contador que volvió a inflar.
    const bare = /FILTER \(WHERE (pe\.)?type ?= ?'PAGE_VIEW'\)/;
    expect(code(ROLLUP)).not.toMatch(bare);
    expect(code(FUNNEL)).not.toMatch(bare);
  });

  it("la constante VISIT_PAGEVIEW realmente excluye checkout / retorno de pasarela", () => {
    // Si alguien vacía la exclusión, el guard de arriba pasaría en falso.
    expect(ROLLUP).toMatch(/VISIT_PAGEVIEW\b/);
    expect(ROLLUP).toMatch(/!~\*\s*'\$\{CHECKOUT_URL_REGEX\}'/);
    // CHECKOUT_URL_REGEX es la fuente única (compartida con la clasificación).
    expect(read("src/lib/pixel/first-source-sql.ts")).toMatch(
      /export const CHECKOUT_URL_REGEX = "\/checkout\/\|orderPlaced\|gatewayCallback"/
    );
  });

  it("las etapas de EMBUDO siguen contando eventos de compra (no se les aplica la exclusión)", () => {
    // El paso checkout/purchase DEBE ver los checkouts: son lo que mide. Si esto
    // desaparece, el funnel deja de tener fondo.
    expect(ROLLUP).toMatch(/FILTER \(WHERE type IN \('INITIATE_CHECKOUT','CHECKOUT_SHIPPING'\)\)/);
    expect(ROLLUP).toMatch(/FILTER \(WHERE type='PURCHASE'\)/);
    // En el funnel en vivo, el paso checkoutStart tampoco excluye.
    expect(FUNNEL).toMatch(/INITIATE_CHECKOUT','CHECKOUT_SHIPPING'\)\) AS chk/);
  });

  it("el funnel en vivo excluye checkout SÓLO en el paso de visita (pv), no en los demás", () => {
    // pv con exclusión; prod/cart/chk sin ella.
    expect(FUNNEL).toMatch(/FILTER \(WHERE type = 'PAGE_VIEW' AND[^)]*pageUrl[^)]*\)\)\s*AS pv/);
    expect(FUNNEL).toMatch(/FILTER \(WHERE type = 'VIEW_PRODUCT'\)\s*AS prod/);
  });
});
