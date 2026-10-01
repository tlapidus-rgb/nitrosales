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

// ── Qué cuenta como "comparar a mano" ─────────────────────────────────────
// Se busca la CONDICIÓN, no una forma sintáctica (E-03): cualquier comparación
// —`===`, `!==`, `==`, `!=`— entre dos expresiones que no son literales, donde
// una de las dos parece un secreto (por nombre: termina en KEY/Key/key,
// SECRET/Secret/secret, o es process.env). También `[a, b].includes(clave)` y la
// comparación contra un template literal con un secreto adentro. El código se
// une en una sola línea antes de buscar, así un prettier que parte la
// comparación en dos no la esconde.
//
// No cuentan los chequeos de presencia (`typeof process.env.X === "string"`,
// `=== undefined`): comparan contra un literal, no contra otra clave.
// Un operando es un identificador con accesos y llamadas encadenadas:
// `searchParams.get("key")`, `req.nextUrl.searchParams.get("key")`. Antes sólo
// se aceptaban identificadores sueltos, y la forma vieja de ocho rutas
// (`searchParams.get("key") !== CRON_KEY`) pasaba sin que nadie la viera.
const OPERANDO = String.raw`[A-Za-z_$][\w$]*(?:\.[\w$]+|\[["'][\w$]+["']\]|\(\s*(?:["'][^"']*["']|[\w$.]*)\s*\))*`;
const COMPARACION = new RegExp(String.raw`(${OPERANDO})\s*(?:===|!==|==|!=)\s*(${OPERANDO})`, "g");
const PARECE_SECRETO =
  /(?:^process\.env\b|(?:KEY|Key|key|SECRET|Secret|secret)$|(?:KEY|SECRET)["']\]$|\.get\(\s*["'](?:key|syncKey)["']\s*\)$)/;
const NO_ES_CLAVE = new Set(["undefined", "null", "true", "false", "NaN"]);
const INCLUDES = /\.includes\(\s*[\w$.]*(?:KEY|Key|key|SECRET|Secret|secret)\s*\)/;
const TEMPLATE = /(?:===|!==|==|!=)\s*`[^`]*\$\{[^}]*(?:KEY|SECRET)/;
// Una variable con nombre inocente que guarda un secreto (`const esperado =
// process.env.NEXTAUTH_SECRET`) también cuenta como secreto al compararla.
const ALIAS_DE_SECRETO = /(?:const|let|var)\s+([\w$]+)\s*=\s*(process\.env(?:\.[A-Z_]*(?:SECRET|KEY)[A-Z_]*|\[["'][A-Z_]+["']\])|ADMIN_API_KEY)\b/g;

/** Las comparaciones a mano que encuentra, o [] si no hay. */
function comparacionesAMano(codigo: string): string[] {
  const plano = codigo.replace(/\s+/g, " ");
  const alias = new Set([...plano.matchAll(ALIAS_DE_SECRETO)].map((m) => m[1]));
  const esSecreto = (op: string) => PARECE_SECRETO.test(op) || alias.has(op);
  const halladas: string[] = [];
  for (const m of plano.matchAll(COMPARACION)) {
    const [entera, a, b] = m;
    if (NO_ES_CLAVE.has(a) || NO_ES_CLAVE.has(b)) continue;
    if (esSecreto(a) || esSecreto(b)) halladas.push(entera);
  }
  for (const r of [INCLUDES, TEMPLATE]) {
    const m = plano.match(r);
    if (m) halladas.push(m[0]);
  }
  return halladas;
}

/** ¿La ruta lee una clave del request? Entonces tiene que validarla con un helper. */
const LEE_CLAVE = /searchParams\.get\(\s*["']key["']\s*\)|\.syncKey\b/;
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
    expect(comparacionesAMano(codigo), "comparación a mano").toEqual([]);
  });

  it.each(ALCANCE.map((p) => [nombre(p), p]))("%s, si lee una clave, la valida con un helper", (_n, p) => {
    const codigo = sinComentarios(readFileSync(p, "utf8"));
    if (deCrons.includes(p) || LEE_CLAVE.test(codigo)) expect(codigo).toMatch(VALIDA_CON_HELPER);
  });

  it.each(ALCANCE.map((p) => [nombre(p), p]))("%s no le devuelve al que llama una clave que no mandó", (_n, p) => {
    // competitor-discovery y search-match devolvían un `nextUrl` con
    // NEXTAUTH_SECRET adentro. Hoy da igual (es la misma clave que la de admin),
    // pero separadas, quien tuviera la de admin se llevaba la de sesión.
    const codigo = sinComentarios(readFileSync(p, "utf8")).replace(/\s+/g, " ");
    for (const m of codigo.matchAll(/nextUrl\s*:\s*`[^`]*key=\$\{([^}]*)\}/g)) {
      expect(m[1], "el nextUrl tiene que reenviar la clave del pedido").toMatch(/searchParams\.get\(\s*["']key["']\s*\)/);
    }
  });

  it("reconoce las formas viejas y las que encontró la revisión", () => {
    const viejas = [
      "if (key !== process.env.NEXTAUTH_SECRET) {",
      "if (reqKey !== KEY && reqKey !== process.env.NEXTAUTH_SECRET) {",
      "const ok = key === CRON_KEY ? true : await isInternalUser();",
      "if (key !== WARM_CACHE_KEY) {",
      "if (key !== BOOTSTRAP_KEY) {",
      "if (key !== process.env.SYNC_SECRET_KEY && key !== ADMIN_API_KEY) {",
      "syncKey === process.env.SYNC_KEY;",
      "if (process.env.CRON_SECRET === key) {",
      "const secret = process.env.NEXTAUTH_SECRET; if (key !== secret) {",
      "if (key != ADMIN_API_KEY) {",
      'if (key !== process.env["ADMIN_API_KEY"]) {',
      "const { NEXTAUTH_SECRET } = process.env; if (key !== NEXTAUTH_SECRET) {",
      "if (![ADMIN_API_KEY, OTRA].includes(key)) {",
      "if (\n      key !==\n      process.env.NEXTAUTH_SECRET\n    ) {",
      "if (key !== `${ADMIN_API_KEY}`) {",
      // las que encontró la segunda revisión
      'if (searchParams.get("key") !== CRON_KEY) {',
      'if (req.nextUrl.searchParams.get("key") !== process.env.NEXTAUTH_SECRET) {',
      "const esperado = process.env.NEXTAUTH_SECRET; if (k !== esperado) {",
    ];
    for (const v of viejas) expect(comparacionesAMano(v), v).not.toEqual([]);
    const sanas = [
      "if (!esClaveDeCron(key)) {",
      "const porSyncKey = esClavePropia(syncKey, process.env.SYNC_KEY);",
      'if (process.env.VERCEL_ENV === "production") {',
      'if (typeof process.env.SYNC_KEY === "string") {',
      "if (process.env.RESEND_API_KEY === undefined) {",
      'const KEY_PREFIX = "x"; if (k === "a") {}',
    ];
    for (const s of sanas) expect(comparacionesAMano(s), s).toEqual([]);
  });
});
