import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ heartbeat: vi.fn(), email: vi.fn(), check: vi.fn(),
  pending: vi.fn(), evaluate: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/cron/latido", () => ({ registrarLatido: m.heartbeat }));
vi.mock("@/lib/admin-key", () => ({ ADMIN_API_KEY: "test-key", isValidAdminKey: (v: string) => v === "test-key" }));
vi.mock("@/lib/email/send", () => ({ sendEmail: m.email }));
vi.mock("@/lib/feature-flags", () => ({ isInternalUser: async () => false }));
vi.mock("@/lib/alertas/destinatarios", () => ({ destinatariosDeAlertas: () => ["test@example.invalid"] }));
vi.mock("@/lib/self-fetch", () => ({ selfFetchBaseUrl: () => "https://test.invalid" }));
vi.mock("@/lib/control/email-template", () => ({ buildAlertEmailHtml: () => ({ html: "test", subject: "test" }) }));
vi.mock("@/lib/control/checks", () => ({ checkConnectionIssues: m.check, checkStuckOnboardings: m.check,
  checkInactiveClients: m.check, checkJobsDeBackfillAtascados: m.check, checkCronesCaidos: m.check }));
vi.mock("@/lib/alerts/engine", () => ({ loadAllPendingSchedules: m.pending, evaluateRule: m.evaluate }));
import { GET as control } from "@/app/api/cron/control-alerts/route";
import { GET as clients } from "@/app/api/cron/alertas-clientes/route";
import { GET as scheduler } from "@/app/api/cron/alerts-scheduler/route";
const request = (extra = "") => new NextRequest(`https://test.invalid/api?key=test-key${extra}`);
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal("fetch", m.fetch);
  m.heartbeat.mockResolvedValue(undefined); m.email.mockResolvedValue({ ok: true });
  m.check.mockResolvedValue([]); m.pending.mockResolvedValue([]); m.evaluate.mockResolvedValue(null);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("records successful control checks even when no email is needed", async () => {
  const response = await control(request());
  expect(response.status).toBe(200);
  expect((await response.json()).monitoreoCrons.sinLatido).toContain("backfill-runner");
  expect(m.email).not.toHaveBeenCalled(); expect(m.heartbeat).toHaveBeenCalledWith("control-alerts", true);
});
it("does not claim a preview ran the scheduled delivery", async () => {
  expect((await control(request("&preview=1"))).status).toBe(200);
  expect(m.heartbeat).not.toHaveBeenCalled(); expect(m.email).not.toHaveBeenCalled();
});
it("marks rejected control emails as failures", async () => {
  m.email.mockResolvedValue({ ok: false, error: "rejected" });
  const res = await control(request("&force=1"));
  expect(res.status).toBe(502); expect((await res.json()).ok).toBe(false);
  expect(m.heartbeat).toHaveBeenCalledWith("control-alerts", false, expect.any(String));
});
it.each(["html", "http-error", "json-error"])("records upstream failure: %s", async kind => {
  m.fetch.mockResolvedValue(new Response(kind === "html" ? "<html>error</html>" : JSON.stringify({ ok: kind === "http-error" }),
    { status: kind === "http-error" ? 500 : 200 }));
  expect((await clients(request())).status).toBe(502);
  expect(m.heartbeat).toHaveBeenCalledWith("alertas-clientes", false, expect.any(String));
  expect(m.email).not.toHaveBeenCalled();
});
it.each([false, true])("does not report alerts as notified on failed mail, throws=%s", async throws => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.fetch.mockResolvedValue(Response.json({ ok: true, summary: { critical: 1 }, alertas: [
    { severity: "critical", title: "Test", description: "Test", category: "test", organizationName: "Test" },
  ] }));
  if (throws) m.email.mockRejectedValue(new Error("rejected")); else m.email.mockResolvedValue({ ok: false });
  const res = await clients(request());
  expect(res.status).toBe(502); expect(await res.json()).toMatchObject({ ok: false, avisadas: 0, pendientesDeAvisar: 1 });
  expect(m.heartbeat).toHaveBeenCalledWith("alertas-clientes", false, expect.any(String));
});
it("marks partial scheduler errors without discarding successful rule results", async () => {
  m.pending.mockResolvedValue([{ id: "one", name: "One" }, { id: "two", name: "Two" }]);
  m.evaluate.mockRejectedValueOnce(new Error("failed")).mockResolvedValueOnce({ id: "alert" });
  const res = await scheduler(request());
  expect(await res.json()).toMatchObject({ ok: false, completo: false, estado: "fallo-parcial", errors: 1, alertsFired: 1 });
  expect(m.heartbeat).toHaveBeenCalledWith("alerts-scheduler", false, expect.any(String));
});
it("records a complete empty scheduler run", async () => {
  expect(await (await scheduler(request())).json()).toMatchObject({ ok: true, completo: true, estado: "completo" });
});
it("distinguishes a budget cutoff from a complete evaluation", async () => {
  m.pending.mockResolvedValue([{ id: "one", name: "One" }]);
  vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValue(300000);
  expect(await (await scheduler(request())).json()).toMatchObject({
    ok: true, completo: false, estado: "pendiente", budgetHit: true, evaluadas: 0,
  });
  expect(m.evaluate).not.toHaveBeenCalled();
  expect(m.heartbeat).toHaveBeenCalledWith("alerts-scheduler", true, undefined);
});
it.each([control, clients, scheduler])("rejects unauthorized calls without heartbeat or email", async handler => {
  expect((await handler(new NextRequest("https://test.invalid/api"))).status).toBeGreaterThanOrEqual(400);
  expect(m.heartbeat).not.toHaveBeenCalled(); expect(m.email).not.toHaveBeenCalled();
});

it("reports unavailable monitoring even when its warning email was delivered", async () => {
 // The first four checks succeed; only the heartbeat check is unavailable.
 m.check.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([])
  .mockResolvedValueOnce([{ cron: "monitoreo-de-crons", motivo: "monitoreo-no-disponible", detalle: "No se pudo verificar" }]);
 const response = await control(request());
 expect(response.status).toBe(503);
 expect(await response.json()).toMatchObject({ ok: false, sent: true, monitoreoCrons: { disponible: false } });
 expect(m.email).toHaveBeenCalledTimes(1);
 expect(m.heartbeat).toHaveBeenCalledWith("control-alerts", false, "No se pudo verificar el monitoreo de crons");
});