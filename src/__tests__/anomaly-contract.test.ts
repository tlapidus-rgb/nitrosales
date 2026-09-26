import { describe, expect, it } from "vitest";
import { anomalyPeriods } from "@/lib/anomaly/periods";
import { comparableCosts, detectRuleBasedAnomalies, validateAnomalies, type MetricSnapshot } from "@/lib/anomaly/detector";

const snapshot = (overrides: Partial<MetricSnapshot> = {}): MetricSnapshot => ({
  revenue: 1000, orders: 100, grossProfit: 500, grossMargin: 50, cogsCoverage: 100,
  adSpend: 100, metaSpend: 60, googleSpend: 40, roas: 10, cpa: 1, aov: 10, ...overrides,
});
const row = (overrides: Record<string, unknown> = {}) => ({ type: "ALERT", priority: "HIGH", title: "Cambio detectado",
  description: "Comparación de períodos", action: "Revisar los datos", metric: "revenue", metricValue: 9999, metricDelta: 99, ...overrides });

describe("complete Argentina weeks", () => {
  it.each([
    ["2026-09-25T02:59:59.999Z", "2026-09-24"],
    ["2026-09-25T03:00:00Z", "2026-09-25"],
    ["2026-01-01T03:00:00Z", "2026-01-01"],
    ["2024-03-01T15:00:00Z", "2024-03-01"],
  ])("excludes the partial day at %s", (now, date) => {
    const p = anomalyPeriods(new Date(now));
    expect(p.currentDateTo).toBe(date);
    expect(p.toCurrent.toISOString()).toBe(date + "T03:00:00.000Z");
    expect(p.toCurrent.getTime() - p.fromCurrent.getTime()).toBe(7 * 86400000);
    expect(p.toPrev.getTime() - p.fromPrev.getTime()).toBe(7 * 86400000);
    expect(p.toPrev).toEqual(p.fromCurrent);
    expect(p.previousDateTo).toBe(p.currentDateFrom);
  });
  it("rejects an invalid clock", () => expect(() => anomalyPeriods(new Date(NaN))).toThrow());
});

describe("cost comparison", () => {
  it.each([undefined, 0, 20, 80, 99.999, NaN, Infinity, 101])("suppresses margin if either coverage is %s", coverage => {
    const current = snapshot({ grossMargin: 10 });
    const previous = snapshot();
    for (const pair of [[{ ...current, cogsCoverage: coverage }, previous], [current, { ...previous, cogsCoverage: coverage }]]) {
      expect(comparableCosts(pair[0], pair[1])).toBe(false);
      expect(detectRuleBasedAnomalies(pair[0], pair[1]).some(a => a.metric === "grossMargin")).toBe(false);
    }
  });
  it("retains a measured margin drop", () => {
    expect(detectRuleBasedAnomalies(snapshot({ grossMargin: 10 }), snapshot())).toContainEqual(expect.objectContaining({ metric: "grossMargin", metricDelta: -40 }));
  });
});

describe("provider output contract", () => {
  it.each([null, [], {}, { anomalies: {} }, { anomalies: [null, 1, "x"] }])("handles invalid envelopes", value => {
    expect(validateAnomalies(value, snapshot(), snapshot())).toEqual([]);
  });
  it.each([{ type: "unknown" }, { priority: "urgent" }, { title: {} }, { title: "" }, { description: "x".repeat(1501) },
    { action: null }, { metric: "password" }, { metricValue: "100" }, { metricValue: Infinity }, { metricDelta: NaN }])("rejects malformed rows: %j", value => {
    expect(validateAnomalies({ anomalies: [row(value)] }, snapshot(), snapshot())).toEqual([]);
  });
  it("uses measured amounts and percentages rather than generated evidence", () => {
    expect(validateAnomalies({ anomalies: [row()] }, snapshot({ revenue: 500 }), snapshot())).toEqual([
      expect.objectContaining({ metricValue: 500, metricDelta: -50 }),
    ]);
  });
  it("limits and deduplicates valid metrics", () => {
    expect(validateAnomalies({ anomalies: [row(), row(), row({ metric: "orders" }), row({ metric: "aov" }), row({ metric: "adSpend" })] }, snapshot(), snapshot()).map(a => a.metric)).toEqual(["revenue", "orders", "aov"]);
  });
  it("rejects unmeasured profit and undefined ratios", () => {
    expect(validateAnomalies({ anomalies: [row({ metric: "grossProfit" }), row({ metric: "grossMargin" }), row({ metric: "roas" }), row({ metric: "cpa" }), row({ metric: "aov" })] }, snapshot({ cogsCoverage: 50, adSpend: 0, orders: 0 }), snapshot())).toEqual([]);
  });
});

describe("advertising denominators", () => {
  it("does not substitute thousands of store orders for two ad conversions", () => {
    const current = snapshot({ orders: 10000, adConversions: 2, roas: 1, cpa: 100 });
    const previous = snapshot({ orders: 10000, adConversions: 2, roas: 10, cpa: 10 });
    expect(detectRuleBasedAnomalies(current, previous).filter(a => ["cpa", "roas"].includes(a.metric))).toEqual([]);
  });
  it("retains advertising alerts with measured volume independently of store orders", () => {
    const current = snapshot({ orders: 1, adConversions: 100, roas: 1, cpa: 100 });
    const previous = snapshot({ orders: 1, adConversions: 100, roas: 10, cpa: 10 });
    expect(detectRuleBasedAnomalies(current, previous).map(a => a.metric)).toEqual(expect.arrayContaining(["cpa", "roas"]));
  });
  it("does not interpret zero conversions as a measured CPA", () => {
    expect(validateAnomalies({ anomalies: [row({ metric: "cpa" })] }, snapshot({ adConversions: 0 }), snapshot({ adConversions: 100 }))).toEqual([]);
  });
});
