import { describe, it, expect } from "vitest";
import {
  compareCoherence,
  formatCoherenceSummary,
  COHERENCE_MAX_DRIFT_PCT,
  buildRawSideSql,
  buildRollupSideSql,
} from "@/lib/pipeline/coherence";

// ══════════════════════════════════════════════════════════════════════════
// El caso REAL que motivó esto (2026-07-21, TeVe Compras):
//   rollup 10.315 · crudo 104.454 → el cliente vio el problema antes que
//   nosotros. Las alertas de frescura NO lo agarraban: `refreshed_at` estaba al
//   día porque el cron corría puntual. La tabla estaba fresca y equivocada.
// ══════════════════════════════════════════════════════════════════════════

const DAY = "2026-07-21";

describe("compareCoherence", () => {
  it("detecta el caso de TeVe: rollup 10.315 vs crudo 104.454", () => {
    const [r] = compareCoherence(
      DAY,
      [{ org: "teve", visitors: 10_315 }],
      [{ org: "teve", visitors: 104_454 }]
    );
    expect(r.incoherent).toBe(true);
    expect(r.driftPct).toBeGreaterThan(90);
  });

  it("NO alerta por el error normal del HLL", () => {
    // Medido en prod tras el rebuild: Arredo 546.358 vs 547.530 = 0,2%.
    const [r] = compareCoherence(
      DAY,
      [{ org: "arredo", visitors: 546_358 }],
      [{ org: "arredo", visitors: 547_530 }]
    );
    expect(r.incoherent).toBe(false);
    expect(r.driftPct).toBeLessThan(1);
  });

  it("tolera hasta el umbral y alerta pasándolo", () => {
    const justUnder = compareCoherence(DAY, [{ org: "o", visitors: 87 }], [{ org: "o", visitors: 100 }]);
    expect(justUnder[0].driftPct).toBe(13);
    expect(justUnder[0].incoherent).toBe(false);

    const over = compareCoherence(DAY, [{ org: "o", visitors: 80 }], [{ org: "o", visitors: 100 }]);
    expect(over[0].driftPct).toBe(20);
    expect(over[0].incoherent).toBe(true);
  });

  it("una org SIN fila en el rollup es divergencia total, no se ignora", () => {
    // El peor caso: el rollup no tiene nada para ese día. Si esto se saltara,
    // el chequeo no serviría justo cuando más hace falta.
    const [r] = compareCoherence(DAY, [], [{ org: "huerfana", visitors: 5_000 }]);
    expect(r.rollupVisitors).toBe(0);
    expect(r.driftPct).toBe(100);
    expect(r.incoherent).toBe(true);
  });

  it("una org sin tráfico crudo NO es incoherencia", () => {
    const [r] = compareCoherence(DAY, [], [{ org: "quieta", visitors: 0 }]);
    expect(r.incoherent).toBe(false);
  });

  it("ordena por divergencia descendente (lo peor primero)", () => {
    const rows = compareCoherence(
      DAY,
      [
        { org: "ok", visitors: 100 },
        { org: "mal", visitors: 10 },
      ],
      [
        { org: "ok", visitors: 100 },
        { org: "mal", visitors: 100 },
      ]
    );
    expect(rows[0].org).toBe("mal");
  });

  it("el umbral por defecto deja pasar el ruido del HLL pero no un orden de magnitud", () => {
    expect(COHERENCE_MAX_DRIFT_PCT).toBeGreaterThan(2); // no alertar por HLL
    expect(COHERENCE_MAX_DRIFT_PCT).toBeLessThan(50); // sí por un 10×
  });
});

describe("las dos queries miden la MISMA población", () => {
  // Si se despegan, el chequeo da falsos positivos y termina ignorándose —
  // que es como muere un monitoreo.
  it("ambas filtran por día en zona AR o por la columna day del rollup", () => {
    expect(buildRollupSideSql()).toContain("day = $1::date");
    expect(buildRawSideSql()).toContain("America/Argentina/Buenos_Aires");
  });

  it("el lado crudo replica los filtros del transform: PAGE_VIEW y sin webhook", () => {
    const raw = buildRawSideSql();
    expect(raw).toContain("pe.type = 'PAGE_VIEW'");
    expect(raw).toContain("webhook-%");
  });

  // ── REGRESIÓN de un falso positivo real (2026-07-21) ──────────────────────
  // El lado crudo tenía un INNER JOIN contra pixel_visitor_first_source, copiado
  // de cuando el rollup también lo tenía. Al pasar el rollup a LEFT JOIN +
  // 'sin_clasificar', esta query quedó midiendo MENOS gente y el chequeo gritó
  // con el rollup 31-48% "de más" — cuando el rebuild estaba perfecto.
  // Un monitoreo que da falsos positivos se ignora, y entonces no monitorea nada.
  it("el lado crudo NO cruza contra la dimensión: el rollup ya no la exige", () => {
    expect(buildRawSideSql()).not.toContain("pixel_visitor_first_source");
  });
});

describe("formatCoherenceSummary", () => {
  it("lista sólo las incoherentes con los dos números", () => {
    const s = formatCoherenceSummary(
      compareCoherence(
        DAY,
        [{ org: "teve", visitors: 10_315 }, { org: "ok", visitors: 100 }],
        [{ org: "teve", visitors: 104_454 }, { org: "ok", visitors: 100 }]
      )
    );
    expect(s).toContain("teve");
    expect(s).toContain("10315");
    expect(s).toContain("104454");
    expect(s).not.toContain("ok");
  });

  it("sin incoherencias devuelve vacío", () => {
    expect(formatCoherenceSummary([])).toBe("");
  });
});
