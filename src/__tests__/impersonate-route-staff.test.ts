import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// La ruta que emite el link de impersonación tiene que decir que no a un
// destino de staff, con un mensaje. Si lo emitiera, el login lo rechazaría
// igual (auth.ts), pero soporte vería un "CredentialsSignin" sin explicación.

const m = vi.hoisted(() => ({ target: vi.fn() }));
vi.mock("@/lib/feature-flags", () => ({ isInternalUser: async () => true }));
vi.mock("next-auth", () => ({ getServerSession: async () => ({ user: { id: "staff", email: "soporte@nitro.invalid" } }) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/db/client", () => ({
  prisma: { user: { findUnique: m.target, findFirst: vi.fn() }, loginEvent: { create: vi.fn().mockResolvedValue({}) } },
}));

import { POST } from "@/app/api/admin/impersonate/route";

const pedir = () => POST(new NextRequest("http://local/api/admin/impersonate", {
  method: "POST", body: JSON.stringify({ targetUserId: "destino" }),
}));

beforeEach(() => { vi.stubEnv("NEXTAUTH_SECRET", "synthetic-test-secret"); m.target.mockReset(); });

it("rechaza con 400 un destino que es staff", async () => {
  m.target.mockResolvedValue({ id: "destino", email: "otro@nitro.invalid", name: "Otro", organizationId: "nitro", isStaff: true });
  const res = await pedir();
  expect(res.status).toBe(400);
  expect((await res.json()).error).toMatch(/staff/);
});

it("con un destino cliente, emite el link", async () => {
  m.target.mockResolvedValue({ id: "destino", email: "dueno@cliente.invalid", name: "Dueño", organizationId: "c1", isStaff: false });
  const res = await pedir();
  expect(res.status).toBe(200);
});
