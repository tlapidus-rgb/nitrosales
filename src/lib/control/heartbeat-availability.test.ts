import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { $queryRawUnsafe: m.query } }));
vi.mock("@/lib/cron/schedules", () => ({ schedulesConLatido: () => ({ digest: "0 10 * * 1" }) }));
import { leerLatidos } from "@/lib/cron/latido";
import { checkCronesCaidos } from "@/lib/control/checks";
import { buildAlertEmailHtml } from "@/lib/control/email-template";
beforeEach(() => { vi.resetAllMocks(); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());
it.each(["42P01 relation missing", "connection timed out"])("a failed read is not an empty history: %s", async (message) => {
 m.query.mockRejectedValue(new Error(message));
 await expect(leerLatidos()).rejects.toThrow("Monitoreo de crons no disponible");
 const issues = await checkCronesCaidos();
 expect(issues).toEqual([expect.objectContaining({ motivo: "monitoreo-no-disponible" })]);
 const mail = buildAlertEmailHtml({ connectionIssues: [], stuckOnboardings: [], inactiveClients: [], jobsAtascados: [], cronesCaidos: issues, appUrl: "https://example.invalid" });
 expect(mail.subject).not.toContain("Todo OK");
 expect(mail.html).toContain("No se pudo verificar");
 expect(mail.html).not.toContain("Todos los clientes OK");
});
it("an empty readable table reports missing execution evidence", async () => {
 m.query.mockResolvedValue([]);
 await expect(leerLatidos()).resolves.toEqual([]);
 expect(await checkCronesCaidos()).toEqual([expect.objectContaining({ cron: "digest", motivo: "nunca-latio" })]);
});
it("a recent successful run remains healthy", async () => {
 m.query.mockResolvedValue([{ name: "digest", last_run_at: new Date(), last_ok: true, last_error: null }]);
 await expect(checkCronesCaidos()).resolves.toEqual([]);
});
it("a recent failed run remains visible", async () => {
 m.query.mockResolvedValue([{ name: "digest", last_run_at: new Date(), last_ok: false, last_error: "test failure" }]);
 expect(await checkCronesCaidos()).toEqual([expect.objectContaining({ cron: "digest", motivo: "ultima-fallo" })]);
});
it.each(["42P01 table missing", "statement timeout"])("backfill read failure is explicit: %s", async message => {
 m.query.mockRejectedValue(new Error(message));
 const { checkJobsDeBackfillAtascados } = await import("@/lib/control/checks");
 await expect(checkJobsDeBackfillAtascados()).rejects.toThrow("No se pudo verificar el estado de los backfills");
});
it("an empty successful backfill query still means no stuck jobs", async () => {
 m.query.mockResolvedValue([]);
 const { checkJobsDeBackfillAtascados } = await import("@/lib/control/checks");
 await expect(checkJobsDeBackfillAtascados()).resolves.toEqual([]);
});
it("an unavailable check makes the email incomplete, without inventing a stuck job", () => {
 const mail = buildAlertEmailHtml({ connectionIssues: [], stuckOnboardings: [], inactiveClients: [], jobsAtascados: [], checksNoDisponibles: ["Backfills <test>"], appUrl: "https://example.invalid" });
 expect(mail.subject).not.toContain("Todo OK");
 expect(mail.html).toContain("El reporte está incompleto");
 expect(mail.html).toContain("Backfills &lt;test&gt;");
 expect(mail.html).not.toContain("Todos los clientes OK");
 expect(mail.html).not.toContain("Backfills trabados");
});