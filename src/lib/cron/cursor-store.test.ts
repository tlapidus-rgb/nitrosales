import { describe, it, expect, vi, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";

// ══════════════════════════════════════════════════════════════════════════
// E-11 — el cursor que dice por dónde iba cada cron
// ══════════════════════════════════════════════════════════════════════════
// De los 14 crons que recorren todas las organizaciones dentro de una
// invocación con presupuesto fijo, ocho no tienen forma de continuar donde
// quedaron. Varios ni siquiera es que les falte el dato: lo calculan y lo
// devuelven (`resume: "?orgCursor=7"`, `callAgain: true`) y no hay nadie del
// otro lado que lo lea.
//
// El modo de falla al crecer no es "va más lento": es "a algunos clientes no
// les corre nunca", en silencio, y siempre a los mismos — los últimos de la
// lista, que son los más nuevos.
//
// Se testea contra Postgres de verdad (PGlite) porque lo que hay que probar es
// el upsert y la degradación cuando la tabla no existe, no que el SQL diga
// ciertas palabras.
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

const { leerCursor, guardarCursor, indiceDeArranque, guardarCorte, TABLA_CURSORES } =
  await import("./cursor-store");

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
    await guardarCursor("cron-a", "7");
    expect(await leerCursor("cron-a")).toBe("7");
  });

  it("un cron que nunca guardó nada devuelve null", async () => {
    expect(await leerCursor("cron-nuevo")).toBeNull();
  });

  it("guardar dos veces pisa el valor, no acumula filas", async () => {
    await guardarCursor("cron-a", "3");
    await guardarCursor("cron-a", "9");
    expect(await leerCursor("cron-a")).toBe("9");
    const filas = await db.query<any>(`SELECT count(*)::int AS n FROM "${TABLA_CURSORES}"`);
    expect(filas.rows[0].n).toBe(1);
  });

  it("cada cron tiene el suyo y no se pisan", async () => {
    await guardarCursor("cron-a", "1");
    await guardarCursor("cron-b", "2");
    expect(await leerCursor("cron-a")).toBe("1");
    expect(await leerCursor("cron-b")).toBe("2");
  });

  it("guardar null borra el cursor", async () => {
    await guardarCursor("cron-a", "5");
    await guardarCursor("cron-a", null);
    expect(await leerCursor("cron-a")).toBeNull();
  });
});

describe("SIN la tabla: degrada, no rompe", () => {
  // Es la propiedad que permite mergear el código antes de correr la migración,
  // como manda el orden de migraciones de CLAUDE.md. Si esto tirara, TODOS los
  // crons que usen el store dejarían de correr en el momento del deploy.
  beforeEach(sinTabla);

  it("leer devuelve null en vez de tirar", async () => {
    expect(await leerCursor("cron-a")).toBeNull();
  });

  it("guardar no tira", async () => {
    await expect(guardarCursor("cron-a", "7")).resolves.toBeUndefined();
  });

  it("borrar tampoco", async () => {
    await expect(guardarCursor("cron-a", null)).resolves.toBeUndefined();
  });

  it("el cron arranca de cero, que es exactamente lo que hace hoy", async () => {
    expect(await indiceDeArranque("cron-a", 10)).toBe(0);
  });
});

describe("indiceDeArranque", () => {
  beforeEach(conTabla);

  it("sin cursor guardado arranca de cero", async () => {
    expect(await indiceDeArranque("cron-a", 10)).toBe(0);
  });

  it("con cursor guardado arranca ahí", async () => {
    await guardarCursor("cron-a", "4");
    expect(await indiceDeArranque("cron-a", 10)).toBe(4);
  });

  it("un cursor fuera de rango vuelve a cero, no saltea todo", async () => {
    // Pasa cuando se borra una organización o se acorta la lista. Si esto
    // devolviera el valor guardado, el cron no procesaría NADA y no habría
    // ninguna señal: es justo el modo de falla silencioso que E-11 ataca.
    await guardarCursor("cron-a", "99");
    expect(await indiceDeArranque("cron-a", 10)).toBe(0);
  });

  it("un cursor basura vuelve a cero", async () => {
    for (const basura of ["", "abc", "-3", "3.5.2"]) {
      await guardarCursor("cron-a", basura);
      expect(await indiceDeArranque("cron-a", 10)).toBe(0);
    }
  });

  it("el cursor igual al total se trata como vuelta terminada", async () => {
    await guardarCursor("cron-a", "10");
    expect(await indiceDeArranque("cron-a", 10)).toBe(0);
  });
});

describe("guardarCorte — la vuelta completa borra el cursor", () => {
  beforeEach(conTabla);

  it("corte a mitad de camino se guarda", async () => {
    await guardarCorte("cron-a", 3, 10);
    expect(await leerCursor("cron-a")).toBe("3");
  });

  it("llegar al final borra el cursor para empezar de nuevo", async () => {
    await guardarCursor("cron-a", "3");
    await guardarCorte("cron-a", 10, 10);
    expect(await leerCursor("cron-a")).toBeNull();
  });
});

describe("el escenario completo: nadie queda sin procesar", () => {
  beforeEach(conTabla);

  it("EL BUG: sin cursor, las últimas orgs no se procesan NUNCA", async () => {
    // 10 organizaciones, presupuesto para 4 por corrida.
    const TOTAL = 10;
    const POR_CORRIDA = 4;

    // Comportamiento viejo: cada corrida arranca en 0.
    const viejas = new Set<number>();
    for (let corrida = 0; corrida < 5; corrida++) {
      for (let i = 0; i < POR_CORRIDA; i++) viejas.add(i);
    }
    expect(viejas.size).toBe(4);
    expect(viejas.has(9)).toBe(false); // la última org, jamás

    // Con cursor: cada corrida sigue donde quedó la anterior.
    const nuevas = new Set<number>();
    for (let corrida = 0; corrida < 5; corrida++) {
      const desde = await indiceDeArranque("cron-a", TOTAL);
      let i = desde;
      for (; i < TOTAL && i - desde < POR_CORRIDA; i++) nuevas.add(i);
      await guardarCorte("cron-a", i, TOTAL);
    }
    expect(nuevas.size).toBe(TOTAL);
    expect(nuevas.has(9)).toBe(true);
  });

  it("después de dar la vuelta completa, vuelve a empezar", async () => {
    const TOTAL = 4;
    for (let corrida = 0; corrida < 3; corrida++) {
      const desde = await indiceDeArranque("cron-a", TOTAL);
      let i = desde;
      for (; i < TOTAL && i - desde < 3; i++) {}
      await guardarCorte("cron-a", i, TOTAL);
    }
    // 0..2, después 3 (fin, borra), después 0..2 otra vez.
    expect(await indiceDeArranque("cron-a", TOTAL)).toBe(3);
  });
});
