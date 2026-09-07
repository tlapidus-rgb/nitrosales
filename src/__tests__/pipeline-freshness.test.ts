import { describe, it, expect } from "vitest";
import {
  PIPELINE_FRESHNESS_TARGETS,
  formatStaleSummary,
  orgsRealmenteAtrasadas,
  type FreshnessRow,
} from "@/lib/pipeline/freshness";

// ══════════════════════════════════════════════════════════════════════════
// El modo de fallar que esto vigila no es "el cron explota" —eso se ve en los
// logs— sino "el cron deja de existir". `refresh-pixel-first-source` estuvo
// CINCO SEMANAS fuera de vercel.json y nadie se enteró, porque un cron que no
// corre no falla: simplemente no pasa nada.
// ══════════════════════════════════════════════════════════════════════════

const row = (o: Partial<FreshnessRow> & { table: string }): FreshnessRow => ({
  refreshedBy: "algun-cron",
  hoursStale: null,
  lastRefresh: null,
  stale: false,
  missing: false,
  ...o,
});

describe("PIPELINE_FRESHNESS_TARGETS", () => {
  it("cubre las 6 tablas Silver/Gold que respaldan el revenue, no sólo el rollup del pixel", () => {
    const tables = PIPELINE_FRESHNESS_TARGETS.map((t) => t.table);
    for (const t of [
      "silver_orders",
      "gold_daily_revenue",
      "gold_order_segments",
      "gold_product_sales",
      "gold_customer_daily",
      "gold_attribution_source",
    ]) {
      expect(tables).toContain(t);
    }
  });

  it("sigue cubriendo pixel_daily_aggregates (el único que se vigilaba antes)", () => {
    expect(PIPELINE_FRESHNESS_TARGETS.map((t) => t.table)).toContain(
      "pixel_daily_aggregates"
    );
  });

  it("vigila TODOS los rollups del pixel, no sólo aggregates", () => {
    // El cron corre 7 statements y cada uno puede fallar por separado. Con un
    // solo centinela, un fallo aislado de `source` —el que alimenta el breakdown
    // por canal— quedaba invisible mientras aggregates se refrescaba puntual.
    const tables = PIPELINE_FRESHNESS_TARGETS.map((t) => t.table);
    for (const t of [
      "pixel_daily_source",
      "pixel_daily_funnel_by_source",
      "pixel_daily_device",
      "pixel_daily_product",
      "pixel_daily_type",
      "pixel_daily_page",
    ]) {
      expect(tables).toContain(t);
    }
  });

  it("cada target nombra el cron que lo refresca — sin eso la alerta no es accionable", () => {
    for (const t of PIPELINE_FRESHNESS_TARGETS) {
      expect(t.refreshedBy.length).toBeGreaterThan(0);
      expect(t.maxHours).toBeGreaterThan(0);
    }
  });

  it("los umbrales detectan un cron desagendado el MISMO día, no a las semanas", () => {
    // El agujero de 5 semanas es el caso a evitar. Ningún umbral puede ser tan
    // laxo como para dejar pasar un día entero sin avisar.
    for (const t of PIPELINE_FRESHNESS_TARGETS) {
      expect(t.maxHours).toBeLessThanOrEqual(24);
    }
  });

  it("no hay tablas repetidas", () => {
    const tables = PIPELINE_FRESHNESS_TARGETS.map((t) => t.table);
    expect(new Set(tables).size).toBe(tables.length);
  });
});

describe("formatStaleSummary", () => {
  it("lista sólo las atrasadas y dice qué cron las refresca", () => {
    const s = formatStaleSummary([
      row({ table: "gold_daily_revenue", stale: true, hoursStale: 30, refreshedBy: "refresh-gold-daily-revenue" }),
      row({ table: "silver_orders", stale: false, hoursStale: 0.5 }),
    ]);
    expect(s).toContain("gold_daily_revenue");
    expect(s).toContain("30h");
    expect(s).toContain("refresh-gold-daily-revenue");
    expect(s).not.toContain("silver_orders");
  });

  it("una tabla inexistente NO es una alerta (runbook pendiente, no cron caído)", () => {
    const s = formatStaleSummary([row({ table: "gold_futura", missing: true })]);
    expect(s).toBe("");
  });

  it("sin atrasadas devuelve vacío", () => {
    expect(formatStaleSummary([row({ table: "x", stale: false })])).toBe("");
  });

  it("dice QUÉ clientes están atrasados, no sólo qué tabla", () => {
    const s = formatStaleSummary([
      row({
        table: "silver_orders",
        stale: true,
        hoursStale: 9,
        orgsStale: [
          { org: "arredo", hours: 9 },
          { org: "mundo", hours: 4 },
        ],
      }),
    ]);
    expect(s).toContain("arredo");
    expect(s).toContain("mundo");
  });

  it("con muchas orgs no escupe una pared: corta y dice cuántas faltan", () => {
    const s = formatStaleSummary([
      row({
        table: "silver_orders",
        stale: true,
        hoursStale: 9,
        orgsStale: Array.from({ length: 12 }, (_, i) => ({ org: `org${i}`, hours: 9 })),
      }),
    ]);
    expect(s).toContain("7 más");
    expect(s).not.toContain("org11");
  });

  it("un chequeo que se rompió se lee distinto de una tabla atrasada", () => {
    // Si los dos se leyeran igual, alguien iría a mirar el cron equivocado.
    const s = formatStaleSummary([
      row({ table: "silver_orders", stale: true, error: "canceling statement due to statement timeout" }),
    ]);
    expect(s).toContain("NO SE PUDO MEDIR");
    expect(s).toContain("statement timeout");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// A1 — un cliente tranquilo no puede alertar para siempre
// ══════════════════════════════════════════════════════════════════════════
// Todos los upserts del pipeline filtran por ventana. Si un cliente no vendió
// en tres días, el upsert afecta cero filas, `silver_updated_at` no se mueve y
// el chequeo por organización lo reporta atrasado — todas las corridas, para
// siempre. El chequeo global viejo lo tapaba; al agruparlo quedó a la vista.
//
// El criterio correcto es relativo: una tabla derivada está atrasada si su
// FUENTE tiene algo más nuevo que ella.
// ══════════════════════════════════════════════════════════════════════════

describe("orgsRealmenteAtrasadas", () => {
  const t = (iso: string) => new Date(iso);
  const HACE_MUCHO = t("2026-09-01T00:00:00Z");
  const RECIEN = t("2026-09-07T12:00:00Z");

  it("EL BUG: un cliente sin ventas hace días NO está atrasado", () => {
    // silver_orders de esta org es de hace 6 días… y `orders` también. No hay
    // nada que refrescar: el cron hizo exactamente lo que tenía que hacer.
    const r = orgsRealmenteAtrasadas(
      [{ org: "quieto", hours: 144, last: HACE_MUCHO }],
      3,
      new Map([["quieto", HACE_MUCHO]]),
    );
    expect(r.atrasadas).toEqual([]);
    expect(r.sinNovedad).toBe(1);
  });

  it("pero si entraron órdenes nuevas y Silver no las tomó, SÍ", () => {
    const r = orgsRealmenteAtrasadas(
      [{ org: "arredo", hours: 144, last: HACE_MUCHO }],
      3,
      new Map([["arredo", RECIEN]]),
    );
    expect(r.atrasadas).toEqual([{ org: "arredo", hours: 144 }]);
    expect(r.sinNovedad).toBe(0);
  });

  it("una org sin nada en la fuente tampoco alerta", () => {
    // Cliente recién dado de alta: el backfill todavía no trajo una orden.
    const r = orgsRealmenteAtrasadas(
      [{ org: "nuevo", hours: 99, last: HACE_MUCHO }],
      3,
      new Map(),
    );
    expect(r.atrasadas).toEqual([]);
    expect(r.sinNovedad).toBe(1);
  });

  it("lo que no pasó el umbral de horas no se mira siquiera", () => {
    const r = orgsRealmenteAtrasadas(
      [{ org: "ok", hours: 1, last: HACE_MUCHO }],
      3,
      new Map([["ok", RECIEN]]),
    );
    expect(r.atrasadas).toEqual([]);
    expect(r.sinNovedad).toBe(0);
  });

  it("SIN saber nada de la fuente, alerta igual: ante la duda hace ruido", () => {
    // La query de la fuente falló, o esa tabla no tiene fuente configurada. Un
    // chequeo de frescura que prefiere callarse no sirve para nada.
    const r = orgsRealmenteAtrasadas([{ org: "arredo", hours: 99, last: HACE_MUCHO }], 3, null);
    expect(r.atrasadas).toEqual([{ org: "arredo", hours: 99 }]);
  });

  it("varias orgs mezcladas: se separan bien", () => {
    const r = orgsRealmenteAtrasadas(
      [
        { org: "rota", hours: 50, last: HACE_MUCHO },
        { org: "quieta", hours: 50, last: HACE_MUCHO },
        { org: "sana", hours: 1, last: RECIEN },
      ],
      6,
      new Map([
        ["rota", RECIEN],
        ["quieta", HACE_MUCHO],
        ["sana", RECIEN],
      ]),
    );
    expect(r.atrasadas.map((o) => o.org)).toEqual(["rota"]);
    expect(r.sinNovedad).toBe(1);
  });

  it("la fuente EXACTAMENTE igual de vieja no es novedad", () => {
    // Borde: `<=`, no `<`. Un refresco que corrió justo en el mismo instante
    // que el último dato no dejó nada afuera.
    const r = orgsRealmenteAtrasadas(
      [{ org: "borde", hours: 50, last: HACE_MUCHO }],
      6,
      new Map([["borde", HACE_MUCHO]]),
    );
    expect(r.atrasadas).toEqual([]);
  });

  it("sin filas no explota", () => {
    expect(orgsRealmenteAtrasadas([], 3, new Map())).toEqual({ atrasadas: [], sinNovedad: 0 });
  });
});

describe("cada tabla derivada declara de dónde sale", () => {
  it("todas menos el centinela tienen fuente", () => {
    // `pixel_daily_aggregates` se mide sólo contra el reloj a propósito:
    // alguien tiene que ser el canario.
    const sinFuente = PIPELINE_FRESHNESS_TARGETS.filter((t) => !t.fuente).map((t) => t.table);
    expect(sinFuente).toEqual(["pixel_daily_aggregates"]);
  });

  it("ninguna tabla es su propia fuente", () => {
    for (const t of PIPELINE_FRESHNESS_TARGETS) {
      expect(t.fuente?.tabla).not.toBe(t.table);
    }
  });

  it("las fuentes son pocas: una query por fuente, no por tabla", () => {
    const fuentes = new Set(
      PIPELINE_FRESHNESS_TARGETS.filter((t) => t.fuente).map(
        (t) => `${t.fuente!.tabla}.${t.fuente!.columna}`,
      ),
    );
    // Esto corre dentro de warm-cache: no puede costar más que el trabajo que
    // vigila. Catorce tablas, cuatro queries.
    expect(fuentes.size).toBeLessThanOrEqual(4);
  });
});
