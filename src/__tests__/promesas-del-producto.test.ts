import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// ══════════════════════════════════════════════════════════════════════════
// E-26 — la UI no puede prometer un motor que no existe
// ══════════════════════════════════════════════════════════════════════════
// La pantalla de LTV decia que el motor "combina BG/NBD y Gamma-Gamma"
// (Fader & Hardie, Wharton) y que se "reentrena diariamente". Las dos cosas
// eran falsas: el motor es RFM por cohortes y solo corre cuando alguien
// aprieta un boton.
//
// Lo mas incomodo es que el componente del sello declaraba, en un comentario,
// que sus leyendas eran "100% verdaderas y defendibles legalmente". La regla
// estaba escrita y aun asi la leyenda era falsa — porque nadie la volvio a
// comparar contra el codigo cuando el motor cambio.
//
// Este test hace esa comparacion automaticamente.
// ══════════════════════════════════════════════════════════════════════════

const raiz = process.cwd();

function archivosDe(dir: string, ext: string[]): string[] {
  const salida: string[] = [];
  const recorrer = (d: string) => {
    for (const entrada of readdirSync(d)) {
      // El propio test nombra los modelos para poder buscarlos: si se mirara
      // a si mismo estaria siempre rojo.
      if (entrada === "node_modules" || entrada === ".next" || entrada === "__tests__") continue;
      const p = join(d, entrada);
      if (statSync(p).isDirectory()) recorrer(p);
      else if (ext.some((e) => p.endsWith(e))) salida.push(p);
    }
  };
  recorrer(dir);
  return salida;
}

describe("el motor de LTV es el que decimos que es", () => {
  it("NO hay implementacion de BG/NBD ni Gamma-Gamma en el repo", () => {
    // Si algun dia se implementan de verdad, este test se pone rojo y ahi si
    // se puede volver a poner el sello. Es la unica via valida para revivirlo.
    const fuentes = archivosDe(join(raiz, "src"), [".ts", ".tsx"]);
    const implementan = fuentes.filter((f) => {
      const s = readFileSync(f, "utf8");
      return /\b(bgnbd|bg_nbd|betaGeometric|gammaGamma|paretoNBD)\b/i.test(s);
    });
    expect(implementan).toEqual([]);
  });

  it("y el motor real se describe como cohortes, no como probabilistico", () => {
    const motor = readFileSync(join(raiz, "src/lib/ltv/prediction-engine.ts"), "utf8");
    expect(motor).toContain("Cohort-based frequency prediction");
  });
});

describe("la UI no promete lo que el motor no hace", () => {
  const ui = archivosDe(join(raiz, "src/app"), [".tsx"]).concat(
    archivosDe(join(raiz, "src/components"), [".tsx"]),
  );

  // Hay que sacar los comentarios ANTES de buscar: el archivo que arregla una
  // promesa falsa es justo el que la cita para explicar por que la saco. Es el
  // mismo choque de #S61-EL-TEST-DE-SOURCE-LEE-MIS-PROPIOS-COMENTARIOS, y aca
  // suma los bloques JSX `{/* ... */}`, que no empiezan con //.
  const sinComentarios = (s: string) =>
    s
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");

  it("ningun componente dice BG/NBD ni Gamma-Gamma", () => {
    const culpables = ui.filter((f) =>
      /BG\/NBD|Gamma-Gamma/i.test(sinComentarios(readFileSync(f, "utf8"))),
    );
    expect(culpables).toEqual([]);
  });

  it("ningun componente atribuye el motor a Wharton ni a Fader & Hardie", () => {
    const culpables = ui.filter((f) =>
      /wharton|Fader\s*&amp;?\s*Hardie|Fader\s+&\s+Hardie/i.test(
        sinComentarios(readFileSync(f, "utf8")),
      ),
    );
    expect(culpables).toEqual([]);
  });

  it("ningun componente promete reentrenamiento diario", () => {
    // No hay cron de LTV en vercel.json ni nadie que llame a runBatchPrediction.
    // Solo corre con el boton "Recalcular predicciones".
    const culpables = ui.filter((f) =>
      /reentrenad[oa] diariamente|reentrena a diario|entrenamiento diario/i.test(
        sinComentarios(readFileSync(f, "utf8")),
      ),
    );
    expect(culpables).toEqual([]);
  });
});

describe("y si alguien agrega el cron, este test avisa que el copy puede cambiar", () => {
  it("hoy NO hay cron que recalcule LTV", () => {
    const vercel = readFileSync(join(raiz, "vercel.json"), "utf8");
    expect(vercel).not.toMatch(/ltv\/predict/);
  });
});

describe("el behavioral score no promete una calibracion que no existe", () => {
  it("los pesos son constantes, asi que nadie puede decir que se recalibran", () => {
    // `WEIGHTS` es un objeto `as const`. No hay cron, no hay job, no hay tabla
    // de calibracion. Decia "Recalibracion semanal contra conversiones reales".
    const motor = readFileSync(join(raiz, "src/lib/bondly/behavioral-score.ts"), "utf8");
    expect(motor).toMatch(/const WEIGHTS = \{[\s\S]*?\} as const;/);
  });

  it("ningun componente promete recalibracion periodica", () => {
    const ui = archivosDe(join(raiz, "src/app"), [".tsx"]).concat(
      archivosDe(join(raiz, "src/components"), [".tsx"]),
    );
    const culpables = ui.filter((f) => {
      const s = readFileSync(f, "utf8")
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((l) => !l.trim().startsWith("//"))
        .join("\n");
      return /recalibraci[oó]n (semanal|diaria|mensual)|se recalibra/i.test(s);
    });
    expect(culpables).toEqual([]);
  });
});
