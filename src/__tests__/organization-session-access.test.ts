import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ find: vi.fn(), many: vi.fn(), session: vi.fn(), cookies: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { organization: { findUnique: m.find,findMany: m.many } } }));
vi.mock("next-auth", () => ({ getServerSession: m.session }));
vi.mock("next/headers", () => ({ cookies: m.cookies }));
vi.mock("@/lib/permissions-resolve", () => ({ resolveEffectivePermissionsByEmail: vi.fn(),allowedSectionsFrom: vi.fn(),writableSectionsFrom: vi.fn() }));
import { authOptions } from "@/lib/auth";
import { enforceOrganizationAccess } from "@/lib/organizacion/session-access";
import { getOrganization,getOrganizationId,getOrganizationIdStrict,tryGetOrganizationId } from "@/lib/auth-guard";
const suspended = { suspension: { desde: "2026-09-29",motivo: "PRIVATE REASON",porQuien: "PRIVATE STAFF",cortarIngesta: false } };
const token = { id: "user",organizationId: "a",organizationName: "A",email: "client@example.invalid",isStaff: false };
const resolve = (override = {}) => authOptions.callbacks!.session!({ session: { expires: "2099-01-01",user: { email: "client@example.invalid" } },token: { ...token,...override } } as any) as Promise<any>;
beforeEach(() => {
 vi.resetAllMocks(); m.find.mockResolvedValue({ settings: {} }); m.cookies.mockResolvedValue({ get: () => undefined });
 m.many.mockResolvedValue([{ id: "only-org" }]); m.session.mockImplementation(() => resolve());
 vi.stubGlobal("fetch",vi.fn(() => { throw new Error("Self-fetch is forbidden"); }));
});
afterEach(() => vi.unstubAllGlobals());
it("suspends and reactivates an existing token without a login or JWT refresh", async () => {
 expect((await resolve()).user.organizationId).toBe("a");
 m.find.mockResolvedValue({ settings: suspended });
 const denied = await resolve(); expect(denied).toEqual({ expires: "2099-01-01",organizationAccess: "suspended" });
 expect(JSON.stringify(denied)).not.toContain("PRIVATE");
 m.find.mockResolvedValue({ settings: {} }); expect((await resolve()).user.id).toBe("user");
 expect(fetch).not.toHaveBeenCalled();
});
it.each([null,[],"invalid",{ suspension: "invalid" },{ suspension: {} }])("denies unverifiable settings: %j", async settings => {
 m.find.mockResolvedValue({ settings }); expect(await resolve()).toMatchObject({ organizationAccess: "unavailable" });
});
it("denies missing organizations and database failures without exposing identity", async () => {
 m.find.mockResolvedValue(null); expect((await resolve()).user).toBeUndefined();
 m.find.mockRejectedValue(new Error("database internal detail"));
 expect(await resolve()).toEqual({ expires: "2099-01-01",organizationAccess: "unavailable" });
});
it.each([undefined,"",123])("denies a missing or invalid organization ID: %j", async organizationId => {
 expect(await resolve({ organizationId })).toMatchObject({ organizationAccess: "unavailable" }); expect(m.find).not.toHaveBeenCalled();
});
it("keeps actual support access and resolves view-as before checking the session", async () => {
 m.cookies.mockResolvedValue({ get: () => ({ value: "target" }) });
 m.find.mockResolvedValue({ id: "target",name: "Target",settings: suspended });
 const session = await resolve({ isStaff: true });
 expect(session.user).toMatchObject({ organizationId: "target",realOrganizationId: "a",viewingAsOrg: "target" });
 expect(session.organizationAccess).toBeUndefined();
});
it("applies suspension to impersonation even when target has a staff flag", async () => {
 m.find.mockResolvedValue({ settings: suspended });
 expect(await resolve({ isStaff: true,impersonatedBy: "staff" })).toMatchObject({ organizationAccess: "suspended" });
 expect(m.cookies).not.toHaveBeenCalled();
});
it("does not restore a blocked session through the single-org fallback", async () => {
 m.find.mockResolvedValue({ settings: suspended });
 await expect(getOrganization()).rejects.toThrow(); await expect(getOrganizationId()).rejects.toThrow();
 await expect(getOrganizationIdStrict()).rejects.toThrow(); expect(await tryGetOrganizationId()).toBeNull();
 expect(m.many).not.toHaveBeenCalled();
});
it("does not resolve the only organization for an unauthenticated caller", async () => {
 m.session.mockResolvedValue(null);
 await expect(getOrganization()).rejects.toThrow(); await expect(getOrganizationId()).rejects.toThrow();
 expect(m.find).not.toHaveBeenCalled(); expect(m.many).not.toHaveBeenCalled();
});
it("does not use fallback on session lookup failure", async () => {
 m.session.mockRejectedValue(new Error("session unavailable"));
 await expect(getOrganizationId()).rejects.toThrow("session unavailable"); expect(await tryGetOrganizationId()).toBeNull();
 expect(m.many).not.toHaveBeenCalled();
});
it("returns the authenticated organization only", async () => {
 m.session.mockResolvedValue({ user: { organizationId: "a" } });
 m.find.mockResolvedValue({ id: "a",name: "A",slug: "a" });
 expect(await getOrganization()).toEqual({ id: "a",name: "A",slug: "a" });
 expect(m.find).toHaveBeenCalledWith({ where: { id: "a" },select: { id: true,name: true,slug: true } });
});
it("leaves an unauthenticated session without inventing identity", async () => {
 const session = { expires: "2099-01-01" }; expect(await enforceOrganizationAccess(session)).toBe(session);
 expect(m.find).not.toHaveBeenCalled();
});
