import { describe, it, expect } from "vitest";
import {
  PIPELINE_FRESHNESS_TARGETS,
  formatStaleSummary,
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
});
