import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ══════════════════════════════════════════════════════════════════════════
// E-05 — "un cliente roto rompe a todos": guard estructural sobre los crons
// ══════════════════════════════════════════════════════════════════════════
// Los crons que recorren TODAS las organizaciones tenían el `try` FUERA del
// bucle. Una sola org que explotaba (un dato raro, un mail rebotado, la API de
// Claude caída) abortaba el proceso entero: las organizaciones que venían
// después simplemente no se procesaban. Y como el orden de la lista es estable,
// eran siempre las mismas — con `ORDER BY` sobre el cuid, las más nuevas.
//
// El síntoma es invisible por partida doble: el cron devuelve 500 y ese 500 no
// lo mira nadie (no hay telemetría), y "0 anomalías" o "0 digests" se lee como
// "no había nada que reportar".
//
// Esto NO es un test de comportamiento: es un guard estructural, del mismo tipo
// que `check-order-contract.mjs`. Verifica que el patrón siga en su lugar cuando
// alguien toque estos archivos dentro de seis meses. Un test de comportamiento
// real exigiría levantar las rutas con Prisma mockeado, y el valor de eso es
// menor que el de un guard que no se puede ignorar sin darse cuenta.
//
// Referencia del patrón bien hecho: `cron/refresh-silver-orders/route.ts`.
// ══════════════════════════════════════════════════════════════════════════

const CRONS_QUE_ITERAN_ORGS = [
  "digest",
  "anomalies",
  "ads-utm-audit",
] as const;

function leerCron(nombre: string): string {
  return readFileSync(
    join(process.cwd(), "src", "app", "api", "cron", nombre, "route.ts"),
    "utf8"
  );
}

describe("E-05 — los crons que iteran organizaciones las aíslan", () => {
  for (const cron of CRONS_QUE_ITERAN_ORGS) {
    describe(`cron/${cron}`, () => {
      const src = leerCron(cron);

      it("tiene un try/catch POR organización, no sólo alrededor del bucle", () => {
        // El marcador es explícito a propósito: hace el patrón buscable y obliga
        // a que quien lo saque tenga que borrar el comentario que lo explica.
        expect(src).toContain("E-05: aislamiento por organización");
      });

      it("acumula las organizaciones que fallaron en vez de tragarlas", () => {
        expect(src).toMatch(/failures\.push\(/);
      });

      it("devuelve `failures` en la respuesta — si no, nadie se entera", () => {
        // Que el cron siga andando no alcanza: si la org que falló no sale en el
        // body, el cliente queda sin su digest/alerta y no queda rastro.
        expect(src).toMatch(/\n\s*failures,/);
      });

      it("loguea cuál organización falló, con su nombre", () => {
        expect(src).toMatch(/console\.error\(`\[.*\] org \$\{org\.name\}/);
      });
    });
  }

  it("el bucle sigue recorriendo todas las organizaciones", () => {
    // Guard contra el "arreglo" equivocado: cortar el bucle en el primer error
    // (un `break` o un `return` dentro del catch) reintroduce exactamente el bug
    // que esto vino a resolver.
    for (const cron of CRONS_QUE_ITERAN_ORGS) {
      const src = leerCron(cron);
      const catchDeOrg = src.match(
        /catch \(e: any\) \{[\s\S]{0,400}?failures\.push\([\s\S]{0,200}?\}/
      );
      expect(catchDeOrg, `no se encontró el catch por org en ${cron}`).toBeTruthy();
      expect(catchDeOrg![0]).not.toMatch(/\bbreak\b|\breturn\b|\bthrow\b/);
    }
  });
});
