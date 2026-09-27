import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create: m.create }; } }));
import { detectClaudeAnomalies, type MetricSnapshot } from "@/lib/anomaly/detector";
const snapshot: MetricSnapshot = { revenue: 100, orders: 10, grossProfit: 987654, grossMargin: 88.7654,
  adSpend: 10, metaSpend: 10, googleSpend: 0, roas: 10, cpa: 1, aov: 10, cogsCoverage: 100, adConversions: 10 };
beforeEach(() => { vi.stubEnv("ANTHROPIC_API_KEY", "fake-local-test"); m.create.mockReset(); });
afterEach(() => vi.unstubAllEnvs());
it("does not send untrustworthy profit to the provider and rejects its margin output", async () => {
 m.create.mockResolvedValue({ content: [{ type: "text", text: JSON.stringify({ anomalies: [{ type: "ALERT", priority: "HIGH", title: "Margen", description: "Cambió el margen", action: "Revisar", metric: "grossMargin", metricValue: 1, metricDelta: -99 }] }) }] });
 expect(await detectClaudeAnomalies(snapshot, { ...snapshot, cogsCoverage: 99.99 }, "Test")).toEqual([]);
 const prompt = m.create.mock.calls[0][0].messages[0].content;
 expect(prompt).toContain("no disponibles para comparar");
 expect(prompt).not.toContain("987.654");
 expect(prompt).not.toContain("88.7654");
});
it("validates parsed provider rows and replaces invented numeric evidence", async () => {
 m.create.mockResolvedValue({ content: [{ type: "text", text: JSON.stringify({ anomalies: [{ type: "TREND", priority: "LOW", title: "Ingresos", description: "Cambio", action: "Revisar", metric: "revenue", metricValue: 999, metricDelta: 99 }] }) }] });
 expect(await detectClaudeAnomalies(snapshot, snapshot, "Test")).toEqual([expect.objectContaining({ metricValue: 100, metricDelta: 0 })]);
});
it.each(["network", "invalid-json", "invalid-envelope"])("reports unavailable analysis on %s", async kind => {
 if (kind === "network") m.create.mockRejectedValue(new Error("offline"));
 else m.create.mockResolvedValue({ content: [{ type: "text", text: kind === "invalid-json" ? "not JSON" : '{"anomalies":{}}' }] });
 await expect(detectClaudeAnomalies(snapshot, snapshot, "Test")).rejects.toThrow("No se pudo completar");
});
it("reports a missing provider instead of a successful empty analysis", async () => {
 vi.stubEnv("ANTHROPIC_API_KEY", "");
 await expect(detectClaudeAnomalies(snapshot, snapshot, "Test")).rejects.toThrow("sin configurar");
 expect(m.create).not.toHaveBeenCalled();
});
