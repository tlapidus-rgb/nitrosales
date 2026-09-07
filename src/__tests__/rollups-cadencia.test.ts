import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { ROLLUP_TABLES } from "@/lib/pixel/rollup-backfill";
import { PIPELINE_FRESHNESS_TARGETS } from "@/lib/pipeline/freshness";

// ══════════════════════════════════════════════════════════════════════════
// La cadencia de los rollups tiene que dejar margen contra su propia alerta
// ══════════════════════════════════════════════════════════════════════════
// `refresh-pixel-rollups` procesa UNA tabla por invocación (rotación: la más
// atrasada). Con eso, tres números que viven en tres archivos distintos quedan
// atados entre sí:
//
//   · cuántas tablas hay que rotar        → ROLLUP_TABLES (código)
//   · cuántas veces por hora se dispara   → vercel.json + un workflow de GH
//   · a partir de qué atraso se alerta    → maxHours en freshness.ts
//
// Si el ciclo completo tarda MÁS que el umbral, el sistema alerta aunque esté
// funcionando exactamente como se diseñó. Y como los tres números están en
// archivos distintos, nada avisa cuando uno se mueve: agregar una novena tabla
// de rollup, o bajar un schedule, alcanza para romperlo en silencio.
//
// ── LO QUE PASÓ ──────────────────────────────────────────────────────────
// La entrada de `vercel.json` se bajó de cada 15 min a **una vez por hora**
// (E-04, 2026-09-05) por una razón buena: convivía con el workflow de GitHub a
// la misma frecuencia y los dos elegían "la tabla más atrasada", o sea la
// MISMA, y corrían el mismo escaneo HLL de ~190 s dos veces en paralelo contra
// una tabla de 43 GB.
//
// Pero eso dejó a la entrada de Vercel —que es el RESPALDO— con un ciclo de
// exactamente 8 horas contra un umbral de 8 horas: margen cero. Y no es
// hipotético que el respaldo quede solo: **GitHub deshabilita los workflows
// programados tras 60 días sin actividad en el repo**, que es justo el modo de
// falla que ese workflow vino a cubrir. El día que pase, los rollups siguen
// corriendo y encima empiezan a llegar mails de frescura.
//
// Con dos hits por hora el respaldo solo da 4 h contra 8: margen 2×, sin
// recrear el problema de la colisión (eran ~24+4 hits/hora; ahora son 8+2).
// ══════════════════════════════════════════════════════════════════════════

const VERCEL = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8"));
const WORKFLOW = readFileSync(
  join(process.cwd(), ".github/workflows/keep-pixel-rollups-fresh.yml"),
  "utf8",
);

/** Cuántas veces por hora dispara una expresión cron de las que usamos acá. */
function porHora(expr: string): number {
  const [minutos, horas] = expr.trim().split(/\s+/);
  const cuantos = (campo: string, total: number): number => {
    if (campo === "*") return total;
    if (campo.startsWith("*/")) return Math.floor(total / parseInt(campo.slice(2), 10));
    return campo.split(",").length;
  };
  // Sólo tiene sentido para los schedules horarios que usamos; si alguien mete
  // uno diario, esto devuelve menos de 1 y el test de abajo lo va a marcar.
  return cuantos(minutos, 60) * (horas === "*" ? 1 : 0);
}

const entradaDeRollups = () =>
  (VERCEL.crons as Array<{ path: string; schedule: string }>).find((c) =>
    c.path.startsWith("/api/cron/refresh-pixel-rollups"),
  );

const UMBRAL_H = PIPELINE_FRESHNESS_TARGETS.find(
  (t) => t.table === "pixel_daily_aggregates",
)!.maxHours;

describe("la rotación de rollups cierra un ciclo antes de que alerte", () => {
  it("el cron de los rollups sigue existiendo en vercel.json", () => {
    // El respaldo no es opcional: GitHub deshabilita los workflows programados
    // tras 60 días sin actividad en el repo.
    expect(entradaDeRollups()).toBeDefined();
  });

  it("EL RIESGO: el respaldo de Vercel, SOLO, cierra el ciclo con margen", () => {
    // Éste es el escenario degradado, no el normal: GitHub deshabilitó el
    // workflow y lo único que queda es esta entrada.
    const hits = porHora(entradaDeRollups()!.schedule);
    const cicloH = ROLLUP_TABLES.length / hits;
    expect(cicloH).toBeLessThanOrEqual(UMBRAL_H / 2);
  });

  it("en operación normal el margen es amplio", () => {
    // GitHub cada 15 min × 2 hits + el respaldo de Vercel.
    const cadaMin = WORKFLOW.match(/cron:\s*"\*\/(\d+) \* \* \* \*"/);
    expect(cadaMin).not.toBeNull();
    const corridasGh = 60 / parseInt(cadaMin![1], 10);
    const hitsPorCorrida = (WORKFLOW.match(/for i in ([\d ]+); do/)?.[1] ?? "1").trim().split(/\s+/)
      .length;
    const hits = corridasGh * hitsPorCorrida + porHora(entradaDeRollups()!.schedule);
    const cicloH = ROLLUP_TABLES.length / hits;
    expect(cicloH).toBeLessThan(UMBRAL_H / 4);
  });

  it("el self-heal actúa ANTES del umbral de alerta, no después", () => {
    // Sin esto el watchdog sería decorativo: se enteraría cuando el mail ya
    // salió. El valor vive en warm-cache.
    const warm = readFileSync(
      join(process.cwd(), "src/app/api/cron/warm-cache/route.ts"),
      "utf8",
    );
    const trigger = Number(warm.match(/ROLLUP_SELF_HEAL_TRIGGER_H = ([\d.]+)/)?.[1]);
    expect(trigger).toBeGreaterThan(0);
    expect(trigger).toBeLessThan(UMBRAL_H);
  });

  it("todas las tablas de la rotación están vigiladas, menos channel", () => {
    // `channel` tiene su propio cron (`refresh-gold-attribution-channel`) y su
    // propia entrada en los targets; rota acá por el fix de starvation del
    // 2026-08-23. Las otras siete son las que este cron mantiene.
    const vigiladas = new Set(PIPELINE_FRESHNESS_TARGETS.map((t) => t.table));
    const sinVigilar = ROLLUP_TABLES.filter(
      (t) => t !== "channel" && !vigiladas.has(`pixel_daily_${t === "funnel" ? "funnel_by_source" : t}`),
    );
    expect(sinVigilar).toEqual([]);
  });
});
