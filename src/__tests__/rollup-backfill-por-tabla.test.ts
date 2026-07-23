import { describe, it, expect } from "vitest";
import {
  ROLLUP_TABLES,
  isRollupTable,
  tablesToRun,
  runRollupBackfill,
} from "@/lib/pixel/rollup-backfill";

// ══════════════════════════════════════════════════════════════════════════
// Modo backfill por tabla (2026-07-23, pedido operativo de Codex, sección 23)
// ══════════════════════════════════════════════════════════════════════════
// El backfill de un día corre 7 statements HLL secuenciales. Un día pico (Hot
// Sale) de una org grande (Arredo) NO entra en el maxDuration ni procesándola
// sola: la función muere a mitad y las tablas 4-7 quedan viejas; repetir la URL
// recomputa 1-3 y vuelve a morir en la misma. `?table=` completa UNA tabla por
// invocación.
//
// El SQL usa `hll`, que PGlite no tiene → no se puede ejecutar el backfill. Lo
// que SÍ se testea: la decisión de QUÉ tablas corren (pura) y la validación de
// params (que retorna ANTES de tocar la DB).
// ══════════════════════════════════════════════════════════════════════════

describe("backfill por tabla — decisión de qué corre", () => {
  it("tabla válida ejecuta UNA sola unidad", () => {
    expect(tablesToRun("source")).toEqual(["source"]);
    expect(tablesToRun("page")).toEqual(["page"]);
  });

  it("sin table conserva el contrato: las 7 en orden", () => {
    expect(tablesToRun(undefined)).toEqual([
      "aggregates",
      "device",
      "type",
      "page",
      "product",
      "source",
      "funnel",
    ]);
    // Y es exactamente ROLLUP_TABLES (misma fuente).
    expect(tablesToRun(undefined)).toEqual([...ROLLUP_TABLES]);
  });

  it("continuar desde `page` NO vuelve a ejecutar aggregates/device/type", () => {
    const run = tablesToRun("page");
    expect(run).not.toContain("aggregates");
    expect(run).not.toContain("device");
    expect(run).not.toContain("type");
    expect(run).toContain("page");
  });

  it("isRollupTable reconoce las 7 y rechaza el resto", () => {
    for (const t of ROLLUP_TABLES) expect(isRollupTable(t)).toBe(true);
    expect(isRollupTable("aggregate")).toBe(false); // singular, typo común
    expect(isRollupTable("pixel_daily_source")).toBe(false);
    expect(isRollupTable("")).toBe(false);
  });
});

describe("backfill por tabla — validación de params (sin tocar la DB)", () => {
  it("tabla inválida devuelve 400", async () => {
    const r = await runRollupBackfill({
      from: "2026-05-12",
      to: "2026-05-12",
      cursor: "2026-05-12",
      org: "org1",
      table: "basura",
    });
    expect(r.httpStatus).toBe(400);
    expect(String((r.body as any).error)).toContain("table inválida");
  });

  it("`table` sin `org` devuelve 400", async () => {
    const r = await runRollupBackfill({
      from: "2026-05-12",
      to: "2026-05-12",
      cursor: "2026-05-12",
      table: "source",
    });
    expect(r.httpStatus).toBe(400);
    expect(String((r.body as any).error)).toContain("exige también ?org=");
  });
});
