import { describe, expect, it } from "vitest";
import { validateAnomalies, type MetricSnapshot } from "@/lib/anomaly/detector";

const baseline: MetricSnapshot = {
  revenue: 1000, orders: 100, grossProfit: 500, grossMargin: 50, cogsCoverage: 100,
  adSpend: 100, metaSpend: 60, googleSpend: 40, roas: 10, cpa: 1, aov: 10, adConversions: 100,
};
function result(metric: string, current: Partial<MetricSnapshot>, previous: Partial<MetricSnapshot> = {}) {
  return validateAnomalies({ anomalies: [{
    type: "ALERT", priority: "HIGH", metric, metricValue: 99999, metricDelta: 900,
    title: "Crecimiento del 900% por Hot Sale",
    description: "La campaña inventada causó el crecimiento del 900%.",
    action: "Duplicar el presupuesto de la campaña inventada.",
  }] }, { ...baseline, ...current }, { ...baseline, ...previous })[0];
}

describe("visible anomaly evidence", () => {
  it("does not expose invented numbers, causes or prescriptive actions", () => {
    const anomaly = result("revenue", { revenue: 500 });
    expect(anomaly).toMatchObject({ metricValue: 500, metricDelta: -50 });
    expect(anomaly.description).toContain("$1.000 en el período anterior y $500 en el actual");
    expect(anomaly.description).toContain("-50%");
    expect(JSON.stringify(anomaly)).not.toMatch(/900%|Hot Sale|inventada|Duplicar/);
    expect(anomaly.action).toContain("Revisar pedidos");
  });
  it("distinguishes percentage points from relative percentages", () => {
    const anomaly = result("grossMargin", { grossMargin: 30 });
    expect(anomaly.description).toContain("50% en el período anterior y 30% en el actual");
    expect(anomaly.description).toContain("-20 puntos porcentuales");
    expect(anomaly.description).not.toContain("-20%");
  });
  it("does not invent percentage growth from a zero base", () => {
    const anomaly = result("revenue", { revenue: 500 }, { revenue: 0 });
    expect(anomaly.metricDelta).toBeNull();
    expect(anomaly.description).toContain("no comparable");
    expect(anomaly.description).not.toContain("100%");
  });
  it("preserves a loss without turning it into an unsupported percent", () => {
    const anomaly = result("grossProfit", { grossProfit: -50 });
    expect(anomaly.metricDelta).toBeNull();
    expect(anomaly.description).toContain("$-50");
  });
  it("renders a flat comparison without inventing a direction", () => {
    const anomaly = result("orders", {});
    expect(anomaly.description).toContain("Variación: 0%");
    expect(anomaly.title).not.toMatch(/crecimiento|caída/i);
  });
  it("renders ratios and decimal currency with their respective units", () => {
    expect(result("roas", { roas: 2.5 }).description).toContain("2,5x");
    expect(result("cpa", { cpa: 12.34 }).description).toContain("$12,34");
  });
});
