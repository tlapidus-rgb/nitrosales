import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

// ══════════════════════════════════════════════════════════════════════════
// Ningún secreto puede vivir en un componente de cliente
// ══════════════════════════════════════════════════════════════════════════
// Encontrado el 2026-09-06 revisando R-C02: `/backfill-runner/page.tsx` es un
// `"use client"` y tenía la clave que autenticaba `/api/backfill/vtex` y
// `/api/fix-brands` — dos endpoints que borran órdenes y reescriben catálogos
// de clientes reales. Todo lo que está en un client component termina en el
// bundle estático, que Next sirve SIN autenticación: la clave era pública para
// cualquiera que abriera la página o pidiera el chunk.
//
// Este test es el que lo habría atajado. Recorre todo `src/app` y `src/components`
// buscando literales que parezcan credenciales dentro de archivos marcados
// `"use client"`.
// ══════════════════════════════════════════════════════════════════════════

const RAICES = ["src/app", "src/components"];

/** Literales conocidos que NUNCA pueden estar del lado del cliente. */
const SECRETOS_CONOCIDOS = [
  ["clave del backfill", ["nitrosales", "backfill", "2024"].join("-")],
  ["admin api key", ["nitrosales", "secret", "key", "2024", "production"].join("-")],
] as const;

function archivos(dir: string, ext: string[], out: string[] = []): string[] {
  let entradas;
  try {
    entradas = readdirSync(join(process.cwd(), dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entradas) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) archivos(rel, ext, out);
    else if (ext.some((x) => e.name.endsWith(x))) out.push(rel);
  }
  return out;
}

const clientes = archivos(RAICES[0], [".tsx", ".ts"])
  .concat(archivos(RAICES[1], [".tsx", ".ts"]))
  .map((rel) => ({ rel, src: readFileSync(join(process.cwd(), rel), "utf8") }))
  .filter(({ src }) => /^\s*["']use client["']/m.test(src));

describe("secretos en el bundle del cliente", () => {
  it("hay componentes de cliente que revisar (si esto falla, el barrido se rompió)", () => {
    expect(clientes.length).toBeGreaterThan(10);
  });

  it.each(SECRETOS_CONOCIDOS)("ningún client component contiene la %s", (_nombre, secreto) => {
    const culpables = clientes.filter(({ src }) => src.includes(secreto)).map(({ rel }) => rel);
    expect(culpables).toEqual([]);
  });

  it("tampoco hay asignaciones que huelan a credencial del lado del cliente", () => {
    // Heurística deliberadamente amplia: preferimos un falso positivo que haya
    // que justificar, a otra clave viajando en el bundle sin que nadie mire.
    const sospechosos: string[] = [];
    for (const { rel, src } of clientes) {
      const sinComentarios = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      const m = sinComentarios.match(
        /\b(?:const|let|var)\s+\w*(?:SECRET|TOKEN|APIKEY|API_KEY|PASSWORD|_KEY)\w*\s*=\s*["'][^"']{8,}["']/gi,
      );
      if (m) sospechosos.push(`${rel}: ${m[0].slice(0, 60)}`);
    }
    expect(sospechosos).toEqual([]);
  });
});
