import { describe, it, expect, vi, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";

// ══════════════════════════════════════════════════════════════════════════
// E-11 — el cursor que dice por dónde iba cada cron
// ══════════════════════════════════════════════════════════════════════════
// De los 14 crons que recorren todas las organizaciones dentro de una
// invocación con presupuesto fijo, ocho no tenían forma de continuar donde
// quedaron. Varios ni siquiera es que les faltara el dato: lo calculaban y lo
// devolvían (`resume: "?orgCursor=7"`, `callAgain: true`) y no había nadie del
// otro lado que lo leyera.
//
// El modo de falla al crecer no es "va más lento": es "a algunos clientes no
// les corre nunca", en silencio, y siempre a los mismos — los últimos de la
// lista, que son los más nuevos.
//
// ⚠️ EL CURSOR ES UN ID, NO UNA POSICIÓN. La primera versión guardaba un índice
// y eso sólo funciona si la lista es la misma entre corridas. En tres de los
// cuatro crons NO lo es: uno lista una ventana deslizante de organizaciones con
// atribuciones recientes, y dos listan conexiones filtradas por `status=ACTIVE`.
// Cuando una organización sale del conjunto, los índices posteriores se corren
// y se saltea un cliente. El bloque final de este archivo es ese caso.
// ══════════════════════════════════════════════════════════════════════════

let db: PGlite;

// El store usa `prisma.$queryRawUnsafe` / `$executeRawUnsafe`; se los mapea a
// PGlite para correr el SQL de verdad.
vi.mock("@/lib/db/client", () => ({
  prisma: {
    $queryRawUnsafe: async (sql: string, ...args: unknown[]) => (await db.query(sql, args)).rows,
    $executeRawUnsafe: async (sql: string, ...args: unknown[]) =>
      (await db.query(sql, args)).affectedRows ?? 0,
  },
}));

const {
  leerCursor,
  guardarCursor,
  ultimoProcesado,
  guardarUltimo,
  indiceDespuesDe,
  guardarCorte,
  arranqueDeLaVuelta,
  TABLA_CURSORES,
} = await import("./cursor-store");

const ESQUEMA = `CREATE TABLE "${TABLA_CURSORES}" (
  "name" TEXT PRIMARY KEY,
  "cursor" TEXT NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`;

async function conTabla() {
  db = new PGlite();
  await db.query(ESQUEMA);
}
async function sinTabla() {
  db = new PGlite();
}

describe("guardar y leer", () => {
  beforeEach(conTabla);

  it("lo que se guarda se lee", async () => {
    await guardarCursor("cron-a", "org7");
    expect(await leerCursor("cron-a")).toBe("org7");
  });

  it("un cron que nunca guardó nada devuelve null", async () => {
    expect(await ultimoProcesado("cron-nuevo")).toBeNull();
  });

  it("guardar dos veces pisa el valor, no acumula filas", async () => {
    await guardarUltimo("cron-a", "org3");
    await guardarUltimo("cron-a", "org9");
    expect(await ultimoProcesado("cron-a")).toBe("org9");
    const filas = await db.query<any>(`SELECT count(*)::int AS n FROM "${TABLA_CURSORES}"`);
    expect(filas.rows[0].n).toBe(1);
  });

  it("cada cron tiene el suyo y no se pisan", async () => {
    await guardarUltimo("cron-a", "org1");
    await guardarUltimo("cron-b", "org2");
    expect(await ultimoProcesado("cron-a")).toBe("org1");
    expect(await ultimoProcesado("cron-b")).toBe("org2");
  });

  it("guardar null borra el cursor", async () => {
    await guardarUltimo("cron-a", "org5");
    await guardarUltimo("cron-a", null);
    expect(await ultimoProcesado("cron-a")).toBeNull();
  });
});

describe("SIN la tabla: degrada, no rompe", () => {
  // Es la propiedad que permite mergear el código antes de correr la migración,
  // como manda el orden de migraciones de CLAUDE.md. Si esto tirara, TODOS los
  // crons que usen el store dejarían de correr en el momento del deploy.
  beforeEach(sinTabla);

  it("leer devuelve null en vez de tirar", async () => {
    expect(await ultimoProcesado("cron-a")).toBeNull();
  });

  it("guardar no tira", async () => {
    await expect(guardarUltimo("cron-a", "org7")).resolves.toBeUndefined();
  });

  it("borrar tampoco", async () => {
    await expect(guardarUltimo("cron-a", null)).resolves.toBeUndefined();
  });

  it("el cron arranca de cero, que es exactamente lo que hace hoy", async () => {
    expect(indiceDespuesDe(["a", "b", "c"], await ultimoProcesado("cron-a"))).toBe(0);
  });
});

describe("indiceDespuesDe", () => {
  const ids = ["org1", "org3", "org5", "org7", "org9"];

  it("sin cursor arranca de cero", () => {
    expect(indiceDespuesDe(ids, null)).toBe(0);
  });

  it("arranca en el siguiente al último procesado", () => {
    expect(indiceDespuesDe(ids, "org1")).toBe(1);
    expect(indiceDespuesDe(ids, "org5")).toBe(3);
  });

  it("si el último era el final, vuelve a empezar", () => {
    expect(indiceDespuesDe(ids, "org9")).toBe(0);
  });

  it("un cursor que ya no está en la lista cae en el que le sigue", () => {
    // ESTA es la propiedad que el cursor por índice no tenía. Se borró org3 (o
    // salió de la ventana): el cursor apunta a algo inexistente y aun así
    // seguimos exactamente donde corresponde.
    expect(indiceDespuesDe(["org1", "org5", "org7"], "org3")).toBe(1);
  });

  it("un cursor basura no traba ni saltea", () => {
    // Anterior al primero → arranca de cero. Posterior al último → vuelta nueva.
    expect(indiceDespuesDe(ids, "aaa")).toBe(0);
    expect(indiceDespuesDe(ids, "zzz")).toBe(0);
  });

  it("lista vacía no explota", () => {
    expect(indiceDespuesDe([], "org3")).toBe(0);
  });
});

describe("guardarCorte", () => {
  beforeEach(conTabla);
  const ids = ["org1", "org3", "org5", "org7"];

  it("corte a mitad de camino guarda el ÚLTIMO PROCESADO, no el siguiente", async () => {
    // Se procesaron los índices 0 y 1; el 2 quedó sin hacer.
    await guardarCorte("cron-a", 2, ids);
    expect(await ultimoProcesado("cron-a")).toBe("org3");
  });

  it("llegar al final borra el cursor para empezar de nuevo", async () => {
    await guardarUltimo("cron-a", "org3");
    await guardarCorte("cron-a", ids.length, ids);
    expect(await ultimoProcesado("cron-a")).toBeNull();
  });

  it("si no se procesó ninguno, el cursor NO se toca", async () => {
    // Pasa cuando el presupuesto se agota antes del primer elemento. Pisarlo con
    // algo inventado sería peor que dejarlo donde estaba.
    await guardarUltimo("cron-a", "org5");
    await guardarCorte("cron-a", 0, ids);
    expect(await ultimoProcesado("cron-a")).toBe("org5");
  });
});

describe("el escenario completo: nadie queda sin procesar", () => {
  beforeEach(conTabla);

  /** Una corrida del cron: procesa hasta `porCorrida` y deja el corte guardado. */
  async function corrida(ids: string[], porCorrida: number): Promise<string[]> {
    const desde = indiceDespuesDe(ids, await ultimoProcesado("cron-a"));
    let i = desde;
    const hechas: string[] = [];
    for (; i < ids.length && i - desde < porCorrida; i++) hechas.push(ids[i]);
    await guardarCorte("cron-a", i, ids);
    return hechas;
  }

  it("EL BUG: sin cursor, las últimas orgs no se procesan NUNCA", async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `org${String(i).padStart(2, "0")}`);

    // Comportamiento viejo: cada corrida arranca en 0.
    const viejas = new Set<string>();
    for (let c = 0; c < 5; c++) for (let i = 0; i < 4; i++) viejas.add(ids[i]);
    expect(viejas.size).toBe(4);
    expect(viejas.has(ids[9])).toBe(false); // la última, jamás

    // Con cursor: cada corrida sigue donde quedó la anterior.
    const nuevas = new Set<string>();
    for (let c = 0; c < 5; c++) for (const x of await corrida(ids, 4)) nuevas.add(x);
    expect(nuevas.size).toBe(10);
    expect(nuevas.has(ids[9])).toBe(true);
  });

  it("EL BUG DEL ÍNDICE: si se cae una org entre corridas, no se saltea a nadie", async () => {
    // Éste es el caso que el cursor por posición perdía. Tres de los cuatro
    // crons listan conjuntos que se recalculan en cada corrida.
    const ids = ["orgA", "orgB", "orgC", "orgD", "orgE"];

    expect(await corrida(ids, 2)).toEqual(["orgA", "orgB"]);
    expect(await ultimoProcesado("cron-a")).toBe("orgB");

    // A orgB se le vencen las credenciales y sale de la lista.
    const idsAhora = ["orgA", "orgC", "orgD", "orgE"];

    // Con índice guardado (2) sobre la lista nueva habríamos arrancado en orgD,
    // salteando orgC sin que nadie se entere. Con id, no.
    expect(await corrida(idsAhora, 2)).toEqual(["orgC", "orgD"]);
    expect(await corrida(idsAhora, 2)).toEqual(["orgE"]);
    expect(await ultimoProcesado("cron-a")).toBeNull(); // vuelta completa
  });

  it("una org nueva que entra en el medio se atiende en la vuelta siguiente", async () => {
    const ids = ["orgA", "orgC"];
    expect(await corrida(ids, 1)).toEqual(["orgA"]);

    // Entra orgB, que ordena entre las dos ya conocidas.
    const conNueva = ["orgA", "orgB", "orgC"];
    // Esta vuelta sigue después de orgA, así que orgB entra ya mismo.
    expect(await corrida(conNueva, 5)).toEqual(["orgB", "orgC"]);
    expect(await ultimoProcesado("cron-a")).toBeNull();
  });

  it("después de dar la vuelta completa, vuelve a empezar", async () => {
    const ids = ["orgA", "orgB", "orgC"];
    await corrida(ids, 3);
    expect(await ultimoProcesado("cron-a")).toBeNull();
    expect(await corrida(ids, 1)).toEqual(["orgA"]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// A4 — el cursor es del modo incremental, no del manual
// ══════════════════════════════════════════════════════════════════════════
// `refresh-silver-orders` aplicaba Y guardaba el cursor también en `?full=1`.
// Las dos mitades rompían algo distinto:
//
//   · un `?full=1` —el "rehacé toda la historia", que se corre justamente
//     cuando algo ya salió mal— arrancaba desde donde había quedado el cron
//     automático, salteándose en silencio todas las orgs anteriores. Devolvía
//     `ok` sin haber rehecho lo que se le pidió, que es la peor combinación
//     posible en una herramienta de reparación;
//   · y al terminar movía el cursor del incremental, con lo cual el cron de
//     cada media hora se salteaba justo las orgs que le faltaban.
//
// `refresh-gold-attribution-channel` lo hacía bien. Ahora los dos comparten
// esta función, que es de donde salió la asimetría.
// ══════════════════════════════════════════════════════════════════════════

describe("arranqueDeLaVuelta", () => {
  const ids = ["orgA", "orgB", "orgC", "orgD"];

  it("incremental sin cursor: del principio, y persiste", () => {
    expect(
      arranqueDeLaVuelta({ ids, cursorGuardado: null, cursorExplicito: null, full: false }),
    ).toEqual({ desde: 0, persiste: true });
  });

  it("incremental con cursor: sigue donde quedó, y persiste", () => {
    expect(
      arranqueDeLaVuelta({ ids, cursorGuardado: "orgB", cursorExplicito: null, full: false }),
    ).toEqual({ desde: 2, persiste: true });
  });

  it("EL BUG: un ?full=1 NO arranca desde el cursor del incremental", () => {
    expect(
      arranqueDeLaVuelta({ ids, cursorGuardado: "orgC", cursorExplicito: null, full: true }).desde,
    ).toBe(0);
  });

  it("EL OTRO BUG: un ?full=1 tampoco pisa el cursor del incremental", () => {
    expect(
      arranqueDeLaVuelta({ ids, cursorGuardado: "orgC", cursorExplicito: null, full: true })
        .persiste,
    ).toBe(false);
  });

  it("un ?orgCursor= explícito manda, y tampoco persiste", () => {
    expect(
      arranqueDeLaVuelta({ ids, cursorGuardado: "orgA", cursorExplicito: "3", full: false }),
    ).toEqual({ desde: 3, persiste: false });
  });

  it("?orgCursor=0 es un valor válido, no un ausente", () => {
    // `parseInt("0") || 0` y `!cursorExplicito` los confunden; el chequeo es
    // contra `null` justamente por esto.
    expect(
      arranqueDeLaVuelta({ ids, cursorGuardado: "orgC", cursorExplicito: "0", full: false }),
    ).toEqual({ desde: 0, persiste: false });
  });

  it("un ?orgCursor= más grande que la lista no se sale del array", () => {
    expect(
      arranqueDeLaVuelta({ ids, cursorGuardado: null, cursorExplicito: "999", full: false }).desde,
    ).toBe(4);
  });

  it("un ?orgCursor= negativo tampoco", () => {
    expect(
      arranqueDeLaVuelta({ ids, cursorGuardado: null, cursorExplicito: "-5", full: false }).desde,
    ).toBe(0);
  });

  it("un ?orgCursor= que no es un número arranca de cero en vez de romper", () => {
    expect(
      arranqueDeLaVuelta({ ids, cursorGuardado: null, cursorExplicito: "ayer", full: false }),
    ).toEqual({ desde: 0, persiste: false });
  });

  it("?orgCursor= mandando junto con ?full=1: gana el explícito", () => {
    expect(
      arranqueDeLaVuelta({ ids, cursorGuardado: "orgD", cursorExplicito: "2", full: true }),
    ).toEqual({ desde: 2, persiste: false });
  });

  it("con la lista vacía no explota", () => {
    expect(
      arranqueDeLaVuelta({ ids: [], cursorGuardado: "orgA", cursorExplicito: null, full: false }),
    ).toEqual({ desde: 0, persiste: true });
  });
});
