import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ query: vi.fn(), fetch: vi.fn(), freshness: vi.fn(), purge: vi.fn(), cleanup: vi.fn(), email: vi.fn(), heartbeat: vi.fn(), wait: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { $queryRawUnsafe: m.query } }));
vi.mock("@/lib/admin-key", () => ({ ADMIN_API_KEY: "test-key" }));
vi.mock("@/lib/cron/latido", () => ({ registrarLatido: m.heartbeat }));
vi.mock("@vercel/functions", () => ({ waitUntil: m.wait }));
vi.mock("@/lib/api-cache-shared", () => ({ purgeExpiredSharedCache: m.purge }));
vi.mock("@/lib/email/send", () => ({ sendEmail: m.email }));
vi.mock("@/lib/alertas/destinatarios", () => ({ destinatariosDeAlertas: () => ["test@example.invalid"] }));
vi.mock("@/lib/pipeline/freshness", () => ({ checkPipelineFreshness: m.freshness, formatStaleSummary: () => "stale", PIPELINE_FRESHNESS_TARGETS: [{ table: "gold_test" }] }));
vi.mock("@/lib/creator-password-cleanup", () => ({ purgeCreatorPasswordAttempts: m.cleanup }));
const fresh = { table: "gold_test", refreshedBy: "test-cron", stale: false, missing: false, hoursStale: 0, lastRefresh: null };
let GET: typeof import("@/app/api/cron/warm-cache/route").GET;
const run = async () => (await GET(new NextRequest("https://test.invalid/api/cron/warm-cache?key=test-key"))).json();
beforeEach(async () => {
 vi.resetModules(); vi.resetAllMocks(); vi.stubGlobal("fetch", m.fetch);
 vi.spyOn(console, "error").mockImplementation(() => {}); vi.spyOn(console, "log").mockImplementation(() => {});
 m.query.mockResolvedValue([{ id: "a", name: "A", attribution_model: "NITRO" }, { id: "b", name: "B", attribution_model: "CUSTOM" }]);
 m.fetch.mockResolvedValue({ ok: true, status: 200 }); m.freshness.mockResolvedValue([fresh]);
 m.purge.mockResolvedValue(0); m.cleanup.mockResolvedValue(0); m.email.mockResolvedValue({ ok: true });
 ({ GET } = await import("@/app/api/cron/warm-cache/route"));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("reports successful coverage for all planned organizations", async () => {
 expect(await run()).toMatchObject({ ok: true, completo: true, estado: "completo", orgsPlanned: 2, orgsWarmed: 2, orgsFullyWarmed: 2, totalRequests: 16, freshnessStatus: "completo", cachePurged: 0 });
 expect(m.heartbeat).toHaveBeenCalledWith("warm-cache", true, undefined);
});
it.each(["http", "exception"])("keeps processing other organizations after %s failure", async (kind) => {
 m.fetch.mockImplementation(async (url: string) => {
  if (url.includes("orgId=a")) { if (kind === "exception") throw new Error("timeout"); return { ok: false, status: 503 }; }
  return { ok: true, status: 200 };
 });
 expect(await run()).toMatchObject({ ok: false, completo: false, estado: "fallo-parcial", orgsWarmed: 1, orgsFullyWarmed: 1, fail_count: 8, ok_count: 8 });
 expect(m.heartbeat).toHaveBeenCalledWith("warm-cache", false, expect.any(String));
});
it.each(["throw", "row-error"])("reports freshness failure: %s", async kind => {
 if (kind === "throw") m.freshness.mockRejectedValue(new Error("DB down"));
 else m.freshness.mockResolvedValue([{ ...fresh, error: "timeout" }]);
 expect(await run()).toMatchObject({ ok: false, completo: false, freshnessStatus: "fallo" });
 expect(m.purge).toHaveBeenCalled();
});
it.each(["truncated", "missing"])("does not claim complete monitoring for %s coverage", async kind => {
 m.freshness.mockResolvedValue(kind === "truncated" ? [] : [{ ...fresh, missing: true }]);
 expect(await run()).toMatchObject({ ok: true, completo: false, estado: "pendiente", freshnessStatus: "pendiente" });
});
it("reports failed cache cleanup", async () => {
 m.purge.mockResolvedValue(-1);
 expect(await run()).toMatchObject({ ok: false, completo: false, cachePurged: -1 });
 expect(m.heartbeat).toHaveBeenCalledWith("warm-cache", false, expect.stringContaining("purga"));
});
it("time budget leaves work pending without inventing successful cleanup", async () => {
 vi.spyOn(Date, "now").mockReturnValueOnce(1_000_000).mockReturnValue(1_270_000);
 expect(await run()).toMatchObject({ ok: true, completo: false, estado: "pendiente", budgetHit: true, orgsWarmed: 0, orgsFullyWarmed: 0, cachePurged: null });
 expect(m.fetch).not.toHaveBeenCalled(); expect(m.purge).not.toHaveBeenCalled();
 expect(m.heartbeat).toHaveBeenCalledWith("warm-cache", true, undefined);
});
it.each(["rejected", "throw"])("failed %s email does not consume the delivery cooldown", async kind => {
 m.freshness.mockResolvedValue([{ ...fresh, stale: true, hoursStale: 10 }]);
 if (kind === "throw") m.email.mockRejectedValueOnce(new Error("mail down"));
 else m.email.mockResolvedValueOnce({ ok: false });
 expect(await run()).toMatchObject({ ok: false, alertaStatus: "fallo" });
 expect(await run()).toMatchObject({ ok: true, alertaStatus: "enviada" });
 expect(await run()).toMatchObject({ ok: true, alertaStatus: "cooldown" });
 expect(m.email).toHaveBeenCalledTimes(2);
});
it("rejects unauthorized requests without external work", async () => {
 const response = await GET(new NextRequest("https://test.invalid/api/cron/warm-cache"));
 expect(response.status).toBe(403); expect(m.query).not.toHaveBeenCalled(); expect(m.fetch).not.toHaveBeenCalled();
});
it("a concurrent invocation reports pending delivery without sending twice", async () => {
 m.freshness.mockResolvedValue([{ ...fresh, stale: true, hoursStale: 10 }]);
 let release!: (result: { ok: boolean }) => void;
 let started!: () => void;
 const sending = new Promise<void>(resolve => { started = resolve; });
 m.email.mockImplementationOnce(() => { started(); return new Promise(resolve => { release = resolve; }); });
 const first = run();
 await sending;
 expect(await run()).toMatchObject({ ok: true, completo: false, alertaStatus: "pendiente" });
 expect(m.email).toHaveBeenCalledTimes(1);
 release({ ok: true });
 expect(await first).toMatchObject({ alertaStatus: "enviada", completo: true });
});
it("reports creator counter cleanup failures", async () => {
 m.cleanup.mockResolvedValue(-1);
 expect(await run()).toMatchObject({ ok: false, completo: false, creatorAttemptsPurged: -1 });
 expect(m.heartbeat).toHaveBeenCalledWith("warm-cache", false, expect.stringContaining("contadores"));
});