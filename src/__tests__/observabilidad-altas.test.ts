import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// ══════════════════════════════════════════════════════════════════════════
// Lo que falla en silencio tiene que avisar
// ══════════════════════════════════════════════════════════════════════════
// Los tres revisores llegaron por caminos distintos a la misma conclusión: esta
// branch agregó frenos automáticos (control de admisión del backfill, cursores,
// presupuestos de tiempo) y todos **fallan hacia el silencio**. Eso es lo
// correcto para no romper nada, pero no se instrumentó nada que avise cuando un
// freno se queda trabado.
//
// Dos agujeros concretos que esto cierra:
//
//   1. `checkStuckOnboardings` miraba PENDING, NEEDS_INFO e IN_PROGRESS — o sea
//      NINGUNO de los dos estados donde el flujo realmente se para esperando a
//      un humano o a un proceso: `BACKFILLING` y `READY_FOR_REVIEW`. Un backfill
//      que termina un viernes a las 23:00 dejaba al cliente viendo "preparando
//      tu data" todo el fin de semana mientras el cron reportaba "sin problemas"
//      ocho veces seguidas.
//
//   2. No había ningún aviso de que el control de admisión estuviera frenando un
//      alta. El runner devuelve HTTP 200 con `admitido:false`, así que Vercel ve
//      verde y ningún monitor de status lo nota.
// ══════════════════════════════════════════════════════════════════════════

function fuente(p: string): string {
  return readFileSync(join(process.cwd(), p), "utf8")
    .replace(/^\s*\/\*[\s\S]*?\*\//gm, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const CHECKS = fuente("src/lib/control/checks.ts");
const CRON = fuente("src/app/api/cron/control-alerts/route.ts");
const MAIL = fuente("src/lib/control/email-template.ts");

describe("los estados donde el alta espera están vigilados", () => {
  it.each(["BACKFILLING", "READY_FOR_REVIEW"])(
    "%s entra en checkStuckOnboardings",
    (estado) => {
      expect(CHECKS).toContain(estado);
    },
  );

  it("se mide desde updatedAt, no desde createdAt", () => {
    // Un alta creada hace un mes que entró a BACKFILLING hace diez minutos no
    // está atrasada. Medir desde createdAt la reportaría siempre.
    expect(CHECKS).toContain(`"updatedAt" < $2`);
    expect(CHECKS).toContain(`"updatedAt" < $3`);
  });

  it("los umbrales de espera son más cortos que los 72h generales", () => {
    // Un alta en PENDING espera a que alguien la mire y puede aguantar. Una en
    // BACKFILLING ya le prometió al cliente que su data está en camino.
    const m = CHECKS.match(/const BACKFILLING_HORAS = (\d+)/);
    const r = CHECKS.match(/const READY_FOR_REVIEW_HORAS = (\d+)/);
    const g = CHECKS.match(/const STUCK_ONBOARDING_HOURS = (\d+)/);
    expect(m).not.toBeNull();
    expect(r).not.toBeNull();
    expect(Number(m![1])).toBeLessThan(Number(g![1]));
    expect(Number(r![1])).toBeLessThan(Number(m![1]));
  });
});

describe("un backfill frenado avisa", () => {
  it("existe el chequeo y el cron lo corre", () => {
    expect(CHECKS).toContain("checkJobsDeBackfillAtascados");
    expect(CRON).toContain("checkJobsDeBackfillAtascados");
  });

  it("mira los jobs QUEUED, no sólo los que fallaron", () => {
    // El caso que importa: la ventana horaria o el límite de concurrencia
    // frenan y el job nunca llega a arrancar. No hay error que reportar.
    expect(CHECKS).toContain("'QUEUED','RUNNING'");
  });

  it("cuenta para el total de problemas del reporte", () => {
    // Si no sumara al total, el mail diría "sin problemas" igual.
    expect(CRON).toContain("jobsAtascados.length");
  });

  it("sale en el mail", () => {
    expect(MAIL).toContain("jobsAtascados");
    expect(MAIL).toContain("atascadosCount");
  });

  it("no rompe el resto del reporte si la tabla no existe", () => {
    // `backfill_jobs` se crea por endpoint de migración; si falta, el chequeo
    // tiene que devolver vacío y no tumbar los otros tres.
    const fn = CHECKS.slice(CHECKS.indexOf("export async function checkJobsDeBackfillAtascados"));
    expect(fn.slice(0, fn.indexOf("\n}"))).toContain("catch");
  });
});

describe("alerts-scheduler: una regla que no dispara cede el turno", () => {
  const ENGINE = fuente("src/lib/alerts/engine.ts");

  it("el camino de 'no disparó' reprograma nextFireAt", () => {
    // EL BUG: el `return null` salía ANTES del UPDATE de nextFireAt, así que una
    // regla de schedule que no dispara quedaba vencida para siempre y —por el
    // ORDER BY nextFireAt ASC— se quedaba permanentemente primera en la cola,
    // tapando a las de atrás. Con presupuesto para ~50 reglas por corrida, un
    // puñado de reglas zombie deja a los clientes nuevos sin alertas.
    const i = ENGINE.indexOf("if (!result.triggered)");
    expect(i).toBeGreaterThan(0);
    const bloque = ENGINE.slice(i, i + 900);
    expect(bloque).toContain("nextFireAt");
    expect(bloque).toContain("REINTENTO_SIN_DISPARO_MS");
  });

  it("el reintento es >= la cadencia del cron, si no no cede el turno", () => {
    // Con un reintento más corto que la cadencia, la regla vuelve a estar
    // vencida antes de la próxima corrida y no se mueve del frente.
    const m = ENGINE.match(/const REINTENTO_SIN_DISPARO_MS = (\d+) \* 60 \* 1000/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(15);
  });

  it("NO salta al próximo período completo", () => {
    // Sería el arreglo fácil y cambia el comportamiento visible: una regla
    // diaria que no dispara a las 09:00 hoy se re-chequea a las 09:15 y puede
    // disparar; saltando al período, recién mañana. Se mantiene el reintento
    // corto a propósito.
    const i = ENGINE.indexOf("if (!result.triggered)");
    const bloque = ENGINE.slice(i, i + 900);
    expect(bloque).not.toContain("computeNextFireAt");
  });
});
