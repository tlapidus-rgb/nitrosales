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
  // ⚠️ LOS TRES DE ABAJO NO ESTABAN EN LA LISTA DEL ESTUDIO, y tenían el mismo
  // problema (agregados el 2026-09-08, los encontró una revisión del plan).
  //
  // E-05 les puso el aislamiento por organización, que era la mitad del
  // problema; les faltaba la otra: `maxDuration = 60` y un `for` sobre TODAS las
  // orgs sin reloj, sin `orderBy` y sin cursor. Con 20 clientes el loop se come
  // los 60 s a mitad de lista, Vercel mata la función y **no devuelve nada**.
  //
  // Son, además, los tres crons que le escriben al cliente por mail: el digest
  // semanal, las anomalías diarias y la auditoría de UTMs. O sea que el modo de
  // falla que todo este plan ataca —"a algunos clientes no les corre nunca, en
  // silencio"— sobrevivía justo ahí.
  "src/app/api/cron/digest/route.ts",
  "src/app/api/cron/anomalies/route.ts",
  "src/app/api/cron/ads-utm-audit/route.ts",
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
    // El nombre de la variable no importa: lo que tiene que existir es una
    // comparacion de "cuanto llevo corriendo" contra un tope. Antes el regex
    // exigia `*start*` y eso lo hacia fallar sobre codigo correcto que usaba
    // `arrancoEn` — un test que le pide a la implementacion que se llame de
    // cierta forma en vez de que haga cierta cosa.
    expect(src).toMatch(/Date\.now\(\)\s*-\s*\w+\s*>/);
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
    // Igual que arriba: acepta el `ORDER BY` crudo o el `orderBy` de Prisma,
    // por `id` o por `organizationId`. Lo que se exige es orden estable sobre
    // la lista de organizaciones, no una forma de escribirlo.
    expect(src).toMatch(/ORDER BY (?:o\.)?id|ORDER BY 1|orderBy: \{ (?:organizationId|id)/);
  });
});

describe("los crons sin cursor igual tienen reloj", () => {
  it.each(SOLO_RELOJ)("%s corta por presupuesto", (p) => {
    const src = fuente(p);
    expect(src).toContain("TIME_BUDGET_MS");
    expect(src).toMatch(/Date\.now\(\)\s*-\s*\w*[Ss]tart\w*\s*>/);
  });

  it("alerts-scheduler NO lleva cursor, y es a propósito", () => {
    // La premisa de esto —que una regla evaluada sale de la cabeza de la cola—
    // tenía un agujero: `evaluateRule` devolvía null ANTES de actualizar
    // `nextFireAt` cuando la regla no disparaba, así que se quedaba primera para
    // siempre y tapaba a las demás. **Resuelto el 2026-09-07**: ahora avanza
    // `nextFireAt` con un reintento corto (15 min), que la manda al fondo sin
    // cambiar la semántica visible. Cubierto ejecutando la cola contra Postgres
    // en `src/lib/alerts/engine-cola.test.ts`.
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

describe("R-19 — el cursor del incremental no se pisa desde una corrida manual", () => {
  // `arranqueDeLaVuelta` devuelve `{ desde, persiste }`, y documenta en 30
  // líneas por qué existe `persiste`: una corrida manual con `?orgCursor=` no
  // tiene derecho a mover el cursor del cron automático.
  //
  // Tres de los cinco consumidores lo descartaban con
  // `const { desde } = arranqueDeLaVuelta(...)` y guardaban siempre. Un
  // `?orgCursor=10` a mano sobre `digest` que cortara en la org 14 dejaba el
  // cursor del incremental en 14, y el domingo siguiente **las orgs 2..13 no
  // recibían su mail**. Es el bug que el módulo dice haber corregido.
  const CRONS_CON_CURSOR = [
    "anomalies",
    "digest",
    "ads-utm-audit",
    "refresh-silver-orders",
    "refresh-gold-attribution-channel",
  ];

  it.each(CRONS_CON_CURSOR)("%s lee `persiste` y lo respeta al guardar", (cron) => {
    const src = fuente(`src/app/api/cron/${cron}/route.ts`);

    // Lee el campo…
    expect(src, `${cron} descarta \`persiste\``).toMatch(
      /persiste(:\s*\w+)?\s*\}\s*=\s*arranqueDeLaVuelta/,
    );

    // …y el guardado está detrás de un `if`. Sin esto, leerlo no sirve de nada.
    const i = src.indexOf("guardarCorte(");
    expect(i, `${cron} no llama a guardarCorte`).toBeGreaterThan(-1);
    const antes = src.slice(Math.max(0, i - 300), i);
    expect(antes, `${cron} guarda el corte sin mirar \`persiste\``).toMatch(
      /if\s*\(\s*persiste/,
    );
  });
});

describe("R-19 — una org rota no secuestra la vuelta de las demás", () => {
  // `refresh-gold-attribution-channel` no tenía try/catch por org. Como
  // `guardarCorte` vive después del loop y dentro del mismo `try`, una
  // excepción se lo salteaba: el cursor quedaba clavado, y **las orgs
  // anteriores al cursor dejaban de refrescarse por completo**, porque cada
  // corrida arrancaba ahí y moría en la misma org.
  //
  // Su hermano `refresh-silver-orders` sí lo tenía. Los dos recibieron el
  // cursor en el mismo esfuerzo; sólo uno recibió el aislamiento.
  it.each(["refresh-gold-attribution-channel", "refresh-silver-orders"])(
    "%s aísla el fallo de una org",
    (cron) => {
      const src = fuente(`src/app/api/cron/${cron}/route.ts`);
      // El `try` tiene que estar DENTRO del loop por org, no envolviéndolo: si
      // envuelve al loop, la primera org que falle se lleva puesto el
      // `guardarCorte` que viene después — que es exactamente el bug.
      //
      // Se mira el texto desde el primer `for` hasta el final, sin fijar una
      // distancia máxima: el largo del cuerpo del loop no es una propiedad que
      // valga la pena clavar en un test, y la primera versión de esto falló
      // sobre código correcto por asumir 400 caracteres.
      const i = src.search(/\bfor\s*\(/);
      expect(i, `${cron} no tiene loop por org`).toBeGreaterThan(-1);
      const cuerpo = src.slice(i);
      expect(cuerpo, `${cron} no aísla el fallo de una org`).toMatch(/\btry\s*\{/);
      // Y el `catch` tiene que HACER algo con el error, no tragárselo.
      //
      // Sin atarse al nombre de la variable: `refresh-gold-attribution-channel`
      // acumula en `fallos` y `refresh-silver-orders` en `results.push({ ok:
      // false, error })`. Las dos están bien. La primera versión de este test
      // pedía `fallos|failures|console.error` y marcaba en rojo el cron que
      // anotaba correctamente con otro nombre — el mismo error de atarse al
      // nombre en vez de a la propiedad que este repo ya arrastra.
      // Y el `catch` tiene que **registrar qué org falló**.
      //
      // Pedir "hay un catch" no alcanza y se midió: `refresh-gold-attribution-
      // channel` tiene otro `try/catch` más arriba, para las reglas de canal,
      // que hace un fallback silencioso. Con ese criterio, sacarle el
      // aislamiento de la transacción dejaba el test **verde**.
      //
      // Lo que distingue un aislamiento de verdad es que anote la organización:
      // un catch que no sabe de quién fue el fallo no sirve para operar. Los dos
      // crons lo hacen con nombres distintos —`fallos.push({ org, … })` y
      // `results.push({ org: id, ok: false, … })`— así que se busca la
      // propiedad, no el nombre.
      const catchs = cuerpo.match(/catch\s*(\([^)]*\))?\s*\{[\s\S]{0,400}?\n\s*\}/g) || [];
      expect(catchs.length, `${cron} no tiene ningún catch en el loop`).toBeGreaterThan(0);
      expect(
        catchs.some((c) => /\borg\b/.test(c) && /push\(|console\./.test(c)),
        `${cron} no registra QUÉ organización falló — un catch que no lo sabe no sirve para operar`,
      ).toBe(true);
    },
  );
});
