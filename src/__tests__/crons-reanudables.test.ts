import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// ══════════════════════════════════════════════════════════════════════════
// E-11 — ningún cron puede morirse en el muro sin dejar rastro
// ══════════════════════════════════════════════════════════════════════════
// Catorce crons recorren todas las organizaciones dentro de una invocación con
// presupuesto fijo. El modo de falla al crecer no es "va más lento": es "a
// algunos clientes no les corre nunca", en silencio, y siempre a los mismos.
//
// Un cron que se pasa del `maxDuration` lo mata Vercel y NO devuelve nada: ni
// lo hecho, ni lo que falta, ni el error. Y un 5XX en un cron no dispara
// ninguna alerta — se descubre semanas después, con datos faltantes.
//
// Estos casos son estructurales a propósito: lo que hay que impedir es que
// alguien agregue un loop sobre organizaciones sin reloj, o que saque un
// `ORDER BY` del que depende el cursor.
// ══════════════════════════════════════════════════════════════════════════

function fuente(p: string): string {
  return readFileSync(join(process.cwd(), p), "utf8")
    .replace(/^\s*\/\*[\s\S]*?\*\//gm, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/** Crons que reparten trabajo entre corridas: necesitan reloj Y cursor. */
const CON_CURSOR = [
  "src/app/api/cron/refresh-gold-attribution-channel/route.ts",
  "src/app/api/cron/refresh-silver-orders/route.ts",
  "src/app/api/cron/attribution-reconcile/route.ts",
  "src/app/api/cron/vtex-sync-recent/route.ts",
];

/** Crons con reloj pero sin cursor, cada uno por su motivo. */
const SOLO_RELOJ = ["src/app/api/cron/alerts-scheduler/route.ts"];

describe("los crons que reparten trabajo guardan por dónde van", () => {
  it.each(CON_CURSOR)("%s usa el cursor persistido", (p) => {
    const src = fuente(p);
    expect(src).toContain("ultimoProcesado");
    expect(src).toContain("guardarCorte");
    // Cómo se traduce el cursor en un índice: o `indiceDespuesDe` directo, o
    // `arranqueDeLaVuelta`, que además decide si a esta corrida le corresponde
    // mover el cursor. Los dos crons que aceptan `?full=1` usan el segundo,
    // porque el primero solo no alcanza — ver A4 en cursor-store.test.ts.
    expect(src).toMatch(/indiceDespuesDe|arranqueDeLaVuelta/);
  });

  /**
   * Los que además tienen un modo manual. Acá el cursor no puede aplicarse ni
   * guardarse a ciegas: `refresh-silver-orders` lo hacía y un `?full=1` se
   * salteaba en silencio las orgs anteriores al cursor, además de pisárselo al
   * incremental.
   */
  const CON_MODO_MANUAL = [
    "src/app/api/cron/refresh-gold-attribution-channel/route.ts",
    "src/app/api/cron/refresh-silver-orders/route.ts",
  ];

  it.each(CON_MODO_MANUAL)("%s no deja que un ?full=1 toque el cursor", (p) => {
    const src = fuente(p);
    // El `full` tiene que llegar hasta la decisión del arranque. Si alguien
    // vuelve a calcular el índice sin pasarlo, esto salta.
    expect(src).toContain("arranqueDeLaVuelta");
    expect(src).toMatch(/arranqueDeLaVuelta\(\{[\s\S]{0,220}\bfull\b/);
    // Y el guardado tiene que estar condicionado. Un `guardarCorte` suelto,
    // fuera de un if, es el bug original.
    expect(src).toMatch(/if \(persisteCursor\) \{\s*await guardarCorte/);
  });

  it.each(CON_CURSOR)("%s corta por reloj antes del maxDuration", (p) => {
    const src = fuente(p);
    // Tiene que haber una comparación contra un presupuesto, no sólo el
    // maxDuration declarado (que es el muro, no el freno).
    expect(src).toMatch(/Date\.now\(\)\s*-\s*\w*[Ss]tart\w*\s*>/);
  });

  it.each(CON_CURSOR)("%s ordena de forma estable", (p) => {
    const src = fuente(p);
    // La versión anterior de este caso era /ORDER BY|orderBy/ sobre todo el
    // archivo, y una revisión mostró que era vacua: en attribution-reconcile hay
    // un `ORDER BY o."orderDate" DESC` de otra query, así que podías borrar el
    // orden del que depende el cursor y el test seguía verde.
    //
    // Ahora se pide el orden POR ORGANIZACIÓN, que es el que importa. Y el
    // comportamiento de verdad —que no se saltee a nadie cuando la lista cambia
    // de composición— se verifica ejecutando la lógica en
    // src/lib/cron/cursor-store.test.ts, no leyendo el fuente.
    expect(src).toMatch(/ORDER BY (?:o\.)?id|ORDER BY 1|orderBy: \{ organizationId/);
  });
});

describe("los crons sin cursor igual tienen reloj", () => {
  it.each(SOLO_RELOJ)("%s corta por presupuesto", (p) => {
    const src = fuente(p);
    expect(src).toContain("TIME_BUDGET_MS");
    expect(src).toMatch(/Date\.now\(\)\s*-\s*\w*[Ss]tart\w*\s*>/);
  });

  it("alerts-scheduler NO lleva cursor, y es a propósito", () => {
    // Ojo: la premisa de esto (que una regla que dispara sale de la cola) tiene
    // un agujero conocido — evaluateRule devuelve null antes de actualizar
    // nextFireAt cuando la regla NO dispara. Está anotado en PLAN_EXPANSION.md
    // como decisión pendiente. Este caso sólo fija que acá no va cursor.
    // La cola ya se ordena por `nextFireAt ASC NULLS FIRST`: las que quedan sin
    // evaluar son las más atrasadas y entran primero en la próxima corrida. El
    // orden ES el cursor. Un cursor por índice encima de eso desordenaría la
    // prioridad por atraso.
    const src = fuente(SOLO_RELOJ[0]);
    expect(src).not.toContain("ultimoProcesado");
  });
});

describe("control-alerts: el reporte se hace barato, no se reparte", () => {
  const CHECKS = "src/lib/control/checks.ts";

  it("checkInactiveClients ya no hace dos queries por organización", () => {
    // Era un N+1: 2 queries secuenciales por org dentro de un cron con
    // maxDuration=60. A ~2s por org, a partir de ~30 clientes moría en el muro.
    const src = fuente(CHECKS);
    const fn = src.slice(
      src.indexOf("export async function checkInactiveClients"),
      src.indexOf("export async function", src.indexOf("export async function checkInactiveClients") + 10),
    );
    // Nada de queries adentro del for.
    const cuerpoDelFor = fn.slice(fn.indexOf("for (const org of orgs)"));
    expect(cuerpoDelFor).not.toContain("await prisma");
    // Y las agregaciones agrupan por organización.
    expect(fn).toContain("GROUP BY");
  });

  it("no se reparte entre corridas: medio reporte diría 'todo bien' de más", () => {
    // A diferencia de los otros, esto no es trabajo incremental sino un reporte
    // que se manda por mail. Procesar la mitad omitiría clientes en silencio.
    const src = fuente(CHECKS);
    expect(src).not.toContain("ultimoProcesado");
  });

  it("el cron ya no tiene el maxDuration de 60 que lo mataba", () => {
    const src = fuente("src/app/api/cron/control-alerts/route.ts");
    expect(src).not.toMatch(/maxDuration\s*=\s*60\b/);
  });
});
