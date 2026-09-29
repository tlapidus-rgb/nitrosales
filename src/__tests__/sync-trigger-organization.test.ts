import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ org: vi.fn(), connection: vi.fn(), wait: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/auth-guard", () => ({ getOrganization: m.org }));
vi.mock("@/lib/db/client", () => ({ prisma: { connection: { findFirst: m.connection } } }));
vi.mock("@vercel/functions", () => ({ waitUntil: m.wait }));
vi.mock("@/lib/self-fetch", () => ({ selfFetchBaseUrl: () => "https://preview.example.invalid", selfFetchHeaders: () => ({ "x-vercel-protection-bypass": "synthetic" }) }));
import { POST } from "@/app/api/sync/trigger/route";
const run = (platform = "META") => POST(new NextRequest(`https://request.example.invalid/api/sync/trigger?platform=${platform}&organizationId=other&org=other`, { method: "POST" }));
beforeEach(() => {
 vi.resetAllMocks(); vi.stubEnv("NEXTAUTH_SECRET","synthetic-key"); vi.stubGlobal("fetch",m.fetch);
 m.org.mockResolvedValue({ id: "org / selected" }); m.connection.mockResolvedValue(null);
 m.fetch.mockResolvedValue(new Response("{}"));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it.each([["META","meta","META_ADS"],["GOOGLE","google-ads","GOOGLE_ADS"]])("passes the resolved organization to %s", async (platform,path,dbPlatform) => {
 expect(await (await run(platform)).json()).toMatchObject({ ok: true,syncStarted: true });
 const [url,options] = m.fetch.mock.calls[0]; const parsed = new URL(url);
 expect(parsed.origin).toBe("https://preview.example.invalid"); expect(parsed.pathname).toBe(`/api/sync/${path}`);
 expect(parsed.searchParams.get("organizationId")).toBe("org / selected");
 expect(parsed.searchParams.get("key")).toBe("synthetic-key");
 expect(options.headers).toEqual({ "x-vercel-protection-bypass": "synthetic" });
 expect(m.connection.mock.calls[0][0].where).toEqual({ organizationId: "org / selected",platform: dbPlatform });
 expect(m.wait).toHaveBeenCalledTimes(1); await m.wait.mock.calls[0][0];
});
it("does not dispatch if organization resolution fails", async () => {
 m.org.mockRejectedValue(new Error("No session"));
 expect((await run()).status).toBe(500); expect(m.fetch).not.toHaveBeenCalled(); expect(m.connection).not.toHaveBeenCalled();
});
it("does not queue unauthenticated internal work when the secret is missing", async () => {
 vi.stubEnv("NEXTAUTH_SECRET","");
 const response = await run(); expect(response.status).toBe(503);
 expect(await response.json()).toMatchObject({ syncStarted: false }); expect(m.fetch).not.toHaveBeenCalled();
});
it("preserves freshness skipping", async () => {
 m.connection.mockResolvedValueOnce({ lastSyncAt: new Date() });
 expect(await (await run()).json()).toMatchObject({ syncStarted: false,reason: "recently_synced" }); expect(m.fetch).not.toHaveBeenCalled();
});
it("does not dispatch unsupported platforms", async () => {
 expect((await run("UNKNOWN")).status).toBe(400); expect(m.fetch).not.toHaveBeenCalled();
});
