import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

// ══════════════════════════════════════════════════════════════════════════
// Ninguna clave de acceso escrita en el código
// ══════════════════════════════════════════════════════════════════════════
// /api/backfill/vtex y /api/fix-brands validaban contra una constante escrita
// en el código, y la página /backfill-runner (de cliente, sin sesión) la
// llevaba en su JavaScript: cualquiera que abriera la página la tenía.
// /api/admin/usage comparaba contra un literal. Una clave en el código la
// tiene cualquiera que lea el repo o el bundle, y no se puede rotar sin un
// deploy. Las claves salen del entorno o, mejor, se reemplazan por sesión.
// ══════════════════════════════════════════════════════════════════════════

const APP = join(process.cwd(), "src", "app");

function archivos(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) archivos(p, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Sin las líneas de comentario. */
function sinComentarios(src: string): string {
  return src
    .split(/\r?\n/)
    .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
    .join("\n");
}

// Una constante con nombre de clave inicializada con un literal largo (en
// cualquier archivo: una página de cliente la manda al navegador), o —en las
// rutas de la API— la clave del request comparada contra un literal. En las
// páginas `key === "Escape"` es una tecla, y en las plantillas `key` es el
// nombre de un campo: por eso la comparación sólo se mira en rutas, y sólo
// contra la clave que viene del request.
const CONSTANTE = /\bconst\s+[A-Z_]*(?:KEY|SECRET|TOKEN)[A-Z_]*\s*=\s*["'`][^"'`$]{8,}["'`]/;
const LEE_CLAVE = /const\s+(\w+)\s*=\s*(?:\w+\.)*searchParams\.get\(\s*["'](?:key|secret|token)["']\s*\)/g;

export function claveEnElCodigo(fuente: string, esRuta = true): string | null {
  const codigo = sinComentarios(fuente);
  const constante = codigo.match(CONSTANTE)?.[0];
  if (constante) return constante;
  if (!esRuta) return null;
  for (const m of codigo.matchAll(LEE_CLAVE)) {
    // `typeof token !== "string"` compara el TIPO, no la clave.
    const comparacion = codigo.match(new RegExp(String.raw`(?<!typeof\s+)\b${m[1]}\s*[!=]==?\s*["'][^"']{6,}["']`));
    if (comparacion) return comparacion[0];
  }
  return null;
}

describe("ninguna clave de acceso escrita en el código de src/app", () => {
  it("el barrido encuentra archivos", () => {
    expect(archivos(APP).length).toBeGreaterThan(300);
  });

  it("ningún archivo de src/app tiene una", () => {
    const hallados = archivos(APP)
      .map((p) => ({ p: relative(process.cwd(), p).replace(/\\/g, "/"), m: claveEnElCodigo(readFileSync(p, "utf8"), /[\\/]route\.ts$/.test(p)) }))
      .filter((x) => x.m)
      // Sólo el nombre del archivo y la forma: el valor no se imprime.
      .map((x) => `${x.p}: ${x.m!.replace(/["'`][^"'`]{8,}["'`]/, '"…"')}`);
    expect(hallados, hallados.join("\n")).toEqual([]);
  });

  it("reconoce las formas que había", () => {
    expect(claveEnElCodigo(`const BACKFILL_SECRET = "valor-sintetico-largo";`)).not.toBeNull();
    expect(claveEnElCodigo(`const BACKFILL_KEY = "valor-sintetico-largo";`)).not.toBeNull();
    expect(claveEnElCodigo(`const key = searchParams.get("key"); if (key !== process.env.ADMIN_SECRET && key !== "valor-2026") {`)).not.toBeNull();
    expect(claveEnElCodigo(`const ADMIN_API_KEY = process.env.ADMIN_API_KEY;`)).toBeNull();
    expect(claveEnElCodigo(`const CACHE_KEY_PREFIX = \`pixel:\${org}\`;`)).toBeNull();
    expect(claveEnElCodigo(`const key = searchParams.get("key"); if (key === "") return;`)).toBeNull();
    expect(claveEnElCodigo(`if (e.key === "Escape") close();`, false)).toBeNull();
    expect(claveEnElCodigo(`if (typeof key !== "string") return;`)).toBeNull();
    expect(claveEnElCodigo(`const token = searchParams.get("token"); if (typeof token !== "string") return;`)).toBeNull();
    expect(claveEnElCodigo(`for (const key of campos) { if (key === "subject") {} }`)).toBeNull();
  });
});
