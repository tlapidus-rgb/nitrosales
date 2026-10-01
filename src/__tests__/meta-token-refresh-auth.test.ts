import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// meta-token-refresh dejaba pasar sin clave a quien mandara `x-vercel-cron: 1`.
// Vercel no documenta ese header como confiable (ni que lo elimine de requests
// externos): cualquiera con `curl -H` entraba, obtenía la lista de
// organizaciones con Meta y podía forzar refresh de tokens.

const m = vi.hoisted(() => ({ staff: false, findMany: vi.fn() }));
vi.mock("@/lib/admin-key", () => ({ ADMIN_API_KEY: "clave-sintetica" }));
vi.mock("@/lib/feature-flags", () => ({ isInternalUser: async () => m.staff }));
vi.mock("@/lib/db/client", () => ({ prisma: { connection: { findMany: m.findMany, update: vi.fn() } } }));

import { GET } from "@/app/api/cron/meta-token-refresh/route";

beforeEach(() => {
  m.staff = false;
  m.findMany.mockReset().mockResolvedValue([]);
  vi.stubEnv("META_APP_ID", "app");
  vi.stubEnv("META_APP_SECRET", "secret");
});

const pedir = (url: string, headers: Record<string, string> = {}) =>
  GET(new NextRequest(url, { headers }));

it("EL CASO: el header x-vercel-cron sin clave no entra", async () => {
  const res = await pedir("http://local/api/cron/meta-token-refresh", { "x-vercel-cron": "1" });
  expect(res.status).toBe(403);
  expect(m.findMany).not.toHaveBeenCalled();
});

it("con la clave que manda vercel.json, entra", async () => {
  const res = await pedir("http://local/api/cron/meta-token-refresh?key=clave-sintetica");
  expect(res.status).toBe(200);
});

it("con sesión de staff, entra", async () => {
  m.staff = true;
  const res = await pedir("http://local/api/cron/meta-token-refresh");
  expect(res.status).toBe(200);
});
