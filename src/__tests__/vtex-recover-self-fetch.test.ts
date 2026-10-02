import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ staff: true, connection: vi.fn(), query: vi.fn(), fetch: vi.fn(), wait: vi.fn(), detail: vi.fn() }));
vi.mock("@/lib/feature-flags", () => ({ isInternalUser: async () => m.staff }));
vi.mock("@/lib/db/client", () => ({ prisma: { connection: { findFirst: m.connection }, $queryRawUnsafe: m.query } }));
vi.mock("@/lib/connectors/vtex-enrichment", () => ({ fetchVtexOrderDetail: m.detail }));
vi.mock("@vercel/functions", () => ({ waitUntil: m.wait }));
import { GET } from "@/app/api/admin/vtex-recover-customer-emails/route";
beforeEach(() => {
  vi.clearAllMocks(); m.staff = true;
  m.connection.mockResolvedValue({ credentials: { accountName: "synthetic", appKey: "synthetic", appToken: "synthetic" } });
  m.fetch.mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", m.fetch);
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("NEXTAUTH_URL", "https://production.invalid");
  vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "synthetic-preview-bypass");
  // Agotamos el presupuesto antes del primer lote: sólo probamos el relevo HTTP.
  vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValue(240001);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("continúa en el mismo preview con sesión staff y protección, sin clave ni redirect", async () => {
  const result = await GET(new NextRequest("https://preview.invalid/api/admin/vtex-recover-customer-emails?orgId=syntheticorg", { headers: { cookie: "next-auth.session-token=synthetic-session", origin: "https://untrusted.invalid" } }));
  expect(result.status).toBe(200);
  expect(m.fetch).toHaveBeenCalledOnce();
  const [target, options] = m.fetch.mock.calls[0];
  const url = new URL(target);
  expect(url.origin).toBe("https://preview.invalid");
  expect(url.searchParams.get("orgId")).toBe("syntheticorg");
  expect(url.searchParams.has("key")).toBe(false);
  expect(options.headers).toEqual({ cookie: "next-auth.session-token=synthetic-session", "x-vercel-protection-bypass": "synthetic-preview-bypass" });
  expect(options.redirect).toBe("error");
  expect(m.wait).toHaveBeenCalledOnce();
  expect(m.detail).not.toHaveBeenCalled();
});
it("sin staff no lee conexiones ni continúa", async () => {
  m.staff = false;
  const result = await GET(new NextRequest("https://preview.invalid/api/admin/vtex-recover-customer-emails?orgId=syntheticorg"));
  expect(result.status).toBe(403);
  expect(m.connection).not.toHaveBeenCalled();
  expect(m.fetch).not.toHaveBeenCalled();
});
