import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ADMIN_KEY_ALLOWLIST, ADMIN_SELF_GATED_ROUTES } from "@/lib/admin-gate";

// ══════════════════════════════════════════════════════════════════════════
// Toda ruta de /api/admin verifica staff ELLA MISMA (isInternalUser)
// ══════════════════════════════════════════════════════════════════════════
// El middleware exige sesión de staff en /api/admin, pero no puede consultar la
// base: confía en el `isStaff` del JWT, y con NEXTAUTH_SECRET filtrado ese JWT
// se puede fabricar. La verificación real es `isInternalUser()` en la ruta:
// con el hotfix, la sesión se ata a la base (session-access), así que es staff
// verificado contra la base. Una ruta que sólo miraba `?key=` quedaba inútil
// (el middleware rechaza la clave) o, peor, abierta si alguna vez se la deja
// pasar. Una ruta sin ningún chequeo dependía sólo del middleware.
//
// Excepciones: la allowlist de automatización (la llaman crons con la clave) y
// las rutas de producto con gate propio (las usa el cliente), ambas en
// src/lib/admin-gate.ts. Cualquier otra, acá con su motivo — y si usa un
// chequeo de staff equivalente contra la base, documentarlo.
// ══════════════════════════════════════════════════════════════════════════

const APP = join(process.cwd(), "src", "app");
const ADMIN_DIR = join(APP, "api", "admin");

/** path de la ruta → motivo. Debería quedar vacía. */
const EXCEPCIONES: Record<string, string> = {};

const HANDLER = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g;

function rutas(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) rutas(p, out);
    else if (/[\\/]route\.ts$/.test(p)) out.push(p);
  }
  return out;
}

/** "/api/admin/x/[id]/y" a partir del archivo (en Windows las rutas usan `\`). */
function pathDeRuta(file: string): string {
  return "/" + relative(APP, file).replace(/\\/g, "/").replace(/\/route\.ts$/, "");
}

/** Sin comentarios de bloque ni de línea (los `//` de una URL `https://` quedan). */
function sinComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((l) => l.replace(/(^|[\s;,{}()])\/\/.*$/, "$1"))
    .join("\n");
}

/** Cuerpo `{ … }` de la función que empieza en `desde` (llaves emparejadas). */
function cuerpo(codigo: string, desde: number): string {
  const inicio = codigo.indexOf("{", codigo.indexOf(")", desde));
  let nivel = 0;
  for (let i = inicio; i < codigo.length; i++) {
    if (codigo[i] === "{") nivel++;
    else if (codigo[i] === "}" && --nivel === 0) return codigo.slice(inicio, i + 1);
  }
  return codigo.slice(inicio);
}

/**
 * Qué le falta a la ruta para contar como "exige staff": null si nada.
 * Pide el import de @/lib/feature-flags y que CADA handler exportado llegue a
 * `isInternalUser(` — directo o por una función del mismo archivo que lo llama.
 */
export function faltaStaff(fuente: string): string | null {
  const codigo = sinComentarios(fuente);
  if (!/import\s*\{[^}]*\bisInternalUser\b[^}]*\}\s*from\s*["']@\/lib\/feature-flags["']/.test(codigo)) {
    return "no importa isInternalUser de @/lib/feature-flags";
  }
  if (!/\bisInternalUser\(/.test(codigo)) return "no llama isInternalUser()";
  const ayudantes: string[] = [];
  for (const m of codigo.matchAll(/function\s+(\w+)\s*\(/g)) {
    if (/\bisInternalUser\(/.test(cuerpo(codigo, m.index!))) ayudantes.push(m[1]);
  }
  const sinChequeo = [...codigo.matchAll(HANDLER)]
    .filter((h) => {
      const b = cuerpo(codigo, h.index!);
      return !/\bisInternalUser\(/.test(b) && !ayudantes.some((n) => new RegExp(String.raw`\b${n}\(`).test(b));
    })
    .map((h) => h[1]);
  return sinChequeo.length ? `handler sin isInternalUser(): ${sinChequeo.join(", ")}` : null;
}

const EXCEPTUADAS = new Set([
  ...ADMIN_KEY_ALLOWLIST.map((r) => r.path),
  ...ADMIN_SELF_GATED_ROUTES.map((r) => r.path),
  ...Object.keys(EXCEPCIONES),
]);

describe("toda ruta de /api/admin exige staff (isInternalUser) ella misma", () => {
  const archivos = rutas(ADMIN_DIR);

  it("el barrido encuentra las rutas", () => {
    expect(archivos.length).toBeGreaterThan(100);
  });

  it("ninguna ruta fuera de las excepciones deja de verificar staff", () => {
    const faltan = archivos
      .filter((f) => !EXCEPTUADAS.has(pathDeRuta(f)))
      .map((f) => ({ path: pathDeRuta(f), falta: faltaStaff(readFileSync(f, "utf8")) }))
      .filter((x) => x.falta)
      .map((x) => `${x.path}: ${x.falta}`);
    expect(faltan, faltan.join("\n")).toEqual([]);
  });

  it("cada excepción existe y sigue haciendo falta (si ya verifica staff, sacarla)", () => {
    for (const path of Object.keys(EXCEPCIONES)) {
      const file = archivos.find((f) => pathDeRuta(f) === path);
      expect(file, `${path} no existe`).toBeDefined();
      expect(faltaStaff(readFileSync(file!, "utf8")), `${path} ya verifica staff`).not.toBeNull();
    }
  });
});

describe("faltaStaff — auto-chequeos", () => {
  const IMPORT = `import { isInternalUser } from "@/lib/feature-flags";\n`;
  const OK = `${IMPORT}export async function GET() {\n  if (!(await isInternalUser())) return deny();\n  return ok();\n}\n`;

  it("acepta una ruta que lo llama", () => {
    expect(faltaStaff(OK)).toBeNull();
    expect(faltaStaff(OK.replace(/\n/g, "\r\n"))).toBeNull();
  });

  it("reconoce una ruta sintética que no lo llama (la forma de las rutas sólo-clave)", () => {
    const soloClave =
      `import { ADMIN_API_KEY } from "@/lib/admin-key";\n` +
      `export async function GET(req) {\n  if (new URL(req.url).searchParams.get("key") !== ADMIN_API_KEY) return deny();\n  return ok();\n}\n`;
    expect(faltaStaff(soloClave)).not.toBeNull();
    // Importarlo sin llamarlo tampoco alcanza.
    expect(faltaStaff(`${IMPORT}export async function GET() { return ok(); }\n`)).not.toBeNull();
  });

  it("no se engaña con el llamado en un comentario", () => {
    const enComentarios =
      `${IMPORT}export async function GET() {\n` +
      `  // if (!(await isInternalUser())) return deny();\n` +
      `  /* isInternalUser() */\n` +
      `  /**\n   * await isInternalUser()\n   */\n` +
      `  return ok(); // isInternalUser()\n}\n`;
    expect(faltaStaff(enComentarios)).not.toBeNull();
  });

  it("exige el import real: una función local con el mismo nombre no cuenta", () => {
    const falsa = `const isInternalUser = async () => true;\nexport async function GET() {\n  if (!(await isInternalUser())) return deny();\n}\n`;
    expect(faltaStaff(falsa)).not.toBeNull();
  });

  it("cada handler exportado: un POST nuevo sin chequeo se detecta", () => {
    const conPostAbierto = `${OK}export async function POST() {\n  return borrarTodo();\n}\n`;
    expect(faltaStaff(conPostAbierto)).toMatch(/POST/);
  });

  it("acepta el chequeo dentro de una función del mismo archivo", () => {
    const conAyudante =
      `${IMPORT}async function exigirStaff() {\n  return isInternalUser();\n}\n` +
      `export async function GET() {\n  if (!(await exigirStaff())) return deny();\n}\n` +
      `export async function DELETE() {\n  if (!(await exigirStaff())) return deny();\n}\n`;
    expect(faltaStaff(conAyudante)).toBeNull();
  });

  it("el path se arma igual con separadores de Windows", () => {
    expect(pathDeRuta(join(APP, "api", "admin", "x", "[id]", "route.ts"))).toBe("/api/admin/x/[id]");
  });
});
