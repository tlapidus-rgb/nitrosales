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

// ══════════════════════════════════════════════════════════════════════════
// GUARD — el runner NO usa el corte intra-día (regresión del 2026-09-05)
// ══════════════════════════════════════════════════════════════════════════
// `backfillDay` SABE cortar entre orgs, y eso se testea arriba porque es la
// pieza de la que va a colgar la cola persistida de (org, tabla, día) — E-10.
// Pero `runRollupBackfill` NO debe usarlo, y esto es un guard, no un detalle:
//
//   Cortar a mitad escribe un día PARCIAL. El cron elige el rango con el
//   `MAX(day)` GLOBAL de la tabla (fix BP-ROLLUP-STUCK), así que alcanza que UNA
//   org escriba el día D para que D quede cerrado para todas. Al pasar la
//   medianoche `from = MAX+1` salta ese día y las orgs que no llegaron lo pierden
//   PARA SIEMPRE — con `ok: true` en la respuesta, la alerta de frescura en verde
//   (mira el MAX global) y el auto-chequeo de coherencia salteado justo en ese
//   caso, porque se saltea cuando hubo corte por presupuesto.
//
// Se detectó en la revisión de la branch antes de mergear, no en producción.
describe("GUARD — el runner no corta un día a mitad de las organizaciones", () => {
  it("`runRollupBackfill` llama a backfillDay SIN deadline", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(process.cwd(), "src", "lib", "pixel", "rollup-backfill.ts"),
      "utf8"
    );
    // La llamada del runner tiene que ser la de 3 argumentos.
    expect(src).toContain("const outcome = await backfillDay(cursor, orgs, table);");
    // Y no debe reaparecer el corte por presupuesto dentro del día.
    expect(src).not.toContain("deadlineAt: startedAt + budget");
    expect(src).not.toContain("nextOrgCursor");
  });
});
