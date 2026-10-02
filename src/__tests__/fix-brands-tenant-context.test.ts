import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({
  staff: vi.fn(), config: vi.fn(), findMany: vi.fn(), query: vi.fn(), update: vi.fn(), fetch: vi.fn(),
}));
vi.mock("@/lib/feature-flags", () => ({ isInternalUser: m.staff }));
vi.mock("@/lib/vtex-credentials", () => ({ getVtexConfig: m.config }));
vi.mock("@/lib/db/client", () => ({ prisma: {
  product: { findMany: m.findMany, update: m.update }, $queryRaw: m.query,
} }));
import { GET } from "@/app/api/fix-brands/route";
const call = (query: string) => GET(new NextRequest(`http://local/api/fix-brands?${query}`));
const product = { id: "synthetic-product", externalId: "123", category: "1" };
beforeEach(() => {
  vi.resetAllMocks();
  m.staff.mockResolvedValue(true);
  m.config.mockImplementation(async (org: string) => ({ baseUrl: `https://${org}.invalid`, headers: { "X-Test-Tenant": org } }));
  m.findMany.mockResolvedValue([product]);
  m.query.mockResolvedValue([product]);
  m.fetch.mockResolvedValue({ ok: false });
  vi.stubGlobal("fetch", m.fetch);
});
afterEach(() => vi.unstubAllGlobals());
describe("fix-brands tenant isolation", () => {
  it("rejects missing org before database or credentials", async () => {
    expect((await call("action=fix-vtex")).status).toBe(400);
    expect(m.config).not.toHaveBeenCalled();
    expect(m.findMany).not.toHaveBeenCalled();
  });
  it("authenticates before checking org", async () => {
    m.staff.mockResolvedValue(false);
    expect((await call("action=fix-vtex")).status).toBe(401);
    expect(m.config).not.toHaveBeenCalled();
  });
  it.each([
    ["fix-vtex", false], ["fix-categories", false],
    ["fix-categories", true], ["fix-category-paths", false],
  ])("preserves org in continuation %s numeric=%s", async (action, numeric) => {
    if (numeric) m.findMany.mockResolvedValue([]);
    const res = await call(`org=tenant-b&action=${action}&limit=1&offset=7`);
    expect(res.status).toBe(200);
    const body = await res.json();
    const next = new URL(body.nextUrl, "http://local");
    expect(next.searchParams.get("org")).toBe("tenant-b");
    expect(next.searchParams.get("action")).toBe(action);
    expect(next.searchParams.get("offset")).toBe("8");
    expect(next.searchParams.has("key")).toBe(false);
  });
  it("keeps credentials and URLs for A when B runs while A awaits SQL", async () => {
    let started!: () => void;
    const waiting = new Promise<void>((resolve) => { started = resolve; });
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    m.findMany.mockImplementation(async () => { started(); await barrier; return [product]; });
    const a = call("org=tenant-a&action=fix-vtex&limit=1");
    await waiting;
    const b = await call("org=tenant-b&action=debug");
    expect((await b.json()).baseUrl).toBe("https://tenant-b.invalid");
    release();
    expect((await a).status).toBe(200);
    expect(m.fetch).toHaveBeenCalled();
    for (const [url, options] of m.fetch.mock.calls) {
      expect(new URL(url).hostname).toBe("tenant-a.invalid");
      expect(options.headers["X-Test-Tenant"]).toBe("tenant-a");
    }
  });
  it("does not reuse category paths with identical IDs across tenants", async () => {
    m.fetch.mockImplementation(async (url: string) => {
      const parsed = new URL(url);
      const org = parsed.hostname.split(".")[0];
      const isProduct = parsed.pathname.includes("/product/");
      const leaf = parsed.pathname.endsWith("/2");
      return { ok: true, json: async () => isProduct
        ? { CategoryId: 2 }
        : { Name: `${org}-${leaf ? "leaf" : "root"}`, FatherCategoryId: leaf ? 1 : null } };
    });
    for (const org of ["tenant-a", "tenant-b"]) {
      const res = await call(`org=${org}&action=fix-category-paths&limit=1`);
      expect(res.status).toBe(200);
      expect((await res.json()).details[0].newCategoryPath).toBe(`${org}-root > ${org}-leaf`);
      expect(m.update).toHaveBeenLastCalledWith({
        where: { id: product.id }, data: { categoryPath: `${org}-root > ${org}-leaf` },
      });
    }
    const categories = m.fetch.mock.calls.filter(([url]) => new URL(url).pathname.includes("/category/"));
    expect(categories.map(([url]) => new URL(url).hostname)).toEqual([
      "tenant-a.invalid", "tenant-a.invalid", "tenant-b.invalid", "tenant-b.invalid",
    ]);
  });
});