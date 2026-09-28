import { afterEach, expect, it, vi } from "vitest";
import { testVtex, testNitroPixel } from "@/lib/onboarding/credential-tests";
import { usableBackfillCredentials } from "@/lib/onboarding/backfill-credentials";
afterEach(() => vi.unstubAllGlobals());
const creds = { accountName: "synthetic", appKey: "x".repeat(30), appToken: "x".repeat(60) };
it.each([
 ["/api/oms/pvt/orders?per_page=1", "Ventas", {}],
 ["/api/catalog_system/pub/products/search", "Catálogo", {}],
 ["/api/logistics/pvt/configuration/warehouses", "Stock / depósitos", {}],
 ["/api/logistics/pvt/shipping-policies", "Tarifas de envío", {}],
 ["/api/catalog_system/pvt/brand/list", "Marcas", {}],
])("does not interpret malformed %s as an empty valid account", async (path, area, bad) => {
 vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.includes(path as string) ? bad : url.includes("/orders?") ? { list: [] } : []))));
 const res = await testVtex(creds);
 expect(res.ok).toBe(false); expect(res.areas?.find(a => a.area === area)?.ok).toBe(false);
});
it("reports a catalog transport failure instead of a valid empty catalog", async () => {
 vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("/orders?") ? { list: [] } : []), { status: url.includes("/products/search") ? 503 : 200 })));
 expect((await testVtex(creds)).areas?.find(a => a.area === "Catálogo")?.ok).toBe(false);
});
it("accepts verified empty lists", async () => {
 vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("/orders?") ? { list: [] } : []))));
 expect((await testVtex(creds)).ok).toBe(true);
});
it.each([undefined, -1, "bad"])("keeps an unknown pixel count distinct from zero: %j", async c => {
 expect(await testNitroPixel("test", { $queryRawUnsafe: async () => [{ c }] })).toMatchObject({ ok: false, unavailable: true });
});
it("returns structured zero/positive pixel counts and sanitized failures", async () => {
 expect(await testNitroPixel("test", { $queryRawUnsafe: async () => [{ c: 0 }] })).toMatchObject({ ok: false, eventCount: 0 });
 expect(await testNitroPixel("test", { $queryRawUnsafe: async () => [{ c: 12500 }] })).toMatchObject({ ok: true, eventCount: 12500 });
 const result = await testNitroPixel("test", { $queryRawUnsafe: async () => { throw new Error("secret database context"); } });
 expect(result.unavailable).toBe(true); expect(result.detail).not.toContain("secret");
});
it("rejects placeholder, malformed and setup-required backfill credentials", () => {
 for (const invalid of [null, [], {}, { ...creds, needsSetup: true }, { ...creds, appToken: " " }, { ...creds, accountName: "https://external.invalid" }]) {
  expect(usableBackfillCredentials("VTEX", invalid)).toBe(false);
 }
 expect(usableBackfillCredentials("VTEX", creds)).toBe(true);
 expect(usableBackfillCredentials("MERCADOLIBRE", { accessToken: "test", mlUserId: 123 })).toBe(true);
 expect(usableBackfillCredentials("MERCADOLIBRE", { accessToken: "test", mlUserId: "0" })).toBe(false);
 expect(usableBackfillCredentials("MERCADOLIBRE", { accessToken: {}, mlUserId: "123" })).toBe(false);
});
