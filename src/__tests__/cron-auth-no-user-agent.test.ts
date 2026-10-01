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
// Este guard falla si alguien vuelve a autenticar por user-agent, o por el
// header `x-vercel-cron`. Se creía que Vercel lo eliminaba de requests externas;
// la documentación de Vercel no lo dice (ni siquiera documenta que lo mande), así
// que se puede falsificar igual que el user-agent (corregido 2026-10-01).
// meta-token-refresh lo usaba para dejar pasar sin clave.
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

// ── `x-vercel-cron` tampoco es prueba de nada ───────────────────────────────
// Se busca en TODAS las rutas de la API, no sólo en los crons: el header lo
// puede mandar cualquiera, así que no puede abrir nada en ningún lado. Leerlo
// para otra cosa (loguear, elegir un rango por defecto) está bien; meterlo en
// una decisión de acceso, no.
function todasLasRutas(dir = join(process.cwd(), "src/app/api"), out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) todasLasRutas(p, out);
    else if (e.name === "route.ts") out.push(p);
  }
  return out;
}

/** ¿El código deja pasar a alguien por el header `x-vercel-cron`? */
function daAccesoPorHeaderDeCron(fuente: string): boolean {
  const codigo = fuente
    .split(/\r?\n/)
    .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
    .join(" ")
    .replace(/\s+/g, " ");
  const LEE = String.raw`(?:req|request)\.headers\.get\(\s*["']x-vercel-cron["']\s*\)`;
  if (new RegExp(String.raw`\|\|\s*${LEE}|${LEE}[^;]*\|\|`).test(codigo)) return true;
  for (const m of codigo.matchAll(new RegExp(String.raw`(?:const|let)\s+(\w+)\s*=\s*${LEE}`, "g"))) {
    const v = m[1];
    if (new RegExp(String.raw`\b${v}\s*\|\||\|\|\s*${v}\b|if\s*\(\s*!?\s*${v}\s*\)\s*return`).test(codigo)) return true;
  }
  return false;
}

describe("ninguna ruta da acceso por el header x-vercel-cron", () => {
  it("ninguna lo usa para decidir acceso", () => {
    const offenders = todasLasRutas()
      .filter((p) => daAccesoPorHeaderDeCron(readFileSync(p, "utf8")))
      .map((p) => p.replace(process.cwd(), "").replace(/\\/g, "/"));
    expect(offenders, `rutas que dejan pasar por x-vercel-cron:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("reconoce la forma vieja de meta-token-refresh y deja pasar los usos que no son acceso", () => {
    expect(daAccesoPorHeaderDeCron(
      `const isCron = req.headers.get("x-vercel-cron") === "1";\n const allowed = isCron || key === KEY || (await isInternalUser());`,
    )).toBe(true);
    expect(daAccesoPorHeaderDeCron(`const ok = isValidAdminKey(key) || req.headers.get("x-vercel-cron") === "1";`)).toBe(true);
    expect(daAccesoPorHeaderDeCron(`const isVercelCron = req.headers.get("x-vercel-cron") === "1"; const from = isVercelCron ? d : p;`)).toBe(false);
    expect(daAccesoPorHeaderDeCron(`console.log({ cronHeader: req.headers.get("x-vercel-cron") });`)).toBe(false);
  });
});
