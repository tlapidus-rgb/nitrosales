import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ claim: vi.fn(), progress: vi.fn(), complete: vi.fn(), get: vi.fn(), process: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/admin-key", () => ({ ADMIN_API_KEY: "test" }));
vi.mock("@/lib/db/client", () => ({ prisma: { $queryRawUnsafe: async () => [] } }));
vi.mock("@/lib/feature-flags", () => ({ isInternalUser: async () => true }));
vi.mock("@/lib/backfill/job-manager", () => ({ reclamarProximoJob: m.claim, updateJobProgress: m.progress,
 completeJob: m.complete, getJob: m.get, contarJobsActivos: async () => 0,
 matarJobsSinProgreso: async () => [], areAllJobsComplete: () => { throw new Error("Must not finalize"); } }));
vi.mock("@/lib/backfill/dispatcher", () => ({ processChunk: m.process }));
vi.mock("@/lib/email/send", () => ({ sendEmail: () => { throw new Error("No email allowed"); } }));
vi.mock("@/lib/onboarding/emails", () => ({ dataReadyEmailActive: vi.fn() }));
vi.mock("@vercel/functions", () => ({ waitUntil: () => { throw new Error("No background effects allowed"); } }));
import { GET } from "@/app/api/cron/backfill-runner/route";
const run = async () => (await GET(new NextRequest("https://test.invalid/api?key=test&ignorarVentana=1"))).json();
const job = { id: "job", leaseToken: "owner-a", status: "RUNNING", platform: "VTEX", onboardingRequestId: "onboarding" };
beforeEach(() => {
 vi.resetAllMocks(); m.claim.mockResolvedValue(job); m.progress.mockResolvedValue(true);
 m.process.mockResolvedValue({ itemsProcessed: 10, newCursor: { page: 2 }, isComplete: false });
 m.get.mockResolvedValue({ ...job, leaseToken: "owner-b" });
});
it("stops before another chunk when ownership changes", async () => {
 expect(await run()).toMatchObject({ frenado: "propiedad-del-job-perdida", iterations: 1 });
 expect(m.process).toHaveBeenCalledTimes(1);
 expect(m.progress).toHaveBeenCalledWith("job", expect.anything(), { leaseToken: "owner-a", tocarLatido: true });
 expect(m.complete).not.toHaveBeenCalled();
});
it("does not complete or finalize after losing a progress write", async () => {
 m.progress.mockResolvedValue(false); m.process.mockResolvedValue({ itemsProcessed: 10, newCursor: {}, isComplete: true });
 expect(await run()).toMatchObject({ frenado: "propiedad-del-job-perdida", iterations: 0 });
 expect(m.complete).not.toHaveBeenCalled();
});
it("does not trigger finalization when the completion write loses ownership", async () => {
 m.complete.mockResolvedValue(false); m.process.mockResolvedValue({ itemsProcessed: 10, newCursor: {}, isComplete: true });
 expect(await run()).toMatchObject({ frenado: "propiedad-del-job-perdida", details: [expect.objectContaining({ complete: false })] });
 expect(m.complete).toHaveBeenCalledWith("job", "owner-a");
});
