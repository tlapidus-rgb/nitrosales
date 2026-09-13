import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// ══════════════════════════════════════════════════════════════════════════
// E-30 — el mapeo de estados de MELI no puede volver a duplicarse
// ══════════════════════════════════════════════════════════════════════════
// Habia SIETE copias, en dos familias que no coincidian. `confirmed` era
// APPROVED en cinco y PENDING en dos, y eso decide si la orden cuenta como
// venta: la MISMA orden valia como facturacion o no segun que codigo la
// escribio.
//
// VTEX tiene un mapper canonico con el cartel "NO duplicar esta logica" desde
// hace meses. El cartel solo no alcanzo para MELI, porque un cartel no es un
// control. Esto si lo es.
// ══════════════════════════════════════════════════════════════════════════

const RAIZ = join(process.cwd(), "src");
const CANONICO = join(RAIZ, "lib", "meli-status.ts");

function fuentes(dir: string): string[] {
  const salida: string[] = [];
  const recorrer = (d: string) => {
    for (const e of readdirSync(d)) {
      if (e === "node_modules" || e === ".next" || e === "__tests__") continue;
      const p = join(d, e);
      if (statSync(p).isDirectory()) recorrer(p);
      else if ((p.endsWith(".ts") || p.endsWith(".tsx")) && !p.endsWith(".test.ts")) salida.push(p);
    }
  };
  recorrer(dir);
  return salida;
}

const sinComentarios = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

/** Estados de MELI que, si aparecen mapeados juntos, son una copia del mapper. */
const ESTADOS = ["payment_required", "payment_in_process", "partially_paid"];

describe("el mapeo de MELI vive en un solo lugar", () => {
  const otros = fuentes(RAIZ).filter((f) => f !== CANONICO);

  it("ningun otro archivo mapea los estados de MELI", () => {
    // El criterio es "dos o mas de estos estados en el mismo archivo": uno
    // suelto puede ser una comparacion legitima; tres juntos es una tabla.
    const copias = otros.filter((f) => {
      const s = sinComentarios(readFileSync(f, "utf8"));
      return ESTADOS.filter((e) => s.includes(e)).length >= 2;
    });
    expect(copias).toEqual([]);
  });

  it("nadie define su propio mapMlStatus / mapMLOrderStatus", () => {
    const copias = otros.filter((f) =>
      /function\s+(mapMlStatus|mapMLOrderStatus)\s*\(/.test(sinComentarios(readFileSync(f, "utf8"))),
    );
    expect(copias).toEqual([]);
  });

  it("y el canonico lleva el cartel, como el de VTEX", () => {
    const s = readFileSync(CANONICO, "utf8");
    expect(s).toContain("FUENTE ÚNICA DE VERDAD");
    expect(s).toContain("NO duplicar esta lógica");
  });
});

describe("los que ingieren ordenes de MELI usan el canonico", () => {
  const INGESTORES = [
    "lib/connectors/ml-notification-processor.ts",
    "lib/backfill/processors/ml-processor.ts",
    "app/api/sync/mercadolibre/route.ts",
    "app/api/sync/mercadolibre/backfill/route.ts",
    "app/api/cron/ml-sync/route.ts",
    "app/api/cron/ml-reconcile/route.ts",
    "app/api/admin/ml-force-refresh/route.ts",
  ];

  for (const rel of INGESTORES) {
    it(`${rel} importa mapMeliStatus`, () => {
      const s = readFileSync(join(RAIZ, rel), "utf8");
      expect(s).toContain('from "@/lib/meli-status"');
      expect(sinComentarios(s)).toContain("mapMeliStatus(");
    });
  }
});
