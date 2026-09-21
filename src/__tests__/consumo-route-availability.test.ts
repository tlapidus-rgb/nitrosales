import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: {
  organization: { findMany: async () => [{ id: "test", name: "Test", plan: "PRO" }] },
  $queryRawUnsafe: mocks.query,
} }));
vi.mock("@/lib/feature-flags", () => ({ isInternalUser: async () => true }));
vi.mock("@/lib/admin-key", () => ({ isValidAdminKey: () => false }));
import { GET } from "@/app/api/admin/consumo-por-cliente/route";
import { AURUM_AGRUPADO } from "@/lib/costos/consultas";
beforeEach(() => mocks.query.mockReset());
it("does not turn an Aurum database failure into a complete zero-cost report", async () => {
  mocks.query.mockImplementation(async sql => { if (sql === AURUM_AGRUPADO) throw new Error("timeout"); return []; });
  const res = await GET(new NextRequest("https://test.invalid/api/admin/consumo-por-cliente"));
  const body = await res.json();
  expect(body.completo).toBe(false);
  expect(body.costoDeIaDisponible).toBe(false);
  expect(body.clientes[0].aurum).toBeNull();
  expect(body.clientes[0].sinMedir).toContain("uso de IA");
});
it("preserves a genuine zero when the query succeeds without usage", async () => {
  mocks.query.mockResolvedValue([]);
  const body = await (await GET(new NextRequest("https://test.invalid/api/admin/consumo-por-cliente"))).json();
  expect(body.completo).toBe(true);
  expect(body.costoDeIaDisponible).toBe(true);
  expect(body.clientes[0].aurum.usdConocido).toBe(0);
});
