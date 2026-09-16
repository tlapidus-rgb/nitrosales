import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ══════════════════════════════════════════════════════════════════════════
// R-01 — `undefined !== undefined` es `false`, y eso abría cinco crons
// ══════════════════════════════════════════════════════════════════════════
// Cinco crons (`ads-utm-audit`, `anomalies`, `digest`, `exchange-rates`,
// `inflation-index`) autenticaban así:
//
//     const syncKey = searchParams.get("key") || req.headers.get("authorization")…;
//     if (syncKey !== process.env.SYNC_KEY) { return 401 }
//
// Si `SYNC_KEY` no está seteada en el entorno, `process.env.SYNC_KEY` es
// `undefined`. Un GET sin `?key=` y sin header deja `syncKey` también en
// `undefined`. Y `undefined !== undefined` es **false** → entra.
//
// Lo perverso del bug: con una clave INCORRECTA devuelve 401. Sólo se abre
// mandando *nada*, así que ningún escáner que pruebe claves lo encuentra.
//
// Qué se conseguía con un `curl` pelado: la lista de todas las organizaciones
// con sus nombres, el disparo de los mails de anomalías y del digest a los
// OWNER/ADMIN de **todos** los clientes, y un escaneo de 7 días de
// `pixel_events` por organización con 800 s de presupuesto.
//
// ── POR QUÉ ESTE TEST MIRA EL FUENTE Y NO EJECUTA ────────────────────────
// Ejecutar el handler no alcanza para probar la propiedad: habría que correrlo
// con la env sin setear Y con ella seteada, y el `process.env` de un test no
// reproduce el del runtime de Vercel. Lo que sí se puede afirmar
// estructuralmente es que **la forma peligrosa no vuelve**: una comparación con
// `process.env.X` sin verificar antes que `X` exista.
// ══════════════════════════════════════════════════════════════════════════

const RAIZ = join(process.cwd(), "src", "app", "api");

/** Todas las `route.ts` bajo `src/app/api`. */
function rutas(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) rutas(p, out);
    else if (e.name === "route.ts") out.push(p);
  }
  return out;
}

/**
 * El archivo sin comentarios.
 *
 * Imprescindible acá: el encabezado de cada uno de los cinco arreglados **cita
 * textualmente** la comparación vieja para explicar qué se arregló. Sin esto, el
 * test fallaría por la explicación del bug — y la salida obvia sería borrar la
 * explicación, que es justo lo que no queremos. (#S61)
 */
function sinComentarios(src: string): string {
  return src
    .split(/\r?\n/)
    .filter((l) => {
      const t = l.trim();
      return !(t.startsWith("//") || t.startsWith("/*") || t.startsWith("*"));
    })
    .join("\n");
}

const TODAS = rutas(RAIZ);

describe("R-01 — ninguna ruta compara contra una env sin verificar que exista", () => {
  it("hay rutas para revisar (si esto falla, el barrido se rompió)", () => {
    expect(TODAS.length).toBeGreaterThan(200);
  });

  it("ninguna ruta compara una variable que puede ser `undefined` contra una env", () => {
    // ── EL CRITERIO, Y POR QUÉ NO ES EL OBVIO ──────────────────────────────
    // La primera versión de este test marcaba cualquier
    // `if (x !== process.env.Y)`. Señaló siete rutas **sanas** y estuve a punto
    // de "arreglarlas".
    //
    // El bug necesita que la variable valga exactamente `undefined`:
    //
    //     undefined !== undefined  →  false   ← entra
    //     null      !== undefined  →  true    ← 401, correcto
    //     ""        !== undefined  →  true    ← 401, correcto
    //
    // `searchParams.get("key")` devuelve `null`, nunca `undefined`. Las siete
    // marcadas usaban eso, así que rechazaban bien.
    //
    // Lo que produce `undefined` es el **optional chaining**:
    //
    //     searchParams.get("key") || req.headers.get("authorization")?.replace(…)
    //                                                                ^^ acá
    //
    // Sin header, `get()` da `null`, el `?.` corta y devuelve `undefined`. Ése
    // es el patrón que hay que cazar: una comparación contra `process.env` donde
    // la variable comparada se arma con `?.`.
    const malas: string[] = [];

    for (const p of TODAS) {
      const codigo = sinComentarios(readFileSync(p, "utf8"));

      const comparacion = codigo.match(/if\s*\(\s*(\w+)\s*!==\s*process\.env\.\w+\s*\)/);
      if (!comparacion) continue;
      const variable = comparacion[1];

      // ¿La asignación de esa variable puede producir `undefined`?
      const asignacion = new RegExp(
        `(?:const|let|var)\\s+${variable}\\s*(?::[^=]+)?=([^;]+);`,
      ).exec(codigo);
      const puedeSerUndefined = asignacion ? /\?\./.test(asignacion[1]) : false;
      if (!puedeSerUndefined) continue;

      // ¿Hay guard de existencia de la env?
      const tieneGuard =
        /process\.env\.\w+\s*&&/.test(codigo) ||
        /\.length\s*>\s*0/.test(codigo) ||
        /if\s*\(\s*!\w+\s*\|\|/.test(codigo) ||
        /typeof\s+process\.env\.\w+\s*===\s*["']string["']/.test(codigo);

      if (!tieneGuard) malas.push(p.replace(process.cwd(), ""));
    }

    expect(
      malas,
      "estas rutas entran con un request que no manda NADA si la env no está seteada:\n" +
        malas.join("\n"),
    ).toEqual([]);
  });

  it("los cinco crons del incidente aceptan además ADMIN_API_KEY", () => {
    // No es cosmético: `vercel.json` les manda `?key=<ADMIN_API_KEY>`, no
    // `SYNC_KEY`. Si sólo se hubiera cerrado el fail-open, los cinco pasarían a
    // devolver 401 — y un cron que devuelve 401 no alerta a nadie.
    const CINCO = [
      "ads-utm-audit",
      "anomalies",
      "digest",
      "exchange-rates",
      "inflation-index",
    ];
    for (const c of CINCO) {
      const codigo = sinComentarios(
        readFileSync(join(RAIZ, "cron", c, "route.ts"), "utf8"),
      );
      expect(codigo, `${c} tiene que aceptar la clave que vercel.json le manda`).toMatch(
        /isValidAdminKey\s*\(/,
      );
    }
  });
});
