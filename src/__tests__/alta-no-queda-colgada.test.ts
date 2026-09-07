import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// ══════════════════════════════════════════════════════════════════════════
// Dos formas de dejar a un cliente nuevo esperando algo que no llega
// ══════════════════════════════════════════════════════════════════════════
// De la revisión de flujo del 2026-09-07. Las dos fallan en silencio: el cliente
// ve una pantalla que dice que todo va bien, y del lado nuestro no hay error,
// ni mail, ni log que alguien mire.
//
//   1. `post-backfill-finalize` se disparaba con fire-and-forget desde el
//      runner. La lambda responde y se congela antes de que salga el fetch, así
//      que ese endpoint no corría nunca — y con él se perdían `catalog-refresh`,
//      `recompute-customer-aggregates` y `backfill-orderitem-costs`. El cliente
//      entraba con `Product.costPrice` en null y veía rentabilidad y P&L en
//      cero, con toda la pinta de estar bien.
//
//   2. `approve-backfill` marcaba `BACKFILLING` y mandaba el mail "ya
//      arrancamos" aunque no hubiera creado un solo job. El cliente veía
//      "preparando tu data — 0%" para siempre.
// ══════════════════════════════════════════════════════════════════════════

function fuente(p: string): string {
  return readFileSync(join(process.cwd(), p), "utf8")
    .replace(/^\s*\/\*[\s\S]*?\*\//gm, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const RUNNER = fuente("src/app/api/cron/backfill-runner/route.ts");
const APPROVE = fuente("src/app/api/admin/onboardings/[id]/approve-backfill/route.ts");

describe("los disparos en background sobreviven a la respuesta", () => {
  it("post-backfill-finalize va dentro de waitUntil", () => {
    const i = RUNNER.indexOf("post-backfill-finalize");
    expect(i).toBeGreaterThan(0);
    // El fetch tiene que estar envuelto: se busca el waitUntil ANTES del fetch,
    // en la misma vecindad.
    const vecindad = RUNNER.slice(Math.max(0, i - 400), i + 400);
    expect(vecindad).toContain("waitUntil(");
  });

  it("no queda ningún fetch de finalize suelto", () => {
    // La versión anterior de este caso era `/^\s*fetch\(finalizeUrl/m` y no
    // distinguía nada: con CRLF, `\s` cruza líneas, así que matcheaba igual
    // estando adentro del `waitUntil`. Ahora se mira lo que hay JUSTO ANTES de
    // la llamada, que es lo único que decide si sobrevive a la respuesta.
    const i = RUNNER.indexOf("fetch(finalizeUrl");
    expect(i).toBeGreaterThan(0);
    expect(RUNNER.slice(Math.max(0, i - 120), i)).toContain("waitUntil(");
  });

  it("el runner importa waitUntil de verdad", () => {
    expect(RUNNER).toContain('from "@vercel/functions"');
  });
});

describe("no se marca BACKFILLING si no hay nada que hacer", () => {
  it("corta antes de cambiar el estado cuando no se creó ningún job", () => {
    const iGuard = APPROVE.indexOf("createdJobs.length === 0");
    const iEstado = APPROVE.indexOf(`'BACKFILLING'`);
    expect(iGuard).toBeGreaterThan(0);
    expect(iEstado).toBeGreaterThan(0);
    // El guard tiene que ir ANTES del UPDATE de estado: si fuera después, el
    // cliente ya quedó en BACKFILLING y el mail ya salió.
    expect(iGuard).toBeLessThan(iEstado);
  });

  it("tampoco manda el mail de 'ya arrancamos'", () => {
    const iGuard = APPROVE.indexOf("createdJobs.length === 0");
    // Sin este `toBeGreaterThan(0)`, el caso pasaba igual con el código viejo:
    // `indexOf` devuelve -1 cuando el guard no existe, y -1 es menor que
    // cualquier índice. Una comparación de orden no vale nada si no se verifica
    // primero que las dos cosas existan.
    expect(iGuard).toBeGreaterThan(0);
    // Y hay que buscar la LLAMADA, no el import — que está arriba de todo y
    // haría que esta comparación no signifique nada.
    const iMail = APPROVE.indexOf("await backfillStartedEmailActive(");
    expect(iMail).toBeGreaterThan(0);
    expect(iGuard).toBeLessThan(iMail);
  });

  it("le dice al admin QUÉ falta, no un error genérico", () => {
    // El admin tiene que poder actuar sin leer el código.
    const bloque = APPROVE.slice(
      APPROVE.indexOf("createdJobs.length === 0"),
      APPROVE.indexOf("createdJobs.length === 0") + 700,
    );
    expect(bloque).toMatch(/VTEX/);
    expect(bloque).toMatch(/MercadoLibre/i);
    expect(bloque).toMatch(/meses de historia/i);
  });

  it("devuelve un status que distingue el caso, no un 500", () => {
    const bloque = APPROVE.slice(
      APPROVE.indexOf("createdJobs.length === 0"),
      APPROVE.indexOf("createdJobs.length === 0") + 700,
    );
    expect(bloque).toContain("409");
  });
});
