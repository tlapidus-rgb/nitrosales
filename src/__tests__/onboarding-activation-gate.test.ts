import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ query: vi.fn(), update: vi.fn(), readiness: vi.fn(), email: vi.fn(), staff: vi.fn(), connection: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { $queryRawUnsafe: m.query, $executeRawUnsafe: m.update, connection: { findFirst: m.connection } } }));
vi.mock("@/lib/admin-key", () => ({ ADMIN_API_KEY: "test" }));
vi.mock("@/lib/onboarding/collect-readiness", () => ({ collectReadiness: m.readiness }));
vi.mock("@/lib/feature-flags", () => ({ isInternalUser: m.staff }));
vi.mock("@/lib/email/send", () => ({ sendEmail: m.email }));
vi.mock("@/lib/onboarding/emails", () => ({ dataReadyEmailActive: async () => ({ subject: "test", html: "test" }) }));
import { POST } from "@/app/api/admin/onboardings/[id]/activate-client/route";
const ob = { id: "onboarding", createdOrgId: "org", companyName: "Test", status: "READY_FOR_REVIEW", contactEmail: "test@example.invalid" };
const run = () => POST(new NextRequest("https://test.invalid/api", { method: "POST" }), { params: Promise.resolve({ id: ob.id }) });
beforeEach(() => {
 vi.resetAllMocks(); m.staff.mockResolvedValue(true); m.query.mockResolvedValue([ob]);
 m.readiness.mockResolvedValue({ readiness: { listo: true } }); m.update.mockResolvedValue(1);
 m.email.mockResolvedValue({ ok: true }); m.connection.mockResolvedValue(null);
});
it.each(["BACKFILLING", "IN_PROGRESS", "NEEDS_INFO"])("rejects premature activation from %s", async status => {
 m.query.mockResolvedValue([{ ...ob, status }]); expect((await run()).status).toBe(400);
 expect(m.update).not.toHaveBeenCalled(); expect(m.email).not.toHaveBeenCalled();
});
it("rechecks live readiness and blocks incomplete checks", async () => {
 m.readiness.mockResolvedValue({ readiness: { listo: false, estado: "inconcluso" } });
 expect((await run()).status).toBe(409); expect(m.readiness).toHaveBeenCalledWith(ob, true);
 expect(m.update).not.toHaveBeenCalled();
});
it("does not send mail or set up hooks after losing the conditional update", async () => {
 m.update.mockResolvedValue(0); expect((await run()).status).toBe(409);
 expect(m.email).not.toHaveBeenCalled(); expect(m.connection).not.toHaveBeenCalled();
});
it("reports rejected mail truthfully after activation", async () => {
 m.email.mockResolvedValue({ ok: false }); expect(await (await run()).json()).toMatchObject({ ok: true, emailSent: false });
});
it("already active is idempotent", async () => {
 m.query.mockResolvedValue([{ ...ob, status: "ACTIVE" }]); expect(await (await run()).json()).toMatchObject({ alreadyActive: true });
 expect(m.readiness).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
});
it("requires staff before inspecting or changing anything", async () => {
 m.staff.mockResolvedValue(false); expect((await run()).status).toBe(403); expect(m.query).not.toHaveBeenCalled();
});
