import { expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { CRONES_CON_LATIDO, schedulesConLatido, schedulesDeVercel } from "./schedules";
import { cronesAtrasados } from "./latido";

it("preserves both cadences when one route is scheduled twice", () => {
  const schedules = schedulesDeVercel([
    { path: "/api/cron/example?mode=recent", schedule: "0 */2 * * *" },
    { path: "/api/cron/example?mode=deep", schedule: "0 3 * * *" },
  ]);
  expect(schedules.example).toEqual(["0 */2 * * *", "0 3 * * *"]);
  const now = new Date("2026-09-21T12:00:00Z");
  const issues = cronesAtrasados([{ cron: "example", ultimaCorrida: new Date(now.getTime() - 500 * 60000),
    ultimaOk: true, ultimoError: null }], schedules, now);
  expect(issues).toHaveLength(1);
  expect(issues[0]).toMatchObject({ cadaMin: 120, motivo: "atrasado" });
});

it("does not expect heartbeats from uninstrumented scheduled routes", () => {
  expect(Object.keys(schedulesConLatido()).sort()).toEqual([...CRONES_CON_LATIDO].sort());
  expect(schedulesConLatido()).not.toHaveProperty("backfill-runner");
  expect(schedulesDeVercel()).toHaveProperty("backfill-runner");
});

it("keeps the declared coverage aligned with actual route instrumentation", () => {
  const detected = readdirSync("src/app/api/cron").filter(name => {
    const path = `src/app/api/cron/${name}/route.ts`;
    return existsSync(path) && readFileSync(path, "utf8").includes("registrarLatido(");
  });
  expect(detected.sort()).toEqual([...CRONES_CON_LATIDO].sort());
  for (const cron of CRONES_CON_LATIDO) {
    const source = readFileSync(`src/app/api/cron/${cron}/route.ts`, "utf8");
    expect(source).toContain(`registrarLatido("${cron}"`);
  }
});
