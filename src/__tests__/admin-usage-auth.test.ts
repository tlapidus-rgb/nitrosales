import { beforeEach, expect, it, vi } from "vitest";

// /api/admin/usage aceptaba ?key= contra ADMIN_SECRET o contra un literal
// escrito en el código: cualquiera que lo conociera veía la telemetría de Aurum
// de todos los clientes, sin sesión. Ahora es sesión de staff, como el resto.

const m = vi.hoisted(() => ({ staff: false }));
vi.mock("@/lib/feature-flags", () => ({ isInternalUser: async () => m.staff }));
vi.mock("@/lib/db/client", () => ({
  prisma: { aurumUsageLog: { findMany: async () => [] }, organization: { findMany: async () => [] } },
}));

import { GET } from "@/app/api/admin/usage/route";

beforeEach(() => { m.staff = false; });

it("EL CASO: el literal que estaba en el código ya no abre nada", async () => {
  const res = await GET(new Request("http://local/api/admin/usage?key=usage-2026&days=30"));
  expect(res.status).toBe(401);
});

it("sin sesión de staff, 401", async () => {
  expect((await GET(new Request("http://local/api/admin/usage?days=30"))).status).toBe(401);
});

it("con sesión de staff, responde", async () => {
  m.staff = true;
  expect((await GET(new Request("http://local/api/admin/usage?days=30"))).status).toBe(200);
});
