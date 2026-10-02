import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ orgs: vi.fn(), last: vi.fn(), events: vi.fn(), visitors: vi.fn(), staff: vi.fn(), email: vi.fn(), heartbeat: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { organization: { findMany: m.orgs }, pixelEvent: { findFirst: m.last, count: m.events }, pixelVisitor: { count: m.visitors } } }));
vi.mock("@/lib/feature-flags", () => ({ isInternalUser: m.staff }));
vi.mock("@/lib/admin-key", () => ({ isValidAdminKey: (key: string) => key === "synthetic-cron-key" }));
vi.mock("@/lib/cron/latido", () => ({ registrarLatido: m.heartbeat }));
vi.mock("@/lib/email/send", () => ({ sendEmail: m.email }));
vi.mock("@/lib/alertas/destinatarios", () => ({ destinatariosDeAlertas: () => ["alerts@example.invalid"] }));
import { obtenerAlertasClientes } from "@/lib/alertas/clientes";
import { GET as admin } from "@/app/api/admin/alertas/route";
import { GET as cron } from "@/app/api/cron/alertas-clientes/route";
const now = new Date("2026-10-02T12:00:00Z");
const req = (key = "synthetic-cron-key") => new NextRequest(`https://example.invalid/api?key=${key}`);
function fixture(rows: Array<{ id: string; last: Date | null; events: number; visitors: number; identified: number; purchases: number }>) {
  m.orgs.mockResolvedValue(rows.map(r => ({ id: r.id, name: r.id, slug: r.id })));
  const row = (args: any) => rows.find(r => r.id === args.where.organizationId)!;
  m.last.mockImplementation(async args => row(args).last ? { receivedAt: row(args).last } : null);
  m.events.mockImplementation(async args => args.where.type === "PURCHASE" ? row(args).purchases : row(args).events);
  m.visitors.mockImplementation(async args => args.where.email ? row(args).identified : row(args).visitors);
}
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now); vi.stubGlobal("fetch", m.fetch);
  m.staff.mockResolvedValue(true); m.email.mockResolvedValue({ ok: true });
  fixture([{ id: "setup", last: null, events: 0, visitors: 0, identified: 0, purchases: 0 }]);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("preserves all four detections, severity ordering and tenant-specific windows", async () => {
  fixture([
    { id: "setup", last: null, events: 0, visitors: 100, identified: 0, purchases: 0 },
    { id: "down", last: new Date("2026-09-30T12:00:00Z"), events: 0, visitors: 19, identified: 0, purchases: 0 },
    { id: "traffic", last: now, events: 10, visitors: 50, identified: 4, purchases: 0 },
    { id: "healthy", last: now, events: 10, visitors: 50, identified: 5, purchases: 1 },
  ]);
  const result = await obtenerAlertasClientes();
  expect(result.summary).toEqual({ total: 4, critical: 1, warning: 2, info: 1 });
  expect(result.alertas.map(a => [a.orgId, a.category])).toEqual([
    ["down", "CRITICAL"], ["traffic", "LOW_IDENTITY"], ["traffic", "NO_PURCHASES"], ["setup", "SETUP"],
  ]);
  expect(result.alertas[0].metric).toBe("48h sin eventos");
  expect(result.computedAt).toBe(now.toISOString());
  expect(m.events).toHaveBeenCalledWith({ where: { organizationId: "traffic", receivedAt: { gte: new Date("2026-10-01T12:00:00Z") } } });
  expect(m.visitors).toHaveBeenCalledWith({ where: { organizationId: "traffic", firstSeenAt: { gte: new Date("2026-09-25T12:00:00Z") }, email: { not: null } } });
});
it("retains minimum visitor thresholds and the strict ten-percent identity boundary", async () => {
  fixture([
    { id: "below", last: now, events: 1, visitors: 19, identified: 0, purchases: 0 },
    { id: "identity", last: now, events: 1, visitors: 20, identified: 1, purchases: 0 },
    { id: "boundary", last: now, events: 1, visitors: 49, identified: 5, purchases: 0 },
  ]);
  expect((await obtenerAlertasClientes()).alertas.map(a => a.id)).toEqual(["identity-low-identity"]);
});
it("requires verified staff even when an otherwise valid cron key is provided", async () => {
  m.staff.mockResolvedValue(false);
  expect((await admin(req())).status).toBe(403);
  expect(m.orgs).not.toHaveBeenCalled();
});
it("the staff API returns shared checks without email or network self-fetch", async () => {
  expect(await (await admin(req())).json()).toMatchObject({ ok: true, summary: { info: 1 } });
  expect(m.email).not.toHaveBeenCalled(); expect(m.fetch).not.toHaveBeenCalled();
});
it("cron runs without a staff session and never calls the staff API", async () => {
  m.staff.mockResolvedValue(false);
  fixture([{ id: "down", last: new Date("2026-09-30T12:00:00Z"), events: 0, visitors: 0, identified: 0, purchases: 0 }]);
  expect(await (await cron(req())).json()).toMatchObject({ ok: true, avisadas: 1, total: 1 });
  expect(m.email).toHaveBeenCalledTimes(1); expect(m.email).toHaveBeenCalledWith(expect.objectContaining({ to: ["alerts@example.invalid"] }));
  expect(m.staff).not.toHaveBeenCalled(); expect(m.fetch).not.toHaveBeenCalled();
  expect(m.heartbeat).toHaveBeenCalledWith("alertas-clientes", true);
});
it("does not send mail for setup info and rejects unauthorized cron before reading", async () => {
  expect(await (await cron(req())).json()).toMatchObject({ ok: true, avisadas: 0, total: 1 });
  expect(m.email).not.toHaveBeenCalled();
  m.orgs.mockClear();
  expect((await cron(req("invalid"))).status).toBe(403);
  expect(m.orgs).not.toHaveBeenCalled();
});

it("escapes the organization name in the daily staff email", async () => {
  fixture([{ id: "down", last: new Date("2026-09-30T12:00:00Z"), events: 0, visitors: 0, identified: 0, purchases: 0 }]);
  const name = '<a href="https://example.invalid/path">Org & partners</a>';
  m.orgs.mockResolvedValue([{ id: "down", name, slug: "down" }]);
  expect((await cron(req())).status).toBe(200);
  expect(m.email).toHaveBeenCalledTimes(1);
  const mail = m.email.mock.calls[0][0];
  expect(mail.html).toContain('<b>&lt;a href=&quot;https://example.invalid/path&quot;&gt;Org &amp; partners&lt;/a&gt;</b>');
  expect(mail.html).not.toContain(name);
  expect(mail.html).toContain("Pixel caído");
  expect(m.fetch).not.toHaveBeenCalled();
});
