import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/pixel/script/route";

// ══════════════════════════════════════════════════════════════════════════
// LA RED DEL PIXEL — el JS emitido no puede cambiar ni un byte
// ══════════════════════════════════════════════════════════════════════════
// `src/app/api/pixel/script/route.ts` esta marcado CORE PROTEGIDO y su propio
// header avisa:
//
//   "Los regex dentro del template literal usan \\/ (doble escape).
//    NO cambiar a \/ — eso rompe el script entero."
//
// Ese archivo es un template literal de 1.600 lineas que se sirve tal cual al
// navegador de los compradores de los clientes. Si un refactor cambia un
// escape, el pixel deja de trackear y **no falla nada aca**: el dano ocurre en
// el navegador de un comprador, en otra empresa, y se descubre cuando alguien
// nota que faltan ventas atribuidas.
//
// Por eso existe este test. Congela el output byte a byte.
//
// ⚠️ REGENERAR EL SNAPSHOT NO ES UNA FORMA DE ARREGLAR ESTE TEST. Si se pone
// en rojo, el JS emitido cambio, y hay que mirar QUE cambio. Regenerarlo para
// que pase es destruir la unica red que tiene este archivo.
//
// Para regenerar a proposito (cuando el cambio es intencional y revisado):
//   ESCRIBIR_SNAPSHOT_PIXEL=1 npx vitest run src/__tests__/pixel-script-byte-identico.test.ts
// ══════════════════════════════════════════════════════════════════════════

const SNAPSHOT = join(process.cwd(), "src", "__tests__", "snapshots", "pixel-script.js.txt");
const ORG = "org-snapshot-fijo";

async function jsEmitido(org = ORG): Promise<string> {
  const req = new NextRequest(`https://nitrosales.vercel.app/api/pixel/script?org=${org}`);
  const res = await GET(req);
  return await res.text();
}

describe("el JS que emite el pixel", () => {
  it("es identico al snapshot, byte a byte", async () => {
    const actual = await jsEmitido();

    if (process.env.ESCRIBIR_SNAPSHOT_PIXEL === "1") {
      mkdirSync(dirname(SNAPSHOT), { recursive: true });
      writeFileSync(SNAPSHOT, actual, "utf8");
      console.log(`[snapshot] escrito: ${actual.length} bytes`);
      return;
    }

    expect(
      existsSync(SNAPSHOT),
      "No existe el snapshot del pixel. Generalo con ESCRIBIR_SNAPSHOT_PIXEL=1 " +
        "ANTES de refactorizar, nunca despues.",
    ).toBe(true);

    const guardado = readFileSync(SNAPSHOT, "utf8");

    // Se compara el largo primero para que el mensaje de error sea legible: un
    // diff de 60.000 caracteres no le dice nada a nadie.
    expect(actual.length, "cambio el LARGO del JS emitido").toBe(guardado.length);
    expect(actual).toBe(guardado);
  });

  it("el orgId se interpola de verdad", async () => {
    // Si el snapshot se generara sin interpolar, congelaria un script que no
    // es el que se sirve.
    const js = await jsEmitido("org-de-otro-cliente");
    expect(js).toContain("org-de-otro-cliente");
    expect(js).not.toContain(ORG);
  });

  it("y es el UNICO dato que cambia entre organizaciones", async () => {
    // Si algo mas variara por org, el snapshot de una no valdria para las otras
    // y esta red seria mas chica de lo que parece.
    const a = await jsEmitido("aaa");
    const b = await jsEmitido("bbb");
    expect(a.split("aaa").join("§")).toBe(b.split("bbb").join("§"));
  });
});

describe("las trampas que el header del archivo nombra", () => {
  it("los regex conservan el doble escape `\\\\/`", async () => {
    // El header avisa: cambiarlo a `\/` rompe el script entero porque se
    // interpreta como comentario.
    const js = await jsEmitido();
    expect(js).toContain("\\/");
  });

  it("el JS emitido parsea como JavaScript valido", async () => {
    // La prueba mas barata de que no quedo roto: que el motor lo acepte.
    // `new Function` compila sin ejecutar.
    const js = await jsEmitido();
    expect(() => new Function(js)).not.toThrow();
  });

  it("arranca y cierra como el IIFE que es", async () => {
    const js = await jsEmitido();
    expect(js.startsWith("(function() {")).toBe(true);
    expect(js.trimEnd().endsWith("})();")).toBe(true);
  });

  it("no quedan interpolaciones sin resolver", async () => {
    // Un `${...}` en el output significa un backtick mal cerrado en la fuente.
    const js = await jsEmitido();
    expect(js).not.toMatch(/\$\{/);
  });
});

describe("los pedidos invalidos no emiten script", () => {
  it("sin org devuelve un comentario, no el pixel", async () => {
    const res = await GET(new NextRequest("https://x/api/pixel/script"));
    const txt = await res.text();
    expect(txt).toContain("missing org");
    expect(txt).not.toContain("(function()");
  });

  it("con un org invalido tampoco", async () => {
    const res = await GET(
      new NextRequest("https://x/api/pixel/script?org=" + encodeURIComponent("../../etc/passwd")),
    );
    const txt = await res.text();
    expect(txt).toContain("invalid org");
    expect(txt).not.toContain("(function()");
  });
});

describe("el corte en nucleo + capas se mantiene", () => {
  const RUTA = join(process.cwd(), "src/app/api/pixel/script/route.ts");
  const fuente = readFileSync(RUTA, "utf8");

  it("existen las tres funciones", () => {
    expect(fuente).toContain("function nucleoGenerico(");
    expect(fuente).toContain("function capasVtex(");
    expect(fuente).toContain("function cierreDelNucleo(");
  });

  it("las seis capas VTEX viven TODAS en `capasVtex`", () => {
    // Si una capa se escapa al nucleo, el corte deja de servir para lo unico
    // que fue hecho: agregar una plataforma sin tocar el nucleo.
    const i = fuente.indexOf("function capasVtex(");
    const j = fuente.indexOf("function cierreDelNucleo(");
    const capas = fuente.slice(i, j);
    for (const capa of ["LAYER 1:", "LAYER 1.5:", "LAYER 2:", "LAYER 2.3:", "LAYER 2.5:", "LAYER 3:"]) {
      expect(capas, `${capa} se fue del bloque VTEX`).toContain(capa);
    }
  });

  it("y el nucleo NO menciona orderForm ni dataLayer de VTEX", () => {
    const i = fuente.indexOf("function nucleoGenerico(");
    const j = fuente.indexOf("function capasVtex(");
    const nucleo = fuente.slice(i, j);
    expect(nucleo).not.toContain("orderForm");
    expect(nucleo).not.toContain("orderPlaced");
  });

  it("el header registra la excepcion autorizada", () => {
    expect(fuente).toContain("CORE PROTEGIDO");
    expect(fuente).toMatch(/EXCEPCION AUTORIZADA/);
  });
});
