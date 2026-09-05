import { describe, it, expect } from "vitest";
import { backfillDay } from "@/lib/pixel/rollup-backfill";

// ══════════════════════════════════════════════════════════════════════════
// E-01 / E-05 — el loop de orgs del backfill: aislamiento y reanudación
// ══════════════════════════════════════════════════════════════════════════
// Contexto (estudio de expansión, 2026-09-05, `docs/expansion-2026-09/`):
//
//   El loop era `for (const org of orgs) touched += await backfillDayOrg(...)`.
//   Sin try/catch y sin reloj. Dos problemas distintos con la misma raíz —
//   la unidad de trabajo era (día × tabla × TODAS las orgs), indivisible:
//
//   E-05: una org que falla mata el día de TODAS. La excepción subía al runner,
//         que abortaba el día y NO avanzaba el cursor. Un dato raro de un solo
//         cliente congelaba la analítica de todos, en silencio.
//
//   E-01: el costo del día crecía sin tope con la cantidad de clientes. Cuando
//         esa unidad dejaba de entrar en el maxDuration, el cursor no avanzaba
//         nunca más para esa tabla; y como la rotación del cron elige "la tabla
//         más atrasada", esa tabla ganaba todas las elecciones siguientes y las
//         otras seis quedaban sin turno. No se degrada: se clava.
//
//   E-02: y como la lista de orgs sale `ORDER BY organizationId` (cuid = orden
//         cronológico), el que quedaba sin procesar al cortar era SIEMPRE el
//         cliente más nuevo. El recién firmado abría la app y la veía vacía.
//
// El worker y el reloj se inyectan porque PGlite no trae `hll` y `backfillDayOrg`
// no corre en tests. Mismo criterio que `canStartAnotherDay`.
// ══════════════════════════════════════════════════════════════════════════

const ORGS = ["org_a", "org_b", "org_c", "org_d"];

describe("backfillDay — aislamiento por organización (E-05)", () => {
  it("una org que falla NO frena a las demás", async () => {
    const vistas: string[] = [];
    const r = await backfillDay("2026-09-01", ORGS, undefined, {
      runOrg: async (_d, org) => {
        vistas.push(org);
        if (org === "org_b") throw new Error("dato corrupto");
        return 1;
      },
    });

    // Las cuatro se intentaron, incluidas las dos que van DESPUÉS de la que falló.
    expect(vistas).toEqual(ORGS);
    // Y el día se da por completo: no hay cursor pendiente.
    expect(r.nextOrgId).toBeNull();
    // Sólo cuentan las tres que anduvieron.
    expect(r.touched).toBe(3);
  });

  it("el error viaja en `failures` — no se traga", async () => {
    const r = await backfillDay("2026-09-01", ORGS, undefined, {
      runOrg: async (_d, org) => {
        if (org === "org_b") throw new Error("relation gold_x does not exist");
        return 1;
      },
    });

    expect(r.failures).toEqual([
      { org: "org_b", error: "relation gold_x does not exist" },
    ]);
  });

  it("si fallan todas, se ven todas — el día no queda 'ok' y mudo", async () => {
    const r = await backfillDay("2026-09-01", ORGS, undefined, {
      runOrg: async () => {
        throw new Error("Neon caído");
      },
    });

    expect(r.failures).toHaveLength(4);
    expect(r.touched).toBe(0);
    expect(r.nextOrgId).toBeNull();
  });
});

describe("backfillDay — tope de tiempo y reanudación (E-01)", () => {
  it("corta entre orgs al vencer el deadline y dice por cuál seguir", async () => {
    let ahora = 1_000;
    const vistas: string[] = [];

    const r = await backfillDay("2026-09-01", ORGS, undefined, {
      deadlineAt: 1_000 + 200, // alcanza para dos orgs de 100ms (el chequeo va ANTES de cada una)
      now: () => ahora,
      runOrg: async (_d, org) => {
        vistas.push(org);
        ahora += 100;
        return 1;
      },
    });

    expect(vistas).toEqual(["org_a", "org_b"]);
    // La tercera es la que quedó pendiente.
    expect(r.nextOrgId).toBe("org_c");
    expect(r.orgsSeen).toBe(2);
  });

  it("reanuda EXACTAMENTE donde cortó, sin repetir trabajo ya hecho", async () => {
    const vistas: string[] = [];
    const r = await backfillDay("2026-09-01", ORGS, undefined, {
      startOrgId: "org_c",
      runOrg: async (_d, org) => {
        vistas.push(org);
        return 1;
      },
    });

    // No vuelve a procesar org_a ni org_b.
    expect(vistas).toEqual(["org_c", "org_d"]);
    expect(r.nextOrgId).toBeNull();
  });

  it("EL BUG DE E-02: sin reanudación, el cliente más nuevo nunca se procesa", async () => {
    // La lista está ordenada por cuid, o sea por antigüedad: org_d es el cliente
    // recién firmado. Con presupuesto para dos, dos invocaciones SIN cursor
    // procesan siempre las mismas dos primeras.
    const sinCursor: string[] = [];
    for (let i = 0; i < 2; i++) {
      let ahora = 0;
      await backfillDay("2026-09-01", ORGS, undefined, {
        deadlineAt: 200,
        now: () => ahora,
        runOrg: async (_d, org) => {
          sinCursor.push(org);
          ahora += 100;
          return 1;
        },
      });
    }
    // Se procesó dos veces lo mismo. org_d jamás aparece.
    expect(sinCursor).toEqual(["org_a", "org_b", "org_a", "org_b"]);
    expect(sinCursor).not.toContain("org_d");

    // Con cursor, dos invocaciones cubren a las cuatro.
    const conCursor: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 2; i++) {
      let ahora = 0;
      const r: Awaited<ReturnType<typeof backfillDay>> = await backfillDay(
        "2026-09-01",
        ORGS,
        undefined,
        {
          deadlineAt: 200,
          startOrgId: cursor,
          now: () => ahora,
          runOrg: async (_d, org) => {
            conCursor.push(org);
            ahora += 100;
            return 1;
          },
        }
      );
      cursor = r.nextOrgId;
    }
    expect(conCursor).toEqual(ORGS);
    expect(cursor).toBeNull();
  });

  it("un cursor que ya no existe (org borrada) arranca de cero, no explota", async () => {
    const vistas: string[] = [];
    const r = await backfillDay("2026-09-01", ORGS, undefined, {
      startOrgId: "org_que_ya_no_esta",
      runOrg: async (_d, org) => {
        vistas.push(org);
        return 1;
      },
    });

    expect(vistas).toEqual(ORGS);
    expect(r.nextOrgId).toBeNull();
  });

  it("sin deadline se comporta como antes: procesa todas de una", async () => {
    const vistas: string[] = [];
    const r = await backfillDay("2026-09-01", ORGS, undefined, {
      runOrg: async (_d, org) => {
        vistas.push(org);
        return 2;
      },
    });

    expect(vistas).toEqual(ORGS);
    expect(r.touched).toBe(8);
    expect(r.nextOrgId).toBeNull();
    expect(r.failures).toEqual([]);
  });
});
