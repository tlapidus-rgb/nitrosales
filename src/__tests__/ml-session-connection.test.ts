import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ session: vi.fn(), find: vi.fn(), token: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: m.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/db/client", () => ({ prisma: { connection: { findFirst: m.find } } }));
vi.mock("@/lib/connectors/mercadolibre-seller", () => ({ getSellerToken: m.token }));
import { mlSessionConnection } from "@/lib/connectors/ml-session-connection";
import { GET as sync } from "@/app/api/sync/mercadolibre/route";
import { GET as backfill } from "@/app/api/sync/mercadolibre/backfill/route";
import { GET as enrich } from "@/app/api/sync/mercadolibre/enrich-items/route";
beforeEach(() => { vi.resetAllMocks(); m.session.mockResolvedValue({ user: { organizationId: "own" } }); m.find.mockResolvedValue({ id: "conn", organizationId: "own" }); });
it("selects only the authenticated organization and active ML platform", async () => {
 expect((await mlSessionConnection()).connection?.organizationId).toBe("own");
 expect(m.find).toHaveBeenCalledWith({ where: { organizationId: "own", platform: "MERCADOLIBRE", status: "ACTIVE" }, select: { id: true, organizationId: true } });
});
it.each([null, { user: {} }, { user: { organizationId: "" } }])("does not fall back to the first organization without a valid session", async session => {
 m.session.mockResolvedValue(session);
 expect((await mlSessionConnection()).response?.status).toBe(session ? 403 : 401);
 expect(m.find).not.toHaveBeenCalled();
});
it("returns 503 on session failure without touching connections", async () => {
 m.session.mockRejectedValue(new Error("failure"));
 expect((await mlSessionConnection()).response?.status).toBe(503); expect(m.find).not.toHaveBeenCalled();
});
it("does not choose another org when the current org has no connection", async () => {
 m.find.mockResolvedValue(null);
 expect((await mlSessionConnection()).response?.status).toBe(404);
 expect(m.find).toHaveBeenCalledTimes(1);
});
it.each([{ name: "sync", run: sync }, { name: "backfill", run: backfill }, { name: "enrich", run: enrich }])("$name blocks absent sessions before provider access", async ({ run }) => {
 m.session.mockResolvedValue(null);
 expect((await run(new NextRequest("http://localhost/api/test?orgId=other"))).status).toBe(401);
 expect(m.find).not.toHaveBeenCalled(); expect(m.token).not.toHaveBeenCalled();
});
