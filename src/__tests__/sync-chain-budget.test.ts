import { describe, it, expect } from "vitest";
import {
  canStartAnotherOrg,
  ORG_BUDGET_MS,
  INVOCATION_BUDGET_MS,
} from "@/lib/sync/chain-budget";

// ══════════════════════════════════════════════════════════════════════════
// E-03 — `sync/chain` sincronizaba UNA sola organización por corrida
// ══════════════════════════════════════════════════════════════════════════
// Esto NO era una proyección: estaba roto con los 4 clientes que hay hoy.
//
//   `maxDuration` era 60 y los presupuestos de los tres pasos suman ~55s POR
//   organización (25s inventory + ~13s details + ~17s reconcile). O sea que
//   entraba una sola y las demás NUNCA sincronizaban inventario, precios ni
//   detalles de VTEX. Se nota río abajo: el módulo de P&L usa `costPrice`, que
//   para esos clientes no se poblaba nunca.
//
//   Y como el `findMany` no tenía `orderBy`, la que corría era siempre la misma
//   —el orden de Postgres es arbitrario pero estable— así que las mismas
//   organizaciones quedaban afuera todos los días. Es el mismo patrón de
//   inanición que E-02, en otro archivo.
//
// Ahora: maxDuration 300, presupuesto de invocación explícito, y orden por
// "hace más tiempo que no corre". La reanudación es implícita: el orden hace que
// la corrida siguiente arranque justo por la que quedó afuera.
//
// `vercel.json` ya cubría `app/api/sync/**` con maxDuration 800; lo que faltaba
// era el `export` de la ruta, que es el que manda.
// ══════════════════════════════════════════════════════════════════════════

describe("E-03 — presupuesto de organizaciones en sync/chain", () => {
  it("con el presupuesto viejo (60s) entraba UNA sola organización", () => {
    // Reproduce el bug: 60s de techo, 55s por org.
    const techoViejo = 60_000;
    expect(canStartAnotherOrg(0, ORG_BUDGET_MS, techoViejo)).toBe(true);
    // Después de la primera ya no entra ninguna más.
    expect(canStartAnotherOrg(55_000, ORG_BUDGET_MS, techoViejo)).toBe(false);
  });

  it("con el presupuesto nuevo entran al menos 4 organizaciones", () => {
    // Los 4 clientes de hoy tienen que entrar todos en una corrida.
    let elapsed = 0;
    let cuantas = 0;
    while (canStartAnotherOrg(elapsed)) {
      cuantas++;
      elapsed += ORG_BUDGET_MS;
    }
    expect(cuantas).toBeGreaterThanOrEqual(4);
  });

  it("no arranca una organización que no va a poder terminar", () => {
    // El caso que importa: quedan 30s y una org necesita 55s. Arrancarla
    // significa cortarla a mitad y dejar su lock tomado sin haber hecho nada útil.
    const casiSinTiempo = INVOCATION_BUDGET_MS - 30_000;
    expect(canStartAnotherOrg(casiSinTiempo)).toBe(false);
  });

  it("justo al límite entra (el <= es a propósito: no desperdiciar una tanda)", () => {
    const justo = INVOCATION_BUDGET_MS - ORG_BUDGET_MS;
    expect(canStartAnotherOrg(justo)).toBe(true);
    expect(canStartAnotherOrg(justo + 1)).toBe(false);
  });

  it("el presupuesto de invocación deja aire bajo el maxDuration", () => {
    // maxDuration = 300s. Si el presupuesto fuera >= eso, Vercel mataría la
    // función antes de que pueda responder y se perdería el resultado entero.
    expect(INVOCATION_BUDGET_MS).toBeLessThan(300_000);
    // Y tiene que alcanzar para varias organizaciones, si no no arreglamos nada.
    expect(INVOCATION_BUDGET_MS).toBeGreaterThan(ORG_BUDGET_MS * 4);
  });
});

describe("E-03 — guards sobre el archivo", () => {
  it("la ruta declara maxDuration 300, no 60", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(process.cwd(), "src", "app", "api", "sync", "chain", "route.ts"),
      "utf8"
    );
    expect(src).toContain("export const maxDuration = 300;");
    expect(src).not.toContain("export const maxDuration = 60;");
  });

  it("los tres self-fetch mandan el header de bypass de Deployment Protection", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(process.cwd(), "src", "app", "api", "sync", "chain", "route.ts"),
      "utf8"
    );
    // Sin esto, cuando dispara Vercel Cron los tres pasos reciben 401 con body
    // HTML, `res.json()` explota, y el error queda tapado por markSyncSuccess.
    const conHeaders = src.match(/headers: selfFetchHeaders\(\)/g) ?? [];
    expect(conHeaders).toHaveLength(3);
    expect(src).toContain("x-vercel-protection-bypass");
  });

  it("las organizaciones se ordenan por antigüedad de sync, no arbitrariamente", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(process.cwd(), "src", "app", "api", "sync", "chain", "route.ts"),
      "utf8"
    );
    expect(src).toContain('lastSuccessfulSyncAt: { sort: "asc", nulls: "first" }');
  });
});
