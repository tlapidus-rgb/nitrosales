import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ══════════════════════════════════════════════════════════════════════════
// Los crons y /api/sync* validan la clave en un solo lugar
// ══════════════════════════════════════════════════════════════════════════
// Cada ruta comparaba la clave a mano y contra secretos distintos (ADMIN_API_KEY
// por alias, NEXTAUTH_SECRET, variables propias), con `===`. Funcionaba porque
// ADMIN_API_KEY y NEXTAUTH_SECRET valen lo mismo. El día que se separen —el
// primer paso para dejar de depender del secreto filtrado— la mitad habría
// dejado de correr sin avisar, y `/api/sync` reenvía la clave a otras rutas de
// la familia, así que una sola que quedara vieja cortaba la cadena.
//
// Este barrido fija que ninguna vuelva a comparar a mano: todas pasan por
// `isValidAdminKey`, `esClaveDeCron` o `esClavePropia` (src/lib/cron/clave.ts).
// ══════════════════════════════════════════════════════════════════════════

const API = join(process.cwd(), "src", "app", "api");

function rutasBajo(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) rutasBajo(p, out);
    else if (e.name === "route.ts") out.push(p);
  }
  return out;
}

/** Sin las líneas de comentario: los encabezados citan la forma vieja para explicarla. */
function sinComentarios(src: string): string {
  return src
    .split(/\r?\n/)
    .filter((l) => {
      const t = l.trim();
      return !(t.startsWith("//") || t.startsWith("/*") || t.startsWith("*"));
    })
    .join("\n");
}

const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8"));
const deCrons: string[] = [
  ...new Set<string>(vercel.crons.map((c: { path: string }) => c.path.split("?")[0])),
].map((p) => join(process.cwd(), "src", "app", p, "route.ts"));
const deSync = rutasBajo(join(API, "sync"));
const ALCANCE = [...new Set([...deCrons, ...deSync])];

// Una comparación directa contra algo que parece un secreto, de cualquiera de los dos lados.
const SECRETO = String.raw`(?:process\.env\.[A-Z_]*(?:SECRET|KEY)[A-Z_]*|ADMIN_API_KEY|CRON_KEY|WARM_CACHE_KEY|KEY)\b`;
const COMPARACION_A_MANO = new RegExp(String.raw`[!=]==\s*${SECRETO}|\b${SECRETO}\s*[!=]==`);
const VALIDA_CON_HELPER = /\b(?:isValidAdminKey|esClaveDeCron|esClavePropia|isInternalUser)\s*\(/;

const nombre = (p: string) => p.slice(join(process.cwd(), "src", "app").length).replace(/\\/g, "/");

describe("crons y /api/sync*: la clave se valida con el helper, nunca a mano", () => {
  it("el barrido encuentra las rutas (si esto falla, el barrido se rompió)", () => {
    expect(deCrons.length).toBeGreaterThanOrEqual(25);
    expect(deSync.length).toBeGreaterThanOrEqual(15);
    for (const p of deCrons) expect(existsSync(p), `${nombre(p)} está en vercel.json y no existe`).toBe(true);
  });

  it.each(ALCANCE.map((p) => [nombre(p), p]))("%s no compara secretos a mano", (_n, p) => {
    const codigo = sinComentarios(readFileSync(p, "utf8"));
    const linea = codigo.split("\n").find((l) => COMPARACION_A_MANO.test(l));
    expect(linea, "comparación a mano").toBeUndefined();
  });

  it.each(deCrons.map((p) => [nombre(p), p]))("%s valida la clave con un helper", (_n, p) => {
    expect(sinComentarios(readFileSync(p, "utf8"))).toMatch(VALIDA_CON_HELPER);
  });

  it("el patrón reconoce las formas viejas (si no, el barrido no protege nada)", () => {
    for (const vieja of [
      `if (key !== process.env.NEXTAUTH_SECRET) {`,
      `if (reqKey !== KEY && reqKey !== process.env.NEXTAUTH_SECRET) {`,
      `const ok = key === CRON_KEY ? true : await isInternalUser();`,
      `if (key !== WARM_CACHE_KEY) {`,
      `if (key !== process.env.SYNC_SECRET_KEY && key !== ADMIN_API_KEY) {`,
      `syncKey === process.env.SYNC_KEY;`,
      `if (process.env.CRON_SECRET === key) {`,
    ]) expect(COMPARACION_A_MANO.test(vieja), vieja).toBe(true);
    for (const sana of [
      `if (!esClaveDeCron(key)) {`,
      `const porSyncKey = esClavePropia(syncKey, process.env.SYNC_KEY);`,
      `if (process.env.VERCEL_ENV === "production") {`,
      `const KEY_PREFIX = "x"; if (k === "a") {}`,
    ]) expect(COMPARACION_A_MANO.test(sana), sana).toBe(false);
  });
});
