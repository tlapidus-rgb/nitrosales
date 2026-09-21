import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ orgs: vi.fn(), query: vi.fn(), events: vi.fn(), insight: vi.fn(), email: vi.fn(), heartbeat: vi.fn(), save: vi.fn(), detect: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { organization: { findMany: m.orgs }, $queryRaw: m.query, pixelEvent: { findMany: m.events }, insight: { create: m.insight } } }));
vi.mock("@/lib/cron/latido", () => ({ registrarLatido: m.heartbeat }));
vi.mock("@/lib/cron/cursor-store", () => ({ ultimoProcesado: async () => null, arranqueDeLaVuelta: () => ({ desde: 0, persiste: true }), guardarCorte: m.save }));
vi.mock("@/lib/admin-key", () => ({ isValidAdminKey: (key: string) => key === "test-key" }));
vi.mock("@/domains/orders", () => ({ ordersValidWhere: () => "TRUE" }));
vi.mock("@/lib/email/send", () => ({ sendEmail: m.email }));
vi.mock("@/lib/email/templates", () => ({ weeklyDigestEmail: () => ({ subject: "test", html: "test" }), anomalyAlertEmail: () => ({ subject: "test", html: "test" }) }));
vi.mock("@/lib/anomaly/detector", () => ({ detectRuleBasedAnomalies: m.detect, detectClaudeAnomalies: async () => [] }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { constructor() { throw new Error("No provider calls allowed"); } } }));
import { GET as digest } from "@/app/api/cron/digest/route";
import { GET as anomalies } from "@/app/api/cron/anomalies/route";
import { GET as ads } from "@/app/api/cron/ads-utm-audit/route";
const routes = [{ name: "digest", run: digest, field: "digests" }, { name: "anomalies", run: anomalies, field: "organizations" }, { name: "ads-utm-audit", run: ads, field: "results" }];
const request = () => new NextRequest("https://test.invalid/api?key=test-key");
beforeEach(() => {
 vi.resetAllMocks(); vi.stubEnv("ANTHROPIC_API_KEY", "");
 vi.spyOn(console, "error").mockImplementation(() => {});
 m.orgs.mockResolvedValue(["a", "b"].map(id => ({ id, name: id, users: [{ email: `${id}@example.invalid` }] })));
 m.query.mockImplementation(async (_sql, ...values) => {
  if (values.includes("a")) throw new Error("query failed");
  return [{ revenue: "10", orders: "1", units: "1", cogs: "2", spend: "1", conversions: "1", conversion_value: "10", meta_spend: "1", google_spend: "0", total: "1", with_cost: "1", name: "test" }];
 });
 m.events.mockImplementation(async ({ where }) => { if (where.organizationId === "a") throw new Error("query failed"); return []; });
 m.email.mockResolvedValue({ ok: true }); m.detect.mockReturnValue([]);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it.each(routes)("$name preserves the next organization and records partial failure", async ({name, run, field}) => {
 const body = await (await run(request())).json();
 expect(body[field]).toEqual([expect.objectContaining({ orgId: "b" })]);
 expect(body.failures).toEqual([expect.objectContaining({ orgId: "a" })]);
 expect(body).toMatchObject({ completo: false, estado: "fallo-parcial" });
 expect(m.heartbeat).toHaveBeenCalledWith(name, false, expect.any(String));
});
it.each(routes)("$name reports total failure", async ({name, run}) => {
 m.orgs.mockResolvedValue([{ id: "a", name: "a", users: [{ email: "a@example.invalid" }] }]);
 const body = await (await run(request())).json();
 expect(body.ok).toBe(false); expect(m.heartbeat).toHaveBeenCalledWith(name, false, expect.any(String));
});
it.each(routes)("$name reports a completed healthy run", async ({name, run}) => {
 m.orgs.mockResolvedValue([{ id: "b", name: "b", users: [{ email: "b@example.invalid" }] }]);
 expect(await (await run(request())).json()).toMatchObject({ ok: true, completo: true, estado: "completo", failures: [] });
 expect(m.heartbeat).toHaveBeenCalledWith(name, true, undefined);
});
it.each([{name: "digest", run: digest}, {name: "anomalies", run: anomalies}])("$name counts rejected mail as failure", async ({name, run}) => {
 m.orgs.mockResolvedValue([{ id: "b", name: "b", users: [{ email: "b@example.invalid" }] }]);
 m.detect.mockReturnValue([{ priority: "HIGH", type: "ALERT", metric: "revenue", title: "test" }]);
 m.email.mockResolvedValue({ ok: false });
 const body = await (await run(request())).json();
 expect(m.email).toHaveBeenCalledTimes(1); expect(body.failures).toHaveLength(1);
 expect(body.ok).toBe(false); expect(m.heartbeat).toHaveBeenCalledWith(name, false, expect.any(String));
});
it("UTM persistence failure preserves computed results but marks incomplete", async () => {
 m.orgs.mockResolvedValue([{ id: "b", name: "b" }]);
 m.events.mockResolvedValue(Array.from({length: 10}, () => ({ clickIds: { gclid: "test" }, pageUrl: "https://example.invalid", props: {} })));
 m.insight.mockRejectedValue(new Error("DB unavailable"));
 const body = await (await ads(request())).json();
 expect(body.results[0]).toMatchObject({ totalUntaggedEvents: 10, insightCreated: false });
 expect(body.failures).toHaveLength(1); expect(body.completo).toBe(false);
 expect(m.heartbeat).toHaveBeenCalledWith("ads-utm-audit", false, expect.any(String));
});
it.each(routes)("$name treats budget cutoff as pending, not failed", async ({name, run}) => {
 vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValue(50000);
 const body = await (await run(request())).json();
 expect(body).toMatchObject({ completo: false, estado: "pendiente", cortoPorReloj: true, failures: [] });
 expect(m.email).not.toHaveBeenCalled(); expect(m.heartbeat).toHaveBeenCalledWith(name, true, undefined);
});