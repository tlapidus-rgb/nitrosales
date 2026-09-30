import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), find: vi.fn(), many: vi.fn(), session: vi.fn(), cookies: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { user: { findUnique: m.user }, organization: { findUnique: m.find, findMany: m.many } } }));
vi.mock("next-auth", () => ({ getServerSession: m.session }));
vi.mock("next/headers", () => ({ cookies: m.cookies }));
vi.mock("@/lib/permissions-resolve", () => ({ resolveEffectivePermissionsByEmail: vi.fn(),allowedSectionsFrom: vi.fn(),writableSectionsFrom: vi.fn() }));
import { authOptions } from "@/lib/auth";
import { olvidarVerificaciones, MEMORIA_ANTE_CORTE_MS } from "@/lib/organizacion/session-access";
import { getOrganization,getOrganizationId,getOrganizationIdStrict,tryGetOrganizationId } from "@/lib/auth-guard";
import { STAFF_EMAILS } from "@/lib/staff";

// ══════════════════════════════════════════════════════════════════════════
// La sesión: identidad atada a la base, suspensión, y tolerancia a cortes
// ══════════════════════════════════════════════════════════════════════════
// El token de sesión se firma con NEXTAUTH_SECRET, y ese secreto hoy le llega a
// cualquier usuario logueado (`/api/me/vtex-affiliate-info`). Con él se puede
// fabricar un token que diga cualquier cosa. Estos tests fijan que lo que
// decide permisos —ser staff, el rol, la organización, la suspensión— sale de
// la base, y que un token que no coincide con la base no entra.
// ══════════════════════════════════════════════════════════════════════════

const suspended = { suspension: { desde: "2026-09-29",motivo: "PRIVATE REASON",porQuien: "PRIVATE STAFF",cortarIngesta: false } };
const token = { id: "user",organizationId: "a",organizationName: "A",email: "client@example.invalid",isStaff: false,role: "VIEWER" };
const enBase = (o: Record<string, unknown> = {}, settings: unknown = {}) =>
 ({ email: "client@example.invalid",isStaff: false,role: "VIEWER",organizationId: "a",organization: { settings },...o });
const resolve = (override = {}) => authOptions.callbacks!.session!({ session: { expires: "2099-01-01",user: { email: "client@example.invalid" } },token: { ...token,...override } } as any) as Promise<any>;
const staffEmail = [...STAFF_EMAILS][0];

beforeEach(() => {
 vi.resetAllMocks(); olvidarVerificaciones();
 m.user.mockResolvedValue(enBase()); m.cookies.mockResolvedValue({ get: () => undefined });
 m.many.mockResolvedValue([{ id: "only-org" }]); m.session.mockImplementation(() => resolve());
 vi.stubGlobal("fetch",vi.fn(() => { throw new Error("Self-fetch is forbidden"); }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

// ── Suspensión (E-27) ────────────────────────────────────────────────────
it("suspends and reactivates an existing token without a login or JWT refresh", async () => {
 expect((await resolve()).user.organizationId).toBe("a");
 m.user.mockResolvedValue(enBase({}, suspended));
 const denied = await resolve(); expect(denied).toEqual({ expires: "2099-01-01",organizationAccess: "suspended" });
 expect(JSON.stringify(denied)).not.toContain("PRIVATE");
 m.user.mockResolvedValue(enBase()); expect((await resolve()).user.id).toBe("user");
 expect(fetch).not.toHaveBeenCalled();
});
it.each([null,[],"invalid",{ suspension: "invalid" },{ suspension: {} }])("denies unverifiable settings: %j", async settings => {
 m.user.mockResolvedValue(enBase({}, settings)); expect(await resolve()).toMatchObject({ organizationAccess: "unavailable" });
});
it("denies missing users and database failures without exposing identity", async () => {
 m.user.mockResolvedValue(null); expect(await resolve()).toEqual({ expires: "2099-01-01",organizationAccess: "unavailable" });
 olvidarVerificaciones();
 m.user.mockRejectedValue(new Error("database internal detail"));
 expect(await resolve()).toEqual({ expires: "2099-01-01",organizationAccess: "unavailable" });
});
it.each([undefined,"",123])("denies a missing or invalid organization ID: %j", async organizationId => {
 expect(await resolve({ organizationId })).toMatchObject({ organizationAccess: "unavailable" }); expect(m.user).not.toHaveBeenCalled();
});
it.each([undefined,"",42])("denies a missing or invalid user ID without querying: %j", async id => {
 expect(await resolve({ id })).toMatchObject({ organizationAccess: "unavailable" }); expect(m.user).not.toHaveBeenCalled();
});
it("keeps actual support access and resolves view-as before checking the session", async () => {
 m.user.mockResolvedValue(enBase({ isStaff: true }, suspended));
 m.cookies.mockResolvedValue({ get: () => ({ value: "target" }) });
 m.find.mockResolvedValue({ id: "target",name: "Target" });
 const session = await resolve({ isStaff: true });
 expect(session.user).toMatchObject({ organizationId: "target",realOrganizationId: "a",viewingAsOrg: "target",isStaff: true });
 expect(session.organizationAccess).toBeUndefined();
});
it("applies suspension to impersonation even when the target is staff in the database", async () => {
 m.user.mockResolvedValue(enBase({ isStaff: true }, suspended));
 expect(await resolve({ isStaff: true,impersonatedBy: "staff" })).toMatchObject({ organizationAccess: "suspended" });
 expect(m.cookies).not.toHaveBeenCalled();
});

// ── Identidad atada a la base (el secreto filtrado) ────────────────────────
it("EL CASO: un token que dice isStaff pero la base no, no es staff ni ve otra organización", async () => {
 m.cookies.mockResolvedValue({ get: () => ({ value: "victim-org" }) });
 m.find.mockResolvedValue({ id: "victim-org",name: "Victim" });
 const session = await resolve({ isStaff: true });
 expect(session.user.isStaff).toBe(false);
 expect(session.user.organizationId).toBe("a");
 expect(session.user.viewingAsOrg).toBeUndefined();
 expect(m.cookies).not.toHaveBeenCalled();
});
it("un token forjado no se saltea la suspensión diciendo que es staff", async () => {
 m.user.mockResolvedValue(enBase({}, suspended));
 expect(await resolve({ isStaff: true })).toMatchObject({ organizationAccess: "suspended" });
});
it("un token con el email de alguien de staff que no coincide con la base, no entra", async () => {
 // El email de staff está en el código (allowlist). Sin esta verificación, un
 // token con ese email daba acceso total aunque el usuario no fuera staff.
 const session = await resolve({ email: staffEmail });
 expect(session).toEqual({ expires: "2099-01-01",organizationAccess: "unavailable" });
});
it("un token que dice otra organización que la del usuario, no entra", async () => {
 expect(await resolve({ organizationId: "other-org" })).toMatchObject({ organizationAccess: "unavailable" });
});
it("un token de un usuario que no existe, no entra", async () => {
 m.user.mockResolvedValue(null);
 expect((await resolve({ id: "invented" })).user).toBeUndefined();
});
it("el rol sale de la base: un token que se sube a OWNER sigue siendo VIEWER", async () => {
 expect((await resolve({ role: "OWNER" })).user.role).toBe("VIEWER");
});
it("el staff real sale de la base, también por la allowlist de email", async () => {
 m.user.mockResolvedValue(enBase({ email: staffEmail, isStaff: false }));
 expect((await resolve({ email: staffEmail })).user.isStaff).toBe(true);
});
it("el email se compara sin distinguir mayúsculas", async () => {
 expect((await resolve({ email: "Client@Example.Invalid" })).user.id).toBe("user");
});
it("sin email en el token, no entra", async () => {
 expect(await resolve({ email: undefined })).toMatchObject({ organizationAccess: "unavailable" });
});

// ── Un corte breve de la base no deja a todos afuera (R1) ──────────────────
it("con una verificación reciente, un error de la base no bloquea", async () => {
 vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
 expect((await resolve()).user.id).toBe("user");
 m.user.mockRejectedValue(new Error("pool timeout"));
 vi.setSystemTime(new Date(Date.now() + MEMORIA_ANTE_CORTE_MS - 1000));
 expect((await resolve()).user.id).toBe("user");
});
it("pasado el margen, el error de la base vuelve a bloquear", async () => {
 vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
 await resolve();
 m.user.mockRejectedValue(new Error("pool timeout"));
 vi.setSystemTime(new Date(Date.now() + MEMORIA_ANTE_CORTE_MS + 1000));
 expect(await resolve()).toEqual({ expires: "2099-01-01",organizationAccess: "unavailable" });
});
it("la memoria no revive a un usuario que la base ya dijo que no existe", async () => {
 // Verificado, después borrado, después un corte: lo último que dijo la base
 // es "no existe", y eso es lo que vale — no la verificación de antes.
 expect((await resolve()).user.id).toBe("user");
 m.user.mockResolvedValue(null); await resolve();
 m.user.mockRejectedValue(new Error("pool timeout"));
 expect(await resolve()).toMatchObject({ organizationAccess: "unavailable" });
});
it("la memoria recuerda la suspensión igual que el acceso", async () => {
 m.user.mockResolvedValue(enBase({}, suspended)); await resolve();
 m.user.mockRejectedValue(new Error("pool timeout"));
 expect(await resolve()).toMatchObject({ organizationAccess: "suspended" });
});
it("la memoria es por usuario: la de uno no sirve para otro", async () => {
 await resolve();
 m.user.mockRejectedValue(new Error("pool timeout"));
 expect(await resolve({ id: "other-user" })).toMatchObject({ organizationAccess: "unavailable" });
});

// ── Resolución de organización (auth-guard) ─────────────────────────────────
it("does not restore a blocked session through the single-org fallback", async () => {
 m.user.mockResolvedValue(enBase({}, suspended));
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
it("leaves a session without user untouched, without querying", async () => {
 const session = { expires: "2099-01-01" };
 expect(await authOptions.callbacks!.session!({ session,token: token } as any)).toBe(session);
 expect(m.user).not.toHaveBeenCalled();
});
