import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// ══════════════════════════════════════════════════════════════════════════
// GUARD — ningún cron autentica por `user-agent` (auditoría 2026-07-22)
// ══════════════════════════════════════════════════════════════════════════
// 9 crons aceptaban la invocación si el header `user-agent` contenía
// "vercel-cron". Pero el user-agent lo pone quien llama: `curl -A vercel-cron`
// pasaba SIN key. Uno de esos crons manda mails a los clientes; otros disparan
// rebuilds de historia completa. La auth quedó SÓLO por key (Vercel Cron la
// manda en vercel.json).
//
// Este guard falla si alguien vuelve a autenticar por user-agent. La distinción
// de ORIGEN (Vercel vs manual, para overrides) sí es válida, pero DEBE usar el
// header `x-vercel-cron` (confiable: Vercel lo strippea de requests externas),
// nunca el user-agent.
// ══════════════════════════════════════════════════════════════════════════

const CRON_DIR = join(process.cwd(), "src/app/api/cron");

function cronRoutes(): string[] {
  const out: string[] = [];
  for (const name of readdirSync(CRON_DIR)) {
    const p = join(CRON_DIR, name, "route.ts");
    try {
      if (statSync(p).isFile()) out.push(p);
    } catch {
      /* sin route.ts */
    }
  }
  return out;
}

describe("crons — la auth no depende del user-agent", () => {
  const routes = cronRoutes();

  it("hay crons para revisar (sanity)", () => {
    expect(routes.length).toBeGreaterThan(5);
  });

  it("NINGÚN cron usa `user-agent` para decidir acceso", () => {
    const offenders: string[] = [];
    for (const p of routes) {
      const src = readFileSync(p, "utf8");
      // El patrón exacto del bypass viejo + cualquier lectura de user-agent
      // cerca de "vercel-cron".
      if (/user-agent"\)\s*\?\.\s*includes\(\s*"vercel-cron"/.test(src)) {
        offenders.push(p.replace(process.cwd(), "").replace(/\\/g, "/"));
      }
    }
    expect(offenders, `crons que autentican por user-agent:\n${offenders.join("\n")}`).toEqual([]);
  });
});
